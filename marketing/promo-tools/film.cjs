// Promo scenes: the Ghost drives the app. Customer build on :5199, scripted model, frame-by-frame capture.
// SCENE=ghost FPS=30 W=1920 node film.cjs   (preview: FPS=8 W=960)
// Scenes: ghost (Ghost Rider → Songwriter → Black Hole Studios), suno, matrix, tour, phone.
// Each scene writes frames/ + cues.json + track.json (ghost) or frames-<scene>/ + cues-<scene>.json + track-<scene>.json.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const fs = require('fs');
const path = require('path');

const SCENE = process.env.SCENE || 'ghost';
const PHONE = SCENE === 'phone';
const FPS = Number(process.env.FPS || 30);
// The phone is filmed sideways, the way the phone version wants to be held.
const VW = PHONE ? 844 : 1600, VH = PHONE ? 390 : 900;
const W = Number(process.env.W || (PHONE ? 1688 : 1920));
const SUFFIX = SCENE === 'ghost' ? '' : `-${SCENE}`;
const OUT = path.join(__dirname, process.env.OUT || `frames${SUFFIX}`);
const SONG = process.env.SONG;   // the audio the finished take plays (wav, mp3 or flac)
if (!SONG && SCENE === 'ghost') throw new Error('Set SONG to an audio file for the finished take.');
const BH = Number(process.env.BH || 250);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

// What the scripted model says, per scene. Every word here can reach the screen.
const DATA = {
  ghost: {
    artist: 'Clutch',
    topic: 'a pawn shop guitar',
    lyrics: `[Verse 1]
Found her hanging on a nail behind the register glass
Three strings and a crack where somebody dropped her fast
Old man said forty dollars and the case is extra, son
I counted out my gas money and I paid for every one

[Chorus]
Pawn shop guitar, you been played by better men
Pawn shop guitar, we gonna make you howl again
Low E like a diesel coming down the county line
Pawn shop guitar, you're mine

[Verse 2]
Tuned her down to D in the cab of a borrowed truck
Fingers on the fretboard and the rest of it is luck
Every scratch a story that the last one couldn't keep
I play her till the neighbors bang the wall and lose their sleep`,
    tags: 'stoner rock, southern rock, heavy blues riffs, fuzz guitar, gritty male vocals, driving drums, live room, 110 BPM',
    dna: '{"rhythm":"Riff-locked, a hair behind the beat","rhymeDensity":"balanced","imageClusters":["truck cabs","county lines","pawn counters","diesel engines"],"emotionalTemp":72,"cadenceNotes":"Barked verses, sung hooks"}',
    report: `LYRICAL STYLE
Tall tales told straight-faced. Truck stops, county fairs, pawn counters and roadside saints, all in plain American speech with a preacher's push behind it.

FLOW & CADENCE
Barked verses that ride right on top of the riff, then a hook you can shout back. Short lines, hard consonants, lots of internal rhyme.

COMMON THEMES
Working men, old machines, back roads, small miracles in ordinary places. Humor first, never a wink.

STYLE DNA
Riff-locked pocket, behind the beat. Balanced rhyme density. Images: truck cabs, county lines, pawn counters, diesel engines.`,
  },
  suno: {
    artist: 'Willie Nelson',
    topic: 'busking on Congress Avenue',
    lyrics: `[Verse 1]
Set my case down open on the corner by the bank
Couple quarters in it and a dollar, and I thank
Every soul that stops a minute when the evening's coming on
The bats come out from under the bridge and I keep playing my song

[Chorus]
Play it slow on Congress Avenue
Every song I know, I'll play for you
Ain't got much but six strings and a tune
Play it slow on Congress Avenue

[Verse 2]
Old guitar's got a hole worn where the pick has dug on through
Fifty years of Texas nights and every one of them was true
The Capitol is glowing and the street lights hum along
If you don't have a dollar, friend, just stay and hear the song`,
    tags: 'outlaw country, texas country, nylon string guitar, harmonica, laid-back male vocals, honky tonk piano, upright bass, brushed drums, warm analog, 88 BPM',
    dna: '{"rhythm":"Lazy, a step behind the beat","rhymeDensity":"low","imageClusters":["highways","guitars","dance halls","front porches"],"emotionalTemp":55,"cadenceNotes":"Talked verses, sung chorus"}',
    report: `LYRICAL STYLE
Plain talk, short words, a shrug and a grin. Big feelings said small, like a man telling you the truth across a bar.

FLOW & CADENCE
Sung behind the beat, phrasing that wanders and lands late on purpose. Conversational, with room between the lines.

COMMON THEMES
The road, old friends, getting older, the next town, staying free.

STYLE DNA
Behind-the-beat phrasing. Low rhyme density. Images: highways, guitars, dance halls, front porches.`,
  },
};
DATA.matrix = {
  seeds: 'front porch, old guitar, Congress Avenue, sunrise, dance hall, borrowed boots',
  verseA: `Borrowed boots on a dance hall floor
Old guitar leaning by the door
Congress Avenue at the break of day
Sunrise on the porch and I'm here to stay`,
  verseB: `Porch light hums at the hour I wake
Six strings carrying what I can't make
The avenue's singing a tune I knew
Boots on the boards and the band comes through`,
};
DATA.phone = {
  tags: 'texas country, fiddle, pedal steel, two-step, warm male vocals',
  topic: 'Friday night at the dance hall',
  lyrics: `[Verse 1]
Sawdust on the floor and the fiddle's running late
Got my good shirt pressed and I'm waiting by the gate
Band is tuning up and the bartender knows my name
Friday at the dance hall and I'm glad I came

[Chorus]
Spin me round, spin me round
Every boot in Texas on the ground
One more song before they shut it down
Spin me round

[Verse 2]
Jukebox in the corner never learned a sad song yet
Two-step with a stranger is the best thing I'll forget
Lights come up at closing and nobody wants to go
Friday at the dance hall, play it nice and slow`,
};

