import React, { useState, useRef, useEffect, useMemo } from 'react';
import { WIZARD_CARDS } from './wizardCards.js';
import { Pause, Play, RotateCcw, VolumeX, Volume2 } from 'lucide-react';
import { Glyph } from '../common/Glyph.jsx';

/**
 * OnboardingWizard (Lyricist 4.2.0).
 *
 * A guided, plain-language walkthrough of the whole app in Ava's
 * companion narrator voice (17 cards, wizardCards.js). As the user steps through,
 * the matching tab switches behind the dimmed modal (via onNavigate) so
 * they see the real screen being described.
 *
 * Narration: each card points at a baked MP3 in public/wizard-audio/
 * (card-01.mp3 … card-16.mp3). If a file isn't there yet the tour still
 * reads on screen and the audio controls simply hide — no errors, no gaps.
 * The Tips hover-help system picks up where the tour leaves off.
 */

const AUDIO_BASE = `${import.meta.env.BASE_URL || './'}wizard-audio/`;

export default function OnboardingWizard({ onClose, onNavigate }) {
  const [step, setStep] = useState(0);
  const [muted, setMuted] = useState(() => localStorage.getItem('wizardMuted') === 'true');
  const [playing, setPlaying] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  // Chris's own recordings, dropped into <userData>\voice as card-NN.mp3. Any
  // card he has recorded plays HIS voice instead of the baked TTS clip; the
  // rest are untouched, so the pack can be filled in a few cards at a time.
  const [ownVoice, setOwnVoice] = useState({});
  const audioRef = useRef(null);

  useEffect(() => {
    let live = true;
    window.lyricistAPI?.voicePack?.()
      .then((r) => { if (live && r?.ok) setOwnVoice(r.found || {}); })
      .catch(() => { /* no pack is the normal case */ });
    return () => { live = false; };
  }, []);

  const cards = WIZARD_CARDS;
  const current = cards[step];
  const isLast = step === cards.length - 1;
  const paragraphs = useMemo(() => current.script.split(/\n\n+/), [current]);

  const go = (next) => {
    const clamped = Math.max(0, Math.min(cards.length - 1, next));
    setStep(clamped);
    const tab = cards[clamped].tab;
    if (tab && onNavigate) onNavigate(tab);
  };

  // On each card: point the <audio> at its clip and (unless muted) play it.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    setHasAudio(false);
    setPlaying(false);
    // A card is allowed to have no narration yet. Black Hole Studios shipped before
    // its clip was recorded, and a card whose script is written but whose audio
    // is not must read silently rather than throw on a null.
    if (!current.audio) {
      a.removeAttribute('src');
      return undefined;
    }
    // His recording wins when there is one. `current.audio` is 'card-NN.mp3',
    // and the pack is keyed on the stem, so drop the extension to look it up.
    const stem = current.audio.replace(/\.[^.]+$/, '');
    a.src = ownVoice[stem] || AUDIO_BASE + current.audio;
    a.load();
    if (!muted) {
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
    return () => { try { a.pause(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ownVoice]);

  useEffect(() => { localStorage.setItem('wizardMuted', String(muted)); }, [muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const a = audioRef.current;
    if (!a) return;
    if (next) { a.pause(); setPlaying(false); }
    else if (hasAudio) { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !hasAudio) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };
  const replay = () => {
    const a = audioRef.current;
    if (!a || !hasAudio) return;
    a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => {});
  };

  return (
    <div
      className="wiz-overlay"
      /* z-index 950: the phone shell paints at 800 and its bottom sheet at 901.
         At the old 200 the tour opened BEHIND the launcher and looked like the
         button did nothing. Still below the Ghost operator, as before. */
      style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(5,2,14,0.78)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      {/* Narration audio — hidden element, driven by the controls below. */}
      <audio
        ref={audioRef}
        preload="auto"
        onCanPlay={() => setHasAudio(true)}
        onError={() => { setHasAudio(false); setPlaying(false); }}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <div
        className="card-cosmic wiz-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#0d081c', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 16, padding: '26px 28px', boxShadow: '0 0 50px rgba(124,58,237,0.45)' }}
      >
        {/* Top row: step counter + skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(167,139,250,0.5)' }}>
            {current.maker ? 'A note from the AI' : `Tour · ${step + 1} of ${cards.length}`}
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(167,139,250,0.55)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}>
            {isLast ? 'Close' : 'Skip tour'}
          </button>
        </div>

        {/* Icon */}
        <div style={{ fontSize: '2.6rem', textAlign: 'center', marginBottom: 10, filter: 'drop-shadow(0 0 22px rgba(168,85,247,0.6))' }}>
          <Glyph name={current.icon} size={40} strokeWidth={1.25} />
        </div>

        {/* Title */}
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.35rem', fontWeight: 800, textAlign: 'center', margin: '0 0 8px', background: 'linear-gradient(90deg, #e879f9, #a855f7, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {current.title}
        </h2>

        {/* Narration controls (only shown when this card's MP3 loaded).
            `current.audio` is checked here as well as in the effect: on the
            render right after a card change, hasAudio is still true from the
            PREVIOUS card while current has already moved on. A card with no
            narration yet crashed the whole wizard on exactly that one frame. */}
        {hasAudio && current.audio && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '0 0 14px' }}>
            <button onClick={togglePlay} title={playing ? 'Pause' : 'Play'} style={narrBtn}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <button onClick={replay} title="Replay" style={narrBtn}><RotateCcw size={14} /></button>
            <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={narrBtn}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
            <span style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: ownVoice[current.audio.replace(/\.[^.]+$/, '')] ? 'rgba(52,211,153,0.7)' : 'rgba(167,139,250,0.45)' }}>
              {ownVoice[current.audio.replace(/\.[^.]+$/, '')]
                ? (playing ? 'Your voice…' : 'Your voice')
                : (playing ? 'Narrating…' : 'Narration')}
            </span>
          </div>
        )}

        {/* Body — paragraphs from the narration script */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 8 }}>
          {paragraphs.map((p, i) => (
            <p key={i} style={{ fontSize: current.maker && i === 0 ? '0.92rem' : '0.9rem', lineHeight: 1.68, color: current.maker && i === 0 ? '#e879f9' : '#d6cdf0', fontStyle: current.maker && i === 0 ? 'italic' : 'normal', textAlign: current.maker ? 'left' : 'center', margin: 0 }}>
              {p}
            </p>
          ))}
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, margin: '20px 0 18px' }}>
          {cards.map((_, i) => (
            <button key={i} onClick={() => go(i)} aria-label={`Go to card ${i + 1}`}
              style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 9999, border: 'none', cursor: 'pointer', padding: 0, background: i === step ? 'linear-gradient(90deg,#e879f9,#22d3ee)' : 'rgba(167,139,250,0.3)', transition: 'all 0.2s' }} />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button onClick={() => go(step - 1)} disabled={step === 0}
            style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'transparent', color: step === 0 ? 'rgba(167,139,250,0.25)' : 'rgba(196,181,253,0.8)', fontSize: '0.82rem', fontWeight: 600, cursor: step === 0 ? 'not-allowed' : 'pointer', fontFamily: "'Space Grotesk', sans-serif" }}>
            ← Back
          </button>

          {isLast ? (
            <button onClick={onClose} className="btn-neon-purple pulse-glow" style={navBtn}>Let's write something</button>
          ) : (
            <button onClick={() => go(step + 1)} className="btn-neon-purple" style={navBtn}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}

const narrBtn = { width: 30, height: 30, borderRadius: 9999, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
const navBtn = { padding: '10px 26px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif" };
