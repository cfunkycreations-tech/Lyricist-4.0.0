/**
 * THE KEY THAT SIGNS DESKTOP UPDATES.
 *
 * Chris, 2026-10-15: "I don't want people hacking into my app." Every customer
 * copy installs whatever releases/latest/download/update.json points at. The
 * size and SHA-512 only prove the download matches the manifest; whoever can
 * publish a release on GitHub could publish a matching pair. So the manifest
 * is signed with a key that lives only on Chris's PC, and the app (which has
 * the public half baked in by release.mjs) refuses anything it did not sign.
 *
 * The private key is a file OUTSIDE the repo and outside OneDrive:
 *   %USERPROFILE%\.lyricist\update-signing-key.pem   (or LYRICIST_UPDATE_KEY)
 * The first customer release makes it. Back it up: lose it and installed
 * copies stop updating themselves until each person reinstalls by hand.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { updateMessage } = require('../desktopUpdate.js');

export const KEY_PATH = process.env.LYRICIST_UPDATE_KEY
  || path.join(os.homedir(), '.lyricist', 'update-signing-key.pem');

/** The private key, made on first use. */
export function loadOrCreateKey() {
  if (!fs.existsSync(KEY_PATH)) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    fs.writeFileSync(KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log(`
╔════════════════════════════════════════════════════════════════
║  NEW UPDATE KEY MADE:  ${KEY_PATH}
║
║  Copy that file to a USB stick and keep it. Never email it, never
║  put it in OneDrive or GitHub. Lose it and copies already installed
║  stop updating themselves.
╚════════════════════════════════════════════════════════════════
`);
  }
  return crypto.createPrivateKey(fs.readFileSync(KEY_PATH));
}

/** The public half, as the app stores it (SPKI DER, base64). */
export function publicKeyB64(priv) {
  return crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).toString('base64');
}

export function signManifest(m, priv) {
  return crypto.sign(null, Buffer.from(updateMessage(m)), priv).toString('base64');
}

export function manifestSigned(m, priv) {
  try {
    return crypto.verify(null, Buffer.from(updateMessage(m)), crypto.createPublicKey(priv), Buffer.from(String(m.sig), 'base64'));
  } catch {
    return false;
  }
}
