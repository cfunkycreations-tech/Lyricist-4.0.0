// What "done" looks like on a tool, for the phone Ghost's waits: the promo runs
// (promoScripts.js) and the live walkthroughs (phoneGhostScripts.js). DOM reads
// only and no imports, so the clip scripts can still load the scripts in node.

const $ = (sel) => document.querySelector(sel);
const text = (sel) => ($(sel)?.textContent || '').trim();

export const inPane = (tab, sel) => $(`[data-tab-pane="${tab}"] ${sel}`);
export const shownPane = (tab) => {
  const p = $(`[data-tab-pane="${tab}"]`);
  return !!p && p.style.display !== 'none';
};

/** A Ghost Rider call came back with an error: stop instead of hanging there. */
export const riderFailed = () => !!inPane('analyzer', '.pill-red');
/** The report is in and Analyze has stopped. */
export const riderAnalyzed = () => riderFailed()
  || (!!text('[data-tab-pane="analyzer"] [data-demo="gr-report"]') && !/Analyzing/.test(text('[data-demo="gr-analyze"]')));
/** The song is in and Write Lyrics has stopped. */
export const riderWritten = () => riderFailed()
  || (!!text('[data-demo="gr-lyrics"] pre') && !/Writing/.test(text('[data-demo="gr-write"]')));
/** Style DNA and the 20 words are made after the song lands, with their Send buttons. */
export const riderExtrasReady = () => !!$('[data-demo="gr-dna-send"]') && !!$('[data-demo="gr-words-send"]');

/** Auto-Craft stays disabled until both songs are written and checked. */
export const matrixBusy = () => !!$('[data-demo="matrix-autocraft"]')?.disabled;
export const matrixHasSongs = () => !!$('[data-demo="ql-send-song-a"]');
