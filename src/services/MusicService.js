// One Man Band — the engine layer.
//
// Turns a caption + lyrics into a finished song. Three places it can run, and
// the picker exists because they are wildly different, not because variety is
// nice. Measured 2026-08-16, all on the same 30 seconds of music:
//
//   Free cloud (their H200)   ~35 seconds     <- fastest AND free AND no install
//   Kaggle free T4            ~17 minutes
//   A 4 GB Pascal card        ~3 hours
//
// That ordering surprised me and it decides the defaults: cloud is not the
// compromise option, it is the good one. Local hardware is for working offline,
// not for going faster.
//
// The slow part everywhere is an 8B autoregressive model that writes the song
// one slice at a time, roughly 25 slices per second of audio. It cannot be
// parallelised and it does not care how fast your disk is.

// Seconds of compute per second of music. Local is a placeholder that gets
// replaced by a real measurement the first time this machine finishes a song,
// because the spread between cards is enormous: a T4 measured 34x, a 4 GB
// Pascal card measured about 360x. Guessing on the user's behalf is worse than
// saying "we do not know yet".
const REALTIME_FACTOR = {
  cloud: 1.2,     // measured 2026-08-16: 12 s of music in 13.8 s
  // Kaggle's free T4: about 17 minutes for 30 s of music, measured, PLUS a fixed
  // ~6 minutes at the start of a cold session to fetch the program and the
  // 11.9 GB of weights. The fixed part is added separately in estimateSeconds,
  // because on a three minute song it is noise and on a short one it is most of
  // the wait, and a single multiplier cannot say both.
  kaggle: 34,
  local: 34,      // a T4 class card. Slower cards are far worse, see above.
  server: 3,      // a rented 4090 class card. Nobody has measured one yet.
};

/** Kaggle spends this long before it plays a note: queue, fetch, load. */
const KAGGLE_WARMUP_S = 360;

/**
 * Spaces get renamed, made private, or deleted by their owners at any time.
 * Hardcoding one is how the tab dies silently six months from now, which is
 * exactly how four dead OpenRouter model ids killed Song Forge art. So we hold
 * a list, use the first one that answers, and say which one we landed on.
 */
export const CLOUD_HOSTS = [
  'https://minimaxai-minimax-music3.hf.space',
  'https://akhaliq-minimax-music3-workflow.hf.space',
  'https://upsampler-minimax-music3.hf.space',
];

/** Where the last successful call actually ran. The UI shows this. */
export const lastRun = { engine: null, host: null, seconds: null, ms: null, at: null };

/* ------------------------------------------------------------------ */
/* the caption                                                         */
/* ------------------------------------------------------------------ */

/**
 * MiniMax's own format, confirmed against their published reference caption
 * and their Space's API. Three blocks, eleven named fields inside them.
 *
 * Specificity is the whole game here. "Steel guitar" is a weak instruction;
 * "steel guitar enters in the second verse with weeping volume swells, gone by
 * the bridge" is a real one. Anything that builds these strings should name the
 * instrument, the technique, and the section it happens in.
 */
export function buildState({
  lyrics = '',
  globalMeta = '',
  vocals = '',
  arrangement = '',
  instrumental = false,
  title = '',
  description = '',
} = {}) {
  return {
    mode: 'studio',
    description,
    instrumental: !!instrumental,
    title,
    lyrics,
    global_meta: globalMeta,
    vocals,
    arrangement,
  };
}

/**
 * How many sections a song of this length can actually hold.
 *
 * A section needs roughly 15 to 20 seconds to exist as music — eight bars at
 * 96 BPM is about 20. Their caption skill has no concept of duration at all, so
 * left alone it will happily write an Intro/Verse/Chorus/Bridge/Outro timeline
 * for a 30 second clip and the model tries to cram five parts into half a
 * minute. Cut sections, never compress them.
 */
export function sectionBudget(seconds) {
  // Arithmetic from the 15-second floor above, not a hand-written ladder. The
  // ladder said a 30 second song holds ONE section, which called a Verse plus a
  // Chorus "more than will fit" when that is 15 seconds each and completely
  // ordinary. Chris hit exactly that and sent a screenshot of the warning.
  // A warning has to fire on impossible, never on merely tight, or people stop
  // reading it.
  return Math.max(1, Math.floor(seconds / SECONDS_PER_SECTION));
}

