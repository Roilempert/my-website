/* ==========================================================================
   03f. MESO SPATIAL LAYOUT — macro rank snapshot for L2/L3 ordering
   ========================================================================== */
const MesoSpatialLayout = {
    getNoteIndex(wrapper) {
        if (wrapper?.dataset?.noteIndex != null && wrapper.dataset.noteIndex !== '') {
            const parsed = parseInt(wrapper.dataset.noteIndex, 10);
            if (Number.isFinite(parsed)) return parsed;
        }
        const wrappers = document.querySelectorAll('.note-wrapper');
        return [...wrappers].indexOf(wrapper);
    },

    captureRankSnapshot() {
        const rankByNote = new Map();
        let visibleOrder = [];
        let lastMesoAnchors = [];

        if (typeof MacroMesoBridge !== 'undefined') {
            const captured = MacroMesoBridge.captureAnchors();
            lastMesoAnchors = captured.notes || [];
            visibleOrder = lastMesoAnchors.map(n => n.noteIndex);
            lastMesoAnchors.forEach(n => {
                rankByNote.set(n.noteIndex, n.rank ?? 0);
            });
        }

        const wrappers = document.querySelectorAll('.note-wrapper');
        wrappers.forEach((_, noteIndex) => {
            if (!rankByNote.has(noteIndex)) {
                rankByNote.set(noteIndex, noteIndex + 10000);
            }
        });

        return { rankByNote, visibleOrder, lastMesoAnchors };
    },

    captureAndStoreSnapshot() {
        const snapshot = this.captureRankSnapshot();
        if (typeof CatalogState !== 'undefined') {
            CatalogState.macroRank = snapshot.rankByNote;
            CatalogState.visibleOrder = snapshot.visibleOrder;
            CatalogState.lastMesoAnchors = snapshot.lastMesoAnchors;
        }
        return snapshot;
    },

    sortWrappersByRank(wrappers, rankByNote) {
        const ranks = rankByNote || CatalogState?.macroRank;
        if (!ranks || ranks.size === 0) return [...wrappers];

        return [...wrappers].sort((a, b) => {
            const ia = this.getNoteIndex(a);
            const ib = this.getNoteIndex(b);
            return (ranks.get(ia) ?? ia) - (ranks.get(ib) ?? ib);
        });
    },

    sortNoteIndices(indices, rankByNote) {
        const ranks = rankByNote || CatalogState?.macroRank;
        if (!ranks || ranks.size === 0) return [...indices];

        return [...indices].sort((a, b) => (ranks.get(a) ?? a) - (ranks.get(b) ?? b));
    },

    buildHiveAxialPositions(count) {
        if (count <= 0) return [];
        const axial = [{ q: 0, r: 0 }];
        if (count === 1) return axial;

        let ring = 1;
        while (axial.length < count) {
            let q = 0;
            let r = -ring;
            const directions = [
                [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]
            ];
            for (const [dq, dr] of directions) {
                for (let step = 0; step < ring; step++) {
                    if (axial.length >= count) break;
                    axial.push({ q, r });
                    q += dq;
                    r += dr;
                }
            }
            ring++;
        }
        return axial.slice(0, count);
    },

    axialToPixel(q, r, horizSpacing, vertSpacing) {
        return {
            x: horizSpacing * (q + r * 0.5),
            y: vertSpacing * r
        };
    },

    computeHivePixelOffsets(count, horizSpacing, vertSpacing) {
        const axial = this.buildHiveAxialPositions(count);
        const pixels = axial.map(({ q, r }) => this.axialToPixel(q, r, horizSpacing, vertSpacing));
        if (!pixels.length) return pixels;

        const cx = pixels.reduce((sum, p) => sum + p.x, 0) / pixels.length;
        const cy = pixels.reduce((sum, p) => sum + p.y, 0) / pixels.length;
        return pixels.map(p => ({ x: p.x - cx, y: p.y - cy }));
    }
};
