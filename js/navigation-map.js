/* ==========================================================================
   05b. SITE NAVIGATION — layer labels (top-right) + minimap (bottom-right)
   Two separate UI parts; see CONFIG.layerNavigation vs CONFIG.navigationMap.
   ========================================================================== */
const LAYER_NAV_SYMBOL_INLINE = {
    l1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" aria-hidden="true"><g id="icon"><path d="M67.23,33.46c9.32,9.32,9.32,24.44,0,33.77s-24.44,9.32-33.77,0l-20.7-20.7c-9.32-9.32-9.32-24.44,0-33.77,9.32-9.32,24.44-9.32,33.77,0l20.7,20.7Z" stroke="currentColor" stroke-width="2.8" fill="none" vector-effect="non-scaling-stroke"/><circle cx="29.65" cy="29.65" r="15.9" fill="currentColor"/><circle cx="50.35" cy="50.35" r="15.9" fill="currentColor"/></g></svg>`
};

const LAYER_NAV_SYMBOL_FETCH_CACHE = new Map();

function isLayerZoomOutBlocked(level = getSiteGridLevel()) {
    if (level !== 3) return false;
    return typeof NoteCensor !== 'undefined' && NoteCensor.blocksLayerZoomOut?.();
}

function getLayerNavToggleTarget(currentLevel) {
    const levels = getDepthActiveLevels();
    const other = levels.find((level) => level !== currentLevel);
    return other ?? currentLevel;
}

function getLayerNavSymbolInlineKey(targetLevel) {
    if (targetLevel === 1) return 'l1';
    return targetLevel;
}

function normalizeLayerNavSymbolMarkup(svgText) {
    if (!svgText) return '';
    const sanitized = svgText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const doc = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg || doc.querySelector('parsererror')) return '';

    svg.removeAttribute('id');
    svg.setAttribute('aria-hidden', 'true');
    svg.querySelectorAll('#guides, [id="guides"]').forEach((node) => node.remove());
    svg.querySelectorAll('style, defs, title, desc').forEach((node) => node.remove());
    svg.querySelectorAll('[fill]').forEach((node) => {
        const fill = node.getAttribute('fill');
        if (fill && fill !== 'none') node.setAttribute('fill', 'currentColor');
    });
    svg.querySelectorAll('rect, path, circle, ellipse, polygon').forEach((node) => {
        if (node.hasAttribute('fill')) return;
        const stroke = node.getAttribute('stroke');
        if (stroke && stroke !== 'none') return;
        node.setAttribute('fill', 'currentColor');
    });
    svg.querySelectorAll('[stroke]').forEach((node) => {
        const stroke = node.getAttribute('stroke');
        if (stroke && stroke !== 'none') node.setAttribute('stroke', 'currentColor');
    });

    return svg.outerHTML;
}

async function ensureLayerNavSymbolMarkup(symbolKey) {
    if (LAYER_NAV_SYMBOL_INLINE[symbolKey]) {
        return LAYER_NAV_SYMBOL_INLINE[symbolKey];
    }
    if (LAYER_NAV_SYMBOL_FETCH_CACHE.has(symbolKey)) {
        return LAYER_NAV_SYMBOL_FETCH_CACHE.get(symbolKey);
    }

    const src = CONFIG.layerNavigation?.symbols?.[symbolKey];
    const fallback = '';
    if (!src) return fallback;

    const promise = fetch(src)
        .then((res) => (res.ok ? res.text() : Promise.reject()))
        .then((text) => {
            const markup = normalizeLayerNavSymbolMarkup(text);
            if (markup) LAYER_NAV_SYMBOL_INLINE[symbolKey] = markup;
            return markup || fallback;
        })
        .catch(() => fallback);

    LAYER_NAV_SYMBOL_FETCH_CACHE.set(symbolKey, promise);
    return promise;
}

async function setLayerNavSymbolContent(symbolEl, symbolKey, targetLevel) {
    if (!symbolEl) return;
    symbolEl.dataset.layerSymbol = String(targetLevel ?? symbolKey);
    const markup = await ensureLayerNavSymbolMarkup(symbolKey);
    if (markup) symbolEl.innerHTML = markup;
}

function createLayerLabelElement(symbolKey, targetLevel) {
    const label = document.createElement('span');
    label.className = 'site-navigation-layers__label';

    const symbol = document.createElement('span');
    symbol.className = 'site-navigation-layers__label-symbol';
    symbol.dataset.layerSymbol = String(targetLevel ?? symbolKey);
    symbol.setAttribute('aria-hidden', 'true');
    label.appendChild(symbol);

    void setLayerNavSymbolContent(symbol, symbolKey, targetLevel);

    return label;
}

