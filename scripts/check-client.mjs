#!/usr/bin/env node
/**
 * Structural checks for the browser half.
 *
 * client.js cannot be imported by Node, so the invariants that matter are checked
 * as source rules. Each one exists because breaking it fails silently: the code
 * still runs and the sidebar just stops doing the right thing.
 *
 * This version is one stylesheet and no round trips, after every network- and
 * registry-based design failed in the desktop shell without a visible error.
 * These checks encode that decision, so a later improvement cannot quietly
 * reintroduce the fragile parts.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

const checks = [
  ['hides with a CSS rule, which React cannot undo',
    /display: none !important/.test(source) && /buildCss/.test(source)],
  ['does not set the hidden property on a row', !/\.hidden\s*=\s*(true|false)/.test(source)],
  ['orders rows with CSS order, not by moving nodes',
    /order: \$\{index\}/.test(source) && !/appendChild\((row|el)\)/.test(source)],
  ['makes no network calls at all', !/\bfetch\s*\(/.test(source) && !/\/api\//.test(source)],
  ['does not read the slot registry (absent in the desktop shell)',
    !/entriesOfSlot|entriesOf\b/.test(source)],
  ['uses neither HTML5 drag nor pointer drag', !/draggable|dataTransfer|onPointerDown/.test(source)],
  ['stops the toggle click in the capture phase',
    /addEventListener\('click', onClick, true\)/.test(source) && /event\.stopPropagation\(\)/.test(source)],
  ['anchors on our own node, not a global query',
    /closest\('nav'\)/.test(source) && !/document\.querySelector\(/.test(source)],
  ['quotes attribute selector values so a label cannot break out',
    /JSON\.stringify\(key\)/.test(source)],
  ['folds with an attribute rule on the document element',
    /data-fold-collapsed/.test(source) && /html\[/.test(source)],
  ['hides the overflow row by a fixed rule',
    /ALWAYS_HIDDEN/.test(source) && /ALWAYS_HIDDEN\.includes/.test(source)],
  ['keeps the configuration in this page', /localStorage\.setItem\(CONFIG_KEY/.test(source)],
  ['registers exactly one sidebar row', (source.match(/name: 'sidebar\.panellist'/g) ?? []).length === 1],
  ['registers exactly one settings page', (source.match(/name: 'settings\.section'/g) ?? []).length === 1],
  ['removes its stylesheet and attribute on teardown',
    /getElementById\(STYLE_ID\)\?\.remove\(\)/.test(source) && /removeAttribute\?\.\(FOLD_ATTR\)/.test(source)],
]

let failed = 0
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall structural checks passed')
