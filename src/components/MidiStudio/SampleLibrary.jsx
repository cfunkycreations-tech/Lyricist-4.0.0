import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderPlus, Upload, Trash2, Play, Package, Music2, X } from 'lucide-react';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { midiToName } from '../../services/MidiService.js';
import {
  listPacks, createPack, deletePack, renamePack,
  listSamples, deleteSample, updateSample,
  getSampleBuffer, importFiles, librarySize, formatBytes,
  AUDIO_EXTS,
} from '../../services/sampleLibrary.js';

// User sample library — Lyricist 4.2.0
// Drop in your own one-shots, loops and sample packs (including .zip packs you
// bought) and play them from the piano roll. Everything is stored locally in
// IndexedDB on this machine; nothing is uploaded anywhere.

export default function SampleLibrary({ onUseSample }) {
  const [packs, setPacks] = useState([]);
  const [activePackId, setActivePackId] = useState(null);
  const [samples, setSamples] = useState([]);
  const [size, setSize] = useState(0);
  const [busy, setBusy] = useState(null);      // { done, total }
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef(null);
  const folderRef = useRef(null);

  const refreshPacks = useCallback(async () => {
    const rows = await listPacks();
    setPacks(rows);
    setSize(await librarySize());
    setActivePackId((cur) => cur && rows.some((p) => p.id === cur) ? cur : (rows[0]?.id ?? null));
  }, []);

  const refreshSamples = useCallback(async (packId) => {
    setSamples(packId ? await listSamples(packId) : []);
    setSize(await librarySize());
  }, []);

  useEffect(() => { refreshPacks(); }, [refreshPacks]);
  useEffect(() => { refreshSamples(activePackId); }, [activePackId, refreshSamples]);

  const activePack = packs.find((p) => p.id === activePackId) || null;

  const ensurePack = async () => {
    if (activePackId) return activePackId;
    const p = await createPack('My Samples');
    await refreshPacks();
    setActivePackId(p.id);
    return p.id;
  };

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const packId = await ensurePack();
    setBusy({ done: 0, total: files.length });
    const res = await importFiles(packId, files, (done, total) => setBusy({ done, total }));
    setBusy(null);
    setNote(
      `Added ${res.added} sample${res.added === 1 ? '' : 's'}` +
      (res.skipped ? ` · skipped ${res.skipped} non-audio` : '') +
      (res.errors.length ? ` · ${res.errors.length} failed` : '')
    );
    await refreshPacks();
    await refreshSamples(packId);
  };

  const preview = async (sample) => {
    await resumeAudio();
    const ctx = getAudioContext();
    try {
      const buf = await getSampleBuffer(ctx, sample.id);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(g).connect(getMasterBus());
      src.start();
    } catch (err) {
      setNote(`Could not play ${sample.name}: ${err.message}`);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="card-cosmic" style={{ borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={15} style={{ color: '#ff2d95' }} />
          <strong style={{ fontSize: '0.82rem' }}>Sample Library</strong>
          <span style={{ fontSize: '0.62rem', color: 'rgba(196,181,253,0.6)' }}>
            {packs.length} pack{packs.length === 1 ? '' : 's'} · {formatBytes(size)} · stored on this machine
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className="suno-chip"
            onClick={async () => {
              const name = window.prompt('Name this pack', `Pack ${packs.length + 1}`);
              if (name === null) return;
              const p = await createPack(name.trim() || 'Untitled Pack');
              await refreshPacks();
              setActivePackId(p.id);
            }}
            data-help="Make a new folder to organize samples — one per kit, per artist, or per bought pack."
          >
            <FolderPlus size={12} /> New Pack
          </button>

          <button
            className="suno-chip"
            onClick={() => fileRef.current?.click()}
            data-help="Pick audio files, or a .zip sample pack — the zip is unpacked automatically and every sound inside is imported."
          >
            <Upload size={12} /> Add Files
          </button>

          <button
            className="suno-chip"
            onClick={() => folderRef.current?.click()}
            data-help="Import a whole folder of samples at once, including everything in its subfolders."
          >
            <Upload size={12} /> Add Folder
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={[...AUDIO_EXTS, '.zip'].join(',')}
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-help="Drag samples or a whole sample pack straight onto this panel. Your files never leave this computer."
        style={{
          border: `1px dashed ${dragOver ? '#ff2d95' : 'rgba(0,229,255,0.32)'}`,
          background: dragOver ? 'rgba(255,45,149,0.08)' : 'rgba(0,229,255,0.03)',
          borderRadius: 10,
          padding: '10px 12px',
          textAlign: 'center',
          fontSize: '0.68rem',
          color: dragOver ? '#ff2d95' : 'rgba(196,181,253,0.72)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {busy
          ? `Importing ${busy.done} / ${busy.total}…`
          : 'Drop samples, folders, or a .zip sample pack here — WAV, MP3, OGG, FLAC, AIFF, M4A'}
      </div>

      {note && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.66rem', color: 'rgba(52,211,153,0.9)' }}>
          {note}
          <button onClick={() => setNote('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}>
            <X size={11} />
          </button>
        </div>
      )}

      {/* Packs */}
      {packs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {packs.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePackId(p.id)}
              className="suno-chip"
              style={{
                borderColor: p.id === activePackId ? '#ff2d95' : undefined,
                color: p.id === activePackId ? '#ff2d95' : undefined,
                background: p.id === activePackId ? 'rgba(255,45,149,0.1)' : undefined,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Samples in the active pack */}
      {activePack && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', color: 'rgba(196,181,253,0.55)', padding: '0 2px 2px' }}>
            <span>{samples.length} sample{samples.length === 1 ? '' : 's'} in “{activePack.name}”</span>
            <button
              onClick={async () => {
                if (!window.confirm(`Delete the pack “${activePack.name}” and all ${samples.length} samples in it?`)) return;
                await deletePack(activePack.id);
                await refreshPacks();
              }}
              style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.75)', cursor: 'pointer', fontSize: '0.62rem', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              <Trash2 size={10} /> Delete pack
            </button>
          </div>

          {samples.length === 0 && (
            <div style={{ fontSize: '0.68rem', color: 'rgba(196,181,253,0.5)', padding: '8px 2px' }}>
              Nothing in this pack yet — drop some samples above.
            </div>
          )}

          {samples.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 7,
                background: 'rgba(13,8,28,0.55)',
                border: '1px solid rgba(139,92,246,0.18)',
                fontSize: '0.68rem',
              }}
            >
              <Music2 size={11} style={{ color: '#00e5ff', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <span style={{ fontSize: '0.58rem', color: 'rgba(196,181,253,0.45)', flexShrink: 0 }}>
                {formatBytes(s.size)}
              </span>

              <label
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.58rem', color: 'rgba(196,181,253,0.6)', flexShrink: 0 }}
                data-help="The pitch this sample was recorded at. Playing other keys shifts up or down from here. Leave it at C4 for drums and one-shots."
              >
                root
                <input
                  type="number"
                  min={0}
                  max={127}
                  value={s.rootMidi}
                  onChange={async (e) => {
                    const v = Math.max(0, Math.min(127, Number(e.target.value) || 0));
                    await updateSample(s.id, { rootMidi: v });
                    refreshSamples(activePackId);
                  }}
                  style={{ width: 42, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 5, color: '#e8e0ff', fontSize: '0.58rem', padding: '2px 4px' }}
                />
                <span style={{ minWidth: 24 }}>{midiToName(s.rootMidi)}</span>
              </label>

              <button onClick={() => preview(s)} className="suno-chip" style={{ padding: '3px 7px', flexShrink: 0 }} data-help="Hear this sample.">
                <Play size={10} />
              </button>

              {onUseSample && (
                <button
                  onClick={() => onUseSample(s)}
                  className="suno-chip"
                  style={{ padding: '3px 8px', flexShrink: 0, fontSize: '0.6rem' }}
                  data-help="Load this sample as the piano roll's instrument — every key plays it, pitched from its root note."
                >
                  Play on roll
                </button>
              )}

              <button
                onClick={async () => { await deleteSample(s.id); refreshSamples(activePackId); }}
                style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                data-help="Remove this sample from your library."
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
