import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planLayout } from '../src/plan.js'
import { UNGROUPED_ID } from '../src/settings.js'

const settings = (patch = {}) => ({ groups: [], order: [], assignments: {}, ...patch })

test('没有配置：全部落进「未分组」，按 id 稳定排序', () => {
  const plan = planLayout({ settings: settings(), entryIds: ['zeta', 'alpha', 'mid'] })
  assert.equal(plan.groups.length, 1)
  assert.equal(plan.groups[0].id, UNGROUPED_ID)
  assert.equal(plan.groups[0].count, 3)
  assert.deepEqual(plan.rows.map(row => row.id), ['alpha', 'mid', 'zeta'])
  assert.equal(plan.rows.every(row => row.hidden === false), true)
})

test('配置的顺序优先于 id 排序', () => {
  const plan = planLayout({
    settings: settings({ order: ['zeta', 'alpha'] }),
    entryIds: ['alpha', 'mid', 'zeta'],
  })
  assert.deepEqual(plan.rows.map(row => row.id), ['zeta', 'alpha', 'mid'])
})

test('分组后按组输出，组标题紧贴在自己的行上方', () => {
  const plan = planLayout({
    settings: settings({
      groups: [{ id: 'common', name: '常用', collapsed: false }, { id: 'dev', name: '开发', collapsed: false }],
      order: ['market', 'workbench', 'board'],
      assignments: { market: 'common', workbench: 'common', board: 'dev' },
    }),
    entryIds: ['board', 'market', 'workbench', 'stray'],
  })
  assert.deepEqual(plan.groups.map(g => [g.id, g.count]), [['common', 2], ['dev', 1], [UNGROUPED_ID, 1]])
  const commonHeader = plan.groups[0].order
  const commonRows = plan.rows.filter(r => r.groupId === 'common')
  assert.equal(commonRows.length, 2)
  for (const row of commonRows) assert.ok(row.order > commonHeader, '组内行必须排在标题之后')
  const devHeader = plan.groups[1].order
  const devRow = plan.rows.find(r => r.groupId === 'dev')
  assert.ok(devHeader < devRow.order)
  assert.ok(devRow.order > Math.max(...commonRows.map(r => r.order)), '下一组不能插进上一组内部')
})

test('折叠的组：组内行标记 hidden，其余不受影响', () => {
  const plan = planLayout({
    settings: settings({
      groups: [{ id: 'dev', name: '开发', collapsed: true }],
      assignments: { board: 'dev' },
    }),
    entryIds: ['board', 'market'],
  })
  assert.equal(plan.rows.find(r => r.id === 'board').hidden, true)
  assert.equal(plan.rows.find(r => r.id === 'market').hidden, false)
})

test('行自带 ungrouped 标记，浏览器据此决定要不要缩进', () => {
  const plan = planLayout({
    settings: settings({ groups: [{ id: 'dev', name: '开发', collapsed: false }], assignments: { board: 'dev' } }),
    entryIds: ['board', 'market'],
  })
  assert.equal(plan.rows.find(r => r.id === 'board').ungrouped, false)
  assert.equal(plan.rows.find(r => r.id === 'market').ungrouped, true)
})

test('已卸载的条目：进 missing，且不会留下空组', () => {
  const plan = planLayout({
    settings: settings({
      groups: [{ id: 'gone', name: '已卸载的组', collapsed: false }],
      assignments: { 'old-plugin': 'gone' },
    }),
    entryIds: ['market'],
  })
  assert.deepEqual(plan.missing, ['old-plugin'])
  assert.deepEqual(plan.groups.map(g => g.id), [UNGROUPED_ID])
})

test('指向不存在的组：条目回落到未分组，不报错', () => {
  const plan = planLayout({
    settings: settings({ groups: [{ id: 'dev', name: '开发', collapsed: false }], assignments: { market: 'nope' } }),
    entryIds: ['market'],
  })
  assert.equal(plan.rows[0].groupId, UNGROUPED_ID)
  assert.deepEqual(plan.missing, ['market'])
})

test('重复的条目 id 只出现一次', () => {
  const plan = planLayout({ settings: settings(), entryIds: ['a', 'a', '', '  ', 'b'] })
  assert.deepEqual(plan.rows.map(r => r.id), ['a', 'b'])
})

test('没有条目时不产生任何组', () => {
  const plan = planLayout({ settings: settings({ groups: [{ id: 'dev', name: '开发', collapsed: false }] }), entryIds: [] })
  assert.deepEqual(plan.groups, [])
  assert.deepEqual(plan.rows, [])
})

// ── 选择性折叠：行上带标志，整组隐藏时标出来 ──────────────────────────────

test('行带上 pinned / hidden 标志', () => {
  const plan = planLayout({
    settings: settings({ pinned: ['alpha'], hidden: ['beta'] }),
    entryIds: ['alpha', 'beta', 'gamma'],
  })
  const byId = new Map(plan.rows.map(row => [row.id, row]))
  assert.equal(byId.get('alpha').pinned, true)
  assert.equal(byId.get('alpha').userHidden, false)
  assert.equal(byId.get('beta').userHidden, true)
  assert.equal(byId.get('beta').pinned, false)
  assert.equal(byId.get('gamma').pinned, false)
  assert.equal(byId.get('gamma').userHidden, false)
})

test('整组条目都被隐藏时，组上标 allHidden', () => {
  const plan = planLayout({
    settings: settings({ groups: [{ id: 'dev', name: '开发', collapsed: false }], assignments: { board: 'dev' }, hidden: ['board'] }),
    entryIds: ['board', 'market'],
  })
  assert.equal(plan.groups.find(group => group.id === 'dev').allHidden, true)
  assert.equal(plan.groups.find(group => group.implicit).allHidden, false)
})



test('组带上 visibleCount，隐藏的条目不计数', () => {
  const plan = planLayout({
    settings: settings({ groups: [{ id: 'dev', name: '开发', collapsed: false }], assignments: { a: 'dev', b: 'dev' }, hidden: ['b'] }),
    entryIds: ['a', 'b'],
  })
  const dev = plan.groups.find(group => group.id === 'dev')
  assert.equal(dev.count, 2)
  assert.equal(dev.visibleCount, 1)
})
