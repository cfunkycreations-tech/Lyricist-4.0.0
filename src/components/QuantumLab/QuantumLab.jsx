import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { callAI } from '../../services/AIService.js';
import EnergyField from './EnergyField.jsx';
import {
  buildSection, buildSectionFromKeywords, buildEntanglements, setCellText,
  runGens, spotlightCell, measureCell,
  crystallizeLab, freezeCell, dnaOf, scoreOf, mutateSection, injectSection, lockSection,
  parseKeywords,
} from './quantumEngine.js';
import QuantumFeaturesPanel from './QuantumFeaturesPanel.jsx';
import {
  buildNeuralConstraints,
  checkContracts,
  readStylePressure,
  QUANTUM_SECTIONS,
} from './quantumFeatures.js';
import { registerDemoSnapshot } from '../../services/demoSafety.js';
import { useMobile } from '../../mobile/useMobile.js';
import './QuantumLab.css';

// ============================================================
// Quantum Lab — "Lyricist Goes Quantum" (Lyricist 4.2.0)
// A living grid of lyric syllables driven by the lyric-core engine:
// energy cellular-automata, superposition collapse, entanglement,
// sectional DNA, and neural surface realization (via OpenRouter).
// ============================================================

// Brand neon palette — electric purple · blue · emerald + hot fluorescents for tiles
const MAG = '#a855f7', ORG = '#00e5ff', GRN = '#10f0a0', YLW = '#c026ff', BLU = '#00f0ff';
const HOT_ORG = '#ff6f00', HOT_RED = '#ff1a1a', HOT_PNK = '#ff00aa';
// Violet — grid TILES only when selected/clicked (never toolbar)
const VIO = '#b44dff';
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const f2 = (x) => (x || 0).toFixed(2);
const hashClass = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/**
 * LATTICE TILE COLOUR: A REAL HEAT RAMP, NOT A PALETTE CYCLE.
 *
 * The old version put the three hottest bands on a ramp and then coloured every
 * cool tile by RHYME CLASS, cycling five unrelated colours. So energy - the one
 * thing the grid exists to show - was invisible across the bottom two thirds
 * of the range, and the board read as a random spread of greens and purples.
 * Chris's word for it was bland, and he was right.
 *
 * Now it is a continuous furnace ramp, cold to white hot, exactly like real
 * fire, so a glance tells you where the energy is:
 *
 *   0.00  deep midnight blue   barely alive
 *   0.18  electric cyan
 *   0.36  emerald green
 *   0.52  burning yellow-gold
 *   0.68  molten orange
 *   0.84  fierce red
 *   1.00  white hot core
 *
 * Entangled (superposition) tiles sit OUTSIDE the ramp in violet, because that
 * is a different property, not more heat. Same reason frozen tiles go grey.
 */
const HEAT_RAMP = [
  [0.00, [10, 26, 90]],     // deep midnight blue
  [0.18, [0, 190, 255]],    // electric cyan
  [0.36, [16, 240, 160]],   // emerald
  [0.52, [255, 214, 0]],    // yellow-gold
  [0.68, [255, 111, 0]],    // molten orange
  [0.84, [255, 40, 24]],    // fierce red — HOTTEST
  [1.00, [255, 18, 18]],    // and it stays red. His hottest tile is red, not
                            // white; running on to white washed the top of the
                            // board out to grey.
];

function heatColor(e) {
  const x = Math.max(0, Math.min(1, e));
  for (let i = 1; i < HEAT_RAMP.length; i++) {
    const [p1, c1] = HEAT_RAMP[i - 1];
    const [p2, c2] = HEAT_RAMP[i];
    if (x <= p2) {
      const t = (x - p1) / (p2 - p1 || 1);
      const mix = c1.map((v, k) => Math.round(v + (c2[k] - v) * t));
      // Bare components, not rgb(). The tile needs the same colour at five
      // different alphas — outline, fill top, fill bottom, outer glow, inner
      // glow — and `rgba(var(--tc), 0.2)` is the only way to get that from one
      // custom property.
      return `${mix[0]}, ${mix[1]}, ${mix[2]}`;
    }
  }
  return '255, 18, 18';
}

/**
 * ENERGY IS NORMALISED AGAINST THE BOARD, NOT READ AS AN ABSOLUTE 0..1.
 *
 * THIS IS WHY THE LATTICE LOOKED BLAND, and it was a real bug, not a taste
 * problem. The engine's energy almost never climbs past about 0.45 in actual
 * use - measured live, after loading 24 words, spotlighting four tiles six
 * times each and running twelve generations, the hottest cell on the board was
 * 0.45. But the old bands started at 0.42, 0.60 and 0.78, so the yellow band
 * barely fired and the orange and red bands NEVER fired at all. Every tile fell
 * through to the cool palette, which cycled five colours by rhyme class. The
 * board could not show heat because the top two thirds of its scale was
 * unreachable.
 *
 * So `maxE` is the hottest cell currently on the board and every tile is
 * coloured by its share of that. The ramp always spans end to end: the hottest
 * word is always white hot, the coldest always deep blue, whatever absolute
 * numbers the engine happens to produce today. If the engine is ever retuned,
 * this keeps working.
 *
 * The 0.08 floor stops a stone cold board (every cell at 0) dividing by zero
 * and flashing the whole grid white.
 */
function tileColor(cell, selected, rankHeat) {
  if (selected) return { c: '180, 77, 255', glow: 32, heat: 0 };
  // Frozen is grey in the design — a pinned tile is out of the temperature
  // system entirely, so it leaves the ramp rather than sitting cold on it.
  if (cell.frozen) return { c: '176, 180, 200', glow: 10, heat: 0 };
  const heat = Math.max(0, Math.min(1, rankHeat || 0));
  // Superposition is its own state, not a temperature. Magenta, off the ramp,
  // and it burns violet instead of orange.
  if (cell.isSuperposition) return { c: '224, 64, 255', glow: Math.round(18 + heat * 30), heat };
  return { c: heatColor(heat), glow: Math.round(10 + heat * 38), heat };
}

/**
 * WHAT COLOUR DOES THIS TILE BURN?
 *
 * TWO ANSWERS, and this is straight off his animation, not a design choice of
 * mine. Fire on this board is ORANGE — real fire, white at the fuel through
 * yellow and orange to red at the tip. The only exception is an ENTANGLED
 * tile, which burns VIOLET, deliberately wrong for fire, because a superposed
 * word is not behaving like the rest of the board.
 *
 * An earlier pass had this cycling six hues by rhyme class, so the board came
 * out as a rainbow of green and blue and yellow flames. The colours in the
 * design are on the TILES — the temperature ramp — not on the flames. Two
 * different things, and mixing them up cost most of an afternoon.
 *
 * Feeds --fh in QuantumLab.css, which drives the tongues, the core, the pool
 * at the fuel, the light thrown back on the word, and the embers.
 */
function fireHue(cell) {
  return cell.isSuperposition ? 282 : 26;
}

// a gentle static sparkline path for the Entanglement State card
function sparkPath(seed, w = 150, h = 40) {
  let a = seed >>> 0 || 1; const rnd = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; };
  const n = 26, pts = [];
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = h - (0.15 + 0.7 * Math.abs(Math.sin(i * 0.6 + seed) * 0.5 + rnd() * 0.5)) * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return 'M' + pts.join(' L');
}

