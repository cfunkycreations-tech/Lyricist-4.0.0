import React, { createContext, useState, useEffect, useContext } from 'react';

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

const DEFAULT_CONFIG = {
  openRouterApiKey: '',
  model: 'openrouter/free',
  temperature: 0.75,
  maxTokens: 2000,
  fusionEnabled: false,
  fusionModels: [],

  // Song Forge (Gemini Interactions API — text + Nano Banana cover art)
  googleApiKey: '',
  geminiTextModel: 'gemini-3.5-flash',
  geminiImageModel: 'gemini-3.1-flash-image',
  useFlexTier: true,
  imageAspectRatio: '1:1',
  imageSize: '2K',
  customArtStyle: ''
};

export const LyricStoreProvider = ({ children }) => {
  const [config, setConfigState] = useState(() => {
    const saved = localStorage.getItem('lyricistConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Run migration only once to clear old default model, allowing manual settings overrides to persist
        if (!parsed.migratedToFreeRouter) {
          parsed.model = 'openrouter/free';
          parsed.migratedToFreeRouter = true;
        }
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {}
    }
    return { ...DEFAULT_CONFIG, migratedToFreeRouter: true };
  });

  const [lyrics, setLyricsState] = useState(() => {
    const saved = localStorage.getItem('lyricistLyrics');
    return saved ? JSON.parse(saved) : [];
  });

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Global "Tips" switch — when ON, every help bubble in the app shows.
  // Defaults ON for first-time songwriters; remembered between sessions.
  const [tipsEnabled, setTipsEnabled] = useState(() => {
    const saved = localStorage.getItem('lyricistTipsEnabled');
    return saved === null ? true : saved === 'true';
  });

  // Form selections
  const [genre, setGenre] = useState(genres[0]);
  const [subgenre, setSubgenre] = useState(subgenres[genres[0]][0]);
  const [mood, setMood] = useState(moods[0]);
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

  useEffect(() => {
    // Sync subgenre when genre changes
    if (subgenres[genre]) {
      setSubgenre(subgenres[genre][0]);
    }
  }, [genre]);

  useEffect(() => {
    localStorage.setItem('lyricistConfig', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('lyricistLyrics', JSON.stringify(lyrics));
  }, [lyrics]);

  useEffect(() => {
    localStorage.setItem('lyricistTipsEnabled', String(tipsEnabled));
  }, [tipsEnabled]);

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
      
      const textLines = text.split('\n');
      const lines = textLines.map((txt, index) => {
        const existing = s.lines[index] || {};
        return {
          text: txt,
          locked: existing.locked || false,
          lockedWord: existing.lockedWord || '',
          targetSyllables: existing.targetSyllables || 0,
          activeVariation: existing.activeVariation || 'draft',
          variations: existing.variations || { draft: txt, A: '', B: '', C: '' }
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
      lines[lineIndex] = { ...lines[lineIndex], ...lineData };
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
      const secLines = s.lines.map(l => {
        if (l.activeVariation === 'draft') return l.text;
        return l.variations[l.activeVariation] || l.text;
      }).join('\n');
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
      tipsEnabled, setTipsEnabled
    }}>
      {children}
    </LyricStoreContext.Provider>
  );
};

export const useLyricStore = () => useContext(LyricStoreContext);
