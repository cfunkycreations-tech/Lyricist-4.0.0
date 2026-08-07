/**
 * User sample library — Lyricist 4.2.0
 *
 * Chris's own samples live here: one-shots, loops, whole sample packs, bought
 * or free. Everything is stored locally in IndexedDB on his machine. Nothing
 * is uploaded anywhere, nothing phones home, and paid packs never leave the
 * computer they were licensed on.
 *
 * Audio is kept as the original file bytes (ArrayBuffer) and decoded on demand,
 * so a big library costs nothing until you actually play something.
 *
 * Layout:
 *   packs   — a folder: { id, name, created, note }
 *   samples — metadata ONLY: { id, packId, name, type, size, rootMidi }
 *   blobs   — the audio, on its own: { id, bytes }
 *   meta    — running totals
 *
 * THE SPLIT MATTERS. Audio used to live on the sample row itself, which meant
 * every "what's in my library" question dragged the audio along with it: a
 * cursor over the samples store deserializes each record whole, so listing the
 * NAMES of a 12 GB library read 12 GB off the disk. Keeping the bytes in their
 * own store means metadata reads stay metadata reads, and the only thing that
 * ever loads audio is playing a sound.
 *
 * Old rows are migrated on the fly (see `migrateLegacyBlobs`), so a library
 * built before the split keeps working while it moves itself across.
 */

const DB_NAME = 'lyricistSampleLibrary';
const DB_VERSION = 3;
const PACKS = 'packs';
const SAMPLES = 'samples';
const BLOBS = 'blobs';      // audio only — never read to list, count or size
const META = 'meta';        // running totals, so nothing has to read the audio

export const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff', '.m4a', '.webm', '.opus'];
export const ARCHIVE_EXTS = ['.zip'];

/**
 * Limits — deliberately high enough to stay out of the way.
 *
 * These started at 60 MB per file and 2 GB total, which was the wrong answer to
 * the right problem. The crash they were guarding against was never really
 * about how much was STORED: it was `listSamples()` pulling every sample's
 * audio through memory just to read names. That is fixed properly now — audio
 * lives in its own store (see the layout note above) and nothing but playback
 * ever touches it. The caps outlived their reason and turned into "I can't
 * upload anything", on a machine holding a 12 GB library.
 *
 * What is left is a sanity guard, not a budget. A single sample is capped at
 * something no real one-shot or loop approaches, and the library total is
 * capped well past any working collection. Storage is on disk, not in memory.
 */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;             // 1 GB per sample
export const MAX_LIBRARY_BYTES = 128 * 1024 * 1024 * 1024;    // 128 GB total