/** The shortest stretch that can exist as music: eight bars at 96 BPM is ~20s,
 *  and 15 is the floor below which a section is a fragment. */
export const SECONDS_PER_SECTION = 15;

/** What to SUGGEST rather than what will fit. `sectionBudget` is a ceiling, and
 *  at five minutes it is twenty, which is not a song shape anybody wants — an
 *  intro, two verses, two choruses, a bridge and an outro is seven. */
export function suggestedSections(seconds) {
  return Math.min(7, sectionBudget(seconds));
}

/** Honest estimate in seconds, so the tab can warn before it spends an hour. */
export function estimateSeconds(engine, duration, takes = 1) {
  const base = Math.round((REALTIME_FACTOR[engine] ?? 2) * duration);
  const n = Math.max(1, Math.min(4, Math.round(takes)));
  // Kaggle's free machine is a T4 x2 and the notebook drives both cards, so two
  // takes are made side by side and cost one take's time. Four is two rounds.
  // The warm-up (queue, fetch, load) is paid once no matter how many takes.
  if (engine === 'kaggle') return base * Math.ceil(n / 2) + KAGGLE_WARMUP_S;
  // The cloud demo hands back one song per call and the local card is one card,
  // so there every take really is another full wait.
  return base * n;
}

/* ------------------------------------------------------------------ */
/* cloud (a Gradio Space)                                              */
/* ------------------------------------------------------------------ */

/**
 * Turn the free tier's jargon into something a songwriter can act on.
 * Both of these were produced by real requests, not guessed at.
 */
export function explainCloudError(payload) {
  let msg = payload;
  try { msg = JSON.parse(payload).error || payload; } catch { /* not json */ }

  const over = /larger than the maximum allowed/i.test(msg);
  if (over) {
    return 'That song is too long for the free cloud. It tops out around 45 seconds '
      + 'per song. Shorten it, or switch to Kaggle or your own computer for a full song.';
  }

  const quota = /quota/i.test(msg);
  if (quota) {
    const when = (msg.match(/Try again in ([\d:]+)/) || [])[1];
    return 'The free cloud is out of time for today'
      + (when ? `, and resets in ${when}` : '')
      + '. Adding a free Hugging Face token in Settings raises this a lot. '
      + 'Until then, Kaggle or your own computer will still make the song.';
  }
  return `The music server stopped: ${String(msg).slice(0, 200)}`;
}

