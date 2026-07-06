/* opening build 20260706192854 */
/* ==========================================================================
   Opening Background — L1-style molecules with fold-mirror symmetry
   Tag colors from the data sheet; dots + sibling links + subtle hull outline.
   Experience L1/L3: optional SVG displacement grain (pixel warp, no color tint).
   ========================================================================== */
const OpeningBackground = {
    _surfaces: new Map(),
    _mounted: false,
    _resizeObserver: null,
    _resizeScheduled: false,
    _rafId: null,
    _w: 0,
    _h: 0,
    _layoutSeed: null,
    _drawBlobs: null,
    _grainCanvas: null,
    _contentBuffer: null,
    _contentBufferCtx: null,
    _contentBufferDpr: 0,
    _blurBuffer: null,
    _blurBufferCtx: null,
    _blurBufferDpr: 0,
    _cachedHullColor: null,
    _pointerClient: { x: 0, y: 0 },
    _pointerActive: false,
    _pointerRoot: null,
    _boundPointerMove: null,
    _boundPointerLeave: null,
    _displaceRaf: null,
    _displaceSeed: 1,
    _lastPaintAt: 0,
    _paintPending: false,
    _artReady: false,

    _usesGrainDisplacement() {
        const cfg = this._siteCfg();
        return cfg.enabled !== false
            && cfg.washOverContent
            && cfg.grainMode === 'displace';
    },

    _siteCfg() {
        return CONFIG?.siteBackground || {};
    },

    _openingCfg() {
        const base = this._siteCfg();
        const override = CONFIG?.opening?.background;
        if (override && typeof override === 'object') {
            return { ...base, ...override };
        }
        return base;
    },

    _hostRole(host) {
        if (host?.classList?.contains('opening-screen__art') || host?.closest?.('#opening-screen')) {
            return 'full';
        }
        if (host?.id === 'site-background-wash') return 'wash';
        if (host?.id === 'site-background') {
            return this._siteCfg().washOverContent ? 'base' : 'full';
        }
        return 'full';
    },

    cfg(host) {
        const role = this._hostRole(host);
        return role === 'full' && (host?.classList?.contains('opening-screen__art')
            || host?.closest?.('#opening-screen'))
            ? this._openingCfg()
            : this._siteCfg();
    },

    _skipBlobs(role, host) {
        if (role === 'wash' || role === 'base') return true;
        if (role === 'full') {
            return this.cfg(host).mode === 'grain';
        }
        const siteCfg = this._siteCfg();
        if (siteCfg.showBlobs === false) return true;
        return siteCfg.mode === 'grain';
    },

    _shouldBuildBlobs() {
        for (const surface of this._surfaces.values()) {
            if (surface.role === 'full' && this.cfg(surface.host).mode !== 'grain') {
                return true;
            }
        }
        return false;
    },

    _blobCfg() {
        for (const surface of this._surfaces.values()) {
            if (surface.role === 'full') return this.cfg(surface.host);
        }
        return this._siteCfg();
    },

    _freshSeed() {
        return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
    },

    _resolveSeed() {
        const seed = this._siteCfg().seed;
        if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
        return this._freshSeed();
    },

    _rand(seed) {
        let s = seed >>> 0;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    },

    _parseColorRgb(color) {
        const raw = String(color || '').trim();
        if (raw.startsWith('#')) {
            const hex = raw.slice(1);
            if (hex.length === 3) {
                return {
                    r: parseInt(hex[0] + hex[0], 16),
                    g: parseInt(hex[1] + hex[1], 16),
                    b: parseInt(hex[2] + hex[2], 16)
                };
            }
            const n = parseInt(hex, 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }

        const rgb = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
        if (rgb) {
            return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
        }

        return { r: 45, g: 45, b: 45 };
    },

    _darkenColor(color, amount = 0.35) {
        const { r, g, b } = this._parseColorRgb(color);
        const f = 1 - amount;
        const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
        const toHex = (v) => clamp(v).toString(16).padStart(2, '0');
        return `#${toHex(r * f)}${toHex(g * f)}${toHex(b * f)}`;
    },

    _moleculeGlowColors(blob) {
        const core = blob.pts?.[0]?.color || this._hullStrokeColor();
        return { core, edge: this._darkenColor(core, 0.42) };
    },

    _resolveTagColor(color) {
        const raw = String(color || '').trim();
        if (!raw) return this._hullStrokeColor();
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) return raw;

        const varMatch = raw.match(/var\(\s*(--[^,)]+)/);
        if (varMatch) {
            const resolved = getComputedStyle(document.documentElement)
                .getPropertyValue(varMatch[1]).trim();
            if (resolved) return resolved;
        }

        return this._hullStrokeColor();
    },

    _resolveCssColor(token, fallback = '#2D2D2D') {
        const raw = String(token || '').trim();
        if (!raw) return fallback;
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return raw;

        const varName = raw.startsWith('var(')
            ? raw.match(/var\(\s*(--[^,)]+)/)?.[1]
            : raw;
        if (varName?.startsWith('--')) {
            const resolved = getComputedStyle(document.documentElement)
                .getPropertyValue(varName).trim();
            if (resolved) return resolved;
        }

        return fallback;
    },

    _hullStrokeColor() {
        if (this._cachedHullColor) return this._cachedHullColor;

        const cssVar = CONFIG?.warehouse?.linkage?.line?.cssColorVariable || '--main-text';
        this._cachedHullColor = getComputedStyle(document.documentElement)
            .getPropertyValue(cssVar).trim() || '#101010';
        return this._cachedHullColor;
    },

    _getNoteItems() {
        if (typeof OpeningData !== 'undefined' && OpeningData.items?.length) {
            return OpeningData.items;
        }
        if (typeof AppState !== 'undefined' && AppState.items?.length) {
            return AppState.items;
        }
        return [];
    },

    _openingColorPool: null,
    _openingColorCursor: 0,
    _openingMoleculePlan: null,

    _isOpeningArt() {
        for (const surface of this._surfaces.values()) {
            const host = surface.host;
            if (host?.classList?.contains('opening-screen__art') || host?.closest?.('#opening-screen')) {
                return true;
            }
        }
        return false;
    },

    _resetOpeningColorPool() {
        this._openingColorPool = null;
        this._openingColorCursor = 0;
        this._openingMoleculePlan = null;
    },

    _mirrorDivisor(cfg) {
        return (cfg.mirrorFolds ?? 2) >= 2 ? 4 : 1;
    },

    _prepareOpeningMoleculePlan(cfg) {
        if (this._openingMoleculePlan?.length) return;

        const paletteLen = this._getTagColorEntries().length;
        if (!paletteLen) return;

        const mirrorDiv = this._mirrorDivisor(cfg);
        const dotMin = cfg.dotCountMin ?? 2;
        const dotMax = cfg.dotCountMax ?? 5;
        const maxUnique = Math.max(1, Math.ceil((cfg.blobCount ?? 8) / mirrorDiv));
        const pillUnique = Math.max(0, Math.ceil((cfg.pillCount ?? 0) / mirrorDiv));
        const maxDotSlots = maxUnique * dotMax + pillUnique;
        let remaining = Math.min(paletteLen, maxDotSlots) - pillUnique;
        remaining = Math.max(0, remaining);
        const plan = [];
        const rand = this._rand((this._layoutSeed ^ 0xC0FFEE) >>> 0);

        while (remaining > 0 && plan.length < maxUnique) {
            if (remaining < dotMin) {
                if (plan.length) {
                    plan[plan.length - 1] += remaining;
                } else {
                    plan.push(remaining);
                }
                break;
            }

            let dots;
            if (remaining <= dotMax || plan.length === maxUnique - 1) {
                dots = Math.min(dotMax, remaining);
            } else {
                dots = Math.floor(rand() * (dotMax - dotMin + 1)) + dotMin;
            }

            plan.push(dots);
            remaining -= dots;
        }

        this._openingMoleculePlan = plan;
    },

    _prepareOpeningColorPool() {
        if (this._openingColorPool?.length) return;

        const palette = this._getTagColorEntries();
        if (this._isOpeningArt() && !palette.length) return;

        const fallback = this._resolveTagColor(CONFIG?.data?.fallbackTagColor);
        const pool = palette.length ? [...palette] : [fallback];
        const rand = this._rand((this._layoutSeed ^ 0x9E3779B9) >>> 0);

        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        this._openingColorPool = pool;
        this._openingColorCursor = 0;
    },

    _takeOpeningColors(count) {
        this._prepareOpeningColorPool();
        const colors = [];
        const pool = this._openingColorPool;
        let cursor = this._openingColorCursor;

        for (let i = 0; i < count; i++) {
            if (cursor >= pool.length) {
                console.warn('OpeningBackground: tag color pool exhausted, reusing from start');
                cursor = 0;
            }
            colors.push(pool[cursor++]);
        }

        this._openingColorCursor = cursor;
        return colors;
    },

    _getTagColorEntries() {
        const map = (typeof OpeningData !== 'undefined' && OpeningData.tagColorsMap?.size)
            ? OpeningData.tagColorsMap
            : (typeof AppState !== 'undefined' ? AppState.tagColorsMap : null);

        if (!map?.size) return [];

        const colors = [];
        const hullFallback = this._hullStrokeColor();
        map.forEach((color) => {
            const resolved = this._resolveTagColor(color);
            if (!resolved || resolved === hullFallback) return;
            if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(resolved)) return;
            if (!colors.includes(resolved)) colors.push(resolved);
        });
        return colors;
    },

    _isOpeningArtHost(host) {
        return !!(host?.classList?.contains('opening-screen__art')
            || host?.closest?.('#opening-screen'));
    },

    _shouldDeferOpeningBlobs() {
        return this._isOpeningArt()
            && this._shouldBuildBlobs()
            && !this._getTagColorEntries().length;
    },

    _sampleMoleculeSpec(rand, cfg, moleculeIndex = 0) {
        const dotMin = cfg.dotCountMin ?? 1;
        const dotMax = cfg.dotCountMax ?? 5;

        if (this._isOpeningArt()) {
            this._prepareOpeningMoleculePlan(cfg);
            const plan = this._openingMoleculePlan;
            const dotCount = plan?.[moleculeIndex]
                ?? (Math.floor(rand() * (dotMax - dotMin + 1)) + dotMin);
            const palette = this._getTagColorEntries();
            const fallback = this._resolveTagColor(CONFIG?.data?.fallbackTagColor);
            const colors = [];
            for (let i = 0; i < dotCount; i++) {
                colors.push(palette.length ? palette[Math.floor(rand() * palette.length)] : fallback);
            }
            return { dotCount, colors };
        }

        const items = this._getNoteItems().filter((item) => item.tags?.length);

        if (items.length) {
            const item = items[Math.floor(rand() * items.length)];
            const dotCount = Math.min(dotMax, Math.max(dotMin, item.tags.length));
            const colors = [];
            for (let i = 0; i < dotCount; i++) {
                colors.push(this._resolveTagColor(item.tags[i % item.tags.length].color));
            }
            return { dotCount, colors };
        }

        const palette = this._getTagColorEntries();
        const dotCount = Math.floor(rand() * (dotMax - dotMin + 1)) + dotMin;
        if (palette.length) {
            const colors = [];
            for (let i = 0; i < dotCount; i++) {
                colors.push(palette[Math.floor(rand() * palette.length)]);
            }
            return { dotCount, colors };
        }

        const fallback = this._resolveTagColor(CONFIG?.data?.fallbackTagColor);
        return {
            dotCount: Math.floor(rand() * (dotMax - dotMin + 1)) + dotMin,
            colors: [fallback]
        };
    },

    _samplePillTagColor(rand) {
        const items = this._getNoteItems().filter((item) => item.tags?.length);
        if (items.length) {
            const item = items[Math.floor(rand() * items.length)];
            const tag = item.tags[Math.floor(rand() * item.tags.length)];
            return this._resolveTagColor(tag.color);
        }

        const palette = this._getTagColorEntries();
        if (palette.length) {
            return palette[Math.floor(rand() * palette.length)];
        }

        return this._resolveTagColor(CONFIG?.data?.fallbackTagColor);
    },

    _applyTagColorsToBlobs(cfg, blobs = this._drawBlobs) {
        if (!blobs?.length) return;

        const openingUnique = this._isOpeningArt()
            || document.body.classList.contains('opening-page');
        if (openingUnique) {
            this._openingColorPool = null;
            this._openingColorCursor = 0;
        }

        const specs = new Map();
        for (let i = 0; i < blobs.length; i++) {
            const blob = blobs[i];
            if (blob.kind === 'pill') continue;

            const idx = blob.moleculeIndex ?? 0;
            if (!specs.has(idx)) {
                if (openingUnique) {
                    const dotCount = blob.pts?.length || 1;
                    specs.set(idx, {
                        dotCount,
                        colors: this._takeOpeningColors(dotCount)
                    });
                } else {
                    const rand = this._rand((this._layoutSeed + idx * 7919) >>> 0);
                    specs.set(idx, this._sampleMoleculeSpec(rand, cfg));
                }
            }

            const spec = specs.get(idx);
            blob.pts = blob.pts.map((p, j) => ({
                ...p,
                color: spec.colors[j % spec.colors.length]
            }));
        }

        const pillSpecs = new Map();
        for (let i = 0; i < blobs.length; i++) {
            const blob = blobs[i];
            if (blob.kind !== 'pill') continue;

            const idx = blob.pillIndex ?? 0;
            if (!pillSpecs.has(idx)) {
                if (openingUnique) {
                    pillSpecs.set(idx, this._takeOpeningColors(1)[0]);
                } else {
                    const rand = this._rand((this._layoutSeed + idx * 11003 + 50000) >>> 0);
                    pillSpecs.set(idx, this._samplePillTagColor(rand));
                }
            }
            blob.color = pillSpecs.get(idx);
        }
    },

    _convexHull(points) {
        const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                lower.pop();
            }
            lower.push(p);
        }

        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                upper.pop();
            }
            upper.push(p);
        }

        lower.pop();
        upper.pop();
        const hull = lower.concat(upper);
        return hull.length > 0 ? hull : [points[0]];
    },

    _traceHullOutlinePath(pts, R, ctx) {
        const hull = pts.length <= 2 ? pts : this._convexHull(pts);

        ctx.beginPath();
        if (hull.length === 1) {
            ctx.arc(hull[0].x, hull[0].y, R, 0, Math.PI * 2);
            return hull;
        }

        const n = hull.length;
        for (let i = 0; i < n; i++) {
            const prev = hull[(i - 1 + n) % n];
            const p = hull[i];
            const next = hull[(i + 1) % n];
            const a1 = Math.atan2(-(p.x - prev.x), p.y - prev.y);
            const a2 = Math.atan2(-(next.x - p.x), next.y - p.y);
            ctx.arc(p.x, p.y, R, a1, a2);
        }
        ctx.closePath();
        return hull;
    },

    _roundRectPath(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w * 0.5, h * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.arc(x + w - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + radius, y + h);
        ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
    },

    _buildPillBlock(cx, cy, minDim, rand, cfg, pillIndex) {
        const heightMin = minDim * (cfg.pillHeightMin ?? 0.024);
        const heightMax = minDim * (cfg.pillHeightMax ?? 0.04);
        const height = rand() * (heightMax - heightMin) + heightMin;
        const widthMinRatio = cfg.pillWidthMinRatio ?? 1.35;
        const widthMaxRatio = cfg.pillWidthMaxRatio ?? 3.2;
        const width = height * (widthMinRatio + rand() * (widthMaxRatio - widthMinRatio));
        const rotation = (rand() - 0.5) * (cfg.pillRotationMax ?? 0.45);
        const fillColor = this._resolveCssColor(cfg.pillFillColor ?? 'var(--color-3)');

        return {
            kind: 'pill',
            pillIndex,
            cx,
            cy,
            width,
            height,
            rotation,
            fillColor,
            color: this._resolveTagColor(CONFIG?.data?.fallbackTagColor),
            gradientR: Math.hypot(width, height) * 0.5
        };
    },

    _mirrorPillBlob(blob, axisX, axisY, flipX, flipY) {
        const mx = (v) => (flipX ? 2 * axisX - v : v);
        const my = (v) => (flipY ? 2 * axisY - v : v);
        let rotation = blob.rotation ?? 0;
        if (flipX) rotation = Math.PI - rotation;
        if (flipY) rotation = -rotation;

        return {
            ...blob,
            cx: mx(blob.cx),
            cy: my(blob.cy),
            rotation
        };
    },

    _buildMoleculeCluster(cx, cy, scale, rand, cfg, moleculeSpec) {
        const dotMin = cfg.dotCountMin ?? 1;
        const dotMax = cfg.dotCountMax ?? 5;
        const dotCount = moleculeSpec?.dotCount
            ?? (Math.floor(rand() * (dotMax - dotMin + 1)) + dotMin);
        const tagColors = moleculeSpec?.colors?.length
            ? moleculeSpec.colors
            : [this._resolveTagColor(CONFIG?.data?.fallbackTagColor)];
        const dotR = scale * (cfg.dotRadiusRatio ?? 0.4);
        const hullPad = cfg.hullPaddingPx ?? CONFIG?.outlines?.padding ?? 7;
        const membraneR = dotR + hullPad;
        const clusterBase = scale * (cfg.clusterBaseRatio ?? 0.38);
        const clusterPerDot = scale * (cfg.clusterPerDotRatio ?? 0.004);
        const clusterRadius = dotCount === 1 ? 0 : clusterBase + dotCount * clusterPerDot;
        const jitter = scale * (cfg.spawnJitterRatio ?? 0.12);
        const rotation = rand() * Math.PI * 2;
        const pts = [];

        for (let i = 0; i < dotCount; i++) {
            const angle = rotation + (i / dotCount) * Math.PI * 2;
            const jx = (rand() - 0.5) * jitter;
            const jy = (rand() - 0.5) * jitter;
            pts.push({
                x: cx + Math.cos(angle) * clusterRadius + jx,
                y: cy + Math.sin(angle) * clusterRadius + jy,
                r: dotR,
                color: tagColors[i % tagColors.length]
            });
        }

        let hitR = membraneR;
        pts.forEach((p) => {
            const d = Math.hypot(p.x - cx, p.y - cy) + membraneR;
            if (d > hitR) hitR = d;
        });

        return { pts, membraneR, cx, cy, gradientR: hitR, kind: 'molecule' };
    },

    _mirrorMoleculeBlob(blob, axisX, axisY, flipX, flipY) {
        const mx = (v) => (flipX ? 2 * axisX - v : v);
        const my = (v) => (flipY ? 2 * axisY - v : v);

        return {
            ...blob,
            cx: mx(blob.cx),
            cy: my(blob.cy),
            pts: blob.pts.map((p) => ({
                x: mx(p.x),
                y: my(p.y),
                r: p.r,
                color: p.color
            }))
        };
    },

    _expandFoldMirrors(blob, axisX, axisY) {
        return [
            this._mirrorMoleculeBlob(blob, axisX, axisY, false, false),
            this._mirrorMoleculeBlob(blob, axisX, axisY, true, false),
            this._mirrorMoleculeBlob(blob, axisX, axisY, false, true),
            this._mirrorMoleculeBlob(blob, axisX, axisY, true, true)
        ];
    },

    _shiftElement(blob, dx, dy) {
        if (blob.kind === 'pill') {
            return { ...blob, cx: blob.cx + dx, cy: blob.cy + dy };
        }
        return this._shiftBlob(blob, dx, dy);
    },

    _shiftBlob(blob, dx, dy) {
        return {
            ...blob,
            cx: blob.cx + dx,
            cy: blob.cy + dy,
            pts: blob.pts.map((p) => ({
                x: p.x + dx,
                y: p.y + dy,
                r: p.r,
                color: p.color,
                ox: p.ox,
                oy: p.oy,
                vx: p.vx,
                vy: p.vy,
                phase: p.phase
            }))
        };
    },

    _initMoleculeDotPhysics(blob, rand) {
        if (blob.kind === 'pill' || !blob.pts?.length) return blob;

        blob.pts = blob.pts.map((p) => ({
            ...p,
            ox: 0,
            oy: 0,
            vx: (rand() - 0.5) * 0.06,
            vy: (rand() - 0.5) * 0.06,
            phase: rand() * Math.PI * 2
        }));
        return blob;
    },

    _moleculeDrawPts(blob) {
        const dx = blob.offsetDx ?? 0;
        const dy = blob.offsetDy ?? 0;

        return blob.pts.map((p) => ({
            x: p.x + (p.ox ?? 0) + dx,
            y: p.y + (p.oy ?? 0) + dy,
            r: p.r,
            color: p.color
        }));
    },

    _moleculeBounds(drawPts, membraneR) {
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < drawPts.length; i++) {
            cx += drawPts[i].x;
            cy += drawPts[i].y;
        }
        cx /= drawPts.length;
        cy /= drawPts.length;

        let gradientR = membraneR;
        for (let i = 0; i < drawPts.length; i++) {
            const p = drawPts[i];
            const d = Math.hypot(p.x - cx, p.y - cy) + membraneR;
            if (d > gradientR) gradientR = d;
        }

        return { cx, cy, gradientR };
    },

    _dotMotionEnabled(cfg) {
        cfg = cfg || this._blobCfg();
        if (cfg.dotMotion === false) return false;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
        return this._drawBlobs?.some((blob) => blob.kind !== 'pill' && blob.pts?.length > 0);
    },

    _loopActive(cfg) {
        cfg = cfg || this._blobCfg();
        return this._dotMotionEnabled(cfg);
    },

    _shouldContinueLoop(cfg) {
        return this._dotMotionEnabled(cfg)
            || (this._mouseFollowEnabled() && this._pointerActive);
    },

    _updateMoleculeDots(cfg) {
        if (!this._drawBlobs?.length) return false;

        const stiffness = cfg.dotSiblingStiffness ?? 0.14;
        const home = cfg.dotHomeStiffness ?? 0.055;
        const damping = cfg.dotSpringDamping ?? 0.86;
        const maxOffsetRatio = cfg.dotMaxOffsetRatio ?? 0.42;
        const ambientAmp = cfg.dotAmbientAmp ?? 0.1;
        const minDim = Math.min(this._w, this._h);
        const ambientScale = minDim * 0.0011 * ambientAmp;
        const t = performance.now() * 0.001;
        const localX = this._pointerClient.x;
        const localY = this._pointerClient.y;
        let moved = false;

        for (let b = 0; b < this._drawBlobs.length; b++) {
            const blob = this._drawBlobs[b];
            if (blob.kind === 'pill') continue;

            const pts = blob.pts;
            const n = pts.length;
            if (n === 0) continue;

            const ax = new Float64Array(n);
            const ay = new Float64Array(n);

            for (let i = 0; i < n; i++) {
                ax[i] += -pts[i].ox * home;
                ay[i] += -pts[i].oy * home;
                ax[i] += Math.sin(t * 1.15 + pts[i].phase) * ambientScale;
                ay[i] += Math.cos(t * 0.92 + pts[i].phase * 1.6) * ambientScale;
            }

            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const pi = pts[i];
                    const pj = pts[j];
                    const dx = (pj.x + pj.ox) - (pi.x + pi.ox);
                    const dy = (pj.y + pj.oy) - (pi.y + pi.oy);
                    const dist = Math.hypot(dx, dy) || 0.001;
                    const rest = Math.hypot(pj.x - pi.x, pj.y - pi.y) || dist;
                    const stretch = dist - rest;
                    const fx = (dx / dist) * stretch * stiffness;
                    const fy = (dy / dist) * stretch * stiffness;
                    ax[i] += fx;
                    ay[i] += fy;
                    ax[j] -= fx;
                    ay[j] -= fy;
                }
            }

            if (this._pointerActive && cfg.dotPointerRepel !== false) {
                const blobDx = blob.offsetDx ?? 0;
                const blobDy = blob.offsetDy ?? 0;
                const repelScale = cfg.dotPointerRepelScale ?? 0.38;
                const radiusScale = cfg.dotPointerRadiusScale ?? 2.4;

                for (let i = 0; i < n; i++) {
                    const p = pts[i];
                    const wx = p.x + p.ox + blobDx;
                    const wy = p.y + p.oy + blobDy;
                    const toX = localX - wx;
                    const toY = localY - wy;
                    const dist = Math.hypot(toX, toY);
                    const hitR = p.r * radiusScale;

                    if (dist < hitR && dist >= 0.5) {
                        const fade = 1 - dist / hitR;
                        const strength = minDim * (cfg.mouseHoverMaxShift ?? 0.017) * repelScale * fade * fade;
                        p.vx += -(toX / dist) * strength;
                        p.vy += -(toY / dist) * strength;
                    }
                }
            }

            for (let i = 0; i < n; i++) {
                const p = pts[i];
                p.vx = (p.vx + ax[i]) * damping;
                p.vy = (p.vy + ay[i]) * damping;
                p.ox += p.vx;
                p.oy += p.vy;

                const maxO = p.r * maxOffsetRatio;
                const o = Math.hypot(p.ox, p.oy);
                if (o > maxO) {
                    p.ox = (p.ox / o) * maxO;
                    p.oy = (p.oy / o) * maxO;
                    p.vx *= 0.45;
                    p.vy *= 0.45;
                }

                if (Math.abs(p.vx) > 0.0008 || Math.abs(p.vy) > 0.0008
                    || Math.abs(p.ox) > 0.02 || Math.abs(p.oy) > 0.02) {
                    moved = true;
                }
            }
        }

        return moved;
    },

    _drawFoldCreases(ctx, w, h, axisX, axisY, cfg) {
        const alpha = cfg.foldCreaseAlpha ?? 0;
        if (alpha <= 0) return;

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(45, 45, 45, ${alpha / 255})`;
        ctx.lineWidth = cfg.foldCreaseWidth ?? 0.75;
        ctx.beginPath();
        ctx.moveTo(axisX, 0);
        ctx.lineTo(axisX, h);
        ctx.moveTo(0, axisY);
        ctx.lineTo(w, axisY);
        ctx.stroke();
        ctx.restore();
    },

    _drawMoleculeGlow(ctx, blob, cfg) {
        const blurScale = cfg.blurScale ?? 0;
        if (blurScale <= 0) return;

        const { pts, membraneR, cx, cy, gradientR } = blob;
        const colors = this._moleculeGlowColors(blob);
        const edgeRgb = this._parseColorRgb(colors.edge);
        const glowAlpha = cfg.glowAlpha ?? 1;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gradientR);
        grad.addColorStop(0, colors.core);
        grad.addColorStop(0.68, colors.edge);
        grad.addColorStop(1, `rgba(${edgeRgb.r}, ${edgeRgb.g}, ${edgeRgb.b}, 0)`);

        ctx.save();
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = grad;
        ctx.filter = `blur(${membraneR * blurScale}px)`;
        this._traceHullOutlinePath(pts, membraneR, ctx);
        ctx.fill();
        ctx.filter = 'none';
        ctx.restore();
    },

    _drawMoleculeCrisp(ctx, blob, cfg) {
        const drawPts = this._moleculeDrawPts(blob);
        const { membraneR } = blob;
        const dotScale = cfg.dotVisualScale ?? 0.85;
        const hullWidth = cfg.hullStrokeWidth ?? CONFIG?.outlines?.width ?? 0.27;
        const hullAlpha = cfg.hullStrokeAlpha ?? 0.55;

        ctx.save();
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';

        this._drawSiblingLinks(ctx, drawPts, cfg);

        for (let i = 0; i < drawPts.length; i++) {
            const p = drawPts[i];
            const r = p.r * dotScale;
            ctx.globalAlpha = 1;
            ctx.fillStyle = p.color || this._hullStrokeColor();
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = this._hullStrokeColor();
        ctx.globalAlpha = hullAlpha;
        ctx.lineWidth = hullWidth;
        this._traceHullOutlinePath(drawPts, membraneR, ctx);
        ctx.stroke();
        ctx.restore();
    },

    _drawMoleculeAtmosphere(ctx, blob, cfg) {
        const drawPts = this._moleculeDrawPts(blob);
        const bounds = this._moleculeBounds(drawPts, blob.membraneR);
        this._drawMoleculeGlow(ctx, { ...blob, pts: drawPts, ...bounds }, cfg);
    },

    _drawPillGlow(ctx, pill, cfg) {
        const blurScale = cfg.blurScale ?? 0;
        if (blurScale <= 0) return;

        const {
            cx, cy, width, height, rotation, color
        } = pill;
        const blurPx = height * blurScale * 1.35;
        const glowAlpha = cfg.pillGlowAlpha ?? 0.55;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation ?? 0);
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle = color;
        ctx.filter = `blur(${blurPx}px)`;
        this._roundRectPath(
            ctx,
            -width * 0.52,
            -height * 0.52,
            width * 1.04,
            height * 1.04,
            height * 0.5
        );
        ctx.fill();
        ctx.filter = 'none';
        ctx.restore();
    },

    _drawPillCrisp(ctx, pill, cfg) {
        const {
            cx, cy, width, height, rotation, color, fillColor
        } = pill;
        const blockH = CONFIG?.warehouse?.blockHeight ?? 26;
        const glyphSize = CONFIG?.warehouse?.blockGlyphSize ?? 10;
        const glyphR = (height / blockH) * glyphSize * 0.5;
        const padX = (height / blockH) * (cfg.pillPadX ?? 10);
        const borderW = (height / blockH) * (cfg.pillBorderWidth ?? 2);
        const borderAlpha = cfg.pillBorderAlpha ?? 0.9;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation ?? 0);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';

        const x = -width * 0.5;
        const y = -height * 0.5;
        const r = height * 0.5;

        ctx.fillStyle = fillColor;
        this._roundRectPath(ctx, x, y, width, height, r);
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = borderW;
        ctx.globalAlpha = borderAlpha;
        this._roundRectPath(ctx, x, y, width, height, r);
        ctx.stroke();

        const glyphCx = x + padX + glyphR;
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(glyphCx, 0, glyphR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    },

    _drawPillBlock(ctx, pill, cfg) {
        const style = cfg.moleculeStyle ?? 'l1';
        if (style === 'glow') {
            this._drawPillGlow(ctx, pill, cfg);
            return;
        }
        this._drawPillCrisp(ctx, pill, cfg);
    },

    _drawSiblingLinks(ctx, pts, cfg) {
        if (pts.length < 2) return;

        const lineCfg = CONFIG?.warehouse?.linkage?.line || {};
        if (lineCfg.visible === false) return;

        ctx.save();
        ctx.strokeStyle = this._hullStrokeColor();
        ctx.lineWidth = cfg.linkWidth ?? lineCfg.width ?? 0.5;
        ctx.globalAlpha = cfg.linkAlpha ?? 0.42;
        ctx.beginPath();

        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[j].x, pts[j].y);
            }
        }

        ctx.stroke();
        ctx.restore();
    },

    _shouldDrawCrisp(cfg) {
        return (cfg.moleculeStyle ?? 'l1') !== 'glow';
    },

    _blurSource(cfg) {
        return cfg.blurSource ?? 'content';
    },

    _contentBlurPx(cfg, w, h) {
        if (typeof cfg.contentBlurPx === 'number' && cfg.contentBlurPx > 0) {
            return cfg.contentBlurPx;
        }
        const minDim = Math.min(w, h);
        return Math.max(8, Math.min(24, Math.round(minDim * (cfg.blurScale ?? 0.14) * 0.85)));
    },

    _ensureContentBuffer(w, h, dpr) {
        const bw = Math.max(1, Math.round(w * dpr));
        const bh = Math.max(1, Math.round(h * dpr));
        if (!this._contentBuffer
            || this._contentBuffer.width !== bw
            || this._contentBuffer.height !== bh) {
            this._contentBuffer = document.createElement('canvas');
            this._contentBuffer.width = bw;
            this._contentBuffer.height = bh;
            this._contentBufferCtx = this._contentBuffer.getContext('2d');
            this._contentBufferDpr = dpr;
            this._contentBufferCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else if (this._contentBufferDpr !== dpr && this._contentBufferCtx) {
            this._contentBufferDpr = dpr;
            this._contentBufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        return this._contentBufferCtx;
    },

    _ensureBlurBuffer(w, h, dpr) {
        const bw = Math.max(1, Math.round(w * dpr));
        const bh = Math.max(1, Math.round(h * dpr));
        if (!this._blurBuffer
            || this._blurBuffer.width !== bw
            || this._blurBuffer.height !== bh) {
            this._blurBuffer = document.createElement('canvas');
            this._blurBuffer.width = bw;
            this._blurBuffer.height = bh;
            this._blurBufferCtx = this._blurBuffer.getContext('2d');
            this._blurBufferDpr = dpr;
            this._blurBufferCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else if (this._blurBufferDpr !== dpr && this._blurBufferCtx) {
            this._blurBufferDpr = dpr;
            this._blurBufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        return this._blurBufferCtx;
    },

    _drawCrispBlobs(targetCtx, cfg) {
        if (!this._drawBlobs?.length || !targetCtx) return;

        targetCtx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < this._drawBlobs.length; i++) {
            const blob = this._drawBlobs[i];
            const dx = blob.offsetDx ?? 0;
            const dy = blob.offsetDy ?? 0;
            const shifted = this._shiftElement(blob, dx, dy);

            if (shifted.kind === 'pill') {
                this._drawPillCrisp(targetCtx, shifted, cfg);
            } else {
                this._drawMoleculeCrisp(targetCtx, blob, cfg);
            }
        }
    },

    _drawAtmosphereBlobs(targetCtx, cfg) {
        if (!this._drawBlobs?.length || !targetCtx) return;

        targetCtx.globalCompositeOperation = cfg.glowBlendMode ?? 'multiply';
        for (let i = 0; i < this._drawBlobs.length; i++) {
            const blob = this._drawBlobs[i];
            const dx = blob.offsetDx ?? 0;
            const dy = blob.offsetDy ?? 0;
            const shifted = this._shiftElement(blob, dx, dy);

            if (shifted.kind === 'pill') {
                this._drawPillGlow(targetCtx, shifted, cfg);
            } else {
                this._drawMoleculeAtmosphere(targetCtx, blob, cfg);
            }
        }
    },

    _shouldDrawAtmosphere(cfg) {
        if (this._blurSource(cfg) === 'content') {
            return cfg.glowOverlay === true && (cfg.glowAlpha ?? 0) > 0;
        }
        if (cfg.glowOverlay === false) return false;
        if ((cfg.moleculeStyle ?? 'l1') === 'glow') return true;
        return (cfg.blurScale ?? 0) > 0;
    },

    _paintBlobs(ctx, w, h, cfg, host) {
        if (!this._drawBlobs) return;

        const axisX = w * (cfg.scatterCenterX ?? 0.5);
        const axisY = h * (cfg.scatterCenterY ?? 0.5);
        const source = this._blurSource(cfg);
        const drawCrisp = this._shouldDrawCrisp(cfg);
        const drawAtmosphere = this._shouldDrawAtmosphere(cfg);

        if (source === 'content' && drawCrisp) {
            const dpr = ctx.canvas.width / Math.max(1, w);
            const bctx = this._ensureContentBuffer(w, h, dpr);
            if (bctx) {
                bctx.clearRect(0, 0, w, h);
                this._drawCrispBlobs(bctx, cfg);

                const blurPx = this._contentBlurPx(cfg, w, h);
                ctx.save();
                ctx.globalCompositeOperation = cfg.blobBlendMode ?? 'multiply';
                ctx.globalAlpha = cfg.blobLayerAlpha ?? 1;
                ctx.filter = `blur(${blurPx}px)`;
                ctx.drawImage(this._contentBuffer, 0, 0, w, h);
                ctx.filter = 'none';
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        } else {
            if (drawCrisp) {
                ctx.globalCompositeOperation = 'source-over';
                this._drawCrispBlobs(ctx, cfg);
            }

            if (drawAtmosphere || source === 'glow') {
                this._drawAtmosphereBlobs(ctx, cfg);
            }
        }

        if (source === 'content' && drawAtmosphere) {
            this._drawAtmosphereBlobs(ctx, cfg);
        }

        this._drawFoldCreases(ctx, w, h, axisX, axisY, cfg);
    },

    _buildGrainCanvas(w, h, rand, cfgOverride) {
        const cfg = cfgOverride || this._siteCfg();
        const tile = Math.max(32, Math.round(cfg.grainTilePx ?? 96));
        const spread = cfg.grainSpread ?? 18;
        const mid = cfg.grainMid ?? 128;
        const blurPx = cfg.grainBlurPx ?? 0.45;

        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tile;
        tileCanvas.height = tile;
        const tileCtx = tileCanvas.getContext('2d');
        if (!tileCtx) return null;

        const imageData = tileCtx.createImageData(tile, tile);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const centered = (rand() - 0.5) * 2;
            const val = Math.max(0, Math.min(255, Math.round(mid + centered * spread)));
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = 255;
        }

        tileCtx.putImageData(imageData, 0, 0);

        let source = tileCanvas;
        if (blurPx > 0) {
            const blurred = document.createElement('canvas');
            blurred.width = tile;
            blurred.height = tile;
            const bctx = blurred.getContext('2d');
            if (bctx) {
                bctx.filter = `blur(${blurPx}px)`;
                bctx.drawImage(tileCanvas, 0, 0);
                bctx.filter = 'none';
                source = blurred;
            }
        }

        const grainCanvas = document.createElement('canvas');
        grainCanvas.width = w;
        grainCanvas.height = h;
        const gctx = grainCanvas.getContext('2d');
        if (!gctx) return null;

        const pattern = gctx.createPattern(source, 'repeat');
        if (pattern) {
            gctx.fillStyle = pattern;
            gctx.fillRect(0, 0, w, h);
        }

        grainCanvas._grainAlpha = cfg.grainAlpha ?? 10;
        grainCanvas._grainWashAlpha = cfg.grainWashAlpha ?? cfg.grainAlpha ?? 8;
        return grainCanvas;
    },

    _applyGrain(ctx, w, h, role, hostCfg) {
        const grain = this._grainCanvas;
        if (!grain) return;

        const cfg = hostCfg || this._siteCfg();
        const alpha = role === 'wash'
            ? (cfg.grainWashAlpha ?? grain._grainWashAlpha ?? grain._grainAlpha ?? 8)
            : (cfg.grainAlpha ?? grain._grainAlpha ?? 10);

        if (alpha <= 0) return;

        ctx.globalCompositeOperation = cfg.grainBlendMode ?? 'multiply';
        ctx.globalAlpha = alpha / 255;
        ctx.drawImage(grain, 0, 0, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    },

    _buildScatterMolecules(w, h, targetCount, rand, cfg) {
        const minDim = Math.min(w, h);
        const radiusMin = minDim * (cfg.radiusMin ?? 0.04);
        const radiusMax = minDim * (cfg.radiusMax ?? 0.14);
        const spread = minDim * (cfg.scatterSpread ?? 0.28);
        const centerX = w * (cfg.scatterCenterX ?? 0.5);
        const centerY = h * (cfg.scatterCenterY ?? 0.5);
        const mirrorFolds = cfg.mirrorFolds ?? 2;
        const useMirror = mirrorFolds >= 2;
        const mirrorDivisor = useMirror ? 4 : 1;
        const uniqueCount = Math.max(1, Math.ceil(targetCount / mirrorDivisor));
        const blobs = [];

        for (let i = 0; i < uniqueCount; i++) {
            const scale = rand() * (radiusMax - radiusMin) + radiusMin;
            let cx;
            let cy;

            if (useMirror) {
                const insetRatio = cfg.scatterMirrorInset ?? 0.04;
                const reach = cfg.scatterMirrorReach ?? 1;
                const inset = spread * insetRatio;
                const range = Math.max(inset, (spread - inset) * reach);
                cx = centerX + inset + rand() * range;
                cy = centerY - inset - rand() * range;
            } else {
                cx = centerX + (rand() - 0.5) * 2 * spread;
                cy = centerY + (rand() - 0.5) * 2 * spread;
            }

            const colorRand = this._rand((this._layoutSeed + i * 7919) >>> 0);
            const spec = this._sampleMoleculeSpec(colorRand, cfg, i);
            const cluster = this._buildMoleculeCluster(cx, cy, scale, rand, cfg, spec);

            blobs.push({
                ...cluster,
                moleculeIndex: i
            });
        }

        return blobs;
    },

    _buildScatterPills(w, h, targetCount, rand, cfg) {
        const minDim = Math.min(w, h);
        const spread = minDim * (cfg.scatterSpread ?? 0.28);
        const centerX = w * (cfg.scatterCenterX ?? 0.5);
        const centerY = h * (cfg.scatterCenterY ?? 0.5);
        const mirrorFolds = cfg.mirrorFolds ?? 2;
        const useMirror = mirrorFolds >= 2;
        const mirrorDivisor = useMirror ? 4 : 1;
        const uniqueCount = Math.max(1, Math.ceil(targetCount / mirrorDivisor));
        const pills = [];

        for (let i = 0; i < uniqueCount; i++) {
            let cx;
            let cy;

            if (useMirror) {
                const insetRatio = cfg.scatterMirrorInset ?? 0.06;
                const reach = cfg.scatterMirrorReach ?? 0.92;
                const inset = spread * insetRatio;
                const range = Math.max(inset, (spread - inset) * reach);
                cx = centerX + inset + rand() * range;
                cy = centerY - inset - rand() * range;
            } else {
                cx = centerX + (rand() - 0.5) * 2 * spread;
                cy = centerY + (rand() - 0.5) * 2 * spread;
            }

            pills.push(this._buildPillBlock(cx, cy, minDim, rand, cfg, i));
        }

        return pills;
    },

    _assignMouseFactors(blob, rand) {
        return {
            ...blob,
            hoverWeight: 0.8 + rand() * 0.4,
            offsetDx: 0,
            offsetDy: 0,
            repelVx: 0,
            repelVy: 0
        };
    },

    _buildLayoutBlobs(w, h, rand, cfg) {
        const axisX = w * (cfg.scatterCenterX ?? 0.5);
        const axisY = h * (cfg.scatterCenterY ?? 0.5);
        const mirrorFolds = cfg.mirrorFolds ?? 2;

        if (this._isOpeningArt()) {
            this._prepareOpeningMoleculePlan(cfg);
        }

        const uniqueBlobs = this._buildScatterMolecules(w, h, cfg.blobCount ?? 48, rand, cfg);
        const pillTarget = cfg.pillCount ?? 0;
        const uniquePills = pillTarget > 0
            ? this._buildScatterPills(w, h, pillTarget, rand, cfg)
            : [];
        const drawBlobs = [];

        uniqueBlobs.forEach((blob) => {
            const mirrored = mirrorFolds >= 2
                ? this._expandFoldMirrors(blob, axisX, axisY)
                : [blob];

            mirrored.forEach((instance) => {
                drawBlobs.push(this._initMoleculeDotPhysics(
                    this._assignMouseFactors(instance, rand),
                    rand
                ));
            });
        });

        uniquePills.forEach((pill) => {
            const mirrored = mirrorFolds >= 2
                ? [
                    this._mirrorPillBlob(pill, axisX, axisY, false, false),
                    this._mirrorPillBlob(pill, axisX, axisY, true, false),
                    this._mirrorPillBlob(pill, axisX, axisY, false, true),
                    this._mirrorPillBlob(pill, axisX, axisY, true, true)
                ]
                : [pill];

            mirrored.forEach((instance) => {
                drawBlobs.push(this._assignMouseFactors(instance, rand));
            });
        });

        this._applyTagColorsToBlobs(cfg, drawBlobs);
        return drawBlobs;
    },

    _hoverRepelVelocity(blob, localX, localY, cfg, minDim) {
        const cx = blob.cx + (blob.offsetDx ?? 0);
        const cy = blob.cy + (blob.offsetDy ?? 0);
        const toX = localX - cx;
        const toY = localY - cy;
        const dist = Math.hypot(toX, toY);
        const hitR = blob.gradientR ?? blob.membraneR ?? 0;
        const radius = hitR * (cfg.mouseHoverRadiusScale ?? 1.1) + (cfg.mouseHoverPadding ?? 10);

        let targetVx = 0;
        let targetVy = 0;
        if (dist < radius && dist >= 0.5) {
            const t = 1 - dist / radius;
            const strength = minDim * (cfg.mouseHoverMaxShift ?? 0.017) * (blob.hoverWeight ?? 1) * t * t;
            targetVx = -(toX / dist) * strength;
            targetVy = -(toY / dist) * strength;
        }

        const smooth = cfg.mouseHoverSmoothing ?? 0.1;
        blob.repelVx = (blob.repelVx ?? 0) + (targetVx - (blob.repelVx ?? 0)) * smooth;
        blob.repelVy = (blob.repelVy ?? 0) + (targetVy - (blob.repelVy ?? 0)) * smooth;

        return { vx: blob.repelVx, vy: blob.repelVy };
    },

    _updateBlobHovers(cfg) {
        if (!this._drawBlobs || !this._pointerActive) return false;

        const localX = this._pointerClient.x;
        const localY = this._pointerClient.y;
        const minDim = Math.min(this._w, this._h);
        let moved = false;

        for (let i = 0; i < this._drawBlobs.length; i++) {
            const blob = this._drawBlobs[i];
            const { vx, vy } = this._hoverRepelVelocity(blob, localX, localY, cfg, minDim);
            if (Math.abs(vx) > 0.0004 || Math.abs(vy) > 0.0004) {
                blob.offsetDx = (blob.offsetDx ?? 0) + vx;
                blob.offsetDy = (blob.offsetDy ?? 0) + vy;
                moved = true;
            }
        }

        return moved;
    },

    _viewportSize() {
        return {
            w: window.innerWidth,
            h: window.innerHeight
        };
    },

    _resolveMaxDpr() {
        const blobCfg = this._shouldBuildBlobs() ? this._blobCfg() : this._siteCfg();
        const siteCfg = this._siteCfg();
        const cap = blobCfg.maxDpr ?? siteCfg.maxDpr ?? 1.5;
        return Math.min(window.devicePixelRatio || 1, cap);
    },

    _scheduleResizePaint() {
        if (this._resizeScheduled) return;
        this._resizeScheduled = true;
        requestAnimationFrame(() => {
            this._resizeScheduled = false;
            const { w, h } = this._viewportSize();
            this.render(w, h);
        });
    },

    _rebuildLayout(w, h) {
        const cfg = this._siteCfg();
        if (w < 1 || h < 1) return;

        const dpr = this._resolveMaxDpr();
        const bw = Math.max(1, Math.round(w * dpr));
        const bh = Math.max(1, Math.round(h * dpr));

        this._surfaces.forEach((surface) => {
            const { canvas, ctx } = surface;
            if (!canvas || !ctx) return;
            canvas.width = bw;
            canvas.height = bh;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        });

        if (this._layoutSeed == null) {
            this._layoutSeed = this._resolveSeed();
        }

        if (this._shouldDeferOpeningBlobs()) {
            this._w = w;
            this._h = h;
            this._drawBlobs = null;
            this._grainCanvas = null;
            return;
        }

        const rand = this._rand(this._layoutSeed);
        this._w = w;
        this._h = h;
        this._drawBlobs = this._shouldBuildBlobs()
            ? this._buildLayoutBlobs(w, h, rand, this._blobCfg())
            : null;
        this._grainCanvas = this._buildGrainCanvas(
            w,
            h,
            rand,
            this._shouldBuildBlobs() ? this._blobCfg() : this._siteCfg()
        );
    },

    _paintSurface(surface) {
        const { role, ctx, host } = surface;
        const w = this._w;
        const h = this._h;
        const cfg = this.cfg(host);
        if (!ctx || w < 1 || h < 1) return;

        if (role === 'wash') {
            ctx.clearRect(0, 0, w, h);
            this._applyGrain(ctx, w, h, role, this._siteCfg());
            return;
        }

        if (role === 'base') {
            this._beginPaintFrame(ctx);
            this._fillBackground(ctx, w, h, cfg, false);
            return;
        }

        const grainOnly = this._skipBlobs(role, host);
        const openingArt = this._isOpeningArtHost(host);

        this._beginPaintFrame(ctx);

        if (!grainOnly && !this._drawBlobs) {
            if (openingArt) {
                this._fillBackground(ctx, w, h, cfg, true);
            }
            return;
        }

        this._fillBackground(ctx, w, h, cfg, openingArt);

        if (!grainOnly && this._drawBlobs) {
            this._paintBlobs(ctx, w, h, cfg, host);
        }

        this._applyGrain(ctx, w, h, role, cfg);
        this._beginPaintFrame(ctx);
    },

    _paintAll() {
        this._surfaces.forEach((surface) => this._paintSurface(surface));
    },

    _beginPaintFrame(ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
    },

    _fillBackground(ctx, w, h, cfg, openingArt) {
        if (openingArt) {
            ctx.fillStyle = this._resolveCssColor(cfg.bgColor ?? 'var(--color-5)', '#F2F0EE');
        } else {
            ctx.fillStyle = cfg.bgColor ?? '#f4f1ea';
        }
        ctx.fillRect(0, 0, w, h);
    },

    _tick() {
        this._rafId = null;
        const cfg = this._blobCfg();
        let dirty = false;

        if (this._pointerActive && this._mouseFollowEnabled()) {
            dirty = this._updateBlobHovers(cfg) || dirty;
        }

        if (this._dotMotionEnabled(cfg)) {
            dirty = this._updateMoleculeDots(cfg) || dirty;
        }

        if (dirty) {
            const throttle = cfg.repaintThrottleMs ?? 0;
            const now = performance.now();
            if (!throttle || now - this._lastPaintAt >= throttle) {
                this._lastPaintAt = now;
                this._paintPending = false;
                this._paintAll();
            } else {
                this._paintPending = true;
            }
        }

        if (this._shouldContinueLoop(cfg) || this._paintPending) {
            this._rafId = requestAnimationFrame(() => this._tick());
        }
    },

    _ensureLoop() {
        if (this._rafId != null) return;
        const cfg = this._blobCfg();
        if (!this._shouldContinueLoop(cfg) && !this._paintPending) return;
        this._rafId = requestAnimationFrame(() => this._tick());
    },

    _mouseFollowEnabled() {
        if (!this._drawBlobs?.length) return false;
        const cfg = this._blobCfg();
        if (cfg.mouseFollow === false) return false;
        if (cfg.mouseFollow !== true && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            return false;
        }
        return true;
    },

    _getPointerRoot() {
        const opening = document.getElementById('opening-screen');
        if (opening) return opening;
        return document;
    },

    _onPointerMove(event) {
        if (!this._mouseFollowEnabled() || this._surfaces.size === 0) return;

        this._pointerClient.x = event.clientX;
        this._pointerClient.y = event.clientY;
        this._pointerActive = true;
        this._ensureLoop();
    },

    _onPointerLeave() {
        this._pointerActive = false;
        if (!this._dotMotionEnabled(this._blobCfg()) && this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    _bindPointer() {
        const root = this._getPointerRoot();
        if (!root) return;

        this._pointerRoot = root;
        this._boundPointerMove = (e) => this._onPointerMove(e);
        this._boundPointerLeave = () => this._onPointerLeave();
        root.addEventListener('pointermove', this._boundPointerMove, { passive: true });
        root.addEventListener('pointerleave', this._boundPointerLeave);
    },

    _unbindPointer() {
        const root = this._pointerRoot;
        if (!root) return;

        if (this._boundPointerMove) {
            root.removeEventListener('pointermove', this._boundPointerMove);
            this._boundPointerMove = null;
        }
        if (this._boundPointerLeave) {
            root.removeEventListener('pointerleave', this._boundPointerLeave);
            this._boundPointerLeave = null;
        }
        this._pointerRoot = null;
    },

    _signalArtReady() {
        if (this._artReady || !this._isOpeningArt()) return;
        if (!this._drawBlobs?.length || !this._getTagColorEntries().length) return;

        this._artReady = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (typeof OpeningScreen !== 'undefined' && OpeningScreen.onArtReady) {
                    OpeningScreen.onArtReady();
                }
            });
        });
    },

    onDataReady() {
        if (!this._mounted || !this._shouldBuildBlobs()) {
            return;
        }

        this._resetOpeningColorPool();
        const { w, h } = this._viewportSize();
        this.render(w, h);

        const blobCfg = this._blobCfg();
        if (this._mouseFollowEnabled() && !this._pointerRoot) {
            this._bindPointer();
        } else if (this._loopActive(blobCfg)) {
            this._ensureLoop();
        }

        this._signalArtReady();
    },

    render(w, h) {
        this._rebuildLayout(w, h);
        this._paintAll();
        if (this._loopActive()) {
            this._ensureLoop();
        }
    },

    _mountSurface(host) {
        if (!host || this._surfaces.has(host)) return false;

        const role = this._hostRole(host);
        const canvas = document.createElement('canvas');
        canvas.className = role === 'wash'
            ? 'site-background__canvas site-background__canvas--wash opening-screen__bg-canvas'
            : 'site-background__canvas opening-screen__bg-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host.prepend(canvas);

        const ctx = canvas.getContext('2d', { alpha: role === 'wash' });
        if (!ctx) return false;

        this._surfaces.set(host, { host, role, canvas, ctx });
        return true;
    },

    _initRuntime() {
        const paint = () => {
            const { w, h } = this._viewportSize();
            this.render(w, h);
        };

        paint();

        if (this._shouldBuildBlobs()) {
            const blobCfg = this._blobCfg();
            if (this._mouseFollowEnabled()
                || (this._dotMotionEnabled(blobCfg) && blobCfg.dotPointerRepel !== false)) {
                this._bindPointer();
            }
            if (this._loopActive(blobCfg)) {
                this._ensureLoop();
            }
        }

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this._scheduleResizePaint());
            this._resizeObserver.observe(document.documentElement);
        } else {
            window.addEventListener('resize', () => this._scheduleResizePaint());
        }
    },

    mount(host) {
        if (!host) return;
        if (this._siteCfg().enabled === false && !host.closest?.('#opening-screen')) return;

        const added = this._mountSurface(host);
        if (!added) return;

        if (!this._mounted) {
            this._mounted = true;
            this._initRuntime();
        } else {
            const { w, h } = this._viewportSize();
            this.render(w, h);
        }
    },

    mountSiteBackground() {
        if (this._siteCfg().enabled === false) return;

        const baseHost = document.getElementById('site-background');
        if (baseHost) this.mount(baseHost);

        if (this._siteCfg().washOverContent && !this._usesGrainDisplacement()) {
            const washHost = document.getElementById('site-background-wash');
            if (washHost) this.mount(washHost);
        }

        if (this._usesGrainDisplacement()) {
            this._configureGrainDisplacement();
        }
    },

    _configureGrainDisplacement() {
        const cfg = this._siteCfg();
        const map = document.querySelector('#site-grain-displace feDisplacementMap');
        const turb = document.getElementById('site-grain-turbulence');
        if (map) {
            map.setAttribute('scale', String(cfg.grainDisplacementScale ?? 2.5));
        }
        if (turb) {
            turb.setAttribute('baseFrequency', String(cfg.grainDisplacementFrequency ?? 0.75));
            turb.setAttribute('numOctaves', String(cfg.grainDisplacementOctaves ?? 3));
        }
        document.documentElement.classList.add('has-site-grain-displace');
        this._startGrainDisplacementAnimation();
    },

    _startGrainDisplacementAnimation() {
        const cfg = this._siteCfg();
        if (cfg.grainDisplacementAnimate === false) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

        const turb = document.getElementById('site-grain-turbulence');
        if (!turb) return;

        const rate = cfg.grainDisplacementSeedRate ?? 0.4;
        const step = () => {
            this._displaceSeed = (this._displaceSeed + rate) % 1000;
            turb.setAttribute('seed', String(Math.floor(this._displaceSeed)));
            this._displaceRaf = requestAnimationFrame(step);
        };

        if (this._displaceRaf != null) {
            cancelAnimationFrame(this._displaceRaf);
        }
        this._displaceRaf = requestAnimationFrame(step);
    },

    _stopGrainDisplacementAnimation() {
        if (this._displaceRaf != null) {
            cancelAnimationFrame(this._displaceRaf);
            this._displaceRaf = null;
        }
        document.documentElement.classList.remove('has-site-grain-displace');
    },

    unmount() {
        this._stopGrainDisplacementAnimation();
        this._unbindPointer();
        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        this._surfaces.forEach((surface) => surface.canvas?.remove());
        this._surfaces.clear();
        this._layoutSeed = null;
        this._drawBlobs = null;
        this._grainCanvas = null;
        this._resetOpeningColorPool();
        this._contentBuffer = null;
        this._contentBufferCtx = null;
        this._contentBufferDpr = 0;
        this._blurBuffer = null;
        this._blurBufferCtx = null;
        this._blurBufferDpr = 0;
        this._cachedHullColor = null;
        this._mounted = false;
        this._pointerClient = { x: 0, y: 0 };
        this._pointerActive = false;
    }
};
/* ==========================================================================
   Opening page — static palette (tag colors + sample molecules for background art)
   ========================================================================== */
const OpeningData = {
    items: [],
    tagColorsMap: new Map(),

    async init() {
        const url = CONFIG.opening?.dataUrl || 'data/opening-palette.json';
        const timeoutMs = CONFIG.boot?.fetchTimeoutMs ?? 15000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            const data = await response.json();
            this.ingest(data);
        } finally {
            clearTimeout(timer);
        }

        window.AppState = { items: this.items, tagColorsMap: this.tagColorsMap };
    },

    ingest(data) {
        const fallback = CONFIG.data?.fallbackTagColor || '#888888';
        const tags = data?.tags || {};

        Object.entries(tags).forEach(([name, color]) => {
            const norm = this.normalizeString(name);
            if (!norm) return;
            this.tagColorsMap.set(norm, String(color || fallback));
        });

        const samples = Array.isArray(data?.samples) ? data.samples : [];
        this.items = samples.map((sample, index) => {
            const tagNames = Array.isArray(sample.tags) ? sample.tags : [];
            const tagsArray = tagNames.map((raw) => {
                const norm = this.normalizeString(raw);
                return {
                    name: norm,
                    color: this.tagColorsMap.get(norm) || fallback
                };
            }).filter((t) => t.name);

            return {
                id: String(sample.id || `opening-${index + 1}`),
                title: '',
                body: '',
                tags: tagsArray,
                textDirection: 'rtl'
            };
        });
    },

    normalizeString(str) {
        if (!str) return '';
        return str.replace(/[#\u200B-\u200D\uFEFF]/g, '').replace(/_/g, ' ').trim().toLowerCase();
    }
};
/* ==========================================================================
   Opening Screen — ceremonial threshold before Experience 1
   ========================================================================== */
const OpeningScreen = {
    skipped: false,
    mounted: false,
    dismissing: false,
    dataReady: false,
    artReady: false,
    userDismissed: false,
    bootFlushed: false,
    el: null,
    continueBtn: null,
    continueEnabledAt: 0,
    mountedAt: 0,
    _enableTimer: null,
    _revealTimer: null,
    _revealFallbackTimer: null,
    _titleFullText: '',
    _titleTypewriterTimer: null,
    _titleTypewriterGen: 0,
    titleTyped: false,
    _artMounted: false,
    _warmupStarted: false,
    _preloadStarted: false,

    cfg() {
        return CONFIG.opening || {};
    },

    storageKey() {
        return this.cfg().devSkipStorageKey || 'opening.skip';
    },

    shouldShow() {
        if (!document.getElementById('opening-screen')) return false;

        const cfg = this.cfg();
        if (cfg.enabled === false) return false;

        const params = new URLSearchParams(location.search);
        const isDedicatedPage = document.body.classList.contains('opening-page');

        if (params.has('skipOpening') && params.get('skipOpening') !== '0') {
            return false;
        }

        if (isDedicatedPage) {
            return true;
        }

        if (params.has('opening')) {
            const val = params.get('opening');
            if (val === '1' || val === 'true') {
                try { localStorage.removeItem(this.storageKey()); } catch (_) { /* ignore */ }
                return true;
            }
            if (val === '0' || val === 'false') {
                try { localStorage.setItem(this.storageKey(), '1'); } catch (_) { /* ignore */ }
                return false;
            }
        }

        try {
            if (localStorage.getItem(this.storageKey()) === '1') return false;
        } catch (_) { /* ignore */ }

        return true;
    },

    isActive() {
        return document.body.classList.contains('opening-active');
    },

    initEarly() {
        if (!this.shouldShow()) {
            this.skipped = true;
            return { skipped: true };
        }

        this.skipped = false;
        document.body.classList.add('opening-active');
        this.startWarmup();

        return { skipped: false };
    },

    startWarmup() {
        if (this.skipped || this._warmupStarted) return;
        this._warmupStarted = true;

        this._preloadAssets();
        this._preloadFonts();
    },

    _preloadAssets() {
        if (this._preloadStarted) return;
        this._preloadStarted = true;

        const urls = this.cfg().preloadAssets || [];
        urls.forEach((url) => {
            fetch(url, { cache: 'force-cache' }).catch(() => { /* best-effort */ });
        });
    },

    _preloadFonts() {
        if (!document.fonts?.load) return;

        const loads = [
            document.fonts.load('700 58px NarkissYair'),
            document.fonts.load('700 1rem NarkissYairMono'),
            document.fonts.load('400 2rem TheBasicsDots'),
            document.fonts.load('400 1.125rem FrankRuhl')
        ];

        Promise.allSettled(loads).catch(() => { /* best-effort */ });
    },

    mount() {
        if (this.skipped || this.mounted) return;
        this.el = document.getElementById('opening-screen');
        if (!this.el) return;

        this.mounted = true;
        this.mountedAt = performance.now();
        this.el.hidden = false;
        this.el.removeAttribute('aria-hidden');

        this._applyLabels();
        this._mountCorners();

        this.continueBtn = this.el.querySelector('.opening-screen__continue');

        if (this.continueBtn) {
            this.continueBtn.disabled = true;
            this.continueBtn.addEventListener('click', () => this.onContinue());
        }

        this.el.classList.add('is-visible', 'is-art-pending');
        const fadeMs = this.cfg().artFadeDurationMs ?? 600;
        this.el.style.setProperty('--opening-art-fade-duration', `${fadeMs}ms`);
        this._startTitleTypewriter();
        this._scheduleContinueEnable();
    },

    onArtReady() {
        if (this.skipped || this.artReady) return;
        this.artReady = true;
        this._tryRevealArt();
    },

    _onTitleTyped() {
        if (this.titleTyped) return;
        this.titleTyped = true;
        const title = this.el?.querySelector('.opening-screen__title');
        title?.classList.remove('is-typing', 'is-cursor-wait');
        title?.classList.add('is-title-typed');
        this._tryRevealArt();
    },

    _tryRevealArt() {
        if (!this.artReady || !this.titleTyped || !this.el) return;

        const delayMs = this.cfg().artRevealAfterTitleMs ?? 500;
        clearTimeout(this._revealTimer);
        this._revealTimer = setTimeout(() => {
            this.el?.classList.remove('is-art-pending');
            this.el?.classList.add('is-art-ready');
            this._onArtRevealed();
        }, delayMs);
    },

    _onArtRevealed() {
        this.continueEnabledAt = performance.now() + (this.cfg().minDisplayMs ?? 600);
        this._tryEnableContinue();
    },

    _scheduleContinueEnable() {
        const minMs = this.cfg().minDisplayMs ?? 600;
        this.continueEnabledAt = performance.now() + minMs;
        clearTimeout(this._enableTimer);
        this._enableTimer = setTimeout(() => this._tryEnableContinue(), minMs);
    },

    _tryEnableContinue() {
        if (!this.continueBtn || this.skipped || this.dismissing) return;
        if (!this.artReady || !this.titleTyped) return;
        if (!this.el?.classList.contains('is-art-ready')) return;
        if (performance.now() < this.continueEnabledAt) {
            clearTimeout(this._enableTimer);
            this._enableTimer = setTimeout(
                () => this._tryEnableContinue(),
                Math.max(0, this.continueEnabledAt - performance.now())
            );
            return;
        }
        this.continueBtn.disabled = false;
        this.continueBtn.classList.add('is-ready');
    },

    _applyLabels() {
        const labels = this.cfg().labels || {};
        const title = this.el.querySelector('.opening-screen__title');
        const subtitle = this.el.querySelector('.opening-screen__subtitle');
        const btn = this.el.querySelector('.opening-screen__continue');
        if (title) {
            this._titleFullText = labels.title || title.textContent || '';
            title.textContent = '';
            title.setAttribute('aria-label', this._titleFullText);
        }
        if (subtitle && labels.subtitle) subtitle.textContent = labels.subtitle;
        if (btn && labels.continue) {
            btn.textContent = labels.continue;
            btn.setAttribute('aria-label', labels.continue);
        }
    },

    _cancelTitleTypewriter() {
        this._titleTypewriterGen += 1;
        if (this._titleTypewriterTimer !== null) {
            clearTimeout(this._titleTypewriterTimer);
            this._titleTypewriterTimer = null;
        }
    },

    _startTitleTypewriter() {
        const title = this.el?.querySelector('.opening-screen__title');
        const text = this._titleFullText || this.cfg().labels?.title || '';
        if (!title || !text) return;

        this._cancelTitleTypewriter();
        this.titleTyped = false;
        title.textContent = '';
        title.classList.remove('is-title-typed', 'is-typing');
        title.classList.add('is-cursor-wait');

        const generation = this._titleTypewriterGen;
        const cursorWaitMs = this.cfg().titleCursorWaitMs ?? 1800;
        const msPerChar = this.cfg().titleTypewriterMsPerChar ?? 320;

        this._titleTypewriterTimer = setTimeout(() => {
            this._titleTypewriterTimer = null;
            if (generation !== this._titleTypewriterGen) return;

            title.classList.remove('is-cursor-wait');
            title.classList.add('is-typing');

            let index = 0;
            const step = () => {
                if (generation !== this._titleTypewriterGen) return;
                index += 1;
                title.textContent = text.slice(0, index);
                if (index < text.length) {
                    this._titleTypewriterTimer = setTimeout(step, msPerChar);
                } else {
                    this._titleTypewriterTimer = null;
                    this._onTitleTyped();
                }
            };
            step();
        }, cursorWaitMs);
    },

    _mountCorners() {
        const host = this.el.querySelector('.opening-screen__corners');
        if (!host) return;
        ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
            const mark = document.createElement('span');
            mark.className = `opening-screen__corner opening-screen__corner--${corner}`;
            mark.setAttribute('aria-hidden', 'true');
            host.appendChild(mark);
        });
    },

    onDataReady() {
        this.dataReady = true;

        if (this.skipped) return;

        const art = this.el?.querySelector('.opening-screen__art');
        if (art && typeof OpeningBackground !== 'undefined') {
            if (!this._artMounted) {
                OpeningBackground.mount(art);
                this._artMounted = true;
            }
            OpeningBackground.onDataReady();
        }

        if (this.userDismissed && !this.bootFlushed) {
            this._enterSite();
        }
    },

    onContinue() {
        if (this.dismissing || this.skipped) return;
        if (this.continueBtn?.disabled) return;
        this.dismiss();
    },

    dismiss() {
        if (this.dismissing || this.skipped) return;
        this.dismissing = true;
        this.userDismissed = true;
        this._cancelTitleTypewriter();

        const exitMs = this.cfg().exitDurationMs ?? 600;
        this.el?.classList.add('is-exiting');

        setTimeout(() => {
            document.body.classList.remove('opening-active');
            this.el?.classList.remove('is-visible', 'is-exiting');
            if (this.el) {
                this.el.hidden = true;
                this.el.setAttribute('aria-hidden', 'true');
            }

            this._enterSite();
        }, exitMs);
    },

    _enterSite() {
        if (this.bootFlushed) return;
        this.bootFlushed = true;

        const target = this.cfg().entryTarget || 'experience.html';
        window.location.assign(target);
    }
};
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof applyPresentationProfile === 'function') applyPresentationProfile();
    } catch (err) {
        console.error('Presentation profile failed:', err);
    }

    try {
        applyVisualScaleTokens();
        applySiteGridTokens();
    } catch (err) {
        console.error('Site token init failed:', err);
    }

    const opening = OpeningScreen.initEarly();
    if (opening.skipped) {
        window.location.replace(OpeningScreen.cfg().entryTarget || 'experience.html');
        return;
    }

    OpeningScreen.mount();

    OpeningData.init()
        .then(() => {
            OpeningScreen.onDataReady();
        })
        .catch((err) => {
            console.error('Opening data pipeline failed:', err);
            OpeningScreen.onDataReady();
        });
});