export class LibraryLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LibraryLimitError';
  }
}

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
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
      // v3: audio moves out of the sample rows into its own store. The existing
      // rows are NOT rewritten here — an upgrade transaction blocks the whole
      // app, and rewriting a 12 GB library inside one would look exactly like
      // the freeze this schema change exists to prevent. They move across as
      // they are touched, or in the background sweep.
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: 'id' });
      }
    };
    // A schema bump waits for every other connection to close. Without this,
    // an old connection left open anywhere turns the upgrade into a silent
    // forever-wait and the library just never loads.
    req.onblocked = () => reject(new Error(
      'The sample library is open somewhere else and is blocking an upgrade. Close any other Lyricist window and try again.'));
    req.onsuccess = () => {
      const db = req.result;
      // If another tab bumps the version later, let go rather than wedge it.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });   // a failed open must not be cached
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

/** Multi-store transaction — metadata and its audio must land together. */
function txMulti(stores, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    try {
      result = fn(...stores.map((name) => t.objectStore(name)));
    } catch (err) {
      reject(err);
      return;
    }
    t.oncomplete = () => resolve(result);
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
  await txMulti([SAMPLES, BLOBS], 'readwrite', (store, blobs) => {
    samples.forEach((smp) => { store.delete(smp.id); blobs.delete(smp.id); });
  });
  await tx(PACKS, 'readwrite', (s) => s.delete(id));
  await addToTotal(-samples.reduce((sum, smp) => sum + (smp.size || 0), 0));
  samples.forEach((smp) => bufferCache.delete(smp.id));
}

/* ── Samples ───────────────────────────────────────────────────────── */

/**
 * Names and metadata for the library, WITHOUT loading a single byte of audio.
 *
 * This used to be `getAll()` followed by dropping `bytes` from each row — which
 * meant the entire library, audio and all, was pulled into memory first and
 * thrown away a moment later. With a real library that is gigabytes, and the
 * drum machine asked for it once per pack, so it happened over and over. It ran
 * the renderer out of memory and took the whole app down with it.
 *
 * A cursor walks the store one record at a time, so only a single sample is
 * ever held, and its audio is dropped before the next one is read.
 */
export async function listSamples(packId = null) {
  const rows = await tx(SAMPLES, 'readonly', (s) => new Promise((resolve, reject) => {
    const out = [];
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      const { bytes, ...meta } = cursor.value;   // eslint-disable-line no-unused-vars
      if (!packId || meta.packId === packId) out.push(meta);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function countSamples() {
  // count() is answered from the index — it never touches the audio.
  return (await tx(SAMPLES, 'readonly', (s) => s.count())) || 0;
}

/**
 * Total bytes stored, for the "library size" readout.
 *
 * Kept as a running total. Adding it up on demand meant walking every record,
 * and a record carries its audio — so simply asking "how big is my library"
 * pulled the entire library through memory. On a 12 GB library that took long
 * enough that callers waiting on it appeared to hang.
 *
 * The total is computed the slow way exactly once, if it has never been stored.
 */
export async function librarySize() {
  const stored = await tx(META, 'readonly', (s) => s.get('totalBytes'));
  if (stored && typeof stored.value === 'number') return stored.value;

  const sum = await tx(SAMPLES, 'readonly', (s) => new Promise((resolve, reject) => {
    let total = 0;
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(total); return; }
      total += cursor.value.size || 0;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  }));
  await setTotalBytes(sum);
  return sum;
}

async function setTotalBytes(value) {
  await tx(META, 'readwrite', (s) => s.put({ key: 'totalBytes', value: Math.max(0, value) }));
}

/** Adjust the running total without ever reading a sample's audio. */
async function addToTotal(delta) {
  const stored = await tx(META, 'readonly', (s) => s.get('totalBytes'));
  if (!stored || typeof stored.value !== 'number') return;   // recomputed on next read
  await setTotalBytes(stored.value + delta);
}

/**
 * Add one audio file. `rootMidi` is the pitch the sample was recorded at —
 * playing other keys pitch-shifts from there. 60 (C4) is a sane default for
 * one-shots and is what drum hits want anyway.
 */
export async function addSample(packId, file, { rootMidi = 60, budget = null } = {}) {
  if (file.size > MAX_FILE_BYTES) {
    throw new LibraryLimitError(
      `${formatBytes(file.size)} is over the ${formatBytes(MAX_FILE_BYTES)} limit for a single sample`);
  }
  // `budget` lets a batch import check the total once instead of per file.
  const used = budget ? budget.used : await librarySize();
  if (used + file.size > MAX_LIBRARY_BYTES) {
    throw new LibraryLimitError(
      `library is full — ${formatBytes(MAX_LIBRARY_BYTES)} max. Remove some samples first.`);
  }
  if (budget) budget.used += file.size;

  const bytes = await file.arrayBuffer();
  const meta = {
    id: newId(),
    packId,
    name: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    type: file.type || '',
    size: bytes.byteLength,
    rootMidi,
    created: Date.now(),
  };
  // Metadata and audio in one transaction: a sample row without its audio (or
  // an orphaned blob) would be a permanent little corruption.
  await txMulti([SAMPLES, BLOBS], 'readwrite', (samples, blobs) => {
    samples.put(meta);
    blobs.put({ id: meta.id, bytes });
  });
  await addToTotal(meta.size);
  return meta;
}

export async function updateSample(id, patch) {
  const row = await tx(SAMPLES, 'readonly', (s) => s.get(id));
  if (!row) return null;
  // Renaming a sample must not rewrite its audio. Legacy rows still carry
  // `bytes`; migrate this one across rather than writing the audio back out.
  const { bytes: legacy, ...current } = row;
  const next = { ...current, ...patch, id: row.id };
  if (legacy) {
    await txMulti([SAMPLES, BLOBS], 'readwrite', (samples, blobs) => {
      samples.put(next);
      blobs.put({ id: row.id, bytes: legacy });
    });
  } else {
    await tx(SAMPLES, 'readwrite', (s) => s.put(next));
  }
  bufferCache.delete(id);
  return next;
}

/**
 * Empty the whole library — every pack, every sample. Recordings live in a
 * different database (lyricist-recordings) and are not touched.
 * Returns what was removed so it can be reported honestly.
 */
export async function clearLibrary() {
  // count() is answered from the index. Do NOT ask for the byte total here —
  // computing it walks every record, audio and all, which is what made this
  // hang on a large library instead of emptying it.
  const samples = await countSamples();
  await txMulti([SAMPLES, BLOBS], 'readwrite', (s, b) => { s.clear(); b.clear(); });
  await tx(PACKS, 'readwrite', (s) => s.clear());
  await setTotalBytes(0);
  bufferCache.clear();
  return { samples };
}

export async function deleteSample(id) {
  // Read the row for its size only — `size` is metadata, so this costs nothing.
  const row = await tx(SAMPLES, 'readonly', (s) => s.get(id));
  await txMulti([SAMPLES, BLOBS], 'readwrite', (samples, blobs) => {
    samples.delete(id);
    blobs.delete(id);
  });
  if (row?.size) await addToTotal(-row.size);
  bufferCache.delete(id);
}

/* ── Audio ─────────────────────────────────────────────────────────── */

const bufferCache = new Map(); // sampleId -> AudioBuffer

/**
 * Fetch a sample's raw audio. Blob store first; a library written before the
 * split still keeps its audio on the sample row, so fall back to that and move
 * it across on the way past.
 */
async function readBytes(id) {
  const blob = await tx(BLOBS, 'readonly', (s) => s.get(id));
  if (blob?.bytes) return blob.bytes;

  const row = await tx(SAMPLES, 'readonly', (s) => s.get(id));
  if (!row?.bytes) return null;
  const { bytes, ...meta } = row;
  await txMulti([SAMPLES, BLOBS], 'readwrite', (samples, blobs) => {
    samples.put(meta);                 // row is now metadata-only
    blobs.put({ id, bytes });
  });
  return bytes;
}

/** Decode a stored sample to an AudioBuffer, cached after the first play. */
export async function getSampleBuffer(ctx, id) {
  if (bufferCache.has(id)) return bufferCache.get(id);
  const bytes = await readBytes(id);
  if (!bytes) throw new Error('Sample not found');
  // decodeAudioData detaches the buffer, so hand it a copy and keep the original.
  const buf = await ctx.decodeAudioData(bytes.slice(0));
  bufferCache.set(id, buf);
  return buf;
}

/**
 * Walk any pre-split rows and move their audio into the blob store, one at a
 * time so only a single sample is ever in memory. Safe to call repeatedly and
 * safe to abandon half-done: every path handles both layouts.
 *
 * Until a library finishes this, listing it still reads the old rows whole —
 * which is the slowness this whole change exists to remove.
 */
export async function migrateLegacyBlobs(onProgress = () => {}) {
  const ids = await tx(SAMPLES, 'readonly', (s) => new Promise((resolve, reject) => {
    const out = [];
    const req = s.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(out); return; }
      if (cursor.value.bytes) out.push(cursor.value.id);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  }));

  let done = 0;
  for (const id of ids) {
    try {
      await readBytes(id);            // the read is what moves it
    } catch { /* skip a bad row rather than stall the whole sweep */ }
    onProgress(++done, ids.length);
  }
  return { moved: done };
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
  // One size check for the whole batch, then track it as we go.
  const budget = { used: await librarySize() };

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
            await addSample(packId, new File([blob], plain, { type: blob.type }), { budget });
            result.added++;
          } catch (err) {
            result.errors.push(`${entry.name}: ${err.message}`);
          }
        }
      } else if (isAudioFile(file.name)) {
        await addSample(packId, file, { budget });
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
  // Metadata first (no audio), then each file is fetched and handed to the zip
  // one at a time. Reading the whole library into an array here would hold
  // every byte in memory at once on top of the zip being built.
  const rows = await listSamples();
  const total = await countSamples();

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

    const bytes = await readBytes(row.id);
    if (bytes) zip.file(entry, bytes);
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
    onProgress(done, total);
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
      };
      await txMulti([SAMPLES, BLOBS], 'readwrite', (samples2, blobs) => {
        samples2.put(row);
        blobs.put({ id: row.id, bytes });
      });
      // Restoring never used to update the running total, so the size readout
      // under-reported everything you brought back until something recomputed it.
      await addToTotal(row.size);
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
