// ============================================================
// lyric-core / Phase 2 — Cellular Automata
//
// A section, laid out as a Lattice, evolves over generations under
// local rules — the "living" feel from the album.
//
//   energy field   → diffuses to neighbors, decays, can be spotlighted
//   age            → generations since a cell last changed structurally
//   crystallize    → hot line-final cells adopt the energy-weighted
//                    dominant neighbor rhyme class (rhyme contagion),
//                    realized by re-selecting a rhyming end word
//
// Frozen cells are inert anchors (they hold energy, never mutate).
// Mask/padding slots are skipped. Everything is deterministic given
// a seed. Export back to editable lyrics via Lattice.toSection().
// ============================================================
import { Lattice } from "./lattice.js";
import { RhymeGraph } from "./rhymeGraph.js";
function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function pick(arr, rng) {
    return arr.length ? arr[Math.floor(rng() * arr.length)] : undefined;
}
/** Energies of the 4-neighborhood (skips mask / out-of-bounds). */
function neighborEnergies(lat, r, c) {
    const out = [];
    const deltas = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
    ];
    for (const [dr, dc] of deltas) {
        const cell = lat.get(r + dr, c + dc);
        if (cell)
            out.push(cell.energy);
    }
    return out;
}
/** Advance the energy field one generation (mutates the lattice in place). */
export function step(lat, opts = {}) {
    const diffusion = opts.diffusion ?? 0.2;
    const decay = opts.decay ?? 0.05;
    // synchronous update: compute all next values from the CURRENT state
    const next = [];
    for (let r = 0; r < lat.rows; r++) {
        const row = [];
        for (let c = 0; c < lat.cols; c++) {
            const cell = lat.get(r, c);
            if (!cell || cell.frozen) {
                row.push(cell ? cell.energy : null);
                continue;
            }
            const ns = neighborEnergies(lat, r, c);
            const avg = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : cell.energy;
            row.push(clamp01(cell.energy * (1 - decay) + diffusion * (avg - cell.energy)));
        }
        next.push(row);
    }
    for (let r = 0; r < lat.rows; r++) {
        for (let c = 0; c < lat.cols; c++) {
            const cell = lat.get(r, c);
            if (!cell)
                continue;
            const ne = next[r][c];
            if (ne != null && !cell.frozen)
                cell.energy = ne;
            cell.age = cell.age + 1; // structural change (crystallize) resets this to 0
        }
    }
}
/** Run the energy CA for N generations. */
export function evolve(lat, generations, opts = {}) {
    for (let g = 0; g < generations; g++)
        step(lat, opts);
}
/** Inject energy into a rectangular region (inclusive ranges). */
export function spotlight(lat, rowRange, colRange, amount = 0.5) {
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
        for (let c = colRange[0]; c <= colRange[1]; c++) {
            const cell = lat.get(r, c);
            if (cell && !cell.frozen)
                cell.energy = clamp01(cell.energy + amount);
        }
    }
}
/** The last real cell of each row (its line-final / end-rhyme cell). */
function lineFinalCells(lat) {
    const out = [];
    for (let r = 0; r < lat.rows; r++) {
        for (let c = lat.cols - 1; c >= 0; c--) {
            const cell = lat.get(r, c);
            if (cell) {
                out.push({ r, cell });
                break;
            }
        }
    }
    return out;
}
/**
 * Rhyme contagion → crystallize. For each non-frozen, single-syllable
 * line-final cell whose energy is at/above the threshold, adopt the
 * energy-weighted dominant rhyme class among the OTHER line-final cells
 * (diffused across the rhyme graph) by re-selecting a rhyming end word.
 * Multi-syllable end words are left untouched in v1. Returns how many
 * cells crystallized.
 */
export function crystallize(lat, service, opts = {}) {
    const threshold = opts.threshold ?? 0.6;
    const rng = mulberry32(opts.seed ?? 1);
    const finals = lineFinalCells(lat);
    const classes = finals
        .map((f) => f.cell.rhymeClass)
        .filter((x) => !!x);
    const graph = new RhymeGraph(classes);
    let changed = 0;
    for (const f of finals) {
        const cell = f.cell;
        if (cell.frozen || cell.energy < threshold)
            continue;
        // single-syllable word only (its text sits on this word-final cell)
        if (!cell.isWordFinal || cell.text.trim() === "")
            continue;
        const seeds = new Map();
        for (const other of finals) {
            if (other === f)
                continue;
            const oc = other.cell.rhymeClass;
            if (oc)
                seeds.set(oc, (seeds.get(oc) ?? 0) + other.cell.energy);
        }
        if (seeds.size === 0)
            continue;
        const act = graph.propagate(seeds, opts.rounds !== undefined ? { rounds: opts.rounds } : {});
        let best = null;
        let bestA = -1;
        for (const [cls, a] of act) {
            if (a > bestA) {
                bestA = a;
                best = cls;
            }
        }
        if (!best || best === cell.rhymeClass)
            continue;
        const key = cell.stress !== null && cell.stress > 0 ? "1" : "0";
        const cands = service.rhymesForClass(best).filter((w) => {
            const p = service.getPrimary(w);
            return (p !== null &&
                p.syllableCount === 1 &&
                (p.stressPattern[0] > 0 ? "1" : "0") === key);
        });
        const chosen = pick(cands, rng);
        if (chosen === undefined)
            continue;
        const p = service.getPrimary(chosen);
        cell.text = chosen;
        cell.phones = p.phones;
        cell.stress = p.stressPattern[0] ?? cell.stress;
        cell.rhymeClass = p.rhymeClass || cell.rhymeClass;
        cell.phoneticSource = p.source;
        cell.age = 0;
        changed++;
    }
    return changed;
}
//# sourceMappingURL=automata.js.map