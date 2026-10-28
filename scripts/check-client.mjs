#!/usr/bin/env node
/**
 * Structural checks for the browser half.
 *
 * `client.js` cannot be imported by Node (the page's module loader delivers it),
 * so the invariants that actually matter are checked as source rules instead.
 * Each one exists because breaking it fails *silently* — the code still runs,
 * the sidebar just quietly stops doing what it should:
 *
 *   1. hiding must go through an inline style. The row's class already sets
 *      `display: flex`, which beats the user-agent `[hidden]` rule;
 *   2. the toggle click must be stopped in the capture phase, or the shell's own
 *      row handler selects a panel that does not exist;
 *   3. ordering must be a CSS `order` number. Moving a node is undone by the
 *      shell's next render and can throw;
 *   4. the ordering rules must not be re-implemented here — the host's tested
 *      planner is the only place they live;
 *   5. nothing may address the shell's DOM through a global selector or a
 *      hashed class name.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

const checks = [
  ['hides through an inline display, never the hidden attribute',
    /const want = shown \? '' : 'none'/.test(source) && /style\.display\s*=\s*want/.test(source)],
  ['does not set the hidden property', !/\.hidden\s*=\s*(true|false)/.test(source)],
  ['stops the click in the capture phase', /addEventListener\('click',\s*onClick,\s*true\)/.test(source)],
  ['stops propagation before the shell reacts', /event\.stopPropagation\(\)/.test(source)],
  ['orders rows with CSS order, not by moving nodes', /style\.order\s*=/.test(source) && !/appendChild\((row|el)\)/.test(source)],
  ['anchors on our own node, not a global selector',
    /closest\('nav'\)/.test(source) && !/document\.querySelector/.test(source)],
  ['does not re-implement the ordering rules', !/GROUP_STEP|planLayout|ROW_STEP/.test(source)],
  ['registers exactly one sidebar row',
    (source.match(/name: 'sidebar\.panellist'/g) ?? []).length === 1],
  ['registers exactly one settings page',
    (source.match(/name: 'settings\.section'/g) ?? []).length === 1],
  ['every settings edit goes through the host',
    /request\('\/edit'/.test(source) && !/planLayout|applyEdit/.test(source)],
  ['reads and writes the fold flag', /localStorage\.getItem\(STORAGE_KEY\)/.test(source) && /localStorage\.setItem\(STORAGE_KEY/.test(source)],
  ['falls back to a plain fold when the host is unreachable', /plan === null \|\| folded/.test(source)],
  ['restores order and visibility on teardown',
    /for \(const el of panelRows\(nav\)\)[\s\S]{0,80}style\.order = ''/.test(source) && /self\.style\.order = ''/.test(source)],
]

let failed = 0
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? '✔' : '✘'} ${name}`)
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall structural checks passed')
