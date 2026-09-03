import React, { useCallback, useEffect, useRef, useState } from 'react';
import './origami/origami.css';

import Crease from './origami/Crease';
import FoldPanel from './origami/FoldPanel';
import PadWall from './origami/PadWall';

import TransportBar from './TransportBar';
import Sidebar from './Sidebar';
import BottomDock from './BottomDock';
import StructureDrawer from './origami/StructureDrawer';
import CenterCanvas from './canvas/CenterCanvas';

import SettingsModal from './settings/SettingsModal';
import ExportModal from './export/ExportModal';
import MasterScopeModal from './components/MasterScopeModal';
import HistoryTimelineModal from './components/HistoryTimelineModal';
import EulaModal from './components/EulaModal';
import PerformanceDiagnosticsModal from './components/PerformanceDiagnosticsModal';
import WaveformEditorModal from './components/WaveformEditorModal';
import DAWContextMenu from './components/DAWContextMenu';
import GhostPilotHUD from './components/GhostPilotHUD';

import { DAWProvider, useDAW } from './context/DAWContext';
import keyCommandService from './services/KeyCommandService';
import webMidiService from './services/WebMidiService';

/** Which flap each number key toggles. 5 is the bottom flap's pad wall. */
const KEY_EDGES = { 1: 't', 2: 'l', 3: 'r', 4: 'b' };

function DAWLayoutContent() {
  // Open at rest showing the transport, so the first frame reads as a
  // working app rather than an empty black rectangle.
  const [folds, setFolds] = useState({ t: true, l: false, r: false, b: false });
  const [dockTab, setDockTab] = useState('rack');

  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEula, setShowEula] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [editingClip, setEditingClip] = useState(null);

  const shellRef = useRef(null);
  const { togglePlay, toggleRecord, setPlayhead, loadProject } = useDAW();

  const setFold = useCallback((edge, open) => {
    setFolds((prev) => (prev[edge] === open ? prev : { ...prev, [edge]: open }));
  }, []);
  const toggleFold = useCallback((edge) => {
    setFolds((prev) => ({ ...prev, [edge]: !prev[edge] }));
  }, []);
  const foldAll = useCallback(() => {
    setFolds({ t: false, l: false, r: false, b: false });
  }, []);

  // .still suppresses the hinge for the first paint, so nothing animates in
  // on load and the page is at rest the moment it is visible.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.classList.add('still');
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => shell.classList.remove('still'))
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    webMidiService.init();
    keyCommandService.init({
      Space: () => togglePlay(),
      r: () => toggleRecord(),
      Home: () => setPlayhead(0),
      Tab: () => window.dispatchEvent(new CustomEvent('cycleViewMode'))
    });
    return () => {
      if (keyCommandService && typeof keyCommandService.cleanup === 'function') {
        keyCommandService.cleanup();
      }
    };
  }, [togglePlay, toggleRecord, setPlayhead]);

  // The creases are operable from the keyboard: 1-4 toggle a flap, 5 swaps the
  // bottom flap to the pad wall, 0 folds the whole shell flat.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (KEY_EDGES[e.key]) {
        e.preventDefault();
        toggleFold(KEY_EDGES[e.key]);
      } else if (e.key === '5') {
        e.preventDefault();
        setDockTab((t) => (t === 'pads' ? 'rack' : 'pads'));
        setFold('b', true);
      } else if (e.key === '0') {
        e.preventDefault();
        foldAll();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleFold, setFold, foldAll]);

  const sided = folds.l || folds.r;

  return (
    <div className={`shell${sided ? ' sided' : ''}`} ref={shellRef}>
      <div className="surface">
        <div className="sheet">
          <CenterCanvas onEditClip={(clip, trackId) => setEditingClip({ clip, trackId })} />
        </div>
      </div>

      {/* Closing a drawer by clicking off it, so an open flap is never a trap. */}
      <button
        type="button"
        className="scrim"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => { setFold('l', false); setFold('r', false); }}
      />

      <Crease edge="t" label="Transport" open={folds.t} controls="foldT" onToggle={() => toggleFold('t')} />
      <Crease edge="l" label="Library" open={folds.l} controls="foldL" onToggle={() => toggleFold('l')} />
      <Crease edge="r" label="Structure" open={folds.r} controls="foldR" onToggle={() => toggleFold('r')} />
      <Crease edge="b" label={dockTab === 'pads' ? 'Pads' : 'Rack'} open={folds.b} controls="foldB" onToggle={() => toggleFold('b')} />

      <FoldPanel edge="t" id="foldT" title="Transport" meta="fold up to hide" open={folds.t}>
        <TransportBar
          onOpenSettings={() => setShowSettings(true)}
          onOpenExport={() => setShowExport(true)}
          onOpenScope={() => setShowScope(true)}
          onOpenHistory={() => setShowHistory(true)}
          onOpenEula={() => setShowEula(true)}
          onOpenDiagnostics={() => setShowDiagnostics(true)}
        />
      </FoldPanel>

      <FoldPanel edge="l" id="foldL" title="Library" meta="VST3" open={folds.l}>
        <Sidebar />
      </FoldPanel>

      <FoldPanel edge="r" id="foldR" title="Structure" meta="song" open={folds.r}>
        <StructureDrawer />
      </FoldPanel>

      <FoldPanel
        edge="b"
        id="foldB"
        title={dockTab === 'pads' ? 'Pads' : 'Rack'}
        meta={
          <span className="dock-swap" onClick={(e) => { e.stopPropagation(); setDockTab(dockTab === 'pads' ? 'rack' : 'pads'); }}>
            {dockTab === 'pads' ? 'show rack' : 'show pads'}
          </span>
        }
        open={folds.b}
      >
        {dockTab === 'pads' ? <PadWall /> : <BottomDock />}
      </FoldPanel>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showScope && <MasterScopeModal onClose={() => setShowScope(false)} />}
      {showHistory && (
        <HistoryTimelineModal onClose={() => setShowHistory(false)} onRestore={(snap) => loadProject(snap)} />
      )}
      {showEula && <EulaModal onClose={() => setShowEula(false)} />}
      {showDiagnostics && <PerformanceDiagnosticsModal onClose={() => setShowDiagnostics(false)} />}
      {editingClip && (
        <WaveformEditorModal
          clip={editingClip.clip}
          trackId={editingClip.trackId}
          onClose={() => setEditingClip(null)}
        />
      )}
      <DAWContextMenu />
      <GhostPilotHUD />
    </div>
  );
}

/**
 * Lyricist 4.2.0 Pro — the origami shell.
 *
 * One full-bleed writing surface with four flaps hinged on the edges. A flap
 * lies OVER the surface when open and never resizes it, so looking something
 * up cannot reflow the line you are writing. Folded, each is a one-pixel
 * crease with its name on it.
 *
 * @returns {JSX.Element}
 */
export default function DAWLayout() {
  return (
    <DAWProvider>
      <DAWLayoutContent />
    </DAWProvider>
  );
}
