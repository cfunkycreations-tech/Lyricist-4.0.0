// ============================================================
// lyric-core / Rhyme (ARPAbet Rule 3)
//
// Rhyme class = everything from the LAST primary-stressed vowel
// to the end of the word, stress-stripped.
//   STORY  S T AO1 R IY0  → "AO R IY"   (matches GLORY, GORY)
// Fallbacks when there is no primary stress:
//   → last secondarily-stressed vowel, else the last vowel.
// ============================================================
/**
 * Index of the vowel that begins the rhyme class:
 * last stress-1 vowel, else last stress-2 vowel, else last vowel.
 * Returns -1 if the word has no vowel at all.
 */
function rhymeAnchorIndex(phones) {
    let lastPrimary = -1;
    let lastSecondary = -1;
    let lastVowel = -1;
    for (let i = 0; i < phones.length; i++) {
        const p = phones[i];
        if (!p.isVowel)
            continue;
        lastVowel = i;
        if (p.stress === 1)
            lastPrimary = i;
        else if (p.stress === 2)
            lastSecondary = i;
    }
    if (lastPrimary !== -1)
        return lastPrimary;
    if (lastSecondary !== -1)
        return lastSecondary;
    return lastVowel;
}
/**
 * ARPAbet Rule 3 rhyme class: bare symbols from the rhyme anchor
 * to the end, space-joined. Null if there is no vowel.
 */
export function rhymeClassOf(phones) {
    const anchor = rhymeAnchorIndex(phones);
    if (anchor === -1)
        return null;
    return phones
        .slice(anchor)
        .map((p) => p.symbol)
        .join(" ");
}
/** The nucleus vowel symbol of a rhyme class ("AO R IY" → "AO"). */
export function rhymeNucleus(rhymeClass) {
    if (!rhymeClass)
        return null;
    const first = rhymeClass.split(" ")[0];
    return first ?? null;
}
/** The coda (everything after the nucleus) of a rhyme class. */
export function rhymeCoda(rhymeClass) {
    if (!rhymeClass)
        return "";
    return rhymeClass.split(" ").slice(1).join(" ");
}
/**
 * Classify the rhyme relationship between two phone sequences.
 *   perfect → identical rhyme class
 *   slant   → shared nucleus (assonance) OR shared coda (consonance)
 *   none    → neither
 */
export function rhymeType(a, b) {
    const ra = rhymeClassOf(a);
    const rb = rhymeClassOf(b);
    if (!ra || !rb)
        return "none";
    if (ra === rb)
        return "perfect";
    const sameNucleus = rhymeNucleus(ra) === rhymeNucleus(rb);
    const sameCoda = rhymeCoda(ra) === rhymeCoda(rb) && rhymeCoda(ra) !== "";
    return sameNucleus || sameCoda ? "slant" : "none";
}
/** Continuous rhyme strength in [0,1]: perfect=1, slant=0.5, none=0. */
export function rhymeStrengthBetween(a, b) {
    switch (rhymeType(a, b)) {
        case "perfect":
            return 1;
        case "slant":
            return 0.5;
        default:
            return 0;
    }
}
/** Do two rhyme-class strings rhyme perfectly? (null-safe) */
export function isPerfectRhymeClass(a, b) {
    return !!a && !!b && a === b;
}
//# sourceMappingURL=rhyme.js.map