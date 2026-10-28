import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

/**
 * The browser half cannot be imported by Node — the page's module loader
 * delivers it. That is true of *rendering*, not of the decisions behind it: the
 * factory only defines functions at load time, so with a handful of stubs it can
 * be evaluated in a sandbox and its pure decisions exercised directly.
 *
 * This exists because source-presence checks certified two defects as working.
 * A grep cannot tell whether pinning survives the fold; a truth table can.
 */
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

function noop() {}

const reactStub = {
  createElement: () => null,
  createElementNS: () => ({ setAttribute: noop, appendChild: noop, style: {} }),
  useState: value => [value, noop],
  useEffect: noop,
  useRef: value => ({ current: value }),
  useCallback: fn => fn,
  useMemo: fn => fn(),
}

function loadClient() {
  let captured = null
  const element = () => ({
    setAttribute: noop,
    removeAttribute: noop,
    appendChild: noop,
    style: {},
    hasAttribute: () => false,
  })
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
      createElement: element,
      createElementNS: element,
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

test('客户端模块带出可判定的折叠决策', () => {
  assert.equal(typeof client.rowShouldHide, 'function')
  assert.equal(typeof client.headerShouldRender, 'function')
})

// ── 折叠判定：未配置时与旧行为逐项一致 ────────────────────────────────────

test('未配置：折叠时非 pinned 行藏起来，当前面板行保留', () => {
  const base = { pinned: false, userHidden: false, groupCollapsed: false }
  assert.equal(client.rowShouldHide({ ...base, folded: true, isActive: false }), true)
  assert.equal(client.rowShouldHide({ ...base, folded: true, isActive: true }), false)
  assert.equal(client.rowShouldHide({ ...base, folded: false, isActive: false }), false)
})

test('未配置：组折叠仍然生效，且不影响当前面板行', () => {
  const base = { pinned: false, userHidden: false, folded: false }
  assert.equal(client.rowShouldHide({ ...base, groupCollapsed: true, isActive: false }), true)
  assert.equal(client.rowShouldHide({ ...base, groupCollapsed: true, isActive: true }), false)
})

// ── Critical 1：pinned 必须在折叠后仍然可见 ──────────────────────────────

test('pinned：折叠后仍然可见（本轮的招牌行为）', () => {
  assert.equal(client.rowShouldHide({
    folded: true, pinned: true, userHidden: false, groupCollapsed: false, isActive: false,
  }), false)
})

test('pinned：未折叠时 pinned 不起作用，跟随组与全局状态', () => {
  assert.equal(client.rowShouldHide({
    folded: false, pinned: true, userHidden: false, groupCollapsed: false, isActive: false,
  }), false)
})

// ── Critical 2：隐藏优先于「当前面板保留」豁免 ────────────────────────────

test('userHidden：即使它是当前打开的面板也要藏', () => {
  assert.equal(client.rowShouldHide({
    folded: false, pinned: false, userHidden: true, groupCollapsed: false, isActive: true,
  }), true)
})

test('userHidden：无论折叠、分组、pinned 都无法让它露出来', () => {
  for (const folded of [true, false]) {
    for (const pinned of [true, false]) {
      for (const groupCollapsed of [true, false]) {
        for (const isActive of [true, false]) {
          assert.equal(client.rowShouldHide({ folded, pinned, userHidden: true, groupCollapsed, isActive }), true)
        }
      }
    }
  }
})

// ── 组标题 ───────────────────────────────────────────────────────────────

test('组标题：折叠时不画、隐式组不画、全隐藏不画，其余画', () => {
  assert.equal(client.headerShouldRender({ folded: true, implicit: false, allHidden: false }), false)
  assert.equal(client.headerShouldRender({ folded: false, implicit: true, allHidden: false }), false)
  assert.equal(client.headerShouldRender({ folded: false, implicit: false, allHidden: true }), false)
  assert.equal(client.headerShouldRender({ folded: false, implicit: false, allHidden: false }), true)
})
