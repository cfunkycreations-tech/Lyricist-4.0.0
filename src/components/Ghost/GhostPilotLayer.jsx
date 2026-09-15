import React, { useEffect, useState } from 'react';
import { registerGhostActions } from '../../services/ghostBus.js';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE GATE.
 *
 * Everything behind this file — the virtual cursor, the command executor, the
 * synthetic DOM events, the OBS WebSocket client — is INTERNAL MARKETING
 * TOOLING. It exists so demo videos can be recorded hands-free. It must never
 * reach a paying customer's installer, in any form, dormant or otherwise.
 *
 * HOW THE VAPORISATION ACTUALLY WORKS, because getting this wrong is silent:
 *
 *   1. Vite replaces `import.meta.env.VITE_FAFO_INTERNAL_BUILD` with a STRING
 *      LITERAL at build time. In the commercial build the line below compiles
 *      to `const INTERNAL = "false" === 'true'`, and then to `false`.
 *   2. `loadPilot` is therefore the dead branch of a ternary. Rollup folds the
 *      constant, drops the branch, and the arrow function holding the two
 *      dynamic import() calls goes with it.
 *   3. With no reachable import() referencing them, VirtualCursor.jsx,
 *      ghostPilot.js and obsClient.js are never pulled into the graph. No
 *      chunk is emitted. Not minified-and-shipped: absent.
 *
 * THIS IS WHY THE IMPORTS ARE DYNAMIC AND INSIDE A TERNARY, and why they must
 * stay that way. A static `import VirtualCursor from './VirtualCursor.jsx'` at
 * the top of this file would ship the entire robotics layer to every customer
 * no matter what the flag said, because a static import is a side-effecting
 * dependency Rollup is not allowed to remove. Rendering `{INTERNAL && <Cursor/>}`
 * with a static import is the exact trap: the UI hides, the CODE ships.
 *
 * To record with it:  VITE_FAFO_INTERNAL_BUILD=true npm run dev
 * To ship:            npm run build   (flag absent — nothing here is included)
 * ══════════════════════════════════════════════════════════════════════════
 */
const INTERNAL = import.meta.env.VITE_FAFO_INTERNAL_BUILD === 'true';

const loadPilot = INTERNAL
  ? () => Promise.all([
      import('./VirtualCursor.jsx'),
      import('../../services/ghostPilot.js'),
    ])
  : null;

