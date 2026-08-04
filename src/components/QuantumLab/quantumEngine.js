// ============================================================
// Quantum Lab — engine adapter
//
// Bridges the vendored lyric-core modules (src/core, compiled from
// @lyricist/lyric-core) to the React tab. Builds a real Section →
// Lattice from the seed grid and exposes one function per control:
//   runGens      → automata.evolve       (energy diffusion)
//   spotlight    → automata.spotlight    (inject heat)
//   measureCell  → superposition.collapse / entanglement.measure
//   crystallize  → automata.crystallize  (rhyme contagion)
//   mutate/inject→ dna.mutateDNA / dna.extractDNA
//   score        → scorer.scoreSection
// Every call is defensive: a thrown engine error degrades to a
// visual-only fallback rather than crashing the tab.
// ============================================================
import { Lattice } from '../../core/lattice.js';
import { evolve, spotlight as caSpotlight, crystallize as caCrystallize } from '../../core/automata.js';
import { collapse, putInSuperposition } from '../../core/superposition.js';
import { entangle, cellIndex, measure } from '../../core/entanglement.js';
import { extractDNA, mutateDNA } from '../../core/dna.js';
import { scoreSection } from '../../core/scorer.js';
import { SEED_GRID, STRESS_GRID, WORD_SEED, CANDIDATE_POOL, bankService } from './wordBank.js';

let _id = 0;
const uid = (p) => `${p}_${_id++}`;

// AABB: rows 0&1 share slot A, rows 2&3 share slot B.
const ROW_SLOT = ['A', 'A', 'B', 'B'];
const ROWS = 4;
const COLS = 5;
const CELL_COUNT = ROWS * COLS;

/** Coarse rime class for any user-typed word/phrase (engine needs a label). */
function rhymeClassFor(word) {
  const w = String(word || '').toLowerCase().trim();
  if (!w) return 'X';
  if (WORD_SEED[w]) return WORD_SEED[w].rhymeClass;
  // last token if multi-word phrase; use last 3 letters as a soft rime bucket
  const last = w.split(/\s+/).pop() || w;
  const tail = last.replace(/[^a-z]/g, '').slice(-3).toUpperCase() || 'X';
  return `U_${tail}`;
}

function seedMeta(word) {
  const key = String(word || '').toLowerCase().trim();
  if (WORD_SEED[key]) return { ...WORD_SEED[key] };
  return {
    stress: 1,
    rhymeClass: rhymeClassFor(key),
    energy: 0.28 + (Math.abs(hashStr(key)) % 40) / 100, // mild variety 0.28–0.67
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function makeCell(word, r, c, isFinal, { userOwned = false } = {}) {
  const text = String(word || '').trim() || '—';
  const seed = seedMeta(text);
  const pool = CANDIDATE_POOL[text.toLowerCase()];
  // User-owned words are locked to THEIR text — no random swap pool
  const isSuper = !userOwned && !isFinal && Array.isArray(pool);
  const stress = STRESS_GRID[r]?.[c] ?? seed.stress;
  return {
    id: `c_${r}_${c}`,
    text,
    phones: [],
    stress,
    rhymeClass: seed.rhymeClass,
    isWordFinal: true,
    energy: seed.energy,
    age: 0,
    frozen: false,
    userOwned: !!userOwned, // Chris typed this — don't inject/replace casually
    phoneticSource: 'manual',
    isSuperposition: isSuper,
    candidates: isSuper
      ? pool.map((t, i) => ({
          text: t,
          phones: [],
          stress: (WORD_SEED[t]?.stress) ?? 1,
          rhymeClass: (WORD_SEED[t]?.rhymeClass) ?? bankService.getPrimary(t).rhymeClass,
          amplitude: i === 0 ? 0.4 : 0.6 / (pool.length - 1),
        }))
      : undefined,
    row: r, col: c,
  };
}

/** Default demo lattice (mockup seed). */
export function buildSection() {
  return buildSectionFromGrid(SEED_GRID, { userOwned: false });
}

/**
 * Build a section from a 4×5 (or jagged) grid of strings.
 * Cells can be multi-word phrases ("cold rain").
 */
export function buildSectionFromGrid(grid, { userOwned = true } = {}) {
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    const rowWords = grid[r] || [];
    const cells = [];
    for (let c = 0; c < COLS; c++) {
      const w = rowWords[c] != null && String(rowWords[c]).trim() !== ''
        ? String(rowWords[c]).trim()
        : (SEED_GRID[r]?.[c] || 'void');
      cells.push(makeCell(w, r, c, c === COLS - 1, { userOwned }));
    }
    lines.push({
      id: uid('line'),
      sectionType: 'verse',
      rhymeSchemeSlot: ROW_SLOT[r],
      frozen: false,
      energy: 0,
      cells,
    });
  }
  return { id: uid('sec'), type: 'verse', lines, frozen: false };
}

/**
 * Parse freeform keywords into tokens.
 * Accepts commas, newlines, pipes, or spaces between single words.
 * Quoted "cold rain" or multi-word segments separated only by commas/newlines stay together.
 */
export function parseKeywords(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  // Prefer comma / newline / pipe as phrase separators (so multi-word keywords work)
  if (/[,\n|;]/.test(s)) {
    return s.split(/[,\n|;]+/).map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  // Otherwise space-separated single words
  return s.split(/\s+/).map((t) => t.trim()).filter(Boolean);
}

/**
 * Fill a 4×5 grid from a keyword list (cycles if short, truncates if long).
 * Last word of each row is the end-rhyme slot (same as the mockup lattice).
 */
export function keywordsToGrid(keywords) {
  const list = (keywords && keywords.length) ? keywords : ['void'];
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(list[(r * COLS + c) % list.length]);
    }
    grid.push(row);
  }
  return grid;
}

