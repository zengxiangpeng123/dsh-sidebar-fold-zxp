import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  UNGROUPED_ID,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  settingsFile,
} from '../src/settings.js'

test('垃圾输入一律回落成默认值', () => {
  for (const bad of [null, undefined, 42, 'text', [], true]) {
    const out = sanitizeSettings(bad)
    assert.equal(out.version, SETTINGS_VERSION)
    assert.deepEqual(out.groups, [])
    assert.deepEqual(out.order, [])
    assert.deepEqual(out.assignments, {})
  }
})

test('组：id 变 slug，重名去重，空名丢弃，collapsed 收成布尔', () => {
  const out = sanitizeSettings({
    groups: [
      { id: 'Common Stuff', name: '常用', collapsed: 1 },
      { id: 'common-stuff', name: '重复的', collapsed: false },
      { id: '', name: '没有 id' },
      { id: 'noname', name: '   ' },
      { id: 'dev', name: '开发', collapsed: true },
    ],
  })
  assert.deepEqual(out.groups, [
    { id: 'common-stuff', name: '常用', collapsed: false },
    { id: 'dev', name: '开发', collapsed: true },
  ])
})

test('组名过长会被截断，不会撑破界面', () => {
  const out = sanitizeSettings({ groups: [{ id: 'x', name: '长'.repeat(80) }] })
  assert.equal(out.groups[0].name.length, 40)
})

test('隐式分组 id 不允许被用户占用', () => {
  const out = sanitizeSettings({ groups: [{ id: UNGROUPED_ID, name: '伪造' }] })
  assert.deepEqual(out.groups, [])
})

test('order：去空、去重、保序', () => {
  const out = sanitizeSettings({ order: ['b', 'a', 'b', '', '  ', 'c'] })
  assert.deepEqual(out.order, ['b', 'a', 'c'])
})

test('assignments：指向不存在的组就丢掉，不留幽灵引用', () => {
  const out = sanitizeSettings({
    groups: [{ id: 'dev', name: '开发' }],
    assignments: { board: 'dev', market: 'nope', '': 'dev', '  ': 'dev' },
  })
  assert.deepEqual(out.assignments, { board: 'dev' })
})

test('缺省字段自动补齐，多余字段被丢掉', () => {
  const out = sanitizeSettings({ groups: [{ id: 'a', name: 'A', extra: 1 }], surprise: 'x' })
  assert.deepEqual(Object.keys(out).sort(), ['assignments', 'groups', 'hidden', 'order', 'pinned', 'version'])
  assert.deepEqual(Object.keys(out.groups[0]).sort(), ['collapsed', 'id', 'name'])
})

test('settingsFile 落在插件自己的目录里', () => {
  const file = settingsFile('C:/home')
  assert.match(file, /dsh-sidebar-fold-zxp[\\/]settings\.json$/)
})

test('文件不存在时给默认值（首次运行）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fold-'))
  const out = await loadSettings(path.join(dir, 'settings.json'))
  assert.deepEqual(out, { ...DEFAULT_SETTINGS })
})

test('文件是坏 JSON：另存 .bad，返回值仍是默认值', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fold-'))
  const file = path.join(dir, 'settings.json')
  await writeFile(file, '{ not json', 'utf8')
  const out = await loadSettings(file)
  assert.deepEqual(out, { ...DEFAULT_SETTINGS })
  assert.equal(await readFile(`${file}.bad`, 'utf8'), '{ not json')
})

test('保存后再读回来一致，且写的是格式化过的 JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fold-'))
  const file = path.join(dir, 'settings.json')
  const written = await saveSettings(file, {
    groups: [{ id: 'dev', name: '开发', collapsed: true }],
    order: ['board'],
    assignments: { board: 'dev' },
  })
  const text = await readFile(file, 'utf8')
  assert.match(text, /\n {2}"version"/, '应当是可读的多行 JSON')
  const again = await loadSettings(file)
  assert.deepEqual(again, written)
})

test('保存会顺手清洗：写入磁盘的永远是合法配置', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fold-'))
  const file = path.join(dir, 'settings.json')
  await saveSettings(file, { groups: [{ id: 'DEV', name: '  开发  ' }], order: ['a', 'a'], assignments: { b: 'missing' } })
  const disk = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(disk.groups, [{ id: 'dev', name: '开发', collapsed: false }])
  assert.deepEqual(disk.order, ['a'])
  assert.deepEqual(disk.assignments, {})
})

// ── 选择性折叠：新增 pinned / hidden ──────────────────────────────────────

test('旧配置没有 pinned/hidden 时补空数组，其余字段原样保留', () => {
  const out = sanitizeSettings({
    groups: [{ id: 'dev', name: '开发', collapsed: true }],
    order: ['a'],
    assignments: { a: 'dev' },
  })
  assert.deepEqual(out.pinned, [])
  assert.deepEqual(out.hidden, [])
  assert.deepEqual(out.groups, [{ id: 'dev', name: '开发', collapsed: true }])
  assert.deepEqual(out.order, ['a'])
  assert.deepEqual(out.assignments, { a: 'dev' })
})

test('pinned/hidden：去空、去重、非字符串丢弃', () => {
  assert.deepEqual(sanitizeSettings({ pinned: ['a', 'a', '', 3, null] }).pinned, ['a'])
  assert.deepEqual(sanitizeSettings({ hidden: ['b', 'b', ' '] }).hidden, ['b'])
})

test('pinned 与 hidden 同时包含同一 key 时，hidden 胜出', () => {
  const out = sanitizeSettings({ pinned: ['x'], hidden: ['x'] })
  assert.deepEqual(out.pinned, [])
  assert.deepEqual(out.hidden, ['x'])
})

