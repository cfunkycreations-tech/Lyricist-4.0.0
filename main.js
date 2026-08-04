const { app, BrowserWindow, session, ipcMain, Menu, MenuItem, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// Save a Ghost Rider style report as a .txt file in the user's Documents folder.
// Called from the UI via the preload bridge (window.lyricistAPI.saveReport).
ipcMain.handle('save-report', async (event, { filename, content }) => {
  try {
    const dir = path.join(app.getPath('documents'), 'Lyricist Style Reports');
    fs.mkdirSync(dir, { recursive: true });
    // Strip characters Windows won't allow in a file name.
    const safe = String(filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
    const full = path.join(dir, safe);
    fs.writeFileSync(full, content, 'utf8');
    return { ok: true, path: full };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Save a Song Forge result (lyrics .txt + cover art .png, same base name) to
// Documents\Lyricist Song Forge. Called via window.lyricistAPI.saveSongForge.
ipcMain.handle('save-song-forge', async (event, { title, lyricsContent, imageBase64 }) => {
  try {
    const dir = path.join(app.getPath('documents'), 'Lyricist Song Forge');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(title || 'Untitled Song').replace(/[\\/:*?"<>|]/g, '-').slice(0, 150);
    const base = `${safe} - ${new Date().toISOString().slice(0, 10)}`;
    const lyricsPath = path.join(dir, `${base}.txt`);
    fs.writeFileSync(lyricsPath, lyricsContent, 'utf8');
    let imagePath = null;
    if (imageBase64) {
      imagePath = path.join(dir, `${base}.png`);
      fs.writeFileSync(imagePath, Buffer.from(imageBase64, 'base64'));
    }
    return { ok: true, lyricsPath, imagePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Save a Recording Booth take (WAV bytes) into Documents\Lyricist Recordings.
// Called from the UI via window.lyricistAPI.saveRecording (4.1.3).
ipcMain.handle('save-recording', async (event, { filename, bytes }) => {
  try {
    const dir = path.join(app.getPath('documents'), 'Lyricist Recordings');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
    const full = path.join(dir, safe);
    fs.writeFileSync(full, Buffer.from(bytes));
    return { ok: true, path: full };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Export a finished album from the Mastering Studio: mastered WAVs + cover +
// tracklist into Documents\Lyricist Albums\<album name>\ (4.1.3).
// Called via window.lyricistAPI.saveAlbum(albumName, files).
ipcMain.handle('save-album', async (event, { albumName, files }) => {
  try {
    const safeAlbum = String(albumName || 'Untitled Album').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
    const dir = path.join(app.getPath('documents'), 'Lyricist Albums', safeAlbum);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files || []) {
      const safe = String(f.filename).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);
      fs.writeFileSync(path.join(dir, safe), Buffer.from(f.bytes));
    }
    return { ok: true, path: dir };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Fetch a Suno playlist's tracks from the main process, where there is no
// browser CORS wall. Called via window.lyricistAPI.sunoPlaylist(id).
// Returns { ok: true, tracks: [{ name, url }] } or { ok: false, error }.
ipcMain.handle('suno-playlist', async (event, { id }) => {
  try {
    const clean = String(id || '').trim();
    if (!clean) return { ok: false, error: 'No playlist id.' };
    const bases = [
      (p) => `https://studio-api.suno.ai/api/playlist/${clean}/?page=${p}`,
      (p) => `https://suno.com/api/playlist/${clean}/?page=${p}`,
    ];
    for (const build of bases) {
      const tracks = [];
      let worked = false;
      for (let page = 1; page <= 10; page++) {
        let res;
        try {
          res = await fetch(build(page), { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 Lyricist' } });
        } catch { break; }
        if (!res.ok) break;
        worked = true;
        let data;
        try { data = await res.json(); } catch { break; }
        const clips = (data.playlist_clips || data.clips || []).map((pc) => pc.clip || pc);
        if (!clips.length) break;
        for (const c of clips) {
          if (!c) continue;
          const url = c.audio_url || (c.id ? `https://cdn1.suno.ai/${c.id}.mp3` : null);
          if (url) tracks.push({ name: c.title || String(c.id || '').slice(0, 8) || 'Suno track', url });
        }
        if (clips.length < 20) break; // last page
      }
      if (tracks.length) return { ok: true, tracks };
      if (worked) return { ok: false, error: 'Playlist loaded but had no playable tracks.' };
    }
    return { ok: false, error: 'Suno did not return the playlist (it may be private, empty, or the API changed).' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/**
 * Stemmer Cloud — Demucs on Replicate (no local GPU required).
 * Input: { apiKey, audioBase64, mimeType, fileName }
 * Output: { ok, stems: { vocals, drums, bass, other } as base64 WAV/bytes, error }
 */
ipcMain.handle('stemmer-cloud', async (event, { apiKey, audioBase64, mimeType, fileName }) => {
  try {
    const token = String(apiKey || '').trim();
    if (!token) return { ok: false, error: 'No Replicate API key. Add one in Settings, or switch Stemmer to Offline.' };
    if (!audioBase64) return { ok: false, error: 'No audio data received.' };

    const mime = mimeType || 'audio/wav';
    // Prefer data URI — Replicate accepts data:audio/*;base64,...
    const dataUri = `data:${mime};base64,${audioBase64}`;

    // Create prediction (model endpoint — always latest demucs version)
    const createRes = await fetch('https://api.replicate.com/v1/models/cjwbw/demucs/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          audio: dataUri,
          model: 'htdemucs',
          stem: 'none',
          output_format: 'wav',
          mp3_bitrate: 320,
          clip_mode: 'rescale',
          shifts: 1,
          overlap: 0.25,
          split: true,
          two_stems: null,
        },
      }),
    });

    let prediction = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      const msg = prediction?.detail || prediction?.error || `Replicate error ${createRes.status}`;
      return { ok: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
    }

    // Poll until succeeded / failed (max ~8 min)
    const deadline = Date.now() + 8 * 60 * 1000;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
      if (Date.now() > deadline) return { ok: false, error: 'Cloud stem job timed out. Try a shorter clip or Offline mode.' };
      await new Promise((r) => setTimeout(r, 2500));
      const pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
      const pollRes = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      prediction = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok) {
        return { ok: false, error: prediction?.detail || `Poll failed (${pollRes.status})` };
      }
    }

    if (prediction.status !== 'succeeded') {
      return { ok: false, error: prediction.error || `Stem job ${prediction.status || 'failed'}` };
    }

    // Output shapes vary: object with stem keys, or array of URLs
    const out = prediction.output;
    const urlMap = {};
    if (out && typeof out === 'object' && !Array.isArray(out)) {
      for (const [k, v] of Object.entries(out)) {
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) urlMap[k.toLowerCase()] = v;
        else if (v && typeof v === 'object' && typeof v.url === 'string') urlMap[k.toLowerCase()] = v.url;
      }
    } else if (Array.isArray(out)) {
      // Sometimes: [vocals, drums, bass, other] or list of {name,url}
      const names = ['vocals', 'drums', 'bass', 'other'];
      out.forEach((item, i) => {
        if (typeof item === 'string') urlMap[names[i] || `stem${i}`] = item;
        else if (item && typeof item === 'object') {
          const name = String(item.name || item.stem || names[i] || `stem${i}`).toLowerCase();
          const url = item.url || item.audio || item.file;
          if (url) urlMap[name] = url;
        }
      });
    }

    // Fallback: scan for known keys in nested output
    if (!Object.keys(urlMap).length && out) {
      const dump = JSON.stringify(out);
      const re = /"(vocals|drums|bass|other|guitar|piano|no_vocals)"\s*:\s*"(https?:[^"]+)"/gi;
      let m;
      while ((m = re.exec(dump))) urlMap[m[1].toLowerCase()] = m[2];
    }

    if (!Object.keys(urlMap).length) {
      return { ok: false, error: 'Cloud job finished but no stem URLs were returned. Try Offline mode or another file.' };
    }

    const stems = {};
    for (const [name, url] of Object.entries(urlMap)) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        stems[name] = buf.toString('base64');
      } catch {
        /* skip failed stem download */
      }
    }

    if (!Object.keys(stems).length) {
      return { ok: false, error: 'Could not download stem files from the cloud.' };
    }

    return {
      ok: true,
      stems,
      fileName: fileName || 'mix',
      model: 'htdemucs',
      source: 'replicate',
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

/**
 * Clipboard support.
 *
 * With no application menu, Electron registers no Cut/Copy/Paste accelerators,
 * so Ctrl+V does nothing in any input — which made it impossible to paste an
 * API key into Settings. A menu with the standard edit roles restores the
 * shortcuts; autoHideMenuBar keeps the bar itself out of the way.
 */
function installEditMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]));
}

/** Right-click menu: paste into any field, copy out of any selection. */
function attachContextMenu(win) {
  win.webContents.on('context-menu', (_event, props) => {
    const menu = new Menu();
    const { isEditable, selectionText, editFlags } = props;
    const hasSelection = Boolean(selectionText && selectionText.trim());

    if (isEditable) {
      menu.append(new MenuItem({ role: 'undo', enabled: editFlags.canUndo }));
      menu.append(new MenuItem({ role: 'redo', enabled: editFlags.canRedo }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut', enabled: editFlags.canCut }));
      menu.append(new MenuItem({ role: 'copy', enabled: editFlags.canCopy }));
      menu.append(new MenuItem({
        // Use the role when Electron reports paste is available; fall back to
        // writing the clipboard in directly so paste still works if it doesn't.
        label: 'Paste',
        enabled: editFlags.canPaste || Boolean(clipboard.readText()),
        click: () => win.webContents.paste(),
      }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else if (hasSelection) {
      menu.append(new MenuItem({ role: 'copy' }));
      menu.append(new MenuItem({ role: 'selectAll' }));
    } else {
      return; // nothing useful to offer
    }

    menu.popup({ window: win });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // 4.1.3: the layout is responsive from phone-width up to TV — let the
    // window shrink to the mobile breakpoint and grow without limit.
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#07050f',
    icon: path.join(__dirname, 'src/assets/icon.ico'),
    // Window title stays product version (4.2.0) — build pad is for installer filenames only
    title: 'Lyricist 4.2.0 Goes Quantum',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  installEditMenu();
  attachContextMenu(win);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Allow Google Fonts and OpenRouter in packaged app.
  // 4.1.3: media-src added so the persistent Suno player can stream tracks
  // from any https audio host (e.g. cdn*.suno.ai) and play local uploads
  // (blob:) — plus mediastream: for voice-memo recording in MIDI Studio.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com https://openrouter.ai https://api.replicate.com https://replicate.delivery https://api.datamuse.com https://api.dictionaryapi.dev https://img.buymeacoffee.com https://generativelanguage.googleapis.com data: blob:; " +
          "media-src 'self' https: blob: data: mediastream:;"
        ],
      },
    });
  });

  // 4.1.3: MIDI Studio records voice memos via getUserMedia — grant the mic
  // (and only the mic/media class of permissions) inside the packaged app.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