/** Build lattice from a raw keyword string (user-owned). */
export function buildSectionFromKeywords(raw) {
  const words = parseKeywords(raw);
  if (!words.length) return buildSection();
  return buildSectionFromGrid(keywordsToGrid(words), { userOwned: true });
}

/** Replace one cell's text (user owns it after edit). */
export function setCellText(section, cellId, text) {
  const next = clone(section);
  const t = String(text || '').trim();
  if (!t) return next;
  for (const ln of next.lines) {
    for (const cell of ln.cells) {
      if (cell.id === cellId) {
        const meta = seedMeta(t);
        cell.text = t;
        cell.rhymeClass = meta.rhymeClass;
        cell.userOwned = true;
        cell.isSuperposition = false;
        cell.candidates = undefined;
        // keep energy/stress/frozen as-is so heat work isn't wiped
        break;
      }
    }
  }
  return next;
}

/** Entangle repeated words (same text) + the AABB end-rhyme pairs. */
export function buildEntanglements(section) {
  const links = [];
  const byText = new Map();
  section.lines.forEach((ln) =>
    ln.cells.forEach((cell) => {
      const key = cell.text;
      if (byText.has(key)) links.push(entangle(byText.get(key), cell.id, 'rhyme', 0.7));
      else byText.set(key, cell.id);
    })
  );
  // end-rhyme entanglements (line-final cells that share a slot)
  const finals = section.lines.map((ln) => ln.cells[ln.cells.length - 1]);
  if (finals[0] && finals[1]) links.push(entangle(finals[0].id, finals[1].id, 'rhyme', 0.9));
  if (finals[2] && finals[3]) links.push(entangle(finals[2].id, finals[3].id, 'rhyme', 0.9));
  return links;
}

const clone = (section) => JSON.parse(JSON.stringify(section));

/** Run the energy cellular-automata for N generations. Returns a new section. */
export function runGens(section, generations = 12) {
  const next = clone(section);
  try {
    const lat = Lattice.fromSection(next);
    evolve(lat, generations, { diffusion: 0.22, decay: 0.05 });
    return { section: lat.toSection(), ok: true };
  } catch (e) {
    return { section: next, ok: false, error: String(e) };
  }
}

/** Pour heat into a single cell's row/col neighborhood. */
export function spotlightCell(section, r, c, amount = 0.45) {
  const next = clone(section);
  try {
    const lat = Lattice.fromSection(next);
    caSpotlight(lat, [Math.max(0, r - 0), r], [Math.max(0, c - 1), Math.min(next.lines[r].cells.length - 1, c + 1)], amount);
    return { section: lat.toSection(), ok: true };
  } catch (e) {
    return { section: next, ok: false, error: String(e) };
  }
}

/** Collapse one superposition cell (propagating to entangled partners). */
export function measureCell(section, cellId, links) {
  const next = clone(section);
  try {
    const ctx = { cells: cellIndex(next), links: links || [] };
    const cell = ctx.cells.get(cellId);
    if (cell && cell.isSuperposition && cell.candidates?.length) {
      putInSuperposition(cell, cell.candidates);
    }
    const { collapsed, reweighted } = measure(cellId, ctx);
    if (collapsed && cell) {
      cell.text = collapsed.text;
      cell.stress = collapsed.stress ?? cell.stress;
      cell.rhymeClass = collapsed.rhymeClass ?? cell.rhymeClass;
      cell.isSuperposition = false;
    }
    return { section: next, collapsed, reweighted, ok: true };
  } catch (e) {
    return { section: next, ok: false, error: String(e) };
  }
}