export default function GhostPilotLayer() {
  const [Cursor, setCursor] = useState(null);

  useEffect(() => {
    if (!loadPilot) return undefined;
    let alive = true;
    let stop = null;

    let offActions = null;

    loadPilot()
      .then(([cursorMod, pilotMod]) => {
        if (!alive) return;
        stop = pilotMod.startGhostPilot();
        setCursor(() => cursorMod.default);

        /**
         * PUT THE PILOT ON THE PUBLIC BUS.
         *
         * Chris, 2026-08-27, watching a first take of the Matrix demo fail:
         * *"MAKE THE WHOLE FUCKING SYSTEM WORK. That includes the prompt, the
         * WebSocket, the voice, the cursor moving, the syncing."* The pilot
         * layer already had all the pieces — `runGhostScript` moves the visible
         * cursor, `speakLine` narrates in the current Kokoro voice, and OBS
         * WebSocket recording is a native action. What was missing: the ghost
         * box's LLM had no way to REACH any of that. It saw `describe_song`
         * and `set_voice` on the bus and nothing else, so its reply was "Done."
         * and no cursor moved.
         *
         * These four actions are the door. `run_matrix_walkthrough` is the
         * one Chris types about — a scripted, deterministic Matrix demo that
         * moves the cursor, narrates in the chosen voice, presses the real
         * buttons, and (optionally) bookends itself with OBS recording. The
         * other three are exposed so a prompt can compose its own sequence
         * without needing another registration for every clip.
         *
         * All four are Creator-only by construction — they live inside the
         * pilot's own load path, which the gate strips from customer builds
         * along with VirtualCursor and obsClient.
         */
        const { runGhostScript } = pilotMod;
        offActions = registerGhostActions({

          // The one-prompt Matrix demo. Fixed script so the recording is the
          // same take every time.
          run_matrix_walkthrough: async ({ withObs } = {}) => {
            /**
             * A FULL WALKTHROUGH, NOT A SUMMARY.
             *
             * The first cut of this script had cursor moves and narration and
             * exactly one real interaction (a click on Auto-Craft). Chris,
             * watching a take: *"the screen should have scrolled up, the words
             * should have looked like they were being typed into the box,
             * didn't happen! Buttons should have lit up as they were being
             * pushed, didn't fucking happen!"* Right — a recording is meant to
             * show a person USING the app, so the person types, presses the
             * load button, waits, then presses Auto-Craft. Every step a viewer
             * would see if they were watching you do it themselves.
             *
             * The keyword textarea has its own class .ql-keywords-input, not a
             * data-demo attribute of its own, so type targets that directly.
             */
            const SEEDS = [
              'neon signs', 'midnight drive', 'empty cup', 'cold rain', 'static',
              'gravity', 'amber', 'river', 'fever', 'lattice',
              'drums', 'glows', 'flows', 'symbol', 'number',
              'frantic', 'shiver', 'ember', 'hums', 'never',
            ].join(', ');

            const script = [
              withObs && { action: 'obs_record_start' },

              // Intro on the keyword box so the viewer's eye lands there.
              { action: 'move', target: '#ql-kw-input' },
              { action: 'speak', text: 'Hey everyone, welcome back. Today I want to show you how I write a full verse in Lyricist Pro using this tool right here called The Matrix. It sounds fancy, but honestly all it does is take a few of your words and grow a whole verse out of them.', waitFor: 'end' },

              // Focus the field, then type the seed keywords one character at a
              // time. typeInto goes through the native value setter and fires a
              // real input event, which is what React's change tracker needs to
              // believe a person typed it.
              { action: 'click', target: '#ql-kw-input' },
              { action: 'speak', text: 'I start by typing in the words that feel like the vibe I want. Anything works here, a place, a feeling, an object. The Matrix will pull ideas out of them for me.', waitFor: 'play' },
              { action: 'type', target: '#ql-kw-input', text: SEEDS },
              { action: 'wait', ms: 600 },

              // Load the typed words into the grid. This button (Step 2) lives in
              // the keyword intake block above the grid, always visible.
              { action: 'move', target: '[data-demo="ql-load"]' },
              { action: 'speak', text: 'Now I hit Load into Grid, and every one of those words drops straight into the grid below.', waitFor: 'play' },
              { action: 'click', target: '[data-demo="ql-load"]' },
              { action: 'wait', ms: 1400 },

              /**
               * THE ONE BUTTON. Auto-Craft Verse is the Tier-1 Quick Path: one
               * press spreads the energy across twelve generations, locks the
               * field, and writes both neural verses.
               *
               * WHY NOT THE SIX MANUAL STEPS. The old script drove ql-runlock
               * then ql-generate — but the two-tier refactor moved every manual
               * control into the Advanced Studio drawer, which is COLLAPSED by
               * default, so those buttons are not in the DOM and the walkthrough
               * died on "nothing matches ql-runlock". Auto-Craft is always on
               * screen and does the same job in a single, cleaner press — which
               * is the better demo anyway.
               */
              { action: 'move', target: '[data-demo="matrix-autocraft"]' },
              { action: 'speak', text: 'And here is the one button that does all the work. Auto-Craft Verse spreads energy across the whole grid, locks it in, and writes me two full verses. One click.', waitFor: 'play' },
              { action: 'click', target: '[data-demo="matrix-autocraft"]' },
              { action: 'speak', text: 'Watch the tiles light up. The hotter a tile gets, the more pull it has on the words around it. That is the grid working out which of my ideas belong together, and then it writes the verses for me.', waitFor: 'end' },

              // Auto-Craft runs 12 generations, locks, then two sequential model
              // calls with a gap between them. Give it room to finish.
              { action: 'wait', ms: 14000 },

              // Payoff and soft CTA.
              { action: 'speak', text: 'And there we go, two verses to choose from. Pick whichever one sounds most like you, send it over to Songwriter, and you are off. That is how easy it is. Go give it a try yourself.', waitFor: 'end' },

              withObs && { action: 'obs_record_stop' },
            ].filter(Boolean);
            const r = await runGhostScript(script);
            return r.ok
              ? 'Matrix walkthrough done.'
              : { said: `Walkthrough stopped: ${r.error}`, warn: r.error };
          },

          // Bookends the operator can call independently. `withObs:true` on the
          // walkthrough uses these internally.
          // A failure THROWS, so it lands as ✗. It used to return a sentence,
          // which the bus counts as done: Chris's run showed "✓ OBS did not
          // start: ErrorError". startRecord opens OBS itself when it is closed.
          obs_record_start: async () => {
            const r = await runGhostScript([{ action: 'obs_record_start' }]);
            if (!r.ok) throw new Error(`OBS did not start recording: ${r.error}`);
            return 'OBS is recording';
          },
          obs_record_stop: async () => {
            const r = await runGhostScript([{ action: 'obs_record_stop' }]);
            if (!r.ok) throw new Error(`OBS did not stop recording: ${r.error}`);
            return 'OBS stopped recording';
          },

          // Generic pilot passthrough — a prompt can compose any pilot verb by
          // hand: `pilot_run` with an array of actions. Kept for flexibility;
          // most prompts should call one of the named actions above.
          pilot_run: async ({ actions } = {}) => {
            if (!Array.isArray(actions) || !actions.length) return { said: 'nothing to run', warn: 'pilot_run needs actions:[...]' };
            const r = await runGhostScript(actions);
            return r.ok ? 'pilot script done' : { said: `pilot stopped: ${r.error}`, warn: r.error };
          },
        });
      })
      .catch((e) => {
        // An internal tool that cannot load is a note in the console, never an
        // error boundary. The app underneath is the thing being demoed.
        console.warn('[ghost pilot] did not start:', e);
      });

    return () => {
      alive = false;
      if (offActions) offActions();
      if (stop) stop();
    };
  }, []);

  if (!loadPilot || !Cursor) return null;
  return <Cursor />;
}
