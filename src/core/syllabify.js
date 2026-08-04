// ============================================================
// lyric-core / Syllabification (ARPAbet Rule 5)
//
// CMUdict gives phones but NOT syllable boundaries. The lattice
// needs one SyllableCell per syllable, so we split a word's phone
// sequence using the Maximum Onset Principle:
//
//   1. Every vowel anchors exactly one syllable (Rule 1).
//   2. Consonants between two vowels are split into
//      coda(left) + onset(right); assign the LONGEST legal-onset
//      suffix to the right syllable, the rest is the left's coda.
//   3. Leading consonants join the first syllable; trailing
//      consonants join the last.
//
// v1 note: this is pure max-onset. It does not model
// ambisyllabicity (e.g. stressed lax vowels preferring a coda);
// that refinement can come later without changing the signature.
// ============================================================
import { isLegalOnset } from "./arpabet.js";
/**
 * Split a whole word's phones into per-syllable Phone[] groups.
 * A word with no vowels returns a single group (best effort).
 */
export function syllabify(phones) {
    if (phones.length === 0)
        return [];
    const vowelIdx = [];
    for (let i = 0; i < phones.length; i++) {
        if (phones[i].isVowel)
            vowelIdx.push(i);
    }
    // No nucleus → cannot split; return the run as one group.
    if (vowelIdx.length === 0)
        return [phones.slice()];
    const n = vowelIdx.length;
    const starts = new Array(n);
    starts[0] = 0; // leading consonants belong to the first syllable
    for (let s = 1; s < n; s++) {
        const prevV = vowelIdx[s - 1];
        const curV = vowelIdx[s];
        // consonant run strictly between the two vowels
        const run = phones.slice(prevV + 1, curV);
        const k = run.length;
        // Maximum onset: longest suffix of `run` that is a legal onset.
        // No legal English onset exceeds 3 consonants, so cap the search
        // there — keeps this O(n) even on pathological mega-clusters.
        let onsetLen = 0;
        for (let len = Math.min(k, 3); len >= 0; len--) {
            const suffix = run.slice(k - len).map((p) => p.symbol);
            if (isLegalOnset(suffix)) {
                onsetLen = len;
                break;
            }
        }
        // The right syllable begins onsetLen consonants before its vowel.
        starts[s] = curV - onsetLen;
    }
    const groups = [];
    for (let s = 0; s < n; s++) {
        const from = starts[s];
        const to = s + 1 < n ? starts[s + 1] : phones.length;
        groups.push(phones.slice(from, to));
    }
    return groups;
}
/**
 * Convenience: syllabify and return each syllable's stress
 * (the stress of its vowel nucleus), e.g. [1, 0] for "singing".
 */
export function syllableStresses(phones) {
    return syllabify(phones).map((syl) => {
        const nucleus = syl.find((p) => p.isVowel);
        return nucleus ? nucleus.stress : null;
    });
}
//# sourceMappingURL=syllabify.js.map