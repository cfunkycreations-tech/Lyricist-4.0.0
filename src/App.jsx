import React, { useState, useEffect, useRef } from 'react';
import { LyricStoreProvider, useLyricStore } from './context/LyricStore.jsx';
import SongwriterHub from './components/SongwriterHub/SongwriterHub.jsx';
import ArtistAnalyzer from './components/ArtistAnalyzer/ArtistAnalyzer.jsx';
import SongForge from './components/SongForge/SongForge.jsx';
import RhymeHelper from './components/RhymeHelper/RhymeHelper.jsx';
import Scratchpad from './components/Scratchpad/Scratchpad.jsx';
import Thesaurus from './components/Thesaurus/Thesaurus.jsx';
import Dictionary from './components/Dictionary/Dictionary.jsx';
import Settings from './components/Settings/Settings.jsx';
import HelpLayer from './components/common/HelpLayer.jsx';
import OnboardingWizard from './components/Onboarding/OnboardingWizard.jsx';
import GhostDemo from './components/Onboarding/GhostDemo.jsx';
import MidiStudio from './components/MidiStudio/MidiStudio.jsx';
import ToolsHub from './components/ToolsHub/ToolsHub.jsx';
import AlbumArchitect from './components/AlbumArchitect/AlbumArchitect.jsx';
import SunoPlayer from './components/AudioPlayer/SunoPlayer.jsx';
import RecordingBooth from './components/Recordings/RecordingBooth.jsx';
import CollabTab from './components/Collab/CollabTab.jsx';
import MasteringStudio from './components/MasteringStudio/MasteringStudio.jsx';
import QuantumLab from './components/QuantumLab/QuantumLab.jsx';
import LoopStation from './components/LoopStation/LoopStation.jsx';
import Stemmer from './components/Stemmer/Stemmer.jsx';
import { APP_VERSION } from './buildInfo.js';

import bgImg from './assets/cfunky-bg-new.jpg';   // new Austin street-scene background (4.0.2)
import profileImg from './assets/profile.jpg';     // new founder selfie
import logoImg from './assets/logo.jpg';           // new neon medallion logo
import headerMedallionImg from './assets/header-medallion.png'; // Chris's peace-sign DNA medallion (4.2.0)
// The header art used to be ONE 1880x440 strip (header-banner.png). That strip
// carried 534px of flat #020516 filler between its three elements, which forced
// a 4.3:1 aspect — so fitting it to the leftover width collapsed its height and
// Chris rendered barely a third as tall as the medallion beside him. The three
// elements are now separate crops of that same file, laid out below, so Chris
// can be locked to the full header height and the rest scaled off him.
import headerSignatureImg from './assets/header-signature.png'; // Chris's signature
import headerChrisImg from './assets/header-chris.png';         // Chris + guitar
import headerWordmarkImg from './assets/header-wordmark.png';   // LYRICIST 4.2.0 GOES QUANTUM
import footerMedallionImg from './assets/footer-medallion-new.png'; // Chris's bottom-left medallion (4.2.0)

// Footer medallion sizing. The whole image has to be visible — no crop at the
// top, no crop at the bottom. An earlier version hung it past the bar and
// masked the overhang, and it just read as a chopped-off logo.
const FOOTER_MEDALLION_H = 112;

