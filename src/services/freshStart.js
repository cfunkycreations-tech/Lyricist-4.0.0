/**
 * CLOSE THE APP AND THE WORK IS GONE. THE KEYS AND SETTINGS STAY.
 *
 * Chris, 2026-10-10: "When you close the app, everything resets. Except the
 * API key... the reports, the lyrics, if you haven't saved them, that's your
 * own fault." And: "I think that's what's fucking this ghost up." He was
 * right. Picks, topic, Suno tags, the Ghost Rider report, the Style DNA, the
 * Ghost's jobs: each was made to survive a restart one fix at a time, nobody
 * ever cleared them, and a song from two songs back kept turning up in the
 * Ghost's context and on screen.
 *
 * So the work below is wiped every time the app is opened. A reload in the
 * middle of a run is the same launch and keeps it. What stays is everything
 * not on this list: the keys and settings (lyricistConfig), the look, the
 * Ghost's voice and toggles, and whatever he saved himself (reports, lyrics,
 * recordings, lessons, the DNA library, presets).
 *
 * Imported first in main.jsx, before any module reads these keys.
 */
const WORK = [
  'lyricistLyrics', 'lyricistLyrics.corrupt',   // Songwriter's song
  'lyricistPicks',                               // genre, subgenre, mood, voice, topic, artist, notes, Suno tags
  'lyricist.ghost.sunoTags',                     // the saved Suno tags the caption starts from
  'lyricistStyleDNAPressure',                    // Style DNA sent to The Matrix
  'lyricistGhostRiderSession',                   // Ghost Rider's artist, report, song
  'lyricistQuantumJournal', 'lyricistLoopHandshake',
  'lyricist.ghost.jobs', 'lyricist.ghost.flight', // the Ghost's jobs and the in-app log (the disk log keeps it)
  'lyricistModelsThatFailed',                    // last run's model failures, so every model gets a fresh try
  'lyricistScratchpad', 'lyricistVoiceLabScript',
  'lyricistMasteringStudio_v1', 'lyricistAlbumArchitect_v1', 'lyricistMidiStudio',
];
const LAUNCH_KEY = 'lyricist.launch';

function thisLaunch() {
  const id = typeof window !== 'undefined' ? window.lyricistAPI?.launchId : '';
  if (id) return id;
  // A browser tab: a reload keeps it, closing the tab starts fresh.
  try {
    let tab = sessionStorage.getItem(LAUNCH_KEY);
    if (!tab) { tab = `tab-${Date.now()}`; sessionStorage.setItem(LAUNCH_KEY, tab); }
    return tab;
  } catch { return ''; }
}

try {
  const id = thisLaunch();
  if (id && localStorage.getItem(LAUNCH_KEY) !== id) {
    WORK.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(LAUNCH_KEY, id);
  }
} catch { /* storage blocked: nothing was kept either */ }
