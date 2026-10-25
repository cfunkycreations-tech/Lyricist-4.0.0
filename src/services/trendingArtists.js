// Who is trending on TikTok, for the Ghost's Ghost Rider demo to type in.
// Chris, 2026-10-25: his promo lives on TikTok, and the demo typed Kendrick
// Lamar every time. No chart ranks ARTISTS, so these three are the names that
// showed up on the most current lists that week:
//   Tate McRae    "Housewife" (out Oct 15): top sound by creator count, #1 Spotify Global
//   Taylor Swift  "Patient Zero": #1 on the Hot 100, the TikTok wedding trend
//   Harry Styles  "Coming Up Roses": top of the US weekly TikTok sounds list
// To refresh: change the list and `TRENDING_AS_OF`. The demo's spoken lines
// never say the name, so nothing needs re-baking.
export const TRENDING_AS_OF = '2026-10-25';
export const TRENDING_ARTISTS = ['Tate McRae', 'Taylor Swift', 'Harry Styles'];

const KEY = 'lyricist.ghost.trendIdx';

/** The next name in the cycle, so back-to-back demos never type the same one. */
export function nextTrendingArtist() {
  const n = TRENDING_ARTISTS.length;
  let i;
  try {
    i = (parseInt(localStorage.getItem(KEY) || '-1', 10) + 1) % n;
    if (!(i >= 0)) i = 0;
    localStorage.setItem(KEY, String(i));
  } catch {
    i = Math.floor(Math.random() * n); // storage blocked: still not the same name every time
  }
  return TRENDING_ARTISTS[i];
}
