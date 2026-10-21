import React, { useEffect, useState } from 'react';
import changes from '../changes.json';
import { APP_VERSION, BUILD_NUMBER } from '../buildInfo.js';
import './WhatsNew.css';

/**
 * WHAT CHANGED, ON EVERY FRESH OPEN, FOR EVERYONE.
 *
 * Chris, 2026-10-21: "when changes are made to phone app when i open the app
 * fresh it needs to list all changes everytime for everyone".
 *
 * So this is deliberately NOT the usual release-notes popup that remembers it
 * has been seen and never comes back. There is no "seen" flag, no version
 * check, no localStorage: open the app, read what changed, carry on. It shows
 * once per launch, not once per version, and the same list reaches every
 * person on every build.
 *
 * The list is src/changes.json, rebuilt from the git history by
 * scripts/gen-changes.mjs on every `npm run build` and `npm run build:web`, so
 * what a build shows is always what went into that build. The generator keeps
 * only commits that touched shipping code, because a change list padded with
 * build-counter bumps is one nobody reads twice.
 *
 * "Fresh open" means a launch, not a re-render. The component mounts once with
 * the app, so returning from the background does not throw it back up — a PWA
 * that interrupts you every time you switch apps is a PWA people delete.
 */
export default function WhatsNew() {
  const [open, setOpen] = useState(true);

  // Escape closes it, same as the button. A screen with no way out on a
  // keyboard is a trap for anyone not using a touchscreen.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const days = changes?.days || [];
  if (!open || !days.length) return null;

  return (
    <div className="wnew" role="dialog" aria-modal="true" aria-label="What changed">
      <div className="wnew-head">
        <h1>What&rsquo;s new</h1>
        <p className="wnew-sub">
          Lyricist Pro {APP_VERSION} &middot; build {BUILD_NUMBER} &middot; {changes.total} changes
        </p>
      </div>

      <div className="wnew-list">
        <div className="wnew-inner">
          {days.map((day) => (
            <div className="wnew-day" key={day.date}>
              <p className="wnew-date">{day.date}</p>
              <ul className="wnew-items">
                {day.items.map((text, i) => (
                  <li key={`${day.date}-${i}`}>{text}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="wnew-foot">
        <button type="button" className="wnew-go" onClick={() => setOpen(false)} autoFocus>
          Start writing
        </button>
      </div>
    </div>
  );
}
