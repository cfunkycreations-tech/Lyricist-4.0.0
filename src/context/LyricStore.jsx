import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { registerDemoSnapshot } from '../services/demoSafety.js';
import {
  toBlackHoleGenres, toSongwriterGenres, toBlackHoleMoods, toSongwriterMoods,
} from '../services/styleBridge.js';

const LyricStoreContext = createContext();

export const genres = [
  'Hip-Hop / Rap',
  'R&B / Soul',
  'Pop',
  'Trap',
  'Drill',
  'Country',
  'Rock',
  'Gospel / Gospel Rap',
  'Afrobeats',
  'Reggae / Dancehall',
  'Lo-Fi / Boom Bap',
  'Alternative',
  'EDM / Dance',
  'Jazz / Neo-Soul',
  'Latin / Reggaeton',
  'Metal / Heavy Rock',
  'Punk / Pop Punk',
  'Indie Pop / Bedroom Pop',
  'Folk / Americana',
  'Blues / Soul Blues',
  'Funk',
  'K-Pop',
  'Phonk',
  'Conscious / Spoken Word',
  'Grunge / 90s Alt',
  'Hyperpop / Glitchcore',
  'Corridos / Regional Mexican',
  'Synthwave / Retrowave'
];

export const subgenres = {
  'Hip-Hop / Rap': ['East Coast', 'West Coast', 'Southern Rap', 'Boom Bap', 'Conscious Rap'],
  'R&B / Soul': ['Contemporary R&B', 'Neo-Soul', 'Classic Soul', 'Motown', 'Quiet Storm'],
  'Pop': ['Synthpop', 'Electropop', 'Bubblegum Pop', 'Indie Pop', 'Dark Pop'],
  'Trap': ['Melodic Trap', 'Rage', 'Dark Trap', 'Plugg', 'Ethereal Trap'],
  'Drill': ['UK Drill', 'Brooklyn Drill', 'Chicago Drill', 'Sample Drill'],
  'Country': ['Bro-Country', 'Outlaw Country', 'Bluegrass', 'Country Pop', 'Traditional Country'],
  'Rock': ['Classic Rock', 'Hard Rock', 'Psychedelic Rock', 'Arena Rock', 'Progressive Rock'],
  'Gospel / Gospel Rap': ['Contemporary Gospel', 'Urban Contemporary', 'Gospel Rap', 'Traditional Gospel'],
  'Afrobeats': ['Afro-fusion', 'Amapiano', 'Alté', 'Afrobeats Pop'],
  'Reggae / Dancehall': ['Roots Reggae', 'Lovers Rock', 'Dancehall', 'Dub', 'Reggae Fusion'],
  'Lo-Fi / Boom Bap': ['Chillhop', 'Jazz Hop', 'Vaporwave', 'Boom Bap Rap'],
  'Alternative': ['Alt Rock', 'Post-Punk', 'Shoegaze', 'Dream Pop'],
  'EDM / Dance': ['House', 'Techno', 'Drum & Bass', 'Dubstep', 'Future Bass'],
  'Jazz / Neo-Soul': ['Bebop', 'Jazz Fusion', 'Vocal Jazz', 'Acid Jazz'],
  'Latin / Reggaeton': ['Urbano', 'Bachata', 'Salsa', 'Latin Pop', 'Trap Latino'],
  'Metal / Heavy Rock': ['Thrash Metal', 'Metalcore', 'Nu Metal', 'Doom Metal', 'Death Metal'],
  'Punk / Pop Punk': ['Skate Punk', 'Pop Punk', 'Post-Hardcore', 'Emo Punk'],
  'Indie Pop / Bedroom Pop': ['Twee Pop', 'Dream Pop', 'Bedroom Pop', 'Jangle Pop'],
  'Folk / Americana': ['Contemporary Folk', 'Singer-Songwriter', 'Indie Folk', 'Alt-Country'],
  'Blues / Soul Blues': ['Chicago Blues', 'Delta Blues', 'Texas Blues', 'Electric Blues'],
  'Funk': ['P-Funk', 'Synth-Funk', 'Funk Rock', 'Disco Funk'],
  'K-Pop': ['Dance-Pop K-Pop', 'Hip-Hop K-Pop', 'R&B K-Pop', 'Ballad K-Pop'],
  'Phonk': ['Drift Phonk', 'Rare Phonk', 'Cowbell Phonk', 'Shadow Phonk'],
  'Conscious / Spoken Word': ['Poetry Slam', 'Slam Rap', 'Narrative Spoken Word', 'Acoustic Poetic'],
  'Grunge / 90s Alt': ['Seattle Grunge', 'Post-Grunge', 'Alternative Grunge', 'Noise Rock'],
  'Hyperpop / Glitchcore': ['Glitchcore', 'Hyper-Rave', 'Bubblegum Bass', 'Cyberpunk'],
  'Corridos / Regional Mexican': ['Corridos Tumbados', 'Corridos Belicos', 'Mariachi', 'Banda'],
  'Synthwave / Retrowave': ['Outrun', 'Dreamwave', 'Darksynth', 'Vaporwave Retrowave']
};

