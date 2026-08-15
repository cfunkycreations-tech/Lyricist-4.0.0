const { contextBridge, ipcRenderer } = require('electron');

// The splash needs to say exactly one thing to the main process: "I'm done,
// the app can take the screen now." Nothing else is exposed — this window
// shows a video and closes, and a preload with a wider surface on an
// always-on-top window is a liability for no gain.
contextBridge.exposeInMainWorld('splash', {
  done: (why) => ipcRenderer.send('splash-done', String(why || 'clip')),
});
