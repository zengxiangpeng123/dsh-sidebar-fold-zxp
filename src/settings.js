/**
 * The plugin's own configuration, stored as one JSON file.
 *
 * Why the host owns it: `client.js` is delivered by the page's module loader and
 * cannot be imported by Node, so anything that lives there is untestable. The
 * file format, the validation and the fallback rules are the part that can be
 * wrong in ways a user notices (a bad file that blanks the sidebar), so they
 * live here where `node --test` can reach them.
 *
 * The file is small, edited rarely, and every read is a fresh one — no cache.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Bumped only when an older file cannot be read as-is. */
export const SETTINGS_VERSION = 1

/** A stable, localisable-free default name for the implicit group. */
export const UNGROUPED_ID = '__ungrouped__'

export const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  groups: [],
  order: [],
  assignments: {},
  // Entries the user pinned (stay visible while folded) or hid outright. Both
  // empty by default, which is what keeps the pre-existing behaviour intact:
  // with nothing pinned and nothing hidden the fold expression reduces to what
  // it was before these fields existed.
  pinned: [],
  hidden: [],
})

const MAX_GROUPS = 40
const MAX_NAME = 40
const MAX_ORDER = 500

/** @param {string} home */
export function settingsFile(home) {
  return path.join(home, 'dsh-sidebar-fold-zxp', 'settings.json')
}

function asString(value) {
  return typeof value === 'string' ? value : ''
}

/** Group ids are ours: a short slug, so a hand-edited file stays readable. */
function slug(value) {
  return asString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

/**
 * Turn anything into a usable configuration.
 *
 * Never throws, never returns a half-valid object: a corrupt or hand-mangled
 * file must degrade to "no groups, nothing hidden", because the alternative is a
 * sidebar that renders nothing and no way to tell why.
 */
export function sanitizeSettings(raw) {
  const input = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}

  const groups = []
  const seenGroups = new Set()
  if (Array.isArray(input.groups)) {
    for (const entry of input.groups) {
      if (groups.length >= MAX_GROUPS) break
      if (entry === null || typeof entry !== 'object') continue
      const id = slug(entry.id)
      if (id === '' || id === UNGROUPED_ID || seenGroups.has(id)) continue
      const name = asString(entry.name).trim().slice(0, MAX_NAME)
      if (name === '') continue
      seenGroups.add(id)
      groups.push({ id, name, collapsed: entry.collapsed === true })
    }
  }

  /** A de-duplicated list of non-empty strings, capped. */

  function stringList(value, max) {

    const out = []

    const seen = new Set()

    if (!Array.isArray(value)) return out

    for (const entry of value) {

      if (out.length >= max) break

      const id = asString(entry).trim()

      if (id === '' || seen.has(id)) continue

      seen.add(id)

      out.push(id)

    }

    return out

  }

  

    const order = []
  const seenOrder = new Set()
  if (Array.isArray(input.order)) {
    for (const entry of input.order) {
      if (order.length >= MAX_ORDER) break
      const id = asString(entry).trim()
      if (id === '' || seenOrder.has(id)) continue
      seenOrder.add(id)
      order.push(id)
    }
  }

  const assignments = {}
  if (input.assignments !== null && typeof input.assignments === 'object' && !Array.isArray(input.assignments)) {
    for (const [key, value] of Object.entries(input.assignments)) {
      const id = asString(key).trim()
      const group = slug(value)
      // A group that no longer exists must not strand its entries in a phantom
      // group: drop the assignment and let them fall back to "未分组".
      if (id === '' || !seenGroups.has(group)) continue
      assignments[id] = group
    }
  }

  const hidden = stringList(input.hidden, MAX_ORDER)
  // The same key in both lists is a contradiction; hiding wins because it is the
  // more explicit of the two, and the alternative is a row that is "always
  // hidden" and "always visible while folded" at once.
  const pinned = stringList(input.pinned, MAX_ORDER).filter(id => !hidden.includes(id))

  return { version: SETTINGS_VERSION, groups, order, assignments, pinned, hidden }
}

/**
 * Read the file. A missing file is normal (first run); a broken one is renamed
 * aside so it can be inspected, because silently overwriting a file the user
 * hand-edited is the worse failure.
 */
export async function loadSettings(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS }
  }
  try {
    return sanitizeSettings(JSON.parse(text))
  } catch {
    try { await rename(file, `${file}.bad`) } catch { /* leave it in place */ }
    return { ...DEFAULT_SETTINGS }
  }
}

/** Write atomically: a crash mid-write must not leave a truncated config. */
export async function saveSettings(file, settings) {
  const clean = sanitizeSettings(settings)
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
  return clean
}


