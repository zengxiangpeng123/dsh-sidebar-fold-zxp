window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fold-zxp',
  factory(require) {
    const React = require('react')

    const STORAGE_KEY = 'dsh-sidebar-fold:folded'
    const STYLE_ID = 'dsh-sidebar-fold-style'
    const ENDPOINT = new URL('api/dsh-sidebar-fold-zxp', document.baseURI).pathname

    const DICT = {
      // Not "插件": the sidebar already has a shipped row with exactly that name,
      // and two rows called the same thing next to each other read as a bug.
      zh: {
        row: '插件列表',
        hint: '展开 / 收起插件入口',
        ungrouped: '未分组',
        empty: '还没有分组',
        'set.page': '插件列表',
        'set.intro': '左边的插件入口按这里的顺序与分组显示。',
        'set.loading': '读取配置…',
        'set.groups': '分组',
        'set.entries': '条目',
        'set.entriesHint': '拖动条目可以换组、换位置；也可以用下拉框和箭头精确调整。',
        'set.name': '新分组名称',
        'set.add': '新建分组',
        'set.collapsed': '默认折叠',
        'set.up': '上移',
        'set.down': '下移',
        'set.remove': '删除',
        'set.missing': '配置里有、但已经不在的条目',
        'set.prune': '清理',
        'set.saveFailed': '保存失败，这次改动没有生效',
        'set.wait': '先打开一次侧栏，这里才能列出条目。',
      },
      en: {
        row: 'Plugin list',
        hint: 'Fold or unfold the plugin entries',
        ungrouped: 'Ungrouped',
        empty: 'No groups yet',
        'set.page': 'Plugin list',
        'set.intro': 'The sidebar shows these entries in this order and these groups.',
        'set.loading': 'Reading settings…',
        'set.groups': 'Groups',
        'set.entries': 'Entries',
        'set.entriesHint': 'Drag an entry to another group or position; the select and arrows are for precise moves.',
        'set.name': 'New group name',
        'set.add': 'Add group',
        'set.collapsed': 'Collapsed',
        'set.up': 'Move up',
        'set.down': 'Move down',
        'set.remove': 'Remove',
        'set.missing': 'Configured but no longer present',
        'set.prune': 'Clean up',
        'set.saveFailed': 'Save failed; that change did not take effect',
        'set.wait': 'Open the sidebar once so this page can list the entries.',
      },
    }

    /**
     * The shell does not hand a client plugin its locale, so read it where it is
     * visible and fall back to the browser's own preference.
     */
    function localeOf(ctx) {
      try {
        const raw = ctx?.locale?.current
        if (typeof raw === 'string' && raw !== '') return raw.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch { /* fall through */ }
      try {
        if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) return 'zh'
      } catch { /* fall through */ }
      return 'en'
    }

    function translator(lang) {
      const table = DICT[lang] ?? DICT.en
      return key => table[key] ?? key
    }

    // ── host calls ───────────────────────────────────────────────────────────

    async function request(path, init) {
      try {
        const response = await fetch(`${ENDPOINT}${path}`, {
          cache: 'no-store',
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        })
        if (!response.ok) return null
        return await response.json()
      } catch {
        return null
      }
    }

    async function loadPlan(keys) {
      const query = encodeURIComponent(keys.join(','))
      const body = await request(`/plan?entryIds=${query}`)
      if (body === null || !Array.isArray(body.rows)) {
        console.warn('[sidebar-fold] could not read the layout plan from the host', ENDPOINT)
        return null
      }
      return body
    }

    async function loadSettings() {
      const body = await request('/settings')
      return body !== null && body.settings ? body.settings : null
    }

    async function saveSettings(next) {
      const body = await request('/settings', { method: 'PUT', body: JSON.stringify(next) })
      return body !== null && body.settings ? body.settings : null
    }

    // ── the fold flag ────────────────────────────────────────────────────────

    /**

     * Collapse overrides kept in this page.

     *

     * Clicking a group header must open or close it even when the write back to the

     * host does not land — in the desktop shell a failed PUT showed as "the header

     * does nothing at all", which is the worst possible feedback. The click is

     * applied here first and persisted afterwards, best effort.

     */

    const COLLAPSED_KEY = 'dsh-sidebar-fold:collapsed'

    

    function readCollapsedOverrides() {

      try {

        const raw = window.localStorage.getItem(COLLAPSED_KEY)

        if (raw === null) return {}

        const parsed = JSON.parse(raw)

        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

        const out = {}

        for (const [key, value] of Object.entries(parsed)) {

          if (typeof key === 'string' && typeof value === 'boolean') out[key] = value

        }

        return out

      } catch {

        return {}

      }

    }

    

    function writeCollapsedOverrides(overrides) {

      try { window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(overrides)) } catch { /* private mode */ }

    }

    

    function readFolded() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return raw === null ? true : raw === 'true'
      } catch {
        return true
      }
    }

    function writeFolded(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
      } catch { /* private mode: the fold still works for this page */ }
    }

    // ── the DOM ──────────────────────────────────────────────────────────────

    function navOf(node) {
      return node?.closest ? node.closest('nav') : null
    }

    function rowOf(node) {
      return node?.closest ? node.closest('button') : null
    }

    function isOurs(el) {
      return el.hasAttribute('data-fold-header') || el.hasAttribute('data-fold-row')
    }

    /** Real panel rows, in the shell's own order, excluding our own. */
    function panelRows(nav, selfRow) {
      if (nav === null) return []
      return [...nav.querySelectorAll(':scope > button')]
        .filter(el => !isOurs(el) && el !== selfRow)
    }

    function activeRow(nav) {
      if (nav === null) return null
      return nav.querySelector(':scope > button[aria-current="page"]')
    }

    /**
     * Map every panel row to the key that identifies it.
     *
     * The key is the row's own `aria-label` — the only stable, visible identifier
     * both client builds put on these rows. The slot registry looks like the
     * obvious source and is not: `ctx.slots` in the desktop shell exposes only
     * register / inject, so enumerating entries there returns nothing and the
     * whole feature silently does nothing. Reading the DOM works in both builds.
     *
     * Labels repeat only if two plugins pick the same name; the second gets a
     * `#2` suffix so the configuration can still tell them apart.
     */
    function collectRows(nav, selfRow) {
      const rows = panelRows(nav, selfRow)
      const seen = new Map()
      const byKey = new Map()
      for (const [index, row] of rows.entries()) {
        const raw = (row.getAttribute('aria-label') ?? row.textContent ?? '').trim().replace(/\s+/g, ' ')
        const base = raw === '' ? `row-${index + 1}` : raw
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        byKey.set(count === 0 ? base : `${base}#${count + 1}`, row)
      }
      return { rows, byKey }
    }

    // ── what the sidebar saw, shared with the settings page ──────────────────

    let observedKeys = []
    const keyListeners = new Set()

    function setObserved(keys) {
      const same = keys.length === observedKeys.length && keys.every((key, index) => key === observedKeys[index])
      observedKeys = keys
      if (!same) for (const listener of keyListeners) listener()
    }

    function useObservedKeys() {
      const [keys, setKeys] = React.useState(observedKeys)
      React.useEffect(() => {
        const listener = () => setKeys(observedKeys)
        keyListeners.add(listener)
        listener()
        return () => { keyListeners.delete(listener) }
      }, [])
      return keys
    }

    // ── rendering ────────────────────────────────────────────────────────────

    /**

     * Indent a grouped row and draw the guide line that connects it to its header.

     *

     * The line is a `box-shadow` rather than a border: a border would change the

     * row width and shift the content by a pixel, while an inset shadow paints the

     * same 1px edge without taking part in layout.

     */

    const GUIDE_COLOR = 'rgba(128, 132, 140, .30)'

    const INDENT = '20px'

    

    function setGrouped(el, ungrouped) {

      const wantIndent = ungrouped ? '' : INDENT

      const wantGuide = ungrouped ? '' : `inset 1px 0 0 0 ${GUIDE_COLOR}`

      if (el.style.marginInlineStart !== wantIndent) el.style.marginInlineStart = wantIndent

      if (el.style.boxShadow !== wantGuide) el.style.boxShadow = wantGuide

    }

    

    /**

     * Show or hide a row.
     *
     * `style.display` rather than the `hidden` attribute: the rows carry a class
     * that sets `display: flex`, and a class rule beats the user-agent
     * `[hidden] { display: none }` rule — the attribute would look right in the
     * markup and change nothing on screen.
     */
    function setShown(el, shown) {
      const want = shown ? '' : 'none'
      if (el.style.display !== want) el.style.display = want
      if (shown) {
        if (el.hasAttribute('aria-hidden')) el.removeAttribute('aria-hidden')
      } else if (el.getAttribute('aria-hidden') !== 'true') {
        el.setAttribute('aria-hidden', 'true')
      }
    }

    /**
     * Apply one plan: order numbers on the rows, our own headers in between.
     *
     * `order` and nothing else for the rows, because the shell owns those
     * elements — moving a node is undone by its next render, while a CSS order
     * number is invisible to React and survives it.
     */
    /** Labels this plugin always hides: the shell's own overflow affordance. */
    const HIDE_LABELS = ['更多', 'More']
    
    /**
     * Hide the overflow entry and push anything else we do not manage to the end.
     *
     * These children are not panel rows this plugin configures: 「更多」 is not even
     * a `<button>` directly under the nav, which is why the earlier sink loop — it
     * only walked `nav > button` — never saw it and it kept sitting at order 0, in
     * the middle of the first group.
     */
    function settleUnmanaged(nav, managed, selfRow) {
      for (const child of [...nav.children]) {
        if (child.hasAttribute('data-fold-header')) continue
        if (child === selfRow || managed.has(child)) continue
        if (isOurs(child)) continue
        const label = (child.getAttribute?.('aria-label') ?? child.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (HIDE_LABELS.includes(label)) {
          if (child.style.display !== 'none') child.style.display = 'none'
          child.setAttribute('aria-hidden', 'true')
          continue
        }
        if (child.style.order !== '999999') child.style.order = '999999'
      }
    }
    
    function applyPlan(nav, selfRow, folded, plan, byKey, onHeaderClick, overrides) {
      if (nav === null) return

      nav.style.display = 'flex'
      nav.style.flexDirection = 'column'

      for (const el of nav.querySelectorAll(':scope > [data-fold-header]')) el.remove()
      if (selfRow !== null) selfRow.style.order = '-99999'

      const collapsedById = new Map()

            if (plan !== null) {

              for (const group of plan.groups) {

                collapsedById.set(group.id, typeof overrides[group.id] === 'boolean' ? overrides[group.id] : group.collapsed)

              }

            }

      

            const managed = new Set()
      if (plan !== null) {
        const kept = activeRow(nav)
        for (const entry of plan.rows) {
          const el = byKey.get(entry.id)
          if (el === undefined) continue
          managed.add(el)
          el.style.order = String(entry.order)
          // Indent a grouped row so the hierarchy reads at a glance: header, then
          // the rows that belong to it. An ungrouped row keeps full width, so
          // "not in any group" still looks like the default state.
          setGrouped(el, entry.ungrouped === true)
          // The panel the user is looking at stays visible even inside a collapsed
          // group, or they lose track of where they are.
          const hide = (folded || collapsedById.get(entry.groupId) === true) && el !== kept
          setShown(el, !hide)
        }
        // Folded means the whole area is closed: the headers go with it, exactly
        // like the rows. Leaving them behind reads as "the fold ignored the
        // groups", which is what the first version shipped.
        if (!folded) {
          for (const group of plan.groups) {
            if (group.implicit) continue
            const header = makeHeader(group, collapsedById.get(group.id) === true, onHeaderClick)
            header.style.order = String(group.order)
            nav.appendChild(header)
          }
        }
      }

      // Rows that match no entry are not ours to place — but they must not sit in
      // the middle of the list either. The shipped 更多 affordance is one of
      // these: sinking it to the bottom keeps it usable and out of the way, which
      // is the whole of what this plugin should ever do to it.
      for (const [, el] of byKey) {
        if (managed.has(el)) continue
        el.style.order = '999999'
        el.style.marginInlineStart = ''
        el.style.boxShadow = ''
        setShown(el, true)
      }
      settleUnmanaged(nav, managed, selfRow)

      // Nothing configured yet: fall back to the plain fold, so the plugin still
      // does its original job on a fresh install or when the host is unreachable.
      if (plan === null || folded) {
        const kept = activeRow(nav)
        for (const [, el] of byKey) {
          if (plan !== null && !managed.has(el)) continue
          if (plan === null) el.style.marginInlineStart = ''
          setShown(el, !(folded && el !== kept))
        }
      }
    }

    function makeHeader(group, collapsed, onClick) {
      const header = document.createElement('button')
      header.type = 'button'
      header.setAttribute('data-fold-header', group.id)
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
      header.className = 'dsh-fold-header'

      // A vector chevron rather than a text triangle: "▸" sits on the text
      // baseline and changes width between fonts, which is what made the first
      // version feel crude beside the panel's own icons.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 16 16')
      svg.setAttribute('width', '12')
      svg.setAttribute('height', '12')
      svg.setAttribute('fill', 'none')
      svg.setAttribute('stroke', 'currentColor')
      svg.setAttribute('stroke-width', '1.9')
      svg.setAttribute('stroke-linecap', 'round')
      svg.setAttribute('stroke-linejoin', 'round')
      svg.setAttribute('aria-hidden', 'true')
      // `svg.className` is a read-only SVGAnimatedString: assigning a string there
  // does nothing at all, so the rotation rule never matched and the chevron
  // looked frozen.
  svg.setAttribute('class', 'dsh-fold-header-chevron')
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      dot.setAttribute('d', 'M4 6.5 8 10.5 12 6.5')
      svg.appendChild(dot)

      const name = document.createElement('span')
      name.className = 'dsh-fold-header-name'
      name.textContent = group.name
      const count = document.createElement('span')
      count.className = 'dsh-fold-header-count'
      count.textContent = String(group.count)

      header.append(svg, name, count)
      // Capture phase: the shell's own row handler must never see this click.
      header.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        onClick(group)
      }, true)
      return header
    }

    function Chevron({ folded }) {
      return React.createElement('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { transform: folded ? 'rotate(-90deg)' : 'none', transformBox: 'fill-box', transformOrigin: 'center', transition: 'transform 140ms ease' },
      }, React.createElement('path', { d: 'M4 6.5 8 10.5 12 6.5' }))
    }

    function FoldRow({ t }) {
      const nodeRef = React.useRef(null)
      const [folded, setFolded] = React.useState(readFolded)
      const foldedRef = React.useRef(folded)
      foldedRef.current = folded
      const [plan, setPlan] = React.useState(null)
      const planRef = React.useRef(plan)
      planRef.current = plan
      const settingsRef = React.useRef(null)
      const busyRef = React.useRef(false)
      const [collapsed, setCollapsed] = React.useState(readCollapsedOverrides)
      const collapsedRef = React.useRef(collapsed)
      collapsedRef.current = collapsed

      /** Re-ask the host for a layout matching the rows that exist right now. */
      const refresh = React.useCallback(async () => {
        if (busyRef.current) return
        const nav = navOf(nodeRef.current)
        const selfRow = rowOf(nodeRef.current)
        if (nav === null) return
        const { byKey } = collectRows(nav, selfRow)
        const keys = [...byKey.keys()]
        if (keys.length === 0) return
        busyRef.current = true
        try {
          if (settingsRef.current === null) settingsRef.current = await loadSettings()
          const next = await loadPlan(keys)
          if (next !== null) setPlan(next)
        } finally {
          busyRef.current = false
        }
      }, [])

      /**
       * Flip one group, locally first.
       *
       * The click is applied before anything is written: a failed save used to
       * make the header look dead, which is the one outcome a user cannot
       * interpret. Persisting is best effort and happens after the UI moved.
       */
      const toggleGroup = React.useCallback(group => {
        const current = collapsedRef.current
        const was = typeof current[group.id] === 'boolean' ? current[group.id] : group.collapsed
        const next = { ...current, [group.id]: !was }
        collapsedRef.current = next
        setCollapsed(next)
        writeCollapsedOverrides(next)
        void (async () => {
          const settings = settingsRef.current ?? (await loadSettings())
          if (settings === null) return
          const groups = (settings.groups ?? []).map(entry => (
            entry.id === group.id ? { ...entry, collapsed: !was } : entry
          ))
          const saved = await saveSettings({ ...settings, groups })
          if (saved !== null) settingsRef.current = saved
        })()
      }, [])

      // The shell wraps our glyph in its own `<button>`, whose click handler calls
      // `selectPanel(ourId)`. This plugin has no panel, so the click must not reach
      // it. A capture-phase listener on that row also covers Enter and Space, which
      // fire a click on the button rather than on the glyph.
      React.useEffect(() => {
        const row = rowOf(nodeRef.current)
        if (row === null) return undefined
        row.setAttribute('data-fold-row', '')
        const onClick = event => {
          event.preventDefault()
          event.stopPropagation()
          const next = !foldedRef.current
          foldedRef.current = next
          writeFolded(next)
          setFolded(next)
        }
        row.addEventListener('click', onClick, true)
        return () => row.removeEventListener('click', onClick, true)
      }, [])

      // Keep the layout in step with the rows, the fold and the saved plan.
      React.useEffect(() => {
        const node = nodeRef.current
        const nav = navOf(node)
        const selfRow = rowOf(node)
        if (nav === null) return undefined

        const { byKey } = collectRows(nav, selfRow)
        const keys = [...byKey.keys()]
        setObserved(keys)
        applyPlan(nav, selfRow, folded, planRef.current, byKey, group => { toggleGroup(group) }, collapsedRef.current)

        // A plan computed for a different set of rows is stale — entries were
        // installed, removed or renamed. Ask again rather than paint the wrong
        // rows.
        const planKeys = planRef.current === null ? [] : planRef.current.rows.map(row => row.id)
        const same = planKeys.length === keys.length && keys.every(key => planKeys.includes(key))
        if (!same) void refresh()

        // Entries appearing or disappearing, a header removed by the shell's next
        // render, or the open panel changing — all of them mean the layout has to
        // be recomputed. Only these mutations are watched, so our own style writes
        // cannot feed the observer back into a loop.
        const observer = new MutationObserver(mutations => {
          const structural = mutations.some(record => (
            record.type === 'attributes'
              ? record.attributeName === 'aria-current'
              : [...record.addedNodes, ...record.removedNodes].some(n => n.nodeType === 1 && !isOurs(n))
          ))
          if (structural) void refresh()
        })
        observer.observe(nav, { childList: true, attributes: true, attributeFilter: ['aria-current'] })
        return () => observer.disconnect()
      }, [folded, plan, refresh, toggleGroup, collapsed])

      // Hand the sidebar back untouched when this plugin goes away.
      React.useEffect(() => () => {
        const node = nodeRef.current
        const nav = navOf(node)
        const self = rowOf(node)
        if (nav !== null) {
          for (const el of nav.querySelectorAll(':scope > [data-fold-header]')) el.remove()
          for (const el of nav.querySelectorAll(':scope > button')) {
            if (isOurs(el)) continue
            setShown(el, true)
            el.style.order = ''
            el.style.marginInlineStart = ''
            el.style.boxShadow = ''          }
          nav.style.display = ''
          nav.style.flexDirection = ''
        }
        if (self !== null) {
          self.style.order = ''
          self.removeAttribute('data-fold-row')
        }
        // Give the overflow entry back when this plugin goes away.
                const again = navOf(node)
                if (again !== null) {
                  for (const child of again.children) {
                    if (child.getAttribute('aria-hidden') === 'true' && HIDE_LABELS.includes((child.textContent ?? '').trim())) {
                      child.style.display = ''
                      child.removeAttribute('aria-hidden')
                    }
                    if (child.style.order === '999999') child.style.order = ''
                  }
                }
                setObserved([])
      }, [])

      return React.createElement('span', {
        ref: nodeRef,
        className: 'dsh-fold-glyph',
        'data-folded': folded ? 'true' : 'false',
        title: t('hint'),
      }, React.createElement(Chevron, { folded }))
    }

    /**
     * The settings page.
     *
     * It is a form and nothing more: every button posts one operation to the host
     * and renders whatever comes back. What an operation means lives in
     * src/edits.js, where it is tested — this file cannot be.
     */
    function SettingsPage({ t }) {
      const keys = useObservedKeys()
      const [settings, setSettings] = React.useState(null)
      const [plan, setPlan] = React.useState(null)
      const [error, setError] = React.useState('')
      const [name, setName] = React.useState('')
      const [diag, setDiag] = React.useState('')
      /**
       * The live drag: which entry, and where it would land. Plain pointer events
       * rather than HTML5 drag-and-drop — `draggable` + `dataTransfer` looked
       * correct here and did nothing in the desktop shell, and the same code is
       * unreachable on a touch screen.
       */
      const [drag, setDrag] = React.useState(null)

      const ids = React.useMemo(() => [...keys], [keys])

      React.useEffect(() => {
        let alive = true
        void (async () => {
          const loaded = await loadSettings()
          const layout = ids.length === 0 ? null : await loadPlan(ids)
          if (!alive) return
          setSettings(loaded)
          setPlan(layout)
          setDiag(`entries ${ids.length} · rows ${layout === null ? '—' : layout.rows.length} · groups ${layout === null ? '—' : layout.groups.length} · settings ${loaded === null ? 'unreachable' : 'ok'}`)
        })()
        return () => { alive = false }
      }, [ids])

      const send = React.useCallback(async op => {
        const body = await request('/edit', { method: 'POST', body: JSON.stringify({ entryIds: ids, op }) })
        if (body === null || !body.settings) {
          setError(t('set.saveFailed'))
          return
        }
        setError('')
        setSettings(body.settings)
        if (body.plan) setPlan(body.plan)
      }, [ids, t])

      const beginDrag = React.useCallback((event, row) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        setDrag({ id: row.id, groupId: null, beforeId: null })

        const targetAt = (x, y) => {
          const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null
          const rowEl = under?.closest?.('[data-entry-id]')
          if (rowEl !== null && rowEl !== undefined) {
            const id = rowEl.getAttribute('data-entry-id')
            const group = rowEl.getAttribute('data-entry-group')
            if (id !== null && id !== row.id) {
              return { groupId: group === '__ungrouped__' ? null : group, beforeId: id }
            }
          }
          const groupEl = under?.closest?.('[data-group-drop]')
          if (groupEl !== null && groupEl !== undefined) {
            const group = groupEl.getAttribute('data-group-drop')
            return { groupId: group === '__ungrouped__' ? null : group, beforeId: null }
          }
          return null
        }

        const onMove = moveEvent => {
          const target = targetAt(moveEvent.clientX, moveEvent.clientY)
          setDrag(current => (current === null ? current : {
            id: row.id,
            groupId: target === null ? null : target.groupId,
            beforeId: target === null ? null : target.beforeId,
          }))
        }

        const onUp = upEvent => {
          window.removeEventListener('pointermove', onMove, true)
          window.removeEventListener('pointerup', onUp, true)
          window.removeEventListener('pointercancel', onUp, true)
          setDrag(null)
          const target = targetAt(upEvent.clientX, upEvent.clientY)
          if (target === null) return
          void send({ op: 'entry.place', entryId: row.id, groupId: target.groupId, beforeId: target.beforeId })
        }

        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onUp, true)
        window.addEventListener('pointercancel', onUp, true)
      }, [send])

      if (settings === null) {
        return React.createElement('div', { className: 'dsh-fold-set' },
          React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.loading')))
      }

      const groups = Array.isArray(settings.groups) ? settings.groups : []
      const rows = plan !== null && Array.isArray(plan.rows) ? plan.rows : []
      const missing = plan !== null && Array.isArray(plan.missing) ? plan.missing : []

      const groupRow = group => React.createElement('div', { className: 'dsh-fold-set-row', key: group.id },
        React.createElement('input', {
          className: 'dsh-fold-set-input',
          defaultValue: group.name,
          onBlur: event => {
            const value = event.target.value.trim()
            if (value !== '' && value !== group.name) void send({ op: 'group.rename', id: group.id, name: value })
          },
        }),
        React.createElement('label', { className: 'dsh-fold-set-check' },
          React.createElement('input', {
            type: 'checkbox',
            checked: group.collapsed === true,
            onChange: event => { void send({ op: 'group.collapse', id: group.id, collapsed: event.target.checked }) },
          }),
          t('set.collapsed')),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.up'),
          onClick: () => { void send({ op: 'group.move', id: group.id, delta: -1 }) },
        }, '↑'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.down'),
          onClick: () => { void send({ op: 'group.move', id: group.id, delta: 1 }) },
        }, '↓'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.remove'),
          onClick: () => { void send({ op: 'group.remove', id: group.id }) },
        }, '✕'))

      const entryRow = row => React.createElement('div', {
        className: 'dsh-fold-set-row dsh-fold-set-drag',
        key: row.id,
        'data-entry-id': row.id,
        'data-entry-group': row.groupId,
        'data-dragging': drag !== null && drag.id === row.id ? 'true' : 'false',
        'data-drop-target': drag !== null && drag.beforeId === row.id ? 'true' : 'false',
      },
        React.createElement('span', {
          className: 'dsh-fold-set-grip',
          'aria-hidden': 'true',
          // Only the grip and the label start a drag: the select and the arrow
          // buttons must keep behaving like the controls they are.
          onPointerDown: event => beginDrag(event, row),
        }, '⠿'),
        React.createElement('span', {
          className: 'dsh-fold-set-label',
          title: row.id,
          onPointerDown: event => beginDrag(event, row),
        }, row.id),
        React.createElement('select', {
          className: 'dsh-fold-set-select',
          value: row.groupId === '__ungrouped__' ? '' : row.groupId,
          onChange: event => { void send({ op: 'entry.assign', entryId: row.id, groupId: event.target.value }) },
        },
        React.createElement('option', { value: '' }, t('ungrouped')),
        groups.map(group => React.createElement('option', { key: group.id, value: group.id }, group.name))),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.up'),
          onClick: () => { void send({ op: 'entry.move', entryId: row.id, delta: -1 }) },
        }, '↑'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.down'),
          onClick: () => { void send({ op: 'entry.move', entryId: row.id, delta: 1 }) },
        }, '↓'))

      const groupBlock = group => React.createElement('div', {
        key: group.id,
        className: 'dsh-fold-set-group',
        'data-group-drop': group.implicit ? '__ungrouped__' : group.id,
        'data-drop-group': drag !== null && drag.beforeId === null && drag.groupId !== null
          && drag.groupId === (group.implicit ? '__ungrouped__' : group.id) ? 'true' : 'false',
      },
      React.createElement('div', { className: 'dsh-fold-set-grouphead' },
        React.createElement('span', { className: 'dsh-fold-set-groupname' },
          group.implicit ? t('ungrouped') : group.name),
        React.createElement('span', { className: 'dsh-fold-set-groupcount' }, String(group.count))),
      rows.filter(row => row.groupId === group.id).map(entryRow))

      return React.createElement('div', { className: 'dsh-fold-set' },
        error === '' ? null : React.createElement('div', { className: 'dsh-fold-set-error' }, error),
        React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.intro')),
        diag === '' ? null : React.createElement('div', { className: 'dsh-fold-set-diag' }, diag),

        React.createElement('div', { className: 'dsh-fold-set-legend' }, t('set.groups')),
        groups.length === 0
          ? React.createElement('div', { className: 'dsh-fold-set-hint' }, t('empty'))
          : groups.map(groupRow),
        React.createElement('div', { className: 'dsh-fold-set-row' },
          React.createElement('input', {
            className: 'dsh-fold-set-input',
            placeholder: t('set.name'),
            value: name,
            onChange: event => setName(event.target.value),
            onKeyDown: event => {
              if (event.key !== 'Enter' || name.trim() === '') return
              void send({ op: 'group.add', name: name.trim() })
              setName('')
            },
          }),
          React.createElement('button', {
            type: 'button', className: 'dsh-fold-set-button',
            onClick: () => {
              if (name.trim() === '') return
              void send({ op: 'group.add', name: name.trim() })
              setName('')
            },
          }, t('set.add'))),

        React.createElement('div', { className: 'dsh-fold-set-legend' }, t('set.entries')),
        React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.entriesHint')),
        ids.length === 0 || plan === null
          ? React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.wait'))
          : (plan.groups ?? []).map(groupBlock),

        missing.length === 0 ? null : React.createElement('div', { className: 'dsh-fold-set-legend' }, t('set.missing')),
        missing.length === 0 ? null : React.createElement('div', { className: 'dsh-fold-set-row' },
          React.createElement('span', { className: 'dsh-fold-set-label' }, missing.join('、')),
          React.createElement('button', {
            type: 'button', className: 'dsh-fold-set-button',
            onClick: () => { void send({ op: 'prune' }) },
          }, t('set.prune'))))
    }

    function injectStyles() {
      if (document.getElementById(STYLE_ID) !== null) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        .dsh-fold-glyph {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; height: 100%;
          color: inherit; opacity: .72;
          transition: opacity 120ms ease;
        }
        .dsh-fold-glyph:hover { opacity: 1; }
        .dsh-fold-glyph[data-folded="true"] { opacity: .92; }

        /* A section label, not a copy of a panel row: this is the shell's own idiom
           for grouping, and it cannot drift out of step with row metrics it does not
           pretend to share. The whole line is the hit target — 12px of triangle is a
           poor thing to aim at. */
        .dsh-fold-header {
          display: flex; align-items: center; gap: 6px;
          width: 100%; box-sizing: border-box;
          margin: 8px 0 2px; padding: 5px 9px;
          border: 0; border-radius: 7px; background: none; cursor: pointer;
          font: inherit; font-size: 10.5px; line-height: 1.3;
          letter-spacing: .03em; text-align: left;
          color: inherit; opacity: .52;
          transition: opacity 120ms ease, background-color 120ms ease;
        }
        .dsh-fold-header:hover {
          opacity: .95;
          background: var(--dsw-fill-l2, rgba(128, 132, 140, .13));
        }
        .dsh-fold-header:focus-visible {
          opacity: 1; outline: 2px solid var(--dsw-border-l1, #4C7DFF); outline-offset: -2px;
        }
        .dsh-fold-header-chevron {
          flex: 0 0 auto;
          /* An SVG rotates about the corner of its own coordinate box by default,
             which on a 12px glyph reads as "it never moves". */
          transform-box: fill-box;
          transform-origin: center;
          transition: transform 140ms ease;
        }
        .dsh-fold-header[aria-expanded="true"] .dsh-fold-header-chevron { transform: none; }
        .dsh-fold-header[aria-expanded="false"] .dsh-fold-header-chevron { transform: rotate(-90deg); }
        .dsh-fold-header-name {
          flex: 1 1 auto; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .dsh-fold-header-count { flex: 0 0 auto; font-variant-numeric: tabular-nums; opacity: .6; }

        /* ── settings page ───────────────────────────────────────────────── */
        .dsh-fold-set { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
        .dsh-fold-set-legend {
          margin-top: 12px; font-size: 11px; font-weight: 600;
          opacity: .55; letter-spacing: .02em;
        }
        .dsh-fold-set-hint { font-size: 10.5px; opacity: .45; line-height: 1.5; }
        .dsh-fold-set-diag {
          font-size: 10px; opacity: .4; font-variant-numeric: tabular-nums;
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        }
        .dsh-fold-set-error { font-size: 11px; color: #D92D33; }
        .dsh-fold-set-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
        .dsh-fold-set-input, .dsh-fold-set-select {
          font: inherit; font-size: 11.5px;
          padding: 3px 6px; box-sizing: border-box;
          border: 1px solid var(--dsw-border-l2, rgba(128, 132, 140, .32));
          border-radius: 6px;
          background: var(--dsw-bg-layer-1, Canvas);
          color: inherit;
        }
        .dsh-fold-set-input { flex: 1 1 auto; min-width: 0; }
        .dsh-fold-set-select { flex: 0 0 auto; max-width: 40%; }
        .dsh-fold-set-label {
          flex: 1 1 auto; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .dsh-fold-set-check {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10.5px; opacity: .7; white-space: nowrap;
        }
        .dsh-fold-set-button {
          font: inherit; font-size: 11px;
          padding: 2px 7px; border-radius: 6px; cursor: pointer;
          border: 1px solid var(--dsw-border-l2, rgba(128, 132, 140, .32));
          background: transparent; color: inherit; opacity: .75;
          white-space: nowrap;
        }
        .dsh-fold-set-button:hover { opacity: 1; }

        /* ── groups and dragging ─────────────────────────────────────────── */
        .dsh-fold-set-group {
          display: flex; flex-direction: column;
          padding: 2px 0 4px; border-radius: 8px;
        }
        .dsh-fold-set-grouphead {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 2px 2px;
          font-size: 10px; letter-spacing: .03em;
          opacity: .45;
        }
        .dsh-fold-set-groupname { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dsh-fold-set-groupcount { font-variant-numeric: tabular-nums; }
        .dsh-fold-set-drag { padding-inline-start: 6px; border-radius: 6px; }
        .dsh-fold-set-drag[data-dragging="true"] { opacity: .4; }
        /* A line where the row would land, so the drop position is visible before
           the pointer is released. */
        .dsh-fold-set-drag[data-drop-target="true"] {
          box-shadow: inset 0 2px 0 0 var(--dsw-border-l1, #4C7DFF);
        }
        .dsh-fold-set-grip {
          flex: 0 0 auto; cursor: grab; opacity: .3;
          font-size: 11px; user-select: none;
          /* Stops the page scrolling while a drag is in progress, which is what a
             touch screen would otherwise do instead. */
          touch-action: none;
        }
        .dsh-fold-set-drag:active .dsh-fold-set-grip { cursor: grabbing; opacity: .9; }
        .dsh-fold-set-group[data-drop-group="true"] {
          background: var(--dsw-fill-l2, rgba(76, 125, 255, .10));
        }
      `
      document.head.appendChild(style)
      return () => { style.remove() }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const t = translator(localeOf(ctx))
        const removeStyles = injectStyles()

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'sidebar-fold',
          // First among every entry, not merely first among the shipped ones:
          // plugins pick their own order and the useful ones land near the top
          // (the workbench registers -4).
          order: -1000,
          label: () => t('row'),
        }, props => React.createElement(FoldRow, { ...props, t })))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'sidebar-fold-settings',
          order: 37,
          label: () => t('set.page'),
        }, props => React.createElement(SettingsPage, { ...props, t })))

        return removeStyles
      },
    }
  },
})








