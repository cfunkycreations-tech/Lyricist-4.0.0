import React, { useCallback, useEffect, useState } from 'react';
import qr from './phone-qr.svg';
import './PhoneInvite.css';

/**
 * PUT IT ON YOUR PHONE. THE FIRST THING A COMPUTER USER SEES.
 *
 * Chris, 2026-10-20, after a customer finished the install on her computer and
 * had no idea the phone was part of the purchase: "It should've been the first
 * fucking thing that she saw was how to give it on her phone."
 *
 * Desktop app only (window.lyricistAPI). It opens by itself once per computer,
 * the first time the app is open and unlocked after this update, which also
 * reaches everyone who bought before it existed. The Phone button in the header
 * opens it again any time (App.jsx dispatches OPEN_EVENT). The phone itself
 * never shows this: it is already there.
 *
 * The creator build never pops it up on its own.
 */

export const OPEN_EVENT = 'lyricist:phone-invite';
export const PHONE_URL = 'https://lyricist-pro.pages.dev';
const SEEN = 'lyricist.phoneInvite.seen';

const onDesktop = () => typeof window !== 'undefined' && !!window.lyricistAPI;

function seenBefore() {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(SEEN, '1'); } catch { /* private mode: shows again next launch */ }
}

export default function PhoneInvite() {
  const desk = onDesktop();
  const [open, setOpen] = useState(() => desk
    && import.meta.env.VITE_FAFO_INTERNAL_BUILD !== 'true'
    && !seenBefore());
  const [copied, setCopied] = useState(false);

  const close = useCallback(() => { markSeen(); setOpen(false); }, []);

  useEffect(() => {
    if (!desk) return undefined;
    const show = () => { setCopied(false); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, [desk]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!desk || !open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PHONE_URL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pinv" role="dialog" aria-modal="true" aria-labelledby="pinv-title">
      <div className="pinv-card">
        <h1 id="pinv-title">Put it on your phone</h1>
        <p className="pinv-lede">
          Your purchase includes the phone version. Scan this with your phone's camera, or type the link.
        </p>

        <img className="pinv-qr" src={qr} alt="QR code for lyricist-pro.pages.dev" width="188" height="188" />
        <p className="pinv-url">lyricist-pro.pages.dev</p>
        <button type="button" className="pinv-copy" onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>

        <div className="pinv-steps">
          <section>
            <h2>Android</h2>
            <ol>
              <li>Open the link in <b>Chrome</b>.</li>
              <li>Tap <b>⋮</b>, then <b>Install app</b>.</li>
              <li>Open it from your home screen.</li>
            </ol>
          </section>
          <section>
            <h2>iPhone</h2>
            <ol>
              <li>Open the link in <b>Safari</b>.</li>
              <li>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</li>
              <li>Open it from your home screen.</li>
            </ol>
          </section>
        </div>

        <p className="pinv-note">
          It asks for your purchase code once. It is the same code as on your computer, in your Gumroad receipt.
          Add your OpenRouter key again in Settings on the phone. Hold the phone sideways.
        </p>

        <button type="button" className="pinv-go" onClick={close}>Got it</button>
        <p className="pinv-again">The Phone button at the top brings this back.</p>
      </div>
    </div>
  );
}
