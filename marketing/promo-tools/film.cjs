// Promo: the Ghost makes a song. Customer build on :5199, scripted model, frame-by-frame capture.
// FPS=30 W=1920 node film.cjs   (preview: FPS=8 W=960)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const fs = require('fs');
const path = require('path');

const FPS = Number(process.env.FPS || 30);
const W = Number(process.env.W || 1920);
const VW = 1600, VH = 900;
const OUT = path.join(__dirname, process.env.OUT || 'frames');
const SONG = process.env.SONG;   // the audio the finished take plays (wav, mp3 or flac)
if (!SONG) throw new Error('Set SONG to an audio file for the finished take.');
const BH = Number(process.env.BH || 250);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const ARTIST = 'Clutch';
const TOPIC = 'a pawn shop guitar';
const LYRICS = `[Verse 1]
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
I play her till the neighbors bang the wall and lose their sleep`;
const TAGS = 'stoner rock, southern rock, heavy blues riffs, fuzz guitar, gritty male vocals, driving drums, live room, 110 BPM';
const REPORT = `LYRICAL STYLE
Tall tales told straight-faced. Truck stops, county fairs, pawn counters and roadside saints, all in plain American speech with a preacher's push behind it.

FLOW & CADENCE
Barked verses that ride right on top of the riff, then a hook you can shout back. Short lines, hard consonants, lots of internal rhyme.

COMMON THEMES
Working men, old machines, back roads, small miracles in ordinary places. Humor first, never a wink.

STYLE DNA
Riff-locked pocket, behind the beat. Balanced rhyme density. Images: truck cabs, county lines, pawn counters, diesel engines.`;

// Every word that can reach the screen, checked against the app's banned list (substring, so no "train" or "brain").
const BANNED = ['neon', 'midnight', 'rain', 'heartbreak', 'cold coffee', 'shadow', 'whisper', 'echo', 'spark', 'cage', 'gravity', 'chain', 'storm'];
const CAPS = require('./captions.json');
for (const [name, s] of Object.entries({ LYRICS, TAGS, REPORT, TOPIC, CAPS: CAPS.map((c) => c.text).join(' ') })) {
  const hit = BANNED.find((w) => s.toLowerCase().includes(w));
  if (hit) throw new Error(`${name} contains "${hit}"`);
}

const songBytes = fs.readFileSync(SONG);
const songType = SONG.endsWith('.mp3') ? 'audio/mpeg' : SONG.endsWith('.flac') ? 'audio/flac' : 'audio/wav';
const songExt = path.extname(SONG);

let frame = 0;
const cues = [];
const track = [];
let page;
const cur = { x: 1100, y: 700, down: 0 };
let gate; const songGate = new Promise((r) => { gate = r; });

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const frames = (ms) => Math.max(1, Math.round((ms / 1000) * FPS));

async function snap(stepMs = 1000 / FPS) {
  const bob = Math.sin((frame / FPS) * 2.6) * 5;
  await page.evaluate(([x, y, b, d]) => {
    const g = document.getElementById('promo-ghost');
    g.style.transform = `translate(${x}px, ${y}px)`;
    g.querySelector('.fig').style.transform = `translateY(${b}px)`;
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
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 20000 });
  return loc.boundingBox();
}
async function moveToEl(sel, ms, { dx = 0.5, dy = 0.5 } = {}) {
  const b = await box(sel);
  await moveTo(b.x + b.width * dx, b.y + b.height * dy, ms);
}
async function click() {
  cur.down = frames(180);
  await page.mouse.click(cur.x, cur.y);
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
  cues.push({ id, text: c.text, at: frame / FPS });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: W / VW });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));

  await page.route((u) => !/localhost/.test(u.host), async (r) => {
    const url = r.request().url();
    if (/openrouter\.ai/.test(url)) {
      if (r.request().method() === 'GET') return r.fulfill({ json: { data: [{ id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet' }] } });
      let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* */ }
      const all = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
      let text = 'Okay.';
      if (/Style DNA fingerprint as pure JSON/.test(all)) text = '{"rhythm":"Riff-locked, a hair behind the beat","rhymeDensity":"balanced","imageClusters":["truck cabs","county lines","pawn counters","diesel engines"],"emotionalTemp":72,"cadenceNotes":"Barked verses, sung hooks"}';
      else if (/music critic/.test(all)) text = REPORT;
      else if (/elite ghostwriter/.test(all)) text = `${LYRICS}\n---SUNO TAGS---\n${TAGS}`;
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
  await page.goto('http://localhost:5199/#tab=analyzer', { waitUntil: 'networkidle' });
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
  ` });
  // Hide the phone-only note in Black Hole Studios (the film is the Windows app).
  await page.evaluate(() => {
    const mark = () => document.querySelectorAll('p, div').forEach((el) => {
      if (!el.children.length && /^On the phone, songs run on the free cloud/.test(el.textContent || '')) el.setAttribute('data-promo-hide', '1');
    });
    new MutationObserver(mark).observe(document.body, { childList: true, subtree: true }); mark();
    const g = document.createElement('div');
    g.id = 'promo-ghost';
    g.innerHTML = '<div class="ring"></div><div class="fig"><img src="/src/assets/ghost-sprite.png" alt=""></div>'
      + '<svg class="ptr" viewBox="0 0 26 34"><path d="M3 2 L3 27 L9.5 21 L14 31 L18 29 L13.6 19.4 L22 19.4 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.body.appendChild(g);
  });
  await page.evaluate(() => document.body.classList.remove('tips-on'));
  await page.waitForTimeout(800);
  await page.clock.install();
  await page.clock.runFor(500);

  // ---- GHOST RIDER ----
  cue('artist');
  await hold(700);
  await moveToEl('[data-demo="gr-artist"]', 900, { dx: 0.3 });
  await click();
  await typeText(ARTIST, 9);
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
  await typeText(TOPIC, 14);
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
  await scrollTo('[data-demo="gr-send"]', 1100, 0.7);
  await hold(400);
  cue('send');
  await moveToEl('[data-demo="gr-send"]', 700);
  await click();
  await hold(800);

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

  fs.writeFileSync(path.join(__dirname, 'cues.json'), JSON.stringify({ fps: FPS, frames: frame, cues }, null, 1));
  fs.writeFileSync(path.join(__dirname, 'track.json'), JSON.stringify({ vw: VW, vh: VH, track }));
  console.log('frames', frame, 'seconds', (frame / FPS).toFixed(1), 'errors', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(async (e) => { console.error(e); fs.writeFileSync(path.join(__dirname, 'cues.json'), JSON.stringify({ fps: FPS, frames: frame, cues, failed: String(e) }, null, 1)); try { await page.screenshot({ path: path.join(__dirname, 'fail.jpg') }); } catch { /* */ } process.exit(1); });
