# 选择性折叠与隐藏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「折叠」可以只作用于部分条目（其余在折叠时保持可见），并让「隐藏」成为可按条目开启的持久选择。

**Architecture:** 纯加法。配置里新增两个字符串数组 `pinned` / `hidden`，缺省为空；`src/plan.js` 把它们带到每一行上并标出「整组都被隐藏」；浏览器侧只改一处折叠判定表达式和一处标题跳过；设置页把每行改为三态选择。两个标志都为 false 时，判定式化简后与现状逐字节等价。

**Tech Stack:** Node ESM（宿主半，`node --test`）、浏览器端纯 JS（`window.__ModuleLoader__`）、Cordis 插件（bundle patch + client 半）。

**Spec:** `docs/design.md`（本插件的设计说明），加上本轮需求方给出的 8 条约束——逐条列在下面 Global Constraints。

## Global Constraints

- DSH `engines.dsh >= 0.2.1-rc.1`，不得下调。
- **默认行为必须完全不变**：`pinned` 与 `hidden` 都为空时，折叠、分组、排序、缩进、`更多` 隐藏的表现与 v0.8.0 一致。
- **旧配置文件必须继续可用**：`~/.dsh/dsh-sidebar-fold-zxp/settings.json` 里没有新字段时，`sanitizeSettings` 补空数组，不得报错、不得清空既有 `groups`/`order`/`assignments`。
- 不改 `groups` / `order` / `assignments` 的结构与语义；不改 `folded`、`collapsed` 两个 localStorage 键。
- 不移动 DOM 节点；隐藏用内联 `display`，排序用 CSS `order`（`docs/design.md` 已记录原因）。
- 「折叠」与「隐藏」是两个概念：折叠临时（展开即回），隐藏持久（直到取消）。不得合并成同一个开关。
- 客户端改动无法单元测试：每个改 `client.js` 的任务必须同时扩 `scripts/check-client.mjs`。
- 每个任务结束提交一次。版本号在最后一个任务里升到 `0.9.0`。
- 桌面端验证前必须**彻底退出并重开**（客户端 bundle 按 `?rev=` 加载且 `immutable`）。

## 改前的现状（供执行者对照）

| 概念 | 现状 | 位置 |
|---|---|---|
| 全局折叠 | 开关行点击，状态存 `localStorage` 键 `dsh-sidebar-fold:folded` | `client.js` `readFolded` / `writeFolded` |
| 按组折叠 | 点组标题；本地覆盖存 `…:collapsed`，回退到宿主 `settings.groups[].collapsed` | `client.js` `toggleGroup` / `collapsedById` |
| 折叠判定 | `const hide = (folded \|\| collapsedById.get(entry.groupId) === true) && el !== kept` | `client.js` `applyPlan` |
| 隐藏 | **只有硬编码规则**：`HIDE_LABELS = ['更多','More']`，无用户配置 | `client.js` `settleUnmanaged` |
| 配置结构 | `{ version, groups[], order[], assignments{} }` | `src/settings.js` `DEFAULT_SETTINGS` |
| 布局计算 | 纯函数，返回 `{ groups[], rows[], missing[] }` | `src/plan.js` `planLayout` |

本轮**不新增"按分组折叠"**——它本来就有（点组标题、或设置页勾「默认折叠」）。新增的是**按条目**的 `pinned` / `hidden`。

## 新增配置字段与示例

`~/.dsh/dsh-sidebar-fold-zxp/settings.json` 新增两个数组，缺省为空：

```json
{
  "version": 1,
  "groups": [{ "id": "dev", "name": "开发", "collapsed": false }],
  "order": ["插件市场", "任务看板"],
  "assignments": { "任务看板": "dev" },
  "pinned": ["插件市场"],
  "hidden": ["使用统计"]
}
```

| 字段 | 类型 | 缺省 | 语义 |
|---|---|---|---|
| `pinned` | `string[]`（条目 key） | `[]` | 折叠时**仍然显示** |
| `hidden` | `string[]`（条目 key） | `[]` | **始终不显示**，直到从数组里移除 |

条目 key 就是行自己的 `aria-label`（例如 `插件市场`、`任务看板`）。同一个 key 同时出现在两个数组时，`hidden` 胜出。