const tabs = [
  // Write / story tools first, then Quantum Lab
  { id: 'songwriter', icon: '🎵', label: 'Songwriter', help: 'The main workspace. Set up the kind of song you want (style, mood, topic), then write and polish the lyrics line by line.' },
  { id: 'analyzer', icon: '👻', label: 'Ghost Rider', help: 'Studies any artist you name and breaks down how they write, then helps you write a NEW song in that same style. (It does not copy their actual lyrics.)' },
  { id: 'songforge', icon: '🪄', label: 'Song Forge', help: 'Auto-generate a full song and cover art using your single OpenRouter key (lyrics + Nano Banana image models on OpenRouter). Song First or Art First. No Google AI Studio key.' },
  { id: 'quantum', icon: '⚛️', label: 'Quantum Lab', help: 'Build a verse by playing with a grid of word tiles (the lattice). Heat words up, let energy spread, lock rhymes with Crystallize, then Generate Neural Lyrics for a real 4-line verse. Send to Songwriter or Song Forge in one click. Needs your OpenRouter key for generate.' },
  { id: 'collab', icon: '🤝', label: 'Collaboration', help: 'Write a song with someone else at the same time, wherever they are. Start a session, send them the code, and you are both typing on the same page. Peer to peer — the words go straight between your two computers. No account, no server holding your song, free forever.' },
  { id: 'loopstation', icon: '🔁', label: 'RC-Funk 5000', help: 'Live multi-track loop station (Boss RC-style). Record loops on up to 4 tracks, stack layers, control volume, undo a track. Fully offline. Great for riffs and vocal hooks while you write.' },
  { id: 'stemmer', icon: '🎛️', label: 'Stemmer', help: 'Split a full mix into Vocals, Drums, Bass, Guitar, Keys, and Other. Offline mode (default) is free, light CPU, no key, no GPU. Optional Cloud mode uses a Replicate API key for pro Demucs stems on their servers.' },
  { id: 'booth', icon: '🎤', label: 'Recording Booth', help: 'Record harmonica, guitar, or vocals straight into the app (or upload takes) and keep them in a saved library. Play them in the persistent player while you write, convert them to MIDI, or export them as WAV.' },
  { id: 'midistudio', icon: '🎹', label: 'MIDI Studio', help: 'Turn any audio into editable MIDI, tweak it on a piano-roll with a stronger multi-voice synth, and pick from dozens of Milkdrop-class visualizer presets. Runs fully offline.' },
  { id: 'album', icon: '💿', label: 'Album Architect', help: 'Group up to 12 tracks into a cohesive concept album. Drag tracks to reorder, and set album-wide metadata like genre and master tempo.' },
  { id: 'mastering', icon: '💽', label: 'Mastering Studio', help: 'The finish line: pull your songs together into an album, master each track with a real EQ/compression/limiter chain (all offline), add cover art (upload or AI-generated), and export the finished album — WAVs, cover, and tracklist.' },
  { id: 'rhyme', icon: '📖', label: 'Rhyme Helper', help: 'A rhyming dictionary and rhyme finder. Look up words that rhyme, and check the rhymes inside lines you have already written.' },
  { id: 'thesaurus', icon: '📚', label: 'Thesaurus', help: 'A word finder: type a word to get other words that mean the same, words that mean the opposite, and related ideas. Free, no AI key needed.' },
  { id: 'dictionary', icon: '📕', label: 'Dictionary', help: 'Look up what a word means, how to say it, and example sentences — in English or Spanish. Free, no AI key needed.' },
  { id: 'toolshub', icon: '🧰', label: 'AI Tools Hub', help: 'A community shelf of free AI tools — browse them, upvote your favorites, and share the ones you use. Free tools for the masses.' },
  { id: 'scratchpad', icon: '📝', label: 'Scratchpad', help: 'A free, blank notepad for jotting ideas, hooks, or lines. It saves automatically on your computer so nothing gets lost.' },
  { id: 'settings', icon: '⚙️', label: 'Settings', help: 'Where you connect your AI key and choose which AI model writes your lyrics. Set this up first so the rest of the app works.' }
];

/**
 * One tab's workspace. It renders nothing at all until the tab has been opened
 * once; after that it stays mounted and just hides, so work in progress
 * survives switching tabs.
 */
