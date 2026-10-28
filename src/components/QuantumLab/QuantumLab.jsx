import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import { useLyricStore } from '../../context/LyricStore.jsx';
import { callAI, wantsExplicit } from '../../services/AIService.js';
import { CLICHE_RE, clicheFree } from '../../services/cliches.js';
import { useLogged } from '../../services/useLogged.js';
import EnergyField from './EnergyField.jsx';
import {
  buildSection, buildSectionFromGrid, keywordsToGrid, buildEntanglements, setCellText,
  runGens, spotlightCell, measureCell,
  crystallizeLab, freezeCell, dnaOf, scoreOf, mutateSection, injectSection, lockSection,
  parseKeywords, setRhymeResolver,
} from './quantumEngine.js';
import QuantumFeaturesPanel from './QuantumFeaturesPanel.jsx';
import {
  checkContracts,
  readStylePressure,
  takeMatrixWords,
  QUANTUM_SECTIONS,
} from './quantumFeatures.js';
import { registerDemoSnapshot } from '../../services/demoSafety.js';
import { registerGhostActions, ghostSettle } from '../../services/ghostBus.js';
import { useMobile } from '../../mobile/useMobile.js';
import './QuantumLab.css';
import { SlidersHorizontal, ArrowDownToLine, Zap, Crosshair, Snowflake, Cpu, Lock, Unlock, Syringe } from 'lucide-react';
import { Icon } from '../common/Glyph.jsx';
import { hasWritingAI } from '../../services/customAI.js';
import { readSunoTags } from '../../services/ghostMemory.js';
import { loadPronunciations, pronunciationsReady, rhymeKey, rhymeKind, findRhymePairs } from '../../services/phonetics.js';
import {
  SONG_PAIRS, REMIXES, guessDelivery, bpmFrom, arrangeForRhyme, verseMessages, songMessages, remixMessages,
  tidySong, fillChoruses, parseSong, scoreSong, needsRepair, repairMessages, rhymeColors, usesWord,
} from './matrixSong.js';

// ============================================================
// Quantum Lab (Lyricist 4.2.0)
// A living grid of lyric syllables driven by the lyric-core engine:
// energy cellular-automata, superposition collapse, entanglement,
// sectional DNA, and neural surface realization (via OpenRouter).
// ============================================================

// Brand neon palette — electric purple · blue · emerald + hot fluorescents for tiles
const MAG = '#9ba1aa', ORG = '#e7a540', GRN = '#10f0a0', YLW = '#9ba1aa', BLU = '#e7a540';
const HOT_ORG = '#ff6f00', HOT_RED = '#ff1a1a', HOT_PNK = '#9ba1aa';
// Violet — grid TILES only when selected/clicked (never toolbar)
const VIO = '#9ba1aa';
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
 *   0.00  cold graphite        barely alive
 *   0.18  cool steel
 *   0.36  emerald green
 *   0.52  burning yellow-gold
 *   0.68  molten orange
 *   0.84  fierce red
 *   1.00  white hot core
 *
 * The cold end used to be midnight blue into electric cyan; Chris, 2026-09-15:
 * "get rid of the cyan and purple colors". It starts on graphite and steel now.
 *
 * Entangled (superposition) tiles sit OUTSIDE the ramp in steel, because that
 * is a different property, not more heat. Same reason frozen tiles go grey.
 */
const HEAT_RAMP = [
  [0.00, [38, 42, 48]],     // cold graphite
  [0.18, [120, 128, 138]],  // cool steel
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
  // The tile you picked is white, brighter than any temperature (was violet until 2026-09-27).
  if (selected) return { c: '240, 242, 245', glow: 32, heat: 0 };
  // Frozen is grey in the design — a pinned tile is out of the temperature
  // system entirely, so it leaves the ramp rather than sitting cold on it.
  if (cell.frozen) return { c: '176, 180, 200', glow: 10, heat: 0 };
  const heat = Math.max(0, Math.min(1, rankHeat || 0));
  // Superposition is its own state, not a temperature: steel, off the ramp, and
  // it burns pale gold instead of orange. (Magenta and violet until 2026-09-27;
  // the Sep 15 "no purple" pass missed this line.)
  if (cell.isSuperposition) return { c: '155, 161, 170', glow: Math.round(18 + heat * 30), heat };
  return { c: heatColor(heat), glow: Math.round(10 + heat * 38), heat };
}

/**
 * WHAT COLOUR DOES THIS TILE BURN?
 *
 * TWO ANSWERS, and this is straight off his animation, not a design choice of
 * mine. Fire on this board is ORANGE — real fire, white at the fuel through
 * yellow and orange to red at the tip. The only exception is an ENTANGLED
 * tile, which burns pale GOLD on a steel tile, set apart from the orange fire
 * because a superposed word is not behaving like the rest of the board. (It
 * burned violet until 2026-09-27; Chris: no purple anywhere.)
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
  return cell.isSuperposition ? 48 : 26;
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

/** "Rhyming line endings: x / y, z / w." for the status line, when the grid has them. */
function rhymeNote(section) {
  if (!pronunciationsReady()) return '';
  const ends = section.lines.map((l) => l.cells[l.cells.length - 1]?.text);
  const ok = (a, b) => { const k = rhymeKind(a || '', b || ''); return k !== 'none' && k !== 'same'; };
  const pairs = [[0, 1], [2, 3]].filter(([a, b]) => ok(ends[a], ends[b])).map(([a, b]) => `${ends[a]} / ${ends[b]}`);
  return pairs.length ? ` Rhyming words moved to the line ends: ${pairs.join(', ')}.` : '';
}

const METER_HELP = {
  Flow: 'How many lines fit the beat: the right number of syllables for one bar of this kind of song.',
  Rhyme: 'How many of the lines that should rhyme really do, by sound. Perfect and multi-syllable rhymes count in full, slant rhymes most of the way.',
  Hook: 'How strong the chorus is: written out every time, starts and ends on its title line, short lines, built on the hottest words on the grid.',
};

