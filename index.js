/**
 * Host half: the configuration file and the two routes that reach it.
 *
 * Deliberately small. Everything that decides *what* the configuration means
 * lives in `src/` where it can be tested; this file only moves bytes and keeps
 * memory, disk and the browser agreeing.
 */
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, settingsFile } from './src/settings.js'
import { parseJsonObject } from './src/body.js'
import { planLayout } from './src/plan.js'

const BASE = '/api/dsh-sidebar-fold-zxp'

/**
 * Declared, not looked up: Cordis refuses `ctx.webServer` without it, and the
 * failure is a plugin that simply never activates.
 */
export const inject = ['webServer']

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    // Configuration is live state, not a document: a cached copy is worse than
    // none, because it looks current.
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export function apply(ctx) {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  const file = settingsFile(home)

  /** Defaults first, so the plugin is usable before the file has been read. */
  let settings = { ...DEFAULT_SETTINGS }
  /** Set once the browser has saved: the deferred read must not undo it. */
  let userSaved = false

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(BASE.length).replace(/\/+$/, '')
    try {
      if (route === '/settings') {
        if (req.method === 'GET') {
          json(res, 200, { settings })
          return
        }
        if (req.method !== 'PUT') {
          json(res, 405, { error: 'method not allowed', allow: ['GET', 'PUT'] })
          return
        }
        const parsed = parseJsonObject(await readBody(req))
        if (!parsed.ok) {
          json(res, 400, { error: parsed.error })
          return
        }
        // Write first, then commit to memory: if the disk write fails the caller
        // gets an error and memory still matches what is on disk.
        settings = await saveSettings(file, parsed.value)
        userSaved = true
        json(res, 200, { settings })
        return
      }
      if (route === '/plan') {
        // The browser knows which entries exist; the host knows the ordering
        // rules. Asking the host to compute the layout keeps that rule set in
        // the tested module instead of duplicating it in client.js.
        if (req.method !== 'POST') {
          json(res, 405, { error: 'method not allowed', allow: ['POST'] })
          return
        }
        const parsed = parseJsonObject(await readBody(req))
        if (!parsed.ok) {
          json(res, 400, { error: parsed.error })
          return
        }
        const entryIds = Array.isArray(parsed.value.entryIds) ? parsed.value.entryIds : []
        json(res, 200, planLayout({ settings, entryIds }))
        return
      }
      json(res, 404, { error: 'not found' })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    handler,
  }), 'dsh-sidebar-fold-zxp: settings routes')

  // A slow or broken file must never delay the plugin coming up, and the
  // defaults are already a working configuration.
  void loadSettings(file).then(loaded => {
    if (userSaved) return
    settings = loaded
  }).catch(() => { /* defaults stand */ })
}
