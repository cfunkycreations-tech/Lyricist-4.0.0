/**
 * THE ONLY PAGE A STRANGER GETS.
 *
 * functions/_middleware.js answers every page request without the unlock
 * cookie with this, and nothing else: not the app, not its scripts, not its
 * sounds. Same look as src/web/PurchaseLock.jsx, which still guards the
 * Windows app.
 *
 * Phones unlocked before the cookie existed have their code saved in the
 * browser (lyricist.unlock, same origin). This page sends it by itself, so
 * those people see "Checking…" for a second and then the app.
 */
export const LOCK_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#04060f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png">
<title>Black Hole Studios</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #050208; }
  body {
    display: flex; min-height: 100vh; min-height: 100dvh; box-sizing: border-box;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
             max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: radial-gradient(80% 70% at 50% 35%, rgba(255, 120, 40, .16), transparent 62%), #050208;
    color: #FFF4E2; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  form {
    width: 100%; max-width: 440px; margin: auto;
    display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;
  }
  img { width: 120px; height: 120px; border-radius: 26px; filter: drop-shadow(0 0 24px rgba(255, 120, 40, .35)); }
  h1 { margin: 0; font-weight: 400; font-size: 24px; letter-spacing: .04em; text-transform: uppercase; }
  .lede { margin: 0; color: rgba(255, 244, 226, .78); }
  input {
    width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
    border: 1px solid rgba(255, 138, 61, .45); background: rgba(255, 255, 255, .05);
    color: #FFF4E2; font: min(15px, 3.6vw)/1.2 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .04em;
    text-align: center; outline: none;
  }
  input:focus { border-color: #FF8A3D; box-shadow: 0 0 0 3px rgba(255, 138, 61, .22); }
  button {
    width: 100%; padding: 12px; border: 0; border-radius: 10px; cursor: pointer;
    background: #FF8A3D; color: #160a02; font-size: 16px; letter-spacing: .08em; text-transform: uppercase;
  }
  button:disabled { opacity: .5; cursor: default; }
  .why { margin: 0; color: #ffb4a1; }
  .why:empty { display: none; }
  .buy { margin: 4px 0 0; font-size: 13px; color: rgba(255, 244, 226, .62); }
  .buy a { color: #FFB25A; }
  /* Sideways phone: about 390px tall. */
  @media (max-height: 520px) {
    form { gap: 8px; max-width: 520px; }
    img { width: 72px; height: 72px; border-radius: 16px; }
    h1 { font-size: 19px; }
    .lede, .why { font-size: 13px; }
    input, button { padding: 9px 12px; }
  }
</style>
</head>
<body>
<form id="f" autocomplete="off">
  <img src="/pwa/icon-192.png" alt="">
  <h1>Black Hole Studios</h1>
  <p class="lede">Enter the purchase code from your Gumroad receipt. Once per phone.</p>
  <input id="c" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" aria-label="Purchase code"
    autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false">
  <button id="go" type="submit" disabled>Unlock</button>
  <p class="why" id="why" role="alert"></p>
  <p class="buy">No code yet? <a href="https://gumroad.com/l/pzglwj" target="_blank" rel="noreferrer">Get Lyricist Pro on Gumroad</a></p>
</form>
<script>
(function () {
  var STORE = 'lyricist.unlock';
  var f = document.getElementById('f'), c = document.getElementById('c');
  var go = document.getElementById('go'), why = document.getElementById('why');
  var busy = false;
  function sync() { go.disabled = busy || !c.value.trim(); go.textContent = busy ? 'Checking\\u2026' : 'Unlock'; }
  function saved() {
    try { var v = JSON.parse(localStorage.getItem(STORE) || 'null'); return v && typeof v.code === 'string' && v.code ? v.code : ''; }
    catch (e) { return ''; }
  }
  function unlock(code) {
    busy = true; why.textContent = ''; sync();
    fetch('/api/unlock', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
      if (d.ok) {
        try { localStorage.setItem(STORE, JSON.stringify({ code: code, at: Date.now(), checked: Date.now() })); } catch (e) {}
        location.reload();
        return;
      }
      if (d.revoked) { try { localStorage.removeItem(STORE); } catch (e) {} }
      why.textContent = d.why || 'That code did not work. Copy it straight from your receipt.';
      busy = false; sync();
    }).catch(function () {
      why.textContent = 'No connection. Unlocking needs the internet once; after that it works offline.';
      busy = false; sync();
    });
  }
  c.addEventListener('input', sync);
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = c.value.trim();
    if (code && !busy) unlock(code);
  });
  var had = saved();
  if (had) { c.value = had; unlock(had); } else { sync(); }
})();
</script>
</body>
</html>
`;
