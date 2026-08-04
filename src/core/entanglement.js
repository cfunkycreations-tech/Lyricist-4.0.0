// ============================================================
// lyric-core / Phase 3 — Entanglement
//
// Explicit links between distant cells. When one cell collapses, its
// entangled partners have their still-open candidate amplitudes
// reweighted based on the collapsed value:
//   "rhyme"    → boost partner candidates that rhyme with the result
//   "contrast" → boost partner candidates that DIFFER (force variety)
//
// This is the "measure one, the other reacts" effect — correlations
// across a song, realized classically.
// ============================================================
import { rhymeNucleus } from "./rhyme.js";
import { collapse, normalizeAmplitudes } from "./superposition.js";
export function entangle(aId, bId, type, strength = 0.6) {
    return { aId, bId, type, strength };
}
/** Index every cell of a section by id (for MeasureContext). */
export function cellIndex(section) {
    const map = new Map();
    for (const line of section.lines)
        for (const cell of line.cells)
            map.set(cell.id, cell);
    return map;
}
/**
 * Reweight a partner's open candidates given a collapsed value + link.
 * Returns false if the partner isn't in superposition.
 */
export function reweightPartner(partner, collapsed, link) {
    if (!partner.isSuperposition || !partner.candidates)
        return false;
    const s = Math.max(0, Math.min(1, link.strength));
    const target = collapsed.rhymeClass;
    for (const cand of partner.candidates) {
        const same = !!target && cand.rhymeClass === target;
        const slant = !!target &&
            !!cand.rhymeClass &&
            rhymeNucleus(cand.rhymeClass) === rhymeNucleus(target);
        let factor;
        if (link.type === "rhyme") {
            factor = same ? 1 + s : slant ? 1 + s / 2 : 1 - s;
        }
        else {
            // contrast: reward difference, punish sameness
            factor = same ? 1 - s : 1 + s / 2;
        }
        cand.amplitude = Math.max(0, cand.amplitude * factor);
    }
    normalizeAmplitudes(partner.candidates);
    return true;
}
/**
 * Measure (collapse) a cell, then propagate the result to every
 * entangled partner by reweighting its open candidates. Returns the
 * collapsed candidate and the ids of partners that were reweighted.
 */
export function measure(cellId, ctx, rng = Math.random) {
    const cell = ctx.cells.get(cellId);
    if (!cell)
        return { collapsed: null, reweighted: [] };
    const collapsed = collapse(cell, rng);
    if (!collapsed)
        return { collapsed: null, reweighted: [] };
    const reweighted = [];
    for (const link of ctx.links) {
        const partnerId = link.aId === cellId ? link.bId : link.bId === cellId ? link.aId : null;
        if (!partnerId)
            continue;
        const partner = ctx.cells.get(partnerId);
        if (partner && reweightPartner(partner, collapsed, link)) {
            reweighted.push(partnerId);
        }
    }
    return { collapsed, reweighted };
}
//# sourceMappingURL=entanglement.js.map