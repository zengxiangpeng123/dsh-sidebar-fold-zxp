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
      zh: {
        row: '插件列表',
        hint: '展开 / 收起插件入口',
        ungrouped: '未分组',
        empty: '还没有分组',
        'set.page': '插件列表',
        'set.intro': '左边的插件入口按这里的顺序与分组显示；把鼠标移到行上可以收起整组。',
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
        'set.noEntries': '还没有任何插件入口',
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
        'set.entriesHint': 'Top to bottom is the sidebar order; the arrows move an entry inside its own group.',
        'set.name': 'New group name',
        'set.add': 'Add group',
        'set.collapsed': 'Collapsed',
        'set.up': 'Move up',
        'set.down': 'Move down',
        'set.remove': 'Remove',
        'set.missing': 'Configured but no longer present',
        'set.prune': 'Clean up',
        'set.saveFailed': 'Save failed; that change did not take effect',
        'set.noEntries': 'No plugin entries yet',
      },
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
      // GET with the ids in the query, not a POST body: this is the shape the
      // desktop shell is known to forward intact.
      const query = encodeURIComponent(entryIds.join(','));
      const body = await request(`/plan?entryIds=${query}`);
      if (body === null || !Array.isArray(body.rows)) {
        console.warn('[sidebar-fold] could not read the layout plan from the host', ENDPOINT);
        return null;
      }
      return body;
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
          // Indent a grouped row so the hierarchy reads at a glance: header, then
          // the rows that belong to it. An ungrouped row keeps the full width, so
          // "not in any group" still looks like the default state rather than a
          // third level.
          el.style.marginInlineStart = entry.ungrouped === true ? '' : '12px';
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
      // Rows that match no entry are not ours to place — but they must not sit in
      // the middle of the list either. The shipped 更多 affordance is one of
      // these: sinking it to the bottom keeps it usable and out of the way, which
      // is the whole of what this plugin should ever do to it.
      const managed = new Set(rowById.values());
      for (const el of rows) {
        if (managed.has(el)) continue;
        el.style.order = '999999';
        el.style.marginInlineStart = '';
        setShown(el, true);
      }

      // Nothing configured yet: fall back to the plain fold, so the plugin still
      // does its original job on a fresh install or when the host is unreachable.
      if (plan === null || folded) {
        const kept = activeRow(nav);
        for (const el of rows) {
          // Rows we do not manage keep their place even when the list folds: the
          // instruction is to leave them alone apart from sinking them.
          if (plan !== null && !managed.has(el)) continue;
          if (plan === null) el.style.marginInlineStart = '';
          setShown(el, !(folded && el !== kept));
        }
      }
    }

    function makeHeader(group, collapsed, onClick) {
      const header = document.createElement('button');
      header.type = 'button';
      header.setAttribute('data-fold-header', group.id);
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      header.className = 'dsh-fold-header';

      // A vector chevron rather than a text triangle: "▸" sits on the text
      // baseline and changes width between fonts, which is exactly what made the
      // first version feel crude next to the panel's own icons.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('width', '12');
      svg.setAttribute('height', '12');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.9');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.className = 'dsh-fold-header-chevron';
      svg.style.transform = collapsed ? 'rotate(-90deg)' : 'none';
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      dot.setAttribute('d', 'M4 6.5 8 10.5 12 6.5');
      svg.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'dsh-fold-header-name';
      name.textContent = group.name;
      const count = document.createElement('span');
      count.className = 'dsh-fold-header-count';
      count.textContent = String(group.count);

      header.append(svg, name, count);
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
      /** Panel entry ids, in the shell's order, from the slot registry itself. */
      const entryIds = React.useCallback(() => {
        return registryEntries(ctx)
          .map(options => options.id)
          // Our own row is not configurable: it is the control, not an entry.
          .filter(id => typeof id === 'string' && id !== '' && id !== 'sidebar-fold');
      }, [ctx]);

      /** Map a plan id to the DOM row it refers to: same order, minus our own. */
      /**
       * Map a plan id to the DOM row it refers to.
       *
       * Matched by `aria-label`, not by position. The nav can contain a row that
       * is not a slot entry at all — a shipped "more" affordance does exactly
       * that — and a positional match then either shifts every row by one or, as
       * the first version did, refuses to match anything and silently skips the
       * whole plan. Rows whose label matches no entry are left alone.
       */
      const rowMap = React.useCallback(ids => {
        const nav = navOf(nodeRef.current);
        const selfRow = rowOf(nodeRef.current);
        const map = new Map();
        if (nav === null) return map;
        const labels = entryLabels(ctx);
        const rows = panelRows(nav).filter(el => el !== selfRow);
        const byLabel = new Map();
        for (const [id, label] of labels) {
          if (!byLabel.has(label)) byLabel.set(label, []);
          byLabel.get(label).push(id);
        }
        for (const row of rows) {
          const label = row.getAttribute('aria-label');
          if (label === null || !byLabel.has(label)) continue;
          const id = byLabel.get(label).shift();
          if (id !== undefined && ids.includes(id)) map.set(id, row);
        }
        return map;
      }, [ctx]);

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
            el.style.marginInlineStart = '';
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

    /** Panel entries as { id → display label }, excluding this plugin's own row. */
    /**
     * The slot registry's own list of entries, whatever the client exposes.
     *
     * The shipped sidebar uses `entriesOfSlot`; other builds name it `entries`,
     * and the item shape differs too (`{options}` vs a flat `{id,label}`). The
     * first version assumed one shape, and in the desktop app it returned
     * nothing — which read as "no entries", so no group ever rendered there. All
     * of them are tried, in order, and each item is flattened.
     */
    function registryEntries(ctx) {
      const api = ctx?.slots;
      for (const name of ['entriesOfSlot', 'entries', 'entriesOf']) {
        try {
          const fn = api?.[name];
          if (typeof fn !== 'function') continue;
          const raw = fn.call(api, 'sidebar.panellist');
          if (Array.isArray(raw)) return raw.map(item => item?.options ?? item ?? {});
        } catch { /* try the next shape */ }
      }
      return [];
    }
    /** Panel entries as { id → display label }, excluding this plugin's own row. */
    function entryLabels(ctx) {
      const map = new Map();
      for (const options of registryEntries(ctx)) {
        const id = options.id;
        if (typeof id !== 'string' || id === '' || id === 'sidebar-fold') continue;
        let label = options.label;
        if (typeof label === 'function') {
          try { label = label(); } catch { label = id; }
        }
        map.set(id, typeof label === 'string' && label !== '' ? label : id);
      }
      return map;
    }

    /**
     * The settings page.
     *
     * It is a form and nothing more: every button posts one operation to the
     * host and renders whatever comes back. The rules for what an operation
     * means live in src/edits.js, where they are tested — this file cannot be.
     */
    function SettingsPage({ ctx, t }) {
      const [settings, setSettings] = React.useState(null);
      const [plan, setPlan] = React.useState(null);
      const [labels, setLabels] = React.useState(() => entryLabels(ctx));
      const [error, setError] = React.useState('');
      const [name, setName] = React.useState('');
      /**
       * The live drag: which entry, and where it would land.
       *
       * Plain pointer events rather than HTML5 drag-and-drop. `draggable` +
       * `dataTransfer` looked correct here and did nothing in the desktop shell,
       * and the same code is unreachable on a touch screen; pointer events are
       * the one model that behaves the same everywhere.
       */
      const [drag, setDrag] = React.useState(null);
      /**
       * What the last attempt actually saw. The settings page is the only place the
       * user can look when the sidebar does nothing, so the counts live there
       * rather than in a console they would have to open.
       */
      const [diag, setDiag] = React.useState('');


      const ids = React.useMemo(() => [...labels.keys()], [labels]);
      const send = React.useCallback(async op => {
        const body = await request('/edit', { method: 'POST', body: JSON.stringify({ entryIds: ids, op }) });
        if (body === null || !body.settings) {
          setError(t('set.saveFailed'));
          return;
        }
        setError('');
        setSettings(body.settings);
        if (body.plan) setPlan(body.plan);
      }, [ids, t]);

      const beginDrag = React.useCallback((event, row) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setDrag({ id: row.id, groupId: null, beforeId: null });

        /** Read the drop target out of whatever is under the pointer. */
        const targetAt = (x, y) => {
          const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
          const rowEl = under?.closest?.('[data-entry-id]');
          if (rowEl !== null && rowEl !== undefined) {
            const id = rowEl.getAttribute('data-entry-id');
            const group = rowEl.getAttribute('data-entry-group');
            if (id !== null && id !== row.id) {
              return { groupId: group === '__ungrouped__' ? null : group, beforeId: id };
            }
          }
          const groupEl = under?.closest?.('[data-group-drop]');
          if (groupEl !== null && groupEl !== undefined) {
            const group = groupEl.getAttribute('data-group-drop');
            return { groupId: group === '__ungrouped__' ? null : group, beforeId: null };
          }
          return null;
        };

        const onMove = moveEvent => {
          const target = targetAt(moveEvent.clientX, moveEvent.clientY);
          setDrag(current => (current === null ? current : {
            id: row.id,
            groupId: target === null ? null : target.groupId,
            beforeId: target === null ? null : target.beforeId,
          }));
        };

        const onUp = upEvent => {
          window.removeEventListener('pointermove', onMove, true);
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', onUp, true);
          setDrag(null);
          const target = targetAt(upEvent.clientX, upEvent.clientY);
          if (target === null) return;
          void send({ op: 'entry.place', entryId: row.id, groupId: target.groupId, beforeId: target.beforeId });
        };

        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
      }, [send]);

      React.useEffect(() => {
        let alive = true;
        void (async () => {
          const found = entryLabels(ctx);
          const ids = [...found.keys()];
          const loaded = await loadSettings();
          const layout = await loadPlan(ids);
          if (!alive) return;
          setLabels(found);
          setDiag(`entries ${ids.length} · rows ${layout === null ? '—' : layout.rows.length} · groups ${layout === null ? '—' : layout.groups.length} · settings ${loaded === null ? 'unreachable' : 'ok'}`);
          setSettings(loaded);
          setPlan(layout);
        })();
        return () => { alive = false; };
      }, [ctx]);


      if (settings === null) {
        return React.createElement('div', { className: 'dsh-fold-set' },
          React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.loading')));
      }

      const groups = Array.isArray(settings.groups) ? settings.groups : [];
      const rows = plan !== null && Array.isArray(plan.rows) ? plan.rows : [];
      const missing = plan !== null && Array.isArray(plan.missing) ? plan.missing : [];

      const groupRow = group => React.createElement('div', { className: 'dsh-fold-set-row', key: group.id },
        React.createElement('input', {
          className: 'dsh-fold-set-input',
          defaultValue: group.name,
          onBlur: event => {
            const value = event.target.value.trim();
            if (value !== '' && value !== group.name) void send({ op: 'group.rename', id: group.id, name: value });
          },
        }),
        React.createElement('label', { className: 'dsh-fold-set-check' },
          React.createElement('input', {
            type: 'checkbox',
            checked: group.collapsed === true,
            onChange: event => { void send({ op: 'group.collapse', id: group.id, collapsed: event.target.checked }); },
          }),
          t('set.collapsed')),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.up'),
          onClick: () => { void send({ op: 'group.move', id: group.id, delta: -1 }); },
        }, '↑'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.down'),
          onClick: () => { void send({ op: 'group.move', id: group.id, delta: 1 }); },
        }, '↓'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.remove'),
          onClick: () => { void send({ op: 'group.remove', id: group.id }); },
        }, '✕'));

      const entryRow = row => React.createElement('div', {
        className: 'dsh-fold-set-row dsh-fold-set-drag',
        key: row.id,
        // The drop target is read back out of these two attributes by
        // elementFromPoint while dragging; they also make a row inert to the
        // browser's own drag handling, which we do not use.
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
        }, labels.get(row.id) ?? row.id),
        React.createElement('select', {
          className: 'dsh-fold-set-select',
          value: row.groupId === '__ungrouped__' ? '' : row.groupId,
          onChange: event => {
            void send({ op: 'entry.assign', entryId: row.id, groupId: event.target.value });
          },
        },
        React.createElement('option', { value: '' }, t('ungrouped')),
        groups.map(group => React.createElement('option', { key: group.id, value: group.id }, group.name))),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.up'),
          onClick: () => { void send({ op: 'entry.move', entryId: row.id, delta: -1 }); },
        }, '↑'),
        React.createElement('button', {
          type: 'button', className: 'dsh-fold-set-button', title: t('set.down'),
          onClick: () => { void send({ op: 'entry.move', entryId: row.id, delta: 1 }); },
        }, '↓'));

      /** One group with its rows; the block itself is a drop target. */
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
      rows.filter(row => row.groupId === group.id).map(entryRow));

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
              if (event.key !== 'Enter' || name.trim() === '') return;
              void send({ op: 'group.add', name: name.trim() });
              setName('');
            },
          }),
          React.createElement('button', {
            type: 'button', className: 'dsh-fold-set-button',
            onClick: () => {
              if (name.trim() === '') return;
              void send({ op: 'group.add', name: name.trim() });
              setName('');
            },
          }, t('set.add'))),

        React.createElement('div', { className: 'dsh-fold-set-legend' }, t('set.entries')),
        React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.entriesHint')),
        rows.length === 0
          ? React.createElement('div', { className: 'dsh-fold-set-hint' }, t('set.noEntries'))
          : (plan.groups ?? []).map(groupBlock),

        missing.length === 0 ? null : React.createElement('div', { className: 'dsh-fold-set-legend' }, t('set.missing')),
        missing.length === 0 ? null : React.createElement('div', { className: 'dsh-fold-set-row' },
          React.createElement('span', { className: 'dsh-fold-set-label' }, missing.join('、')),
          React.createElement('button', {
            type: 'button', className: 'dsh-fold-set-button',
            onClick: () => { void send({ op: 'prune' }); },
          }, t('set.prune'))));
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
           step with row metrics it does not pretend to share.
           The whole line is the hit target — a 12px triangle is a poor thing to
           aim at, especially for anyone using a trackpad. */
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
          background: var(--dsw-alias-fill-l2, rgba(128, 132, 140, .13));
        }
        .dsh-fold-header:focus-visible {
          opacity: 1; outline: 2px solid var(--dsw-alias-border-l1, #4C7DFF); outline-offset: -2px;
        }
        .dsh-fold-header-chevron {
          flex: 0 0 auto;
          transition: transform 140ms ease;
        }
        .dsh-fold-header[aria-expanded="true"] .dsh-fold-header-chevron { transform: none; }
        .dsh-fold-header[aria-expanded="false"] .dsh-fold-header-chevron { transform: rotate(-90deg); }
        .dsh-fold-header-name {
          flex: 1 1 auto; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .dsh-fold-header-count {
          flex: 0 0 auto;
          font-variant-numeric: tabular-nums; opacity: .6;
        }

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
        .dsh-fold-set-row {
          display: flex; align-items: center; gap: 6px;
          padding: 3px 0;
        }
        .dsh-fold-set-input, .dsh-fold-set-select {
          font: inherit; font-size: 11.5px;
          padding: 3px 6px; box-sizing: border-box;
          border: 1px solid var(--dsw-alias-border-l2, rgba(128, 132, 140, .32));
          border-radius: 6px;
          background: var(--dsw-alias-bg-layer-1, Canvas);
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
          border: 1px solid var(--dsw-alias-border-l2, rgba(128, 132, 140, .32));
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
        /* A line where the row would land, so the drop position is visible
           before the pointer is released. */
        .dsh-fold-set-drag[data-drop-target="true"] {
          box-shadow: inset 0 2px 0 0 var(--dsw-alias-border-l1, #4C7DFF);
        }
        .dsh-fold-set-grip {
          flex: 0 0 auto; cursor: grab; opacity: .3;
          font-size: 11px; user-select: none;
          /* Stops the page scrolling while a drag is in progress, which is
             what a touch screen would otherwise do instead. */
          touch-action: none;
        }
        .dsh-fold-set-drag:active .dsh-fold-set-grip { cursor: grabbing; opacity: .9; }
        .dsh-fold-set-group[data-drop-group="true"] {
          background: var(--dsw-alias-fill-l2, rgba(76, 125, 255, .10));
        }
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

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'sidebar-fold-settings',
          order: 37,
          label: () => t('set.page'),
        }, props => React.createElement(SettingsPage, { ...props, ctx, t })));

        return removeStyles;
      },
    };
  },
});



