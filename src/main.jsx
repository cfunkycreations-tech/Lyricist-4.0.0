import React from 'react';
import { startPrism } from './services/prismTheme.js';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './styles/opsec.css';
import './styles/materials.css';
import { startWheelControls } from './services/wheelControls.js';
import { registerPWA } from './web/registerPWA.js';
import LandscapeSplash from './web/LandscapeSplash.jsx';
import DialogHost from './components/common/DialogHost.jsx';
import { initAnalytics } from './services/analytics.js';

// Installable on a phone. No-op inside Electron - see the file.
registerPWA();

// Product analytics. Does nothing at all — no chunk fetched, no socket opened —
// in a build with no VITE_POSTHOG_KEY, which is what makes the footer's
// Air-Gapped Safe claim true for the commercial installer. See analytics.js for
// what is and is not collected. Never awaited: a slow or blocked analytics load
// must not delay the first paint.
initAnalytics();

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
startWheelControls();

const rootEl = document.getElementById('root');
try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BootErrorBoundary>
        {/* Web only. Turns the phone sideways and locks it, then gets out of
            the way. Renders nothing inside the desktop app. */}
        <LandscapeSplash />
        <App />
        {/* In-app alert / confirm / prompt (services/dialog.js). */}
        <DialogHost />
      </BootErrorBoundary>
    </React.StrictMode>
  );
} catch (e) {
  console.error(e);
  rootEl.innerHTML = `<div style="padding:32px;color:#fff;background:#0b0d10;min-height:100vh;font-family:sans-serif">
    <h1 style="color:#ff6b9d">Lyricist Pro failed to start</h1>
    <pre style="white-space:pre-wrap;color:#e6e8eb">${String(e?.stack || e)}</pre>
  </div>`;
}

window.addEventListener('error', (ev) => {
  console.error('window.error', ev.error || ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('unhandledrejection', ev.reason);
});
