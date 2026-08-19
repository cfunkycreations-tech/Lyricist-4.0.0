import React, { useEffect, useMemo, useRef, useState } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import MultiPick from '../common/MultiPick.jsx';
import EngineSetup from './EngineSetup.jsx';
import {
  buildState, composeCaption, detectComfy, estimateSeconds, generateSong, sectionBudget,
} from '../../services/MusicService.js';
import { useLyricStore } from '../../context/LyricStore.jsx';
import {
  GENRE_GROUPS, MOOD_GROUPS, VOICE_GROUPS, COUNTS, kitFor,
} from '../../services/musicTaxonomy.js';
import { blendLabel } from '../../utils/blend.js';
import { saveRecording } from '../../services/RecordingsStore.js';
import './OneManBand.css';

/**
 * ONE MAN BAND — your words, sung by a full band.
 *
 * Named by Chris. It is his own story: the busker who does not need anyone
 * else to show up.
 *
 * Three things decide how this is built, all learned the hard way:
 *
 *  1. THE CAPTION IS THE BIGGEST LEVER, and no beginner will ever write one.
 *     MiniMax's real format has eleven named fields across three blocks. So the
 *     three simple picks write it, and the result stays fully editable. Never
 *     hidden, never mandatory.
 *  2. THE BRACKET TAGS ARE THE SONG STRUCTURE. From MiniMax's own docs: "Tags
 *     are the only executable structural instructions; the lyric text itself
 *     only conveys mood." So they are a first-class control, not plain text.
 *  3. THE WAIT IS REAL AND MUST BE STATED UP FRONT. On free hardware a five
 *     minute song is hours. A beginner who waits an hour with no warning thinks
 *     the app is broken.
 */

const LENGTHS = [
  { s: 30, label: '30s' }, { s: 60, label: '1 min' }, { s: 120, label: '2 min' },
  { s: 180, label: '3 min' }, { s: 300, label: '5 min' },
];

const SECTIONS = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Instrumental', 'Outro'];

/** Pull the [bracket] tags out of the lyric sheet, in order. */
function readSections(lyrics) {
  return [...String(lyrics).matchAll(/\[([^\]\n]{1,24})\]/g)].map((m) => m[1].trim());
}

function prettyTime(totalSeconds) {
  // On the cloud engine a short song is genuinely under a minute, and rounding
  // that to "about 1 minutes" reads as broken and gets the grammar wrong too.
  if (totalSeconds < 75) return `about ${Math.max(10, Math.round(totalSeconds / 5) * 5)} seconds`;
  const mins = Math.round(totalSeconds / 60);
  if (mins < 90) return `about ${mins} minute${mins === 1 ? '' : 's'}`;
  return `about ${(totalSeconds / 3600).toFixed(1)} hours`;
}

/**
 * Every picked genre's instruments in one band, deduped, lead genre first.
 *
 * The kit is the whole reason musicTaxonomy exists: "Afrobeats" alone gives you
 * generic pop, "Afrobeats, talking drum, shekere, log drum bass" gives you
 * Afrobeats. Blending genres without blending their kits would have thrown that
 * away and handed MiniMax a genre list with one band behind it. Capped at twelve
 * instruments because five kits is a forty-piece orchestra and the caption stops
 * meaning anything.
 */
function mergedKit(genreNames) {
  const seen = new Set();
  const parts = [];
  for (const g of genreNames) {
    for (const piece of kitFor(g).split(',').map((x) => x.trim()).filter(Boolean)) {
      const key = piece.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(piece);
    }
  }
  return parts.slice(0, 12).join(', ') || 'guitar, bass and a live drum kit';
}

/**
 * Draft MiniMax's three caption blocks from the three simple picks.
 *
 * Deliberately plain and offline. The AI rewrite is an upgrade on top of this,
 * never a dependency — somebody with no key and no internet still gets a song.
 */
