import React from 'react';
import { startPrism } from './services/prismTheme.js';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerPWA } from './web/registerPWA.js';
import LandscapeSplash from './web/LandscapeSplash.jsx';

// Installable on a phone. No-op inside Electron - see the file.
registerPWA();

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
          minHeight: '100vh', background: '#0a0614', color: '#f3e8ff',
          padding: 32, fontFamily: 'Segoe UI, system-ui, sans-serif',
        }}>
          <h1 style={{ color: '#ff6b9d', marginTop: 0 }}>Lyricist failed to start</h1>
          <p style={{ color: '#c4b5fd' }}>Copy this and send it so it can be fixed:</p>
          <pre style={{
            whiteSpace: 'pre-wrap', background: '#12081c', padding: 16,
            borderRadius: 12, border: '1px solid #7c3aed', color: '#e9d5ff',
            fontSize: 13, lineHeight: 1.45,
          }}>{msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

startPrism();

const rootEl = document.getElementById('root');
try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BootErrorBoundary>
        {/* Web only. Turns the phone sideways and locks it, then gets out of
            the way. Renders nothing inside the desktop app. */}
        <LandscapeSplash />
        <App />
      </BootErrorBoundary>
    </React.StrictMode>
  );
} catch (e) {
  console.error(e);
  rootEl.innerHTML = `<div style="padding:32px;color:#fff;background:#0a0614;min-height:100vh;font-family:sans-serif">
    <h1 style="color:#ff6b9d">Lyricist failed to start</h1>
    <pre style="white-space:pre-wrap;color:#e9d5ff">${String(e?.stack || e)}</pre>
  </div>`;
}

window.addEventListener('error', (ev) => {
  console.error('window.error', ev.error || ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('unhandledrejection', ev.reason);
});
