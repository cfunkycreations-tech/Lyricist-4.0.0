/**
 * OPTIONAL MUSIC FOR THE BANNER. Chris's seven tracks (Desktop\Lyricist Pro\Mastered),
 * levelled to -17 LUFS, each faded in over 3 s and out over 6 s, as 112 kbps mp3s.
 * Off until the music button is pressed (a browser will not start sound on its
 * own, and nobody asked for it). Plays the tracks one after another, starting
 * from a random one, and ducks under the Ghost's voice while a walkthrough runs.
 */
const FILES = import.meta.glob('../../assets/banner-music/*.mp3', { eager: true, query: '?url', import: 'default' });
const TRACKS = Object.keys(FILES).sort().map((k) => ({
  url: FILES[k],
  title: k.split('/').pop().replace(/^\d+-/, '').replace(/\.mp3$/, '').split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
}));

const LEVEL = 0.6;
const DUCKED = 0.08;
const listeners = new Set();
let audio = null;
let index = -1;
let playing = false;
let duckTimer = 0;

const emit = () => listeners.forEach((fn) => fn(snapshot()));
const snapshot = () => ({ playing, title: playing && TRACKS[index] ? TRACKS[index].title : '', available: TRACKS.length > 0 });

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.volume = LEVEL;
  audio.addEventListener('ended', () => next());
  audio.addEventListener('error', () => { if (playing) next(); });
  return audio;
}

function load(i) {
  index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  ensure().src = TRACKS[index].url;
  return audio.play().catch(() => { playing = false; emit(); });
}

function next() { if (playing) { load(index + 1); emit(); } }

export function startMusic() {
  if (!TRACKS.length || playing) return;
  playing = true;
  // The play() call has to happen inside the tap, or iPhone refuses it.
  load(index < 0 ? Math.floor(Math.random() * TRACKS.length) : index);
  clearInterval(duckTimer);
  duckTimer = setInterval(() => {
    const talking = document.querySelector('.ghost-demo-root, .pg-root');
    if (audio) audio.volume = talking ? DUCKED : LEVEL;
  }, 500);
  emit();
}

export function stopMusic() {
  playing = false;
  clearInterval(duckTimer);
  audio?.pause();
  emit();
}

export const toggleMusic = () => (playing ? stopMusic() : startMusic());
export const skipMusic = () => { if (playing) next(); };
export const musicState = snapshot;
export function subscribeMusic(fn) { listeners.add(fn); return () => listeners.delete(fn); }
