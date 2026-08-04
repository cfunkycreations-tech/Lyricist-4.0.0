// ============================================================
// lyric-core / Phase 1 — the Rhyme Graph
//
// Nodes = rhyme classes ("AO R IY"). Edges connect classes that
// rhyme imperfectly, weighted by how close they are:
//   same class      → weight 1   (perfect; the identity edge)
//   shared nucleus  → weight 0.5 (assonance / vowel slant)
//   shared coda     → weight 0.4 (consonance / tail slant)
//
// "Rhyme contagion" is diffusion over this graph: seed some classes
// with activation and let it bleed into neighbors over a few rounds.
// Phase 2's cellular automata use this to spread rhyme pressure.
// ============================================================
import { rhymeNucleus, rhymeCoda } from "./rhyme.js";
const NUCLEUS_WEIGHT = 0.5;
const CODA_WEIGHT = 0.4;
/** Slant weight between two DISTINCT classes (0 if unrelated). */
function slantWeight(a, b) {
    const sameNucleus = rhymeNucleus(a) === rhymeNucleus(b);
    const codaA = rhymeCoda(a);
    const sameCoda = codaA !== "" && codaA === rhymeCoda(b);
    if (sameNucleus)
        return { weight: NUCLEUS_WEIGHT, type: "nucleus" };
    if (sameCoda)
        return { weight: CODA_WEIGHT, type: "coda" };
    return null;
}
export class RhymeGraph {
    constructor(classes = []) {
        this.classes = new Set();
        this.adj = new Map();
        for (const c of classes)
            this.addClass(c);
    }
    /** Add a class and wire slant edges to every existing class. */
    addClass(cls) {
        if (!cls || this.classes.has(cls))
            return;
        this.classes.add(cls);
        this.adj.set(cls, []);
        for (const other of this.classes) {
            if (other === cls)
                continue;
            const rel = slantWeight(cls, other);
            if (!rel)
                continue;
            this.adj.get(cls).push({ to: other, type: rel.type, weight: rel.weight });
            this.adj.get(other).push({ to: cls, type: rel.type, weight: rel.weight });
        }
    }
    has(cls) {
        return this.classes.has(cls);
    }
    get size() {
        return this.classes.size;
    }
    classList() {
        return [...this.classes];
    }
    /** Slant neighbors of a class (excludes the identity/self edge). */
    neighbors(cls) {
        return (this.adj.get(cls) ?? []).slice();
    }
    /** Rhyme strength between two classes: 1 (same), 0.5/0.4 (slant), 0. */
    weightBetween(a, b) {
        if (a === b)
            return a ? 1 : 0;
        const rel = slantWeight(a, b);
        return rel ? rel.weight : 0;
    }
    /**
     * Rhyme contagion. Seed some classes with activation and diffuse it
     * across slant edges for a few rounds. A node's activation each round
     * is its own seed plus a decayed, edge-weighted sum of neighbors'
     * current activation. Returns the settled activation per class.
     *
     * Classes named in `seeds` that aren't in the graph are added first,
     * so you can seed with the current line's rhyme classes directly.
     */
    propagate(seeds, options = {}) {
        const rounds = options.rounds ?? 3;
        const decay = options.decay ?? 0.5;
        for (const c of seeds.keys())
            this.addClass(c);
        let activation = new Map();
        for (const c of this.classes)
            activation.set(c, seeds.get(c) ?? 0);
        for (let r = 0; r < rounds; r++) {
            const next = new Map();
            for (const c of this.classes) {
                let inflow = 0;
                for (const edge of this.adj.get(c) ?? []) {
                    inflow += (activation.get(edge.to) ?? 0) * edge.weight;
                }
                next.set(c, (seeds.get(c) ?? 0) + decay * inflow);
            }
            activation = next;
        }
        return activation;
    }
}
//# sourceMappingURL=rhymeGraph.js.map