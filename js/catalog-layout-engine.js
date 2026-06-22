/* ==========================================================================
   03e. CATALOG LAYOUT ENGINE — L2/L3 placement (catalog + legacy grid)
   ========================================================================== */
const CatalogLayoutEngine = {
    isLegacyMode() {
        return CONFIG.depth.layoutMode === 'legacy-grid';
    },

    buildForState(catalogState) {
        if (this.isLegacyMode()) {
            return this.computeLegacyGridLayout();
        }
        return this.computeCatalogLayout(catalogState);
    },

    computeCatalogLayout(catalogState) {
        const cfg = CONFIG.depth.catalogLayout;
        const wrappers = document.querySelectorAll('.note-wrapper');
        const columns = Math.max(1, cfg.columns || 8);
        const cellW = scale(cfg.cellWidth || 120);
        const cellH = scale(cfg.cellHeight || 140);
        const gap = scale(cfg.gap || 12);
        const pad = scale(cfg.padding || 48);

        const entries = new Map();
        let maxX = 0;
        let maxY = 0;

        let orderedIndices = catalogState?.visibleNoteIndices?.length
            ? [...catalogState.visibleNoteIndices]
            : [...wrappers.keys()];

        orderedIndices = orderedIndices.filter(noteIndex => {
            const role = catalogState?.noteRoles?.get(noteIndex);
            return role !== 'filtered';
        });

        if (typeof MesoSpatialLayout !== 'undefined') {
            orderedIndices = MesoSpatialLayout.sortNoteIndices(
                orderedIndices,
                catalogState?.macroRank
            );
        }

        orderedIndices.forEach((noteIndex, layoutIndex) => {
            const col = layoutIndex % columns;
            const row = Math.floor(layoutIndex / columns);
            const localX = pad + col * (cellW + gap) + cellW / 2;
            const localY = pad + row * (cellH + gap) + cellH / 2;

            entries.set(noteIndex, {
                noteIndex,
                localX,
                localY,
                width: cellW,
                height: cellH
            });

            maxX = Math.max(maxX, localX + cellW / 2);
            maxY = Math.max(maxY, localY + cellH / 2);
        });

        const blockZones = this._computeBlockZones(catalogState, entries, cellW, cellH, gap);

        return {
            mode: 'catalog',
            entries,
            blockZones,
            bounds: {
                width: maxX + pad,
                height: maxY + pad
            }
        };
    },

    _computeBlockZones(catalogState, entries, cellW, cellH, gap) {
        const zones = new Map();
        if (!catalogState?.blockAnchors?.length) return zones;

        catalogState.blockAnchors.forEach(anchor => {
            const matching = [];
            entries.forEach((entry, noteIndex) => {
                const role = catalogState.noteRoles.get(noteIndex);
                if (role === 'filtered') return;
                if (role === 'emphasized' || role === 'captured' || role === 'stretched') {
                    matching.push(entry);
                }
            });

            if (matching.length === 0 && entries.size > 0) {
                matching.push(entries.values().next().value);
            }

            let cx = 0;
            let cy = 0;
            matching.forEach(e => { cx += e.localX; cy += e.localY; });
            const n = matching.length || 1;

            zones.set(anchor.id, {
                blockId: anchor.id,
                centerX: cx / n,
                centerY: cy / n,
                radius: Math.max(cellW, cellH) + gap * 2,
                pageX: anchor.pageX,
                pageY: anchor.pageY
            });
        });

        return zones;
    },

    computeLegacyGridLayout() {
        const legacy = CONFIG.depth.grids.micro;
        const entries = new Map();
        const wrappers = document.querySelectorAll('.note-wrapper');
        const colCount = legacy.colCount || 10;

        wrappers.forEach((wrapper, noteIndex) => {
            entries.set(noteIndex, {
                noteIndex,
                gridColumn: (noteIndex % colCount) + 1,
                gridRow: Math.floor(noteIndex / colCount) + 1,
                legacy: true
            });
        });

        return {
            mode: 'legacy-grid',
            entries,
            blockZones: new Map(),
            bounds: null,
            canvasWidth: legacy.canvasWidth,
            colCount
        };
    },

    getLayoutBounds(layout) {
        if (!layout) return null;
        if (layout.mode === 'legacy-grid') return null;
        return layout.bounds;
    },

    getBlockZone(layout, blockId) {
        if (!layout?.blockZones) return null;
        return layout.blockZones.get(blockId) || null;
    },

    getScrollTargetForBlock(layout, block) {
        const blockId = block?.tag || block?.author || block?.type;
        const zone = this.getBlockZone(layout, blockId);
        if (!zone) return null;

        const app = document.getElementById('app');
        if (!app) return null;

        const rect = app.getBoundingClientRect();
        return {
            pageX: rect.left + window.pageXOffset + zone.centerX,
            pageY: rect.top + window.pageYOffset + zone.centerY
        };
    },

    getScrollTargetForNote(noteIndex, layout) {
        const entry = layout?.entries?.get(noteIndex);
        if (!entry || entry.legacy) return null;

        const app = document.getElementById('app');
        if (!app) return null;
        const rect = app.getBoundingClientRect();

        return {
            pageX: rect.left + window.pageXOffset + entry.localX,
            pageY: rect.top + window.pageYOffset + entry.localY
        };
    },

    getCatalogCellSize() {
        const cfg = CONFIG.depth.catalogLayout;
        return {
            width: scale(cfg.cellWidth || 120),
            height: scale(cfg.cellHeight || 140)
        };
    },

    applyToDom(layout) {
        if (!layout || layout.mode === 'legacy-grid') return false;

        if (typeof applyCatalogCellTokens === 'function') {
            applyCatalogCellTokens();
        } else {
            const cell = this.getCatalogCellSize();
            document.documentElement.style.setProperty('--catalog-cell-w', `${cell.width}px`);
            document.documentElement.style.setProperty('--catalog-cell-h', `${cell.height}px`);
        }

        const wrappers = document.querySelectorAll('.note-wrapper');
        const app = document.getElementById('app');

        document.body.classList.add('is-catalog-layout');

        layout.entries.forEach((entry, noteIndex) => {
            const wrapper = wrappers[noteIndex];
            if (!wrapper) return;
            wrapper.classList.add('is-catalog-anchored');
            wrapper.classList.remove('is-meso-anchored');
            wrapper.style.left = `${entry.localX}px`;
            wrapper.style.top = `${entry.localY}px`;
        });

        if (app && layout.bounds) {
            app.style.minHeight = `${Math.max(window.innerHeight, layout.bounds.height)}px`;
            app.style.width = `${Math.max(window.innerWidth, layout.bounds.width)}px`;
        }

        if (typeof CatalogState !== 'undefined') {
            CatalogState.catalogLayout = layout;
        }

        return true;
    },

    clearFromDom() {
        document.body.classList.remove('is-catalog-layout');
        document.documentElement.style.removeProperty('--catalog-cell-w');
        document.documentElement.style.removeProperty('--catalog-cell-h');
        document.documentElement.style.removeProperty('--catalog-cell-w-meso');
        document.documentElement.style.removeProperty('--catalog-cell-h-meso');

        document.querySelectorAll('.note-wrapper.is-catalog-anchored').forEach(wrapper => {
            wrapper.classList.remove('is-catalog-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
        });

        const app = document.getElementById('app');
        if (app) {
            app.style.minHeight = '';
            app.style.width = '';
        }
    },

    isCatalogLayoutActive() {
        return document.body.classList.contains('is-catalog-layout');
    }
};