function TabPane({ id, active, opened, children }) {
  const ref = useRef(null);
  const isActive = active === id;

  // display:none does not stop a <video> decoding. A background video you
  // cannot see still burns memory and CPU for as long as the app is open, so
  // park it while the tab is hidden and start it again when you come back.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const v of root.querySelectorAll('video')) {
      if (isActive) { const p = v.play(); if (p?.catch) p.catch(() => {}); }
      else v.pause();
    }
  }, [isActive]);

  if (!opened.has(id)) return null;
  return (
    <div ref={ref} style={{ display: isActive ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
      {children}
    </div>
  );
}

function MainLayout() {
  const store = useLyricStore();
  // Open straight onto a tab with #tab=<id>. Used to reproduce a crash on the
  // exact tab it happened on instead of clicking there by hand every time.
  const [activeTab, setActiveTab] = useState(() => {
    const wanted = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('tab');
    return tabs.some((t) => t.id === wanted) ? wanted : 'songwriter';
  });
  // Every tab you've opened this session. Boot only pays for the first one.
  // Tracked in a ref and grown during render on purpose: the pane has to exist
  // in the SAME render that switches to it, or the Ghost Demo would go looking
  // for controls a frame before they mount.
  const openedTabsRef = useRef(new Set(['songwriter']));
  openedTabsRef.current.add(activeTab);
  const openedTabs = openedTabsRef.current;

  // main.js reads this when it samples memory, so boot.log records which tab
  // was open while the renderer was growing.
  useEffect(() => { window.__lyricistActiveTab = activeTab; }, [activeTab]);
  const [ghostRiderData, setGhostRiderData] = useState(null);
  const [quantumForgeSeed, setQuantumForgeSeed] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showGhostDemo, setShowGhostDemo] = useState(false);

  const handleGhostSend = (data) => {
    setGhostRiderData(data);
    setActiveTab('songwriter');
  };

  /** Quantum Lab → Songwriter (one-click). Same shape as Ghost Rider. */
  const handleQuantumToSongwriter = (data) => {
    setGhostRiderData({
      lyrics: data.lyrics,
      artist: data.artist || 'Quantum Lab',
      sunoTags: data.sunoTags || '',
      source: 'quantum',
    });
    setActiveTab('songwriter');
  };

  /** Quantum Lab → Song Forge (structure / palette seed for full song). */
  const handleQuantumToForge = (seed) => {
    setQuantumForgeSeed(seed);
    setActiveTab('songforge');
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

      {showGhostDemo && store.ghostDemoEnabled && (
        <GhostDemo
          tabId={activeTab}
          onClose={() => setShowGhostDemo(false)}
          onRequestTab={setActiveTab}
        />
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
          background: 'linear-gradient(180deg, rgba(4,8,20,0.52) 0%, rgba(6,10,24,0.58) 45%, rgba(2,4,12,0.78) 100%)'
        }}
      />

      {/* Main Layout Wrap */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100vh' }}>
        {/* Header — medallion | signature · Chris · wordmark | controls (4.2.0) */}
        {/* The height is NOT a fixed 300 any more. Everything in this bar is sized
            off the header height, so a fixed height meant that on a window too
            narrow for the row, the art had to letterbox down while the medallion
            stayed full size — Chris ended up two thirds its height, which is what
            made the header look broken. Now the header itself shrinks when the
            window can't fit the row at full scale, so the medallion and Chris are
            ALWAYS the same height and the whole bar stays to scale. It caps at 300.
            The 4.7 divisor is the row's total width expressed in header-heights
            (medallion 1 + signature 0.90 + Chris 0.55 + wordmark 1.75 + gaps), with
            a little slack; 210px covers the left pad and the controls column. */}
        <div className="header-cosmic" style={{ flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', background: '#020516', height: 'clamp(170px, calc((100vw - 210px) / 4.7), 300px)', overflow: 'hidden', width: '100%' }}>

          {/* 1. Medallion logo — full header height, top edge to bottom edge.
               Tied to the header's own height rather than a number, so it can't
               fall out of step the next time the header is resized. */}
          <img
            src={headerMedallionImg}
            alt="CFunky Creations — Lyricist Goes Quantum"
            style={{ height: '100%', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
          />

          {/* 2. Hero row — signature · Chris · wordmark, sized off ONE reference:
               Chris stands the full height of the header, exactly as tall as the
               medallion on the left. The other two are set to the height they had
               relative to him in the original artwork (signature 230/440 = 52%,
               wordmark 403/440 = 92%), so the whole row stays to scale.
               Chris never shrinks; on a cramped window the other two give way. */}
          <div
            style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(6px, 3.2vw, 60px)', paddingLeft: 16, paddingRight: 190, overflow: 'hidden' }}
            data-help="Lyricist is your songwriting studio. Pick a vibe, give it a topic, and it helps you write full songs, line by line — then polish them. Everything here is explained: just hover over anything you don't recognize."
          >
            {/* No maxWidth caps — the header height already guarantees the row
                fits, so every piece renders at its true size. Caps would letterbox
                a piece and silently break the scale. */}
            <img
              src={headerSignatureImg}
              alt="Chris Funk"
              style={{ height: '52%', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
            />
            <img
              src={headerChrisImg}
              alt="Chris Funk with his guitar"
              style={{ height: '100%', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
            />
            <img
              src={headerWordmarkImg}
              alt={`Lyricist ${APP_VERSION} Goes Quantum — CFunky Creations`}
              style={{ height: '92%', width: 'auto', objectFit: 'contain', display: 'block', flexShrink: 0 }}
            />
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
                background: 'rgba(0,229,255,0.14)',
                color: '#67e8f9',
                border: '1px solid rgba(0,229,255,0.45)',
                boxShadow: '0 0 12px rgba(0,229,255,0.2)',
                transition: 'all 0.15s'
              }}
            >
              <span>🧭</span>
              Take the Tour
            </button>

            {/* Ghost Demo master switch — optional; remembered between sessions */}
            <button
              onClick={() => {
                const next = !store.ghostDemoEnabled;
                store.setGhostDemoEnabled(next);
                if (!next) setShowGhostDemo(false);
              }}
              data-help="Optional. When Ghost Demo is ON, a Play button appears so you can run a ghost-guided walkthrough of the current tab (moving mouse + word bubbles). Turn OFF if you don’t want that feature at all."
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 9999,
                cursor: 'pointer',
                background: store.ghostDemoEnabled ? 'rgba(168,85,247,0.18)' : 'rgba(80,70,90,0.15)',
                color: store.ghostDemoEnabled ? '#e9d5ff' : 'rgba(170,150,160,0.7)',
                border: `1px solid ${store.ghostDemoEnabled ? 'rgba(168,85,247,0.5)' : 'rgba(140,120,130,0.35)'}`,
                transition: 'all 0.15s'
              }}
            >
              <span>👻</span>
              Ghost Demo: {store.ghostDemoEnabled ? 'On' : 'Off'}
            </button>

            {/* Only shown when Ghost Demo is enabled — play walkthrough for THIS tab */}
            {store.ghostDemoEnabled && (
              <button
                onClick={() => setShowGhostDemo(true)}
                data-help="Plays a Ghost Demo for harder tabs (Quantum, Ghost Rider, Song Forge, RC-Funk 5000, MIDI, Mastering, etc.). Simple tabs like Dictionary use Tips hover instead. Pause or skip anytime. Turn Ghost Demo Off if you never want this."
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  background: 'rgba(103,232,249,0.12)',
                  color: '#a5f3fc',
                  border: '1px solid rgba(103,232,249,0.45)',
                  transition: 'all 0.15s'
                }}
              >
                <span>▶</span>
                Play Demo
              </button>
            )}

            {/* Global Tips switch — turns every help bubble in the app on or off */}
            <button
              onClick={() => store.setTipsEnabled(!store.tipsEnabled)}
              data-help="Turns hover help ON or OFF for the whole app. When ON, hover any button, tab, word tile, or panel and a bubble explains it in plain English — including every control in Quantum Lab (the lattice). Leave Tips ON while you learn. This is separate from Take the Tour."
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 9999,
                cursor: 'pointer',
                background: store.tipsEnabled
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(148,163,184,0.18))'
                  : 'rgba(80,70,90,0.15)',
                color: store.tipsEnabled ? '#e8eef8' : 'rgba(170,150,160,0.7)',
                border: `1px solid ${store.tipsEnabled ? 'rgba(226,232,240,0.55)' : 'rgba(140,120,130,0.35)'}`,
                boxShadow: store.tipsEnabled
                  ? '0 0 12px rgba(200,210,230,0.35), inset 0 1px 0 rgba(255,255,255,0.35)'
                  : 'none',
                textShadow: store.tipsEnabled
                  ? '0 1px 0 rgba(255,255,255,0.7), 0 2px 0 rgba(0,0,0,0.45)'
                  : 'none',
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

        {/* Browser-style curved tabs (4.2.0) — no dashed outlines */}
        <div className="tab-nav-scroll">
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`tab-browser ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveTab(t.id);
                  if (t.id !== 'songwriter') setGhostRiderData(null);
                }}
                data-help={t.help}
              >
                <span style={{ marginRight: 6 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Workspace content.

            Tabs mount the first time you open one and stay mounted after that,
            so nothing you have going in a tab is ever thrown away by switching
            away from it. What changed in 4.2.0.025 is that they no longer ALL
            mount at boot: sixteen tabs' worth of background videos, visualizers
            and artwork loaded at once was enough to run the renderer out of
            memory and leave a black window. Now you pay for a tab when you
            actually open it. */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TabPane id="songwriter" active={activeTab} opened={openedTabs}>
            <SongwriterHub ghostRiderData={ghostRiderData} />
          </TabPane>
          <TabPane id="quantum" active={activeTab} opened={openedTabs}>
            <QuantumLab
              onSendToSongwriter={handleQuantumToSongwriter}
              onSendToForge={handleQuantumToForge}
            />
          </TabPane>
          <TabPane id="analyzer" active={activeTab} opened={openedTabs}>
            <ArtistAnalyzer onGhostSend={handleGhostSend} />
          </TabPane>
          <TabPane id="songforge" active={activeTab} opened={openedTabs}>
            <SongForge
              onSongForged={() => setActiveTab('songwriter')}
              quantumSeed={quantumForgeSeed}
              onQuantumSeedConsumed={() => setQuantumForgeSeed(null)}
            />
          </TabPane>
          <TabPane id="loopstation" active={activeTab} opened={openedTabs}>
            <LoopStation />
          </TabPane>
          <TabPane id="stemmer" active={activeTab} opened={openedTabs}>
            <Stemmer />
          </TabPane>
          <TabPane id="collab" active={activeTab} opened={openedTabs}>
            <CollabTab
              onSendToSongwriter={handleQuantumToSongwriter}
              // Songwriter keeps lyrics as sections of lines; the shared page is
              // plain text, so flatten it with the section names as headers.
              currentLyrics={(store?.lyrics || [])
                .map((s) => `[${s.type || 'verse'}]\n${(s.lines || []).map((l) => l.text || '').join('\n')}`)
                .join('\n\n')}
            />
          </TabPane>
          <TabPane id="booth" active={activeTab} opened={openedTabs}>
            <RecordingBooth onNavigate={setActiveTab} />
          </TabPane>
          <TabPane id="midistudio" active={activeTab} opened={openedTabs}>
            <MidiStudio />
          </TabPane>
          <TabPane id="album" active={activeTab} opened={openedTabs}>
            <AlbumArchitect />
          </TabPane>
          <TabPane id="mastering" active={activeTab} opened={openedTabs}>
            <MasteringStudio onNavigate={setActiveTab} />
          </TabPane>
          <TabPane id="toolshub" active={activeTab} opened={openedTabs}>
            <ToolsHub />
          </TabPane>
          <TabPane id="rhyme" active={activeTab} opened={openedTabs}>
            <RhymeHelper />
          </TabPane>
          <TabPane id="thesaurus" active={activeTab} opened={openedTabs}>
            <Thesaurus />
          </TabPane>
          <TabPane id="dictionary" active={activeTab} opened={openedTabs}>
            <Dictionary />
          </TabPane>
          <TabPane id="scratchpad" active={activeTab} opened={openedTabs}>
            <Scratchpad />
          </TabPane>
          <TabPane id="settings" active={activeTab} opened={openedTabs}>
            <Settings />
          </TabPane>
        </div>

        {/* Persistent Suno player (4.1.3) — mounted here at the layout root,
            OUTSIDE the tab workspace above, so playback never interrupts while
            switching between Rhyme Helper, Song Forge, MIDI Studio, etc.
            (Tabs hide via display:none and never unmount, and this player
            isn't inside them anyway — double insurance.) */}
        <SunoPlayer />

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            // Sampled off the medallion's own corner (#020516) — near-black,
            // but navy rather than pure black, so there is no seam where the
            // artwork meets the bar. The plate colour further in is #17223A if
            // this ever wants to be lighter.
            background: '#020516',
            borderTop: '1px solid rgba(0,229,255,0.22)',
            boxShadow: '0 -1px 20px rgba(168,85,247,0.15)',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Footer — Quantum Lab banner art */}
            <img
              src={footerMedallionImg}
              alt="Lyricist Goes Quantum — Quantum Lab"
              data-help="Christopher Funk — the founder of CFunky Creations LLC, the one-man shop that builds Lyricist and other free AI tools out of Austin, Texas."
              style={{
                // Whole medallion, nothing clipped: it sits inside the bar and
                // the bar grows to hold it. 'cover' cropped it to a letterbox
                // strip, and the overhang version chopped the top and bottom.
                height: FOOTER_MEDALLION_H,
                width: 'auto',
                objectFit: 'contain',
                flexShrink: 0,
                filter: 'drop-shadow(0 0 10px #00f0ff) drop-shadow(0 0 22px rgba(192,38,255,0.5)) drop-shadow(0 0 36px rgba(0,255,156,0.25))'
              }}
            />
            <div>
              <div className="chrome-silver" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                CFunkyCreations LLC
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(180,195,220,0.8)', textShadow: '0 1px 0 rgba(255,255,255,0.25)' }}>
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
            className="chrome-silver"
            style={{ fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: "'Audiowide', 'JetBrains Mono', monospace", textAlign: 'center', lineHeight: 1.6 }}
            data-help="CFunky's mission: powerful songwriting tools that stay free for everyone, no catch."
          >
            Lyricist {APP_VERSION} · Free AI tools for the masses<br />
            Always free, available for all · Keep Austin, Austin, Bruh
          </div>

          {/* NO data-help ON ANY OF THESE. Everybody already knows what PayPal
              and Cash App are, and a tooltip explaining them reads like the app
              thinks you're stupid. Tips are for the parts of this app that
              genuinely need explaining. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6, maxWidth: 360 }}>
            {/* Fiverr — plain link (more reliable than a popup in Brave) */}
            <a
              href="https://www.fiverr.com/s/m541z1V"
              target="_blank"
              rel="noopener noreferrer"
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
