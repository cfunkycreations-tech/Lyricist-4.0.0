const { contextBridge, ipcRenderer } = require('electron');

// Safe, minimal bridge between the app UI and the desktop file system.
// contextIsolation is ON, so the UI can only use exactly what we expose here.
contextBridge.exposeInMainWorld('lyricistAPI', {
  isElectron: true,
  // Save a Ghost Rider style report into the user's Documents folder.
  // Returns { ok: true, path } or { ok: false, error }.
  saveReport: (filename, content) => ipcRenderer.invoke('save-report', { filename, content }),
  // Save a Song Forge result (lyrics .txt + cover art .png) into the user's Documents folder.
  // Returns { ok: true, lyricsPath, imagePath } or { ok: false, error }.
  saveSongForge: (payload) => ipcRenderer.invoke('save-song-forge', payload),
  // Save a Recording Booth take (WAV bytes) into Documents\Lyricist Recordings.
  // Returns { ok: true, path } or { ok: false, error }.
  saveRecording: (filename, bytes) => ipcRenderer.invoke('save-recording', { filename, bytes }),
  // Export a Mastering Studio album (mastered WAVs + cover.png + tracklist.txt)
  // into Documents\Lyricist Albums\<album name>. Returns { ok: true, path } or { ok: false, error }.
  saveAlbum: (albumName, files) => ipcRenderer.invoke('save-album', { albumName, files }),
  // Write a line into %APPDATA%\Lyricist\boot.log. Used for things that must be
  // provable after the fact — "did the library actually get emptied" — instead
  // of relying on console events, whose shape changes between Electron versions.
  log: (message) => ipcRenderer.invoke('app-log', { message: String(message) }),
  // Fetch a Suno playlist's tracks from the main process (no browser CORS wall).
  // Returns { ok: true, tracks: [{ name, url }] } or { ok: false, error }.
  sunoPlaylist: (id) => ipcRenderer.invoke('suno-playlist', { id }),
  // Monitors attached right now, for sending the visualizer to another screen.
  // Returns [{ id, index, label, bounds, scaleFactor, isPrimary }].
  listDisplays: () => ipcRenderer.invoke('list-displays'),
  // Sample library pickers. The renderer's own <input type="file"> is the
  // fragile path inside Electron — when it fails it fails silently and the
  // button just looks broken. These open the real OS dialog from the main
  // process instead. pickSampleFolder walks the folder itself and returns only
  // the audio it found; readSampleFile fetches ONE file's bytes, so importing a
  // huge folder never holds more than one sample in memory.
  // Returns { ok, canceled, paths } / { ok, name, size, bytes }.
  pickSampleFiles: () => ipcRenderer.invoke('pick-sample-files'),
  pickSampleFolder: () => ipcRenderer.invoke('pick-sample-folder'),
  readSampleFile: (filePath) => ipcRenderer.invoke('read-sample-file', { filePath }),
  // Stemmer Cloud — Demucs on Replicate (optional; no local GPU).
  // payload: { apiKey, audioBase64, mimeType, fileName }
  // Returns { ok, stems: { vocals|drums|bass|other: base64 }, error }.
  stemmerCloud: (payload) => ipcRenderer.invoke('stemmer-cloud', payload),
});
