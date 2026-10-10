import React, { useState, useEffect, useRef } from 'react';
import { LyricStoreProvider, useLyricStore } from './context/LyricStore.jsx';
import SongwriterHub from './components/SongwriterHub/SongwriterHub.jsx';
import OneManBand from './components/OneManBand/OneManBand.jsx';
import ScrewShop from './components/ScrewShop/ScrewShop.jsx';
import StartHere from './components/common/StartHere.jsx';
import ArtistAnalyzer from './components/ArtistAnalyzer/ArtistAnalyzer.jsx';
import SongForge from './components/SongForge/SongForge.jsx';
import RhymeHelper from './components/RhymeHelper/RhymeHelper.jsx';
import Scratchpad from './components/Scratchpad/Scratchpad.jsx';
import Thesaurus from './components/Thesaurus/Thesaurus.jsx';
import Dictionary from './components/Dictionary/Dictionary.jsx';
import Settings from './components/Settings/Settings.jsx';
import HelpLayer from './components/common/HelpLayer.jsx';
import OnboardingWizard from './components/Onboarding/OnboardingWizard.jsx';
import RotatePrompt from './web/RotatePrompt.jsx';
import GhostDemo from './components/Onboarding/GhostDemo.jsx';
import { registerGhostAction, PILOT_ENABLED } from './services/ghostBus.js';
import { record, installRecorder, setTabNames } from './services/ghostRecorder.js';

/**
 * ASK THE GHOST IS FOR CHRIS, NOT CUSTOMERS.
 *
 * Chris, 2026-09-15: *"the ghost function is only for me the creator not the
 * customer."* So it sits behind the same build flag as the Ghost Pilot, and the
 * same way: a dynamic import inside a ternary, so a customer build has no
 * reachable import of the panel, its hand, or its job runner, and Rollup emits
 * no chunk for any of them. A static import here would ship all of it hidden.
 * See components/Ghost/GhostPilotLayer.jsx for why that distinction matters.
 *
 * Creator exe:  npm run release:creator
 * Creator dev:  npm run dev:creator
 */
const CREATOR_BUILD = import.meta.env.VITE_FAFO_INTERNAL_BUILD === 'true';
const GhostAssistant = CREATOR_BUILD
  ? React.lazy(() => import('./components/Ghost/GhostAssistant.jsx'))
  : null;
import MidiStudio from './components/MidiStudio/MidiStudio.jsx';
import ToolsHub from './components/ToolsHub/ToolsHub.jsx';
import SunoPlayer from './components/AudioPlayer/SunoPlayer.jsx';
import RecordingBooth from './components/Recordings/RecordingBooth.jsx';
import CollabTab from './components/Collab/CollabTab.jsx';
import MasteringStudio from './components/MasteringStudio/MasteringStudio.jsx';
import VoiceLab from './components/VoiceLab/VoiceLab.jsx';
import QuantumLab from './components/QuantumLab/QuantumLab.jsx';
import LoopStation from './components/LoopStation/LoopStation.jsx';
import Stemmer from './components/Stemmer/Stemmer.jsx';

