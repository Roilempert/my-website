/* ==========================================================================
   04b. TOROIDAL PAN — L2/L3 seamless grid cycling (column/row reorder + scroll sync)
   ========================================================================== */
const ToroidalPan = {
    _contentBounds: null,
    _contentBoundsDirty: true,
    _recycling: false,
    _enabled: false,
    _cycleCountX: 0,
    _cycleCountY: 0,
    _columnStepX: 0,
    _rowStepY: 0,
    _canonicalMapBounds: null,
    _mapPeriodX: 0,
    _mapPeriodY: 0,

    init() {
        window.addEventListener('resize', () => {
            if (!this.isEnabled()) return;
            this.invalidatePeriod();
            this.measureGridSteps();
        });
    },

    getCfg() {
        return CONFIG.navigation?.toroidalWrap || {};
    },

    isEnabled() {
        if (!this.getCfg().enabled) return false;
        if (typeof DepthController === 'undefined' || DepthController.currentLevel < 2) return false;
        if (typeof DepthV2 === 'undefined' || !DepthV2.isActive()) return false;
        const app = document.getElementById('app');
        if (!app) return false;
        return app.classList.contains('is-meso-column-layout') ||
            app.classList.contains('is-meso-hive-layout') ||
            app.classList.contains('is-micro-grid-layout') ||
            (typeof CatalogLayoutEngine !== 'undefined' && CatalogLayoutEngine.isCatalogLayoutActive());
    },

    isActive() {
        if (!this.isEnabled()) return false;
        if (typeof DepthController !== 'undefined' && DepthController.isAnyTransitionActive?.()) {
            return false;
        }
        return true;
    },

    getAxes() {
        const axes = this.getCfg().axes || 'both';
        return {
            x: axes === 'x' || axes === 'both',
            y: axes === 'y' || axes === 'both'
        };
    },

    usesGridCycle() {
        const app = document.getElementById('app');
        if (!app) return false;
        return app.classList.contains('is-meso-column-layout') ||
            app.classList.contains('is-micro-grid-layout');
    },

    getColumnClassName() {
        const app = document.getElementById('app');
        if (!app) return null;
        if (app.classList.contains('is-micro-grid-layout')) return 'micro-grid-column';
        if (app.classList.contains('is-meso-column-layout')) return 'meso-grid-column';
        return null;
    },

    getColumnElements() {
        const className = this.getColumnClassName();
        const app = document.getElementById('app');
        if (!className || !app) return [];
        return [...app.querySelectorAll(`:scope > .${className}`)];
    },

    invalidatePeriod() {
        this._contentBoundsDirty = true;
    },

    measureGridSteps() {
        const columns = this.getColumnElements();
        if (columns.length >= 2) {
            const a = columns[0].getBoundingClientRect();
            const b = columns[1].getBoundingClientRect();
            this._columnStepX = Math.max(1, Math.round(Math.abs(b.left - a.left)));
        } else if (columns.length === 1) {
            this._columnStepX = Math.max(1, Math.round(columns[0].getBoundingClientRect().width));
        } else {
            this._columnStepX = 0;
        }

        const firstCol = columns[0];
        if (firstCol) {
            const notes = [...firstCol.querySelectorAll(':scope > .note-wrapper')];
            if (notes.length >= 2) {
                const a = notes[0].getBoundingClientRect();
                const b = notes[1].getBoundingClientRect();
                this._rowStepY = Math.max(1, Math.round(Math.abs(b.top - a.top)));
            } else if (notes.length === 1) {
                this._rowStepY = Math.max(1, Math.round(notes[0].getBoundingClientRect().height));
            } else {
                this._rowStepY = 0;
            }
        } else {
            this._rowStepY = 0;
        }
    },

    getBrowserScrollLimits(axis = 'x') {
        const docEl = document.documentElement;
        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;

        if (axis === 'x') {
            const maxScroll = Math.max(0, (docEl?.scrollWidth || 0) - window.innerWidth);
            if (document.documentElement.dir === 'rtl') {
                return { min: -maxScroll, max: 0 };
            }
            return { min: 0, max: maxScroll };
        }

        const scrollHeight = Math.max(docEl?.scrollHeight || 0, document.body?.scrollHeight || 0);
        const maxScroll = Math.max(0, scrollHeight - (window.innerHeight - reserve));
        return { min: 0, max: maxScroll };
    },

    getMapScrollX() {
        return window.pageXOffset + this._cycleCountX * this._columnStepX;
    },

    getMapScrollY() {
        return window.pageYOffset + this._cycleCountY * this._rowStepY;
    },

    onGridReordered() {
        this.invalidatePeriod();
        this.notifyMap(true);
    },

    notifyMap(didCycle = false) {
        if (typeof NavigationMap === 'undefined') return;

        if (didCycle) {
            NavigationMap._depthMapMarkersDirty = true;
            NavigationMap.clearMapWrapperCache?.();
            NavigationMap.scheduleRender();
            return;
        }

        NavigationMap.schedulePanUpdate?.();
    },

    clearLogicalPositions() {
        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            delete wrapper.dataset.toroidalLogicalLeft;
            delete wrapper.dataset.toroidalLogicalTop;
        });
    },

    stampLogicalPositions() {
        if (!this.usesGridCycle()) return;

        const app = document.getElementById('app');
        if (app) void app.offsetHeight;

        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded') ||
                wrapper.classList.contains('is-molecule-filtered-out')) {
                delete wrapper.dataset.toroidalLogicalLeft;
                delete wrapper.dataset.toroidalLogicalTop;
                return;
            }

            const target = wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                || wrapper.querySelector('.meso-mock__frame')
                || wrapper.querySelector('.depth-v2-glyph--micro .micro-mock__card')
                || wrapper.querySelector('.micro-mock__card')
                || wrapper;
            const rect = target.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) {
                delete wrapper.dataset.toroidalLogicalLeft;
                delete wrapper.dataset.toroidalLogicalTop;
                return;
            }

            wrapper.dataset.toroidalLogicalLeft = String(rect.left + window.pageXOffset);
            wrapper.dataset.toroidalLogicalTop = String(rect.top + window.pageYOffset);
        });
    },

    finalizeMapLayout() {
        if (!this.isEnabled() || typeof DepthController === 'undefined' || DepthController.currentLevel < 2) {
            return;
        }

        this.measureGridSteps();
        this.clearLogicalPositions();
        this.stampLogicalPositions();
        this.cacheCanonicalMapBounds();
        this.cacheMapPeriods();

        if (typeof NavigationMap !== 'undefined') {
            NavigationMap._depthMapMarkersDirty = true;
            NavigationMap._contentDirty = true;
            NavigationMap._referenceBoundsDirty = true;
            NavigationMap.clearMapWrapperCache?.();
            NavigationMap._panDisplayX = 0;
            NavigationMap._panDisplayY = 0;
            NavigationMap._panTargetX = 0;
            NavigationMap._panTargetY = 0;
            NavigationMap.scheduleRender();
        }
    },

    adjustPageRect(pageRect, el) {
        if (!pageRect || !this.usesGridCycle()) return pageRect;

        const wrapper = el?.classList?.contains('note-wrapper')
            ? el
            : el?.closest?.('.note-wrapper');

        if (wrapper) {
            const logicalLeft = Number(wrapper.dataset.toroidalLogicalLeft);
            const logicalTop = Number(wrapper.dataset.toroidalLogicalTop);
            if (Number.isFinite(logicalLeft) && Number.isFinite(logicalTop)) {
                return {
                    left: logicalLeft,
                    top: logicalTop,
                    width: pageRect.width,
                    height: pageRect.height
                };
            }
        }

        let dx = 0;
        const col = el?.closest?.('.meso-grid-column, .micro-grid-column');

        if (col && col.dataset.toroidalColSlot != null && this._columnStepX > 0) {
            const slot = Number(col.dataset.toroidalColSlot);
            const columns = this.getColumnElements();
            const domIndex = columns.indexOf(col);
            if (domIndex >= 0 && Number.isFinite(slot)) {
                dx = (domIndex - slot) * this._columnStepX;
            }
        }

        if (Math.abs(dx) < 0.5) return pageRect;

        return {
            left: pageRect.left - dx,
            top: pageRect.top,
            width: pageRect.width,
            height: pageRect.height
        };
    },

    cacheCanonicalMapBounds() {
        if (!this.isEnabled() || !this.usesGridCycle()) {
            this._canonicalMapBounds = null;
            return;
        }

        const bounds = this.measureCanonicalGridBounds();
        if (bounds) {
            this._canonicalMapBounds = bounds;
        }
    },

    measureCanonicalGridBounds() {
        const columns = this.getColumnElements();
        const stepX = this._columnStepX;
        if (!columns.length || stepX < 1) return null;

        const pad = CONFIG.navigation.contentPadding || 0;
        let minY = Infinity;
        let maxY = -Infinity;
        let anchorLeft = null;

        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded') ||
                wrapper.classList.contains('is-molecule-filtered-out')) return;

            const rect = wrapper.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;

            const pageRect = this.adjustPageRect({
                left: rect.left + window.pageXOffset,
                top: rect.top + window.pageYOffset,
                width: rect.width,
                height: rect.height
            }, wrapper);

            minY = Math.min(minY, pageRect.top);
            maxY = Math.max(maxY, pageRect.top + pageRect.height);

            const col = wrapper.closest('.meso-grid-column, .micro-grid-column');
            if (col && col.dataset.toroidalColSlot === '0' && anchorLeft == null) {
                anchorLeft = pageRect.left;
            }
        });

        if (anchorLeft == null) {
            const firstCol = columns.find((col) => col.dataset.toroidalColSlot === '0') || columns[0];
            const firstWrapper = firstCol?.querySelector('.note-wrapper');
            if (firstWrapper) {
                const rect = firstWrapper.getBoundingClientRect();
                const pageRect = this.adjustPageRect({
                    left: rect.left + window.pageXOffset,
                    top: rect.top + window.pageYOffset,
                    width: rect.width,
                    height: rect.height
                }, firstWrapper);
                anchorLeft = pageRect.left;
                if (!Number.isFinite(minY)) {
                    minY = pageRect.top;
                    maxY = pageRect.top + pageRect.height;
                }
            }
        }

        if (anchorLeft == null || !Number.isFinite(minY)) return null;

        const minX = anchorLeft - pad;
        const width = columns.length * stepX + pad * 2;

        return {
            minX,
            maxX: minX + width,
            minY: minY - pad,
            maxY: maxY + pad
        };
    },

    cycleColumnForward() {
        const app = document.getElementById('app');
        const columns = this.getColumnElements();
        const step = this._columnStepX;
        if (!app || columns.length < 2 || step < 1) return false;

        app.appendChild(columns[0]);
        this._cycleCountX += 1;
        window.scrollBy({ left: -step, top: 0, behavior: 'auto' });
        this.onGridReordered();
        return true;
    },

    cycleColumnBackward() {
        const app = document.getElementById('app');
        const columns = this.getColumnElements();
        const step = this._columnStepX;
        if (!app || columns.length < 2 || step < 1) return false;

        app.insertBefore(columns[columns.length - 1], columns[0]);
        this._cycleCountX -= 1;
        window.scrollBy({ left: step, top: 0, behavior: 'auto' });
        this.onGridReordered();
        return true;
    },

    cycleRowForward() {
        const columns = this.getColumnElements();
        const step = this._rowStepY;
        if (!columns.length || step < 1) return false;

        columns.forEach((col) => {
            const first = col.querySelector(':scope > .note-wrapper');
            if (first) col.appendChild(first);
        });

        this._cycleCountY += 1;
        window.scrollBy({ left: 0, top: -step, behavior: 'auto' });
        this.onGridReordered();
        return true;
    },

    cycleRowBackward() {
        const columns = this.getColumnElements();
        const step = this._rowStepY;
        if (!columns.length || step < 1) return false;

        columns.forEach((col) => {
            const notes = col.querySelectorAll(':scope > .note-wrapper');
            if (notes.length) col.insertBefore(notes[notes.length - 1], notes[0]);
        });

        this._cycleCountY -= 1;
        window.scrollBy({ left: 0, top: step, behavior: 'auto' });
        this.onGridReordered();
        return true;
    },

    recycleGridAxes(panAttempt = null) {
        if (!this.usesGridCycle() || this._recycling) return false;

        this._recycling = true;
        let cycled = false;

        if (panAttempt) {
            const { dx, dy, movedX, movedY } = panAttempt;
            const axes = this.getAxes();
            if (axes.x && Math.abs(dx) > 0.5 && Math.abs(movedX) < 0.5 && this._columnStepX > 0) {
                if (dx > 0) cycled = this.cycleColumnBackward() || cycled;
                else cycled = this.cycleColumnForward() || cycled;
            }
            if (axes.y && Math.abs(dy) > 0.5 && Math.abs(movedY) < 0.5 && this._rowStepY > 0) {
                if (dy > 0) cycled = this.cycleRowBackward() || cycled;
                else cycled = this.cycleRowForward() || cycled;
            }
        }

        const axes = this.getAxes();
        let guard = 0;

        if (axes.x && this._columnStepX > 0) {
            while (guard++ < 2 && this.checkColumnViewportRecycle()) {
                cycled = true;
            }
        }

        if (axes.y && this._rowStepY > 0) {
            guard = 0;
            while (guard++ < 2 && this.checkRowViewportRecycle()) {
                cycled = true;
            }
        }

        this._recycling = false;
        return cycled;
    },

    checkColumnViewportRecycle() {
        const columns = this.getColumnElements();
        const step = this._columnStepX;
        if (columns.length < 2 || step < 1) return false;

        const first = columns[0].getBoundingClientRect();
        const last = columns[columns.length - 1].getBoundingClientRect();
        const exitPad = step * 0.15;

        if (first.right < -exitPad) {
            return this.cycleColumnForward();
        }

        if (last.left > window.innerWidth + exitPad) {
            return this.cycleColumnBackward();
        }

        return false;
    },

    checkRowViewportRecycle() {
        const columns = this.getColumnElements();
        const step = this._rowStepY;
        if (!columns.length || step < 1) return false;

        let topMost = Infinity;
        let bottomMost = -Infinity;

        columns.forEach((col) => {
            const notes = col.querySelectorAll(':scope > .note-wrapper');
            if (!notes.length) return;
            const first = notes[0].getBoundingClientRect();
            const last = notes[notes.length - 1].getBoundingClientRect();
            topMost = Math.min(topMost, first.top);
            bottomMost = Math.max(bottomMost, last.bottom);
        });

        if (!Number.isFinite(topMost)) return false;

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;
        const exitPad = step * 0.15;
        const viewBottom = window.innerHeight - reserve;

        if (topMost + step < -exitPad) {
            return this.cycleRowForward();
        }

        if (bottomMost > viewBottom + exitPad) {
            return this.cycleRowBackward();
        }

        return false;
    },

    measurePageContentBounds() {
        if (!this._contentBoundsDirty && this._contentBounds) return this._contentBounds;

        const app = document.getElementById('app');
        if (!app) {
            this._contentBounds = null;
            this._contentBoundsDirty = false;
            return null;
        }

        const pad = CONFIG.navigation.contentPadding || 0;
        const scrollX = this.getMapScrollX();
        const scrollY = this.getMapScrollY();
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let count = 0;

        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded') ||
                wrapper.classList.contains('is-molecule-filtered-out')) return;

            const rect = wrapper.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;

            minX = Math.min(minX, rect.left + window.pageXOffset);
            minY = Math.min(minY, rect.top + window.pageYOffset);
            maxX = Math.max(maxX, rect.right + window.pageXOffset);
            maxY = Math.max(maxY, rect.bottom + window.pageYOffset);
            count++;
        });

        if (!count || !Number.isFinite(minX)) {
            const rect = app.getBoundingClientRect();
            this._contentBounds = {
                minX: rect.left + window.pageXOffset,
                minY: rect.top + window.pageYOffset,
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height)
            };
        } else {
            this._contentBounds = {
                minX: minX - pad,
                minY: minY - pad,
                width: Math.max(1, (maxX - minX) + 2 * pad),
                height: Math.max(1, (maxY - minY) + 2 * pad)
            };
        }

        void scrollX;
        void scrollY;
        this._contentBoundsDirty = false;
        return this._contentBounds;
    },

    getScrollRange(axis = 'x') {
        const bounds = this.measurePageContentBounds();
        if (!bounds) return null;

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;

        if (axis === 'x') {
            const vw = window.innerWidth;
            if (bounds.width <= vw) return null;
            return {
                min: bounds.minX,
                max: bounds.minX + bounds.width - vw,
                period: bounds.width
            };
        }

        const vh = window.innerHeight - reserve;
        if (bounds.height <= vh) return null;
        return {
            min: bounds.minY,
            max: bounds.minY + bounds.height - vh,
            period: bounds.height
        };
    },

    getPeriod() {
        const bounds = this.measurePageContentBounds();
        if (!bounds) return { w: 0, h: 0 };
        return { w: bounds.width, h: bounds.height };
    },

    syncActiveState() {
        const shouldEnable = this.isEnabled();

        if (shouldEnable && !this._enabled) {
            this._enabled = true;
            this._cycleCountX = 0;
            this._cycleCountY = 0;
            this.invalidatePeriod();
            this.measureGridSteps();
            this.cacheCanonicalMapBounds();
            document.body.classList.add('is-toroidal-pan-active');
            return;
        }

        if (!shouldEnable && this._enabled) {
            this.destroy();
        }
    },

    destroy() {
        this._enabled = false;
        this._cycleCountX = 0;
        this._cycleCountY = 0;
        this._canonicalMapBounds = null;
        this._mapPeriodX = 0;
        this._mapPeriodY = 0;
        const app = document.getElementById('app');
        if (app) app.style.transform = '';
        document.body.classList.remove('is-toroidal-pan-active');
    },

    scrollByWrapped(dx, dy) {
        if (this._recycling || !this._enabled) return;

        const axes = this.getAxes();
        const beforeX = window.pageXOffset;
        const beforeY = window.pageYOffset;

        window.scrollBy({
            left: axes.x ? dx : 0,
            top: axes.y ? dy : 0,
            behavior: 'auto'
        });

        const movedX = window.pageXOffset - beforeX;
        const movedY = window.pageYOffset - beforeY;

        if (this.usesGridCycle()) {
            this.recycleGridAxes({
                dx: axes.x ? dx : 0,
                dy: axes.y ? dy : 0,
                movedX,
                movedY
            });
        }
    },

    applyPan(dx, dy) {
        if (!this.isActive()) return false;

        const cycleX = this._cycleCountX;
        const cycleY = this._cycleCountY;
        this.scrollByWrapped(dx, dy);

        if (this._cycleCountX === cycleX && this._cycleCountY === cycleY) {
            this.notifyMap(false);
        }
        return true;
    },

    wrapScrollPosition() {
        if (this._recycling || !this.isEnabled()) return;

        const cycleX = this._cycleCountX;
        const cycleY = this._cycleCountY;

        if (this.usesGridCycle()) {
            this.recycleGridAxes();
        }

        if (this._cycleCountX === cycleX && this._cycleCountY === cycleY) {
            this.notifyMap(false);
        }
    },

    centerOnContent(options = {}) {
        if (!this.isEnabled()) return false;

        this._cycleCountX = 0;
        this._cycleCountY = 0;
        this._canonicalMapBounds = null;
        this.invalidatePeriod();
        this.measureGridSteps();
        this.cacheCanonicalMapBounds();
        const bounds = this._canonicalMapBounds || this.measurePageContentBounds();
        if (!bounds) return false;

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;
        const targetX = bounds.minX + (bounds.maxX - bounds.minX) / 2 - window.innerWidth / 2;
        const targetY = bounds.minY + (bounds.maxY - bounds.minY) / 2 - (window.innerHeight - reserve) / 2;
        const dx = targetX - this.getMapScrollX();
        const dy = targetY - this.getMapScrollY();

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return true;

        SpatialNavigation.bypassScrollClamp(
            options.smooth ? CONFIG.warehouse.workspaceGrid.rushDuration + 450 : 120
        );

        window.scrollBy({
            left: dx,
            top: dy,
            behavior: options.smooth ? 'smooth' : 'auto'
        });

        if (options.smooth) {
            requestAnimationFrame(() => {
                this.wrapScrollPosition();
                requestAnimationFrame(() => this.finalizeMapLayout());
            });
        } else {
            this.recycleGridAxes();
            requestAnimationFrame(() => this.finalizeMapLayout());
        }

        if (typeof NavigationMap !== 'undefined') {
            NavigationMap._referenceBoundsDirty = true;
            NavigationMap.scheduleRender();
        }

        return true;
    },

    wrapMapScrollCoord(scroll, min, period) {
        if (!Number.isFinite(scroll) || !Number.isFinite(min) || !(period > 0)) return scroll;
        const offset = scroll - min;
        return min + ((offset % period) + period) % period;
    },

    wrapMapViewportScroll(scroll, bounds, period, viewportSize) {
        if (!bounds || !Number.isFinite(scroll) || !(viewportSize > 0)) {
            return scroll;
        }

        const min = bounds.min;
        const max = bounds.max;
        const maxScroll = max - viewportSize;
        if (maxScroll <= min) return min;
        if (scroll >= min && scroll <= maxScroll) return scroll;

        if (period > 0) {
            let wrapped = min + ((scroll - min) % period + period) % period;
            while (wrapped > maxScroll) wrapped -= period;
            while (wrapped < min) wrapped += period;
            if (wrapped >= min && wrapped <= maxScroll) return wrapped;
        }

        const span = Math.max(1, maxScroll - min + 1);
        return min + ((scroll - min) % span + span) % span;
    },

    cacheMapPeriods() {
        const columns = this.getColumnElements();
        this._mapPeriodX = columns.length > 0 && this._columnStepX > 0
            ? columns.length * this._columnStepX
            : 0;

        let periodY = 0;
        if (this._rowStepY > 0 && columns.length) {
            columns.forEach((col) => {
                const notes = [...col.querySelectorAll(':scope > .note-wrapper')].filter(
                    (wrapper) => wrapper.dataset.toroidalLogicalTop &&
                        !wrapper.classList.contains('is-layout-excluded')
                );
                if (notes.length < 2) return;

                let minTop = Infinity;
                let maxBottom = -Infinity;
                notes.forEach((wrapper) => {
                    const top = Number(wrapper.dataset.toroidalLogicalTop);
                    if (!Number.isFinite(top)) return;
                    const frame = wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                        || wrapper.querySelector('.meso-mock__frame')
                        || wrapper.querySelector('.depth-v2-glyph--micro .micro-mock__card')
                        || wrapper;
                    const height = frame.getBoundingClientRect().height;
                    minTop = Math.min(minTop, top);
                    maxBottom = Math.max(maxBottom, top + height);
                });

                if (Number.isFinite(minTop)) {
                    periodY = Math.max(periodY, maxBottom - minTop);
                }
            });
        }

        this._mapPeriodY = periodY > 0 ? periodY : 0;
    },

    getNavigationMapViewportPageRect() {
        let left = this.getMapScrollX();
        let top = this.getMapScrollY();
        const bounds = this._canonicalMapBounds;

        if (bounds) {
            if (this._mapPeriodX > 0) {
                left = this.wrapMapViewportScroll(
                    left,
                    { min: bounds.minX, max: bounds.maxX },
                    this._mapPeriodX,
                    window.innerWidth
                );
            }
            if (this._mapPeriodY > 0) {
                top = this.wrapMapViewportScroll(
                    top,
                    { min: bounds.minY, max: bounds.maxY },
                    this._mapPeriodY,
                    window.innerHeight
                );
            }
        }

        return {
            left,
            top,
            width: window.innerWidth,
            height: window.innerHeight
        };
    },

    getScrollAlignedMapBounds(forLevel) {
        void forLevel;
        if (this._canonicalMapBounds) {
            return { ...this._canonicalMapBounds };
        }

        const canonical = this.measureCanonicalGridBounds();
        if (canonical) {
            this._canonicalMapBounds = canonical;
            return { ...canonical };
        }

        const bounds = this.measurePageContentBounds();
        if (!bounds) return null;

        return {
            minX: bounds.minX,
            maxX: bounds.minX + bounds.width,
            minY: bounds.minY,
            maxY: bounds.minY + bounds.height
        };
    },

    onLayoutReady() {
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel < 2) {
            this.destroy();
            return;
        }

        this._cycleCountX = 0;
        this._cycleCountY = 0;
        this.invalidatePeriod();
        this.syncActiveState();

        if (this._enabled) {
            this.measureGridSteps();
            this.stampLogicalPositions();
            this.cacheCanonicalMapBounds();
            this.cacheMapPeriods();
            requestAnimationFrame(() => {
                this.stampLogicalPositions();
                this.cacheCanonicalMapBounds();
                this.cacheMapPeriods();
            });
        }
    },

    onLevelChange(level) {
        if (level < 2) {
            this.destroy();
            return;
        }
        this._cycleCountX = 0;
        this._cycleCountY = 0;
        this._canonicalMapBounds = null;
        this._mapPeriodX = 0;
        this._mapPeriodY = 0;
        this.clearLogicalPositions();
        this.invalidatePeriod();
        this.syncActiveState();
    }
};
