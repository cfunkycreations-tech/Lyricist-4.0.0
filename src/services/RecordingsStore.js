// Recordings library — Lyricist 4.1.3
//
// Persistent storage for the Recording Booth: harmonica riffs, guitar takes,
// vocal ideas — recorded on the fly or uploaded — saved as real audio blobs in
// IndexedDB so they survive app restarts (localStorage can't hold audio).
// Works identically in the packaged Electron app and in a browser.
//
// Record shape:
//   { id, name, type (mime), duration (s), size, createdAt, blob }

const DB_NAME = 'lyricist-recordings';
const DB_VERSION = 1;
const STORE = 'recordings';

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording({ name, blob, duration }) {
  const db = await openDB();
  const rec = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || `Take ${new Date().toLocaleString()}`,
    type: blob.type || 'audio/webm',
    duration: duration ?? null,
    size: blob.size,
    createdAt: Date.now(),
    blob
  };
  await requestToPromise(tx(db, 'readwrite').put(rec));
  return rec;
}

export async function listRecordings() {
  const db = await openDB();
  const all = await requestToPromise(tx(db, 'readonly').getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecording(id) {
  const db = await openDB();
  return requestToPromise(tx(db, 'readonly').get(id));
}

export async function renameRecording(id, name) {
  const db = await openDB();
  const rec = await requestToPromise(tx(db, 'readonly').get(id));
  if (!rec) throw new Error('Recording not found.');
  rec.name = name;
  await requestToPromise(tx(db, 'readwrite').put(rec));
  return rec;
}

export async function deleteRecording(id) {
  const db = await openDB();
  await requestToPromise(tx(db, 'readwrite').delete(id));
}

// ── Cross-tab handoffs (window event bus — no store changes needed) ──
// The persistent Suno player and MIDI Studio are always mounted, so they can
// listen for these even while their tabs are hidden.

export function sendToPlayer(rec) {
  const url = URL.createObjectURL(rec.blob);
  window.dispatchEvent(new CustomEvent('lyricist:add-track', {
    detail: { name: rec.name, url, kind: 'recording' }
  }));
}

export function sendToMidiStudio(rec) {
  window.dispatchEvent(new CustomEvent('lyricist:convert-to-midi', {
    detail: { name: rec.name, blob: rec.blob }
  }));
}
