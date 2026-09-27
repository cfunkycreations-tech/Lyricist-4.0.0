import React, { useEffect, useRef, useState } from 'react';
import { Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { registerDialogHost } from '../../services/dialog.js';
import './DialogHost.css';

const TONE_ICON = { info: Info, ok: CheckCircle2, error: AlertTriangle };

/**
 * Where notify(), ask() and askText() from services/dialog.js show up: toasts
 * stacked above the player, and one modal at a time for questions. Mounted
 * once, in main.jsx.
 */
export default function DialogHost() {
  const [toasts, setToasts] = useState([]);
  const [queue, setQueue] = useState([]);   // modal questions, first one showing
  const seq = useRef(0);

  useEffect(() => registerDialogHost((req) => {
    const id = ++seq.current;
    if (req.kind === 'toast') {
      setToasts((t) => [...t.slice(-3), { ...req, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), req.ms);
    } else {
      setQueue((q) => [...q, { ...req, id }]);
    }
  }), []);

  const current = queue[0];
  const answer = (value) => {
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };

  return (
    <>
      <div className="dlg-toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = TONE_ICON[t.tone] || Info;
          return (
            <div key={t.id} className={`dlg-toast tone-${t.tone}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      {current && <Modal key={current.id} req={current} onAnswer={answer} />}
    </>
  );
}

function Modal({ req, onAnswer }) {
  const [text, setText] = useState(req.value ?? '');
  const okRef = useRef(null);
  const inputRef = useRef(null);
  const cancelValue = req.kind === 'text' ? null : false;
  const okValue = () => (req.kind === 'text' ? text : true);

  useEffect(() => {
    if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } else okRef.current?.focus();
  }, []);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onAnswer(cancelValue); }
    if (e.key === 'Enter' && req.kind === 'text') { e.preventDefault(); onAnswer(okValue()); }
  };

  return (
    <div className="dlg-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onAnswer(cancelValue); }} onKeyDown={onKey}>
      <div className="dlg-box" role="dialog" aria-modal="true" aria-label={req.message}>
        <p className="dlg-msg">{req.message}</p>
        {req.kind === 'text' && (
          <input ref={inputRef} type="text" className="dlg-input" value={text} onChange={(e) => setText(e.target.value)} />
        )}
        <div className="dlg-btns">
          <button type="button" className="dlg-key" onClick={() => onAnswer(cancelValue)}>{req.cancel}</button>
          <button type="button" ref={okRef} className={`dlg-key primary${req.danger ? ' danger' : ''}`} onClick={() => onAnswer(okValue())}>{req.ok}</button>
        </div>
      </div>
    </div>
  );
}
