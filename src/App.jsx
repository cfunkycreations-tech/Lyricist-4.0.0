import React, { useState, useEffect } from 'react';
import { LyricStoreProvider, useLyricStore } from './context/LyricStore.jsx';
import SongwriterHub from './components/SongwriterHub/SongwriterHub.jsx';
import ArtistAnalyzer from './components/ArtistAnalyzer/ArtistAnalyzer.jsx';
import RhymeHelper from './components/RhymeHelper/RhymeHelper.jsx';
import Scratchpad from './components/Scratchpad/Scratchpad.jsx';
import Thesaurus from './components/Thesaurus/Thesaurus.jsx';
import Dictionary from './components/Dictionary/Dictionary.jsx';
import Settings from './components/Settings/Settings.jsx';
import HelpLayer from './components/common/HelpLayer.jsx';
import OnboardingWizard from './components/Onboarding/OnboardingWizard.jsx';

import bgImg from './assets/cfunky-bg-new.jpg';   // new Austin street-scene background (4.0.2)
import profileImg from './assets/profile.jpg';     // new founder selfie
import logoImg from './assets/logo.jpg';           // new neon medallion logo
import funksignImg from './assets/funksign.jpg';   // CFunky signature on black (4.0.9)
import funk003Img from './assets/funk003.png';     // Christopher Funk profile photo (4.0.9)
import logo407Img from './assets/logo407.png';     // new transparent medallion logo (4.0.9)
import footerMedallionImg from './assets/footer-medallion.png'; // footer medallion (4.0.9)

const tabs = [
  { id: 'songwriter', icon: '🎵', label: 'Songwriter', help: 'The main workspace. Set up the kind of song you want (style, mood, topic), then write and polish the lyrics line by line.' },
  { id: 'analyzer', icon: '👻', label: 'Ghost Rider', help: 'Studies any artist you name and breaks down how they write, then helps you write a NEW song in that same style. (It does not copy their actual lyrics.)' },
  { id: 'rhyme', icon: '📖', label: 'Rhyme Helper', help: 'A rhyming dictionary and rhyme finder. Look up words that rhyme, and check the rhymes inside lines you have already written.' },
  { id: 'thesaurus', icon: '📚', label: 'Thesaurus', help: 'A word finder: type a word to get other words that mean the same, words that mean the opposite, and related ideas. Free, no AI key needed.' },
  { id: 'dictionary', icon: '📕', label: 'Dictionary', help: 'Look up what a word means, how to say it, and example sentences — in English or Spanish. Free, no AI key needed.' },
  { id: 'scratchpad', icon: '📝', label: 'Scratchpad', help: 'A free, blank notepad for jotting ideas, hooks, or lines. It saves automatically on your computer so nothing gets lost.' },
  { id: 'settings', icon: '⚙️', label: 'Settings', help: 'Where you connect your AI key and choose which AI model writes your lyrics. Set this up first so the rest of the app works.' }
];

