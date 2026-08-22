import React, { useEffect, useMemo, useRef, useState } from 'react';
import TabBackground from '../common/TabBackground.jsx';
import MultiPick from '../common/MultiPick.jsx';
import EngineSetup from './EngineSetup.jsx';
import { registerGhostActions } from '../../services/ghostBus.js';
import { EXAMPLES } from '../../services/minimaxExamples.js';

/**
 * THE SHAPE OF A SONG, IN ONE PRESS.
 *
 * Chris, 2026-08-21: *"make it so that it will write the verse chorus intro,
 * verse chorus, verse chorus bridge, verse chorus outro."*
 *
 * That is the standard pop and rock arrangement and it is nine tags. Adding them
 * one at a time from the row of plus buttons is nine clicks before a single word
 * gets written, and you have to already know the running order to get it right.
 * One button now lays the whole thing out and you fill in the blanks.
 *
 * It APPENDS rather than replaces, always. Anything that can silently eat a
 * verse somebody already wrote is not worth the convenience.
 */
const SONG_SHAPE = ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Verse', 'Chorus', 'Outro'];

/**
 * What each part of the sound description is FOR.
 *
 * These three boxes are MiniMax's own caption format, and they were shipped as
 * three unlabelled rectangles. The model reads them as one block, but a person
 * has to know that the tempo goes in the first and the singer goes in the
 * second, and nothing on screen said so.
 */
const CAPTION_PARTS = [
  {
    key: 'globalMeta',
    label: 'The style',
    hint: 'Genre, speed, key, and the overall feel. This one does the most work.',
  },
  {
    key: 'vocals',
    label: 'The singer',
    hint: 'Who is singing and how. Age, grain, delivery, harmonies.',
  },
  {
    key: 'arrangement',
    label: 'The band',
    hint: 'The instruments you actually want to hear, and what each one is doing.',
  },
];

/**
 * A box that grows with what you put in it.
 *
 * Chris, 2026-08-21: *"it needs to be able to write out the whole fucking words,
 * like the whole global prompt, basically, and write out the lyrics because
 * there's no place for lyrics."*
 *
 * He is right and the numbers were embarrassing: the lyrics box was twelve rows
 * in a half-width column, 280 pixels tall for a three minute song, and the three
 * sound-description boxes were four, three and three rows with no labels on any
 * of them. You wrote a verse and started scrolling inside a slot. A song you
 * cannot see all of is a song you cannot edit.
 *
 * So every writing box here sizes itself to its content. It still has a floor so
 * an empty one does not collapse, and the drag handle still works, because
 * taking away a control to add a convenience is not a trade anybody asked for.
 */