旧文件（没有这两个字段）读入后自动补空数组，界面与 v0.8.0 完全一致。

## Review Focus

1. **旧配置只有 `groups`/`order`/`assignments`（无 `pinned`/`hidden`）** —— 期望：读入后补空数组，界面与 v0.8.0 完全一致，不是"差不多一致"。
2. **折叠开启 + 存在 `pinned` 条目** —— 期望：只保留开关行、当前面板行、以及被 pinned 的行，其余照旧收起。
3. **`hidden` 里留着已卸载条目的 key（幽灵 key）** —— 期望：不崩、不产生空标题，设置页可清理。
4. **某组全部条目都在 `hidden` 里** —— 期望：该组标题也不画（不留空标题）。
5. **当前正在看的面板被设为 `hidden`** —— 期望：隐藏优先，该行消失（显式动作压过"保留当前面板"豁免）；此项必须有一个测试钉住。

---

### Task 1: 配置字段 `pinned` / `hidden`

**Files:**
- Modify: `src/settings.js`（`DEFAULT_SETTINGS`、`sanitizeSettings`）
- Test: `test/settings.test.js`

**Interfaces:**
- Consumes: 无（第一个任务）。
- Produces: `sanitizeSettings(raw)` 的返回值新增 `pinned: string[]`、`hidden: string[]`；`DEFAULT_SETTINGS` 含这两个字段（均为 `[]`）。

- [ ] **Step 1: 写失败测试**

加到 `test/settings.test.js`：

```js
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

test('pinned 与 hidden 同时包含同一 key 时，hidden 胜出（只留 hidden）', () => {
  const out = sanitizeSettings({ pinned: ['x'], hidden: ['x'] })
  assert.deepEqual(out.pinned, [])
  assert.deepEqual(out.hidden, ['x'])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/settings.test.js`
Expected: 3 个新用例 FAIL（`pinned` 为 `undefined`）

- [ ] **Step 3: 实现**

`DEFAULT_SETTINGS` 加 `pinned: [], hidden: []`。在 `sanitizeSettings` 里复用现有的 `order` 清洗逻辑抽出的 `stringList(value, max)`（去空、去重、截断到 500），分别产出 `pinned`、`hidden`；最后从 `pinned` 里剔除 `hidden` 中已有的 key。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test`
Expected: 全部 PASS（原 40 项 + 新增 3 项）

- [ ] **Step 5: 提交**

```bash
git add src/settings.js test/settings.test.js
git commit -m "feat(settings): add pinned and hidden lists, empty by default"
```

---

### Task 2: 把两个标志带到行上，并标出整组被隐藏

**Files:**
- Modify: `src/plan.js`（`planLayout` 的 `rows` 与 `groups`）
- Test: `test/plan.test.js`

**Interfaces:**
- Consumes: Task 1 的 `settings.pinned` / `settings.hidden`。
- Produces: `planLayout({ settings, entryIds })` 返回的行新增 `pinned: boolean`、`hidden: boolean`；组新增 `allHidden: boolean`。其余字段不变。

- [ ] **Step 1: 写失败测试**

加到 `test/plan.test.js`：

```js
test('行带上 pinned / hidden 标志', () => {
  const plan = planLayout({
    settings: settings({ pinned: ['alpha'], hidden: ['beta'] }),
    entryIds: ['alpha', 'beta', 'gamma'],
  })
  const byId = new Map(plan.rows.map(row => [row.id, row]))
  assert.equal(byId.get('alpha').pinned, true)
  assert.equal(byId.get('alpha').hidden, false)
  assert.equal(byId.get('beta').hidden, true)
  assert.equal(byId.get('gamma').pinned, false)
  assert.equal(byId.get('gamma').hidden, false)
})