// Tab icons — Chris's dichroic-glass artwork used to sit here, one 3D render
// per tab. Stripped on 2026-08-27 with the rest of the artwork: *"leave it
// jet black. Actually, flat black."* The tab strip falls back to the emoji
// glyph in each entry's `icon:` field, which is what shipped before the
// renders landed. The .png files are left in src/assets/icons/ — nothing
// imports them any more, so Vite emits none of them.
import { useMobile } from './mobile/useMobile.js';
import MobileShell from './mobile/MobileShell.jsx';
import GhostPilotLayer from './components/Ghost/GhostPilotLayer.jsx';
import PushHeader from './components/PushHeader/PushHeader.jsx';
import { track, isEnabled as analyticsEnabled } from './services/analytics.js';
import { Compass, Ghost, Play, Lightbulb, KeyRound, Lock } from 'lucide-react';
// The still header art (profile.jpg, logo.jpg, header-medallion / -signature /
// -chris / -wordmark .png) is no longer imported here. The header became the
// whole uncropped video clip, and its <img> elements went with it, but the six
// imports stayed behind — and Vite emits an imported asset whether or not it is
// rendered, so every build was still shipping them. The files themselves are
// left in src/assets/ untouched.
//
// THE FOOTER MEDALLION IS OUT TOO (commercial refactor). It was 1.2 MB of
// "Lyricist Goes Quantum" tip-jar-era artwork sitting in a bar that is now an
// operational status deck. Same rule as above: an imported asset ships whether
// or not it renders, so the import goes with the <img>.
// Header banner clip. Imported, NOT read out of public/ at runtime — see the note
// in components/common/TabVideoBg.jsx. Everything else in this app that plays a
// background video goes through a Vite import, so this does too.
// header.mp4 import removed with the header video. Vite emits an imported
// asset whether or not anything renders it, so leaving it would have kept
// 16 MB in every installer for nothing. Same trap as the 8 dead image
// imports in 087 and the Scratchpad clip in 092.

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE GUIDED TOUR IS PARKED, NOT DELETED.
 *
 * Chris, 2026-08-26: "Remove the wizard for now but keep it somewhere you can
 * retrieve it."
 *
 * So it is one boolean, and NOTHING ELSE WAS TOUCHED. Every file the tour is
 * made of is still exactly where it was and still complete:
 *
 *   src/components/Onboarding/OnboardingWizard.jsx   the 20-card player
 *   src/components/Onboarding/wizardCards.js         the cards + narration text
 *   public/wizard-audio/card-01.mp3 … card-20.mp3    Ava's baked narration
 *
 * Flipping this back to `true` restores it in full — the first-run auto-launch,
 * the header "Take the Tour" button, and the phone launcher's tour pill, all of
 * which read this one constant.
 *
 * WHY A CONSTANT AND NOT A DELETED IMPORT. Deleting the import would have meant
 * unpicking five call sites and then putting them all back by hand later, which
 * is how a parked feature quietly becomes a lost one. With the flag false,
 * Rollup drops OnboardingWizard from the bundle anyway, so the shipped build
 * pays nothing for it — the code is absent from the installer and present in
 * the repo, which is exactly what "keep it somewhere retrievable" needs.
 *
 * Note for whoever turns it back on: cards 1, 3, 6 and 7 have been rewritten
 * for the Lyricist Pro / The Matrix rename but their MP3s have NOT been
 * re-baked, so the text and the voice disagree on those four. See the banner in
 * wizardCards.js.
 * ══════════════════════════════════════════════════════════════════════════
 */
const WIZARD_ENABLED = false;