function draftCaption({ genres, moods, voices, seconds }) {
  // Up to five of each now, mixed into one piece of music.
  const gs = (genres || []).filter(Boolean);
  const ms = (moods || []).filter(Boolean);
  const vs = (voices || []).filter(Boolean);
  const genre = blendLabel(gs);
  const mood = blendLabel(ms);
  const voice = blendLabel(vs);
  // Instrumental only if EVERY voice pick is instrumental. One real voice in the
  // list means the piece has singing in it.
  const instrumental = vs.length > 0 && vs.every((v) => v.startsWith('Instrumental'));
  const budget = sectionBudget(seconds);
  const shape = budget <= 1
    ? `A ${seconds} second excerpt: a single section, no intro or outro.`
    : `About ${seconds} seconds, roughly ${budget} sections.`;

  return {
    globalMeta:
      `Basic Attributes: ${gs.length > 1
        ? `${genre} — a genuine fusion, with ${gs[0]} leading and ${gs.slice(1).join(', ')} `
          + `folded into the same arrangement rather than taking turns`
        : genre}. ${shape} `
      + (ms.length > 1
        ? `Global Emotional Progression: ${ms[0].toLowerCase()} at the core from the opening bar, `
          + `shaded with ${ms.slice(1).map((m) => m.toLowerCase()).join(' and ')}, all of it present `
          + `at once rather than section by section. `
        : `Global Emotional Progression: ${mood.toLowerCase()} from the opening bar, holding that `
          + `character through to the end. `)
      + `Application Scenarios & Imagery: a small room, a worn instrument, someone playing for `
      + `the sake of it. `
      + `Sonics & Production Profile: dark and earthy, close-miked, analog warmth, sharp `
      + `percussion transients, room sound rather than plate reverb.`,
    vocals: instrumental
      ? 'This piece is instrumental with no vocals. The lead melodic role is carried by the '
        + 'main instrument of the arrangement.'
      : `Vocal Gender & Timbre: ${vs.length > 1
        ? `${vs[0]} on lead, with ${vs.slice(1).join(' and ')} in support and in harmony`
        : voice}, weathered and full-throated with real grain. `
        + `Vocal Style: sung slightly ahead of the beat, conversational phrasing, a falling `
        + `motif at the end of each line. `
        + `Harmony/Backing Vocals: sparse, only where the song lifts. `
        + `Vocal FX: light slapback delay, dry otherwise.`,
    // The genre's own instruments, not a generic band. This is the single
    // biggest thing that makes a world-music pick sound like that music
    // instead of like pop with a different label on it.
    arrangement:
      `Instrument Lifecycle Description (Primary/Secondary Layering): Primary: ${mergedKit(gs)} `
      + `carry the song from the first bar. Secondary: supporting parts join early and stay; a `
      + `lead line answers the vocal only where the song opens up. `
      + `Groove & Foundation Progression: thumping kick with snare on 2 and 4, brushes where it `
      + `is quiet and sticks where it is not. `
      + `Embellishments, Textures & Spatial FX: string noise and room tone left in, ending on a `
      + `ringing open chord.`,
  };
}