/** Simple standalone collapse (no entanglement) for arbitrary cells. */
export function collapseCell(section, cellId) {
  const next = clone(section);
  try {
    for (const ln of next.lines) {
      const cell = ln.cells.find((x) => x.id === cellId);
      if (cell && cell.candidates?.length) {
        putInSuperposition(cell, cell.candidates);
        const chosen = collapse(cell);
        if (chosen) {
          cell.text = chosen.text;
          cell.stress = chosen.stress ?? cell.stress;
          cell.rhymeClass = chosen.rhymeClass ?? cell.rhymeClass;
          cell.isSuperposition = false;
        }
        break;
      }
    }
    return { section: next, ok: true };
  } catch (e) {
    return { section: next, ok: false, error: String(e) };
  }
}

/** Crystallize: hot line-final cells adopt the dominant rhyme (contagion).
 *  User-owned cells keep THEIR text — only non-user demo cells may swap. */
export function crystallizeLab(section, seed = 7) {
  const next = clone(section);
  // snapshot user text so engine swaps can't steal Chris's keywords
  const userSnap = new Map();
  next.lines.forEach((ln) =>
    ln.cells.forEach((cell) => {
      if (cell.userOwned) userSnap.set(cell.id, { text: cell.text, rhymeClass: cell.rhymeClass });
    })
  );
  try {
    const lat = Lattice.fromSection(next);
    const changed = caCrystallize(lat, bankService, { threshold: 0.45, seed });
    const out = lat.toSection();
    out.lines.forEach((ln) =>
      ln.cells.forEach((cell) => {
        if (userSnap.has(cell.id)) {
          const u = userSnap.get(cell.id);
          cell.text = u.text;
          cell.rhymeClass = u.rhymeClass;
          cell.userOwned = true;
          cell.isSuperposition = false;
          cell.candidates = undefined;
          return;
        }
        if (cell.isSuperposition && cell.candidates?.length) {
          putInSuperposition(cell, cell.candidates);
          const chosen = collapse(cell);
          if (chosen) { cell.text = chosen.text; cell.rhymeClass = chosen.rhymeClass ?? cell.rhymeClass; }
          cell.isSuperposition = false;
        }
      })
    );
    return { section: out, changed, ok: true };
  } catch (e) {
    return { section: next, changed: 0, ok: false, error: String(e) };
  }
}

export function freezeCell(section, cellId, frozen) {
  const next = clone(section);
  for (const ln of next.lines)
    for (const cell of ln.cells)
      if (cell.id === cellId) cell.frozen = frozen ?? !cell.frozen;
  return next;
}

/** DNA fingerprint of the current section. createdAt passed in (no Date in engine). */
export function dnaOf(section, createdAt = 0) {
  try { return extractDNA(section, createdAt); }
  catch { return null; }
}

/** Mutate the section's DNA (flip some stress bits). Returns new DNA. */
export function mutate(dna, seed = 3) {
  try { return mutateDNA(dna, { seed, rate: 0.25 }); }
  catch { return dna; }
}

/** Write a stress signature (e.g. "10111-...") back onto the cells. */
export function applyStressSignature(section, sig) {
  const next = clone(section);
  const rows = String(sig).split('-');
  next.lines.forEach((ln, i) => {
    const bits = rows[i] || '';
    ln.cells.forEach((cell, j) => {
      if (bits[j] !== undefined && !cell.frozen) cell.stress = bits[j] === '1' ? 1 : 0;
    });
  });
  return next;
}

/** MUTATE: flip some stress bits via the engine, reflect back on the grid. */
export function mutateSection(section, seed = 3) {
  const dna = dnaOf(section, 0);
  if (!dna) return { section, ok: false };
  const m = mutate(dna, seed);
  return { section: applyStressSignature(section, m.stressSignature), dna: m, ok: true };
}

/** INJECT: vary word choices in candidate cells, keep meter/structure.
 *  Never overwrites cells the user typed (userOwned) or froze. */
export function injectSection(section, seed = 5) {
  const next = clone(section);
  let a = (seed >>> 0) || 1;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  next.lines.forEach((ln) =>
    ln.cells.forEach((cell) => {
      if (cell.userOwned || cell.frozen) return;
      const pool = CANDIDATE_POOL[cell.text.toLowerCase?.() ? cell.text.toLowerCase() : cell.text];
      if (pool) {
        const pick = pool[Math.floor(rnd() * pool.length)];
        const seed2 = WORD_SEED[pick];
        cell.text = pick;
        if (seed2) cell.rhymeClass = seed2.rhymeClass;
      }
    })
  );
  return { section: next, ok: true };
}

/** Lock (freeze) or unlock every cell in the section. */
export function lockSection(section, frozen = true) {
  const next = clone(section);
  next.frozen = frozen;
  next.lines.forEach((ln) => { ln.frozen = frozen; ln.cells.forEach((c) => { c.frozen = frozen; }); });
  return next;
}

/** Full multi-objective score for the current section. */
export function scoreOf(section) {
  try { return scoreSection(section); }
  catch { return { rhymeStrength: 0, stressFidelity: 0.5, semanticCoherence: 0.5, energyBalance: 0.5, novelty: 0.5, overall: 0.5 }; }
}


