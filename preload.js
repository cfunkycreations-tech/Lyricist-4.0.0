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
});
