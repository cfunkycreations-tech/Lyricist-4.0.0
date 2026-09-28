/**
 * Every line the app speaks from a baked clip, in one place: the Ghost Demo
 * lines and the tour cards. The Voice Lab bakes from this, and
 * scripts/dump-ghost-lines.mjs prints it for the command-line bakers.
 *
 * Ghost ids are the contract with the clip on disk and the lookup in
 * GhostDemo.jsx: `<tabId>-<stepIndex>-<field>`. Change the scheme and every
 * clip goes silent, so don't.
 */
import { GHOST_DEMOS } from '../components/Onboarding/ghostDemoScripts.js';
import { WIZARD_CARDS } from '../components/Onboarding/wizardCards.js';

export function ghostLines() {
  const lines = [];
  for (const [tabId, demo] of Object.entries(GHOST_DEMOS)) {
    demo.steps.forEach((step, i) => {
      for (const field of ['say', 'then', 'whenMissing']) {
        const text = step[field];
        if (typeof text === 'string' && text.trim()) {
          lines.push({ id: `${tabId}-${i}-${field}`, tabId, step: i, field, text: text.trim() });
        }
      }
    });
  }
  // The two lines GhostDemo speaks itself, outside any script.
  lines.push({
    id: 'system-0-notabdemo', tabId: 'system', step: 0, field: 'notabdemo',
    text: 'Dictionary, Thesaurus, and the simple tools do not get a remote demo. Use Tips ON and hover instead. Ghost Demo is for the harder tabs.',
  });
  lines.push({
    id: 'system-0-finished', tabId: 'system', step: 0, field: 'finished',
    text: 'Remote demo finished. Your own work has been put back exactly as you left it. The demo never keeps anything.',
  });
  return lines;
}

/** Tour cards: id is the clip stem the wizard and the voice pack use (card-01 ...). */
export function wizardLines() {
  return WIZARD_CARDS
    .filter((c) => c.audio && c.script)
    .map((c) => ({ id: c.audio.replace(/\.mp3$/, ''), tabId: 'tour', title: c.title, text: c.script.replace(/\n\n+/g, ' ').trim() }));
}
