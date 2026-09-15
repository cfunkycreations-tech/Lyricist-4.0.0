/**
 * GHOST JOBS. PHASE 3: A WHOLE WORKFLOW, START TO FINISH.
 *
 * Chris's test prompt, 2026-09-15: pick an artist, analyze them, write in their
 * style, save the Suno tags, send to Songwriter, send the DNA to The Matrix,
 * tweak it on Songwriter, send it to Black Hole Studios and finish it there with
 * MiniMax's caption skill, recorded in OBS. Asked as one reply, the model did
 * half of it, skipped steps, asked a question and started OBS at the end.
 *
 * A job fixes that by construction. The prompt is planned into numbered steps
 * once, and then every step is its own question to the model, told exactly
 * which step it is on and what already happened. A step that does nothing is a
 * failed step and is retried, so nothing is quietly skipped.
 *
 * It lives outside React so a job keeps running with the Ghost panel closed.
 * The panel injects the two things that need the app (planning and running a
 * step) through setJobDeps.
 *
 * MODES
 *   full         every step back to back. A failed step is retried once, then
 *                the job stops on it with Retry.
 *   checkpoints  stops after planning for the plan to be approved, and after
 *                every step: Continue, Skip, Redo or Stop.
 *   batch        the queue overnight: hands off, the PC kept awake, and a job
 *                that fails does not hold up the next one.
 */

const KEY = 'lyricist.ghost.jobs';
const MAX_KEPT = 40;

let jobs = load();
let running = false;
let current = null;           // { id, abort: AbortController }
const waiters = new Map();    // job id -> resolve(decision)
const subs = new Set();
let deps = null;

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    // A job that was mid-run when the app closed comes back paused, not lost
    // and not silently re-run.
    return list.map((j) => (['planning', 'running', 'awaiting'].includes(j.status)
      ? { ...j, status: 'paused', note: 'The app closed while this was running. Press Resume to carry on from the step it was on.' }
      : j));
  } catch {
    return [];
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(jobs.slice(-MAX_KEPT))); } catch { /* storage full */ }
}

function emit() {
  save();
  const snap = jobs.map((j) => ({ ...j, steps: j.steps.map((s) => ({ ...s })) }));
  subs.forEach((fn) => { try { fn(snap, running); } catch { /* a listener must not break a job */ } });
}

const patch = (id, fields) => {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...fields } : j));
  emit();
};
const patchStep = (id, i, fields) => {
  jobs = jobs.map((j) => (j.id !== id ? j : {
    ...j, steps: j.steps.map((s, k) => (k === i ? { ...s, ...fields } : s)),
  }));
  emit();
};
const logTo = (id, line) => {
  const stamp = new Date().toLocaleTimeString();
  jobs = jobs.map((j) => (j.id === id ? { ...j, log: [...(j.log || []), `${stamp}  ${line}`] } : j));
  emit();
};
const get = (id) => jobs.find((j) => j.id === id);

export function subscribeJobs(fn) {
  subs.add(fn);
  fn(jobs, running);
  return () => subs.delete(fn);
}

/** planJob(job, signal) -> string[];  runStep(job, index, signal) -> { ok, said, did } */
export function setJobDeps(d) { deps = d; }

