import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

import { planLayout } from '../src/plan.js'

/**
 * The sidebar's DOM contract, exercised against the real `client.js`.
 *
 * This file exists because the plugin's whole job is reading a DOM nobody
 * documents, and the shell is free to change it. DSH 0.2.2 wrapped every panel
 * row in a `<div class="panelEntry">` (to hang the unpin button and the tooltip
 * off it), so the rows stopped being direct children of the `<nav>`. Every
 * selector that said `nav > button` then matched nothing, and the fold simply
 * stopped working — with no error anywhere. A truth table over the two shapes
 * is the only thing that catches that.
 */
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

function noop() {}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase()
    this.attributes = new Map()
    this.style = {}
    this.childNodes = []
    this.parentElement = null
    this.text = ''
  }

  get children() {
    return this.childNodes.filter(node => node.nodeType === 1)
  }

  get textContent() {
    return this.childNodes.length === 0
      ? this.text
      : this.childNodes.map(node => node.textContent).join('')
  }

  set textContent(value) {
    this.text = String(value)
    this.childNodes = []
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }

  appendChild(child) {
    child.parentElement = this
    this.childNodes.push(child)
    return child
  }

  append(...nodes) { for (const node of nodes) this.appendChild(node) }

  remove() {
    const parent = this.parentElement
    if (parent === null) return
    parent.childNodes = parent.childNodes.filter(node => node !== this)
    this.parentElement = null
  }

  closest(selector) {
    let node = this
    while (node !== null && node !== undefined) {
      if (node.tagName === selector.toUpperCase()) return node
      node = node.parentElement
    }
    return null
  }

  addEventListener() {}
  removeEventListener() {}
}

FakeElement.prototype.nodeType = 1

const reactStub = {
  createElement: () => null,
  createElementNS: (namespace, tagName) => new FakeElement(tagName),
  useState: value => [value, noop],
  useEffect: noop,
  useRef: value => ({ current: value }),
  useCallback: fn => fn,
  useMemo: fn => fn(),
}

function loadClient() {
  let captured = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: ({ factory }) => {
          captured = factory(name => (name === 'react' ? reactStub : {}))
        },
      },
      localStorage: { getItem: () => null, setItem: noop },
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: noop,
    },
    document: {
      baseURI: 'http://127.0.0.1/',
      head: { appendChild: noop },
      getElementById: () => null,
      createElement: tagName => new FakeElement(tagName),
      createElementNS: (namespace, tagName) => new FakeElement(tagName),
      documentElement: { setAttribute: noop, removeAttribute: noop },
    },
    navigator: { language: 'zh-CN' },
    console,
    URL,
    Set,
    Map,
    JSON,
  }
  vm.runInNewContext(source, sandbox)
  return captured
}

const client = loadClient()

/**
 * The shell's own list item: `<nav>` > item > `<button>`, plus, when the shell
 * wraps it, the toolbox `<div>` that holds the unpin affordance.
 */
function newShell(rows) {
  const nav = new FakeElement('nav')
  const items = new Map()
  for (const row of rows) {
    const entry = nav.appendChild(new FakeElement('div'))
    entry.className = 'panelEntry'
    const button = new FakeElement('button')
    button.setAttribute('aria-label', row.label)
    if (row.active === true) button.setAttribute('aria-current', 'page')
    entry.appendChild(button)
    items.set(row.label, { entry, control: button })
  }
  return { nav, items }
}

/** The shape DSH 0.2.1 rendered: the row itself is the `<nav>`'s child. */
function oldShell(rows) {
  const nav = new FakeElement('nav')
  const items = new Map()
  for (const row of rows) {
    const button = nav.appendChild(new FakeElement('button'))
    button.setAttribute('aria-label', row.label)
    if (row.active === true) button.setAttribute('aria-current', 'page')
    items.set(row.label, { entry: button, control: button })
  }
  return { nav, items }
}

const ROWS = [
  { label: '打开工作台' },
  { label: '任务看板', active: true },
  { label: '插件市场' },
]

const settings = {
  groups: [{ id: 'g1', name: '日常', collapsed: false }],
  order: [],
  assignments: { 打开工作台: 'g1' },
  pinned: [],
  hidden: [],
}

function planFor(extra = {}) {
  return planLayout({
    settings: { ...settings, ...extra },
    entryIds: ROWS.map(row => row.label),
  })
}

