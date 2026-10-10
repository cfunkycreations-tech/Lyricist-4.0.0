/**
 * READ A STYLE DNA OUT OF WHATEVER THE MODEL SENT.
 *
 * Clean JSON, JSON in a code fence, JSON cut off mid-string by the token limit,
 * or five plain "RHYTHM: ..." lines: each gives back the same shape, as long as
 * it says something about the style. Null only when nothing usable is there.
 *
 *   { rhythm, rhymeDensity, imageClusters: [], emotionalTemp, cadenceNotes }
 */

const DENSITIES = ['sparse', 'balanced', 'dense'];

function shape(d) {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const images = (Array.isArray(d.imageClusters) ? d.imageClusters : String(d.imageClusters || '').split(/[;\n]|,(?![^(]*\))/))
    .map((s) => String(s).replace(/^[\s"'*-]+|[\s"'.]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const density = DENSITIES.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(String(d.rhymeDensity || ''))) || '';
  const temp = Number(String(d.emotionalTemp ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
  const out = {
    rhythm: text(d.rhythm),
    rhymeDensity: density,
    imageClusters: images,
    emotionalTemp: Number.isFinite(temp) ? Math.max(0, Math.min(100, Math.round(temp))) : null,
    cadenceNotes: text(d.cadenceNotes),
  };
  const said = [out.rhythm, out.rhymeDensity, out.cadenceNotes].filter(Boolean).length + (out.imageClusters.length ? 1 : 0);
  return said >= 2 ? out : null;
}

/** Fields one at a time, so a reply cut off at the end still gives the rest. */
function byField(t) {
  const str = (key) => t.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 'i'))?.[1]?.replace(/\\"/g, '"') || '';
  const list = t.match(/"imageClusters"\s*:\s*\[([\s\S]*?)(?:\]|$)/i)?.[1] || '';
  return {
    rhythm: str('rhythm'),
    rhymeDensity: str('rhymeDensity'),
    imageClusters: [...list.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
    emotionalTemp: t.match(/"emotionalTemp"\s*:\s*"?(\d+(?:\.\d+)?)/i)?.[1] ?? null,
    cadenceNotes: str('cadenceNotes'),
  };
}

/** The plain-lines answer: RHYTHM: / RHYME DENSITY: / IMAGES: / TEMPERATURE: / CADENCE: */
function byLines(t) {
  const line = (re) => t.match(new RegExp(`^[\\s*#-]*${re}[\\s*]*[:=-]\\s*(.+)$`, 'im'))?.[1]?.replace(/^\*+\s*|\s*\*+$/g, '').trim() || '';
  return {
    rhythm: line('rhythm'),
    rhymeDensity: line('rhyme\\s*density'),
    imageClusters: line('(?:images?|image\\s*clusters?|motifs?)'),
    emotionalTemp: line('(?:emotional\\s*)?temp(?:erature)?'),
    cadenceNotes: line('cadence(?:\\s*notes)?'),
  };
}

export function parseStyleDNA(raw) {
  const t = String(raw || '').replace(/\r/g, '');
  if (!t.trim()) return null;
  const start = t.indexOf('{');
  if (start >= 0) {
    const end = t.lastIndexOf('}');
    if (end > start) {
      try { const d = shape(JSON.parse(t.slice(start, end + 1))); if (d) return d; } catch { /* cut off or untidy: read it by field */ }
    }
    const d = shape(byField(t.slice(start)));
    if (d) return d;
  }
  return shape(byLines(t));
}
