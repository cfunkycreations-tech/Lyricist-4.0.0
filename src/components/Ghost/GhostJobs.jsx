import React, { useEffect, useState } from 'react';
import {
  subscribeJobs, addJob, stopJob, decide, resumeJob, removeJob, clearFinished,
} from '../../services/ghostJobs.js';

/**
 * THE JOBS VIEW. A job box, how to run it, and the queue with every step ticked
 * off as it goes. See ghostJobs.js for how a job runs.
 */

const MODES = [
  { id: 'full', label: 'Start to finish', hint: 'Runs every step. A step that fails is tried again once.' },
  { id: 'checkpoints', label: 'Checkpoints', hint: 'Stops after the plan and after every step for you to say go.' },
  { id: 'batch', label: 'Overnight batch', hint: 'Hands off, the PC stays awake, and one failed job does not stop the rest.' },
];

const STATUS = {
  queued: 'Waiting', planning: 'Planning', running: 'Running', awaiting: 'Your call',
  paused: 'Paused', done: 'Done', failed: 'Failed', stopped: 'Stopped',
};

const MARK = { pending: '○', running: '◐', done: '✓', failed: '✗', skipped: '–' };

export default function GhostJobs({ draft = '', onDraftUsed }) {
  const [jobs, setJobs] = useState([]);
  const [prompt, setPrompt] = useState(draft);
  const [mode, setMode] = useState('full');
  const [record, setRecord] = useState(false);
  const [openLog, setOpenLog] = useState(null);

  useEffect(() => subscribeJobs((list) => setJobs(list)), []);
  useEffect(() => { if (draft) { setPrompt(draft); onDraftUsed?.(); } }, [draft]);   // eslint-disable-line react-hooks/exhaustive-deps

  const add = (start) => {
    if (!prompt.trim()) return;
    addJob({ prompt, mode, record, start });
    setPrompt('');
  };

  const hasFinished = jobs.some((j) => ['done', 'failed', 'stopped'].includes(j.status));

  return (
    <div className="ghj">
      <div className="ghj-new">
        <textarea
          id="ghj-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell the Ghost the whole job. Pick an artist, study them, write in their style, save the Suno tags, send it to Songwriter…"
          aria-label="The job"
        />
        <div className="ghj-modes" role="radiogroup" aria-label="How to run it">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className={mode === m.id ? 'on' : ''}
              title={m.hint}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="ghj-hint">{MODES.find((m) => m.id === mode).hint}</p>
        <label className="ghj-rec">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
          Record it in OBS (starts before the first step, stops after the last)
        </label>
        <div className="ghj-go">
          <button type="button" className="go" disabled={!prompt.trim()} onClick={() => add(true)}>Run now</button>
          <button type="button" disabled={!prompt.trim()} onClick={() => add(false)}>Add to queue</button>
        </div>
      </div>

      <div className="ghj-list">
        {!jobs.length && <p className="ghj-empty">No jobs yet. Anything you tell the Ghost that has several steps in it runs here too.</p>}
        {[...jobs].reverse().map((j) => (
          <div key={j.id} className={`ghj-job s-${j.status}`}>
            <div className="ghj-jhd">
              <span className="ghj-badge">{STATUS[j.status] || j.status}</span>
              <span className="ghj-title" title={j.prompt}>{j.title}</span>
              <span className="ghj-meta">{MODES.find((m) => m.id === j.mode)?.label}{j.record ? ' · OBS' : ''}</span>
            </div>
            {j.note && <p className="ghj-note">{j.note}</p>}

            {!!j.steps.length && (
              <ol className="ghj-steps">
                {j.steps.map((s, i) => (
                  <li key={i} className={`st-${s.status}`}>
                    <span className="ghj-mark" aria-hidden="true">{MARK[s.status] || '○'}</span>
                    <span>
                      {s.text}
                      {!!s.did?.length && (
                        <span className="ghj-did">
                          {s.did.map((d, k) => (
                            <span key={k} className={d.ok ? 'ok' : 'no'}>{d.ok ? '✓' : '✗'} {d.said || d.name}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="ghj-btns">
              {j.status === 'awaiting' && j.awaiting === 'plan' && (
                <button type="button" className="go" onClick={() => decide(j.id, 'approve')}>Approve the plan</button>
              )}
              {j.status === 'awaiting' && j.awaiting === 'step' && (
                <>
                  <button type="button" className="go" onClick={() => decide(j.id, 'continue')}>Continue</button>
                  <button type="button" onClick={() => decide(j.id, 'redo')}>Redo</button>
                  <button type="button" onClick={() => decide(j.id, 'skip')}>Skip</button>
                </>
              )}
              {['queued', 'planning', 'running', 'awaiting'].includes(j.status) && (
                <button type="button" className="stop" onClick={() => stopJob(j.id)}>Stop</button>
              )}
              {['failed', 'stopped', 'paused'].includes(j.status) && (
                <button type="button" className="go" onClick={() => resumeJob(j.id)}>
                  {j.status === 'failed' ? 'Retry' : 'Resume'}
                </button>
              )}
              {!!j.log?.length && (
                <button type="button" onClick={() => setOpenLog(openLog === j.id ? null : j.id)}>
                  {openLog === j.id ? 'Hide log' : 'Log'}
                </button>
              )}
              {!['planning', 'running', 'awaiting'].includes(j.status) && (
                <button type="button" onClick={() => removeJob(j.id)}>Remove</button>
              )}
            </div>
            {openLog === j.id && <pre className="ghj-log">{j.log.join('\n')}</pre>}
          </div>
        ))}
        {hasFinished && (
          <button type="button" className="ghj-clear" onClick={clearFinished}>Clear finished jobs</button>
        )}
      </div>
    </div>
  );
}