const NavigationMap = {
    layersPanel: null,
    mapsPanel: null,
    titles: new Map(),
    canvas: null,
    mapWrap: null,
    viewportMarker: null,
    ctx: null,
    _lastTransform: null,
    _renderScheduled: false,
    _rafId: null,
    _resizeObserver: null,
    _activeLevel: 1,
    _drag: null,
    _minMacroMapScale: null,
    _referenceMapScale: null,
    _contentDirty: true,
    _panTargetX: 0,
    _panTargetY: 0,
    _panDisplayX: 0,
    _panDisplayY: 0,
    _panScheduled: false,
    _baseTransform: null,
    _cachedContentBounds: null,
    _pendingBlockLayoutRender: false,
    _renderFocusState: null,
    _motionScheduled: false,
    _lastMotionTick: 0,
    _navDragActive: false,
    _bootComplete: false,
    _macroLoopTimer: null,
    _cachedReferenceBounds: null,
    _referenceBoundsDirty: true,
    _depthMapMarkers: null,
    _depthMapMarkersDirty: true,
    _resizeScheduled: false,
    _layoutSettleTimer: null,
    _viewportEchoSettleTimer: null,

    layerMarker: null,
    toggleButton: null,
    _layerMarkerLoaded: false,

    init() {
        const layerCfg = CONFIG.layerNavigation;
        const mapCfg = CONFIG.navigationMap;
        if (!layerCfg && !mapCfg) return;

        const root = document.documentElement;
        if (layerCfg?.rightInset) {
            root.style.setProperty('--layer-nav-right-inset', siteGridCssLength(layerCfg.rightInset));
        }
        if (layerCfg?.boxGap) {
            root.style.setProperty('--layer-nav-gap', siteGridCssLength(layerCfg.boxGap));
        }
        if (layerCfg?.boxPadding) {
            const pad = siteGridCssLength(layerCfg.boxPadding);
            root.style.setProperty('--layer-nav-box-pad', pad);
            root.style.setProperty('--layer-nav-box-pad-x', pad);
            root.style.setProperty('--layer-nav-box-pad-y', pad);
        }
        if (layerCfg?.boxRadius) {
            root.style.setProperty('--layer-nav-box-radius', siteGridCssLength(layerCfg.boxRadius));
        }
        if (layerCfg?.markerGap) {
            root.style.setProperty('--layer-nav-marker-gap', siteGridCssLength(layerCfg.markerGap));
        }
        if (layerCfg?.rowGap) {
            root.style.setProperty('--layer-nav-row-gap', siteGridCssLength(layerCfg.rowGap));
        }
        if (layerCfg?.symbolSizeActive) {
            root.style.setProperty('--layer-nav-symbol-size-active', siteGridCssLength(layerCfg.symbolSizeActive));
        }
        if (layerCfg?.symbolSizeInactive) {
            root.style.setProperty('--layer-nav-symbol-size-inactive', siteGridCssLength(layerCfg.symbolSizeInactive));
        }
        if (layerCfg?.slotMoveDuration != null) {
            root.style.setProperty('--layer-nav-slot-duration', `${layerCfg.slotMoveDuration}s`);
        }
        if (layerCfg?.slotMoveEasing) {
            root.style.setProperty('--layer-nav-slot-easing', layerCfg.slotMoveEasing);
        }
        if (layerCfg?.centerOnViewport) {
            root.style.setProperty(
                '--layer-nav-slot-base-top',
                'calc(50vh - 0.5 * var(--layer-nav-row-step))'
            );
        }
        if (layerCfg?.toggleMode && layerCfg?.toggleTopInset) {
            root.style.setProperty('--layer-nav-toggle-top', siteGridCssLength(layerCfg.toggleTopInset));
        }
        if (layerCfg?.toggleMode && layerCfg?.toggleBoxSize) {
            root.style.setProperty('--layer-nav-toggle-box-size', siteGridCssLength(layerCfg.toggleBoxSize));
        }
        if (layerCfg?.toggleMode && layerCfg?.toggleBoxPadding) {
            root.style.setProperty('--layer-nav-toggle-pad', siteGridCssLength(layerCfg.toggleBoxPadding));
        }
        if (layerCfg?.moleculeSymbolRotateDeg != null) {
            root.style.setProperty('--layer-nav-molecule-rotate', `${layerCfg.moleculeSymbolRotateDeg}deg`);
        }
        if (layerCfg?.moleculeSymbolScale != null) {
            root.style.setProperty('--layer-nav-molecule-scale', String(layerCfg.moleculeSymbolScale));
        }
        if (layerCfg?.blocksSymbolScale != null) {
            root.style.setProperty('--layer-nav-blocks-scale', String(layerCfg.blocksSymbolScale));
        }
        if (layerCfg?.moleculeSymbolNudgeY) {
            root.style.setProperty('--layer-nav-molecule-nudge-y', siteGridCssLength(layerCfg.moleculeSymbolNudgeY));
        }
        if (layerCfg?.hitAreaPadding) {
            root.style.setProperty('--layer-nav-hit-pad', siteGridCssLength(layerCfg.hitAreaPadding));
        }
        if (mapCfg?.offsetY) {
            const { value, unit } = mapCfg.offsetY;
            if (unit === 'cellH' || unit === 'rows') {
                root.style.setProperty(
                    '--navigation-map-offset-y',
                    `calc(${value} * var(--site-grid-cell-h))`
                );
            } else {
                root.style.setProperty('--navigation-map-offset-y', siteGridCssLength(mapCfg.offsetY));
            }
        }
        if (mapCfg?.viewportOutlineColor) {
            root.style.setProperty('--navigation-map-viewport-outline', mapCfg.viewportOutlineColor);
        }
        if (mapCfg?.viewportFillColor) {
            root.style.setProperty('--navigation-map-viewport-fill', mapCfg.viewportFillColor);
        }
        if (mapCfg?.viewportOutlineWidth != null) {
            root.style.setProperty('--navigation-map-viewport-outline-width', `${mapCfg.viewportOutlineWidth}px`);
        }
        if (mapCfg?.clipFrameScale != null) {
            root.style.setProperty('--navigation-map-clip-scale', String(mapCfg.clipFrameScale));
        }
        if (mapCfg?.clipEdgeFadePct != null) {
            root.style.setProperty('--navigation-map-edge-fade', `${mapCfg.clipEdgeFadePct}%`);
        }

        const layersPanel = document.createElement('nav');
        layersPanel.id = 'site-navigation-layers';
        layersPanel.className = 'site-navigation-layers';
        layersPanel.dataset.siteLayer = 'navigationLayers';
        layersPanel.setAttribute('dir', 'rtl');
        layersPanel.setAttribute('aria-label', 'שכבות עומק');
        layersPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
        layersPanel.addEventListener('click', (e) => e.stopPropagation());

        const mapEnabled = typeof isWarehouseLauncherMapEnabled === 'function'
            ? isWarehouseLauncherMapEnabled()
            : true;

        let mapsPanel = null;
        let mapWrap = null;
        let canvas = null;
        let viewportMarker = null;

        if (mapEnabled) {
            mapsPanel = document.createElement('aside');
            mapsPanel.id = 'site-navigation-maps';
            mapsPanel.className = 'site-navigation-maps';
            mapsPanel.dataset.siteLayer = 'navigationMaps';
            mapsPanel.setAttribute('aria-label', 'מפת ניווט');

            mapWrap = document.createElement('div');
            mapWrap.className = 'site-navigation-maps__map-wrap';

            canvas = document.createElement('canvas');
            canvas.className = 'site-navigation-maps__map';
            canvas.setAttribute('aria-hidden', 'true');

            viewportMarker = document.createElement('div');
            viewportMarker.className = 'site-navigation-maps__viewport-marker is-hidden';
            viewportMarker.setAttribute('aria-hidden', 'true');

            mapWrap.appendChild(canvas);
            mapWrap.appendChild(viewportMarker);
            mapsPanel.appendChild(mapWrap);
        }

        const layerLevels = getDepthActiveLevels();
        const toggleMode = CONFIG.layerNavigation?.toggleMode !== false;

        if (toggleMode) {
            layersPanel.classList.add('site-navigation-layers--toggle');
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'site-navigation-layers__title site-navigation-layers__toggle';
            const currentLevel = DepthController.currentLevel || layerLevels[0] || 1;
            const targetLevel = getLayerNavToggleTarget(currentLevel);
            toggleBtn.dataset.targetLevel = String(targetLevel);
            toggleBtn.setAttribute(
                'aria-label',
                layerCfg?.labels?.[targetLevel] || `L${targetLevel}`
            );
            toggleBtn.appendChild(
                createLayerLabelElement(getLayerNavSymbolInlineKey(targetLevel), targetLevel)
            );
            toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = Number(toggleBtn.dataset.targetLevel);
                this.navigateToLayer(target);
            });
            layersPanel.appendChild(toggleBtn);
            this.toggleButton = toggleBtn;
        } else {
            layerLevels.forEach((level) => {
                const title = document.createElement('button');
                title.type = 'button';
                title.className = 'site-navigation-layers__title';
                title.dataset.level = String(level);
                title.setAttribute('aria-label', layerCfg?.labels?.[level] || `L${level}`);
                title.appendChild(
                    createLayerLabelElement(getLayerNavSymbolInlineKey(level), level)
                );
                title.addEventListener('pointerdown', (e) => e.stopPropagation());
                title.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.navigateToLayer(level);
                });
                layersPanel.appendChild(title);
                this.titles.set(level, title);
            });

            this.layerMarker = document.createElement('span');
            this.layerMarker.className = 'site-navigation-layers__marker';
            this.layerMarker.setAttribute('aria-hidden', 'true');
            this.layerMarker.dataset.level = String(DepthController.currentLevel || 1);
            this._loadLayerMarker(layerCfg?.markerSrc || 'assets/ui/layer-nav-marker.svg');
            layersPanel.appendChild(this.layerMarker);
        }

        if (mapWrap) {
            mapWrap.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
            mapWrap.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        }

        document.body.appendChild(layersPanel);

        if (mapsPanel) {
            const launcherMapMount = document.getElementById('warehouse-launcher-map-mount');
            const mapMount = document.getElementById('warehouse-map-mount');
            if (launcherMapMount) {
                mapsPanel.classList.add('site-navigation-maps--launcher');
                launcherMapMount.appendChild(mapsPanel);
                launcherMapMount.removeAttribute('aria-hidden');
            } else if (mapMount) {
                mapMount.appendChild(mapsPanel);
                mapMount.removeAttribute('aria-hidden');
            } else {
                document.body.appendChild(mapsPanel);
            }
        }
        document.body.classList.add('has-site-navigation');

        this.layersPanel = layersPanel;
        this.mapsPanel = mapsPanel;
        this.mapWrap = mapWrap;
        this.viewportMarker = viewportMarker;
        this.canvas = canvas;
        this._activeLevel = DepthController.currentLevel;

        if (mapsPanel) {
            window.addEventListener('scroll', () => this.schedulePanUpdate(), { passive: true });
            window.addEventListener('resize', () => {
                this.syncLayerNavMetrics();
                if (!this.isMapReady()) return;
                this._contentDirty = true;
                this.scheduleRender();
            });

            this._resizeObserver = new ResizeObserver(() => {
                if (this._resizeScheduled) return;
                this._resizeScheduled = true;
                requestAnimationFrame(() => {
                    this._resizeScheduled = false;
                    this._contentDirty = true;
                    this._referenceBoundsDirty = true;
                    this._depthMapMarkersDirty = true;
                    this.resizeCanvas();
                    if (this.isMapReady()) {
                        this.scheduleRender();
                    }
                });
            });
            this._resizeObserver.observe(mapsPanel);

            this.resizeCanvas();
        }

        this.syncActiveState(this._activeLevel);
        document.fonts?.ready?.then(() => this.syncLayerNavMetrics());
        requestAnimationFrame(() => this.syncLayerNavMetrics());
    },

    isMapReady() {
        return !!this.mapsPanel && this._bootComplete === true;
    },

    isLauncherEmbed() {
        return !!this.mapsPanel?.closest('.warehouse-launcher-map-mount');
    },

    onBootComplete() {
        if (this._bootComplete) return;
        this._bootComplete = true;
        this._referenceBoundsDirty = true;
        this._depthMapMarkersDirty = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.scheduleRender();
                this.syncMacroLoop();
            });
        });
    },

    needsPeriodicMapRefresh(blockActive = false) {
        return blockActive;
    },

    stopMacroLoop() {
        if (this._macroLoopTimer != null) {
            clearTimeout(this._macroLoopTimer);
            this._macroLoopTimer = null;
        }
        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    syncMacroLoop() {
        this.stopMacroLoop();
        if (!this.isMapReady() || !this.needsPeriodicMapRefresh()) return;

        const blockActive = typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount?.() > 0;
        const intervalMs = this.getMapRefreshIntervalMs(blockActive);
        if (intervalMs <= 0) return;

        const tick = () => {
            this._macroLoopTimer = null;
            if (!this.isMapReady() || this.isInteractionBlocked()) {
                this.syncMacroLoop();
                return;
            }
            const active = typeof ActionWarehouse !== 'undefined' &&
                ActionWarehouse.getActiveBlockCount?.() > 0;
            if (!this.needsPeriodicMapRefresh(active)) {
                return;
            }

            this._contentDirty = true;
            try {
                this.scheduleRender();
            } catch (err) {
                console.warn('NavigationMap.render failed:', err);
            }
            this.syncMacroLoop();
        };

        this._macroLoopTimer = setTimeout(tick, intervalMs);
    },

    onLevelChange(level) {
        this._activeLevel = level;
        this._contentDirty = true;
        this._cachedContentBounds = null;
        this._referenceBoundsDirty = true;
        this._depthMapMarkersDirty = true;
        if (level === 1) {
            this._minMacroMapScale = null;
            clearTimeout(this._layoutSettleTimer);
            this._layoutSettleTimer = null;
        } else {
            this._referenceMapScale = null;
            this.scheduleDepthLayoutSettle(level);
        }
        this._navDragActive = false;
        this._pendingBlockLayoutRender = false;
        this.syncActiveState(level);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.scheduleRender();
                this.syncMacroLoop();
            });
        });
    },

    onBlockLayoutChanged() {
        this._contentDirty = true;
        this._cachedContentBounds = null;
        this._referenceBoundsDirty = true;
        this._depthMapMarkersDirty = true;
        const blockActive = typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount?.() > 0;
        if (!blockActive) {
            this._minMacroMapScale = null;
        }
        if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.dragState) {
            // Defer bounds/transform recalc during drag; still show live block motion.
            this._pendingBlockLayoutRender = true;
            this.scheduleMotionRender();
            return;
        }
        this.scheduleRender();
        this.syncMacroLoop();
    },

    flushPendingBlockLayoutRender() {
        if (!this._pendingBlockLayoutRender && !this._contentDirty) return;
        this._pendingBlockLayoutRender = false;
        this._contentDirty = true;
        this.scheduleRender();
        this.syncMacroLoop();
    },

    notifyPhysicsTick() {
        this.notifyMapRefreshTick(true);
    },

    notifyTransitionTick() {
        if (!this.isMapReady()) return;
        this._depthMapMarkersDirty = true;
        this._contentDirty = true;
        this.scheduleRender();
        this.schedulePanUpdate();
    },

    notifyMapRefreshTick(fromPhysics = false) {
        if (!this.isMapReady()) return;
        if (this._activeLevel < 1 || this._activeLevel > 3 || this.isMapPaintBlocked()) return;
        const blockActive = typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount?.() > 0;
        if (this._activeLevel === 1 && !blockActive) return;
        if (this._activeLevel >= 2 && !blockActive) return;

        const minMs = this.getMapRefreshIntervalMs(blockActive);
        const now = performance.now();
        if (now - this._lastMotionTick < minMs) return;
        this._lastMotionTick = now;
        if (this._activeLevel === 1) {
            this._referenceBoundsDirty = true;
        }
        this._contentDirty = true;
        this.scheduleRender();
        this.syncMacroLoop();
    },

    getMapRefreshIntervalMs(blockActive = false) {
        const style = this.getMapStyle();
        const level = this._activeLevel;
        if (level === 2) {
            return blockActive
                ? (style.mesoRefreshMsBlock ?? style.macroRefreshMsBlock ?? 80)
                : (style.mesoRefreshMs ?? 1500);
        }
        if (level === 3) {
            return blockActive
                ? (style.microRefreshMsBlock ?? style.macroRefreshMsBlock ?? 80)
                : (style.microRefreshMs ?? 1500);
        }
        return blockActive
            ? (style.macroRefreshMsBlock ?? 80)
            : 0;
    },

    shouldRunMapRefreshLoop() {
        return this.isMapReady() && this.needsPeriodicMapRefresh();
    },

    scheduleMotionRender() {
        if (this._motionScheduled) return;
        this._motionScheduled = true;
        requestAnimationFrame(() => {
            this._motionScheduled = false;
            this.renderMotion();
        });
    },

    renderMotion() {
        if (!this.isMapReady() || !this.canvas || !this.ctx || !this.shouldRunMapRefreshLoop()) return;
        if (this._pendingBlockLayoutRender && this._baseTransform) {
            this._renderFocusState = null;
            this.drawMapContent(this.ctx, this._baseTransform, this._activeLevel);
            this.updatePanFromViewport();
            return;
        }
        if (this._contentDirty) {
            this.scheduleRender();
        }
    },

    markContentDirty() {
        this._contentDirty = true;
        this._depthMapMarkersDirty = true;
    },

    notifyDepthLayoutReady() {
        if (!this.isMapReady() || this._activeLevel < 2) return;
        this._depthMapMarkersDirty = true;
        this._contentDirty = true;
        this._referenceBoundsDirty = true;
        this.scheduleRender();
    },

    scheduleDepthLayoutSettle(level) {
        if (level < 2) return;
        clearTimeout(this._layoutSettleTimer);
        const ms = this.getMapStyle().depthMapLayoutSettleMs ?? 480;
        this._layoutSettleTimer = setTimeout(() => {
            this._layoutSettleTimer = null;
            if (this._activeLevel !== level) return;
            this.notifyDepthLayoutReady();
        }, ms);
    },

    resolveDepthMapCellSize(level) {
        const root = document.documentElement;
        const style = getComputedStyle(root);
        if (level === 2) {
            let w = parseFloat(style.getPropertyValue('--catalog-cell-w-meso'));
            let h = parseFloat(style.getPropertyValue('--catalog-cell-h-meso'));
            if (!Number.isFinite(w) || w < 1) {
                w = parseFloat(style.getPropertyValue('--v2-hive-cell-width')) || scale(86);
            }
            if (!Number.isFinite(h) || h < 1) {
                h = parseFloat(style.getPropertyValue('--v2-hive-cell-height')) || scale(100);
            }
            return { width: w, height: h };
        }
        let w = parseFloat(style.getPropertyValue('--catalog-cell-w'));
        let h = parseFloat(style.getPropertyValue('--catalog-cell-h'));
        if (!Number.isFinite(w) || w < 1) {
            w = scale(CONFIG.depth?.catalogLayout?.cellWidth || 120);
        }
        if (!Number.isFinite(h) || h < 1) {
            h = scale(CONFIG.depth?.catalogLayout?.cellHeight || 140);
        }
        return { width: w, height: h };
    },

    buildMapPageRectFromMarker(marker, level) {
        const cell = this.resolveDepthMapCellSize(level);
        let w;
        let h;
        if (level === 2) {
            w = Math.min(Math.max(marker.pageRect.width, cell.width * 0.45), cell.width);
            h = Math.min(Math.max(marker.pageRect.height, cell.height * 0.35), cell.height * 1.85);
        } else {
            w = Math.min(Math.max(marker.pageRect.width, cell.width * 0.4), cell.width);
            h = Math.min(Math.max(marker.pageRect.height, cell.height * 0.35), cell.height);
        }
        return this.scaleMapPageRect({
            left: marker.x - w / 2,
            top: marker.y - h / 2,
            width: w,
            height: h
        }, this.getLevelGlyphScale(level));
    },

    getActiveMapWrapperSelector(level = this._activeLevel) {
        const app = document.getElementById('app');
        if (!app) return '#app .note-wrapper';
        if (level === 2 && app.classList.contains('is-meso-column-layout')) {
            return '#app > .meso-grid-column .note-wrapper';
        }
        if (level === 3 && app.classList.contains('is-micro-grid-layout')) {
            return '#app > .micro-grid-column .note-wrapper';
        }
        if (level === 2 && app.classList.contains('is-meso-hive-layout')) {
            return '#app .note-wrapper.is-meso-hive-anchored';
        }
        return '#app .note-wrapper';
    },

    isMapWrapperEligible(wrapper) {
        if (!wrapper) return false;
        if (wrapper.classList.contains('is-layout-excluded')) return false;
        if (wrapper.classList.contains('is-molecule-filtered-out')) return false;
        const rect = wrapper.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1;
    },

    getActiveDepthMapBounds() {
        if (this._activeLevel >= 2) {
            const markerBounds = this.getDepthMapMarkerBounds();
            if (markerBounds) return markerBounds;
        }
        return SpatialNavigation.getAppBounds();
    },

    getDepthMapMarkerPageRect(wrapper) {
        if (!wrapper) return null;

        if (this._activeLevel === 3) {
            const style = this.getMapStyle();
            if (style.microMapDetailed === true) {
                const card = wrapper.querySelector('.micro-mock__card.note-card')
                    || wrapper.querySelector('.note-stage .layer-full .note-card')
                    || wrapper.querySelector('.depth-v2-glyph--micro .note-card');
                return this.pageRectFromElement(card || wrapper);
            }
        }

        if (this._activeLevel === 2) {
            const style = this.getMapStyle();
            const frame = wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                || wrapper.querySelector('.meso-mock__frame');
            if (frame && style.mesoMapUseFrameRects === true) {
                return this.pageRectFromElement(frame);
            }
            if (frame) {
                let minX = Infinity;
                let maxX = -Infinity;
                let minY = Infinity;
                let maxY = -Infinity;
                frame.querySelectorAll('.meso-mock__line, .meso-mock__rect').forEach((lineEl) => {
                    const pageRect = this.pageRectFromElement(lineEl);
                    if (!pageRect) return;
                    minX = Math.min(minX, pageRect.left);
                    maxX = Math.max(maxX, pageRect.left + pageRect.width);
                    minY = Math.min(minY, pageRect.top);
                    maxY = Math.max(maxY, pageRect.top + pageRect.height);
                });
                if (Number.isFinite(minX)) {
                    return {
                        left: minX,
                        top: minY,
                        width: maxX - minX,
                        height: maxY - minY
                    };
                }
            }
            const host = wrapper.querySelector('.meso-silhouette')
                || wrapper.querySelector('.depth-v2-glyph--meso');
            return this.pageRectFromElement(host || wrapper);
        }

        return this.pageRectFromElement(wrapper);
    },

    getDepthMapMarkerBounds() {
        const style = this.getMapStyle();
        const pad = Math.max(0, style.depthMapBoundsPad ?? 32);
        const selector = this.getActiveMapWrapperSelector();
        const wrappers = [...document.querySelectorAll(selector)].filter((wrapper) =>
            this.isMapWrapperEligible(wrapper));

        if (!wrappers.length) return null;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        wrappers.forEach((wrapper) => {
            const pageRect = this.getDepthMapMarkerPageRect(wrapper);
            if (!pageRect) return;
            minX = Math.min(minX, pageRect.left);
            maxX = Math.max(maxX, pageRect.left + pageRect.width);
            minY = Math.min(minY, pageRect.top);
            maxY = Math.max(maxY, pageRect.top + pageRect.height);
        });

        if (!Number.isFinite(minX)) return null;

        return {
            minX: minX - pad,
            maxX: maxX + pad,
            minY: minY - pad,
            maxY: maxY + pad
        };
    },

    collectDepthMapMarkers() {
        if (this._depthMapMarkers && !this._depthMapMarkersDirty) {
            return this._depthMapMarkers;
        }

        const style = this.getMapStyle();
        const maxCollect = this._activeLevel === 1 && style.macroMapUseLayerDots === true
            ? Math.max(1, style.macroMapMaxDots ?? 900)
            : this._activeLevel === 2 && style.mesoMapUseFrameRects === true
                ? Math.max(1, style.mesoMapMaxFrameRects ?? style.depthMapMaxCollect ?? 320)
                : this._activeLevel === 3
                    ? Math.max(1, style.microMapMaxCards ?? Math.max(style.depthMapMaxCollect ?? 320, 512))
                    : Math.max(1, style.depthMapMaxCollect ?? 320);
        const markers = [];
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const selector = this.getActiveMapWrapperSelector();

        document.querySelectorAll(selector).forEach((wrapper) => {
            if (markers.length >= maxCollect) return;
            if (!this.isMapWrapperEligible(wrapper)) return;
            const noteIndex = this.getWrapperNoteIndex(wrapper);
            if (noteIndex < 0) return;
            const noteItem = typeof AppState !== 'undefined' ? AppState.items?.[noteIndex] : null;
            const noteId = wrapper.dataset.noteId || noteItem?.id || '';

            if (this._activeLevel === 1 && style.macroMapUseLayerDots === true) {
                wrapper.querySelectorAll('.layer-dot').forEach((dot) => {
                    if (markers.length >= maxCollect) return;
                    const rect = dot.getBoundingClientRect();
                    if (rect.width < 0.5 || rect.height < 0.5) return;
                    const left = rect.left + scrollX;
                    const top = rect.top + scrollY;
                    markers.push({
                        noteIndex,
                        noteId,
                        x: left + rect.width / 2,
                        y: top + rect.height / 2,
                        pageRect: {
                            left,
                            top,
                            width: rect.width,
                            height: rect.height
                        }
                    });
                });
                return;
            }

            if (this._activeLevel === 2 && style.mesoMapUseFrameRects === true) {
                const frame = wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                    || wrapper.querySelector('.meso-mock__frame')
                    || wrapper.querySelector('.meso-silhouette')
                    || wrapper.querySelector('.depth-v2-glyph--meso');
                const rect = frame?.getBoundingClientRect();
                if (rect && rect.width >= 0.5 && rect.height >= 0.5) {
                    const left = rect.left + scrollX;
                    const top = rect.top + scrollY;
                    markers.push({
                        noteIndex,
                        noteId,
                        isMesoFrameRect: true,
                        sourceElement: frame,
                        x: left + rect.width / 2,
                        y: top + rect.height / 2,
                        pageRect: {
                            left,
                            top,
                            width: rect.width,
                            height: rect.height
                        }
                    });
                    return;
                }
            }

            const rect = wrapper.getBoundingClientRect();
            const left = rect.left + scrollX;
            const top = rect.top + scrollY;
            markers.push({
                noteIndex,
                noteId,
                x: left + rect.width / 2,
                y: top + rect.height / 2,
                pageRect: {
                    left,
                    top,
                    width: rect.width,
                    height: rect.height
                }
            });
        });

        this._depthMapMarkers = markers;
        this._depthMapMarkersDirty = false;
        return markers;
    },

    drawDepthMapMarkers(ctx, t, level) {
        const style = this.getMapStyle();
        const defaultFill = level === 3
            ? (style.noteCardFill ?? 'rgba(16, 16, 16, 0.62)')
            : level === 1
                ? (style.macroDotFill ?? 'rgba(16, 16, 16, 0.4)')
                : (style.mesoLineFill ?? 'rgba(16, 16, 16, 0.62)');
        const mutedFill = level === 3
            ? (style.noteCardMutedFill ?? 'rgba(16, 16, 16, 0.14)')
            : level === 1
                ? (style.macroDotMutedFill ?? 'rgba(16, 16, 16, 0.12)')
                : (style.mesoLineMutedFill ?? 'rgba(16, 16, 16, 0.14)');
        const focus = level === 1 && !this.shouldUseMacroFocusDetails(style)
            ? { active: false, tags: new Set(), authors: new Set(), blocks: [] }
            : this.getBlockFocusState();
        const glyphScale = this.getLevelGlyphScale(level);
        const markers = this.collectDepthMapMarkers();

        if (level === 1) {
            const radius = (style.macroDotRadius ?? 1.5) * glyphScale;
            markers.forEach((marker) => {
                const { noteIndex, x, y } = marker;
                const matchBlock = focus.active
                    ? this.findMatchingBlockForNote(noteIndex, focus.blocks)
                    : null;
                const fill = matchBlock?.color || (focus.active ? mutedFill : defaultFill);
                const p = t.toMap(x, y);
                ctx.fillStyle = fill;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                ctx.fill();
                if (focus.active && matchBlock && style.macroFocusConnectors === true) {
                    this.drawFocusConnector(ctx, t, { x, y }, matchBlock);
                }
            });
            if (style.macroBlockMarkers !== false && focus.blocks.length) {
                this.drawActiveBlocks(ctx, t, focus.blocks);
            }
            return;
        }

        markers.forEach((marker) => {
            const { noteIndex, x, y } = marker;
            const focusColor = focus.active
                ? this.resolveNoteFocusColor(noteIndex, null, focus.blocks)
                : null;
            const frameFill = level === 2 && marker.isMesoFrameRect
                ? (style.mesoFrameFill ?? defaultFill)
                : defaultFill;
            const frameMutedFill = level === 2 && marker.isMesoFrameRect
                ? (style.mesoFrameMutedFill ?? mutedFill)
                : mutedFill;
            const fill = focusColor || (focus.active ? frameMutedFill : frameFill);
            const pageRect = marker.isMesoFrameRect
                ? marker.pageRect
                : this.scaleMapPageRect(marker.pageRect, glyphScale);
            const drewMesoDetail = level === 2 &&
                marker.isMesoFrameRect &&
                style.mesoMapSilhouetteDetail === true &&
                this.drawMesoFrameDetailMarker(
                    ctx,
                    t,
                    marker,
                    style.mesoSilhouetteDetailFill ?? fill,
                    style.mesoFrameDetailBaseFill ?? frameMutedFill
                );
            if (!drewMesoDetail) {
                if (level === 3) {
                    this.drawMapPageRectWithInset(
                        ctx,
                        t,
                        pageRect,
                        fill,
                        Math.max(0, style.microMapCardInsetPx ?? 0)
                    );
                } else {
                    this.drawMapPageRect(ctx, t, pageRect, fill);
                }
            }

            if (focus.active) {
                const matchBlock = this.findPrimaryBlockForNote(noteIndex, null, focus.blocks);
                if (matchBlock) {
                    this.drawFocusConnector(ctx, t, { x, y }, matchBlock);
                }
            }
        });

        if (focus.blocks.length) {
            this.drawActiveBlocks(ctx, t, focus.blocks);
        }
    },

    getMapContentOffset() {
        const t = this._baseTransform;
        if (!t) return { x: 0, y: 0 };
        // Fixed marker: pan is CSS-only on the canvas — do not add to toMap offset.
        if (this.usesFixedViewportMarker()) {
            return { x: t.baseOffsetX, y: t.baseOffsetY };
        }
        return {
            x: t.baseOffsetX + this._panDisplayX,
            y: t.baseOffsetY + this._panDisplayY
        };
    },

    getEffectiveTransform() {
        if (!this._baseTransform?.contentBounds) return null;

        const t = this._baseTransform;
        const panBounds = t.panBounds || t.contentBounds;
        const { x: offsetX, y: offsetY } = this.getMapContentOffset();

        return {
            ...t,
            offsetX,
            offsetY,
            toMap: (pageX, pageY) => ({
                x: offsetX + (pageX - panBounds.minX) * (t.scaleX ?? t.scale),
                y: offsetY + (pageY - panBounds.minY) * (t.scaleY ?? t.scale)
            })
        };
    },

    schedulePanUpdate() {
        if (!this.isMapReady()) return;
        if (this._panScheduled) return;
        this._panScheduled = true;
        requestAnimationFrame(() => {
            this._panScheduled = false;
            this.updatePanFromViewport();
        });
    },

    computeContainScale(worldW, worldH, innerW, innerH) {
        return Math.min(
            innerW / Math.max(1, worldW),
            innerH / Math.max(1, worldH)
        );
    },

    getMacroMapStableBounds() {
        const appBounds = SpatialNavigation.getAppBounds();
        if (!appBounds) return null;

        if (typeof PhysicsEngine === 'undefined' || !PhysicsEngine.bodiesData?.length) {
            return appBounds;
        }

        const orbitCfg = CONFIG.warehouse.orbit;
        const bodiesData = PhysicsEngine.bodiesData;
        const groups = this.collectMacroNoteGroups(bodiesData, { stablePositions: true });

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        groups.forEach(({ x, y, dotCount, sample }) => {
            const radius = ActionWarehouse.noteMoleculeExtent(
                bodiesData,
                sample.noteIndex,
                orbitCfg,
                dotCount
            );
            minX = Math.min(minX, x - radius);
            maxX = Math.max(maxX, x + radius);
            minY = Math.min(minY, y - radius);
            maxY = Math.max(maxY, y + radius);
        });

        if (!Number.isFinite(minX)) return appBounds;
        return SpatialNavigation.mergeBounds(appBounds, { minX, maxX, minY, maxY });
    },

    collectMacroNoteGroups(bodiesData, options = {}) {
        const stablePositions = options.stablePositions === true;
        const groups = new Map();

        bodiesData.forEach((item) => {
            if (item.isFiltered || !item.body) return;
            if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
            groups.get(item.noteIndex).push(item);
        });

        const notes = [];
        groups.forEach((dots) => {
            let cx = 0;
            let cy = 0;
            dots.forEach((item) => {
                if (stablePositions) {
                    cx += item.physicsTargetX ?? item.cssOriginX ?? item.body.position.x;
                    cy += item.physicsTargetY ?? item.cssOriginY ?? item.body.position.y;
                } else {
                    cx += item.body.position.x;
                    cy += item.body.position.y;
                }
            });
            notes.push({
                sample: dots[0],
                x: cx / dots.length,
                y: cy / dots.length,
                dotCount: dots.length
            });
        });

        return notes;
    },

    getEffectiveMacroDotStride(noteCount, style) {
        const baseStride = Math.max(1, style.macroDotStride ?? 1);
        const blockActive = typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount?.() > 0;
        if (blockActive && this.shouldUseMacroFocusDetails(style)) return 1;
        if (!blockActive || noteCount <= 180) return baseStride;
        return Math.max(baseStride, Math.ceil(noteCount / 180));
    },

    isNoteFocusedForMap(sample, focus) {
        if (!focus?.active || !sample) return false;
        return !!this.findMatchingBlockForNote(sample.noteIndex, focus.blocks);
    },

    getMapViewportMarkerRect() {
        return SpatialNavigation.getNavigationMapViewportPageRect?.(this._activeLevel)
            || SpatialNavigation.getViewportPageRect(this._activeLevel);
    },

    getMapDrawBounds() {
        if (this._activeLevel >= 2) {
            const markerBounds = this.getActiveDepthMapBounds();
            if (markerBounds) return markerBounds;
            return SpatialNavigation.getAppBounds();
        }
        return SpatialNavigation.getMapReferenceBounds() || SpatialNavigation.getAppBounds();
    },

    getMapPanBounds() {
        return SpatialNavigation.getScrollAlignedMapBounds(this._activeLevel);
    },

    getMapFrameBounds() {
        const panBounds = this.getMapPanBounds();
        const drawBounds = this.getMapDrawBounds();
        if (!drawBounds) return panBounds;
        if (!panBounds) return drawBounds;
        return SpatialNavigation.mergeBounds(drawBounds, panBounds);
    },

    getMapContentBounds() {
        if (this._cachedReferenceBounds && !this._referenceBoundsDirty) {
            return this._cachedReferenceBounds;
        }

        let bounds;
        if (this._activeLevel === 1) {
            bounds = SpatialNavigation.getMapReferenceBounds() || SpatialNavigation.getAppBounds();
        } else {
            bounds = this.getMapFrameBounds();
        }

        if (bounds) {
            this._cachedReferenceBounds = bounds;
            this._referenceBoundsDirty = false;
        }
        return bounds;
    },

    computeFollowPan(base, panBounds, viewport, scale) {
        if (!base || !panBounds || !viewport) return { panX: 0, panY: 0 };

        const vpCenterX = viewport.left + viewport.width / 2;
        const vpCenterY = viewport.top + viewport.height / 2;
        let followX = base.anchorX - (vpCenterX - panBounds.minX) * scale;
        let followY = base.anchorY - (vpCenterY - panBounds.minY) * scale;

        if (this.getMapStyle().viewportFollowClamp !== false) {
            const scrollPan = this.getScrollPanLimits(base, panBounds, scale, viewport);
            if (scrollPan) {
                followX = Math.max(scrollPan.minOffX, Math.min(scrollPan.maxOffX, followX));
                followY = Math.max(scrollPan.minOffY, Math.min(scrollPan.maxOffY, followY));
            }
        }

        return {
            panX: followX - base.baseOffsetX,
            panY: followY - base.baseOffsetY
        };
    },

    getScrollPanLimits(base, panBounds, scale, viewport) {
        if (!base || !panBounds || !viewport) return null;

        const vpW = viewport.width;
        const vpH = viewport.height;
        const corners = [
            { left: panBounds.minX, top: panBounds.minY },
            { left: panBounds.maxX - vpW, top: panBounds.minY },
            { left: panBounds.minX, top: panBounds.maxY - vpH },
            { left: panBounds.maxX - vpW, top: panBounds.maxY - vpH }
        ];

        let minOffX = Infinity;
        let maxOffX = -Infinity;
        let minOffY = Infinity;
        let maxOffY = -Infinity;

        corners.forEach(({ left, top }) => {
            const vpCenterX = left + vpW / 2;
            const vpCenterY = top + vpH / 2;
            const offX = base.anchorX - (vpCenterX - panBounds.minX) * scale;
            const offY = base.anchorY - (vpCenterY - panBounds.minY) * scale;
            minOffX = Math.min(minOffX, offX);
            maxOffX = Math.max(maxOffX, offX);
            minOffY = Math.min(minOffY, offY);
            maxOffY = Math.max(maxOffY, offY);
        });

        if (!Number.isFinite(minOffX)) return null;
        return { minOffX, maxOffX, minOffY, maxOffY };
    },

    applyReferenceMapScale(scale, fromSharedReference = false) {
        const style = this.getMapStyle();
        const useShared = style.sharedReferenceScale !== false;

        if (this._activeLevel === 1 && useShared) {
            if (!fromSharedReference) {
                this._referenceMapScale = scale;
            }
            return scale;
        }

        if (this._activeLevel >= 2) {
            if (!fromSharedReference) {
                this._referenceMapScale = scale;
            }
            return scale;
        }

        if (!useShared) {
            if (this._activeLevel === 1 && !fromSharedReference) {
                this._referenceMapScale = scale;
            }
            return scale;
        }

        if (this._referenceMapScale != null) {
            return this._referenceMapScale;
        }

        if (!fromSharedReference) {
            this._referenceMapScale = scale;
        }
        return scale;
    },

    getMapOverscan() {
        const style = this.getMapStyle();
        const level = this._activeLevel;
        const levelOs = style.levelMapOverscan?.[level] ?? style.levelMapOverscan?.[String(level)];
        if (levelOs != null) {
            return Math.max(1, Number(levelOs));
        }
        return Math.max(1, style.mapOverscan ?? 1.55);
    },

    getMapCanvasOverscan() {
        const style = this.getMapStyle();
        return Math.max(1, style.mapCanvasOverscan ?? 1.45);
    },

    syncCanvasToDrawExtents(t) {
        if (!this.canvas || !this.ctx || !t?.contentBounds) return t;

        const style = this.getMapStyle();
        const inset = style.frameInset ?? 0;
        const pad = 24;
        const needW = Math.ceil(t.drawW + inset * 2 + pad);
        const needH = Math.ceil(t.drawH + inset * 2 + pad);
        const { frameW, frameH } = this.getMapFrameSize();
        const mul = this.getMapCanvasOverscan();
        const cssW = Math.max(Math.ceil(frameW * mul), needW);
        const cssH = Math.max(Math.ceil(frameH * mul), needH);
        const prevW = this.canvas.clientWidth;
        const prevH = this.canvas.clientHeight;

        const dpr = window.devicePixelRatio || 1;
        if (Math.abs(prevW - cssW) > 0.5 || Math.abs(prevH - cssH) > 0.5) {
            this.canvas.style.width = `${cssW}px`;
            this.canvas.style.height = `${cssH}px`;
            this.canvas.width = Math.floor(cssW * dpr);
            this.canvas.height = Math.floor(cssH * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        const innerW = Math.max(1, cssW - inset * 2);
        const innerH = Math.max(1, cssH - inset * 2);
        const contentBounds = t.contentBounds;
        const panBounds = t.panBounds || contentBounds;
        t.baseOffsetX = inset + (innerW - t.drawW) / 2;
        t.baseOffsetY = inset + (innerH - t.drawH) / 2;
        t.anchorX = inset + innerW / 2;
        t.anchorY = inset + innerH / 2;
        t.toMap = (pageX, pageY) => ({
            x: t.baseOffsetX + (pageX - panBounds.minX) * (t.scaleX ?? t.scale),
            y: t.baseOffsetY + (pageY - panBounds.minY) * (t.scaleY ?? t.scale)
        });

        return t;
    },

    getMapFrameSize() {
        const frameW = Math.max(1, this.mapWrap?.clientWidth ?? 1);
        const frameH = Math.max(1, this.mapWrap?.clientHeight ?? 1);
        return { frameW, frameH };
    },

    getFixedViewportMarkerSize(viewport) {
        const style = this.getMapStyle();
        const { frameW, frameH } = this.getMapFrameSize();
        const heightRatio = style.viewportMarkerHeightRatio ?? 0.56;
        const maxWidthRatio = style.viewportMarkerWidthRatio ?? 0.92;
        const h = Math.max(1, frameH * heightRatio);

        const vp = viewport || null;
        if (vp?.width > 0 && vp?.height > 0) {
            let w = Math.max(1, h * (vp.width / vp.height));
            w = Math.min(w, frameW * maxWidthRatio);
            return { w, h };
        }

        return {
            w: Math.max(1, frameW * maxWidthRatio),
            h
        };
    },

    usesFixedViewportMarker() {
        return (this.getMapStyle().viewportMarkerMode ?? 'fixed') === 'fixed';
    },

    resolveMacroMapScale(scale, innerW, innerH, containScale, forceMacro = false) {
        const style = this.getMapStyle();
        const useShared = style.sharedReferenceScale !== false;
        if (!forceMacro && !useShared && this._activeLevel !== 1) return scale;
        if (!forceMacro && useShared && this._activeLevel >= 2) return scale;

        if (style.macroMinScaleLock === false) {
            return scale;
        }

        const overscan = this.getMapOverscan();
        const blockActive = typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount() > 0;

        if (!blockActive) {
            this._minMacroMapScale = containScale;
            return scale;
        }

        let floorContain = this._minMacroMapScale;
        if (floorContain == null) {
            const stable = this.getMacroMapStableBounds();
            if (stable) {
                floorContain = this.computeContainScale(
                    stable.maxX - stable.minX,
                    stable.maxY - stable.minY,
                    innerW,
                    innerH
                );
            }
        }

        const floor = floorContain != null ? floorContain * overscan : null;
        return floor != null ? Math.max(scale, floor) : scale;
    },

    getSlotForLevel(level, activeLevel) {
        return getDepthSlotIndex(level, activeLevel);
    },

    async _loadLayerMarker(src) {
        if (!this.layerMarker || this._layerMarkerLoaded) return;
        try {
            const res = await fetch(src);
            if (!res.ok) return;
            const svgText = await res.text();
            this.layerMarker.innerHTML = svgText;
            this._layerMarkerLoaded = true;
            this.syncLayerNavMetrics();
        } catch (_) {
            /* offline exhibition — marker optional until SVG loads */
        }
    },

    syncLayerNavMetrics() {
        const root = document.documentElement;
        const layerCfg = CONFIG.layerNavigation;
        const buttons = this.toggleButton
            ? [this.toggleButton]
            : [...(this.titles?.values() || [])];
        if (!buttons.length) return;

        let maxLabelH = 0;
        buttons.forEach((title) => {
            const label = title.querySelector('.site-navigation-layers__label');
            if (!label) return;
            maxLabelH = Math.max(maxLabelH, label.getBoundingClientRect().height);
        });
        if (maxLabelH <= 0) return;

        const rowGapPx = this._layerNavRowGapPx();

        root.style.setProperty('--layer-nav-label-box-h', `${maxLabelH}px`);
        root.style.setProperty('--layer-nav-row-step', `${maxLabelH + rowGapPx}px`);
        const slotCount = layerCfg?.toggleMode !== false
            ? 1
            : (layerCfg?.slotCount ?? 2);
        root.style.setProperty('--layer-nav-stack-h', `${maxLabelH * slotCount + rowGapPx * Math.max(0, slotCount - 1)}px`);
        this.syncLayerMarkerDot();
    },

    _layerNavRowGapPx() {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--layer-nav-row-gap);pointer-events:none;';
        document.documentElement.appendChild(probe);
        const px = probe.getBoundingClientRect().height;
        probe.remove();
        return px > 0 ? px : 10;
    },

    syncLayerMarkerDot() {
        const svg = this.layerMarker?.querySelector('svg');
        const dot = svg?.querySelector('.layer-nav-marker__dot');
        const gapLine = svg?.querySelector('.layer-nav-marker__gap-mask');
        if (!svg || !dot || !this.layerMarker) return;

        const stackH = this.layerMarker.getBoundingClientRect().height;
        if (stackH <= 0) return;

        const dotSizeRaw = getComputedStyle(document.documentElement).getPropertyValue('--dot-size').trim();
        const dotPx = parseFloat(dotSizeRaw) || 10;
        const vbH = svg.viewBox.baseVal.height || 103;
        const r = (dotPx / 2) * (vbH / stackH);
        dot.setAttribute('r', String(r));

        const cy = parseFloat(dot.getAttribute('cy') || '85.83');
        if (gapLine) {
            gapLine.setAttribute('y1', String(cy - r - 0.3));
            gapLine.setAttribute('y2', String(cy + r + 0.3));
        }
    },

    applyLayerSlot(title, slot) {
        title.dataset.slot = String(slot);
        title.style.setProperty('--layer-nav-slot', String(slot));
    },

    syncActiveState(level) {
        const transitionActive = this.isTransitionActive();
        const layerToggleBlocked = this.isLayerToggleBlocked();
        const inspectorActive = level === 1 &&
            typeof ArtifactInspector !== 'undefined' &&
            ArtifactInspector.isActive;
        const layersDimmed = transitionActive || inspectorActive;
        this.layersPanel?.classList.toggle('is-dimmed', layersDimmed);
        this.mapsPanel?.classList.toggle('is-inspector-dimmed', inspectorActive);

        const layerCfg = CONFIG.layerNavigation;

        if (this.toggleButton) {
            const targetLevel = getLayerNavToggleTarget(level);
            const symbolKey = getLayerNavSymbolInlineKey(targetLevel);
            const symbol = this.toggleButton.querySelector('.site-navigation-layers__label-symbol');

            this.toggleButton.dataset.targetLevel = String(targetLevel);
            this.toggleButton.setAttribute(
                'aria-label',
                layerCfg?.labels?.[targetLevel] || `L${targetLevel}`
            );
            void setLayerNavSymbolContent(symbol, symbolKey, targetLevel);

            this.applyLayerSlot(this.toggleButton, 0);
            this.toggleButton.classList.add('is-active');
            this.toggleButton.classList.remove('is-inactive', 'is-zoom-out-blocked');
            this.toggleButton.removeAttribute('aria-current');
            this.toggleButton.disabled = layerToggleBlocked;
            this.toggleButton.setAttribute('aria-disabled', layerToggleBlocked ? 'true' : 'false');
            document.body.classList.remove('is-layer-zoom-out-blocked');
        } else {
            this.titles.forEach((title, rowLevel) => {
                const isActive = rowLevel === level;
                const slot = this.getSlotForLevel(rowLevel, level);
                this.applyLayerSlot(title, slot);
                title.classList.toggle('is-active', isActive);
                title.classList.toggle('is-inactive', !isActive);
                title.setAttribute('aria-current', isActive ? 'true' : 'false');
                title.disabled = transitionActive;
            });
            if (this.layerMarker) {
                this.layerMarker.dataset.level = String(level);
            }
        }
        requestAnimationFrame(() => this.syncLayerNavMetrics());

        const mapCursorBlocked = inspectorActive || transitionActive;
        if (this.canvas && !this._drag?.active) {
            this.canvas.style.cursor = mapCursorBlocked ? 'default' : 'grab';
        }
        if (this.mapWrap && !this._drag?.active) {
            this.mapWrap.style.cursor = mapCursorBlocked ? 'default' : 'grab';
        }
    },

    isTransitionActive() {
        return SpatialNavigation.isPaused ||
            DepthController.isAnyTransitionActive();
    },

    /** Layer toggle stays available on L2 (code level 3) even while focus inspector is open. */
    isLayerToggleBlocked() {
        if (DepthController.isAnyTransitionActive?.()) return true;
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive &&
            DepthController.currentLevel === 3) {
            return false;
        }
        return !!SpatialNavigation.isPaused;
    },

    isTransitionBlocked() {
        return this.isTransitionActive();
    },

    isInteractionBlocked() {
        return this.isTransitionBlocked() ||
            (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive);
    },

    isMapPaintBlocked() {
        return typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive;
    },

    navigateToLayer(level) {
        const target = Number(level);
        if (!Number.isFinite(target) || !isDepthLevelActive(target)) return;
        if (this.isLayerToggleBlocked()) return;

        const currentLevel = typeof DepthController !== 'undefined'
            ? DepthController.currentLevel
            : this._activeLevel;
        if (target === currentLevel) return;

        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }

        DepthController.changeLevel(target);
    },

    scheduleRender() {
        if (!this.isMapReady()) return;
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        requestAnimationFrame(() => {
            this._renderScheduled = false;
            this.render();
        });
    },

    startMacroLoop() {
        this.syncMacroLoop();
    },

    resizeCanvas() {
        if (!this.canvas || !this.mapWrap) return;

        const dpr = window.devicePixelRatio || 1;
        const { frameW, frameH } = this.getMapFrameSize();
        const canvasMul = this.getMapCanvasOverscan();
        const cssW = Math.max(1, Math.floor(frameW * canvasMul));
        const cssH = Math.max(1, Math.floor(frameH * canvasMul));
        const bw = Math.floor(cssW * dpr);
        const bh = Math.floor(cssH * dpr);

        this.canvas.style.width = `${cssW}px`;
        this.canvas.style.height = `${cssH}px`;

        if (this.canvas.width !== bw || this.canvas.height !== bh) {
            this.canvas.width = bw;
            this.canvas.height = bh;
            this._minMacroMapScale = null;
            this._referenceMapScale = null;
            this._contentDirty = true;
            this._panDisplayX = 0;
            this._panDisplayY = 0;
            this._panTargetX = 0;
            this._panTargetY = 0;
        }

        this.ctx = this.canvas.getContext('2d');
        if (this.ctx) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    },

    getMapPanLimits(baseOffsetX, baseOffsetY, drawW, drawH, innerW, innerH, inset) {
        const offXLo = inset;
        const offXHi = inset + innerW - drawW;
        const offYLo = inset;
        const offYHi = inset + innerH - drawH;
        const minOffX = Math.min(offXLo, offXHi);
        const maxOffX = Math.max(offXLo, offXHi);
        const minOffY = Math.min(offYLo, offYHi);
        const maxOffY = Math.max(offYLo, offYHi);
        return {
            minOffX,
            minOffY,
            maxOffX,
            maxOffY,
            minPanX: minOffX - baseOffsetX,
            maxPanX: maxOffX - baseOffsetX,
            minPanY: minOffY - baseOffsetY,
            maxPanY: maxOffY - baseOffsetY
        };
    },

    computeFixedMarkerScale(viewport) {
        if (!viewport) return null;
        const fixed = this.getFixedViewportMarkerSize(viewport);
        const scaleW = fixed.w / Math.max(1, viewport.width);
        const scaleH = fixed.h / Math.max(1, viewport.height);
        // L1 band is taller than wide — height binding fills the marker vertically.
        if (this._activeLevel === 1 && scaleH > scaleW) {
            return scaleH;
        }
        return Math.min(scaleW, scaleH);
    },

    computeTransform(frameBounds, viewport, canvasW, canvasH, options = {}) {
        const style = this.getMapStyle();
        const inset = style.frameInset ?? 0;
        const innerW = Math.max(1, canvasW - inset * 2);
        const innerH = Math.max(1, canvasH - inset * 2);
        const { frameW, frameH } = this.getMapFrameSize();
        const panBounds = options.panBounds || frameBounds;
        const scaleBounds = options.scaleBounds || frameBounds;
        const useSharedScale = options.scaleBounds != null &&
            options.scaleBounds !== frameBounds;
        const scaleWorldW = Math.max(1, scaleBounds.maxX - scaleBounds.minX);
        const scaleWorldH = Math.max(1, scaleBounds.maxY - scaleBounds.minY);
        const contentWorldW = Math.max(1, frameBounds.maxX - frameBounds.minX);
        const contentWorldH = Math.max(1, frameBounds.maxY - frameBounds.minY);

        const containScale = this.computeContainScale(scaleWorldW, scaleWorldH, frameW, frameH);
        const overscan = this.getMapOverscan();
        let scale;
        const fixedMarkerScale = viewport && this.usesFixedViewportMarker()
            ? this.computeFixedMarkerScale(viewport)
            : null;

        if (fixedMarkerScale != null) {
            scale = fixedMarkerScale;
        } else {
            scale = containScale * overscan;
            scale = this.resolveMacroMapScale(scale, frameW, frameH, containScale, useSharedScale);
            scale = this.applyReferenceMapScale(scale, useSharedScale);

            if (viewport && style.viewportFitInFrame !== false) {
                const vpMapW = viewport.width * scale;
                const vpMapH = viewport.height * scale;
                const fitMul = Math.min(1, innerW / vpMapW, innerH / vpMapH);
                if (fitMul < 1) scale *= fitMul;
            }
        }

        const levelAdjust = style.levelMapScaleAdjust?.[this._activeLevel] ??
            style.levelMapScaleAdjust?.[String(this._activeLevel)];
        if (levelAdjust != null) {
            const mul = Number(levelAdjust);
            if (Number.isFinite(mul) && mul > 0) scale *= mul;
        }

        // Fill-area mode (launcher embed): independent axis scales stretch the
        // world to the exact frame rect — top-to-bottom, edge-to-edge.
        let scaleX = scale;
        let scaleY = scale;
        if (style.mapFillArea === true && fixedMarkerScale == null) {
            scaleX = innerW / contentWorldW;
            scaleY = innerH / contentWorldH;
            scale = scaleY;
        }

        const drawW = contentWorldW * scaleX;
        const drawH = contentWorldH * scaleY;

        const baseOffsetX = inset + (innerW - drawW) / 2;
        const baseOffsetY = inset + (innerH - drawH) / 2;
        const anchorX = inset + innerW / 2;
        const anchorY = inset + innerH / 2;

        let offsetX = baseOffsetX;
        let offsetY = baseOffsetY;
        let panX = 0;
        let panY = 0;

        const applyFollow = options.contentOnly !== true &&
            style.viewportFollow !== false &&
            viewport;

        if (applyFollow) {
            const strength = style.viewportFollowStrength ?? 1;
            const follow = this.computeFollowPan(
                {
                    anchorX,
                    anchorY,
                    baseOffsetX,
                    baseOffsetY
                },
                panBounds,
                viewport,
                scale
            );
            let followX = baseOffsetX + follow.panX;
            let followY = baseOffsetY + follow.panY;
            panX = follow.panX;
            panY = follow.panY;

            if (strength < 1) {
                followX = baseOffsetX + panX * strength;
                followY = baseOffsetY + panY * strength;
                panX = followX - baseOffsetX;
                panY = followY - baseOffsetY;
            }

            offsetX = followX;
            offsetY = followY;
        }

        const toMap = (pageX, pageY) => ({
            x: baseOffsetX + (pageX - panBounds.minX) * scaleX,
            y: baseOffsetY + (pageY - panBounds.minY) * scaleY
        });

        const vpTl = viewport
            ? { x: offsetX + (viewport.left - panBounds.minX) * scaleX, y: offsetY + (viewport.top - panBounds.minY) * scaleY }
            : null;
        const vpBr = viewport
            ? {
                x: offsetX + (viewport.left + viewport.width - panBounds.minX) * scaleX,
                y: offsetY + (viewport.top + viewport.height - panBounds.minY) * scaleY
            }
            : null;

        return {
            scale,
            scaleX,
            scaleY,
            offsetX,
            offsetY,
            baseOffsetX,
            baseOffsetY,
            panX,
            panY,
            anchorX,
            anchorY,
            drawW,
            drawH,
            toMap,
            contentBounds: frameBounds,
            panBounds,
            vpTl,
            vpBr
        };
    },

    applyCanvasPan() {
        if (!this.canvas) return;
        this.canvas.style.transform =
            `translate(-50%, -50%) translate(${this._panDisplayX}px, ${this._panDisplayY}px)`;
    },

    syncLastTransform(level, contentBounds, vp) {
        if (!this._baseTransform || !contentBounds) return;

        const t = this._baseTransform;
        const panBounds = t.panBounds || contentBounds;
        const { x: offsetX, y: offsetY } = this.getMapContentOffset();
        const effective = {
            ...t,
            offsetX,
            offsetY,
            toMap: (pageX, pageY) => ({
                x: offsetX + (pageX - panBounds.minX) * (t.scaleX ?? t.scale),
                y: offsetY + (pageY - panBounds.minY) * (t.scaleY ?? t.scale)
            })
        };

        let vpTl;
        let vpBr;
        if (this.usesFixedViewportMarker() && vp) {
            const fixed = this.getFixedViewportMarkerSize(vp);
            vpTl = {
                x: t.anchorX - fixed.w / 2 - this._panDisplayX,
                y: t.anchorY - fixed.h / 2 - this._panDisplayY
            };
            vpBr = {
                x: t.anchorX + fixed.w / 2 - this._panDisplayX,
                y: t.anchorY + fixed.h / 2 - this._panDisplayY
            };
        } else {
            vpTl = vp ? effective.toMap(vp.left, vp.top) : t.vpTl;
            vpBr = vp
                ? effective.toMap(vp.left + vp.width, vp.top + vp.height)
                : t.vpBr;
        }

        this._lastTransform = {
            contentBounds,
            t: effective,
            level,
            vp,
            vpTl,
            vpBr
        };
    },

    updatePanFromViewport(force = false) {
        if (!this.canvas || !this._baseTransform) return;
        if (!force && this._navDragActive) return;

        const base = this._baseTransform;
        const panBounds = base.panBounds || base.contentBounds;
        if (!panBounds) return;

        const vp = this.getMapViewportMarkerRect();
        const style = this.getMapStyle();

        let panX = 0;
        let panY = 0;

        if (style.viewportFollow !== false) {
            const strength = style.viewportFollowStrength ?? 1;
            const follow = this.computeFollowPan(base, panBounds, vp, base.scale);
            panX = follow.panX;
            panY = follow.panY;

            if (strength < 1) {
                panX *= strength;
                panY *= strength;
            }
        }

        this._panTargetX = panX;
        this._panTargetY = panY;
        this._panDisplayX = panX;
        this._panDisplayY = panY;
        this.applyCanvasPan();
        this.updateViewportMarker(base, vp);
        this.syncLastTransform(this._activeLevel, base.contentBounds, vp);
        const blockActive = typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount?.() > 0;
        if (this._activeLevel === 1 && blockActive && this.ctx && base) {
            this.drawMapContent(this.ctx, base, 1);
        }
        const shouldEcho = this.shouldDrawViewportMarkerEcho();
        if (shouldEcho) {
            this.drawMapContent(this.ctx, base, this._activeLevel);
            const echoMotionActive = this.isViewportEchoMotionActive();
            const keepSilhouetteDetail = style.mesoMapSilhouetteDetailDuringMotion === true &&
                style.mesoMapSilhouetteDetail === true;
            this.drawViewportMarkerEcho({ detail: keepSilhouetteDetail || !echoMotionActive });
            if (echoMotionActive && !keepSilhouetteDetail) {
                this.scheduleViewportEchoSettle();
            }
        }
    },

    drawMapContent(ctx, t, level) {
        const style = this.getMapStyle();
        const cssW = this.canvas.clientWidth;
        const cssH = this.canvas.clientHeight;

        ctx.clearRect(0, 0, cssW, cssH);
        if (style.backgroundColor) {
            ctx.fillStyle = style.backgroundColor;
            ctx.fillRect(0, 0, cssW, cssH);
        }

        if (style.showWorldFill) {
            const worldTl = t.toMap(t.contentBounds.minX, t.contentBounds.minY);
            const worldBr = t.toMap(t.contentBounds.maxX, t.contentBounds.maxY);
            ctx.fillStyle = style.worldFillColor || '#fafafa';
            ctx.fillRect(
                worldTl.x,
                worldTl.y,
                worldBr.x - worldTl.x,
                worldBr.y - worldTl.y
            );
        }

        const markers = SpatialNavigation.getContentMarkersForLevel(level);
        this.drawLevelContent(ctx, t, level, markers);
    },

    shouldDrawViewportMarkerEcho() {
        const style = this.getMapStyle();
        return this._activeLevel === 2 &&
            style.mesoMapViewportEcho === true &&
            !!this.ctx &&
            !!this.canvas &&
            !!this.viewportMarker &&
            !this.viewportMarker.classList.contains('is-hidden');
    },

    isViewportEchoMotionActive() {
        const spatialActive = typeof SpatialNavigation !== 'undefined' &&
            (SpatialNavigation.isScrolling === true || SpatialNavigation.pan?.active === true);
        const depthActive = typeof DepthController !== 'undefined' &&
            DepthController.isAnyTransitionActive?.() === true;
        return this._navDragActive ||
            spatialActive ||
            depthActive;
    },

    scheduleViewportEchoSettle() {
        clearTimeout(this._viewportEchoSettleTimer);
        const delay = this.getMapStyle().mesoMapEchoSettleMs ?? 120;
        this._viewportEchoSettleTimer = setTimeout(() => {
            this._viewportEchoSettleTimer = null;
            if (!this.shouldDrawViewportMarkerEcho() || this.isViewportEchoMotionActive()) return;
            if (this._baseTransform && this.ctx) {
                this.drawMapContent(this.ctx, this._baseTransform, this._activeLevel);
                this.drawViewportMarkerEcho({ detail: true });
            }
        }, delay);
    },

    drawViewportMarkerEcho(options = {}) {
        if (!this.shouldDrawViewportMarkerEcho()) {
            return;
        }

        const style = this.getMapStyle();

        const markerRect = this.viewportMarker.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        const mapWrapRect = this.mapWrap?.getBoundingClientRect();
        if (
            markerRect.width < 1 ||
            markerRect.height < 1 ||
            canvasRect.width < 1 ||
            canvasRect.height < 1 ||
            !mapWrapRect ||
            mapWrapRect.width < 1 ||
            mapWrapRect.height < 1
        ) {
            return;
        }

        const markerX = markerRect.left - canvasRect.left;
        const markerY = markerRect.top - canvasRect.top;
        const markerW = markerRect.width;
        const markerH = markerRect.height;
        const clipX = mapWrapRect.left - canvasRect.left;
        const clipY = mapWrapRect.top - canvasRect.top;
        const clipW = mapWrapRect.width;
        const clipH = mapWrapRect.height;
        const fill = style.mesoFrameEchoFill
            ?? style.mesoFrameFill
            ?? style.mesoLineFill
            ?? 'rgba(16, 16, 16, 0.62)';
        const detailFill = style.mesoSilhouetteDetailFill ?? fill;
        const detailBaseFill = style.mesoFrameDetailBaseFill
            ?? style.mesoFrameMutedFill
            ?? 'rgba(16, 16, 16, 0.1)';
        const useDetail = options.detail !== false && style.mesoMapSilhouetteDetail === true;
        const detailCap = Math.max(0, style.mesoMapMaxDetailRects ?? 220);
        const viewportW = Math.max(1, window.innerWidth);
        const viewportH = Math.max(1, window.innerHeight);
        let frames = this.getMapNoteWrappers()
            .map((wrapper) => ({
                wrapper,
                frame: wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                    || wrapper.querySelector('.meso-mock__frame')
                    || wrapper.querySelector('.meso-silhouette')
                    || wrapper.querySelector('.depth-v2-glyph--meso')
            }))
            .filter((entry) => entry.frame);
        if (!frames.length) {
            frames = [...document.querySelectorAll('.depth-v2-glyph--meso')]
                .filter((el, index, all) => all.indexOf(el) === index)
                .map((frame) => ({ wrapper: frame.closest('.note-wrapper'), frame }));
        }

        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(clipX, clipY, clipW, clipH);
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();

        const mapRect = (rect) => {
            const x = markerX + (rect.left / viewportW) * markerW;
            const y = markerY + (rect.top / viewportH) * markerH;
            const w = (rect.width / viewportW) * markerW;
            const h = (rect.height / viewportH) * markerH;
            return { x, y, w, h };
        };

        const intersectsClip = ({ x, y, w, h }) =>
            x + w >= clipX && x <= clipX + clipW && y + h >= clipY && y <= clipY + clipH;

        const drawMappedRect = ({ x, y, w, h }, rectFill) => {
            if (w <= 0 || h <= 0 || !intersectsClip({ x, y, w, h })) return false;
            ctx.fillStyle = rectFill;
            ctx.fillRect(x, y, w, h);
            return true;
        };

        let detailCount = 0;

        frames.forEach(({ frame, wrapper }) => {
            const rect = frame.getBoundingClientRect();
            if (rect.width < 0.5 || rect.height < 0.5) return;
            const mappedFrame = mapRect(rect);
            if (!intersectsClip(mappedFrame)) return;

            let drewDetail = false;
            if (useDetail && detailCount < detailCap) {
                const noteIndex = this.getWrapperNoteIndex(wrapper);
                const item = typeof AppState !== 'undefined' && noteIndex >= 0 ? AppState.items?.[noteIndex] : null;
                const noteId = wrapper?.dataset?.noteId || item?.id || '';
                const cachedFragments = typeof MesoSilhouetteCache !== 'undefined'
                    ? MesoSilhouetteCache.getNormalizedDetailRects(noteId, item)
                    : [];

                if (cachedFragments.length > 0) {
                    drawMappedRect(mappedFrame, detailBaseFill);
                    cachedFragments.forEach((fragment) => {
                        if (detailCount >= detailCap) return;
                        const relativeRect = {
                            x: mappedFrame.x + fragment.x * mappedFrame.w,
                            y: mappedFrame.y + fragment.y * mappedFrame.h,
                            w: fragment.w * mappedFrame.w,
                            h: fragment.h * mappedFrame.h
                        };
                        if (drawMappedRect(relativeRect, detailFill)) {
                            detailCount += 1;
                            drewDetail = true;
                        }
                    });
                }

                if (!drewDetail) {
                    const fragments = frame.querySelectorAll('.meso-mock__line, .meso-mock__rect');
                    if (fragments.length > 0) {
                        drawMappedRect(mappedFrame, detailBaseFill);
                    }
                    fragments.forEach((fragment) => {
                        if (detailCount >= detailCap) return;
                        const fragmentRect = fragment.getBoundingClientRect();
                        if (fragmentRect.width < 0.5 || fragmentRect.height < 0.5) return;
                        const relativeRect = {
                            x: mappedFrame.x + ((fragmentRect.left - rect.left) / rect.width) * mappedFrame.w,
                            y: mappedFrame.y + ((fragmentRect.top - rect.top) / rect.height) * mappedFrame.h,
                            w: (fragmentRect.width / rect.width) * mappedFrame.w,
                            h: (fragmentRect.height / rect.height) * mappedFrame.h
                        };
                        if (drawMappedRect(relativeRect, detailFill)) {
                            detailCount += 1;
                            drewDetail = true;
                        }
                    });
                }
            }

            if (!drewDetail) {
                drawMappedRect(mappedFrame, fill);
            }
        });

        ctx.restore();
    },

    render() {
        if (!this.isMapReady() || !this.canvas || !this.ctx) return;

        try {
            this._renderFocusState = null;
            const level = this._activeLevel;
            if (this._contentDirty) {
                this._depthMapMarkersDirty = true;
                this.clearMapWrapperCache();
            }
            this.syncActiveState(level);

            const { frameW, frameH } = this.getMapFrameSize();
            if (frameW < 1 || frameH < 1) return;

            if (!this._contentDirty) {
                if (this._depthMapMarkersDirty) {
                    this._contentDirty = true;
                    this.scheduleRender();
                    return;
                }
                this.updatePanFromViewport();
                return;
            }

            const contentBounds = this.getMapContentBounds();
            if (!contentBounds) return;

            const vp = this.getMapViewportMarkerRect();

            this._cachedContentBounds = contentBounds;
            this._baseTransform = this.computeTransform(
                contentBounds,
                vp,
                frameW,
                frameH,
                { contentOnly: true }
            );
            this._baseTransform.contentBounds = contentBounds;
            this.syncCanvasToDrawExtents(this._baseTransform);
            this.drawMapContent(this.ctx, this._baseTransform, level);
            this._contentDirty = false;

            this.updatePanFromViewport();
        } catch (err) {
            console.warn('NavigationMap.render failed:', err);
        }
    },

    getMapStyle() {
        const base = CONFIG.navigationMap || {};
        if (base.launcherEmbed && this.isLauncherEmbed()) {
            return { ...base, ...base.launcherEmbed };
        }
        return base;
    },

    getLevelGlyphScale(level) {
        const style = this.getMapStyle();
        const scales = style.levelGlyphScale || {};
        const raw = scales[level] ?? scales[String(level)] ?? 1;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 1;
    },

    scaleMapPageRect(pageRect, glyphScale) {
        if (!pageRect || glyphScale === 1) return pageRect;
        const cx = pageRect.left + pageRect.width / 2;
        const cy = pageRect.top + pageRect.height / 2;
        const w = pageRect.width * glyphScale;
        const h = pageRect.height * glyphScale;
        return {
            left: cx - w / 2,
            top: cy - h / 2,
            width: w,
            height: h
        };
    },

    updateViewportMarker(t, vp) {
        const el = this.viewportMarker;
        if (!el || !t) return;

        try {
            const style = this.getMapStyle();
            const show = style.showViewportFill || style.showViewportOutline;
            el.classList.toggle('is-hidden', !show);
            if (!show) return;

            const markerMode = style.viewportMarkerMode ?? 'fixed';
            let w;
            let h;
            let offsetX = 0;
            let offsetY = 0;

            if (markerMode === 'fixed') {
                const markerVp = vp || this.getMapViewportMarkerRect();
                const fixed = this.getFixedViewportMarkerSize(markerVp);
                w = fixed.w;
                h = fixed.h;
            } else {
                const markerVp = vp || this.getMapViewportMarkerRect();
                const effective = this.getEffectiveTransform() || t;
                if (typeof effective.toMap !== 'function') return;

                const tl = effective.toMap(markerVp.left, markerVp.top);
                const br = effective.toMap(
                    markerVp.left + markerVp.width,
                    markerVp.top + markerVp.height
                );
                w = Math.max(1, br.x - tl.x);
                h = Math.max(1, br.y - tl.y);

                if (style.viewportFollow === false) {
                    const cssW = this.canvas?.clientWidth ?? 0;
                    const cssH = this.canvas?.clientHeight ?? 0;
                    offsetX = (tl.x + br.x) / 2 - cssW / 2 + this._panDisplayX;
                    offsetY = (tl.y + br.y) / 2 - cssH / 2 + this._panDisplayY;
                }
            }

            el.style.width = `${w}px`;
            el.style.height = `${h}px`;
            el.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`;
        } catch (err) {
            console.warn('NavigationMap.updateViewportMarker failed:', err);
        }
    },

    pageRectFromElement(el) {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (rect.width < 0.5 || rect.height < 0.5) return null;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        return {
            left: rect.left + scrollX,
            top: rect.top + scrollY,
            width: rect.width,
            height: rect.height
        };
    },

    getMapNoteWrappers() {
        if (DepthController.currentLevel !== this._activeLevel) return [];

        return this._mapNoteWrappersCache || (this._mapNoteWrappersCache = [...document.querySelectorAll(
            this.getActiveMapWrapperSelector(this._activeLevel)
        )].filter((wrapper) => this.isMapWrapperEligible(wrapper)));
    },

    clearMapWrapperCache() {
        this._mapNoteWrappersCache = null;
    },

    drawMapPageRect(ctx, t, pageRect, fill, stroke = null) {
        const tl = t.toMap(pageRect.left, pageRect.top);
        const br = t.toMap(
            pageRect.left + pageRect.width,
            pageRect.top + pageRect.height
        );
        const w = br.x - tl.x;
        const h = br.y - tl.y;
        if (w < 0.2 || h < 0.2) return;

        ctx.fillStyle = fill;
        ctx.fillRect(tl.x, tl.y, w, h);

        if (stroke) {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width ?? 0.5;
            ctx.strokeRect(tl.x, tl.y, w, h);
        }
    },

    drawMapPageRectWithInset(ctx, t, pageRect, fill, insetPx = 0, stroke = null) {
        if (!insetPx) {
            this.drawMapPageRect(ctx, t, pageRect, fill, stroke);
            return;
        }

        const tl = t.toMap(pageRect.left, pageRect.top);
        const br = t.toMap(
            pageRect.left + pageRect.width,
            pageRect.top + pageRect.height
        );
        const inset = Math.max(0, insetPx);
        const x = Math.min(tl.x, br.x) + inset;
        const y = Math.min(tl.y, br.y) + inset;
        const w = Math.abs(br.x - tl.x) - inset * 2;
        const h = Math.abs(br.y - tl.y) - inset * 2;
        if (w < 0.2 || h < 0.2) return;

        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);

        if (stroke) {
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width ?? 0.5;
            ctx.strokeRect(x, y, w, h);
        }
    },

    getMesoFrameDetailRects(sourceElement, targetPageRect, noteId = '', item = null) {
        if (!targetPageRect) return [];

        if (typeof MesoSilhouetteCache !== 'undefined' && noteId) {
            const cachedRects = MesoSilhouetteCache.getDetailRects(noteId, targetPageRect, item);
            if (cachedRects.length) return cachedRects;
        }

        if (!sourceElement) return [];

        const sourceRect = this.pageRectFromElement(sourceElement);
        if (!sourceRect || sourceRect.width <= 0 || sourceRect.height <= 0) return [];

        return [...sourceElement.querySelectorAll('.meso-mock__line, .meso-mock__rect')]
            .map((lineEl) => this.pageRectFromElement(lineEl))
            .filter(Boolean)
            .map((lineRect) => {
                const relLeft = (lineRect.left - sourceRect.left) / sourceRect.width;
                const relTop = (lineRect.top - sourceRect.top) / sourceRect.height;
                const relWidth = lineRect.width / sourceRect.width;
                const relHeight = lineRect.height / sourceRect.height;
                return {
                    left: targetPageRect.left + relLeft * targetPageRect.width,
                    top: targetPageRect.top + relTop * targetPageRect.height,
                    width: relWidth * targetPageRect.width,
                    height: relHeight * targetPageRect.height
                };
            });
    },

    drawMesoFrameDetailMarker(ctx, t, marker, fill, baseFill) {
        if (!marker?.pageRect) return false;

        const item = typeof AppState !== 'undefined' ? AppState.items?.[marker.noteIndex] : null;
        const detailRects = this.getMesoFrameDetailRects(marker.sourceElement, marker.pageRect, marker.noteId, item);
        if (!detailRects.length) {
            return false;
        }

        this.drawMapPageRect(ctx, t, marker.pageRect, baseFill);
        detailRects.forEach((rect) => this.drawMapPageRect(ctx, t, rect, fill));
        return true;
    },

    getWrapperNoteIndex(wrapper) {
        const fromDataset = Number(wrapper?.dataset?.noteIndex);
        if (Number.isFinite(fromDataset) && fromDataset >= 0) return fromDataset;
        return -1;
    },

    resolveBlockColor(block) {
        if (block?.color) return block.color;
        if (block?.tag && typeof AppState !== 'undefined') {
            return AppState.tagColorsMap?.get(block.tag) || this.getMapStyle().authorBlockColor || '#101010';
        }
        return this.getMapStyle().authorBlockColor || '#101010';
    },

    getBlockPagePosition(block) {
        if (!block?.element) return null;

        const level = DepthController.currentLevel;
        const onCanvas = block.element.classList.contains('is-deployed') &&
            !block.element.classList.contains('is-depth-ui-mounted');

        if (
            level === 1 &&
            onCanvas &&
            Number.isFinite(block.bodyX) &&
            Number.isFinite(block.bodyY)
        ) {
            return { x: block.bodyX, y: block.bodyY };
        }

        const rect = block.element.getBoundingClientRect();
        if (rect.width < 0.5 && rect.height < 0.5) return null;

        return {
            x: rect.left + rect.width / 2 + window.pageXOffset,
            y: rect.top + rect.height / 2 + window.pageYOffset
        };
    },

    getActiveMapBlocks() {
        if (typeof ActionWarehouse === 'undefined') return [];

        const blocks = [];
        ActionWarehouse.blocks.forEach((block) => {
            if (block.state !== 'active') return;
            if (block.type === 'frame') return;
            if (!block.tag && !block.author) return;

            if (block.nestedIn?.frameKind === 'filter') {
                if (!ActionWarehouse.isBlockFocusEligible(block.nestedIn)) return;
            } else if (!ActionWarehouse.isBlockFocusEligible(block)) {
                return;
            }

            const pagePos = this.getBlockPagePosition(block);
            blocks.push({
                tag: block.tag,
                author: block.author,
                color: this.resolveBlockColor(block),
                pagePos
            });
        });

        return blocks;
    },

    getBlockFocusState() {
        if (this._renderFocusState) return this._renderFocusState;

        if (typeof ActionWarehouse === 'undefined') {
            this._renderFocusState = { active: false, tags: new Set(), authors: new Set(), blocks: [] };
            return this._renderFocusState;
        }

        const { tags, authors } = ActionWarehouse.getActiveFocusCriteria();
        const blocks = this.getActiveMapBlocks();
        this._renderFocusState = {
            active: tags.size > 0 || authors.size > 0,
            tags,
            authors,
            blocks
        };
        return this._renderFocusState;
    },

    findMatchingBlockForNote(noteIndex, blocks) {
        if (typeof ActionWarehouse === 'undefined' || !blocks?.length) return null;

        const { tags: noteTags, authorCode } = ActionWarehouse.getNoteFocusTagsAndAuthor(noteIndex);
        for (const block of blocks) {
            if (block.tag && noteTags.includes(block.tag)) return block;
            if (block.author && authorCode === block.author) return block;
        }
        return null;
    },

    findMatchingBlockForDot(item, blocks, tags, authors) {
        if (item.tag && tags.has(item.tag)) {
            return blocks.find((block) => block.tag === item.tag) || null;
        }
        if (item.authorCode && authors.has(item.authorCode)) {
            return blocks.find((block) => block.author === item.authorCode) || null;
        }
        return null;
    },

    resolveNoteFocusColor(noteIndex, wrapper, blocks) {
        const block = this.findMatchingBlockForNote(noteIndex, blocks);
        return block?.color || null;
    },

    findPrimaryBlockForNote(noteIndex, wrapper, blocks) {
        return this.findMatchingBlockForNote(noteIndex, blocks);
    },

    drawBlockMarker(ctx, t, block) {
        if (!block?.pagePos) return;

        const style = this.getMapStyle();
        const size = style.blockMarkerSize ?? 3.5;
        const p = t.toMap(block.pagePos.x, block.pagePos.y);

        ctx.fillStyle = block.color;
        ctx.strokeStyle = '#101010';
        ctx.lineWidth = 0.6;
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    },

    drawActiveBlocks(ctx, t, blocks) {
        blocks.forEach((block) => this.drawBlockMarker(ctx, t, block));
    },

    drawFocusConnector(ctx, t, fromPage, block) {
        if (!fromPage || !block?.pagePos) return;

        const style = this.getMapStyle();
        const p1 = t.toMap(fromPage.x, fromPage.y);
        const p2 = t.toMap(block.pagePos.x, block.pagePos.y);

        ctx.save();
        ctx.strokeStyle = block.color;
        ctx.globalAlpha = style.blockConnectorAlpha ?? 0.28;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
    },

    drawLevelContent(ctx, t, level, markers) {
        if (level === 1) {
            const style = this.getMapStyle();
            if (style.macroMapUseDomPositions !== false) {
                this.drawDepthMapMarkers(ctx, t, 1);
                return;
            }
            this.drawMacroDots(ctx, t, markers);
            return;
        }
        if (level === 2) {
            this.drawMesoSilhouettes(ctx, t);
            return;
        }
        if (level === 3) {
            this.drawMicroNotes(ctx, t);
        }
    },

    buildCatalogMapEntries(level) {
        const layout = typeof CatalogState !== 'undefined' ? CatalogState.catalogLayout : null;
        if (!layout?.entries || layout.mode !== 'catalog') return null;
        if (typeof CatalogLayoutEngine !== 'undefined' && !CatalogLayoutEngine.isCatalogLayoutActive()) {
            return null;
        }

        const app = document.getElementById('app');
        if (!app) return null;

        const rect = app.getBoundingClientRect();
        const originX = rect.left + window.pageXOffset;
        const originY = rect.top + window.pageYOffset;
        let cellScale = 1;
        if (level === 2 && typeof getMesoCellRatio === 'function') {
            cellScale = getMesoCellRatio();
        }

        const items = [];
        layout.entries.forEach((entry, noteIndex) => {
            if (entry.localX == null || entry.localY == null) return;
            const w = (entry.width ?? 0) * cellScale;
            const h = (entry.height ?? 0) * cellScale;
            const centerX = originX + entry.localX;
            const centerY = originY + entry.localY;
            items.push({
                noteIndex,
                centerX,
                centerY,
                pageRect: {
                    left: centerX - w / 2,
                    top: centerY - h / 2,
                    width: w,
                    height: h
                }
            });
        });

        return items.length ? items : null;
    },

    drawCatalogMapNotes(ctx, t, level) {
        const items = this.buildCatalogMapEntries(level);
        if (!items) return false;

        const style = this.getMapStyle();
        const defaultFill = level === 3
            ? (style.noteCardFill ?? 'rgba(16, 16, 16, 0.62)')
            : (style.mesoLineFill ?? 'rgba(16, 16, 16, 0.62)');
        const mutedFill = level === 3
            ? (style.noteCardMutedFill ?? 'rgba(16, 16, 16, 0.14)')
            : (style.mesoLineMutedFill ?? 'rgba(16, 16, 16, 0.14)');
        const focus = this.getBlockFocusState();

        items.forEach(({ noteIndex, pageRect, centerX, centerY }) => {
            const focusColor = focus.active
                ? this.resolveNoteFocusColor(noteIndex, null, focus.blocks)
                : null;
            const fill = focusColor || (focus.active ? mutedFill : defaultFill);
            const matchBlock = focus.active
                ? this.findPrimaryBlockForNote(noteIndex, null, focus.blocks)
                : null;
            const scaledRect = this.scaleMapPageRect(pageRect, this.getLevelGlyphScale(level));

            this.drawMapPageRect(ctx, t, scaledRect, fill);
            if (matchBlock) {
                this.drawFocusConnector(ctx, t, { x: centerX, y: centerY }, matchBlock);
            }
        });

        if (focus.blocks.length) {
            this.drawActiveBlocks(ctx, t, focus.blocks);
        }
        return true;
    },

    isBlocksActiveOnMap() {
        return typeof ActionWarehouse !== 'undefined' &&
            ActionWarehouse.getActiveBlockCount() > 0;
    },

    shouldUseMacroFocusDetails(style) {
        if (style.macroFocusDetails === false) return false;
        if (this.isBlocksActiveOnMap() && style.macroFocusDetailsWhenBlocks === false) {
            return false;
        }
        return true;
    },

    collectMacroNotes(bodiesData) {
        return this.collectMacroNoteGroups(bodiesData);
    },

    drawMacroDots(ctx, t, markers) {
        const style = this.getMapStyle();
        const glyphScale = this.getLevelGlyphScale(1);
        const radius = (style.macroDotRadius ?? 1.5) * glyphScale;
        const defaultFill = style.macroDotFill ?? 'rgba(16, 16, 16, 0.4)';
        const mutedFill = style.macroDotMutedFill ?? 'rgba(16, 16, 16, 0.12)';
        const oneDotPerNote = style.macroMapNoteCenters !== false;
        const focus = this.shouldUseMacroFocusDetails(style)
            ? this.getBlockFocusState()
            : { active: false, tags: new Set(), authors: new Set(), blocks: [] };
        const drawConnectors = style.macroFocusConnectors === true;
        const drawBlockMarkers = style.macroBlockMarkers !== false;

        let notes = [];
        if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.bodiesData?.length > 0) {
            notes = oneDotPerNote
                ? this.collectMacroNotes(PhysicsEngine.bodiesData)
                : PhysicsEngine.bodiesData
                    .filter((item) => !item.isFiltered && item.body)
                    .map((item) => ({
                        sample: item,
                        x: item.body.position.x,
                        y: item.body.position.y,
                        dotCount: 1
                    }));
        }

        const stride = this.getEffectiveMacroDotStride(
            notes.length || markers.length,
            style
        );
        let step = 0;

        const plotDot = (p, fill) => {
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        const plotNote = (sample, x, y, noteIndex = sample?.noteIndex) => {
            const p = t.toMap(x, y);
            let matchBlock = null;
            if (focus.active && sample) {
                matchBlock = oneDotPerNote
                    ? this.findMatchingBlockForNote(noteIndex, focus.blocks)
                    : this.findMatchingBlockForDot(sample, focus.blocks, focus.tags, focus.authors);
            }
            plotDot(p, matchBlock ? matchBlock.color : (focus.active ? mutedFill : defaultFill));
            if (drawConnectors && matchBlock) {
                this.drawFocusConnector(ctx, t, { x, y }, matchBlock);
            }
        };

        if (notes.length > 0) {
            notes.forEach((note) => {
                const isFocused = this.isNoteFocusedForMap(note.sample, focus);
                if (stride > 1 && !isFocused && (step++ % stride) !== 0) return;
                plotNote(note.sample, note.x, note.y, note.sample?.noteIndex);
            });
        } else {
            markers.forEach(({ x, y }, index) => {
                if (stride > 1 && (index % stride) !== 0) return;
                plotDot(t.toMap(x, y), defaultFill);
            });
        }

        if (drawBlockMarkers && focus.blocks.length) {
            this.drawActiveBlocks(ctx, t, focus.blocks);
        }
    },

    drawMesoLineRects(ctx, t, root, fill) {
        const lineRects = [...root.querySelectorAll('.meso-mock__line, .meso-mock__rect')]
            .map((lineEl) => this.pageRectFromElement(lineEl))
            .filter(Boolean);
        if (!lineRects.length) return;

        const style = this.getMapStyle();
        const glyphScale = style.mesoMapSilhouetteFragmentScale ?? this.getLevelGlyphScale(2);
        const shouldScale = style.mesoMapScaleSilhouetteFragments !== false && glyphScale !== 1;
        const frameRect = style.mesoMapCenterSilhouetteFragments === true || shouldScale
            ? this.pageRectFromElement(root)
            : null;
        let offsetX = 0;
        let offsetY = 0;

        if (frameRect) {
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            lineRects.forEach((rect) => {
                minX = Math.min(minX, rect.left);
                maxX = Math.max(maxX, rect.left + rect.width);
                minY = Math.min(minY, rect.top);
                maxY = Math.max(maxY, rect.top + rect.height);
            });

            if (Number.isFinite(minX)) {
                const linesCx = (minX + maxX) / 2;
                const linesCy = (minY + maxY) / 2;
                const frameCx = frameRect.left + frameRect.width / 2;
                const frameCy = frameRect.top + frameRect.height / 2;
                offsetX = frameCx - linesCx;
                offsetY = frameCy - linesCy;
            }
        }

        const scaleAroundFrame = (rect) => {
            if (!frameRect || !shouldScale) return rect;
            const frameCx = frameRect.left + frameRect.width / 2;
            const frameCy = frameRect.top + frameRect.height / 2;
            return {
                left: frameCx + (rect.left - frameCx) * glyphScale,
                top: frameCy + (rect.top - frameCy) * glyphScale,
                width: rect.width * glyphScale,
                height: rect.height * glyphScale
            };
        };

        lineRects.forEach((pageRect) => {
            const adjustedRect = scaleAroundFrame({
                left: pageRect.left + offsetX,
                top: pageRect.top + offsetY,
                width: pageRect.width,
                height: pageRect.height
            });
            this.drawMapPageRect(ctx, t, adjustedRect, fill);
        });
    },

    drawSilhouettePath(ctx, t, pathEl, fill) {
        const d = pathEl.getAttribute('d');
        const ctm = pathEl.getScreenCTM?.();
        if (!d || !ctm) return false;

        const { scale, offsetX, offsetY, contentBounds } = t;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const minX = contentBounds.minX;
        const minY = contentBounds.minY;

        ctx.save();
        ctx.transform(
            scale * ctm.a,
            scale * ctm.b,
            scale * ctm.c,
            scale * ctm.d,
            offsetX + scale * (ctm.e + scrollX - minX),
            offsetY + scale * (ctm.f + scrollY - minY)
        );
        ctx.fillStyle = fill;
        ctx.fill(new Path2D(d));
        ctx.restore();
        return true;
    },

    drawMesoSilhouettes(ctx, t) {
        const style = this.getMapStyle();
        if (style.mesoMapUseFrameRects === true) {
            this.drawDepthMapMarkers(ctx, t, 2);
            return;
        }

        const defaultFill = style.mesoSilhouetteDetailFill
            ?? style.mesoLineFill
            ?? 'rgba(16, 16, 16, 0.62)';
        const mutedFill = style.mesoLineMutedFill ?? 'rgba(16, 16, 16, 0.14)';
        const focus = this.getBlockFocusState();
        const wrappers = this.getMapNoteWrappers();
        if (!wrappers.length) {
            this.drawDepthMapMarkers(ctx, t, 2);
            return;
        }

        wrappers.forEach((wrapper) => {
            const noteIndex = this.getWrapperNoteIndex(wrapper);
            if (noteIndex < 0) return;
            const focusColor = focus.active
                ? this.resolveNoteFocusColor(noteIndex, wrapper, focus.blocks)
                : null;
            const fill = focusColor || (focus.active ? mutedFill : defaultFill);
            const matchBlock = focus.active
                ? this.findPrimaryBlockForNote(noteIndex, wrapper, focus.blocks)
                : null;
            const scrollX = window.pageXOffset;
            const scrollY = window.pageYOffset;

            const frame = wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                || wrapper.querySelector('.meso-mock__frame');
            if (frame) {
                const lines = frame.querySelectorAll('.meso-mock__line, .meso-mock__rect');
                if (lines.length > 0) {
                    this.drawMesoLineRects(ctx, t, frame, fill);
                    if (matchBlock) {
                        const rect = wrapper.getBoundingClientRect();
                        this.drawFocusConnector(ctx, t, {
                            x: rect.left + rect.width / 2 + scrollX,
                            y: rect.top + rect.height / 2 + scrollY
                        }, matchBlock);
                    }
                    return;
                }
            }

            const pathEl = wrapper.querySelector('.meso-silhouette__shape');
            if (pathEl?.getAttribute('d') && this.drawSilhouettePath(ctx, t, pathEl, fill)) {
                if (matchBlock) {
                    const rect = wrapper.getBoundingClientRect();
                    this.drawFocusConnector(ctx, t, {
                        x: rect.left + rect.width / 2 + scrollX,
                        y: rect.top + rect.height / 2 + scrollY
                    }, matchBlock);
                }
                return;
            }

            if (style.mesoMapAllowFrameFallback !== true) return;

            const host = wrapper.querySelector('.depth-v2-glyph--meso');
            const pageRect = this.pageRectFromElement(host || wrapper);
            if (!pageRect) return;

            this.drawMapPageRect(ctx, t, pageRect, fill);
            if (matchBlock) {
                this.drawFocusConnector(ctx, t, {
                    x: pageRect.left + pageRect.width / 2,
                    y: pageRect.top + pageRect.height / 2
                }, matchBlock);
            }
        });

        if (focus.blocks.length) {
            this.drawActiveBlocks(ctx, t, focus.blocks);
        }
    },

    drawMicroNotes(ctx, t) {
        const style = this.getMapStyle();
        if (style.microMapDetailed !== true) {
            this.drawDepthMapMarkers(ctx, t, 3);
            return;
        }

        const cardFill = style.noteCardFill ?? '#ffffff';
        const cardMutedFill = style.noteCardMutedFill ?? 'rgba(255, 255, 255, 0.45)';
        const cardStroke = style.noteCardStroke ?? 'rgba(16, 16, 16, 0.22)';
        const blockFill = style.noteBlockFill ?? 'rgba(16, 16, 16, 0.72)';
        const blockMutedFill = style.noteBlockMutedFill ?? 'rgba(16, 16, 16, 0.16)';
        const minBlockH = style.noteBlockMinHeight ?? 0.75;
        const simplified = style.microMapDetailed !== true;
        const focus = this.getBlockFocusState();
        const cardInsetPx = Math.max(0, style.microMapCardInsetPx ?? 0);

        this.getMapNoteWrappers().forEach((wrapper) => {
            const noteIndex = this.getWrapperNoteIndex(wrapper);
            if (noteIndex < 0) return;
            const focusColor = focus.active
                ? this.resolveNoteFocusColor(noteIndex, wrapper, focus.blocks)
                : null;
            const matchBlock = focus.active
                ? this.findPrimaryBlockForNote(noteIndex, wrapper, focus.blocks)
                : null;
            const isFocused = !!focusColor;
            const resolvedCardFill = isFocused ? cardFill : (focus.active ? cardMutedFill : cardFill);
            const resolvedBlockFill = focusColor || (focus.active ? blockMutedFill : blockFill);
            const resolvedStroke = isFocused && focusColor
                ? focusColor
                : cardStroke;

            const card = simplified
                ? wrapper
                : (wrapper.querySelector('.micro-mock__card.note-card')
                    || wrapper.querySelector('.note-stage .layer-full .note-card')
                    || wrapper.querySelector('.depth-v2-glyph--micro .note-card'));
            const pageRect = this.pageRectFromElement(card);
            if (!pageRect) return;

            this.drawMapPageRectWithInset(ctx, t, pageRect, resolvedCardFill, cardInsetPx, simplified ? null : {
                color: resolvedStroke,
                width: isFocused ? 0.85 : 0.6
            });

            if (!simplified) {
                const cardEl = wrapper.querySelector('.micro-mock__card.note-card')
                    || wrapper.querySelector('.note-stage .layer-full .note-card')
                    || wrapper.querySelector('.depth-v2-glyph--micro .note-card');
                const titleRect = this.pageRectFromElement(cardEl?.querySelector('.note-title'));
                if (titleRect) {
                    this.drawMapPageRectWithInset(ctx, t, titleRect, resolvedBlockFill, cardInsetPx);
                }

                const bodyRect = this.pageRectFromElement(cardEl?.querySelector('.note-body'));
                if (bodyRect) {
                    this.drawMapPageRectWithInset(ctx, t, {
                        ...bodyRect,
                        height: Math.max(bodyRect.height, minBlockH)
                    }, resolvedBlockFill, cardInsetPx);
                }
            }

            if (matchBlock) {
                this.drawFocusConnector(ctx, t, {
                    x: pageRect.left + pageRect.width / 2,
                    y: pageRect.top + pageRect.height / 2
                }, matchBlock);
            }
        });

        if (focus.blocks.length) {
            this.drawActiveBlocks(ctx, t, focus.blocks);
        }
    },

    getCanvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },

    clampMapPan(panX, panY) {
        const base = this._baseTransform;
        if (!base) return { x: panX, y: panY };

        if (this.getMapStyle().viewportFollowClamp === false) {
            return { x: panX, y: panY };
        }

        const panBounds = base.panBounds || base.contentBounds;
        const vp = this.getMapViewportMarkerRect();
        const scrollPan = this.getScrollPanLimits(base, panBounds, base.scale, vp);
        if (!scrollPan) return { x: panX, y: panY };

        return {
            x: Math.max(scrollPan.minOffX - base.baseOffsetX, Math.min(scrollPan.maxOffX - base.baseOffsetX, panX)),
            y: Math.max(scrollPan.minOffY - base.baseOffsetY, Math.min(scrollPan.maxOffY - base.baseOffsetY, panY))
        };
    },

    mapPointToPage(mx, my, t, contentBounds) {
        const panBounds = t.panBounds || contentBounds;
        return {
            x: (mx - t.offsetX) / (t.scaleX ?? t.scale) + panBounds.minX,
            y: (my - t.offsetY) / (t.scaleY ?? t.scale) + panBounds.minY
        };
    },

    isPointInViewportRect(mx, my, vpTl, vpBr, padding = 4) {
        return mx >= vpTl.x - padding &&
            mx <= vpBr.x + padding &&
            my >= vpTl.y - padding &&
            my <= vpBr.y + padding;
    },

    scrollViewportTo(pageLeft, pageTop) {
        let dx = pageLeft - window.pageXOffset;
        let dy = pageTop - window.pageYOffset;
        this.scrollViewportBy(dx, dy);
    },

    scrollViewportBy(pageDx, pageDy) {
        let dx = pageDx;
        let dy = pageDy;
        [dx, dy] = SpatialNavigation.clampToContent(dx, dy);

        if (dx === 0 && dy === 0) return;

        SpatialNavigation.bypassScrollClamp(120);
        window.scrollBy({ left: dx, top: dy, behavior: 'auto' });
        IdleRefresh.touch();
    },

    handlePointerDown(e) {
        if (e.button !== 0) return;
        if (this.isInteractionBlocked()) return;
        if (SpatialNavigation.pan.active || ActionWarehouse.dragState) return;
        if (!this._baseTransform?.contentBounds) {
            this.render();
            if (!this._baseTransform?.contentBounds) return;
        }

        e.preventDefault();
        e.stopPropagation();

        this._navDragActive = true;
        this._drag = {
            active: true,
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            lastClientX: e.clientX,
            lastClientY: e.clientY,
            moved: false
        };

        this.mapsPanel?.classList.add('is-map-dragging');
        this._startDocumentDragListeners();
        if (this.mapWrap?.setPointerCapture) {
            try { this.mapWrap.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
    },

    _startDocumentDragListeners() {
        this._stopDocumentDragListeners();
        this._bindDragMove = (e) => this.handlePointerMove(e);
        this._bindDragEnd = (e) => this.handlePointerEnd(e);
        document.addEventListener('pointermove', this._bindDragMove);
        document.addEventListener('pointerup', this._bindDragEnd);
        document.addEventListener('pointercancel', this._bindDragEnd);
    },

    _stopDocumentDragListeners() {
        if (!this._bindDragMove) return;
        document.removeEventListener('pointermove', this._bindDragMove);
        document.removeEventListener('pointerup', this._bindDragEnd);
        document.removeEventListener('pointercancel', this._bindDragEnd);
        this._bindDragMove = null;
        this._bindDragEnd = null;
    },

    handlePointerMove(e) {
        if (this._drag?.active) {
            if (e.pointerId !== this._drag.pointerId) return;
            e.preventDefault();
            this.applyViewportDrag(e);
            return;
        }

        if (this.isInteractionBlocked() || !this._baseTransform) {
            if (this.mapWrap) this.mapWrap.style.cursor = 'default';
            return;
        }

        this.mapWrap.style.cursor = 'grab';
    },

    applyViewportDrag(e) {
        const drag = this._drag;
        if (!drag?.active || !this._baseTransform) return;

        const dx = e.clientX - drag.lastClientX;
        const dy = e.clientY - drag.lastClientY;
        if (dx === 0 && dy === 0) return;

        drag.lastClientX = e.clientX;
        drag.lastClientY = e.clientY;

        if (Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY) >= 3) {
            drag.moved = true;
        }

        const scale = Math.max(1e-6, this._baseTransform.scale);
        this.scrollViewportBy(-dx / scale, -dy / scale);
        this.updatePanFromViewport(true);
    },

    syncPanFromViewportDuringDrag() {
        this.updatePanFromViewport(true);
    },

    handlePointerEnd(e) {
        if (!this._drag?.active || e.pointerId !== this._drag.pointerId) return;

        const drag = this._drag;
        if (!drag.moved) {
            const t = this.getEffectiveTransform();
            const contentBounds = this._baseTransform?.contentBounds;
            if (t && contentBounds) {
                const rect = this.canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const page = this.mapPointToPage(mx, my, t, contentBounds);
                const vp = this.getMapViewportMarkerRect();
                this.scrollViewportTo(page.x - vp.width / 2, page.y - vp.height / 2);
            }
        }

        this._drag = null;
        this._navDragActive = false;
        this._stopDocumentDragListeners();
        this.mapsPanel?.classList.remove('is-map-dragging');
        if (this.mapWrap?.releasePointerCapture) {
            try { this.mapWrap.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
        this.syncActiveState(this._activeLevel);
        this.updatePanFromViewport();
    }
};