function run(shell, { folded, plan, overrides = {}, selfEntry = null }) {
  const collected = client.collectRows(shell.nav, selfEntry)
  client.applyPlan(shell.nav, selfEntry, folded, plan, collected.byKey, noop, overrides)
  return collected
}

// ── the regression: 0.2.2's wrapper must be what moves and hides ──────────

for (const [shape, build] of [['0.2.1（行就是 nav 的子元素）', oldShell], ['0.2.2（行被 div.panelEntry 包住）', newShell]]) {
  test(`${shape}：折叠后每一行都藏起来`, () => {
    const shell = build(ROWS.map(row => ({ ...row, active: false })))
    run(shell, { folded: true, plan: planFor() })
    for (const [label, item] of shell.items) {
      assert.equal(item.entry.style.display, 'none', `${label} 应该被藏起来`)
    }
  })

  test(`${shape}：展开后每一行都回来，并画出组标题`, () => {
    const shell = build(ROWS)
    run(shell, { folded: false, plan: planFor() })
    for (const [label, item] of shell.items) {
      assert.notEqual(item.entry.style.display, 'none', `${label} 应该可见`)
    }
    const headers = shell.nav.children.filter(child => child.hasAttribute('data-fold-header'))
    assert.equal(headers.length, 1, '只有「日常」是真正的组，隐式组不画标题')
    assert.equal(headers[0].getAttribute('data-fold-header'), 'g1')
  })
}

test('0.2.2：排好的 order 落在被包住的那层，而不是按钮上', () => {
  const shell = newShell(ROWS)
  run(shell, { folded: false, plan: planFor() })
  const first = shell.items.get('任务看板')
  assert.notEqual(first.entry.style.order, '', '外层 div 必须拿到 order，否则排不动')
  assert.equal(first.control.style.order, undefined, '按钮自己不参与排序')
})

test('0.2.2：当前打开的面板在折叠后仍然留在原地', () => {
  const shell = newShell(ROWS)
  run(shell, { folded: true, plan: planFor() })
  assert.notEqual(shell.items.get('任务看板').entry.style.display, 'none')
  assert.equal(shell.items.get('插件市场').entry.style.display, 'none')
})

test('0.2.2：pinned 行在折叠后仍然可见', () => {
  const shell = newShell(ROWS.map(row => ({ ...row, active: false })))
  run(shell, { folded: true, plan: planFor({ pinned: ['插件市场'] }) })
  assert.notEqual(shell.items.get('插件市场').entry.style.display, 'none')
  assert.equal(shell.items.get('打开工作台').entry.style.display, 'none')
})

test('0.2.2：组折叠只藏自己的成员', () => {
  const shell = newShell(ROWS.map(row => ({ ...row, active: false })))
  run(shell, { folded: false, plan: planFor(), overrides: { g1: true } })
  assert.equal(shell.items.get('打开工作台').entry.style.display, 'none')
  assert.notEqual(shell.items.get('插件市场').entry.style.display, 'none')
})

test('0.2.2：userHidden 的行即使打开着也藏', () => {
  const shell = newShell(ROWS)
  run(shell, { folded: false, plan: planFor({ hidden: ['任务看板'] }) })
  assert.equal(shell.items.get('任务看板').entry.style.display, 'none')
})

test('0.2.2：插件自己那一行永远排最前，且不参与折叠', () => {
  const shell = newShell(ROWS)
  const self = shell.nav.appendChild(new FakeElement('div'))
  const selfButton = self.appendChild(new FakeElement('button'))
  selfButton.setAttribute('aria-label', '插件列表')
  self.setAttribute('data-fold-row', '')

  const collected = client.collectRows(shell.nav, self)
  assert.equal(collected.byKey.has('插件列表'), false, '自己那一行不是被管理的条目')

  client.applyPlan(shell.nav, self, true, planFor(), collected.byKey, noop, {})
  assert.equal(self.style.order, '-99999')
  assert.notEqual(self.style.display, 'none')
})

test('0.2.2：认不出的外壳入口沉到底部，不被当成条目收起来', () => {
  const shell = newShell(ROWS)
  const more = shell.nav.appendChild(new FakeElement('div'))
  const moreButton = more.appendChild(new FakeElement('button'))
  moreButton.setAttribute('aria-label', '更多')
  moreButton.setAttribute('aria-haspopup', 'menu')

  run(shell, { folded: true, plan: planFor() })
  assert.equal(more.style.order, '999999')
  assert.notEqual(more.style.display, 'none', '外壳自己的「更多」不能被藏掉')
})
