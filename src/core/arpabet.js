// ============================================================
// lyric-core / ARPAbet — the 39-phone CMUdict set, the phone
// parser, and the legal-onset table used by the syllabifier.
//
// ARPAbet mapping rules encoded here:
//   Rule 1  vowel = syllable nucleus  → syllable count = #vowels
//   Rule 2  stress digit is glued to the vowel symbol → split on ingest
// (Rule 3 rhyme-class + Rule 5 syllabification live in their own files)
// ============================================================
/** The 15 ARPAbet vowels (each carries a stress digit in CMUdict). */
export const VOWEL_SYMBOLS = new Set([
    "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER",
    "EY", "IH", "IY", "OW", "OY", "UH", "UW",
]);
/** The 24 ARPAbet consonants (never carry a stress digit). */
export const CONSONANT_SYMBOLS = new Set([
    "B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N",
    "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH",
]);
/** ARPAbet → approximate IPA (display / debugging aid). */
export const ARPABET_TO_IPA = {
    AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ",
    EH: "ɛ", ER: "ɝ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ",
    OY: "ɔɪ", UH: "ʊ", UW: "u",
    B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h",
    JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p",
    R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w",
    Y: "j", Z: "z", ZH: "ʒ",
};
export function isVowelSymbol(symbol) {
    return VOWEL_SYMBOLS.has(symbol);
}
/**
 * Parse one ARPAbet token ("AH1", "NG", "iy0") into a structured Phone.
 * Returns null for garbage tokens so callers can skip them.
 */
export function parsePhone(token) {
    const cleaned = token.trim().toUpperCase();
    if (cleaned.length === 0)
        return null;
    // Capture any trailing digits so a stray/out-of-range digit strips off
    // the phone instead of rejecting the whole token (which would silently
    // discard a vowel nucleus and corrupt syllable counts).
    const m = /^([A-Z]+)(\d+)?$/.exec(cleaned);
    if (!m)
        return null;
    const symbol = m[1];
    const digit = m[2];
    const vowel = VOWEL_SYMBOLS.has(symbol);
    // Only a valid 0/1/2 digit on a vowel is real stress; anything else
    // (a digit on a consonant, or an out-of-range digit) → unknown/null.
    const stress = vowel && (digit === "0" || digit === "1" || digit === "2")
        ? Number(digit)
        : null;
    return {
        symbol,
        stress,
        isVowel: vowel,
    };
}
/**
 * Parse a whitespace-separated ARPAbet string ("S IH1 NG IH0 NG")
 * into a Phone[]. Unparseable tokens are dropped.
 */
export function parsePhones(arpa) {
    const out = [];
    for (const tok of arpa.trim().split(/\s+/)) {
        const p = parsePhone(tok);
        if (p)
            out.push(p);
    }
    return out;
}
/** Serialize phones back to a CMUdict-style string, optionally with stress. */
export function phonesToString(phones, withStress = true) {
    return phones
        .map((p) => withStress && p.isVowel && p.stress !== null
        ? `${p.symbol}${p.stress}`
        : p.symbol)
        .join(" ");
}
/** ARPAbet Rule 1: syllable count = number of vowel phones. */
export function syllableCount(phones) {
    let n = 0;
    for (const p of phones)
        if (p.isVowel)
            n++;
    return n;
}
/** Ordered stress pattern of the vowels only, e.g. [1, 0]. */
export function stressPattern(phones) {
    const out = [];
    for (const p of phones) {
        if (p.isVowel)
            out.push((p.stress ?? 0));
    }
    return out;
}
// ---------------------------------------------------------------
// Legal English syllable onsets (for Maximum Onset syllabification).
// Stored as space-joined bare-symbol keys, e.g. "S T R".
// ---------------------------------------------------------------
// Every consonant can begin a syllable EXCEPT /ŋ/ (NG).
const SINGLE_ONSETS = [...CONSONANT_SYMBOLS].filter((c) => c !== "NG");
// Two-consonant onset clusters attested in English.
const TWO_ONSETS = [
    // stop + liquid
    "P L", "P R", "B L", "B R", "T R", "D R", "K L", "K R", "G L", "G R",
    // stop + glide
    "P W", "B W", "T W", "D W", "K W", "G W",
    "P Y", "B Y", "T Y", "D Y", "K Y", "G Y",
    // fricative + liquid
    "F L", "F R", "TH R", "SH R", "V R",
    // fricative + glide
    "F Y", "V Y", "TH W", "HH Y", "HH W",
    // nasal + glide
    "M Y", "N Y",
    // liquid + glide
    "L Y",
    // s + consonant
    "S P", "S T", "S K", "S L", "S M", "S N", "S W", "S F",
    // s + glide
    "S P Y", // handled below in three, but SP is also a two
];
// Three-consonant onset clusters: s + voiceless stop + liquid/glide.
const THREE_ONSETS = [
    "S P L", "S P R", "S T R", "S K L", "S K R", "S K W",
    "S P Y", "S T Y", "S K Y",
];
/** The full legal-onset lookup used by the syllabifier. */
export const LEGAL_ONSETS = new Set([
    ...SINGLE_ONSETS,
    ...TWO_ONSETS,
    ...THREE_ONSETS,
]);
/** Is this run of consonant symbols a legal syllable onset? */
export function isLegalOnset(symbols) {
    if (symbols.length === 0)
        return true; // empty onset is always fine
    return LEGAL_ONSETS.has(symbols.join(" "));
}
//# sourceMappingURL=arpabet.js.map