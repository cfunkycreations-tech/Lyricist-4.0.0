import React, { useEffect, useMemo, useState } from 'react';
import {
  loadDNALibrary,
  saveDNALibrary,
  saveDNAFromSection,
  mutateStoredDNA,
  injectDNAOntoSection,
  makeContract,
  checkContracts,
  openCellSuperposition,
  computeTruthMeter,
  stressDots,
  rimeLabel,
  readLoopHandshake,
  applyLoopTargetsToSection,
  readStylePressure,
  applyStylePressureToSection,
  writeStylePressure,
  loadJournal,
  appendJournalEntry,
  formatJournalCard,
  snapshotLatticeLines,
  pushVaultLines,
  QUANTUM_SECTIONS,
} from './quantumFeatures.js';
import { measureCell, collapseCell } from './quantumEngine.js';
import { Save, X } from 'lucide-react';
import { Icon } from '../common/Glyph.jsx';

/**
 * Advanced Quantum features UI — DNA, contracts, measure, multi-section,
 * truth meter, stress mode, loop handshake, style pressure, journal.
 */
export default function QuantumFeaturesPanel({
  section = { lines: [] },
  setSection = () => {},
  links = [],
  setLinks = () => {},
  selectedId = null,
  setSelectedId = () => {},
  keywordDraft = '',
  neuralA = '',
  neuralB = '',
  neuralPick = 'A',
  setStatus = () => {},
  activeSectionId = 'verse1',
  setActiveSectionId = () => {},
  songMap = {},
  setSongMap = () => {},
  contracts = [],
  setContracts = () => {},
  dnaUsed = null,
  setDnaUsed = () => {},
  stylePressure = null,
  setStylePressure = () => {},
  phoneticsOn = false,
  setPhoneticsOn = () => {},
  onTruthReport = () => {},
  truthReport = null,
}) {
  const [dnaLib, setDnaLib] = useState(() => {
    try { return loadDNALibrary() || []; } catch { return []; }
  });
  const [dnaName, setDnaName] = useState('');
  const [contractMode, setContractMode] = useState(false);
  const [contractPick, setContractPick] = useState(null);
  const [contractType, setContractType] = useState('rhyme');
  const [journal, setJournal] = useState(() => {
    try { return loadJournal() || []; } catch { return []; }
  });
  const [loopInfo, setLoopInfo] = useState(() => {
    try { return readLoopHandshake(); } catch { return null; }
  });
  const [panel, setPanel] = useState('dna'); // dna | contracts | measure | song | truth | stress | loop | style | journal

  const safeLines = section?.lines ?? [];

  const selected = useMemo(() => {
    if (!selectedId || !Array.isArray(safeLines)) return null;
    for (const ln of safeLines) {
      if (!ln?.cells) continue;
      const c = ln.cells.find((x) => x?.id === selectedId);
      if (c) return c;
    }
    return null;
  }, [safeLines, selectedId]);

  useEffect(() => {
    try {
      setLoopInfo(readLoopHandshake());
    } catch {
      setLoopInfo(null);
    }
  }, [panel]);

  const refreshStyle = () => {
    try {
      const s = readStylePressure();
      setStylePressure(s);
    } catch {
      setStylePressure(null);
    }
  };

  // ── DNA ──
  const doSaveDNA = () => {
    if (!section || !safeLines.length) {
      setStatus({ lead: 'DNA failed.', rest: ' No active section lines available to fingerprint.' });
      return;
    }
    const entry = saveDNAFromSection(section, dnaName);
    if (!entry) {
      setStatus({ lead: 'DNA failed.', rest: ' Could not fingerprint this section.' });
      return;
    }
    setDnaLib(loadDNALibrary() || []);
    setDnaName('');
    setStatus({ lead: 'DNA saved.', rest: ` “${entry.name}” stored — inject it into any section later.` });
  };

  const doInjectDNA = (entry) => {
    if (!entry?.dna) return;
    const res = injectDNAOntoSection(section || { lines: [] }, entry.dna);
    if (res?.section) {
      setSection(res.section);
      setDnaUsed(entry);
      setStatus({
        lead: 'DNA injected.',
        rest: ` Shape of “${entry.name}” applied (stress + rhyme slots). Your words stay; meter/rhyme plan shifts. Mutate for a sibling shape.`,
      });
    }
  };

  const doMutateDNA = (entry) => {
    if (!entry?.dna) return;
    const m = mutateStoredDNA(entry, Date.now() % 99);
    const lib = loadDNALibrary() || [];
    lib.unshift(m);
    saveDNALibrary(lib);
    setDnaLib(loadDNALibrary() || []);
    const res = injectDNAOntoSection(section || { lines: [] }, m.dna);
    if (res?.section) {
      setSection(res.section);
      setDnaUsed(m);
      setStatus({ lead: 'DNA mutated + applied.', rest: ' Same family, flipped stress bits — a controlled variation.' });
    }
  };

  // ── Contracts ──
  const toggleContractMode = () => {
    setContractMode((v) => !v);
    setContractPick(null);
    setStatus(
      !contractMode
        ? { lead: 'Contract mode ON.', rest: ' Click tile A, then tile B to forge a rhyme / contrast / callback contract.' }
        : { lead: 'Contract mode OFF.', rest: ' Back to normal selection.' }
    );
  };

  const onContractTile = (cellId) => {
    if (!contractMode) return false;
    if (!contractPick) {
      setContractPick(cellId);
      setStatus({ lead: 'First tile locked.', rest: ' Click the partner tile to finish the contract.' });
      return true;
    }
    if (contractPick === cellId) {
      setContractPick(null);
      return true;
    }
    const ctr = makeContract(contractPick, cellId, contractType, 0.9);
    if (ctr) {
      setContracts((prev) => [...(prev || []), ctr]);
      setLinks((prev) => [...(prev || []), { aId: ctr.aId, bId: ctr.bId, type: ctr.type, strength: ctr.strength }]);
      setContractPick(null);
      setStatus({
        lead: 'Contract forged.',
        rest: ` ${contractType.toUpperCase()} link set. Crystallize / Generate will warn if it breaks.`,
      });
    }
    return true;
  };

  const removeContract = (id) => {
    setContracts((prev) => (prev || []).filter((c) => c.id !== id));
  };

  const auditContracts = () => {
    const r = checkContracts(section || { lines: [] }, contracts || []);
    if (r?.ok) {
      setStatus({ lead: 'Contracts hold.', rest: ' All rhyme / contrast / callback links are satisfied.' });
    } else if (r?.violations) {
      setStatus({
        lead: 'Contracts broken.',
        rest: ` ${r.violations.length} issue(s): ${r.violations.map((v) => `${v.aText}↔${v.bText}`).join('; ')}`,
      });
    }
    return r;
  };

  // ── Measure / super ──
  const openSuper = () => {
    if (!selectedId) return;
    const next = openCellSuperposition(section || { lines: [] }, selectedId);
    if (next) {
      setSection(next);
      setStatus({
        lead: 'Superposition open.',
        rest: ' This tile holds several candidate words. Press Measure to collapse one (partners reweight if entangled).',
      });
    }
  };

  const doMeasure = () => {
    if (!selectedId) return;
    const res = measureCell(section || { lines: [] }, selectedId, links || []);
    if (res?.section) {
      setSection(res.section);
      setStatus({
        lead: 'Collapsed.',
        rest: res.collapsed?.text
          ? ` Measured “${res.collapsed.text}”. ${res.reweighted?.length ? `Reweighted ${res.reweighted.length} partner(s).` : ''}`
          : ' Tile was not in superposition — open candidates first.',
      });
    }
  };

  const doCollapseMax = () => {
    if (!selectedId) return;
    const res = collapseCell(section || { lines: [] }, selectedId);
    if (res?.section) {
      setSection(res.section);
      setStatus({ lead: 'Max collapse.', rest: ' Highest-amplitude candidate won (deterministic).' });
    }
  };

  // ── Multi-section ──
  const switchSongSection = (id) => {
    setSongMap((prev) => ({
      ...(prev || {}),
      [activeSectionId]: {
        section,
        keywords: keywordDraft,
        neuralA,
        neuralB,
        neuralPick,
        contracts,
        dnaUsed,
      },
    }));
    const incoming = songMap?.[id];
    setActiveSectionId(id);
    if (incoming?.section) {
      setSection(incoming.section);
      setContracts(incoming.contracts || []);
      setDnaUsed(incoming.dnaUsed || null);
    }
    const label = QUANTUM_SECTIONS?.find((s) => s.id === id)?.label || id;
    setStatus({
      lead: `Section: ${label}`,
      rest: ' Each section has its own lattice. Save DNA from Chorus, inject into Verse 2 for shared shape.',
    });
  };

  // ── Truth ──
  const runTruth = () => {
    const verse = neuralPick === 'B' ? neuralB : neuralA;
    const report = computeTruthMeter({
      section: section || { lines: [] },
      neuralText: verse || '',
      keywordsRaw: keywordDraft || '',
      dnaUsed,
      contracts: contracts || [],
    });
    if (report) {
      onTruthReport?.(report);
      setStatus({
        lead: `Truth ${Math.round((report.overall || 0) * 100)}%.`,
        rest: ` ${report.notes?.[0] || ''}`,
      });
    }
  };

  // ── Loop ──
  const pullLoop = () => {
    const hs = readLoopHandshake();
    setLoopInfo(hs);
    if (!hs) {
      setStatus({
        lead: 'No loop handshake yet.',
        rest: ' Open RC-Funk 5000, set BPM, hit “Send groove to Quantum”. Then pull here.',
      });
      return;
    }
    const res = applyLoopTargetsToSection(section || { lines: [] }, hs);
    if (res?.section) {
      setSection(res.section);
      setStatus({
        lead: 'Groove applied.',
        rest: ` BPM ${hs.bpm} → ~${hs.targetSyllables} syllables/line stress bias. Write to the pocket you looped.`,
      });
    }
  };

  // ── Style ──
  const pullStyle = () => {
    const s = readStylePressure();
    setStylePressure(s);
    if (!s) {
      setStatus({
        lead: 'No Style DNA in chamber.',
        rest: ' Run Ghost Rider → analyze an artist → “Send Style DNA to Quantum”.',
      });
      return;
    }
    const res = applyStylePressureToSection(section || { lines: [] }, s);
    if (res?.section) {
      setSection(res.section);
      setStatus({
        lead: 'Pressure chamber ON.',
        rest: ` Field biased by ${s.artist || 'style'} — dens=${s.rhymeDensity}, temp=${s.emotionalTemp}. Neural generate will honor this.`,
      });
    }
  };

  const clearStyle = () => {
    writeStylePressure(null);
    setStylePressure(null);
    setStatus({ lead: 'Pressure cleared.', rest: ' Lattice bias from Style DNA removed.' });
  };

  // ── Journal ──
  const snapshotNow = () => {
    const verse = neuralPick === 'B' ? neuralB : neuralA;
    const truth = truthReport || computeTruthMeter({
      section: section || { lines: [] },
      neuralText: verse || '',
      keywordsRaw: keywordDraft || '',
      dnaUsed,
      contracts: contracts || [],
    });
    const frozen = [];
    safeLines.forEach((ln) =>
      (ln?.cells || []).forEach((c) => {
        if (c?.frozen) frozen.push(c.text);
      })
    );
    const entry = appendJournalEntry({
      sectionName: QUANTUM_SECTIONS?.find((s) => s.id === activeSectionId)?.label || activeSectionId,
      keywords: (keywordDraft || '').split(/[,\n|;]+/).map((t) => t.trim()).filter(Boolean),
      neuralPick,
      dnaName: dnaUsed?.name || null,
      styleArtist: stylePressure?.artist || null,
      frozen,
      contractCount: (contracts || []).length,
      truthOverall: truth?.overall ?? 0,
      latticeLines: snapshotLatticeLines(section || { lines: [] }),
      verse: verse || '',
      notes: truth?.notes || [],
    });
    if (verse) pushVaultLines(verse.split('\n'));
    setJournal(loadJournal() || []);
    setStatus({ lead: 'Journal saved.', rest: ' Provenance card stored — export anytime. Not slop: you can prove the craft path.' });
    return entry;
  };

  const exportJournal = (entry) => {
    if (!entry) return;
    const text = formatJournalCard(entry);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantum-collapse-${entry.id || Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'dna', label: '1 DNA' },
    { id: 'contracts', label: '2 Contracts' },
    { id: 'measure', label: '3 Measure' },
    { id: 'song', label: '4 Sections' },
    { id: 'truth', label: '5 Truth' },
    { id: 'stress', label: '6 Stress' },
    { id: 'loop', label: '7 Loop' },
    { id: 'style', label: '8 Style' },
    { id: 'journal', label: '9 Journal' },
  ];

  useEffect(() => {
    window.__qlContractHandler = onContractTile;
    window.__qlContractMode = contractMode;
    return () => {
      delete window.__qlContractHandler;
      delete window.__qlContractMode;
    };
  });

  return (
    <div className="ql-adv" data-help="Advanced Quantum features: DNA, entanglement contracts, measure/collapse, multi-section song, anti-slop truth meter, stress view, loop groove, Style DNA pressure, collapse journal.">
      <div className="ql-adv-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ql-adv-tab ${panel === t.id ? 'is-on' : ''}`}
            onClick={() => setPanel(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {panel === 'dna' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Sectional DNA — save shape, not lyrics</h4>
          <p className="ql-adv-p">
            Extract the meter + rhyme plan of this lattice. Inject it into another section so Verse 2 inherits Chorus
            physics with new words. Mutate for a sibling shape.
          </p>
          <div className="ql-adv-row">
            <input
              className="ql-adv-input"
              placeholder="Name this DNA (e.g. Hook AABB)"
              value={dnaName}
              onChange={(e) => setDnaName(e.target.value)}
            />
            <button type="button" className="ql-btn accent-ylw" onClick={doSaveDNA}>
              <Icon i={Save} />Save DNA
            </button>
          </div>
          <div className="ql-adv-list">
            {(!dnaLib || dnaLib.length === 0) && <div className="ql-adv-empty">No saved DNA yet — crystallize something you love, then save.</div>}
            {(dnaLib || []).map((e) => (
              <div key={e.id} className="ql-adv-card">
                <div>
                  <strong>{e.name}</strong>
                  <div className="ql-adv-meta">
                    scheme {e.dna?.rhymeScheme || '—'} · stress {String(e.dna?.stressSignature || '').slice(0, 24)}…
                  </div>
                </div>
                <div className="ql-adv-card-actions">
                  <button type="button" className="ql-btn" onClick={() => doInjectDNA(e)}>
                    Inject
                  </button>
                  <button type="button" className="ql-btn" onClick={() => doMutateDNA(e)}>
                    Mutate
                  </button>
                  <button
                    type="button"
                    className="ql-btn"
                    onClick={() => {
                      const lib = (dnaLib || []).filter((x) => x.id !== e.id);
                      saveDNALibrary(lib);
                      setDnaLib(lib);
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {dnaUsed && (
            <div className="ql-adv-pill">Active DNA: {dnaUsed.name}</div>
          )}
        </div>
      )}

      {panel === 'contracts' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Entanglement contracts</h4>
          <p className="ql-adv-p">
            Forge explicit links: rhyme (must match class), contrast (must differ), callback (echo). Crystallize and
            neural generate check them — no free-associating away your scheme.
          </p>
          <div className="ql-adv-row">
            <button type="button" className={`ql-btn ${contractMode ? 'on-org' : ''}`} onClick={toggleContractMode}>
              {contractMode ? 'Contract mode ON' : 'Start contract mode'}
            </button>
            <select
              className="ql-adv-select"
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
            >
              <option value="rhyme">Rhyme</option>
              <option value="contrast">Contrast</option>
              <option value="callback">Callback</option>
            </select>
            <button type="button" className="ql-btn" onClick={auditContracts}>
              Audit contracts
            </button>
          </div>
          {contractMode && (
            <div className="ql-adv-pill warn">
              Click two lattice tiles{contractPick ? ' — pick partner…' : ' — pick first tile…'}
            </div>
          )}
          <div className="ql-adv-list">
            {(!contracts || contracts.length === 0) && <div className="ql-adv-empty">No manual contracts yet.</div>}
            {(contracts || []).map((c) => {
              let aT = '?', bT = '?';
              safeLines.forEach((ln) =>
                (ln?.cells || []).forEach((cell) => {
                  if (cell?.id === c.aId) aT = cell.text;
                  if (cell?.id === c.bId) bT = cell.text;
                })
              );
              return (
                <div key={c.id} className="ql-adv-card">
                  <div>
                    <strong>{c.type}</strong>
                    <div className="ql-adv-meta">
                      “{aT}” ↔ “{bT}”
                    </div>
                  </div>
                  <button type="button" className="ql-btn" onClick={() => removeContract(c.id)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {panel === 'measure' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Measure / collapse</h4>
          <p className="ql-adv-p">
            Open a tile into superposition (several candidates). Measure collapses one; entangled partners reweight.
            This is craft choice — not “regenerate and pray.”
          </p>
          <div className="ql-adv-row">
            <button type="button" className="ql-btn accent-ylw" onClick={openSuper} disabled={!selectedId}>
              Open superposition
            </button>
            <button type="button" className="ql-btn" onClick={doMeasure} disabled={!selectedId}>
              Measure (collapse)
            </button>
            <button type="button" className="ql-btn" onClick={doCollapseMax} disabled={!selectedId}>
              Collapse to max
            </button>
          </div>
          {selected?.isSuperposition && (selected.candidates || []).length > 0 && (
            <div className="ql-adv-cands">
              <div className="ql-adv-meta">Candidates for “{selected.text}”:</div>
              {(selected.candidates || []).map((c) => (
                <div key={c.text} className="ql-adv-cand">
                  <span>{c.text}</span>
                  <span className="ql-adv-amp">{Math.round((c.amplitude || 0) * 100)}%</span>
                  <span className="ql-adv-meta">{rimeLabel(c.rhymeClass)}</span>
                </div>
              ))}
            </div>
          )}
          {selected && !selected.isSuperposition && (
            <div className="ql-adv-empty">Selected tile is collapsed. Open superposition to load candidates.</div>
          )}
        </div>
      )}

      {panel === 'song' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Multi-section quantum song</h4>
          <p className="ql-adv-p">
            Separate lattices per section. Save Chorus DNA → inject into Verse 2. Bridge can hold anti-structure.
          </p>
          <div className="ql-sec-strip">
            {(QUANTUM_SECTIONS || []).map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ql-sec-btn ${activeSectionId === s.id ? 'is-on' : ''}`}
                onClick={() => switchSongSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="ql-adv-pill">
            Editing: {QUANTUM_SECTIONS?.find((s) => s.id === activeSectionId)?.label || activeSectionId}
          </div>
        </div>
      )}

      {panel === 'truth' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Truth Meter — anti-slop</h4>
          <p className="ql-adv-p">
            Scores originality vs your vault, cliché hits, keyword honor, DNA fidelity, contracts, and structure.
            Not vibes — measurable craft.
          </p>
          <button type="button" className="ql-btn accent-ylw" onClick={runTruth}>
            Run Truth Meter
          </button>
          {truthReport && (
            <div className="ql-truth">
              <div className="ql-truth-overall">
                Overall <b>{Math.round((truthReport.overall || 0) * 100)}%</b>
              </div>
              <div className="ql-truth-grid">
                <div>Originality <b>{Math.round((truthReport.originality || 0) * 100)}%</b></div>
                <div>Anti-cliché <b>{Math.round((truthReport.clicheScore || 0) * 100)}%</b></div>
                <div>
                  Keywords <b>{truthReport.honored || 0}/{truthReport.keywordTotal || 0}</b>
                </div>
                <div>DNA fidelity <b>{Math.round((truthReport.dnaFidelity || 0) * 100)}%</b></div>
                <div>Contracts <b>{Math.round((truthReport.contractScore || 0) * 100)}%</b></div>
                <div>Constraints <b>{Math.round((truthReport.constraintSat || 0) * 100)}%</b></div>
              </div>
              <ul className="ql-truth-notes">
                {(truthReport.notes || []).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {panel === 'stress' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Phonetic / stress playground</h4>
          <p className="ql-adv-p">
            Toggle stress dots and rime classes on tiles. Write by sound — not synonym soup.
          </p>
          <button
            type="button"
            className={`ql-btn ${phoneticsOn ? 'on-grn' : ''}`}
            onClick={() => setPhoneticsOn((v) => !v)}
          >
            {phoneticsOn ? 'Stress view ON' : 'Turn stress view ON'}
          </button>
          {phoneticsOn && (
            <div className="ql-stress-table">
              {safeLines.length === 0 && (
                <div className="ql-adv-empty">No section lines available for stress inspection.</div>
              )}
              {safeLines.map((ln, i) => (
                <div key={ln?.id || i} className="ql-stress-row">
                  <span className="ql-adv-meta">L{i + 1} [{ln?.rhymeSchemeSlot || '-'}]</span>
                  {(ln?.cells || []).map((c) => (
                    <button
                      key={c?.id}
                      type="button"
                      className={`ql-stress-chip ${c?.id === selectedId ? 'is-on' : ''}`}
                      onClick={() => setSelectedId(c?.id)}
                      title={c?.rhymeClass || ''}
                    >
                      <span className="ql-stress-dot">{stressDots(c?.stress)}</span>
                      <span>{c?.text || ''}</span>
                      <span className="ql-adv-meta">{rimeLabel(c?.rhymeClass)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {panel === 'loop' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Loop station handshake</h4>
          <p className="ql-adv-p">
            Pull BPM / syllable pocket from RC-Funk 5000 so the lattice writes to the groove you just looped.
          </p>
          <button type="button" className="ql-btn accent-ylw" onClick={pullLoop}>
            Pull groove from RC-Funk
          </button>
          {loopInfo ? (
            <div className="ql-adv-pill ok">
              Last handshake: BPM {loopInfo.bpm} · ~{loopInfo.targetSyllables} syl/line
              {loopInfo.updatedAt ? ` · ${new Date(loopInfo.updatedAt).toLocaleTimeString()}` : ''}
            </div>
          ) : (
            <div className="ql-adv-empty">No handshake yet. On RC-Funk: set BPM → “Send groove to Quantum”.</div>
          )}
        </div>
      )}

      {panel === 'style' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Style DNA pressure chamber</h4>
          <p className="ql-adv-p">
            Ghost Rider Style DNA biases the field and neural constraints — new lines under another writer’s physics,
            never their stolen bars.
          </p>
          <div className="ql-adv-row">
            <button type="button" className="ql-btn accent-ylw" onClick={pullStyle}>
              Load Style DNA pressure
            </button>
            <button type="button" className="ql-btn" onClick={clearStyle}>
              Clear
            </button>
            <button type="button" className="ql-btn" onClick={refreshStyle}>
              Refresh
            </button>
          </div>
          {stylePressure ? (
            <div className="ql-style-box">
              <div>
                <b>{stylePressure.artist || 'Style'}</b> · dens {stylePressure.rhymeDensity || '—'} · temp{' '}
                {stylePressure.emotionalTemp ?? '—'}
              </div>
              <div className="ql-adv-meta">{stylePressure.rhythm || ''}</div>
              <div className="ql-adv-meta">{stylePressure.cadenceNotes || ''}</div>
              <div className="ql-adv-tags">
                {(stylePressure.imageClusters || []).map((img, i) => (
                  <span key={i} className="ql-tag">
                    {img}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="ql-adv-empty">No Style DNA loaded. Ghost Rider → analyze → Send to Quantum.</div>
          )}
        </div>
      )}

      {panel === 'journal' && (
        <div className="ql-adv-body">
          <h4 className="ql-adv-h">Collapse journal</h4>
          <p className="ql-adv-p">
            Provenance: keywords, lattice, contracts, DNA, style pressure, A/B pick, truth score. Proof this was craft —
            not one-click slop.
          </p>
          <button type="button" className="ql-btn accent-ylw" onClick={snapshotNow}>
            Snapshot collapse now
          </button>
          <div className="ql-adv-list">
            {(!journal || journal.length === 0) && <div className="ql-adv-empty">No journal entries yet.</div>}
            {(journal || []).slice(0, 12).map((e) => (
              <div key={e.id} className="ql-adv-card">
                <div>
                  <strong>{e.sectionName}</strong>
                  <div className="ql-adv-meta">
                    {new Date(e.at).toLocaleString()} · state {e.neuralPick || '—'} · truth{' '}
                    {e.truthOverall != null ? Math.round(e.truthOverall * 100) + '%' : '—'}
                  </div>
                </div>
                <button type="button" className="ql-btn" onClick={() => exportJournal(e)}>
                  Export .txt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}