/**
 * Host half: deliberately empty.
 *
 * Folding the sidebar is a purely visual concern — it decides which rows the
 * shell paints — so it belongs in the browser. There is no service, no route
 * and no stored state on this side; the fold flag lives in the page's
 * localStorage and nowhere else.
 */

/** Cordis calls this when the row is mounted. Nothing to do. */
export function apply() {}