const tabs = [
  // Write / story tools first, then The Matrix
  { id: 'songwriter', icon: 'pen-line', label: 'Songwriter', blurb: 'write and rewrite lyrics', help: 'The main workspace. Set up the kind of song you want (style, mood, topic), then write and polish the lyrics line by line.' },
  // Straight after Songwriter on purpose: write the words, then hear them.
  { id: 'onemanband', icon: 'orbit', label: 'Black Hole Studios', blurb: 'lyrics into a real song', help: 'Turns your lyrics into a real song with vocals and a full band. Pick a genre, a mood and a voice, and it writes the Input Caption for you. Free on the cloud engine, no key needed. Longer songs take longer, and it tells you how long before you start.' },
  { id: 'analyzer', icon: 'radar', label: 'Ghost Rider', blurb: 'analyse any artist\'s style', help: 'Studies any artist you name and breaks down how they write, then helps you write a NEW song in that same style. (It does not copy their actual lyrics.)' },
  { id: 'songforge', icon: 'hammer', label: 'Song Forge', blurb: 'a full song from one idea', help: 'Auto-generate a full song and cover art using your single OpenRouter key (lyrics + Nano Banana image models on OpenRouter). Song First or Art First. No Google AI Studio key.' },
  { id: 'quantum', icon: 'grid', label: 'The Matrix', blurb: 'engineer verse structure', help: 'Build a verse from a 20-tile semantic grid. Load your keywords, then hit Auto-Craft Verse for the one-click path — it spreads the energy, locks the field and writes both neural states for you. Everything granular (manual steps, the 9-suite feature hub, the analytical inspectors) lives in the Advanced Studio drawer underneath. Needs your BYOK routing key for generation.' },
  { id: 'collab', icon: 'users', label: 'Collaboration', blurb: 'write with someone live', help: 'Write a song with someone else at the same time, wherever they are. Start a session, send them the code, and you are both typing on the same page. Peer to peer — the words go straight between your two computers. No account, no server holding your song, free forever.' },
  { id: 'loopstation', icon: 'repeat', label: 'RC-Funk 5000', blurb: 'drum machine and looper', help: 'Live multi-track loop station (Boss RC-style). Record loops on up to 4 tracks, stack layers, control volume, undo a track. Fully offline. Great for riffs and vocal hooks while you write.' },
  { id: 'stemmer', icon: 'audio-lines', label: 'Cloud Stem Extraction', blurb: 'BYO Replicate key', help: 'Splits a full mix into Vocals, Drums, Bass, Guitar, Keys, and Other. Local mode runs on your own CPU with no key and no GPU. High-fidelity Demucs separation offloads to the Replicate API using your own key, so a 4 GB VRAM machine is never asked to hold the model.' },
  { id: 'booth', icon: 'mic', label: 'Recording Booth', blurb: 'record your own takes', help: 'Record harmonica, guitar, or vocals straight into the app (or upload takes) and keep them in a saved library. Play them in the persistent player while you write, convert them to MIDI, or export them as WAV.' },
  { id: 'voicelab', icon: 'mic-2', label: 'Voice Lab', blurb: 'scripts read aloud', help: 'Write a script or a speech, pick a voice, shape it with the knobs, and save it as a WAV. Runs on your OpenRouter key. Long scripts are read a paragraph at a time and joined together.' },
  { id: 'midistudio', icon: 'piano', label: 'MIDI Studio', blurb: 'audio to MIDI, piano roll', help: 'Turn any audio into editable MIDI, tweak it on a piano-roll with a stronger multi-voice synth, and pick from dozens of Milkdrop-class visualizer presets. Runs fully offline.' },
  { id: 'mastering', icon: 'gauge', label: 'Mastering Studio', blurb: 'master and export', help: 'The finish line: pull your songs together into an album, master each track with a real EQ/compression/limiter chain (all offline), add cover art (upload or AI-generated), and export the finished album — WAVs, cover, and tracklist.' },
  // Sits after Mastering because it is something you do TO a finished track.
  { id: 'screw', icon: 'scissors', label: 'Chopped & Screwed', blurb: 'slow it and chop it', help: 'Slow a song down until the voice sinks with it, then chop it back up on the beat. The sound DJ Screw invented in Houston. Works on any audio file or any of your own recordings, runs entirely on your computer, and saves straight back to Recordings.' },
  { id: 'rhyme', icon: 'book-open', label: 'Rhyme Helper', blurb: 'find rhymes that fit', help: 'A rhyming dictionary and rhyme finder. Look up words that rhyme, and check the rhymes inside lines you have already written.' },
  { id: 'thesaurus', icon: 'library', label: 'Thesaurus', blurb: 'better words', help: 'A word finder: type a word to get other words that mean the same, words that mean the opposite, and related ideas. Free, no AI key needed.' },
  { id: 'dictionary', icon: 'book-a', label: 'Dictionary', blurb: 'what it means', help: 'Look up what a word means, how to say it, and example sentences — in English or Spanish. Free, no AI key needed.' },
  { id: 'toolshub', icon: 'blocks', label: 'AI Tools Hub', blurb: 'every AI tool in one place', help: 'A shared shelf of AI tools — browse them, upvote the ones that earn it, and add the ones you rely on.' },
  { id: 'scratchpad', icon: 'sticky-note', label: 'Scratchpad', blurb: 'dump your ideas', help: 'A free, blank notepad for jotting ideas, hooks, or lines. Press Save to keep what you wrote: closing the app clears it.' },
  { id: 'settings', icon: 'settings', label: 'Settings', blurb: 'your key and your setup', help: 'Where you connect your AI key and choose which AI model writes your lyrics. Set this up first so the rest of the app works.' }
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
  //
  // This used to run ONLY when isActive flipped, and that was the bug behind
  // "the videos are all stopped": anything that paused a video without changing
  // the active tab left it frozen forever. Chromium suspends media whenever it
  // considers the window hidden — on Windows that includes being covered by
  // another window — so one alt-tab killed every background video until you
  // clicked a different tab and came back. Now the same sync runs on
  // visibilitychange and window focus too, and a MutationObserver catches
  // <video> elements that mount later (the Recording Booth adds one per take).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Deliberately NOT gated on document.visibilityState. Electron reports a
    // merely-COVERED window as hidden, so gating on it can refuse to play a
    // video Chris can see — which is the exact "they're all stopped" symptom
    // this is supposed to cure. Active tab means play, full stop; the only thing
    // that pauses a video here is its own tab being switched away from.
    const sync = () => {
      for (const v of root.querySelectorAll('video')) {
        if (isActive) {
          if (v.paused) { const p = v.play(); if (p?.catch) p.catch(() => {}); }
        } else if (!v.paused) {
          v.pause();
        }
      }
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    const obs = new MutationObserver(sync);
    obs.observe(root, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      obs.disconnect();
    };
  }, [isActive]);

  if (!opened.has(id)) return null;
  return (
    // overflowY auto: a tab with no scroller of its own still scrolls, inside
    // its pane, now that the window no longer grows to fit it.
    <div ref={ref} data-tab-pane={id} style={{ display: isActive ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflowY: 'auto' }}>
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
  // Phone build only. Swaps the 18-tab strip for a launcher grid. Returns
  // false inside Electron and on any window taller than 560px, so the desktop
  // app is completely unaffected. See mobile/useMobile.js.
  const isMobile = useMobile();

  // The class the mobile CSS hangs off: it hides the header video and the tab
  // strip. Kept in an effect so it is removed cleanly if the window is resized
  // back to desktop shape.
  useEffect(() => {
    document.body.classList.toggle('lyricist-mobile', isMobile);
    return () => document.body.classList.remove('lyricist-mobile');
  }, [isMobile]);

  openedTabsRef.current.add(activeTab);
  const openedTabs = openedTabsRef.current;

  // The Ghost's flight recorder (creator build): every tab change goes in the log.
  useEffect(() => {
    if (!PILOT_ENABLED) return;
    setTabNames(Object.fromEntries(tabs.map((t) => [t.id, t.label])));
    installRecorder();
  }, []);
  useEffect(() => {
    if (PILOT_ENABLED) record('tab', `opened ${tabs.find((t) => t.id === activeTab)?.label || activeTab}`);
  }, [activeTab]);

  // main.js reads this when it samples memory, so boot.log records which tab
  // was open while the renderer was growing.
  useEffect(() => {
    window.__lyricistActiveTab = activeTab;
    // Product analytics: which tools actually get opened. The tab id and
    // nothing else — see services/analytics.js. This is the app's pageview,
    // because the app is one HTML document and its real navigation is here.
    track('tab_viewed', { tab_id: activeTab });
  }, [activeTab]);

  // The header used to hold a background clip and a WebGL prism, both of which
  // Chromium would suspend on occlusion, so this effect wired visibilitychange
  // and focus to force them to resume. Both are gone with the artwork strip
  // (2026-08-27), so is the effect. If a future header ever puts a video back,
  // it lives in TabPane's own sync now — nothing outside a tab needs its own.
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
      artist: data.artist || 'The Matrix',
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
  /**
   * The one thing the Ghost can do from anywhere: change tabs.
   *
   * It matters more than it looks. A tab that is not open has registered
   * nothing, so the Ghost genuinely cannot touch it, and the only way through
   * that door is the same one a person uses.
   */
  useEffect(() => registerGhostAction('open_tab', async ({ tab }) => {
    // The Ghost may say the tab's real name ("Black Hole Studios") or its id.
    // Chris: "it's not one man band! it's black hole studio's!" The log says
    // the name on the tab, never the id underneath.
    const raw = String(tab || '').trim();
    const bare = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = tabs.find((t) => t.id === raw)
      || tabs.find((t) => bare(t.label) === bare(raw))
      || tabs.find((t) => bare(raw).length > 3 && (bare(t.label).includes(bare(raw)) || bare(raw).includes(bare(t.label))));
    if (!found) throw new Error(`There is no "${raw}" tab.`);
    const id = found.id;
    setActiveTab(id);
    // Do not report the tab open until it is ON SCREEN. Returning straight
    // away let the next action run against the tab being left: "open The
    // Matrix, fill keywords" typed the keywords into Songwriter's topic box,
    // because that was still the visible pane when fill went looking.
    for (let waited = 0; waited < 3000; waited += 50) {
      const pane = document.querySelector(`[data-tab-pane="${id}"]`);
      if (pane && pane.style.display !== 'none') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return `opened ${found.label}`;
  }), []);

  useEffect(() => {
    document.body.classList.toggle('tips-on', store.tipsEnabled);
  }, [store.tipsEnabled]);

  // Auto-launch the guided tour the very first time the app is opened.
  // Parked — see WIZARD_ENABLED at the top of this file.
  useEffect(() => {
    if (!WIZARD_ENABLED) return;
    // One-time reset: 'lyricistOnboarded' got stuck true on his machine from
    // repeat same-day test installs, so the tour stopped auto-launching on
    // every build after — reported 2026-08-16. This runs once per install
    // (guarded by its own marker) and never touches anything else in
    // localStorage (his lyrics, config, etc. are untouched).
    if (localStorage.getItem('lyricistOnboardedResetV2') !== 'true') {
      localStorage.removeItem('lyricistOnboarded');
      localStorage.setItem('lyricistOnboardedResetV2', 'true');
    }
    if (localStorage.getItem('lyricistOnboarded') !== 'true') {
      setShowWizard(true);
    }
  }, []);

  const closeWizard = () => {
    setShowWizard(false);
    localStorage.setItem('lyricistOnboarded', 'true');
  };

  return (
    // The window is the frame: exactly 100vh. With only a min-height the whole
    // app grew to the tallest tab and the PAGE scrolled, header and all, so a
    // tab's own scroller never moved and anything below the fold (Ghost Rider's
    // Write section under Style DNA) slid under the player. It scrolls itself
    // only when the header grows past the window (the pad board open, the key
    // card showing); the tab below keeps a usable height then (see minHeight
    // on the workspace).
    <div className="min-h-screen flex flex-col" style={{ color: '#e6e8eb', position: 'relative', overflowX: 'hidden', overflowY: 'auto', height: '100vh' }}>
      {/* Phone navigation. An overlay, not a wrapper - see MobileShell.jsx. */}
      {isMobile && (
        <MobileShell
          tabs={tabs}
          activeTab={activeTab}
          onSelect={setActiveTab}
          // null while the tour is parked. MobileShell hides both of its tour
          // controls when it has nothing to call — see WIZARD_ENABLED above.
          onWizard={WIZARD_ENABLED ? () => setShowWizard(true) : null}
        />
      )}

      {/* iPhone cannot be told to rotate — Apple has never supported orientation
          locking — so on a portrait phone where the lock was refused, we ask.
          Renders on nothing else: not Android, not desktop, not Electron. */}
      <RotatePrompt />

      {/* App-wide hover-help engine: hovering any element with data-help shows a bubble. */}
      <HelpLayer />

      {/* GHOST PILOT — INTERNAL MARKETING BUILD ONLY.
          Renders null and imports nothing in the commercial build; the whole
          robotics layer is behind VITE_FAFO_INTERNAL_BUILD and is tree-shaken
          out of the installer. See components/Ghost/GhostPilotLayer.jsx. */}
      <GhostPilotLayer />

      {/* First-run guided tour. Parked — see WIZARD_ENABLED at the top. */}
      {WIZARD_ENABLED && showWizard && (
        <OnboardingWizard onClose={closeWizard} onNavigate={setActiveTab} />
      )}

      {/* Creator builds only, on every tab. See CREATOR_BUILD at the top and
          components/Ghost/GhostAssistant.jsx. */}
      {/* The key lives on store.config, not on the store itself. Passing the
          whole store made assertApiKey read undefined and say "no API key
          configured" while the key sat right there in Settings. */}
      {GhostAssistant && (
        <React.Suspense fallback={null}>
          <GhostAssistant
            tab={activeTab}
            config={store.config}
            getContext={() => {
              const words = (store.getFullText?.() || '').trim();
              return words ? `Their lyrics so far:\n${words.slice(0, 1800)}` : '';
            }}
          />
        </React.Suspense>
      )}

      {showGhostDemo && store.ghostDemoEnabled && (
        <GhostDemo
          tabId={activeTab}
          onClose={() => setShowGhostDemo(false)}
          onRequestTab={setActiveTab}
        />
      )}

      {/* THE APP'S FLOOR. Flat black — Chris's call, 2026-08-27: *"strip the
          app of all artwork and leave it jet black. Actually, flat black."*
          The floor used to be #05070C (a near-black tuned for OLED depth
          under the WebGL prism); the prism is gone with the rest of the
          artwork, so a colour designed to sit under motion looks slightly
          dead on its own. Pure black is the whole floor now.
          Superseded 2026-09-27: the floor is the app's surface material
          (materials.css --mat-floor), black obsidian glass since 2026-09-28. Flat
          black here showed as a dead band under any tab shorter than the window. */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: 'var(--mat-floor)',
          backgroundColor: 'var(--mat-floor-color)',
        }}
      />

      {/* Main Layout Wrap */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%' }}>
        {/* Header — flat black, controls only. 2026-08-27.

            The bar's old size, `min(calc(100vw * 0.5625), 62vh)`, was tuned to
            a 16:9 video's aspect ratio: it was letterboxing his wordmark
            render on top of the WebGL prism. With every last piece of art
            stripped out of the header the aspect no longer means anything, so
            a video-shaped bar of empty black would just be dead screen space
            at the top of every tab. It is a compact 96px strip now — enough
            for the three control pills on the right, and nothing more.

            Background is #000, matching the app floor. The 1px hairline
            underneath comes from .header-cosmic's stylesheet rule, which
            still separates the header from the tab strip below it. */}
        <div className="header-cosmic" style={{ flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'row', alignItems: 'center', background: '#000', height: 96, overflow: 'hidden', width: '100%' }}>

          {/* THE PUSH HEADER. Chris, 2026-09-15: the tabs are four square group
              pads in a Push-style row that sweeps colour when idle, each popping
              out its tabs, and the full Push lives behind the arrow. It replaced
              the sliding tab strip. See components/PushHeader. */}
          <PushHeader
            tabs={tabs}
            activeTab={activeTab}
            onSelect={(id) => {
              setActiveTab(id);
              if (id !== 'songwriter') setGhostRiderData(null);
            }}
          />

          {/* Controls — laid out in one row across the header, right-aligned.
              They used to be a column, but with the header at a flat 96px the
              column ran taller than the band and the top pill was cut in half
              by .header-cosmic's overflow: hidden. Chris flagged it on
              2026-08-27: red-circle screenshot, "move up!". A row of four pills
              fits comfortably in a 1440-wide header and leaves the vertical
              band unclipped. */}
          {/* Chris: "turn the old play demo, api key pills into squares for the
              push clone... keep them on the right hand side". Same buttons, same
              handlers; .push-side in PushHeader.css makes them pads. */}
          <div className="push-side">
            {/* Re-launch the guided tour any time. Parked with the tour itself
                — see WIZARD_ENABLED at the top of this file. */}
            {WIZARD_ENABLED && <button
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
                background: 'rgba(231,165,64,0.14)',
                color: '#e7a540',
                border: '1px solid rgba(231,165,64,0.45)',
                boxShadow: '0 0 0 1px rgba(231,165,64,0.2)',
                transition: 'all 0.15s'
              }}
            >
              <span><Compass size={18} strokeWidth={1.6} /></span>
              Take the Tour
            </button>}

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
                background: store.ghostDemoEnabled ? 'rgba(155,161,170,0.18)' : 'rgba(78,80,83,0.15)',
                color: store.ghostDemoEnabled ? '#e6e8eb' : 'rgba(170,150,160,0.7)',
                border: `1px solid ${store.ghostDemoEnabled ? 'rgba(155,161,170,0.5)' : 'rgba(140,120,130,0.35)'}`,
                transition: 'all 0.15s'
              }}
            >
              <span><Ghost size={18} strokeWidth={1.6} /></span>
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
                  background: 'rgba(231,165,64,0.12)',
                  color: '#e6e8eb',
                  border: '1px solid rgba(231,165,64,0.45)',
                  transition: 'all 0.15s'
                }}
              >
                <span><Play size={18} strokeWidth={1.6} /></span>
                Play Demo
              </button>
            )}

            {/* Global Tips switch — turns every help bubble in the app on or off */}
            <button
              onClick={() => store.setTipsEnabled(!store.tipsEnabled)}
              data-help="Turns hover help ON or OFF for the whole app. When ON, hover any button, tab, word tile, or panel and a bubble explains it in plain English — including every control in The Matrix. Leave Tips ON while you learn."
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
                  : 'rgba(78,80,83,0.15)',
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
              <span><Lightbulb size={18} strokeWidth={1.6} /></span>
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
              data-help="Shows whether your AI key is connected. Lyricist Pro uses your own key (add it on the Settings tab) to write lyrics. Green padlock = ready to go. Red = add a key first or nothing will generate."
            >
              <span>{store.config.openRouterApiKey ? <KeyRound size={18} strokeWidth={1.6} /> : <Lock size={18} strokeWidth={1.6} />}</span>
              {store.config.openRouterApiKey ? 'API Key Loaded' : 'API Key Required'}
            </div>
          </div>
        </div>


        {/* WHAT YOU NEED, BEFORE YOU NEED IT.
            The setup card comes FIRST now, above every tab, from the first
            second, until the key exists. It used to be fourteen separate
            "you need a key" errors behind fourteen buttons, plus a tour card
            titled "set this up first" sitting at nineteen of twenty. */}
        <StartHere onGoToSettings={() => {
          setActiveTab('settings');
          // Land in the key box, ready to paste, not just somewhere on Settings.
          setTimeout(() => {
            const box = document.querySelector('[data-tab-pane="settings"] [data-demo="settings-key"]');
            box?.scrollIntoView({ block: 'center' });
            box?.focus();
          }, 150);
        }} />

        {/* Tab Workspace content.

            Tabs mount the first time you open one and stay mounted after that,
            so nothing you have going in a tab is ever thrown away by switching
            away from it. What changed in 4.2.0.025 is that they no longer ALL
            mount at boot: sixteen tabs' worth of background videos, visualizers
            and artwork loaded at once was enough to run the renderer out of
            memory and leave a black window. Now you pay for a tab when you
            actually open it. */}
        <div style={{ flex: 1, minHeight: 'max(360px, calc(100vh - 200px))', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TabPane id="songwriter" active={activeTab} opened={openedTabs}>
            <SongwriterHub ghostRiderData={ghostRiderData} />
          </TabPane>
          <TabPane id="onemanband" active={activeTab} opened={openedTabs}>
            <OneManBand />
          </TabPane>
          <TabPane id="screw" active={activeTab} opened={openedTabs}>
            <ScrewShop />
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
          <TabPane id="voicelab" active={activeTab} opened={openedTabs}>
            <VoiceLab />
          </TabPane>
          <TabPane id="midistudio" active={activeTab} opened={openedTabs}>
            <MidiStudio />
          </TabPane>
          <TabPane id="mastering" active={activeTab} opened={openedTabs}>
            <MasteringStudio />
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

        {/* ── THE OPERATIONAL STATUS DECK ────────────────────────────────────
            This bar used to be a tip jar: a 1.2 MB medallion, a mission
            statement, and three payment links repeated on all eighteen tabs.
            It is now three status nodes and nothing else — who built it, what
            the engine is doing, and what your licence and routing look like.

            The right node is a control, not a label. A licence readout you
            cannot act on is decoration; this one opens Settings, which is
            where the BYOK key that drives the routing actually lives. */}
        <div className="app-footer">
          {/* LEFT NODE — the organisation. */}
          <div className="deck-node deck-left" data-help="Funk Audio Flow OpSec — the Austin, Texas engineering shop behind Lyricist Pro.">
            <span className="deck-mark">FAFO</span>
            <span className="deck-text">
              <b>Funk Audio Flow OpSec (FAFO)</b>
              <i>Austin, Texas</i>
            </span>
          </div>

          {/* CENTRE NODE — what the product is and where the work happens.

              THE AIR-GAP CLAIM IS COMPUTED, NOT TYPED. A status deck that
              asserts "Air-Gapped Safe" while a telemetry SDK is running is
              lying to the customer, so this node reads the actual build: with
              no VITE_POSTHOG_KEY nothing analytics-related is even bundled and
              the claim holds; with one, it says so plainly instead. */}
          <div
            className="deck-node deck-centre"
            data-help={analyticsEnabled()
              ? 'Lyricist Pro runs its audio, MIDI and analysis engines on your own machine. Model calls go out through your own API key. This build also reports anonymous feature usage — which tools get opened and which engines get run. Never your lyrics, keywords, prompts, file names or audio.'
              : 'Lyricist Pro runs its audio, MIDI and analysis engines on your own machine. The only thing that ever leaves this computer is a model request through your own API key. No telemetry of any kind is bundled in this build.'}
          >
            <span className="deck-title">Lyricist Pro</span>
            <span className="deck-sep">·</span>
            <span className="deck-metric">Engine: Local/Hybrid</span>
            <span className="deck-sep">·</span>
            {analyticsEnabled()
              ? <span className="deck-metric">Anonymous Usage Stats</span>
              : <span className="deck-metric deck-ok">Air-Gapped Safe</span>}
          </div>

          {/* RIGHT NODE — licence + routing, and the way to Settings. */}
          <button
            type="button"
            className={`deck-node deck-right ${store.config.openRouterApiKey ? 'is-live' : 'is-idle'}`}
            onClick={() => setActiveTab('settings')}
            data-help="Your licence state and where model calls are routed. Lyricist Pro is Bring-Your-Own-Key: requests go straight from this machine to the provider you configured. Click to open Settings."
          >
            <span className="deck-led" aria-hidden="true" />
            <span className="deck-text">
              <b>Commercial License Active</b>
              <i>{store.config.openRouterApiKey ? 'BYOK Routing' : 'BYOK Key Required'}</i>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE TAB STRIP IS THE APP. (Restored 2026-09-12.)
 *
 * For a while this rendered a single-window DAW layout (src/daw) instead, and
 * the eighteen tabs sat here unrendered behind it. Chris, 2026-09-12: *"the
 * tabs come back on, and everything they did with that other project I want
 * scrapped... there was no plan with that other app."*
 *
 * So it is gone — src/daw, the Tauri MainLayout and its zustand store were all
 * deleted rather than left switched off, because a dead UI that still compiles
 * is a thing every future change has to keep working around. It is in the git
 * history if any of it is ever wanted back, and the next attempt at a DAW view
 * starts from a plan rather than from this.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function App() {
  return (
    <LyricStoreProvider>
      <MainLayout />
    </LyricStoreProvider>
  );
}