/** Flow, Rhyme and Hook for one song, and how many grid words it used. */
function SongMeters({ score }) {
  return (
    <div className="ql-meters">
      {[['Flow', score.flow], ['Rhyme', score.rhyme], ['Hook', score.hook]].map(([k, v]) => (
        <div className="ql-meter" key={k} data-help={METER_HELP[k]}>
          <span className="ql-meter-k">{k}</span>
          <span className="ql-bar"><span style={{ width: pct(v) }} /></span>
          <span className="ql-meter-n">{Math.round((v || 0) * 100)}</span>
        </div>
      ))}
      <div className="ql-hits" data-help="How many of your grid words made it into this song. Their tiles light up on the grid.">
        {score.used.length}/{score.paletteSize} words hit
      </div>
    </div>
  );
}

/** One song on screen, with rhyming sounds sharing a colour. */
function RhymeText({ text, plan }) {
  const sections = useMemo(() => rhymeColors(text, plan), [text, plan]);
  return (
    <div className="ql-song-text ql-rhyme-text">
      {sections.map((sec, si) => (
        <div className="ql-song-sec" key={si}>
          <div className="ql-song-sec-name">[{sec.name}]</div>
          {sec.lines.map((parts, li) => (
            <div className="ql-song-line" key={li}>
              {parts.map((p, pi) => (p.c === null
                ? <React.Fragment key={pi}>{p.t}</React.Fragment>
                : <span key={pi} className={`ql-rh ql-rh-${p.c}`}>{p.t}</span>))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Song A or Song B: scores, the lyrics, remixes, pick the winner, send it. */
function SongCard({ which, text, score, err, winner, busy, remixBusy, canUndo, onWin, onSend, onRemix, onUndo }) {
  const isWinner = winner === which;
  const name = score?.plan?.name;
  return (
    <div className={['ql-song-col', isWinner && 'is-winner', winner && !isWinner && 'is-other'].filter(Boolean).join(' ')}>
      <div className="ql-song-label">SONG {which}{name ? ` · ${name.toUpperCase()}` : ''}{isWinner ? ' · ★ WINNER' : ''}</div>
      {text && score && <SongMeters score={score} />}
      {text ? <RhymeText text={text} plan={score?.plan} /> : <p className="ql-song-err">{err ? `Song ${which} did not finish: ${err}` : '—'}</p>}
      {text && (
        <div className="ql-remix" data-help="One-tap remixes. Each one rewrites this song in that direction and checks it again. Undo puts the last version back.">
          {Object.entries(REMIXES).map(([id, r]) => (
            <button key={id} type="button" className="ql-mini" disabled={busy || !!remixBusy} onClick={() => onRemix(which, id)}>
              {remixBusy === `${which}:${id}` ? 'Remixing…' : r.label}
            </button>
          ))}
          {canUndo && (
            <button type="button" className="ql-mini" disabled={busy || !!remixBusy} onClick={() => onUndo(which)}>
              Undo
            </button>
          )}
        </div>
      )}
      <div className="ql-song-actions">
        <button
          type="button"
          className={`ql-mini ${isWinner ? 'grn' : 'ylw'}`}
          onClick={() => onWin(which)}
          disabled={!text}
          data-demo={`ql-win-${which.toLowerCase()}`}
          data-help="Pick the one you like best. It gets the winner's star; then send it to Songwriter."
        >
          {isWinner ? '★ Winner' : 'This one wins'}
        </button>
        <button
          type="button"
          className="ql-mini grn"
          onClick={() => onSend(which)}
          disabled={!text}
          data-demo={`ql-send-song-${which.toLowerCase()}`}
          data-help={`Open Songwriter with Song ${which} as a full song.`}
        >
          → Send Song {which} to Songwriter
        </button>
      </div>
    </div>
  );
}

export default function QuantumLab({ onSendToSongwriter, onSendToForge, onGoToSettings }) {
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

  /* PHONE ONLY. One column, one scroll: keywords, grid, Auto-Craft, Advanced,
     results, inspector, in that order, all in the normal flow. Nothing is
     hidden off-canvas and nothing scrolls on its own. The layout lives in
     the `.ql-mob` block at the end of QuantumLab.css. */
  const mobile = useMobile();
  /* The linked-pairs readout is a glance, not a panel: a chip that opens on
     hover, and on tap for touch screens where hover does not exist. On the
     desktop it floats over the grid; on the phone it sits above it. */
  const [entOpen, setEntOpen] = useState(false);
  const [status, setStatus] = useState({
    lead: 'Your words first.',
    rest: mobile
      ? ' Type YOUR keywords in the box at the top (as many as you want), tap Load into Grid, then tap Auto-Craft. Or tap a tile and edit it. The demo grid is only a starting example.'
      : ' Type YOUR keywords below (as many as you want), hit Load into Grid, then Spotlight / Run / Crystallize. Or click a tile and edit it. The demo grid is only a starting example.',
  });
  const [running, setRunning] = useState(false);
  // Multi-state verse: A and B candidates before you "collapse" to one
  const [neuralA, setNeuralA] = useState(null);
  const [neuralB, setNeuralB] = useState(null);
  const [neuralPick, setNeuralPick] = useState('A'); // which state is active
  // Full songs: one whole song per state, written from the verse + the grid DNA
  // + the keywords. `songErrB` is B's own failure, never a copy of A.
  const [songA, setSongA] = useState(null);
  const [songB, setSongB] = useState(null);
  const [songErrB, setSongErrB] = useState('');
  // "Also write full songs" next to Auto-Craft. ON unless you untick it:
  // Chris, 2026-10-23, "the matrix is now supposed to make 2 full songs." It
  // used to default off, and the old key was written '0' on every first visit,
  // so this reads a new key; only an explicit untick turns it off.
  const [fullSongsOpt, setFullSongsOpt] = useState(() => {
    try { return localStorage.getItem('ql.fullSongs.v2') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('ql.fullSongs.v2', fullSongsOpt ? '1' : '0'); } catch { /* private mode */ }
  }, [fullSongsOpt]);
  // Which two songs A and B are: Rap vs Sung, Story vs Party, Clean vs Explicit. Remembered per browser.
  const [pairId, setPairId] = useState(() => {
    try { const v = localStorage.getItem('ql.pair'); return SONG_PAIRS[v] ? v : 'rapSung'; } catch { return 'rapSung'; }
  });
  useEffect(() => {
    try { localStorage.setItem('ql.pair', pairId); } catch { /* private mode */ }
  }, [pairId]);
  // Each song's Flow / Rhyme / Hook check, the winner, and the version before a remix (for Undo).
  const [scoreA, setScoreA] = useState(null);
  const [scoreB, setScoreB] = useState(null);
  const [winner, setWinner] = useState(null);
  const [prevSongs, setPrevSongs] = useState({});
  const [remixBusy, setRemixBusy] = useState('');
  // The pronunciation dictionary (services/phonetics.js): rhymes by sound once it is in.
  const [dictReady, setDictReady] = useState(pronunciationsReady());
  useEffect(() => {
    let live = true;
    loadPronunciations()
      .then(() => { setRhymeResolver(rhymeKey); if (live) setDictReady(true); })
      .catch((e) => console.warn('[The Matrix] The pronunciation dictionary did not load; rhymes fall back to spelling.', e));
    return () => { live = false; };
  }, []);
  // Tier 1 Quick Path. `autoStage` is what the button says while it works, so a
  // 15 second run is never a dead control with a spinner on it.
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStage, setAutoStage] = useState('');
  // Tier 2 section. Closed on arrival, deliberately — see the note above the
  // Advanced Studio block in the render.
  const [advOpen, setAdvOpen] = useState(false);
  // No key: say so under the button that was tapped, with a button that goes
  // to the key box. It clears itself the moment a key is saved.
  const [needKey, setNeedKey] = useState(false);
  const statusRef = useRef(null);
  const keyMissing = needKey && !hasWritingAI(store.config);
  const showNeedKey = (what) => {
    setNeedKey(true);
    setStatus({
      lead: 'Add your OpenRouter key.',
      rest: ` ${what} needs it. Tap the button below, paste the key, save, then come back.`,
    });
    if (mobile) setTimeout(() => statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };
  const [busy, setBusy] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [vidFailed, setVidFailed] = useState(false);
  /**
   * Cheat sheet starts CLOSED, and stays however you left it.
   *
   * It used to default open, which put a six-step manual above the fold on a
   * tab whose entire point is now one button. The steps it explains all live in
   * the Advanced Studio section; somebody using the Quick Path never needs them.
   * Still one click away, and still remembered per browser.
   */
  const [howtoOpen, setHowtoOpen] = useState(() => {
    try { return localStorage.getItem('ql.howtoOpen') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('ql.howtoOpen', howtoOpen ? '1' : '0'); } catch { /* private mode */ }
  }, [howtoOpen]);
  const howtoRef = useRef(null);
  const kwRef = useRef(null);
  const songsRef = useRef(null);
  const neuralRef = useRef(null);
  // The keyword text that is on the grid right now, so Auto-Craft knows when typed words still need loading.
  const loadedRawRef = useRef('');
  // Freeform keywords Chris types — commas/newlines keep multi-word phrases together
  const [keywordDraft, setKeywordDraft] = useState('');
  // Phone: the keyword box grows with what you type instead of scrolling inside itself.
  useEffect(() => {
    const el = kwRef.current;
    if (!el) return;
    if (!mobile) { el.style.height = ''; return; }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [keywordDraft, mobile]);
  // Phone: the verses land far below the button that made them, so bring them up.
  const showVerses = () => {
    if (mobile) setTimeout(() => neuralRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
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
  // Ghost Rider's "send DNA to The Matrix" lands here while this tab is open.
  useEffect(() => {
    // Say it landed on the status line: the Style box itself sits closed in
    // Advanced Studio, so without this the send looked like it did nothing.
    const pick = () => {
      const s = readStylePressure();
      setStylePressure(s);
      if (s) setStatus({ lead: `${s.artist || 'Ghost Rider'} Style DNA loaded.`, rest: ' The next verse writes under its rhythm, density and images. Advanced Studio → 8 Style shows it.' });
    };
    window.addEventListener('lyricist:style-dna', pick);
    return () => window.removeEventListener('lyricist:style-dna', pick);
  }, []);
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
    neuralA, neuralB, neuralPick, songA, songB, scoreA, scoreB, winner, keywordDraft, contracts, dnaUsed, status,
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
      setSongA(s.songA ?? null);
      setSongB(s.songB ?? null);
      setScoreA(s.scoreA ?? null);
      setScoreB(s.scoreB ?? null);
      setWinner(s.winner ?? null);
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

  // A tile lights up when either song uses its word.
  const hitIds = useMemo(() => {
    const text = [songA, songB].filter(Boolean).join('\n');
    if (!text) return null;
    return new Set(cells.filter((c) => usesWord(text, c.text)).map((c) => c.id));
  }, [songA, songB, cells]);

  // ---- actions ----
  const loadFromRaw = useCallback((text, lead = 'Your grid.') => {
    const raw = String(text || '').trim();
    if (!raw) {
      setStatus({
        lead: 'Type something first.',
        rest: ' Put one or more words/phrases in the keyword box (comma or new line between phrases), then Load into Grid.',
      });
      return;
    }
    // Rhyming words go to the ends of the rows, where the lines end (matrixSong.arrangeForRhyme).
    const words = parseKeywords(raw);
    const next = words.length ? buildSectionFromGrid(keywordsToGrid(arrangeForRhyme(words)), { userOwned: true }) : buildSection();
    loadedRawRef.current = raw;
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
      lead,
      rest: ` Loaded your keywords into the grid (${count} token${count === 1 ? '' : 's'} — the first 20 sit on the grid, all of them guide the lyrics). These stay YOUR words.${rhymeNote(next)} Now: Spotlight, Run 12 gens, Crystallize, Generate Neural Lyrics.`,
    });
    return next;
  }, []);
  const loadKeywords = useCallback(() => loadFromRaw(keywordDraft), [keywordDraft, loadFromRaw]);

  // Ghost Rider's twenty words: drawn from the artist's analysis, they fill the
  // keyword box and the grid. Sent while this tab was still closed? They were
  // kept, and are taken once, here, on first open.
  useEffect(() => {
    const land = (words, artist) => {
      if (!words?.length) return;
      const raw = words.join(', ');
      setKeywordDraft(raw);
      loadFromRaw(raw, `${artist || 'Ghost Rider'}'s ${words.length} words.`);
    };
    // The words wait for the pronunciation dictionary (a second at most) so
    // their rhyming pairs land at the ends of the lines.
    let live = true;
    const ready = loadPronunciations().catch(() => {});
    ready.then(() => {
      if (!live) return;
      const waiting = takeMatrixWords();
      if (waiting) land(waiting.words, waiting.artist);
    });
    const onWords = (e) => {
      ready.then(() => {
        if (!live) return;
        const w = takeMatrixWords();
        land(w?.words || e.detail?.words, w?.artist || e.detail?.artist);
      });
    };
    window.addEventListener('lyricist:matrix-words', onWords);
    return () => { live = false; window.removeEventListener('lyricist:matrix-words', onWords); };
  }, [loadFromRaw]);

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
    setSongA(null);
    setSongB(null);
    setSongErrB('');
    setScoreA(null);
    setScoreB(null);
    setWinner(null);
    setPrevSongs({});
    loadedRawRef.current = '';
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
   * EVERYTHING THE SONG ENGINE NEEDS TO KNOW, read off the grid and the app.
   *
   * `srcSection` is how Auto-Craft stays honest: setSection() does not update
   * `section` in this closure, so a run that spreads, locks, then writes hands
   * each step the previous step's actual grid.
   *
   * The physics does real work here: the HOTTEST tiles become the hook words,
   * LINKED tiles that rhyme become rhyme pairs, and tiles still OPEN
   * (superposition) go in as open choices until something locks them.
   */
  const songContext = (srcSection = null, forPair = pairId) => {
    const sec = srcSection || section;
    const secCells = sec.lines.flatMap((l) => l.cells);
    const real = (w) => Boolean(w) && w !== '—' && w !== 'void';
    const byKey = new Map();
    for (const w of [...parseKeywords(keywordDraft), ...secCells.filter((c) => !c.isSuperposition).map((c) => c.text)]) {
      if (real(w) && !byKey.has(w.toLowerCase())) byKey.set(w.toLowerCase(), w);
    }
    const palette = clicheFree([...byKey.values()]);
    const hookWords = [];
    for (const c of [...secCells].sort((x, y) => (y.energy || 0) - (x.energy || 0))) {
      if (hookWords.length === 2) break;
      if (c.isSuperposition || !real(c.text) || CLICHE_RE.test(c.text)) continue;
      if (!hookWords.some((w) => w.toLowerCase() === c.text.toLowerCase())) hookWords.push(c.text);
    }
    const textOf = new Map(secCells.map((c) => [c.id, c.text]));
    const rhymes = (x, y) => { const k = rhymeKind(x || '', y || ''); return k !== 'none' && k !== 'same'; };
    const rhymePairs = [];
    const addPair = (x, y) => {
      if (!real(x) || !real(y) || rhymePairs.length >= 6 || !rhymes(x, y)) return;
      const key = [x, y].map((z) => z.toLowerCase()).sort().join('|');
      if (!rhymePairs.some((p) => p.map((z) => z.toLowerCase()).sort().join('|') === key)) rhymePairs.push([x, y]);
    };
    if (dictReady) {
      [...contracts, ...links].filter((l) => l.type === 'rhyme').forEach((l) => addPair(textOf.get(l.aId), textOf.get(l.bId)));
      findRhymePairs(palette.slice(0, 40)).forEach((p) => addPair(palette[p.i], palette[p.j]));
    }
    const extraLinks = contracts
      .filter((c) => c.type !== 'rhyme')
      .map((c) => ({ type: c.type, a: textOf.get(c.aId), b: textOf.get(c.bId) }))
      .filter((l) => l.a && l.b);
    const openChoices = secCells
      .filter((c) => c.isSuperposition && c.candidates?.length)
      .map((c) => [...new Set([c.text, ...c.candidates.map((x) => x.text)])].slice(0, 4))
      .slice(0, 4);
    const ends = sec.lines.map((l) => l.cells[l.cells.length - 1]?.text);
    const gridEnds = {
      a: dictReady && rhymes(ends[0], ends[1]) ? [ends[0], ends[1]] : null,
      b: dictReady && rhymes(ends[2], ends[3]) ? [ends[2], ends[3]] : null,
    };
    // The sound: Ghost Rider's Suno tags first (the words most often come from
    // there), then Songwriter's tags, then the genre picks.
    const ghostTags = readSunoTags()?.tags || '';
    const genres = [...(store.genreList || []), ...(store.subgenreList || [])];
    const sound = String(ghostTags || store.sunoTags || genres.join(', ')).slice(0, 240);
    const dnaNow = stylePressure || sec.stylePressure || null;
    const everything = [sound, ...genres, store.sunoTags, dnaNow?.rhythm, dnaNow?.cadenceNotes].filter(Boolean).join(' ');
    return {
      pairId: forPair,
      palette,
      hookWords,
      rhymePairs,
      extraLinks,
      openChoices,
      gridEnds,
      genre: sound,
      bpm: bpmFrom(everything),
      delivery: guessDelivery(everything),
      explicit: wantsExplicit(store),
      dna: dnaNow,
      sectionLabel: QUANTUM_SECTIONS.find((x) => x.id === activeSectionId)?.label || 'verse',
    };
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
    if (!hasWritingAI(store.config)) {
      showNeedKey('Generate Neural Lyrics');
      return null;
    }
    const audit = checkContracts(src, contracts);
    if (!audit.ok) {
      setStatus({
        lead: 'Contracts block generate.',
        rest: ` Fix ${audit.violations.length} broken contract(s) first (panel → 2 Contracts → Audit), or remove them.`,
      });
      return null;
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
      const outA = await callAI(verseMessages(songContext(overrideSection), 'A'), store.config, 0.88, 320);
      setNeuralA((outA || '').trim());

      await new Promise((r) => setTimeout(r, 400));

      let outB;
      try {
        outB = await callAI(verseMessages(songContext(overrideSection), 'B'), store.config, 0.95, 320);
      } catch (errB) {
        // B alone is not a failed run. Fall back to A so the tab still has a
        // verse on screen and the pick control still works.
        console.warn('[The Matrix] State B failed, falling back to State A:', errB);
        outB = outA;
      }
      setNeuralB((outB || '').trim());
      setNeuralPick('A');
      setTruthReport(null);
      // New verses make any earlier full songs stale.
      setSongA(null);
      setSongB(null);
      setSongErrB('');
      setScoreA(null);
      setScoreB(null);
      setWinner(null);
      setPrevSongs({});
      setStatus({
        lead: 'Two states ready.',
        rest: mobile
          ? ' Pick A or B, then send it to Songwriter or Song Forge. Or write a full song for each.'
          : ' Pick A or B, open panel → 5 Truth Meter, then snapshot Journal (9) before you send. Or write a full song for each.',
      });
      return { a: (outA || '').trim(), b: (outB || '').trim() };
    } catch (e) {
      setStatus({ lead: 'Could not generate.', rest: ' ' + (e?.message || String(e)) + ' Check Settings and your internet, then try again.' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Room for a whole song with every chorus written out. */
  const songRoom = () => Math.max(Number(store.config?.maxTokens) || 0, 2600);

  /**
   * CHECK, THEN REPAIR ONCE. A song comes back, its choruses are written out in
   * full, and it is scored (Flow, Rhyme, Hook, plus anything sung back from the
   * instructions). When real problems turn up, the lines that failed go back
   * for one repair pass, and the repair is kept only if it scores better: a fix
   * never makes a song worse.
   */
  const finishSong = async (raw, ctx, plan, label) => {
    let text = fillChoruses(tidySong(raw));
    let score = scoreSong(text, plan, ctx);
    if (needsRepair(score)) {
      const n = score.problems.length;
      setStatus({ lead: `Polishing ${label}…`, rest: ` Fixing ${n} spot${n === 1 ? '' : 's'} that missed the beat, the rhyme or the hook.` });
      try {
        const fixed = fillChoruses(tidySong(await callAI(repairMessages(ctx, plan, text, score), store.config, 0.6, songRoom())));
        const again = scoreSong(fixed, plan, ctx);
        if (parseSong(fixed).length >= parseSong(text).length - 1 && again.total > score.total) {
          text = fixed;
          score = again;
        }
      } catch (e) {
        console.warn('[The Matrix] The repair pass failed; keeping the first draft.', e);
      }
    }
    return { text, score: { ...score, plan, paletteSize: ctx.palette.length } };
  };

  /**
   * FULL SONGS, ONE PER STATE.
   *
   * Song A and Song B are two different songs from the same grid (Rap vs Sung,
   * Story vs Party or Clean vs Explicit), each a real song shape for Suno, each
   * checked and repaired before it is shown. The verse each state wrote is a
   * sketch the song is free to rewrite. `srcSection` and the verses are passed
   * in by Auto-Craft for the same stale-closure reason as doNeural.
   */
  const writeFullSongs = async ({ section: srcSection = null, verseA = neuralA, verseB = neuralB } = {}) => {
    if (!hasWritingAI(store.config)) {
      showNeedKey('Writing the songs');
      return null;
    }
    if (!verseA) {
      setStatus({ lead: 'Nothing to build on.', rest: ' Auto-Craft or Generate the two verses first, then write the songs.' });
      return null;
    }
    setBusy(true);
    setSongA(null);
    setSongB(null);
    setSongErrB('');
    setScoreA(null);
    setScoreB(null);
    setWinner(null);
    setPrevSongs({});
    try {
      const ctx = songContext(srcSection);
      const pair = SONG_PAIRS[ctx.pairId] || SONG_PAIRS.rapSung;
      setStatus({ lead: 'Writing Song A…', rest: ` ${pair.A.name}, then Song B (${pair.B.name}). Each one is checked for flow, rhyme and hook.` });
      const a = songMessages(ctx, 'A', verseA);
      const outA = await finishSong(await callAI(a.messages, store.config, 0.85, songRoom()), ctx, a.plan, 'Song A');
      setSongA(outA.text);
      setScoreA(outA.score);

      await new Promise((r) => setTimeout(r, 400));

      setStatus({ lead: 'Writing Song B…', rest: ' Song A is done.' });
      let outB = null;
      try {
        const b = songMessages(ctx, 'B', verseB || verseA);
        outB = await finishSong(await callAI(b.messages, store.config, 0.92, songRoom()), ctx, b.plan, 'Song B');
        setSongB(outB.text);
        setScoreB(outB.score);
      } catch (errB) {
        // B on its own is not a failed run. Say so; never hand back A as B.
        console.warn('[The Matrix] Song B failed:', errB);
        setSongErrB(errB?.message || String(errB));
      }
      setStatus(outB
        ? { lead: 'Two songs ready.', rest: ' Rhyming sounds share a colour. Pick the winner, remix it if you like, then send it to Songwriter.' }
        : { lead: 'Song A ready.', rest: ' Song B could not be written. Press Write full songs again to retry both.' });
      // The songs land far below the button on a phone; take the reader to them.
      if (mobile) setTimeout(() => songsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return { a: outA.text, b: outB?.text || null };
    } catch (e) {
      setStatus({ lead: 'Could not write songs.', rest: ' ' + (e?.message || String(e)) + ' Check Settings and your internet, then try again.' });
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Harder, Funnier, Sadder, Bigger Hook: one song rewritten, checked again. Undo keeps the version before. */
  const remixSong = async (which, kind) => {
    const song = which === 'B' ? songB : songA;
    const before = which === 'B' ? scoreB : scoreA;
    if (!song || busy || autoBusy || remixBusy) return;
    if (!hasWritingAI(store.config)) {
      showNeedKey('Remixing');
      return;
    }
    const label = REMIXES[kind]?.label || 'Remix';
    setRemixBusy(`${which}:${kind}`);
    setStatus({ lead: `Remixing Song ${which}…`, rest: ` ${label}, then it gets checked again.` });
    try {
      const ctx = songContext(null, before?.plan?.pairId || pairId);
      const r = remixMessages(ctx, which, song, kind);
      const out = await finishSong(await callAI(r.messages, store.config, 0.9, songRoom()), ctx, r.plan, `Song ${which}`);
      setPrevSongs((p) => ({ ...p, [which]: { text: song, score: before } }));
      if (which === 'B') { setSongB(out.text); setScoreB(out.score); } else { setSongA(out.text); setScoreA(out.score); }
      setStatus({ lead: `Song ${which}: ${label}.`, rest: ' Not feeling it? Undo puts the last version back.' });
    } catch (e) {
      setStatus({ lead: 'Could not remix.', rest: ' ' + (e?.message || String(e)) + ' Check Settings and your internet, then try again.' });
    } finally {
      setRemixBusy('');
    }
  };

  const undoRemix = (which) => {
    const prev = prevSongs[which];
    if (!prev) return;
    if (which === 'B') { setSongB(prev.text); setScoreB(prev.score); } else { setSongA(prev.text); setScoreA(prev.score); }
    setPrevSongs((p) => ({ ...p, [which]: null }));
    setStatus({ lead: `Song ${which} is back.`, rest: ' This is the version from before the remix.' });
  };

  const pickWinner = (which) => {
    setWinner(which);
    setStatus({ lead: `Song ${which} wins.`, rest: ' Send it to Songwriter, or remix it first.' });
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
   * songContext accepts srcSection.
   *
   * The manual Step 3/4/5/6 buttons are untouched and still in Advanced.
   * This does not replace them; it is the same transforms with nothing to
   * remember.
   */
  const autoCraftVerse = async () => {
    if (autoBusy || busy || running) return;
    setAutoBusy(true);
    try {
      // Words typed but not loaded yet go in first: words in, songs out, no extra tap.
      let base = section;
      const draft = keywordDraft.trim();
      if (draft && draft !== loadedRawRef.current) base = loadFromRaw(draft) || section;
      setAutoStage('Spreading energy…');
      setStatus({ lead: 'Auto-Craft running.', rest: ' Spreading energy across the matrix for 12 generations.' });
      const ran = runGens(base, 12);

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
      const verses = await doNeural(locked.section);
      if (verses && !fullSongsOpt) showVerses();

      // "Also write full songs": same hand-off, the locked grid and the two
      // fresh verses go straight in rather than through stale state.
      if (fullSongsOpt && verses) {
        setAutoStage('Writing full songs…');
        await writeFullSongs({ section: locked.section, verseA: verses.a, verseB: verses.b });
      }
    } finally {
      setAutoBusy(false);
      setAutoStage('');
    }
  };

  const activeNeural = neuralPick === 'B' ? neuralB : neuralA;
  // Every box on this tab, in the Ghost's flight recorder (useLogged.js).
  useLogged('The Matrix · Verse A', neuralA);
  useLogged('The Matrix · Verse B', neuralB);
  useLogged('The Matrix · Picked', neuralPick);
  useLogged('The Matrix · Keywords', keywordDraft);
  useLogged('The Matrix · Song A', songA);
  useLogged('The Matrix · Song B', songB);

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

  // A whole song goes in as its own [Verse 1]/[Chorus]/... sections.
  const sendSongToSongwriter = (which) => {
    const song = which === 'B' ? songB : songA;
    if (!song) {
      setStatus({ lead: 'Nothing to send.', rest: ` Song ${which} is not written yet. Press Write full songs first.` });
      return;
    }
    if (onSendToSongwriter) {
      // The sound and the SINGER go with the song. This sent no tags, so a
      // Taylor Swift song reached Black Hole Studios with no voice on it and
      // was sung by whatever male voice the last song left in the picker.
      onSendToSongwriter({
        lyrics: song,
        artist: 'The Matrix',
        source: 'quantum',
        sunoTags: String(readSunoTags()?.tags || store.sunoTags || '').trim(),
        notes: `Quantum palette: ${[...new Set(cells.map((c) => c.text))].join(', ')}`,
      });
      setStatus({ lead: 'Sent to Songwriter.', rest: ` Song ${which} is in Songwriter as a full song.` });
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

  /**
   * WHAT THE GHOST CAN DO IN THE MATRIX. The Quick Path buttons, called the
   * same way they are pressed. Everything reads through `ghost` after a settle
   * for the same stale-closure reason Auto-Craft threads its section by hand.
   */
  const ghost = useRef({});
  ghost.current = {
    keywordDraft, neuralA, neuralB, neuralPick, status, gen, crystallized, activeNeural,
    songA, songB, songErrB,
    loadKeywords, autoCraftVerse, writeFullSongs, sendToSongwriter, sendSongToSongwriter, sendToForge, resetDemo,
  };
  const MATRIX_FAILED = /^(could not generate|could not write|nothing to build on|need an api key|contracts block|spread and locked — but|type something first)/i;
  const loadForGhost = async (keywords) => {
    const words = Array.isArray(keywords) ? keywords.join(', ') : String(keywords || '');
    if (!words.trim()) return;
    setKeywordDraft(words);
    await ghostSettle();
    ghost.current.loadKeywords();
    await ghostSettle();
  };
  useEffect(() => registerGhostActions({
    describe_matrix: () => {
      const g = ghost.current;
      return [
        `THE MATRIX TAB: keywords "${g.keywordDraft}", ${g.gen} generations run, ${g.crystallized ? 'locked' : 'not locked'}. Status: ${g.status.lead}`,
        g.neuralA ? `State A:\n${g.neuralA}` : 'No verses written yet.',
        g.neuralB ? `State B:\n${g.neuralB}\nPicked: ${g.neuralPick}` : '',
        g.songA ? `Full song A:\n${g.songA}` : '',
        g.songB ? `Full song B:\n${g.songB}` : '',
      ].filter(Boolean).join('\n');
    },
    matrix_load_keywords: async ({ keywords } = {}) => {
      await loadForGhost(keywords);
      if (MATRIX_FAILED.test(ghost.current.status.lead)) throw new Error(ghost.current.status.lead + ghost.current.status.rest);
      return 'loaded the keywords into the grid';
    },
    matrix_autocraft: async ({ keywords } = {}) => {
      await loadForGhost(keywords);
      await ghost.current.autoCraftVerse();
      await ghostSettle();
      const s = ghost.current.status;
      if (MATRIX_FAILED.test(s.lead)) throw new Error(s.lead + s.rest);
      return 'spread, locked and wrote verses A and B';
    },
    matrix_pick: ({ state } = {}) => {
      const pick = String(state).toUpperCase() === 'B' ? 'B' : 'A';
      setNeuralPick(pick);
      return `picked state ${pick}`;
    },
    matrix_send_to_songwriter: async ({ state } = {}) => {
      if (state) { setNeuralPick(String(state).toUpperCase() === 'B' ? 'B' : 'A'); await ghostSettle(); }
      if (!ghost.current.activeNeural) throw new Error('No Matrix verse yet. Auto-Craft one first.');
      ghost.current.sendToSongwriter();
      return 'sent the verse to Songwriter';
    },
    /**
     * WRITE THE FULL SONGS. One whole song per state from the verses already
     * on the grid; optionally sends one to Songwriter.
     */
    matrix_write_full_songs: async ({ state } = {}) => {
      if (!ghost.current.neuralA) throw new Error('No Matrix verse yet. Auto-Craft one first.');
      await ghost.current.writeFullSongs();
      await ghostSettle();
      const s = ghost.current.status;
      if (MATRIX_FAILED.test(s.lead)) throw new Error(s.lead + s.rest);
      if (state) {
        const which = String(state).toUpperCase() === 'B' ? 'B' : 'A';
        ghost.current.sendSongToSongwriter(which);
        return `wrote the full songs and sent Song ${which} to Songwriter`;
      }
      return ghost.current.songErrB ? 'wrote full Song A; Song B failed' : 'wrote a full song for State A and State B';
    },
    /**
     * USE THE STYLE DNA. Loads what Ghost Rider sent as the Matrix's style
     * pressure, seeds the grid with its image motifs when no keywords are
     * given, and Auto-Crafts under it.
     */
    matrix_load_dna: async ({ keywords, craft = true } = {}) => {
      const dna = readStylePressure();
      if (!dna) throw new Error('No Style DNA has been sent yet. Study an artist on Ghost Rider first.');
      setStylePressure(dna);
      await ghostSettle();
      const motifs = Array.isArray(dna.imageClusters) ? clicheFree(dna.imageClusters).join(', ') : '';
      const words = keywords || motifs;
      if (craft && words) {
        await loadForGhost(words);
        await ghost.current.autoCraftVerse();
        await ghostSettle();
        const s = ghost.current.status;
        if (MATRIX_FAILED.test(s.lead)) throw new Error(s.lead + s.rest);
        return `loaded ${dna.artist || 'the'} Style DNA and wrote verses A and B under it`;
      }
      return `loaded ${dna.artist || 'the'} Style DNA as the style pressure`;
    },
    matrix_send_to_forge: () => {
      ghost.current.sendToForge();
      return 'sent the grid to Song Forge';
    },
    matrix_reset: () => {
      ghost.current.resetDemo();
      return 'put the demo grid back';
    },
  }), []);

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

  const rootCls = ['ql-root', mobile && 'ql-mob'].filter(Boolean).join(' ');

  // The Quick Path result (A/B verses, full songs). Phone: directly under Auto-Craft.
  // Desktop: after the Advanced block, as before.
  const resultPanels = (
    <>
        {/* Multi-state neural output A / B + one-click handoffs.
            OUTSIDE Advanced on purpose: this is the Quick Path's result, and it
            has to be visible to somebody who never opens Advanced Studio. */}
        {(neuralA || neuralB) && (
          <div
            ref={neuralRef}
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
              <button
                type="button"
                className="ql-mini ylw"
                onClick={() => writeFullSongs()}
                disabled={busy || autoBusy}
                data-demo="ql-write-songs"
                data-help="Write a whole song for State A and a whole song for State B, side by side. Uses your Matrix DNA and your keywords."
              >
                {busy ? 'Writing…' : 'Write full songs (A + B)'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div style={{ opacity: neuralPick === 'A' ? 1 : 0.55, border: neuralPick === 'A' ? '1px solid rgba(234,255,43,0.5)' : '1px solid transparent', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: mobile ? '0.78rem' : '0.7rem', color: YLW, marginBottom: 6 }}>STATE A</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--faf-font)', fontSize: '0.92rem', lineHeight: 1.55, color: '#e6e8eb' }}>{neuralA || '—'}</pre>
              </div>
              <div style={{ opacity: neuralPick === 'B' ? 1 : 0.55, border: neuralPick === 'B' ? '1px solid rgba(234,255,43,0.5)' : '1px solid transparent', borderRadius: 10, padding: 8 }}>
                <div style={{ fontSize: mobile ? '0.78rem' : '0.7rem', color: YLW, marginBottom: 6 }}>STATE B</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--faf-font)', fontSize: '0.92rem', lineHeight: 1.55, color: '#e6e8eb' }}>{neuralB || '—'}</pre>
              </div>
            </div>
          </div>
        )}

        {/* Two full songs, side by side. One panel, one scroll. On the phone the
            two songs stack, and Write full songs scrolls here when they land.
            Each song shows its Flow / Rhyme / Hook check, rhyming sounds share a
            colour, and it can be remixed, crowned the winner and sent on. */}
        {(songA || songB || songErrB) && (
          <div
            ref={songsRef}
            className="ql-panel ql-songs-out"
            data-help="Song A and Song B, written from your grid and checked for flow, rhyme and hook. Rhyming sounds share a colour. Pick the winner, remix it, send it to Songwriter."
          >
            <div className="ql-songs-head">
              <h4 style={{ color: YLW }}>Full songs — A and B</h4>
              {winner && <span className="ql-winner-note">★ Song {winner} wins</span>}
            </div>
            <div className="ql-songs-cols">
              {['A', 'B'].map((which) => (
                <SongCard
                  key={which}
                  which={which}
                  text={which === 'A' ? songA : songB}
                  score={which === 'A' ? scoreA : scoreB}
                  err={which === 'B' ? songErrB : ''}
                  winner={winner}
                  busy={busy || autoBusy}
                  remixBusy={remixBusy}
                  canUndo={!!prevSongs[which]}
                  onWin={pickWinner}
                  onSend={sendSongToSongwriter}
                  onRemix={remixSong}
                  onUndo={undoRemix}
                />
              ))}
            </div>
          </div>
        )}
    </>
  );

  return (
    <div className={rootCls}>
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
          ref={kwRef}
          className="ql-keywords-input"
          rows={3}
          placeholder={'Example:\npawn shop, borrowed truck, last paycheck\ncounty line, empty cup, fire\n\nComma or new line between phrases. As many as you want.'}
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
            <span className="ql-step-tag">Step 2</span> <Icon i={ArrowDownToLine} />Load into Grid
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
            Turn <b>Tips ON</b> (in the app header) and hover any control for plain English.
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
            <div style={{ fontSize: '0.7rem', color: 'rgba(230,232,235,0.6)', marginTop: 4 }}>
              Active pairs: {links.length}
            </div>
            </div>
          </div>
        )}

        {/* The canvas fire that used to burn over the whole grid is gone —
            Chris, 2026-08-27: *"get rid of that fucking fire."* The tiles keep
            their own heat ramp, which is the part that actually carries
            meaning; the particle layer on top was decoration. */}

        <div className="ql-lattice" ref={gridRef} style={{ gridTemplateColumns: `repeat(${cols}, minmax(${mobile ? 0 : 72}px, 1fr))` }}>
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
                hitIds?.has(cell.id) && 'ql-hit',
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
                  data-help={`“${cell.text}” — energy ${pct(cell.energy)} (${stateLabel})${cell.userOwned ? ' · YOUR word' : ''}${hitIds?.has(cell.id) ? ' · used in the songs' : ''}. The hottest tiles become the hook. Double-click or edit below. Spotlight ON = pour heat.`}
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
          the Advanced section below and nobody has to open it to get a verse. */}
      <button
        type="button"
        className="ql-quickpath"
        onClick={autoCraftVerse}
        aria-busy={autoBusy}
        disabled={autoBusy || busy || running}
        data-demo="matrix-autocraft"
        data-help="ONE CLICK. Loads the words you typed, spreads energy across the grid for 12 generations, locks the field, then writes two verses (State A and State B). With 'Also write full songs' ticked it goes on to write Song A and Song B, checks each one for flow, rhyme and hook, and fixes what missed. Everything the six numbered buttons do, in the right order, without you having to remember it. Needs a free OpenRouter key in Settings."
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
          border: '1px solid var(--accent-neon, #e7a540)',
          boxShadow: `0 0 22px rgba(var(--accent-rgb),0.28)`,
          color: '#e6e8eb',
          opacity: autoBusy || busy || running ? 0.7 : 1,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ lineHeight: 1, display: 'flex' }}><Zap size={22} strokeWidth={1.5} /></span>
        <span style={{ textAlign: 'left' }}>
          <span style={{
            display: 'block',
            fontFamily: 'var(--faf-font)',
            fontSize: '1.15rem',
            letterSpacing: '0.04em',
            color: 'var(--accent-neon, #e7a540)',
          }}>
            {autoBusy ? (autoStage || 'Auto-Crafting…') : (fullSongsOpt ? 'Auto-Craft 2 Songs' : 'Auto-Craft Verse')}
          </span>
          <span className="ql-mono" style={{
            display: 'block',
            fontSize: mobile ? '0.75rem' : '0.68rem',
            letterSpacing: mobile ? '0.08em' : '0.16em',
            opacity: 0.75,
            marginTop: 3,
          }}>
            {fullSongsOpt ? 'WORDS IN · SONG A + SONG B OUT' : 'SPREAD, LOCK & GENERATE · 1-CLICK RUN'}
          </span>
        </span>
      </button>

      <label
        className="ql-fullopt"
        data-demo="ql-fullsongs-opt"
        data-help="After the two verses, write a whole song for each state, side by side. Each song uses your Matrix DNA and your keywords. Takes a little longer."
      >
        <input
          type="checkbox"
          checked={fullSongsOpt}
          onChange={(e) => setFullSongsOpt(e.target.checked)}
        />
        <span>Also write full songs (A + B)</span>
      </label>

      <div
        className="ql-pair"
        data-demo="ql-pair"
        data-help="What makes Song A and Song B different. Rap vs Sung: A raps the verses with a sung hook, B is sung all the way. Story vs Party: A tells a story, B is a chant-along. Clean vs Explicit: same idea, with and without profanity."
      >
        <span className="ql-pair-label">Song A vs Song B</span>
        <div className="ql-pair-btns" role="group" aria-label="Song A vs Song B">
          {Object.entries(SONG_PAIRS).map(([id, p]) => (
            <button
              key={id}
              type="button"
              className={`ql-mini ${pairId === id ? 'ylw' : ''}`}
              aria-pressed={pairId === id}
              onClick={() => setPairId(id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p
        ref={statusRef}
        className="ql-status"
        data-help="Live feedback after each action — what just happened and what to try next."
      >
        <b>{status.lead}</b>{status.rest}
        <span className="ql-caret" />
      </p>
      {keyMissing && onGoToSettings && (
        <button type="button" className="ql-keybtn" onClick={onGoToSettings}>
          Add your OpenRouter key
        </button>
      )}

      {mobile && resultPanels}

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
          fontFamily: 'var(--faf-font)',
          fontSize: '0.82rem',
          letterSpacing: '0.08em',
        }}
      >
        <span><Icon i={SlidersHorizontal} />ADVANCED STUDIO CONTROLS &amp; SECTIONAL PHYSICS</span>
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
            {mobile ? '' : ' Hover any button for plain English.'}
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
            <span className="ql-step-tag">Step 3</span> <Icon i={Crosshair} />Spotlight
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
            <span className="ql-step-tag">Step 5</span> <Icon i={Snowflake} />Crystallize
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
            <span className="ql-step-tag">Steps 4+5</span> <Icon i={Zap} />Spread &amp; Lock
          </button>
          <button
            type="button"
            className={`ql-btn accent-ylw ${busy ? 'ql-btn-busy' : ''}`}
            onClick={async () => { if (await doNeural()) showVerses(); }}
            aria-busy={busy}
            disabled={busy}
            data-demo="ql-generate"
            data-help="STEP 6. Writes a 4-line verse from your grid — two versions, A and B (needs a free OpenRouter key in Settings)."
          >
            <span className="ql-step-tag">Step 6</span> <Icon i={Cpu} />{busy ? 'Generating…' : 'Generate Neural Lyrics'}
          </button>
        </div>

        <div className="ql-actionbar-row ql-actionbar-secondary">
          <button
            type="button"
            className={`ql-btn ${selected?.frozen ? 'on-grn' : ''}`}
            onClick={doFreeze}
            data-help="Optional. Select a grid tile first, then Freeze to pin it (turns green). Click again to unpin."
          >
            <Icon i={Lock} />Freeze cell
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
          closed section is a progress line nobody reads. */}

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

      {!mobile && resultPanels}

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
            data-help="Type ANY word or short phrase for the selected tile. This is how you override the computer. Multi-word phrases are fine (e.g. county line)."
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
              {section.frozen ? <><Icon i={Lock} />DNA Locked</> : <><Icon i={Unlock} />DNA Unlocked</>}
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
              <Icon i={Syringe} />Inject
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
