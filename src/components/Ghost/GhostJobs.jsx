import React, { useEffect, useState } from 'react';
import {
  subscribeJobs, stopJob, decide, resumeJob, removeJob, clearFinished,
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

/**
 * ONE BOX. Chris, 2026-10-11: "the enter button I couldn't click... the stow
 * button doesn't work either." A job flips the panel to Jobs, and Jobs had its
 * own big job box with Run now. He typed there, so the Ask the Ghost box stayed
 * empty, Enter stayed greyed out, and Stow (which fires on Enter) never did.
 * The job is typed in Ask the Ghost now; this view only says how to run it.
 */
export default function GhostJobs({ mode, setMode, record, setRecord }) {
  const [jobs, setJobs] = useState([]);
  const [openLog, setOpenLog] = useState(null);

  useEffect(() => subscribeJobs((list) => setJobs(list)), []);

  const hasFinished = jobs.some((j) => ['done', 'failed', 'stopped'].includes(j.status));

  return (
    <div className="ghj">
      <div className="ghj-new">
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
        <p className="ghj-hint">Type the whole job in Ask the Ghost below and press Enter. A job sent while one runs waits its turn.</p>
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
                            <span key={k} className={d.warn ? 'warn' : d.ok ? 'ok' : 'no'}>{d.warn ? '⚠' : d.ok ? '✓' : '✗'} {d.said || d.name}</span>
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