function GrowBox({ value, minRows = 3, className = '', ...rest }) {
  const ref = useRef(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    // Measured, not guessed: collapse first or it can only ever grow.
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <textarea
      ref={ref}
      className={className}
      rows={minRows}
      value={value}
      onInput={fit}
      {...rest}
    />
  );
}
import {
  buildState, composeCaption, detectComfy, estimateSeconds, generateTakes, sectionBudget,
  SECONDS_PER_SECTION,
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

/**
 * EVERY part of a song is pickable, not just the six obvious ones.
 *
 * Chris, 2026-08-21: *"just make it so that you can pick all of those, intro,
 * chorus, verse, blah blah blah."* Pre-Chorus, Post-Chorus, Hook, Breakdown and
 * Solo were all missing, so writing any of them meant typing the brackets by
 * hand and hoping the spelling matched what the model reads. They are buttons
 * now, in the order they usually turn up in a song.
 */
const SECTIONS = [
  'Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Post-Chorus', 'Hook',
  'Bridge', 'Breakdown', 'Solo', 'Instrumental', 'Outro',
];

/**
 * Pull the section tags out of the lyric sheet, in order.
 *
 * Brackets anywhere, and ALSO a parenthesis tag sitting alone on its own line.
 * Chris's own example song writes its choruses as `(Hook)` and its verses as
 * `[verse 1]`, which is normal and which MiniMax reads either way. Counting only
 * brackets called that 59 line song "4 parts" and sized it at 60 seconds.
 *
 * Alone on the line is the whole test, and it is what keeps ad-libs out: nobody
 * writes "(yeah)" on a line by itself, and everybody writes it at the end of
 * one. The word also has to look like a section name, so a parenthetical aside
 * on its own line is still not a chorus.
 */
const SECTION_WORDS = /^(intro|verses?|pre-?chorus|post-?chorus|chorus|hook|bridge|breakdown|solos?|instrumental|outro|refrain|interlude|drop|guitar solo)\b/i;

function readSections(lyrics) {
  const out = [];
  for (const line of String(lyrics).split('\n')) {
    const t = line.trim();

    // [anything] can sit inline, and often does.
    for (const m of t.matchAll(/\[([^\]\n]{1,24})\]/g)) out.push(m[1].trim());

    // (Hook) only counts when it is the entire line and reads like a section.
    const solo = /^\(([^)\n]{1,24})\)$/.exec(t);
    if (solo && SECTION_WORDS.test(solo[1].trim())) out.push(solo[1].trim());
  }
  return out;
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

  /**
   * THE TAKE NUMBERS. Plural, because there is one per take.
   *
   * Chris, 2026-08-21: *"why is there only one take number if it's creating two
   * diff versions?"* Fair. Every take has always had its own number, derived
   * from the one on screen by a fixed stride, but only the first was shown, so
   * the panel said 222 while the run used 222 and 1,014,126,445 and the second
   * take's number appeared nowhere until it came back. A number you cannot see
   * is a take you cannot get back to, and this knob exists precisely so you can
   * get back to one you liked.
   *
   * The stride is the Numerical Recipes LCG multiplier. Any large odd number
   * would do; what matters is that neighbouring takes are nowhere near each
   * other, because adjacent seeds give suspiciously similar performances.
   */
  const seeds = useMemo(
    () => Array.from({ length: takeCount }, (_, i) => seed + i * 1013904223),
    [seed, takeCount],
  );
  const lineCount = useMemo(
    () => lyrics.split('\n').filter((l) => l.trim() && !/^\s*\[/.test(l)).length,
    [lyrics],
  );

  /**
   * The prompt as the engine will actually receive it.
   *
   * Built the same way generateKaggle and generateCloud build it, from the same
   * three fields joined by blank lines, so what he reads here is what goes out.
   * If that join ever changes in MusicService this has to change with it.
   */
  const wholePrompt = useMemo(() => {
    const sound = [caption.globalMeta, caption.vocals, caption.arrangement]
      .map((t) => String(t || '').trim())
      .filter(Boolean)
      .join('\n\n');
    const instrumental = voices.every((v) => v.startsWith('Instrumental'));
    const words = instrumental ? '(instrumental, no vocals)' : (lyrics.trim() || '(no words yet)');
    return `${sound}\n\n----- LYRICS -----\n\n${words}`;
  }, [caption, lyrics, voices]);

  const [copied, setCopied] = useState(false);
  const [confirmExample, setConfirmExample] = useState(null);

  /**
   * Load a finished, professional-grade song into every box.
   *
   * Chris asked for a real example to be baked in, and handed over one of his
   * own. Reading a great caption teaches more than any amount of instruction
   * text, so it goes in the boxes where it can be picked apart and edited.
   *
   * It replaces what is there, which is exactly why the button asks twice when
   * there is something to lose and not at all when there is not.
   */
  const loadExample = (ex) => {
    setLyrics(ex.lyrics);
    setCaption({ globalMeta: ex.globalMeta, vocals: ex.vocals, arrangement: ex.arrangement });
    setCaptionEdited(true);
    fitLength(ex.lyrics);
    setConfirmExample(null);
    setPhase(`Loaded "${ex.title}". Edit any of it, or press Make the song.`);
    setTimeout(() => setPhase((p) => (p.startsWith('Loaded') ? '' : p)), 5000);
  };

  const askForExample = (ex) => {
    const hasWork = lyrics.trim() || captionEdited;
    if (!hasWork) { loadExample(ex); return; }
    setConfirmExample(ex);
  };
  const copyWholePrompt = async () => {
    try {
      await navigator.clipboard.writeText(wholePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not reach the clipboard. Select the text and copy it by hand.');
    }
  };
  const budget = sectionBudget(seconds);
  const tooManyParts = tags.length > budget;
  const estimate = estimateSeconds(engine, seconds, engine === 'cloud' ? 1 : takeCount);

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

  /**
   * Make the song long enough to hold the parts it now has.
   *
   * A part needs fifteen seconds to be music, so nine of them need a hundred and
   * thirty five. Adding parts used to leave the length where it was and then
   * warn that they do not fit, which is being told a whole song is too long
   * after asking for a whole song. Adding a part is a clear enough statement of
   * intent to grow the song, so it grows, on the slider where you can see it and
   * drag it back. The warning is left for what it was written for: an
   * arrangement that cannot fit in the five minute ceiling no matter what.
   */
  const fitLength = (nextLyrics) => {
    const parts = readSections(nextLyrics).length;
    const needs = Math.min(300, parts * SECONDS_PER_SECTION);
    setSeconds((cur) => {
      if (cur >= needs) return cur;
      setPhase(`Length raised to ${needs} seconds so all ${parts} parts fit`);
      setTimeout(() => setPhase((p) => (p.startsWith('Length raised') ? '' : p)), 4000);
      return needs;
    });
  };

  const addSection = (name) => setLyrics((l) => {
    const next = `${l.replace(/\s*$/, '')}\n\n[${name}]\n`;
    fitLength(next);
    return next;
  });

  /** Lay the whole standard arrangement out, ready to write into. */
  const addWholeShape = () => setLyrics((l) => {
    const skeleton = SONG_SHAPE.map((p) => `[${p}]\n`).join('\n');
    const next = l.trim() ? `${l.replace(/\s*$/, '')}\n\n${skeleton}` : skeleton;
    fitLength(next);
    return next;
  });

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


    try {
      // ONE call for all of them. On Kaggle that is one push, one queue and one
      // warm-up with the takes split across its two graphics cards, instead of
      // the whole seventeen minute round trip again for the second version of
      // the same song. Everything else still goes one at a time inside here,
      // and onTake fires the moment each one lands so the first is playable
      // while the next is still cooking.
      await generateTakes({
        engine,
        base: comfy?.base,
        state,
        duration: seconds,
        seeds,
        steps,
        guidance,
        hfToken: store.config?.huggingFaceToken || '',
        signal: ac.signal,
        onProgress: (p) => setPhase(p.phase),
        onTake: (res) => {
          const url = URL.createObjectURL(res.blob);
          setTakes((prev) => [{
            id: `${Date.now()}-${res.seed}-${prev.length}`,
            seed: res.seed,
            url,
            blob: res.blob,
            seconds,
            ms: res.ms,
            // The seed alone does NOT reproduce a take. Keep the whole recipe.
            recipe: { lyrics, caption, genres, moods, voices, genre, mood, voice, seconds, steps, guidance, engine },
          }, ...prev]);
        },
      });
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

  /**
   * WHAT THE GHOST IS ALLOWED TO DO IN HERE.
   *
   * Chris asked for the assistant to be able to press things, everything, and
   * this is the everything. Each one returns the sentence the Ghost shows in the
   * conversation, so a change on screen is always traceable to a line it said.
   *
   * These only exist while this tab is mounted, which is the point: the Ghost
   * has to open a tab before it can touch it, the same as a person.
   */
  useEffect(() => registerGhostActions({
    set_lyrics: ({ text }) => {
      const t = String(text ?? '');
      setLyrics(t);
      fitLength(t);
      return `wrote ${t.split('\n').filter((l) => l.trim()).length} lines into the words`;
    },
    append_lyrics: ({ text }) => {
      const add = String(text ?? '').trim();
      if (!add) throw new Error('there was nothing to add');
      setLyrics((l) => {
        const next = l.trim() ? `${l.replace(/\s*$/, '')}\n\n${add}` : add;
        fitLength(next);
        return next;
      });
      return 'added that to the end of the words';
    },
    set_caption: (parts) => {
      const map = { style: 'globalMeta', singer: 'vocals', band: 'arrangement' };
      // Work out what changed BEFORE handing anything to setState. React runs
      // an updater when it feels like it, so a list built inside one is still
      // empty when the line below reads it: the first version of this wrote the
      // text correctly and then reported that it had done nothing.
      const changed = Object.keys(map)
        .filter((from) => typeof parts[from] === 'string' && parts[from].trim());
      if (!changed.length) throw new Error('no part of the sound description was given');
      setCaptionEdited(true);
      setCaption((c) => {
        const next = { ...c };
        changed.forEach((from) => { next[map[from]] = parts[from].trim(); });
        return next;
      });
      return `rewrote the ${changed.join(' and the ')}`;
    },
    set_length: ({ seconds: n }) => {
      const v = Math.max(10, Math.min(300, Math.round(Number(n) || 0)));
      if (!v) throw new Error('that is not a length');
      setSeconds(v);
      return `set the length to ${v} seconds`;
    },
    set_takes: ({ count }) => {
      const v = Math.max(1, Math.min(4, Math.round(Number(count) || 0)));
      setTakeCount(v);
      return `set it to make ${v} take${v === 1 ? '' : 's'}`;
    },
    roll_take_number: () => { roll(); return 'rolled a new take number'; },
    set_engine: ({ engine: e }) => {
      const want = String(e || '').toLowerCase();
      if (!['cloud', 'kaggle', 'local'].includes(want)) throw new Error(`"${e}" is not one of the three`);
      if (want === 'kaggle' && !kaggle?.connected) throw new Error('Kaggle is not connected yet, open Set-up first');
      if (want === 'local' && !comfy) throw new Error('this computer is not set up for it yet, open Set-up first');
      setEngine(want);
      return `switched it to ${want === 'cloud' ? 'the free cloud' : want === 'kaggle' ? 'Kaggle' : 'this computer'}`;
    },
    lay_out_song: () => { addWholeShape(); return 'laid out a whole song and made it long enough to hold it'; },
    make_the_song: () => {
      if (busy) throw new Error('it is already making one');
      make();
      return 'started it. The Stop button is in the tab if you change your mind';
    },
    stop: () => { stop(); return 'stopped it'; },
  }), [busy, kaggle, comfy, lyrics, seconds]);   // eslint-disable-line react-hooks/exhaustive-deps

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
          <button type="button" className="omb-setup-link" data-demo="omb-setup"
                  onClick={() => { setupTouched.current = true; setShowSetup((v) => !v); }}>
            {showSetup ? 'Hide setup' : 'Set-up'}
          </button>
        </div>

        {/* THE WORDS COME FIRST AND THEY GET THE WHOLE WIDTH.
            This used to be the top half of a 1.15fr column with the knobs
            beside it, which left a three minute song a 280 pixel slot to live
            in. Writing is what this tab is for, so writing gets the room and
            the knobs move underneath. */}
        <section className="omb-card omb-write">
          <header>
            <h2>The words</h2>
            <div className="omb-writehd">
              <span className="omb-lines">
                {lineCount} {lineCount === 1 ? 'line' : 'lines'} · {tags.length} {tags.length === 1 ? 'part' : 'parts'}
              </span>
              {EXAMPLES.map((ex) => (
                <button key={ex.title} type="button" className="omb-mini"
                        title={`${ex.title} — ${ex.genre}`}
                        onClick={() => askForExample(ex)}>
                  Example: {ex.genre.split('/')[0].trim()}
                </button>
              ))}
              <button type="button" className="omb-mini" onClick={pullFromSongwriter}>
                Pull from Songwriter
              </button>
            </div>
          </header>
          <div className="omb-body">
            {confirmExample && (
              <div className="omb-confirm">
                <span>
                  Loading <b>{confirmExample.title}</b> replaces the words and the sound
                  description you have now.
                </span>
                <span className="omb-confirmbtns">
                  <button type="button" className="go" onClick={() => loadExample(confirmExample)}>
                    Replace it
                  </button>
                  <button type="button" onClick={() => setConfirmExample(null)}>Keep mine</button>
                </span>
              </div>
            )}
            <p className="omb-hint">
              <b>The bracket tags are the song structure.</b> The words set the mood, but these
              decide the shape. Tap one to add it.
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

            <button type="button" className="omb-shape" onClick={addWholeShape}>
              <b>Lay out a whole song</b>
              <span>{SONG_SHAPE.join(' · ').toLowerCase()}</span>
            </button>

            {tooManyParts && (
              <p className="omb-warn">
                {tags.length} parts in {seconds} seconds is more than will fit. A part needs
                15 to 20 seconds to be music. Either make it longer or cut parts.
              </p>
            )}

            <GrowBox className="omb-sheet" minRows={18} value={lyrics} spellCheck
                     placeholder={'[Verse]\nWrite your words here, or pull them in from Songwriter.'}
                     onChange={(e) => setLyrics(e.target.value)} />
          </div>
        </section>

        <div className="omb-cols">

          <section className="omb-card">
            <header>
              <h2>The sound</h2>
              <span className="omb-cost">{COUNTS.genres} genres · {COUNTS.moods} moods · {COUNTS.voices} voices</span>
            </header>
            <div className="omb-body">
              <p className="omb-hint omb-counts">
                Every genre you pick brings its own real instruments into the description below.
              </p>

              {/* Five of each, blended. The instruments of every genre picked go
                  into the caption together, see mergedKit. */}
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

                {/* Three anonymous grey boxes before this: you could not tell
                    which one wanted the tempo and which one wanted the singer.
                    They are named now, and each one says what belongs in it. */}
                {CAPTION_PARTS.map(({ key, label, hint }) => (
                  <label key={key} className="omb-capfield">
                    <span className="nm">{label}</span>
                    <span className="sub">{hint}</span>
                    <GrowBox
                      minRows={key === 'globalMeta' ? 4 : 3}
                      value={caption[key]}
                      spellCheck={false}
                      onChange={(e) => {
                        setCaptionEdited(true);
                        setCaption((c) => ({ ...c, [key]: e.target.value }));
                      }}
                    />
                  </label>
                ))}
              </div>

              {/* THE WHOLE THING, EXACTLY AS IT GOES OUT.
                  He asked to see the whole prompt written out, and until now no
                  screen in the app showed what actually gets sent: the three
                  boxes are joined by blank lines and the lyrics ride along
                  beside them. Read-only on purpose, because the editable copy is
                  right above it, and one Copy button because this is also what
                  you paste into Suno or anywhere else. */}
              <div className="omb-whole">
                <div className="omb-cap">
                  <span>The whole prompt, exactly as it is sent</span>
                  <button type="button" className="omb-mini" onClick={copyWholePrompt}>
                    {copied ? 'Copied' : 'Copy it'}
                  </button>
                </div>
                <pre className="omb-wholetext">{wholePrompt}</pre>
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

                <div className="omb-knob" data-demo="omb-takes">
                  <div className="nm">Takes at once</div><div className="val">{takeCount}</div>
                  <div className="sub">
                    {engine === 'kaggle'
                      ? 'Different versions of the same song. Kaggle has two graphics cards, so two of them take about as long as one.'
                      : 'Different versions, pick the one you like'}
                  </div>
                  <input type="range" min="1" max="4" value={takeCount}
                         onChange={(e) => setTakeCount(Number(e.target.value))} />
                </div>

                <div className="omb-knob">
                  <div className="nm">{seeds.length > 1 ? 'Take numbers' : 'Take number'}</div>
                  <div className="omb-seedrow">
                    <span className="val">{seed.toLocaleString('en-US')}</span>
                    <button type="button" className={`omb-dice ${rolling ? 'rolling' : ''}`}
                            onClick={roll}
                            aria-label={seeds.length > 1 ? 'Roll new take numbers' : 'Roll a new take number'}>🎲</button>
                  </div>
                  {seeds.length > 1 && (
                    <ol className="omb-seedlist">
                      {seeds.map((n, i) => (
                        <li key={n}><span>take {i + 1}</span><b>{n.toLocaleString('en-US')}</b></li>
                      ))}
                    </ol>
                  )}
                  <div className="sub">
                    {seeds.length > 1
                      ? `Rolling gives all ${seeds.length} takes new numbers. Same words, different performances. Each one is saved with its song.`
                      : 'Same words, new number, different performance. Saved with the song.'}
                  </div>
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
