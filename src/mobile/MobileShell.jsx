import React, { useEffect, useRef, useState } from 'react';
import './mobile.css';
import { KeyRound } from 'lucide-react';
import { Glyph } from '../components/common/Glyph.jsx';
import { useLyricStore } from '../context/LyricStore.jsx';

/**
 * THE PHONE NAVIGATION, built from the approved landscape mockups.
 *
 * Replaces the tab strip with:
 *   - a 44px top bar: wordmark + hamburger, or back arrow + tool name + the
 *     tool's main button
 *   - a HOME LAUNCHER, the tools grouped by what you are doing, scrolling
 *     down rather than squeezed into one screen
 *   - a bottom sheet listing all of them, so you can jump tool to tool without
 *     going home first
 *
 * WHY A LAUNCHER AND NOT SMALLER TABS: the tab strip measures 3325px wide.
 * Inside a 915px screen that is 3.6 screens of sideways scrolling to reach the
 * fifteenth tool. No amount of CSS fixes that; it needed a different shape.
 *
 * ============================================================================
 * IT IS AN OVERLAY, NOT A WRAPPER, AND THAT IS DELIBERATE.
 * ============================================================================
 * The real tab content stays exactly where it already lives in App.jsx. This
 * paints on top: opaque while the launcher is up, and reduced to just the 44px
 * bar once a tool is open, with the rest transparent and click-through so the
 * tool underneath is fully usable. Wrapping the content instead would have
 * meant restructuring a 900 line component that currently works, to gain
 * nothing.
 *
 * `body.lyricist-mobile` (set by App.jsx) is what hides the desktop header
 * video and tab strip. See mobile.css.
 *
 * This renders ONLY on the phone build. See useMobile.js for the three
 * conditions. The desktop app never sees any of it.
 */

/* THE LAUNCHER, GROUPED BY THE JOB.
   Nineteen equal tiles in one block is a wall: nothing says where to start.
   Grouped, the screen reads top to bottom the way a song gets made. Any tool
   added to App.jsx later and not listed here lands in the last group, so it can
   never go missing. */
const GROUPS = [
  { name: 'Write', ids: ['songwriter', 'analyzer', 'songforge', 'quantum', 'collab', 'scratchpad'] },
  { name: 'Make the music', ids: ['onemanband', 'booth', 'loopstation', 'voicelab', 'midistudio', 'screw', 'stemmer', 'mastering'] },
  { name: 'Find words', ids: ['rhyme', 'thesaurus', 'dictionary'] },
  { name: 'Setup and more', ids: ['settings', 'toolshub'] },
];

/* The tools that cannot do their main job without the OpenRouter key. Same
   list StartHere.jsx gives on desktop. */
const NEEDS_KEY = new Set(['songwriter', 'analyzer', 'songforge', 'quantum', 'voicelab']);

/* THE MAIN BUTTON OF EACH TOOL, IN THE BAR.
   On a 390px-tall screen the button that does the job is usually below the
   fold: Songwriter's Generate sits under the whole setup column. Putting it in
   the bar means it is always in the same place on every tool. Tapping it
   scrolls the real button into view and presses it, so it behaves exactly as
   the tool's own button does, disabled state included. The data-demo hooks are
   shared with the guided demos; never rename them. */
const ACTIONS = {
  songwriter: { hook: 'sw-generate', label: 'Generate' },
  onemanband: { hook: 'omb-make', label: 'Make song' },
  analyzer: { hook: 'gr-analyze', label: 'Analyze' },
  songforge: { hook: 'sf-forge', label: 'Forge' },
  quantum: { hook: 'matrix-autocraft', label: 'Auto-Craft' },
  voicelab: { hook: 'vl-play', label: 'Read it' },
};

function TileIcon({ tab }) {
  if (tab.img) return <img className="mob-tile-ico" src={tab.img} alt="" aria-hidden="true" />;
  return <span className="mob-tile-ico mob-tile-emoji" aria-hidden="true"><Glyph name={tab.icon} size={24} strokeWidth={1.5} /></span>;
}

function groupTabs(tabs) {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const used = new Set();
  const out = GROUPS.map((g) => {
    const items = g.ids.map((id) => byId.get(id)).filter(Boolean);
    items.forEach((t) => used.add(t.id));
    return { name: g.name, items };
  });
  const rest = tabs.filter((t) => !used.has(t.id));
  out[out.length - 1].items.push(...rest);
  return out.filter((g) => g.items.length);
}

/* The visible copy of a hook. Tabs stay mounted once visited, so the same
   data-demo exists in hidden tabs at zero size. */
function findVisible(hook) {
  for (const el of document.querySelectorAll(`[data-demo="${hook}"]`)) {
    if (el.getClientRects().length && el.offsetParent !== null) return el;
  }
  return null;
}

