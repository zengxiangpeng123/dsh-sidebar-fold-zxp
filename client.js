window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fold-zxp',
  factory(require) {
    const React = require('react')

    const STORAGE_KEY = 'dsh-sidebar-fold:folded'
    const STYLE_ID = 'dsh-sidebar-fold-style'
    const ENDPOINT = new URL('api/dsh-sidebar-fold-zxp', document.baseURI).pathname

    const DICT = {
      // Not "插件": the sidebar already has a shipped row with exactly that
      // name, and two rows called the same thing next to each other read as a
      // bug. This row lists the entries, so it is named for what it holds.
      zh: { row: '插件列表', hint: '展开 / 收起插件入口', ungrouped: '未分组', empty: '还没有分组' },
      en: { row: 'Plugin list', hint: 'Fold or unfold the plugin entries', ungrouped: 'Ungrouped', empty: 'No groups yet' },
    }

    /**
     * The shell does not hand a client plugin its locale, so read it where it
     * is visible and fall back to the browser's own preference.
     */
    function localeOf(ctx) {
      try {
        const raw = ctx?.locale?.current;
        if (typeof raw === 'string' && raw !== '') return raw.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      } catch { /* fall through */ }
      try {
        if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) return 'zh';
      } catch { /* fall through */ }
      return 'en';
    }

    function translator(lang) {
      const table = DICT[lang] ?? DICT.en;
      return key => table[key] ?? key;
    }

    // ── host calls ───────────────────────────────────────────────────────────

    async function request(path, init) {
      try {
        const response = await fetch(`${ENDPOINT}${path}`, {
          cache: 'no-store',
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }

    /** Ask the host to turn its configuration into an order/hide list. */
    async function loadPlan(entryIds) {
      const body = await request('/plan', { method: 'POST', body: JSON.stringify({ entryIds }) });
      return body !== null && Array.isArray(body.rows) ? body : null;
    }

    async function loadSettings() {
      const body = await request('/settings');
      return body !== null && body.settings ? body.settings : null;
    }

    async function saveSettings(next) {
      const body = await request('/settings', { method: 'PUT', body: JSON.stringify(next) });
      return body !== null && body.settings ? body.settings : null;
    }

    // ── the fold flag ────────────────────────────────────────────────────────

    /** Folded until told otherwise: the plugin exists to give the height back. */
    function readFolded() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw === null ? true : raw === 'true';
      } catch {
        return true;
      }
    }

    function writeFolded(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
      } catch { /* private mode: the fold still works for this page */ }
    }

    // ── the DOM, anchored on our own row ─────────────────────────────────────

    function navOf(node) {
      return node?.closest ? node.closest('nav') : null;
    }

    function rowOf(node) {
      return node?.closest ? node.closest('button') : null;
    }

    function isOurs(el) {
      return el.hasAttribute('data-fold-header') || el.hasAttribute('data-fold-row');
    }

    /** Real panel rows, in the shell's own order. */
    function panelRows(nav) {
      if (nav === null) return [];
      return [...nav.querySelectorAll(':scope > button')].filter(el => !isOurs(el));
    }

    function activeRow(nav) {
      if (nav === null) return null;
      return nav.querySelector(':scope > button[aria-current="page"]');
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
      const want = shown ? '' : 'none';
      if (el.style.display !== want) el.style.display = want;
      if (shown) { if (el.hasAttribute('aria-hidden')) el.removeAttribute('aria-hidden'); }
      else if (el.getAttribute('aria-hidden') !== 'true') el.setAttribute('aria-hidden', 'true');
    }

    /**
     * Apply one plan: order numbers on the rows, our own headers in between.
     *
     * `order` and nothing else, because the shell owns these elements — moving a
     * node is undone by its next render, while a CSS order number is invisible
     * to React and survives it.
     */
    function applyPlan(node, folded, plan, rowById, onHeaderClick) {
      const nav = navOf(node);
      const selfRow = rowOf(node);
      if (nav === null) return;

      nav.style.display = 'flex';
      nav.style.flexDirection = 'column';

      const rows = panelRows(nav).filter(el => el !== selfRow);
      for (const el of nav.querySelectorAll(':scope > [data-fold-header]')) el.remove();

      // The toggle itself always sits first, whatever order the plan gives the
      // entries below it.
      if (selfRow !== null) selfRow.style.order = '-99999';

      if (plan !== null) {
        const kept = activeRow(nav);
        for (const entry of plan.rows) {
          const el = rowById.get(entry.id);
          if (el === undefined) continue;
          el.style.order = String(entry.order);
          // The panel the user is looking at stays visible even inside a
          // collapsed group, or they lose track of where they are.
          const hide = (folded || entry.hidden) && el !== kept;
          setShown(el, !hide);
        }
        for (const group of plan.groups) {
          if (group.implicit) continue;
          const header = makeHeader(group, folded ? false : group.collapsed, onHeaderClick);
          header.style.order = String(group.order);
          nav.appendChild(header);
        }
      }

      // Nothing configured yet: fall back to the plain fold, so the plugin still
      // does its original job on a fresh install or when the host is unreachable.
      if (plan === null || folded) {
        const kept = activeRow(nav);
        for (const el of rows) setShown(el, !(folded && el !== kept));
      }
    }

    function makeHeader(group, collapsed, onClick) {
      const header = document.createElement('button');
      header.type = 'button';
      header.setAttribute('data-fold-header', group.id);
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      header.className = 'dsh-fold-header';
      const chevron = document.createElement('span');
      chevron.className = 'dsh-fold-header-chevron';
      chevron.textContent = collapsed ? '▸' : '▾';
      const name = document.createElement('span');
      name.className = 'dsh-fold-header-name';
      name.textContent = group.name;
      const count = document.createElement('span');
      count.className = 'dsh-fold-header-count';
      count.textContent = String(group.count);
      header.append(chevron, name, count);
      // Capture phase: the shell's own row handler must never see this click.
      header.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClick(group);
      }, true);
      return header;
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
        style: { transform: folded ? 'rotate(-90deg)' : 'none', transition: 'transform 140ms ease' },
      }, React.createElement('path', { d: 'M4 6.5 8 10.5 12 6.5' }));
    }

    function FoldRow({ t, ctx }) {
      const nodeRef = React.useRef(null);
      const [folded, setFolded] = React.useState(readFolded);
      const foldedRef = React.useRef(folded);
      foldedRef.current = folded;
      const [plan, setPlan] = React.useState(null);
      const planRef = React.useRef(plan);
      planRef.current = plan;
      const settingsRef = React.useRef(null);

      /** Panel entry ids, in the shell's order, from the slot registry itself. */
      const entryIds = React.useCallback(() => {
        try {
          const entries = ctx.slots.entriesOfSlot('sidebar.panellist');
          return entries
            .map(entry => entry?.options?.id)
            .filter(id => typeof id === 'string' && id !== '');
        } catch {
          return [];
        }
      }, [ctx]);

      /** Map a plan id to the DOM row it refers to: same order, minus our own. */
      const rowMap = React.useCallback(ids => {
        const nav = navOf(nodeRef.current);
        const selfRow = rowOf(nodeRef.current);
        const map = new Map();
        if (nav === null) return map;
        const rows = panelRows(nav).filter(el => el !== selfRow);
        // `ids` comes from the registry and includes our own entry; the rows we
        // just collected exclude it. Comparing the two without that correction
        // made every count mismatch, so no ordering was ever applied.
        const others = ids.filter(id => id !== 'sidebar-fold');
        // The registry order and the DOM order agree because the shell maps one
        // to the other; if they ever disagree, do nothing rather than shuffle
        // the wrong rows.
        if (rows.length !== others.length) return map;
        others.forEach((id, index) => { map.set(id, rows[index]); });
        return map;
      }, []);

      const refresh = React.useCallback(async () => {
        if (settingsRef.current === null) settingsRef.current = await loadSettings();
        const ids = entryIds();
        const next = await loadPlan(ids);
        if (next !== null) setPlan(next);
      }, [entryIds]);

      const toggleGroup = React.useCallback(async group => {
        const current = settingsRef.current ?? (await loadSettings());
        if (current === null) return;
        const groups = (current.groups ?? []).map(entry => (
          entry.id === group.id ? { ...entry, collapsed: !entry.collapsed } : entry
        ));
        const saved = await saveSettings({ ...current, groups });
        if (saved === null) return;
        settingsRef.current = saved;
        const ids = entryIds();
        const next = await loadPlan(ids);
        if (next !== null) setPlan(next);
      }, [entryIds]);

      // The shell wraps our glyph in its own `<button>`, whose click handler
      // calls `selectPanel(ourId)`. This plugin has no panel, so the click must
      // not reach it. A capture-phase listener on that row also covers Enter and
      // Space, which fire a click on the button itself rather than on the glyph.
      React.useEffect(() => {
        const row = rowOf(nodeRef.current);
        if (row === null) return undefined;
        row.setAttribute('data-fold-row', '');
        const onClick = event => {
          event.preventDefault();
          event.stopPropagation();
          const next = !foldedRef.current;
          foldedRef.current = next;
          writeFolded(next);
          setFolded(next);
        };
        row.addEventListener('click', onClick, true);
        return () => row.removeEventListener('click', onClick, true);
      }, []);

      // Load once, then keep the plan in step with the entries that exist.
      React.useEffect(() => {
        let alive = true;
        void (async () => {
          const ids = entryIds();
          settingsRef.current = await loadSettings();
          const next = await loadPlan(ids);
          if (alive && next !== null) setPlan(next);
        })();
        return () => { alive = false; };
      }, [entryIds]);

      React.useEffect(() => {
        const node = nodeRef.current;
        const map = rowMap(entryIds());
        applyPlan(node, folded, planRef.current, map, group => { void toggleGroup(group); });
        const nav = navOf(node);
        if (nav === null) return undefined;
        // Entries appearing or disappearing, a group header removed by the
        // shell's next render, or the open panel changing — all of them mean the
        // layout has to be recomputed. Only these mutations are watched, so our
        // own style writes cannot feed the observer back into a loop.
        const observer = new MutationObserver(mutations => {
          const structural = mutations.some(record => (
            record.type === 'attributes'
              ? record.attributeName === 'aria-current'
              : [...record.addedNodes, ...record.removedNodes].some(node => (
                node.nodeType === 1 && !isOurs(node)
              ))
          ));
          if (structural) void refresh();
        });
        observer.observe(nav, { childList: true, attributes: true, attributeFilter: ['aria-current'] });
        return () => observer.disconnect();
      }, [folded, plan, entryIds, rowMap, refresh, toggleGroup]);

      // Hand the sidebar back untouched when this plugin goes away.
      React.useEffect(() => () => {
        const nav = navOf(nodeRef.current);
        const self = rowOf(nodeRef.current);
        if (nav !== null) {
          for (const el of nav.querySelectorAll(':scope > [data-fold-header]')) el.remove();
          for (const el of panelRows(nav)) {
            setShown(el, true);
            el.style.order = '';
          }
          nav.style.display = '';
          nav.style.flexDirection = '';
        }
        if (self !== null) {
          self.style.order = '';
          self.removeAttribute('data-fold-row');
        }
      }, []);

      return React.createElement('span', {
        ref: nodeRef,
        className: 'dsh-fold-glyph',
        'data-folded': folded ? 'true' : 'false',
        title: t('hint'),
      }, React.createElement(Chevron, { folded }));
    }

    function injectStyles() {
      if (document.getElementById(STYLE_ID) !== null) return () => {};
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .dsh-fold-glyph {
          display: inline-flex; align-items: center; justify-content: center;
          width: 100%; height: 100%;
          color: inherit; opacity: .72;
          transition: opacity 120ms ease;
        }
        .dsh-fold-glyph:hover { opacity: 1; }
        .dsh-fold-glyph[data-folded="true"] { opacity: .92; }

        /* A section label, not a copy of a panel row: this is the shell's own
           idiom for grouping (see the 工作区 heading), and it cannot drift out of
           step with the row metrics it does not pretend to share. */
        .dsh-fold-header {
          display: flex; align-items: center; gap: 6px;
          width: 100%; box-sizing: border-box;
          padding: 10px 12px 4px;
          border: 0; background: none; cursor: pointer;
          font: inherit; font-size: 10.5px; line-height: 1.2;
          letter-spacing: .02em; text-align: left;
          color: inherit; opacity: .5;
        }
        .dsh-fold-header:hover { opacity: .85; }
        .dsh-fold-header-chevron { font-size: 9px; width: 8px; }
        .dsh-fold-header-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dsh-fold-header-count { margin-left: auto; font-variant-numeric: tabular-nums; opacity: .7; }
      `;
      document.head.appendChild(style);
      return () => { style.remove(); };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const t = translator(localeOf(ctx));
        const removeStyles = injectStyles();

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'sidebar-fold',
          // First among every entry, not merely first among the shipped ones.
          // Plugins pick their own order and the useful ones land near the top
          // (the workbench registers -4), so a modest -1 leaves the toggle
          // sitting *below* rows it is supposed to fold — the group then reads
          // as if the entry above it were not part of the list.
          order: -1000,
          label: () => t('row'),
        }, props => React.createElement(FoldRow, { ...props, t, ctx })));

        return removeStyles;
      },
    };
  },
});
