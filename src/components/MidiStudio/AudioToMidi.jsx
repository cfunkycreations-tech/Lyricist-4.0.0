import React, { useState, useRef, useEffect } from 'react';
import { Upload, Mic, Square, RefreshCw, Wand2 } from 'lucide-react';
import { convertAudioToMidi } from '../../services/MidiService.js';
import { resumeAudio } from '../../services/audioEngine.js';
import { Icon } from '../common/Glyph.jsx';

// Audio → MIDI input panel — Lyricist 4.1.3
// Upload any audio file, or record a voice memo (hum a melody!) with the
// Web Audio / MediaRecorder APIs. The audio is piped through Spotify's
// open-source basic-pitch model locally and comes back as editable MIDI JSON,
// which we hand up to the sequencer via onNotes(midiJSON).

export default function AudioToMidi({ onNotes }) {
  const fileRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recTimerRef = useRef(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState('');
  const [sensitivity, setSensitivity] = useState(0.5);

  const convert = async (blob, name) => {
    setConverting(true);
    setError('');
    setProgress(0);
    setSourceName(name);
    try {
      const midi = await convertAudioToMidi(blob, {
        onProgress: setProgress,
        onsetThreshold: sensitivity,
        frameThreshold: Math.max(0.1, sensitivity - 0.2)
      });
      if (!midi.notes.length) {
        setError('No notes detected — try a cleaner recording, or raise the sensitivity.');
      } else {
        onNotes(midi, name);
      }
    } catch (e) {
      setError(`Conversion failed: ${e.message}`);
    } finally {
      setConverting(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) convert(file, file.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
  };

  // Recording Booth handoff (4.1.3): a take sent via `lyricist:convert-to-midi`
  // runs through the same pipeline as an upload. This component stays mounted
  // even while the tab is hidden, so the event always lands.
  const convertRef = useRef(convert);
  useEffect(() => { convertRef.current = convert; });
  useEffect(() => {
    const onConvert = (e) => {
      const { blob, name } = e.detail || {};
      if (blob) convertRef.current(blob, name || 'Recorded take');
    };
    window.addEventListener('lyricist:convert-to-midi', onConvert);
    return () => window.removeEventListener('lyricist:convert-to-midi', onConvert);
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      await resumeAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        convert(blob, `Voice memo ${new Date().toLocaleTimeString()}`);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (e) {
      setError(`Microphone unavailable: ${e.message}`);
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  return (
    <div className="card-cosmic" style={{ borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ margin: 0, fontSize: '0.85rem' }}><Icon i={Mic} />Audio → MIDI</h4>
      <p style={{ margin: 0, fontSize: '0.68rem', color: 'rgba(230,232,235,0.7)', lineHeight: 1.5 }}>
        Upload a track or hum a melody — Spotify's open-source <em>basic-pitch</em> model
        extracts the notes on your machine and drops them into the sequencer below. Nothing is uploaded anywhere.
      </p>

      <div data-help="How eagerly the model calls something a note. Lower catches quiet/soft notes (more noise); higher keeps only confident, clear notes.">
        <label style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
          Note sensitivity: {sensitivity.toFixed(2)}
        </label>
        <input type="range" min={0.2} max={0.8} step={0.05} value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="suno-range" style={{ width: '100%' }} disabled={converting} />
      </div>

      <input ref={fileRef} type="file" accept="audio/*" onChange={handleFile} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={converting || recording}
          className="btn-neon-purple"
          data-help="Convert an existing audio file (.mp3/.wav/.ogg — a Suno track, a guitar riff, anything) into editable MIDI notes."
          style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: converting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Upload size={13} /> Upload Audio
        </button>
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={converting}
            data-help="Record a voice memo with your mic — hum, sing, or beatbox a melody and it becomes MIDI."
            style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Mic size={13} /> Record Memo
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#f87171,#dc2626)', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Square size={12} /> Stop <span className="midi-record-dot" /> {recSeconds}s
          </button>
        )}
      </div>

      {converting && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.68rem', color: '#e7a540', marginBottom: 4 }}>
            <RefreshCw size={12} className="pulse-glow" />
            <Wand2 size={12} /> Extracting notes from “{sourceName}” — {Math.round(progress * 100)}%
          </div>
          <div style={{ height: 5, borderRadius: 4, background: 'rgba(255,45,149,0.15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg,#ff2d95,#e7a540)', boxShadow: '0 0 0 1px rgba(255,45,149,0.8)', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {error && <div className="pill-red" style={{ padding: '7px 10px', borderRadius: 8, fontSize: '0.68rem' }}>{error}</div>}
    </div>
  );
}
