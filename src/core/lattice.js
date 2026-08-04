// ============================================================
// lyric-core / Phase 1 — the Lattice
//
// A Section rendered as a 2D grid: rows = lines, columns = syllable
// slots. Lines have different syllable counts, so short rows are
// padded with a MASK (null) slot. This is the "Lattice View" data
// model — the syllable lattice and stress lattice are two reads of
// the same grid.
//
// Round-trip is a hard requirement: fromSection → (edits) → toSection
// must always yield ordinary, editable lyrics. Nothing here mutates
// frozen cells implicitly; callers check isFrozen() before writing.
// ============================================================
function cloneCell(cell) {
    return {
        ...cell,
        phones: cell.phones.map((p) => ({ ...p })),
        ...(cell.semanticVector ? { semanticVector: cell.semanticVector.slice() } : {}),
        ...(cell.candidates
            ? { candidates: cell.candidates.map((c) => ({ ...c, phones: c.phones.map((p) => ({ ...p })) })) }
            : {}),
    };
}
export class Lattice {
    constructor(grid, rowMeta, section) {
        this.grid = grid;
        this.rowMeta = rowMeta;
        this.rows = grid.length;
        this.cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
        this.sectionId = section.id;
        this.sectionType = section.type;
        this.sectionFrozen = section.frozen;
    }
    /** Build a left-aligned, mask-padded lattice from a Section. */
    static fromSection(section) {
        const cols = section.lines.reduce((m, l) => Math.max(m, l.cells.length), 0);
        const grid = section.lines.map((line) => {
            const row = line.cells.map(cloneCell);
            while (row.length < cols)
                row.push(null);
            return row;
        });
        const rowMeta = section.lines.map((line) => ({
            id: line.id,
            sectionType: line.sectionType,
            ...(line.rhymeSchemeSlot ? { rhymeSchemeSlot: line.rhymeSchemeSlot } : {}),
            frozen: line.frozen,
            energy: line.energy,
        }));
        return new Lattice(grid, rowMeta, {
            id: section.id,
            type: section.type,
            frozen: section.frozen,
        });
    }
    inBounds(row, col) {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }
    /** The slot at (row, col), or null if masked / out of bounds. */
    get(row, col) {
        if (!this.inBounds(row, col))
            return null;
        return this.grid[row][col] ?? null;
    }
    /** Place a cell (or null) at (row, col). Does not check frozen — callers do. */
    set(row, col, slot) {
        if (!this.inBounds(row, col)) {
            throw new RangeError(`set(${row},${col}) out of bounds (${this.rows}x${this.cols})`);
        }
        this.grid[row][col] = slot;
    }
    /** Number of real (non-mask) syllables in a row. */
    lineLength(row) {
        if (row < 0 || row >= this.rows)
            return 0;
        let n = 0;
        for (const slot of this.grid[row])
            if (slot)
                n++;
        return n;
    }
    /** A shallow copy of a full row (including mask slots). */
    rowSlots(row) {
        if (row < 0 || row >= this.rows)
            return [];
        return this.grid[row].slice();
    }
    /** A column across all rows (including mask slots). */
    columnSlots(col) {
        return this.grid.map((r) => r[col] ?? null);
    }
    /** Every real cell, row-major. */
    cells() {
        const out = [];
        for (const r of this.grid)
            for (const slot of r)
                if (slot)
                    out.push(slot);
        return out;
    }
    /** The stress lattice: each slot's stress, null for mask/unknown. */
    stressGrid() {
        return this.grid.map((r) => r.map((slot) => (slot ? slot.stress : null)));
    }
    /** Per-row end-rhyme class (last real cell's rhymeClass), null if empty. */
    finalRhymeClasses() {
        return this.grid.map((r) => {
            for (let c = r.length - 1; c >= 0; c--) {
                const slot = r[c];
                if (slot)
                    return slot.rhymeClass;
            }
            return null;
        });
    }
    isMask(row, col) {
        return this.get(row, col) === null;
    }
    isFrozen(row, col) {
        const slot = this.get(row, col);
        return slot ? slot.frozen : false;
    }
    freezeCell(row, col, frozen = true) {
        const slot = this.get(row, col);
        if (slot)
            slot.frozen = frozen;
    }
    /** Freeze (or thaw) every real cell in a row. */
    freezeRow(row, frozen = true) {
        if (row < 0 || row >= this.rows)
            return;
        for (const slot of this.grid[row])
            if (slot)
                slot.frozen = frozen;
        if (this.rowMeta[row])
            this.rowMeta[row].frozen = frozen;
    }
    /** Deep clone — safe for search: mutating the copy never touches the original. */
    clone() {
        const grid = this.grid.map((r) => r.map((slot) => (slot ? cloneCell(slot) : null)));
        const rowMeta = this.rowMeta.map((m) => ({ ...m }));
        return new Lattice(grid, rowMeta, {
            id: this.sectionId,
            type: this.sectionType,
            frozen: this.sectionFrozen,
        });
    }
    /** Flatten back to ordinary, editable lyrics. */
    toSection() {
        const lines = this.grid.map((r, i) => {
            const meta = this.rowMeta[i];
            const cells = r.filter((slot) => slot !== null);
            return {
                id: meta.id,
                cells,
                sectionType: meta.sectionType,
                ...(meta.rhymeSchemeSlot ? { rhymeSchemeSlot: meta.rhymeSchemeSlot } : {}),
                frozen: meta.frozen,
                energy: meta.energy,
            };
        });
        return {
            id: this.sectionId,
            type: this.sectionType,
            lines,
            frozen: this.sectionFrozen,
        };
    }
}
//# sourceMappingURL=lattice.js.map