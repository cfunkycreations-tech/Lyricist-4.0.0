// First, before anything reads storage: last launch's unsaved work is wiped.
import './services/freshStart.js';
import React from 'react';
import { startPrism } from './services/prismTheme.js';
import { startSurface } from './services/surfaceTheme.js';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './styles/opsec.css';
import './styles/materials.css';
import { startWheelControls } from './services/wheelControls.js';
import { registerPWA } from './web/registerPWA.js';
import { installPhoneAudio } from './web/iosAudio.js';
import { installPhoneSave } from './web/iosSave.js';
import NetStatus from './web/NetStatus.jsx';
import DesktopUpdate from './web/DesktopUpdate.jsx';
import PurchaseLock from './web/PurchaseLock.jsx';
import WhatsNew from './web/WhatsNew.jsx';
import SplashIntro from './web/SplashIntro.jsx';
import PhoneInvite from './web/PhoneInvite.jsx';
import DialogHost from './components/common/DialogHost.jsx';
import { initAnalytics, track } from './services/analytics.js';
import { APP_VERSION, BUILD_NUMBER } from './buildInfo.js';

// Installable on a phone. No-op inside Electron - see the file.
registerPWA();
// iPhone: play through the silent switch, wake audio on the first tap, and
// turn Download buttons into the share sheet in the installed app. Both are
// no-ops in Electron and on desktop browsers - see the files.
installPhoneAudio();
installPhoneSave();

// Product analytics. Does nothing at all — no chunk fetched, no socket opened —
// in a build with no VITE_POSTHOG_KEY, which is what makes the footer's
// Air-Gapped Safe claim true for the commercial installer. See analytics.js for
// what is and is not collected. Never awaited: a slow or blocked analytics load
// must not delay the first paint.
initAnalytics();
// One per launch: which build, and phone or desktop. Nothing else.
track('app_opened', {
  platform: window.lyricistAPI ? 'desktop' : (window.matchMedia?.('(pointer: coarse)').matches ? 'phone' : 'web'),
  version: APP_VERSION,
  build: Number(BUILD_NUMBER) || 0,
});

// Surface boot errors instead of a silent black screen
class BootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Lyricist boot error:', error, info);
  }
  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.stack || this.state.error?.message || this.state.error);
      return (
        <div style={{
          minHeight: '100vh', background: '#0b0d10', color: '#e6e8eb',
          padding: 32, fontFamily: 'Segoe UI, system-ui, sans-serif',
        }}>
          <h1 style={{ color: '#ff6b9d', marginTop: 0 }}>Lyricist Pro failed to start</h1>
          <p style={{ color: '#e6e8eb' }}>Copy this and send it so it can be fixed:</p>
          <pre style={{
            whiteSpace: 'pre-wrap', background: '#101215', padding: 16,
            borderRadius: 12, border: '1px solid #9ba1aa', color: '#e6e8eb',
            fontSize: 13, lineHeight: 1.45,
          }}>{msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

startPrism();
startSurface();
startWheelControls();

const rootEl = document.getElementById('root');
try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BootErrorBoundary>
        {/* Phone build: asks for the Gumroad purchase code once. Passes
            straight through in the desktop app and on the dev server. */}
        <PurchaseLock>
          <App />
          {/* The 8s opener, over everything until it ends. Phones get it
              sideways only - see SplashIntro.jsx. */}
          <SplashIntro />
          {/* Every fresh open, for everyone: what changed. See WhatsNew.jsx. */}
          <WhatsNew />
          {/* Desktop only: how to put it on the phone, first thing, once. */}
          <PhoneInvite />
        </PurchaseLock>
        {/* In-app alert / confirm / prompt (services/dialog.js). */}
        <DialogHost />
        {/* Web only: offline notice and the new-version Reload bar. */}
        <NetStatus />
        {/* Desktop only: a newer build downloaded, installs on close. */}
        <DesktopUpdate />
      </BootErrorBoundary>
    </React.StrictMode>
  );
} catch (e) {
  console.error(e);
  rootEl.innerHTML = `<div style="padding:32px;color:#fff;background:#0b0d10;min-height:100vh;font-family:sans-serif">
    <h1 style="color:#ff6b9d">Lyricist Pro failed to start</h1>
    <pre style="white-space:pre-wrap;color:#e6e8eb"></pre>
  </div>`;
  // As text, never as markup.
  rootEl.querySelector('pre').textContent = String(e?.stack || e);
}

window.addEventListener('error', (ev) => {
  console.error('window.error', ev.error || ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('unhandledrejection', ev.reason);
});