// Every word that can reach the screen, checked against the app's banned list (substring, so no "train" or "brain").
const BANNED = ['neon', 'midnight', 'rain', 'heartbreak', 'cold coffee', 'shadow', 'whisper', 'echo', 'spark', 'cage', 'gravity', 'chain', 'storm'];
const CAPS = require('./captions.json')[SCENE] || [];
const D = DATA[SCENE] || {};
for (const [name, s] of Object.entries({ ...D, CAPS: CAPS.map((c) => c.text).join(' ') })) {
  const hit = BANNED.find((w) => String(s).toLowerCase().includes(w));
  if (hit) throw new Error(`${name} contains "${hit}"`);
}

const songBytes = SONG ? fs.readFileSync(SONG) : Buffer.alloc(0);
const songType = SONG?.endsWith('.mp3') ? 'audio/mpeg' : SONG?.endsWith('.flac') ? 'audio/flac' : 'audio/wav';
const songExt = SONG ? path.extname(SONG) : '.wav';

let frame = 0;
const cues = [];
const track = [];
let page;
const cur = PHONE ? { x: 600, y: 300, down: 0 } : { x: 1100, y: 700, down: 0 };
let gate; const songGate = new Promise((r) => { gate = r; });

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const frames = (ms) => Math.max(1, Math.round((ms / 1000) * FPS));

