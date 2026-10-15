import React, { useEffect, useState } from 'react';
import './NetStatus.css';

/**
 * A NEWER LYRICIST PRO IS DOWNLOADED AND WAITING.
 *
 * Desktop only (desktopUpdate.js in the main process). It never restarts on
 * its own: closing the app clears the page, so the bar says the update goes
 * in when they close, and Restart now is theirs to press after saving.
 */
export default function DesktopUpdate() {
  const api = typeof window !== 'undefined' ? window.lyricistAPI?.update : null;
  const [info, setInfo] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!api) return undefined;
    api.state?.().then((s) => { if (s) setInfo(s); }).catch(() => {});
    return api.onReady?.((s) => { setInfo(s); setHidden(false); });
  }, [api]);

  if (!api || !info || hidden) return null;
  return (
    <div className="net-stack" aria-live="polite">
      <div className="net-pill net-update" role="status">
        <span>
          Lyricist Pro {info.version} is ready. It installs when you close the app.
          Save your song before restarting.
        </span>
        <button type="button" onClick={() => api.installNow?.()}>Restart now</button>
        <button type="button" className="net-later" aria-label="Later" onClick={() => setHidden(true)}>Later</button>
      </div>
    </div>
  );
}
