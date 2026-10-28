window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fold-zxp',
  factory(require) {
    const React = require('react')

    const STYLE_ID = 'dsh-sidebar-fold-style'
    const CONFIG_KEY = 'dsh-sidebar-fold:config'
    const FOLD_KEY = 'dsh-sidebar-fold:folded'
    const FOLD_ATTR = 'data-fold-collapsed'

    const DICT = {
      zh: {
        row: '插件列表',
        hint: '点击展开 / 收起，设置里可以隐藏和排序',
        'set.page': '插件列表',
        'set.intro': '勾选要显示的插件入口，用箭头调整顺序。改动立刻生效。',
        'set.show': '显示',
        'set.up': '上移',
        'set.down': '下移',
        'set.reset': '全部显示（清空顺序）',
        'set.wait': '先让侧栏显示出来，这里才会列出条目。',
        'set.hiddenCount': '已隐藏 {n} 个',
      },
      en: {
        row: 'Plugin list',
        hint: 'Click to fold; hide and reorder in Settings',
        'set.page': 'Plugin list',
        'set.intro': 'Tick the entries to show, and use the arrows to order them. Changes apply immediately.',
        'set.show': 'Show',
        'set.up': 'Move up',
        'set.down': 'Move down',
        'set.reset': 'Show everything (clear order)',
        'set.wait': 'Let the sidebar render once so this page can list the entries.',
        'set.hiddenCount': '{n} hidden',
      },
    }

    function localeOf() {
      try {
        if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) return 'zh'
      } catch { /* fall through */ }
      return navigator && /^zh/i.test(navigator.language || '') ? 'zh' : 'en'
    }

    function translator(lang) {
      const table = DICT[lang] ?? DICT.en
      return (key, vars) => {
        let text = table[key] ?? key
        if (vars) for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value))
        return text
      }
    }

    // ── configuration, kept in this page ─────────────────────────────────────
    //
    // Deliberately local. Every previous attempt to move this through the host
    // failed silently in the desktop shell for reasons that were never visible
    // from here, and none of the state needs a server: it is one small object
    // describing which rows to show and in what order.

    function readConfig() {
      try {
        const raw = window.localStorage.getItem(CONFIG_KEY)
        if (raw === null) return { order: [], hidden: [] }
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return { order: [], hidden: [] }
        return {
          order: Array.isArray(parsed.order) ? parsed.order.filter(k => typeof k === 'string') : [],
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(k => typeof k === 'string') : [],
        }
      } catch {
        return { order: [], hidden: [] }
      }
    }

    function writeConfig(config) {
      try { window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config)) } catch { /* private mode */ }
    }

    function readFolded() {
      try {
        const raw = window.localStorage.getItem(FOLD_KEY)
        return raw === null ? true : raw === 'true'
      } catch {
        return true
      }
    }

    function writeFolded(value) {
      try { window.localStorage.setItem(FOLD_KEY, value ? 'true' : 'false') } catch { /* private mode */ }
    }

    // ── the DOM ──────────────────────────────────────────────────────────────

    function navOf(node) {
      return node?.closest ? node.closest('nav') : null
    }

    function rowOf(node) {
      return node?.closest ? node.closest('button') : null
    }

    function isOurs(el) {
      return el.hasAttribute('data-fold-row')
    }

    /** Real panel rows, excluding our own toggle row. */
    function panelRows(nav) {
      if (nav === null) return []
      return [...nav.querySelectorAll(':scope > button')].filter(el => !isOurs(el))
    }

    /**
     * The key that identifies a row.
     *
     * Its own `aria-label` — the one stable, visible identifier both client
     * builds put on these rows. The slot registry is not usable: in the desktop
     * shell `ctx.slots` exposes only register / inject, so enumerating entries
     * returns nothing, which is why every registry-based version did nothing at
     * all there.
     */
    function keyOf(row, index, seen) {
      const raw = (row.getAttribute('aria-label') ?? row.textContent ?? '').trim().replace(/\s+/g, ' ')
      const base = raw === '' ? `row-${index + 1}` : raw
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      return count === 0 ? base : `${base}#${count + 1}`
    }

    /** Read the rows as `{ key, row }`, in the shell's current order. */
    function collectRows(nav) {
      const seen = new Map()
      return panelRows(nav).map((row, index) => ({ key: keyOf(row, index, seen), row }))
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

    function useConfig() {
      const [config, setConfig] = React.useState(readConfig)
      React.useEffect(() => {
        const listener = () => setConfig(readConfig())
        configListeners.add(listener)
        return () => { configListeners.delete(listener) }
      }, [])
      return config
    }

    const configListeners = new Set()

    function saveConfig(next) {
      writeConfig(next)
      for (const listener of configListeners) listener()
    }

    // ── apply everything as CSS ──────────────────────────────────────────────
    //
    // One stylesheet, no node edits. React owns those rows and will overwrite any
    // attribute we set on them, but it knows nothing about a rule keyed on
    // `[aria-label=...]`, so the result survives every re-render — including the
    // ones that happen while the host is streaming.

    /** An attribute selector for one key, with quoting that cannot break out. */
    function selectorFor(key) {
      return `nav > button[aria-label=${JSON.stringify(key)}]`
    }

    function buildCss(config) {
      const parts = []

      // Rows are laid out in a column so `order` has something to order.
      parts.push('nav > button[data-fold-row] { order: -99999; }')

      const order = Array.isArray(config.order) ? config.order : []
      order.forEach((key, index) => {
        parts.push(`${selectorFor(key)} { order: ${index}; }`)
      })

      for (const key of Array.isArray(config.hidden) ? config.hidden : []) {
        parts.push(`${selectorFor(key)} { display: none !important; }`)
      }

      // The fold hides every row except the toggle and the panel being read. It
      // is a rule rather than a per-row loop, so a row that appears later is
      // covered without anyone re-running anything.
      parts.push(`html[${FOLD_ATTR}="true"] nav > button:not([data-fold-row]):not([aria-current="page"]) { display: none !important; }`)

      return parts.join('\n')
    }

    function applyConfig() {
      const config = readConfig()
      let style = document.getElementById(STYLE_ID)
      if (style === null) {
        style = document.createElement('style')
        style.id = STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = buildCss(config)
      document.documentElement?.setAttribute?.(FOLD_ATTR, readFolded() ? 'true' : 'false')
    }

    // ── the toggle row ───────────────────────────────────────────────────────

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
        style: { transform: folded ? 'rotate(-90deg)' : 'none', transition: 'transform 140ms ease' },
      }, React.createElement('path', { d: 'M4 6.5 8 10.5 12 6.5' }))
    }

    function FoldRow({ t }) {
      const nodeRef = React.useRef(null)
      const [folded, setFolded] = React.useState(readFolded)
      const foldedRef = React.useRef(folded)
      foldedRef.current = folded
      const config = useConfig()

      // Our row must never be treated as a panel entry, and it must never invoke
      // the shell's `selectPanel(ourId)` — there is no panel behind it.
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

      // Report the rows we can see, and (re)apply the stylesheet whenever the
      // configuration or the fold changes.
      React.useEffect(() => {
        const nav = navOf(nodeRef.current)
        if (nav !== null) setObserved(collectRows(nav).map(entry => entry.key))
        applyConfig()

        if (nav === null) return undefined
        const observer = new MutationObserver(() => {
          const again = navOf(nodeRef.current)
          if (again !== null) setObserved(collectRows(again).map(entry => entry.key))
        })
        observer.observe(nav, { childList: true })
        return () => observer.disconnect()
      }, [folded, config])

      return React.createElement('span', {
        ref: nodeRef,
        className: 'dsh-fold-glyph',
        'data-folded': folded ? 'true' : 'false',
        title: t('hint'),
      }, React.createElement(Chevron, { folded }))
    }

    // ── the settings page ────────────────────────────────────────────────────

    function SettingsPage({ t }) {
      const keys = useObservedKeys()
      const config = useConfig()

      const hidden = new Set(config.hidden)
      const orderIndex = new Map(config.order.map((key, index) => [key, index]))
      const sorted = [...keys].sort((a, b) => {
        const ra = orderIndex.has(a) ? orderIndex.get(a) : Number.POSITIVE_INFINITY
        const rb = orderIndex.has(b) ? orderIndex.get(b) : Number.POSITIVE_INFINITY
        if (ra !== rb) return ra - rb
        return keys.indexOf(a) - keys.indexOf(b)
      })

      const move = (key, delta) => {
        const list = [...sorted]
        const from = list.indexOf(key)
        const to = from + delta
        if (from < 0 || to < 0 || to >= list.length) return
        list.splice(from, 1)
        list.splice(to, 0, key)
        saveConfig({ ...config, order: list })
      }

      const toggle = (key, show) => {
        const next = new Set(hidden)
        if (show) next.delete(key)
        else next.add(key)
        saveConfig({ ...config, hidden: [...next] })
      }

      const row = key => React.createElement('div', {
        className: 'dsh-fold-set-row',
        key,
        'data-hidden': hidden.has(key) ? 'true' : 'false',
      },
        React.createElement('label', { className: 'dsh-fold-set-check' },
          React.createElement('input', {
            type: 'checkbox',
            checked: !hidden.has(key),
            onChange: event => toggle(key, event.target.checked),
          }),
          t('set.show')),
        React.createElement('span', { className: 'dsh-fold-set-label', title: key }, key),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.up'),
          onClick: () => move(key, -1),
        }, '↑'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.down'),
          onClick: () => move(key, 1),
        }, '↓'))

      return React.createElement('div', { className: 'dsh-fold-set' },
        React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.intro')),
        React.createElement('div', { className: 'dsh-fold-set-legend' },
          t('set.hiddenCount', { n: hidden.size })),
        keys.length === 0
          ? React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.wait'))
          : sorted.map(row),
        keys.length === 0 ? null : React.createElement('div', { className: 'dsh-fold-set-row' },
          React.createElement('button', {
            type: 'button', className: 'dsh-fold-set-button',
            onClick: () => saveConfig({ order: [], hidden: [] }),
          }, t('set.reset'))))
    }

    function injectBaseStyles() {
      if (document.getElementById(`${STYLE_ID}-base`) !== null) return
      const style = document.createElement('style')
      style.id = `${STYLE_ID}-base`
      style.textContent = `
        .dsh-fold-glyph {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; height: 100%;
          color: inherit; opacity: .72;
          transition: opacity 120ms ease;
        }
        .dsh-fold-glyph:hover { opacity: 1; }

        .dsh-fold-set { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
        .dsh-fold-set-legend {
          margin-top: 12px; font-size: 11px; font-weight: 600;
          opacity: .55; letter-spacing: .02em;
        }
        .dsh-fold-set-hint { font-size: 10.5px; opacity: .45; line-height: 1.5; }
        .dsh-fold-set-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
        .dsh-fold-set-row[data-hidden="true"] .dsh-fold-set-label { opacity: .35; text-decoration: line-through; }
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
      `
      document.head.appendChild(style)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const t = translator(localeOf())
        injectBaseStyles()
        applyConfig()

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'sidebar-fold',
          // First among every entry: plugins pick their own order and the useful
          // ones land near the top.
          order: -1000,
          label: () => t('row'),
        }, props => React.createElement(FoldRow, { ...props, t })))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'sidebar-fold-settings',
          order: 37,
          label: () => t('set.page'),
        }, props => React.createElement(SettingsPage, { ...props, t })))

        return () => {
          document.getElementById(STYLE_ID)?.remove()
          document.getElementById(`${STYLE_ID}-base`)?.remove()
          document.documentElement?.removeAttribute?.(FOLD_ATTR)
          setObserved([])
        }
      },
    }
  },
})
