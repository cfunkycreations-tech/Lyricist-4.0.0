import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderPlus, Upload, Trash2, Play, Square, Repeat, Package, Music2, X, Search, Save, FolderDown } from 'lucide-react';
import { getAudioContext, getMasterBus, resumeAudio } from '../../services/audioEngine.js';
import { midiToName } from '../../services/MidiService.js';
import {
  listPacks, createPack, deletePack, renamePack,
  listSamples, deleteSample, updateSample,
  getSampleBuffer, importFiles, librarySize, formatBytes,
  exportLibrary, importLibrary, clearLibrary, migrateLegacyBlobs,
  AUDIO_EXTS, MAX_LIBRARY_BYTES,
} from '../../services/sampleLibrary.js';

// User sample library — Lyricist 4.2.0
// Drop in your own one-shots, loops and sample packs (including .zip packs you
// bought) and play them from the piano roll. Everything is stored locally in
// IndexedDB on this machine; nothing is uploaded anywhere.

// `fxInput` returns the shared roll/sampler effects rack, so a preview here
// sounds like what the piano roll will actually play.
export default function SampleLibrary({ onUseSample, fxInput }) {
  const [packs, setPacks] = useState([]);
  const [activePackId, setActivePackId] = useState(null);
  const [samples, setSamples] = useState([]);
  const [size, setSize] = useState(0);
  const [busy, setBusy] = useState(null);      // { done, total }
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState('');
  const [playing, setPlaying] = useState(new Set());   // sample ids currently sounding
  const [query, setQuery] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const [allSamples, setAllSamples] = useState([]);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const backupRef = useRef(null);
  const playingRef = useRef(new Map());                // id -> { src, gain }

  const refreshPacks = useCallback(async () => {
    const rows = await listPacks();
    setPacks(rows);
    setSize(await librarySize());
    setActivePackId((cur) => cur && rows.some((p) => p.id === cur) ? cur : (rows[0]?.id ?? null));
  }, []);

  const refreshSamples = useCallback(async (packId) => {
    setSamples(packId ? await listSamples(packId) : []);
    setAllSamples(await listSamples());     // pool for the All Packs search
    setSize(await librarySize());
  }, []);

  useEffect(() => { refreshPacks(); }, [refreshPacks]);
  useEffect(() => { refreshSamples(activePackId); }, [activePackId, refreshSamples]);

  // A library written before the audio was split into its own store still has
  // the audio sitting on the sample rows, which makes every listing read the
  // whole thing off disk. Move it across quietly the first time this tab opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await migrateLegacyBlobs((done, total) => {
          if (!cancelled && total > 8) setNote(`Tidying the library — ${done} / ${total}…`);
        });
        if (!cancelled && res.moved > 8) {
          setNote(`Library tidied — ${res.moved} samples moved to the faster layout.`);
        } else if (!cancelled && res.moved) {
          setNote('');
        }
      } catch (err) {
        console.warn('[sample library] migration skipped:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activePack = packs.find((p) => p.id === activePackId) || null;
  // "All Packs" searches the whole library; otherwise you stay inside one pack
  // instead of wading through every sample you own.
  const pool = searchAll ? allSamples : samples;
  const needle = query.trim().toLowerCase();
  const visibleSamples = needle
    ? pool.filter((s) => s.name.toLowerCase().includes(needle))
    : pool;

  const ensurePack = async () => {
    if (activePackId) return activePackId;
    const p = await createPack('My Samples');
    await refreshPacks();
    setActivePackId(p.id);
    return p.id;
  };

  /**
   * Import via the desktop app's own file dialog.
   *
   * `mode` is 'files' or 'folder'. Paths come back from the main process, then
   * each file is pulled across one at a time and handed to the same import that
   * drag-and-drop uses — so a folder of thousands never sits in memory at once.
   * Returns false when there is no desktop bridge, so the caller can fall back
   * to the plain file input in a browser.
   */
  const pickNative = async (mode) => {
    const api = window.lyricistAPI;
    if (!api?.pickSampleFiles) return false;

    const res = mode === 'folder' ? await api.pickSampleFolder() : await api.pickSampleFiles();
    if (!res?.ok) {
      setNote(`Could not open the file picker: ${res?.error || 'unknown error'}`);
      return true;
    }
    if (res.canceled) return true;
    if (!res.paths.length) {
      setNote(mode === 'folder'
        ? 'That folder had no audio in it — looked for WAV, MP3, OGG, FLAC, AIFF, M4A and .zip packs, including subfolders.'
        : 'No files were selected.');
      return true;
    }

    const packId = await ensurePack();
    setBusy({ done: 0, total: res.paths.length });
    let added = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < res.paths.length; i++) {
      const p = res.paths[i];
      try {
        const file = await api.readSampleFile(p);
        if (!file?.ok) throw new Error(file?.error || 'could not be read');
        const blob = new File([new Uint8Array(file.bytes)], file.name);
        const one = await importFiles(packId, [blob]);
        added += one.added;
        skipped += one.skipped;
        errors.push(...one.errors);
      } catch (err) {
        errors.push(`${p.split(/[\\/]/).pop()}: ${err.message}`);
      }
      setBusy({ done: i + 1, total: res.paths.length });
    }
    setBusy(null);
    setNote(summarize({ added, skipped, errors }));
    if (errors.length) console.warn('[sample library] import errors:', errors);
    await refreshPacks();
    await refreshSamples(packId);
    return true;
  };

  /** One honest sentence about what happened, including WHY anything failed. */
  const summarize = (res) => {
    let msg = `Added ${res.added} sample${res.added === 1 ? '' : 's'}`;
    if (res.skipped) msg += ` · skipped ${res.skipped} non-audio`;
    if (res.errors.length) {
      const reasons = new Map();
      for (const e of res.errors) {
        const why = e.slice(e.indexOf(': ') + 2);
        reasons.set(why, (reasons.get(why) || 0) + 1);
      }
      const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      msg += ` · ${res.errors.length} failed — `
        + top.map(([why, n]) => (n > 1 ? `${why} (${n} files)` : why)).join('; ');
    }
    return msg;
  };

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) {
      // A folder with no audio in it, or a cancelled dialog, used to return in
      // silence — indistinguishable from the button being broken.
      setNote('Nothing came through — no files were selected, or the folder had no audio in it.');
      return;
    }
    const packId = await ensurePack();
    setBusy({ done: 0, total: files.length });
    let res;
    try {
      res = await importFiles(packId, files, (done, total) => setBusy({ done, total }));
    } catch (err) {
      setBusy(null);
      setNote(`Import failed: ${err.message}`);
      return;
    }
    setBusy(null);

    // SAY WHY. The reasons were being collected and then thrown away, so a
    // failed import read as "Added 0 samples · 412 failed" and left you with no
    // idea whether the files were too big, the library was full, or the app was
    // broken.
    setNote(summarize(res));
    if (res.errors.length) console.warn('[sample library] import errors:', res.errors);
    await refreshPacks();
    await refreshSamples(packId);
  };

  /** Stop one sample, or everything currently sounding. */
  const stopSample = useCallback((id) => {
    const entry = playingRef.current.get(id);
    if (!entry) return;
    try { entry.src.stop(); } catch { /* already ended */ }
    playingRef.current.delete(id);
    setPlaying(new Set(playingRef.current.keys()));
  }, []);

  const stopAll = useCallback(() => {
    for (const [, entry] of playingRef.current) {
      try { entry.src.stop(); } catch { /* already ended */ }
    }
    playingRef.current.clear();
    setPlaying(new Set());
  }, []);

  // Never leave audio running when the tab goes away.
  useEffect(() => stopAll, [stopAll]);

  /** Play/stop toggle. Loops when the sample is flagged as a loop. */
  const preview = async (sample) => {
    if (playingRef.current.has(sample.id)) {
      stopSample(sample.id);
      return;
    }
    await resumeAudio();
    const ctx = getAudioContext();
    try {
      const buf = await getSampleBuffer(ctx, sample.id);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = Boolean(sample.loop);
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(g).connect(fxInput ? fxInput() : getMasterBus());
      src.onended = () => {
        if (playingRef.current.get(sample.id)?.src === src) {
          playingRef.current.delete(sample.id);
          setPlaying(new Set(playingRef.current.keys()));
        }
      };
      src.start();
      playingRef.current.set(sample.id, { src, gain: g });
      setPlaying(new Set(playingRef.current.keys()));
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
          <Package size={15} style={{ color: '#E7A540' }} />
          <strong style={{ fontSize: '0.82rem' }}>Sample Library</strong>
          <span style={{ fontSize: '0.62rem', color: size > MAX_LIBRARY_BYTES * 0.8 ? '#fbbf24' : 'rgba(230,232,235,0.6)' }}>
            {packs.length} pack{packs.length === 1 ? '' : 's'} · {formatBytes(size)} of {formatBytes(MAX_LIBRARY_BYTES)} · stored on this machine
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
            onClick={async () => { if (!(await pickNative('files'))) fileRef.current?.click(); }}
            data-help="Pick audio files, or a .zip sample pack — the zip is unpacked automatically and every sound inside is imported."
          >
            <Upload size={12} /> Add Files
          </button>

          <button
            className="suno-chip"
            style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}
            onClick={async () => {
              const ok = window.confirm(
                `Remove every sample and pack from the library?\n\n`
                + `${formatBytes(size)} will be freed. Your original files on disk are untouched, `
                + `and your recordings are kept in a separate place and are not affected.\n\n`
                + `This cannot be undone from inside the app.`);
              if (!ok) return;
              const freed = size;                 // the total before we empty it
              const removed = await clearLibrary();
              await refreshPacks();
              await refreshSamples(null);
              setNote(`Library emptied — ${removed.samples} sample${removed.samples === 1 ? '' : 's'}, ${formatBytes(freed)} freed.`);
            }}
            data-help="Empties the whole library — every pack and sample. The files on your own drive are untouched; this only clears what the app is holding. Your recordings are not affected."
          >
            <Trash2 size={12} /> Remove All Samples
          </button>

          <button
            className="suno-chip"
            onClick={async () => { if (!(await pickNative('folder'))) folderRef.current?.click(); }}
            data-help="Import a whole folder of samples at once, including everything in its subfolders."
          >
            <Upload size={12} /> Add Folder
          </button>

          <button
            className="suno-chip"
            onClick={async () => {
              setBusy({ done: 0, total: 1 });
              try {
                const blob = await exportLibrary((d, t) => setBusy({ done: d, total: t }));
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const stamp = new Date().toISOString().slice(0, 10);
                a.href = url;
                a.download = `Lyricist Sample Library ${stamp}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setNote('Library backed up. Keep that .zip somewhere safe — it survives uninstalls.');
              } catch (err) {
                setNote(`Backup failed: ${err.message}`);
              }
              setBusy(null);
            }}
            data-help="Save your whole library — every pack, every sample, root notes and loop flags — to a single .zip. Your samples live inside the app's data folder, which uninstallers delete, so keep a backup."
          >
            <Save size={12} /> Back Up
          </button>

          <button
            className="suno-chip"
            onClick={() => backupRef.current?.click()}
            data-help="Restore a library backup .zip. Packs come back with their names, root notes and loop settings intact."
          >
            <FolderDown size={12} /> Restore
          </button>

          {playing.size > 0 && (
            <button
              className="suno-chip"
              onClick={stopAll}
              style={{ borderColor: '#f87171', color: '#f87171', background: 'rgba(248,113,113,0.1)' }}
              data-help="Stop every sample that's currently playing."
            >
              <Square size={12} /> Stop All ({playing.size})
            </button>
          )}
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
      <input
        ref={backupRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy({ done: 0, total: 1 });
          try {
            const res = await importLibrary(file, (d, t) => setBusy({ done: d, total: t }));
            setNote(`Restored ${res.added} sample${res.added === 1 ? '' : 's'}` +
              (res.errors?.length ? ` · ${res.errors.length} failed` : ''));
          } catch (err) {
            setNote(`Restore failed: ${err.message}`);
          }
          setBusy(null);
          await refreshPacks();
        }}
      />

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-help="Drag samples or a whole sample pack straight onto this panel. Your files never leave this computer."
        style={{
          border: `1px dashed ${dragOver ? '#E7A540' : 'rgba(231,165,64,0.32)'}`,
          background: dragOver ? 'rgba(231,165,64,0.08)' : 'rgba(231,165,64,0.03)',
          borderRadius: 10,
          padding: '10px 12px',
          textAlign: 'center',
          fontSize: '0.68rem',
          color: dragOver ? '#E7A540' : 'rgba(230,232,235,0.72)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {busy
          ? `Importing ${busy.done} / ${busy.total}…`
          : 'Drop samples, folders, or a .zip sample pack here — WAV, MP3, OGG, FLAC, AIFF, M4A'}
      </div>

      {note && (
        // Red when something went wrong. A failure reported in the same calm
        // green as a success is a failure you scroll straight past.
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.66rem', lineHeight: 1.5,
          color: /failed|Nothing came through|full|over the|Could not/i.test(note)
            ? 'rgba(248,113,113,0.95)'
            : 'rgba(52,211,153,0.9)',
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>{note}</span>
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
                borderColor: p.id === activePackId ? '#E7A540' : undefined,
                color: p.id === activePackId ? '#E7A540' : undefined,
                background: p.id === activePackId ? 'rgba(231,165,64,0.1)' : undefined,
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', color: 'rgba(230,232,235,0.55)', padding: '0 2px 2px' }}>
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

          {/* Sticky control bar — search, pack picker and Stop All ride the top
              of the list so you never scroll back up hunting for them. */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 3,
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '6px 4px', marginBottom: 2,
            background: 'rgba(11,13,16,0.97)',
            borderBottom: '1px solid rgba(155,161,170,0.25)',
            backdropFilter: 'blur(6px)',
          }}>
            <Search size={11} style={{ color: 'rgba(231,165,64,0.8)', flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchAll ? 'Search every pack…' : `Search “${activePack.name}”…`}
              data-help="Type to narrow the list. By default it searches the pack you're in; flip to All Packs to search your whole library at once."
              style={{
                flex: '1 1 130px', minWidth: 110, background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(155,161,170,0.3)', borderRadius: 6,
                color: '#e6e8eb', fontSize: '0.68rem', padding: '5px 8px', outline: 'none',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} className="suno-chip" style={{ padding: '3px 6px' }} data-help="Clear the search.">
                <X size={10} />
              </button>
            )}

            <select
              value={searchAll ? '__all' : activePackId || ''}
              onChange={(e) => {
                if (e.target.value === '__all') setSearchAll(true);
                else { setSearchAll(false); setActivePackId(e.target.value); }
              }}
              className="suno-chip"
              style={{ fontSize: '0.66rem', padding: '4px 6px', maxWidth: 160, cursor: 'pointer', flexShrink: 0 }}
              data-help="Jump straight to a pack instead of scrolling, or pick All Packs to look across your whole library."
            >
              {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__all">— All Packs —</option>
            </select>

            <button
              onClick={stopAll}
              disabled={playing.size === 0}
              className="suno-chip"
              style={{
                padding: '4px 9px', flexShrink: 0,
                borderColor: playing.size ? '#f87171' : undefined,
                color: playing.size ? '#f87171' : undefined,
                background: playing.size ? 'rgba(248,113,113,0.12)' : undefined,
                opacity: playing.size ? 1 : 0.4,
                cursor: playing.size ? 'pointer' : 'not-allowed',
              }}
              data-help="Stop everything that's currently playing, without scrolling to find it."
            >
              <Square size={10} /> Stop{playing.size ? ` (${playing.size})` : ''}
            </button>

            <span style={{ fontSize: '0.6rem', color: 'rgba(230,232,235,0.5)', flexShrink: 0 }}>
              {visibleSamples.length}/{searchAll ? allSamples.length : samples.length}
            </span>
          </div>

          {samples.length === 0 && !searchAll && (
            <div style={{ fontSize: '0.68rem', color: 'rgba(230,232,235,0.5)', padding: '8px 2px' }}>
              Nothing in this pack yet — drop some samples above.
            </div>
          )}

          {visibleSamples.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 7,
                background: 'rgba(16,18,21,0.55)',
                border: '1px solid rgba(155,161,170,0.18)',
                fontSize: '0.68rem',
              }}
            >
              <Music2 size={11} style={{ color: '#e7a540', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <span style={{ fontSize: '0.58rem', color: 'rgba(230,232,235,0.45)', flexShrink: 0 }}>
                {formatBytes(s.size)}
              </span>

              <label
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.58rem', color: 'rgba(230,232,235,0.6)', flexShrink: 0 }}
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
                  style={{ width: 42, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(155,161,170,0.3)', borderRadius: 5, color: '#e6e8eb', fontSize: '0.58rem', padding: '2px 4px' }}
                />
                <span style={{ minWidth: 24 }}>{midiToName(s.rootMidi)}</span>
              </label>

              <button
                onClick={() => preview(s)}
                className="suno-chip"
                style={{
                  padding: '3px 7px', flexShrink: 0,
                  borderColor: playing.has(s.id) ? '#f87171' : undefined,
                  color: playing.has(s.id) ? '#f87171' : undefined,
                }}
                data-help="Play this sample. Click again to stop it."
              >
                {playing.has(s.id) ? <Square size={10} /> : <Play size={10} />}
              </button>

              <button
                onClick={async () => { await updateSample(s.id, { loop: !s.loop }); refreshSamples(activePackId); }}
                className="suno-chip"
                style={{
                  padding: '3px 7px', flexShrink: 0,
                  borderColor: s.loop ? '#E7A540' : undefined,
                  color: s.loop ? '#E7A540' : undefined,
                  background: s.loop ? 'rgba(231,165,64,0.1)' : undefined,
                }}
                data-help="Mark this sample as a loop so it repeats until you stop it. Leave it off for one-shots and drum hits."
              >
                <Repeat size={10} />
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
