/**
 * Quantum Lab advanced features — pure helpers + localStorage bridges.
 * 1 DNA library  2 contracts  3 superposition  5 truth meter
 * 6 stress view  7 loop handshake  8 style pressure  9 journal
 */

import { dnaOf, scoreOf, applyStressSignature, setCellText, parseKeywords } from './quantumEngine.js';
import { extractDNA, mutateDNA, dnaDistance } from '../../core/dna.js';
import { putInSuperposition } from '../../core/superposition.js';
import { CANDIDATE_POOL, WORD_SEED, bankService } from './wordBank.js';

const DNA_LIB_KEY = 'lyricistQuantumDNALibrary';
const JOURNAL_KEY = 'lyricistQuantumJournal';
const STYLE_DNA_KEY = 'lyricistStyleDNAPressure';
const LOOP_HANDSHAKE_KEY = 'lyricistLoopHandshake';
const VAULT_KEY = 'lyricistLyricVault'; // past lines for originality

const clone = (s) => JSON.parse(JSON.stringify(s));

// ─── 1. DNA Library ───────────────────────────────────────────
export function loadDNALibrary() {
  try {
    const raw = localStorage.getItem(DNA_LIB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDNALibrary(list) {
  localStorage.setItem(DNA_LIB_KEY, JSON.stringify(list.slice(0, 40)));
}

export function saveDNAFromSection(section, name = '') {
  const dna = extractDNA(section, Date.now());
  if (!dna) return null;
  const entry = {
    id: `dna_${Date.now()}`,
    name: name.trim() || `DNA ${new Date().toLocaleString()}`,
    dna,
    createdAt: Date.now(),
  };
  const lib = loadDNALibrary();
  lib.unshift(entry);
  saveDNALibrary(lib);
  return entry;
}

export function mutateStoredDNA(entry, seed = 3) {
  if (!entry?.dna) return entry;
  return {
    ...entry,
    dna: mutateDNA(entry.dna, { seed, rate: 0.25 }),
    name: `${entry.name} (mutated)`,
    id: `dna_${Date.now()}`,
  };
}

/** Inject DNA: apply stress signature + rhyme scheme slots onto section. */
export function injectDNAOntoSection(section, dna) {
  if (!dna) return { section, ok: false };
  let next = applyStressSignature(section, dna.stressSignature);
  next = clone(next);
  const scheme = String(dna.rhymeScheme || '');
  next.lines.forEach((ln, i) => {
    if (scheme[i] && scheme[i] !== '.') {
      ln.rhymeSchemeSlot = scheme[i];
    }
    // Mark end cells with scheme letter for contracts
    const last = ln.cells[ln.cells.length - 1];
    if (last && scheme[i] && scheme[i] !== '.') {
      last.dnaRhymeSlot = scheme[i];
    }
  });
  return { section: next, ok: true, dna };
}

// ─── 2. Entanglement contracts ────────────────────────────────
/** Manual contract between two cell ids. */
export function makeContract(aId, bId, type = 'rhyme', strength = 0.9) {
  return {
    id: `ctr_${aId}_${bId}_${Date.now()}`,
    aId,
    bId,
    type, // rhyme | contrast | callback
    strength,
    manual: true,
  };
}

/**
 * Check rhyme contracts after crystallize / before neural.
 * Returns { ok, violations: [{ contract, reason, aText, bText }] }
 */
export function checkContracts(section, contracts) {
  const byId = new Map();
  section.lines.forEach((ln) => ln.cells.forEach((c) => byId.set(c.id, c)));
  const violations = [];
  for (const ctr of contracts || []) {
    const a = byId.get(ctr.aId);
    const b = byId.get(ctr.bId);
    if (!a || !b) continue;
    if (ctr.type === 'rhyme') {
      const same = a.rhymeClass && b.rhymeClass && a.rhymeClass === b.rhymeClass;
      const soft =
        a.rhymeClass &&
        b.rhymeClass &&
        String(a.rhymeClass).slice(-2) === String(b.rhymeClass).slice(-2);
      if (!same && !soft) {
        violations.push({
          contract: ctr,
          reason: 'Rhyme contract broken — end classes do not match',
          aText: a.text,
          bText: b.text,
        });
      }
    } else if (ctr.type === 'contrast') {
      if (a.rhymeClass && a.rhymeClass === b.rhymeClass) {
        violations.push({
          contract: ctr,
          reason: 'Contrast contract broken — partners rhyme when they should differ',
          aText: a.text,
          bText: b.text,
        });
      }
    } else if (ctr.type === 'callback') {
      // same word or shared token
      const at = String(a.text).toLowerCase();
      const bt = String(b.text).toLowerCase();
      if (at !== bt && !at.includes(bt) && !bt.includes(at)) {
        violations.push({
          contract: ctr,
          reason: 'Callback contract — words should echo each other',
          aText: a.text,
          bText: b.text,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// ─── 3. Superposition open ────────────────────────────────────
export function openCellSuperposition(section, cellId, extraWords = []) {
  const next = clone(section);
  for (const ln of next.lines) {
    for (const cell of ln.cells) {
      if (cell.id !== cellId) continue;
      if (cell.frozen || cell.userOwned) {
        // Still allow user to open options, but mark userOwned false for candidates only
      }
      const pool = [
        cell.text,
        ...(CANDIDATE_POOL[String(cell.text).toLowerCase()] || []),
        ...extraWords,
      ].filter(Boolean);
      const uniq = [...new Set(pool.map((w) => String(w).trim()).filter(Boolean))].slice(0, 6);
      if (uniq.length < 2) {
        // invent soft alternatives from bank if possible
        const alt = Object.keys(WORD_SEED).slice(0, 4);
        uniq.push(...alt.filter((w) => w !== cell.text));
      }
      const words = [...new Set(uniq)].slice(0, 6);
      const candidates = words.map((w, i) => {
        const seed = WORD_SEED[w.toLowerCase()];
        let rhymeClass = seed?.rhymeClass;
        try {
          rhymeClass = rhymeClass || bankService.getPrimary(w)?.rhymeClass || null;
        } catch {
          /* */
        }
        return {
          text: w,
          phones: [],
          stress: seed?.stress ?? 1,
          rhymeClass: rhymeClass || null,
          amplitude: i === 0 ? 0.35 : 0.65 / Math.max(1, words.length - 1),
        };
      });
      putInSuperposition(cell, candidates);
      return next;
    }
  }
  return next;
}

export function setCandidateAmplitude(section, cellId, candidateText, amplitude) {
  const next = clone(section);
  for (const ln of next.lines) {
    const cell = ln.cells.find((c) => c.id === cellId);
    if (!cell?.candidates) continue;
    for (const c of cell.candidates) {
      if (c.text === candidateText) c.amplitude = Math.max(0.01, amplitude);
    }
    // renorm
    let sum = cell.candidates.reduce((s, c) => s + c.amplitude, 0) || 1;
    cell.candidates.forEach((c) => {
      c.amplitude /= sum;
    });
    break;
  }
  return next;
}

// ─── 5. Truth Meter / Anti-Slop ────────────────────────────────
const CLICHE_SNIPS = [
  'heart of gold', 'broken heart', 'forever and always', 'dreams come true',
  'lost without you', 'through the night', 'burning desire', 'lonely nights',
  'hold me close', 'tears are falling', 'one more night', 'never let go',
  'against the world', 'dance in the rain', 'fire in my soul', 'empty inside',
];

export function loadVaultLines() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushVaultLines(lines) {
  const vault = loadVaultLines();
  const next = [...vault, ...lines.map((l) => String(l).toLowerCase().trim()).filter(Boolean)];
  localStorage.setItem(VAULT_KEY, JSON.stringify(next.slice(-500)));
}

export function computeTruthMeter({
  section,
  neuralText,
  keywordsRaw,
  dnaUsed,
  contracts,
}) {
  const score = scoreOf(section);
  const dna = dnaOf(section, 0);
  const lines = String(neuralText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const vault = loadVaultLines();
  const lowerLines = lines.map((l) => l.toLowerCase());

  // Originality vs vault
  let vaultHits = 0;
  for (const l of lowerLines) {
    if (vault.some((v) => v && (l === v || (l.length > 12 && v.includes(l)) || (v.length > 12 && l.includes(v))))) {
      vaultHits++;
    }
  }
  const originality = lines.length ? 1 - vaultHits / lines.length : 1;

  // Cliche density
  const joined = lowerLines.join(' ');
  let clicheHits = 0;
  for (const c of CLICHE_SNIPS) {
    if (joined.includes(c)) clicheHits++;
  }
  const clicheScore = Math.max(0, 1 - clicheHits / 4);

  // Keyword honor
  const kws = parseKeywords(keywordsRaw || '');
  let honored = 0;
  if (kws.length) {
    const hay = [
      ...section.lines.flatMap((ln) => ln.cells.map((c) => c.text.toLowerCase())),
      ...lowerLines,
    ].join(' ');
    for (const k of kws) {
      if (hay.includes(String(k).toLowerCase())) honored++;
    }
  }
  const keywordHonor = kws.length ? honored / kws.length : 1;

  // DNA fidelity
  let dnaFidelity = 1;
  if (dnaUsed?.dna && dna) {
    dnaFidelity = 1 - dnaDistance(dnaUsed.dna, dna);
  }

  // Contracts
  const contractCheck = checkContracts(section, contracts || []);
  const contractScore = contractCheck.ok
    ? 1
    : Math.max(0, 1 - contractCheck.violations.length * 0.25);

  // Constraint-ish: rhyme + stress from scorer
  const constraintSat =
    ((score.rhymeStrength || 0) + (score.stressFidelity || 0) + (score.overall || 0)) / 3;

  const overall =
    originality * 0.2 +
    clicheScore * 0.2 +
    keywordHonor * 0.2 +
    dnaFidelity * 0.15 +
    contractScore * 0.1 +
    constraintSat * 0.15;

  const notes = [];
  if (originality < 0.7) notes.push('Some lines echo your past vault — rewrite or accept the callback.');
  if (clicheHits) notes.push(`${clicheHits} cliché phrase(s) detected — punch them up.`);
  if (keywordHonor < 0.8 && kws.length) notes.push(`Only ${honored}/${kws.length} of your keywords still show — force seeds or re-load.`);
  if (!contractCheck.ok) notes.push(`${contractCheck.violations.length} entanglement contract(s) broken.`);
  if (dnaUsed && dnaFidelity < 0.6) notes.push('DNA drifted far from the injected shape.');
  if (notes.length === 0) notes.push('Clean pass — structure holds, keywords present, low slop risk.');

  return {
    overall,
    originality,
    clicheScore,
    clicheHits,
    keywordHonor,
    honored,
    keywordTotal: kws.length,
    dnaFidelity,
    contractScore,
    contractCheck,
    constraintSat,
    score,
    notes,
  };
}

// ─── 6. Phonetic / stress helpers ─────────────────────────────
export function stressDots(stress) {
  return stress > 0 ? '●' : '○';
}

export function rimeLabel(rhymeClass) {
  if (!rhymeClass) return '—';
  return String(rhymeClass).replace(/^U_/, '~');
}

// ─── 7. Loop station handshake ────────────────────────────────
export function readLoopHandshake() {
  try {
    return JSON.parse(localStorage.getItem(LOOP_HANDSHAKE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeLoopHandshake(payload) {
  localStorage.setItem(LOOP_HANDSHAKE_KEY, JSON.stringify({ ...payload, updatedAt: Date.now() }));
}

/** Apply BPM-derived syllable targets onto section lines. */
export function applyLoopTargetsToSection(section, handshake) {
  if (!handshake) return { section, ok: false };
  const next = clone(section);
  const syl = handshake.targetSyllables || 8;
  next.lines.forEach((ln) => {
    ln.targetSyllables = syl;
    // Bias stress density from "pocket"
    const dense = handshake.rhymeDensity === 'dense';
    ln.cells.forEach((cell, j) => {
      if (cell.frozen) return;
      // every other strong if dense, else first+last strong
      if (dense) cell.stress = j % 2 === 0 ? 1 : 0;
      else cell.stress = j === 0 || j === ln.cells.length - 1 ? 1 : 0;
    });
  });
  next.loopHandshake = {
    bpm: handshake.bpm,
    targetSyllables: syl,
  };
  return { section: next, ok: true };
}

// ─── 8. Style DNA pressure ────────────────────────────────────
export function readStylePressure() {
  try {
    return JSON.parse(localStorage.getItem(STYLE_DNA_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeStylePressure(styleDNA, artist = '') {
  if (!styleDNA) {
    localStorage.removeItem(STYLE_DNA_KEY);
    return;
  }
  localStorage.setItem(
    STYLE_DNA_KEY,
    JSON.stringify({ ...styleDNA, artist, savedAt: Date.now() })
  );
}

/** Bias lattice energy / freeze density from Style DNA. */
export function applyStylePressureToSection(section, style) {
  if (!style) return { section, ok: false };
  const next = clone(section);
  const dens = String(style.rhymeDensity || 'balanced').toLowerCase();
  const temp = Number(style.emotionalTemp) || 50;
  // Energy baseline from emotional temp
  const eBase = 0.25 + (temp / 100) * 0.45;
  next.lines.forEach((ln, li) => {
    ln.cells.forEach((cell, ci) => {
      if (!cell.frozen) {
        cell.energy = Math.min(0.95, eBase + (ci === ln.cells.length - 1 ? 0.12 : 0));
      }
      // dense rhyme → heat finals more
      if (dens === 'dense' && ci === ln.cells.length - 1) {
        cell.energy = Math.min(0.98, (cell.energy || 0) + 0.15);
      }
      if (dens === 'sparse' && ci === ln.cells.length - 1) {
        cell.energy = Math.max(0.15, (cell.energy || 0.4) - 0.1);
      }
    });
  });
  // Inject image clusters into keyword-friendly status field on section meta
  next.stylePressure = {
    artist: style.artist || '',
    rhythm: style.rhythm || '',
    rhymeDensity: style.rhymeDensity || '',
    emotionalTemp: temp,
    imageClusters: style.imageClusters || [],
    cadenceNotes: style.cadenceNotes || '',
  };
  return { section: next, ok: true };
}

/** Build neural system addendum from style pressure + contracts + DNA. */
export function buildNeuralConstraints({ stylePressure, contracts, section, dnaUsed, forceKeywords }) {
  const parts = [];
  if (forceKeywords?.length) {
    parts.push(`MUST include these user seeds somewhere: ${forceKeywords.join(', ')}.`);
  }
  if (stylePressure) {
    parts.push(
      `Style pressure chamber (inspired by, NOT copying any real lyrics): rhythm=${stylePressure.rhythm || 'n/a'}; rhymeDensity=${stylePressure.rhymeDensity || 'balanced'}; emotionalTemp=${stylePressure.emotionalTemp ?? 'n/a'}/100; cadence=${stylePressure.cadenceNotes || 'n/a'}.`
    );
    if (stylePressure.imageClusters?.length) {
      parts.push(`Motif pressure (images to lean toward): ${stylePressure.imageClusters.join('; ')}.`);
    }
  }
  if (dnaUsed?.dna) {
    parts.push(
      `Sectional DNA: rhymeScheme=${dnaUsed.dna.rhymeScheme}; stress=${dnaUsed.dna.stressSignature}; averageEnergy=${(dnaUsed.dna.averageEnergy || 0).toFixed(2)}.`
    );
  }
  if (contracts?.length) {
    const byId = new Map();
    section.lines.forEach((ln) => ln.cells.forEach((c) => byId.set(c.id, c)));
    for (const c of contracts) {
      const a = byId.get(c.aId)?.text;
      const b = byId.get(c.bId)?.text;
      if (a && b) parts.push(`Contract ${c.type}: “${a}” ↔ “${b}” must be honored.`);
    }
  }
  return parts.join(' ');
}

// ─── 9. Collapse journal ──────────────────────────────────────
export function loadJournal() {
  try {
    return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]');
  } catch {
    return [];
  }
}

export function appendJournalEntry(entry) {
  const list = loadJournal();
  list.unshift({ ...entry, id: `j_${Date.now()}`, at: Date.now() });
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(list.slice(0, 80)));
  return list[0];
}

export function formatJournalCard(entry) {
  if (!entry) return '';
  return [
    '══════════════════════════════════════',
    ' LYRICIST QUANTUM — COLLAPSE JOURNAL',
    '══════════════════════════════════════',
    `When: ${new Date(entry.at || Date.now()).toLocaleString()}`,
    `Section: ${entry.sectionName || 'verse'}`,
    `Keywords: ${(entry.keywords || []).join(', ') || '—'}`,
    `State pick: ${entry.neuralPick || '—'}`,
    `DNA used: ${entry.dnaName || 'none'}`,
    `Style pressure: ${entry.styleArtist || 'none'}`,
    `Frozen tiles: ${(entry.frozen || []).join(', ') || '—'}`,
    `Contracts: ${entry.contractCount ?? 0}`,
    `Truth overall: ${entry.truthOverall != null ? Math.round(entry.truthOverall * 100) + '%' : '—'}`,
    '',
    '— Lattice words —',
    ...(entry.latticeLines || []),
    '',
    '— Neural verse (collapsed) —',
    entry.verse || '—',
    '',
    '— Notes —',
    ...(entry.notes || []),
    '══════════════════════════════════════',
  ].join('\n');
}

export function snapshotLatticeLines(section) {
  return section.lines.map((ln, i) => {
    const words = ln.cells.map((c) => c.text).join(' · ');
    const end = ln.cells[ln.cells.length - 1];
    return `L${i + 1} [${ln.rhymeSchemeSlot || '.'}] ${words}  // end:${end?.text} rime:${end?.rhymeClass || '?'}`;
  });
}

// Multi-section song types
export const QUANTUM_SECTIONS = [
  { id: 'verse1', label: 'Verse 1', type: 'verse' },
  { id: 'pre', label: 'Pre-Chorus', type: 'pre-chorus' },
  { id: 'chorus', label: 'Chorus', type: 'chorus' },
  { id: 'verse2', label: 'Verse 2', type: 'verse' },
  { id: 'bridge', label: 'Bridge', type: 'bridge' },
];
