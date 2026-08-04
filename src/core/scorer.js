// ============================================================
// lyric-core / Multi-objective Scorer
//
// Returns a normalized ScoreVector (every component in [0,1]) for a
// Section. These are deliberately transparent v1 heuristics — the
// constraint engine (Phase 1) and automata (Phase 2) call these to
// rank candidate states. Weights are tunable per call.
//
// Everything here is null-safe and NaN-safe: empty or missing data
// yields a defined neutral value, never NaN.
// ============================================================
import { rhymeCoda, rhymeNucleus } from "./rhyme.js";
export const DEFAULT_WEIGHTS = {
    rhymeStrength: 1.0,
    stressFidelity: 1.0,
    semanticCoherence: 0.75,
    energyBalance: 0.5,
    novelty: 0.5,
};
// ---- small numeric helpers -----------------------------------
function clamp01(x) {
    if (Number.isNaN(x))
        return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
function mean(xs) {
    if (xs.length === 0)
        return 0;
    let s = 0;
    for (const x of xs)
        s += x;
    return s / xs.length;
}
function stdev(xs) {
    if (xs.length < 2)
        return 0;
    const m = mean(xs);
    let acc = 0;
    for (const x of xs)
        acc += (x - m) * (x - m);
    return Math.sqrt(acc / xs.length);
}
export function cosineSimilarity(a, b) {
    const n = Math.min(a.length, b.length);
    if (n === 0)
        return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
        const av = a[i];
        const bv = b[i];
        dot += av * bv;
        na += av * av;
        nb += bv * bv;
    }
    if (na === 0 || nb === 0)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
// ---- structural accessors ------------------------------------
/** A line's end-rhyme class: the last word-final cell's rhyme class. */
export function lineFinalRhymeClass(line) {
    for (let i = line.cells.length - 1; i >= 0; i--) {
        const c = line.cells[i];
        if (c.isWordFinal && c.rhymeClass)
            return c.rhymeClass;
    }
    const last = line.cells[line.cells.length - 1];
    return last ? last.rhymeClass : null;
}
/** A line's per-syllable stress pattern (unknown stress → 0). */
export function lineStressPattern(line) {
    return line.cells.map((c) => (c.stress ?? 0));
}
function allCells(section) {
    const out = [];
    for (const line of section.lines)
        out.push(...line.cells);
    return out;
}
function parseTargetPattern(t) {
    if (!t)
        return null;
    if (Array.isArray(t))
        return t;
    const digits = [];
    for (const ch of t) {
        if (ch === "0" || ch === "1" || ch === "2") {
            digits.push(Number(ch));
        }
    }
    return digits.length ? digits : null;
}
/** Two rhyme-class strings rhyme "strongly enough" → [0,1]. */
function classRhymeStrength(a, b) {
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    const sameNucleus = rhymeNucleus(a) === rhymeNucleus(b);
    const codaA = rhymeCoda(a);
    const sameCoda = codaA !== "" && codaA === rhymeCoda(b);
    return sameNucleus || sameCoda ? 0.5 : 0;
}
// ---- component scorers ---------------------------------------
/**
 * Rhyme strength. If lines carry rhymeSchemeSlot labels, reward lines
 * in the same slot sharing a rhyme class. Otherwise reward end-rhyme
 * between adjacent lines. 0 when there is nothing to compare.
 */
export function scoreRhymeStrength(section) {
    const lines = section.lines;
    const labeled = lines.filter((l) => l.rhymeSchemeSlot);
    if (labeled.length >= 2) {
        const groups = new Map();
        for (const l of labeled) {
            const cls = lineFinalRhymeClass(l);
            if (!cls)
                continue;
            const slot = l.rhymeSchemeSlot;
            const arr = groups.get(slot) ?? [];
            arr.push(cls);
            groups.set(slot, arr);
        }
        const groupScores = [];
        for (const classes of groups.values()) {
            if (classes.length < 2)
                continue;
            let pairSum = 0;
            let pairCount = 0;
            for (let i = 0; i < classes.length; i++) {
                for (let j = i + 1; j < classes.length; j++) {
                    pairSum += classRhymeStrength(classes[i], classes[j]);
                    pairCount++;
                }
            }
            if (pairCount > 0)
                groupScores.push(pairSum / pairCount);
        }
        if (groupScores.length > 0)
            return clamp01(mean(groupScores));
    }
    // No usable slot labels: reward adjacent end-rhyme.
    const finals = lines.map(lineFinalRhymeClass);
    if (finals.length < 2)
        return 0;
    const pairScores = [];
    for (let i = 0; i + 1 < finals.length; i++) {
        pairScores.push(classRhymeStrength(finals[i], finals[i + 1]));
    }
    return clamp01(mean(pairScores));
}
/**
 * Stress fidelity. With a target pattern, measure per-position match
 * (pattern cycles to line length). Without one, reward metrical
 * alternation (regular strong/weak). Neutral 0.5 when empty.
 */
export function scoreStressFidelity(section, target) {
    const pattern = parseTargetPattern(target);
    const lineScores = [];
    for (const line of section.lines) {
        const stresses = lineStressPattern(line);
        if (stresses.length === 0)
            continue;
        if (pattern) {
            let matches = 0;
            for (let i = 0; i < stresses.length; i++) {
                const want = pattern[i % pattern.length];
                // Compare on the stressed/unstressed axis (2 counts as stressed).
                const gotStressed = stresses[i] > 0;
                const wantStressed = want > 0;
                if (gotStressed === wantStressed)
                    matches++;
            }
            lineScores.push(matches / stresses.length);
        }
        else {
            if (stresses.length < 2) {
                lineScores.push(0.5);
                continue;
            }
            let alternations = 0;
            for (let i = 1; i < stresses.length; i++) {
                const prev = stresses[i - 1] > 0;
                const cur = stresses[i] > 0;
                if (prev !== cur)
                    alternations++;
            }
            lineScores.push(alternations / (stresses.length - 1));
        }
    }
    if (lineScores.length === 0)
        return 0.5;
    return clamp01(mean(lineScores));
}
/**
 * Semantic coherence: average cosine similarity between consecutive
 * line centroids (mapped from [-1,1] to [0,1]). Neutral 0.5 when no
 * semantic vectors are present.
 */
export function scoreSemanticCoherence(section) {
    const centroids = [];
    for (const line of section.lines) {
        const vecs = line.cells
            .map((c) => c.semanticVector)
            .filter((v) => Array.isArray(v) && v.length > 0);
        if (vecs.length === 0)
            continue;
        const dim = vecs[0].length;
        const centroid = new Array(dim).fill(0);
        for (const v of vecs) {
            for (let i = 0; i < dim; i++)
                centroid[i] += v[i] ?? 0;
        }
        for (let i = 0; i < dim; i++)
            centroid[i] /= vecs.length;
        centroids.push(centroid);
    }
    if (centroids.length < 2)
        return 0.5;
    const sims = [];
    for (let i = 0; i + 1 < centroids.length; i++) {
        sims.push(cosineSimilarity(centroids[i], centroids[i + 1]));
    }
    return clamp01((mean(sims) + 1) / 2);
}
/**
 * Energy balance: reward a mid-range mean (dynamics headroom) plus
 * some spread (contrast). Neutral 0.5 when no energy data.
 */
export function scoreEnergyBalance(section) {
    const energies = allCells(section).map((c) => c.energy);
    if (energies.length === 0)
        return 0.5;
    const m = mean(energies);
    const sd = stdev(energies);
    const centerScore = 1 - Math.abs(m - 0.5) * 2; // peaks at m = 0.5
    const variationScore = Math.min(1, sd / 0.25); // some contrast is good
    return clamp01(0.6 * clamp01(centerScore) + 0.4 * variationScore);
}
/**
 * Novelty: lexical diversity — distinct syllable texts / total.
 * Neutral 0.5 when there is no text yet.
 */
export function scoreNovelty(section) {
    const texts = allCells(section)
        .map((c) => String(c.text ?? "").trim().toLowerCase())
        .filter((t) => t.length > 0);
    if (texts.length === 0)
        return 0.5;
    const unique = new Set(texts).size;
    return clamp01(unique / texts.length);
}
/** Compute the full multi-objective ScoreVector for a section. */
export function scoreSection(section, options = {}) {
    const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
    const rhymeStrength = scoreRhymeStrength(section);
    const stressFidelity = scoreStressFidelity(section, options.targetStressPattern);
    const semanticCoherence = scoreSemanticCoherence(section);
    const energyBalance = scoreEnergyBalance(section);
    const novelty = scoreNovelty(section);
    const wSum = weights.rhymeStrength +
        weights.stressFidelity +
        weights.semanticCoherence +
        weights.energyBalance +
        weights.novelty;
    const overall = wSum === 0
        ? 0
        : (rhymeStrength * weights.rhymeStrength +
            stressFidelity * weights.stressFidelity +
            semanticCoherence * weights.semanticCoherence +
            energyBalance * weights.energyBalance +
            novelty * weights.novelty) /
            wSum;
    return {
        rhymeStrength,
        stressFidelity,
        semanticCoherence,
        energyBalance,
        novelty,
        overall: clamp01(overall),
    };
}
//# sourceMappingURL=scorer.js.map