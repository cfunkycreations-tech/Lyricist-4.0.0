import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Copy, Check, LogOut, Radio, Send, Download, AlertTriangle, RefreshCw } from 'lucide-react';
import TabBackground from '../common/TabBackground.jsx';
import {
  joinRoom, newRoomCode, normalizeCode, isCompleteCode,
  checkSignaling, applyLocalEdit, getSignalingUrls, setSignalingUrls, DEFAULT_SIGNALING,
} from '../../services/collabSession.js';

// Collaboration — Lyricist 4.2.0
// Two people, one song, at the same time. You send someone a code, they type it
// in, and you are both writing. No account, no server holding your words, and
// nothing that can start charging money later. See collabSession.js for how the
// code stays private even from the machine that introduces you.

const NAME_KEY = 'lyricist.collab.name';

export default function CollabTab({ onSendToSongwriter, currentLyrics }) {
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  });
  const [codeDraft, setCodeDraft] = useState('');
  const [session, setSession] = useState(null);
  const [, forceRender] = useState(0);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [signalCheck, setSignalCheck] = useState(null);   // null = not checked yet
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [signalDraft, setSignalDraft] = useState(getSignalingUrls().join('\n'));
  const sessionRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
  }, [name]);

  // Tear the connection down when the tab unmounts — a live WebRTC session left
  // running in the background is somebody's song still being shared.
  useEffect(() => () => { sessionRef.current?.destroy(); }, []);

  const runSignalCheck = useCallback(async () => {
    setSignalCheck('checking');
    const res = await checkSignaling();
    setSignalCheck(res);
    return res;
  }, []);

  useEffect(() => { runSignalCheck(); }, [runSignalCheck]);

  const start = async (code) => {
    if (!name.trim()) { setStatus('Put your name in first so the other person knows who they are writing with.'); return; }
    setJoining(true);
    setStatus('');
    try {
      const s = await joinRoom({
        code,
        displayName: name.trim(),
        onChange: () => forceRender((n) => n + 1),
      });
      sessionRef.current = s;
      setSession(s);
      setCodeDraft('');
    } catch (err) {
      setStatus(`Could not start the session: ${err.message}`);
    }
    setJoining(false);
  };

  const leave = () => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setSession(null);
    setStatus('Left the session. Nothing is being shared any more.');
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus(`Copy did not work — the code is ${session.code}`);
    }
  };

  const lyrics = session ? session.text.toString() : '';
  const peers = session ? session.peers() : [];
  const others = peers.filter((p) => !p.isYou);
  const allSignalingDown = Array.isArray(signalCheck) && signalCheck.every((r) => !r.ok);

  return (
    <div className="tab-video-shell">
      <TabBackground name="collab" />
      <div className="tab-video-content">
    <div style={{ padding: '18px 22px 40px', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div>
        <h2 className="emerald-edge" style={{ fontFamily: 'var(--faf-font)', fontSize: '1.5rem', margin: 0, letterSpacing: '0.04em' }}>
          COLLABORATION
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(230,232,235,0.75)', margin: '6px 0 0', maxWidth: 760, lineHeight: 1.6 }}>
          Write a song with someone else, live, wherever they are. Start a session, send them the code,
          and you are both typing in the same words. <b>Peer to peer</b> — the song goes straight between
          your two computers. No account, nobody's server holding your lyrics, nothing to pay for, ever.
        </p>
      </div>

      {/* Signalling health. A dead introducer looks exactly like "nobody joined
          yet", so it gets said plainly instead of leaving you guessing. */}
      {allSignalingDown && (
        <div
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10,
            border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.08)',
            color: 'rgba(252,165,165,0.95)', fontSize: '0.72rem', lineHeight: 1.55,
          }}
          data-help="The free public servers that introduce two people to each other are unreachable right now. Your song is not affected — this only stops new sessions connecting."
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <b>Can't reach the meeting point.</b> Two people find each other through a small free public
            server — it never sees your song, only "here is how to reach me". Every one on the list is
            down or blocked right now, so a session can't connect until one is back.
            Check your internet, or paste a different server under <i>Advanced</i> below.
          </div>
        </div>
      )}

      {!session ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
            <label style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(230,232,235,0.6)' }}>
              Your name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should they see you as?"
              className="ql-edit-input"
              style={{ fontSize: '0.9rem', padding: '10px 12px' }}
              data-help="Just a label so the other person knows who is typing. It is not an account and it is not sent anywhere except to the people in your session."
            />
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 4 }}>
            {/* Start */}
            <div style={{ flex: '1 1 320px', minWidth: 300, padding: 18, borderRadius: 14,
              border: '1px solid rgba(231,165,64,0.35)', background: 'rgba(20,18,14,0.6)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--amber-hot, #FFD08A)' }}>Start a session</h3>
              <p style={{ fontSize: '0.74rem', color: 'rgba(230,232,235,0.7)', lineHeight: 1.6, margin: '0 0 14px' }}>
                Get a code, send it to whoever you are writing with. Text it, say it down the phone —
                it is twelve characters and it is the only thing they need.
              </p>
              <button
                className="ql-btn accent-ylw"
                disabled={joining}
                onClick={() => start(newRoomCode())}
                data-help="Creates a brand new room and puts you in it. You will get a code to pass on."
              >
                <Radio size={14} /> Start a session
              </button>
            </div>

            {/* Join */}
            <div style={{ flex: '1 1 320px', minWidth: 300, padding: 18, borderRadius: 14,
              border: '1px solid rgba(231,165,64,0.3)', background: 'rgba(15,16,18,0.6)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#e7a540' }}>Join a session</h3>
              <p style={{ fontSize: '0.74rem', color: 'rgba(230,232,235,0.7)', lineHeight: 1.6, margin: '0 0 14px' }}>
                Got a code from someone? Type it here. Upper or lower case, dashes or not — it sorts itself out.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(normalizeCode(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && isCompleteCode(codeDraft)) start(codeDraft); }}
                  placeholder="XXXX-XXXX-XXXX"
                  className="ql-edit-input ql-mono"
                  style={{ fontSize: '1rem', padding: '10px 12px', letterSpacing: '0.12em', minWidth: 190 }}
                  data-help="The code the other person sent you. It is also the key that encrypts the session, so only people with it can read what you write."
                />
                <button
                  className="ql-btn"
                  disabled={!isCompleteCode(codeDraft) || joining}
                  onClick={() => start(codeDraft)}
                  data-help="Joins their room. You will both see the same words from that moment on."
                >
                  <Users size={14} /> Join
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* The code, big, because it is the whole handshake */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
            padding: 16, borderRadius: 14, border: '1px solid rgba(231,165,64,0.4)', background: 'rgba(20,18,14,0.6)' }}>
            <div>
              <div style={{ fontSize: '0.66rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(230,232,235,0.55)' }}>
                Session code — send this to them
              </div>
              <div className="ql-mono" style={{ fontSize: '1.7rem', letterSpacing: '0.16em', color: 'var(--amber-hot, #FFD08A)', textShadow: '0 0 0 1px rgba(231,165,64,0.5)' }}>
                {session.code}
              </div>
            </div>
            <button className="ql-btn" onClick={copyCode} data-help="Copies the code so you can paste it into a message.">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy code'}
            </button>
            <button className="ql-btn" onClick={leave} style={{ borderColor: 'rgba(248,113,113,0.45)', color: '#f87171' }}
              data-help="Disconnects you. The other person keeps their copy of the words, and so do you.">
              <LogOut size={14} /> Leave
            </button>
          </div>

          {/* Who is here, and whether the connection actually happened */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.74rem' }}>
            <span style={{ color: 'rgba(230,232,235,0.6)' }}>In this session:</span>
            {peers.map((p) => (
              <span key={p.clientId} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${p.color}`, color: p.color, background: 'rgba(0,0,0,0.35)',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
                {p.name}{p.isYou ? ' (you)' : ''}
              </span>
            ))}
            {others.length === 0 && (
              <span style={{ color: 'rgba(230,232,235,0.55)' }}>
                {session.signalingConnected
                  ? '— waiting for them to join. Connected and listening; send them the code.'
                  : '— still reaching the meeting point…'}
              </span>
            )}
          </div>

          {/* The shared page */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 420 }}>
            <label style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(230,232,235,0.6)' }}>
              The song — you are both typing in here
            </label>
            <textarea
              ref={textRef}
              value={lyrics}
              onChange={(e) => applyLocalEdit(session.text, e.target.value)}
              placeholder={'Start writing. Whatever you type shows up on their screen, and theirs shows up here.'}
              className="ql-keywords-input"
              style={{ minHeight: 380, flex: 1, fontSize: '0.95rem', lineHeight: 1.65, fontFamily: 'var(--faf-font)' }}
              data-help="One shared page. Both of you can type at once — edits are merged, so you will not wipe out each other's line."
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="ql-btn accent-ylw"
                onClick={() => {
                  if (!lyrics.trim()) { setStatus('Nothing written yet.'); return; }
                  onSendToSongwriter?.({ lyrics, artist: 'Collaboration', source: 'collab' });
                  setStatus('Sent to Songwriter.');
                }}
                data-help="Drops what you have written into the Songwriter tab so you can keep working on it with the AI tools."
              >
                <Send size={14} /> Send to Songwriter
              </button>
              <button
                className="ql-btn"
                onClick={() => {
                  const incoming = (currentLyrics || '').trim();
                  if (!incoming) { setStatus('Songwriter is empty — nothing to pull in.'); return; }
                  applyLocalEdit(session.text, incoming);
                  setStatus('Pulled the Songwriter lyrics in. They can see them now too.');
                }}
                data-help="Takes what is currently in Songwriter and puts it on the shared page for both of you."
              >
                <Download size={14} /> Pull from Songwriter
              </button>
            </div>
          </div>
        </>
      )}

      {status && (
        <div style={{ fontSize: '0.72rem', color: 'rgba(52,211,153,0.9)' }}>{status}</div>
      )}

      {/* Advanced — only matters the day the free servers go away */}
      <div style={{ marginTop: 8 }}>
        <button
          className="ql-btn"
          style={{ fontSize: '0.7rem', padding: '6px 12px' }}
          onClick={() => setShowAdvanced((v) => !v)}
          data-help="Only needed if sessions stop connecting. Lets you point the app at a different meeting-point server."
        >
          Advanced {showAdvanced ? '▾' : '▸'}
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', maxWidth: 640 }}>
            <p style={{ fontSize: '0.72rem', color: 'rgba(230,232,235,0.7)', lineHeight: 1.6, margin: '0 0 10px' }}>
              These are the free public servers that introduce two people to each other. They never see your
              song. If they ever go dark, any y-webrtc signalling server works — one per line.
            </p>
            <textarea
              value={signalDraft}
              onChange={(e) => setSignalDraft(e.target.value)}
              className="ql-keywords-input"
              style={{ minHeight: 80, fontSize: '0.78rem' }}
              spellCheck={false}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="ql-btn"
                onClick={async () => {
                  const list = signalDraft.split('\n').map((s) => s.trim()).filter(Boolean);
                  setSignalingUrls(list);
                  const res = await runSignalCheck();
                  setStatus(res.some((r) => r.ok) ? 'Saved — reachable.' : 'Saved, but none of those answered.');
                }}
              >
                Save &amp; test
              </button>
              <button
                className="ql-btn"
                onClick={() => { setSignalingUrls(null); setSignalDraft(DEFAULT_SIGNALING.join('\n')); runSignalCheck(); }}
              >
                Reset to defaults
              </button>
              <button className="ql-btn" onClick={runSignalCheck}><RefreshCw size={12} /> Re-test</button>
              <span style={{ fontSize: '0.7rem', color: 'rgba(230,232,235,0.6)' }}>
                {signalCheck === 'checking' && 'checking…'}
                {Array.isArray(signalCheck) && signalCheck.map((r) => (
                  <span key={r.url} style={{ marginRight: 10, color: r.ok ? '#10f0a0' : '#f87171' }}>
                    {r.url.replace('wss://', '')} {r.ok ? 'ok' : 'down'}
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
      </div>
    </div>
  );
}
