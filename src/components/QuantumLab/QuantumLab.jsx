import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
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
import './QuantumLab.css';
import quantumMedallionImg from '../../assets/header-medallion.png';

// ============================================================
// Quantum Lab — "Lyricist Goes Quantum" (Lyricist 4.2.0)
// A living lattice of lyric syllables driven by the lyric-core engine:
// energy cellular-automata, superposition collapse, entanglement,
// sectional DNA, and neural surface realization (via OpenRouter).
// ============================================================

// Brand neon palette — electric purple · blue · emerald + hot fluorescents for tiles
const MAG = '#a855f7', ORG = '#00e5ff', GRN = '#10f0a0', YLW = '#c026ff', BLU = '#00f0ff';
const HOT_ORG = '#ff6f00', HOT_RED = '#ff1a1a', HOT_PNK = '#ff00aa';
// Violet — lattice TILES only when selected/clicked (never toolbar)
const VIO = '#b44dff';
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const f2 = (x) => (x || 0).toFixed(2);
const hashClass = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// Lattice tile color: ultra-hot = red, hot = orange, warm = magenta, cool cycles 5 colors
const COOL_TILE_COLORS = [GRN, MAG, HOT_PNK, ORG, '#c084fc'];
function tileColor(cell, selected) {
  if (selected) return { c: VIO, glow: 32 };
  const e = cell.energy || 0;
  const glow = Math.round(8 + e * 32);
  if (cell.frozen) return { c: 'rgba(180,180,200,0.55)', glow: 8 };
  if (e >= 0.78) return { c: HOT_RED, glow };
  if (e >= 0.6) return { c: HOT_ORG, glow };
  if (e >= 0.42) return { c: YLW, glow };
  return { c: COOL_TILE_COLORS[hashClass(cell.rhymeClass) % COOL_TILE_COLORS.length], glow };
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
  // Rebuild links whenever the lattice words change + merge manual contracts
  const links = useMemo(() => {
    const auto = buildEntanglements(section);
    return [...auto, ...manualLinks];
  }, [section, manualLinks]);
  const [selectedId, setSelectedId] = useState('c_0_2');
  const [gen, setGen] = useState(0);
  const [spotlightMode, setSpotlightMode] = useState(false);
  const [crystallized, setCrystallized] = useState(false);
  const [entView, setEntView] = useState(true);
  const [status, setStatus] = useState({
    lead: 'Your words first.',
    rest: ' Type YOUR keywords below (as many as you want), hit Load into lattice, then Spotlight / Run / Crystallize. Or click a tile and edit it. The demo grid is only a starting example.',
  });
  const [running, setRunning] = useState(false);
  // Multi-state verse: A and B candidates before you "collapse" to one
  const [neuralA, setNeuralA] = useState(null);
  const [neuralB, setNeuralB] = useState(null);
  const [neuralPick, setNeuralPick] = useState('A'); // which state is active
  const [busy, setBusy] = useState(false);
  const [cmd, setCmd] = useState('');
  const [isNarrow, setIsNarrow] = useState(false);
  const [vidFailed, setVidFailed] = useState(false);
  const [howtoOpen, setHowtoOpen] = useState(true);
  // Freeform keywords Chris types — commas/newlines keep multi-word phrases together
  const [keywordDraft, setKeywordDraft] = useState('');
  // Inline edit for the selected tile
  const [editDraft, setEditDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  // Purple flash on lattice TILE only (toolbar keeps its own orange/green)
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
  // box and clicks "Load into lattice", which replaces the whole grid. That
  // once wiped a lattice the user had filled with their own words. Snapshot
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
  const bgBase = import.meta.env.BASE_URL || './';
  const videoSrc = `${bgBase}${isNarrow ? 'quantum_bg_mobile.mp4' : 'quantum_bg.mp4'}`;

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

  // ---- actions ----
  const loadKeywords = useCallback(() => {
    const raw = keywordDraft.trim();
    if (!raw) {
      setStatus({
        lead: 'Type something first.',
        rest: ' Put one or more words/phrases in the keyword box (comma or new line between phrases), then Load into lattice.',
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
      lead: 'Your lattice.',
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
      rest: ' Back to the sample lattice. Type your own keywords anytime and hit Load into lattice.',
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
    // Purple flash = lattice tile feedback only
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
        rest: ` “${cell.text}” — purple = this lattice tile is active. Edit it below, or Spotlight / Run / Crystallize.`,
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
      rest: ' Heat moved across the lattice for 12 steps. Brighter / hotter tiles are more likely to change when you Crystallize. Next: Crystallize, or Spotlight another word.',
    });
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
        rest: ` ${audit.violations.length} entanglement contract(s) failed: ${audit.violations.map((v) => `“${v.aText}”↔“${v.bText}”`).join('; ')}. Fix tiles or remove contracts before neural generate.`,
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
        ? ` Picked one word for this tile: “${w}”. Linked (entangled) tiles may shift to match. Optional step — Crystallize still locks the whole lattice at once.`
        : ' This tile settled on one word.',
    });
  };

  const doFreeze = () => {
    const willFreeze = !selected.frozen;
    setSection(freezeCell(section, selectedId, willFreeze));
    setStatus({
      lead: willFreeze ? 'Pinned.' : 'Unpinned.',
      rest: willFreeze
        ? ` “${selected.text}” will not change until you unpin it. Handy when you love a word and want the rest of the lattice to move around it.`
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
      lead: willLock ? 'Whole lattice pinned.' : 'Lattice unpinned.',
      rest: willLock
        ? ' Every word is frozen so nothing drifts. Click Lock again when you want to play.'
        : ' Words can change again.',
    });
  };

  const buildNeuralMessages = (variant) => {
    const endWords = section.lines.map((l) => l.cells[l.cells.length - 1].text);
    const palette = [...new Set(cells.map((c) => c.text))].join(', ');
    const spin = variant === 'B'
      ? 'Variant B: lean more abstract/image-heavy, slightly different angle on the same end-words.'
      : 'Variant A: lean more direct and emotional, plain language.';
    const pressure = buildNeuralConstraints({
      stylePressure: stylePressure || section.stylePressure,
      contracts,
      section,
      dnaUsed,
      forceKeywords: parseKeywords(keywordDraft),
    });
    const secLabel = QUANTUM_SECTIONS.find((s) => s.id === activeSectionId)?.label || 'verse';
    return [
      {
        role: 'system',
        content:
          'You are a surgical lyricist working INSIDE hard craft constraints (quantum lattice). Write ONE tight 4-line verse. Land each line on its given end-word. Honor contracts and style pressure. No clichés, no explanations — output only the 4 lines. Never copy any real artist lyrics.',
      },
      {
        role: 'user',
        content: `Section: ${secLabel}\nSeed palette: ${palette}\nRhyme scheme: ${dna?.rhymeScheme || 'AABB'}\nEnd-words per line (in order): ${endWords.join(', ')}\nStress signature: ${dna?.stressSignature || ''}\n${pressure ? `CONSTRAINTS:\n${pressure}\n` : ''}${spin}\nWrite the 4-line verse now.`,
      },
    ];
  };

  /** Generate multi-state A + B verses (pick one before send). */
  const doNeural = async () => {
    if (!store.config?.openRouterApiKey) {
      setStatus({
        lead: 'Need an API key.',
        rest: ' Open the Settings tab, paste your free OpenRouter key, save, then come back and try Generate Neural Lyrics again.',
      });
      return;
    }
    const audit = checkContracts(section, contracts);
    if (!audit.ok) {
      setStatus({
        lead: 'Contracts block generate.',
        rest: ` Fix ${audit.violations.length} broken contract(s) first (panel → 2 Contracts → Audit), or remove them.`,
      });
      return;
    }
    setBusy(true);
    setStatus({ lead: 'Writing A + B…', rest: ' Generating two multi-state verses under lattice + DNA + style pressure. Pick A or B, run Truth Meter, then send.' });
    try {
      const [outA, outB] = await Promise.all([
        callAI(buildNeuralMessages('A'), store.config, 0.88, 220),
        callAI(buildNeuralMessages('B'), store.config, 0.95, 220),
      ]);
      setNeuralA((outA || '').trim());
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

  const activeNeural = neuralPick === 'B' ? neuralB : neuralA;

  const sendToSongwriter = () => {
    if (!activeNeural) {
      setStatus({ lead: 'Nothing to send.', rest: ' Generate Neural Lyrics (A/B) first, pick a state, then send.' });
      return;
    }
    if (onSendToSongwriter) {
      onSendToSongwriter({
        lyrics: activeNeural,
        artist: 'Quantum Lab',
        source: 'quantum',
        notes: `Quantum palette: ${[...new Set(cells.map((c) => c.text))].join(', ')}`,
      });
      setStatus({ lead: 'Sent to Songwriter.', rest: ` State ${neuralPick} is in Songwriter as “Quantum Lab Verse”.` });
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
      setStatus({ lead: 'Sent to Song Forge.', rest: ' Lattice structure is seeding Song Forge — finish a full song + cover there.' });
    }
  };

  /** Lightweight command bar — /run /spotlight /crystallize /send /forge /help */
  const runCommand = (raw) => {
    const line = String(raw || '').trim().toLowerCase();
    if (!line) return;
    const [head] = line.replace(/^\//, '').split(/\s+/);
    const map = {
      run: doRun,
      r: doRun,
      gens: doRun,
      spotlight: () => setSpotlightMode((v) => !v),
      spot: () => setSpotlightMode((v) => !v),
      crystallize: doCrystallize,
      crystal: doCrystallize,
      c: doCrystallize,
      freeze: doFreeze,
      mutate: doMutate,
      inject: doInject,
      lock: doLock,
      gen: doNeural,
      generate: doNeural,
      neural: doNeural,
      send: sendToSongwriter,
      songwriter: sendToSongwriter,
      forge: sendToForge,
      help: () => setStatus({
        lead: 'Commands.',
        rest: ' /run  /spotlight  /crystallize  /freeze  /mutate  /inject  /lock  /generate  /send  /forge',
      }),
    };
    const fn = map[head];
    if (fn) {
      fn();
      setCmd('');
    } else {
      setStatus({ lead: 'Unknown command.', rest: ` “${head}” — type /help for the list.` });
    }
  };

  const stress01 = (s) => (s > 0 ? 'strong' : 'weak');
  const dominant = dna?.rhymeScheme ? [...new Set(dna.rhymeScheme.split(''))].join(' · ') : '—';

  return (
    <div className="ql-root">
      {/* ── Quantum Lab Banner ── medallion · title · primary buttons ── */}
      <div
        className="ql-banner"
        data-help="Quantum Lab — heat the lattice, crystallize, generate neural lyrics. Medallion left, controls right."
      >
        {/* Left: Chris's medallion — the same one the app header carries */}
        <img src={quantumMedallionImg} alt="Lyricist Goes Quantum" className="ql-banner-medallion" />

        {/* Center: title + subtitle with dynamic DNA state */}
        <div className="ql-banner-center">
          {/* Words only. The two lightning bolts and the hand-drawn "helix"
              beside them were flat, static SVG scribble — nothing like a
              rotating high-colour double helix — and Chris cut them. The
              medallion to the left carries the real artwork. */}
          <div className="ql-banner-title-row">
            <h1 className="ql-title ql-banner-title">QUANTUM LAB</h1>
          </div>
          <p className="ql-banner-subtitle">
            Lyricist's Quantum{' '}
            <span
              className="ql-dna-pill"
              data-help="DNA = this section's rhythm + rhyme plan (not biology). Unlocked = free to change. Locked = everything is pinned so nothing drifts."
            >
              {section.frozen ? 'DNA Locked 🔒' : 'DNA Unlocked 🔓'}
            </span>
          </p>
        </div>

        {/* Right: primary action buttons */}
        <div className="ql-banner-btns">
          <button
            type="button"
            className={`ql-banner-btn ${running ? 'ql-btn-busy' : ''}`}
            onClick={doRun}
            disabled={running}
            data-demo="ql-run"
            data-help="STEP 3. Moves energy across the lattice for 12 steps. Hotter tiles matter more when you Crystallize."
          >
            ▷ Run 12 gens
          </button>
          <button
            type="button"
            className={`ql-banner-btn ${spotlightMode ? 'on-org' : ''}`}
            onClick={() => {
              setSpotlightMode((v) => !v);
              setStatus(
                !spotlightMode
                  ? { lead: 'Spotlight ON.', rest: ' Button is ORANGE while on. Click any lattice tile to pour heat. Click Spotlight again to turn off.' }
                  : { lead: 'Spotlight OFF.', rest: ' Clicks select tiles again (purple) instead of heating them.' }
              );
            }}
            data-demo="ql-spotlight"
            data-help="STEP 2. Turn ON = stays ORANGE. Click a lattice tile to pour heat into it."
          >
            💡 Spotlight
          </button>
          <button
            type="button"
            className={`ql-banner-btn ${crystallized ? 'on-grn' : ''}`}
            onClick={doCrystallize}
            data-demo="ql-crystallize"
            data-help="STEP 4a. Locks the lattice energy state. Your keywords stay. Turns green after success."
          >
            ❄ Crystallize
          </button>
          <button
            type="button"
            className={`ql-banner-btn accent-ylw ${busy ? 'ql-btn-busy' : ''}`}
            onClick={doNeural}
            disabled={busy}
            data-demo="ql-generate"
            data-help="STEP 4b. Writes a 4-line verse from your lattice (needs OpenRouter key in Settings)."
          >
            ✳ {busy ? 'Generating…' : 'Generate Neural Lyrics'}
          </button>
        </div>
      </div>

      {/* YOUR KEYWORDS — primary entry point (user owns the lattice) */}
      <div
        className="ql-keywords"
        data-demo="ql-keywords"
        data-help="This is how YOU control the lattice. Type any words or short phrases you want in the song — as many as you like. Comma or new line between items (so multi-word phrases stay together). Then hit Load into lattice. Spotlight, Run, and Crystallize run on YOUR words — the computer does not invent the seed list for you."
      >
        <label className="ql-keywords-label" htmlFor="ql-kw-input">
          Your keywords / phrases
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
            data-help="Fills the lattice with the words you typed. Multi-word phrases are fine. If you give fewer than 20, they cycle to fill the grid. Your words stay yours — Crystallize will not replace them with demo dictionary picks."
          >
            ⬇ Load into lattice
          </button>
          <button
            type="button"
            className="ql-btn"
            onClick={resetDemo}
            data-help="Puts the sample demo grid back (the original mockup words). Your keyword box is cleared. Use this only if you want the factory example."
          >
            Reset demo grid
          </button>
          <span className="ql-keywords-hint">Ctrl+Enter to load · then Spotlight → Run → Crystallize</span>
        </div>
      </div>

      {/* Always-visible plain-English recipe (collapsible) */}
      <div
        className="ql-howto"
        data-help="This is your cheat sheet. Follow the steps once with Tips ON, then experiment. Collapse this box anytime."
      >
        <button
          type="button"
          className="ql-howto-toggle"
          onClick={() => setHowtoOpen((v) => !v)}
          data-help="Show or hide the step-by-step guide."
        >
          <span>How to use Quantum Lab (the lattice)</span>
          <span className="ql-howto-chev">{howtoOpen ? '▾' : '▸'}</span>
        </button>
        {howtoOpen && (
          <ol className="ql-howto-steps">
            <li>
              <b>Put YOUR words in</b> — type keywords/phrases above (many allowed), hit <i>Load into lattice</i>. Or click any tile and edit it. You pick the words — not the computer.
            </li>
            <li>
              <b>Turn Tips ON</b> — 💡 in the header; hover any control for plain English.
            </li>
            <li>
              <b>Heat & spread</b> — <i>Spotlight</i> a tile you care about, then <i>Run 12 gens</i> so energy moves.
            </li>
            <li>
              <b>Lock & write</b> — <i>Crystallize</i> (keeps your keywords), then <i>Generate Neural Lyrics</i> (OpenRouter key in Settings).
            </li>
          </ol>
        )}
        {howtoOpen && (
          <p className="ql-howto-note">
            The sample grid is only an example. Optional: <b>Freeze cell</b> pins one tile. <b>Measure</b> is for demo “open” tiles only — your typed words stay put.
          </p>
        )}
      </div>

      {/* Lattice + energy field */}
      <div
        className="ql-lattice-wrap"
        ref={wrapRef}
        data-help="This whole area is the lattice — a 4-line grid of word tiles. Each tile is one word in a draft verse skeleton. Play with heat and crystallize, then generate real lyrics from it."
      >
        {!vidFailed && (
          <div className="ql-bgvid-clip">
            <video
              className="ql-bgvid"
              src={videoSrc}
              key={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onError={() => setVidFailed(true)}
            />
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
            className="ql-panel ql-ent-panel"
            style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, width: 250, padding: '10px 12px' }}
            data-help="Shows how many word pairs are linked (entangled). Linked words tend to move together — same repeats or rhyme partners. Turn the links on/off with the Entanglement View button."
          >
            <h4 style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              Linked pairs <span style={{ opacity: 0.5 }}>⋯</span>
            </h4>
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
        )}

        <div className="ql-lattice" ref={gridRef} style={{ gridTemplateColumns: `repeat(${cols}, minmax(72px, 1fr))` }}>
          {section.lines.map((line) =>
            line.cells.map((cell) => {
              const isSel = cell.id === selectedId;
              const { c, glow } = tileColor(cell, isSel);
              const cls = [
                'ql-tile',
                isSel && 'sel',
                cell.frozen && 'frozen',
                cell.isSuperposition && 'super',
                flashTileId === cell.id && 'ql-tile-flash',
              ].filter(Boolean).join(' ');
              const stateLabel = cell.frozen ? 'pinned' : cell.isSuperposition ? 'still open to change' : 'settled';
              return (
                <div
                  key={cell.id}
                  data-cell={cell.id}
                  className={cls}
                  style={{ '--tc': c, '--glow': `${glow}px` }}
                  onClick={() => onTile(cell)}
                  onDoubleClick={() => onTileDouble(cell)}
                  data-help={`“${cell.text}” — energy ${pct(cell.energy)} (${stateLabel})${cell.userOwned ? ' · YOUR word' : ''}. Click = purple (lattice tile). Double-click or edit below. Spotlight ON = pour heat.`}
                >
                  <span className="ql-tile-word">{cell.text}</span>
                  {phoneticsOn && (
                    <span className="ql-tile-phono" aria-hidden>
                      <span className="ql-tile-stress">{cell.stress > 0 ? '●' : '○'}</span>
                      <span className="ql-tile-rime">{String(cell.rhymeClass || '—').replace(/^U_/, '~').slice(0, 6)}</span>
                    </span>
                  )}
                  {cell.isSuperposition && <span className="ql-tile-super-badge">Σ</span>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Features 1–9: DNA, contracts, measure, multi-section, truth, stress, loop, style, journal */}
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

      {/* Toolbar — mode colors only (orange/green/yellow). Purple is lattice tiles only. */}
      <div className="ql-btnrow">
        <button
          type="button"
          className={`ql-btn ${selected?.frozen ? 'on-grn' : ''}`}
          onClick={doFreeze}
          data-help="Optional. Select a lattice tile first, then Freeze to pin it (turns green). Click again to unpin."
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
              rest: entView ? ' Entanglement lines off.' : ' Glowing links between related tiles are visible.',
            });
          }}
          data-help="Shows or hides entanglement lines between related lattice tiles. Green when links are visible."
        >
          ⋈ Entanglement View
        </button>
        <span
          className="ql-genbadge ql-mono"
          data-help="How many energy steps you have run so far. Each Run 12 gens adds 12."
        >
          gen {gen}
        </span>
      </div>

      <p
        className="ql-status"
        data-help="Live feedback after each action — what just happened and what to try next."
      >
        <b>{status.lead}</b>{status.rest}
        <span className="ql-caret" />
      </p>

      {/* Multi-state neural output A / B + one-click handoffs */}
      {(neuralA || neuralB) && (
        <div
          className="ql-panel"
          style={{ marginTop: 12, borderColor: 'rgba(234,255,43,0.4)' }}
          data-help="Two multi-state verses from the same lattice. Pick A or B (collapse), then Send to Songwriter or Song Forge in one click."
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
            <button type="button" className="ql-mini" onClick={sendToForge} data-help="One-click: open Song Forge with this lattice as the seed for a full song + cover.">
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
              data-help="Replace the selected tile with whatever you type. Press Enter or Apply. This is your keyword — the lattice will not swap it out."
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
          data-help="The skeleton of your section: stress = beat pattern (1 = strong, 0 = weak), rhyme scheme = AABB means lines 1–2 rhyme and 3–4 rhyme, dominant = the active rhyme groups, avg energy = how hot the whole lattice is. You do not have to edit these by hand — Mutate and Crystallize update them."
        >
          <h4>Section DNA</h4>
          <div className="ql-mini-btns">
            <button
              className="ql-mini"
              onClick={doLock}
              data-help="Pins every word so nothing can change. Click again to unlock. Use when the lattice looks good and you only want to Generate Neural Lyrics."
            >
              🔒 Lock
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
          <div className="ql-kv" data-help="The active rhyme groups right now (for example A and B). A quick snapshot of how the lattice is grouping end sounds.">
            <span className="k">dominant</span><span className="v ql-v-org">{dominant}</span>
          </div>
          <div className="ql-kv" data-help="Average heat of every tile. Higher means the lattice is 'active.' After Spotlight and Run 12 gens this often rises, then Crystallize settles choices.">
            <span className="k">avg energy</span><span className="v ql-v-org">{pct(dna?.averageEnergy)}</span>
          </div>
        </div>

        <div
          className="ql-panel"
          data-help="Live grades from 0 to 1 (higher is stronger). Rhyme = end rhymes holding. Stress = meter feel. Semantic = meaning flow. Energy = heat balance across the lattice. These update as you play — use them as a guide, not a test score."
        >
          <h4>Score</h4>
          {[
            ['rhyme', score.rhymeStrength, false, 'How well the end-of-line rhymes are holding (AABB style). Higher = stronger rhymes. Crystallize usually improves this.'],
            ['stress', score.stressFidelity, true, 'How steady the strong/weak beat pattern feels (the meter). Mutate changes this a little on purpose.'],
            ['semantic', score.semanticCoherence, false, 'How smoothly the meaning seems to flow line to line. A rough guide — real song sense comes when you Generate Neural Lyrics.'],
            ['energy', score.energyBalance, true, 'How balanced heat is across the lattice. Very uneven energy means a few tiles are much hotter than others. Run 12 gens spreads heat around.'],
          ].map(([label, val, grn, help]) => (
            <div className="ql-score-row" key={label} data-help={help}>
              <div className="ql-score-top"><span className="lbl">{label}</span><span className="num">{f2(val)}</span></div>
              <div className={`ql-bar ${grn ? 'grn' : ''}`}><span style={{ width: pct(val) }} /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Command bar — optional power-user shortcuts */}
      <div
        className="ql-cmd"
        data-help="Type /run /spotlight /crystallize /generate /send /forge /help then Enter. Optional — the big buttons still work."
      >
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="/run  /crystallize  /generate  /send  /forge  /help"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (cmd.trim().startsWith('/') || cmd.trim()) runCommand(cmd);
              else doRun();
            }
          }}
        />
        <span className="ent">↵</span>
      </div>
    </div>
  );
}