export default function MobileShell({ tabs, activeTab, onSelect, onWizard }) {
  const store = useLyricStore();
  const hasKey = !!String(store.config?.openRouterApiKey || '').trim();

  // null = launcher showing. Otherwise the id of the open tool.
  const [openId, setOpenId] = useState(null);
  const [sheet, setSheet] = useState(false);
  const lastActive = useRef(activeTab);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const openRef = useRef(openId);
  const sheetRef = useRef(sheet);
  openRef.current = openId;
  sheetRef.current = sheet;
  /* Set while the sheet's history entry is being stepped off so a tool picked
     from the sheet can take its place. */
  const pending = useRef(null);

  /* ==========================================================================
     THE PHONE'S BACK BUTTON.
     ==========================================================================
     Without this, Android's back button (and the back swipe) left the app
     entirely from inside any tool, because the app never told the browser it
     had gone anywhere. Now every screen is a history entry: back closes the
     sheet, then the tool, then leaves.

     Each entry carries a snapshot { tool, sheet } and back simply restores
     the one it lands on. The URL never changes: the web build ships a real
     404.html, so a pushed path would 404 on reload. */
  const apply = (s) => {
    const tool = (s && s.tool) || null;
    setSheet(!!(s && s.sheet));
    setOpenId(tool);
    if (tool && tool !== lastActive.current) {
      lastActive.current = tool;
      onSelectRef.current(tool);
    }
  };

  useEffect(() => {
    try { window.history.replaceState({ mob: { tool: null, sheet: false } }, ''); } catch { /* no history */ }
    const onPop = (e) => {
      const s = (e.state && e.state.mob) || { tool: null, sheet: false };
      if (pending.current) {
        const next = { tool: pending.current, sheet: false };
        pending.current = null;
        try {
          if (s.tool) window.history.replaceState({ mob: next }, '');
          else window.history.pushState({ mob: next }, '');
        } catch { /* no history */ }
        apply(next);
        return;
      }
      apply(s);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const currentMob = () => (window.history.state && window.history.state.mob) || null;

  /** Open a tool from anywhere: the launcher, the sheet, or the app itself. */
  const go = (id, { push = false } = {}) => {
    if (sheetRef.current && currentMob()?.sheet) {
      pending.current = id;
      window.history.back();
      return;
    }
    const next = { tool: id, sheet: false };
    try {
      if (openRef.current && !push) window.history.replaceState({ mob: next }, '');
      else window.history.pushState({ mob: next }, '');
    } catch { /* no history */ }
    apply(next);
  };

  const goHome = () => {
    if (currentMob()?.tool) window.history.back();
    else apply({ tool: null, sheet: false });
  };

  const openSheet = () => {
    try { window.history.pushState({ mob: { tool: openRef.current, sheet: true } }, ''); } catch { /* no history */ }
    setSheet(true);
  };

  const closeSheet = () => {
    if (currentMob()?.sheet) window.history.back();
    else setSheet(false);
  };

  /* Keep in step when something ELSE navigates: the wizard, Ghost Rider handing
     off to Songwriter, Quantum Lab sending to Song Forge. Without this the
     launcher would still be covering the screen while a tool switched beneath
     it, which reads as a frozen app. */
  useEffect(() => {
    if (activeTab !== lastActive.current) {
      lastActive.current = activeTab;
      go(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* Escape closes the sheet, then the tool. Being unable to get out of a screen
     is the fastest way to make an app feel broken. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sheet) closeSheet();
      else if (openId) goHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, openId]);

  /* Tell the document whether a tool is open, so the CSS can give the tab
     content the full height minus the bar. */
  useEffect(() => {
    document.body.classList.toggle('lyricist-mobile-tool', !!openId);
    return () => document.body.classList.remove('lyricist-mobile-tool');
  }, [openId]);

  const current = tabs.find((t) => t.id === openId);
  const action = openId ? ACTIONS[openId] : null;
  const actionNeedsKey = !!action && NEEDS_KEY.has(openId) && !hasKey;

  const runAction = () => {
    if (!action) return;
    // Pushed, not swapped, so back returns to the tool once the key is in.
    if (actionNeedsKey) { go('settings', { push: true }); return; }
    const el = findVisible(action.hook);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!el.disabled) setTimeout(() => el.click(), 300);
  };

  const groups = groupTabs(tabs);

  const tile = (t, cls) => (
    <button
      key={t.id}
      className={`${cls} ${activeTab === t.id ? 'is-active' : ''}`}
      onClick={() => go(t.id)}
    >
      <TileIcon tab={t} />
      <span className="mob-tile-text">
        <span className="mob-tile-head">
          <span className="mob-tile-name">{t.label}</span>
          {/* An icon, not the words: at four tiles across, "needs key" cut
              "Songwriter" down to "Songwr...". The banner says what it means. */}
          {!hasKey && NEEDS_KEY.has(t.id) && (
            <span className="mob-tag" role="img" aria-label="needs your AI key" title="Needs your AI key">
              <KeyRound size={12} strokeWidth={2} />
            </span>
          )}
        </span>
        <span className="mob-tile-sub">{t.blurb}</span>
      </span>
    </button>
  );

  return (
    <div className={`mob-root ${openId ? 'is-tool' : ''}`}>
      <header className="mob-bar">
        {openId ? (
          <>
            <button className="mob-icon-btn" onClick={goHome} aria-label="Back to all tools">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="mob-bar-title">{current ? current.label : ''}</span>
            {action && (
              <button className={`mob-go ${actionNeedsKey ? 'is-key' : ''}`} onClick={runAction}>
                {actionNeedsKey ? 'Add key' : action.label}
              </button>
            )}
          </>
        ) : (
          <>
            <span className="mob-wordmark">LYRICIST <b>PRO</b></span>
            <span className="mob-bar-spacer" />
          </>
        )}
        {/* THE GUIDED TOUR, on the phone.

            On desktop this button lives in the header video bar — which the
            phone build hides outright, because a 16:9 title card costs two
            thirds of a 412px screen. Hiding the header took the tour with it,
            and the tour is how a first-time user learns there are eighteen
            tools behind that grid. It comes back here, in the bar, on every
            screen. */}
        {/* Hidden while the guided tour is parked: App.jsx passes onWizard as
            null, so there is nothing behind this button. A control that does
            nothing is worse than an absent one. */}
        {onWizard && (
          <button
            className="mob-icon-btn"
            onClick={() => { closeSheet(); onWizard(); }}
            aria-label="Take the guided tour"
            title="Take the tour"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M9.2 9.2a2.8 2.8 0 1 1 3.6 2.7c-.6.2-.9.7-.9 1.3v.4"
                    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="17" r="1.1" fill="currentColor" />
            </svg>
          </button>
        )}

        <button
          className="mob-icon-btn"
          onClick={() => (sheet ? closeSheet() : openSheet())}
          aria-label={sheet ? 'Close the tool list' : 'All tools'}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* THE LAUNCHER. Hidden rather than unmounted while a tool is open, so
          coming home is instant and never re-fetches its icons. */}
      <div className={`mob-home ${openId ? 'is-hidden' : ''}`}>
        {/* THE KEY, FIRST. The desktop "Start here" card is far too tall for a
            phone and is hidden there, which left the phone with no word at all
            about the one thing the writing tools need. This is that card at
            phone size, and it goes the moment the key is saved. */}
        {!hasKey && (
          <button className="mob-setup" onClick={() => go('settings')}>
            <span className="mob-setup-num" aria-hidden="true">1</span>
            <span className="mob-setup-text">
              <b>Start here: add your free AI key</b>
              <span>
                The writing tools need it, and it takes about two minutes. Tools marked
                {' '}<KeyRound size={12} strokeWidth={2} className="mob-setup-key" aria-label="with a key" />{' '}
                wait on it.
              </span>
            </span>
            <span className="mob-setup-go">Set it up ›</span>
          </button>
        )}

        {groups.map((g) => (
          <section className="mob-group" key={g.name}>
            <h2 className="mob-group-h">{g.name}</h2>
            <div className="mob-grid">{g.items.map((t) => tile(t, 'mob-tile'))}</div>
          </section>
        ))}

        <div className="mob-support">
          {/* Spelled out on the launcher too. The icon in the bar is for people
              who already know what it is; this is for the person who has just
              opened the app for the first time and needs telling. */}
          {onWizard && (
            <button className="mob-pill mob-pill-tour" onClick={onWizard}>
              Take the tour
            </button>
          )}
          <span className="mob-support-line">
            Funk Audio Flow OpSec (FAFO) · Austin, Texas
          </span>
          <span className="mob-support-line">
            Lyricist Pro · Engine: Local/Hybrid · Air-Gapped Safe
          </span>
        </div>
      </div>

      {sheet && (
        <>
          <div className="mob-scrim" onClick={closeSheet} />
          <div className="mob-sheet" role="dialog" aria-label="All tools">
            <div className="mob-sheet-grip" />
            <div className="mob-sheet-list">
              {groups.map((g) => (
                <section className="mob-group" key={g.name}>
                  <h2 className="mob-group-h">{g.name}</h2>
                  <div className="mob-sheet-grid">{g.items.map((t) => tile(t, 'mob-sheet-row'))}</div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
