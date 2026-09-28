/**
 * Emit every spoken line in the Ghost Demo as JSON, so the Python baker does not
 * have to parse JavaScript. The list itself lives in src/services/narrationLines.js.
 *
 *     node scripts/dump-ghost-lines.mjs > ghost-lines.json
 *     node scripts/dump-ghost-lines.mjs --wizard     the tour cards instead
 */
import { ghostLines, wizardLines } from '../src/services/narrationLines.js';

process.stdout.write(JSON.stringify(process.argv.includes('--wizard') ? wizardLines() : ghostLines(), null, 2));
