/* ==========================================================================
   03a. MESO MOCK — הדמיית סילואטות קלה (V2 בלבד, בלי מדידה)
   ========================================================================== */
const MesoMock = {
    _textureCache: new Map(),
    _bakeVersion: 88,
    _renderContext: null,
    _columnGradientLayout: null,
    _shaderLiveBound: false,
    _shaderLiveWrapper: null,
    _bakeQueue: [],
    _bakeIdleHandle: null,

    _presentationBakeBatch() {
        if (typeof isPresentationMode !== 'function' || !isPresentationMode()) {
            return { structure: 3, texture: 2 };
        }
        const p = CONFIG.presentation || {};
        return {
            structure: p.mesoBakeStructurePerFrame ?? 6,
            texture: p.mesoBakeTexturePerFrame ?? 4
        };
    },

    _collectMesoWrappers(options = {}) {
        const wrappers = [];
        const columnLimit = options.columnLimit ?? 0;
        const cols = [...document.querySelectorAll('#app.is-meso-column-layout > .meso-grid-column')];
        const hiveAnchors = document.querySelectorAll(
            '#app.is-meso-hive-layout .note-wrapper.is-meso-hive-anchored'
        );

        if (hiveAnchors.length) {
            wrappers.push(...hiveAnchors);
        } else if (cols.length) {
            const useCols = columnLimit > 0 ? cols.slice(0, columnLimit) : cols;
            useCols.forEach(col => wrappers.push(...col.querySelectorAll('.note-wrapper')));
        } else {
            wrappers.push(...document.querySelectorAll('.note-wrapper'));
        }

        return { wrappers, deferredCols: columnLimit > 0 ? cols.slice(columnLimit) : [] };
    },

    _scheduleDeferredColumnBakes(cols) {
        if (!cols?.length) return;
        const run = () => {
            if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 2) return;
            const itemsById = new Map(
                (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
            );
            cols.forEach(col => {
                col.querySelectorAll('.note-wrapper').forEach(wrapper => {
                    const item = itemsById.get(wrapper.dataset.noteId);
                    if (!item) return;
                    try {
                        this.syncGlyphLayout(wrapper, item);
                    } catch (err) {
                        console.warn('MesoMock deferred glyph sync failed', wrapper.dataset.noteId, err);
                    }
                    this._enqueueBakeJob({ type: 'texture', wrapper, item });
                });
            });
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 2500 });
        } else {
            setTimeout(run, 120);
        }
    },

    _enqueueBakeJob(job) {
        this._bakeQueue.push(job);
        if (this._bakeIdleHandle != null) return;
        this._bakeIdleHandle = requestAnimationFrame(() => this._drainBakeQueue());
    },

    _drainBakeQueue() {
        this._bakeIdleHandle = null;
        const job = this._bakeQueue.shift();
        if (!job) return;

        try {
            if (job.type === 'structure') {
                this.applyToWrapper(job.wrapper, job.item, { skipBake: true });
            } else if (job.context === 'opening') {
                this._runOpeningTextureBakeJob(job);
            } else {
                this._runWrapperTextureBakeJob(job);
            }
        } catch (err) {
            console.warn('MesoMock bake job failed', job.item?.id, err);
        }

        let extra = 0;
        const batch = this._presentationBakeBatch();
        while (extra < batch.structure && this._bakeQueue[0]?.type === 'structure') {
            const next = this._bakeQueue.shift();
            try {
                this.applyToWrapper(next.wrapper, next.item, { skipBake: true });
            } catch (err) {
                console.warn('MesoMock structure job failed', next.item?.id, err);
            }
            extra++;
        }
        while (extra < batch.texture && this._bakeQueue[0]?.type === 'texture') {
            const next = this._bakeQueue.shift();
            try {
                if (next.context === 'opening') {
                    this._runOpeningTextureBakeJob(next);
                } else {
                    this._runWrapperTextureBakeJob(next);
                }
            } catch (err) {
                console.warn('MesoMock bake job failed', next.item?.id, err);
            }
            extra++;
        }

        if (this._bakeQueue.length) {
            this._bakeIdleHandle = requestAnimationFrame(() => this._drainBakeQueue());
        } else {
            try {
                this.finishBakeQueueIfIdle();
            } catch (err) {
                console.warn('MesoMock finishBakeQueueIfIdle failed', err);
            }
        }
    },

    GRAIN_DATA_URI: "data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='8.4' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E",

    SIZE_BANDS: {
        xs: { rowSpan: 1, titleMin: 1, titleRange: 1, bodyMin: 1, bodyRange: 2, widthMin: 0.48, widthRange: 0.16, fontScale: 0.8 },
        sm: { rowSpan: 1, titleMin: 1, titleRange: 1, bodyMin: 2, bodyRange: 3, widthMin: 0.6, widthRange: 0.16, fontScale: 0.94 },
        md: { rowSpan: 2, titleMin: 1, titleRange: 2, bodyMin: 3, bodyRange: 3, widthMin: 0.7, widthRange: 0.14, fontScale: 1.08 },
        lg: { rowSpan: 3, titleMin: 1, titleRange: 2, bodyMin: 5, bodyRange: 3, widthMin: 0.76, widthRange: 0.16, fontScale: 1.22 },
        xl: { rowSpan: 4, titleMin: 2, titleRange: 1, bodyMin: 7, bodyRange: 3, widthMin: 0.82, widthRange: 0.14, fontScale: 1.38 }
    },

    getLineHeightPx(kind = 'body') {
        const typo = CONFIG.meso.typography;
        const t = kind === 'title' ? typo.title : typo.body;
        const meso = CONFIG?.depth?.v2?.meso || {};
        const bodyBase = meso.mockLineHeight ?? 11;
        const bodyPx = scale(bodyBase * this.getSizeScale());
        const bodyTypoLineH = typo.body.size * typo.body.lineHeight;
        const kindTypoLineH = t.size * t.lineHeight;
        return bodyPx * (kindTypoLineH / bodyTypoLineH);
    },

    getTitleBodyGapPx() {
        const typo = CONFIG.meso.typography;
        const meso = CONFIG?.depth?.v2?.meso || {};
        const base = typo.title.size * typo.titleBodyGap * this.getSizeScale();
        const extra = scale(meso.mockTitleBodyGap ?? 10);
        return base + extra;
    },

    resolveLineHeights(lines) {
        return lines.map(l => ({
            ...l,
            lineH: Number.isFinite(l.lineH) && l.lineH > 0
                ? l.lineH
                : this.getLineHeightPx(l.kind)
        }));
    },

    getProfileMetrics(profile) {
        const titleGap = this.getTitleBodyGapPx();
        const lines = profile.lines || [];
        if (lines.length === 0) {
            return { totalH: 0, offsets: [], titleGap, useDomOffsets: false };
        }

        const useDomOffsets = lines.every(l => Number.isFinite(l.offsetY));
        if (useDomOffsets) {
            const offsets = lines.map(l => l.offsetY);
            const last = lines[lines.length - 1];
            return {
                totalH: last.offsetY + last.lineH,
                offsets,
                titleGap,
                useDomOffsets: true
            };
        }

        let totalH = 0;
        const offsets = lines.map((line, i) => {
            const o = totalH;
            totalH += line.lineH;
            if (line.kind === 'title' && lines[i + 1]?.kind === 'body') {
                totalH += titleGap;
            }
            return o;
        });

        return { totalH, offsets, titleGap, useDomOffsets: false };
    },

    getLineStackGapStyle(profile, metrics, lineIndex, sliceGapAsPadding) {
        const lines = profile.lines;
        const line = lines[lineIndex];
        if (!line) return '';

        if (metrics.useDomOffsets && lineIndex > 0) {
            const gap = metrics.offsets[lineIndex] - metrics.offsets[lineIndex - 1] - lines[lineIndex - 1].lineH;
            return gap > 0 ? `margin-top:${gap}px;` : '';
        }

        if (!metrics.useDomOffsets
            && line.kind === 'title'
            && lines[lineIndex + 1]?.kind === 'body') {
            return sliceGapAsPadding
                ? `padding-bottom:${metrics.titleGap}px;`
                : `margin-bottom:${metrics.titleGap}px;`;
        }

        return '';
    },

    getProfileContentHeightPx(profile) {
        return profile.totalHeightPx ?? this.getProfileMetrics(profile).totalH;
    },

    getGradientBakeDimensions(profile, layoutPx) {
        const fontSizePx = layoutPx?.fontSizePx ?? 10;
        const contentW = layoutPx?.widthPx ?? Math.max(1, Math.round(this.getMaxLineWidthEm(profile) * fontSizePx));
        const contentH = Math.max(1, this.getProfileContentHeightPx(profile));
        const meso = CONFIG?.depth?.v2?.meso || {};

        const cellH = scale(meso.cellHeight || 90);
        const rowSpan = Math.max(1, profile.rowSpan || 1);
        const rowGap = scale(meso.rowGap || 16);
        const cellBlockH = rowSpan * cellH + Math.max(0, rowSpan - 1) * rowGap;

        const minH = scale(meso.mockGradientMinHeight ?? 72);
        const minW = scale(meso.mockGradientMinWidth ?? 52);
        const lineCount = profile.lines?.length || 1;
        const sparseBoost = lineCount <= 1
            ? (meso.mockSingleLineGradientBoost ?? 1.65)
            : lineCount <= 2 ? 1.22 : 1;

        const bakeH = Math.max(contentH, minH, cellBlockH * 0.88) * sparseBoost;
        const bakeW = Math.max(contentW, minW, bakeH * 0.68);

        return {
            widthPx: Math.round(bakeW),
            heightPx: Math.round(bakeH),
            contentW,
            contentH,
            fontSizePx
        };
    },

    getGradientRefLineCount() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        if (Number.isFinite(meso.mockGradientRefLines) && meso.mockGradientRefLines > 0) {
            return Math.round(meso.mockGradientRefLines);
        }
        let max = 0;
        for (const band of Object.values(this.SIZE_BANDS)) {
            const titles = band.titleMin + Math.max(0, band.titleRange - 1);
            const bodies = band.bodyMin + Math.max(0, band.bodyRange - 1);
            max = Math.max(max, titles + bodies);
        }
        return max;
    },

    getGradientRefHeightPx() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const titleH = this.getLineHeightPx('title');
        const bodyH = this.getLineHeightPx('body');
        const gap = this.getTitleBodyGapPx();
        if (Number.isFinite(meso.mockGradientRefLines) && meso.mockGradientRefLines > 0) {
            const n = Math.round(meso.mockGradientRefLines);
            if (n <= 1) return titleH;
            return titleH + gap + (n - 1) * bodyH;
        }
        let max = 0;
        for (const band of Object.values(this.SIZE_BANDS)) {
            const titles = band.titleMin + Math.max(0, band.titleRange - 1);
            const bodies = band.bodyMin + Math.max(0, band.bodyRange - 1);
            const h = titles * titleH + (titles > 0 && bodies > 0 ? gap : 0) + bodies * bodyH;
            max = Math.max(max, h);
        }
        return max;
    },

    getGradientRefWidthPx() {
        const colW = this.getMesoColumnWidthPx();
        if (colW) return colW;
        const meso = CONFIG?.depth?.v2?.meso || {};
        if (Number.isFinite(meso.mockGradientRefWidthPx) && meso.mockGradientRefWidthPx > 0) {
            return Math.round(scale(meso.mockGradientRefWidthPx));
        }
        const minW = scale(meso.mockGradientMinWidth ?? 52);
        const refH = this.getGradientRefHeightPx();
        const widthCap = this.getFrameWidthCap();
        const sizeScale = this.getSizeScale();
        const baseFontPx = scale(meso.mockGradientRefFontPx ?? 14) * sizeScale;
        let maxW = minW;
        for (const band of Object.values(this.SIZE_BANDS)) {
            const maxLineFrac = band.widthMin + Math.max(0, band.widthRange - 1);
            const frameW = Math.min(widthCap, Math.max(0.62, maxLineFrac * 1.05));
            const maxEm = frameW * 10 * sizeScale * band.fontScale;
            const glyphFontPx = baseFontPx * band.fontScale;
            maxW = Math.max(maxW, Math.round(maxEm * glyphFontPx / 10));
        }
        const aspectW = Math.round(refH * (meso.mockGradientRefAspect ?? 0.68));
        return Math.max(maxW, aspectW);
    },

    getUniformGradientBakeDimensions() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const minH = scale(meso.mockGradientMinHeight ?? 72);
        const refH = Math.max(this.getGradientRefHeightPx(), minH);
        const refW = this.getGradientRefWidthPx();
        return {
            widthPx: refW,
            heightPx: Math.round(refH),
            contentW: refW,
            contentH: refH,
            fontSizePx: null
        };
    },

    resolveGradientBakeDimensions(profile, layoutPx, wrapper = null) {
        if (this.isTextureGradientMode()) {
            const uniform = this.getUniformGradientBakeDimensions();
            let dims = { ...uniform };

            if (wrapper && this.usesColumnFillLayout()) {
                const colW = this.getMesoColumnWidthPx();
                if (colW) {
                    dims = { ...dims, widthPx: colW, contentW: colW };
                }
            }

            /* Per-note slice: bake must cover full silhouette height or line offsets miss the texture */
            if (profile && this.isSliceGradientMode()) {
                const metrics = this.getProfileMetrics(profile);
                const contentH = Math.ceil(metrics.totalH);
                if (contentH > dims.heightPx) {
                    dims = { ...dims, heightPx: contentH, contentH };
                }
            }

            return dims;
        }
        return this.getGradientBakeDimensions(profile, layoutPx);
    },

    invalidateColumnGradientLayout() {
        this._columnGradientLayout = null;
    },

    usesColumnGradientTapestry() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        if (meso.mockColumnGradient === false) return false;
        if (!this.isTextureGradientMode()) return false;
        const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
        return Boolean(app?.classList.contains('is-meso-column-layout'));
    },

    buildColumnGradientLayout() {
        if (this._columnGradientLayout) return this._columnGradientLayout;

        const empty = { columns: [], byWrapper: new Map() };
        const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
        if (!app?.classList.contains('is-meso-column-layout')) {
            this._columnGradientLayout = empty;
            return empty;
        }

        const meso = CONFIG?.depth?.v2?.meso || {};
        const itemGap = scale(meso.colItemGap ?? 14);
        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        const columns = [];
        const byWrapper = new Map();

        app.querySelectorAll(':scope > .meso-grid-column').forEach((colEl, colIndex) => {
            let stackY = 0;
            const entries = [];
            const colRect = colEl.getBoundingClientRect();
            const widthPx = colRect.width > 8 ? Math.round(colRect.width) : 0;

            colEl.querySelectorAll('.note-wrapper').forEach(wrapper => {
                const noteId = wrapper.dataset.noteId;
                const item = noteId ? itemsById.get(noteId) : null;
                if (!item) return;

                const profile = this.buildProfile(item, wrapper);
                const contentH = Math.max(1, this.getProfileContentHeightPx(profile));
                entries.push({ wrapper, item, profile, stackY, contentH });
                byWrapper.set(wrapper, { colIndex, stackY, contentH, profile });
                stackY += contentH + itemGap;
            });

            const totalH = entries.length
                ? Math.max(1, stackY - itemGap)
                : 1;

            columns.push({ colIndex, colEl, entries, totalH, widthPx });
        });

        this._columnGradientLayout = { columns, byWrapper };
        return this._columnGradientLayout;
    },

    getColumnGradientBakeDimensions(wrapper) {
        if (!this.usesColumnGradientTapestry()) return null;
        const layout = this.buildColumnGradientLayout();
        const ctx = layout.byWrapper.get(wrapper);
        if (!ctx) return null;

        const col = layout.columns[ctx.colIndex];
        if (!col) return null;

        const meso = CONFIG?.depth?.v2?.meso || {};
        const minH = scale(meso.mockGradientMinHeight ?? 72);
        const widthPx = col.widthPx || this.getMesoColumnWidthPx() || this.getGradientRefWidthPx();
        const refBake = this.getUniformGradientBakeDimensions();
        const bakeH = Math.max(refBake.heightPx, minH);

        return {
            widthPx: Math.round(widthPx),
            heightPx: bakeH,
            contentW: Math.round(widthPx),
            contentH: ctx.contentH,
            stackY: ctx.stackY,
            columnIndex: ctx.colIndex,
            columnTotalH: Math.max(Math.round(col.totalH), ctx.contentH),
            fontSizePx: null
        };
    },

    mapColumnGlobalY(globalY, columnTotalH, bakeH, lineH = 0) {
        const safeColH = Math.max(1, columnTotalH);
        const safeBakeH = Math.max(1, bakeH);
        const lineSpan = Math.max(1, safeColH - lineH);
        const bakeSpan = Math.max(1, safeBakeH - lineH);
        if (safeColH <= safeBakeH) return globalY;
        return (globalY / lineSpan) * bakeSpan;
    },

    computeSliceLineOffset(bakeH, globalY, overscale = 1) {
        const overscalePad = bakeH * (overscale - 1) * 0.5;
        return -(globalY + overscalePad);
    },

    getTagPaletteCacheKey(item) {
        const tags = (item?.tags || []).filter(t => t?.color);
        const focusKey = this.getMesoFocusLensKey();
        if (!tags.length) return focusKey ? `none|${focusKey}` : 'none';
        const colors = tags.map((tag, i) => this.resolveTagColorForLens(tag, item, i)).join('|');
        return focusKey ? `${colors}|${focusKey}` : colors;
    },

    getColumnTagPalette(colIndex) {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const maxTags = meso.mockShaderMaxTags ?? 10;
        const fallback = CONFIG?.data?.fallbackTagColor || '#5a5a5a';
        const layout = this.buildColumnGradientLayout();
        const col = layout.columns[colIndex];
        if (!col) {
            return { tagColors: [this.processTagColor(fallback)], tagCount: 1, cacheKey: 'none' };
        }

        const seen = new Set();
        const raw = [];
        const tagColors = [];
        for (const entry of col.entries) {
            for (const tag of (entry.item?.tags || [])) {
                if (!tag?.color || seen.has(tag.color)) continue;
                const resolved = this.resolveTagColorForLens(tag, entry.item, tagColors.length);
                seen.add(resolved);
                raw.push(tag.color);
                tagColors.push(resolved);
                if (tagColors.length >= maxTags) break;
            }
            if (tagColors.length >= maxTags) break;
        }

        if (!tagColors.length) {
            tagColors.push(this.processTagColor(fallback));
            raw.push(fallback);
        }

        return {
            tagColors,
            tagCount: tagColors.length,
            cacheKey: raw.join('|')
        };
    },

    bakeColumnP5Gradient(colIndex) {
        const layout = this.buildColumnGradientLayout();
        const col = layout.columns[colIndex];
        if (!col) return '';

        const pCfg = this.getP5Config();
        const meso = CONFIG?.depth?.v2?.meso || {};
        const minH = scale(meso.mockGradientMinHeight ?? 72);
        const cssW = col.widthPx || this.getMesoColumnWidthPx() || this.getGradientRefWidthPx();
        const refBake = this.getUniformGradientBakeDimensions();
        const cssH = Math.max(refBake.heightPx, minH);
        const w = Math.max(1, Math.round(cssW * pCfg.scale));
        const h = Math.max(1, Math.round(cssH * pCfg.scale));
        const tagPalette = this.getColumnTagPalette(colIndex);
        const cacheKey = `p5|col|${colIndex}|${w}|${h}|${tagPalette.cacheKey}|v${this._bakeVersion}`;

        if (this._textureCache.has(cacheKey)) {
            return this._textureCache.get(cacheKey);
        }

        if (typeof MesoGradientP5 === 'undefined' || !MesoGradientP5.init()) {
            return '';
        }

        try {
            const seed = this.hashSeed(`meso-col-${colIndex}`);
            const url = MesoGradientP5.toDataURL({
                width: w,
                height: h,
                tagColors: tagPalette.tagColors,
                seed,
                bgColor: pCfg.bgColor,
                blobCount: pCfg.blobCount,
                radiusMinScale: pCfg.radiusMinScale,
                radiusMaxScale: pCfg.radiusMaxScale,
                verticesMin: pCfg.verticesMin,
                verticesMax: pCfg.verticesMax,
                distortionMin: pCfg.distortionMin,
                distortionMax: pCfg.distortionMax,
                blurScale: pCfg.blurScale,
                grainAlpha: pCfg.grainAlpha,
                edgeDarken: pCfg.edgeDarken,
                blendMode: pCfg.blendMode,
                rand: (s, i) => this.rand(s, i)
            });

            if (url) this._textureCache.set(cacheKey, url);
            return url;
        } catch (err) {
            console.warn('MesoMock column p5 bake failed', colIndex, err);
            return '';
        }
    },

    applySliceLineLayout(frame, profile, fontSizePx, frameWidthPx, bakeDims, gradientMode, sCfg) {
        if (!frame) return;

        const metrics = this.getProfileMetrics(profile);
        const overscale = sCfg?.textureOverscale ?? 1.78;
        const displayScale = (gradientMode === 'shader' || gradientMode === 'p5') ? overscale : 1;
        const bakeH = bakeDims.heightPx;
        const totalH = metrics.totalH;
        const contentTopInBake = bakeH - totalH;

        frame.querySelectorAll('.meso-mock__line').forEach((lineEl, i) => {
            const line = profile.lines[i];
            if (!line) return;

            const lineTop = metrics.offsets[i];
            const lineWidthPx = this.getLineWidthPx(line, profile, fontSizePx, frameWidthPx);
            lineEl.style.width = `${lineWidthPx}px`;
            lineEl.style.height = `${line.lineH}px`;
            lineEl.style.top = `${lineTop}px`;
            lineEl.style.setProperty('--meso-mock-line-h', `${line.lineH}px`);
            lineEl.style.setProperty('--meso-mock-line-top', `${lineTop}px`);
            lineEl.style.setProperty('--meso-mock-line-w', `${line.width.toFixed(4)}`);

            const mappedY = contentTopInBake + lineTop;
            const lineOffset = this.computeSliceLineOffset(bakeH, mappedY, displayScale);
            lineEl.style.setProperty('--meso-mock-line-offset', `${lineOffset}px`);
        });
    },

    getSizeScale() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        return (meso.mockScale ?? 1) * (meso.mockSilhouetteFill ?? 1);
    },

    getMesoColumnWidthPx() {
        if (typeof document !== 'undefined') {
            const opening = document.getElementById('opening-screen');
            if (opening && !opening.hidden && document.body.classList.contains('opening-active')) {
                const raw = getComputedStyle(opening).getPropertyValue('--opening-meso-col-width').trim();
                if (raw && typeof measureSiteGridTokenPx === 'function') {
                    const root = document.documentElement;
                    root.style.setProperty('--opening-meso-measure-w', raw);
                    const px = measureSiteGridTokenPx('--opening-meso-measure-w', 'width');
                    root.style.removeProperty('--opening-meso-measure-w');
                    if (px > 8) return Math.round(px);
                }
            }
        }

        const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
        if (app?.classList.contains('is-meso-hive-layout')) {
            const raw = getComputedStyle(document.documentElement).getPropertyValue('--v2-hive-cell-width');
            const w = parseFloat(raw);
            return w > 8 ? Math.round(w) : null;
        }
        if (!app?.classList.contains('is-meso-column-layout')) return null;
        const col = app.querySelector(':scope > .meso-grid-column');
        if (!col) return null;
        const w = col.getBoundingClientRect().width;
        return w > 8 ? Math.round(w) : null;
    },

    usesColumnFillLayout() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        return (meso.mockColumnFill ?? 1) > 0 && this.getMesoColumnWidthPx() != null;
    },

    resolveFrameWidthPx(profile, fontSizePx) {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const fill = meso.mockColumnFill ?? 1;
        const colW = this.getMesoColumnWidthPx();
        if (colW && fill > 0) {
            return Math.round(colW * Math.min(1, fill));
        }
        return this.getFrameWidthPx(profile, fontSizePx);
    },

    getFrameWidthCap() {
        return CONFIG?.depth?.v2?.meso?.mockFrameWidthMax ?? 1;
    },

    estimateGlyphFontSizePx(profile) {
        const meso = CONFIG?.depth?.v2?.meso || {};
        return scale(meso.mockGradientRefFontPx ?? 14) * this.getSizeScale() * profile.fontScale;
    },

    getLineWidthPx(line, profile, fontSizePx, frameWidthPx = null) {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const minPx = scale(meso.mockLineMinWidthPx ?? 8);
        if (frameWidthPx != null && this.usesColumnFillLayout()) {
            return Math.max(minPx, Math.round(line.width * frameWidthPx));
        }
        const fs = fontSizePx > 0 ? fontSizePx : this.estimateGlyphFontSizePx(profile);
        const px = Math.round(this.getLineWidthEm(line, profile) * fs);
        return Math.max(minPx, px);
    },

    getFrameWidthPx(profile, fontSizePx) {
        const lines = profile.lines || [];
        if (!lines.length) return scale(CONFIG?.depth?.v2?.meso?.mockGradientMinWidth ?? 52);
        return Math.max(...lines.map(line => this.getLineWidthPx(line, profile, fontSizePx)));
    },

  /* רוחב שורה — px (absolute lines; frame width set explicitly) */
    lineWidthStyle(line, profile, fontSizePx) {
        return `width:${this.getLineWidthPx(line, profile, fontSizePx)}px`;
    },

    getMaxLineWidthEm(profile) {
        return Math.max(...profile.lines.map(line => this.getLineWidthEm(line, profile)));
    },

    getFrameRefEm(profile) {
        return profile.frameWidth * 10 * this.getSizeScale() * profile.fontScale;
    },

    hashSeed(id) {
        let h = 2166136261;
        const s = String(id);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    },

    rand(seed, index) {
        let x = Math.imul(seed ^ index, 2654435761);
        x = (x ^ (x >>> 16)) >>> 0;
        return x / 4294967296;
    },

    pickSizeBand(seed) {
        const r = this.rand(seed, 3);
        if (r < 0.14) return 'xs';
        if (r < 0.32) return 'sm';
        if (r < 0.58) return 'md';
        if (r < 0.82) return 'lg';
        return 'xl';
    },

    getGradientSoftness() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const mode = this.getGradientMode();
        if (mode === 'canvas' || mode === 'shader' || mode === 'p5') {
            return meso.mockGradientSoftness ?? 0.02;
        }
        return meso.mockGradientSoftness ?? 0.14;
    },

    getGradientMode() {
        if (this._renderContext === 'opening') {
            return CONFIG?.opening?.mesoGradientMode || 'bands';
        }
        return CONFIG?.depth?.v2?.meso?.mockGradientMode ?? 'shader';
    },

    isTextureGradientMode() {
        const mode = this.getGradientMode();
        return mode === 'canvas' || mode === 'shader' || mode === 'p5';
    },

    isSliceGradientMode() {
        const mode = this.getGradientMode();
        return mode === 'blobs' || mode === 'canvas' || mode === 'shader' || mode === 'p5';
    },

    clearTextureCache() {
        this._textureCache.clear();
        this.invalidateColumnGradientLayout();
        if (typeof MesoGradientEngine !== 'undefined') {
            MesoGradientEngine.stopLive();
        }
    },

    getP5Config() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        return {
            scale: Math.min(dpr, meso.mockCanvasScale ?? 1.5),
            bgColor: meso.mockP5BgColor ?? meso.mockShaderBgColor ?? '#f4f1ea',
            blobCount: meso.mockP5BlobCount ?? 200,
            radiusMinScale: meso.mockP5RadiusMinScale ?? 0.04,
            radiusMaxScale: meso.mockP5RadiusMaxScale ?? 0.32,
            blendMode: meso.mockP5BlendMode ?? 'source-over',
            verticesMin: meso.mockP5VerticesMin ?? 15,
            verticesMax: meso.mockP5VerticesMax ?? 60,
            distortionMin: meso.mockP5DistortionMin ?? 0.2,
            distortionMax: meso.mockP5DistortionMax ?? 2.0,
            blurScale: meso.mockP5BlurScale ?? 0.12,
            grainAlpha: meso.mockP5GrainAlpha ?? 18,
            edgeDarken: meso.mockP5EdgeDarken ?? 0.35,
            textureOverscale: meso.mockP5TextureOverscale ?? 1.35,
            grainOpacity: meso.mockP5GrainOpacity ?? 0,
            grainTile: meso.mockGrainTile ?? 64
        };
    },

    getShaderConfig() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const preset = typeof MesoGradientEngine !== 'undefined'
            ? MesoGradientEngine.getActivePreset()
            : MesoGradientVisualPreset;
        const defs = preset.runtimeDefaults || {};
        return {
            scale: Math.min(dpr, meso.mockCanvasScale ?? 1.5),
            grainIntensity: meso.mockShaderGrain ?? defs.grainIntensity ?? 0.012,
            animSpeed: meso.mockShaderAnimSpeed ?? defs.animSpeed ?? 0.45,
            liveHover: meso.mockShaderLiveHover !== false,
            bgColor: meso.mockShaderBgColor ?? defs.bgColor ?? '#F3F3F3',
            mouseStrength: meso.mockShaderMouseStrength ?? defs.mouseStrength ?? 0.82,
            flowAmount: meso.mockShaderFlowAmount ?? defs.flowAmount ?? 0.35,
            morphComplexity: meso.mockShaderMorphComplexity ?? defs.morphComplexity ?? 1,
            fillScale: meso.mockShaderFillScale ?? defs.fillScale ?? 2.35,
            symmetry: meso.mockShaderSymmetry ?? defs.symmetry ?? 4,
            colorBlend: meso.mockShaderColorBlend ?? defs.colorBlend ?? 2.6,
            textureOverscale: meso.mockShaderTextureOverscale ?? defs.textureOverscale ?? 1.78,
            liveFps: meso.mockShaderLiveFps ?? defs.liveFps ?? 20,
            mouseLerp: meso.mockShaderMouseLerp ?? defs.mouseLerp ?? 0.12,
            presetId: meso.mockShaderPreset ?? 'smooth-tri-blob-v1'
        };
    },

    getShaderAnchor(seed) {
        return {
            anchorX: 0.42 + this.rand(seed, 601) * 0.16,
            anchorY: 0.40 + this.rand(seed, 602) * 0.20
        };
    },

    buildShaderInkBlots(seed) {
        const preset = typeof MesoGradientEngine !== 'undefined'
            ? MesoGradientEngine.getActivePreset()
            : null;
        if (!preset || preset.type !== 'sdf-cosine' || !preset.buildInkBlots) return null;
        return preset.buildInkBlots(seed, (s, i) => this.rand(s, i));
    },

    buildShaderPalette(colors) {
        const preset = typeof MesoGradientEngine !== 'undefined'
            ? MesoGradientEngine.getActivePreset()
            : null;
        if (!preset || preset.type !== 'sdf-cosine' || !preset.buildCosinePalette) return null;
        if (typeof MesoGradientEngine === 'undefined') return null;
        return preset.buildCosinePalette(
            colors.baseColor,
            colors.accentColor,
            colors.tertiaryColor,
            (c) => MesoGradientEngine.parseColorVec3(c)
        );
    },

    getMesoFocusMutedColor() {
        return CONFIG?.depth?.v2?.meso?.mockFocusMutedColor ?? '#d6d6d6';
    },

    getMesoFocusState() {
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 2) {
            return null;
        }
        if (typeof document !== 'undefined' &&
            !document.body.classList.contains('is-block-focus')) {
            return null;
        }
        if (typeof CatalogState === 'undefined') return null;
        const tags = CatalogState.activeCriteria?.tags;
        const authors = CatalogState.activeCriteria?.authors;
        if ((!tags || tags.size === 0) && (!authors || authors.size === 0)) {
            return null;
        }
        return { tags: tags || new Set(), authors: authors || new Set() };
    },

    getMesoFocusLensKey() {
        const focus = this.getMesoFocusState();
        if (!focus) return '';
        const tagKey = [...focus.tags].sort().join(',');
        const authorKey = [...focus.authors].sort().join(',');
        return `f:${tagKey}|a:${authorKey}`;
    },

    shouldTagKeepColor(tag, item, focus = this.getMesoFocusState()) {
        if (!focus) return true;
        if (focus.authors.size && item?.authorCode && focus.authors.has(item.authorCode)) {
            return true;
        }
        if (focus.tags.size && tag?.name && focus.tags.has(tag.name)) {
            return true;
        }
        return false;
    },

    muteTagColorForLens(tag, index = 0) {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const minGray = meso.mockFocusMutedGrayMin ?? 196;
        const maxGray = meso.mockFocusMutedGrayMax ?? 232;
        const desat = meso.mockFocusMutedDesat ?? 0.94;
        const tint = meso.mockFocusMutedTint ?? 0.06;

        const raw = tag?.color || meso.mockFocusMutedColor || '#d6d6d6';
        const { r, g, b } = this.parseColorToRgb(raw);
        const hsl = this.rgbToHsl(r, g, b);

        const spread = Math.max(1, maxGray - minGray);
        const lumWeight = Math.min(1, Math.max(0, hsl.l));
        const indexBias = (index % 7) * 0.045;
        const grayVal = Math.round(minGray + (lumWeight * 0.72 + indexBias) * spread);

        const sat = hsl.s * (1 - desat) * tint;
        const light = grayVal / 255;
        const muted = this.hslToRgb(hsl.h, sat, light);
        return `rgb(${muted.r}, ${muted.g}, ${muted.b})`;
    },

    resolveTagColorForLens(tag, item, index = 0) {
        if (!tag?.color) return this.muteTagColorForLens({ color: '#888888' }, index);
        if (this.shouldTagKeepColor(tag, item)) {
            return this.processTagColor(tag.color);
        }
        return this.muteTagColorForLens(tag, index);
    },

    refreshFocusLensTextures() {
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 2) return;
        this._textureCache.clear();
        this._bakeVersion += 1;

        if (typeof AppState === 'undefined') return;
        const itemsById = new Map(AppState.items.map(entry => [String(entry.id), entry]));

        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            if (wrapper.classList.contains('is-layout-excluded') ||
                wrapper.classList.contains('is-molecule-filtered-out')) {
                return;
            }

            const item = itemsById.get(wrapper.dataset.noteId);
            if (!item) return;

            const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
            const frame = glyph?.querySelector('.meso-mock__frame');
            if (!glyph || !frame) return;

            const profile = this.buildProfile(item, wrapper);
            const fontSizePx = this.measureGlyphFontSizePx(glyph);
            const frameWidthPx = this.resolveFrameWidthPx(profile, fontSizePx);
            const bakeDims = this.resolveGradientBakeDimensions(
                profile,
                { fontSizePx, widthPx: frameWidthPx },
                wrapper
            );
            this.applyTextureBake(wrapper, item, profile, {
                fontSizePx,
                widthPx: frameWidthPx,
                bakeDims
            });
        });
    },

    getShaderColors(item) {
        const tags = (item.tags || []).filter(tag => tag && tag.color);
        const fallback = CONFIG?.data?.fallbackTagColor || '#5a5a5a';
        const map = MesoGradientVisualPreset.tagColorMapping;
        const focus = this.getMesoFocusState();

        if (tags.length === 0) {
            const base = focus
                ? this.muteTagColorForLens({ color: fallback }, 0)
                : this.processTagColor(fallback);
            return {
                baseColor: base,
                accentColor: this.darkenColor(base, map.noTagsAccentDarken),
                tertiaryColor: this.softenGradientColor('#888888')
            };
        }

        const baseColor = this.resolveTagColorForLens(tags[0], item, 0);
        const accentColor = tags.length > 1
            ? this.resolveTagColorForLens(tags[tags.length - 1], item, tags.length - 1)
            : this.shouldTagKeepColor(tags[0], item, focus)
                ? this.darkenColor(baseColor, map.singleTagAccentDarken)
                : this.muteTagColorForLens(tags[0], 1);
        const tertiaryColor = tags.length > 2
            ? this.resolveTagColorForLens(tags[Math.floor(tags.length / 2)], item, Math.floor(tags.length / 2))
            : accentColor;

        return { baseColor, accentColor, tertiaryColor };
    },

    getShaderTagPalette(item) {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const maxTags = meso.mockShaderMaxTags ?? 10;
        const tags = (item.tags || []).filter(tag => tag && tag.color);
        const fallback = CONFIG?.data?.fallbackTagColor || '#5a5a5a';

        if (tags.length === 0) {
            return {
                tagColors: [this.processTagColor(fallback)],
                tagCount: 1
            };
        }

        const tagColors = tags.slice(0, maxTags).map((tag, i) => this.resolveTagColorForLens(tag, item, i));
        return { tagColors, tagCount: tagColors.length };
    },

    getCanvasConfig() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        return {
            scale: Math.min(dpr, meso.mockCanvasScale ?? 1.5),
            noise: meso.mockCanvasNoise ?? 3,
            washColor: meso.mockBlobWashColor ?? '#1a1a1a',
            enrich: meso.mockColorEnrich ?? 0.18,
            blendMode: meso.mockCanvasBlend ?? 'source-over'
        };
    },

    rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return { h: 0, s: 0, l };

        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            default: h = ((r - g) / d + 4) / 6;
        }
        return { h, s, l };
    },

    hslToRgb(h, s, l) {
        if (s === 0) {
            const v = Math.round(l * 255);
            return { r: v, g: v, b: v };
        }
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return {
            r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
            g: Math.round(hue2rgb(p, q, h) * 255),
            b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
        };
    },

    enrichTagColor(color, amount = 0.18) {
        const { r, g, b } = this.parseColorToRgb(color);
        const { h, s, l } = this.rgbToHsl(r, g, b);
        const ns = Math.min(1, s + amount);
        const nl = Math.max(0.08, Math.min(0.72, l - amount * 0.12));
        const enriched = this.hslToRgb(h, ns, nl);
        return `rgb(${enriched.r}, ${enriched.g}, ${enriched.b})`;
    },

    processTagColor(rawColor) {
        const soft = this.softenGradientColor(rawColor);
        if (this.getGradientMode() === 'canvas') {
            return this.enrichTagColor(soft, this.getCanvasConfig().enrich);
        }
        if (this.getGradientMode() === 'shader') {
            return this.enrichTagColor(soft, this.getCanvasConfig().enrich);
        }
        if (this.getGradientMode() === 'p5') {
            const meso = CONFIG?.depth?.v2?.meso || {};
            const enrich = meso.mockP5ColorEnrich ?? meso.mockColorEnrich ?? 0.28;
            return this.enrichTagColor(soft, enrich);
        }
        return soft;
    },

    colorToRgbString(color) {
        const { r, g, b } = this.parseColorToRgb(color);
        return `rgb(${r}, ${g}, ${b})`;
    },

    getEmBase(profile) {
        return 10 * this.getSizeScale() * profile.fontScale;
    },

    getLineWidthEm(line, profile) {
        return line.width * profile.frameWidth * this.getEmBase(profile);
    },

    getSvgConfig() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        return {
            render: meso.mockSvgRender ?? 'fill',
            strokeWidth: meso.mockSvgStrokeWidth ?? 1.15
        };
    },

    getBlobConfig() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        return {
            falloff: meso.mockBlobFalloff ?? 90,
            core: meso.mockBlobCore ?? 44,
            edge: meso.mockBlobEdge ?? 72,
            edgeOpacity: meso.mockBlobEdgeOpacity ?? 0.28,
            peakMin: meso.mockBlobPeakMin ?? 0.68,
            peakMax: meso.mockBlobPeakMax ?? 0.96,
            washOpacity: meso.mockBlobWashOpacity ?? 0.16,
            rxMin: meso.mockBlobRxMin ?? 42,
            rxRange: meso.mockBlobRxRange ?? 48,
            ryMin: meso.mockBlobRyMin ?? 36,
            ryRange: meso.mockBlobRyRange ?? 42,
            echoChance: meso.mockBlobEchoChance ?? 0.72,
            blobCount: meso.mockBlobCount
        };
    },

    computeBlobSpecs(item, seed) {
        const tags = (item.tags || []).filter(tag => tag && tag.color);
        const palette = tags.length
            ? tags.map((tag, i) => this.resolveTagColorForLens(tag, item, i))
            : [this.processTagColor('#5a5a5a'), this.processTagColor('#888888')];

        const cfg = this.getBlobConfig();
        const blobCount = cfg.blobCount ?? Math.min(7, Math.max(4, tags.length + 2));
        const specs = [];
        const isCanvas = this.getGradientMode() === 'canvas';

        const pushBlob = (color, x, y, rx, ry, peakMul = 1, randSlot = 0) => {
            const peak = Math.min(0.98, cfg.peakMin + this.rand(seed, 124 + randSlot) * (cfg.peakMax - cfg.peakMin) * peakMul);
            specs.push({
                color,
                xPct: Number(x),
                yPct: Number(y),
                rxPct: Number(rx),
                ryPct: Number(ry),
                peak,
                mid: peak * 0.68,
                edgeA: cfg.edgeOpacity * peakMul,
                core: cfg.core,
                edge: cfg.edge,
                falloff: cfg.falloff,
                peakMul
            });
        };

        if (cfg.washOpacity > 0) {
            const washColor = isCanvas
                ? this.colorToRgbString(this.getCanvasConfig().washColor)
                : palette[0];
            specs.push({
                color: washColor,
                xPct: 64,
                yPct: 46,
                rxPct: 132,
                ryPct: 108,
                peak: cfg.washOpacity,
                mid: cfg.washOpacity * 0.45,
                edgeA: 0,
                core: 52,
                edge: cfg.edge,
                falloff: Math.min(cfg.falloff, 92)
            });
        }

        for (let i = 0; i < blobCount; i++) {
            const tag = tags[i % Math.max(1, tags.length)];
            const tagIndex = i % Math.max(1, tags.length);
            const soft = tags.length
                ? this.resolveTagColorForLens(tag, item, tagIndex)
                : this.processTagColor(palette[i % palette.length]);
            const alt = palette[(i + 1) % palette.length];
            const x = (34 + this.rand(seed, 80 + i * 5) * 54).toFixed(1);
            const y = (4 + this.rand(seed, 91 + i * 5) * 92).toFixed(1);
            const rx = (cfg.rxMin + this.rand(seed, 102 + i * 5) * cfg.rxRange).toFixed(1);
            const ry = (cfg.ryMin + this.rand(seed, 113 + i * 5) * cfg.ryRange).toFixed(1);

            pushBlob(soft, x, y, rx, ry, 1, i * 2);

            if (this.rand(seed, 140 + i * 5) < cfg.echoChance) {
                const ex = Math.min(96, Math.max(8, Number(x) + (this.rand(seed, 150 + i * 5) - 0.5) * 22)).toFixed(1);
                const ey = Math.min(96, Math.max(4, Number(y) + (this.rand(seed, 160 + i * 5) - 0.5) * 18)).toFixed(1);
                const erx = (Number(rx) * (0.72 + this.rand(seed, 170 + i * 5) * 0.22)).toFixed(1);
                const ery = (Number(ry) * (0.72 + this.rand(seed, 180 + i * 5) * 0.22)).toFixed(1);
                const echoColor = tags.length > 1
                    ? palette[(i + 1) % palette.length]
                    : soft;
                pushBlob(echoColor, ex, ey, erx, ery, 0.58, i * 2 + 1);
            }
        }

        return specs;
    },

    sanitizeGradId(id) {
        return `meso-grad-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    },

    colorToHex(color) {
        const { r, g, b } = this.parseColorToRgb(color);
        const h = (v) => v.toString(16).padStart(2, '0');
        return `#${h(r)}${h(g)}${h(b)}`;
    },

    buildSvgClipPath(profile, viewW, clipId) {
        const metrics = this.getProfileMetrics(profile);
        const rects = profile.lines.map((line, i) => {
            const w = Math.max(0.5, line.width * viewW);
            const x = (viewW - w).toFixed(2);
            const y = metrics.offsets[i].toFixed(2);
            const h = line.lineH.toFixed(2);
            return `<rect x="${x}" y="${y}" width="${w.toFixed(2)}" height="${h}"/>`;
        }).join('');
        return `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">${rects}</clipPath>`;
    },

    buildSvgBlobDefs(specs, gradId, viewW, viewH) {
        const stopsFor = (spec) => {
            const hex = this.colorToHex(spec.color);
            if (spec.edgeA <= 0) {
                return `<stop offset="0%" stop-color="${hex}" stop-opacity="${spec.peak.toFixed(2)}"/>
                <stop offset="${spec.core}%" stop-color="${hex}" stop-opacity="${spec.mid.toFixed(2)}"/>
                <stop offset="${spec.falloff}%" stop-color="${hex}" stop-opacity="0"/>`;
            }
            return `<stop offset="0%" stop-color="${hex}" stop-opacity="${spec.peak.toFixed(2)}"/>
                <stop offset="${spec.core}%" stop-color="${hex}" stop-opacity="${spec.mid.toFixed(2)}"/>
                <stop offset="${spec.edge}%" stop-color="${hex}" stop-opacity="${spec.edgeA.toFixed(2)}"/>
                <stop offset="${spec.falloff}%" stop-color="${hex}" stop-opacity="0"/>`;
        };

        return specs.map((spec, i) => {
            const id = `${gradId}-b${i}`;
            const cx = (spec.xPct / 100 * viewW).toFixed(2);
            const cy = (spec.yPct / 100 * viewH).toFixed(2);
            const rx = (spec.rxPct / 100 * viewW).toFixed(2);
            const ry = (spec.ryPct / 100 * viewH).toFixed(2);
            const r = Math.max(Number(rx), Number(ry)).toFixed(2);
            const sx = (Number(rx) / Number(r)).toFixed(4);
            const sy = (Number(ry) / Number(r)).toFixed(4);
            const transform = `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-Number(cx)} ${-Number(cy)})`;
            return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}" gradientTransform="${transform}">
                ${stopsFor(spec)}
            </radialGradient>`;
        }).join('');
    },

    buildSvgBlobEllipses(specs, gradId, viewW, viewH) {
        return specs.map((spec, i) => {
            const cx = (spec.xPct / 100 * viewW).toFixed(2);
            const cy = (spec.yPct / 100 * viewH).toFixed(2);
            const rx = (spec.rxPct / 100 * viewW).toFixed(2);
            const ry = (spec.ryPct / 100 * viewH).toFixed(2);
            return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${gradId}-b${i})"/>`;
        }).join('');
    },

    buildSvgLineMaskRects(profile, viewW, svgCfg, gradId) {
        const metrics = this.getProfileMetrics(profile);
        return profile.lines.map((line, i) => {
            const w = Math.max(0.5, line.width * viewW);
            const x = (viewW - w).toFixed(2);
            const y = metrics.offsets[i].toFixed(2);
            const h = line.lineH.toFixed(2);
            const cls = `meso-mock__rect meso-mock__line--${line.kind}`;

            if (svgCfg.render === 'stroke') {
                return `<rect class="${cls}" x="${x}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="var(--bg-main)" stroke="currentColor" stroke-width="${svgCfg.strokeWidth}" vector-effect="non-scaling-stroke" shape-rendering="geometricPrecision"/>`;
            }

            return `<rect class="${cls}" x="${x}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="transparent" shape-rendering="geometricPrecision"/>`;
        }).join('');
    },

    buildSvgGrainFilter(gradId) {
        return `<filter id="${gradId}-grain" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch" result="noise"/>
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0" result="noiseA"/>
            <feBlend in="SourceGraphic" in2="noiseA" mode="multiply"/>
        </filter>`;
    },

    buildSvgGlyphHTML(item, profile) {
        const viewW = 100;
        const viewH = this.getProfileContentHeightPx(profile);
        const gradId = this.sanitizeGradId(item.id);
        const clipId = `${gradId}-clip`;
        const svgCfg = this.getSvgConfig();
        const frameWidthPct = (profile.frameWidth * 100).toFixed(1);
        const maxLineEm = Math.max(...profile.lines.map(line => this.getLineWidthEm(line, profile)));
        const svgHeightPx = viewH;
        const specs = this.computeBlobSpecs(item, profile.seed);
        const blobDefs = this.buildSvgBlobDefs(specs, gradId, viewW, viewH);
        const clipPath = this.buildSvgClipPath(profile, viewW, clipId);
        const grainFilter = this.buildSvgGrainFilter(gradId);
        const ellipses = this.buildSvgBlobEllipses(specs, gradId, viewW, viewH);
        const strokeLayer = svgCfg.render === 'stroke'
            ? `<g class="meso-mock__lines">${this.buildSvgLineMaskRects(profile, viewW, svgCfg, gradId)}</g>`
            : '';

        return `<div class="meso-mock__frame" data-size-band="${profile.bandKey}" data-gradient-mode="svg" style="--meso-mock-frame-width:${frameWidthPct}%">
            <svg class="meso-mock__svg" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style="width:${maxLineEm.toFixed(3)}em;height:${svgHeightPx}px">
                <defs>${clipPath}${grainFilter}${blobDefs}</defs>
                <g class="meso-mock__content" clip-path="url(#${clipId})" filter="url(#${gradId}-grain)">
                    <g class="meso-mock__blobs">${ellipses}</g>
                </g>
                ${strokeLayer}
            </svg>
        </div>`;
    },

    buildDomGlyphHTML(item, profile) {
        const gradientMode = this.getGradientMode();
        const metrics = this.getProfileMetrics(profile);
        const contentH = metrics.totalH;
        const sliceLayout = this.isSliceGradientMode();
        const estFontPx = this.estimateGlyphFontSizePx(profile);
        const linesHTML = profile.lines.map((line, i) => {
            const baseStyle = `${this.lineWidthStyle(line, profile, estFontPx)};height:${line.lineH}px;--meso-mock-line-h:${line.lineH}px;--meso-mock-line-w:${line.width.toFixed(4)}`;
            if (sliceLayout) {
                const topPx = metrics.offsets[i];
                return `<span class="meso-mock__line meso-mock__line--${line.kind}" style="${baseStyle};--meso-mock-line-top:${topPx}px;top:${topPx}px"></span>`;
            }
            const stackStyle = this.getLineStackGapStyle(profile, metrics, i, true);
            return `<span class="meso-mock__line meso-mock__line--${line.kind}" style="${baseStyle};--meso-mock-line-offset:${-metrics.offsets[i]}px;${stackStyle}"></span>`;
        }).join('');

        const frameWidthPct = (profile.frameWidth * 100).toFixed(1);
        const frameSizeStyle = sliceLayout
            ? `--meso-mock-content-h:${contentH}px;height:${contentH}px;`
            : `--meso-mock-gradient-h:${contentH}px;`;
        return `<div class="meso-mock__frame" data-size-band="${profile.bandKey}" data-gradient-mode="${gradientMode}" style="--meso-mock-line-count:${profile.lines.length};${frameSizeStyle}--meso-mock-frame-width:${frameWidthPct}%">${linesHTML}</div>`;
    },

    parseColorToRgb(color) {
        if (!color) return { r: 120, g: 120, b: 120 };

        const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
        if (rgb) {
            return {
                r: Number(rgb[1]),
                g: Number(rgb[2]),
                b: Number(rgb[3])
            };
        }

        const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
            let h = hex[1];
            if (h.length === 3) {
                h = h.split('').map(ch => ch + ch).join('');
            }
            const num = parseInt(h, 16);
            return {
                r: (num >> 16) & 255,
                g: (num >> 8) & 255,
                b: num & 255
            };
        }

        return { r: 120, g: 120, b: 120 };
    },

    rgbaFromColor(color, alpha) {
        const { r, g, b } = this.parseColorToRgb(color);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    /* מרכך צבע — תמיד rgb() לשימוש ב-rgba stops */
    softenGradientColor(color) {
        const mix = this.getGradientSoftness();
        if (!color || color.includes('var(')) {
            color = '#101010';
        }
        if (mix <= 0) {
            const { r, g, b } = this.parseColorToRgb(color);
            return `rgb(${r}, ${g}, ${b})`;
        }

        const { r, g, b } = this.parseColorToRgb(color);
        const blend = (ch) => Math.round(ch + (255 - ch) * mix);
        return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
    },

    darkenColor(color, amount = 0.22) {
        const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
        if (rgb) {
            const r = Math.max(0, Number(rgb[1]) * (1 - amount)) | 0;
            const g = Math.max(0, Number(rgb[2]) * (1 - amount)) | 0;
            const b = Math.max(0, Number(rgb[3]) * (1 - amount)) | 0;
            return `rgb(${r}, ${g}, ${b})`;
        }

        const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!hex) return color;

        let h = hex[1];
        if (h.length === 3) {
            h = h.split('').map(ch => ch + ch).join('');
        }

        const num = parseInt(h, 16);
        const r = Math.max(0, ((num >> 16) & 255) * (1 - amount)) | 0;
        const g = Math.max(0, ((num >> 8) & 255) * (1 - amount)) | 0;
        const b = Math.max(0, (num & 255) * (1 - amount)) | 0;
        return `rgb(${r}, ${g}, ${b})`;
    },

    buildTagGradient(item) {
        const tags = (item.tags || []).filter(tag => tag && tag.color);
        const fallback = CONFIG?.data?.fallbackTagColor || 'var(--main-text)';

        if (tags.length === 0) {
            const soft = this.softenGradientColor(fallback);
            return `linear-gradient(to left, ${soft} 0%, ${this.softenGradientColor('#5a5a5a')} 100%)`;
        }

        if (tags.length === 1) {
            const c = this.resolveTagColorForLens(tags[0], item);
            return `linear-gradient(to left, ${c} 0%, ${this.darkenColor(c, 0.16)} 100%)`;
        }

        const stops = tags.map((tag, i) => {
            const pct = tags.length === 1 ? 0 : (i / (tags.length - 1)) * 100;
            return `${this.resolveTagColorForLens(tag, item, i)} ${pct.toFixed(1)}%`;
        });

        return `linear-gradient(to left, ${stops.join(', ')})`;
    },

    buildBlobLayer(spec) {
        const peak = spec.peak.toFixed(2);
        const mid = spec.mid.toFixed(2);
        const edgeA = spec.edgeA.toFixed(2);
        return `radial-gradient(ellipse ${spec.rxPct}% ${spec.ryPct}% at ${spec.xPct}% ${spec.yPct}%, ${this.rgbaFromColor(spec.color, peak)} 0%, ${this.rgbaFromColor(spec.color, mid)} ${spec.core}%, ${this.rgbaFromColor(spec.color, edgeA)} ${spec.edge}%, ${this.rgbaFromColor(spec.color, 0)} ${spec.falloff}%)`;
    },

    buildBlobGradient(item, seed) {
        const specs = this.computeBlobSpecs(item, seed);
        return specs.map(spec => this.buildBlobLayer(spec)).join(', ');
    },

    drawCanvasBlob(ctx, spec, w, h) {
        const cx = spec.xPct / 100 * w;
        const cy = spec.yPct / 100 * h;
        const rx = Math.max(0.5, spec.rxPct / 100 * w);
        const ry = Math.max(0.5, spec.ryPct / 100 * h);
        const { r, g, b } = this.parseColorToRgb(spec.color);
        const core = spec.core / 100;
        const edge = spec.edge / 100;
        const falloff = Math.min(1, spec.falloff / 100);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(rx, ry);

        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        grad.addColorStop(0, `rgba(${r},${g},${b},${spec.peak})`);
        grad.addColorStop(core, `rgba(${r},${g},${b},${spec.mid})`);
        if (spec.edgeA > 0) {
            grad.addColorStop(edge, `rgba(${r},${g},${b},${spec.edgeA})`);
        }
        grad.addColorStop(falloff, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    applyCanvasNoise(ctx, w, h, seed, amount) {
        if (!amount || amount <= 0) return;
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const n = (this.rand(seed, x * 7 + y * 13) - 0.5) * 2 * amount;
                d[i] = Math.min(255, Math.max(0, d[i] + n));
                d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
                d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
            }
        }
        ctx.putImageData(img, 0, 0);
    },

    measureGlyphFontSizePx(glyph) {
        if (!glyph || typeof window === 'undefined') return 10;
        const fs = parseFloat(window.getComputedStyle(glyph).fontSize);
        return Number.isFinite(fs) && fs > 0 ? fs : 10;
    },

    bakeCanvasGradient(item, profile, seed, layoutPx) {
        const bake = this.resolveGradientBakeDimensions(profile, layoutPx);
        const cssW = bake.widthPx;
        const cssH = bake.heightPx;
        const cCfg = this.getCanvasConfig();
        const w = Math.max(1, Math.round(cssW * cCfg.scale));
        const h = Math.max(1, Math.round(cssH * cCfg.scale));
        const cacheKey = `${item.id}|${w}|${h}|${profile.seed}|v${this._bakeVersion}`;

        if (this._textureCache.has(cacheKey)) {
            return this._textureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        const bg = this.parseColorToRgb('#F3F3F3');
        ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
        ctx.fillRect(0, 0, w, h);

        const specs = this.computeBlobSpecs(item, seed);
        const washSpecs = specs.filter(spec => spec.edgeA <= 0);
        const colorSpecs = specs.filter(spec => spec.edgeA > 0);

        ctx.globalCompositeOperation = 'source-over';
        washSpecs.forEach(spec => this.drawCanvasBlob(ctx, spec, w, h));

        const colorBlend = cCfg.blendMode === 'screen' ? 'screen' : 'source-over';
        ctx.globalCompositeOperation = colorBlend;
        colorSpecs.forEach(spec => this.drawCanvasBlob(ctx, spec, w, h));

        ctx.globalCompositeOperation = 'source-over';
        this.applyCanvasNoise(ctx, w, h, seed, cCfg.noise);

        const url = canvas.toDataURL('image/png');
        this._textureCache.set(cacheKey, url);
        return url;
    },

    bakeShaderGradient(item, profile, seed, layoutPx) {
        const bake = this.resolveGradientBakeDimensions(profile, layoutPx);
        const cssW = bake.widthPx;
        const cssH = bake.heightPx;
        const sCfg = this.getShaderConfig();
        const w = Math.max(1, Math.round(cssW * sCfg.scale));
        const h = Math.max(1, Math.round(cssH * sCfg.scale));
        const cacheKey = `shader|${sCfg.presetId}|${item.id}|${w}|${h}|${profile.seed}|${this.getMesoFocusLensKey()}|v${this._bakeVersion}`;

        if (this._textureCache.has(cacheKey)) {
            return this._textureCache.get(cacheKey);
        }

        if (typeof MesoGradientEngine === 'undefined' || !MesoGradientEngine.init(true)) {
            return this.bakeCanvasGradient(item, profile, seed, layoutPx);
        }

        const colors = this.getShaderColors(item);
        const tagPalette = this.getShaderTagPalette(item);
        const anchor = this.getShaderAnchor(profile.seed);
        const palette = this.buildShaderPalette(colors);
        const hub = MesoGradientSdfPreset?.hub || { x: 1, y: 0.5 };
        const bakeStrength = MesoGradientEngine.getActivePreset().runtimeDefaults.bakeMouseStrength ?? 0;
        const url = MesoGradientEngine.toDataURL({
            width: w,
            height: h,
            tagColors: tagPalette.tagColors,
            tagCount: tagPalette.tagCount,
            baseColor: colors.baseColor,
            accentColor: colors.accentColor,
            tertiaryColor: colors.tertiaryColor,
            palette,
            bgColor: sCfg.bgColor,
            grainIntensity: sCfg.grainIntensity,
            animSpeed: sCfg.animSpeed,
            mouseStrength: bakeStrength,
            morphComplexity: sCfg.morphComplexity,
            fillScale: sCfg.fillScale,
            symmetry: sCfg.symmetry,
            colorBlend: sCfg.colorBlend,
            anchorX: anchor.anchorX,
            anchorY: anchor.anchorY,
            time: (seed % 10000) * 0.001,
            mouseX: hub.x,
            mouseY: hub.y
        });

        if (url) this._textureCache.set(cacheKey, url);
        return url;
    },

    bakeP5Gradient(item, profile, seed, layoutPx, wrapper = null) {
        const bake = this.resolveGradientBakeDimensions(profile, layoutPx, wrapper);
        const cssW = bake.widthPx;
        const cssH = bake.heightPx;
        const pCfg = this.getP5Config();
        const w = Math.max(1, Math.round(cssW * pCfg.scale));
        const h = Math.max(1, Math.round(cssH * pCfg.scale));
        const tagKey = this.getTagPaletteCacheKey(item);
        const cacheKey = `p5|${item.id}|${w}|${h}|${profile.seed}|${tagKey}|v${this._bakeVersion}`;

        if (this._textureCache.has(cacheKey)) {
            return this._textureCache.get(cacheKey);
        }

        if (typeof MesoGradientP5 === 'undefined' || !MesoGradientP5.init()) {
            return this.bakeCanvasGradient(item, profile, seed, layoutPx);
        }

        const tagPalette = this.getShaderTagPalette(item);
        const url = MesoGradientP5.toDataURL({
            width: w,
            height: h,
            tagColors: tagPalette.tagColors,
            seed: profile.seed,
            bgColor: pCfg.bgColor,
            blobCount: pCfg.blobCount,
            radiusMinScale: pCfg.radiusMinScale,
            radiusMaxScale: pCfg.radiusMaxScale,
            verticesMin: pCfg.verticesMin,
            verticesMax: pCfg.verticesMax,
            distortionMin: pCfg.distortionMin,
            distortionMax: pCfg.distortionMax,
            blurScale: pCfg.blurScale,
            grainAlpha: pCfg.grainAlpha,
            edgeDarken: pCfg.edgeDarken,
            blendMode: pCfg.blendMode,
            rand: (s, i) => this.rand(s, i)
        });

        if (url) this._textureCache.set(cacheKey, url);
        return url;
    },

    applyTextureGradient(glyph, frame, url) {
        const gradient = url ? `url("${url}")` : 'none';
        glyph.style.setProperty('--meso-mock-gradient', gradient);
        if (frame) {
            frame.style.setProperty('--meso-mock-gradient', gradient);
            frame.querySelectorAll('.meso-mock__line').forEach(line => {
                line.style.backgroundImage = gradient;
            });
        }
    },

    bindShaderLiveHover() {
        if (this._shaderLiveBound) return;
        if (this.getGradientMode() !== 'shader') return;
        if (!this.getShaderConfig().liveHover) return;
        if (typeof window === 'undefined') return;

        this._onShaderPointerMove = (e) => this.handleShaderPointerMove(e);
        this._onShaderPointerLeave = () => this.stopShaderLiveHover();
        window.addEventListener('pointermove', this._onShaderPointerMove, { passive: true });
        window.addEventListener('blur', this._onShaderPointerLeave);
        this._shaderLiveBound = true;
    },

    unbindShaderLiveHover() {
        if (!this._shaderLiveBound) return;
        window.removeEventListener('pointermove', this._onShaderPointerMove);
        window.removeEventListener('blur', this._onShaderPointerLeave);
        this._shaderLiveBound = false;
        this.stopShaderLiveHover();
    },

    findMesoGlyphAt(clientX, clientY) {
        if (typeof document === 'undefined') return null;
        const stack = document.elementsFromPoint(clientX, clientY);
        for (let i = 0; i < stack.length; i++) {
            const el = stack[i];
            if (el.classList?.contains('depth-v2-glyph--meso')) return el;
            const glyph = el.closest?.('.depth-v2-glyph--meso');
            if (glyph) return glyph;
        }
        return null;
    },

    handleShaderPointerMove(e) {
        if (typeof DepthV2 === 'undefined' || !DepthV2.isActive()) return;
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 2) return;
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
            this.stopShaderLiveHover();
            return;
        }

        const glyph = this.findMesoGlyphAt(e.clientX, e.clientY);
        if (!glyph) {
            this.stopShaderLiveHover();
            return;
        }

        const wrapper = glyph.closest('.note-wrapper');
        const frame = glyph.querySelector('.meso-mock__frame[data-gradient-mode="shader"]');
        if (!wrapper || !frame) {
            this.stopShaderLiveHover();
            return;
        }

        const rect = frame.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

        if (this._shaderLiveWrapper === wrapper && typeof MesoGradientEngine !== 'undefined' && MesoGradientEngine._live) {
            MesoGradientEngine._live.setMouse(nx, ny);
            return;
        }

        this.startShaderLiveHover(wrapper, glyph, frame, nx, ny);
    },

    startShaderLiveHover(wrapper, glyph, frame, nx, ny) {
        if (typeof MesoGradientEngine === 'undefined' || !MesoGradientEngine.init()) return;

        const noteId = wrapper.dataset.noteId;
        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        const item = noteId ? itemsById.get(noteId) : null;
        if (!item) return;

        const profile = this.buildProfile(item, wrapper);
        const sCfg = this.getShaderConfig();
        const fontSizePx = this.measureGlyphFontSizePx(glyph);
        const widthPx = Math.round(this.getMaxLineWidthEm(profile) * fontSizePx);
        const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx });
        const cssH = bakeDims.heightPx;
        const w = Math.max(1, Math.round(bakeDims.widthPx * sCfg.scale));
        const h = Math.max(1, Math.round(cssH * sCfg.scale));
        const colors = this.getShaderColors(item);
        const tagPalette = this.getShaderTagPalette(item);
        const anchor = this.getShaderAnchor(profile.seed);
        const palette = this.buildShaderPalette(colors);
        const lines = [...frame.querySelectorAll('.meso-mock__line')];

        this._shaderLiveWrapper = wrapper;
        MesoGradientEngine.startLive({
            id: String(item.id),
            width: w,
            height: h,
            tagColors: tagPalette.tagColors,
            tagCount: tagPalette.tagCount,
            baseColor: colors.baseColor,
            accentColor: colors.accentColor,
            tertiaryColor: colors.tertiaryColor,
            palette,
            bgColor: sCfg.bgColor,
            grainIntensity: sCfg.grainIntensity,
            animSpeed: sCfg.animSpeed,
            mouseStrength: sCfg.mouseStrength,
            morphComplexity: sCfg.morphComplexity,
            fillScale: sCfg.fillScale,
            symmetry: sCfg.symmetry,
            colorBlend: sCfg.colorBlend,
            liveFps: sCfg.liveFps,
            mouseLerp: sCfg.mouseLerp,
            anchorX: anchor.anchorX,
            anchorY: anchor.anchorY,
            timeOffset: (profile.seed % 10000) * 0.001,
            mouseX: nx,
            mouseY: ny,
            lines
        });
    },

    stopShaderLiveHover() {
        const wrapper = this._shaderLiveWrapper;
        this._shaderLiveWrapper = null;
        if (typeof MesoGradientEngine !== 'undefined') {
            MesoGradientEngine.stopLive();
        }

        if (!wrapper) return;
        const noteId = wrapper.dataset.noteId;
        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        const item = noteId ? itemsById.get(noteId) : null;
        const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
        const frame = glyph?.querySelector('.meso-mock__frame');
        if (!item || !glyph || !frame) return;

        const profile = this.buildProfile(item, wrapper);
        const fontSizePx = this.measureGlyphFontSizePx(glyph);
        const widthPx = Math.round(this.getMaxLineWidthEm(profile) * fontSizePx);
        const url = this.bakeShaderGradient(item, profile, profile.seed, { fontSizePx, widthPx });
        this.applyTextureGradient(glyph, frame, url);
    },

    buildFillGradient(item, seed) {
        if (this.getGradientMode() === 'bands') {
            return this.buildTagGradient(item);
        }
        if (this.getGradientMode() === 'canvas') {
            return null;
        }
        if (this.getGradientMode() === 'shader') {
            return null;
        }
        if (this.getGradientMode() === 'p5') {
            return null;
        }
        return this.buildBlobGradient(item, seed);
    },

    getGrainConfig() {
        const meso = CONFIG?.depth?.v2?.meso || {};
        return {
            opacity: meso.mockGrainOpacity ?? 0.05,
            tile: meso.mockGrainTile ?? 64,
            contrast: meso.mockGrainContrast ?? 115,
            brightness: meso.mockGrainBrightness ?? 100
        };
    },

    charCount(text) {
        return Array.from(text || '').length;
    },

    wrapByCharCount(text, maxChars) {
        const chars = Array.from(text || '');
        if (chars.length === 0) return [''];
        const lines = [];
        for (let i = 0; i < chars.length; i += maxChars) {
            lines.push(chars.slice(i, i + maxChars).join(''));
        }
        return lines;
    },

    pickBandFromLineCount(lineCount) {
        if (lineCount <= 3) return 'xs';
        if (lineCount <= 5) return 'sm';
        if (lineCount <= 8) return 'md';
        if (lineCount <= 12) return 'lg';
        return 'xl';
    },

    measureProfileFromDOM(wrapper) {
        if (!wrapper || typeof SilhouetteEngine === 'undefined') return null;

        const card = wrapper.querySelector('.note-card');
        if (!card || card.offsetWidth < 2 || card.offsetHeight < 2) return null;

        const cfg = CONFIG.meso;
        wrapper.classList.add('is-measuring-silhouette');
        const segments = [];
        const cardW = card.offsetWidth;

        try {
            if (cfg.includeTitle) {
                SilhouetteEngine.measureElementLineRects(wrapper.querySelector('.note-title'), card)
                    .forEach(r => segments.push({ kind: 'title', width: r.w / cardW, lineH: r.h, rawY: r.y }));
            }
            if (cfg.includeBody) {
                SilhouetteEngine.measureElementLineRects(wrapper.querySelector('.note-body'), card)
                    .forEach(r => segments.push({ kind: 'body', width: r.w / cardW, lineH: r.h, rawY: r.y }));
            }
        } finally {
            wrapper.classList.remove('is-measuring-silhouette');
        }

        if (segments.length === 0) return null;

        const minY = Math.min(...segments.map(s => s.rawY));
        return segments.map(s => ({
            kind: s.kind,
            width: s.width,
            lineH: s.lineH,
            offsetY: s.rawY - minY
        }));
    },

    buildTextSegments(item) {
        const cfg = CONFIG.meso;
        const typo = cfg.typography;
        const card = document.querySelector('.note-card');
        const cardW = card?.offsetWidth || scale(200);
        const pad = cfg.silhouette.padding;

        const maxCharsFor = (t) => {
            const charUnit = t.size * t.charWidthRatio;
            return Math.max(1, Math.floor((cardW - pad * 2) / charUnit));
        };

        const lineWidthFrac = (text, t) => {
            const charUnit = t.size * t.charWidthRatio;
            const w = Math.max(charUnit, this.charCount(text) * charUnit);
            return Math.min(1, w / cardW);
        };

        const segments = [];

        if (cfg.includeTitle && item.title) {
            const title = String(item.title).trim();
            if (title) {
                this.wrapByCharCount(title, maxCharsFor(typo.title))
                    .forEach(text => segments.push({ kind: 'title', width: lineWidthFrac(text, typo.title) }));
            }
        }
        if (cfg.includeBody && item.body) {
            const body = String(item.body).trim();
            if (body) {
                const maxChars = maxCharsFor(typo.body);
                body.slice(0, cfg.maxBodyChars).split('\n')
                    .map(l => l.trim()).filter(Boolean)
                    .forEach(p => this.wrapByCharCount(p, maxChars)
                        .forEach(text => segments.push({ kind: 'body', width: lineWidthFrac(text, typo.body) })));
            }
        }
        if (segments.length === 0) {
            const text = String(item.title || item.id || '—');
            segments.push({ kind: 'title', width: lineWidthFrac(text, typo.title) });
        }

        return segments;
    },

    finalizeProfile(rawLines, item) {
        const seed = this.hashSeed(item.id);
        const lines = rawLines.map(l => ({
            kind: l.kind,
            width: Math.min(1, Math.max(0.06, l.width))
        }));

        const maxW = Math.max(...lines.map(l => l.width));
        const widthCap = this.getFrameWidthCap();
        const frameWidth = Math.min(widthCap, Math.max(0.62, maxW * 1.05));
        const normalized = lines.map(l => ({
            kind: l.kind,
            width: Math.min(1, l.width / frameWidth),
            lineH: l.lineH,
            offsetY: l.offsetY
        }));

        const withHeights = this.resolveLineHeights(normalized);
        const metrics = this.getProfileMetrics({ lines: withHeights });

        const lineCount = withHeights.length;
        const bandKey = this.pickBandFromLineCount(lineCount);
        const band = this.SIZE_BANDS[bandKey];
        const cellH = scale(CONFIG?.depth?.v2?.meso?.cellHeight || 90);
        const rowSpan = Math.max(1, Math.ceil(metrics.totalH / cellH));

        return {
            bandKey,
            lines: withHeights,
            rowSpan,
            frameWidth,
            heightScale: 1,
            fontScale: band.fontScale,
            totalHeightPx: metrics.totalH,
            seed
        };
    },

    buildProfile(item, wrapper = null) {
        const cachedProfile = typeof MesoSilhouetteCache !== 'undefined'
            ? MesoSilhouetteCache.getProfile(item?.id, item)
            : null;
        if (cachedProfile) return cachedProfile;

        const rawLines = (wrapper && this.measureProfileFromDOM(wrapper)) || this.buildTextSegments(item);
        return this.finalizeProfile(rawLines, item);
    },

    buildGlyphHTML(item, profile) {
        if (this.getGradientMode() === 'svg') {
            return this.buildSvgGlyphHTML(item, profile);
        }
        return this.buildDomGlyphHTML(item, profile);
    },

    scheduleTextureBake(wrapper, item, profile, layoutCtx) {
        this._enqueueBakeJob({ type: 'texture', wrapper, item, profile, layoutCtx });
    },

    scheduleStructureApply(wrapper, item) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return;
        this._enqueueBakeJob({ type: 'structure', wrapper, item });
    },

    scheduleAllStructureApplies() {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;
        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        let queued = 0;
        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            const item = itemsById.get(wrapper.dataset.noteId);
            if (!item) return;
            if (wrapper.querySelector('.meso-mock__frame')) return;
            this.scheduleStructureApply(wrapper, item);
            queued++;
        });
        return queued;
    },

    finishBakeQueueIfIdle() {
        if (this._bakeQueue.length || this._bakeIdleHandle != null) return;
        if (typeof PhysicsEngine !== 'undefined' && DepthController.currentLevel >= 2) {
            PhysicsEngine.setTransitionFrozen(false);
            if (typeof AppState !== 'undefined') {
                AppState.centerMesoViewport();
                requestAnimationFrame(() => {
                    if (typeof SpatialNavigation !== 'undefined') {
                        SpatialNavigation.resume();
                    }
                });
            } else if (typeof SpatialNavigation !== 'undefined') {
                SpatialNavigation.resume();
            }
        }
    },

    applyFirstColumnStructure() {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;
        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        const hiveAnchors = document.querySelectorAll(
            '#app.is-meso-hive-layout .note-wrapper.is-meso-hive-anchored'
        );
        const firstCol = document.querySelector('#app.is-meso-column-layout > .meso-grid-column');
        const wrappers = hiveAnchors.length
            ? [...hiveAnchors]
            : firstCol
                ? [...firstCol.querySelectorAll('.note-wrapper')]
                : [...document.querySelectorAll('.note-wrapper')].slice(0, 18);
        let built = 0;
        wrappers.forEach(wrapper => {
            const item = itemsById.get(wrapper.dataset.noteId);
            if (!item || wrapper.querySelector('.meso-mock__frame')) return;
            this.applyToWrapper(wrapper, item, { skipBake: true });
            built++;
        });
        return built;
    },

    syncAllGlyphsOnL2Enter() {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 2) return 0;

        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        let synced = 0;
        const pres = typeof isPresentationMode === 'function' && isPresentationMode();
        const columnLimit = pres ? (CONFIG.presentation?.mesoInitialBakeColumns ?? 0) : 0;
        const { wrappers, deferredCols } = this._collectMesoWrappers({ columnLimit });

        document.body.classList.add('is-silhouette-micro-measure');
        try {
            void document.getElementById('app')?.offsetHeight;
            this.invalidateColumnGradientLayout();
            this.buildColumnGradientLayout();

            wrappers.forEach(wrapper => {
                const noteId = wrapper.dataset.noteId;
                const item = noteId ? itemsById.get(noteId) : null;
                if (!item) return;
                this.syncGlyphLayout(wrapper, item);
                synced++;
            });
        } finally {
            document.body.classList.remove('is-silhouette-micro-measure');
        }

        if (deferredCols.length) {
            const runDeferred = () => {
                if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 2) return;
                document.body.classList.add('is-silhouette-micro-measure');
                try {
                    deferredCols.forEach(col => {
                        col.querySelectorAll('.note-wrapper').forEach(wrapper => {
                            const item = itemsById.get(wrapper.dataset.noteId);
                            if (!item) return;
                            this.syncGlyphLayout(wrapper, item);
                        });
                    });
                } finally {
                    document.body.classList.remove('is-silhouette-micro-measure');
                }
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(runDeferred, { timeout: 2000 });
            } else {
                setTimeout(runDeferred, 150);
            }
        }

        return synced;
    },

    hasPendingTextureBakes() {
        return this._bakeQueue.length > 0 || this._bakeIdleHandle != null;
    },

    scheduleAllTextureBakes() {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;

        this.invalidateColumnGradientLayout();
        this.buildColumnGradientLayout();

        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        let queued = 0;
        const textureJobs = [];
        const pres = typeof isPresentationMode === 'function' && isPresentationMode();
        const columnLimit = pres ? (CONFIG.presentation?.mesoInitialBakeColumns ?? 0) : 0;
        const { wrappers, deferredCols } = this._collectMesoWrappers({ columnLimit });

        wrappers.forEach(wrapper => {
            const noteId = wrapper.dataset.noteId;
            const item = noteId ? itemsById.get(noteId) : null;
            if (!item) return;

            const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
            const frame = glyph?.querySelector('.meso-mock__frame');
            if (!glyph || !frame) {
                textureJobs.push({ type: 'texture', wrapper, item });
                queued++;
                return;
            }

            const grad = frame.style.getPropertyValue('--meso-mock-gradient');
            if (grad && grad.includes('url(')) return;

            textureJobs.push({ type: 'texture', wrapper, item });
            queued++;
        });

        if (textureJobs.length) {
            this._bakeQueue = textureJobs.concat(this._bakeQueue);
            if (this._bakeIdleHandle == null) {
                this._bakeIdleHandle = requestAnimationFrame(() => this._drainBakeQueue());
            }
        } else if (typeof DepthController !== 'undefined' && DepthController.currentLevel === 2) {
            requestAnimationFrame(() => this.finishBakeQueueIfIdle());
        }

        if (deferredCols.length) {
            this._scheduleDeferredColumnBakes(deferredCols);
        }

        return queued;
    },

    applyTextureBake(wrapper, item, profile, layoutCtx = {}) {
        const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
        const frame = glyph?.querySelector('.meso-mock__frame');
        if (!glyph || !frame) return;

        const fontSizePx = layoutCtx.fontSizePx ?? this.measureGlyphFontSizePx(glyph);
        const widthPx = layoutCtx.widthPx ?? Math.round(this.getMaxLineWidthEm(profile) * fontSizePx);
        const bakeDims = layoutCtx.bakeDims ?? this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, wrapper);
        const bakeLayout = { fontSizePx, widthPx: bakeDims.widthPx, heightPx: bakeDims.heightPx };
        const gradientMode = this.getGradientMode();

        if (gradientMode === 'shader') {
            const url = this.bakeShaderGradient(item, profile, profile.seed, bakeLayout);
            this.applyTextureGradient(glyph, frame, url);
        } else if (gradientMode === 'p5') {
            const url = this.bakeP5Gradient(item, profile, profile.seed, bakeLayout, wrapper);
            this.applyTextureGradient(glyph, frame, url);
        } else if (gradientMode === 'canvas') {
            const url = this.bakeCanvasGradient(item, profile, profile.seed, bakeLayout);
            this.applyTextureGradient(glyph, frame, url);
        } else if (gradientMode !== 'svg') {
            const gradient = this.buildFillGradient(item, profile.seed);
            glyph.style.setProperty('--meso-mock-gradient', gradient);
            frame.style.setProperty('--meso-mock-gradient', gradient);
        } else {
            glyph.style.removeProperty('--meso-mock-gradient');
        }
    },

    applyToWrapper(wrapper, item, options = {}) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return;

        const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
        if (!glyph) return;

        const profile = this.buildProfile(item, wrapper);
        const grain = this.getGrainConfig();
        const frameWidthPct = (profile.frameWidth * 100).toFixed(1);
        const gradientMode = this.getGradientMode();

        glyph.innerHTML = this.buildGlyphHTML(item, profile);

        const frame = glyph.querySelector('.meso-mock__frame');
        const fontSizePx = this.measureGlyphFontSizePx(glyph);
        const frameWidthPx = this.resolveFrameWidthPx(profile, fontSizePx);
        const widthPx = frameWidthPx;
        const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, wrapper);
        const gradientW = `${bakeDims.widthPx}px`;
        const sCfg = gradientMode === 'shader'
            ? this.getShaderConfig()
            : gradientMode === 'p5'
                ? this.getP5Config()
                : null;
        const overscale = sCfg?.textureOverscale ?? 1.78;
        glyph.style.setProperty('--meso-mock-gradient-w', gradientW);
        glyph.style.setProperty('--meso-mock-texture-overscale', String(overscale));
        if (frame) {
            frame.style.setProperty('--meso-mock-gradient-w', gradientW);
            frame.style.setProperty('--meso-mock-texture-overscale', String(overscale));
            frame.style.setProperty('--meso-mock-gradient-h', `${bakeDims.heightPx}px`);
            if (this.usesColumnFillLayout()) {
                frame.style.width = '100%';
                frame.style.minWidth = '0';
            } else {
                frame.style.width = `${frameWidthPx}px`;
                frame.style.minWidth = `${frameWidthPx}px`;
            }
            if (this.isSliceGradientMode()) {
                const metrics = this.getProfileMetrics(profile);
                frame.style.setProperty('--meso-mock-content-h', `${metrics.totalH}px`);
                frame.style.height = `${metrics.totalH}px`;
            }
        }

        const usesUniformGradient = gradientMode === 'blobs'
            || gradientMode === 'canvas'
            || gradientMode === 'shader'
            || gradientMode === 'p5';
        if (usesUniformGradient && frame) {
            this.applySliceLineLayout(frame, profile, fontSizePx, frameWidthPx, bakeDims, gradientMode, sCfg);
        }

        const layoutCtx = { fontSizePx, widthPx, bakeDims };
        if (!options.skipBake) {
            if (options.deferBake) {
                this.scheduleTextureBake(wrapper, item, profile, layoutCtx);
            } else {
                this.applyTextureBake(wrapper, item, profile, layoutCtx);
            }
        }

        glyph.style.setProperty('--meso-mock-font-scale', String(profile.fontScale));
        glyph.style.setProperty('--meso-mock-size-scale', String(this.getSizeScale()));
        if (gradientMode === 'canvas' || gradientMode === 'shader') {
            glyph.style.setProperty('--meso-mock-grain-opacity', '0');
        } else if (gradientMode === 'p5') {
            const p5Cfg = this.getP5Config();
            glyph.style.setProperty('--meso-mock-bg', p5Cfg.bgColor);
            glyph.style.setProperty('--meso-mock-grain-opacity', String(p5Cfg.grainOpacity));
            glyph.style.setProperty('--meso-mock-grain-tile', `${p5Cfg.grainTile}px`);
            if (frame) {
                frame.style.setProperty('--meso-mock-bg', p5Cfg.bgColor);
            }
            frame?.querySelectorAll('.meso-mock__line').forEach(line => {
                line.style.setProperty('--meso-mock-bg', p5Cfg.bgColor);
            });
        } else {
            glyph.style.setProperty('--meso-mock-grain-opacity', String(grain.opacity));
        }
        if (gradientMode !== 'p5') {
            glyph.style.setProperty('--meso-mock-grain-tile', `${grain.tile}px`);
            glyph.style.setProperty('--meso-mock-grain-contrast', `${grain.contrast}%`);
            glyph.style.setProperty('--meso-mock-grain-brightness', `${grain.brightness}%`);
        }
        glyph.style.setProperty('--meso-mock-grain-image', `url("${this.GRAIN_DATA_URI}")`);
        glyph.style.setProperty('--meso-mock-frame-width', `${frameWidthPct}%`);
        glyph.style.setProperty('--meso-mock-frame-height', `${(profile.heightScale * 100).toFixed(1)}%`);

        wrapper.style.setProperty('--meso-mock-row-span', String(profile.rowSpan));
        wrapper.dataset.mockRowSpan = String(profile.rowSpan);
        wrapper.dataset.mockSizeBand = profile.bandKey;
    },

    syncGlyphLayout(wrapper, item) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return;

        const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
        if (!glyph) return;

        const frame = glyph.querySelector('.meso-mock__frame');
        if (!frame) return;

        const lineEls = frame.querySelectorAll('.meso-mock__line');
        const profile = this.buildProfile(item, wrapper);
        if (lineEls.length !== profile.lines.length) return;

        const gradientMode = this.getGradientMode();
        const frameWidthPct = (profile.frameWidth * 100).toFixed(1);
        const fontSizePx = this.measureGlyphFontSizePx(glyph);
        const frameWidthPx = this.resolveFrameWidthPx(profile, fontSizePx);
        const widthPx = frameWidthPx;
        const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, wrapper);
        const gradientW = `${bakeDims.widthPx}px`;
        const sCfg = gradientMode === 'shader'
            ? this.getShaderConfig()
            : gradientMode === 'p5'
                ? this.getP5Config()
                : null;
        const overscale = sCfg?.textureOverscale ?? 1.78;

        glyph.style.setProperty('--meso-mock-gradient-w', gradientW);
        glyph.style.setProperty('--meso-mock-texture-overscale', String(overscale));
        frame.style.setProperty('--meso-mock-gradient-w', gradientW);
        frame.style.setProperty('--meso-mock-texture-overscale', String(overscale));
        frame.style.setProperty('--meso-mock-gradient-h', `${bakeDims.heightPx}px`);
        if (this.usesColumnFillLayout()) {
            frame.style.width = '100%';
            frame.style.minWidth = '0';
        } else {
            frame.style.width = `${frameWidthPx}px`;
            frame.style.minWidth = `${frameWidthPx}px`;
        }

        const metrics = this.getProfileMetrics(profile);
        if (this.isSliceGradientMode()) {
            frame.style.setProperty('--meso-mock-content-h', `${metrics.totalH}px`);
            frame.style.height = `${metrics.totalH}px`;
        }

        const usesUniformGradient = gradientMode === 'blobs'
            || gradientMode === 'canvas'
            || gradientMode === 'shader'
            || gradientMode === 'p5';
        if (usesUniformGradient) {
            this.applySliceLineLayout(frame, profile, fontSizePx, frameWidthPx, bakeDims, gradientMode, sCfg);
        }

        glyph.style.setProperty('--meso-mock-font-scale', String(profile.fontScale));
        glyph.style.setProperty('--meso-mock-size-scale', String(this.getSizeScale()));
        glyph.style.setProperty('--meso-mock-frame-width', `${frameWidthPct}%`);
        glyph.style.setProperty('--meso-mock-frame-height', `${(profile.heightScale * 100).toFixed(1)}%`);
        wrapper.style.setProperty('--meso-mock-row-span', String(profile.rowSpan));
        wrapper.dataset.mockRowSpan = String(profile.rowSpan);
        wrapper.dataset.mockSizeBand = profile.bandKey;
    },

    _runWrapperTextureBakeJob(job) {
        const wrapper = job.wrapper;
        if (!wrapper) return;

        const glyph = wrapper.querySelector('.depth-v2-glyph--meso');
        if (!glyph?.querySelector('.meso-mock__frame')) {
            this.applyToWrapper(wrapper, job.item, { skipBake: true });
        }
        this.syncGlyphLayout(wrapper, job.item);
        const profile = this.buildProfile(job.item, wrapper);
        let layoutCtx = job.layoutCtx;
        if (!layoutCtx) {
            const g = wrapper.querySelector('.depth-v2-glyph--meso');
            const fontSizePx = this.measureGlyphFontSizePx(g);
            const widthPx = Math.round(this.getMaxLineWidthEm(profile) * fontSizePx);
            const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, wrapper);
            layoutCtx = { fontSizePx, widthPx, bakeDims };
        }
        this.applyTextureBake(wrapper, job.item, profile, layoutCtx);
    },

    _runOpeningTextureBakeJob(job) {
        const noteEl = job.host;
        if (!noteEl) return;

        const glyph = noteEl.querySelector('.depth-v2-glyph--meso');
        if (!glyph?.querySelector('.meso-mock__frame')) {
            this.applyToOpeningNote(noteEl, job.item, { skipBake: true });
        }
        this.syncOpeningGlyphLayout(noteEl, job.item);
        const profile = this.buildProfile(job.item, null);
        let layoutCtx = job.layoutCtx;
        if (!layoutCtx) {
            const g = noteEl.querySelector('.depth-v2-glyph--meso');
            const fontSizePx = this.measureGlyphFontSizePx(g);
            const widthPx = Math.round(this.getMaxLineWidthEm(profile) * fontSizePx);
            const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, noteEl);
            layoutCtx = { fontSizePx, widthPx, bakeDims };
        }
        this.applyTextureBake(noteEl, job.item, profile, layoutCtx);
    },

    scheduleOpeningTextureBakes(openingEl) {
        if (!openingEl) return 0;

        const itemsById = new Map(
            (typeof AppState !== 'undefined' ? AppState.items : []).map(item => [String(item.id), item])
        );
        let queued = 0;

        openingEl.querySelectorAll('.opening-screen__note').forEach(noteEl => {
            const item = itemsById.get(noteEl.dataset.noteId);
            if (!item) return;

            const frame = noteEl.querySelector('.meso-mock__frame');
            const grad = frame?.style.getPropertyValue('--meso-mock-gradient');
            if (grad && grad.includes('url(')) return;

            this._enqueueBakeJob({ type: 'texture', context: 'opening', host: noteEl, item });
            queued++;
        });

        return queued;
    },

    applyToOpeningNote(noteEl, item, options = {}) {
        const glyph = noteEl?.querySelector('.depth-v2-glyph--meso');
        if (!glyph) return;

        this._renderContext = 'opening';
        try {
            this._applyToOpeningNoteInner(noteEl, glyph, item, options);
        } finally {
            this._renderContext = null;
        }
    },

    _applyToOpeningNoteInner(noteEl, glyph, item, options = {}) {
        const profile = this.buildProfile(item, null);
        const grain = this.getGrainConfig();
        const frameWidthPct = (profile.frameWidth * 100).toFixed(1);
        const gradientMode = this.getGradientMode();
        const lineFill = CONFIG?.opening?.mesoLineFill || 'rgba(242, 240, 238, 0.9)';

        glyph.innerHTML = this.buildGlyphHTML(item, profile);

        const frame = glyph.querySelector('.meso-mock__frame');
        const fontSizePx = this.measureGlyphFontSizePx(glyph);
        const frameWidthPx = this.resolveFrameWidthPx(profile, fontSizePx);
        const widthPx = frameWidthPx;
        const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, noteEl);
        const gradientW = `${bakeDims.widthPx}px`;
        const sCfg = gradientMode === 'shader'
            ? this.getShaderConfig()
            : gradientMode === 'p5'
                ? this.getP5Config()
                : null;
        const overscale = sCfg?.textureOverscale ?? 1.78;
        glyph.style.setProperty('--meso-mock-gradient-w', gradientW);
        glyph.style.setProperty('--meso-mock-texture-overscale', String(overscale));
        if (frame) {
            frame.style.setProperty('--meso-mock-gradient-w', gradientW);
            frame.style.setProperty('--meso-mock-texture-overscale', String(overscale));
            frame.style.setProperty('--meso-mock-gradient-h', `${bakeDims.heightPx}px`);
            if (this.usesColumnFillLayout()) {
                frame.style.width = '100%';
                frame.style.minWidth = '0';
            } else {
                frame.style.width = `${frameWidthPx}px`;
                frame.style.minWidth = `${frameWidthPx}px`;
            }
            if (this.isSliceGradientMode()) {
                const metrics = this.getProfileMetrics(profile);
                frame.style.setProperty('--meso-mock-content-h', `${metrics.totalH}px`);
                frame.style.height = `${metrics.totalH}px`;
            }
        }

        const usesUniformGradient = gradientMode === 'blobs'
            || gradientMode === 'canvas'
            || gradientMode === 'shader'
            || gradientMode === 'p5';
        if (usesUniformGradient && frame) {
            this.applySliceLineLayout(frame, profile, fontSizePx, frameWidthPx, bakeDims, gradientMode, sCfg);
        }

        const layoutCtx = { fontSizePx, widthPx, bakeDims };
        if (!options.skipBake) {
            if (options.deferBake) {
                this._enqueueBakeJob({ type: 'texture', context: 'opening', host: noteEl, item, layoutCtx });
            } else {
                this.applyTextureBake(noteEl, item, profile, layoutCtx);
            }
        }

        glyph.style.setProperty('--meso-mock-font-scale', String(profile.fontScale));
        glyph.style.setProperty('--meso-mock-size-scale', String(this.getSizeScale()));
        if (gradientMode === 'canvas' || gradientMode === 'shader') {
            glyph.style.setProperty('--meso-mock-grain-opacity', '0');
        } else if (gradientMode === 'p5') {
            const p5Cfg = this.getP5Config();
            glyph.style.setProperty('--meso-mock-bg', p5Cfg.bgColor);
            glyph.style.setProperty('--meso-mock-grain-opacity', String(p5Cfg.grainOpacity));
            glyph.style.setProperty('--meso-mock-grain-tile', `${p5Cfg.grainTile}px`);
            if (frame) {
                frame.style.setProperty('--meso-mock-bg', p5Cfg.bgColor);
            }
            frame?.querySelectorAll('.meso-mock__line').forEach(line => {
                line.style.setProperty('--meso-mock-bg', p5Cfg.bgColor);
            });
        } else {
            glyph.style.setProperty('--meso-mock-grain-opacity', String(grain.opacity));
        }
        if (gradientMode !== 'p5') {
            glyph.style.setProperty('--meso-mock-grain-tile', `${grain.tile}px`);
            glyph.style.setProperty('--meso-mock-grain-contrast', `${grain.contrast}%`);
            glyph.style.setProperty('--meso-mock-grain-brightness', `${grain.brightness}%`);
        }
        glyph.style.setProperty('--meso-mock-grain-image', `url("${this.GRAIN_DATA_URI}")`);
        glyph.style.setProperty('--meso-mock-frame-width', `${frameWidthPct}%`);
        glyph.style.setProperty('--meso-mock-frame-height', `${(profile.heightScale * 100).toFixed(1)}%`);

        noteEl.style.setProperty('--meso-mock-row-span', String(profile.rowSpan));
        noteEl.dataset.mockRowSpan = String(profile.rowSpan);
        noteEl.dataset.mockSizeBand = profile.bandKey;

        frame?.querySelectorAll('.meso-mock__line').forEach((line) => {
            line.style.background = lineFill;
            line.style.backgroundImage = 'none';
        });
    },

    syncOpeningGlyphLayout(noteEl, item) {
        this._renderContext = 'opening';
        try {
            this._syncOpeningGlyphLayoutInner(noteEl, item);
        } finally {
            this._renderContext = null;
        }
    },

    _syncOpeningGlyphLayoutInner(noteEl, item) {
        const glyph = noteEl?.querySelector('.depth-v2-glyph--meso');
        if (!glyph) return;

        const frame = glyph.querySelector('.meso-mock__frame');
        if (!frame) return;

        const lineEls = frame.querySelectorAll('.meso-mock__line');
        const profile = this.buildProfile(item, null);
        if (lineEls.length !== profile.lines.length) return;

        const gradientMode = this.getGradientMode();
        const frameWidthPct = (profile.frameWidth * 100).toFixed(1);
        const fontSizePx = this.measureGlyphFontSizePx(glyph);
        const frameWidthPx = this.resolveFrameWidthPx(profile, fontSizePx);
        const widthPx = frameWidthPx;
        const bakeDims = this.resolveGradientBakeDimensions(profile, { fontSizePx, widthPx }, noteEl);
        const gradientW = `${bakeDims.widthPx}px`;
        const sCfg = gradientMode === 'shader'
            ? this.getShaderConfig()
            : gradientMode === 'p5'
                ? this.getP5Config()
                : null;
        const overscale = sCfg?.textureOverscale ?? 1.78;

        glyph.style.setProperty('--meso-mock-gradient-w', gradientW);
        glyph.style.setProperty('--meso-mock-texture-overscale', String(overscale));
        frame.style.setProperty('--meso-mock-gradient-w', gradientW);
        frame.style.setProperty('--meso-mock-texture-overscale', String(overscale));
        frame.style.setProperty('--meso-mock-gradient-h', `${bakeDims.heightPx}px`);
        if (this.usesColumnFillLayout()) {
            frame.style.width = '100%';
            frame.style.minWidth = '0';
        } else {
            frame.style.width = `${frameWidthPx}px`;
            frame.style.minWidth = `${frameWidthPx}px`;
        }

        const metrics = this.getProfileMetrics(profile);
        if (this.isSliceGradientMode()) {
            frame.style.setProperty('--meso-mock-content-h', `${metrics.totalH}px`);
            frame.style.height = `${metrics.totalH}px`;
        }

        const usesUniformGradient = gradientMode === 'blobs'
            || gradientMode === 'canvas'
            || gradientMode === 'shader'
            || gradientMode === 'p5';
        if (usesUniformGradient) {
            this.applySliceLineLayout(frame, profile, fontSizePx, frameWidthPx, bakeDims, gradientMode, sCfg);
        }

        glyph.style.setProperty('--meso-mock-font-scale', String(profile.fontScale));
        glyph.style.setProperty('--meso-mock-size-scale', String(this.getSizeScale()));
        glyph.style.setProperty('--meso-mock-frame-width', `${frameWidthPct}%`);
        glyph.style.setProperty('--meso-mock-frame-height', `${(profile.heightScale * 100).toFixed(1)}%`);
        noteEl.style.setProperty('--meso-mock-row-span', String(profile.rowSpan));
        noteEl.dataset.mockRowSpan = String(profile.rowSpan);
        noteEl.dataset.mockSizeBand = profile.bandKey;

        const lineFill = CONFIG?.opening?.mesoLineFill || 'rgba(242, 240, 238, 0.9)';
        frame.querySelectorAll('.meso-mock__line').forEach((line) => {
            line.style.background = lineFill;
            line.style.backgroundImage = 'none';
        });
    }
};
