// ============================================================
// lyric-core / Phase 1 — the Fill engine
//
// The Phase 1 headline capability: lock a stress pattern and a rhyme
// scheme, and have the engine fill a structurally-valid verse around
// any frozen words. Given a template of word slots (each with a stress
// key and optional rhyme group), it:
//   1. resolves each rhyme group to a shared rhyme class, picking words
//      that match every member's stress key (fixed words pin the class);
//   2. fills the remaining slots with stress-matching words;
//   3. never touches fixed slots (their cells are marked frozen);
//   4. builds an ordinary, editable Section.
//
// The structural layer is authoritative: this produces correct meter +
// rhyme. Fluency/coherence is the neural layer's job later (Phase 4).
// Deterministic given a seed.
// ============================================================
// --- deterministic RNG helpers ---
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
    if (arr.length === 0)
        return undefined;
    return arr[Math.floor(rng() * arr.length)];
}
function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}
function stressKeyOf(p) {
    if (!p)
        return "";
    return p.stressPattern.map((s) => (s > 0 ? "1" : "0")).join("");
}
/** Turn a word into its syllable cells (word text sits on the first syllable). */
function wordToCells(word, service, idPrefix) {
    const p = service.getPrimary(word);
    if (!p || p.phones.length === 0) {
        return [
            {
                id: idPrefix,
                text: word,
                phones: [],
                stress: null,
                rhymeClass: null,
                isWordFinal: true,
                energy: 0.5,
                age: 0,
                frozen: false,
                phoneticSource: p ? p.source : "manual",
            },
        ];
    }
    const groups = service.syllabify(p.phones);
    return groups.map((phones, i) => {
        const nucleus = phones.find((ph) => ph.isVowel);
        const last = i === groups.length - 1;
        return {
            id: `${idPrefix}.${i}`,
            text: i === 0 ? word : "",
            phones,
            stress: nucleus ? nucleus.stress : null,
            rhymeClass: last ? p.rhymeClass || null : null,
            isWordFinal: last,
            energy: 0.5,
            age: 0,
            frozen: false,
            phoneticSource: p.source,
        };
    });
}
export function fillSection(templates, service, options = {}) {
    const rng = mulberry32(options.seed ?? 1);
    const limit = options.candidateLimit ?? 300;
    const words = templates.map((t) => t.slots.map((s) => (s.fixed && s.word ? s.word : null)));
    const slotAt = (m) => templates[m.li].slots[m.si];
    // group slots by rhymeSlot
    const groups = new Map();
    templates.forEach((t, li) => t.slots.forEach((s, si) => {
        if (!s.rhymeSlot)
            return;
        let arr = groups.get(s.rhymeSlot);
        if (!arr) {
            arr = [];
            groups.set(s.rhymeSlot, arr);
        }
        arr.push({ li, si });
    }));
    const satisfied = [];
    const unsatisfied = [];
    // Try to assign every member of a group a word in rhyme class `cls`
    // that also matches the member's stress key.
    const tryClass = (members, cls) => {
        const asg = new Map();
        for (const m of members) {
            const slot = slotAt(m);
            if (slot.fixed && slot.word) {
                asg.set(m, slot.word);
                continue;
            }
            const cands = service
                .rhymesForClass(cls)
                .filter((w) => stressKeyOf(service.getPrimary(w)) === slot.stressKey);
            const chosen = pick(cands, rng);
            if (chosen === undefined)
                return null;
            asg.set(m, chosen);
        }
        return asg;
    };
    for (const [rslot, members] of groups) {
        // a fixed member pins the rhyme class
        let pinned = null;
        for (const m of members) {
            const slot = slotAt(m);
            if (slot.fixed && slot.word) {
                const p = service.getPrimary(slot.word);
                if (p && p.rhymeClass)
                    pinned = p.rhymeClass;
            }
        }
        let assignment = pinned
            ? tryClass(members, pinned)
            : null;
        if (!assignment) {
            const firstNonFixed = members.find((m) => !slotAt(m).fixed);
            if (firstNonFixed) {
                const fs = slotAt(firstNonFixed);
                const pool = shuffled(service.wordsByStress(fs.stressKey), rng).slice(0, limit);
                for (const w0 of pool) {
                    const p = service.getPrimary(w0);
                    const cls = p ? p.rhymeClass : "";
                    if (!cls)
                        continue;
                    const asg = tryClass(members, cls);
                    if (asg) {
                        assignment = asg;
                        break;
                    }
                }
            }
        }
        if (assignment) {
            for (const [m, w] of assignment)
                words[m.li][m.si] = w;
            satisfied.push(rslot);
        }
        else {
            unsatisfied.push(rslot);
        }
    }
    // fill the remaining non-fixed slots by stress
    templates.forEach((t, li) => t.slots.forEach((s, si) => {
        if (words[li][si] != null)
            return;
        const chosen = pick(service.wordsByStress(s.stressKey), rng);
        words[li][si] = chosen ?? s.word ?? "";
    }));
    // build the Section
    const lines = templates.map((t, li) => {
        const cells = [];
        t.slots.forEach((s, si) => {
            const w = words[li][si] ?? "";
            const wc = wordToCells(w, service, `${li}.${si}`);
            if (s.fixed)
                for (const c of wc)
                    c.frozen = true;
            for (const c of wc)
                cells.push(c);
        });
        return {
            id: t.id ?? `line-${li}`,
            cells,
            sectionType: t.sectionType ?? "verse",
            ...(t.rhymeSchemeSlot ? { rhymeSchemeSlot: t.rhymeSchemeSlot } : {}),
            frozen: false,
            energy: 0.5,
        };
    });
    const type = lines[0]?.sectionType ?? "verse";
    return {
        section: { id: "filled", type, lines, frozen: false },
        satisfied,
        unsatisfied,
    };
}
//# sourceMappingURL=fill.js.map