/**
 * Emit every spoken line in the Ghost Demo as JSON, so the Python baker does not
 * have to parse JavaScript.
 *
 *     node scripts/dump-ghost-lines.mjs > ghost-lines.json
 *
 * The id is the contract between this file, the baked mp3 on disk, and the
 * lookup in GhostDemo.jsx: `<tabId>-<stepIndex>-<field>`. Change the id scheme
 * and every clip goes silent, so don't.
 */
import { GHOST_DEMOS } from '../src/components/Onboarding/ghostDemoScripts.js';

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
  id: 'system-0-notabdemo',
  tabId: 'system', step: 0, field: 'notabdemo',
  text: 'Dictionary, Thesaurus, and the simple tools do not get a remote demo. Use Tips ON and hover instead. Ghost Demo is for the harder tabs.',
});
lines.push({
  id: 'system-0-finished',
  tabId: 'system', step: 0, field: 'finished',
  text: 'Remote demo finished. Your own work has been put back exactly as you left it. The demo never keeps anything.',
});

process.stdout.write(JSON.stringify(lines, null, 2));
