import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getGhostDemo } from './ghostDemoScripts.js';
// User art (true alpha): V:\assets\upscaled\ghost.demo.png
import ghostGuideImg from '../../assets/ghost.demo.png';
import './GhostDemo.css';

/**
 * Ghost Demo — operates the UI like a remote operator:
 * hides the real cursor, moves a visible pointer, types into fields,
 * and really clicks buttons so the feature runs.
 */

function setReactInputValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function firePointerSequence(el, clientX, clientY) {
  if (!el) return;
  const opts = { bubbles: true, cancelable: true, clientX, clientY, view: window, buttons: 1 };
  const types = [
    'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
    'pointermove', 'mousemove',
    'pointerdown', 'mousedown',
    'pointerup', 'mouseup',
    'click',
  ];
  for (const type of types) {
    try {
      if (type.startsWith('pointer')) {
        el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: 'mouse' }));
      } else {
        el.dispatchEvent(new MouseEvent(type, opts));
      }
    } catch {
      el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts));
    }
  }
  // React synthetic listeners often listen on the element itself
  try { el.click(); } catch { /* */ }
}

export default function GhostDemo({ tabId, onClose }) {
  const demo = getGhostDemo(tabId);
  const [stepIdx, setStepIdx] = useState(0);
  const [cursor, setCursor] = useState({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 });
  const [bubble, setBubble] = useState({ text: '', x: 0, y: 0, visible: false });
  const [highlight, setHighlight] = useState(null);
  const [clickPulse, setClickPulse] = useState(false);
  const [paused, setPaused] = useState(false);
  const [statusLine, setStatusLine] = useState('Remote operator connecting…');
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const cursorRef = useRef({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 });

  useEffect(() => { pauseRef.current = paused; }, [paused]);

  // Hide the real system cursor for the whole app while demo runs
  useEffect(() => {
    document.body.classList.add('ghost-demo-active');
    return () => {
      document.body.classList.remove('ghost-demo-active');
      document.querySelectorAll('.ghost-demo-click').forEach((n) => n.classList.remove('ghost-demo-click'));
    };
  }, []);

  const wait = (ms) =>
    new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (cancelRef.current) return resolve();
        if (pauseRef.current) {
          setTimeout(tick, 60);
          return;
        }
        if (Date.now() - start >= ms) resolve();
        else setTimeout(tick, 30);
      };
      tick();
    });

  /** Human-ish path with a slight curve */
  const animateCursorTo = (x, y, duration = 850) =>
    new Promise((resolve) => {
      const from = { ...cursorRef.current };
      const midX = (from.x + x) / 2 + (Math.random() - 0.5) * 40;
      const midY = (from.y + y) / 2 + (Math.random() - 0.5) * 30;
      const t0 = performance.now();
      const step = (now) => {
        if (cancelRef.current) return resolve();
        if (pauseRef.current) {
          requestAnimationFrame(step);
          return;
        }
        const t = Math.min(1, (now - t0) / duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        // quadratic bezier
        const u = 1 - ease;
        const nx = u * u * from.x + 2 * u * ease * midX + ease * ease * x;
        const ny = u * u * from.y + 2 * u * ease * midY + ease * ease * y;
        cursorRef.current = { x: nx, y: ny };
        setCursor({ x: nx, y: ny });
        if (t < 1) requestAnimationFrame(step);
        else {
          cursorRef.current = { x, y };
          setCursor({ x, y });
          resolve();
        }
      };
      requestAnimationFrame(step);
    });

  const findEl = async (sel) => {
    if (!sel) return null;
    let el = document.querySelector(sel);
    if (!el) {
      await wait(350);
      el = document.querySelector(sel);
    }
    // Prefer inner input/textarea/button if wrapper selected
    if (el && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement)) {
      const inner = el.querySelector('input, textarea, button, [role="button"]');
      if (inner && (sel.includes('keywords') || sel.includes('input') || sel.includes('key'))) {
        return inner;
      }
    }
    return el;
  };

  const typeLikeHuman = async (el, text) => {
    if (!el || !text) return;
    el.focus();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(200);
    setReactInputValue(el, '');
    let built = '';
    for (const ch of text) {
      if (cancelRef.current) return;
      built += ch;
      setReactInputValue(el, built);
      await wait(28 + Math.random() * 45);
    }
  };

  const realClick = async (el) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setClickPulse(true);
    el.classList.add('ghost-demo-click');
    await wait(90);
    firePointerSequence(el, cx, cy);
    await wait(160);
    setClickPulse(false);
    el.classList.remove('ghost-demo-click');
  };

  const runDemo = useCallback(async () => {
    cancelRef.current = false;

    if (!demo) {
      setStatusLine('This tab uses Tips hover — no remote demo needed.');
      setBubble({
        text: 'Dictionary, Thesaurus, and the simple tools don’t get a remote demo. Use Tips ON and hover. Ghost Demo is for Quantum Lab, Ghost Rider, Song Forge, RC-Funk 5000, MIDI, Mastering, and the other hard tabs.',
        x: Math.max(16, window.innerWidth / 2 - 170),
        y: Math.max(90, window.innerHeight / 2 - 50),
        visible: true,
      });
      await wait(4800);
      if (!cancelRef.current) onClose?.();
      return;
    }

    setStatusLine(`Remote operator running: ${demo.title}`);
    cursorRef.current = { x: window.innerWidth * 0.62, y: window.innerHeight * 0.28 };
    setCursor(cursorRef.current);

    const steps = demo.steps || [];

    for (let i = 0; i < steps.length; i++) {
      if (cancelRef.current) break;
      setStepIdx(i);
      const step = steps[i];
      let tx = window.innerWidth * 0.5;
      let ty = window.innerHeight * 0.4;
      let el = null;

      if (step.target) {
        el = await findEl(step.target);
      }

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        await wait(400);
        const r = el.getBoundingClientRect();
        tx = r.left + Math.min(r.width * 0.55, r.width - 8);
        ty = r.top + r.height / 2;
        setHighlight({
          left: r.left - 4,
          top: r.top - 4,
          width: r.width + 8,
          height: r.height + 8,
        });
      } else {
        setHighlight(null);
      }

      // Move the visible mouse like a remote session
      await animateCursorTo(tx, ty, el ? 900 + Math.random() * 200 : 600);

      const bx = Math.min(window.innerWidth - 330, Math.max(12, tx + 28));
      const by = Math.max(56, ty - 130);
      setBubble({ text: step.say, x: bx, y: by, visible: true });
      await wait(Math.min(1200, step.wait ? step.wait * 0.35 : 1000));

      const action = step.action || (el ? 'click' : 'say');

      if (action === 'type' && el && step.typeText) {
        // If target is a wrapper, type into its field
        let field = el;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          field = el.querySelector('textarea, input') || el;
        }
        await typeLikeHuman(field, step.typeText);
        setStatusLine(`Typed into ${step.target || 'field'}`);
      } else if (action === 'click' && el) {
        // Default: really operate the control
        if (step.skipClick) {
          setStatusLine('Pointing (no click — would open mic/API)');
        } else {
          await realClick(el);
          setStatusLine(`Clicked ${step.target || 'control'}`);
        }
      } else if (action === 'point' && el) {
        // Hover only — still fires mouseenter so UI can highlight
        const r = el.getBoundingClientRect();
        firePointerSequence(el, r.left + r.width / 2, r.top + r.height / 2);
        // Don't force button actions on pure point steps
      }

      await wait(step.wait ?? 2800);
    }

    if (!cancelRef.current) {
      setHighlight(null);
      setBubble({
        text: `Remote demo finished for ${demo.title}. You just watched the feature get operated for real. Play Demo again anytime while Ghost Demo is On.`,
        x: Math.max(16, window.innerWidth / 2 - 170),
        y: Math.max(70, window.innerHeight / 2 - 40),
        visible: true,
      });
      setStatusLine('Session complete');
      await wait(3500);
      onClose?.();
    }
  }, [demo, onClose]);

  useEffect(() => {
    runDemo();
    return () => { cancelRef.current = true; };
  }, [runDemo]);

  const skip = () => {
    cancelRef.current = true;
    onClose?.();
  };

  return (
    <div className="ghost-demo-root" role="dialog" aria-label="Ghost remote demo">
      {/* Dim overlay does NOT block the UI — ghost clicks pass through to real controls */}
      <div className="ghost-demo-scrim" aria-hidden />

      {highlight && (
        <div
          className="ghost-demo-ring"
          style={{
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}

      {/* The only visible mouse during the session */}
      <div
        className={`ghost-demo-operator ${clickPulse ? 'is-click' : ''}`}
        style={{ left: cursor.x, top: cursor.y }}
      >
        <div className="ghost-demo-figure" aria-hidden>
          {/* Full transparent ghost art — no circular bubble crop */}
          <div className="ghost-demo-sprite-wrap">
            <img
              src={ghostGuideImg}
              alt="Ghost guide"
              className="ghost-demo-sprite"
              draggable={false}
            />
          </div>
          <span className="ghost-demo-ghost-label">Remote</span>
        </div>
        <div className="ghost-demo-cursor" aria-hidden>
          <svg width="32" height="32" viewBox="0 0 24 24">
            <path
              d="M5 3 L5 18 L9.5 14.5 L12.5 21 L15 20 L12 13.5 L18 13 Z"
              fill="#f8fafc"
              stroke="#7c3aed"
              strokeWidth="1.1"
            />
          </svg>
        </div>
      </div>

      {bubble.visible && (
        <div className="ghost-demo-bubble" style={{ left: bubble.x, top: bubble.y }}>
          <div className="ghost-demo-bubble-name">Remote operator</div>
          <div className="ghost-demo-bubble-text">{bubble.text}</div>
          <div className="ghost-demo-bubble-meta">
            {demo
              ? `Step ${Math.min(stepIdx + 1, demo.steps.length)} / ${demo.steps.length} · ${demo.title}`
              : 'Tips only'}
          </div>
        </div>
      )}

      <div className="ghost-demo-bar">
        <span className="ghost-demo-bar-title">
          <img src={ghostGuideImg} alt="" className="ghost-demo-bar-avatar" />
          Remote demo — {demo?.title || 'Tips'} · {statusLine}
        </span>
        <button type="button" className="ghost-demo-bar-btn" onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button type="button" className="ghost-demo-bar-btn ghost-demo-bar-skip" onClick={skip}>
          Stop ✕
        </button>
      </div>
    </div>
  );
}
