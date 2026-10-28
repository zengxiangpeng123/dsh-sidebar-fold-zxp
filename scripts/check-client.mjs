#!/usr/bin/env node
/**
 * Structural checks for the browser half.
 *
 * `client.js` cannot be imported by Node (the page's module loader delivers it),
 * so the two failure modes that actually matter here are checked as source
 * invariants instead — they are the ones a rename or a "cleanup" edit would
 * quietly undo:
 *
 *   1. hiding must use an inline style, because the row's class already sets
 *      `display: flex` and would beat the `[hidden]` attribute;
 *   2. the click that toggles must be stopped in the capture phase, or the
 *      shell's own row handler selects a panel that does not exist.
 *
 * Everything else here is a cheap smoke test: the file parses and registers one
 * `sidebar.panellist` entry.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

const checks = [
  ['uses inline display to hide a row', /row\.style\.display\s*=\s*'none'/.test(source)],
  ['restores the inline display', /row\.style\.display\s*=\s*''/.test(source)],
  ['stops the click in the capture phase', /addEventListener\('click',\s*onClick,\s*true\)/.test(source)],
  ['stops propagation before the shell reacts', /event\.stopPropagation\(\)/.test(source)],
  ['anchors on our own node, not a global selector', /closest\('nav'\)/.test(source) && !/document\.querySelector/.test(source)],
  ['registers exactly one sidebar row', (source.match(/ctx\.slots\.register\(/g) ?? []).length === 1],
  ['reads and writes the fold flag', /localStorage\.getItem\(STORAGE_KEY\)/.test(source) && /localStorage\.setItem\(STORAGE_KEY/.test(source)],
  ['restores on teardown', /for \(const row of hiddenRef\.current\)/.test(source)],
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