export default function QuantumLab({ onSendToSongwriter, onSendToForge }) {
  const store = useLyricStore();
  const [section, setSection] = useState(() => buildSection());
  // Manual contract links MUST be declared before the links useMemo (TDZ black-screen fix)
  const [manualLinks, setManualLinks] = useState([]);
  // Rebuild links whenever the grid words change + merge manual contracts
  const links = useMemo(() => {
    const auto = buildEntanglements(section);
    return [...auto, ...manualLinks];
  }, [section, manualLinks]);
  const [selectedId, setSelectedId] = useState('c_0_2');
  const [gen, setGen] = useState(0);
  const [spotlightMode, setSpotlightMode] = useState(false);
  const [crystallized, setCrystallized] = useState(false);
  const [entView, setEntView] = useState(true);

  /* PHONE ONLY. In landscape the grid is the tool; the keyword box, the
     step buttons and the three inspector panels were eating 400 of the 915
     available pixels and sitting on top of the thing you came here to see.
     They become two drawers behind two labelled buttons instead. Both are
     closed on arrival, so the grid opens full width. */
  const mobile = useMobile();
  const [drawer, setDrawer] = useState(null);      // null | 'controls' | 'panels'
  /* The linked-pairs readout floats over the grid and covers four tiles.
     It is a glance, not a panel: a chip that opens on hover, and on tap for
     touch screens where hover does not exist. */
  const [entOpen, setEntOpen] = useState(false);
  const [status, setStatus] = useState({
    lead: 'Your words first.',
    rest: ' Type YOUR keywords below (as many as you want), hit Load into Grid, then Spotlight / Run / Crystallize. Or click a tile and edit it. The demo grid is only a starting example.',
  });
  const [running, setRunning] = useState(false);
  // Multi-state verse: A and B candidates before you "collapse" to one
  const [neuralA, setNeuralA] = useState(null);
  const [neuralB, setNeuralB] = useState(null);
  const [neuralPick, setNeuralPick] = useState('A'); // which state is active
  // Tier 1 Quick Path. `autoStage` is what the button says while it works, so a
  // 15 second run is never a dead control with a spinner on it.
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStage, setAutoStage] = useState('');
  // Tier 2 drawer. Closed on arrival, deliberately — see the note above the
  // Advanced Studio block in the render.
  const [advOpen, setAdvOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [vidFailed, setVidFailed] = useState(false);
  /**
   * Cheat sheet starts CLOSED, and stays however you left it.
   *
   * It used to default open, which put a six-step manual above the fold on a
   * tab whose entire point is now one button. The steps it explains all live in
   * the Advanced Studio drawer; somebody using the Quick Path never needs them.
   * Still one click away, and still remembered per browser.
   */
  const [howtoOpen, setHowtoOpen] = useState(() => {
    try { return localStorage.getItem('ql.howtoOpen') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('ql.howtoOpen', howtoOpen ? '1' : '0'); } catch { /* private mode */ }
  }, [howtoOpen]);
  const howtoRef = useRef(null);
  // Freeform keywords Chris types — commas/newlines keep multi-word phrases together
  const [keywordDraft, setKeywordDraft] = useState('');
  // Inline edit for the selected tile
  const [editDraft, setEditDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  // Purple flash on grid TILE only (toolbar keeps its own orange/green)
  const [flashTileId, setFlashTileId] = useState(null);
  const flashTimer = useRef(null);
  // ── Advanced quantum (features 1–9) ──
  const [contracts, setContracts] = useState([]);
  const [dnaUsed, setDnaUsed] = useState(null);
  const [stylePressure, setStylePressure] = useState(() => readStylePressure());
  const [phoneticsOn, setPhoneticsOn] = useState(false);
  const [truthReport, setTruthReport] = useState(null);

  // ── Ghost Demo safety net ──────────────────────────────────────────
  // The demo drives this tab for real: it types seed words into the keyword
  // box and clicks "Load into Grid", which replaces the whole grid. That
  // once wiped a grid the user had filled with their own words. Snapshot
  // everything the demo can reach so it can all be put back afterwards.
  const liveRef = useRef({});
  liveRef.current = {
    section, manualLinks, selectedId, gen, spotlightMode, crystallized,
    neuralA, neuralB, neuralPick, keywordDraft, contracts, dnaUsed, status,
  };

  useEffect(() => registerDemoSnapshot('quantum-lab', {
    snapshot: () => ({ ...liveRef.current }),
    restore: (s) => {
      if (!s) return;
      setSection(s.section);
      setManualLinks(s.manualLinks);
      setSelectedId(s.selectedId);
      setGen(s.gen);
      setSpotlightMode(s.spotlightMode);
      setCrystallized(s.crystallized);
      setNeuralA(s.neuralA);
      setNeuralB(s.neuralB);
      setNeuralPick(s.neuralPick);
      setKeywordDraft(s.keywordDraft);
      setContracts(s.contracts);
      setDnaUsed(s.dnaUsed);
      setStatus(s.status);
    },
    // "Work in progress" = they typed keywords, edited the grid, or ran a gen.
    hasWork: () => {
      const l = liveRef.current;
      return Boolean(l.keywordDraft?.trim()) || l.gen > 0 || (l.manualLinks?.length > 0);
    },
  }), []);
  const [activeSectionId, setActiveSectionId] = useState('verse1');
  const [songMap, setSongMap] = useState({});

  // pick the 9:16 background on narrow screens, 16:9 otherwise
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setIsNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const wrapRef = useRef(null);
  const gridRef = useRef(null);

  const dna = useMemo(() => dnaOf(section, gen), [section, gen]);
  const score = useMemo(() => scoreOf(section), [section]);

  const cells = useMemo(() => section.lines.flatMap((l) => l.cells), [section]);
  const selected = cells.find((c) => c.id === selectedId) || cells[0];
  const cols = section.lines[0]?.cells.length || 5;

  // Keep the edit box in sync when selection changes (unless mid-edit on that tile)
  useEffect(() => {
    if (selected && editingId !== selected.id) {
      setEditDraft(selected.text || '');
    }
  }, [selectedId, selected?.text, editingId]);

  const finals = useMemo(
    () => section.lines.map((l) => ({ id: l.cells[l.cells.length - 1].id, slot: l.rhymeSchemeSlot })),
    [section]
  );
  const energyById = useMemo(() => Object.fromEntries(cells.map((c) => [c.id, c.energy])), [cells]);
  /* The hottest cell on the board right now. Every tile's colour is its share
     of this, so the heat ramp always spans end to end. See tileColor. */
  /**
   * HEAT IS A RANK ON THIS BOARD, NOT A FRACTION OF THE MAXIMUM.
   *
   * energy / boardMax looks correct and is not. The engine spreads energy
   * quite evenly once it has run, so most tiles land close to the maximum,
   * almost every tile computes to ~1.0, and the board turns solid red with
   * every single tile on fire — no ramp, no meaning, nothing to look at.
   *
   * Ranking guarantees the spread his design shows: coldest tile 0.0, hottest
   * 1.0, everything else evenly between. Ties share a rank so two identical
   * tiles cannot end up different colours.
   */
  const heatByCell = useMemo(() => {
    const map = new Map();
    const live = cells.filter((c) => !c.frozen);
    const sorted = [...live].sort((a, b) => (a.energy || 0) - (b.energy || 0));
    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      const e = sorted[i].energy || 0;
      // Walk back to the first tile with this same energy, so ties agree.
      let first = i;
      while (first > 0 && (sorted[first - 1].energy || 0) === e) first--;
      map.set(sorted[i].id, n > 1 ? first / (n - 1) : 0);
    }
    return map;
  }, [cells]);

  // ---- actions ----
  const loadKeywords = useCallback(() => {
    const raw = keywordDraft.trim();
    if (!raw) {
      setStatus({
        lead: 'Type something first.',
        rest: ' Put one or more words/phrases in the keyword box (comma or new line between phrases), then Load into Grid.',
      });
      return;
    }
    const next = buildSectionFromKeywords(raw);
    setSection(next);
    setSelectedId('c_0_0');
    setGen(0);
    setCrystallized(false);
    setNeuralA(null);
    setNeuralB(null);
    setEditingId(null);
    const count = raw.split(/[,\n|;]+/).map((t) => t.trim()).filter(Boolean).length
      || raw.split(/\s+/).filter(Boolean).length;
    setStatus({
      lead: 'Your grid.',
      rest: ` Loaded your keywords into the grid (${count} token${count === 1 ? '' : 's'} — cycles to fill 20 tiles). These stay YOUR words. Now: Spotlight, Run 12 gens, Crystallize, Generate Neural Lyrics.`,
    });
  }, [keywordDraft]);

  const applyCellEdit = useCallback(() => {
    if (!selectedId) return;
    const t = editDraft.trim();
    if (!t) {
      setStatus({ lead: 'Empty.', rest: ' Type a word or phrase for this tile, then Apply.' });
      return;
    }
    setSection(setCellText(section, selectedId, t));
    setEditingId(null);
    setFlashTileId(selectedId);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashTileId(null), 800);
    setStatus({
      lead: 'Updated.',
      rest: ` Tile is now “${t}” — your word. Spotlight / Run / Crystallize will not replace it with computer picks.`,
    });
  }, [selectedId, editDraft, section]);

  const resetDemo = useCallback(() => {
    setSection(buildSection());
    setSelectedId('c_0_2');
    setGen(0);
    setCrystallized(false);
    setNeuralA(null);
    setNeuralB(null);
    setKeywordDraft('');
    setEditingId(null);
    setStatus({
      lead: 'Demo grid.',
      rest: ' Back to the sample grid. Type your own keywords anytime and hit Load into Grid.',
    });
  }, []);

  const onTile = useCallback((cell) => {
    // Contract mode intercept (advanced feature 2)
    if (typeof window !== 'undefined' && window.__qlContractMode && window.__qlContractHandler) {
      if (window.__qlContractHandler(cell.id)) {
        setSelectedId(cell.id);
        setFlashTileId(cell.id);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashTileId(null), 800);
        return;
      }
    }
    // Purple flash = grid tile feedback only
    setFlashTileId(cell.id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashTileId(null), 800);
    if (spotlightMode) {
      const res = spotlightCell(section, cell.row, cell.col, 0.5);
      setSection(res.section);
      setSelectedId(cell.id);
      setStatus({
        lead: 'Heated.',
        rest: ` Poured energy into “${cell.text}” and nearby tiles. Click more words, or turn Spotlight off and hit Run 12 gens.`,
      });
    } else {
      setSelectedId(cell.id);
      setEditDraft(cell.text || '');
      setEditingId(null);
      setStatus({
        lead: 'Selected.',
        rest: ` “${cell.text}” — purple = this grid tile is active. Edit it below, or Spotlight / Run / Crystallize.`,
      });
    }
  }, [spotlightMode, section]);

  const onTileDouble = useCallback((cell) => {
    if (spotlightMode) return;
    setSelectedId(cell.id);
    setEditDraft(cell.text || '');
    setEditingId(cell.id);
    setStatus({
      lead: 'Editing.',
      rest: ' Type your word or phrase in the box under Word Inspector (or here), then Apply / Enter.',
    });
  }, [spotlightMode]);

  const doRun = () => {
    setRunning(true);
    const res = runGens(section, 12);
    setSection(res.section);
    setGen((g) => g + 12);
    setCrystallized(false);
    setStatus({
      lead: 'Energy spread.',
      rest: ' Heat moved across the grid for 12 steps. Brighter / hotter tiles are more likely to change when you Crystallize. Next: Crystallize, or Spotlight another word.',
    });
    setTimeout(() => setRunning(false), 900);
  };

  /**
   * Steps 4 and 5 in one press — Chris, 2026-08-12: "take several of the action
   * steps… can't you incorporate some of those, two things together or three?"
   *
   * Run and Crystallize are always done back to back and nobody who is new to
   * this tab can tell you why they are two buttons. They stay as two buttons
   * (nothing is hidden, nothing is removed — you can still do them one at a
   * time and watch what each does), and this is the one-press version for
   * people who just want a verse.
   *
   * It cannot be written as doRun() + doCrystallize(): doCrystallize reads
   * `section` from the render closure, which would still be the pre-Run value,
   * so it would lock the OLD grid. The two transforms are chained on the
   * value instead of on state.
   */
  const doRunAndLock = () => {
    setRunning(true);
    const ran = runGens(section, 12);
    const locked = crystallizeLab(ran.section);
    setSection(locked.section);
    setGen((g) => g + 12);
    setCrystallized(true);
    const audit = checkContracts(locked.section, contracts);
    setStatus(
      audit.ok
        ? {
            lead: 'Spread and locked.',
            rest: ' Energy moved across the grid for 12 steps and the field is now locked (Crystallize went green). Your own keywords were never swapped out. Next: Step 6, Generate Neural Lyrics.',
          }
        : {
            lead: 'Spread and locked — but contracts broken.',
            rest: ` ${audit.violations.length} rhyme link(s) failed: ${audit.violations.map((v) => `“${v.aText}”↔“${v.bText}”`).join('; ')}. Fix those tiles or remove the links before you generate.`,
          }
    );
    setTimeout(() => setRunning(false), 900);
  };

  const doCrystallize = () => {
    const res = crystallizeLab(section);
    setSection(res.section);
    setCrystallized(true);
    const audit = checkContracts(res.section, contracts);
    if (!audit.ok) {
      setStatus({
        lead: 'Locked — but contracts broken.',
        rest: ` ${audit.violations.length} rhyme link(s) failed: ${audit.violations.map((v) => `“${v.aText}”↔“${v.bText}”`).join('; ')}. Fix tiles or remove links before neural generate.`,
      });
    } else {
      setStatus({
        lead: 'Locked in.',
        rest: ' Energy settled. Your keywords kept. Contracts hold. Next: Generate Neural Lyrics (OpenRouter key in Settings).',
      });
    }
  };

  const doMeasure = () => {
    const res = measureCell(section, selectedId, links);
    setSection(res.section);
    const w = res.collapsed?.text;
    setStatus({
      lead: 'Measured.',
      rest: w
        ? ` Picked one word for this tile: “${w}”. Linked tiles may shift to match. Optional step — Crystallize still locks the whole grid at once.`
        : ' This tile settled on one word.',
    });
  };

  const doFreeze = () => {
    const willFreeze = !selected.frozen;
    setSection(freezeCell(section, selectedId, willFreeze));
    setStatus({
      lead: willFreeze ? 'Pinned.' : 'Unpinned.',
      rest: willFreeze
        ? ` “${selected.text}” will not change until you unpin it. Handy when you love a word and want the rest of the grid to move around it.`
        : ` “${selected.text}” can change again.`,
    });
  };

  const doMutate = () => {
    const res = mutateSection(section, gen + 3);
    setSection(res.section);
    setStatus({
      lead: 'Rhythm tweaked.',
      rest: ' A few strong/weak beats flipped (the “stress” pattern). Rhyme plan stays the same — only the feel of the meter shifts a little.',
    });
  };
  const doInject = () => {
    const res = injectSection(section, gen + 5);
    setSection(res.section);
    setStatus({
      lead: 'New words in.',
      rest: ' Some tiles swapped to related word options. Same skeleton, fresher vocabulary. Run energy again if you want, then Crystallize.',
    });
  };
  const doLock = () => {
    const willLock = !section.frozen;
    setSection(lockSection(section, willLock));
    setStatus({
      lead: willLock ? 'Whole grid pinned.' : 'Grid unpinned.',
      rest: willLock
        ? ' Every word is frozen so nothing drifts. Click Lock again when you want to play.'
        : ' Words can change again.',
    });
  };

  /**
   * `srcSection` is how Auto-Craft stays honest.
   *
   * setSection() does not update the `section` in this closure, so a one-click
   * run that spreads, locks, then generates would build its prompt from the
   * grid as it looked BEFORE any of that — a verse for a board that never
   * existed. Each step hands the next one its actual result instead.
   */
  const buildNeuralMessages = (variant, srcSection = null) => {
    const sec = srcSection || section;
    const secCells = sec.lines.flatMap((l) => l.cells);
    const secDna = srcSection ? dnaOf(sec, gen + 12) : dna;
    const endWords = sec.lines.map((l) => l.cells[l.cells.length - 1].text);
    const palette = [...new Set(secCells.map((c) => c.text))].join(', ');
    const spin = variant === 'B'
      ? 'Variant B: lean more abstract/image-heavy, slightly different angle on the same end-words.'
      : 'Variant A: lean more direct and emotional, plain language.';
    const pressure = buildNeuralConstraints({
      stylePressure: stylePressure || sec.stylePressure,
      contracts,
      section: sec,
      dnaUsed,
      forceKeywords: parseKeywords(keywordDraft),
    });
    const secLabel = QUANTUM_SECTIONS.find((s) => s.id === activeSectionId)?.label || 'verse';
    return [
      {
        role: 'system',
        content:
          'You are a surgical lyricist working INSIDE hard craft constraints (word grid). Write ONE tight 4-line verse. Land each line on its given end-word. Honor contracts and style pressure. No clichés, no explanations — output only the 4 lines. Never copy any real artist lyrics.',
      },
      {
        role: 'user',
        content: `Section: ${secLabel}\nSeed palette: ${palette}\nRhyme scheme: ${secDna?.rhymeScheme || 'AABB'}\nEnd-words per line (in order): ${endWords.join(', ')}\nStress signature: ${secDna?.stressSignature || ''}\n${pressure ? `CONSTRAINTS:\n${pressure}\n` : ''}${spin}\nWrite the 4-line verse now.`,
      },
    ];
  };

  /**
   * Generate multi-state A + B verses (pick one before send).
   *
   * `overrideSection` is supplied by Auto-Craft, which has just spread and
   * locked the grid and holds the only correct copy of it. Defaults to null,
   * so the Step 6 button behaves exactly as it always did.
   */
  const doNeural = async (overrideSection = null) => {
    const src = overrideSection || section;
    if (!store.config?.openRouterApiKey) {
      setStatus({
        lead: 'Need an API key.',
        rest: ' Open the Settings tab, paste your free OpenRouter key, save, then come back and try Generate Neural Lyrics again.',
      });
      return;
    }
    const audit = checkContracts(src, contracts);
    if (!audit.ok) {
      setStatus({
        lead: 'Contracts block generate.',
        rest: ` Fix ${audit.violations.length} broken contract(s) first (panel → 2 Contracts → Audit), or remove them.`,
      });
      return;
    }
    setBusy(true);
    setStatus({ lead: 'Writing A + B…', rest: ' Generating two multi-state verses under grid + DNA + style pressure. Pick A or B, run Truth Meter, then send.' });
    try {
      /**
       * A THEN B, NOT A AND B.
       *
       * These two calls used to go out together under Promise.all. On an
       * OpenRouter key with a strict per-second concurrency allowance the
       * second request is rejected the instant it lands, and because
       * Promise.all rejects as a unit, ONE refused request threw away the
       * good verse that came back with it. What the user saw was "Could not
       * generate. Provider returned error" for a run where half the work had
       * actually succeeded.
       *
       * So they go one at a time with a beat in between, and B is allowed to
       * fail on its own. Losing the second variant costs the A/B choice for
       * that run; losing the pair costs the whole generate.
       */
      const outA = await callAI(buildNeuralMessages('A', overrideSection), store.config, 0.88, 220);
      setNeuralA((outA || '').trim());

      await new Promise((r) => setTimeout(r, 400));

      let outB;
      try {
        outB = await callAI(buildNeuralMessages('B', overrideSection), store.config, 0.95, 220);
      } catch (errB) {
        // B alone is not a failed run. Fall back to A so the tab still has a
        // verse on screen and the pick control still works.
        console.warn('[The Matrix] State B failed, falling back to State A:', errB);
        outB = outA;
      }
      setNeuralB((outB || '').trim());
      setNeuralPick('A');
      setTruthReport(null);
      setStatus({
        lead: 'Two states ready.',
        rest: ' Pick A or B, open panel → 5 Truth Meter, then snapshot Journal (9) before you send.',
      });
    } catch (e) {
      setStatus({ lead: 'Could not generate.', rest: ' ' + (e?.message || String(e)) + ' Check Settings and your internet, then try again.' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * ══ TIER 1: THE QUICK PATH ═══════════════════════════════════════════════
   * Steps 4, 5 and 6 in a single press: spread the energy, lock the field,
   * write both states.
   *
   * WHY THIS EXISTS. The manual path is six numbered buttons that have to be
   * pressed in the right order, and getting the order wrong produces either
   * nothing or a verse built on an unlocked grid. That is a fine instrument
   * panel for someone who wants to watch each transform land, and it is the
   * wrong front door for everybody else.
   *
   * WHY IT THREADS THE SECTION BY HAND. setSection() does not update `section`
   * in this closure, so calling doRun() then doCrystallize() then doNeural()
   * in sequence would run all three against the ORIGINAL grid. Each step
   * takes the previous step's return value instead. This is the same reason
   * buildNeuralMessages accepts srcSection.
   *
   * The manual Step 3/4/5/6 buttons are untouched and still in the drawer.
   * This does not replace them; it is the same transforms with nothing to
   * remember.
   */
  const autoCraftVerse = async () => {
    if (autoBusy || busy || running) return;
    setAutoBusy(true);
    try {
      setAutoStage('Spreading energy…');
      setStatus({ lead: 'Auto-Craft running.', rest: ' Spreading energy across the matrix for 12 generations.' });
      const ran = runGens(section, 12);

      setAutoStage('Locking the field…');
      const locked = crystallizeLab(ran.section);
      setSection(locked.section);
      setGen((g) => g + 12);
      setCrystallized(true);

      // A broken contract stops the run BEFORE spending a call, and says which
      // pair failed rather than returning a verse that quietly ignores it.
      const audit = checkContracts(locked.section, contracts);
      if (!audit.ok) {
        setStatus({
          lead: 'Spread and locked — but rhyme links are broken.',
          rest: ` ${audit.violations.length} link(s) failed: ${audit.violations.map((v) => `“${v.aText}”↔“${v.bText}”`).join('; ')}. Fix those tiles in Advanced Studio, then generate.`,
        });
        return;
      }

      setAutoStage('Writing both states…');
      await doNeural(locked.section);
    } finally {
      setAutoBusy(false);
      setAutoStage('');
    }
  };

  const activeNeural = neuralPick === 'B' ? neuralB : neuralA;

  const sendToSongwriter = () => {
    if (!activeNeural) {
      setStatus({ lead: 'Nothing to send.', rest: ' Generate Neural Lyrics (A/B) first, pick a state, then send.' });
      return;
    }
    if (onSendToSongwriter) {
      onSendToSongwriter({
        lyrics: activeNeural,
        artist: 'The Matrix',
        source: 'quantum',
        notes: `Quantum palette: ${[...new Set(cells.map((c) => c.text))].join(', ')}`,
      });
      setStatus({ lead: 'Sent to Songwriter.', rest: ` State ${neuralPick} is in Songwriter as “Matrix Verse”.` });
    }
  };

  const sendToForge = () => {
    const palette = [...new Set(cells.map((c) => c.text))];
    const endWords = section.lines.map((l) => l.cells[l.cells.length - 1].text);
    if (onSendToForge) {
      onSendToForge({
        palette,
        endWords,
        rhymeScheme: dna?.rhymeScheme || 'AABB',
        verse: activeNeural || '',
        keywords: keywordDraft,
      });
      setStatus({ lead: 'Sent to Song Forge.', rest: ' Grid structure is seeding Song Forge — finish a full song + cover there.' });
    }
  };

  /** Help button — opens the step guide and names every button in order. */
  const doHelp = () => {
    setHowtoOpen(true);
    // Show them the guide — a status line they might not look at isn't help.
    requestAnimationFrame(() => {
      howtoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setStatus({
      lead: 'Here is the order.',
      rest: ' Step 1 type your words up top. Step 2 Load into Grid. Step 3 Spotlight, then click tiles to heat them. '
        + 'Step 4 Run 12 gens to spread the energy. Step 5 Crystallize to lock it in. Step 6 Generate Neural Lyrics writes the verse. '
        + 'Then Send to Songwriter or Send to Song Forge. Freeze cell pins one tile; Rhyme Links View shows the links. '
        + 'Every button is right here under the grid — there is nothing to type.',
    });
  };

  const stress01 = (s) => (s > 0 ? 'strong' : 'weak');
  const dominant = dna?.rhymeScheme ? [...new Set(dna.rhymeScheme.split(''))].join(' · ') : '—';

  const rootCls = ['ql-root', mobile && 'ql-mob', drawer && `ql-draw-${drawer}`]
    .filter(Boolean).join(' ');

  return (
    <div className={rootCls}>
      {/* ── PHONE: the two drawer buttons ──────────────────────────────────
          Labelled, always visible, sitting above the grid. No swipe-from-
          the-edge gesture, no hidden handle: if a control exists it has a
          button with a word on it. */}
      {mobile && (
        <div className="ql-mobbar">
          <button
            type="button"
            className={`ql-mobtab ${drawer === 'controls' ? 'is-open' : ''}`}
            onClick={() => setDrawer((d) => (d === 'controls' ? null : 'controls'))}
            data-help="Your keywords and all six step buttons. Slides over the grid, then closes again."
          >
            ☰ Words &amp; steps {drawer === 'controls' ? '✕' : '▾'}
          </button>
          <button
            type="button"
            className={`ql-mobtab ql-mobtab-mid ${drawer === 'adv' ? 'is-open' : ''}`}
            onClick={() => setDrawer((d) => (d === 'adv' ? null : 'adv'))}
            data-help="The advanced set: DNA, contracts, measure, multi-section, truth meter, stress, loop, style pressure and the collapse journal."
          >
            ⚙ Advanced
          </button>
          <button
            type="button"
            className={`ql-mobtab ${drawer === 'panels' ? 'is-open' : ''}`}
            onClick={() => setDrawer((d) => (d === 'panels' ? null : 'panels'))}
            data-help="Word Inspector, Section DNA and the scores for the grid as it stands."
          >
            {drawer === 'panels' ? '✕' : '▾'} Inspector ⚛
          </button>
        </div>
      )}

      {/* Tapping the grid closes whichever drawer is open. */}
      {mobile && drawer && (
        <div className="ql-mobscrim" onClick={() => setDrawer(null)} aria-hidden="true" />
      )}

      {/* YOUR KEYWORDS — primary entry point (user owns the grid) */}
      <div
        className="ql-keywords"
        data-demo="ql-keywords"
        data-help="This is how YOU control the grid. Type any words or short phrases you want in the song — as many as you like. Comma or new line between items (so multi-word phrases stay together). Then hit Load into Grid. Spotlight, Run, and Crystallize run on YOUR words — the computer does not invent the seed list for you."
      >
        <label className="ql-keywords-label" htmlFor="ql-kw-input">
          <span className="ql-step-tag">Step 1</span> Your keywords / phrases
        </label>
        <textarea
          id="ql-kw-input"
          className="ql-keywords-input"
          rows={3}
          placeholder={'Example:\nheartbreak, neon signs, cold rain\nmidnight drive, empty cup, fire\n\nComma or new line between phrases. As many as you want.'}
          value={keywordDraft}
          onChange={(e) => setKeywordDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              loadKeywords();
            }
          }}
        />
        <div className="ql-keywords-actions">
          <button
            type="button"
            className="ql-btn accent-ylw"
            onClick={loadKeywords}
            data-demo="ql-load"
            data-help="Fills the grid with the words you typed. Multi-word phrases are fine. If you give fewer than 20, they cycle to fill the grid. Your words stay yours — Crystallize will not replace them with demo dictionary picks."
          >
            <span className="ql-step-tag">Step 2</span> ⬇ Load into Grid
          </button>
          <button
            type="button"
            className="ql-btn"
            onClick={resetDemo}
            data-help="Puts the sample demo grid back (the original mockup words). Your keyword box is cleared. Use this only if you want the factory example."
          >
            Reset demo grid
          </button>
          <span className="ql-keywords-hint">Ctrl+Enter to load · then use the buttons under the grid</span>
        </div>
      </div>

      {/* Always-visible plain-English recipe (collapsible) */}
      <div
        className="ql-howto"
        ref={howtoRef}
        data-help="This is your cheat sheet. Follow the steps once with Tips ON, then experiment. Collapse this box anytime."
      >
        <button
          type="button"
          className="ql-howto-toggle"
          onClick={() => setHowtoOpen((v) => !v)}
          data-help="Show or hide the step-by-step guide."
        >
          <span>How to use The Matrix</span>
          <span className="ql-howto-chev">{howtoOpen ? '▾' : '▸'}</span>
        </button>
        {howtoOpen && (
          <ol className="ql-howto-steps">
            <li>
              <b>Step 1 — put YOUR words in</b> — type keywords/phrases in the box above (as many as you want). Or click any tile in the grid and edit it. You pick the words — not the computer.
            </li>
            <li>
              <b>Step 2 — Load into Grid</b> — your words fill the grid and stay yours.
            </li>
            <li>
              <b>Steps 3 &amp; 4 — heat &amp; spread</b> — <i>Spotlight</i>, click the tiles you care about, then <i>Run 12 gens</i> so the energy moves.
            </li>
            <li>
              <b>Steps 5 &amp; 6 — lock &amp; write</b> — <i>Crystallize</i> (keeps your keywords), then <i>Generate Neural Lyrics</i> (needs a free OpenRouter key in Settings).
            </li>
            <li>
              <b>Send it</b> — <i>Send to Songwriter</i> for the verse, or <i>Send to Song Forge</i> to build the whole song.
            </li>
          </ol>
        )}
        {howtoOpen && (
          <p className="ql-howto-note">
            Every button sits in the <b>Matrix Engine Controls</b> bar right under the grid — nothing to type, no commands.
            Turn <b>Tips ON</b> (💡 in the app header) and hover any control for plain English.
            The sample grid is only an example. Optional: <b>Freeze cell</b> pins one tile. <b>Measure</b> is for demo “open” tiles only — your typed words stay put.
          </p>
        )}
      </div>

      {/* THE FIRE FILTER. One definition, used by every burning tile.

          feTurbulence generates a fractal noise field; feDisplacementMap then
          pushes each pixel of the flame sideways and upward by however bright
          the noise is at that point. The result is an edge that tears and
          re-forms continuously, which is the difference between "a shape that
          is flame coloured" and "fire". The baseFrequency animates so the noise
          itself churns rather than the flame sliding across a static pattern.

          The filter region is clamped to 160% so the browser is not asked to
          rasterise a huge buffer per tile — this runs on 19 tiles at once on a
          phone. */}
      <svg className="ql-fire-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id="ql-fire-warp" x="-30%" y="-30%" width="160%" height="160%"
                  colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.022 0.052"
                          numOctaves="2" seed="7" result="noise">
              <animate attributeName="baseFrequency"
                       dur="1.6s" repeatCount="indefinite"
                       values="0.022 0.052;0.034 0.078;0.018 0.044;0.022 0.052" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="10"
                               xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {/* Grid + energy field */}
      <div
        className="ql-lattice-wrap"
        ref={wrapRef}
        data-help="This whole area is the grid — a 4-line grid of word tiles. Each tile is one word in a draft verse skeleton. Play with heat and crystallize, then generate real lyrics from it."
      >
        {!vidFailed && (
          <div className="ql-bgvid-clip">
            <TabBackground name="quantum" />
            <div className="ql-bgscrim" />
          </div>
        )}
        <EnergyField
          wrapRef={wrapRef}
          gridRef={gridRef}
          links={links}
          finals={finals}
          energyById={energyById}
          showEntanglement={entView}
          running={running}
        />

        {entView && (
          <div
            className={`ql-panel ql-ent-panel ${entOpen ? 'is-open' : ''}`}
            data-help="Shows how many word pairs are linked (entangled). Linked words tend to move together — same repeats or rhyme partners. Turn the links on/off with the Rhyme Links View button."
          >
            <button
              type="button"
              className="ql-ent-head"
              onClick={() => setEntOpen((v) => !v)}
              aria-expanded={entOpen}
            >
              <span>Linked pairs</span>
              <span className="ql-ent-count">{links.length}</span>
            </button>
            <div className="ql-ent-body">
            <div style={{ display: 'flex', gap: 8 }}>
              {[3, 11].map((s, i) => (
                <svg key={i} className="ql-spark" viewBox="0 0 150 40" preserveAspectRatio="none" style={{ flex: 1 }}>
                  <path d={sparkPath(s)} fill="none" stroke={i ? YLW : ORG} strokeWidth="1.6" style={{ filter: `drop-shadow(0 0 4px ${i ? YLW : ORG})` }} />
                </svg>
              ))}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(200,190,220,0.6)', marginTop: 4 }}>
              Active pairs: {links.length}
            </div>
            </div>
          </div>
        )}

        {/* The canvas fire that used to burn over the whole grid is gone —
            Chris, 2026-08-27: *"get rid of that fucking fire."* The tiles keep
            their own heat ramp, which is the part that actually carries
            meaning; the particle layer on top was decoration. */}

        <div className="ql-lattice" ref={gridRef} style={{ gridTemplateColumns: `repeat(${cols}, minmax(72px, 1fr))` }}>
          {section.lines.map((line) =>
            line.cells.map((cell) => {
              const isSel = cell.id === selectedId;
              const { c, glow, heat } = tileColor(cell, isSel, heatByCell.get(cell.id) || 0);
              const cls = [
                'ql-tile',
                isSel && 'sel',
                cell.frozen && 'frozen',
                cell.isSuperposition && 'super',
                // Only the genuinely hot tiles catch fire. If everything burned
                // the flames would stop meaning anything.
                !cell.frozen && heat >= 0.72 && 'ql-burning',
                !cell.frozen && heat >= 0.88 && 'ql-blazing',
                flashTileId === cell.id && 'ql-tile-flash',
              ].filter(Boolean).join(' ');
              const stateLabel = cell.frozen ? 'pinned' : cell.isSuperposition ? 'still open to change' : 'settled';
              return (
                <div
                  key={cell.id}
                  data-cell={cell.id}
                  className={cls}
                  style={{ '--tc': c, '--glow': `${glow}px`, '--heat': heat.toFixed(2), '--fh': fireHue(cell) }}
                  onClick={() => onTile(cell)}
                  onDoubleClick={() => onTileDouble(cell)}
                  data-help={`“${cell.text}” — energy ${pct(cell.energy)} (${stateLabel})${cell.userOwned ? ' · YOUR word' : ''}. Click = purple (grid tile). Double-click or edit below. Spotlight ON = pour heat.`}
                >
                  <span className="ql-tile-word">{cell.text}</span>
                  {phoneticsOn && (
                    <span className="ql-tile-phono" aria-hidden>
                      <span className="ql-tile-stress">{cell.stress > 0 ? '●' : '○'}</span>
                      <span className="ql-tile-rime">{String(cell.rhymeClass || '—').replace(/^U_/, '~').slice(0, 6)}</span>
                    </span>
                  )}
                  <span className="ql-tile-dots" aria-hidden="true">
                    <i className={cell.userOwned ? 'on' : ''} />
                    <i className={!cell.isSuperposition ? 'on' : ''} />
                  </span>
                  {cell.isSuperposition && <span className="ql-tile-super-badge">Σ</span>}
                  {/* No flame element here. There is no flame anywhere any
                      more — the canvas particle layer was removed on
                      2026-08-27. A tile carries its heat entirely through its
                      own colour ramp now. */}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══ TIER 1 — THE QUICK PATH ═══════════════════════════════════════
          One button, directly under the grid, doing the whole job. This is the
          default view and it is what the tab is FOR. Everything else lives in
          the drawer below and nobody has to open it to get a verse. */}
      <button
        type="button"
        className="ql-quickpath"
        onClick={autoCraftVerse}
        disabled={autoBusy || busy || running}
        data-demo="matrix-autocraft"
        data-help="ONE CLICK. Spreads energy across the grid for 12 generations, locks the field, then writes two complete verses (State A and State B). Everything the six numbered buttons do, in the right order, without you having to remember it. Needs a free OpenRouter key in Settings."
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '18px 20px',
          marginTop: 14,
          borderRadius: 14,
          cursor: autoBusy || busy || running ? 'wait' : 'pointer',
          background: 'linear-gradient(180deg, rgba(var(--accent-rgb),0.16), rgba(0,0,0,0.55))',
          border: '1px solid var(--accent-neon, #00f0ff)',
          boxShadow: `0 0 22px rgba(var(--accent-rgb),0.28)`,
          color: '#f3ecff',
          opacity: autoBusy || busy || running ? 0.7 : 1,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>⚡</span>
        <span style={{ textAlign: 'left' }}>
          <span style={{
            display: 'block',
            fontFamily: "'Audiowide', 'Orbitron', sans-serif",
            fontSize: '1.15rem',
            letterSpacing: '0.04em',
            color: 'var(--accent-neon, #00f0ff)',
          }}>
            {autoBusy ? (autoStage || 'Auto-Crafting…') : 'Auto-Craft Verse'}
          </span>
          <span className="ql-mono" style={{
            display: 'block',
            fontSize: '0.68rem',
            letterSpacing: '0.16em',
            opacity: 0.75,
            marginTop: 3,
          }}>
            SPREAD, LOCK &amp; GENERATE · 1-CLICK RUN
          </span>
        </span>
      </button>

      <p
        className="ql-status"
        data-help="Live feedback after each action — what just happened and what to try next."
      >
        <b>{status.lead}</b>{status.rest}
        <span className="ql-caret" />
      </p>

      {/* ══ TIER 2 — ADVANCED STUDIO ══════════════════════════════════════
          Everything below is the granular path: the six numbered steps and the
          nine-panel power suite. Nothing was removed and nothing is
          unreachable — it is CLOSED ON ARRIVAL because presenting it all flat,
          equally prominent, meant nothing was prominent and the actual job
          (words in, verse out) sat six presses deep in a wall of instruments. */}
      <button
        type="button"
        className="ql-adv-toggle"
        onClick={() => setAdvOpen((v) => !v)}
        aria-expanded={advOpen}
        data-help="Opens the manual controls: the six numbered steps, and the nine studio panels (DNA, rhyme links, measure, sections, truth meter, stress, loop, style, journal). You never need these to get a verse — Auto-Craft above runs them for you."
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          marginTop: 14,
          borderRadius: 10,
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-hairline, rgba(160,200,255,0.16))',
          color: '#c8d7f0',
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '0.82rem',
          letterSpacing: '0.08em',
        }}
      >
        <span>⚙ ADVANCED STUDIO CONTROLS &amp; SECTIONAL PHYSICS</span>
        <span style={{ opacity: 0.7 }}>{advOpen ? '▲' : '▼'}</span>
      </button>

      {advOpen && (
      <>
      {/* ── ACTION BAR ── every command is a button, right under the grid ──
          Nobody should have to know a terminal to run this tab. The old
          "/run /crystallize /send" text bar at the bottom of the page is gone. */}
      <div
        className="ql-actionbar"
        data-demo="ql-actionbar"
        data-help="Every Matrix action, in order. Left to right: heat it, run it, lock it, write it, then send it."
      >
        <div className="ql-actionbar-caption">
          <span className="ql-actionbar-title">Matrix Engine Controls</span>
          <span className="ql-actionbar-sub">
            Press them left to right — or use the one orange button to do Steps 4 and 5 in a single press.
            Hover any button for plain English.
          </span>
        </div>

        <div className="ql-actionbar-row ql-actionbar-primary">
          <button
            type="button"
            className={`ql-btn ${spotlightMode ? 'on-org' : ''}`}
            onClick={() => {
              setSpotlightMode((v) => !v);
              setStatus(
                !spotlightMode
                  ? { lead: 'Spotlight ON.', rest: ' Button is ORANGE while on. Click any grid tile to pour heat. Click Spotlight again to turn off.' }
                  : { lead: 'Spotlight OFF.', rest: ' Clicks select tiles again (purple) instead of heating them.' }
              );
            }}
            data-demo="ql-spotlight"
            data-help="STEP 3. Turn ON = the button stays ORANGE. Then click any grid tile to pour heat into it. Click Spotlight again to turn it off."
          >
            <span className="ql-step-tag">Step 3</span> 💡 Spotlight
          </button>
          <button
            type="button"
            className={`ql-btn ${running ? 'ql-btn-busy' : ''}`}
            onClick={doRun}
            disabled={running}
            data-demo="ql-run"
            data-help="STEP 4. Moves energy across the grid for 12 steps. Hotter tiles matter more when you Crystallize."
          >
            <span className="ql-step-tag">Step 4</span> ▷ Run 12 gens
          </button>
          <button
            type="button"
            className={`ql-btn ${crystallized ? 'on-grn' : ''}`}
            onClick={doCrystallize}
            data-demo="ql-crystallize"
            data-help="STEP 5. Locks the grid energy state. Your keywords stay. Turns GREEN once it is locked."
          >
            <span className="ql-step-tag">Step 5</span> ❄ Crystallize
          </button>
          {/* Steps 4+5 in one press. Sits right after them so the relationship
              is obvious, and it does not replace either one. */}
          <button
            type="button"
            className={`ql-btn ql-btn-combo ${running ? 'ql-btn-busy' : ''}`}
            onClick={doRunAndLock}
            disabled={running}
            data-demo="ql-runlock"
            data-help="Does STEP 4 and STEP 5 together in one press — spreads the energy for 12 steps, then locks the field. Same result as clicking Run then Crystallize. Use the two buttons separately if you want to watch what each one does."
          >
            <span className="ql-step-tag">Steps 4+5</span> ⚡ Spread &amp; Lock
          </button>
          <button
            type="button"
            className={`ql-btn accent-ylw ${busy ? 'ql-btn-busy' : ''}`}
            onClick={() => doNeural()}
            disabled={busy}
            data-demo="ql-generate"
            data-help="STEP 6. Writes a 4-line verse from your grid — two versions, A and B (needs a free OpenRouter key in Settings)."
          >
            <span className="ql-step-tag">Step 6</span> ✳ {busy ? 'Generating…' : 'Generate Neural Lyrics'}
          </button>
        </div>

        <div className="ql-actionbar-row ql-actionbar-secondary">
          <button
            type="button"
            className={`ql-btn ${selected?.frozen ? 'on-grn' : ''}`}
            onClick={doFreeze}
            data-help="Optional. Select a grid tile first, then Freeze to pin it (turns green). Click again to unpin."
          >
            🔒 Freeze cell
          </button>
          <button
            type="button"
            className={`ql-btn ${entView ? 'on-grn' : ''}`}
            onClick={() => {
              setEntView((v) => !v);
              setStatus({
                lead: entView ? 'Links hidden.' : 'Links shown.',
                rest: entView ? ' Rhyme link lines off.' : ' Glowing links between related tiles are visible.',
              });
            }}
            data-help="Shows or hides rhyme link lines between related grid tiles. Green when links are visible."
          >
            ⋈ Rhyme Links View
          </button>
          <button
            type="button"
            className="ql-btn"
            onClick={sendToSongwriter}
            data-demo="ql-send-songwriter"
            data-help="Sends the verse you picked (State A or B) straight into the Songwriter tab. Generate Neural Lyrics first."
          >
            → Send to Songwriter
          </button>
          <button
            type="button"
            className="ql-btn"
            onClick={sendToForge}
            data-demo="ql-send-forge"
            data-help="Sends this grid — palette, end-words, rhyme scheme and the picked verse — into Song Forge to build a full song."
          >
            → Send to Song Forge
          </button>
          <button
            type="button"
            className="ql-btn"
            onClick={doHelp}
            data-demo="ql-help"
            data-help="Opens the step-by-step guide and reminds you what each button does."
          >
            ？ Help
          </button>
          <span
            className="ql-genbadge ql-mono"
            data-help="How many energy steps you have run so far. Each Run 12 gens adds 12."
          >
            gen {gen}
          </span>
        </div>
      </div>

      {/* The status line used to sit here, between the action bar and the
          feature panels. It moved up next to Auto-Craft: it reports what the
          Quick Path is doing too, and a progress line hidden inside a closed
          drawer is a progress line nobody reads. */}

      {/* Features 1–9: DNA, rhyme links, measure, multi-section, truth, stress, loop, style, journal */}
      <QuantumFeaturesPanel
        section={section}
        setSection={setSection}
        links={links}
        setLinks={setManualLinks}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        keywordDraft={keywordDraft}
        neuralA={neuralA}
        neuralB={neuralB}
        neuralPick={neuralPick}
        setStatus={setStatus}
        activeSectionId={activeSectionId}
        setActiveSectionId={setActiveSectionId}
        songMap={songMap}
        setSongMap={setSongMap}
        contracts={contracts}
        setContracts={setContracts}
        dnaUsed={dnaUsed}
        setDnaUsed={setDnaUsed}
        stylePressure={stylePressure}
        setStylePressure={setStylePressure}
        phoneticsOn={phoneticsOn}
        setPhoneticsOn={setPhoneticsOn}
        onTruthReport={setTruthReport}
        truthReport={truthReport}
      />
      </>
      )}
      {/* ══ END TIER 2 ═══════════════════════════════════════════════════ */}

      {/* Multi-state neural output A / B + one-click handoffs.
          OUTSIDE the drawer on purpose: this is the Quick Path's result, and it
          has to be visible to somebody who never opens Advanced Studio. */}
      {(neuralA || neuralB) && (
        <div
          className="ql-panel ql-neural-out"
          style={{ marginTop: 12, borderColor: 'rgba(234,255,43,0.4)' }}
          data-help="Two multi-state verses from the same grid. Pick A or B (collapse), then Send to Songwriter or Song Forge in one click."
        >
          <h4 style={{ color: YLW }}>Neural Lyrics — multi-state</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              type="button"
              className={`ql-mini ${neuralPick === 'A' ? 'ylw' : ''}`}
              onClick={() => setNeuralPick('A')}
              data-help="Collapse to State A (more direct/emotional take)."
            >
              State A {neuralPick === 'A' ? '✓' : ''}
            </button>
            <button
              type="button"
              className={`ql-mini ${neuralPick === 'B' ? 'ylw' : ''}`}
              onClick={() => setNeuralPick('B')}
              data-help="Collapse to State B (more abstract/image-heavy take)."
            >
              State B {neuralPick === 'B' ? '✓' : ''}
            </button>
            <button type="button" className="ql-mini grn" onClick={sendToSongwriter} data-help="One-click: open Songwriter with the picked state as a verse.">
              → Send to Songwriter
            </button>
            <button type="button" className="ql-mini" onClick={sendToForge} data-help="One-click: open Song Forge with this grid as the seed for a full song + cover.">
              → Send to Song Forge
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ opacity: neuralPick === 'A' ? 1 : 0.55, border: neuralPick === 'A' ? '1px solid rgba(234,255,43,0.5)' : '1px solid transparent', borderRadius: 10, padding: 8 }}>
              <div style={{ fontSize: '0.7rem', color: YLW, marginBottom: 6 }}>STATE A</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.92rem', lineHeight: 1.55, color: '#f3ecff' }}>{neuralA || '—'}</pre>
            </div>
            <div style={{ opacity: neuralPick === 'B' ? 1 : 0.55, border: neuralPick === 'B' ? '1px solid rgba(234,255,43,0.5)' : '1px solid transparent', borderRadius: 10, padding: 8 }}>
              <div style={{ fontSize: '0.7rem', color: YLW, marginBottom: 6 }}>STATE B</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: "'Space Grotesk', sans-serif", fontSize: '0.92rem', lineHeight: 1.55, color: '#f3ecff' }}>{neuralB || '—'}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Panels */}
      <div className="ql-panels">
        <div
          className="ql-panel"
          data-help="Details for the word tile you selected. Word = the text. Stress = strong or weak beat (how it sits in the rhythm). Energy = how hot it is (0–100%). State: open = still free to change, collapsed = settled on one word, frozen = pinned by you."
        >
          <h4>Word Inspector</h4>
          <label
            className="ql-edit-label"
            htmlFor="ql-cell-edit"
            data-help="Type ANY word or short phrase for the selected tile. This is how you override the computer. Multi-word phrases are fine (e.g. cold rain)."
          >
            Your word (edit this tile)
          </label>
          <div className="ql-edit-row">
            <input
              id="ql-cell-edit"
              className="ql-edit-input"
              value={editDraft}
              onChange={(e) => { setEditDraft(e.target.value); setEditingId(selectedId); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCellEdit(); } }}
              placeholder="Type your word or phrase…"
              data-help="Replace the selected tile with whatever you type. Press Enter or Apply. This is your keyword — the grid will not swap it out."
            />
            <button
              type="button"
              className="ql-mini ylw"
              onClick={applyCellEdit}
              data-help="Saves the text you typed onto the selected tile and marks it as yours."
            >
              Apply
            </button>
          </div>
          <div className="ql-kv" data-help="What's on the tile right now.">
            <span className="k">on tile</span><span className="v ql-v-ylw">{selected?.text}</span>
          </div>
          <div className="ql-kv" data-help="yours = you typed it (protected). demo = came from the sample grid.">
            <span className="k">owner</span>
            <span className="v ql-v-org">{selected?.userOwned ? 'yours' : 'demo sample'}</span>
          </div>
          <div className="ql-kv" data-help="Strong = strong beat. Weak = softer beat. Rhythm feel, not volume.">
            <span className="k">stress</span><span className="v ql-v-org">{stress01(selected?.stress)}</span>
          </div>
          <div className="ql-kv" data-help="How hot this tile is (0–100%). Raise with Spotlight + Run 12 gens.">
            <span className="k">energy</span><span className="v ql-v-org">{pct(selected?.energy)}</span>
          </div>
          <div
            className="ql-kv"
            data-help="frozen = you pinned it. open = demo tile that could still swap. settled = fixed for now."
          >
            <span className="k">state</span>
            <span className="v ql-v-grn">
              {selected?.frozen ? 'frozen (pinned)' : selected?.userOwned ? 'yours (kept)' : selected?.isSuperposition ? 'open (demo can change)' : 'settled'}
            </span>
          </div>
          <button
            className="ql-mini ylw"
            style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
            onClick={doMeasure}
            data-help="Only useful on demo 'open' tiles with alternate options. Your typed keywords are already final — use Edit + Apply instead of Measure."
          >
            ◎ Measure this word
          </button>
        </div>

        <div
          className="ql-panel"
          data-help="The skeleton of your section: stress = beat pattern (1 = strong, 0 = weak), rhyme scheme = AABB means lines 1–2 rhyme and 3–4 rhyme, dominant = the active rhyme groups, avg energy = how hot the whole grid is. You do not have to edit these by hand — Mutate and Crystallize update them."
        >
          <h4>Section DNA</h4>
          <div className="ql-mini-btns">
            {/* The banner is gone, so this button IS the lock indicator now —
                it says which state the DNA is in, and goes green when pinned. */}
            <button
              className={`ql-mini ${section.frozen ? 'grn' : ''}`}
              onClick={doLock}
              data-help="Pins every word so nothing can change. Click again to unlock. Green and reading DNA Locked means every word is pinned. Use when the grid looks good and you only want to Generate Neural Lyrics."
            >
              {section.frozen ? '🔒 DNA Locked' : '🔓 DNA Unlocked'}
            </button>
            <button
              className="ql-mini grn"
              onClick={doMutate}
              data-help="Optional. Slightly changes the strong/weak beat pattern (rhythm feel) without rewriting the rhyme plan. Watch the stress line update."
            >
              ⑂ Mutate
            </button>
            <button
              className="ql-mini"
              onClick={doInject}
              data-help="Optional. Swaps some tiles for related word options from a small bank. Same structure, fresher words. Then Run / Crystallize again if you like."
            >
              💉 Inject
            </button>
          </div>
          <div className="ql-kv" data-help="Beat map for the whole section. 1 = strong beat, 0 = weak. Dashes separate lines. Mutate flips a few of these on purpose.">
            <span className="k">stress</span>
            <span className="v ql-mono ql-v-grn" style={{ fontSize: '0.82rem' }}>{dna?.stressSignature || '—'}</span>
          </div>
          <div className="ql-kv" data-help="Which lines are supposed to rhyme. AABB means line 1 rhymes with line 2, and line 3 rhymes with line 4. Crystallize tries to make the end words honor this.">
            <span className="k">rhyme scheme</span><span className="v ql-v-ylw">{dna?.rhymeScheme || '—'}</span>
          </div>
          <div className="ql-kv" data-help="The active rhyme groups right now (for example A and B). A quick snapshot of how the grid is grouping end sounds.">
            <span className="k">dominant</span><span className="v ql-v-org">{dominant}</span>
          </div>
          <div className="ql-kv" data-help="Average heat of every tile. Higher means the grid is 'active.' After Spotlight and Run 12 gens this often rises, then Crystallize settles choices.">
            <span className="k">avg energy</span><span className="v ql-v-org">{pct(dna?.averageEnergy)}</span>
          </div>
        </div>

        <div
          className="ql-panel"
          data-help="Live grades from 0 to 1 (higher is stronger). Rhyme = end rhymes holding. Stress = meter feel. Semantic = meaning flow. Energy = heat balance across the grid. These update as you play — use them as a guide, not a test score."
        >
          <h4>Score</h4>
          {[
            ['rhyme', score.rhymeStrength, false, 'How well the end-of-line rhymes are holding (AABB style). Higher = stronger rhymes. Crystallize usually improves this.'],
            ['stress', score.stressFidelity, true, 'How steady the strong/weak beat pattern feels (the meter). Mutate changes this a little on purpose.'],
            ['semantic', score.semanticCoherence, false, 'How smoothly the meaning seems to flow line to line. A rough guide — real song sense comes when you Generate Neural Lyrics.'],
            ['energy', score.energyBalance, true, 'How balanced heat is across the grid. Very uneven energy means a few tiles are much hotter than others. Run 12 gens spreads heat around.'],
          ].map(([label, val, grn, help]) => (
            <div className="ql-score-row" key={label} data-help={help}>
              <div className="ql-score-top"><span className="lbl">{label}</span><span className="num">{f2(val)}</span></div>
              <div className={`ql-bar ${grn ? 'grn' : ''}`}><span style={{ width: pct(val) }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
