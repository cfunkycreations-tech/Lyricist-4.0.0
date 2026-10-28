/**
 * DESKTOP UPDATES.
 *
 * Chris, 2026-10-15: "build electron update ... into the app today."
 *
 * A customer installs Lyricist Pro once from Gumroad. Without this, every fix
 * after that day never reached them. Now the customer build looks for a newer
 * build on GitHub Releases, downloads it in the background, checks it byte for
 * byte, and installs it when they close the app, or right away if they press
 * Restart now on the bar.
 *
 * WHY NOT electron-updater. The packaged app ships no node_modules at all
 * (package.json "files": "!node_modules/**"), so a library with a tree of
 * dependencies would have meant packaging that tree by hand. This is the whole
 * job in one file with nothing but Node and Electron.
 *
 * THE RULES IT KEEPS:
 * - Customer edition only. Chris's own build has the Ghost in it; updating it
 *   to a customer build would take the Ghost away. (The publish script refuses
 *   to publish anything but a customer build, too: the repo is public.)
 * - Never restarts on its own. Closing the app clears the page, and a song in
 *   progress is the one thing it must never throw away.
 * - Every failure is silent: offline, GitHub down, a bad download. The next
 *   check tries again.
 * - Nothing is trusted that does not match: the downloaded file must have the
 *   exact size and SHA-512 the manifest names, or it is deleted.
 * - Nothing is trusted that Chris did not sign. The manifest carries an Ed25519
 *   signature made with a key on his PC (scripts/update-key.mjs); release.mjs
 *   bakes the public half into this build. A release pushed by anyone else,
 *   even with his GitHub login, is ignored.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

// Updates come from a public repo that holds nothing but releases (installers
// and update.json). The source repo, Lyricist-4.0.0, is made private
// (Chris, 2026-10-28: copyright and the free creator build were public).
// Installers are still accepted from the old repo, for the one update that
// moved everyone over.
const REPO = 'cfunkycreations-tech/lyricist-pro-releases';
const OLD_REPO = 'cfunkycreations-tech/Lyricist-4.0.0';
// GitHub redirects this to the newest release's own copy of the file, so the
// app needs no token, no API and no rate limit.
const MANIFEST = `https://github.com/${REPO}/releases/latest/download/update.json`;
const FIRST_CHECK_MS = 30 * 1000;
const EVERY_MS = 4 * 60 * 60 * 1000;

/** The edition and build release.mjs baked in (--config.extraMetadata). */
function stamp() {
  try {
    const pkg = require('./package.json');
    return { edition: pkg.lyricistEdition || '', build: Number(pkg.lyricistBuild) || 0, key: pkg.lyricistUpdateKey || '' };
  } catch {
    return { edition: '', build: 0, key: '' };
  }
}

/** Exactly what gets signed. scripts/update-key.mjs signs this same string. */
function updateMessage(m) {
  return ['lyricist-update', m.edition, m.build, m.version, m.url, m.size, m.sha512].join('\n');
}

/** The manifest was signed by the key this build trusts. */
function signedBy(m, keyB64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(keyB64, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(updateMessage(m)), key, Buffer.from(String(m.sig || ''), 'base64'));
  } catch {
    return false;
  }
}

/** Size and SHA-512 (base64, the way electron-builder writes it) both match. */
async function matches(file, want) {
  try {
    if (fs.statSync(file).size !== Number(want.size)) return false;
    const hash = crypto.createHash('sha512');
    await pipeline(fs.createReadStream(file), hash);
    return hash.digest('base64') === want.sha512;
  } catch {
    return false;
  }
}

function register({ app, ipcMain, net, BrowserWindow, manifestUrl = MANIFEST, force = false, stampOverride = null }) {
  const mine = stampOverride || stamp();
  const enabled = !!mine.key && (force || (app.isPackaged && process.platform === 'win32'
    && mine.edition === 'customer' && mine.build > 0));

  let ready = null;        // { build, version, file }
  let launched = false;

  const announce = () => {
    if (!ready) return;
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('desktop-update', { build: ready.build, version: ready.version }); } catch { /* closing */ }
    }
  };

  const install = (args) => {
    if (!ready || launched) return false;
    launched = true;
    try {
      spawn(ready.file, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      return true;
    } catch {
      launched = false;
      return false;
    }
  };

  ipcMain.handle('desktop-update-state', () => (ready ? { build: ready.build, version: ready.version } : null));
  // /S installs silently over this copy; --force-run opens the new one after.
  ipcMain.handle('desktop-update-install', () => {
    if (!install(['/S', '--force-run'])) return false;
    setTimeout(() => app.quit(), 300);
    return true;
  });

  if (!enabled) return { check: async () => null };

  // Closed normally with an update waiting: it installs on the way out, and the
  // next launch is the new version.
  app.on('will-quit', () => { if (ready) install(['/S']); });

  const dir = path.join(app.getPath('userData'), 'updates');

  async function check() {
    try {
      const res = await net.fetch(`${manifestUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const m = await res.json();
      const build = Number(m.build);
      if (!(build > mine.build) || m.edition !== 'customer' || !m.url || !m.sha512 || !m.size) return null;
      if (!signedBy(m, mine.key)) return null;
      // The installer only ever comes from our own releases.
      const from = String(m.url);
      if (!force && ![REPO, OLD_REPO].some((r) => from.startsWith(`https://github.com/${r}/releases/download/`))) return null;
      if (ready && ready.build >= build) return ready;

      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `Lyricist-update-${build}.exe`);
      if (!(await matches(target, m))) {
        const part = `${target}.part`;
        const r = await net.fetch(m.url);
        if (!r.ok || !r.body) return null;
        await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(part));
        if (!(await matches(part, m))) {
          try { fs.unlinkSync(part); } catch { /* gone */ }
          return null;
        }
        fs.renameSync(part, target);
      }
      // Older downloads are dead weight.
      for (const f of fs.readdirSync(dir)) {
        if (path.join(dir, f) !== target) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* in use */ } }
      }
      ready = { build, version: String(m.version || ''), file: target };
      announce();
      return ready;
    } catch {
      return null;
    }
  }

  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, EVERY_MS);
  // A window that opens after the download still hears about it.
  app.on('browser-window-created', (_e, w) => w.webContents.once('did-finish-load', announce));
  return { check };
}

module.exports = { register, matches, stamp, updateMessage, signedBy };
