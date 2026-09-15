/**
 * Butterchurn (Milkdrop 2 in WebGL) and every preset pack it ships with, loaded
 * once and shared: the MIDI Studio visualizer and the Push header both use it.
 *
 * The packages are UMD bundles, so what Vite hands back is the namespace, its
 * .default, or .default.default depending on dev or build. Unwrap until the
 * real API is found.
 */
let loading = null;

const unwrap = (mod, key) => {
  for (const cand of [mod, mod?.default, mod?.default?.default]) {
    if (cand && typeof cand[key] === 'function') return cand;
  }
  return null;
};

export function loadButterchurn() {
  if (loading) return loading;
  loading = (async () => {
    const [bcMod, ...packMods] = await Promise.all([
      import('butterchurn'),
      import('butterchurn-presets'),
      import('butterchurn-presets/lib/butterchurnPresetsExtra.min.js').catch(() => null),
      import('butterchurn-presets/lib/butterchurnPresetsExtra2.min.js').catch(() => null),
      import('butterchurn-presets/lib/butterchurnPresetsMD1.min.js').catch(() => null),
      import('butterchurn-presets/lib/butterchurnPresetsNonMinimal.min.js').catch(() => null),
    ]);
    const butterchurn = unwrap(bcMod, 'createVisualizer');
    if (!butterchurn) throw new Error('Butterchurn loaded but createVisualizer was not found');
    const map = {};
    for (const packMod of packMods) {
      const pack = unwrap(packMod, 'getPresets');
      if (!pack) continue;
      try { Object.assign(map, pack.getPresets()); } catch { /* a bad pack must not take the rest down */ }
    }
    const names = Object.keys(map).sort((a, b) => a.localeCompare(b));
    return { butterchurn, map, names };
  })().catch((e) => { loading = null; throw e; });
  return loading;
}
