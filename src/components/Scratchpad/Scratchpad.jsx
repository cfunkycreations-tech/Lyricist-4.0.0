import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check } from 'lucide-react';

/* ── Legal pad geometry ──────────────────────────────────────────────
   RULE_H is the single source of truth: the ruled lines are drawn every
   RULE_H px and the textarea's line-height is exactly RULE_H, so typed
   text always sits ON the line instead of drifting off it.            */
const RULE_H = 34;          // px between ruled lines
const MARGIN_X = 96;        // px from left edge to where writing starts
const PAPER = '#f8eea6';    // legal pad yellow
const RULE = 'rgba(45,95,160,0.30)';
const MARGIN_RED = 'rgba(198,52,52,0.48)';
const INK = '#1b3a5c';      // blue-black ballpoint

export default function Scratchpad() {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('lyricistScratchpad');
    if (saved) {
      setText(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lyricistScratchpad', text);
  }, [text]);

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    if (!text) return;
    if (window.confirm('Are you sure you want to clear your scratchpad?')) {
      setText('');
      setCleared(true);
      setTimeout(() => setCleared(false), 2000);
    }
  };

  const linesCount = text.split('\n').filter(l => l.trim()).length;

  // Anodized keys on the clamp (styles/materials.css .btn-neon-cyan); only the lit state is set here.
  const padBtn = (active) => ({
    padding: '6px 14px',
    fontSize: '0.72rem',
    borderRadius: 4,
    color: active ? 'var(--amber-hot)' : undefined,
    cursor: text ? 'pointer' : 'not-allowed',
    opacity: text ? 1 : 0.4,
    fontFamily: 'var(--faf-font)',
    transition: 'color 0.15s, background 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 5
  });

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        // A real sheet of legal paper, not whatever flex space happens to be left
        // over. This is what makes the tab behave like Settings/Song Forge: the
        // page is full height and you scroll it, instead of a squashed band.
        minHeight: 1100,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: PAPER
      }}
    >
      {/* ── The clipboard clamp across the top of the pad: brushed black nickel ── */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '0 22px',
          height: 58,
          background: 'var(--mat-brush), linear-gradient(180deg, #34363b 0%, #202125 60%, #151619 100%)',
          borderBottom: '1px solid #000',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 6px 14px rgba(0,0,0,0.45)',
          position: 'relative',
          zIndex: 2
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
          <h2
            style={{
              fontFamily: 'var(--faf-font)',
              fontSize: '1.85rem',
              fontWeight: 400,
              margin: 0,
              color: '#fff',
              letterSpacing: '0.04em',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap'
            }}
            data-help="A free blank notepad — no rules, no AI. Use it to dump ideas, hooks, or random lines as they come to you. Everything you type is saved on your computer automatically, so you can close the app and it'll still be here."
          >
            Scratchpad
          </h2>
          <p
            style={{
              fontSize: '0.72rem',
              color: '#9BA1AA',
              margin: 0,
              letterSpacing: '0.05em',
              fontFamily: 'var(--faf-font)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            Jot lines, hooks, ideas — saves automatically as you type
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleCopy}
            disabled={!text}
            data-help="Copies everything in the notepad so you can paste it somewhere else."
            className="btn-neon-cyan"
            style={padBtn(copied)}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy All'}
          </button>

          <button
            onClick={handleClear}
            disabled={!text}
            data-help="Erases everything in the notepad. It asks you to confirm first so you don't wipe it by accident."
            className="btn-neon-cyan"
            style={padBtn(cleared)}
          >
            <Trash2 size={12} />
            {cleared ? 'Cleared' : 'Clear'}
          </button>
        </div>
      </div>

      {/* ── The page itself: full bleed, edge to edge ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <textarea
          className="keep-face"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-help="Your big blank writing space. Just click in and type — it works like any notes app, and it saves as you go."
          placeholder={"Start writing...\n\nDrop lines, hooks, verses, ideas — anything. It saves automatically so nothing gets lost.\n\nPerfect for capturing that bar that just hit you."}
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            minHeight: 0,
            border: 'none',
            outline: 'none',
            resize: 'none',
            boxSizing: 'border-box',
            padding: `${RULE_H}px 40px ${RULE_H * 2}px ${MARGIN_X}px`,
            fontFamily: 'var(--faf-font)',
            fontSize: '1.6rem',
            fontWeight: 500,
            lineHeight: `${RULE_H}px`,
            color: INK,
            caretColor: '#c0392b',
            backgroundColor: PAPER,
            /* Layer order: red margin rules on top, blue ruling under them.
               `local` on the ruling makes the lines scroll with the text. */
            backgroundImage: `
              linear-gradient(to right,
                transparent 0, transparent ${MARGIN_X - 28}px,
                ${MARGIN_RED} ${MARGIN_X - 28}px, ${MARGIN_RED} ${MARGIN_X - 27}px,
                transparent ${MARGIN_X - 27}px, transparent ${MARGIN_X - 23}px,
                ${MARGIN_RED} ${MARGIN_X - 23}px, ${MARGIN_RED} ${MARGIN_X - 22}px,
                transparent ${MARGIN_X - 22}px),
              repeating-linear-gradient(to bottom,
                transparent 0, transparent ${RULE_H - 1}px,
                ${RULE} ${RULE_H - 1}px, ${RULE} ${RULE_H}px)
            `,
            backgroundAttachment: 'scroll, local',
            backgroundRepeat: 'no-repeat, repeat'
          }}
        />

        {/* Paper shadow tucked under the binding strip */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 14,
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(90,64,10,0.22), transparent)',
            zIndex: 1
          }}
        />

        {/* Counters, printed small in the bottom corner of the page */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: MARGIN_X,
            right: 40,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.62rem',
            color: 'rgba(60,50,20,0.45)',
            fontFamily: "'JetBrains Mono', monospace",
            pointerEvents: 'none',
            zIndex: 1
          }}
        >
          <span>Auto-saved to local storage</span>
          <span>
            {text.length} chars · {linesCount} line{linesCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
