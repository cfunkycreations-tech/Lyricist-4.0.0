import React, { useEffect, useMemo, useRef, useState } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import WaveSlicer from './WaveSlicer.jsx';
import {
  CHOP_STYLES, DEFAULT_SCREW, SCREW_PRESETS, planChops, screwTrack,
} from '../../services/screwService.js';
import { listRecordings, getRecording, saveRecording } from '../../services/RecordingsStore.js';
import './ScrewShop.css';

/**
 * CHOPPED & SCREWED.
 *
 * Named for what it does, credited to who did it first: DJ Screw, Houston,
 * early nineties. He slowed the record down until the pitch sank with it and
 * chopped it back up on the beat, and an entire city's sound came out of it.
 *
 * Two controls do the real work and they are deliberately separate, because
 * they are two different ideas that always get said as one word:
 *   SCREWED is the speed. Pitch drops with tempo. No correction, ever — the
 *   sunken voice is the whole point.
 *   CHOPPED is the edit. Repeats and drags, on the beat.
 */
export default function ScrewShop() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [recs, setRecs] = useState([]);

  const [rate, setRate] = useState(DEFAULT_SCREW.rate);
  const [bpm, setBpm] = useState(DEFAULT_SCREW.bpm);
  const [style, setStyle] = useState(DEFAULT_SCREW.style);
  const [chopUnit, setChopUnit] = useState(DEFAULT_SCREW.chopUnit);
  const [reverb, setReverb] = useState(DEFAULT_SCREW.reverb);
  const [lowpass, setLowpass] = useState(DEFAULT_SCREW.lowpass);
  const [seed, setSeed] = useState(DEFAULT_SCREW.seed);
  const [sub, setSub] = useState(DEFAULT_SCREW.sub);
  const [subHz, setSubHz] = useState(DEFAULT_SCREW.subHz);
  const [manual, setManual] = useState(() => new Set());
  const [peaks, setPeaks] = useState(null);

  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [srcSeconds, setSrcSeconds] = useState(0);

  const tapTimes = useRef([]);

  useEffect(() => { listRecordings().then(setRecs).catch(() => {}); }, []);

  // Read the length as soon as a file lands, so the preview below means
  // something before anything has been rendered.
  useEffect(() => {
    if (!file) { setSrcSeconds(0); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    file.arrayBuffer()
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        setSrcSeconds(buf.duration);
        // Peaks for the slicer. 1400 columns is more than any screen shows,
        // and cheap enough to compute on the spot for a five minute track.
        const N = 1400;
        const ch = buf.getChannelData(0);
        const step = Math.max(1, Math.floor(ch.length / N));
        const out = new Float32Array(N);
        for (let i = 0; i < N; i += 1) {
          let peak = 0;
          const from = i * step;
          for (let j = from; j < from + step && j < ch.length; j += 1) {
            const v = ch[j] < 0 ? -ch[j] : ch[j];
            if (v > peak) peak = v;
          }
          out[i] = peak;
        }
        setPeaks(out);
        setManual(new Set());
      })
      .catch(() => setError('That file could not be read as audio.'))
      .finally(() => ctx.close());
  }, [file]);

  const preview = useMemo(() => {
    if (!srcSeconds) return null;
    return planChops(srcSeconds, { rate, bpm, style, chopUnit, seed, manual });
  }, [srcSeconds, rate, bpm, style, chopUnit, seed, manual]);

  /** Tap four times on the beat of the ORIGINAL track. */
  const tap = () => {
    const now = performance.now();
    const t = tapTimes.current.filter((x) => now - x < 3000);
    t.push(now);
    tapTimes.current = t;
    if (t.length >= 2) {
      const gaps = t.slice(1).map((x, i) => x - t[i]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const guess = Math.round(60000 / avg);
      if (guess >= 50 && guess <= 220) setBpm(guess);
    }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);
    setResult(null);
    setError('');
  };

  const loadRecording = async (id) => {
    if (!id) return;
    try {
      const rec = await getRecording(Number(id));
      if (!rec?.blob) throw new Error('That take has no audio.');
      setFile(rec.blob);
      setFileName(rec.name || 'Recording');
      setResult(null);
      setError('');
    } catch (e) { setError(e.message); }
  };

  const run = async () => {
    if (!file) { setError('Load a song first.'); return; }
    setBusy(true); setPct(0); setError(''); setResult(null);
    try {
      const out = await screwTrack(file, { rate, bpm, style, chopUnit, reverb, lowpass, seed, sub, subHz, manual }, setPct);
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (e) {
      setError(e.message || 'Could not slow it down.');
    } finally { setBusy(false); }
  };

  const keep = async () => {
    if (!result) return;
    try {
      await saveRecording({
        name: `${fileName.replace(/\.[^.]+$/, '')} (screwed)`,
        blob: result.blob,
        duration: result.seconds,
      });
      setError('');
      listRecordings().then(setRecs).catch(() => {});
    } catch (e) { setError(`Could not save: ${e.message}`); }
  };

  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  return (
    <div className="screw">
      <TabBackground name="screw" />
      <div className="screw-veil" aria-hidden="true" />

      <div className="screw-wrap">
        <header className="screw-top">
          <div>
            <div className="screw-brand">Lyricist 4.2.0 &nbsp;/&nbsp; Goes Quantum</div>
            <h1 className="screw-title">Chopped &amp; Screwed</h1>
            <p className="screw-tag">
              Slow it down until the voice sinks, then chop it back up on the beat.
              The sound <b>DJ Screw</b> invented in Houston.
            </p>
          </div>
        </header>

        <div className="screw-cols">

          <section className="screw-card">
            <header><h2>The song</h2></header>
            <div className="screw-body">
              <label className="screw-drop">
                <input type="file" accept="audio/*" onChange={pickFile} />
                <span>{fileName || 'Choose an audio file'}</span>
              </label>

              {recs.length > 0 && (
                <label className="screw-field">
                  <span>or one of your recordings</span>
                  <select defaultValue="" onChange={(e) => loadRecording(e.target.value)}>
                    <option value="">Pick a take…</option>
                    {recs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </label>
              )}

              {srcSeconds > 0 && (
                <p className="screw-note">
                  {mmss(srcSeconds)} loaded.
                  {preview && ` Comes out at ${mmss(preview.outputSeconds)} across ${preview.plan.length} slices.`}
                </p>
              )}
            </div>
          </section>

          <section className="screw-card">
            <header><h2>Screwed</h2><span className="screw-sub">the speed</span></header>
            <div className="screw-body">
              <div className="screw-knob">
                <div className="nm">How slow</div>
                <div className="val">{Math.round(rate * 100)}%</div>
                <div className="sub">
                  Pitch drops with the tempo. That is the sound, so nothing corrects it.
                </div>
                <input type="range" min="0.5" max="1" step="0.01" value={rate}
                       onChange={(e) => setRate(Number(e.target.value))} />
                <div className="screw-pre">
                  {Object.entries(SCREW_PRESETS).map(([label, v]) => (
                    <button key={label} type="button" aria-pressed={Math.abs(rate - v) < 0.005}
                            onClick={() => setRate(v)}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="screw-knob">
                <div className="nm">Top end off</div>
                <div className="val">{Math.round(lowpass * 100)}%</div>
                <div className="sub">Takes the shine off. Old tape, not a clean file.</div>
                <input type="range" min="0" max="0.9" step="0.01" value={lowpass}
                       onChange={(e) => setLowpass(Number(e.target.value))} />
              </div>

              <div className="screw-knob">
                <div className="nm">Subterranean</div>
                <div className="val">{Math.round(sub * 100)}%</div>
                <div className="sub">
                  A sine that follows the track's own low end, so it thumps where the song
                  already thumps. Off at zero.
                </div>
                <input type="range" min="0" max="1" step="0.01" value={sub}
                       onChange={(e) => setSub(Number(e.target.value))} />
              </div>

              <div className="screw-knob">
                <div className="nm">How deep</div>
                <div className="val">{subHz} Hz</div>
                <div className="sub">
                  Under 30 you feel more than hear. Over 45 you actually hear it. Small speakers
                  will not reproduce the bottom of this at all.
                </div>
                <input type="range" min="20" max="60" value={subHz}
                       onChange={(e) => setSubHz(Number(e.target.value))} />
              </div>

              <div className="screw-knob">
                <div className="nm">Room</div>
                <div className="val">{Math.round(reverb * 100)}%</div>
                <div className="sub">A little space around it.</div>
                <input type="range" min="0" max="0.6" step="0.01" value={reverb}
                       onChange={(e) => setReverb(Number(e.target.value))} />
              </div>
            </div>
          </section>

          <section className="screw-card">
            <header><h2>Chopped</h2><span className="screw-sub">the edit</span></header>
            <div className="screw-body">

              <div className="screw-knob">
                <div className="nm">Beat of the original</div>
                <div className="val">{bpm} BPM</div>
                <div className="sub">
                  Chops land on the beat, so this has to be right or it just sounds broken.
                  Tap along with the track if you do not know it.
                </div>
                <input type="range" min="50" max="200" value={bpm}
                       onChange={(e) => setBpm(Number(e.target.value))} />
                <div className="screw-pre">
                  <button type="button" onClick={tap}>Tap the beat</button>
                </div>
              </div>

              <div className="screw-knob">
                <div className="nm">Style</div>
                <div className="val">{CHOP_STYLES[style].repeats || '—'}x</div>
                <div className="sub">How the slices repeat and drag.</div>
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  {Object.entries(CHOP_STYLES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div className="screw-knob">
                <div className="nm">Slice length</div>
                <div className="val">{chopUnit} beat</div>
                <div className="sub">Shorter is choppier. Half a beat is the classic.</div>
                <input type="range" min="0.25" max="2" step="0.25" value={chopUnit}
                       onChange={(e) => setChopUnit(Number(e.target.value))} />
              </div>

              <div className="screw-knob">
                <div className="nm">Which take</div>
                <div className="val">{seed}</div>
                <div className="sub">The drags fall differently. Same number, same tape.</div>
                <input type="range" min="1" max="99" value={seed}
                       onChange={(e) => setSeed(Number(e.target.value))} />
              </div>
            </div>
          </section>
        </div>

        {peaks && preview && (
          <section className="screw-card screw-slicerwrap">
            <header>
              <h2>The slicer</h2>
              <span className="screw-sub">
                {preview.grid.length} slices · {preview.grid.filter((g) => g.chop).length} chops
                {manual.size > 0 && ` · ${manual.size} yours`}
              </span>
            </header>
            <div className="screw-body">
              <WaveSlicer
                peaks={peaks}
                duration={srcSeconds}
                grid={preview.grid}
                manual={manual}
                onToggle={(i) => setManual((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  return next;
                })}
              />
              {manual.size > 0 && (
                <button type="button" className="screw-mini" style={{ marginTop: 10 }}
                        onClick={() => setManual(new Set())}>
                  Clear my {manual.size} edits
                </button>
              )}
            </div>
          </section>
        )}

        <div className="screw-go">
          {busy ? (
            <div className="screw-bar"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          ) : (
            <button type="button" className="screw-make" onClick={run} disabled={!file}>
              {file ? 'Screw it up' : 'Load a song first'}
            </button>
          )}
          {error && <p className="screw-error">{error}</p>}
        </div>

        {result && (
          <section className="screw-out">
            <div className="hd">
              <span className="id">
                {mmss(result.originalSeconds)} &rarr; {mmss(result.seconds)} · {result.slices} slices
              </span>
            </div>
            <audio controls src={result.url} />
            <div className="row">
              <button type="button" className="screw-mini" onClick={keep}>Keep it</button>
              <a className="screw-mini" href={result.url}
                 download={`${fileName.replace(/\.[^.]+$/, '')}-screwed.wav`}>Download</a>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
