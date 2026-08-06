const { app, BrowserWindow, session, ipcMain, Menu, MenuItem, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// One copy at a time. A second instance can't take the profile lock the first
// one holds, so its storage comes up broken and the window can land black —
// bring the window you already have to the front instead.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  // quit() alone is not enough — 'ready' can still fire and build a window
  // before the process is torn down, which is the very thing we're avoiding.
  app.exit(0);
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });
}

// If the GPU process died on the last run, come back up on software rendering
// rather than showing another black window. Delete the marker each time so the
// app goes straight back to the fast path once the driver behaves.
// This has to happen before the app is ready, hence up here.
try {
  const marker = path.join(app.getPath('userData'), 'disable-gpu');
  if (fs.existsSync(marker)) {
    fs.unlinkSync(marker);
    app.disableHardwareAcceleration();
  }
} catch { /* never block startup over this */ }

// Let the UI write into boot.log. See preload.js for why.
ipcMain.handle('app-log', async (event, { message }) => {
  bootLog(`ui: ${String(message).slice(0, 500)}`);
  return { ok: true };
});

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
        { type: 'separator' },
        {
          // Escape hatch for a black window. The app is running fine underneath
          // — the graphics driver just isn't drawing it — so restart on
          // software rendering, which always paints.
          label: 'Fix a black screen (restart without GPU)',
          click: () => {
            try {
              fs.writeFileSync(path.join(app.getPath('userData'), 'disable-gpu'), 'user requested', 'utf8');
            } catch { /* still worth trying the relaunch */ }
            bootLog('user asked for a software-rendering restart');
            app.relaunch();
            app.exit(0);
          },
        },
        {
          label: 'Open the boot log folder',
          click: () => shell.showItemInFolder(path.join(app.getPath('userData'), 'boot.log')),
        },
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

/**
 * Boot log — a black window tells you nothing, so write down what actually
 * happened. Lives next to the app's data at %APPDATA%\Lyricist\boot.log and
 * keeps the last run plus the current one.
 */
function bootLog(message) {
  try {
    const file = path.join(app.getPath('userData'), 'boot.log');
    const line = `[${new Date().toISOString()}] ${message}\n`;
    // Don't let it grow forever.
    if (fs.existsSync(file) && fs.statSync(file).size > 200_000) {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(-50_000), 'utf8');
    }
    fs.appendFileSync(file, line, 'utf8');
  } catch { /* logging must never break the app */ }
}

