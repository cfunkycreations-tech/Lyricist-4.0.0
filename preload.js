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
  // One Man Band -> a ComfyUI on this machine or a rented one. Goes through the
  // main process because ComfyUI sends no CORS headers, so the renderer cannot
  // reach it directly. See the 'music-fetch' handler in main.js.
  musicFetch: (opts) => ipcRenderer.invoke('music-fetch', opts),

  // ONE-BUTTON SETUP for the two engines that used to need a tutorial.
  // Both report progress on the single 'setup-progress' channel, tagged with a
  // job name, so one listener in the UI covers both.
  comfyStatus: () => ipcRenderer.invoke('comfy-status'),
  comfyInstall: () => ipcRenderer.invoke('comfy-install'),
  comfyStart: () => ipcRenderer.invoke('comfy-start'),
  comfyStop: () => ipcRenderer.invoke('comfy-stop'),
  kaggleStatus: (verify) => ipcRenderer.invoke('kaggle-status', { verify }),
  // Kaggle shows the code on screen now instead of downloading a file, so the
  // normal path is a paste. The file picker stays for accounts that still get a
  // kaggle.json, and for anyone who set this up on an earlier build.
  kaggleConnectText: (text) => ipcRenderer.invoke('kaggle-connect-text', { text }),
  kaggleConnectFile: () => ipcRenderer.invoke('kaggle-connect-file'),
  kaggleDisconnect: () => ipcRenderer.invoke('kaggle-disconnect'),
  kaggleRender: (song) => ipcRenderer.invoke('kaggle-render', song),
  kaggleRenderStop: () => ipcRenderer.invoke('kaggle-render-stop'),
  songBytes: (filePath) => ipcRenderer.invoke('song-bytes', { filePath }),
  songsFolder: () => ipcRenderer.invoke('songs-folder'),
  songsList: () => ipcRenderer.invoke('songs-list'),
  kaggleCollect: () => ipcRenderer.invoke('kaggle-collect'),
  captionSkillOpen: () => ipcRenderer.invoke('caption-skill-open'),
  captionSkillIndexes: (families) => ipcRenderer.invoke('caption-skill-indexes', { families }),
  captionSkillTemplates: (ids) => ipcRenderer.invoke('caption-skill-templates', { ids }),
  captionSkillPresent: () => ipcRenderer.invoke('caption-skill-present'),
  onSetupProgress: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('setup-progress', h);
    return () => ipcRenderer.removeListener('setup-progress', h);
  },
  // His own recorded narration, kept in <userData>\voice as loose files.
  // voicePack() -> { ok, dir, found: { splash, 'card-01', ... } } where each
  // value is a file:// URL ready to hand to an <audio>. Only the recordings he
  // has actually made come back; everything else keeps the built-in clip.
  voicePack: () => ipcRenderer.invoke('voice-pack'),
  // Open that folder in Explorer so recordings can be dropped straight in.
  openVoiceFolder: () => ipcRenderer.invoke('open-voice-folder'),
  // Voice Lab (Creator): save one baked clip into the voice pack as WAV.
  voiceLabSave: (folder, name, bytes) => ipcRenderer.invoke('voice-lab-save', { folder, name, bytes }),
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
  // Save every stem of one song into a single folder, from one click:
  // Documents\Lyricist Stems\<song>\. Returns { ok, path, written }.
  saveStems: (songName, files) => ipcRenderer.invoke('save-stems', { songName, files }),
  // Open a folder in Explorer.
  showFolder: (folderPath) => ipcRenderer.invoke('show-folder', { folderPath }),
  // Open a lyrics file the user wrote elsewhere. Returns { ok, canceled, name, text }.
  pickLyricsFile: () => ipcRenderer.invoke('pick-lyrics-file'),
  pickSampleFiles: () => ipcRenderer.invoke('pick-sample-files'),
  pickSampleFolder: () => ipcRenderer.invoke('pick-sample-folder'),
  readSampleFile: (filePath) => ipcRenderer.invoke('read-sample-file', { filePath }),
  // Stemmer Cloud — Demucs on Replicate (optional; no local GPU).
  // payload: { apiKey, audioBase64, mimeType, fileName }
  // Returns { ok, stems: { vocals|drums|bass|other: base64 }, error }.
  stemmerCloud: (payload) => ipcRenderer.invoke('stemmer-cloud', payload),

  // Local Demucs — true six-stem AI separation on the user's own GPU/CPU.
  demucsStatus: () => ipcRenderer.invoke('demucs-status'),
  demucsSetup: () => ipcRenderer.invoke('demucs-setup'),
  // payload: { bytes: Uint8Array, fileName, device: 'auto'|'gpu'|'cpu' }
  // Returns { ok, device, stems: { vocals|drums|bass|guitar|keys|other: base64 } }.
  demucsSeparate: (payload) => ipcRenderer.invoke('demucs-separate', payload),
  // Progress during setup/separate. Returns an unsubscribe function.
  onDemucsProgress: (cb) => {
    const h = (_e, data) => cb(data);
    ipcRenderer.on('demucs-progress', h);
    return () => ipcRenderer.removeListener('demucs-progress', h);
  },

  // Ghost Pilot OS-level hardware automation bridge
  pilotMove: (x, y) => ipcRenderer.invoke('pilot-move', { x, y }),
  pilotClick: () => ipcRenderer.invoke('pilot-click'),
  pilotType: (text) => ipcRenderer.invoke('pilot-type', { text }),
  // Ghost jobs: open OBS when it is closed, and keep the PC awake overnight.
  obsLaunch: (opts) => ipcRenderer.invoke('obs-launch', opts || {}),
  ghostKeepAwake: (on) => ipcRenderer.invoke('ghost-keep-awake', { on }),
  // Ghost lessons: Chris records himself, the Ghost replays it on the real cursor.
  pilotReplay: (events) => ipcRenderer.invoke('pilot-replay', { events }),
  pilotReplayStop: () => ipcRenderer.invoke('pilot-replay-stop'),
  lessonSave: (lesson) => ipcRenderer.invoke('ghost-lesson-save', lesson),
  lessonList: () => ipcRenderer.invoke('ghost-lesson-list'),
  lessonLoad: (name) => ipcRenderer.invoke('ghost-lesson-load', { name }),
  lessonDelete: (name) => ipcRenderer.invoke('ghost-lesson-delete', { name }),
  lessonReveal: () => ipcRenderer.invoke('ghost-lesson-reveal'),

  // Real Windows VST3 Plugin Scanner & Native Window Hosting
  sendJuceCommand: (cmd, args) => ipcRenderer.invoke('juce-command', { cmd, args }),
});