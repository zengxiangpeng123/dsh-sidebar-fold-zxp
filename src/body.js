/**
 * Body parsing, kept out of the socket handler so it can be tested.
 *
 * An empty body means "no fields"; a malformed one is the caller's mistake.
 * Collapsing the two turns a typo in a `PUT` into a write of every default.
 */

/** @param {string} text */
export function parseJsonObject(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: true, value: {} }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'body is not valid JSON' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'body must be a JSON object' }
  }
  return { ok: true, value: parsed }
}
