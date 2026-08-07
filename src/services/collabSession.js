/**
 * Collaboration — peer to peer, joined with a code. Lyricist 4.2.0
 *
 * Two people write the same song at the same time. That is the whole feature,
 * and it had to work the way busking works: you show up, you play, nobody signs
 * anything. So:
 *
 *   - No account. No login. No email.
 *   - No server holding the song. The words go straight between the two
 *     machines over WebRTC; there is nothing in the middle to read them, and
 *     nothing to keep paying for.
 *   - A signalling server is used ONLY to introduce the peers — it swaps
 *     "here is how to reach me" and then gets out of the way. It never sees the
 *     song, and it never sees the room code either (see below).
 *   - Free, permanently. yjs and y-webrtc are MIT.
 *
 * WHAT THE SIGNALLING SERVER ACTUALLY SEES
 * The room code is never sent. The room is identified by the SHA-256 of the
 * code, and the code itself is used as the encryption password for the room, so
 * the traffic passing through signalling is ciphertext. Somebody watching the
 * signalling server sees an opaque room id and encrypted blobs. To join they
 * would have to guess the code — 32^12 of them.
 *
 * IF THE SIGNALLING SERVERS DIE
 * They are free and public, so one day they will. Of the three that used to be
 * standard, two are already gone: signaling.yjs.dev does not even resolve any
 * more and the heroku one 404s. That is why the list below is short, why the
 * app lets a user paste their own, and why `checkSignaling` exists — when this
 * breaks it has to say so out loud instead of just never connecting.
 */
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

/** Verified reachable 2026-08-07. Both are y-webrtc's own public servers. */
export const DEFAULT_SIGNALING = [
  'wss://y-webrtc.fly.dev',
  'wss://y-webrtc-eu.fly.dev',
];

const SIGNALING_KEY = 'lyricist.collab.signaling';

export function getSignalingUrls() {
  try {
    const raw = localStorage.getItem(SIGNALING_KEY);
    if (!raw) return DEFAULT_SIGNALING;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length ? list : DEFAULT_SIGNALING;
  } catch {
    return DEFAULT_SIGNALING;
  }
}

export function setSignalingUrls(list) {
  try {
    if (!list || !list.length) localStorage.removeItem(SIGNALING_KEY);
    else localStorage.setItem(SIGNALING_KEY, JSON.stringify(list));
  } catch { /* private mode — defaults still work */ }
}

/* ── Room codes ─────────────────────────────────────────────────────────
   No I, O, 0 or 1: these get read down a phone and written on the back of a
   receipt, so characters that look like each other are not in the alphabet. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/** Accept whatever they typed — spaces, lower case, missing dashes — and tidy it. */
export function normalizeCode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/[IO]/g, (c) => (c === 'I' ? '1' : '0'))       // common mis-types...
    .replace(/[01]/g, (c) => (c === '1' ? 'J' : 'Q'));      // ...mapped back in
  const out = clean.slice(0, 12);
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

export const isCompleteCode = (code) => /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(String(code || ''));

