const { app, BrowserWindow, session, ipcMain } = require('electron');
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
    title: 'Lyricist 4.1.3',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

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
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com https://openrouter.ai https://api.datamuse.com https://api.dictionaryapi.dev https://img.buymeacoffee.com https://generativelanguage.googleapis.com data: blob:; " +
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