async function snap(stepMs = 1000 / FPS) {
  const bob = Math.sin((frame / FPS) * 2.6) * 5;
  await page.evaluate(([x, y, b, d]) => {
    const g = document.getElementById('promo-ghost');
    g.style.transform = `translate(${x}px, ${y}px)`;
    const fig = g.querySelector('.fig'); if (fig) fig.style.transform = `translateY(${b}px)`;
    g.classList.toggle('down', d > 0);
  }, [cur.x, cur.y, bob, cur.down]);
  if (cur.down > 0) cur.down -= 1;
  await page.clock.runFor(stepMs);
  await page.screenshot({ path: `${OUT}/f${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  track.push([Math.round(cur.x), Math.round(cur.y)]);
  frame += 1;
  if (frame % (FPS * 5) === 0) console.log(`${(frame / FPS).toFixed(0)}s`);
}
const hold = async (ms) => { for (let i = 0, n = frames(ms); i < n; i++) await snap(); };
// Fast-forward: fake time runs `speed` times faster than the film.
const timelapse = async (ms, speed) => { for (let i = 0, n = frames(ms); i < n; i++) await snap((1000 / FPS) * speed); };

async function moveTo(x, y, ms = 650) {
  const x0 = cur.x, y0 = cur.y, n = frames(ms);
  // A slight arc, like a hand.
  const mx = (x0 + x) / 2 + (y - y0) * 0.12, my = (y0 + y) / 2 - (x - x0) * 0.12;
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n), u = 1 - t;
    cur.x = u * u * x0 + 2 * u * t * mx + t * t * x;
    cur.y = u * u * y0 + 2 * u * t * my + t * t * y;
    await snap();
  }
}
async function box(sel) {
  const loc = page.locator(`${sel} >> visible=true`).first();
  await loc.waitFor({ state: 'visible', timeout: 20000 });
  return loc.boundingBox();
}
async function moveToEl(sel, ms, { dx = 0.5, dy = 0.5 } = {}) {
  const b = await box(sel);
  await moveTo(b.x + b.width * dx, b.y + b.height * dy, ms);
}
async function click() {
  cur.down = frames(180);
  if (PHONE) await page.touchscreen.tap(cur.x, cur.y);
  else await page.mouse.click(cur.x, cur.y);
  await hold(160);
}
async function typeText(text, cps = 14) {
  const n = Math.ceil((text.length / cps) * FPS);
  let sent = 0;
  for (let i = 1; i <= n; i++) {
    const due = Math.min(text.length, Math.round((i / n) * text.length));
    if (due > sent) { await page.keyboard.type(text.slice(sent, due)); sent = due; }
    await snap();
  }
}
// Smoothly scroll the nearest scrolling box that holds `sel` so it sits at `at` (0 top .. 1 bottom) of the view.
async function scrollTo(sel, ms = 900, at = 0.35) {
  const plan = await page.evaluate(([s, a]) => {
    const el = document.querySelector(s);
    if (!el) return null;
    let sc = el.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (!sc) return null;
    sc.setAttribute('data-promo-sc', '1');
    const er = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    const want = sc.scrollTop + (er.top - sr.top) - sr.height * a;
    return { from: sc.scrollTop, to: Math.max(0, Math.min(want, sc.scrollHeight - sc.clientHeight)) };
  }, [sel, at]);
  if (!plan) { await hold(ms); return; }
  const n = frames(ms);
  for (let i = 1; i <= n; i++) {
    const y = plan.from + (plan.to - plan.from) * ease(i / n);
    await page.evaluate((v) => { document.querySelector('[data-promo-sc]').scrollTop = v; }, y);
    await snap();
  }
  await page.evaluate(() => document.querySelector('[data-promo-sc]')?.removeAttribute('data-promo-sc'));
}
function cue(id) {
  const c = CAPS.find((x) => x.id === id);
  if (!c) throw new Error(`no caption "${id}" for scene ${SCENE}`);
  cues.push({ id, text: c.text, at: frame / FPS });
}
// Open a tab the way a person does: its group key on the header, then the tab.
async function openTab(id, ms = 650) {
  // A second press on an open group closes it, so only press it when the tab isn't showing.
  if (!(await page.locator(`.pc-tab[data-tab-id="${id}"]`).first().isVisible())) {
    await moveToEl(`.pc-group[data-tab-ids~="${id}"]`, ms);
    await click();
    await hold(220);
  }
  await moveToEl(`.pc-tab[data-tab-id="${id}"]`, Math.round(ms * 0.8));
  await click();
}

// ---- the scripts -------------------------------------------------------------
async function ghostRider(d, { tags = false } = {}) {
  cue('artist');
  await hold(700);
  await moveToEl('[data-demo="gr-artist"]', 900, { dx: 0.3 });
  await click();
  await typeText(d.artist, 9);
  await hold(250);
  cue('study');
  await moveToEl('[data-demo="gr-analyze"]', 600);
  await click();
  await hold(1600);
  await page.locator('[data-demo="gr-write"]').first().waitFor({ state: 'attached', timeout: 20000 });
  await hold(900);
  await moveTo(cur.x + 500, cur.y - 60, 900);
  await hold(1200);
  // Topic + Write Lyrics live further down the report pane.
  cue('topic');
  await scrollTo('[data-demo="gr-write"]', 1000, 0.3);
  await moveToEl('[data-demo="gr-write"]', 700, { dx: -1.2 });
  await click();
  await typeText(d.topic, 14);
  await hold(250);
  await moveToEl('[data-demo="gr-write"]', 500);
  await click();
  cue('write');
  await hold(1200);
  await page.locator('[data-demo="gr-send"]').first().waitFor({ timeout: 20000 });
  await hold(300);
  await scrollTo('[data-demo="gr-write"]', 900, 0.08);
  await moveTo(cur.x - 200, cur.y + 180, 900);
  await hold(2600);
  if (tags) {
    cue('tags');
    await scrollTo('[data-promo="suno-tags"]', 1100, 0.3);
    await moveToEl('[data-promo="suno-tags"]', 800, { dx: 0.35, dy: 0.7 });
    await hold(2200);
    cue('copy');
    await moveToEl('[data-promo="suno-copy"]', 650);
    await click();
    await hold(1800);
  }
  await scrollTo('[data-demo="gr-send"]', 1100, 0.7);
  await hold(400);
  cue('send');
  await moveToEl('[data-demo="gr-send"]', 700);
  await click();
  await hold(800);
}

const SCENES = {
  async ghost() {
    await ghostRider(DATA.ghost);

    // ---- SONGWRITER ----
    cue('songwriter');
    await moveTo(900, 640, 800);
    await hold(2600);

    // ---- BLACK HOLE STUDIOS ----
    cue('studio');
    await moveToEl('.pc-group[data-tab-ids^="songwriter"]', 800);
    await click();
    await hold(300);
    await moveToEl('.pc-tab[data-tab-id="onemanband"]', 650);
    await click();
    await hold(1400);
    await page.evaluate(async () => { const bus = await import('/src/services/ghostBus.js'); await bus.runGhostAction('set_length', { seconds: 45 }); });
    await scrollTo('[data-demo="omb-pull"]', 1200, 0.15);
    cue('pull');
    await moveToEl('[data-demo="omb-pull"]', 700);
    await click();
    await hold(1600);
    cue('caption');
    await scrollTo('.omb-picks', 1400, 0.1);
    await moveToEl('.omb-drafted', 800, { dy: 0.4 });
    await hold(2200);
    await scrollTo('[data-demo="omb-make"]', 1200, 0.55);
    cue('make');
    await moveToEl('[data-demo="omb-make"]', 700);
    await click();
    await hold(1500);
    cue('wait');
    await timelapse(2500, 14);
    gate();
    await page.locator('.omb-take audio').first().waitFor({ timeout: 30000 });
    await hold(600);
    await scrollTo('.omb-take', 1200, 0.3);
    cue('song');
    await moveToEl('.omb-take audio', 700, { dx: 0.04 });
    await click();
    await hold(6000);
  },

  // Ghost Rider again, a different artist, and the payoff is the Suno tags.
  async suno() {
    await ghostRider(DATA.suno, { tags: true });
    cue('songwriter');
    await scrollTo('[data-promo="sw-suno"]', 600, 0.1);
    await moveToEl('[data-promo="sw-suno"]', 800, { dx: 0.6, dy: 0.6 });
    await hold(2600);
  },

  async matrix() {
    cue('seeds');
    await hold(600);
    await moveToEl('#ql-kw-input', 900, { dx: 0.25 });
    await click();
    await typeText(DATA.matrix.seeds, 16);
    await hold(300);
    cue('load');
    await moveToEl('[data-demo="ql-load"]', 600);
    await click();
    await hold(1000);
    // Auto-Craft low in the view, so the tiles above it stay on camera while they heat.
    await scrollTo('[data-demo="matrix-autocraft"]', 1300, 0.82);
    await moveTo(cur.x + 260, cur.y + 120, 800);
    await hold(1400);
    cue('craft');
    await moveToEl('[data-demo="matrix-autocraft"]', 700);
    await click();
    cue('heat');
    await moveTo(cur.x - 260, cur.y - 210, 900);
    await timelapse(3200, 4);
    await page.locator('.ql-neural-out').first().waitFor({ state: 'attached', timeout: 30000 });
    await hold(400);
    cue('verses');
    await scrollTo('.ql-neural-out', 1300, 0.15);
    await moveToEl('.ql-neural-out', 800, { dx: 0.3, dy: 0.3 });
    await hold(3800);
  },

  // Every tool, one after another, the way you'd open them.
  async tour() {
    const order = ['songwriter', 'onemanband', 'analyzer', 'songforge', 'quantum',
      'booth', 'voicelab', 'midistudio', 'loopstation', 'stemmer', 'screw', 'mastering',
      'rhyme', 'thesaurus', 'dictionary', 'scratchpad', 'collab', 'toolshub'];
    await hold(400);
    for (const id of order) {
      if (id !== 'songwriter') await openTab(id, 520);
      cue(id);
      await moveTo(cur.x + 140, cur.y + 220, 500);
      await hold(700);
    }
    await hold(600);
  },

  // The phone version, sideways: home grid → Songwriter → tags, topic, write → Black Hole Studios.
  async phone() {
    // The home grid and the All-tools sheet are different buttons; take whichever is showing.
    const tile = (name) => `button:has-text("${name}")`;
    cue('home');
    await hold(1400);
    await moveToEl(tile('Songwriter'), 800);
    await click();
    await hold(900);
    cue('tags');
    await moveToEl('textarea[placeholder^="e.g. stoner rock"]', 700, { dx: 0.3 });
    await click();
    await typeText(DATA.phone.tags, 18);
    await hold(300);
    cue('topic');
    await scrollTo('textarea[placeholder^="e.g. pawn shop"]', 1000, 0.3);
    await moveToEl('textarea[placeholder^="e.g. pawn shop"]', 600, { dx: 0.3 });
    await click();
    await typeText(DATA.phone.topic, 14);
    await hold(300);
    cue('write');
    await scrollTo('[data-demo="sw-generate"]', 1000, 0.6);
    await moveToEl('[data-demo="sw-generate"]', 600);
    await click();
    await hold(1600);
    await page.locator('[data-demo="sw-lines"]').first().waitFor({ state: 'attached', timeout: 20000 });
    cue('lyrics');
    await moveTo(560, 220, 800);
    await hold(1400);
    cue('studio');
    await moveToEl('.mob-icon-btn[aria-label="All tools"]', 700);
    await click();
    await hold(700);
    await moveToEl(tile('Black Hole Studios'), 700);
    await click();
    await hold(1200);
    await page.evaluate(async () => { const bus = await import('/src/services/ghostBus.js'); await bus.runGhostAction('set_length', { seconds: 180 }); });
    await scrollTo('[data-demo="omb-pull"]', 1000, 0.15);
    cue('pull');
    await moveToEl('[data-demo="omb-pull"]', 600);
    await click();
    await hold(900);
    await scrollTo('[data-demo="omb-lyrics"]', 1300, 0.04);
    await moveTo(420, 250, 800);
    await hold(2600);
    cue('make');
    await scrollTo('[data-demo="omb-make"]', 1600, 0.6);
    await moveToEl('[data-demo="omb-make"]', 700);
    await hold(1800);
  },
};

// OpenRouter replies, picked by what the prompt asks for.
function reply(all) {
  const d = SCENE === 'suno' ? DATA.suno : DATA.ghost;
  if (/Style DNA fingerprint as pure JSON/.test(all)) return d.dna;
  if (/music critic/.test(all)) return d.report;
  if (/elite ghostwriter/.test(all)) return `${d.lyrics}\n---SUNO TAGS---\n${d.tags}`;
  if (/surgical lyricist/.test(all)) return /Variant B/.test(all) ? DATA.matrix.verseB : DATA.matrix.verseA;
  if (/professional lyricist and songwriter/.test(all)) return DATA.phone.lyrics;
  console.warn('unmatched prompt:', all.slice(0, 160).replace(/\s+/g, ' '));
  return 'Okay.';
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: W / VW, isMobile: PHONE, hasTouch: PHONE });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));

  await page.route((u) => !/localhost/.test(u.host), async (r) => {
    const url = r.request().url();
    if (/openrouter\.ai/.test(url)) {
      if (r.request().method() === 'GET') return r.fulfill({ json: { data: [{ id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet' }] } });
      let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* */ }
      const all = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
      const text = reply(all);
      await new Promise((res) => setTimeout(res, 700));
      return r.fulfill({ json: { id: 'x', model: 'anthropic/claude-sonnet-4.5', choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] } });
    }
    if (/\.hf\.space/.test(url)) {
      if (/gradio_api\/info/.test(url)) return r.fulfill({ json: { named_endpoints: {} } });
      if (/call\/studio_generate$/.test(url)) return r.fulfill({ json: { event_id: `ev${Math.random().toString(36).slice(2, 8)}` } });
      if (/call\/studio_generate\//.test(url)) {
        await songGate;
        return r.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: complete\ndata: [{"path":"/tmp/gradio/take/song${songExt}"}]\n\n` });
      }
      if (/gradio_api\/file=/.test(url)) return r.fulfill({ status: 200, contentType: songType, body: songBytes });
      if (/compose_assist/.test(url)) return r.abort();
    }
    return r.abort();
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('lyricistBannerMode', 'disc');
    localStorage.setItem('lyricistTipsEnabled', 'false');
    localStorage.setItem('lyricistConfig', JSON.stringify({ openRouterApiKey: 'sk-or-v1-test', model: 'anthropic/claude-sonnet-4.5' }));
  });
  const first = { ghost: 'analyzer', suno: 'analyzer', matrix: 'quantum', tour: 'songwriter', phone: 'songwriter' }[SCENE];
  await page.goto(`http://localhost:5199/#tab=${first}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.addStyleTag({ content: `
    html:root { --brand-banner-h: ${BH}px !important; }
    .bb-mode { display: none !important; }
    .es-webnote, [data-promo-hide] { display: none !important; }
    #promo-ghost { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; will-change: transform; }
    #promo-ghost .ptr { position: absolute; left: -3px; top: -2px; width: 26px; height: 34px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); transition: none; }
    #promo-ghost.down .ptr { transform: scale(.82); transform-origin: 3px 2px; }
    #promo-ghost .ring { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%; border: 3px solid rgba(255,150,70,.9); opacity: 0; }
    #promo-ghost.down .ring { opacity: 1; }
    #promo-ghost .fig { position: absolute; left: 16px; top: 18px; width: 92px; height: 92px; }
    #promo-ghost .fig img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 14px rgba(140,255,200,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.6)); }
    #promo-ghost .tap { position: absolute; left: -17px; top: -17px; width: 34px; height: 34px; border-radius: 50%; background: rgba(255,244,226,.38); border: 2px solid rgba(255,244,226,.85); box-shadow: 0 0 0 4px rgba(255,138,61,.25); }
    #promo-ghost.down .tap { background: rgba(255,138,61,.6); transform: scale(.82); }
  ` });
  await page.evaluate((phone) => {
    // Hide the phone-only note in Black Hole Studios when filming the Windows app.
    const mark = () => {
      if (!phone) document.querySelectorAll('p, div').forEach((el) => {
        if (!el.children.length && /^On the phone, songs run on the free cloud/.test(el.textContent || '')) el.setAttribute('data-promo-hide', '1');
      });
      // Handles for the scenes. The app has no hooks on these, so tag them by what they say.
      document.querySelectorAll('span').forEach((el) => {
        if (/Safe Suno AI Style Keywords/.test(el.textContent || '')) {
          const boxEl = el.parentElement?.parentElement;
          boxEl?.setAttribute('data-promo', 'suno-tags');
          boxEl?.querySelector('button')?.setAttribute('data-promo', 'suno-copy');
        }
      });
      document.querySelectorAll('label').forEach((el) => {
        if (/^Suno Tags$/i.test((el.textContent || '').trim())) el.parentElement?.setAttribute('data-promo', 'sw-suno');
      });
    };
    new MutationObserver(mark).observe(document.body, { childList: true, subtree: true }); mark();
    const g = document.createElement('div');
    g.id = 'promo-ghost';
    g.innerHTML = phone
      ? '<div class="tap"></div>'
      : '<div class="ring"></div><div class="fig"><img src="/src/assets/ghost-sprite.png" alt=""></div>'
        + '<svg class="ptr" viewBox="0 0 26 34"><path d="M3 2 L3 27 L9.5 21 L14 31 L18 29 L13.6 19.4 L22 19.4 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.body.appendChild(g);
  }, PHONE);
  await page.evaluate(() => document.body.classList.remove('tips-on'));
  await page.waitForTimeout(800);
  await page.clock.install();
  await page.clock.runFor(500);

  await SCENES[SCENE]();

  fs.writeFileSync(path.join(__dirname, `cues${SUFFIX}.json`), JSON.stringify({ fps: FPS, frames: frame, cues }, null, 1));
  fs.writeFileSync(path.join(__dirname, `track${SUFFIX}.json`), JSON.stringify({ vw: VW, vh: VH, track }));
  console.log('frames', frame, 'seconds', (frame / FPS).toFixed(1), 'errors', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(async (e) => { console.error(e); fs.writeFileSync(path.join(__dirname, `cues${SUFFIX}.json`), JSON.stringify({ fps: FPS, frames: frame, cues, failed: String(e) }, null, 1)); try { await page.screenshot({ path: path.join(__dirname, `fail${SUFFIX}.jpg`) }); } catch { /* */ } process.exit(1); });