/** Room id the signalling server sees — the code itself never leaves this machine. */
async function roomIdFromCode(code) {
  const data = new TextEncoder().encode(`lyricist-collab:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── Session ───────────────────────────────────────────────────────────── */

const NAME_COLORS = ['#10f0a0', '#00e5ff', '#a855f7', '#ff6f00', '#ff00aa', '#c026ff'];

/**
 * Rooms this window already has open.
 *
 * y-webrtc allows a room name only once per page and throws if you ask twice —
 * but it throws from inside an async key derivation in the provider's
 * constructor, so it lands as an unhandled rejection that no caller can catch,
 * and the half-built provider then throws AGAIN on destroy ("Cannot read
 * properties of null"). Leaving a session and rejoining the same code is an
 * obvious thing to do, so this is caught here where it can still be reported.
 */
const activeRooms = new Set();

/**
 * Join (or start — same thing) the room for `code`.
 *
 * Returns a handle with the shared lyric text, who else is here, and a
 * `destroy()` that actually tears the connection down.
 */
export async function joinRoom({ code, displayName = 'Writer', onChange = () => {} }) {
  const roomId = await roomIdFromCode(code);
  const roomName = `lyricist-${roomId}`;
  if (activeRooms.has(roomName)) {
    throw new Error('You are already in that session in this window. Leave it first, or use a different code.');
  }
  const doc = new Y.Doc();

  const provider = new WebrtcProvider(roomName, doc, {
    signaling: getSignalingUrls(),
    // The code doubles as the room password, so everything crossing the
    // signalling server is encrypted with a key only the people holding the
    // code have.
    password: code,
    maxConns: 12,
    filterBcConns: false,
    peerOpts: {
      config: {
        // Free public STUN, for working out each machine's address behind its
        // router. No TURN: a relay would mean somebody else's server carrying
        // the audio of the song, and a bill.
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    },
  });

  const text = doc.getText('lyrics');
  const title = doc.getText('title');

  const colorIndex = Math.floor(Math.random() * NAME_COLORS.length);
  provider.awareness.setLocalStateField('user', {
    name: displayName || 'Writer',
    color: NAME_COLORS[colorIndex],
  });

  const session = {
    code,
    doc,
    provider,
    text,
    title,
    awareness: provider.awareness,
    /** Everyone in the room right now, including you. */
    peers() {
      const out = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if (state?.user) out.push({ ...state.user, clientId, isYou: clientId === doc.clientID });
      });
      return out;
    },
    /** Did we reach a signalling server at all? Distinguishes "nobody has
     *  joined yet" from "this could never have worked". */
    get signalingConnected() {
      return [...(provider.signalingConns || [])].some((c) => c.connected);
    },
    get peerCount() {
      return provider.room ? provider.room.webrtcConns.size : 0;
    },
    destroy() {
      activeRooms.delete(roomName);
      try { provider.awareness.setLocalState(null); } catch { /* already gone */ }
      try { provider.disconnect(); } catch { /* never connected */ }
      try { provider.destroy(); } catch { /* half-built provider */ }
      try { doc.destroy(); } catch { /* already gone */ }
    },
  };

  activeRooms.add(roomName);

  const emit = () => onChange(session);
  provider.awareness.on('change', emit);
  provider.on('status', emit);
  provider.on('peers', emit);
  text.observe(emit);
  title.observe(emit);
  // Signalling sockets connect a moment after construction; report it when it lands.
  const settle = setInterval(emit, 1000);
  const originalDestroy = session.destroy;
  session.destroy = () => { clearInterval(settle); originalDestroy(); };

  return session;
}

/**
 * Can we reach a signalling server at all?
 *
 * Worth its own check: without one, two people can never find each other, and
 * the failure otherwise looks identical to "your friend hasn't joined yet".
 */
export function checkSignaling(urls = getSignalingUrls(), timeoutMs = 6000) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    let ws;
    const done = (ok) => { try { ws && ws.close(); } catch { /* noop */ } resolve({ url, ok }); };
    const timer = setTimeout(() => done(false), timeoutMs);
    try {
      ws = new WebSocket(url);
      ws.onopen = () => { clearTimeout(timer); done(true); };
      ws.onerror = () => { clearTimeout(timer); done(false); };
    } catch {
      clearTimeout(timer);
      done(false);
    }
  })));
}

/**
 * Keep a plain <textarea> and a Y.Text in step.
 *
 * Replacing the whole string on every keystroke would wipe out whatever the
 * other person was typing at that moment, so only the part that actually
 * changed is sent: match the common start and end, and splice the middle.
 */
export function applyLocalEdit(ytext, nextValue) {
  const prev = ytext.toString();
  if (prev === nextValue) return;

  let start = 0;
  const max = Math.min(prev.length, nextValue.length);
  while (start < max && prev[start] === nextValue[start]) start++;

  let endPrev = prev.length;
  let endNext = nextValue.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === nextValue[endNext - 1]) {
    endPrev--; endNext--;
  }

  ytext.doc.transact(() => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, nextValue.slice(start, endNext));
  });
}
