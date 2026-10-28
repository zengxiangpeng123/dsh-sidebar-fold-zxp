window.__ModuleLoader__.load({
  id: 'dsh-sidebar-fold-zxp',
  factory(require) {
    const React = require('react');

    const STORAGE_KEY = 'dsh-sidebar-fold:folded';
    const STYLE_ID = 'dsh-sidebar-fold-style';

    const DICT = {
      // Not "插件": the sidebar already has a shipped row with exactly that
      // name, and two rows called the same thing next to each other read as a
      // bug. This row lists the entries, so it is named for what it holds.
      zh: { row: '插件列表', hint: '展开 / 收起插件入口' },
      en: { row: 'Plugin list', hint: 'Fold or unfold the plugin entries' },
    };

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

    /** Our row's siblings — the entries this plugin is allowed to hide. */
    function siblingRows(nav, selfRow) {
      if (nav === null) return [];
      return [...nav.querySelectorAll(':scope > button')].filter(row => row !== selfRow);
    }

    function activeRow(nav) {
      if (nav === null) return null;
      return nav.querySelector(':scope > button[aria-current="page"]');
    }

    /**
     * Hide or show the sibling rows.
     *
     * `style.display` rather than the `hidden` attribute: the rows carry a class
     * that sets `display: flex`, and a class rule beats the user-agent
     * `[hidden] { display: none }` rule — so the attribute alone would look
     * correct in the markup and change nothing on screen.
     *
     * `hidden` collects every row this call hid, so teardown can restore exactly
     * those and touch nothing else.
     */
    function applyFold(node, folded, hidden) {
      const nav = navOf(node);
      const selfRow = rowOf(node);
      if (nav === null) return 0;
      const keep = activeRow(nav);
      let count = 0;
      for (const row of siblingRows(nav, selfRow)) {
        const shouldHide = folded === true && row !== keep;
        if (shouldHide) {
          if (row.style.display !== 'none') row.style.display = 'none';
          if (row.getAttribute('aria-hidden') !== 'true') row.setAttribute('aria-hidden', 'true');
          hidden.add(row);
          count += 1;
          continue;
        }
        // The row that is currently open stays visible: folding must never hide
        // the panel the user is looking at.
        if (row.style.display === 'none') row.style.display = '';
        if (row.hasAttribute('aria-hidden')) row.removeAttribute('aria-hidden');
        hidden.delete(row);
      }
      return count;
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

    function FoldRow({ t }) {
      const nodeRef = React.useRef(null);
      const hiddenRef = React.useRef(new Set());
      const [folded, setFolded] = React.useState(readFolded);
      const foldedRef = React.useRef(folded);
      foldedRef.current = folded;

      // The shell wraps our glyph in its own `<button>`, whose click handler
      // calls `selectPanel(ourId)`. This plugin has no panel, so the click must
      // not reach it. A capture-phase listener on that row also covers Enter and
      // Space, which fire a click on the button itself rather than on the glyph.
      React.useEffect(() => {
        const row = rowOf(nodeRef.current);
        if (row === null) return undefined;
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

      React.useEffect(() => {
        const node = nodeRef.current;
        applyFold(node, folded, hiddenRef.current);
        const nav = navOf(node);
        if (nav === null) return undefined;
        // Re-apply when entries appear or disappear, and when the open panel
        // changes — only `aria-current` is watched, so our own style writes
        // cannot feed the observer back into a loop.
        const observer = new MutationObserver(() => {
          applyFold(nodeRef.current, foldedRef.current, hiddenRef.current);
        });
        observer.observe(nav, { childList: true, attributeFilter: ['aria-current'] });
        return () => observer.disconnect();
      }, [folded]);

      // Hand the sidebar back untouched when this plugin goes away. Restoring
      // from the recorded set is deliberate: it cannot reveal a row somebody
      // else hid.
      React.useEffect(() => () => {
        for (const row of hiddenRef.current) {
          row.style.display = '';
          row.removeAttribute('aria-hidden');
        }
        hiddenRef.current.clear();
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
          // First: the toggle should sit above the entries it folds.
          order: -1,
          label: () => t('row'),
        }, props => React.createElement(FoldRow, { ...props, t })));

        return removeStyles;
      },
    };
  },
});
