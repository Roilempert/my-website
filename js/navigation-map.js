/* ==========================================================================
   05b. NAVIGATION MAP — layer titles (right) + single active minimap (3×2 grid)
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

    init() {
        const cfg = CONFIG.navigationMap;
        if (!cfg) return;

        const root = document.documentElement;
        if (cfg.layerGap) {
            root.style.setProperty('--nav-layer-gap', siteGridCssLength(cfg.layerGap));
        }

        const layersPanel = document.createElement('nav');
        layersPanel.id = 'site-navigation-layers';
        layersPanel.className = 'site-navigation-layers';
        layersPanel.dataset.siteLayer = 'navigationLayers';
        layersPanel.setAttribute('dir', 'rtl');
        layersPanel.setAttribute('aria-label', 'שכבות עומק');

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
            const title = document.createElement('span');
            title.className = 'site-navigation-layers__title';
            title.dataset.level = String(level);
            title.textContent = cfg.labels?.[level] || `L${level}`;
            layersPanel.appendChild(title);
            this.titles.set(level, title);
        });

        canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));

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
        this.syncActiveState(level);
        this.scheduleRender();
    },

    syncActiveState(level) {
        const blocked = this.isInteractionBlocked();
        this.layersPanel?.classList.toggle('is-dimmed', blocked);
        this.mapsPanel?.classList.toggle('is-dimmed', blocked);

        this.titles.forEach((title, rowLevel) => {
            const isActive = rowLevel === level;
            title.classList.toggle('is-active', isActive);
            title.classList.toggle('is-inactive', !isActive);
        });

        if (this.canvas) {
            this.canvas.style.cursor = blocked ? 'default' : 'crosshair';
        }
    },

    isInteractionBlocked() {
        return SpatialNavigation.isPaused ||
            ArtifactInspector.isActive ||
            DepthController.isAnyTransitionActive();
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
        }

        this.ctx = this.canvas.getContext('2d');
        if (this.ctx) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
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

        let offsetX = inset + (innerW - drawW) / 2;
        let offsetY = inset + (innerH - drawH) / 2;

        const vpLeft = offsetX + (viewport.left - contentBounds.minX) * scale;
        const vpTop = offsetY + (viewport.top - contentBounds.minY) * scale;
        const vpRight = offsetX + (viewport.left + viewport.width - contentBounds.minX) * scale;
        const vpBottom = offsetY + (viewport.top + viewport.height - contentBounds.minY) * scale;

        let panX = 0;
        let panY = 0;

        if (vpLeft < inset) panX = inset - vpLeft;
        else if (vpRight > canvasW - inset) panX = (canvasW - inset) - vpRight;

        if (vpTop < inset) panY = inset - vpTop;
        else if (vpBottom > canvasH - inset) panY = (canvasH - inset) - vpBottom;

        offsetX += panX;
        offsetY += panY;

        const minOffX = inset + innerW - drawW;
        const minOffY = inset + innerH - drawH;
        offsetX = Math.max(minOffX, Math.min(inset, offsetX));
        offsetY = Math.max(minOffY, Math.min(inset, offsetY));

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

            ctx.strokeStyle = '#101010';
            ctx.lineWidth = 1.25;
            ctx.strokeRect(vpTl.x, vpTl.y, vpBr.x - vpTl.x, vpBr.y - vpTl.y);

            ctx.restore();

            this._lastTransform = { contentBounds, t, level, vp };
        } catch (err) {
            console.warn('NavigationMap.render failed:', err);
        }
    },

    handlePointerDown(e) {
        if (this.isInteractionBlocked()) return;
        if (SpatialNavigation.pan.active || ActionWarehouse.dragState) return;
        if (!this._lastTransform) return;

        const level = this._activeLevel;
        const { t } = this._lastTransform;
        const { contentBounds } = t;

        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const nx = (mx - t.offsetX) / t.scale + contentBounds.minX;
        const ny = (my - t.offsetY) / t.scale + contentBounds.minY;

        const vp = SpatialNavigation.getViewportPageRect(level);
        const targetLeft = nx - vp.width / 2;
        const targetTop = ny - vp.height / 2;

        SpatialNavigation.bypassScrollClamp(80);
        window.scrollBy({
            left: targetLeft - window.pageXOffset,
            top: targetTop - window.pageYOffset,
            behavior: 'auto'
        });
        IdleRefresh.touch();
        this.scheduleRender();
    }
};
