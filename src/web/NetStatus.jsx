import React, { useEffect, useState } from 'react';
import { isUpdateReady, UPDATE_READY_EVENT } from './registerPWA.js';
import './NetStatus.css';

/**
 * TWO THINGS A PHONE USER CAN'T SEE FOR THEMSELVES.
 *
 * 1. A new version is out. The installed app can stay open for days on the
 *    build it opened with; registerPWA notices when the server has a newer one
 *    and this offers a Reload. Never automatic: they may be mid-song.
 * 2. The signal dropped. Without this, an AI tool just spins and then fails,
 *    and it looks like the app is broken. Saying so up front, and saying when
 *    it is back, is the whole fix.
 *
 * Web build only, same rule as registerPWA: the desktop app renders nothing.
 */
const isWeb = () => typeof window !== 'undefined'
  && /^https?:$/.test(window.location.protocol)
  && !window.lyricistAPI;

export default function NetStatus() {
  const [web] = useState(isWeb);
  const [update, setUpdate] = useState(isUpdateReady);
  const [offline, setOffline] = useState(() => web && navigator.onLine === false);
  const [back, setBack] = useState(false);

  useEffect(() => {
    if (!web) return undefined;
    let t = null;
    const onUpdate = () => setUpdate(true);
    const onOff = () => { clearTimeout(t); setBack(false); setOffline(true); };
    const onOn = () => {
      setOffline((was) => {
        if (was) { setBack(true); clearTimeout(t); t = setTimeout(() => setBack(false), 3000); }
        return false;
      });
    };
    window.addEventListener(UPDATE_READY_EVENT, onUpdate);
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onOn);
    return () => {
      clearTimeout(t);
      window.removeEventListener(UPDATE_READY_EVENT, onUpdate);
      window.removeEventListener('offline', onOff);
      window.removeEventListener('online', onOn);
    };
  }, [web]);

  if (!web) return null;
  return (
    <div className="net-stack" aria-live="polite">
      {offline && (
        <div className="net-pill net-off" role="status">
          No signal. Your writing is safe; AI tools will work again when you're back online.
        </div>
      )}
      {back && <div className="net-pill net-on" role="status">Back online.</div>}
      {update && (
        <div className="net-pill net-update" role="status">
          <span>A new version of Lyricist is ready.</span>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
          <button type="button" className="net-later" aria-label="Later" onClick={() => setUpdate(false)}>Later</button>
        </div>
      )}
    </div>
  );
}