test('整组条目都被隐藏时，组上标 allHidden', () => {
  const plan = planLayout({
    settings: settings({ groups: [{ id: 'dev', name: '开发', collapsed: false }], hidden: ['board'] }),
    entryIds: ['board', 'market'],
  })
  assert.equal(plan.groups.find(g => g.id === 'dev').allHidden, true)
  assert.equal(plan.groups.find(g => g.implicit).allHidden, false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/plan.test.js`
Expected: 2 个新用例 FAIL（`pinned` / `allHidden` 为 `undefined`）

- [ ] **Step 3: 实现**

`planLayout` 里把 `hidden`、`pinned` 各转成 `Set`；`rows.push` 增加 `pinned: pinnedSet.has(id)`、`hidden: hiddenSet.has(id)`。`headers.push` 增加 `allHidden: group.members.every(id => hiddenSet.has(id))`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/plan.js test/plan.test.js
git commit -m "feat(plan): carry pinned/hidden onto rows and mark fully hidden groups"
```

---

### Task 3: 设置页要用的操作 `entry.mode`

**Files:**
- Modify: `src/edits.js`（新增 case）
- Test: `test/edits.test.js`

**Interfaces:**
- Consumes: Task 1 的 `sanitizeSettings`；Task 2 的 `planLayout`。
- Produces: `applyEdit({ settings, entryIds, op })` 支持 `op = { op: 'entry.mode', entryId: string, mode: 'follow' | 'pin' | 'hide' }`，返回与其它操作同形：`{ ok: true, settings, plan }` 或 `{ ok: false, error }`。

- [ ] **Step 1: 写失败测试**

加到 `test/edits.test.js`：

```js
test('entry.mode：pin 写进 pinned，并从 hidden 移除', () => {
  const out = run({ op: 'entry.mode', entryId: 'alpha', mode: 'pin' }, { groups: [], order: [], assignments: {}, hidden: ['alpha'] })
  assert.deepEqual(out.settings.pinned, ['alpha'])
  assert.deepEqual(out.settings.hidden, [])
})

test('entry.mode：hide 写进 hidden，并从 pinned 移除', () => {
  const out = run({ op: 'entry.mode', entryId: 'alpha', mode: 'hide' }, { groups: [], order: [], assignments: {}, pinned: ['alpha'] })
  assert.deepEqual(out.settings.pinned, [])
  assert.deepEqual(out.settings.hidden, ['alpha'])
})

test('entry.mode：follow 两个列表都不留', () => {
  const out = run({ op: 'entry.mode', entryId: 'alpha', mode: 'follow' }, { groups: [], order: [], assignments: {}, pinned: ['alpha'], hidden: ['alpha'] })
  assert.deepEqual(out.settings.pinned, [])
  assert.deepEqual(out.settings.hidden, [])
})

test('entry.mode：未知 mode 被拒绝', () => {
  const out = run({ op: 'entry.mode', entryId: 'alpha', mode: 'delete' })
  assert.equal(out.ok, false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/edits.test.js`
Expected: 4 个新用例 FAIL（`unknown operation: entry.mode`）

- [ ] **Step 3: 实现**

在 `applyEdit` 的 `switch` 里加 `case 'entry.mode'`：校验 `mode` 属于三者之一，否则返回 `{ ok: false, error: 'unknown mode' }`；从 `pinned`/`hidden` 里都剔除该 `entryId`，`pin` 时写入 `pinned`、`hide` 时写入 `hidden`、`follow` 时都不写；经 `change(...)` 返回。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/edits.js test/edits.test.js
git commit -m "feat(edits): entry.mode switches an entry between follow, pin and hide"
```

---

### Task 4: 侧栏按标志折叠，并跳过整组隐藏的标题

**Files:**
- Modify: `client.js`（`applyPlan` 的判定与标题循环）
- Modify: `scripts/check-client.mjs`

**Interfaces:**
- Consumes: Task 2 的行字段 `pinned` / `hidden`，组字段 `allHidden`。
- Produces: 无新导出；行为契约——折叠时 `pinned` 行保持可见，`hidden` 行永不显示，`allHidden` 的组不画标题。

- [ ] **Step 1: 改折叠判定**

`client.js` 中把现状

```js
const hide = (folded || collapsedById.get(entry.groupId) === true) && el !== kept
```

改为（两个标志都为 false 时化简结果与原式相同）：

```js
const hide = (
  entry.hidden === true
  || ((folded && entry.pinned !== true) || collapsedById.get(entry.groupId) === true)
) && el !== kept
```

- [ ] **Step 2: 标题循环跳过整组隐藏的组**

在 `for (const group of plan.groups)` 里、`if (group.implicit) continue` 之后加：

```js
if (group.allHidden === true) continue
```

- [ ] **Step 3: 扩结构检查**

`scripts/check-client.mjs` 的 `checks` 数组加三条：

```js
['pinned rows survive the fold', /folded && entry\.pinned !== true/.test(source)],
['hidden rows never show', /entry\.hidden === true/.test(source)],
['groups whose entries are all hidden keep no header', /group\.allHidden === true/.test(source)],
```

- [ ] **Step 4: 跑检查**

Run: `node --check client.js && node scripts/check-client.mjs`
Expected: 语法通过；结构检查全部 PASS（原 16 条 + 新增 3 条）

- [ ] **Step 5: 提交**

```bash
git add client.js scripts/check-client.mjs
git commit -m "feat(client): fold only the entries that follow the fold"
```

---

### Task 5: 设置页三态选择，并发布 0.9.0

**Files:**
- Modify: `client.js`（`SettingsPage` 的 `entryRow`）
- Modify: `README.md`、`docs/design.md`、`package.json`
- Modify: `scripts/check-client.mjs`

**Interfaces:**
- Consumes: Task 3 的 `entry.mode` 操作；Task 3 的 `plan` 返回值。
- Produces: 无新导出；设置页每行多一个 `<select>`，选项值 `follow` / `pin` / `hide`。

- [ ] **Step 1: 每行加三态选择**

在 `entryRow` 的抓手套（`dsh-fold-set-grip`）之后插入一个 `select`，`value` 由该行派生：`row.hidden ? 'hide' : row.pinned ? 'pin' : 'follow'`；`onChange` 调 `send({ op: 'entry.mode', entryId: row.id, mode: event.target.value })`。三个选项文案取自 `t()`：`跟随折叠` / `折叠时仍显示` / `始终隐藏`（中英字典各加三条）。

- [ ] **Step 2: 扩结构检查**

```js
['the settings page offers three modes per entry', /op: 'entry\.mode'/.test(source)],
```

Run: `node --check client.js && node scripts/check-client.mjs`
Expected: 全部 PASS

- [ ] **Step 3: 文档与版本**

`README.md` 的「怎么用」加一句：每行可设为「跟随折叠 / 折叠时仍显示 / 始终隐藏」。`docs/design.md` 的最终方案里补一段说明两个新字段与判定式。`package.json` 版本改 `0.9.0`。

- [ ] **Step 4: 全量验证**

Run: `node --test && node scripts/check-client.mjs`
Expected: 测试全部 PASS；结构检查全部 PASS

- [ ] **Step 5: 提交并打标签**

```bash
git add -A
git commit -m "feat(settings): three-state entry mode, and release 0.9.0"
git tag -a v0.9.0 -m "v0.9.0 - selective fold and per-entry hide"
```

---

## 手动验证步骤（实现完成后执行）

先**彻底退出 DSH NEXT 并重新打开**（不重启看不到新代码）。

1. **旧行为不变**：不配置任何三态时，点「插件列表」整块收起，点组标题各自收起——与升级前一致。
2. **全部折叠正常**：所有条目为「跟随折叠」→ 折叠后只留开关行与当前面板行。
3. **部分折叠正常**：把「插件市场」设为「折叠时仍显示」→ 折叠后它仍可见，其余照旧收起。
4. **部分隐藏正常**：把「使用统计」设为「始终隐藏」→ 它消失；其余不受影响；展开/折叠都不再出现它。
5. **整组隐藏**：把某组全部条目设为「始终隐藏」→ 该组标题也不出现。
6. **持久化**：改完刷新页面、再彻底重启桌面端，配置仍然生效。
7. **旧配置兼容**：手动把 `settings.json` 里的 `pinned`/`hidden` 删掉 → 界面回到升级前行为，`groups`/`order` 不丢。

## 回归测试清单

- [ ] `node --test` 全绿（原 40 项 + Task 1 三项 + Task 2 两项 + Task 3 四项）。
- [ ] `node scripts/check-client.mjs` 全绿（原 16 条 + Task 4 三条 + Task 5 一条）。
- [ ] `node --check client.js`、`node --check index.js` 通过。
- [ ] `settings.json` 缺少新字段时服务仍能启动，`GET /api/dsh-sidebar-fold-zxp/settings` 返回含空数组的完整结构。
- [ ] 卸载插件后左栏恢复原样（`display`、`order`、`margin`、`box-shadow`、`aria-hidden` 全部复位，组标题移除）。