export default function OneManBand() {
  const store = useLyricStore();
  const [lyrics, setLyrics] = useState(
    '[Verse]\nSteel in my hands and the sun going down\n'
    + 'Sparks on the deck of a nameless town\n\n[Chorus]\nSo I sing it loud, I sing it free\n'
    + 'Every road out here belongs to me\n'
  );
  // Lists, up to five each, blended into one song. `genre`/`mood`/`voice` stay
  // as the lead of each so the recipe saved with a take and the instrumental
  // check keep reading the way they always did.
  const [genres, setGenres] = useState(['Blues rock']);
  const [moods, setMoods] = useState(['Gritty and driving']);
  const [voices, setVoices] = useState(['Gravelly male']);
  const genre = genres[0];
  const mood = moods[0];
  const voice = voices[0];

  const [seconds, setSeconds] = useState(30);
  const [takeCount, setTakeCount] = useState(2);
  const [seed, setSeed] = useState(222);
  const [rolling, setRolling] = useState(false);

  const [steps, setSteps] = useState(30);
  const [guidance, setGuidance] = useState(1.7);
  const [showAll, setShowAll] = useState(false);

  const [engine, setEngine] = useState('cloud');
  const [comfy, setComfy] = useState(null);
  const [kaggle, setKaggle] = useState(null);
  // OPEN BY DEFAULT WHEN NOTHING IS SET UP, and it sits ABOVE the engine row
  // rather than behind a link under it. Chris, 2026-08-19: *"if you have to set
  // it up first, you should have that card first."* Hiding the one thing that
  // unlocks full-length songs behind a link at the bottom is the same mistake as
  // putting "set this up first" on card nineteen of twenty.
  // STARTS OPEN. Deciding from the status check instead meant a two and a half
  // second wait (detectComfy's timeout) before the card appeared, so a new user
  // saw the tab with no setup on it and then watched it pop in. Shown first,
  // folded away once we learn something is already connected, and never moved
  // again after the person touches the toggle themselves.
  const [showSetup, setShowSetup] = useState(true);
  const setupTouched = useRef(false);

  const [caption, setCaption] = useState(() => draftCaption({
    genres: ['Blues rock'], moods: ['Gritty and driving'], voices: ['Gravelly male'], seconds: 30,
  }));
  const [captionEdited, setCaptionEdited] = useState(false);
  const [rewriting, setRewriting] = useState(false);

  const [takes, setTakes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef(null);

  // Only offer "this computer" if there is actually something to talk to.
  useEffect(() => {
    let dead = false;
    detectComfy().then((c) => { if (!dead) setComfy(c); });
    window.lyricistAPI?.kaggleStatus?.(false)
      .then((k) => { if (!dead && k?.connected) setKaggle(k); })
      .catch(() => {});
    // Decide once, from what is actually connected: nothing set up means the
    // setup card is what you see first.
    Promise.all([
      window.lyricistAPI?.kaggleStatus?.(false).catch(() => null),
      detectComfy().catch(() => null),
    ]).then(([k, c]) => {
      if (!dead && !setupTouched.current && (k?.connected || c)) setShowSetup(false);
    });
    return () => { dead = true; };
  }, []);

  // Redraft the caption when the picks change, unless he has taken it over.
  useEffect(() => {
    if (captionEdited) return;
    setCaption(draftCaption({ genres, moods, voices, seconds }));
    // Joined rather than the arrays themselves: a new array every render would
    // redraft the caption on every keystroke elsewhere in the tab.
  }, [genres.join('|'), moods.join('|'), voices.join('|'), seconds, captionEdited]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const tags = useMemo(() => readSections(lyrics), [lyrics]);
  const budget = sectionBudget(seconds);
  const tooManyParts = tags.length > budget;
  const estimate = estimateSeconds(engine, seconds) * (engine === 'cloud' ? 1 : takeCount);

  /** Songwriter already stores lyrics as [SECTION] + lines, which is exactly
      the shape this tab wants, so nothing has to be reformatted. */
  const pullFromSongwriter = () => {
    const text = store.getFullText?.() || '';
    if (!text.trim()) {
      setError('Songwriter is empty. Write something there first.');
      return;
    }
    setLyrics(text);
    setError('');
  };

  /**
   * Rewrite the sound description using MiniMax's own caption writer, free on
   * their server. If it fails for any reason the offline draft is kept — the
   * button is an upgrade, never a dependency.
   */
  const rewriteWithAI = async () => {
    setRewriting(true);
    setError('');
    try {
      const better = await composeCaption({
        state: buildState({
          lyrics,
          globalMeta: caption.globalMeta,
          vocals: caption.vocals,
          arrangement: caption.arrangement,
          instrumental: voices.every((v) => v.startsWith('Instrumental')),
        }),
        duration: seconds,
        hfToken: store.config?.huggingFaceToken || '',
      });
      if (better.globalMeta || better.vocals || better.arrangement) {
        setCaption((c) => ({
          globalMeta: better.globalMeta || c.globalMeta,
          vocals: better.vocals || c.vocals,
          arrangement: better.arrangement || c.arrangement,
        }));
        setCaptionEdited(true);
      }
    } catch (e) {
      setError(`${e.message} Your description was left as it was.`);
    } finally {
      setRewriting(false);
    }
  };

  const roll = () => {
    setRolling(true);
    let n = 0;
    const iv = setInterval(() => {
      setSeed(Math.floor(Math.random() * 9007199254740991));
      if (++n > 11) { clearInterval(iv); setRolling(false); }
    }, 60);
  };

  const addSection = (name) => setLyrics((l) => `${l.replace(/\s*$/, '')}\n\n[${name}]\n`);

  const make = async () => {
    setError('');
    setBusy(true);
    setElapsed(0);
    setPhase('starting');
    const ac = new AbortController();
    abortRef.current = ac;

    const state = buildState({
      lyrics,
      globalMeta: caption.globalMeta,
      vocals: caption.vocals,
      arrangement: caption.arrangement,
      instrumental: voices.every((v) => v.startsWith('Instrumental')),
    });

    // Every take gets its own seed so they are genuinely different performances.
    const seeds = Array.from({ length: takeCount }, (_, i) => seed + i * 1013904223);

    try {
      for (const s of seeds) {
        const res = await generateSong({
          engine,
          base: comfy?.base,
          state,
          duration: seconds,
          seed: s,
          steps,
          guidance,
          hfToken: store.config?.huggingFaceToken || '',
          signal: ac.signal,
          onProgress: (p) => setPhase(p.phase),
        });
        const url = URL.createObjectURL(res.blob);
        setTakes((prev) => [{
          id: `${Date.now()}-${s}`,
          seed: s,
          url,
          blob: res.blob,
          seconds,
          ms: res.ms,
          // The seed alone does NOT reproduce a take. Keep the whole recipe.
          recipe: { lyrics, caption, genres, moods, voices, genre, mood, voice, seconds, steps, guidance, engine },
        }, ...prev]);
      }
      setPhase('');
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); setBusy(false); setPhase(''); };

  const keep = async (take) => {
    try {
      await saveRecording({
        name: `One Man Band ${new Date().toLocaleString()} (take ${take.seed})`,
        blob: take.blob,
        duration: take.seconds,
      });
      setPhase('saved to Recordings');
      setTimeout(() => setPhase(''), 2500);
    } catch (e) {
      setError(`Could not save: ${e.message}`);
    }
  };

  return (
    <div className="omb">
      <TabBackground name="onemanband" />
      <div className="omb-veil" aria-hidden="true" />

      <div className="omb-wrap">

        <header className="omb-top">
          <div>
            <div className="omb-brand">Lyricist 4.2.0 &nbsp;/&nbsp; Goes Quantum</div>
            <h1 className="omb-title">One Man Band</h1>
            <p className="omb-tag">
              Your words, sung by a full band. <b>Free forever.</b> Faster if you have the hardware.
            </p>
          </div>
          <div className="omb-tier">
            <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>Simple</button>
            <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>Full Control</button>
          </div>
        </header>

        {showSetup && (
          <EngineSetup
            onKaggleReady={(username) => { setKaggle({ connected: true, username }); setEngine('kaggle'); }}
            onLocalReady={(base) => { setComfy({ base, version: 'local' }); setEngine('local'); }}
          />
        )}

        <div className="omb-engine">
          <span className="omb-lbl">Where it runs</span>
          <button type="button" className="omb-eng" aria-pressed={engine === 'cloud'}
                  onClick={() => setEngine('cloud')}>
            <span className="omb-dot" />Free cloud <span className="omb-cost free">$0</span>
          </button>
          {/* KAGGLE IS A REAL ENGINE NOW, not a line of advice in a warning.
              It is the only free route to a full length song. */}
          <button type="button" className="omb-eng" aria-pressed={engine === 'kaggle'}
                  disabled={!kaggle?.connected} onClick={() => setEngine('kaggle')}>
            <span className="omb-dot" />Kaggle{' '}
            <span className={`omb-cost${kaggle?.connected ? ' free' : ''}`}>
              {kaggle?.connected ? `$0 · as ${kaggle.username}` : 'not set up'}
            </span>
          </button>
          <button type="button" className="omb-eng" aria-pressed={engine === 'local'}
                  disabled={!comfy} onClick={() => setEngine('local')}>
            <span className="omb-dot" />This computer{' '}
            <span className="omb-cost">{comfy ? `ready` : 'not set up'}</span>
          </button>
          <button type="button" className="omb-setup-link" onClick={() => { setupTouched.current = true; setShowSetup((v) => !v); }}>
            {showSetup ? 'Hide setup' : 'Set-up'}
          </button>
        </div>

        <div className="omb-cols">

          <section className="omb-card">
            <header>
              <h2>The song</h2>
              <button type="button" className="omb-mini" onClick={pullFromSongwriter}>
                Pull from Songwriter
              </button>
            </header>
            <div className="omb-body">
              <p className="omb-hint omb-counts">{COUNTS.genres} genres, {COUNTS.moods} moods, {COUNTS.voices} voices. Every genre brings its own instruments to the description.</p>
              <p className="omb-hint">
                <b>The bracket tags are the song structure.</b> The words set the mood, but these
                decide the shape.
              </p>
              <div className="omb-tags">
                {tags.map((t, i) => (
                  <span key={`${t}-${i}`} className={`omb-tag ${t.toLowerCase().slice(0, 1)}`}>{t}</span>
                ))}
                {SECTIONS.map((s) => (
                  <button key={s} type="button" className="omb-tag add"
                          onClick={() => addSection(s)}>+ {s}</button>
                ))}
              </div>

              {tooManyParts && (
                <p className="omb-warn">
                  {tags.length} parts in {seconds} seconds is more than will fit. A part needs
                  15 to 20 seconds to be music. Either make it longer or cut parts.
                </p>
              )}

              <textarea className="omb-sheet" rows={12} value={lyrics} spellCheck
                        onChange={(e) => setLyrics(e.target.value)} />

              {/* Five of each, blended. The instruments of every genre picked go
                  into the caption together — see mergedKit. */}
              <div className="omb-picks">
                <MultiPick
                  label="Genre"
                  help="Pick up to five and they are fused into one arrangement, not played in turn. Every genre brings its own instruments to the description, and all of them end up in the band."
                  value={genres}
                  onChange={setGenres}
                  options={GENRE_GROUPS}
                  addLabel="Add a genre"
                />
                <MultiPick
                  label="Mood"
                  help="Up to five feelings, layered at once rather than section by section. The first is the core of the piece."
                  value={moods}
                  onChange={setMoods}
                  options={MOOD_GROUPS}
                  addLabel="Add a mood"
                />
                <MultiPick
                  label="Voice"
                  help="Up to five. The first sings lead and the rest come in as support and harmony. Pick only Instrumental voices to get a song with no singing at all."
                  value={voices}
                  onChange={setVoices}
                  options={VOICE_GROUPS}
                  addLabel="Add a voice"
                />
              </div>

              <div className="omb-drafted">
                <div className="omb-cap">
                  <span>Sound description, written for you, edit freely</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="omb-mini" disabled={rewriting}
                            onClick={rewriteWithAI}>
                      {rewriting ? 'Writing…' : 'Rewrite with AI'}
                    </button>
                    <button type="button" className="omb-mini" onClick={() => {
                      setCaptionEdited(false);
                      setCaption(draftCaption({ genres, moods, voices, seconds }));
                    }}>Start over
                    </button>
                  </span>
                </div>
                {['globalMeta', 'vocals', 'arrangement'].map((k) => (
                  <textarea key={k} rows={k === 'globalMeta' ? 4 : 3} value={caption[k]}
                            spellCheck={false}
                            onChange={(e) => {
                              setCaptionEdited(true);
                              setCaption((c) => ({ ...c, [k]: e.target.value }));
                            }} />
                ))}
              </div>
            </div>
          </section>

          <section className="omb-card">
            <header><h2>Controls</h2><span className="omb-cost">nothing hidden</span></header>
            <div className="omb-body">

              <div className="omb-grp">
                <h3>The basics</h3>
                <div className="omb-knob">
                  <div className="nm">Length</div><div className="val">{seconds}s</div>
                  <div className="sub">Anything up to a full 5 minute song</div>
                  <input type="range" min="10" max="300" value={seconds}
                         onChange={(e) => setSeconds(Number(e.target.value))} />
                  <div className="omb-pre">
                    {LENGTHS.map((l) => (
                      <button key={l.s} type="button" aria-pressed={seconds === l.s}
                              onClick={() => setSeconds(l.s)}>{l.label}</button>
                    ))}
                  </div>
                </div>

                <div className="omb-knob">
                  <div className="nm">Takes at once</div><div className="val">{takeCount}</div>
                  <div className="sub">Different versions, pick the one you like</div>
                  <input type="range" min="1" max="4" value={takeCount}
                         onChange={(e) => setTakeCount(Number(e.target.value))} />
                </div>

                <div className="omb-knob">
                  <div className="nm">Take number</div>
                  <div className="omb-seedrow">
                    <span className="val">{seed.toLocaleString('en-US')}</span>
                    <button type="button" className={`omb-dice ${rolling ? 'rolling' : ''}`}
                            onClick={roll} aria-label="Roll a new take number">🎲</button>
                  </div>
                  <div className="sub">Same words, new number, different performance. Saved with the song.</div>
                </div>
              </div>

              {showAll && (
                <>
                  <div className="omb-grp">
                    <h3>The singing</h3>
                    <p>How it writes the melody and the vocal</p>
                    <div className="omb-knob">
                      <div className="nm">Stick to my description</div><div className="val">{guidance}</div>
                      <div className="sub">Higher follows your words harder. Lower lets it wander.</div>
                      <input type="range" min="0" max="10" step="0.1" value={guidance}
                             onChange={(e) => setGuidance(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="omb-grp">
                    <h3>The sound</h3>
                    <p>How the finished audio gets rendered</p>
                    <div className="omb-knob">
                      <div className="nm">Polish passes</div><div className="val">{steps}</div>
                      <div className="sub">More is cleaner and slower. 30 is the recipe.</div>
                      <input type="range" min="8" max="80" value={steps}
                             onChange={(e) => setSteps(Number(e.target.value))} />
                    </div>
                  </div>
                </>
              )}

              <div className="omb-go">
                <div className="omb-est"><span>This will take</span><b>{prettyTime(estimate)}</b></div>
                {/* The free cloud allocates about 2.15x the song length in GPU
                    time and a single call is capped, so it refuses anything much
                    past 45 seconds. Say so here rather than let them wait for a
                    rejection they cannot read. */}
                {engine === 'cloud' && seconds > 45 && (
                  <p className="omb-warn">
                    The free cloud tops out around 45 seconds a song. For {seconds} seconds,
                    use Kaggle or your own computer. Free either way, just slower.
                  </p>
                )}
                <p className="omb-preflight">
                  Read your words back before you start it. Good ones are worth the wait, and a
                  typo costs you the whole run.
                </p>
                {busy ? (
                  <button type="button" className="omb-make busy" onClick={stop}>
                    {phase || 'working'} &nbsp;{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} &nbsp;— stop
                  </button>
                ) : (
                  <button type="button" className="omb-make" onClick={make}>Make the song</button>
                )}
                {error && <p className="omb-error">{error}</p>}
                {!error && phase === 'saved to Recordings' && <p className="omb-ok">Saved to Recordings</p>}
                <div className="omb-credit">Music by MiniMax-Music3</div>
              </div>
            </div>
          </section>
        </div>

        {takes.length > 0 && (
          <section className="omb-takes">
            <div className="omb-rackhd"><h2>Takes</h2></div>
            <div className="omb-rack">
              {takes.map((t) => (
                <article key={t.id} className="omb-take">
                  <div className="hd">
                    <span className="id">Take {t.seed.toLocaleString('en-US')}</span>
                    <span className="badge">{Math.round(t.ms / 1000)}s to make</span>
                  </div>
                  <audio controls src={t.url} />
                  <div className="row">
                    <button type="button" className="omb-mini" onClick={() => keep(t)}>Keep it</button>
                    <a className="omb-mini" href={t.url} download={`one-man-band-${t.seed}.flac`}>Download</a>
                    <button type="button" className="omb-mini" onClick={() => {
                      setLyrics(t.recipe.lyrics); setCaption(t.recipe.caption);
                      setSeconds(t.recipe.seconds); setSeed(t.seed);
                      setCaptionEdited(true);
                    }}>Load this recipe
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
