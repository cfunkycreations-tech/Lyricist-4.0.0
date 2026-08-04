/**
 * User sample library — Lyricist 4.2.0
 *
 * Chris's own samples live here: one-shots, loops, whole sample packs, bought
 * or free. Everything is stored locally in IndexedDB on his machine. Nothing
 * is uploaded anywhere, nothing phones home, and paid packs never leave the
 * computer they were licensed on.
 *
 * Audio is kept as the original file bytes (ArrayBuffer) and decoded on demand,
 * so a 2 GB library costs nothing until you actually play something.
 *
 * Layout:
 *   packs   — a folder: { id, name, created, note }
 *   samples — one audio file: { id, packId, name, type, size, rootMidi, bytes }
 */

const DB_NAME = 'lyricistSampleLibrary';
const DB_VERSION = 1;
const PACKS = 'packs';
const SAMPLES = 'samples';

export const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.m4a', '.webm', '.opus'];
export const ARCHIVE_EXTS = ['.zip'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PACKS)) {
        db.createObjectStore(PACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAMPLES)) {
        const store = db.createObjectStore(SAMPLES, { keyPath: 'id' });
        store.createIndex('packId', 'packId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try {
      result = fn(s);
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function hasExt(name, list) {
  const lower = name.toLowerCase();
  return list.some((e) => lower.endsWith(e));
}

export const isAudioFile = (name) => hasExt(name, AUDIO_EXTS);
export const isArchive = (name) => hasExt(name, ARCHIVE_EXTS);

/* ── Packs ─────────────────────────────────────────────────────────── */

export async function listPacks() {
  const packs = await tx(PACKS, 'readonly', (s) => s.getAll());
  return (packs || []).sort((a, b) => b.created - a.created);
}

export async function createPack(name, note = '') {
  const pack = { id: newId(), name: name || 'Untitled Pack', note, created: Date.now() };
  await tx(PACKS, 'readwrite', (s) => s.put(pack));
  return pack;
}

export async function renamePack(id, name) {
  const pack = await tx(PACKS, 'readonly', (s) => s.get(id));
  if (!pack) return null;
  const next = { ...pack, name };
  await tx(PACKS, 'readwrite', (s) => s.put(next));
  return next;
}

export async function deletePack(id) {
  const samples = await listSamples(id);
  await tx(SAMPLES, 'readwrite', (s) => { samples.forEach((smp) => s.delete(smp.id)); });
  await tx(PACKS, 'readwrite', (s) => s.delete(id));
  samples.forEach((smp) => bufferCache.delete(smp.id));
}

/* ── Samples ───────────────────────────────────────────────────────── */

export async function listSamples(packId = null) {
  const all = await tx(SAMPLES, 'readonly', (s) => s.getAll());
  const rows = all || [];
  const filtered = packId ? rows.filter((r) => r.packId === packId) : rows;
  // Strip the bytes — callers that need audio ask for it explicitly.
  return filtered
    .map(({ bytes, ...meta }) => meta)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function countSamples() {
  const all = await tx(SAMPLES, 'readonly', (s) => s.getAll());
  return (all || []).length;
}

/** Total bytes stored, for the "library size" readout. */
export async function librarySize() {
  const all = await tx(SAMPLES, 'readonly', (s) => s.getAll());
  return (all || []).reduce((sum, r) => sum + (r.size || 0), 0);
}

/**
 * Add one audio file. `rootMidi` is the pitch the sample was recorded at —
 * playing other keys pitch-shifts from there. 60 (C4) is a sane default for
 * one-shots and is what drum hits want anyway.
 */
export async function addSample(packId, file, { rootMidi = 60 } = {}) {
  const bytes = await file.arrayBuffer();
  const row = {
    id: newId(),
    packId,
    name: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    type: file.type || '',
    size: bytes.byteLength,
    rootMidi,
    created: Date.now(),
    bytes,
  };
  await tx(SAMPLES, 'readwrite', (s) => s.put(row));
  const { bytes: _omit, ...meta } = row;
  return meta;
}

export async function updateSample(id, patch) {
  const row = await tx(SAMPLES, 'readonly', (s) => s.get(id));
  if (!row) return null;
  const next = { ...row, ...patch, id: row.id, bytes: row.bytes };
  await tx(SAMPLES, 'readwrite', (s) => s.put(next));
  bufferCache.delete(id);
  const { bytes: _omit, ...meta } = next;
  return meta;
}

export async function deleteSample(id) {
  await tx(SAMPLES, 'readwrite', (s) => s.delete(id));
  bufferCache.delete(id);
}

/* ── Audio ─────────────────────────────────────────────────────────── */

const bufferCache = new Map(); // sampleId -> AudioBuffer

/** Decode a stored sample to an AudioBuffer, cached after the first play. */
export async function getSampleBuffer(ctx, id) {
  if (bufferCache.has(id)) return bufferCache.get(id);
  const row = await tx(SAMPLES, 'readonly', (s) => s.get(id));
  if (!row?.bytes) throw new Error('Sample not found');
  // decodeAudioData detaches the buffer, so hand it a copy and keep the original.
  const buf = await ctx.decodeAudioData(row.bytes.slice(0));
  bufferCache.set(id, buf);
  return buf;
}

/**
 * Import a batch of dropped files into a pack. ZIPs are expanded and any audio
 * inside is pulled in, so a downloaded sample pack can be dragged straight in.
 * Returns { added, skipped, errors }.
 */
export async function importFiles(packId, files, onProgress = () => {}) {
  const result = { added: 0, skipped: 0, errors: [] };
  const queue = [...files];
  let done = 0;

  for (const file of queue) {
    try {
      if (isArchive(file.name)) {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter(
          (e) => !e.dir && isAudioFile(e.name) && !e.name.split('/').pop().startsWith('.')
        );
        for (const entry of entries) {
          try {
            const blob = await entry.async('blob');
            const plain = entry.name.split('/').pop();
            await addSample(packId, new File([blob], plain, { type: blob.type }));
            result.added++;
          } catch (err) {
            result.errors.push(`${entry.name}: ${err.message}`);
          }
        }
      } else if (isAudioFile(file.name)) {
        await addSample(packId, file);
        result.added++;
      } else {
        result.skipped++;
      }
    } catch (err) {
      result.errors.push(`${file.name}: ${err.message}`);
    }
    done++;
    onProgress(done, queue.length);
  }
  return result;
}

/* ── Backup / restore ──────────────────────────────────────────────
   IndexedDB lives inside Electron's userData folder, which uninstallers —
   Revo especially — delete along with the app. Without a file on disk, one
   uninstall takes the whole library with it, paid packs included. So the
   library can be written out as an ordinary .zip and read back in.        */

/**
 * Export the whole library to a .zip: a manifest plus the original audio
 * files, filed under a folder per pack. Root notes and pack names survive.
 */
export async function exportLibrary(onProgress = () => {}) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const packs = await listPacks();
  const all = await tx(SAMPLES, 'readonly', (s) => s.getAll());
  const rows = all || [];

  const manifest = {
    format: 'lyricist-sample-library',
    version: 1,
    exported: new Date().toISOString(),
    packs: packs.map((p) => ({ id: p.id, name: p.name, note: p.note || '', created: p.created })),
    samples: [],
  };

  const usedNames = new Set();
  let done = 0;

  for (const row of rows) {
    const pack = packs.find((p) => p.id === row.packId);
    const packFolder = safeName(pack?.name || 'Loose Samples');
    // Keep the original extension so the files are usable outside the app too.
    const ext = (row.fileName && row.fileName.match(/\.[^.]+$/)?.[0]) || '.wav';
    let entry = `${packFolder}/${safeName(row.name)}${ext}`;
    let n = 2;
    while (usedNames.has(entry)) entry = `${packFolder}/${safeName(row.name)} (${n++})${ext}`;
    usedNames.add(entry);

    zip.file(entry, row.bytes);
    manifest.samples.push({
      entry,
      packId: row.packId,
      name: row.name,
      fileName: row.fileName,
      type: row.type,
      rootMidi: row.rootMidi,
      created: row.created,
    });

    done++;
    onProgress(done, rows.length);
  }

  zip.file('library.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/**
 * Restore from an exported .zip. Packs are recreated by name; a zip without a
 * manifest still works — it just imports as a normal sample pack.
 */
export async function importLibrary(file, onProgress = () => {}) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('library.json');

  if (!manifestFile) {
    const pack = await createPack(file.name.replace(/\.zip$/i, ''));
    return importFiles(pack.id, [file], onProgress);
  }

  const manifest = JSON.parse(await manifestFile.async('string'));
  const result = { added: 0, skipped: 0, errors: [] };

  const idMap = new Map();
  for (const p of manifest.packs || []) {
    const created = await createPack(p.name, p.note);
    idMap.set(p.id, created.id);
  }

  const samples = manifest.samples || [];
  let done = 0;
  for (const meta of samples) {
    try {
      const entry = zip.file(meta.entry);
      if (!entry) { result.skipped++; continue; }
      const bytes = await entry.async('arraybuffer');
      const row = {
        id: newId(),
        packId: idMap.get(meta.packId) || (await createPack('Restored')).id,
        name: meta.name,
        fileName: meta.fileName || meta.entry.split('/').pop(),
        type: meta.type || '',
        size: bytes.byteLength,
        rootMidi: meta.rootMidi ?? 60,
        created: meta.created || Date.now(),
        bytes,
      };
      await tx(SAMPLES, 'readwrite', (s) => s.put(row));
      result.added++;
    } catch (err) {
      result.errors.push(`${meta.name}: ${err.message}`);
    }
    done++;
    onProgress(done, samples.length);
  }
  return result;
}

// Strip only what a filesystem actually rejects — spaces and dashes stay, so
// the extracted folders still read like the pack names you gave them.
function safeName(s) {
  return String(s).replace(/[<>:"/\|?*]/g, "_").trim() || "untitled";
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
