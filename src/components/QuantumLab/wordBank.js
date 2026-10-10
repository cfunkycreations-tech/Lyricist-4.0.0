// ============================================================
// Quantum Lab — seed word bank + minimal PronouncingService
//
// The vendored lyric-core engine (src/core) is framework-agnostic and
// normally leans on CMUdict for phonetics. The Quantum Lab is a live,
// engine-wired *demo surface*, so instead of shipping the ~125k-word
// dictionary we hand-author lightweight phonetics for a fixed seed
// grid. Every field the engine actually reads — stress, rhymeClass,
// energy, isWordFinal — is populated, so evolve()/collapse()/
// crystallize()/scoreSection()/mutateDNA() all run for real.
// ============================================================

// The 4×5 lattice from the mockups (row-major). The last word of each
// row is the line-final / end-rhyme cell. Ends: hums·drums (A),
// glows·flows (B) → an AABB scheme, exactly like the render.
export const SEED_GRID = [
  ['static', 'signal', 'fever', 'lattice', 'hums'],
  ['lamplight', 'amber', 'ember', 'ember', 'drums'],
  ['lamplight', 'signal', 'static', 'river', 'glows'],
  ['gravel', 'fever', 'static', 'amber', 'flows'],
];

// Per-cell stress bits (1 = strong). Chosen so extractDNA's signature
// reads 10111-10111-00011-01001 — exactly the render's DNA panel.
export const STRESS_GRID = [
  [1, 0, 1, 1, 1],
  [1, 0, 1, 1, 1],
  [0, 0, 0, 1, 1],
  [0, 1, 0, 0, 1],
];

// Per-word phonetic seed. rhymeClass is a coarse rime label (shared
// label ⇒ the engine treats them as rhyming). stress: 1 = strong.
// energy seeds the cellular-automata field (0..1) so the opening
// glow pattern matches the render (fever / glows run hot).
export const WORD_SEED = {
  static:   { stress: 1, rhymeClass: 'AT_IK',  energy: 0.20 },
  signal:   { stress: 1, rhymeClass: 'IG_NL',  energy: 0.16 },
  fever:    { stress: 1, rhymeClass: 'EE_VER', energy: 0.82 },
  lattice:  { stress: 1, rhymeClass: 'AT_IS',  energy: 0.34 },
  hums:     { stress: 1, rhymeClass: 'UH_MZ',  energy: 0.44 },
  lamplight: { stress: 1, rhymeClass: 'AY_T',  energy: 0.24 },
  amber:    { stress: 1, rhymeClass: 'AM_BER', energy: 0.30 },
  ember:    { stress: 1, rhymeClass: 'EM_BER', energy: 0.36 },
  drums:    { stress: 1, rhymeClass: 'UH_MZ',  energy: 0.52 },
  river:    { stress: 1, rhymeClass: 'IH_VER', energy: 0.30 },
  glows:    { stress: 1, rhymeClass: 'OW_ZZ',  energy: 0.74 },
  gravel:   { stress: 1, rhymeClass: 'AV_EL',  energy: 0.22 },
  flows:    { stress: 1, rhymeClass: 'OW_ZZ',  energy: 0.60 },
  // extra rhyming stock so Crystallize / Mutate have somewhere to go
  numbs:    { stress: 1, rhymeClass: 'UH_MZ',  energy: 0.30 },
  strums:   { stress: 1, rhymeClass: 'UH_MZ',  energy: 0.30 },
  crumbs:   { stress: 1, rhymeClass: 'UH_MZ',  energy: 0.30 },
  slows:    { stress: 1, rhymeClass: 'OW_ZZ',  energy: 0.30 },
  grows:    { stress: 1, rhymeClass: 'OW_ZZ',  energy: 0.30 },
  goes:     { stress: 1, rhymeClass: 'OW_ZZ',  energy: 0.30 },
};

// Superposition candidate pools — words that could occupy an "open"
// cell. Keyed by the cell's current word; measuring collapses onto one.
export const CANDIDATE_POOL = {
  fever:  ['fever', 'ember', 'never', 'over'],
  static: ['static', 'panic', 'attic', 'frantic'],
  signal: ['signal', 'single', 'symbol', 'signet'],
  amber:  ['amber', 'ember', 'timber', 'number'],
  river:  ['river', 'shiver', 'quiver', 'sliver'],
  glows:  ['glows', 'flows', 'grows', 'goes'],
};

const rimeOf = (w) => (WORD_SEED[w]?.rhymeClass) ?? 'X_' + w.slice(-2).toUpperCase();

/**
 * A tiny PronouncingService-shaped object good enough for the engine
 * functions the Quantum Lab calls (crystallize + candidate building).
 * Every word is treated as a single stressed syllable.
 */
export const bankService = {
  getPrimary(word) {
    const w = String(word || '').toLowerCase();
    if (!w) return null;
    const seed = WORD_SEED[w];
    return {
      phones: [],
      syllableCount: 1,
      stressPattern: [seed?.stress ?? 1],
      rhymeClass: rimeOf(w),
      source: 'manual',
      variantIndex: 0,
    };
  },
  getPronunciations(word) {
    const p = this.getPrimary(word);
    return p ? [p] : [];
  },
  syllabify(phones) { return phones.length ? [phones] : []; },
  getRhymeClass() { return null; },
  findRhymes(word, options = {}) {
    const cls = rimeOf(String(word || '').toLowerCase());
    return this.rhymesForClass(cls).slice(0, options.maxResults ?? 20);
  },
  // used by crystallize()
  rhymesForClass(cls) {
    return Object.keys(WORD_SEED).filter((w) => WORD_SEED[w].rhymeClass === cls);
  },
};
