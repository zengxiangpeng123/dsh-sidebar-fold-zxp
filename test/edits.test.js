import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEdit } from '../src/edits.js'
import { UNGROUPED_ID } from '../src/settings.js'

const entries = ['alpha', 'beta', 'gamma', 'delta']
const base = { groups: [], order: [], assignments: {} }
const run = (op, settings = base, entryIds = entries) => applyEdit({ settings, entryIds, op })

test('加组：名字必填，id 由名字生成并与已有组避开重名', () => {
  assert.equal(run({ op: 'group.add', name: '  ' }).ok, false)
  const first = run({ op: 'group.add', name: 'Dev' })
  assert.equal(first.ok, true)
  assert.equal(first.settings.groups[0].id, 'dev')
  const second = run({ op: 'group.add', name: 'Dev' }, first.settings)
  assert.notEqual(second.settings.groups[1].id, 'dev')
  assert.equal(second.settings.groups.length, 2)
})

test('加组：中文名生成不出 slug 时给一个稳定的兜底 id', () => {
  const out = run({ op: 'group.add', name: '常用' })
  assert.equal(out.ok, true)
  assert.match(out.settings.groups[0].id, /^group-\d+$/)
  assert.equal(out.settings.groups[0].name, '常用')
})

test('改名只动目标组', () => {
  const start = { groups: [{ id: 'a', name: 'A', collapsed: false }, { id: 'b', name: 'B', collapsed: false }], order: [], assignments: {} }
  const out = run({ op: 'group.rename', id: 'b', name: '开发' }, start)
  assert.deepEqual(out.settings.groups.map(g => g.name), ['A', '开发'])
})

test('折叠开关可来回切换', () => {
  const start = { groups: [{ id: 'a', name: 'A', collapsed: false }], order: [], assignments: {} }
  const closed = run({ op: 'group.collapse', id: 'a', collapsed: true }, start)
  assert.equal(closed.settings.groups[0].collapsed, true)
  const open = run({ op: 'group.collapse', id: 'a', collapsed: false }, closed.settings)
  assert.equal(open.settings.groups[0].collapsed, false)
})

test('删组：组内条目回落到未分组，不留悬空引用', () => {
  const start = { groups: [{ id: 'a', name: 'A', collapsed: false }], order: ['alpha'], assignments: { alpha: 'a', beta: 'a' } }
  const out = run({ op: 'group.remove', id: 'a' }, start)
  assert.deepEqual(out.settings.groups, [])
  assert.deepEqual(out.settings.assignments, {})
  assert.equal(out.plan.rows.find(r => r.id === 'alpha').groupId, UNGROUPED_ID)
})

test('组排序：上移下移，越界时不动', () => {
  const start = { groups: [{ id: 'a', name: 'A', collapsed: false }, { id: 'b', name: 'B', collapsed: false }], order: [], assignments: {} }
  const moved = run({ op: 'group.move', id: 'b', delta: -1 }, start)
  assert.deepEqual(moved.settings.groups.map(g => g.id), ['b', 'a'])
  const edge = run({ op: 'group.move', id: 'b', delta: -1 }, moved.settings)
  assert.deepEqual(edge.settings.groups.map(g => g.id), ['b', 'a'])
})

test('归组与取消归组', () => {
  const start = { groups: [{ id: 'a', name: 'A', collapsed: false }], order: [], assignments: {} }
  const assigned = run({ op: 'entry.assign', entryId: 'beta', groupId: 'a' }, start)
  assert.equal(assigned.settings.assignments.beta, 'a')
  const cleared = run({ op: 'entry.assign', entryId: 'beta', groupId: null }, assigned.settings)
  assert.equal(cleared.settings.assignments.beta, undefined)
})

test('组内上移：只在自己组内换位，不跨组', () => {
  const start = {
    groups: [{ id: 'a', name: 'A', collapsed: false }],
    order: ['alpha', 'beta'],
    assignments: { alpha: 'a', beta: 'a' },
  }
  const out = run({ op: 'entry.move', entryId: 'beta', delta: -1 }, start)
  assert.deepEqual(out.plan.rows.filter(r => r.groupId === 'a').map(r => r.id), ['beta', 'alpha'])
  // gamma / delta are ungrouped and must not have been pulled into the group
  assert.deepEqual(out.plan.rows.filter(r => r.groupId === UNGROUPED_ID).map(r => r.id), ['delta', 'gamma'])
})

