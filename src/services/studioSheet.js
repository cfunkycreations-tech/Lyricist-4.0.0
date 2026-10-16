/**
 * THE SONG AS BLACK HOLE STUDIOS READS IT.
 *
 * Songwriter's section names are written for people: "Bridge (AI Refined)",
 * "Ghost Rider Verse (Clutch)". Sent as headings they reach MiniMax as junk
 * tags, and a long one is not read as a section at all, so it gets sung. Each
 * heading becomes the plain part it is ([Verse 1], [Chorus], [Bridge]), and a
 * section with no words in it is left out rather than sent as an empty part.
 */
const PART = /^(intro|verse|pre-?chorus|post-?chorus|chorus|hook|bridge|breakdown|solo|instrumental|outro|refrain|interlude|drop)\b/i;
const BY_TYPE = { intro: 'Intro', verse: 'Verse', 'pre-chorus': 'Pre-Chorus', chorus: 'Chorus', hook: 'Hook', bridge: 'Bridge', outro: 'Outro' };

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function studioHeading(section) {
  const bare = String(section?.name || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (PART.test(bare) && bare.length <= 24) return titleCase(bare);
  return BY_TYPE[section?.type] || 'Verse';
}

export function studioSheet(sections) {
  return (sections || [])
    .map((s) => {
      const lines = (s.lines || []).map((l) => String(l?.text || '').trim());
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      while (lines.length && !lines[0]) lines.shift();
      return lines.length ? `[${studioHeading(s)}]\n${lines.join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}