function MainLayout() {
  const store = useLyricStore();
  const [activeTab, setActiveTab] = useState('songwriter');
  const [ghostRiderData, setGhostRiderData] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  const handleGhostSend = (data) => {
    setGhostRiderData(data);
    setActiveTab('songwriter');
  };

  // Reflect the global Tips switch on <body> so [data-help] elements get the
  // "you can hover me for help" cursor only when Tips are turned on.
  useEffect(() => {
    document.body.classList.toggle('tips-on', store.tipsEnabled);
  }, [store.tipsEnabled]);

  // Auto-launch the guided tour the very first time the app is opened.
  useEffect(() => {
    if (localStorage.getItem('lyricistOnboarded') !== 'true') {
      setShowWizard(true);
    }
  }, []);

  const closeWizard = () => {
    setShowWizard(false);
    localStorage.setItem('lyricistOnboarded', 'true');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ color: '#e8e0ff', position: 'relative', overflow: 'hidden' }}>
      {/* App-wide hover-help engine: hovering any element with data-help shows a bubble. */}
      <HelpLayer />

      {/* First-run guided tour (re-launchable from the header "Take the Tour" button). */}
      {showWizard && (
        <OnboardingWizard onClose={closeWizard} onNavigate={setActiveTab} />
      )}

      {/* Background — new Austin street-scene art (4.0.2). */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: `url(${bgImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat'
        }}
      />
      {/* Lighter overlay (4.0.5) — lets the Austin street-scene art show through
          while keeping just enough darkness that on-screen text stays readable. */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(6,3,16,0.50) 0%, rgba(9,5,22,0.58) 45%, rgba(5,2,14,0.74) 100%)'
        }}
      />

      {/* Main Layout Wrap */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100vh' }}>
        {/* Header — medallion | signature | photo | title | controls (4.0.9) */}
        <div className="header-cosmic" style={{ flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', background: '#000000', height: 220, overflow: 'hidden', width: '100%' }}>

          {/* 1. Medallion logo — fills full header height top-to-bottom */}
          <img
            src={logo407Img}
            alt="CFunky Creations Lyricist 4.0.12"
            style={{ height: 160, width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
          />

          {/* 2. Signature — 1/4 inch (24px) gap from medallion */}
          <img
            src={funksignImg}
            alt="CFunky Signature"
            style={{ height: 175, width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0, marginLeft: 24 }}
          />

          {/* 3. Profile photo — 1/4 inch (24px) gap from signature, feet touch bottom */}
          <div style={{ flexShrink: 0, height: '100%', display: 'flex', alignItems: 'flex-end', marginLeft: 24 }}>
            <img
              src={funk003Img}
              alt="Christopher Funk"
              style={{ height: 220, width: 'auto', display: 'block', filter: 'drop-shadow(0 0 14px #ff2d95) drop-shadow(0 0 32px rgba(255,45,149,0.55)) drop-shadow(0 0 60px rgba(255,45,149,0.25))' }}
            />
          </div>

          {/* 4. LYRICIST title — fills remaining space */}
          <div style={{"flex":1,"display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","textAlign":"center","paddingRight":260,"paddingLeft":20,"paddingBottom":28,"overflow":"hidden","minWidth":0}}>
            <h1
              className="gradient-title leading-none"
              style={{"fontSize":"clamp(2.5rem, 4.5vw, 6.5rem)","fontWeight":400,"letterSpacing":"0.04em","marginBottom":4,"whiteSpace":"nowrap"}}
              data-help="Lyricist is your songwriting studio. Pick a vibe, give it a topic, and it helps you write full songs, line by line — then polish them. Everything here is explained: just hover over anything you don't recognize."
            >
              LYRICIST 4.0.12
            </h1>
            <p style={{ fontSize: '0.7rem', color: '#ff2d95', letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0, textShadow: '0 0 8px rgba(255,45,149,0.7), 0 0 20px rgba(255,45,149,0.35)' }}>
              AI-Powered Songwriting Studio · CFunkyCreations LLC
            </p>
          </div>

          {/* Controls — stacked vertically on the right */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)' }}>
            {/* Re-launch the guided tour any time */}
            <button
              onClick={() => setShowWizard(true)}
              data-help="New here, or want a refresher? Click to replay the guided tour that walks you through the whole app."
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 9999,
                cursor: 'pointer',
                background: 'rgba(34,211,238,0.14)',
                color: '#67e8f9',
                border: '1px solid rgba(34,211,238,0.4)',
                transition: 'all 0.15s'
              }}
            >
              <span>🧭</span>
              Take the Tour
            </button>

            {/* Global Tips switch — turns every help bubble in the app on or off */}
            <button
              onClick={() => store.setTipsEnabled(!store.tipsEnabled)}
              data-help="Turns the pop-up help bubbles on or off for the whole app. Leave it ON while you're learning — hover over anything and it'll explain what it does in plain English."
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 9999,
                cursor: 'pointer',
                background: store.tipsEnabled ? 'rgba(255,45,149,0.18)' : 'rgba(80,70,90,0.15)',
                color: store.tipsEnabled ? '#ffc8e0' : 'rgba(170,150,160,0.7)',
                border: `1px solid ${store.tipsEnabled ? 'rgba(255,45,149,0.5)' : 'rgba(140,120,130,0.35)'}`,
                transition: 'all 0.15s'
              }}
            >
              <span>💡</span>
              Tips: {store.tipsEnabled ? 'On' : 'Off'}
            </button>

            <div
              className={store.config.openRouterApiKey ? 'pill-green' : 'pill-red'}
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
              data-help="Shows whether your AI key is connected. Lyricist uses your own key (add it on the Settings tab) to write lyrics. Green padlock = ready to go. Red = add a key first or nothing will generate."
            >
              <span>{store.config.openRouterApiKey ? '🔓' : '🔒'}</span>
              {store.config.openRouterApiKey ? 'API Key Loaded' : 'API Key Required'}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(139,92,246,0.2)', background: '#080512', flexShrink: 0 }}>
          {tabs.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  if (t.id !== 'songwriter') setGhostRiderData(null);
                }}
                data-help={t.help}
                style={{
                  position: 'relative',
                  padding: '10px 22px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  fontFamily: "'Metamorphous', sans-serif",
                  border: 'none',
                  background: isActive ? 'rgba(255,45,149,0.18)' : 'transparent',
                  color: isActive ? '#ff2d95' : 'rgba(255,45,149,0.6)',
                  textShadow: isActive ? '0 0 10px rgba(255,45,149,0.8), 0 0 24px rgba(255,45,149,0.4)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  letterSpacing: '0.06em'
                }}
                onMouseEnter={(e) => { if (!isActive) { e.target.style.color = '#ff2d95'; e.target.style.textShadow = '0 0 8px rgba(255,45,149,0.6)'; } }}
                onMouseLeave={(e) => { if (!isActive) { e.target.style.color = 'rgba(255,45,149,0.6)'; e.target.style.textShadow = 'none'; } }}
              >
                <span style={{ marginRight: 6 }}>{t.icon}</span>
                {t.label}
                {isActive && (
                  <span className="tab-glow-line" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: '2px 2px 0 0' }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Workspace content */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: activeTab === 'songwriter' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <SongwriterHub ghostRiderData={ghostRiderData} />
          </div>
          <div style={{ display: activeTab === 'analyzer' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <ArtistAnalyzer onGhostSend={handleGhostSend} />
          </div>
          <div style={{ display: activeTab === 'rhyme' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <RhymeHelper />
          </div>
          <div style={{ display: activeTab === 'thesaurus' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <Thesaurus />
          </div>
          <div style={{ display: activeTab === 'dictionary' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <Dictionary />
          </div>
          <div style={{ display: activeTab === 'scratchpad' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <Scratchpad />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <Settings />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'rgba(8,5,18,0.95)',
            borderTop: '1px solid rgba(139,92,246,0.25)',
            boxShadow: '0 -1px 20px rgba(88,28,135,0.15)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Footer medallion with magenta glow */}
            <img
              src={footerMedallionImg}
              alt="CFunky Creations Lyricist medallion"
              data-help="Christopher Funk — the founder of CFunky Creations LLC, the one-man shop that builds Lyricist and other free AI tools out of Austin, Texas."
              style={{
                width: 100,
                height: 100,
                objectFit: 'contain',
                flexShrink: 0,
                filter: 'drop-shadow(0 0 10px #ff2d95) drop-shadow(0 0 22px rgba(255,45,149,0.55)) drop-shadow(0 0 40px rgba(255,45,149,0.25))'
              }}
            />
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ff2d95', textShadow: '0 0 8px rgba(255,45,149,0.6)' }}>
                CFunkyCreations LLC
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,100,149,0.75)' }}>
                Austin, Texas ·{' '}
                <a href="mailto:cfunkycreations@gmail.com" style={{ color: 'inherit' }} data-help="Email Christopher directly with questions, bugs, or feature ideas.">
                  cfunkycreations@gmail.com
                </a>{' '}
                ·{' '}
                <a href="https://cfunkycreationsllc.com" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }} data-help="The CFunky Creations website — home base for this and the other free AI tools.">
                  cfunkycreationsllc.com
                </a>
              </div>
            </div>
          </div>

          <div
            style={{ fontSize: '0.6rem', color: '#ff9e2c', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', lineHeight: 1.6, textShadow: '0 0 8px rgba(255,158,44,0.5)' }}
            data-help="CFunky's mission: powerful songwriting tools that stay free for everyone, no catch."
          >
            Lyricist 4.0.12 · Free AI tools for the masses<br />
            Always free, available for all · Keep Austin Wonky
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6, maxWidth: 360 }}>
            {/* Fiverr — plain link (more reliable than a popup in Brave) */}
            <a
              href="https://www.fiverr.com/s/m541z1V"
              target="_blank"
              rel="noopener noreferrer"
              data-help="Hire Christopher on Fiverr to build something custom for you — a website, an AI tool, design work, and more."
              style={{
                padding: '5px 11px',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: '#1dbf73',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                boxShadow: '0 0 8px rgba(29,191,115,0.4)'
              }}
            >
              Hire on Fiverr
            </a>
            <a
              href="https://paypal.me/funkchris"
              target="_blank"
              rel="noopener noreferrer"
              data-help="Send a tip or payment through PayPal."
              style={{
                padding: '5px 11px',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg,#003087,#009cde)',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                boxShadow: '0 0 8px rgba(0,156,222,0.4)'
              }}
            >
              PayPal
            </a>
            <a
              href="https://venmo.com/u/Chris-Funk-20"
              target="_blank"
              rel="noopener noreferrer"
              data-help="Send a tip through Venmo (@Chris-Funk-20)."
              style={{
                padding: '5px 11px',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg,#008CFF,#3D95CE)',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                boxShadow: '0 0 8px rgba(0,140,255,0.4)'
              }}
            >
              Venmo
            </a>
            <a
              href="https://cash.app/$cfunkycreations"
              target="_blank"
              rel="noopener noreferrer"
              data-help="Send a tip through Cash App ($cfunkycreations)."
              style={{
                padding: '5px 11px',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg,#00D632,#00A82D)',
                color: '#04231a',
                borderRadius: 6,
                textDecoration: 'none',
                boxShadow: '0 0 8px rgba(0,214,50,0.4)'
              }}
            >
              Cash App
            </a>
            <button
              onClick={() => {
                const tag = '$Christopher-Funk-21';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(tag)
                    .then(() => alert(`Chime cashtag copied: ${tag}\n\nOpen the Chime app, tap Pay Anyone, and paste it in.`))
                    .catch(() => alert(`Chime cashtag: ${tag}`));
                } else {
                  alert(`Chime cashtag: ${tag}`);
                }
              }}
              data-help="Send a tip through Chime. Clicking copies Christopher's Chime cashtag ($Christopher-Funk-21) so you can paste it into the Chime app's Pay Anyone screen."
              style={{
                padding: '5px 11px',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg,#1ec677,#0aa05a)',
                color: '#04231a',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                boxShadow: '0 0 8px rgba(30,198,119,0.4)'
              }}
            >
              Chime
            </button>
            <a
              href="https://buymeacoffee.com/cfunkycream"
              target="_blank"
              rel="noopener noreferrer"
              data-help="Like the app? Buy Christopher a coffee — a small tip that helps keep these tools free for everyone."
            >
              <img
                src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=cfunkycream&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff"
                alt="Buy Me A Coffee"
                style={{ height: 26, width: 'auto' }}
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LyricStoreProvider>
      <MainLayout />
    </LyricStoreProvider>
  );
}
