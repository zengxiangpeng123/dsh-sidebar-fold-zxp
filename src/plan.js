/**
 * Turn the saved configuration plus the entries that actually exist into the
 * concrete layout the browser applies.
 *
 * This is the whole feature's brain, and it is pure: no DOM, no clock, no file.
 * The browser half only reads the numbers out of the result and writes two
 * styles — which is exactly why the browser half can stay dumb and untested
 * while the decisions here are covered.
 *
 * Ordering numbers, not positions: the shell owns those elements, so the only
 * thing we may change is CSS `order`. Rows get `groupIndex * 1000 + index * 10`
 * and a group's header gets `groupIndex * 1000 - 5`, which keeps a header
 * immediately above its own rows and never lets one group's rows interleave with
 * another's.
 */
import { UNGROUPED_ID } from './settings.js'

/** Spacing between two rows, and between a header and its first row. */
const ROW_STEP = 10
const HEADER_OFFSET = 5
const GROUP_STEP = 1000

/**
 * @param {object} input
 * @param {{groups: Array<{id:string,name:string,collapsed:boolean}>, order: string[], assignments: Record<string,string>}} input.settings
 * @param {string[]} input.entryIds Every panel entry that exists right now.
 * @returns {{
 *   groups: Array<{ id: string, name: string, order: number, collapsed: boolean, count: number }>,
 *   rows: Array<{ id: string, order: number, groupId: string, hidden: boolean, pinned: boolean, userHidden: boolean }>,
 *   missing: string[],
 * }}
 */
export function planLayout({ settings, entryIds }) {
  const ids = []
  const seen = new Set()
  for (const raw of Array.isArray(entryIds) ? entryIds : []) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  const groups = []
  const groupIndex = new Map()
  for (const group of Array.isArray(settings?.groups) ? settings.groups : []) {
    if (group === null || typeof group !== 'object') continue
    const id = typeof group.id === 'string' ? group.id : ''
    if (id === '' || groupIndex.has(id)) continue
    groupIndex.set(id, groups.length)
    groups.push({
      id,
      name: typeof group.name === 'string' && group.name !== '' ? group.name : id,
      collapsed: group.collapsed === true,
      members: [],
    })
  }

  // The implicit bucket exists only when something is actually in it.
  groups.push({ id: UNGROUPED_ID, name: '', collapsed: false, members: [], implicit: true })

  const rank = new Map()
  const order = Array.isArray(settings?.order) ? settings.order : []
  order.forEach((id, index) => { if (!rank.has(id)) rank.set(id, index) })

  const assignments = settings?.assignments !== null && typeof settings?.assignments === 'object'
    ? settings.assignments
    : {}

  for (const id of ids) {
    const groupId = typeof assignments[id] === 'string' && groupIndex.has(assignments[id])
      ? assignments[id]
      : UNGROUPED_ID
    groups[groupIndex.has(groupId) ? groupIndex.get(groupId) : groups.length - 1].members.push(id)
  }

  // Explicit order first, then everything else by id, so a newly installed
  // plugin lands somewhere stable instead of jumping around between renders.
  const byPreference = (a, b) => {
    const ra = rank.has(a) ? rank.get(a) : Number.POSITIVE_INFINITY
    const rb = rank.has(b) ? rank.get(b) : Number.POSITIVE_INFINITY
    if (ra !== rb) return ra - rb
    return a < b ? -1 : a > b ? 1 : 0
  }

  // The two user choices, as sets. `hidden` already means "this row's group is

    // collapsed", so the per-entry switch needs its own name — reusing it would

    // make a folded group and a deliberately hidden entry indistinguishable.

    const pinnedSet = new Set(Array.isArray(settings?.pinned) ? settings.pinned : [])

    const userHiddenSet = new Set(Array.isArray(settings?.hidden) ? settings.hidden : [])

  

    const headers = []
  const rows = []
  let index = 0
  for (const group of groups) {
    if (group.members.length === 0) continue
    group.members.sort(byPreference)
    const implicit = group.implicit === true
    headers.push({
      id: group.id,
      name: group.name,
      order: index * GROUP_STEP - HEADER_OFFSET,
      collapsed: group.collapsed,
      count: group.members.length,
            allHidden: group.members.every(memberId => userHiddenSet.has(memberId)),
      implicit,
    })
    group.members.forEach((id, position) => {
      rows.push({
        id,
        order: index * GROUP_STEP + position * ROW_STEP,
        groupId: group.id,
        // Carried explicitly so the browser knows whether to indent the row
        // without comparing against a sentinel id it would have to hard-code.
        ungrouped: implicit,
        hidden: group.collapsed,
                pinned: pinnedSet.has(id),
                userHidden: userHiddenSet.has(id),
      })
    })
    index += 1
  }

  const existing = new Set(ids)
  const missing = []
  for (const [id, group] of Object.entries(assignments)) {
    if (!existing.has(id)) missing.push(id)
    else if (!groupIndex.has(group)) missing.push(id)
  }

  return { groups: headers, rows, missing }
}

