import React from 'react';
import {
  PenLine, Orbit, Radar, Hammer, Grid3x3, Users, Repeat, AudioLines, Mic, Piano, Gauge, Scissors,
  BookOpen, Library, BookA, Blocks, StickyNote, Settings2, Drum, Guitar, Activity, Layers, Sparkles, Ghost, Mic2,
} from 'lucide-react';

/**
 * ICONS. Line icons, one weight, no emoji.
 *
 * Chris, 2026-09-15: the emoji made the app look "kid/childish"; he wants "top
 * tier gui with professional icons". Data files (the tab list, the stemmer's
 * stems, the tour cards) are plain .js, so they name an icon with a string and
 * whatever renders them draws it through <Glyph name="…">. Inline labels in JSX
 * use <Icon i={Component}> so the size, stroke and baseline match everywhere.
 */
const MAP = {
  'pen-line': PenLine,
  orbit: Orbit,
  radar: Radar,
  hammer: Hammer,
  grid: Grid3x3,
  users: Users,
  repeat: Repeat,
  'audio-lines': AudioLines,
  mic: Mic,
  'mic-2': Mic2,
  piano: Piano,
  gauge: Gauge,
  scissors: Scissors,
  'book-open': BookOpen,
  library: Library,
  'book-a': BookA,
  blocks: Blocks,
  'sticky-note': StickyNote,
  settings: Settings2,
  drum: Drum,
  guitar: Guitar,
  activity: Activity,
  layers: Layers,
  sparkles: Sparkles,
  ghost: Ghost,
};

export function Glyph({ name, size = 16, strokeWidth = 1.6, className }) {
  const C = MAP[name];
  if (!C) return null;
  return <C size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
}

/** An icon sitting in front of a text label. */
export function Icon({ i: C, size = 15, strokeWidth = 1.75 }) {
  if (!C) return null;
  return <C size={size} strokeWidth={strokeWidth} className="ico" aria-hidden="true" />;
}