export const moods = [
  // Happy / high-energy
  'Happy', 'Joyful', 'Euphoric (overjoyed)', 'Ecstatic (thrilled)', 'Celebratory',
  'Anthemic (big and crowd-rousing)', 'Uplifting', 'Hopeful', 'Optimistic', 'Grateful',
  // Strong / confident
  'Confident', 'Empowered', 'Triumphant (victorious)', 'Determined', 'Defiant (standing your ground)',
  'Rebellious', 'Aggressive', 'Angry', 'Vengeful', 'Gritty (raw and tough)',
  // Dark / tense
  'Dark', 'Brooding (moody and heavy)', 'Ominous (something bad coming)', 'Haunting', 'Tense',
  'Anxious', 'Paranoid', 'Restless',
  // Sad / down
  'Sad', 'Heartbroken', 'Mournful (grieving)', 'Somber (serious and gloomy)', 'Lonely', 'Lost',
  'Melancholic (gently sad)', 'Nostalgic (missing the past)', 'Wistful (longing)', 'Bittersweet',
  'Reflective (thinking deeply)', 'Vulnerable (open and exposed)',
  // Love / intimate
  'Tender', 'Romantic', 'Sensual', 'Sultry (hot and slow)', 'Lustful', 'Flirtatious',
  // Light / easygoing
  'Playful', 'Whimsical (quirky and fun)', 'Carefree', 'Chill / Laid-Back', 'Peaceful', 'Serene (calm)',
  'Dreamy', 'Hypnotic (trance-like)',
  // Deep / searching
  'Spiritual', 'Cathartic (releasing big emotion)', 'Yearning (deep wanting)', 'Moody', 'Liberated (set free)',
  'Motivational'
];

