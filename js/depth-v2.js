/* ==========================================================================
   03g. DEPTH V2 — גרידים פשוטים ל-L2/L3 (מקום שמור, בלי תוכן אמיתי)
   ========================================================================== */
const DepthV2 = {
    _prepareMesoToken: 0,
    _prepareMesoPromise: null,
    _mesoLayoutReadyPromise: null,
    _resolveMesoLayoutReady: null,

    _notifyMapLayoutReady() {
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.notifyDepthLayoutReady();
        }
    },

    isActive() {
        return CONFIG.depth.depthEngine === 'v2';
    },

    getGrid(level) {
        const v2 = CONFIG.depth.v2 || {};
        if (level === 2) return v2.meso || {};
        if (level === 3) return v2.micro || {};
        return null;
    },

    clearGridTokens(root = document.documentElement) {
        root.style.removeProperty('--v2-canvas-width');
        root.style.removeProperty('--v2-col-count');
        root.style.removeProperty('--v2-cell-height');
        root.style.removeProperty('--v2-cell-width');
        root.style.removeProperty('--v2-row-gap');
        root.style.removeProperty('--v2-col-gap');
        root.style.removeProperty('--v2-meso-item-gap');
        root.style.removeProperty('--v2-meso-page-padding-x');
        root.style.removeProperty('--v2-col-min-width');
        root.style.removeProperty('--v2-micro-viewport-cols');
    },

    resetAppForMacro() {
        const app = document.getElementById('app');
        if (!app) return;
        app.style.display = '';
        app.style.position = '';
        app.style.minHeight = '';
        app.style.width = '';
        app.style.flexDirection = '';
        app.style.alignItems = '';
        app.style.gap = '';
        app.classList.remove('is-meso-column-layout', 'is-micro-grid-layout', 'is-meso-hive-layout');
        this.clearFringeZone();
    },

    getHiveSpacing() {
        const hive = CONFIG.depth.v2?.hive || CONFIG.depth.v2?.workspaceLens || {};
        const cellW = scale(hive.cellWidth ?? hive.mesoCellWidth ?? 92);
        const cellH = scale(hive.cellHeight ?? hive.mesoCellHeight ?? 104);
        const gap = scale(hive.gap ?? 16);
        return {
            cellW,
            cellH,
            horiz: cellW + gap,
            vert: (cellH + gap) * 0.866
        };
    },

    applyHiveTokens() {
        const { cellW, cellH } = this.getHiveSpacing();
        const root = document.documentElement;
        root.style.setProperty('--v2-hive-cell-width', `${cellW}px`);
        root.style.setProperty('--v2-hive-cell-height', `${cellH}px`);
    },

    clearHiveTokens() {
        const root = document.documentElement;
        root.style.removeProperty('--v2-hive-cell-width');
        root.style.removeProperty('--v2-hive-cell-height');
    },

    applyFringeTokens() {
        const cfg = CONFIG.depth.v2?.fringe || {};
        const root = document.documentElement;
        const width = CONFIG.siteGrid?.regions?.filterFringe
            ? 'var(--site-layer-filterFringe-width)'
            : (cfg.width || '12vw');
        root.style.setProperty('--v2-fringe-width', width);
        root.style.setProperty('--v2-fringe-opacity', String(cfg.opacity ?? 0.42));
        root.style.setProperty('--v2-fringe-cell-scale', String(cfg.cellScale ?? 0.72));
    },

    clearFringeTokens() {
        const root = document.documentElement;
        root.style.removeProperty('--v2-fringe-width');
        root.style.removeProperty('--v2-fringe-opacity');
        root.style.removeProperty('--v2-fringe-cell-scale');
    },

    clearFringeZone() {
        const app = document.getElementById('app');
        if (!app) return;

        const fringe = app.querySelector('#filter-fringe-zone');
        if (fringe) {
            [...fringe.querySelectorAll('.note-wrapper')].forEach(wrapper => {
                app.appendChild(wrapper);
            });
            fringe.remove();
        }

        app.classList.remove('has-filter-fringe');
        document.body.classList.remove('has-filter-fringe');
        this.clearFringeTokens();
    },

    ensureFringeZone(app) {
        let fringe = app.querySelector('#filter-fringe-zone');
        if (!fringe) {
            fringe = document.createElement('div');
            fringe.id = 'filter-fringe-zone';
            fringe.className = 'filter-fringe-zone';
            fringe.dataset.siteLayer = 'filterFringe';
            fringe.setAttribute('aria-hidden', 'true');
            app.appendChild(fringe);
        }
        this.applyFringeTokens();
        return fringe;
    },

    collectAllNoteWrappers(app) {
        if (!app) return [];
        return [...app.querySelectorAll('.note-wrapper')];
    },

    restoreNoteWrapperDomOrder(app = document.getElementById('app')) {
        if (!app) return;

        const wrappers = this.collectAllNoteWrappers(app);
        if (wrappers.length < 2) return;

        const items = typeof AppState !== 'undefined' ? AppState.items : [];
        const orderById = new Map(items.map((item, index) => [String(item.id), index]));

        wrappers.sort((a, b) => {
            const ia = a.dataset.noteIndex != null && a.dataset.noteIndex !== ''
                ? parseInt(a.dataset.noteIndex, 10)
                : orderById.get(String(a.dataset.noteId));
            const ib = b.dataset.noteIndex != null && b.dataset.noteIndex !== ''
                ? parseInt(b.dataset.noteIndex, 10)
                : orderById.get(String(b.dataset.noteId));
            const ai = Number.isFinite(ia) ? ia : 999999;
            const bi = Number.isFinite(ib) ? ib : 999999;
            return ai - bi;
        });

        wrappers.forEach(wrapper => app.appendChild(wrapper));
    },

    partitionWrappersForLayout(wrappers) {
        const layout = [];
        const hidden = [];

        wrappers.forEach(wrapper => {
            const noteIndex = typeof MesoSpatialLayout !== 'undefined'
                ? MesoSpatialLayout.getNoteIndex(wrapper)
                : [...document.querySelectorAll('.note-wrapper')].indexOf(wrapper);

            const role = typeof CatalogState !== 'undefined'
                ? CatalogState.noteRoles?.get(noteIndex)
                : null;

            if (role === 'filtered' ||
                (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.isNoteFiltered(noteIndex))) {
                hidden.push(wrapper);
                return;
            }

            layout.push(wrapper);
        });

        if (typeof MesoSpatialLayout !== 'undefined') {
            return {
                layout: MesoSpatialLayout.sortWrappersByRank(layout),
                hidden
            };
        }

        return { layout, hidden };
    },

    resolveLayoutItem(wrapper) {
        const noteId = wrapper?.dataset?.noteId;
        if (!noteId || typeof AppState === 'undefined') return null;
        return AppState.items.find(i => String(i.id) === String(noteId)) ?? null;
    },

    estimateWrapperLayoutWeight(wrapper, level = 3) {
        const item = this.resolveLayoutItem(wrapper);

        if (level === 2 && typeof MesoMock !== 'undefined' && item) {
            try {
                const profile = MesoMock.buildProfile(item, wrapper);
                const rowSpan = Math.max(1, profile.rowSpan || 1);
                const lineCount = profile.lines?.length || 1;
                return rowSpan * 10000 + lineCount * 120;
            } catch (_) {
                /* fall through to text estimate */
            }
        }

        if (item) {
            const title = String(item.title || '');
            const body = String(item.body || '');
            const titleChars = Array.from(title).length;
            const bodyChars = Array.from(body).length;
            const titleLines = Math.max(0, Math.ceil(titleChars / 24));
            const bodyLines = Math.max(1, Math.ceil(bodyChars / 38));
            const tagBonus = (item.tags?.length || 0) * 90;
            const typologyBonus = item.typology ? 60 : 0;
            const lineWeight = titleLines * 150 + bodyLines * 95;
            const minBlock = level === 3 ? 720 : 480;
            return Math.max(minBlock, lineWeight + tagBonus + typologyBonus);
        }

        return level === 3 ? 720 : 480;
    },

    /** Balance column stacks by estimated note height (LPT → shortest column). */
    partitionWrappersIntoColumns(wrappers, colCount, level = 3) {
        const buckets = Array.from({ length: colCount }, () => ({
            weight: 0,
            wrappers: []
        }));

        const ranked = wrappers.map((wrapper) => ({
            wrapper,
            weight: this.estimateWrapperLayoutWeight(wrapper, level)
        })).sort((a, b) => b.weight - a.weight);

        ranked.forEach(({ wrapper, weight }) => {
            let target = 0;
            for (let col = 1; col < colCount; col++) {
                if (buckets[col].weight < buckets[target].weight) target = col;
            }
            buckets[target].wrappers.push(wrapper);
            buckets[target].weight += weight;
        });

        return buckets.map((bucket) => bucket.wrappers);
    },

    /** Column band centered on the micro canvas (not the viewport). */
    getMicroClusterBandIndices(colCount, bandCols) {
        const centerCol = Math.floor(colCount / 2);
        const bandStart = Math.max(0, Math.min(colCount - bandCols, centerCol - Math.floor(bandCols / 2)));
        return Array.from({ length: bandCols }, (_, i) => bandStart + i);
    },

    /** Role priority for L3 block-study clustering (lower = earlier in cluster). */
    _microFocusRoleRank(role) {
        if (role === 'stretched') return 0;
        if (role === 'captured') return 1;
        if (role === 'emphasized') return 2;
        return 3;
    },

    /** When blocks are active, pull matching notes to the front of the L3 layout stream. */
    sortWrappersForMicroLayout(wrappers) {
        const hasFocus = typeof CatalogState !== 'undefined' && CatalogState.hasFocus;
        if (!hasFocus) {
            return typeof MesoSpatialLayout !== 'undefined'
                ? MesoSpatialLayout.sortWrappersByRank(wrappers)
                : wrappers;
        }

        const relevant = [];
        const neutral = [];
        const getIndex = typeof MesoSpatialLayout !== 'undefined'
            ? (w) => MesoSpatialLayout.getNoteIndex(w)
            : (w) => [...document.querySelectorAll('.note-wrapper')].indexOf(w);

        wrappers.forEach(wrapper => {
            const noteIndex = getIndex(wrapper);
            const role = CatalogState.noteRoles?.get(noteIndex);
            if (role === 'stretched' || role === 'captured' || role === 'emphasized') {
                relevant.push({ wrapper, noteIndex, role });
            } else {
                neutral.push(wrapper);
            }
        });

        const ranks = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.getLayoutRanks()
            : CatalogState?.macroRank;

        relevant.sort((a, b) => {
            const ra = this._microFocusRoleRank(a.role);
            const rb = this._microFocusRoleRank(b.role);
            if (ra !== rb) return ra - rb;
            return (ranks?.get(a.noteIndex) ?? a.noteIndex) - (ranks?.get(b.noteIndex) ?? b.noteIndex);
        });

        const sortNeutral = typeof MesoSpatialLayout !== 'undefined'
            ? (list) => MesoSpatialLayout.sortWrappersByRank(list, ranks)
            : (list) => list;

        return [
            ...relevant.map(entry => entry.wrapper),
            ...sortNeutral(neutral)
        ];
    },

    /**
     * L3 with active blocks: pack relevant notes into a canvas-centered column band,
     * balance the rest with LPT across remaining columns.
     */
    partitionWrappersForMicroFocus(wrappers, colCount, level = 3) {
        const hasFocus = typeof CatalogState !== 'undefined' && CatalogState.hasFocus;
        if (!hasFocus) {
            return this.partitionWrappersIntoColumns(wrappers, colCount, level);
        }

        const buckets = Array.from({ length: colCount }, () => ({
            weight: 0,
            wrappers: []
        }));

        const getIndex = typeof MesoSpatialLayout !== 'undefined'
            ? (w) => MesoSpatialLayout.getNoteIndex(w)
            : (w) => [...document.querySelectorAll('.note-wrapper')].indexOf(w);

        const relevant = [];
        const neutral = [];

        wrappers.forEach(wrapper => {
            const noteIndex = getIndex(wrapper);
            const role = CatalogState.noteRoles?.get(noteIndex);
            if (role === 'stretched' || role === 'captured' || role === 'emphasized') {
                relevant.push(wrapper);
            } else {
                neutral.push(wrapper);
            }
        });

        const lensCfg = CONFIG.depth.v2?.workspaceLens || {};
        const bandCols = Math.min(
            colCount,
            Math.max(2, lensCfg.microClusterCols ?? 4)
        );
        const bandIndices = this.getMicroClusterBandIndices(colCount, bandCols);
        const bandSet = new Set(bandIndices);

        relevant.forEach((wrapper, i) => {
            const col = bandIndices[i % bandCols];
            const weight = this.estimateWrapperLayoutWeight(wrapper, level);
            buckets[col].wrappers.push(wrapper);
            buckets[col].weight += weight;
        });

        const neutralCols = [];
        for (let col = 0; col < colCount; col++) {
            if (!bandSet.has(col)) neutralCols.push(col);
        }

        if (neutralCols.length) {
            const rankedNeutral = neutral.map(wrapper => ({
                wrapper,
                weight: this.estimateWrapperLayoutWeight(wrapper, level)
            })).sort((a, b) => b.weight - a.weight);

            rankedNeutral.forEach(({ wrapper, weight }) => {
                let target = neutralCols[0];
                for (let i = 1; i < neutralCols.length; i++) {
                    const col = neutralCols[i];
                    if (buckets[col].weight < buckets[target].weight) target = col;
                }
                buckets[target].wrappers.push(wrapper);
                buckets[target].weight += weight;
            });
        }

        return {
            groups: buckets.map(bucket => bucket.wrappers),
            bandIndices
        };
    },

    stashHiddenWrappers(app, hidden) {
        hidden.forEach(wrapper => {
            wrapper.classList.add('is-layout-excluded');
            wrapper.style.minHeight = '';
            wrapper.style.removeProperty('--meso-mock-row-span');
            const stage = wrapper.querySelector('.note-stage');
            if (stage) stage.style.minHeight = '';
            app.appendChild(wrapper);
        });
    },

    restoreMesoColumnLayout() {
        const app = document.getElementById('app');
        if (!app) return;

        app.classList.remove('is-workspace-lens-layout');
        app.style.minHeight = '';
        document.querySelectorAll('.note-wrapper.is-workspace-lens-anchored').forEach(wrapper => {
            wrapper.classList.remove('is-workspace-lens-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
        });
        document.querySelectorAll('.note-wrapper.is-meso-hive-anchored').forEach(wrapper => {
            wrapper.classList.remove('is-meso-hive-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
        });
        document.querySelectorAll('.note-wrapper.is-layout-excluded').forEach(wrapper => {
            wrapper.classList.remove('is-layout-excluded');
        });

        const columns = [...app.querySelectorAll(':scope > .meso-grid-column, :scope > .micro-grid-column')];
        const ordered = [];

        if (columns.length) {
            const colCount = columns.length;
            const stacks = columns.map(col => [...col.querySelectorAll('.note-wrapper')]);
            const maxRows = Math.max(0, ...stacks.map(stack => stack.length));

            for (let row = 0; row < maxRows; row++) {
                for (let col = 0; col < colCount; col++) {
                    const wrapper = stacks[col][row];
                    if (wrapper) ordered.push(wrapper);
                }
            }

            columns.forEach(col => col.remove());
        }

        this.clearFringeZone();

        if (typeof MesoMock !== 'undefined') MesoMock.invalidateColumnGradientLayout();
        ordered.forEach(wrapper => {
            wrapper.style.minHeight = '';
            const stage = wrapper.querySelector('.note-stage');
            if (stage) stage.style.minHeight = '';
            app.appendChild(wrapper);
        });
        this.restoreNoteWrapperDomOrder(app);
        app.classList.remove('is-meso-column-layout');
        app.classList.remove('is-meso-hive-layout');
        delete app.dataset.hiveCenterX;
        delete app.dataset.hiveCenterY;
        this.clearHiveTokens();
    },

    shouldUseMesoHiveLayout() {
        return false;
    },

    applyMesoLayoutForState(options = {}) {
        if (DepthController.currentLevel !== 2) return;

        if (typeof CatalogState !== 'undefined') {
            CatalogState.rebuildFromWarehouse();
        }

        const force = options.force === true;
        const app = document.getElementById('app');

        if (this.shouldUseMesoHiveLayout()) {
            if (force || !app?.classList.contains('is-meso-hive-layout')) {
                this.layoutMesoHive({ ...options, force: true });
            }
            return;
        }

        if (force || !app?.classList.contains('is-meso-column-layout')) {
            this.layoutMesoColumns({ ...options, force: true });
        }
    },

    layoutMesoHive(options = {}) {
        if (DepthController.currentLevel !== 2) return;

        const app = document.getElementById('app');
        const grid = this.getGrid(2);
        if (!app || !grid) return;

        const force = options.force === true;
        if (app.classList.contains('is-meso-hive-layout') && !force) return;

        if (typeof CatalogState !== 'undefined') {
            CatalogState.rebuildFromWarehouse();
        }

        const allWrappers = this.collectAllNoteWrappers(app);
        if (!allWrappers.length) return;

        this.restoreMesoColumnLayout();
        this.clearFringeZone();
        this.applyHiveTokens();

        const { layout, hidden } = this.partitionWrappersForLayout(allWrappers);
        const sorted = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.sortWrappersByRank(layout)
            : layout;

        const { horiz, vert, cellW, cellH } = this.getHiveSpacing();
        const offsets = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.computeHivePixelOffsets(sorted.length, horiz, vert)
            : [];

        const hive = CONFIG.depth.v2?.hive || {};
        const centerYRatio = hive.centerYRatio ?? 0.44;
        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;
        const breathing = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--scroll-breathing-room')
        ) || 120;

        const centerX = app.clientWidth / 2;
        const centerY = breathing + (window.innerHeight - breathing - reserve) * centerYRatio;

        const maxOffY = offsets.reduce((max, o) => Math.max(max, o.y), 0);
        app.style.minHeight = `${Math.max(
            window.innerHeight,
            centerY + maxOffY + cellH * 2 + reserve + 96
        )}px`;

        app.dataset.hiveCenterX = String(centerX);
        app.dataset.hiveCenterY = String(centerY);

        sorted.forEach((wrapper, index) => {
            wrapper.classList.remove('is-layout-excluded');
            wrapper.classList.add('is-meso-hive-anchored');
            wrapper.style.minHeight = '';
            const stage = wrapper.querySelector('.note-stage');
            if (stage) stage.style.minHeight = '';

            const offset = offsets[index] || { x: 0, y: 0 };
            wrapper.style.left = `${centerX + offset.x}px`;
            wrapper.style.top = `${centerY + offset.y}px`;
            app.appendChild(wrapper);
        });

        this.stashHiddenWrappers(app, hidden);

        app.classList.add('is-meso-hive-layout');
        app.classList.remove('is-meso-column-layout', 'has-filter-fringe');

        if (typeof MesoMock !== 'undefined') {
            MesoMock.invalidateColumnGradientLayout();
        }

        const refreshGlyphs = () => {
            if (typeof MesoMock === 'undefined') return;
            MesoMock.syncAllGlyphsOnL2Enter();
            MesoMock.scheduleAllTextureBakes();
        };

        const centerView = () => {
            if (typeof AppState !== 'undefined') {
                AppState.centerMesoViewport({ smooth: options.smooth !== false });
            }
        };

        requestAnimationFrame(() => {
            refreshGlyphs();
            requestAnimationFrame(() => {
                refreshGlyphs();
                centerView();
                requestAnimationFrame(centerView);
            });
        });
    },

    layoutMesoColumns(options = {}) {
        if (DepthController.currentLevel !== 2) return;

        const app = document.getElementById('app');
        const grid = this.getGrid(2);
        if (!app || !grid) return;

        const force = options.force === true;
        if (app.classList.contains('is-meso-column-layout') && !force) return;

        if (typeof CatalogState !== 'undefined') {
            CatalogState.rebuildFromWarehouse();
        }

        const colCount = grid.colCount || 9;
        const allWrappers = this.collectAllNoteWrappers(app);
        if (!allWrappers.length) return;

        this.restoreMesoColumnLayout();
        this.clearFringeZone();

        const { layout, hidden } = this.partitionWrappersForLayout(allWrappers);

        const ranks = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.getLayoutRanks()
            : CatalogState?.macroRank;
        const sorted = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.sortWrappersByRank(layout, ranks)
            : layout;

        const columns = Array.from({ length: colCount }, () => {
            const col = document.createElement('div');
            col.className = 'meso-grid-column';
            return col;
        });

        const columnGroups = this.partitionWrappersIntoColumns(sorted, colCount, 2);
        columnGroups.forEach((group, colIndex) => {
            group.forEach((wrapper) => {
                wrapper.classList.remove('is-layout-excluded');
                wrapper.style.minHeight = '';
                const stage = wrapper.querySelector('.note-stage');
                if (stage) stage.style.minHeight = '';
                columns[colIndex].appendChild(wrapper);
            });
        });

        columns.forEach(col => app.appendChild(col));
        this.stashHiddenWrappers(app, hidden);

        app.classList.add('is-meso-column-layout');
        app.classList.remove('has-filter-fringe');
        if (typeof MesoMock !== 'undefined') MesoMock.invalidateColumnGradientLayout();
        if (typeof updateSiteGridCrosses === 'function') {
            updateSiteGridCrosses({ force: true });
        }
    },

    layoutMicroGrid(options = {}) {
        if (DepthController.currentLevel !== 3) return;

        const app = document.getElementById('app');
        const grid = this.getGrid(3);
        if (!app || !grid) return;

        const force = options.force === true;
        if (app.classList.contains('is-micro-grid-layout') && !force) return;

        if (typeof CatalogState !== 'undefined') {
            CatalogState.rebuildFromWarehouse();
        }

        const colCount = grid.colCount || 12;

        this.restoreMesoColumnLayout();
        this.clearFringeZone();

        const allWrappers = this.collectAllNoteWrappers(app);
        const { layout, hidden } = this.partitionWrappersForLayout(allWrappers);
        const sortedLayout = this.sortWrappersForMicroLayout(layout);

        const columns = Array.from({ length: colCount }, () => {
            const col = document.createElement('div');
            col.className = 'micro-grid-column';
            return col;
        });

        const focusPartition = this.partitionWrappersForMicroFocus(sortedLayout, colCount, 3);
        const columnGroups = Array.isArray(focusPartition)
            ? focusPartition
            : focusPartition.groups;

        columnGroups.forEach((group, colIndex) => {
            columns[colIndex].style.paddingTop = '';
            columns[colIndex].style.transform = '';
            group.forEach((wrapper) => {
                wrapper.classList.remove('is-layout-excluded', 'is-catalog-anchored', 'is-meso-anchored', 'is-centered');
                wrapper.style.removeProperty('--meso-mock-row-span');
                wrapper.style.removeProperty('--micro-mock-row-span');
                wrapper.style.gridColumn = '';
                wrapper.style.gridRow = '';
                wrapper.style.marginTop = '';
                wrapper.style.minHeight = '';
                wrapper.style.left = '';
                wrapper.style.top = '';
                wrapper.style.transform = '';
                wrapper.style.removeProperty('--meso-frame-w');
                wrapper.style.removeProperty('--meso-frame-h');
                delete wrapper.dataset.mesoFrameReady;
                const stage = wrapper.querySelector('.note-stage');
                if (stage) {
                    stage.style.minHeight = '';
                    stage.style.transform = '';
                    stage.style.width = '';
                    stage.style.maxWidth = '';
                    stage.style.display = '';
                    delete stage.dataset.layoutAnchor;
                }
                columns[colIndex].appendChild(wrapper);
            });
        });

        columns.forEach(col => app.appendChild(col));
        this.stashHiddenWrappers(app, hidden);

        app.classList.add('is-micro-grid-layout');
        app.classList.remove('has-filter-fringe');
        this._notifyMapLayoutReady();
        if (typeof updateSiteGridCrosses === 'function') {
            updateSiteGridCrosses({ force: true });
        }
    },

    relayoutForFilterChange(options = {}) {
        if (!this.isActive()) return;
        const level = DepthController.currentLevel;
        if (level === 3) {
            this.layoutMicroGrid(options);
            if (typeof MicroMock !== 'undefined') MicroMock.applyAll();
            if (typeof CatalogState !== 'undefined' && CatalogState.hasFocus && typeof AppState !== 'undefined') {
                AppState.centerMicroFocusCluster({ smooth: options.smooth !== false });
            }
        }
        this._notifyMapLayoutReady();
    },

    applyGridTokens(level = DepthController.currentLevel) {
        if (!this.isActive()) return;

        const root = document.documentElement;

        if (level < 2) {
            this.clearGridTokens(root);
            this.resetAppForMacro();
            return;
        }

        const grid = this.getGrid(level);
        if (!grid) return;

        const cellH = level === 3 ? null : scale(grid.cellHeight || 100);
        const cellW = grid.cellWidth ? scale(grid.cellWidth) : null;
        const rowGap = scale(grid.rowGap || 16);
        const colGap = scale(grid.colGap || grid.rowGap || 16);
        const colItemGap = scale(grid.colItemGap ?? 14);
        const pagePaddingX = CONFIG.siteGrid?.regions?.canvas
            ? 'var(--site-canvas-page-padding-x, var(--site-grid-padding))'
            : `${scale(grid.pagePaddingX ?? 48)}px`;
        const colMinWidth = grid.colMinWidth ? scale(grid.colMinWidth) : null;

        const mesoColCount = grid.colCount || 9;
        const microViewportCols = CONFIG.siteGrid?.contentColumns
            ? getSiteGridViewportColCount(3)
            : (grid.viewportCols ?? 3);

        root.style.setProperty('--v2-col-count', String(level === 3 ? (grid.colCount || 12) : mesoColCount));
        root.style.setProperty('--v2-row-gap', `${rowGap}px`);
        root.style.setProperty('--v2-col-gap', `${colGap}px`);
        root.style.setProperty('--v2-meso-item-gap', `${colItemGap}px`);
        root.style.setProperty('--v2-meso-page-padding-x', pagePaddingX);

        if (colMinWidth) {
            root.style.setProperty('--v2-col-min-width', `${colMinWidth}px`);
        } else if (CONFIG.siteGrid?.contentColumns && level === 2) {
            root.style.setProperty('--v2-col-min-width', 'var(--site-meso-col-width)');
        } else {
            root.style.removeProperty('--v2-col-min-width');
        }
        if (cellW) {
            root.style.setProperty('--v2-cell-width', `${cellW}px`);
        } else {
            root.style.removeProperty('--v2-cell-width');
        }

        if (level === 3) {
            root.style.setProperty('--v2-micro-viewport-cols', String(microViewportCols));
            if (CONFIG.siteGrid?.contentColumns) {
                root.style.setProperty('--v2-micro-col-width', 'var(--site-micro-col-width)');
                root.style.setProperty('--v2-col-gap', 'var(--site-content-gap, var(--site-grid-gap))');
                root.style.setProperty('--v2-row-gap', 'var(--site-content-gap, var(--site-grid-gap))');
            }
            root.style.removeProperty('--v2-cell-height');
            root.style.removeProperty('--v2-canvas-width');
        } else {
            root.style.removeProperty('--v2-micro-viewport-cols');
            root.style.setProperty('--v2-canvas-width', grid.canvasWidth || '300vw');
            root.style.setProperty('--v2-cell-height', `${cellH}px`);
        }
    },

    restoreMacroLevel() {
        if (!this.isActive()) return;
        this._lastMesoPreparedLevel = 1;
        this.restoreMesoColumnLayout();
        this.clearGridTokens();
        this.resetAppForMacro();

        document.querySelectorAll('.note-wrapper.is-catalog-anchored, .note-wrapper.is-meso-anchored').forEach(wrapper => {
            wrapper.classList.remove('is-catalog-anchored', 'is-meso-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.removeProperty('--macro-meso-reveal');
        });
        document.body.classList.remove('is-catalog-layout', 'is-meso-in-place', 'is-macro-to-meso');

        const app = document.getElementById('app');
        if (app) this.restoreNoteWrapperDomOrder(app);
    },

    ensureShell() {
        if (!this.isActive()) return;
        document.body.classList.add('is-depth-v2');
    },

    init() {
        if (!this.isActive()) return;
        this.ensureShell();
        this.applyGridTokens(DepthController.currentLevel);
    },

    prepareMesoGrid() {
        if (DepthController.currentLevel !== 2) return;

        if (this._prepareMesoPromise) {
            return this._mesoLayoutReadyPromise || this._prepareMesoPromise;
        }

        const token = ++this._prepareMesoToken;

        document.body.classList.remove(
            'is-macro-to-meso',
            'is-meso-in-place',
            'is-meso-zoom-out',
            'is-catalog-settling',
            'is-macro-grid-settle',
            'is-catalog-layout'
        );

        if (typeof MacroMesoBridge !== 'undefined' && MacroMesoBridge.clearAnchors) {
            MacroMesoBridge.clearAnchors();
        }

        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            wrapper.classList.remove('is-meso-anchored', 'is-catalog-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.removeProperty('--macro-meso-reveal');
        });

        if (typeof MesoMock === 'undefined') return;

        this._mesoLayoutReadyPromise = new Promise(resolve => {
            this._resolveMesoLayoutReady = resolve;
        });

        const runAfterFonts = () => {
            const fontReady = document.fonts?.ready ?? Promise.resolve();
            return fontReady.then(() => new Promise(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            }));
        };

        const runRefresh = async () => {
            if (typeof AppState === 'undefined') return false;
            const meso = CONFIG?.depth?.v2?.meso || {};
            if (meso.refreshDataOnL2Enter) {
                try {
                    await AppState.refreshDataFromSheet();
                    return true;
                } catch (err) {
                    console.warn('L2 data refresh failed, using cached items', err);
                }
            }
            AppState.syncNoteDomFromItems();
            return false;
        };

        const applyLayoutOnly = (phase) => {
            if (token !== this._prepareMesoToken) return;

            if (DepthController.currentLevel === 2) {
                this.applyMesoLayoutForState({ force: true });
                if (typeof MesoMock !== 'undefined') {
                    MesoMock.invalidateColumnGradientLayout();
                }
            } else {
                this.restoreMesoColumnLayout();
            }

            if (phase === 'immediate' && this._resolveMesoLayoutReady) {
                this._resolveMesoLayoutReady();
                this._resolveMesoLayoutReady = null;
            }
            if (phase === 'immediate' && DepthController.currentLevel === 2) {
                this._notifyMapLayoutReady();
            }
        };

        const applyMocksAfterRefresh = (fullApply = false) => {
            if (token !== this._prepareMesoToken) return;

            const app = document.getElementById('app');
            const itemsById = new Map(
                (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
            );

            document.body.classList.add('is-silhouette-micro-measure');
            try {
                void app?.offsetHeight;

                if (typeof MesoMock !== 'undefined') {
                    MesoMock.invalidateColumnGradientLayout();
                    MesoMock.buildColumnGradientLayout();
                }

                document.querySelectorAll('.note-wrapper').forEach(wrapper => {
                    const noteId = wrapper.dataset.noteId;
                    let item = noteId ? itemsById.get(noteId) : null;

                    if (!item && typeof SilhouetteEngine !== 'undefined') {
                        item = SilhouetteEngine.entries.get(noteId)?.item;
                    }

                    if (!item) return;

                    try {
                        if (fullApply) {
                            MesoMock.applyToWrapper(wrapper, item);
                        } else {
                            MesoMock.syncGlyphLayout(wrapper, item);
                        }
                    } catch (err) {
                        console.warn('MesoMock apply failed', noteId, err);
                    }
                });
            } finally {
                document.body.classList.remove('is-silhouette-micro-measure');
            }
        };

        if (typeof AppState !== 'undefined') {
            AppState.syncNoteDomFromItems();
        }

        applyLayoutOnly('immediate');
        this._lastMesoPreparedLevel = 2;

        if (typeof MesoMock !== 'undefined') {
            MesoMock.applyFirstColumnStructure();
            requestAnimationFrame(() => {
                if (token !== this._prepareMesoToken) return;

                const itemsById = new Map(
                    (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
                );
                const pres = typeof isPresentationMode === 'function' && isPresentationMode();
                const columnLimit = pres ? (CONFIG.presentation?.mesoInitialBakeColumns ?? 0) : 0;
                const { wrappers } = typeof MesoMock._collectMesoWrappers === 'function'
                    ? MesoMock._collectMesoWrappers({ columnLimit })
                    : { wrappers: [...document.querySelectorAll('.note-wrapper')] };

                wrappers.forEach(wrapper => {
                    const item = itemsById.get(wrapper.dataset.noteId);
                    if (!item || wrapper.querySelector('.meso-mock__frame')) return;
                    try {
                        MesoMock.applyToWrapper(wrapper, item, { skipBake: true });
                    } catch (err) {
                        console.warn('MesoMock structure apply failed', wrapper.dataset.noteId, err);
                    }
                });

                MesoMock.syncAllGlyphsOnL2Enter();
                MesoMock.scheduleAllTextureBakes();
                if (typeof AppState !== 'undefined') {
                    AppState.centerCanvasOnLayerEnter();
                }
            });
        }

        this._prepareMesoPromise = runRefresh()
            .then(didRefresh => {
                if (token !== this._prepareMesoToken) return;
                const meso = CONFIG?.depth?.v2?.meso || {};
                const needsFullApply = didRefresh || meso.refreshDataOnL2Enter;
                return runAfterFonts().then(() => {
                    if (token !== this._prepareMesoToken) return;
                    if (needsFullApply) applyMocksAfterRefresh(true);
                });
            })
            .catch(err => {
                console.warn('prepareMesoGrid refresh failed', err);
            })
            .finally(() => {
                if (token === this._prepareMesoToken) {
                    this._prepareMesoPromise = null;
                }
            });

        return this._mesoLayoutReadyPromise;
    },

    prepareMicroGrid() {
        if (DepthController.currentLevel !== 3) return;

        this.layoutMicroGrid({ force: true });

        if (typeof AppState !== 'undefined') {
            AppState.syncNoteDomFromItems();
        }

        const applyMocks = () => {
            if (typeof MicroMock !== 'undefined') {
                MicroMock.applyAll();
            }
            if (typeof CatalogState !== 'undefined' && CatalogState.hasFocus && typeof AppState !== 'undefined') {
                AppState.centerMicroFocusCluster({ smooth: true });
            } else if (typeof AppState !== 'undefined') {
                requestAnimationFrame(() => {
                    AppState.centerCanvasOnLayerEnter();
                });
            }
        };

        const fontReady = document.fonts?.ready;
        if (fontReady?.then) {
            fontReady.then(() => requestAnimationFrame(applyMocks)).catch(() => applyMocks());
        } else {
            requestAnimationFrame(applyMocks);
        }
    },

    onLevelChange(level) {
        if (!this.isActive()) return;
        this.ensureShell();

        if (typeof NoteCensor !== 'undefined') {
            NoteCensor.onLevelChange(level);
        }

        if (level === 1) {
            this._prepareMesoToken++;
            if (typeof MesoMock !== 'undefined') MesoMock.unbindShaderLiveHover();
            this.restoreMacroLevel();
            if (typeof ActionWarehouse !== 'undefined') {
                ActionWarehouse.updateDotFocusFilter();
            }
            return;
        }
        this.applyGridTokens(level);
        const app = document.getElementById('app');

        if (typeof ActionWarehouse !== 'undefined') {
            ActionWarehouse.updateDotFocusFilter();
            ActionWarehouse.syncDeployedBlocksForDepth?.();
        }

        if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.linkCtx) {
            PhysicsEngine.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }

        if (level === 3) {
            this._lastMesoPreparedLevel = 3;
            if (typeof MesoMock !== 'undefined') MesoMock.unbindShaderLiveHover();
            this.prepareMicroGrid();
            return;
        }

        if (level === 2) return;

        app?.classList.remove('is-micro-grid-layout');
    },

    afterNotesRender() {
        if (!this.isActive()) return;
        const level = DepthController.currentLevel;
        if (level !== 3) return;
        this.ensureShell();
        this.applyGridTokens(3);
        this.prepareMicroGrid();
    }
};