async function pickHost(hosts, signal) {
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/gradio_api/info`, { signal });
      if (r.ok) return host;
    } catch { /* try the next one */ }
  }
  throw new Error(
    'None of the free music servers answered. They may be busy or down. ' +
    'Try again in a few minutes, or switch to your own computer.'
  );
}

/**
 * Gradio's two step protocol: POST the arguments, get an event id back, then
 * read a server-sent event stream until the file url appears.
 */
async function generateCloud(opts) {
  const { state, duration, seed, steps, guidance, onProgress, signal, hfToken } = opts;
  const host = await pickHost(CLOUD_HOSTS, signal);
  onProgress?.({ phase: 'queued', host });

  // SEND THE OBJECT, NOT A STRING. Their `studio_generate` runs the state
  // through `_normalize_state`, which is `if isinstance(state, dict)` and
  // nothing else — a JSON string fails that test silently and every field
  // falls back to their built-in demo song. It does not error, it just sings
  // somebody else's lyrics. Same fault, same day, as `composeCaption` below.
  const body = JSON.stringify({
    data: [state, duration, seed, false, 0, steps, guidance],
  });

  // A free Hugging Face token buys a much bigger daily allowance. Optional:
  // without one the call still works, there is just less of it per day.
  const headers = { 'Content-Type': 'application/json' };
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;

  const post = await fetch(`${host}/gradio_api/call/studio_generate`, {
    method: 'POST', headers, body, signal,
  });
  if (!post.ok) throw new Error(`The music server refused the job (${post.status}).`);
  const { event_id: eventId } = await post.json();
  if (!eventId) throw new Error('The music server did not start the job.');

  /**
   * The free tier's two real limits, measured 2026-08-16 by hitting both:
   *
   *   120 s of music  ->  "The requested GPU duration (258s) is larger than the
   *                        maximum allowed"
   *   60 s of music   ->  "You have exceeded your ZeroGPU quota (144s requested
   *                        vs. 57s left). Try again in 23:08:12."
   *
   * So the server asks for roughly 2.15x the song length in GPU time, a single
   * call is capped, and a day's anonymous allowance is only a few minutes. Both
   * of those come back as raw jargon, and a user seeing "ZeroGPU quota" has no
   * idea what that is or what to do about it. Translate them.
   */

  const res = await fetch(`${host}/gradio_api/call/studio_generate/${eventId}`, { signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let audioUrl = null;
  let sawError = false;

  while (!audioUrl) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;

      if (line.startsWith('event:')) {
        const name = line.slice(6).trim();
        if (name === 'error' || name === 'unexpected_error') { sawError = true; continue; }
        onProgress?.({ phase: name, host });
        continue;
      }
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === 'null') continue;

      if (sawError) throw new Error(explainCloudError(payload));

      // The audio can come back as an absolute url or a server path.
      let m = payload.match(/"(https?:\/\/[^"]+?\.(?:flac|wav|mp3|m4a))"/);
      if (m) { audioUrl = m[1]; break; }
      m = payload.match(/"path"\s*:\s*"([^"]+\.(?:flac|wav|mp3|m4a))"/);
      if (m) { audioUrl = `${host}/gradio_api/file=${m[1]}`; break; }
    }
  }
  try { reader.cancel(); } catch { /* stream already closed */ }

  if (!audioUrl) throw new Error('The music server finished but sent no audio back.');
  onProgress?.({ phase: 'downloading', host });
  const audio = await fetch(audioUrl, { signal });
  if (!audio.ok) throw new Error('The song was made but could not be downloaded.');
  return { blob: await audio.blob(), host };
}

/* ------------------------------------------------------------------ */
/* a ComfyUI, local or rented                                          */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* reaching a ComfyUI                                                  */
/* ------------------------------------------------------------------ */

/**
 * ComfyUI sends no CORS headers, so the renderer cannot call it directly and
 * the engine picker reported "not running" while it plainly was. In the
 * packaged app we go through the main process, which has no CORS. In a plain
 * browser (dev) we fall back to fetch and accept that local mode will not work
 * there — that is a dev-only limitation, not something a user ever meets.
 */
const bridge = () => (typeof window !== 'undefined' ? window.lyricistAPI?.musicFetch : null);

async function comfyJson(url, { method = 'GET', body = null } = {}) {
  const via = bridge();
  if (via) {
    const r = await via({ url, method, body });
    if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`);
    return JSON.parse(r.text);
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function comfyBlob(url) {
  const via = bridge();
  if (via) {
    const r = await via({ url, binary: true });
    if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`);
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: r.contentType });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/**
 * Is there a ComfyUI on this machine right now? Drives the engine picker.
 *
 * KNOWN GAP: ComfyUI sends no CORS headers by default, so this call is blocked
 * from a browser page and reports "not running" even when it plainly is. The
 * fix is to route these requests through Electron's main process over IPC,
 * where CORS does not exist — NOT to ask the user to launch ComfyUI with
 * --enable-cors-header, which is a setting no beginner will ever find. Until
 * that lands, the local engine only works in the packaged app.
 */
export async function detectComfy(base = 'http://127.0.0.1:8188', timeoutMs = 2500) {
  try {
    const s = await Promise.race([
      comfyJson(`${base}/system_stats`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return { base, version: s?.system?.comfyui_version ?? 'unknown' };
  } catch {
    return null;
  }
}

function comfyGraph({ state, duration, seed, steps, guidance, dit }) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: dit, weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: {
      clip_name: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
      type: 'minimax', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'minimax_music3_dav.safetensors' } },
    4: { class_type: 'MiniMaxMusic3TextEncode', inputs: {
      clip: ['2', 0],
      // ComfyUI takes one caption string, so the three blocks are joined here.
      caption: [state.global_meta, state.vocals, state.arrangement].filter(Boolean).join('\n\n'),
      lyrics: state.lyrics,
      seed, max_duration: duration, cfg_scale: guidance, top_k: 50 } },
    5: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    6: { class_type: 'EmptyMiniMaxMusic3LatentAudio', inputs: { seconds: ['4', 1], batch_size: 1 } },
    7: { class_type: 'KSampler', inputs: {
      model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0],
      seed, steps, cfg: guidance, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    8: { class_type: 'VAEDecodeAudio', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    // FLAC is the master. Mastering Studio should never receive a lossy file.
    9: { class_type: 'SaveAudioAdvanced', inputs: {
      audio: ['8', 0], filename_prefix: 'onemanband', format: 'flac' } },
  };
}

async function generateComfy(opts) {
  const { base, state, duration, seed, steps, guidance, onProgress, signal } = opts;
  const dit = opts.dit || 'minimax_music3_dit_fp16.safetensors';

  const alive = await detectComfy(base, 4000);
  if (!alive) {
    throw new Error(
      `Nothing is running at ${base}. Start ComfyUI first, or switch to the free cloud.`
    );
  }

  const posted = await comfyJson(`${base}/prompt`, {
    method: 'POST',
    body: {
      prompt: comfyGraph({ state, duration, seed, steps, guidance, dit }),
      client_id: `lyricist-${Date.now()}`,
    },
  });
  const promptId = posted.prompt_id;
  onProgress?.({ phase: 'generating', host: base });

  // Poll. There is no push here, and the job can run for hours on a small card.
  for (;;) {
    if (signal?.aborted) throw new Error('Cancelled.');
    await new Promise((r) => setTimeout(r, 4000));

    let hist;
    try {
      hist = await comfyJson(`${base}/history/${promptId}`);
    } catch { continue; }          // a blip is not a failure
    const entry = hist?.[promptId];
    if (!entry) { onProgress?.({ phase: 'generating', host: base }); continue; }

    for (const m of entry.status?.messages ?? []) {
      if (m[0] === 'execution_error') {
        throw new Error(`ComfyUI failed: ${m[1]?.exception_message ?? 'unknown error'}`);
      }
    }
    for (const out of Object.values(entry.outputs ?? {})) {
      for (const a of out.audio ?? []) {
        const url = `${base}/view?filename=${encodeURIComponent(a.filename)}`
          + `&subfolder=${encodeURIComponent(a.subfolder ?? '')}&type=${a.type ?? 'output'}`;
        onProgress?.({ phase: 'downloading', host: base });
        return { blob: await comfyBlob(url), host: base };
      }
    }
    throw new Error('ComfyUI finished but produced no audio.');
  }
}

/* ------------------------------------------------------------------ */
/* the one entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Make one song.
 *
 * The seed reproduces a take ONLY when every other input is identical too —
 * change one word of the lyrics, the length, or the step count and the same
 * seed gives you something else. So whatever saves the song must save the whole
 * recipe alongside it, not just the number.
 */
/* ------------------------------------------------------------------ */
/* Kaggle (their free T4, driven through Kaggle's own API)             */
/* ------------------------------------------------------------------ */

/**
 * Send the song to the person's own Kaggle account and wait for it.
 *
 * All of the work is in the main process (see kaggleCloud.js) because this needs
 * real HTTP with basic auth and a file on disk, neither of which the renderer
 * has. From here it is one call and a stream of progress messages.
 *
 * This is the only free way to get a full three-to-five minute song: the cloud
 * demo caps a single call at about 45 seconds of music, and Kaggle hands out 30
 * hours of graphics card a week.
 */
async function generateKaggle({ state, duration, seed, seeds, steps, guidance, onProgress, signal }) {
  const api = typeof window !== 'undefined' ? window.lyricistAPI : null;
  if (!api?.kaggleRender) {
    throw new Error('Kaggle needs the desktop app. In the browser preview only the free cloud runs.');
  }

  const off = api.onSetupProgress?.(({ job, msg }) => {
    if (job === 'kaggle' && msg && onProgress) onProgress({ phase: msg });
  });
  const abort = () => { api.kaggleRenderStop?.(); };
  signal?.addEventListener?.('abort', abort);

  try {
    const wanted = (Array.isArray(seeds) && seeds.length ? seeds : [seed]).slice(0, 4);
    const res = await api.kaggleRender({
      caption: [state.globalMeta, state.vocals, state.arrangement].filter(Boolean).join('\n\n'),
      lyrics: state.instrumental ? '' : (state.lyrics || ''),
      seconds: duration,
      seed: wanted[0],
      seeds: wanted,
      steps,
      guidance,
    });
    if (res?.stopped) throw new Error('Stopped.');
    if (!res?.ok) throw new Error(res?.error || 'Kaggle did not produce a song.');

    // One run, every take. Older builds of the main process answer with a single
    // fileName and bytes, so that shape is still accepted.
    const raw = Array.isArray(res.takes) && res.takes.length
      ? res.takes
      : [{ fileName: res.fileName, bytes: res.bytes }];
    const takes = raw.map((t, i) => {
      const type = /\.wav$/i.test(t.fileName) ? 'audio/wav'
        : /\.mp3$/i.test(t.fileName) ? 'audio/mpeg' : 'audio/flac';
      return {
        blob: new Blob([new Uint8Array(t.bytes)], { type }),
        // The notebook puts the seed in the filename, so a take always knows
        // which number made it even if Kaggle hands them back out of order.
        seed: Number((/seed(\d+)/i.exec(t.fileName || '') || [])[1]) || wanted[i] || wanted[0],
      };
    });
    return { blob: takes[0].blob, takes, host: 'kaggle.com' };
  } finally {
    off?.();
    signal?.removeEventListener?.('abort', abort);
  }
}

export async function generateSong({
  engine = 'cloud',
  base = 'http://127.0.0.1:8188',
  state,
  duration = 30,
  seed = 0,
  seeds,
  steps = 30,
  guidance = 1.7,
  dit,
  hfToken = '',
  onProgress,
  signal,
} = {}) {
  if (!state || typeof state !== 'object') throw new Error('No song to make.');
  if (!state.lyrics && !state.instrumental) {
    throw new Error('Add some words, or switch it to instrumental.');
  }

  const started = Date.now();
  const run = engine === 'cloud'
    ? generateCloud({ state, duration, seed, steps, guidance, onProgress, signal, hfToken })
    : engine === 'kaggle'
      ? generateKaggle({ state, duration, seed, seeds, steps, guidance, onProgress, signal })
      : generateComfy({ base, state, duration, seed, steps, guidance, dit, onProgress, signal });

  const { blob, takes, host } = await run;

  lastRun.engine = engine;
  lastRun.host = host;
  lastRun.seconds = duration;
  lastRun.ms = Date.now() - started;
  lastRun.at = new Date().toISOString();

  return {
    blob,
    // Kaggle can hand back several performances from one run. Everything else
    // makes one, so this is always at least a list of one.
    takes: takes && takes.length ? takes : [{ blob, seed }],
    seed,
    engine,
    host,
    ms: lastRun.ms,
    duration,
  };
}

/**
 * MAKE SEVERAL TAKES, AND ON KAGGLE MAKE THEM AT THE SAME TIME.
 *
 * Chris, 2026-08-21: *"you need to make it so that kaggle makes two diff
 * versions at once."* It did not. The tab said "Takes at once" and then ran the
 * whole Kaggle job once per take: a fresh queue, a fresh 12 GB fetch and a
 * fresh ten minute warm-up for the second version of the same song. Two takes
 * cost twice seventeen minutes instead of seventeen.
 *
 * Kaggle's free machine is a T4 x2, two whole graphics cards, and the notebook
 * now runs one ComfyUI on each. So Kaggle takes every seed in a single push and
 * the takes come back together. The other engines have one card between them,
 * so they still go one after another, and `onTake` fires as each one lands so
 * the first take is playable while the next is still cooking.
 */
export async function generateTakes({ seeds = [0], onTake, ...opts } = {}) {
  const list = (Array.isArray(seeds) && seeds.length ? seeds : [0]).slice(0, 4);

  if (opts.engine === 'kaggle' && list.length > 1) {
    const res = await generateSong({ ...opts, seed: list[0], seeds: list });
    const made = res.takes.map((t) => ({ ...res, ...t }));
    made.forEach((t) => onTake?.(t));
    return made;
  }

  const made = [];
  for (const seed of list) {
    const res = await generateSong({ ...opts, seed, seeds: [seed] });
    const one = { ...res, blob: res.blob, seed };
    made.push(one);
    onTake?.(one);
  }
  return made;
}


/**
 * MiniMax's own caption writer, running free on their server.
 *
 * Their skill ships 1,000 templates and reads them off disk as it works — 5.7 MB
 * that Lyricist cannot carry and would not want to. This endpoint is the same
 * logic hosted, so the Rewrite button costs the user nothing and does not spend
 * their OpenRouter credits either.
 *
 * VERIFIED against the live server 2026-08-17, and it was broken two ways.
 *
 * 1. The state went out as `JSON.stringify(state)`. Their `compose_assist` does
 *    `isinstance(raw_state, dict)` and a string is not one, so every field fell
 *    back to their defaults and the call died with "Describe the song you want
 *    first." **Send the object, never a string.**
 * 2. Left alone it runs their `all` target, which rewrites the LYRICS as well.
 *    This button is only supposed to rewrite the sound, so it asks for their
 *    `prompt` target, which reads his lyrics as context and returns the three
 *    caption blocks with the words untouched.
 *
 * It answers with the whole state object plus a status line, NOT prose, so the
 * three blocks are read off the object. `splitCaption` stays as the fallback for
 * a plain-text shape, and the caller keeps its offline draft if this fails.
 */
export async function composeCaption({
  state, duration = 30, hfToken = '', instruction = '', signal,
} = {}) {
  const host = await pickHost(CLOUD_HOSTS, signal);
  const headers = { 'Content-Type': 'application/json' };
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`;

  // Their assist bar sends the typed instruction; ours has no text box, so the
  // draft caption he already has IS the instruction. Without it their prompt
  // writer only sees the lyrics and drops the genre he picked.
  const ask = instruction.trim() || [state.global_meta, state.vocals, state.arrangement]
    .filter(Boolean).join('. ');

  const post = await fetch(`${host}/gradio_api/call/compose_assist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: [{ ...state, assist: 'prompt', assist_prompt: ask }, duration],
    }),
    signal,
  });
  if (!post.ok) throw new Error(`The caption writer refused the job (${post.status}).`);
  const { event_id: eventId } = await post.json();
  if (!eventId) throw new Error('The caption writer did not start.');

  const res = await fetch(`${host}/gradio_api/call/compose_assist/${eventId}`, { signal });
  const text = await res.text();

  let sawError = false;
  let payload = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('event:')) {
      sawError = ['error', 'unexpected_error'].includes(t.slice(6).trim());
    } else if (t.startsWith('data:')) {
      const d = t.slice(5).trim();
      if (!d || d === 'null') continue;
      if (sawError) throw new Error(explainCloudError(d));
      payload = d;
    }
  }
  if (!payload) throw new Error('The caption writer sent nothing back.');

  // `[stateObject, "status line"]` is the shape it really returns. Reading the
  // three blocks off the object is exact, so no parsing of prose is involved.
  let blob = payload;
  try {
    const arr = JSON.parse(payload);
    const back = Array.isArray(arr) ? arr[0] : arr;
    if (back && typeof back === 'object') {
      const out = {
        globalMeta: String(back.global_meta || '').trim(),
        vocals: String(back.vocals || '').trim(),
        arrangement: String(back.arrangement || '').trim(),
      };
      if (out.globalMeta || out.vocals || out.arrangement) return out;
    }
    blob = Array.isArray(arr)
      ? arr.filter((x) => typeof x === 'string').join(`${'\n'}${'\n'}`)
      : String(arr);
  } catch { /* already plain text */ }

  return splitCaption(blob);
}

/**
 * Cut a returned caption into MiniMax's three blocks.
 *
 * Their headings are stable ("Global Metadata", "Vocal Details", "Arrangement")
 * but the surrounding formatting is not — markdown hashes, bold, colons. Match
 * loosely on the heading words and keep whatever fell before the first one, so
 * an unexpected shape degrades into something editable instead of vanishing.
 */
export function splitCaption(text) {
  const src = String(text || '').replace(/\r/g, '');

  // Each heading needs TWO positions: where the heading itself starts, which is
  // where the PREVIOUS block has to stop, and where its content starts. Using
  // one for both is why the first pass had every block swallowing the next
  // heading.
  const find = (label) => {
    const m = src.match(new RegExp(String.raw`(?:^|\n)[#*\s]*${label}[:*\s]*\n?`, 'i'));
    return m ? { head: m.index, body: m.index + m[0].length } : null;
  };

  const marks = [
    ['globalMeta', find('Global Metadata')],
    ['vocals', find('Vocal Details')],
    ['arrangement', find('Arrangement')],
  ].filter(([, m]) => m);

  if (!marks.length) {
    // An unexpected shape is still the user's caption. Hand it back whole and
    // editable rather than throwing their words away.
    return { globalMeta: src.trim(), vocals: '', arrangement: '' };
  }

  marks.sort((a, b) => a[1].head - b[1].head);
  const out = { globalMeta: '', vocals: '', arrangement: '' };
  marks.forEach(([key, mark], i) => {
    const stop = i + 1 < marks.length ? marks[i + 1][1].head : src.length;
    out[key] = src.slice(mark.body, stop).trim();
  });
  return out;
}
