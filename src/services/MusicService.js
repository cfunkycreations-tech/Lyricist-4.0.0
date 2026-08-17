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
  local: 34,      // a T4 class card. Slower cards are far worse, see above.
  server: 3,      // a rented 4090 class card. Nobody has measured one yet.
};

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
  if (seconds <= 30) return 1;
  if (seconds <= 60) return 3;
  if (seconds <= 120) return 5;
  if (seconds <= 240) return 7;
  return 9;
}

/** Honest estimate in seconds, so the tab can warn before it spends an hour. */
export function estimateSeconds(engine, duration) {
  return Math.round((REALTIME_FACTOR[engine] ?? 2) * duration);
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
  const { state, duration, seed, steps, guidance, onProgress, signal } = opts;
  const host = await pickHost(CLOUD_HOSTS, signal);
  onProgress?.({ phase: 'queued', host });

  const body = JSON.stringify({
    data: [JSON.stringify(state), duration, seed, false, 0, steps, guidance],
  });

  const post = await fetch(`${host}/gradio_api/call/studio_generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
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
export async function detectComfy(base = 'http://127.0.0.1:8188', timeoutMs = 1500) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/system_stats`, { signal: ac.signal });
    if (!r.ok) return null;
    const s = await r.json();
    return { base, version: s?.system?.comfyui_version ?? 'unknown' };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
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

  const post = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: comfyGraph({ state, duration, seed, steps, guidance, dit }),
      client_id: `lyricist-${Date.now()}`,
    }),
    signal,
  });
  if (!post.ok) throw new Error(`ComfyUI rejected the job (${post.status}).`);
  const { prompt_id: promptId } = await post.json();
  onProgress?.({ phase: 'generating', host: base });

  // Poll. There is no push here, and the job can run for hours on a small card.
  for (;;) {
    if (signal?.aborted) throw new Error('Cancelled.');
    await new Promise((r) => setTimeout(r, 4000));

    let hist;
    try {
      hist = await (await fetch(`${base}/history/${promptId}`, { signal })).json();
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
        const r = await fetch(url, { signal });
        if (!r.ok) throw new Error('The song was made but could not be read back.');
        return { blob: await r.blob(), host: base };
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
export async function generateSong({
  engine = 'cloud',
  base = 'http://127.0.0.1:8188',
  state,
  duration = 30,
  seed = 0,
  steps = 30,
  guidance = 1.7,
  dit,
  onProgress,
  signal,
} = {}) {
  if (!state || typeof state !== 'object') throw new Error('No song to make.');
  if (!state.lyrics && !state.instrumental) {
    throw new Error('Add some words, or switch it to instrumental.');
  }

  const started = Date.now();
  const run = engine === 'cloud'
    ? generateCloud({ state, duration, seed, steps, guidance, onProgress, signal })
    : generateComfy({ base, state, duration, seed, steps, guidance, dit, onProgress, signal });

  const { blob, host } = await run;

  lastRun.engine = engine;
  lastRun.host = host;
  lastRun.seconds = duration;
  lastRun.ms = Date.now() - started;
  lastRun.at = new Date().toISOString();

  return { blob, seed, engine, host, ms: lastRun.ms, duration };
}