export const prebuiltTemplates = [
  { id: 'classic', label: 'Classic: Verse → Chorus → Verse → Chorus', structure: ['verse', 'chorus', 'verse', 'chorus'] },
  { id: 'radio-standard', label: 'Radio standard: Verse → Chorus → Verse → Chorus → Bridge → Chorus', structure: ['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'] },
  { id: 'full-pop', label: 'Full pop song: Verse → Pre-Chorus → Chorus (×2) → Bridge → Chorus', structure: ['verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'bridge', 'chorus'] },
  { id: 'hip-hop', label: 'Hip-hop: Intro → Verse → Hook → Verse → Hook → Bridge → Hook → Outro', structure: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'] },
  { id: 'hook-driven', label: 'Hook-driven: Hook → Verse → Hook → Verse → Hook', structure: ['chorus', 'verse', 'chorus', 'verse', 'chorus'] },
  { id: 'story-first', label: 'Story-first: Verse → Verse → Chorus', structure: ['verse', 'verse', 'chorus'] },
  { id: 'aaba', label: 'AABA (jazz / standard): Verse → Verse → Bridge → Verse', structure: ['verse', 'verse', 'bridge', 'verse'] },
  { id: 'verse-prechorus-chorus', label: 'Simple: Verse → Pre-Chorus → Chorus', structure: ['verse', 'pre-chorus', 'chorus'] },
  { id: 'verse-chorus', label: 'Short: Verse → Chorus', structure: ['verse', 'chorus'] },
  { id: 'through-composed', label: 'Through-composed: Intro → Verse → Pre-Chorus → Chorus → Bridge → Outro (no repeats)', structure: ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'] },
  { id: 'verse-only', label: 'Just one Verse (16 bars)', structure: ['verse'] },
  { id: 'hook-only', label: 'Just the Hook / Chorus', structure: ['chorus'] },
  { id: 'freestyle', label: 'Freestyle (no set structure)', structure: ['freestyle'] }
];

export const sectionLabels = {
  intro: 'Intro',
  verse: 'Verse',
  'pre-chorus': 'Pre-Chorus',
  chorus: 'Chorus/Hook',
  bridge: 'Bridge',
  outro: 'Outro',
  freestyle: 'Freestyle'
};

export const sectionDefaultLines = {
  intro: 4,
  verse: 16,
  'pre-chorus': 8,
  chorus: 8,
  bridge: 8,
  outro: 4,
  freestyle: 16
};

export const rhymeSchemes = [
  'Free — no set rhyme pattern',
  'AABB — lines 1&2 rhyme, then 3&4 rhyme (couplets)',
  'ABAB — every other line rhymes (cross rhyme)',
  'ABBA — outer two rhyme, inner two rhyme (enclosed)',
  'AAAA — every line rhymes the same (monorhyme)',
  'AAA — three rhyming lines in a row (triplet)',
  'ABA BCB — rhymes link line to line (chain rhyme)',
  'AABBA — the limerick pattern',
  'Perfect rhyme — exact matches (cat / hat)',
  'Slant / near rhyme — close but not exact (home / come)',
  'Internal rhyme — rhymes WITHIN a line, not just at the end',
  'Multisyllable rhyme — whole phrases rhyme (rap-style stacks)',
  'Identical rhyme — same word used to rhyme on purpose',
  'Eye rhyme — looks like it rhymes but doesn’t (love / move)',
  'Assonance — matching vowel sounds (lake / fade)',
  'Consonance — matching consonant sounds (blank / think)',
  'Alliteration — same starting sound (big bad bear)',
  'Free verse — no rhyme at all, like spoken poetry'
];

export const rapFlowPatterns = [
  'Straight 16s — classic steady pace, on beat',
  'Steady pocket — relaxed, locked-in rhythm',
  'Double-time — fast, rapid-fire syllables',
  'Half-time — slowed down, lots of space',
  'Triplet flow — three quick beats per step (Migos/trap bounce)',
  'Choppy / staccato — short, punchy, clipped words',
  'Melodic flow — sing-songy, almost humming',
  'Sing-rap — halfway between rapping and singing',
  'Boom-bap pocket — heavy hits on the snare beats',
  'Off-beat / syncopated — slips around the beat, conversational',
  'Drill — sliding, off-kilter timing',
  'Trap flow — modern, bouncy, hi-hat driven',
  'Old-school — 80s/90s steady cadence',
  'Rapid-fire / chopper — extremely fast bursts',
  'Conversational — like talking, easygoing',
  'Laid-back — sits just behind the beat, unhurried',
  'Storytelling — paced like telling a story',
  'Stacked multis — packed multi-syllable rhymes throughout'
];

/**
 * Hard ceiling on Creativity / temperature.
 *
 * Past roughly this point a model stops writing and starts sampling from the
 * tail of its own distribution: half-words, fused tokens, stray Cyrillic and
 * Korean, programming vocabulary in a love song. It does not read as "wilder",
 * it reads as broken. The slider used to run to 2.0 labelled "Wildly Creative",
 * which is an invitation to wreck a song, and it did exactly that.
 */
export const MAX_TEMPERATURE = 1.1;

// Exported so Settings' "Reset to default" resets to THESE values. It used to
// carry its own hand-copied duplicate of this object, which had already drifted
// — it reset the model to 'openrouter/free' and the stemmer to 'offline'.
export const DEFAULT_CONFIG = {
  openRouterApiKey: '',

  // Black Hole Studios. The free music server gives anonymous users only a few
  // minutes of GPU a day, and its own error message says the fix outright:
  // "Authenticate with a Hugging Face token for more quota". A free account is
  // enough. Entirely optional — songs still get made without it, just fewer.
  huggingFaceToken: '',
  // Where songs get made: 'cloud' | 'local'. Cloud is the default because it is
  // both the fastest AND the free one, which is not the usual trade.
  musicEngine: 'cloud',

  // PRISM: rotates every colour in the app, the moving background and the
  // interface together. 0 is emerald and violet, which is home.
  prism: 0,

  // A specific instruction-tuned text model, NOT `openrouter/free`. That router
  // picks whichever free model is available, and the free pool includes coding
  // agents, a content-safety classifier, and audio/vision models — none of which
  // can write a verse. Never default to a router for creative work.
  model: 'google/gemma-4-31b-it:free',
  temperature: 0.75,
  maxTokens: 2000,
  fusionEnabled: false,
  fusionModels: [],

  // Song Forge (Gemini Interactions API — text + Nano Banana cover art)
  googleApiKey: '',
  geminiTextModel: 'gemini-3.5-flash',
  // MUST carry the provider prefix. This shipped as bare 'gemini-3.1-flash-image',
  // which is not a model id OpenRouter can route, so every Song Forge cover-art
  // request 404'd. The saved value is truthy, so it also beat the code's fallback,
  // and that fallback was a renamed id that no longer existed either. Result: no
  // working path to cover art at all. Verified live before changing.
  geminiImageModel: 'google/gemini-3.1-flash-image',
  useFlexTier: true,
  imageAspectRatio: '1:1',
  imageSize: '2K',
  customArtStyle: '',

  // Stemmer engine:
  //  'offline' — DSP spectral split on the user's own CPU/GPU (DEFAULT)
  //  'local'   — true 6-stem AI (Demucs), needs Python 3.9+ and a one-time install
  //  'cloud'   — Demucs on Replicate (needs a paid API key)
  //
  // This defaulted to 'local', and that is a setup wall standing where the
  // front door should be. Local Demucs needs the user to go and install Python
  // from python.org, then sit through a multi-gigabyte Torch download. Chris
  // has a dev machine and it was still a pain; someone who downloaded a
  // songwriting app to split a track is not going to install a language
  // runtime, and defaulting to that mode meant their first visit to this tab
  // was a list of things to go and do.
  //
  // 'offline' works on every machine with nothing installed, no key, no
  // account, and no network — rougher stems, but instantly. Local AI is still
  // right there as an opt-in upgrade for anyone who wants true separation.
  // Advertise the path that works for everyone; sell the upgrade second.
  stemmerMode: 'offline', // 'offline' | 'local' | 'cloud'
  // Offline processor: 'auto' tries the GPU first and falls back to the CPU if
  // the GPU is missing or runs out of memory; 'gpu' / 'cpu' force one path.
  stemmerDevice: 'auto', // 'auto' | 'gpu' | 'cpu'
  replicateApiKey: '',
};

export const LyricStoreProvider = ({ children }) => {
  const [config, setConfigState] = useState(() => {
    const saved = localStorage.getItem('lyricistConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // DO NOT OVERWRITE THE USER'S MODEL HERE.
        //
        // This used to force `model = 'openrouter/free'` on anyone who hadn't
        // been migrated yet. If you had chosen and paid for a model, an update
        // silently swapped you onto a router — and `openrouter/free` routes to
        // whatever free model is up, a pool that includes three coding agents
        // and a content-safety classifier. Asking a coding agent for a chorus
        // is how a song ends up full of "HTML", "GET", "lambda" and "getters".
        // Chris hit exactly that and reasonably believed he was still on the
        // model he picked. A silent change to someone's settings is a bug.
        parsed.migratedToFreeRouter = true;
        // Bring a saved temperature back under the ceiling. Anything above ~1.1
        // samples from the tail of the distribution and the output degenerates
        // — a song comes back with two good sections and then subword salad.
        // The slider used to run to 2.0 and call it "Wildly Creative", so a
        // saved 1.2 is the app's fault, not the user's. Correct it, and say so
        // in the console rather than changing it behind their back in silence.
        if (typeof parsed.temperature === 'number' && parsed.temperature > MAX_TEMPERATURE) {
          console.warn(
            `[Lyricist] Creativity was saved at ${parsed.temperature}, which produces garbled lyrics. `
            + `Brought down to ${MAX_TEMPERATURE}. See Settings → Creativity.`
          );
          parsed.temperature = MAX_TEMPERATURE;
        }
        // Repair a cover-art model id that cannot possibly work. Anything with
        // no "provider/" prefix is not routable on OpenRouter, and every install
        // has the bare 'gemini-3.1-flash-image' saved, so Song Forge could never
        // make art. Changing a BROKEN value is a fix; changing a working choice
        // would be the bug described above, so this only touches ids that are
        // structurally invalid.
        if (typeof parsed.geminiImageModel === 'string'
            && parsed.geminiImageModel.trim()
            && !parsed.geminiImageModel.includes('/')) {
          console.warn(
            `[Lyricist] Cover-art model was saved as "${parsed.geminiImageModel}", which is not a `
            + `routable OpenRouter id. Reset to "${DEFAULT_CONFIG.geminiImageModel}". See Settings.`
          );
          parsed.geminiImageModel = DEFAULT_CONFIG.geminiImageModel;
        }
        // A ROUTER SAVED AS THE WRITING MODEL IS A BROKEN VALUE, not a choice.
        // `openrouter/free` routes each request to whatever free model is up,
        // and that pool carries coding agents — which is how Chris's Ghost
        // Rider run died on "invalid content from cohere/north-mini-code:free",
        // naming a model he never picked. Same rule as the cover-art repair
        // above: only ids that cannot work for this job are touched.
        if (typeof parsed.model === 'string' && /^openrouter\//i.test(parsed.model.trim())) {
          console.warn(
            `[Lyricist] The writing model was saved as "${parsed.model}", a router that picks any free `
            + `model including coding agents. Set to "${DEFAULT_CONFIG.model}". Change it in Settings.`
          );
          parsed.model = DEFAULT_CONFIG.model;
        }
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {
        console.warn('[Lyricist] Saved settings were unreadable and have been reset to defaults.', e);
      }
    }
    return { ...DEFAULT_CONFIG, migratedToFreeRouter: true };
  });

  const [lyrics, setLyricsState] = useState(() => {
    // A half-written localStorage value (quota hit mid-write, a crash during
    // save, or anything that edits it by hand) used to throw straight out of
    // this initializer. That throw happens while the provider is being
    // constructed, so React never mounts anything and the whole app is a blank
    // window with no way back short of clearing site data. One bad key must not
    // be able to brick the app: keep a copy of the damaged value under a
    // separate key so the words are still recoverable, and start empty.
    const saved = localStorage.getItem('lyricistLyrics');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
      console.warn('[Lyricist] Saved lyrics were not a list; starting with an empty sheet.');
    } catch (e) {
      console.warn('[Lyricist] Saved lyrics were corrupt. A copy is kept at "lyricistLyrics.corrupt".', e);
      try { localStorage.setItem('lyricistLyrics.corrupt', saved); } catch { /* nothing more we can do */ }
    }
    return [];
  });

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Global "Tips" switch — when ON, every help bubble in the app shows.
  // Defaults ON for first-time songwriters; remembered between sessions.
  const [tipsEnabled, setTipsEnabled] = useState(() => {
    const saved = localStorage.getItem('lyricistTipsEnabled');
    return saved === null ? true : saved === 'true';
  });

  // Ghost Demo optional — when OFF, hide Play Demo (feature fully opted out).
  // Defaults ON so people can discover it; flip Off anytime. Remembered.
  const [ghostDemoEnabled, setGhostDemoEnabled] = useState(() => {
    const saved = localStorage.getItem('lyricistGhostDemoEnabled');
    return saved === null ? true : saved === 'true';
  });

  // Form selections.
  //
  // GENRE, SUBGENRE AND MOOD ARE LISTS NOW, up to five each, blended into one
  // song. Chris, 2026-08-19: *"I wanna be able to choose more than one genre. I
  // want it to go up to five genres mixed into one... and moods, by the way."*
  //
  // They are stored as arrays and ALSO read back as single values, because
  // `store.genre` is used all over the app — Song Forge's summary and its
  // Surprise Me, the Artist Analyzer, the demo snapshot, every prompt builder.
  // Turning those into a breaking change to add a feature is how you spend a
  // build fixing things that were not broken. So the array is the truth,
  // `genre` is its LEAD (the first pick), and `setGenre(x)` still means "make it
  // just x". Anything that wants the whole blend asks for `genreList`.
  // NOTHING IS PICKED UNTIL SOMEBODY PICKS IT.
  //
  // Chris, 2026-09-11: *"as soon as you open this tab those names need to
  // disappear... I don't want the genre name on there until you pick it from
  // the dropdown."* These used to open on Hip-Hop / Rap, East Coast and Happy,
  // and a prefilled answer is not a default, it is a decision made for you while
  // you were not looking. Somebody who never touches the genre picker had a
  // hip-hop song chosen for them; worse, somebody who MEANT to choose could not
  // tell which of those three words was theirs. Empty reads as a question, which
  // is what it is. The pickers show the word Genre, Subgenre and Mood until they
  // are answered, and every prompt builder already copes with an unset one.
  const [genreList, setGenreListRaw] = useState([]);
  const [subgenreList, setSubgenreListRaw] = useState([]);
  const [moodList, setMoodListRaw] = useState([]);

  /**
   * THE SAME CHOICES, IN BLACK HOLE STUDIOS' VOCABULARY.
   *
   * Chris, 2026-09-11: *"if one setting is one way in one tab it needs to be
   * the same in all the tabs."* Black Hole Studios picks a SOUND out of the
   * three-hundred-entry taxonomy (so the caption can name the real instruments)
   * while Songwriter picks a broad WRITING genre plus a subgenre. Same decision,
   * two dialects — so both live here and styleBridge translates whenever either
   * side moves. Setting one writes the other; nothing polls and nothing loops,
   * because the translation happens in the setter rather than in an effect.
   */
  const [bhGenreList, setBhGenreListRaw] = useState([]);
  const [bhMoodList, setBhMoodListRaw] = useState([]);
  // Voice has no Songwriter counterpart — it only means something once a machine
  // is singing — so it is stored, not translated.
  const [voiceList, setVoiceList] = useState([]);

  const asList = (next, prev) => (typeof next === 'function' ? next(prev) : next) || [];

  // The subgenres that still belong to a genre list.
  const keepSubgenres = (genresNow, subs) => {
    const pool = genresNow.flatMap((g) => subgenres[g] || []);
    return subs.filter((s) => pool.includes(s));
  };
  const setGenreList = (next) => {
    const list = asList(next, genreList);
    // Drop the orphaned subgenres HERE, before translating. The prune effect
    // further down clears them from Songwriter a tick later, but Black Hole
    // Studios had already been translated with them: Hip-Hop / Rap + West Coast
    // swapped for R&B / Soul left G-funk sitting next to Soul over there.
    const subs = keepSubgenres(list, subgenreList);
    setGenreListRaw(list);
    if (subs.length !== subgenreList.length) setSubgenreListRaw(subs);
    setBhGenreListRaw(toBlackHoleGenres(list, subs));
  };
  const setSubgenreList = (next) => {
    const list = asList(next, subgenreList);
    setSubgenreListRaw(list);
    setBhGenreListRaw(toBlackHoleGenres(genreList, list));
  };
  const setMoodList = (next) => {
    const list = asList(next, moodList);
    setMoodListRaw(list);
    setBhMoodListRaw(toBlackHoleMoods(list));
  };
  const setBhGenreList = (next) => {
    const list = asList(next, bhGenreList);
    setBhGenreListRaw(list);
    const { genreList: g, subgenreList: s } = toSongwriterGenres(list);
    setGenreListRaw(g);
    setSubgenreListRaw(s);
  };
  const setBhMoodList = (next) => {
    const list = asList(next, bhMoodList);
    setBhMoodListRaw(list);
    setMoodListRaw(toSongwriterMoods(list));
  };

  /**
   * ALL THREE PICKS AT ONCE, so a tag never lands half-translated.
   *
   * Each setter above reads the other two lists out of the render it was made
   * in. That is right when a person clicks one picker at a time, and wrong the
   * moment something sets genre AND subgenre in the same tick: the second call
   * translates against the genre list as it was BEFORE the first call, and
   * Black Hole Studios ends up describing half the choice. The pickers are
   * unaffected — a click is one pick — but anything tagging a song
   * automatically sets all three together, so it goes through here, where the
   * translation happens once against the values actually being set.
   *
   * See services/songTags.js, which is the only caller and the reason this
   * exists: Chris, 2026-09-15, on the Ghost writing songs without ever
   * checking the boxes.
   */
  const setStylePicks = ({ genres: g, subgenres: s, moods: m } = {}) => {
    const nextG = g === undefined ? genreList : (g || []);
    const nextS = keepSubgenres(nextG, s === undefined ? subgenreList : (s || []));
    const nextM = m === undefined ? moodList : (m || []);
    setGenreListRaw(nextG);
    setSubgenreListRaw(nextS);
    setMoodListRaw(nextM);
    setBhGenreListRaw(toBlackHoleGenres(nextG, nextS));
    setBhMoodListRaw(toBlackHoleMoods(nextM));
  };

  const genre = genreList[0] || '';
  const subgenre = subgenreList[0] || '';
  const mood = moodList[0] || '';
  const setGenre = (g) => setGenreList(g ? [g] : []);
  const setSubgenre = (g) => setSubgenreList(g ? [g] : []);
  const setMood = (m) => setMoodList(m ? [m] : []);
  const [structureTemplate, setStructureTemplate] = useState(prebuiltTemplates[0].id);
  const [customStructure, setCustomStructure] = useState(prebuiltTemplates[0].structure);
  const [topic, setTopic] = useState('');
  const [artistRef, setArtistRef] = useState('');
  const [notes, setNotes] = useState('');

  // Rhyme configurations
  const [rhymeScheme, setRhymeScheme] = useState(rhymeSchemes[0]);
  const [rhymeDensity, setRhymeDensity] = useState('balanced'); // sparse | balanced | dense
  const [flowPattern, setFlowPattern] = useState(rapFlowPatterns[0]);
  const [cadenceNotes, setCadenceNotes] = useState('');
  const [hookFirstMode, setHookFirstMode] = useState(false);

  // Line counts per section
  const [sectionLineCounts, setSectionLineCounts] = useState({});

  // The subgenres that are legal for whatever genres are picked. With five
  // genres in play the pool is the union of all of them, in pick order, so the
  // lead genre's subgenres come first.
  const subgenrePool = genreList.flatMap((g) => subgenres[g] || []);

  useEffect(() => {
    // Drop any subgenre whose genre is no longer picked. This used to hard-reset
    // to the first subgenre of the one genre; with a blend, throwing away a
    // still-valid pick because a DIFFERENT genre changed would be maddening.
    //
    // IT NO LONGER FILLS THE GAP EITHER. Landing on subgenre one of whatever
    // genre you just chose is the same unasked-for decision the empty defaults
    // exist to get rid of — you would pick Country and be handed Bro-Country.
    // Empty means empty; the picker says "Subgenre" until you answer it.
    setSubgenreListRaw((prev) => {
      const kept = prev.filter((sg) => subgenrePool.includes(sg));
      return kept.length === prev.length ? prev : kept;
    });
  }, [genreList]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('lyricistConfig', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('lyricistLyrics', JSON.stringify(lyrics));
  }, [lyrics]);

  useEffect(() => {
    localStorage.setItem('lyricistTipsEnabled', String(tipsEnabled));
  }, [tipsEnabled]);

  useEffect(() => {
    localStorage.setItem('lyricistGhostDemoEnabled', String(ghostDemoEnabled));
  }, [ghostDemoEnabled]);

  // The song itself lives here, so this one registration covers every tab that
  // writes lyrics — Songwriter, Ghost Rider, Song Forge. The demo really does
  // generate a song and drop it in; without this it would land on top of yours.
  const demoRef = useRef(null);
  demoRef.current = {
    lyrics, undoStack, redoStack,
    genreList, subgenreList, moodList,
    bhGenreList, bhMoodList, voiceList,
    genre, subgenre, mood, structureTemplate, customStructure,
    topic, artistRef, notes,
    rhymeScheme, rhymeDensity, flowPattern, cadenceNotes, hookFirstMode,
    sectionLineCounts,
  };
  useEffect(() => registerDemoSnapshot('lyric-store', {
    snapshot: () => ({ ...demoRef.current }),
    restore: (s) => {
      if (!s) return;
      setLyricsState(s.lyrics);
      setUndoStack(s.undoStack);
      setRedoStack(s.redoStack);
      // Lists where a newer snapshot has them, single values where it does not,
      // so a session saved before the blend still restores.
      setGenreListRaw(s.genreList || [s.genre].filter(Boolean));
      // Genre drives a subgenre prune on the next tick, so put subgenres back after it.
      setTimeout(() => setSubgenreListRaw(s.subgenreList || [s.subgenre].filter(Boolean)), 0);
      setMoodListRaw(s.moodList || [s.mood].filter(Boolean));
      // Put the Black Hole Studios side back as it was rather than re-deriving
      // it: a snapshot taken while that tab held a sound Songwriter cannot name
      // (Gnawa, Qawwali) must come back as that sound, not as its nearest family.
      setBhGenreListRaw(s.bhGenreList || []);
      setBhMoodListRaw(s.bhMoodList || []);
      setVoiceList(s.voiceList || []);
      setStructureTemplate(s.structureTemplate);
      setCustomStructure(s.customStructure);
      setTopic(s.topic);
      setArtistRef(s.artistRef);
      setNotes(s.notes);
      setRhymeScheme(s.rhymeScheme);
      setRhymeDensity(s.rhymeDensity);
      setFlowPattern(s.flowPattern);
      setCadenceNotes(s.cadenceNotes);
      setHookFirstMode(s.hookFirstMode);
      setSectionLineCounts(s.sectionLineCounts);
    },
    hasWork: () => (demoRef.current.lyrics || []).some(
      (sec) => (sec.lines || []).some((l) => (l.text || '').trim())),
  }), []);

  const setConfig = (newConfig) => {
    setConfigState(newConfig);
  };

  const pushState = (newLyrics) => {
    setUndoStack(prev => [...prev, lyrics]);
    setRedoStack([]);
    setLyricsState(newLyrics);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(prevStack => prevStack.slice(0, -1));
    setRedoStack(prevStack => [...prevStack, lyrics]);
    setLyricsState(prev);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prevStack => prevStack.slice(0, -1));
    setUndoStack(prevStack => [...prevStack, lyrics]);
    setLyricsState(next);
  };

  const clearLyrics = () => {
    pushState([]);
  };

  const addSection = (type) => {
    const defaultLines = sectionDefaultLines[type] || 8;
    const initialLines = Array.from({ length: defaultLines }, () => ({
      text: '',
      locked: false,
      lockedWord: '',
      targetSyllables: 0,
      activeVariation: 'draft',
      variations: { draft: '', A: '', B: '', C: '' }
    }));

    const newSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      name: `${sectionLabels[type]} ${lyrics.filter(s => s.type === type).length + 1}`,
      lines: initialLines,
      adLibs: '',
      showAdLibs: false,
      readability: '',
      vocabRichness: 0,
      originality: null,
      clichés: []
    };
    pushState([...lyrics, newSection]);
  };

  const removeSection = (sectionId) => {
    pushState(lyrics.filter(s => s.id !== sectionId));
  };

  const reorderSections = (startIndex, endIndex) => {
    const result = Array.from(lyrics);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    pushState(result);
  };

  const updateSectionLyrics = (sectionId, text) => {
    const updated = lyrics.map(s => {
      if (s.id !== sectionId) return s;
      
      // Replace lines cleanly — no leftover A/B/C ghost variants
      const textLines = text.split('\n');
      const lines = textLines.map((txt, index) => {
        const existing = s.lines[index] || {};
        const cleaned = String(txt || '');
        return {
          text: cleaned,
          locked: existing.locked || false,
          lockedWord: existing.lockedWord || '',
          targetSyllables: existing.targetSyllables || 0,
          activeVariation: 'draft',
          variations: { draft: cleaned, A: '', B: '', C: '' }
        };
      });

      return { ...s, lines };
    });
    pushState(updated);
  };

  const updateLine = (sectionId, lineIndex, lineData) => {
    const updated = lyrics.map(s => {
      if (s.id !== sectionId) return s;
      const lines = [...s.lines];
      const prev = lines[lineIndex] || {};
      const merged = { ...prev, ...lineData };
      // If text is being set, force a clean single-draft line (kill A/B/C ghosts)
      if (Object.prototype.hasOwnProperty.call(lineData, 'text')) {
        const text = String(lineData.text ?? '').split('\n')[0] ?? '';
        merged.text = text;
        merged.activeVariation = 'draft';
        merged.variations = { draft: text, A: '', B: '', C: '' };
      }
      lines[lineIndex] = merged;
      return { ...s, lines };
    });
    pushState(updated);
  };

  const updateSectionMeta = (sectionId, meta) => {
    const updated = lyrics.map(s => {
      if (s.id !== sectionId) return s;
      return { ...s, ...meta };
    });
    pushState(updated);
  };

  const setFullLyrics = (newLyricsArray) => {
    pushState(newLyricsArray);
  };

  const getFullText = () => {
    return lyrics.map(s => {
      const secLines = s.lines.map(l => l.text || '').join('\n');
      return `[${s.name.toUpperCase()}]\n${secLines}`;
    }).join('\n\n');
  };

  return (
    <LyricStoreContext.Provider value={{
      config,
      setConfig,
      lyrics,
      setFullLyrics,
      clearLyrics,
      addSection,
      removeSection,
      reorderSections,
      updateSectionLyrics,
      updateLine,
      updateSectionMeta,
      getFullText,
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      
      // Form selections
      genre, setGenre,
      subgenre, setSubgenre,
      mood, setMood,
      // The blends. `genre`/`subgenre`/`mood` above stay the LEAD of each.
      genreList, setGenreList,
      subgenreList, setSubgenreList,
      moodList, setMoodList,
      subgenrePool,
      // The same picks in Black Hole Studios' vocabulary, kept in step by
      // styleBridge. Setting either side updates the other.
      bhGenreList, setBhGenreList,
      bhMoodList, setBhMoodList,
      // All three at once, translated in one pass. services/songTags.js uses
      // this so an automatic tag never lands half in one vocabulary.
      setStylePicks,
      voiceList, setVoiceList,
      structureTemplate, setStructureTemplate,
      customStructure, setCustomStructure,
      topic, setTopic,
      artistRef, setArtistRef,
      notes, setNotes,
      
      // Rhymes
      rhymeScheme, setRhymeScheme,
      rhymeDensity, setRhymeDensity,
      flowPattern, setFlowPattern,
      cadenceNotes, setCadenceNotes,
      hookFirstMode, setHookFirstMode,
      
      // Section sizes
      sectionLineCounts, setSectionLineCounts,

      // Global Tips / hover-help toggle
      tipsEnabled, setTipsEnabled,
      ghostDemoEnabled, setGhostDemoEnabled
    }}>
      {children}
    </LyricStoreContext.Provider>
  );
};

export const useLyricStore = () => useContext(LyricStoreContext);