const titleOf = (prompt) => {
  const t = String(prompt).replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

export function addJob({ prompt, mode = 'full', record = false, start = true } = {}) {
  const text = String(prompt || '').trim();
  if (!text) return null;
  const job = {
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: titleOf(text),
    prompt: text,
    mode: ['full', 'checkpoints', 'batch'].includes(mode) ? mode : 'full',
    record: Boolean(record),
    status: 'queued',
    steps: [],
    log: [],
    note: '',
    createdAt: Date.now(),
  };
  jobs = [...jobs, job];
  emit();
  if (start) runQueue();
  return job.id;
}

export function removeJob(id) {
  if (current?.id === id) stopJob(id);
  jobs = jobs.filter((j) => j.id !== id);
  emit();
}

export function clearFinished() {
  jobs = jobs.filter((j) => !['done', 'failed', 'stopped'].includes(j.status));
  emit();
}

/** Stop the job that is running (or waiting on a checkpoint). */
export function stopJob(id) {
  const job = get(id);
  if (!job) return;
  if (current?.id === id) current.abort.abort();
  deps?.onStop?.();
  const w = waiters.get(id);
  if (w) { waiters.delete(id); w('stop'); }
  if (!['done', 'failed'].includes(job.status)) patch(id, { status: 'stopped', note: 'Stopped.' });
}

/** Checkpoint answers: 'approve' (the plan), 'continue', 'skip', 'redo', 'stop'. */
export function decide(id, decision) {
  const w = waiters.get(id);
  if (!w) return;
  waiters.delete(id);
  w(decision);
}

/** Retry or resume a failed, stopped or paused job from the step it was on. */
export function resumeJob(id) {
  const job = get(id);
  if (!job || !['failed', 'stopped', 'paused'].includes(job.status)) return;
  jobs = jobs.map((j) => (j.id !== id ? j : {
    ...j,
    status: 'queued',
    note: '',
    steps: j.steps.map((s) => (s.status === 'done' || s.status === 'skipped' ? s : { ...s, status: 'pending' })),
  }));
  emit();
  runQueue();
}

const waitFor = (id) => new Promise((resolve) => waiters.set(id, resolve));

/** Resolve to { ok:false } instead of hanging the job. */
const limit = (p, ms, why) => Promise.race([
  Promise.resolve(p).catch((e) => ({ ok: false, said: e?.message || why, did: [] })),
  new Promise((r) => setTimeout(() => r({ ok: false, said: why, did: [] }), ms)),
]);

async function runOne(id) {
  const ac = new AbortController();
  current = { id, abort: ac };
  const job = get(id);
  const batch = job.mode === 'batch';
  const stopped = () => ac.signal.aborted || get(id)?.status === 'stopped';

  let recording = false;
  // OBS stops BEFORE the job says Done or Failed, so "Finished" on screen means
  // the recording is already closed, not still running behind it.
  const stopRec = async () => {
    if (!recording) return;
    recording = false;
    const r = await limit(deps.record(false), 20000, 'OBS did not answer');
    logTo(id, r.ok ? 'OBS recording stopped' : `OBS did not stop: ${r.said}`);
  };
  try {
    deps.onJobStart?.(get(id));
    // PLAN, once. A resumed job keeps the plan it already had.
    if (!job.steps.length) {
      patch(id, { status: 'planning', note: 'Working out the steps…' });
      logTo(id, `planning: ${job.prompt}`);
      const steps = await deps.planJob(get(id), ac.signal);
      if (stopped()) return;
      if (!steps?.length) throw new Error('The plan came back empty.');
      jobs = jobs.map((j) => (j.id !== id ? j : {
        ...j,
        steps: steps.map((s) => (typeof s === 'string'
          ? { text: s, line: '', status: 'pending', said: '', did: [] }
          : { text: s.text, line: s.line || '', status: 'pending', said: '', did: [] })),
      }));
      emit();
      logTo(id, `plan: ${get(id).steps.map((s, i) => `${i + 1}. ${s.text}`).join('  ')}`);
      // Make every spoken line NOW, while OBS starts and the first steps run,
      // so each line plays the moment its step begins instead of after a wait.
      deps.prewarm?.(get(id).steps.map((s) => s.line).filter(Boolean));

      if (job.mode === 'checkpoints') {
        patch(id, { status: 'awaiting', awaiting: 'plan', note: 'Check the steps, then approve the plan.' });
        const d = await waitFor(id);
        if (d === 'stop' || stopped()) return;
      }
    }

    // RECORD, before the first step, not after the last one.
    if (get(id).record) {
      patch(id, { status: 'running', note: 'Starting OBS…' });
      // Capped: OBS is never allowed to hold the job. No recording beats no job.
      const r = await limit(deps.record(true), 90000, 'OBS did not answer in 90 seconds');
      logTo(id, r.ok ? 'OBS recording started' : `OBS did not start: ${r.said}`);
      recording = r.ok;
      if (!r.ok && !batch) {
        patch(id, { note: `OBS did not start, so this run is not being recorded: ${r.said}` });
      }
    }

    for (let i = 0; i < get(id).steps.length; i++) {
      const step = get(id).steps[i];
      if (step.status === 'done' || step.status === 'skipped') continue;
      if (stopped()) return;

      // SAY IT, THEN DO IT. The line plays in full before the hand moves, the
      // way a person talks a viewer through what they are about to press.
      if (step.line && deps.narrate) {
        await limit(deps.narrate(step.line), 30000, 'narration took too long');
        if (stopped()) return;
      }

      let attempt = 0;
      let result = null;
      for (;;) {
        patch(id, { status: 'running', awaiting: null, note: `Step ${i + 1} of ${get(id).steps.length}` });
        patchStep(id, i, { status: 'running' });
        logTo(id, `step ${i + 1}${attempt ? ' (again)' : ''}: ${step.text}`);
        try {
          result = await limit(deps.runStep(get(id), i, ac.signal, attempt), 6 * 60000, 'the step was still going after 6 minutes');
        } catch (e) {
          result = { ok: false, said: e?.message || 'That step did not work.', did: [] };
        }
        if (stopped()) { patchStep(id, i, { status: 'pending' }); return; }
        (result.did || []).forEach((d) => logTo(id, `  ${d.ok ? '✓' : '✗'} ${d.said || d.name}`));
        patchStep(id, i, { status: result.ok ? 'done' : 'failed', said: result.said || '', did: result.did || [] });

        if (job.mode === 'checkpoints') {
          patch(id, { status: 'awaiting', awaiting: 'step', awaitingStep: i, note: result.ok ? `Step ${i + 1} done.` : `Step ${i + 1} did not work: ${result.said}` });
          const d = await waitFor(id);
          if (d === 'stop' || stopped()) return;
          if (d === 'redo') { attempt += 1; continue; }
          if (d === 'skip') patchStep(id, i, { status: 'skipped' });
          else if (!result.ok) patchStep(id, i, { status: 'skipped' });
          break;
        }

        if (result.ok) {
          // A beat between steps, so it reads as someone working, not a script firing.
          if (get(id).mode !== 'batch') await new Promise((r) => setTimeout(r, 900));
          break;
        }
        if (attempt < 1) { attempt += 1; continue; }
        logTo(id, `step ${i + 1} failed: ${result.said}`);
        await stopRec();
        patch(id, { status: 'failed', note: `Step ${i + 1} did not work: ${result.said}` });
        return;
      }
    }
    await stopRec();
    patch(id, { status: 'done', awaiting: null, note: 'Finished.' });
    logTo(id, 'finished');
  } catch (e) {
    await stopRec();
    if (!stopped()) {
      patch(id, { status: 'failed', note: e?.message || 'The job did not work.' });
      logTo(id, `failed: ${e?.message}`);
    }
  } finally {
    await stopRec();   // Stop pressed, or an early return: nothing left recording
    current = null;
    deps.onJobEnd?.(get(id));
  }
}

/** Run queued jobs one after another until none are left. */
export async function runQueue() {
  if (running || !deps) return;
  running = true;
  emit();
  const anyBatch = () => jobs.some((j) => j.mode === 'batch' && ['queued', 'planning', 'running'].includes(j.status));
  try {
    if (anyBatch()) deps.keepAwake?.(true);
    for (;;) {
      const next = jobs.find((j) => j.status === 'queued');
      if (!next) break;
      await runOne(next.id);
      // Only a batch keeps going past a job that failed. Anything else stops
      // the queue there, so a broken first job does not run the rest blind.
      const after = get(next.id);
      if (after && after.status !== 'done' && after.mode !== 'batch') break;
    }
  } finally {
    deps.keepAwake?.(false);
    running = false;
    emit();
  }
}

export const jobsRunning = () => running;
