import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Upload, Play, Pause, Trash2, Download, Save, Music, ListMusic, Pencil, Check, Piano } from 'lucide-react';
import {
  saveRecording, listRecordings, renameRecording, deleteRecording,
  sendToPlayer, sendToMidiStudio
} from '../../services/RecordingsStore.js';
import { getAudioContext, resumeAudio, decodeBlob } from '../../services/audioEngine.js';
import { audioBufferToWav } from '../../utils/wavEncoder.js';

import TabBackground from '../common/TabBackground.jsx';
// Recording Booth — Lyricist 4.1.3
// Record harmonica, guitar, singing — anything — straight into the app with a
// live input meter, or upload existing takes. Everything is saved to a
import { Icon } from '../common/Glyph.jsx';
// persistent local library (IndexedDB) and can be:
//   • played in the persistent Suno player while you write on any tab
//   • converted to editable MIDI in MIDI Studio
//   • exported to Documents\Lyricist Recordings (desktop) or downloaded as WAV

function fmtTime(s) {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
function fmtSize(bytes) {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export default function RecordingBooth({ onNavigate }) {
  const [recordings, setRecordings] = useState([]);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [takeName, setTakeName] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const fileRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const meterRafRef = useRef(null);
  const timerRef = useRef(null);
  const recStartRef = useRef(0);
  const previewRef = useRef(null); // one <audio> for library preview

  const refresh = useCallback(async () => {
    try { setRecordings(await listRecordings()); }
    catch (e) { setError(`Could not open the recordings library: ${e.message}`); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => () => { // teardown on unmount
    cancelAnimationFrame(meterRafRef.current);
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const flashNote = (msg) => { setNote(msg); setTimeout(() => setNote(''), 5000); };

  // ── Recording with live input meter ──
  const startRecording = async () => {
    setError('');
    try {
      await resumeAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        // Keep the raw character of instruments: no aggressive processing.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      streamRef.current = stream;

      // Live level meter (analyser is NOT routed to speakers — no feedback).
      const ctx = getAudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const meter = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2.5));
        meterRafRef.current = requestAnimationFrame(meter);
      };
      meterRafRef.current = requestAnimationFrame(meter);

      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        cancelAnimationFrame(meterRafRef.current);
        clearInterval(timerRef.current);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setLevel(0);
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const duration = (Date.now() - recStartRef.current) / 1000;
        try {
          const saved = await saveRecording({
            name: takeName.trim() || `Take ${new Date().toLocaleString()}`,
            blob,
            duration
          });
          setTakeName('');
          await refresh();
          flashNote(`Saved "${saved.name}" to your library`);
        } catch (e) {
          setError(`Could not save the recording: ${e.message}`);
        }
      };
      recorderRef.current = rec;
      rec.start();
      recStartRef.current = Date.now();
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (e) {
      setError(`Microphone unavailable: ${e.message}`);
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  // ── Upload existing takes ──
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      try {
        let duration = null;
        try { duration = (await decodeBlob(file)).duration; } catch { /* keep null */ }
        await saveRecording({ name: file.name.replace(/\.[^.]+$/, ''), blob: file, duration });
      } catch (err) {
        setError(`Could not save "${file.name}": ${err.message}`);
      }
    }
    await refresh();
    if (files.length) flashNote(`Added ${files.length} file${files.length > 1 ? 's' : ''} to your library`);
  };

  // ── Library actions ──
  const preview = async (rec) => {
    await resumeAudio();
    const el = previewRef.current;
    if (!el) return;
    if (playingId === rec.id) { el.pause(); setPlayingId(null); return; }
    el.src = URL.createObjectURL(rec.blob);
    el.onended = () => setPlayingId(null);
    try { await el.play(); setPlayingId(rec.id); }
    catch (e) { setError(`Could not play "${rec.name}": ${e.message}`); }
  };

  const remove = async (rec) => {
    await deleteRecording(rec.id);
    if (playingId === rec.id) { previewRef.current?.pause(); setPlayingId(null); }
    await refresh();
  };

  const startRename = (rec) => { setEditingId(rec.id); setEditName(rec.name); };
  const commitRename = async () => {
    if (editingId && editName.trim()) await renameRecording(editingId, editName.trim());
    setEditingId(null);
    await refresh();
  };

  const downloadWav = async (rec) => {
    try {
      const buf = await decodeBlob(rec.blob);
      const wav = audioBufferToWav(buf);
      const url = URL.createObjectURL(wav);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rec.name.replace(/[\\/:*?"<>|]/g, '-')}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(`WAV export failed: ${e.message}`);
    }
  };

  const saveToDocuments = async (rec) => {
    if (!window.lyricistAPI?.saveRecording) { downloadWav(rec); return; }
    try {
      const buf = await decodeBlob(rec.blob);
      const wav = audioBufferToWav(buf);
      const bytes = new Uint8Array(await wav.arrayBuffer());
      const res = await window.lyricistAPI.saveRecording(`${rec.name}.wav`, bytes);
      flashNote(res?.ok ? `Saved: ${res.path}` : `Could not save: ${res?.error}`);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    }
  };

  const toPlayer = (rec) => {
    sendToPlayer(rec);
    flashNote(`"${rec.name}" queued in the player — it follows you to every tab`);
  };

  const toMidi = (rec) => {
    sendToMidiStudio(rec);
    if (onNavigate) onNavigate('midistudio');
  };

  return (
    <div className="tab-video-shell">
      <TabBackground name="booth" />
      <div className="tab-video-content">
    <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', overflow: 'hidden' }}>
      <audio ref={previewRef} style={{ display: 'none' }} />
      <div className="booth-shell">
        {/* Capture panel */}
        <div className="booth-sidebar">
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: 4 }}><Icon i={Mic} />Recording Booth</h3>
            <p style={{ fontSize: '0.72rem', color: 'rgba(196,181,253,0.7)', lineHeight: 1.5 }}>
              Record harmonica, guitar, or vocals straight into Lyricist — or upload takes you already have.
              Everything lands in your library below, saved on this machine, ready to play while you write
              or to convert into MIDI.
            </p>
          </div>

          <div data-help="Name the take before (or while) recording — otherwise it's stamped with the date and time.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
              Take name (optional)
            </label>
            <input
              className="input-cosmic"
              style={{ width: '100%', borderRadius: 8, padding: '8px 10px', fontSize: '0.78rem' }}
              placeholder="e.g. Harmonica hook idea in G"
              value={takeName}
              onChange={(e) => setTakeName(e.target.value)}
            />
          </div>

          {/* Live input meter */}
          <div data-help="Live input level from your mic. If it barely moves while you play, get closer to the mic or raise your input volume.">
            <label style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
              Input level
            </label>
            <div className="booth-meter">
              <div className="booth-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
          </div>

          {!recording ? (
            <button
              onClick={startRecording}
              className="btn-neon-purple"
              data-demo="booth-record"
              data-help="Start recording from your microphone. Audio processing (echo cancellation, noise suppression) is OFF so instruments keep their real tone."
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Mic size={16} /> Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#f87171,#dc2626)', color: '#fff', fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 0 1px rgba(248,113,113,0.6)' }}
            >
              <Square size={14} /> Stop &amp; Save <span className="midi-record-dot" /> {fmtTime(recSeconds)}
            </button>
          )}

          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(148,130,200,0.5)' }}>— or —</div>

          <input ref={fileRef} type="file" accept="audio/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            data-help="Add takes you've already recorded elsewhere (.mp3/.wav/.ogg/.webm). Pick several at once."
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.08)', color: '#00e5ff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Upload size={14} /> Upload Takes
          </button>

          {error && <div className="pill-red" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '0.7rem' }}>{error}</div>}
          {note && <div className="pill-green" style={{ padding: '8px 10px', borderRadius: 8, fontSize: '0.7rem' }}>{note}</div>}
        </div>

        {/* Library */}
        <div className="booth-main" data-demo="booth-library">
          <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
            <Music size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Your Takes — {recordings.length}
          </h4>

          {!recordings.length && (
            <div className="card-cosmic" style={{ borderRadius: 12, padding: 30, textAlign: 'center', color: 'rgba(196,181,253,0.65)', fontSize: '0.8rem' }}>
              Nothing recorded yet. Hit <strong>Start Recording</strong> and hum, strum, or blow the idea
              before it gets away — it'll be saved here.
            </div>
          )}

          {recordings.map(rec => (
            <div key={rec.id} className="card-cosmic booth-row">
              <button
                className="suno-btn suno-btn--play"
                onClick={() => preview(rec)}
                aria-label={playingId === rec.id ? 'Pause' : 'Play'}
                style={{ width: 32, height: 32 }}
              >
                {playingId === rec.id ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 1 }} />}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                {editingId === rec.id ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      className="album-input"
                      style={{ flex: 1, fontSize: '0.8rem', fontWeight: 700 }}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                      autoFocus
                    />
                    <button className="suno-btn" onClick={commitRename} aria-label="Save name"><Check size={12} /></button>
                  </span>
                ) : (
                  <div className="booth-row-name" title={rec.name}>
                    {rec.name}
                    <button className="booth-icon-btn" onClick={() => startRename(rec)} aria-label={`Rename ${rec.name}`}><Pencil size={11} /></button>
                  </div>
                )}
                <div style={{ fontSize: '0.62rem', color: 'rgba(0,229,255,0.7)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmtTime(rec.duration)} · {fmtSize(rec.size)} · {new Date(rec.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="booth-row-actions">
                <button className="suno-chip" onClick={() => toPlayer(rec)}
                  data-help="Queue this take in the persistent player — it keeps playing while you write on any tab.">
                  <ListMusic size={11} /> Player
                </button>
                <button className="suno-chip" onClick={() => toMidi(rec)}
                  data-help="Send this take through the audio→MIDI pipeline and open it in the MIDI Studio sequencer.">
                  <Piano size={11} /> MIDI
                </button>
                <button className="suno-chip" onClick={() => saveToDocuments(rec)}
                  data-help="Save a .wav copy into Documents\Lyricist Recordings (desktop app), or download it in the browser.">
                  <Save size={11} /> WAV
                </button>
                <button className="suno-chip" onClick={() => downloadWav(rec)}
                  data-help="Download this take as a .wav file.">
                  <Download size={11} />
                </button>
                <button className="suno-btn" onClick={() => remove(rec)} aria-label={`Delete ${rec.name}`}
                  style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}
