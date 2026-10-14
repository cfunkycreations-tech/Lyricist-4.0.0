import React, { useEffect, useState } from 'react';
import logo from '../assets/brand-logo.webp';
import './PurchaseLock.css';

/**
 * THE PHONE AND THE WINDOWS APP ASK FOR THE PURCHASE CODE ONCE.
 *
 * Chris, 2026-10-12: the phone link was public and free, and he said "Of
 * course, lock it behind a fucking pay code." The code is the license key in
 * the buyer's Gumroad receipt. On the phone functions/api/unlock.js checks it
 * with Gumroad; in the Windows app licenseCheck.js does, from the main process.
 *
 * The Windows customer build asks too: its installer was a public download.
 * The creator build (VITE_FAFO_INTERNAL_BUILD) and the dev server never ask,
 * so recording and testing are untouched.
 *
 * Unlocked stays unlocked: the code is kept under its own key, which
 * freshStart.js does not wipe and which is not lyricistConfig (where the API
 * keys live). Every week, when online, it is checked again quietly; only a
 * definite no from Gumroad (refunded, charged back, not a real code) locks the
 * phone again. No signal, or Gumroad down, never does.
 *
 * It stops the link being passed around. Someone who knows their way around a
 * browser could still get past it; that is the trade for a $19.99 app that
 * works offline.
 */

const STORE = 'lyricist.unlock';
const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const BUY_URL = 'https://gumroad.com/l/pzglwj';

const isPhoneBuild = () => typeof window !== 'undefined'
  && !import.meta.env.DEV
  && /^https?:$/.test(window.location.protocol)
  && !window.lyricistAPI;

// The Windows customer build. licenseCheck.js keeps the code; this side only
// ever learns yes or no.
const desktopLicense = () => (typeof window !== 'undefined'
  && !import.meta.env.DEV
  && import.meta.env.VITE_FAFO_INTERNAL_BUILD !== 'true'
  && window.lyricistAPI?.license) || null;

function readSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || 'null');
    return v && typeof v.code === 'string' && v.code ? v : null;
  } catch { return null; }
}
function save(v) {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode: asks again next time */ }
}
function forget() {
  try { localStorage.removeItem(STORE); } catch { /* nothing to forget */ }
}

async function ask(code, recheck) {
  const r = await fetch('/api/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, recheck }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: data.ok === true, why: data.why || '', revoked: data.revoked === true };
}

export default function PurchaseLock({ children }) {
  const [desk] = useState(desktopLicense);
  const gated = !!desk || isPhoneBuild();
  const [open, setOpen] = useState(() => !gated || (desk ? desk.unlocked() : !!readSaved()));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');

  // The weekly quiet re-check, for a phone or PC that is already unlocked.
  useEffect(() => {
    if (!gated) return;
    if (desk) {
      if (!desk.unlocked() || navigator.onLine === false) return;
      desk.recheck()
        .then((r) => { if (r && r.revoked) { setWhy(r.why || ''); setOpen(false); } })
        .catch(() => { /* stay unlocked */ });
      return;
    }
    const saved = readSaved();
    if (!saved || Date.now() - (saved.checked || 0) < RECHECK_MS || navigator.onLine === false) return;
    ask(saved.code, true)
      .then((r) => {
        if (r.ok) save({ ...saved, checked: Date.now() });
        else if (r.revoked) { forget(); setWhy(r.why); setOpen(false); }
      })
      .catch(() => { /* offline or Gumroad down: stay unlocked */ });
  }, [gated, desk]);

  if (open) return children;

  const unlock = async (e) => {
    e.preventDefault();
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    setWhy('');
    try {
      const r = desk ? await desk.verify(c) : await ask(c, false);
      if (r.ok) {
        if (!desk) save({ code: c, at: Date.now(), checked: Date.now() });
        setOpen(true);
      } else {
        setWhy(r.why || 'That code did not work. Copy it straight from your receipt.');
      }
    } catch {
      setWhy('No connection. Unlocking needs the internet once; after that it works offline.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plock">
      <form className="plock-card" onSubmit={unlock}>
        <img className="plock-logo" src={logo} alt="Lyricist Pro" />
        <h1>{desk ? 'Lyricist Pro' : 'Black Hole Studios'}</h1>
        <p className="plock-lede">Enter the purchase code from your Gumroad receipt. Once per {desk ? 'computer' : 'phone'}.</p>
        <input
          className="plock-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
          aria-label="Purchase code"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
        />
        <button className="plock-go" type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        {why && <p className="plock-why" role="alert">{why}</p>}
        <p className="plock-buy">
          No code yet? <a href={BUY_URL} target="_blank" rel="noreferrer">Get Lyricist Pro on Gumroad</a>
        </p>
      </form>
    </div>
  );
}
