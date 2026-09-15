import React, { useEffect, useRef, useState } from 'react';
import './mobile.css';
import { Glyph } from '../components/common/Glyph.jsx';

/**
 * THE PHONE NAVIGATION, built from the approved landscape mockups.
 *
 * Replaces the 18-tab strip with:
 *   - a 44px top bar: wordmark + hamburger, or back arrow + tool name
 *   - a HOME LAUNCHER of 18 tiles, six across and three down, which is exactly
 *     18 so there is no dead corner
 *   - a bottom sheet listing all 18, so you can jump tool to tool without
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

function TileIcon({ tab }) {
  if (tab.img) return <img className="mob-tile-ico" src={tab.img} alt="" aria-hidden="true" />;
  return <span className="mob-tile-ico mob-tile-emoji" aria-hidden="true"><Glyph name={tab.icon} size={22} strokeWidth={1.5} /></span>;
}

export default function MobileShell({ tabs, activeTab, onSelect, onWizard }) {
  // null = launcher showing. Otherwise the id of the open tool.
  const [openId, setOpenId] = useState(null);
  const [sheet, setSheet] = useState(false);
  const lastActive = useRef(activeTab);

  /* Keep in step when something ELSE navigates: the wizard, Ghost Rider handing
     off to Songwriter, Quantum Lab sending to Song Forge. Without this the
     launcher would still be covering the screen while a tool switched beneath
     it, which reads as a frozen app. */
  useEffect(() => {
    if (activeTab !== lastActive.current) {
      lastActive.current = activeTab;
      setOpenId(activeTab);
      setSheet(false);
    }
  }, [activeTab]);

  /* Escape closes the sheet, then the tool. Being unable to get out of a screen
     is the fastest way to make an app feel broken. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sheet) setSheet(false);
      else if (openId) setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, openId]);

  /* Tell the document whether a tool is open, so the CSS can give the tab
     content the full height minus the bar. */
  useEffect(() => {
    document.body.classList.toggle('lyricist-mobile-tool', !!openId);
    return () => document.body.classList.remove('lyricist-mobile-tool');
  }, [openId]);

  const open = (id) => {
    lastActive.current = id;
    onSelect(id);
    setOpenId(id);
    setSheet(false);
  };

  const current = tabs.find((t) => t.id === openId);

  return (
    <div className={`mob-root ${openId ? 'is-tool' : ''}`}>
      <header className="mob-bar">
        {openId ? (
          <>
            <button className="mob-icon-btn" onClick={() => setOpenId(null)} aria-label="Back to all tools">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="mob-bar-title">{current ? current.label : ''}</span>
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
            onClick={() => { setSheet(false); onWizard(); }}
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

        <button className="mob-icon-btn" onClick={() => setSheet((v) => !v)} aria-label="All tools">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* THE LAUNCHER. Hidden rather than unmounted while a tool is open, so
          coming home is instant and never re-fetches its 18 icons. */}
      <div className={`mob-home ${openId ? 'is-hidden' : ''}`}>
        <div className="mob-grid">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`mob-tile ${activeTab === t.id ? 'is-active' : ''}`}
              onClick={() => open(t.id)}
            >
              <TileIcon tab={t} />
              <span className="mob-tile-text">
                <span className="mob-tile-name">{t.label}</span>
                <span className="mob-tile-sub">{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mob-support">
          {/* Spelled out on the launcher too. The icon in the bar is for people
              who already know what it is; this is for the person who has just
              opened the app for the first time and needs telling. */}
          {onWizard && (
            <button className="mob-pill mob-pill-tour" onClick={onWizard}>
              Take the tour
            </button>
          )}
          {/* The three payment links that used to sit here are gone with the
              rest of the donationware. What is left is the same status deck the
              desktop footer carries, folded onto one line. */}
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
          <div className="mob-scrim" onClick={() => setSheet(false)} />
          <div className="mob-sheet" role="dialog" aria-label="All tools">
            <div className="mob-sheet-grip" />
            <div className="mob-sheet-list">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={`mob-sheet-row ${activeTab === t.id ? 'is-active' : ''}`}
                  onClick={() => open(t.id)}
                >
                  <TileIcon tab={t} />
                  <span className="mob-tile-text">
                    <span className="mob-tile-name">{t.label}</span>
                    <span className="mob-tile-sub">{t.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
