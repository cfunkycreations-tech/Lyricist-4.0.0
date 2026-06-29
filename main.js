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

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#07050f',
    icon: path.join(__dirname, 'src/assets/icon.ico'),
    title: 'Lyricist 4.0.12',
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
  // Allow Google Fonts and OpenRouter in packaged app
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com https://openrouter.ai https://api.datamuse.com https://api.dictionaryapi.dev https://img.buymeacoffee.com data: blob:;"
        ],
      },
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
