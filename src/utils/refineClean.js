/**
 * Strip AI fluff and force a clean replacement — never "old line + new line" stacks.
 * Kept in its own module to avoid TDZ / circular init issues in the bundle.
 */
export function cleanRefineOutput(raw, originalText = '') {
  let t = String(raw || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    .replace(
      /^(here'?s\s+(the\s+)?(refined|result|output|version)[:\s-]*|refined\s*(text|version)?[:\s-]*|output[:\s-]*)/i,
      ''
    )
    .trim();

  const origLines = String(originalText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let outLines = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+[\).:\-]\s*/, '').replace(/^[-*•]\s*/, ''))
    .filter(Boolean);

  if (origLines.length <= 1) {
    const orig = origLines[0] || String(originalText || '').trim();
    if (outLines.length === 0) return orig;
    if (outLines.length === 1) return outLines[0];
    const different = outLines.filter((l) => l.toLowerCase() !== orig.toLowerCase());
    return (different[different.length - 1] || outLines[outLines.length - 1] || orig).trim();
  }

  if (outLines.length >= origLines.length * 2) {
    outLines = outLines.slice(-origLines.length);
  } else if (outLines.length > origLines.length) {
    const firstHalf = outLines.slice(0, origLines.length);
    const sameAsOrig = firstHalf.every(
      (l, i) => l.toLowerCase() === (origLines[i] || '').toLowerCase()
    );
    outLines = sameAsOrig ? outLines.slice(-origLines.length) : outLines.slice(0, origLines.length);
  }

  return outLines.join('\n').trim();
}
