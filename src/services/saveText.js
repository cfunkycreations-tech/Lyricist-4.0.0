/**
 * SAVE IT, BECAUSE CLOSING THE APP WIPES IT (freshStart.js).
 *
 * Lyrics and notes go to Documents\Lyricist Lyrics as a .txt in the desktop
 * app, or download in a browser. Returns the line to show him: where it went,
 * or why it did not.
 */
export async function saveText(title, text) {
  const body = String(text || '').trim();
  if (!body) return { ok: false, said: 'There is nothing to save yet.' };
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
  const name = `${String(title || 'Lyrics').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80) || 'Lyrics'} ${stamp}.txt`;
  const api = typeof window !== 'undefined' ? window.lyricistAPI : null;
  if (api?.saveLyrics) {
    const r = await api.saveLyrics(name, `${body}\n`).catch((e) => ({ ok: false, error: e?.message }));
    return r?.ok ? { ok: true, said: `Saved to ${r.path}` } : { ok: false, said: `Could not save: ${r?.error || 'unknown error'}` };
  }
  const url = URL.createObjectURL(new Blob([`${body}\n`], { type: 'text/plain' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, said: `Downloaded ${name}` };
}
