// ============================================================
// lyric-core / Phase 3 — Sectional DNA
//
// A compact fingerprint of a finished section (stress signature,
// rhyme scheme + dominant classes, energy, optional semantic
// centroid). Lock it, measure the distance between two, MUTATE it for
// controlled variation, or INJECT it — turn a DNA back into a fill
// template so a new section inherits the parent's meter and rhyme
// structure while the words vary.
// ============================================================
import { cosineSimilarity, lineFinalRhymeClass, lineStressPattern, } from "./scorer.js";
function clamp01(x) {
    if (Number.isNaN(x))
        return 0;
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
/** Assign rhyme letters (A, B, …) by first appearance; "." for no rhyme. */
function schemeFromFinals(finals) {
    const map = new Map();
    let next = 65; // 'A'
    let out = "";
    for (const f of finals) {
        if (!f) {
            out += ".";
            continue;
        }
        let letter = map.get(f);
        if (!letter) {
            letter = String.fromCharCode(next++);
            map.set(f, letter);
        }
        out += letter;
    }
    return out;
}
function centroid(vectors) {
    let dim = Infinity;
    for (const v of vectors)
        dim = Math.min(dim, v.length);
    if (!Number.isFinite(dim) || dim <= 0)
        return [];
    const out = new Array(dim).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++)
            out[i] = (out[i] ?? 0) + (v[i] ?? 0);
    }
    for (let i = 0; i < dim; i++)
        out[i] = (out[i] ?? 0) / vectors.length;
    return out;
}
/** Extract a SectionalDNA fingerprint. `createdAt` is supplied by the caller. */
export function extractDNA(section, createdAt = 0) {
    const lines = section.lines;
    const stressSignature = lines
        .map((l) => lineStressPattern(l).map((s) => (s > 0 ? "1" : "0")).join(""))
        .join("-");
    const finals = lines.map(lineFinalRhymeClass);
    const rhymeScheme = schemeFromFinals(finals);
    const counts = new Map();
    for (const f of finals)
        if (f)
            counts.set(f, (counts.get(f) ?? 0) + 1);
    const dominantRhymeClasses = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map((e) => e[0]);
    let cellCount = 0;
    let energySum = 0;
    const vectors = [];
    for (const l of lines) {
        for (const c of l.cells) {
            cellCount++;
            energySum += c.energy;
            if (c.semanticVector && c.semanticVector.length)
                vectors.push(c.semanticVector);
        }
    }
    const dna = {
        stressSignature,
        dominantRhymeClasses,
        rhymeScheme,
        averageEnergy: cellCount ? energySum / cellCount : 0,
        lineCount: lines.length,
        syllableCount: cellCount,
        createdAt,
    };
    if (vectors.length)
        dna.semanticCentroid = centroid(vectors);
    return dna;
}
/** Distance between two DNAs in [0,1] (0 = identical). */
export function dnaDistance(a, b) {
    const parts = [];
    const la = a.stressSignature;
    const lb = b.stressSignature;
    const n = Math.max(la.length, lb.length);
    if (n > 0) {
        let diff = 0;
        for (let i = 0; i < n; i++)
            if ((la[i] ?? "") !== (lb[i] ?? ""))
                diff++;
        parts.push(diff / n);
    }
    const sa = new Set(a.dominantRhymeClasses);
    const sb = new Set(b.dominantRhymeClasses);
    const union = new Set([...sa, ...sb]);
    if (union.size > 0) {
        let inter = 0;
        for (const x of sa)
            if (sb.has(x))
                inter++;
        parts.push(1 - inter / union.size);
    }
    parts.push(Math.abs(a.averageEnergy - b.averageEnergy));
    if (a.semanticCentroid && b.semanticCentroid) {
        parts.push((1 - cosineSimilarity(a.semanticCentroid, b.semanticCentroid)) / 2);
    }
    return parts.length ? clamp01(parts.reduce((x, y) => x + y, 0) / parts.length) : 0;
}
/** Controlled variation: flip some stress bits, leaving structure intact. */
export function mutateDNA(dna, options = {}) {
    const rng = mulberry32(options.seed ?? 1);
    const rate = options.rate ?? 0.2;
    const stressSignature = [...dna.stressSignature]
        .map((ch) => ((ch === "0" || ch === "1") && rng() < rate ? (ch === "1" ? "0" : "1") : ch))
        .join("");
    return { ...dna, stressSignature };
}
/**
 * INJECT: turn a DNA into a fill template so a new section inherits the
 * parent's meter (exact) and rhyme structure (which lines rhyme), while
 * word choices vary. One monosyllabic slot per stress bit; the last
 * slot of each rhyming line carries its rhyme group.
 */
export function dnaToTemplate(dna) {
    const lineSigs = dna.stressSignature.split("-");
    const scheme = dna.rhymeScheme ?? "";
    return lineSigs.map((sig, i) => {
        const slots = [...sig].map((ch) => ({ stressKey: ch }));
        const letter = scheme[i];
        if (slots.length && letter && letter !== ".") {
            slots[slots.length - 1].rhymeSlot = letter;
        }
        return {
            id: `dna-line-${i}`,
            slots,
            ...(letter && letter !== "." ? { rhymeSchemeSlot: letter } : {}),
        };
    });
}
//# sourceMappingURL=dna.js.map