test('组内已经到顶时上移是空操作', () => {
  const start = { groups: [{ id: 'a', name: 'A', collapsed: false }], order: ['alpha'], assignments: { alpha: 'a' } }
  const out = run({ op: 'entry.move', entryId: 'alpha', delta: -1 }, start)
  assert.equal(out.ok, true)
  assert.deepEqual(out.settings.order, start.order)
})

test('清理：删掉已卸载条目的引用，保留在册的', () => {
  const start = {
    groups: [{ id: 'a', name: 'A', collapsed: false }],
    order: ['alpha', 'gone'],
    assignments: { alpha: 'a', gone: 'a' },
  }
  const out = run({ op: 'prune' }, start)
  assert.deepEqual(out.settings.order, ['alpha'])
  assert.deepEqual(out.settings.assignments, { alpha: 'a' })
})

test('未知操作被拒绝，而不是悄悄改变配置', () => {
  const out = run({ op: 'group.explode' })
  assert.equal(out.ok, false)
  assert.match(out.error, /unknown operation/)
})

// ── entry.place：拖拽落点 ──────────────────────────────────────────────────

const withGroup = {
  groups: [{ id: 'dev', name: '开发', collapsed: false }],
  order: ['alpha', 'beta'],
  assignments: { alpha: 'dev', beta: 'dev' },
}

test('拖到组标题：放进该组末尾', () => {
  const out = run({ op: 'entry.place', entryId: 'gamma', groupId: 'dev', beforeId: null }, withGroup)
  assert.equal(out.settings.assignments.gamma, 'dev')
  assert.deepEqual(out.plan.rows.filter(r => r.groupId === 'dev').map(r => r.id), ['alpha', 'beta', 'gamma'])
})

test('拖到某一行上：放在那一行前面', () => {
  const out = run({ op: 'entry.place', entryId: 'gamma', groupId: 'dev', beforeId: 'beta' }, withGroup)
  assert.deepEqual(out.plan.rows.filter(r => r.groupId === 'dev').map(r => r.id), ['alpha', 'gamma', 'beta'])
})

test('从组里拖回未分组：取消归组并排在未分组末尾', () => {
  const start = { ...withGroup, order: ['alpha', 'beta', 'delta'] }
  const out = run({ op: 'entry.place', entryId: 'alpha', groupId: null, beforeId: null }, start)
  assert.equal(out.settings.assignments.alpha, undefined)
  // gamma was already ungrouped and unordered, so it sorts before delta by id.
  assert.deepEqual(out.plan.rows.filter(r => r.groupId === UNGROUPED_ID).map(r => r.id), ['delta', 'gamma', 'alpha'])
})

test('拖到自己前面：空操作', () => {
  const out = run({ op: 'entry.place', entryId: 'alpha', groupId: 'dev', beforeId: 'alpha' }, withGroup)
  assert.equal(out.ok, true)
  assert.deepEqual(out.settings.order, withGroup.order)
})

test('落点指向不存在的行：退化成放到该组末尾，而不是拒绝', () => {
  const out = run({ op: 'entry.place', entryId: 'gamma', groupId: 'dev', beforeId: 'gone' }, withGroup)
  assert.deepEqual(out.plan.rows.filter(r => r.groupId === 'dev').map(r => r.id), ['alpha', 'beta', 'gamma'])
})

test('拖到不存在的组：拒绝并说明原因', () => {
  const out = run({ op: 'entry.place', entryId: 'gamma', groupId: 'nope', beforeId: null }, withGroup)
  assert.equal(out.ok, false)
  assert.match(out.error, /unknown group/)
})

test('把唯一组成员拖走后，空组不残留为空标题', () => {
  const start = { groups: [{ id: 'dev', name: '开发', collapsed: false }], order: ['alpha'], assignments: { alpha: 'dev' } }
  const out = run({ op: 'entry.place', entryId: 'alpha', groupId: null, beforeId: null }, start)
  assert.deepEqual(out.plan.groups.map(g => g.id), [UNGROUPED_ID])
})

test('每次编辑的结果都是清洗过的：脏东西进不来', () => {
  const out = run({ op: 'entry.assign', entryId: 'beta', groupId: 'nope' })
  assert.deepEqual(out.settings.assignments, {})
})