/** Last-resort page, so the user always sees words instead of a black rectangle. */
function failurePage(title, detail) {
  const html = `<!doctype html><html><body style="margin:0;background:#0a0614;color:#f3e8ff;
    font-family:Segoe UI,system-ui,sans-serif;padding:40px">
    <h1 style="color:#ff6b9d;margin:0 0 8px">${title}</h1>
    <p style="color:#c4b5fd;margin:0 0 18px">Lyricist opened, but the page never loaded. Nothing you
    saved is affected. Send this over and it gets fixed:</p>
    <pre style="white-space:pre-wrap;background:#12081c;padding:16px;border-radius:12px;
      border:1px solid #7c3aed;color:#e9d5ff;font-size:13px;line-height:1.45">${detail}</pre>
    <p style="color:#7c6f9c;font-size:12px;margin-top:18px">A full log is at %APPDATA%\\Lyricist\\boot.log</p>
    </body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
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
    // Don't put an empty frame on screen. A window painted before its content
    // is exactly the black rectangle people report as "the app is black".
    show: false,
  });

  installEditMenu();
  attachContextMenu(win);

  let shown = false;
  const reveal = (why) => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    bootLog(`window shown (${why})`);
    win.show();
  };

  win.once('ready-to-show', () => reveal('ready-to-show'));
  // If the content stalls, show the window anyway — never leave the user
  // staring at a taskbar icon that opens nothing.
  const revealTimer = setTimeout(() => reveal('timeout after 12s'), 12_000);
  win.on('closed', () => clearTimeout(revealTimer));

  win.webContents.on('did-finish-load', () => bootLog('did-finish-load'));

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;                   // a missing image is not a dead app
    bootLog(`did-fail-load ${code} ${desc} ${url}`);
    win.loadURL(failurePage('Lyricist could not load', `${desc} (${code})\n${url}`));
    reveal('load failure');
  });

  // A dead renderer or GPU process is the other way this ends up black. Say so,
  // and give the page one clean retry before showing the failure card.
  let reloadedAfterCrash = false;
  win.webContents.on('render-process-gone', (_e, details) => {
    bootLog(`render-process-gone ${details.reason} exit=${details.exitCode}`);
    if (!reloadedAfterCrash && !win.isDestroyed()) {
      reloadedAfterCrash = true;
      win.reload();
      reveal('renderer crash retry');
      return;
    }
    if (!win.isDestroyed()) {
      const oom = details.reason === 'oom';
      win.loadURL(failurePage(
        oom ? 'Lyricist ran out of memory' : 'Lyricist stopped responding',
        oom
          ? 'The page was killed for using too much memory, twice in a row.\n\n'
            + 'Closing a few browser tabs or other heavy apps and reopening Lyricist\n'
            + 'usually clears it. Send over %APPDATA%\\Lyricist\\boot.log either way.'
          : `Renderer process gone: ${details.reason}`,
      ));
      reveal('renderer crash');
    }
  });

  win.webContents.on('unresponsive', () => bootLog('renderer unresponsive'));

  // Memory watch. An OOM with 36 GB free means one specific thing in the page
  // is allocating hard, so sample the renderer every 10s alongside whichever
  // tab is open. When it dies, the log says what it was doing on the way down.
  let peakMB = 0;
  const memTimer = setInterval(async () => {
    if (win.isDestroyed()) return;
    let tab = '?';
    try {
      tab = await win.webContents.executeJavaScript('window.__lyricistActiveTab || "?"', true);
    } catch { /* renderer busy — still worth logging the memory */ }
    try {
      // app.getAppMetrics() is the API that exists in this Electron.
      // webContents.getProcessMemoryInfo() was removed, and the version of this
      // watch that used it threw on every sample and logged nothing at all.
      const pid = win.webContents.getOSProcessId();
      const me = app.getAppMetrics().find((m) => m.pid === pid);
      const mb = Math.round((me?.memory?.workingSetSize || 0) / 1024);
      if (!mb) return;
      const jumped = mb > peakMB + 200;
      bootLog(`mem ${mb} MB  tab=${tab}${jumped ? '  JUMP' : ''}`);
      if (mb > peakMB) peakMB = mb;
    } catch (e) {
      bootLog(`mem sample failed: ${e?.message || e}`);
    }
  }, 5_000);

  // Renderer errors and warnings land in the log too — an allocation that fails
  // usually says so in the console a moment before the process dies.
  // Electron changed this event's shape: older builds pass
  // (event, level:number, message), newer ones pass a single object with
  // level as a string. Handle both, or the log silently stays empty.
  win.webContents.on('console-message', (...args) => {
    const first = args[0];
    const isObject = first && typeof first === 'object' && 'message' in first;
    const level = isObject ? first.level : args[1];
    const message = isObject ? first.message : args[2];
    const bad = level === 3 || level === 2 || level === 'error' || level === 'warning';
    if (!bad) return;
    const kind = level === 3 || level === 'error' ? 'error' : 'warn';
    bootLog(`renderer ${kind}: ${String(message).slice(0, 400)}`);
  });
  win.on('closed', () => {
    clearInterval(memTimer);
    bootLog(`window closed — peak renderer memory ${peakMB} MB`);
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  bootLog(`createWindow packaged=${app.isPackaged} dev=${isDev} v=${app.getVersion()}`);
  const startTabDev = process.env.LYRICIST_START_TAB;
  if (isDev) {
    win.loadURL(`http://localhost:5173${startTabDev ? `#tab=${startTabDev}` : ''}`);
  } else {
    const index = path.join(__dirname, 'dist/index.html');
    if (!fs.existsSync(index)) {
      bootLog(`MISSING ${index}`);
      win.loadURL(failurePage('Lyricist is missing its app files', `Not found:\n${index}\n\nReinstall over the top of this copy.`));
      reveal('missing index.html');
      return;
    }
    // LYRICIST_START_TAB=loopstation opens straight onto that tab, so a crash
    // can be reproduced where it actually happens.
    const startTab = process.env.LYRICIST_START_TAB;
    const off = process.env.LYRICIST_OFF;
    const wipe = process.env.LYRICIST_WIPE;
    const hash = [startTab && `tab=${startTab}`, off && `off=${off}`, wipe && `wipe=${wipe}`]
      .filter(Boolean).join('&');
    win.loadFile(index, hash ? { hash } : undefined);
  }
}

app.whenReady().then(() => {
  // Belt and braces: a losing second instance never gets as far as a window.
  if (!gotInstanceLock) return;

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

// A GPU process that dies takes the picture with it and leaves a black window.
// Log it, and fall back to software rendering for the next start so the app
// comes up looking right even on a bad driver day.
app.on('child-process-gone', (_e, details) => {
  bootLog(`child-process-gone type=${details.type} reason=${details.reason} exit=${details.exitCode}`);
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'disable-gpu'), 'gpu process crashed', 'utf8');
      bootLog('GPU crashed — software rendering armed for the next start');
    } catch { /* not worth failing over */ }
  }
});

process.on('uncaughtException', (err) => {
  bootLog(`uncaughtException ${err?.stack || err}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
