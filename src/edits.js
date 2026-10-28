/**
 * Every change the settings page can make, as a pure function.
 *
 * The page itself is a form: it posts one operation and re-renders whatever
 * comes back. Nothing here touches the DOM, the clock or the file — which is
 * what lets these rules be covered by `node --test` while `client.js`, which
 * cannot be imported by Node, stays a view.
 *
 * Each operation returns the next configuration or a human reason it was
 * refused; nothing throws, because a settings page that dies on a bad click is
 * worse than one that declines it.
 */
import { planLayout } from './plan.js'
import { UNGROUPED_ID, sanitizeSettings } from './settings.js'

const MAX_GROUPS = 40

/** @param {string} name */
function slugFromName(name) {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base === '' ? '' : base.slice(0, 20)
}

/** Add ids to `order` that are missing, keeping the existing positions. */
function ensureOrdered(order, ids) {
  const next = [...order]
  for (const id of ids) if (!next.includes(id)) next.push(id)
  return next
}

/**
 * Move one entry one place up or down *within its own group*.
 *
 * Groups are contiguous in the rendered layout, so swapping with the neighbour
 * inside the group is exactly what the user sees; swapping with a neighbour in
 * `order` would sometimes jump across a group boundary instead.
 */
function moveEntry({ settings, plan, entryId, delta }) {
  const row = plan.rows.find(entry => entry.id === entryId)
  if (row === undefined) return { ok: false, error: 'unknown entry' }
  const siblings = plan.rows.filter(entry => entry.groupId === row.groupId).map(entry => entry.id)
  const from = siblings.indexOf(entryId)
  const to = from + delta
  if (to < 0 || to >= siblings.length) return { ok: true, settings } // already at the edge
  const swapped = [...siblings]
  swapped[from] = swapped[to]
  swapped[to] = entryId
  // Rewrite just this group's slice of the global order, leaving other groups
  // exactly where they were.
  const order = ensureOrdered(settings.order ?? [], plan.rows.map(entry => entry.id))
  const positions = order
    .map((id, index) => ({ id, index }))
    .filter(entry => siblings.includes(entry.id))
    .map(entry => entry.index)
    .sort((a, b) => a - b)
  const next = [...order]
  swapped.forEach((id, index) => { next[positions[index]] = id })
  return { ok: true, settings: { ...settings, order: next } }
}

/**
 * @param {object} input
 * @param {object} input.settings Current configuration.
 * @param {string[]} input.entryIds Every panel entry that exists right now.
 * @param {{ op: string } & Record<string, unknown>} input.op
 * @returns {{ ok: true, settings: object, plan: object } | { ok: false, error: string }}
 */
export function applyEdit({ settings, entryIds, op }) {
  const current = sanitizeSettings(settings)
  const plan = planLayout({ settings: current, entryIds })
  const change = (next) => {
    const cleaned = sanitizeSettings(next)
    return { ok: true, settings: cleaned, plan: planLayout({ settings: cleaned, entryIds }) }
  }
  const kind = typeof op?.op === 'string' ? op.op : ''

  switch (kind) {
    case 'group.add': {
      const name = String(op.name ?? '').trim()
      if (name === '') return { ok: false, error: 'name is required' }
      if (current.groups.length >= MAX_GROUPS) return { ok: false, error: 'too many groups' }
      const taken = new Set(current.groups.map(group => group.id))
      let id = slugFromName(name) || `group-${current.groups.length + 1}`
      let suffix = 2
      while (taken.has(id) || id === UNGROUPED_ID) {
        id = `${slugFromName(name) || 'group'}-${suffix}`
        suffix += 1
      }
      return change({ ...current, groups: [...current.groups, { id, name: name.slice(0, 40), collapsed: false }] })
    }

    case 'group.rename': {
      const name = String(op.name ?? '').trim()
      if (name === '') return { ok: false, error: 'name is required' }
      return change({
        ...current,
        groups: current.groups.map(group => (group.id === op.id ? { ...group, name: name.slice(0, 40) } : group)),
      })
    }

    case 'group.collapse': {
      return change({
        ...current,
        groups: current.groups.map(group => (group.id === op.id ? { ...group, collapsed: op.collapsed === true } : group)),
      })
    }

    case 'group.remove': {
      const assignments = { ...current.assignments }
      for (const [entryId, groupId] of Object.entries(assignments)) {
        if (groupId === op.id) delete assignments[entryId]
      }
      return change({
        ...current,
        groups: current.groups.filter(group => group.id !== op.id),
        assignments,
      })
    }

    case 'group.move': {
      const index = current.groups.findIndex(group => group.id === op.id)
      const target = index + (Number(op.delta) < 0 ? -1 : 1)
      if (index < 0 || target < 0 || target >= current.groups.length) return { ok: true, settings: current, plan }
      const groups = [...current.groups]
      const [moved] = groups.splice(index, 1)
      groups.splice(target, 0, moved)
      return change({ ...current, groups })
    }

    case 'entry.assign': {
      const groupId = typeof op.groupId === 'string' && op.groupId !== '' && op.groupId !== UNGROUPED_ID
        ? op.groupId
        : null
      const assignments = { ...current.assignments }
      if (groupId === null) delete assignments[String(op.entryId)]
      else assignments[String(op.entryId)] = groupId
      return change({ ...current, assignments })
    }

    case 'entry.move': {
      return change(moveEntry({ settings: current, plan, entryId: String(op.entryId), delta: Number(op.delta) < 0 ? -1 : 1 }).settings)
    }

    case 'prune': {
      // Drop references to entries that no longer exist, so an uninstalled
      // plugin does not leave a permanent "已卸载" line in the page.
      const live = new Set(entryIds)
      const assignments = {}
      for (const [entryId, groupId] of Object.entries(current.assignments)) {
        if (live.has(entryId)) assignments[entryId] = groupId
      }
      return change({
        ...current,
        assignments,
        order: current.order.filter(id => live.has(id)),
      })
    }

    default:
      return { ok: false, error: `unknown operation: ${kind}` }
  }
}
