/**
 * WHAT ONE TAB HANDS THE NEXT when the Ghost runs a pipeline.
 *
 * Chris's test: study an artist, write in their style, SAVE THE SUNO TAGS, ...
 * finish the song in Black Hole Studios with MiniMax's caption skill. The skill
 * refused because the Input Caption was empty, while the tags that describe the
 * sound were sitting on Ghost Rider. They are saved here and picked up there.
 */

const TAGS_KEY = 'lyricist.ghost.sunoTags';

export function saveSunoTags(tags, artist = '') {
  const value = String(tags || '').trim();
  if (!value) return;
  try { localStorage.setItem(TAGS_KEY, JSON.stringify({ tags: value, artist, savedAt: Date.now() })); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent('lyricist:suno-tags', { detail: { tags: value, artist } }));
}

export function readSunoTags() {
  try { return JSON.parse(localStorage.getItem(TAGS_KEY) || 'null'); } catch { return null; }
}

/**
 * "Pick a random artist and don't interrupt again." A spread of eras and genres
 * with real, well documented catalogs, so the study has something to study.
 */
const ARTISTS = [
  'Radiohead', 'Kendrick Lamar', 'Fleetwood Mac', 'OutKast', 'Frank Ocean', 'Johnny Cash',
  'Missy Elliott', 'The Cure', 'Lauryn Hill', 'Tom Petty', 'SZA', 'Nirvana', 'Stevie Wonder',
  'Tyler, the Creator', 'Dolly Parton', 'Arctic Monkeys', 'Erykah Badu', 'Nas', 'Lana Del Rey',
  'Prince', 'Bon Iver', 'Amy Winehouse', 'UGK', 'Phoebe Bridgers', 'Talking Heads', 'Andre 3000',
  'Chris Stapleton', 'Björk', 'MF DOOM', 'Fiona Apple',
];
export const randomArtist = () => ARTISTS[Math.floor(Math.random() * ARTISTS.length)];
