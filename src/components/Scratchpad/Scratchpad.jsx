import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check } from 'lucide-react';
import scratchpadBg from '../../assets/scratchpad.mp4';

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

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>
      <video
        src={scratchpadBg}
        autoPlay
        loop
        muted
        playsInline
        onCanPlay={(e) => { e.target.playbackRate = 0.67; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.75 }}
      />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 14, boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyBetween: 'space-between', flexShrink: 0, justifyContent: 'space-between' }}>
        <div>
          <h2
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '1.3rem',
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(90deg, #e879f9, #a855f7, #22d3ee)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
            data-help="A free blank notepad — no rules, no AI. Use it to dump ideas, hooks, or random lines as they come to you. Everything you type is saved on your computer automatically, so you can close the app and it'll still be here."
          >
            Scratchpad
          </h2>
          <p style={{ fontSize: '0.72rem', color: 'rgba(148,130,200,0.45)', margin: '3px 0 0', letterSpacing: '0.05em' }}>
            Jot lines, hooks, ideas — saves automatically as you type
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            disabled={!text}
            data-help="Copies everything in the notepad so you can paste it somewhere else."
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 7,
              border: '1px solid rgba(139,92,246,0.35)',
              background: 'transparent',
              color: copied ? '#34d399' : 'rgba(196,181,253,0.7)',
              cursor: text ? 'pointer' : 'not-allowed',
              opacity: text ? 1 : 0.4,
              fontFamily: "'Space Grotesk', sans-serif",
              transition: 'color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy All'}
          </button>

          <button
            onClick={handleClear}
            disabled={!text}
            data-help="Erases everything in the notepad. It asks you to confirm first so you don't wipe it by accident."
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 7,
              border: '1px solid rgba(239,68,68,0.3)',
              background: 'transparent',
              color: cleared ? '#34d399' : 'rgba(248,113,113,0.6)',
              cursor: text ? 'pointer' : 'not-allowed',
              opacity: text ? 1 : 0.4,
              fontFamily: "'Space Grotesk', sans-serif",
              transition: 'color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Trash2 size={12} />
            {cleared ? 'Cleared' : 'Clear'}
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-help="Your big blank writing space. Just click in and type — it works like any notes app, and it saves as you go."
        placeholder="Start writing...&#10;&#10;Drop lines, hooks, verses, ideas — anything. It saves automatically so nothing gets lost.&#10;&#10;Perfect for capturing that bar that just hit you."
        style={{
          flex: 1,
          background: 'rgba(13,8,28,0.7)',
          border: '1px solid rgba(139,92,246,0.22)',
          borderRadius: 10,
          padding: '16px 18px',
          fontSize: '0.9rem',
          color: '#e8e0ff',
          outline: 'none',
          fontFamily: "'Audiowide', 'JetBrains Mono', monospace",
          resize: 'none',
          lineHeight: 1.85,
          boxSizing: 'border-box',
          width: '100%',
          transition: 'border-color 0.2s, box-shadow 0.2s'
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'rgba(168,85,247,0.7)';
          e.target.style.boxShadow = '0 0 0 1px rgba(168,85,247,0.3), 0 0 20px rgba(168,85,247,0.1)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(139,92,246,0.22)';
          e.target.style.boxShadow = 'none';
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', color: 'rgba(148,130,200,0.3)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
        <span>Auto-saved to local storage</span>
        <span>
          {text.length} chars · {linesCount} line{linesCount === 1 ? '' : 's'}
        </span>
      </div>
      </div>
    </div>
  );
}
