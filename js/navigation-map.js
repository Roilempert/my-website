/* ==========================================================================
   05b. SITE NAVIGATION — layer labels (top-right) + minimap (bottom-right)
   Two separate UI parts; see CONFIG.layerNavigation vs CONFIG.navigationMap.
   ========================================================================== */
const NavigationMap = {
    layersPanel: null,
    mapsPanel: null,
    titles: new Map(),
    canvas: null,
    mapWrap: null,
    ctx: null,
    _lastTransform: null,
    _renderScheduled: false,
    _rafId: null,
    _resizeObserver: null,
    _activeLevel: 1,
    _drag: null,
    _mapPanX: 0,
    _mapPanY: 0,

    init() {
        const layerCfg = CONFIG.layerNavigation;
        const mapCfg = CONFIG.navigationMap;
        if (!layerCfg && !mapCfg) return;

        const root = document.documentElement;
        if (layerCfg?.gap) {
            root.style.setProperty('--layer-nav-gap', siteGridCssLength(layerCfg.gap));
        }
        if (layerCfg?.typeSize) {
            root.style.setProperty('--layer-nav-type-size', siteGridCssLength(layerCfg.typeSize));
        }
        if (layerCfg?.typeLine != null) {
            root.style.setProperty('--layer-nav-type-line', String(layerCfg.typeLine));
        }
        if (layerCfg?.typeWeight != null) {
            root.style.setProperty('--layer-nav-type-weight', String(layerCfg.typeWeight));
        }
        if (layerCfg?.typeWeightActive != null) {
            root.style.setProperty('--layer-nav-type-weight-active', String(layerCfg.typeWeightActive));
        }
        const indentCols = layerCfg?.indentColumns ?? 0.5;
        const activeIndentCols = layerCfg?.activeIndentColumns ?? indentCols;
        const hoverIndentCols = layerCfg?.hoverIndentColumns ?? indentCols;
        root.style.setProperty(
            '--layer-nav-active-indent',
            `calc(${activeIndentCols} * var(--site-grid-cell-w))`
        );
        root.style.setProperty(
            '--layer-nav-hover-indent',
            `calc(${hoverIndentCols} * var(--site-grid-cell-w))`
        );
        if (layerCfg?.rowGap) {
            root.style.setProperty('--layer-nav-row-gap', siteGridCssLength(layerCfg.rowGap));
        }
        if (layerCfg?.slotMoveDuration != null) {
            root.style.setProperty('--layer-nav-slot-duration', `${layerCfg.slotMoveDuration}s`);
        }
        if (layerCfg?.slotMoveEasing) {
            root.style.setProperty('--layer-nav-slot-easing', layerCfg.slotMoveEasing);
        }
        const anchorRow = Math.max(1, layerCfg?.anchorRow ?? 1);
        root.style.setProperty(
            '--layer-nav-anchor-top',
            `calc(${anchorRow} * var(--site-grid-cell-h) + ${anchorRow - 1} * var(--site-grid-gap))`
        );
        root.style.setProperty(
            '--layer-nav-slot-base-top',
            `calc(var(--site-grid-padding) + ${anchorRow} * var(--site-grid-cell-h) + ${anchorRow - 1} * var(--site-grid-gap))`
        );
        if (layerCfg?.inactiveOpacity != null) {
            root.style.setProperty('--layer-nav-inactive-opacity', String(layerCfg.inactiveOpacity));
        }
        if (layerCfg?.hitAreaPadding) {
            root.style.setProperty('--layer-nav-hit-pad', siteGridCssLength(layerCfg.hitAreaPadding));
        }

        const layersPanel = document.createElement('nav');
        layersPanel.id = 'site-navigation-layers';
        layersPanel.className = 'site-navigation-layers';
        layersPanel.dataset.siteLayer = 'navigationLayers';
        layersPanel.setAttribute('dir', 'rtl');
        layersPanel.setAttribute('aria-label', 'שכבות עומק');
        layersPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
        layersPanel.addEventListener('click', (e) => e.stopPropagation());

        const mapsPanel = document.createElement('aside');
        mapsPanel.id = 'site-navigation-maps';
        mapsPanel.className = 'site-navigation-maps';
        mapsPanel.dataset.siteLayer = 'navigationMaps';
        mapsPanel.setAttribute('aria-label', 'מפת ניווט');

        const mapWrap = document.createElement('div');
        mapWrap.className = 'site-navigation-maps__map-wrap';

        const canvas = document.createElement('canvas');
        canvas.className = 'site-navigation-maps__map';
        canvas.setAttribute('aria-hidden', 'true');
        mapWrap.appendChild(canvas);
        mapsPanel.appendChild(mapWrap);

        [1, 2, 3].forEach((level) => {
            const title = document.createElement('button');
            title.type = 'button';
            title.className = 'site-navigation-layers__title';
            title.dataset.level = String(level);
            const label = document.createElement('span');
            label.className = 'site-navigation-layers__label';
            label.textContent = layerCfg?.labels?.[level] || `L${level}`;
            title.appendChild(label);
            title.addEventListener('pointerdown', (e) => e.stopPropagation());
            title.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateToLayer(level);
            });
            layersPanel.appendChild(title);
            this.titles.set(level, title);
        });

        canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));

        document.body.appendChild(layersPanel);
        document.body.appendChild(mapsPanel);
        document.body.classList.add('has-site-navigation');

        this.layersPanel = layersPanel;
        this.mapsPanel = mapsPanel;
        this.mapWrap = mapWrap;
        this.canvas = canvas;
        this._activeLevel = DepthController.currentLevel;

        window.addEventListener('scroll', () => this.scheduleRender(), { passive: true });
        window.addEventListener('resize', () => this.scheduleRender());

        this._resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
            this.scheduleRender();
        });
        this._resizeObserver.observe(mapsPanel);

        this.syncActiveState(this._activeLevel);
        this.resizeCanvas();
        this.scheduleRender();
        this.startMacroLoop();
    },

    onLevelChange(level) {
        this._activeLevel = level;
        this.resetMapPan();
        this.syncActiveState(level);
        this.scheduleRender();
    },

    resetMapPan() {
        this._mapPanX = 0;
        this._mapPanY = 0;
    },

    getSlotForLevel(level, activeLevel) {
        return level - activeLevel;
    },

    applyLayerSlot(title, slot) {
        title.dataset.slot = String(slot);
        title.style.setProperty('--layer-nav-slot', String(slot));
    },

    syncActiveState(level) {
        const transitionActive = this.isTransitionActive();
        const dimmed = transitionActive ||
            (level === 1 &&
                typeof ArtifactInspector !== 'undefined' &&
                ArtifactInspector.isActive);
        this.layersPanel?.classList.toggle('is-dimmed', dimmed);
        this.mapsPanel?.classList.toggle('is-dimmed', dimmed);

        this.titles.forEach((title, rowLevel) => {
            const isActive = rowLevel === level;
            const slot = this.getSlotForLevel(rowLevel, level);
            this.applyLayerSlot(title, slot);
            title.classList.toggle('is-active', isActive);
            title.classList.toggle('is-inactive', !isActive);
            title.setAttribute('aria-current', isActive ? 'true' : 'false');
            title.disabled = transitionActive;
        });

        if (this.canvas && !this._drag?.active) {
            this.canvas.style.cursor = dimmed ? 'default' : 'grab';
        }
    },

    isTransitionActive() {
        return SpatialNavigation.isPaused ||
            DepthController.isAnyTransitionActive();
    },

    isTransitionBlocked() {
        return this.isTransitionActive();
    },

    isInteractionBlocked() {
        return this.isTransitionBlocked() ||
            (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive);
    },

    navigateToLayer(level) {
        const target = Number(level);
        if (!Number.isFinite(target) || target < 1 || target > 3) return;
        if (this.isTransitionActive()) return;
        if (target === this._activeLevel) return;

        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }

        DepthController.changeLevel(target);
    },

    scheduleRender() {
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        requestAnimationFrame(() => {
            this._renderScheduled = false;
            this.render();
        });
    },

    startMacroLoop() {
        let lastTick = 0;
        const intervalMs = CONFIG.navigationMap?.macroRefreshMs ?? 120;

        const tick = (now) => {
            if (
                this._activeLevel === 1 &&
                !this.isInteractionBlocked() &&
                now - lastTick >= intervalMs
            ) {
                lastTick = now;
                try {
                    this.render();
                } catch (err) {
                    console.warn('NavigationMap.render failed:', err);
                }
            }
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    },

    resizeCanvas() {
        if (!this.canvas || !this.mapWrap) return;

        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(this.mapWrap.clientWidth));
        const h = Math.max(1, Math.floor(this.mapWrap.clientHeight));
        const bw = Math.floor(w * dpr);
        const bh = Math.floor(h * dpr);

        if (this.canvas.width !== bw || this.canvas.height !== bh) {
            this.canvas.width = bw;
            this.canvas.height = bh;
            this.resetMapPan();
        }

        this.ctx = this.canvas.getContext('2d');
        if (this.ctx) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    },

    getMapPanLimits(baseOffsetX, baseOffsetY, drawW, drawH, innerW, innerH, inset) {
        const minOffX = inset + innerW - drawW;
        const minOffY = inset + innerH - drawH;
        return {
            minPanX: minOffX - baseOffsetX,
            maxPanX: inset - baseOffsetX,
            minPanY: minOffY - baseOffsetY,
            maxPanY: inset - baseOffsetY
        };
    },

    computeTransform(contentBounds, viewport, canvasW, canvasH) {
        const inset = CONFIG.navigationMap?.frameInset ?? 2;
        const innerW = Math.max(1, canvasW - inset * 2);
        const innerH = Math.max(1, canvasH - inset * 2);
        const worldW = Math.max(1, contentBounds.maxX - contentBounds.minX);
        const worldH = Math.max(1, contentBounds.maxY - contentBounds.minY);

        // Cover — world fills frame on two sides; excess clips at edges
        const scale = Math.max(innerW / worldW, innerH / worldH);
        const drawW = worldW * scale;
        const drawH = worldH * scale;

        const baseOffsetX = inset + (innerW - drawW) / 2;
        const baseOffsetY = inset + (innerH - drawH) / 2;
        const limits = this.getMapPanLimits(
            baseOffsetX, baseOffsetY, drawW, drawH, innerW, innerH, inset
        );

        this._mapPanX = Math.max(limits.minPanX, Math.min(limits.maxPanX, this._mapPanX));
        this._mapPanY = Math.max(limits.minPanY, Math.min(limits.maxPanY, this._mapPanY));

        let offsetX = baseOffsetX + this._mapPanX;
        let offsetY = baseOffsetY + this._mapPanY;

        const vpLeft = offsetX + (viewport.left - contentBounds.minX) * scale;
        const vpTop = offsetY + (viewport.top - contentBounds.minY) * scale;
        const vpRight = offsetX + (viewport.left + viewport.width - contentBounds.minX) * scale;
        const vpBottom = offsetY + (viewport.top + viewport.height - contentBounds.minY) * scale;

        let deltaPanX = 0;
        let deltaPanY = 0;

        if (vpLeft < inset) deltaPanX = inset - vpLeft;
        else if (vpRight > canvasW - inset) deltaPanX = (canvasW - inset) - vpRight;

        if (vpTop < inset) deltaPanY = inset - vpTop;
        else if (vpBottom > canvasH - inset) deltaPanY = (canvasH - inset) - vpBottom;

        if (deltaPanX !== 0 || deltaPanY !== 0) {
            this._mapPanX = Math.max(
                limits.minPanX,
                Math.min(limits.maxPanX, this._mapPanX + deltaPanX)
            );
            this._mapPanY = Math.max(
                limits.minPanY,
                Math.min(limits.maxPanY, this._mapPanY + deltaPanY)
            );
            offsetX = baseOffsetX + this._mapPanX;
            offsetY = baseOffsetY + this._mapPanY;
        }

        const toMap = (pageX, pageY) => ({
            x: offsetX + (pageX - contentBounds.minX) * scale,
            y: offsetY + (pageY - contentBounds.minY) * scale
        });

        return {
            scale,
            offsetX,
            offsetY,
            drawW,
            drawH,
            toMap,
            contentBounds
        };
    },

    render() {
        if (!this.canvas || !this.ctx) return;

        try {
            this.syncActiveState(this._activeLevel);
            const level = this._activeLevel;

            const cssW = this.canvas.clientWidth;
            const cssH = this.canvas.clientHeight;
            if (cssW < 1 || cssH < 1) return;

            const contentBounds = SpatialNavigation.getContentBoundsForLevel(level);
            if (!contentBounds) return;

            const vp = SpatialNavigation.getViewportPageRect(level);
            const t = this.computeTransform(contentBounds, vp, cssW, cssH);
            const { ctx } = this;

            ctx.clearRect(0, 0, cssW, cssH);
            ctx.fillStyle = '#e8e8e8';
            ctx.fillRect(0, 0, cssW, cssH);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, cssW, cssH);
            ctx.clip();

            const worldTl = t.toMap(t.contentBounds.minX, t.contentBounds.minY);
            const worldBr = t.toMap(t.contentBounds.maxX, t.contentBounds.maxY);
            ctx.fillStyle = '#fafafa';
            ctx.fillRect(
                worldTl.x,
                worldTl.y,
                worldBr.x - worldTl.x,
                worldBr.y - worldTl.y
            );

            const markers = SpatialNavigation.getContentMarkersForLevel(level);
            ctx.fillStyle = 'rgba(16, 16, 16, 0.4)';
            markers.forEach(({ x, y }) => {
                const p = t.toMap(x, y);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            });

            const vpTl = t.toMap(vp.left, vp.top);
            const vpBr = t.toMap(vp.left + vp.width, vp.top + vp.height);
            const vpW = vpBr.x - vpTl.x;
            const vpH = vpBr.y - vpTl.y;

            ctx.fillStyle = 'rgba(16, 16, 16, 0.07)';
            ctx.fillRect(vpTl.x, vpTl.y, vpW, vpH);

            ctx.strokeStyle = '#101010';
            ctx.lineWidth = 1.25;
            ctx.strokeRect(vpTl.x, vpTl.y, vpW, vpH);

            ctx.restore();

            this._lastTransform = { contentBounds, t, level, vp, vpTl, vpBr };
        } catch (err) {
            console.warn('NavigationMap.render failed:', err);
        }
    },

    getCanvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },

    mapPointToPage(mx, my, t, contentBounds) {
        return {
            x: (mx - t.offsetX) / t.scale + contentBounds.minX,
            y: (my - t.offsetY) / t.scale + contentBounds.minY
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
        [dx, dy] = SpatialNavigation.clampToContent(dx, dy);

        if (dx === 0 && dy === 0) return;

        SpatialNavigation.bypassScrollClamp(120);
        window.scrollBy({ left: dx, top: dy, behavior: 'auto' });
        IdleRefresh.touch();
        this.scheduleRender();
    },

    handlePointerDown(e) {
        if (e.button !== 0) return;
        if (this.isInteractionBlocked()) return;
        if (SpatialNavigation.pan.active || ActionWarehouse.dragState) return;
        if (!this._lastTransform) return;

        e.preventDefault();

        const { vpTl, t, contentBounds } = this._lastTransform;
        const { x: mx, y: my } = this.getCanvasPoint(e);
        const pageCursor = this.mapPointToPage(mx, my, t, contentBounds);
        const vp = SpatialNavigation.getViewportPageRect(this._activeLevel);

        this._drag = {
            active: true,
            pointerId: e.pointerId,
            startX: mx,
            startY: my,
            moved: false,
            grabPageOffsetX: pageCursor.x - vp.left,
            grabPageOffsetY: pageCursor.y - vp.top
        };

        this.canvas.style.cursor = 'grabbing';
        this._startDocumentDragListeners();
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    },

    _startDocumentDragListeners() {
        if (this._bindDragMove) return;
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
            this.applyViewportDrag(e);
            return;
        }

        if (this.isInteractionBlocked() || !this._lastTransform?.vpTl) {
            if (this.canvas) this.canvas.style.cursor = 'default';
            return;
        }

        this.canvas.style.cursor = 'grab';
    },

    applyViewportDrag(e) {
        const drag = this._drag;
        if (!drag?.active || !this._lastTransform) return;

        const { x: mx, y: my } = this.getCanvasPoint(e);
        if (Math.hypot(mx - drag.startX, my - drag.startY) < 3) return;

        drag.moved = true;

        const { t, contentBounds } = this._lastTransform;
        const pageCursor = this.mapPointToPage(mx, my, t, contentBounds);

        this.scrollViewportTo(
            pageCursor.x - drag.grabPageOffsetX,
            pageCursor.y - drag.grabPageOffsetY
        );
    },

    handlePointerEnd(e) {
        if (!this._drag?.active || e.pointerId !== this._drag.pointerId) return;

        const drag = this._drag;
        if (!drag.moved && this._lastTransform) {
            const { t, contentBounds } = this._lastTransform;
            const { x: mx, y: my } = this.getCanvasPoint(e);
            const page = this.mapPointToPage(mx, my, t, contentBounds);
            const vp = SpatialNavigation.getViewportPageRect(this._activeLevel);
            this.scrollViewportTo(page.x - vp.width / 2, page.y - vp.height / 2);
        }

        this._drag = null;
        this._stopDocumentDragListeners();
        if (this.canvas.releasePointerCapture) {
            try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
        this.syncActiveState(this._activeLevel);
        this.scheduleRender();
    }
};
