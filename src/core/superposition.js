// ============================================================
// lyric-core / Phase 3 — Superposition
//
// A cell can hold several candidate realizations at once, each with
// an amplitude (a normalized weight). Measurement COLLAPSES the cell
// onto one candidate — either by weighted-random draw, or (for a
// deterministic "crystallize") to the highest-amplitude candidate.
// ============================================================
/** Rescale amplitudes so the non-negative weights sum to 1. */
export function normalizeAmplitudes(candidates) {
    let sum = 0;
    for (const c of candidates)
        sum += Math.max(0, c.amplitude);
    if (sum <= 0) {
        const u = candidates.length ? 1 / candidates.length : 0;
        for (const c of candidates)
            c.amplitude = u;
        return;
    }
    for (const c of candidates)
        c.amplitude = Math.max(0, c.amplitude) / sum;
}
/** Build candidates from words (equal amplitude unless weights given). */
export function candidatesFromWords(words, service, weights) {
    const candidates = [];
    words.forEach((w, i) => {
        const p = service.getPrimary(w);
        if (!p)
            return;
        candidates.push({
            text: w,
            phones: p.phones,
            stress: p.stressPattern[0] ?? null,
            rhymeClass: p.rhymeClass || null,
            amplitude: weights?.[i] ?? 1,
        });
    });
    normalizeAmplitudes(candidates);
    return candidates;
}
/** Open a cell into superposition over the given candidates. */
export function putInSuperposition(cell, candidates) {
    normalizeAmplitudes(candidates);
    cell.isSuperposition = true;
    cell.candidates = candidates;
}
function realize(cell, c) {
    cell.text = c.text;
    cell.phones = c.phones;
    cell.stress = c.stress;
    cell.rhymeClass = c.rhymeClass;
    cell.isSuperposition = false;
    cell.candidates = undefined;
    cell.age = 0;
}
/** Weighted-random measurement — collapses onto one candidate. */
export function collapse(cell, rng = Math.random) {
    if (!cell.isSuperposition || !cell.candidates || cell.candidates.length === 0) {
        return null;
    }
    const cands = cell.candidates;
    const r = rng();
    let acc = 0;
    let chosen = cands[cands.length - 1];
    for (const c of cands) {
        acc += c.amplitude;
        if (r <= acc) {
            chosen = c;
            break;
        }
    }
    realize(cell, chosen);
    return chosen;
}
/** Deterministic collapse to the highest-amplitude candidate. */
export function collapseToMax(cell) {
    if (!cell.isSuperposition || !cell.candidates || cell.candidates.length === 0) {
        return null;
    }
    let best = cell.candidates[0];
    for (const c of cell.candidates)
        if (c.amplitude > best.amplitude)
            best = c;
    realize(cell, best);
    return best;
}
//# sourceMappingURL=superposition.js.map