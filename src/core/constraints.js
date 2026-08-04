// ============================================================
// lyric-core / Phase 1 — Constraints
//
// Evaluate how well a Section satisfies structural constraints
// (rhyme scheme, meter, syllable range) as violation scores in
// [0,1] (0 = fully satisfied), and combine with the scorer into a
// single objective the search/fill engine maximizes.
// ============================================================
import { scoreRhymeStrength, scoreSection, scoreStressFidelity, } from "./scorer.js";
function clamp01(x) {
    if (Number.isNaN(x))
        return 0;
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
/** Return a shallow copy of the section with rhyme slots assigned by scheme. */
function withScheme(section, scheme) {
    if (scheme.length === 0)
        return section;
    const lines = section.lines.map((l, i) => ({
        ...l,
        rhymeSchemeSlot: scheme[i % scheme.length],
    }));
    return { ...section, lines };
}
/** Rhyme-scheme violation: 1 − rhyme strength under the given scheme. */
export function evaluateRhymeScheme(section, scheme) {
    const s = scheme ? withScheme(section, scheme) : section;
    return clamp01(1 - scoreRhymeStrength(s));
}
/** Meter violation: 1 − stress fidelity to the target pattern. */
export function evaluateMeter(section, pattern) {
    return clamp01(1 - scoreStressFidelity(section, pattern));
}
/** Fraction of lines whose syllable count falls outside [min, max]. */
export function evaluateSyllableRange(section, min, max) {
    const lines = section.lines;
    if (lines.length === 0)
        return 0;
    let bad = 0;
    for (const l of lines) {
        const n = l.cells.length; // one cell per syllable
        if (n < min || n > max)
            bad++;
    }
    return bad / lines.length;
}
/** Evaluate every constraint named in the spec. */
export function evaluateConstraints(section, spec) {
    const rhyme = spec.rhymeScheme !== undefined
        ? evaluateRhymeScheme(section, spec.rhymeScheme)
        : 0;
    const meter = spec.stressPattern !== undefined
        ? evaluateMeter(section, spec.stressPattern)
        : 0;
    const syllable = spec.syllableRange
        ? evaluateSyllableRange(section, spec.syllableRange[0], spec.syllableRange[1])
        : 0;
    const active = [];
    if (spec.rhymeScheme !== undefined)
        active.push(rhyme);
    if (spec.stressPattern !== undefined)
        active.push(meter);
    if (spec.syllableRange)
        active.push(syllable);
    const total = active.length
        ? active.reduce((a, b) => a + b, 0) / active.length
        : 0;
    return { rhyme, meter, syllable, total };
}
/** Combined objective to MAXIMIZE: quality minus constraint penalty. */
export function objective(section, spec = {}) {
    const score = scoreSection(section, spec.stressPattern !== undefined
        ? { targetStressPattern: spec.stressPattern }
        : {});
    const report = evaluateConstraints(section, spec);
    const penalty = spec.penalty ?? 0.5;
    return {
        score,
        violation: report.total,
        value: clamp01(score.overall - penalty * report.total),
    };
}
//# sourceMappingURL=constraints.js.map