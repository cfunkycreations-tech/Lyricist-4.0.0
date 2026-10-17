/**
 * WHAT POSTHOG HAS SEEN, PRINTED.
 *
 *   npm run posthog:report            last 7 days
 *   npm run posthog:report -- 30      last 30 days
 *
 * Needs two environment variables, never written into the repo:
 *   POSTHOG_PERSONAL_API_KEY  a personal API key with only "Query: Read"
 *                             (PostHog -> Settings -> Personal API keys)
 *   POSTHOG_PROJECT_ID        the number in the PostHog address bar after /project/
 * POSTHOG_API_HOST is optional (default https://us.posthog.com).
 *
 * Reads only. Prints event counts, the latest Songwriter writes with their picks
 * and rewrite numbers, and what failed. The key is never printed.
 */
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = process.env.POSTHOG_PROJECT_ID;
const HOST = (process.env.POSTHOG_API_HOST || 'https://us.posthog.com').replace(/\/+$/, '');
const DAYS = Math.max(1, Math.min(90, Number(process.argv[2]) || 7));

if (!KEY || !PROJECT) {
  console.error('Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID first (see the top of this file).');
  process.exit(1);
}

async function hogql(query) {
  const res = await fetch(`${HOST}/api/projects/${encodeURIComponent(PROJECT)}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`PostHog said ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  return { columns: out.columns || [], rows: out.results || [] };
}

function table({ columns, rows }) {
  if (!rows.length) { console.log('  (none)'); return; }
  const cells = [columns, ...rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v))))];
  const width = columns.map((_, i) => Math.min(32, Math.max(...cells.map((r) => r[i].length))));
  for (const r of cells) console.log('  ' + r.map((v, i) => v.slice(0, 32).padEnd(width[i])).join('  '));
}

const since = `timestamp > now() - INTERVAL ${DAYS} DAY`;
const p = (k) => `properties.${k} AS ${k}`;

console.log(`\nEVENTS, last ${DAYS} days`);
table(await hogql(`SELECT event, count() AS n, count(DISTINCT distinct_id) AS people, max(timestamp) AS last
  FROM events WHERE ${since} AND event NOT LIKE '$%' GROUP BY event ORDER BY n DESC`));

console.log('\nBUILDS IN USE (which deploy each phone or PC is on)');
table(await hogql(`SELECT properties.app_build AS build, count() AS events, max(timestamp) AS last
  FROM events WHERE ${since} GROUP BY build ORDER BY last DESC LIMIT 10`));

console.log('\nLATEST SONGWRITER WRITES (kept % = share of draft lines that came back the same)');
table(await hogql(`SELECT timestamp, ${['app_build', 'mode', 'model', 'kept_first_pct', 'kept_final_pct', 'retried', 'warned',
  'explicit_asked', 'swore', 'genre1', 'genre2', 'sub1', 'sub2', 'mood1', 'mood2', 'seconds'].map(p).join(', ')}
  FROM events WHERE ${since} AND event = 'song_written' ORDER BY timestamp DESC LIMIT 25`));

console.log('\nWHAT FAILED');
table(await hogql(`SELECT timestamp, event, ${['app_build', 'mode', 'why', 'model'].map(p).join(', ')}
  FROM events WHERE ${since} AND (event LIKE '%fail%' OR event LIKE '%error%') ORDER BY timestamp DESC LIMIT 25`));
console.log('');
