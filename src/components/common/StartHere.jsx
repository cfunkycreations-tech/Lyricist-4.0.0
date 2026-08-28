import React from 'react';
import { useLyricStore } from '../../context/LyricStore.jsx';
import './StartHere.css';

/**
 * WHAT YOU NEED, SAID BEFORE YOU NEED IT.
 *
 * Chris, 2026-08-19: *"you gotta tell people upfront that they need an API key
 * first, not at the last fucking minute or the last card... We have to have that
 * first. If you have to set it up first, you should have that card first."*
 *
 * He is describing a real shape in this app and it was backwards everywhere:
 *   - the guided tour's card titled "Settings, set this up first" was card
 *     NINETEEN OF TWENTY;
 *   - and in the code there are FOURTEEN separate `if (!openRouterApiKey)`
 *     checks, every one of them sitting behind a button. So the app's answer to
 *     "what do I need?" was: press something, get told no, go and find Settings,
 *     come back, and press it again.
 *
 * This is the other half of the fix. It sits ABOVE the tab content, on every
 * tab, from the first second the app opens, until the key exists. Not a toast,
 * not a nag bar that disappears, not a footnote in help: the first thing on the
 * screen, with the button that does it right there in it.
 *
 * IT IS ALSO HONEST ABOUT WHAT STILL WORKS. Half this studio needs no key at all
 * and it would be a lie by omission to imply the app is locked. So the card says
 * which parts are waiting and which parts are ready right now, and it never
 * blocks anything.
 */
export default function StartHere({ onGoToSettings }) {
  const store = useLyricStore();
  if (store.config?.openRouterApiKey) return null;

  return (
    <div className="sh" role="region" aria-label="Setup needed">
      <div className="sh-mark" aria-hidden="true">1</div>

      <div className="sh-body">
        <h2>Start here: get your free key</h2>
        <p className="sh-lead">
          The parts of Lyricist that <b>write words for you</b> need a free key from OpenRouter.
          It takes about two minutes, there are free models on it, and one key runs the whole
          studio. Doing it now means nothing stops you later.
        </p>

        <div className="sh-two">
          <div>
            <span className="sh-h waiting">Waiting on the key</span>
            <p>Songwriter's AI writing, Ghost Rider, Song Forge, The Matrix, Rhyme Helper's AI suggestions</p>
          </div>
          <div>
            <span className="sh-h ready">Ready right now, no key</span>
            <p>One Man Band, Recording Booth, RC-Funk 5000, Mastering, local stem extraction, MIDI Studio,
              Chopped &amp; Screwed, Thesaurus, Dictionary, Scratch Pad</p>
          </div>
        </div>

        <div className="sh-actions">
          <button
            type="button"
            className="sh-go"
            onClick={() => window.open('https://openrouter.ai/keys', '_blank', 'noopener')}
          >
            1 · Get the free key
          </button>
          <button type="button" className="sh-go primary" onClick={onGoToSettings}>
            2 · Paste it into Settings
          </button>
        </div>
        <p className="sh-fine">
          This card disappears the moment the key is saved. Nothing here costs money, and Lyricist
          never sees your key — it goes straight from your computer to OpenRouter.
        </p>
      </div>
    </div>
  );
}
