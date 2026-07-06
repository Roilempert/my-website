/* app build 20260706191856 */
/* ==========================================================================
   01. SYSTEM BOOTSTRAP
   ========================================================================== */
const IdleRefresh = {
    timerId: null,
    _enabled: false,

    touch() {
        if (!this._enabled) return;
        clearTimeout(this.timerId);
        this.timerId = setTimeout(
            () => window.location.reload(),
            CONFIG.boot.idleRefreshMs
        );
    },

    init() {
        const ms = CONFIG.boot.idleRefreshMs;
        if (!ms || ms <= 0) return;

        this._enabled = true;
        const onActivity = () => this.touch();

        ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev => {
            window.addEventListener(ev, onActivity, { passive: true, capture: true });
        });
        window.addEventListener('scroll', onActivity, { passive: true });
        window.addEventListener('mousemove', onActivity, { passive: true });

        this.touch();
    }
};

/* ==========================================================================
   Text direction — Latin-script LTR vs Hebrew/Arabic RTL note content
   ========================================================================== */
const TextDirection = {
    RTL_SCRIPT_RE: /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,
    LATIN_SCRIPT_RE: /\p{Script=Latin}/u,

    LTR_OVERRIDE_RE: /^(ltr|left|en|english|fr|french|français|es|spanish|español|de|german|deutsch|it|italian|italiano|pt|portuguese|português|nl|dutch|pl|polish|sv|swedish|da|danish|no|norwegian|fi|finnish|cs|czech|ro|romanian|hu|hungarian|tr|turkish|ca|catalan|eu|basque|gl|galician|is|icelandic|la|latin)$/,

    RTL_OVERRIDE_RE: /^(rtl|right|he|hebrew|ar|arabic)$/,

    normalizeOverride(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return null;
        if (this.LTR_OVERRIDE_RE.test(v)) return 'ltr';
        if (this.RTL_OVERRIDE_RE.test(v)) return 'rtl';
        return null;
    },

    detectFromText(title, body) {
        const text = `${String(title || '')}\n${String(body || '')}`.trim();
        if (!text) return 'rtl';
        if (this.RTL_SCRIPT_RE.test(text)) return 'rtl';
        if (this.LATIN_SCRIPT_RE.test(text)) return 'ltr';
        return 'rtl';
    },

    resolve(title, body, overrideRaw) {
        const override = this.normalizeOverride(overrideRaw);
        if (override) return override;
        return this.detectFromText(title, body);
    },

    applyToWrapper(wrapper, direction) {
        if (!wrapper) return;
        const dir = direction === 'ltr' ? 'ltr' : 'rtl';
        wrapper.dataset.textDirection = dir;
        wrapper.classList.toggle('is-note-ltr', dir === 'ltr');
        wrapper.classList.toggle('is-note-rtl', dir === 'rtl');

        wrapper.querySelectorAll('.note-card').forEach(card => {
            card.setAttribute('dir', dir);
        });
    }
};
/* ==========================================================================
   02. DATA PIPELINE & STATE MANAGER
   ========================================================================== */
const AppState = {
    items: [],
    tagColorsMap: new Map(),
    _bootPending: false,
    _bootPrepared: false,
    _bootPrepareScheduled: false,

    prepareBoot() {
        if (this._bootPrepared || this._bootPrepareScheduled) return;
        this._bootPrepareScheduled = true;

        const run = () => {
            if (this._bootPrepared) return;
            this._bootPrepared = true;

            try {
                if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.populate) {
                    ActionWarehouse.populate();
                }
            } catch (err) {
                console.error('Warehouse populate failed', err);
            }

            try {
                if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.buildWorld) {
                    PhysicsEngine.buildWorld();
                }
                if (typeof applyMacroShellGridPlacement === 'function') {
                    applyMacroShellGridPlacement();
                } else if (typeof updateSiteGridCrosses === 'function') {
                    updateSiteGridCrosses({ force: true });
                }
                requestAnimationFrame(() => {
                    this.scrollToCanvasCenter();
                    requestAnimationFrame(() => {
                        this.scrollToCanvasCenter();
                        if (typeof NavigationMap !== 'undefined') {
                            NavigationMap.onBootComplete();
                        }
                    });
                });
            } catch (err) {
                console.error('Boot prepare failed', err);
                try {
                    if (typeof NavigationMap !== 'undefined') {
                        NavigationMap.onBootComplete();
                    }
                } catch (mapErr) {
                    console.warn('NavigationMap.onBootComplete failed:', mapErr);
                }
            }
        };

        const delay = CONFIG.boot.physicsBuildDelay ?? 350;
        if (delay > 0) {
            setTimeout(run, delay);
        } else {
            requestAnimationFrame(() => requestAnimationFrame(run));
        }
    },

    async init() {
        this.appContainer = document.getElementById('app');
        try {
            await this.buildDataPipeline();
            this.render();
        } catch (error) {
            console.error('Data pipeline error:', error);
        }
    },

    finishBoot() {
        this.prepareBoot();
        this._bootPending = false;
        this.revealApp();
    },

    revealApp() {
        if (!this.appContainer) this.appContainer = document.getElementById('app');
        if (!this.appContainer || this.appContainer.classList.contains('is-ready')) return;
        requestAnimationFrame(() => {
            this.appContainer.classList.add('is-ready');
            this.appContainer.style.opacity = '1';
        });
    },

    flushPendingBoot() {
        if (!this._bootPrepared) this.prepareBoot();
        this._bootPending = false;
        this.revealApp();
    },

    async fetchText(url) {
        const timeoutMs = CONFIG.boot.fetchTimeoutMs ?? 15000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            return await response.text();
        } finally {
            clearTimeout(timer);
        }
    },

    async fetchDataText(key) {
        const localUrl = CONFIG.data.urls?.[key];
        const remoteUrl = CONFIG.data.remoteUrls?.[key];
        const preferLocal = CONFIG.data.preferLocal !== false;
        const candidates = preferLocal
            ? [localUrl, remoteUrl]
            : [remoteUrl, localUrl];
        const urls = [...new Set(candidates.filter(Boolean))];

        let lastError = null;
        for (const url of urls) {
            try {
                const text = await this.fetchText(url);
                if (key === 'main' && !preferLocal && url === localUrl) {
                    console.info(`Data: loaded ${key} from local fallback (${url})`);
                } else if (key === 'main' || key === 'tags') {
                    console.info(`Data: loaded ${key} from ${url}`);
                }
                return text;
            } catch (err) {
                lastError = err;
                console.warn(`Data fetch failed for ${url}`, err);
            }
        }
        throw lastError || new Error(`No data source configured for ${key}`);
    },

    async buildDataPipeline() {
        const tagsCsv = await this.fetchDataText('tags');
        this.parseTagsDictionary(tagsCsv);

        const mainCsv = await this.fetchDataText('main');
        this.items = this.parseMainNotes(mainCsv);
    },

    normalizeString(str) {
        if (!str) return '';
        return str.replace(/[#\u200B-\u200D\uFEFF]/g, '').replace(/_/g, ' ').trim().toLowerCase();
    },

    parseCSVToArray(csvText) {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let insideQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                currentRow.push(currentCell.trim());
                currentCell = '';
            } else if ((char === '\n' || char === '\r') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') i++;
                currentRow.push(currentCell.trim());
                if (currentRow.join('').trim() !== '') rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        return rows;
    },

    parseTagsDictionary(csvText) {
        const rows = this.parseCSVToArray(csvText);
        rows.slice(1).forEach(columns => {
            if (columns.length < 2) return;
            const tagName = this.normalizeString(columns[0]);
            if (!tagName) return;

            let tagColor = columns[1].trim();
            if (!tagColor.startsWith('#') && tagColor.length >= 3) tagColor = '#' + tagColor;

            // Invalid hex would render as a transparent (invisible) dot:
            // fall back to the default color and flag the dictionary entry
            if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(tagColor)) {
                console.warn(`Tag dictionary: invalid color "${tagColor}" for tag "${tagName}", using fallback`);
                tagColor = CONFIG.data.fallbackTagColor;
            }

            this.tagColorsMap.set(tagName, tagColor);
        });
    },

    parseMainNotes(csvText) {
        const rows = this.parseCSVToArray(csvText);
        const cols = CONFIG.data.columns;
        return rows.slice(1).map((columns, index) => {
            const authorFullName = this.normalizeString(columns[cols.authorFullName] || '');
            const authorCode = this.normalizeString(columns[cols.authorCode] || '');
            const dateWritten = this.normalizeString(columns[cols.date] || '');
            const typology = this.normalizeString(columns[cols.typology] || '');
            const id = (columns[cols.id] || `SYS-${index}`).replace(/_/g, ' ');
            const tagsRaw = columns[cols.tags] || '';
            
            let titleRaw = columns[cols.title] || '';
            const title = titleRaw.replace(/^#+\s*/, '').replace(/_/g, ' ').trim();
            
            const body = (columns[cols.body] || '').replace(/_/g, ' ').trim();
            const directionOverride = cols.direction != null ? columns[cols.direction] : '';
            const textDirection = typeof TextDirection !== 'undefined'
                ? TextDirection.resolve(title, body, directionOverride)
                : 'rtl';
            
            const tagsArray = tagsRaw.split(',').map(t => {
                const norm = this.normalizeString(t);
                return { name: norm, color: this.tagColorsMap.get(norm) || CONFIG.data.fallbackTagColor };
            }).filter(t => t.name);

            return {
                id,
                title,
                body,
                tags: tagsArray,
                authorCode,
                authorFullName,
                dateWritten,
                typology,
                textDirection
            };
        });
    },

    render() {
        if (!this.appContainer) return;
        this.appContainer.querySelectorAll(':scope > .note-wrapper').forEach(el => el.remove());
        this.items.forEach((item, noteIndex) => {
            const wrapper = RenderEngine.createNoteDOM(item, noteIndex);
            this.appContainer.appendChild(wrapper);
        });

        if (typeof applyMacroShellGridPlacement === 'function') {
            applyMacroShellGridPlacement();
        } else if (typeof updateSiteGridCrosses === 'function') {
            updateSiteGridCrosses({ force: true });
        }

        if (typeof DepthV2 !== 'undefined') {
            DepthV2.afterNotesRender();
        }
    },

    syncNoteDomFromItems() {
        const itemsById = new Map(this.items.map(item => [String(item.id), item]));
        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            const item = itemsById.get(wrapper.dataset.noteId);
            if (!item) return;

            if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
                if (item.typology) {
                    wrapper.dataset.typology = item.typology;
                } else {
                    delete wrapper.dataset.typology;
                }
                if (typeof TextDirection !== 'undefined') {
                    TextDirection.applyToWrapper(wrapper, item.textDirection);
                }
                if (typeof SilhouetteEngine !== 'undefined') {
                    const entry = SilhouetteEngine.entries.get(String(item.id));
                    if (entry) entry.item = item;
                }
                if (typeof MicroMock !== 'undefined') {
                    MicroMock.applyToWrapper(wrapper, item);
                }
                return;
            }

            const titleEl = wrapper.querySelector('.note-title');
            const bodyEl = wrapper.querySelector('.note-body');
            const idEl = wrapper.querySelector('.note-idcode');
            if (titleEl) titleEl.textContent = item.title || '';
            if (bodyEl) bodyEl.textContent = item.body || '';
            if (idEl) idEl.textContent = item.id || '';

            if (item.typology) {
                wrapper.dataset.typology = item.typology;
            } else {
                delete wrapper.dataset.typology;
            }

            if (typeof TextDirection !== 'undefined') {
                TextDirection.applyToWrapper(wrapper, item.textDirection);
            }

            if (typeof SilhouetteEngine !== 'undefined') {
                const entry = SilhouetteEngine.entries.get(String(item.id));
                if (entry) entry.item = item;
            }

            if (DepthController.currentLevel === 3 && typeof MicroMock !== 'undefined') {
                MicroMock.applyToWrapper(wrapper, item);
            }
        });
    },

    async refreshDataFromSheet() {
        await this.buildDataPipeline();
        this.syncNoteDomFromItems();
        return this.items;
    },

    centerViewport(options = {}) {
        const appElement = document.getElementById('app');
        if (!appElement) return;

        if (DepthController.currentLevel >= 2 &&
            (appElement.classList.contains('is-meso-column-layout') ||
             appElement.classList.contains('is-meso-hive-layout') ||
             appElement.classList.contains('is-micro-grid-layout'))) {
            this.centerMesoViewport(options);
            return;
        }

        this.scrollToCanvasCenter(options);
    },

    /** Scroll so the geometric center of #app sits in the viewport center (warehouse-aware on Y). */
    scrollToCanvasCenter(options = {}) {
        const app = document.getElementById('app');
        if (!app) return;

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 300
        );

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;
        const viewMidY = (window.innerHeight - reserve) / 2;

        const run = () => {
            const centerX = app.offsetLeft + app.offsetWidth / 2;
            const centerY = app.offsetTop + app.offsetHeight / 2;
            const targetX = centerX - window.innerWidth / 2;
            const targetY = centerY - viewMidY;

            window.scrollTo({
                left: targetX,
                top: targetY,
                behavior: options.smooth ? 'smooth' : 'auto'
            });
        };

        requestAnimationFrame(() => {
            run();
            requestAnimationFrame(run);
        });
    },

    centerMesoHiveCluster(options = {}) {
        const app = document.getElementById('app');
        if (!app) return;

        const anchors = [...app.querySelectorAll('.note-wrapper.is-meso-hive-anchored')];
        if (!anchors.length) {
            this.centerMesoViewport({ ...options, _skipHive: true });
            return;
        }

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 300
        );

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;

        const scrollToCluster = () => {
            const viewMidY = (window.innerHeight - reserve) / 2;
            let minL = Infinity;
            let minT = Infinity;
            let maxR = -Infinity;
            let maxB = -Infinity;

            anchors.forEach(wrapper => {
                const rect = wrapper.getBoundingClientRect();
                if (rect.width < 1 && rect.height < 1) return;
                minL = Math.min(minL, rect.left);
                minT = Math.min(minT, rect.top);
                maxR = Math.max(maxR, rect.right);
                maxB = Math.max(maxB, rect.bottom);
            });

            if (!Number.isFinite(minL)) {
                const appRect = app.getBoundingClientRect();
                const cx = parseFloat(app.dataset.hiveCenterX);
                const cy = parseFloat(app.dataset.hiveCenterY);
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

                const pageX = appRect.left + window.pageXOffset + cx;
                const pageY = appRect.top + window.pageYOffset + cy;
                const dX = pageX - (window.pageXOffset + window.innerWidth / 2);
                const dY = pageY - (window.pageYOffset + viewMidY);

                if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

                window.scrollBy({
                    left: dX,
                    top: dY,
                    behavior: options.smooth ? 'smooth' : 'auto'
                });
                return;
            }

            const cx = (minL + maxR) / 2;
            const cy = (minT + maxB) / 2;
            const dX = cx - window.innerWidth / 2;
            const dY = cy - viewMidY;

            if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

            window.scrollBy({
                left: dX,
                top: dY,
                behavior: options.smooth ? 'smooth' : 'auto'
            });
        };

        requestAnimationFrame(() => {
            scrollToCluster();
            requestAnimationFrame(scrollToCluster);
        });
    },

    /** Pan the viewport to the L3 block-study cluster (notes stay in canvas flow). */
    centerMicroFocusCluster(options = {}) {
        const app = document.getElementById('app');
        if (!app || !app.classList.contains('is-micro-grid-layout')) return;
        if (typeof CatalogState === 'undefined' || !CatalogState.hasFocus) return;

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 300
        );

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;

        const scrollToCluster = () => {
            const viewMidY = (window.innerHeight - reserve) / 2;
            let minL = Infinity;
            let minT = Infinity;
            let maxR = -Infinity;
            let maxB = -Infinity;

            app.querySelectorAll(':scope > .micro-grid-column .note-wrapper:not(.is-layout-excluded)').forEach((wrapper) => {
                const noteIndex = parseInt(wrapper.dataset.noteIndex, 10);
                const role = CatalogState.noteRoles?.get(noteIndex);
                if (role !== 'emphasized' && role !== 'captured' && role !== 'stretched') return;

                const rect = wrapper.getBoundingClientRect();
                if (rect.width < 1 && rect.height < 1) return;
                minL = Math.min(minL, rect.left);
                minT = Math.min(minT, rect.top);
                maxR = Math.max(maxR, rect.right);
                maxB = Math.max(maxB, rect.bottom);
            });

            if (!Number.isFinite(minL)) return;

            const cx = (minL + maxR) / 2;
            const cy = (minT + maxB) / 2;
            const dX = cx - window.innerWidth / 2;
            const dY = cy - viewMidY;

            if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

            window.scrollBy({
                left: dX,
                top: dY,
                behavior: options.smooth ? 'smooth' : 'auto'
            });
        };

        requestAnimationFrame(() => {
            scrollToCluster();
            requestAnimationFrame(scrollToCluster);
        });
    },

    centerMesoViewport(options = {}) {
        const app = document.getElementById('app');
        if (!app) return;

        if (app.classList.contains('is-micro-grid-layout') &&
            typeof CatalogState !== 'undefined' &&
            CatalogState.hasFocus &&
            options.centerMode !== 'canvas') {
            this.centerMicroFocusCluster(options);
            return;
        }

        if (typeof ToroidalPan !== 'undefined' && ToroidalPan.isEnabled()) {
            ToroidalPan.centerOnContent(options);
            return;
        }

        const forceCanvasCenter = options.centerMode === 'canvas';

        if (!forceCanvasCenter && app.classList.contains('is-meso-hive-layout') && !options._skipHive) {
            this.centerMesoHiveCluster(options);
            return;
        }

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 300
        );

        const centerOnColumnContent = () => {
            const columns = [...app.querySelectorAll(':scope > .meso-grid-column, :scope > .micro-grid-column')];
            if (!columns.length) return false;

            let minL = Infinity;
            let minT = Infinity;
            let maxR = -Infinity;
            let maxB = -Infinity;

            columns.forEach((col) => {
                const rect = col.getBoundingClientRect();
                if (rect.width < 1 && rect.height < 1) return;
                minL = Math.min(minL, rect.left);
                minT = Math.min(minT, rect.top);
                maxR = Math.max(maxR, rect.right);
                maxB = Math.max(maxB, rect.bottom);
            });

            if (!Number.isFinite(minL)) return false;

            const reserve = typeof ActionWarehouse !== 'undefined'
                ? ActionWarehouse.getScrollReserve()
                : 0;
            const viewMidY = (window.innerHeight - reserve) / 2;
            const cx = (minL + maxR) / 2;
            const cy = (minT + maxB) / 2;
            const dX = cx - window.innerWidth / 2;
            const dY = cy - viewMidY;

            if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return true;

            window.scrollBy({
                left: dX,
                top: dY,
                behavior: options.smooth ? 'smooth' : 'auto'
            });
            return true;
        };

        const centerOnCanvas = () => {
            this.scrollToCanvasCenter({ ...options, smooth: options.smooth });
        };

        if (forceCanvasCenter) {
            centerOnCanvas();
            return;
        }

        if (app.classList.contains('is-micro-grid-layout') ||
            app.classList.contains('is-meso-column-layout') ||
            app.classList.contains('is-meso-hive-layout')) {
            requestAnimationFrame(() => {
                if (!centerOnColumnContent()) centerOnCanvas();
                requestAnimationFrame(() => {
                    if (!centerOnColumnContent()) centerOnCanvas();
                });
            });
            return;
        }

        const limits = SpatialNavigation.getViewportClampLimits();
        if (!limits) return;

        const { rect, leftMax, topMax } = limits;
        const dX = rect.left - leftMax;
        const dY = rect.top - topMax;

        if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

        window.scrollBy({
            left: dX,
            top: dY,
            behavior: options.smooth ? 'smooth' : 'auto'
        });
    },

    /** Center viewport on #app canvas middle after a depth level change. */
    centerCanvasOnLayerEnter(options = {}) {
        const merged = { centerMode: 'canvas', ...options };
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;

        if (level >= 2) {
            this.centerMesoViewport(merged);
            return;
        }

        this.scrollToCanvasCenter(merged);
    }
};


/* ==========================================================================
   MESO GRADIENT VISUAL BASELINE — tri-blob preset (fallback stub)
   Full shader baseline lives in docs; p5 mode uses MesoGradientP5 organic blob field.
   ========================================================================== */
const MesoGradientVisualPreset = {
    id: 'smooth-tri-blob-v1',
    version: '2026-06-21',
    label: 'tri-blob + grain',
    type: 'tri-blob',

    tagColorMapping: {
        noTagsAccentDarken: 0.22,
        singleTagAccentDarken: 0.18
    },

    anchorRange: {
        xMin: 0.42,
        xRange: 0.16,
        yMin: 0.40,
        yRange: 0.20,
        seedSlotX: 601,
        seedSlotY: 602
    },

    runtimeDefaults: {
        bgColor: '#F3F3F3',
        grainIntensity: 0.012,
        animSpeed: 0.45,
        mouseStrength: 0.82,
        flowAmount: 0.35,
        morphComplexity: 1,
        fillScale: 2.35,
        symmetry: 4,
        colorBlend: 2.6,
        textureOverscale: 1.78,
        liveFps: 20,
        mouseLerp: 0.12,
        bakeMouseStrength: 0.55
    },

    FRAG_SRC: `
        precision mediump float;
        varying vec2 v_uv;
        uniform vec3 u_bgColor;
        void main() {
            gl_FragColor = vec4(u_bgColor, 1.0);
        }
    `
};
/* ==========================================================================
   MESO GRADIENT SDF PRESET — Ink rings, sharp tag territories
   Concentric rings; oversized fill; dominant-color cells with soft seams.
   ========================================================================== */
const MesoGradientSdfPreset = {
    id: 'sdf-cosine-v1',
    version: '2026-06-22i',
    label: 'SDF ink rings — large, sharp color cells',

    type: 'sdf-cosine',

    hub: { x: 1.0, y: 0.5 },

    anchorRange: {
        xMin: 0.0,
        xRange: 0.0,
        yMin: 0.0,
        yRange: 0.0,
        seedSlotX: 601,
        seedSlotY: 602
    },

    runtimeDefaults: {
        bgColor: '#F3F3F3',
        grainIntensity: 0.006,
        animSpeed: 0.32,
        mouseStrength: 0.72,
        morphComplexity: 1.0,
        fillScale: 2.35,
        symmetry: 4.0,
        colorBlend: 2.6,
        textureOverscale: 1.78,
        maxTags: 10,
        liveFps: 20,
        mouseLerp: 0.14,
        bakeMouseStrength: 0
    },

    buildCosinePalette(baseColor, accentColor, tertiaryColor, parseFn) {
        const base = parseFn(baseColor);
        const accent = parseFn(accentColor);
        const tertiary = parseFn(tertiaryColor || accentColor);

        const a = [
            base[0] * 0.55 + accent[0] * 0.25 + tertiary[0] * 0.2,
            base[1] * 0.55 + accent[1] * 0.25 + tertiary[1] * 0.2,
            base[2] * 0.55 + accent[2] * 0.25 + tertiary[2] * 0.2
        ];

        const b = [
            Math.max(0.14, (accent[0] - base[0]) * 0.80 + 0.20),
            Math.max(0.14, (accent[1] - base[1]) * 0.80 + 0.18),
            Math.max(0.14, (tertiary[2] - base[2]) * 0.80 + 0.24)
        ];

        const c = [1.05, 0.72, 0.58];
        const d = [
            base[0] * 0.35 + 0.08,
            accent[1] * 0.42 + 0.12,
            tertiary[2] * 0.28 + 0.38
        ];

        return { a, b, c, d };
    },

    FRAG_SRC: `
        precision highp float;
        varying vec2 v_uv;

        uniform vec2 u_resolution;
        uniform float u_time;
        uniform vec2 u_mouse;
        uniform vec2 u_hub;
        uniform vec2 u_anchor;
        uniform float u_animSpeed;
        uniform float u_mouseStrength;
        uniform float u_morphComplexity;
        uniform float u_fillScale;
        uniform float u_symmetry;
        uniform float u_colorBlend;
        uniform float u_grainIntensity;
        uniform vec3 u_bgColor;
        uniform float u_tagCount;
        uniform vec3 u_tagColors[10];

        const float TAU = 6.28318530718;
        const int MAX_TAGS = 10;

        vec2 tagRingCenter(float fi, float n, float seed, float time, float morph) {
            float rings = n <= 4.0 ? 1.0 : (n <= 8.0 ? 2.0 : 3.0);
            float perRing = max(1.0, ceil(n / rings));
            float ring = floor(fi / perRing);
            float slot = mod(fi, perRing);

            float breath = sin(time * 0.42 + fi * 0.7 + seed) * 0.010 * morph;
            float ringR = (0.18 + ring * 0.52 + breath) * (1.02 + 0.14 * min(n, 5.0) / 5.0);
            float ang = (slot + 0.5) / perRing * TAU + ring * 0.785398 + seed * 0.07;
            ang += sin(fi * 1.9 + seed) * 0.03 * morph;

            vec2 j = vec2(cos(fi * 2.3 + seed) * 0.012, sin(fi * 1.6 + seed) * 0.012);
            return vec2(cos(ang), sin(ang)) * ringR + j;
        }

        float tagCoreRadius(float fi, float n, float seed) {
            return (0.88 + 0.10 * sin(fi * 1.4 + seed)) * clamp(1.55 / sqrt(max(n, 1.0)), 1.0, 1.65);
        }

        /* Tight core + narrow bleed rim — keeps hues separate */
        float inkWeight(vec2 p, vec2 ctr, float coreR, float spread) {
            float d = length(p - ctr);
            float core = smoothstep(coreR * 1.25, coreR * 0.02, d);
            float bleed = exp(-d / max(spread * 0.18, 0.10)) * 0.14;
            return core * 1.65 + bleed;
        }

        float tagCellWeight(vec2 p, vec2 ctr, float coreR, float spread) {
            return pow(inkWeight(p, ctr, coreR, spread), 3.0);
        }

        void main() {
            vec2 uv = v_uv;
            float aspect = u_resolution.x / max(u_resolution.y, 1.0);
            vec2 hub = u_hub;

            vec2 p = hub - uv;
            p.x *= aspect;

            vec2 mouseP = hub - u_mouse;
            mouseP.x *= aspect;
            p += mouseP * u_mouseStrength * 0.04;
            p /= max(u_fillScale, 0.85);

            float time = u_time * u_animSpeed;
            float morph = u_morphComplexity;
            float n = max(u_tagCount, 1.0);
            float seed = dot(u_anchor, vec2(12.7, 78.3));
            float spread = max(u_colorBlend, 1.2);

            /* Oversized fill mask only — does NOT mix colors */
            vec2 fillCtr = vec2(0.14, 0.0);
            float fillR = 1.55;
            float fillMask = inkWeight(p, fillCtr, fillR, spread * 0.95);

            vec3 colBlend = vec3(0.0);
            float wSum = 0.0;
            float wMax = 0.0;
            vec3 colWin = u_tagColors[0];

            if (n < 1.5) {
                vec3 c0 = u_tagColors[0];
                float r0 = 1.02;
                float r1 = 0.90;
                float r2 = 0.82;
                float wA = tagCellWeight(p, vec2(0.0, 0.0), r0, spread);
                float wB = tagCellWeight(p, vec2(0.54, 0.0), r1, spread);
                float wC = tagCellWeight(p, vec2(0.0, 0.50), r1, spread);
                float wD = tagCellWeight(p, vec2(-0.46, 0.0), r2, spread);
                float wE = tagCellWeight(p, vec2(0.0, -0.46), r2, spread);
                float wF = tagCellWeight(p, vec2(0.38, 0.38), r2, spread);
                float wG = tagCellWeight(p, vec2(0.38, -0.38), r2, spread);
                wSum = wA + wB + wC + wD + wE + wF + wG;
                colWin = c0;
                colBlend = c0;
                wMax = wSum;
            } else {
                for (int i = 0; i < MAX_TAGS; i++) {
                    if (float(i) >= u_tagCount) break;
                    float fi = float(i);
                    vec2 ctr = tagRingCenter(fi, n, seed, time, morph);
                    float coreR = tagCoreRadius(fi, n, seed);
                    float w = tagCellWeight(p, ctr, coreR, spread);
                    colBlend += u_tagColors[i] * w;
                    wSum += w;
                    if (w > wMax) {
                        wMax = w;
                        colWin = u_tagColors[i];
                    }
                }
                colBlend /= max(wSum, 1e-4);
            }

            /* Dominant tag wins — blend only in narrow seams (~12%) */
            float dominance = clamp(wMax / max(wSum, 1e-4), 0.0, 1.0);
            float seam = smoothstep(0.38, 0.82, dominance);
            vec3 col = mix(colBlend, colWin, seam * 0.92 + 0.08);

            float pad = 0.010;
            float uvFill = smoothstep(0.0, pad, uv.x) * smoothstep(1.0, 1.0 - pad, uv.x);
            uvFill *= smoothstep(0.0, pad, uv.y) * smoothstep(1.0, 1.0 - pad, uv.y);

            float coverage = uvFill * smoothstep(0.002, 0.05, max(wSum, fillMask * 0.72));
            col = mix(u_bgColor, col, coverage);

            float grain = (fract(sin(dot(gl_FragCoord.xy + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * u_grainIntensity;
            col += grain;

            gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
    `
};

const MesoGradientPresets = {
    'smooth-tri-blob-v1': MesoGradientVisualPreset,
    'sdf-cosine-v1': MesoGradientSdfPreset
};
/* ==========================================================================
   03b. MESO GRADIENT ENGINE — WebGL (multi-preset: tri-blob | SDF cosine)
   ========================================================================== */
const MesoGradientEngine = {
    _canvas: null,
    _gl: null,
    _program: null,
    _buffer: null,
    _locations: null,
    _presetId: null,
    _ready: false,
    _live: null,

    VERT_SRC: `
        attribute vec2 a_position;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        void main() {
            v_uv = a_uv;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `,

    getPresetId() {
        return CONFIG?.depth?.v2?.meso?.mockShaderPreset ?? 'smooth-tri-blob-v1';
    },

    getActivePreset() {
        const id = this.getPresetId();
        return MesoGradientPresets[id] || MesoGradientVisualPreset;
    },

    init(forceRecompile) {
        const preset = this.getActivePreset();
        const presetId = preset.id;

        if (this._ready && !forceRecompile && this._presetId === presetId) return true;
        if (typeof document === 'undefined') return false;

        if (this._program && this._gl) {
            this._gl.deleteProgram(this._program);
            this._program = null;
        }

        const canvas = this._canvas || document.createElement('canvas');
        const gl = this._gl || canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: true
        });

        if (!gl) return false;

        const vs = this._compileShader(gl, gl.VERTEX_SHADER, this.VERT_SRC);
        const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, preset.FRAG_SRC);
        if (!vs || !fs) return false;

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn('MesoGradientEngine: program link failed', gl.getProgramInfoLog(program));
            return false;
        }

        if (!this._buffer) {
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, -1, 0, 0,
                1, -1, 1, 0,
                -1, 1, 0, 1,
                -1, 1, 0, 1,
                1, -1, 1, 0,
                1, 1, 1, 1
            ]), gl.STATIC_DRAW);
            this._buffer = buffer;
        }

        this._canvas = canvas;
        this._gl = gl;
        this._program = program;
        this._presetId = presetId;
        this._locations = this._resolveLocations(gl, program, preset);
        this._ready = true;
        return true;
    },

    _resolveLocations(gl, program, preset) {
        const loc = {
            a_position: gl.getAttribLocation(program, 'a_position'),
            a_uv: gl.getAttribLocation(program, 'a_uv'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution'),
            u_time: gl.getUniformLocation(program, 'u_time'),
            u_mouse: gl.getUniformLocation(program, 'u_mouse'),
            u_anchor: gl.getUniformLocation(program, 'u_anchor'),
            u_grainIntensity: gl.getUniformLocation(program, 'u_grainIntensity'),
            u_animSpeed: gl.getUniformLocation(program, 'u_animSpeed'),
            u_mouseStrength: gl.getUniformLocation(program, 'u_mouseStrength'),
            u_bgColor: gl.getUniformLocation(program, 'u_bgColor')
        };

        if (preset.type === 'sdf-cosine') {
            loc.u_morphComplexity = gl.getUniformLocation(program, 'u_morphComplexity');
            loc.u_hub = gl.getUniformLocation(program, 'u_hub');
            loc.u_fillScale = gl.getUniformLocation(program, 'u_fillScale');
            loc.u_symmetry = gl.getUniformLocation(program, 'u_symmetry');
            loc.u_anchor = gl.getUniformLocation(program, 'u_anchor');
            loc.u_tagCount = gl.getUniformLocation(program, 'u_tagCount');
            loc.u_tagColors = gl.getUniformLocation(program, 'u_tagColors');
            loc.u_colorBlend = gl.getUniformLocation(program, 'u_colorBlend');
        } else {
            loc.u_colorBase = gl.getUniformLocation(program, 'u_colorBase');
            loc.u_colorAccent = gl.getUniformLocation(program, 'u_colorAccent');
            loc.u_colorTertiary = gl.getUniformLocation(program, 'u_colorTertiary');
            loc.u_flowAmount = gl.getUniformLocation(program, 'u_flowAmount');
        }

        return loc;
    },

    _compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('MesoGradientEngine shader:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    },

    parseColorVec3(color) {
        const hex = String(color || '#888888').trim();
        let r = 0.53;
        let g = 0.53;
        let b = 0.53;

        const rgb = hex.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
        if (rgb) {
            r = Number(rgb[1]) / 255;
            g = Number(rgb[2]) / 255;
            b = Number(rgb[3]) / 255;
        } else {
            const h = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
            if (h) {
                let s = h[1];
                if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
                const num = parseInt(s, 16);
                r = ((num >> 16) & 255) / 255;
                g = ((num >> 8) & 255) / 255;
                b = (num & 255) / 255;
            }
        }

        return [r, g, b];
    },

    packTagColors(tagColors, maxTags) {
        const max = Math.max(1, maxTags || 10);
        const flat = new Float32Array(max * 3);
        const count = Math.min(Array.isArray(tagColors) ? tagColors.length : 0, max);
        let last = [0.5, 0.5, 0.5];

        for (let i = 0; i < count; i++) {
            const c = this.parseColorVec3(tagColors[i]);
            flat[i * 3] = c[0];
            flat[i * 3 + 1] = c[1];
            flat[i * 3 + 2] = c[2];
            last = c;
        }

        for (let i = count; i < max; i++) {
            flat[i * 3] = last[0];
            flat[i * 3 + 1] = last[1];
            flat[i * 3 + 2] = last[2];
        }

        return { flat, count: Math.max(count, 1) };
    },

    renderFrame(opts) {
        if (!this.init()) return null;

        const preset = this.getActivePreset();
        const defaults = preset.runtimeDefaults;
        const gl = this._gl;
        const canvas = this._canvas;
        const w = Math.max(1, Math.round(opts.width || 64));
        const h = Math.max(1, Math.round(opts.height || 64));

        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);

        gl.useProgram(this._program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);

        const loc = this._locations;
        gl.enableVertexAttribArray(loc.a_position);
        gl.vertexAttribPointer(loc.a_position, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(loc.a_uv);
        gl.vertexAttribPointer(loc.a_uv, 2, gl.FLOAT, false, 16, 8);

        gl.uniform2f(loc.u_resolution, w, h);
        gl.uniform1f(loc.u_time, opts.time ?? 0);
        gl.uniform2f(loc.u_mouse, opts.mouseX ?? 0.65, opts.mouseY ?? 0.45);
        gl.uniform2f(loc.u_anchor, opts.anchorX ?? 0.38, opts.anchorY ?? 0.52);
        gl.uniform1f(loc.u_grainIntensity, opts.grainIntensity ?? defaults.grainIntensity);
        gl.uniform1f(loc.u_animSpeed, opts.animSpeed ?? defaults.animSpeed);
        gl.uniform1f(loc.u_mouseStrength, opts.mouseStrength ?? defaults.mouseStrength);

        const bg = this.parseColorVec3(opts.bgColor || defaults.bgColor);
        gl.uniform3f(loc.u_bgColor, bg[0], bg[1], bg[2]);

        if (preset.type === 'sdf-cosine') {
            const hub = preset.hub || { x: 1, y: 0.5 };
            const maxTags = defaults.maxTags ?? 10;
            const packed = opts.tagColors
                ? this.packTagColors(opts.tagColors, maxTags)
                : this.packTagColors([
                    opts.baseColor,
                    opts.accentColor,
                    opts.tertiaryColor || opts.accentColor
                ].filter(Boolean), maxTags);

            gl.uniform1f(loc.u_morphComplexity, opts.morphComplexity ?? defaults.morphComplexity ?? 1);
            gl.uniform1f(loc.u_fillScale, opts.fillScale ?? defaults.fillScale ?? 2.35);
            gl.uniform1f(loc.u_symmetry, opts.symmetry ?? defaults.symmetry ?? 4);
            gl.uniform2f(loc.u_hub, hub.x, hub.y);
            gl.uniform2f(loc.u_anchor, opts.anchorX ?? 0.5, opts.anchorY ?? 0.5);
            gl.uniform1f(loc.u_tagCount, opts.tagCount ?? packed.count);
            gl.uniform3fv(loc.u_tagColors, packed.flat);
            gl.uniform1f(loc.u_colorBlend, opts.colorBlend ?? defaults.colorBlend ?? 2.6);
        } else {
            const base = this.parseColorVec3(opts.baseColor);
            const accent = this.parseColorVec3(opts.accentColor);
            const tertiary = this.parseColorVec3(opts.tertiaryColor || opts.accentColor);
            gl.uniform3f(loc.u_colorBase, base[0], base[1], base[2]);
            gl.uniform3f(loc.u_colorAccent, accent[0], accent[1], accent[2]);
            gl.uniform3f(loc.u_colorTertiary, tertiary[0], tertiary[1], tertiary[2]);
            gl.uniform1f(loc.u_flowAmount, opts.flowAmount ?? defaults.flowAmount ?? 0.35);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return canvas;
    },

    toDataURL(opts) {
        const canvas = this.renderFrame(opts);
        return canvas ? canvas.toDataURL('image/png') : '';
    },

    applyToLines(lines, canvas) {
        if (!lines || !lines.length || !canvas) return;
        const url = canvas.toDataURL('image/png');
        const gradient = `url("${url}")`;
        lines.forEach(line => {
            line.style.backgroundImage = gradient;
        });
    },

    startLive(state) {
        this.stopLive();
        if (!this.init()) return;

        const preset = this.getActivePreset();
        const defaults = preset.runtimeDefaults;
        const lerp = (a, b, t) => a + (b - a) * t;
        const target = { x: state.mouseX ?? 0.65, y: state.mouseY ?? 0.45 };
        const current = { x: target.x, y: target.y };
        const startTime = performance.now();
        const minInterval = 1000 / Math.max(8, state.liveFps ?? defaults.liveFps ?? 20);
        let lastPaint = 0;

        const live = {
            id: state.id,
            target,
            setMouse(nx, ny) {
                target.x = nx;
                target.y = ny;
            }
        };

        const tick = (now) => {
            if (!this._live || this._live.id !== state.id) return;

            current.x = lerp(current.x, target.x, state.mouseLerp ?? defaults.mouseLerp ?? 0.12);
            current.y = lerp(current.y, target.y, state.mouseLerp ?? defaults.mouseLerp ?? 0.12);
            const time = state.timeOffset + (now - startTime) * 0.001;

            if (now - lastPaint >= minInterval) {
                lastPaint = now;
                const canvas = this.renderFrame({
                    width: state.width,
                    height: state.height,
                    tagColors: state.tagColors,
                    tagCount: state.tagCount,
                    baseColor: state.baseColor,
                    accentColor: state.accentColor,
                    tertiaryColor: state.tertiaryColor,
                    bgColor: state.bgColor,
                    grainIntensity: state.grainIntensity,
                    animSpeed: state.animSpeed,
                    mouseStrength: state.mouseStrength,
                    morphComplexity: state.morphComplexity,
                    fillScale: state.fillScale,
                    symmetry: state.symmetry,
                    colorBlend: state.colorBlend,
                    palette: state.palette,
                    anchorX: state.anchorX,
                    anchorY: state.anchorY,
                    time,
                    mouseX: current.x,
                    mouseY: current.y
                });
                this.applyToLines(state.lines, canvas);
            }

            this._live.raf = requestAnimationFrame(tick);
        };

        live.raf = requestAnimationFrame(tick);
        this._live = live;
    },

    stopLive() {
        if (!this._live) return;
        cancelAnimationFrame(this._live.raf);
        this._live = null;
    },

    destroy() {
        this.stopLive();
        if (this._gl && this._buffer) {
            this._gl.deleteBuffer(this._buffer);
        }
        if (this._gl && this._program) {
            this._gl.deleteProgram(this._program);
        }
        this._canvas = null;
        this._gl = null;
        this._program = null;
        this._buffer = null;
        this._presetId = null;
        this._ready = false;
    }
};
/* ==========================================================================
   MESO GRADIENT P5 — Multiply-blended organic blob field (Canvas 2D)
   Port of p5 sketch: full-canvas blobs, blur, grain overlay.
   Tag colors from the data sheet drive core/edge palette pairs.
   ========================================================================== */
const MesoGradientP5 = {
    _canvas: null,
    _ctx: null,
    _ready: false,

    init() {
        if (this._ready) return true;
        if (typeof document === 'undefined') return false;

        const canvas = this._canvas || document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return false;

        this._canvas = canvas;
        this._ctx = ctx;
        this._ready = true;
        return true;
    },

    _defaultRand(seed, i) {
        const x = Math.sin((Number(seed) || 0) * 12.9898 + i * 78.233) * 43758.5453;
        return x - Math.floor(x);
    },

    _randRange(rand, seed, i, min, max) {
        return min + rand(seed, i) * (max - min);
    },

    _parseHex(color) {
        if (!color || typeof color !== 'string') return { r: 136, g: 136, b: 136 };
        let hex = color.trim();
        if (hex.startsWith('rgb')) {
            const m = hex.match(/[\d.]+/g);
            if (m && m.length >= 3) {
                return {
                    r: Math.round(Number(m[0])),
                    g: Math.round(Number(m[1])),
                    b: Math.round(Number(m[2]))
                };
            }
        }
        if (!hex.startsWith('#')) hex = `#${hex}`;
        if (hex.length === 4) {
            hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        }
        const n = parseInt(hex.slice(1, 7), 16);
        if (Number.isNaN(n)) return { r: 136, g: 136, b: 136 };
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },

    _toCssColor(color) {
        if (!color) return '#888888';
        if (typeof color === 'string' && color.startsWith('rgb')) return color;
        const { r, g, b } = this._parseHex(color);
        return `rgb(${r}, ${g}, ${b})`;
    },

    _darkenColor(color, amount = 0.35) {
        const { r, g, b } = this._parseHex(color);
        const f = 1 - Math.min(1, Math.max(0, amount));
        return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
    },

    _buildNoise(seed) {
        const perm = new Uint8Array(512);
        const src = new Uint8Array(256);
        for (let i = 0; i < 256; i++) src[i] = i;

        let s = (Number(seed) || 1) >>> 0;
        for (let i = 255; i > 0; i--) {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            const j = s % (i + 1);
            const tmp = src[i];
            src[i] = src[j];
            src[j] = tmp;
        }
        for (let i = 0; i < 512; i++) perm[i] = src[i & 255];

        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        const lerp = (a, b, t) => a + t * (b - a);
        const grad = (hash, x, y) => {
            const h = hash & 3;
            const u = h < 2 ? x : y;
            const v = h < 2 ? y : x;
            return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
        };

        return (x, y) => {
            const xi = Math.floor(x) & 255;
            const yi = Math.floor(y) & 255;
            const xf = x - Math.floor(x);
            const yf = y - Math.floor(y);
            const u = fade(xf);
            const v = fade(yf);
            const aa = perm[xi] + yi;
            const ab = perm[xi + 1] + yi;
            const x1 = lerp(grad(perm[aa], xf, yf), grad(perm[ab], xf - 1, yf), u);
            const x2 = lerp(grad(perm[aa + 1], xf, yf - 1), grad(perm[ab + 1], xf - 1, yf - 1), u);
            return (lerp(x1, x2, v) + 1) * 0.5;
        };
    },

    buildPalettesFromTags(tagColors, edgeDarken = 0.35) {
        const list = (tagColors || []).filter(Boolean);
        const colors = list.length ? list : ['#888888'];
        const palettes = [];
        const seen = new Set();

        const pushPair = (core, edge) => {
            const key = `${core}|${edge}`;
            if (seen.has(key)) return;
            seen.add(key);
            palettes.push({
                core: this._toCssColor(core),
                edge: this._toCssColor(edge)
            });
        };

        for (let i = 0; i < colors.length; i++) {
            const core = colors[i];
            const edge = colors.length > 1
                ? this._darkenColor(colors[(i + 1) % colors.length], edgeDarken * 0.65)
                : this._darkenColor(core, edgeDarken);
            pushPair(core, edge);
        }

        if (colors.length >= 2) {
            for (let i = 0; i < colors.length && palettes.length < 12; i++) {
                for (let j = i + 1; j < colors.length && palettes.length < 12; j++) {
                    pushPair(colors[i], this._darkenColor(colors[j], edgeDarken * 0.45));
                    pushPair(colors[j], this._darkenColor(colors[i], edgeDarken * 0.45));
                }
            }
        }

        return palettes.length ? palettes : [{ core: '#888888', edge: '#555555' }];
    },

    _fillTagWash(ctx, w, h, tagColors, strength = 0.72) {
        const colors = (tagColors || []).filter(Boolean);
        if (!colors.length) return;

        const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
        const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;
        stops.forEach((color, i) => {
            g.addColorStop(i / Math.max(1, stops.length - 1), this._toCssColor(color));
        });

        ctx.save();
        ctx.globalAlpha = strength;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    },

    _scaledBlobCount(w, h, refCount) {
        const refArea = 1920 * 1080;
        const area = Math.max(1, w * h);
        const areaScale = area / refArea;
        /* Silhouette bakes are tall+narrow — need far more blobs than full-viewport scale */
        const tallBoost = h > w * 1.2 ? Math.sqrt(h / Math.max(w, 1)) : 1;
        const scaled = Math.round(refCount * Math.max(areaScale, 0.08) * tallBoost * 4);
        return Math.max(48, Math.min(refCount, scaled));
    },

    _buildBlobs(opts, w, h) {
        const seed = opts.seed ?? 0;
        const rand = opts.rand || ((s, i) => this._defaultRand(s, i));
        const palettes = this.buildPalettesFromTags(opts.tagColors || [], opts.edgeDarken ?? 0.35);
        const refCount = opts.blobCount ?? 200;
        const count = this._scaledBlobCount(w, h, refCount);
        const sizeRef = Math.sqrt(w * h);
        const rMin = sizeRef * (opts.radiusMinScale ?? 0.04);
        const rMax = sizeRef * (opts.radiusMaxScale ?? 0.32);
        const vMin = opts.verticesMin ?? 15;
        const vMax = opts.verticesMax ?? 60;
        const dMin = opts.distortionMin ?? 0.2;
        const dMax = opts.distortionMax ?? 2.0;
        const stratified = Math.floor(count * 0.65);
        const cols = Math.max(2, Math.round(Math.sqrt(count * (w / Math.max(h, 1)))));
        const rows = Math.max(2, Math.ceil(stratified / cols));
        const blobs = [];

        for (let i = 0; i < count; i++) {
            let x;
            let y;
            if (i < stratified) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                x = ((col + 0.5) / cols) * w + this._randRange(rand, seed, i * 7 + 1, -1, 1) * (w / cols) * 0.45;
                y = ((row + 0.5) / rows) * h + this._randRange(rand, seed, i * 7 + 2, -1, 1) * (h / rows) * 0.45;
            } else {
                x = this._randRange(rand, seed, i * 5 + 1, 0, w);
                y = this._randRange(rand, seed, i * 5 + 2, 0, h);
            }

            blobs.push({
                x,
                y,
                r: this._randRange(rand, seed, i * 5 + 3, rMin, rMax),
                colors: palettes[Math.floor(rand(seed, 400 + i) * palettes.length)],
                seed: rand(seed, 500 + i) * 10000,
                vertices: Math.floor(this._randRange(rand, seed, i * 5 + 4, vMin, vMax)),
                distortion: this._randRange(rand, seed, i * 5 + 5, dMin, dMax)
            });
        }

        return blobs;
    },

    _drawOrganicBlob(ctx, blob, blurScale = 0.12) {
        const { x, y, r, colors, seed, vertices, distortion } = blob;
        const noise = this._buildNoise(seed);
        const edgeRgb = this._parseHex(colors.edge);

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, colors.core);
        grad.addColorStop(0.7, colors.edge);
        grad.addColorStop(1, `rgba(${edgeRgb.r}, ${edgeRgb.g}, ${edgeRgb.b}, 0)`);

        ctx.fillStyle = grad;
        ctx.filter = `blur(${r * blurScale}px)`;
        ctx.beginPath();

        const TWO_PI = Math.PI * 2;
        const step = TWO_PI / Math.max(3, vertices);

        for (let a = 0; a < TWO_PI; a += step) {
            const xoff = ((Math.cos(a) + 1) * 0.5) * distortion;
            const yoff = ((Math.sin(a) + 1) * 0.5) * distortion;
            const n = noise(xoff, yoff);
            const dynamicRadius = r * (0.3 + n * 1.4);
            const px = x + Math.cos(a) * dynamicRadius;
            const py = y + Math.sin(a) * dynamicRadius;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }

        ctx.closePath();
        ctx.fill();
        ctx.filter = 'none';
    },

    _applyGrainOverlay(ctx, w, h, seed, alpha = 18) {
        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;
        let g = ((Number(seed) || 1) >>> 0) ^ 0x9e3779b9;

        for (let i = 0; i < data.length; i += 4) {
            g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
            const val = g & 255;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = alpha;
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.putImageData(imageData, 0, 0);
    },

    renderFrame(opts) {
        if (!this.init()) return null;

        const canvas = this._canvas;
        const ctx = this._ctx;
        const w = Math.max(1, Math.round(opts.width || 64));
        const h = Math.max(1, Math.round(opts.height || 64));

        canvas.width = w;
        canvas.height = h;

        ctx.globalCompositeOperation = 'source-over';
        const compact = opts.compact || h <= 120;
        if (compact) {
            this._fillTagWash(ctx, w, h, opts.tagColors || [], 1);
        } else {
            ctx.fillStyle = opts.bgColor || '#f4f1ea';
            ctx.fillRect(0, 0, w, h);
            this._fillTagWash(ctx, w, h, opts.tagColors || [], 0.72);
        }

        ctx.globalCompositeOperation = opts.blendMode || 'source-over';
        const blobs = this._buildBlobs(opts, w, h);
        const blurScale = compact ? Math.min(opts.blurScale ?? 0.12, 0.05) : (opts.blurScale ?? 0.12);

        for (let i = 0; i < blobs.length; i++) {
            this._drawOrganicBlob(ctx, blobs[i], blurScale);
        }

        ctx.globalCompositeOperation = 'source-over';
        this._applyGrainOverlay(ctx, w, h, opts.seed ?? 0, opts.grainAlpha ?? 18);

        return canvas;
    },

    toDataURL(opts) {
        const canvas = this.renderFrame(opts);
        return canvas ? canvas.toDataURL('image/png') : '';
    }
};
/* ==========================================================================
   03a.1 MESO SILHOUETTE CACHE — PRECOMPUTED GEOMETRY
   ========================================================================== */
const MesoSilhouetteCache = {
    data: null,
    profiles: new Map(),
    details: new Map(),
    ready: Promise.resolve(false),
    loaded: false,

    init() {
        const cfg = CONFIG?.meso?.silhouetteCache || {};
        if (window.__BUILD_MESO_SILHOUETTE_CACHE__ === true || cfg.enabled === false || !cfg.url) {
            this.ready = Promise.resolve(false);
            return this.ready;
        }

        this.ready = fetch(cfg.url, { cache: cfg.fetchCache || 'default' })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                this.ingest(data);
                return this.loaded;
            })
            .catch((err) => {
                console.warn('Meso silhouette cache unavailable, using live geometry', err);
                this.clear();
                return false;
            });

        return this.ready;
    },

    clear() {
        this.data = null;
        this.profiles.clear();
        this.details.clear();
        this.loaded = false;
    },

    ingest(data) {
        this.clear();
        const expectedVersion = CONFIG?.meso?.silhouetteCache?.version;
        const cacheVersion = data?.meta?.cacheVersion;
        if (expectedVersion != null && cacheVersion != null && Number(cacheVersion) !== Number(expectedVersion)) {
            console.warn(`Meso silhouette cache version mismatch: expected ${expectedVersion}, got ${cacheVersion}`);
            return;
        }

        const entries = data?.entries || {};
        Object.entries(entries).forEach(([id, entry]) => {
            if (!id || !entry) return;
            if (entry.profile) {
                this.profiles.set(String(id), this.cloneProfile(entry.profile));
            }
            if (Array.isArray(entry.detailRects)) {
                this.details.set(String(id), entry.detailRects
                    .map((rect) => this.normalizeRect(rect))
                    .filter(Boolean));
            }
        });
        this.data = data;
        this.loaded = this.profiles.size > 0 || this.details.size > 0;
    },

    normalizeRect(rect) {
        const x = Number(rect?.x);
        const y = Number(rect?.y);
        const w = Number(rect?.w);
        const h = Number(rect?.h);
        if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
        return {
            x,
            y,
            w,
            h,
            kind: rect.kind || 'body'
        };
    },

    cloneProfile(profile) {
        if (!profile || !Array.isArray(profile.lines)) return null;
        return {
            ...profile,
            lines: profile.lines.map((line) => ({ ...line }))
        };
    },

    getEntry(noteId) {
        const id = String(noteId || '');
        if (!id) return null;
        return this.data?.entries?.[id] || null;
    },

    hashTextForItem(item) {
        const text = [
            item?.id || '',
            item?.title || '',
            item?.body || ''
        ].join('\n');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16);
    },

    isEntryFresh(noteId, item = null) {
        const entry = this.getEntry(noteId);
        if (!entry) return false;
        if (!item || !entry.textHash) return true;
        return entry.textHash === this.hashTextForItem(item);
    },

    getProfile(noteId, item = null) {
        if (!this.isEntryFresh(noteId, item)) return null;
        const profile = this.profiles.get(String(noteId || ''));
        return profile ? this.cloneProfile(profile) : null;
    },

    getNormalizedDetailRects(noteId, item = null) {
        if (!this.isEntryFresh(noteId, item)) return [];
        const rects = this.details.get(String(noteId || ''));
        return rects?.length ? rects.map((rect) => ({ ...rect })) : [];
    },

    getDetailRects(noteId, targetPageRect, item = null) {
        if (!this.isEntryFresh(noteId, item)) return [];
        const rects = this.details.get(String(noteId || ''));
        if (!rects?.length || !targetPageRect) return [];

        return rects.map((rect) => ({
            left: targetPageRect.left + rect.x * targetPageRect.width,
            top: targetPageRect.top + rect.y * targetPageRect.height,
            width: rect.w * targetPageRect.width,
            height: rect.h * targetPageRect.height,
            kind: rect.kind
        }));
    }
};
/* ==========================================================================
   Note censor — L3 redacted theme (same grid/cards as original, bars not text)
   ========================================================================== */
const NoteCensor = {
    _boundRevealMove: null,
    _wordIndex: null,
    _linkSvg: null,
    _linkAnimToken: 0,
    _activeSourceWord: null,
    _activeKey: null,
    _activeRoutes: [],
    _dwellTimer: null,
    _dwellWord: null,
    _committedKeys: null,
    _persistedRoutes: null,
    _persistedSources: null,
    _retractingRoutes: null,
    _wordNoteIndex: null,

    _initPersistState() {
        if (!this._committedKeys) {
            this._committedKeys = new Set();
            this._persistedRoutes = [];
            this._persistedSources = new Map();
        }
    },

    _dwellMs() {
        return this.cfg().dwellMs ?? 1000;
    },

    _isCommitted(key) {
        this._initPersistState();
        return !!key && this._committedKeys.has(key);
    },

    _cancelDwell() {
        if (this._dwellTimer) {
            clearTimeout(this._dwellTimer);
            this._dwellTimer = null;
        }
        this._dwellWord = null;
    },

    _startDwell(word) {
        this._cancelDwell();
        if (!word || this._isCommitted(this._wordKey(word))) return;
        this._dwellWord = word;
        this._dwellTimer = setTimeout(() => {
            this._dwellTimer = null;
            this._commitActiveHover();
        }, this._dwellMs());
    },

    _commitActiveHover() {
        if (!this._activeSourceWord || this._dwellWord !== this._activeSourceWord) return;

        this._initPersistState();
        const key = this._activeKey;
        const sourceWord = this._activeSourceWord;
        if (!key || !sourceWord) return;

        this._committedKeys.add(key);
        this._persistedSources.set(key, sourceWord);

        const cfg = this._linkCfg();
        this._linkAnimToken += 1;
        const token = this._linkAnimToken;

        const routes = this._activeRoutes.slice();
        this._activeRoutes = [];

        routes.forEach((route) => {
            route.key = key;
            route.sourceWord = sourceWord;
            route.isPersisted = true;
            this._persistedRoutes.push(route);
            this._completeRouteStretch(route.trail, token, cfg);
        });

        this._cancelDwell();
        this._activeSourceWord = null;
        this._activeKey = null;
        this._wordsForKey(key).forEach((word) => word.classList.add('is-word-committed'));

        if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.addCommittedWord) {
            ActionWarehouse.addCommittedWord(key);
        }

        this.refreshStudyUnlocks();
    },

    _removeRouteGroups(routes) {
        (routes || []).forEach((route) => route.group?.remove?.());
    },

    _syncLinkOverlayActive() {
        if (!this._linkSvg) return;
        this._linkSvg.classList.toggle('is-active', !!this._linkSvg.firstChild);
    },

    _abortRetractInProgress() {
        if (!this._retractingRoutes?.length) return;
        this._removeRouteGroups(this._retractingRoutes);
        this._retractingRoutes = [];
        this._syncLinkOverlayActive();
    },

    _clearActiveRouteGroups() {
        this._removeRouteGroups(this._activeRoutes);
        this._activeRoutes = [];
    },

    _linkCfg() {
        const cfg = this.cfg().wordLinks || {};
        return {
            duration: cfg.duration ?? 1650,
            stagger: cfg.stagger ?? 175,
            staggerSpreadMs: cfg.staggerSpreadMs ?? 900,
            retractStaggerSpreadMs: cfg.retractStaggerSpreadMs ?? 0,
            revertDuration: cfg.revertDuration ?? 920,
            maxLinks: cfg.maxLinks ?? 48,
            opacityMin: cfg.opacityMin ?? 0,
            opacityMax: cfg.opacityMax ?? 0.82,
            strokeWidthStart: cfg.strokeWidthStart ?? 0.9,
            strokeWidthEnd: cfg.strokeWidthEnd ?? 2.5,
            curveBend: cfg.curveBend ?? 0.24
        };
    },

    _routeStaggerMs(count, spreadMs, cfg) {
        if (count <= 1) return 0;
        const spread = spreadMs ?? 0;
        if (spread <= 0) return 0;
        return Math.min(cfg.stagger ?? 175, spread / (count - 1));
    },

    _updateRouteGeometry(trail, from, to, routeIndex, cfg, snapFull = false) {
        const prevLen = trail.getTotalLength();
        const prevOffset = Number.parseFloat(trail.style.strokeDashoffset);
        const prevOp = trail.style.opacity;
        const prevSw = trail.getAttribute('stroke-width');

        trail.setAttribute('d', this._buildRoutePath(from, to, routeIndex).d);
        const nextLen = trail.getTotalLength();

        if (snapFull || prevLen <= 0 || !Number.isFinite(prevOffset)) {
            this._finishRoute(trail, cfg);
            return;
        }

        const progress = Math.max(0, Math.min(1, (prevLen - prevOffset) / prevLen));
        trail.style.strokeDasharray = `${nextLen}`;
        trail.style.strokeDashoffset = `${nextLen * (1 - progress)}`;
        if (prevOp) trail.style.opacity = prevOp;
        if (prevSw) trail.setAttribute('stroke-width', prevSw);
    },

    isThemeEnabled() {
        return (CONFIG.theme?.mode || 'default') === 'censored';
    },

    isActive() {
        if (!this.isThemeEnabled()) return false;
        return typeof DepthController !== 'undefined' && DepthController.currentLevel === 3;
    },

    init() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        this.onLevelChange(level);
        if (!this._boundRevealMove) {
            this._boundRevealMove = (e) => this._updateWordReveal(e.clientX, e.clientY);
            this._boundRevealScroll = () => this._onRevealLayoutChange();
            this._boundRevealResize = () => this._onRevealLayoutChange();
            window.addEventListener('mousemove', this._boundRevealMove, { passive: true });
            window.addEventListener('scroll', this._boundRevealScroll, { passive: true, capture: true });
            window.addEventListener('resize', this._boundRevealResize, { passive: true });
        }
    },

    onLevelChange(level) {
        document.body.classList.toggle('is-theme-censored', this.isThemeEnabled() && level === 3);
        if (!(this.isThemeEnabled() && level === 3)) {
            this._releaseActiveHover(true);
            this._invalidateWordHitCache();
        } else {
            this._initPersistState();
            this._committedKeys.forEach((key) => {
                this._uncoverMatches(key);
                this._wordsForKey(key).forEach((word) => word.classList.add('is-word-committed'));
            });
            this._refreshPersistedRoutes();
            this.refreshStudyUnlocks();
        }
        if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.syncWordPanelMode) {
            ActionWarehouse.syncWordPanelMode(level);
        }
        if (this.isThemeEnabled() && level === 3 &&
            typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }
    },

    /** Topmost censored word under pointer — skips already-committed tokens. */
    hitWordAt(clientX, clientY) {
        if (!this.isActive()) return null;

        let word = null;
        if (typeof document.elementsFromPoint === 'function') {
            const stack = document.elementsFromPoint(clientX, clientY);
            for (const el of stack) {
                word = el?.closest?.('.note-redact__word');
                if (word) break;
            }
        } else {
            word = this._hitWordByRect(clientX, clientY);
        }

        if (!word || this._isCommitted(this._wordKey(word))) return null;
        return word;
    },

    _invalidateWordHitCache() {
        this._wordHitCache = null;
        this._wordIndex = null;
        this._wordNoteIndex = null;
    },

    invalidateWordLayout() {
        this._invalidateWordHitCache();
        this._initPersistState();
        this._committedKeys.forEach((key) => {
            this._uncoverMatches(key);
            this._wordsForKey(key).forEach((word) => word.classList.add('is-word-committed'));
        });
        if (this._activeKey) this._uncoverMatches(this._activeKey);
        this._refreshPersistedRoutes();
        this._refreshActiveRoutes();
        this.refreshStudyUnlocks();
    },

    _wordKey(wordEl) {
        return String(wordEl?.textContent || '');
    },

    _buildWordIndex() {
        const index = new Map();
        const noteIndex = new Map();
        document.querySelectorAll('.note-redact__word').forEach((word) => {
            const key = this._wordKey(word);
            if (!key) return;
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(word);

            const noteId = word.closest?.('.micro-mock__card')?.dataset?.noteId
                || word.closest?.('.note-wrapper')?.dataset?.noteId;
            if (noteId) {
                if (!noteIndex.has(key)) noteIndex.set(key, new Set());
                noteIndex.get(key).add(String(noteId));
            }
        });
        this._wordIndex = index;
        this._wordNoteIndex = noteIndex;
    },

    _noteIdsForCommittedKeys() {
        this._initPersistState();
        const ids = new Set();
        if (this._committedKeys.size && !this._wordNoteIndex) this._buildWordIndex();
        this._committedKeys.forEach((key) => {
            const noteIds = this._wordNoteIndex?.get(key);
            if (noteIds) noteIds.forEach((id) => ids.add(id));
        });
        return ids;
    },

    refreshStudyUnlocks() {
        if (!this.isActive()) {
            document.querySelectorAll('.note-wrapper.is-study-unlocked').forEach((wrapper) => {
                wrapper.classList.remove('is-study-unlocked');
            });
            return;
        }

        const unlockedIds = this._noteIdsForCommittedKeys();
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            const noteId = String(wrapper.dataset?.noteId || '');
            wrapper.classList.toggle('is-study-unlocked', !!(noteId && unlockedIds.has(noteId)));
        });
    },

    isNoteStudyUnlocked(wrapper) {
        if (!this.isActive() || !wrapper) return false;
        return wrapper.classList.contains('is-study-unlocked');
    },

    allowsStudyNoteOpen(wrapper) {
        return this.isNoteStudyUnlocked(wrapper);
    },

    _wordsForKey(key) {
        if (!key) return [];
        if (!this._wordIndex) this._buildWordIndex();
        return this._wordIndex.get(key) || [];
    },

    _uncoverMatches(key) {
        this._wordsForKey(key).forEach((word) => word.classList.add('is-revealed'));
    },

    _coverMatches(key) {
        if (!key || this._isCommitted(key)) return;
        this._wordsForKey(key).forEach((word) => {
            if (word.isConnected) word.classList.remove('is-revealed');
        });
    },

    _clearAllHoverState() {
        this._cancelDwell();
        this._initPersistState();
        this._committedKeys.forEach((key) => {
            this._wordsForKey(key).forEach((word) => {
                if (word.isConnected) {
                    word.classList.remove('is-revealed', 'is-word-committed');
                }
            });
        });
        this._committedKeys.clear();
        this._persistedSources.clear();
        this._persistedRoutes = [];
        this._activeSourceWord = null;
        this._activeKey = null;
        this._cancelLinkAnimations();
        this._activeRoutes = [];
        this._retractingRoutes = [];
        this._clearWordLinks();
        this.refreshStudyUnlocks();
    },

    _releaseActiveHover(immediate = false, onComplete) {
        if (!this._activeSourceWord && !this._activeRoutes.length && !this._retractingRoutes?.length) {
            this._cancelDwell();
            onComplete?.();
            return;
        }

        const key = this._activeKey;
        const committed = this._isCommitted(key);
        this._activeSourceWord = null;
        this._activeKey = null;
        this._cancelDwell();

        if (!committed) {
            this._coverMatches(key);
            const routesToRetract = this._activeRoutes.slice();
            this._activeRoutes = [];

            if (!routesToRetract.length || immediate) {
                this._cancelLinkAnimations();
                this._removeRouteGroups(routesToRetract);
                onComplete?.();
                return;
            }

            this._stopStretchAndRetract(routesToRetract, onComplete);
            return;
        }

        this._activeRoutes = [];
        onComplete?.();
    },

    _resetHoverState(immediate = false, onComplete) {
        this._releaseActiveHover(immediate, onComplete);
    },

    _activateHover(sourceWord) {
        if (!sourceWord) return;

        const key = this._wordKey(sourceWord);
        if (this._isCommitted(key)) return;

        this._activeSourceWord = sourceWord;
        this._activeKey = key;
        this._uncoverMatches(key);

        this._cancelLinkAnimations();
        this._clearActiveRouteGroups();

        const matches = this._wordsForKey(key);
        if (matches.length > 1) {
            this._buildActiveRoutes(sourceWord, matches);
        }

        this._startDwell(sourceWord);
    },

    _switchActiveHover(sourceWord) {
        if (!sourceWord) return;

        const key = this._wordKey(sourceWord);
        if (this._isCommitted(key)) {
            this._releaseActiveHover(true);
            return;
        }

        const oldKey = this._activeKey;
        const sameKey = oldKey === key;

        if (sameKey) {
            this._activeSourceWord = sourceWord;
            this._cancelDwell();
            this._startDwell(sourceWord);
            this._refreshActiveRoutes();
            return;
        }

        this._releaseActiveHover(true);
        this._activateHover(sourceWord);
    },

    _stopStretchAndRetract(routes, onComplete) {
        this._abortRetractInProgress();
        this._linkAnimToken += 1;
        const token = this._linkAnimToken;
        this._retractingRoutes = routes;

        if (!routes.length) {
            this._retractingRoutes = [];
            onComplete?.();
            return;
        }

        const cfg = this._linkCfg();
        let remaining = routes.length;
        const staggerStep = this._routeStaggerMs(routes.length, cfg.retractStaggerSpreadMs, cfg);

        const onRouteDone = () => {
            remaining -= 1;
            if (remaining <= 0) {
                this._retractingRoutes = [];
                this._syncLinkOverlayActive();
                onComplete?.();
            }
        };

        routes.forEach((route, index) => {
            this._retractRoute(route.trail, index * staggerStep, token, () => {
                onRouteDone();
            });
        });
    },

    _onRevealLayoutChange() {
        this._invalidateWordHitCache();
        if (this._linkLayoutRaf) return;
        this._linkLayoutRaf = requestAnimationFrame(() => {
            this._linkLayoutRaf = null;
            this._refreshPersistedRoutes();
            this._refreshActiveRoutes();
        });
    },

    _refreshPersistedRoutesForKey(key, sourceWord) {
        if (!key || !sourceWord?.isConnected) return;
        this._initPersistState();
        this._persistedSources.set(key, sourceWord);
        const cfg = this._linkCfg();
        const from = this._wordAnchor(sourceWord);

        this._persistedRoutes = this._persistedRoutes.filter((route) => {
            if (route.key !== key) return true;
            if (!route.targetWord?.isConnected) {
                route.group?.remove?.();
                return false;
            }
            const to = this._wordAnchor(route.targetWord);
            const snapFull = this._routeStretchProgress(route.trail) >= 0.995;
            this._updateRouteGeometry(route.trail, from, to, route.routeIndex, cfg, snapFull);
            route.sourceWord = sourceWord;
            return true;
        });
    },

    _refreshPersistedRoutes() {
        this._initPersistState();
        this._persistedSources.forEach((sourceWord, key) => {
            this._refreshPersistedRoutesForKey(key, sourceWord);
        });
    },

    _refreshActiveRoutes() {
        if (!this._activeSourceWord?.isConnected) return;
        const cfg = this._linkCfg();
        const from = this._wordAnchor(this._activeSourceWord);

        this._activeRoutes = this._activeRoutes.filter((route) => {
            if (!route.targetWord?.isConnected) {
                route.group?.remove?.();
                return false;
            }
            const to = this._wordAnchor(route.targetWord);
            this._updateRouteGeometry(route.trail, from, to, route.routeIndex, cfg, false);
            return true;
        });
    },

    _wordInstanceId(wordEl) {
        const noteId = wordEl?.closest?.('.micro-mock__card')?.dataset?.noteId || '';
        return `${noteId}:${this._wordKey(wordEl)}`;
    },

    _ensureLinkOverlay() {
        if (this._linkSvg) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'note-censor-word-links');
        svg.setAttribute('aria-hidden', 'true');
        document.body.appendChild(svg);
        this._linkSvg = svg;
    },

    _wordAnchor(wordEl) {
        const rect = wordEl.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    },

    _easeStretch(t) {
        if (t >= 1) return 1;
        return 1 - Math.pow(1 - t, 5);
    },

    _easeFlight(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    _easeStroke(t) {
        if (t >= 1) return 1;
        return 1 - Math.pow(2, -8 * t);
    },

    _buildRoutePath(from, to, routeIndex) {
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const bendSign = routeIndex % 2 === 0 ? 1 : -1;
        const bend = Math.min(140, dist * (this._linkCfg().curveBend ?? 0.24)) * bendSign;
        const cx = mx + (-dy / dist) * bend;
        const cy = my + (dx / dist) * bend;
        return {
            d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`
        };
    },

    _createRouteLink(from, to, routeIndex) {
        const { d } = this._buildRoutePath(from, to, routeIndex);
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'note-censor-word-links__route');

        const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        trail.setAttribute('class', 'note-censor-word-links__trail');
        trail.setAttribute('d', d);
        trail.setAttribute('fill', 'none');

        group.appendChild(trail);

        return { group, trail };
    },

    _finishRoute(trail, cfg) {
        const len = trail.getTotalLength();
        trail.style.strokeDasharray = `${len}`;
        trail.style.strokeDashoffset = '0';
        trail.style.opacity = String(cfg.opacityMax);
        trail.setAttribute('stroke-width', String(cfg.strokeWidthEnd));
    },

    _routeStretchProgress(trail) {
        const len = trail.getTotalLength();
        if (len <= 0) return 1;
        const off = Number.parseFloat(trail.style.strokeDashoffset);
        if (!Number.isFinite(off)) return 0;
        return Math.max(0, Math.min(1, (len - off) / len));
    },

    _completeRouteStretch(trail, token, cfg) {
        const progress = this._routeStretchProgress(trail);
        if (progress >= 0.995) {
            this._finishRoute(trail, cfg);
            return;
        }

        const parsedOp = Number.parseFloat(trail.style.opacity);
        const opacityStart = Number.isFinite(parsedOp) ? parsedOp : cfg.opacityMin;
        const parsedSw = Number.parseFloat(trail.getAttribute('stroke-width'));
        const swStart = Number.isFinite(parsedSw) ? parsedSw : cfg.strokeWidthStart;
        const remainMs = Math.max(220, (1 - progress) * cfg.duration);
        const startAt = performance.now();

        const tick = (now) => {
            if (token !== this._linkAnimToken || !trail.isConnected) return;

            const curLen = trail.getTotalLength();
            const t = Math.min(1, (now - startAt) / remainMs);
            const flight = this._easeFlight(t);
            const p = progress + (1 - progress) * flight;

            trail.style.strokeDasharray = `${curLen}`;
            trail.style.strokeDashoffset = `${curLen * (1 - p)}`;
            trail.style.opacity = String(opacityStart + (cfg.opacityMax - opacityStart) * flight);
            const sw = swStart + (cfg.strokeWidthEnd - swStart) * flight;
            trail.setAttribute('stroke-width', String(sw));

            if (t >= 1) {
                this._finishRoute(trail, cfg);
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    },

    _animateRoute(trail, delayMs, token) {
        const cfg = this._linkCfg();
        const startAt = performance.now() + delayMs;
        const len = trail.getTotalLength();

        trail.style.strokeDasharray = `${len}`;
        trail.style.strokeDashoffset = `${len}`;
        trail.style.opacity = String(cfg.opacityMin);
        trail.setAttribute('stroke-width', String(cfg.strokeWidthStart));

        const tick = (now) => {
            if (token !== this._linkAnimToken || !trail.isConnected) return;

            if (now < startAt) {
                requestAnimationFrame(tick);
                return;
            }

            const len = trail.getTotalLength();
            const t = Math.min(1, (now - startAt) / cfg.duration);
            const flight = this._easeFlight(t);
            const strokeP = this._easeStroke(t);
            const traveled = len * flight;

            trail.style.strokeDashoffset = `${len - traveled}`;
            trail.style.opacity = String(cfg.opacityMin + (cfg.opacityMax - cfg.opacityMin) * strokeP);
            const sw = cfg.strokeWidthStart + (cfg.strokeWidthEnd - cfg.strokeWidthStart) * strokeP;
            trail.setAttribute('stroke-width', String(sw));

            if (t >= 1) {
                this._finishRoute(trail, cfg);
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    },

    _retractRoute(trail, delayMs, token, onComplete) {
        const cfg = this._linkCfg();
        const group = trail.parentNode;
        const startAt = performance.now() + delayMs;
        const len = trail.getTotalLength();

        const removeGroup = () => {
            if (group?.isConnected) group.remove();
            else if (trail.isConnected && trail.parentNode) trail.parentNode.remove();
        };

        const finish = () => {
            removeGroup();
            onComplete?.();
        };

        if (len <= 0) {
            finish();
            return;
        }

        trail.style.strokeDasharray = `${len}`;
        const startOffset = Number.parseFloat(trail.style.strokeDashoffset);
        const visible = Number.isFinite(startOffset) ? Math.max(0, len - startOffset) : 0;

        const tick = (now) => {
            if (token !== this._linkAnimToken) {
                finish();
                return;
            }
            if (!trail.isConnected) {
                onComplete?.();
                return;
            }

            if (now < startAt) {
                requestAnimationFrame(tick);
                return;
            }

            const t = Math.min(1, (now - startAt) / cfg.revertDuration);
            const flight = this._easeFlight(t);
            const traveled = visible * (1 - flight);

            trail.style.strokeDashoffset = `${len - traveled}`;
            trail.style.opacity = String(cfg.opacityMax * (1 - flight * 0.9));
            const sw = cfg.strokeWidthEnd - (cfg.strokeWidthEnd - cfg.strokeWidthStart) * flight;
            trail.setAttribute('stroke-width', String(sw));

            if (t >= 1) {
                finish();
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    },

    _cancelLinkAnimations() {
        this._linkAnimToken += 1;
        this._abortRetractInProgress();
    },

    _buildActiveRoutes(sourceWord, matches) {
        if (!this.isActive() || !sourceWord || matches.length <= 1) return;

        if (!this._linkSvg) this._ensureLinkOverlay();
        const svg = this._linkSvg;
        const cfg = this._linkCfg();
        const from = this._wordAnchor(sourceWord);
        const token = this._linkAnimToken;
        const key = this._wordKey(sourceWord);

        const targets = matches
            .filter((word) => word !== sourceWord)
            .map((word) => ({ word, anchor: this._wordAnchor(word) }))
            .sort((a, b) => {
                const da = Math.hypot(a.anchor.x - from.x, a.anchor.y - from.y);
                const db = Math.hypot(b.anchor.x - from.x, b.anchor.y - from.y);
                return da - db;
            })
            .slice(0, cfg.maxLinks);

        const staggerStep = this._routeStaggerMs(targets.length, cfg.staggerSpreadMs, cfg);

        targets.forEach(({ word, anchor: to }, index) => {
            const routeIndex = index;
            const { group, trail } = this._createRouteLink(from, to, routeIndex);
            svg.appendChild(group);
            this._animateRoute(trail, index * staggerStep, token);

            this._activeRoutes.push({
                key,
                sourceWord,
                targetWord: word,
                group,
                trail,
                routeIndex
            });
        });

        svg.classList.add('is-active');
    },

    _clearWordLinks() {
        if (!this._linkSvg) return;
        while (this._linkSvg.firstChild) this._linkSvg.removeChild(this._linkSvg.firstChild);
        this._linkSvg.classList.remove('is-active');
        this._initPersistState();
        this._persistedRoutes = [];
    },

    _hitWordByRect(clientX, clientY) {
        const now = performance.now();
        if (!this._wordHitCache || now - this._wordHitCacheAt > 400) {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            this._wordHitCache = [];
            document.querySelectorAll('.note-redact__word').forEach((word) => {
                const r = word.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
                this._wordHitCache.push({ word, r });
            });
            this._wordHitCacheAt = now;
        }

        let best = null;
        let bestArea = Infinity;
        for (const { word, r } of this._wordHitCache) {
            if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
            if (this._isCommitted(this._wordKey(word))) continue;
            const area = r.width * r.height;
            if (area < bestArea) {
                bestArea = area;
                best = word;
            }
        }
        return best;
    },

    _updateWordReveal(clientX, clientY) {
        if (!this.isActive()) {
            this._clearAllHoverState();
            return;
        }
        if (this._revealRaf) return;
        this._revealPending = { x: clientX, y: clientY };
        this._revealRaf = requestAnimationFrame(() => {
            this._revealRaf = null;
            const pending = this._revealPending;
            if (!pending) return;

            const word = this.hitWordAt(pending.x, pending.y);

            if (word === this._activeSourceWord) return;

            if (this._activeSourceWord) {
                if (word) {
                    this._switchActiveHover(word);
                } else {
                    this._resetHoverState(false);
                }
                return;
            }

            if (word) this._activateHover(word);
        });
    },

    /** Censored theme — skip L1→L3 auto-open inspector; L3 study opens via allowsStudyNoteOpen. */
    blocksNoteFocus() {
        return this.isThemeEnabled();
    },

    cfg() {
        return CONFIG.theme || {};
    },

    escapeHTML(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    /** Tag colors for word covers — cycles when a note has multiple tags. */
    _resolveTagColors(item) {
        const tags = (item?.tags || []).filter((t) => t?.color);
        if (tags.length) return tags.map((t) => t.color);
        return [CONFIG.data?.fallbackTagColor || 'var(--color-4)'];
    },

    _sanitizeCoverColor(color) {
        const c = String(color || '').trim();
        if (/^#[0-9A-Fa-f]{3,8}$/.test(c)) return c;
        if (/^var\(--[\w-]+\)$/.test(c)) return c;
        if (/^rgba?\(/.test(c)) return c;
        return CONFIG.data?.fallbackTagColor || 'var(--color-4)';
    },

    _wordCoverStyle(tagColors, wordIndex) {
        const color = this._sanitizeCoverColor(tagColors[wordIndex % tagColors.length]);
        return ` style="--word-cover-color:${color}"`;
    },

    /** Split visible text into hover-reveal word tokens (whitespace-separated). */
    tokenizeWords(text) {
        return String(text || '').split(/\s+/).filter(Boolean);
    },

    buildWordsBlock(text, extraClass = '', tagColors = null) {
        const colors = tagColors || [CONFIG.data?.fallbackTagColor || 'var(--color-4)'];
        const paragraphs = String(text || '').split(/\r?\n/);
        const chunks = [];
        let wordIndex = 0;

        paragraphs.forEach((paragraph) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return;

            if (chunks.length) {
                chunks.push('<span class="note-redact__break" aria-hidden="true"></span>');
            }

            this.tokenizeWords(trimmed).forEach((word, indexInLine) => {
                if (indexInLine > 0) chunks.push(' ');
                const coverStyle = this._wordCoverStyle(colors, wordIndex);
                wordIndex += 1;
                chunks.push(`<span class="note-redact__word"${coverStyle}>${this.escapeHTML(word)}</span>`);
            });
        });

        if (!chunks.length) return '';
        return `<span class="note-redact note-redact--words ${extraClass}">${chunks.join('')}</span>`;
    },

    _hashUnit(seed) {
        const s = String(seed ?? '');
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return ((h >>> 0) % 10000) / 10000;
    },

    /** Match depth-v2 layout weight — visual lines after soft wrap. */
    expandVisualLines(text, wrapAt) {
        const lines = [];
        String(text || '').split(/\r?\n/).forEach((paragraph) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return;
            const chars = Array.from(trimmed);
            if (chars.length <= wrapAt) {
                lines.push(trimmed);
                return;
            }
            for (let i = 0; i < chars.length; i += wrapAt) {
                lines.push(chars.slice(i, i + wrapAt).join(''));
            }
        });
        return lines;
    },

    buildBars(text, seed, options = {}) {
        const wrapAt = options.wrapAt ?? 38;
        const minW = options.minWidth ?? 0.24;
        const maxW = options.maxWidth ?? 0.96;
        const lines = this.expandVisualLines(text, wrapAt);
        if (!lines.length) return '';

        return lines.map((line, i) => {
            const chars = Array.from(line.replace(/\s+/g, ' ')).length || 4;
            const lengthBias = Math.min(maxW, Math.max(minW, chars / wrapAt * 0.92));
            const jitter = (this._hashUnit(`${seed}:${i}`) - 0.5) * 0.1;
            const w = Math.min(maxW, Math.max(minW, lengthBias + jitter));
            return `<span class="note-redact__bar" style="width:${Math.round(w * 100)}%"></span>`;
        }).join('');
    },

    buildRedactBlock(text, seed, extraClass = '', options = {}) {
        const bars = this.buildBars(text, seed, options);
        if (!bars) return '';
        return `<span class="note-redact ${extraClass}">${bars}</span>`;
    },

    buildTitleHTML(item) {
        const title = String(item?.title || '').trim();
        if (!title) return '';
        const tagColors = this._resolveTagColors(item);
        const inner = this.buildWordsBlock(title, 'note-redact--title', tagColors);
        return `<h2 class="note-title note-h">${inner}</h2>`;
    },

    buildBodyHTML(item) {
        const body = String(item?.body || '');
        if (!String(body).trim()) return '';
        const tagColors = this._resolveTagColors(item);
        const inner = this.buildWordsBlock(body, 'note-redact--body', tagColors);
        return `<div class="note-body note-t">${inner}</div>`;
    },

    buildIdHTML(item) {
        const idText = String(item?.id || '').trim();
        if (!idText) return '';
        return `<div class="note-idcode general-t">${this.escapeHTML(idText)}</div>`;
    },

    buildCardOnlyHTML(item, options = {}) {
        const esc = this.escapeHTML.bind(this);
        const focusClass = options.focusScale ? ' micro-mock__card--focus' : '';
        const dir = item.textDirection === 'ltr' ? 'ltr' : 'rtl';
        return `<div class="micro-mock__card note-card${focusClass}" data-note-id="${esc(item.id)}" dir="${dir}">` +
            this.buildIdHTML(item) +
            this.buildTitleHTML(item) +
            this.buildBodyHTML(item) +
            `</div>`;
    },

    buildMetadataValueHTML(label, item) {
        const seed = `${item?.id}:meta:${label}`;
        return this.buildRedactBlock('████████', seed, 'note-redact--meta', {
            wrapAt: 20,
            minWidth: 0.28,
            maxWidth: 0.72
        });
    }
};
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
/* ==========================================================================
   03b. MICRO MOCK — תצוגת פתקים ב-L3 (V2, מחובר ל-AppState.items)
   ========================================================================== */
const MicroMock = {
    escapeHTML(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    resolveItem(wrapper) {
        const noteId = wrapper?.dataset?.noteId;
        if (!noteId) return null;

        if (typeof AppState !== 'undefined') {
            const item = AppState.items.find(i => String(i.id) === String(noteId));
            if (item) return item;
        }

        if (typeof SilhouetteEngine !== 'undefined') {
            return SilhouetteEngine.entries.get(String(noteId))?.item ?? null;
        }

        return null;
    },

    buildTagsHTML(tags, options = {}) {
        const pillClass = options.noteStyle
            ? 'micro-mock__tag-pill action-block--attached general-t'
            : 'action-block micro-mock__tag-block general-t';
        if (!tags?.length) {
            return `<span class="${pillClass}">` +
                `<span class="block-glyph" style="background-color:var(--color-4)"></span>` +
                `<span class="block-label">—</span></span>`;
        }
        return tags.map(tag => (
            `<span class="${pillClass}">` +
            `<span class="block-glyph" style="background-color:${tag.color}"></span>` +
            `<span class="block-label">${this.escapeHTML(tag.name)}</span></span>`
        )).join('');
    },

    buildAuthorHTML(item) {
        const author = String(item?.authorCode || item?.authorFullName || '').trim();
        if (!author) return '';
        return `<span class="action-block action-block--author action-block--attached micro-mock__author-block general-t">` +
            `<span class="block-label">${this.escapeHTML(author)}</span></span>`;
    },

    buildTypologyHTML(item) {
        const typology = String(item?.typology || '').trim();
        if (!typology) return '';
        const pattern = typeof getTypologyPattern === 'function'
            ? getTypologyPattern(typology)
            : 'regular';
        const inner = typeof buildTypologyBlockInnerHTML === 'function'
            ? buildTypologyBlockInnerHTML(typology)
            : `<span class="block-label">${this.escapeHTML(typology)}</span>`;
        return `<span class="action-block action-block--typology action-block--attached micro-mock__typology-block general-t" data-typology="${this.escapeHTML(typology)}" data-typology-pattern="${pattern}">${inner}</span>`;
    },

    buildCardOnlyHTML(item, options = {}) {
        const useCensor = typeof NoteCensor !== 'undefined'
            && NoteCensor.isActive()
            && !options.forceReadable;
        if (useCensor) {
            return NoteCensor.buildCardOnlyHTML(item, options);
        }
        const title = String(item.title || '').trim();
        const titleHTML = title
            ? `<h2 class="note-title note-h">${this.escapeHTML(title)}</h2>`
            : '';
        const focusClass = options.focusScale ? ' micro-mock__card--focus' : '';
        const dir = item.textDirection === 'ltr' ? 'ltr' : 'rtl';
        return `<div class="micro-mock__card note-card${focusClass}" data-note-id="${this.escapeHTML(item.id)}" dir="${dir}">` +
            `<div class="note-idcode general-t">${this.escapeHTML(item.id)}</div>` +
            titleHTML +
            `<div class="note-body note-t">${this.escapeHTML(item.body)}</div>` +
            `</div>`;
    },

    buildTagsRowHTML(item) {
        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
            return '';
        }
        return `<div class="micro-mock__tags">` +
            `${this.buildTagsHTML(item.tags, { noteStyle: true })}` +
            `${this.buildTypologyHTML(item)}` +
            `${this.buildAuthorHTML(item)}` +
            `</div>`;
    },

    buildCardHTML(item, options = {}) {
        const card = this.buildCardOnlyHTML(item, options);
        const tags = this.buildTagsRowHTML(item);
        return `<div class="micro-mock__note">${card}${tags}</div>`;
    },

    applyToWrapper(wrapper, item = null) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return false;

        const glyph = wrapper.querySelector('.depth-v2-glyph--micro');
        if (!glyph) return false;

        const resolved = item || this.resolveItem(wrapper);
        if (!resolved) return false;

        glyph.innerHTML = this.buildCardHTML(resolved);
        if (typeof TextDirection !== 'undefined') {
            TextDirection.applyToWrapper(wrapper, resolved.textDirection);
        }
        wrapper.style.removeProperty('--micro-mock-row-span');
        wrapper.dataset.microMockNoteId = String(resolved.id);
        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
            NoteCensor.invalidateWordLayout();
        }
        return true;
    },

    applyAll() {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 3) return 0;

        let applied = 0;
        [...document.querySelectorAll('#app .note-wrapper:not(.is-layout-excluded)')].forEach(wrapper => {
            try {
                if (this.applyToWrapper(wrapper)) applied++;
            } catch (err) {
                console.warn('MicroMock apply failed', wrapper.dataset.noteId, err);
            }
        });
        return applied;
    }
};
/* ==========================================================================
   03. RENDER ENGINE (DOM GENERATION)
   ========================================================================== */
const RenderEngine = {
    getStableMicroHoverRotationDeg(item, noteIndex = 0) {
        const cfg = CONFIG.depth?.microNoteHoverRotation ?? {};
        const negMin = cfg.negativeMin ?? -10;
        const negMax = cfg.negativeMax ?? -5;
        const posMin = cfg.positiveMin ?? 5;
        const posMax = cfg.positiveMax ?? 10;
        const idx = Number(noteIndex) || 0;
        const payload = `${String(item?.id ?? '')}\0${String(item?.authorCode ?? '')}\0${idx}`;

        let h = 2166136261;
        for (let i = 0; i < payload.length; i++) {
            h ^= payload.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }

        const signPick = ((h >>> 0) % 10000) / 10000;
        const magPick = (((h >>> 12) & 0xffff) % 10000) / 10000;
        const positive = signPick >= 0.5;

        if (positive) {
            return Math.round((posMin + magPick * (posMax - posMin)) * 100) / 100;
        }
        return Math.round((negMin + magPick * (negMax - negMin)) * 100) / 100;
    },

    createNoteDOM(item, noteIndex = -1) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('note-wrapper', 'snap-point');
        wrapper.dataset.noteId = item.id;
        if (noteIndex >= 0) wrapper.dataset.noteIndex = String(noteIndex);
        if (item.authorCode) wrapper.dataset.authorCode = item.authorCode;
        if (item.typology) wrapper.dataset.typology = item.typology;

        const hoverDeg = this.getStableMicroHoverRotationDeg(item, noteIndex >= 0 ? noteIndex : 0);
        wrapper.style.setProperty('--note-micro-hover-rotation', `${hoverDeg}deg`);

        let tagsHTML = '';
        if (item.tags && item.tags.length > 0) {
            tagsHTML = item.tags.map(t => 
                `<span class="tag"><span class="tag-circle" style="background-color: ${t.color}"></span>${t.name}</span>`
            ).join('');
        }

        const layerFull = `
            <div class="layer-item layer-full">
                <div class="note-card">
                    <div class="note-idcode">${item.id}</div>
                    <h2 class="note-title">${item.title}</h2>
                    <div class="note-body">${item.body}</div>
                    <div class="note-tags">${tagsHTML}</div>
                </div>
            </div>
        `;
        
        const useV2SilhouetteSkip = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        const layerSmall = useV2SilhouetteSkip ? '' : `
            <div class="layer-item layer-small">
                <div class="meso-silhouette" aria-hidden="true" data-silhouette-state="pending">
                    <svg class="meso-silhouette__svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path class="meso-silhouette__shape"></path>
                    </svg>
                    <div class="meso-silhouette__tags"></div>
                </div>
            </div>
        `;
        
        let dotsHTML = '';
        if (item.tags && item.tags.length > 0) {
            item.tags.forEach((tag, index) => {
                dotsHTML += `<div class="layer-item layer-dot" data-index="${index}" data-tag="${tag.name}" style="--dot-bg: ${tag.color};"></div>`;
            });
        } else {
            dotsHTML = `<div class="layer-item layer-dot" style="--dot-bg: var(--main-text);"></div>`;
        }

        wrapper.innerHTML = `
            <div class="note-stage" data-layout-source="meso" aria-hidden="false">
                ${layerSmall}
                ${layerFull}
                <div class="depth-v2-glyph depth-v2-glyph--micro" aria-hidden="true"></div>
            </div>
            <div class="depth-v2-glyph depth-v2-glyph--meso meso-mock" aria-hidden="true"></div>
            ${dotsHTML}
        `;

        wrapper.addEventListener('click', (e) => {
            if (e.target.closest('.layer-dot')) return;
            if (typeof isPointOverSiteNavigationUI === 'function' &&
                isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
                return;
            }
            e.stopPropagation();

            if (DepthController.currentLevel >= 2 &&
                (wrapper.classList.contains('is-layout-excluded') ||
                 wrapper.classList.contains('is-molecule-filtered-out'))) {
                return;
            }

            if (DepthController.currentLevel === 1) {
                const noteIndex = [...document.querySelectorAll('.note-wrapper')].indexOf(wrapper);
                if (noteIndex < 0) return;

                if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
                    DepthController.changeLevel(3);
                    return;
                }

                if (typeof DepthTransitionOrchestrator !== 'undefined') {
                    DepthTransitionOrchestrator.runNoteClick(noteIndex, wrapper);
                }
                return;
            }

            if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
                if (!NoteCensor.isNoteStudyUnlocked(wrapper)) return;
            }

            if (ArtifactInspector.isActive) {
                ArtifactInspector.close();
            } else {
                ArtifactInspector.open(wrapper);
            }
        });
        
        if (!useV2SilhouetteSkip) {
            SilhouetteEngine.registerWrapper(wrapper, item);
        }
        if (typeof TextDirection !== 'undefined') {
            TextDirection.applyToWrapper(wrapper, item.textDirection);
        }
        return wrapper;
    }
};

/* ==========================================================================
   03b. SILHOUETTE ENGINE (MESO — LINE BLOCKS + MICRO FRAME SYNC)
   Silhouette geometry anchors the micro note inside .note-stage.
   ========================================================================== */
const SilhouetteEngine = {
    entries: new Map(),
    cache: new Map(),
    buildQueue: [],
    isBuilding: false,
    layoutReady: null,

    init() {
        this.cache.clear();
        this.layoutReady = this.waitForMicroLayout();
    },

    waitForMicroLayout() {
        return document.fonts.ready
            .then(() => new Promise(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            }))
            .catch(() => Promise.resolve());
    },

    registerWrapper(wrapper, item) {
        const host = wrapper.querySelector('.meso-silhouette');
        const svg = wrapper.querySelector('.meso-silhouette__svg');
        const path = wrapper.querySelector('.meso-silhouette__shape');
        if (!host || !svg || !path) return;

        this.entries.set(String(item.id), {
            wrapper,
            item,
            host,
            svg,
            path,
            built: false,
            tagsMounted: false
        });
    },

    getPrimaryTextNode(el) {
        if (!el) return null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            if (node.textContent && node.textContent.trim()) return node;
            node = walker.nextNode();
        }
        return null;
    },

    toCardLocalRect(rect, cardEl, layoutScale) {
        const cardRect = cardEl.getBoundingClientRect();
        return {
            x: (rect.left - cardRect.left) * layoutScale,
            y: (rect.top - cardRect.top) * layoutScale,
            w: rect.width * layoutScale,
            h: rect.height * layoutScale
        };
    },

    // Per-line rects: width = line length, height = line height (layer 3 layout)
    measureElementLineRects(el, cardEl) {
        if (!el || !cardEl) return [];

        const cardRect = cardEl.getBoundingClientRect();
        const layoutScale = cardEl.offsetWidth > 0 && cardRect.width > 0
            ? cardEl.offsetWidth / cardRect.width
            : 1;
        const toLocal = (r) => this.toCardLocalRect(r, cardEl, layoutScale);

        const clientRects = [...el.getClientRects()]
            .filter(r => r.width > 0.5 && r.height > 0.5)
            .map(toLocal);

        if (clientRects.length > 1) return clientRects;

        const textNode = this.getPrimaryTextNode(el);
        if (!textNode || !textNode.textContent) return clientRects;

        const range = document.createRange();
        const text = textNode.textContent;
        const lines = [];
        let lineStart = 0;
        let prevTop = null;

        for (let i = 0; i < text.length; i++) {
            range.setStart(textNode, i);
            range.setEnd(textNode, i + 1);
            const charRect = range.getBoundingClientRect();
            if (charRect.width < 0.01 && charRect.height < 0.01) continue;

            if (prevTop !== null && charRect.top > prevTop + charRect.height * 0.35) {
                range.setStart(textNode, lineStart);
                range.setEnd(textNode, i);
                const lineRect = range.getBoundingClientRect();
                if (lineRect.width > 0.5 && lineRect.height > 0.5) {
                    lines.push(toLocal(lineRect));
                }
                lineStart = i;
            }
            prevTop = charRect.top;
        }

        range.setStart(textNode, lineStart);
        range.setEnd(textNode, text.length);
        const lastRect = range.getBoundingClientRect();
        if (lastRect.width > 0.5 && lastRect.height > 0.5) {
            lines.push(toLocal(lastRect));
        }

        return lines.length > 0 ? lines : clientRects;
    },

    measureFromMicroNote(wrapper) {
        const card = wrapper.querySelector('.note-card');
        if (!card || card.offsetWidth < 2 || card.offsetHeight < 2) return null;

        wrapper.classList.add('is-measuring-silhouette');

        const cfg = CONFIG.meso;
        const rects = [];

        try {
            if (cfg.includeTitle) {
                rects.push(...this.measureElementLineRects(
                    wrapper.querySelector('.note-title'), card
                ));
            }
            if (cfg.includeBody) {
                rects.push(...this.measureElementLineRects(
                    wrapper.querySelector('.note-body'), card
                ));
            }
        } finally {
            wrapper.classList.remove('is-measuring-silhouette');
        }

        if (rects.length === 0) return null;

        return {
            rects,
            cardW: card.offsetWidth,
            cardH: card.offsetHeight
        };
    },

    // Fallback when micro DOM is not measurable yet
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

    buildFallbackRects(item) {
        const card = document.querySelector('.note-card');
        const cardW = card?.offsetWidth || scale(200);
        const cardH = card?.offsetHeight || scale(210);
        const pad = CONFIG.meso.silhouette.padding;
        const typo = CONFIG.meso.typography;
        const segments = [];

        const maxCharsFor = (t) => {
            const charUnit = t.size * t.charWidthRatio;
            return Math.max(1, Math.floor((cardW - pad * 2) / charUnit));
        };

        if (CONFIG.meso.includeTitle && item.title) {
            this.wrapByCharCount(item.title, maxCharsFor(typo.title))
                .forEach(text => segments.push({ text, role: 'title' }));
        }
        if (CONFIG.meso.includeBody && item.body) {
            const maxChars = maxCharsFor(typo.body);
            item.body.slice(0, CONFIG.meso.maxBodyChars).split('\n')
                .map(l => l.trim()).filter(Boolean)
                .forEach(p => this.wrapByCharCount(p, maxChars)
                    .forEach(text => segments.push({ text, role: 'body' })));
        }
        if (segments.length === 0) {
            segments.push({ text: String(item.title || item.id || '—'), role: 'title' });
        }

        let y = pad;
        const rects = [];
        segments.forEach(seg => {
            const t = seg.role === 'title' ? typo.title : typo.body;
            const charUnit = t.size * t.charWidthRatio;
            const lineH = t.size * t.lineHeight;
            const w = Math.max(charUnit, this.charCount(seg.text) * charUnit);
            rects.push({ x: cardW - pad - w, y, w, h: lineH });
            y += lineH;
            if (seg.role === 'title') y += t.size * typo.titleBodyGap;
        });
        return { rects, cardW, cardH };
    },

    rectsToPath(rects) {
        return rects.map(r =>
            `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`
        ).join(' ');
    },

    composeVectorShape(entry) {
        const cfg = CONFIG.meso;
        const microData = this.measureFromMicroNote(entry.wrapper);
        const layout = microData || this.buildFallbackRects(entry.item);
        const { rects, cardW, cardH } = layout;

        if (!rects.length) return null;

        return {
            width: cardW,
            height: cardH,
            viewBox: `0 0 ${cardW} ${cardH}`,
            pathD: this.rectsToPath(rects),
            fill: cfg.color.fill,
            fromMicro: !!microData
        };
    },

    syncMicroFrame(entry, shape) {
        if (!shape?.width || !shape?.height) return;

        const wrapper = entry.wrapper;
        wrapper.style.setProperty('--meso-frame-w', String(shape.width));
        wrapper.style.setProperty('--meso-frame-h', String(shape.height));
        wrapper.dataset.mesoFrameReady = '1';

        const stage = wrapper.querySelector('.note-stage');
        if (stage) stage.dataset.layoutAnchor = 'meso';
    },

    mountTagMarkers(entry) {
        if (entry.tagsMounted) return;

        const tagsEl = entry.host.querySelector('.meso-silhouette__tags');
        if (!tagsEl) return;

        const cfg = CONFIG.meso.tagMarkers;
        const tags = (entry.item.tags && entry.item.tags.length > 0)
            ? entry.item.tags.slice(0, cfg.maxVisible)
            : [{ color: CONFIG.meso.color.fill }];

        tagsEl.innerHTML = tags.map(t =>
            `<span class="meso-tag-dot" style="background-color: ${t.color}"></span>`
        ).join('');

        entry.tagsMounted = true;
    },

    mountEntry(entry, shape) {
        const cached = shape || this.cache.get(String(entry.item.id));
        if (!cached || !cached.pathD) return false;

        entry.svg.setAttribute('viewBox', cached.viewBox);
        entry.svg.setAttribute('width', cached.width);
        entry.svg.setAttribute('height', cached.height);
        entry.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        entry.path.setAttribute('d', cached.pathD);
        entry.path.setAttribute('fill', cached.fill);

        this.syncMicroFrame(entry, cached);
        this.mountTagMarkers(entry);
        entry.host.dataset.silhouetteState = 'ready';
        entry.built = true;
        return true;
    },

    buildForEntry(entry) {
        const key = String(entry.item.id);
        const cached = this.cache.get(key);
        if (cached?.fromMicro) {
            return this.mountEntry(entry);
        }

        const shape = this.composeVectorShape(entry);
        if (!shape) {
            this.mountTagMarkers(entry);
            entry.host.dataset.silhouetteState = 'empty';
            return false;
        }

        this.cache.set(key, shape);
        return this.mountEntry(entry, shape);
    },

    scheduleBuildAll() {
        const run = () => {
            this.cache.clear();
            this.buildQueue = [...this.entries.values()];
            const needsMicroGrid = DepthController.currentLevel !== 1;
            if (needsMicroGrid) {
                document.body.classList.add('is-silhouette-micro-measure');
                void document.getElementById('app')?.offsetHeight;
            }
            if (!this.isBuilding) this.pumpBuildQueue();
        };

        if (this.layoutReady) {
            return this.layoutReady.then(run);
        }
        run();
        return Promise.resolve();
    },

    ensureAllBuilt() {
        return this.scheduleBuildAll().then(() => new Promise(resolve => {
            const wait = () => {
                if (this.isBuilding || this.buildQueue.length > 0) {
                    requestAnimationFrame(wait);
                } else {
                    resolve();
                }
            };
            wait();
        }));
    },

    pumpBuildQueue() {
        if (this.buildQueue.length === 0) {
            this.isBuilding = false;
            document.body.classList.remove('is-silhouette-micro-measure');
            return;
        }

        this.isBuilding = true;
        const batch = this.buildQueue.splice(0, CONFIG.meso.buildBatchSize);
        batch.forEach(entry => this.buildForEntry(entry));

        requestAnimationFrame(() => this.pumpBuildQueue());
    },

    invalidate(noteId) {
        this.cache.delete(String(noteId));
        const entry = this.entries.get(String(noteId));
        if (entry) {
            entry.built = false;
            entry.tagsMounted = false;
            entry.host.dataset.silhouetteState = 'pending';
            entry.path.removeAttribute('d');
            const tagsEl = entry.host.querySelector('.meso-silhouette__tags');
            if (tagsEl) tagsEl.innerHTML = '';
        }
    },

    onLevelEnter(level) {
        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) return;
        if (DepthController.isMicroTransitionActive()) return;
        if (DepthController.isMacroMesoTransitionActive()) return;
        if (level === 1 || level === 3) this.scheduleBuildAll();
    }
};

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
/* ==========================================================================
   03d. CATALOG STATE — cross-layer snapshot (L1 workspace → L2/L3 layout)
   ========================================================================== */
const CatalogState = {
    revision: 0,
    activeCriteria: { tags: new Set(), authors: new Set(), typologies: new Set() },
    filterCriteria: { tags: new Set(), authors: new Set(), typologies: new Set() },
    noteRoles: new Map(),
    blockAnchors: [],
    catalogLayout: null,
    workspaceLens: null,
    visibleNoteIndices: [],
    filteredNoteIndices: [],
    hasFilterCriteria: false,
    hasFocus: false,
    macroRank: null,
    baselineMacroRank: null,
    visibleOrder: [],
    lastMesoAnchors: [],
    _listeners: [],

    subscribe(fn) {
        if (typeof fn === 'function') this._listeners.push(fn);
    },

    _notify() {
        this.revision += 1;
        this._listeners.forEach(fn => {
            try { fn(this); } catch (_) { /* ignore */ }
        });
        if (typeof window !== 'undefined') {
            window.__catalogState = this.snapshot();
        }
    },

    snapshot() {
        return {
            revision: this.revision,
            layoutMode: CONFIG.depth.layoutMode,
            activeTags: [...this.activeCriteria.tags],
            activeAuthors: [...this.activeCriteria.authors],
            activeTypologies: [...this.activeCriteria.typologies],
            filterTags: [...this.filterCriteria.tags],
            filterAuthors: [...this.filterCriteria.authors],
            filterTypologies: [...this.filterCriteria.typologies],
            blockCount: this.blockAnchors.length,
            noteCount: this.noteRoles.size,
            hasCatalogLayout: !!this.catalogLayout,
            visibleNoteIndices: [...this.visibleNoteIndices],
            filteredNoteIndices: [...this.filteredNoteIndices],
            hasFilterCriteria: this.hasFilterCriteria,
            hasFocus: this.hasFocus,
            macroRankSize: this.macroRank?.size ?? 0
        };
    },

    rebuildFromWarehouse() {
        if (typeof ActionWarehouse === 'undefined') return this;

        const activeTags = new Set();
        const activeAuthors = new Set();
        const activeTypologies = new Set();

        ActionWarehouse.blocks.forEach(block => {
            if (block.state !== 'active') return;
            if (block.nestedIn) return;
            if (!ActionWarehouse.isBlockFocusEligible(block)) return;

            if (block.type === 'tag' && block.tag) activeTags.add(block.tag);
            if (block.type === 'author' && block.author) activeAuthors.add(block.author);
            if (block.type === 'typology' && block.typology) activeTypologies.add(block.typology);
        });

        ActionWarehouse.blocks.forEach(block => {
            if (block.state !== 'active' || !block.nestedIn) return;
            if (block.nestedIn.frameKind === 'filter') return;
            if (!ActionWarehouse.isBlockFocusEligible(block.nestedIn)) return;
            if (block.type === 'tag' && block.tag) activeTags.add(block.tag);
            if (block.type === 'author' && block.author) activeAuthors.add(block.author);
            if (block.type === 'typology' && block.typology) activeTypologies.add(block.typology);
        });

        const { tags: filterTags, authors: filterAuthors, typologies: filterTypologies } =
            ActionWarehouse.getFilterCriteria();

        this.activeCriteria = { tags: activeTags, authors: activeAuthors, typologies: activeTypologies };
        this.filterCriteria = { tags: filterTags, authors: filterAuthors, typologies: filterTypologies };
        this.hasFilterCriteria = filterTags.size > 0 || filterAuthors.size > 0 || filterTypologies.size > 0;
        this.hasFocus = activeTags.size > 0 || activeAuthors.size > 0 || activeTypologies.size > 0;

        this.filteredNoteIndices = [...ActionWarehouse.filteredNoteIndices];
        this.visibleNoteIndices = [];

        this.blockAnchors = ActionWarehouse.blocks
            .filter(b => ActionWarehouse.isWorkspaceOccupant(b))
            .filter(b => b.type === 'tag' || b.type === 'author' || b.type === 'typology' || b.type === 'frame')
            .map(b => ({
                id: b.tag || b.author || b.typology || b.type,
                type: b.type,
                tag: b.tag || null,
                author: b.author || null,
                typology: b.typology || null,
                pageX: b.bodyX,
                pageY: b.bodyY
            }));

        this.noteRoles = new Map();
        const wrappers = document.querySelectorAll('.note-wrapper');
        wrappers.forEach((wrapper, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) {
                this.noteRoles.set(noteIndex, 'filtered');
                return;
            }

            const authorCode = wrapper.dataset.authorCode || '';
            const { tags } = ActionWarehouse.getNoteFocusTagsAndAuthor(noteIndex, wrapper);

            const noteTypology = ActionWarehouse.getNoteTypology(noteIndex, wrapper);
            const emphasized = ActionWarehouse.noteMatchesActiveFocus(
                tags,
                authorCode,
                activeTags,
                activeAuthors,
                noteTypology,
                activeTypologies
            );

            let role = emphasized ? 'emphasized' : 'neutral';

            if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.bodiesData) {
                const noteDots = PhysicsEngine.bodiesData.filter(
                    d => d.noteIndex === noteIndex && !d.isFiltered
                );
                if (noteDots.some(d => d.overrideTarget)) role = 'captured';
                if (ActionWarehouse.stretchedNotes?.has(noteIndex)) role = 'stretched';
            }

            this.noteRoles.set(noteIndex, role);
            if (role !== 'filtered') {
                this.visibleNoteIndices.push(noteIndex);
            }
        });

        this.workspaceLens = {
            activeTags: new Set(activeTags),
            activeAuthors: new Set(activeAuthors),
            activeTypologies: new Set(activeTypologies),
            blockAnchors: this.blockAnchors.slice(),
            emphasizedNotes: [...this.noteRoles.entries()]
                .filter(([, role]) => role === 'emphasized' || role === 'captured' || role === 'stretched')
                .map(([idx]) => idx)
        };

        if (typeof CatalogLayoutEngine !== 'undefined') {
            this.catalogLayout = CatalogLayoutEngine.buildForState(this);
        }

        this._notify();
        return this;
    }
};
/* ==========================================================================
   03f. DEPTH TRANSITION ORCHESTRATOR — scroll → FX → reveal
   ========================================================================== */
const DepthTransitionOrchestrator = {
    _running: false,

    isRunning() {
        return this._running;
    },

    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    run(intent, executeLevelChange, options = {}) {
        if (this._running) return;
        this._running = true;

        CatalogState.rebuildFromWarehouse();

        const tCfg = CONFIG.depth.transition || {};
        const scrollDuration = tCfg.scrollDuration ?? 520;
        const handoffRatio = options.handoffRatio ?? tCfg.handoffRatio ?? 1;
        let handoffDone = false;

        document.body.classList.add('is-depth-transition');

        const finishRun = () => {
            document.body.classList.remove('is-depth-transition');
            document.body.style.removeProperty('--depth-transition-fx');
            document.body.style.removeProperty('--depth-transition-blur');
            this._running = false;
        };

        const maybeHandoff = (t) => {
            if (handoffDone || typeof executeLevelChange !== 'function') return;
            if (handoffRatio >= 1) return;
            if (t < handoffRatio) return;
            handoffDone = true;
            executeLevelChange(intent);
        };

        this._phaseScroll(intent, scrollDuration, () => {
            this._phaseFx(tCfg.fxDuration ?? 480, (t) => {
                maybeHandoff(t);
            }, () => {
                this._phaseReveal(() => {
                    if (!handoffDone && typeof executeLevelChange === 'function') {
                        executeLevelChange(intent);
                    }
                    finishRun();
                });
            });
        });
    },

    runBlockClick(block) {
        if (DepthController.currentLevel !== 1) return;
        if (this.isRunning()) return;
        if (!block || !ActionWarehouse.isBlockClickTransitionEligible(block)) return;
        if (!block.element?.classList.contains('is-deployed')) return;

        CatalogState.rebuildFromWarehouse();

        const useV2 = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        const scrollTarget = useV2
            ? null
            : CatalogLayoutEngine.getScrollTargetForBlock(
                CatalogState.catalogLayout,
                block
            );

        const enterMicroFilterView = () => {
            DepthController.changeLevel(3);
            requestAnimationFrame(() => {
                if (typeof ActionWarehouse !== 'undefined') {
                    ActionWarehouse.syncDeployedBlocksForDepth?.();
                    ActionWarehouse.updateDotFocusFilter();
                }
                if (typeof MicroMock !== 'undefined') {
                    MicroMock.applyAll?.();
                }
                if (typeof AppState !== 'undefined') {
                    AppState.centerCanvasOnLayerEnter();
                }
            });
        };

        this.run({
            type: 'block-click',
            fromLevel: 1,
            toLevel: 3,
            block,
            scrollTarget
        }, enterMicroFilterView);
    },

    runWheelZoom() {
        // Wheel uses MacroMesoBridge / micro reveal directly — no pre-orchestrator
        return false;
    },

    runNoteClick(noteIndex, wrapper) {
        if (DepthController.currentLevel !== 1) return;

        CatalogState.rebuildFromWarehouse();
        const scrollTarget = CatalogLayoutEngine.getScrollTargetForNote(
            noteIndex,
            CatalogState.catalogLayout
        );

        const toLevel = 3;

        this.run({
            type: 'note-click',
            fromLevel: 1,
            toLevel,
            noteIndex,
            wrapper,
            scrollTarget
        }, () => {
            DepthController.changeLevel(toLevel);
            if (wrapper && typeof ArtifactInspector !== 'undefined' &&
                !(typeof NoteCensor !== 'undefined' && NoteCensor.blocksNoteFocus())) {
                requestAnimationFrame(() => {
                    if (DepthController.currentLevel === 3) {
                        ArtifactInspector.open(wrapper);
                    }
                });
            }
        });
    },

    _phaseScroll(intent, duration, onDone) {
        const target = intent.scrollTarget;
        if (!target || !Number.isFinite(target.pageX)) {
            onDone();
            return;
        }

        const startX = window.pageXOffset;
        const startY = window.pageYOffset;
        const destX = target.pageX - window.innerWidth / 2;
        const destY = target.pageY - window.innerHeight / 2;
        const start = performance.now();

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = this.easeInOutCubic(t);
            window.scrollTo(
                startX + (destX - startX) * eased,
                startY + (destY - startY) * eased
            );
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.notifyTransitionTick();
            }
            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                onDone();
            }
        };

        requestAnimationFrame(tick);
    },

    _phaseFx(duration, onTick, onDone) {
        document.body.style.setProperty('--depth-transition-fx', '0');
        document.body.style.setProperty('--depth-transition-blur', '0px');
        const start = performance.now();

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = Math.sin(t * Math.PI);
            const blurPx = eased * 2.5;

            document.body.style.setProperty('--depth-transition-fx', String(eased));
            document.body.style.setProperty('--depth-transition-blur', `${blurPx}px`);

            if (typeof onTick === 'function') onTick(t);

            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.notifyTransitionTick();
            }

            if (t < 1) {
                requestAnimationFrame(tick);
            } else if (typeof onDone === 'function') {
                onDone();
            }
        };

        requestAnimationFrame(tick);
    },

    _phaseReveal(onDone) {
        document.body.style.setProperty('--depth-transition-fx', '0');
        document.body.style.setProperty('--depth-transition-blur', '0px');
        requestAnimationFrame(() => {
            if (typeof onDone === 'function') onDone();
        });
    }
};
/* ==========================================================================
   03c. MACRO ↔ MESO BRIDGE — in-place reveal, then micro grid (L3 layout)
   ========================================================================== */
const MacroMesoBridge = {
    anchors: [],
    _raf: null,
    _safetyTimer: null,

    isActive() {
        return document.body.classList.contains('is-meso-in-place');
    },

    isAnimating() {
        return this._raf != null || document.body.classList.contains('is-macro-to-meso');
    },

    isZoomOutActive() {
        return document.body.classList.contains('is-meso-zoom-out');
    },

    isMacroVisualActive() {
        return DepthController.currentLevel === 1 || this.isZoomOutActive();
    },

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    },

    noteRevealEase(zoomIn, t) {
        return zoomIn ? this.easeOutQuart(t) : this.easeInOutCubic(t);
    },

    masterEase(zoomIn, t) {
        return zoomIn ? this.easeOutQuart(t) : this.easeInOutCubic(t);
    },

    setMacroMesoAtmosphere(master) {
        const m = Math.max(0, Math.min(1, master));
        document.body.style.setProperty('--macro-meso-master', String(m));
        document.body.style.setProperty(
            '--macro-meso-link-fade',
            String(Math.max(0, 1 - m * 1.15))
        );
    },

    clearMacroMesoAtmosphere() {
        document.body.style.removeProperty('--macro-meso-master');
        document.body.style.removeProperty('--macro-meso-link-fade');
        document.body.style.removeProperty('--catalog-settle-progress');
    },

    cancelAnimation() {
        if (this._safetyTimer) {
            clearTimeout(this._safetyTimer);
            this._safetyTimer = null;
        }
        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
        document.body.classList.remove('is-macro-to-meso', 'is-meso-in-place', 'is-meso-zoom-out');
        document.body.style.removeProperty('--macro-meso-block-opacity');
        this.clearMesoAnchors();
        if (typeof CatalogLayoutEngine !== 'undefined') {
            CatalogLayoutEngine.clearFromDom();
        }
        this.clearMacroMesoAtmosphere();
        if (typeof DepthController !== 'undefined' &&
            !(typeof DepthV2 !== 'undefined' && DepthV2.isActive())) {
            DepthController.syncViewLevelClass(DepthController.currentLevel);
        }
        PhysicsEngine.setTransitionFrozen(false);
    },

    getVisualMoleculeCenter(noteIndex, wrapper) {
        if (DepthController.currentLevel >= 2) {
            return this.getWrapperPageCenter(wrapper);
        }

        const dots = PhysicsEngine.bodiesData.filter(
            d => d.noteIndex === noteIndex && !d.isFiltered && !d.isFilterExiting
        );

        if (dots.length > 0) {
            let x = 0;
            let y = 0;
            dots.forEach(d => {
                const r = d.element.getBoundingClientRect();
                x += r.left + r.width / 2;
                y += r.top + r.height / 2;
            });
            return {
                pageX: x / dots.length + window.pageXOffset,
                pageY: y / dots.length + window.pageYOffset
            };
        }

        return this.getWrapperPageCenter(wrapper);
    },

    getWrapperPageCenter(wrapper) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        return {
            pageX: rect.left + window.pageXOffset + rect.width / 2,
            pageY: rect.top + window.pageYOffset + rect.height / 2
        };
    },

    captureAnchors() {
        const wrappers = document.querySelectorAll('.note-wrapper');
        const notes = [];
        let cellSize = 0;

        wrappers.forEach((wrapper, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;

            const center = this.getVisualMoleculeCenter(noteIndex, wrapper);
            if (!center) return;

            const rect = wrapper.getBoundingClientRect();
            if (rect.width > 0) cellSize = Math.max(cellSize, rect.width);

            notes.push({
                noteIndex,
                wrapper,
                pageX: center.pageX,
                pageY: center.pageY
            });
        });

        const sorted = [...notes].sort((a, b) => {
            if (Math.abs(a.pageX - b.pageX) > 12) return b.pageX - a.pageX;
            return a.pageY - b.pageY;
        });

        const rankByNote = new Map(sorted.map((n, rank) => [n.noteIndex, rank]));
        notes.forEach(n => {
            n.rank = rankByNote.get(n.noteIndex) ?? 0;
        });

        return { notes, cellSize: cellSize || scale(108) };
    },

    pageToAppLocal(pageX, pageY) {
        const app = document.getElementById('app');
        if (!app) return { x: pageX, y: pageY };
        const rect = app.getBoundingClientRect();
        return {
            x: pageX - window.pageXOffset - rect.left,
            y: pageY - window.pageYOffset - rect.top
        };
    },

    freezeDotsForTransition() {
        PhysicsEngine.bodiesData.forEach(item => {
            if (item.isFiltered || item.isFilterExiting) return;
            item.element.style.setProperty('--phys-x', '0px');
            item.element.style.setProperty('--phys-y', '0px');
        });
    },

    // Align physics bodies + cssOrigin to meso anchor before L2→L1 reveal
    reseedPhysicsFromAnchors(notes) {
        const byNote = new Map(notes.map(n => [n.noteIndex, n]));

        PhysicsEngine.bodiesData.forEach(item => {
            const anchor = byNote.get(item.noteIndex);
            if (!anchor) return;

            item.cssOriginX = anchor.pageX;
            item.cssOriginY = anchor.pageY;
            item.physicsTargetX = anchor.pageX + item.offsetX;
            item.physicsTargetY = anchor.pageY + item.offsetY;

            Matter.Body.setPosition(item.body, {
                x: item.physicsTargetX,
                y: item.physicsTargetY
            });
            Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
        });
    },

    applyAnchors(notes, cellSize) {
        const useCatalogMeso = typeof CatalogLayoutEngine !== 'undefined' &&
            !CatalogLayoutEngine.isLegacyMode() &&
            CONFIG.depth.layoutMode === 'catalog';

        if (useCatalogMeso && typeof applyMesoAnchorTokens === 'function') {
            applyMesoAnchorTokens();
        } else if (cellSize > 0) {
            document.documentElement.style.setProperty('--meso-anchor-w', `${cellSize}px`);
            document.documentElement.style.setProperty('--meso-anchor-h', `${cellSize}px`);
        }

        const mesoCell = useCatalogMeso ? getMesoRevealCellSize() : null;
        const anchorW = mesoCell?.width ?? cellSize;
        const anchorH = mesoCell?.height ?? cellSize;
        const halfW = anchorW / 2;
        const halfH = anchorH / 2;
        const pad = scale(120);
        let maxX = 0;
        let maxY = 0;

        notes.forEach(note => {
            const local = this.pageToAppLocal(note.pageX, note.pageY);
            note.localX = local.x;
            note.localY = local.y;

            note.wrapper.classList.add('is-meso-anchored');
            note.wrapper.style.left = `${local.x}px`;
            note.wrapper.style.top = `${local.y}px`;
            note.wrapper.style.setProperty('--macro-meso-reveal', '0');

            maxX = Math.max(maxX, local.x + halfW);
            maxY = Math.max(maxY, local.y + halfH);
        });

        const app = document.getElementById('app');
        if (app) {
            app.style.minHeight = `${Math.max(window.innerHeight, maxY + pad)}px`;
        }

        this.anchors = notes;
    },

    clearMesoAnchors() {
        document.querySelectorAll('.note-wrapper.is-meso-anchored').forEach(wrapper => {
            wrapper.classList.remove('is-meso-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.removeProperty('--macro-meso-reveal');
        });

        const app = document.getElementById('app');
        if (app && !CatalogLayoutEngine.isCatalogLayoutActive()) {
            app.style.minHeight = '';
        }

        document.documentElement.style.removeProperty('--meso-anchor-w');
        document.documentElement.style.removeProperty('--meso-anchor-h');
        this.anchors = [];
    },

    clearAnchors() {
        this.clearMesoAnchors();
    },

    finishZoomInToLevel2(onComplete) {
        if (typeof CatalogLayoutEngine !== 'undefined' &&
            !CatalogLayoutEngine.isLegacyMode()) {
            this.runCatalogSettle(onComplete);
            return;
        }

        const handoff = () => {
            this.clearAnchors();
            document.body.classList.remove('is-meso-in-place');
            if (typeof DepthController !== 'undefined') {
                DepthController.syncViewLevelClass(2);
            } else {
                document.body.classList.remove('view-level-1');
                document.body.classList.add('view-level-2');
            }
            if (typeof onComplete === 'function') onComplete();
        };

        requestAnimationFrame(() => requestAnimationFrame(handoff));
    },

    runCatalogSettle(onComplete) {
        CatalogState.rebuildFromWarehouse();
        const layout = CatalogState.catalogLayout;
        const duration = CONFIG.depth.catalogSettleDuration ?? 640;
        const start = performance.now();
        document.body.classList.add('is-catalog-settling');

        const targets = this.anchors.map(note => {
            const entry = layout?.entries?.get(note.noteIndex);
            return {
                note,
                fromX: note.localX,
                fromY: note.localY,
                toX: entry?.localX ?? note.localX,
                toY: entry?.localY ?? note.localY
            };
        });

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = this.easeOutCubic(t);
            document.body.style.setProperty('--catalog-settle-progress', String(eased));

            targets.forEach(({ note, fromX, fromY, toX, toY }) => {
                const x = fromX + (toX - fromX) * eased;
                const y = fromY + (toY - fromY) * eased;
                note.wrapper.style.left = `${x}px`;
                note.wrapper.style.top = `${y}px`;
                note.localX = x;
                note.localY = y;
            });

            if (t < 1) {
                this._raf = requestAnimationFrame(tick);
            } else {
                this._raf = null;
                document.body.classList.remove('is-catalog-settling');
                if (layout) {
                    CatalogLayoutEngine.applyToDom(layout);
                }
                this.clearMesoAnchors();
                document.body.classList.remove('is-meso-in-place');
                if (typeof DepthController !== 'undefined') {
                    DepthController.syncViewLevelClass(2);
                } else {
                    document.body.classList.remove('view-level-1');
                    document.body.classList.add('view-level-2');
                }
                this.clearMacroMesoAtmosphere();
                if (typeof onComplete === 'function') onComplete();
            }
        };

        this._raf = requestAnimationFrame(tick);
    },

    run(zoomIn, onComplete) {
        this.cancelAnimation();

        PhysicsEngine.setTransitionFrozen(true);

        const duration = CONFIG.depth.macroMesoRevealDuration;
        const stagger = CONFIG.depth.macroMesoStagger;
        const staggerCap = CONFIG.depth.macroMesoStaggerCap;
        const totalDuration = duration + staggerCap * stagger;

        SpatialNavigation.bypassScrollClamp(totalDuration + 150);

        const finishTransition = () => {
            if (this._safetyTimer) {
                clearTimeout(this._safetyTimer);
                this._safetyTimer = null;
            }
            document.body.classList.remove('is-macro-to-meso', 'is-meso-zoom-out');
            document.body.style.removeProperty('--macro-meso-block-opacity');
            this.clearMacroMesoAtmosphere();
            this._raf = null;
            PhysicsEngine.setTransitionFrozen(false);
            if (typeof onComplete === 'function') onComplete();
        };

        this._safetyTimer = setTimeout(() => {
            if (!this._raf && !document.body.classList.contains('is-macro-to-meso')) return;
            this.cancelAnimation();
            finishTransition();
        }, totalDuration + 600);

        if (zoomIn) {
            this.freezeDotsForTransition();

            const useCatalogMeso = typeof CatalogLayoutEngine !== 'undefined' &&
                !CatalogLayoutEngine.isLegacyMode() &&
                CONFIG.depth.layoutMode === 'catalog';

            if (useCatalogMeso) {
                if (typeof CatalogState !== 'undefined') {
                    CatalogState.rebuildFromWarehouse();
                }
                document.body.classList.add('is-catalog-layout');
                if (typeof applyCatalogCellTokens === 'function') {
                    applyCatalogCellTokens();
                }
                if (typeof applyMesoAnchorTokens === 'function') {
                    applyMesoAnchorTokens();
                }
                const app = document.getElementById('app');
                if (app) {
                    app.style.display = 'block';
                    app.style.position = 'relative';
                }
            }

            const { notes, cellSize } = this.captureAnchors();
            document.body.classList.add('is-macro-to-meso', 'is-meso-in-place');
            document.body.style.setProperty(
                '--macro-meso-block-opacity',
                String(CONFIG.depth.macroMesoBlockOpacity)
            );
            this.applyAnchors(notes, cellSize);
            this.setMacroMesoAtmosphere(0);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const start = performance.now();
                    const tick = (now) => {
                        const elapsed = now - start;
                        const master = Math.min(1, elapsed / totalDuration);
                        this.setMacroMesoAtmosphere(this.masterEase(true, master));

                        this.anchors.forEach(note => {
                            const localStart = Math.min(note.rank, staggerCap) * stagger;
                            const t = Math.min(1, Math.max(0, (elapsed - localStart) / duration));
                            const eased = this.noteRevealEase(true, t);
                            note.wrapper.style.setProperty('--macro-meso-reveal', String(eased));
                        });

                        if (typeof NavigationMap !== 'undefined') {
                            NavigationMap.notifyTransitionTick();
                        }

                        if (elapsed < totalDuration) {
                            this._raf = requestAnimationFrame(tick);
                        } else {
                            this.anchors.forEach(note => {
                                note.wrapper.style.setProperty('--macro-meso-reveal', '1');
                            });
                            this.finishZoomInToLevel2(finishTransition);
                        }
                    };
                    this._raf = requestAnimationFrame(tick);
                });
            });
        } else {
            const { notes, cellSize } = this.captureAnchors();
            this.reseedPhysicsFromAnchors(notes);
            PhysicsEngine.syncDotTransforms();

            document.body.classList.add('is-macro-to-meso', 'is-meso-in-place', 'is-meso-zoom-out');
            this.applyAnchors(notes, cellSize);

            document.body.style.setProperty(
                '--macro-meso-block-opacity',
                String(CONFIG.depth.macroMesoBlockOpacity)
            );
            this.anchors.forEach(note => {
                note.wrapper.style.setProperty('--macro-meso-reveal', '1');
            });
            this.setMacroMesoAtmosphere(1);

            requestAnimationFrame(() => {
                const start = performance.now();
                const tick = (now) => {
                    const elapsed = now - start;
                    const master = Math.min(1, elapsed / totalDuration);
                    this.setMacroMesoAtmosphere(1 - this.masterEase(false, master));

                    this.anchors.forEach(note => {
                        const localStart = Math.min(note.rank, staggerCap) * stagger;
                        const t = Math.min(1, Math.max(0, (elapsed - localStart) / duration));
                        const eased = this.noteRevealEase(false, t);
                        note.wrapper.style.setProperty('--macro-meso-reveal', String(1 - eased));
                    });

                    if (typeof NavigationMap !== 'undefined') {
                        NavigationMap.notifyTransitionTick();
                    }

                    if (elapsed < totalDuration) {
                        this._raf = requestAnimationFrame(tick);
                    } else {
                        this._raf = null;
                        document.body.classList.add('is-macro-grid-settle');
                        document.body.classList.remove('is-meso-in-place', 'is-meso-zoom-out');
                        if (typeof DepthController !== 'undefined') {
                            DepthController.syncViewLevelClass(1);
                        } else {
                            document.body.classList.remove('view-level-2');
                            document.body.classList.add('view-level-1');
                        }
                        this.clearAnchors();
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                DepthController.currentLevel = 1;
                                if (typeof CatalogLayoutEngine !== 'undefined') {
                                    CatalogLayoutEngine.clearFromDom();
                                }
                                PhysicsEngine.buildWorld();
                                PhysicsEngine.syncDotTransforms();
                                PhysicsEngine.flushMacroCanvas();
                                ActionWarehouse.refreshWorkspaceGrid();
                                document.body.classList.remove('is-macro-grid-settle');
                                finishTransition();
                            });
                        });
                    }
                };
                this._raf = requestAnimationFrame(tick);
            });
        }
    }
};

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

    hasActiveLens() {
        if (typeof ActionWarehouse === 'undefined') return false;
        const { tags, authors, typologies } = ActionWarehouse.getActiveFocusCriteria();
        const filter = ActionWarehouse.getFilterCriteria();
        return tags.size > 0 || authors.size > 0 || typologies.size > 0 ||
            filter.tags.size > 0 || filter.authors.size > 0 || filter.typologies.size > 0;
    },

    getLayoutRanks() {
        if (typeof CatalogState === 'undefined') return null;
        if (CatalogState.baselineMacroRank?.size) return CatalogState.baselineMacroRank;
        return CatalogState.macroRank;
    },

    captureAndStoreSnapshot() {
        const snapshot = this.captureRankSnapshot();
        if (typeof CatalogState !== 'undefined') {
            if (!CatalogState.baselineMacroRank?.size) {
                CatalogState.baselineMacroRank = new Map(snapshot.rankByNote);
            }
            if (!this.hasActiveLens()) {
                CatalogState.baselineMacroRank = new Map(snapshot.rankByNote);
            }
            CatalogState.macroRank = this.getLayoutRanks() || snapshot.rankByNote;
            CatalogState.visibleOrder = snapshot.visibleOrder;
            CatalogState.lastMesoAnchors = snapshot.lastMesoAnchors;
        }
        return snapshot;
    },

    sortWrappersByRank(wrappers, rankByNote) {
        const ranks = rankByNote || this.getLayoutRanks() || CatalogState?.macroRank;
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
/* ==========================================================================
   FOCUS LINKS — block ↔ note lines (L1 macro capture, L2 depth focus)
   ========================================================================== */
const DepthFocusLinks = {
    getLinkColor() {
        return PhysicsEngine.linkColor ||
            getComputedStyle(document.documentElement)
                .getPropertyValue('--main-text').trim() || '#101010';
    },

    /* --- L1 macro --- */

    shouldDrawMacro() {
        const cfg = CONFIG.warehouse?.linkage?.blockNote;
        if (cfg?.visible === false) return false;
        if (DepthController.currentLevel !== 1) return false;
        if (!document.body.classList.contains('is-block-focus')) return false;
        if (typeof ActionWarehouse === 'undefined') return false;
        return ActionWarehouse.getActiveCaptureBlocks().length > 0;
    },

    getMacroLineConfig() {
        const cfg = CONFIG.warehouse?.linkage?.blockNote || {};
        const macroLine = CONFIG.warehouse?.linkage?.line || {};
        return {
            width: cfg.width ?? macroLine.width ?? 0.27,
            opacity: cfg.opacity ?? 0.48,
            maxDistance: cfg.maxVisibleDistance ?? scale(1800)
        };
    },

    pickMacroAnchorDot(block, dots) {
        const matching = dots.filter(d => ActionWarehouse.dotMatchesBlock(block, d));
        if (!matching.length) return null;

        const captured = matching.find(d => d.overrideTarget);
        if (captured) return captured;

        let best = null;
        let bestDist = Infinity;
        matching.forEach(dot => {
            const dist = Math.hypot(
                dot.body.position.x - block.bodyX,
                dot.body.position.y - block.bodyY
            );
            if (dist < bestDist) {
                bestDist = dist;
                best = dot;
            }
        });
        return best;
    },

    drawMacro(ctx, bodiesData) {
        if (!ctx || !this.shouldDrawMacro() || !bodiesData?.length) return;

        const blocks = ActionWarehouse.getActiveCaptureBlocks();
        if (!blocks.length) return;

        const noteDots = new Map();
        bodiesData.forEach(dot => {
            if (dot.isFiltered || dot.isFilterExiting) return;
            if (!noteDots.has(dot.noteIndex)) noteDots.set(dot.noteIndex, []);
            noteDots.get(dot.noteIndex).push(dot);
        });
        if (!noteDots.size) return;

        const { width, opacity, maxDistance } = this.getMacroLineConfig();
        const maxDistSq = maxDistance * maxDistance;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const stretched = ActionWarehouse.stretchedNotes;

        ctx.save();
        ctx.strokeStyle = this.getLinkColor();
        ctx.lineWidth = width;
        ctx.globalAlpha = opacity;
        ctx.beginPath();

        blocks.forEach(block => {
            if (!Number.isFinite(block.bodyX) || !Number.isFinite(block.bodyY)) return;

            const bx = block.bodyX - scrollX;
            const by = block.bodyY - scrollY;

            noteDots.forEach((dots, noteIndex) => {
                if (ActionWarehouse.isNoteFiltered(noteIndex)) return;

                const anchor = this.pickMacroAnchorDot(block, dots);
                if (!anchor?.body) return;

                const tx = anchor.body.position.x - scrollX;
                const ty = anchor.body.position.y - scrollY;
                const relax = stretched.has(noteIndex) || !!anchor.overrideTarget;
                const dx = tx - bx;
                const dy = ty - by;
                if (!relax && dx * dx + dy * dy > maxDistSq) return;

                ctx.moveTo(bx, by);
                ctx.lineTo(tx, ty);
            });
        });

        ctx.stroke();
        ctx.restore();
    },

    /* --- L2 depth --- */

    shouldDraw() {
        return false;
    },

    getLineConfig() {
        const cfg = CONFIG.depth?.v2?.focusLinks || {};
        const macroLine = CONFIG.warehouse?.linkage?.line || {};
        return {
            width: cfg.width ?? macroLine.width ?? 0.27,
            opacity: cfg.opacity ?? 0.48,
            maxDistance: cfg.maxVisibleDistance ?? macroLine.maxVisibleDistance ?? scale(900)
        };
    },

    getLinkSources() {
        if (typeof ActionWarehouse === 'undefined') return [];

        return ActionWarehouse.blocks.filter(block => {
            if (block.state !== 'active') return false;
            if (block.type !== 'tag' && block.type !== 'author' && block.type !== 'typology') return false;
            if (block.nestedIn?.frameKind === 'filter') return false;
            if (!ActionWarehouse.isBlockFocusEligible(block)) return false;

            if (block.nestedIn) {
                if (!ActionWarehouse.isBlockFocusEligible(block.nestedIn)) return false;
                return !!block.nestedIn.element?.classList.contains('is-depth-ui-mounted');
            }

            return block.element?.classList.contains('is-depth-ui-mounted');
        });
    },

    getVisibleNoteWrappers() {
        const app = document.getElementById('app');
        if (!app) return [];

        if (app.classList.contains('is-meso-hive-layout')) {
            return [...app.querySelectorAll('.note-wrapper.is-meso-hive-anchored')];
        }

        if (app.classList.contains('is-meso-column-layout')) {
            return [...app.querySelectorAll(
                '#app.is-meso-column-layout .note-wrapper:not(.is-layout-excluded):not(.is-molecule-filtered-out)'
            )];
        }

        return [];
    },

    noteMatchesBlock(wrapper, block) {
        const noteIndex = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.getNoteIndex(wrapper)
            : -1;
        if (noteIndex < 0) return false;

        const authorCode = wrapper.dataset.authorCode || '';
        if (block.type === 'author') {
            return !!block.author && authorCode === block.author;
        }

        if (block.type === 'typology' && block.typology) {
            const noteTypology = wrapper.dataset.typology ||
                ActionWarehouse.getNoteTypology(noteIndex, wrapper);
            return noteTypology === block.typology;
        }

        if (block.type === 'tag' && block.tag) {
            const { tags } = ActionWarehouse.getNoteFocusTagsAndAuthor(noteIndex, wrapper);
            return tags.includes(block.tag);
        }

        return false;
    },

    getBlockAnchor(block) {
        const el = block.element;
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;

        return {
            x: rect.left + rect.width / 2,
            y: rect.bottom
        };
    },

    getNoteAnchor(wrapper) {
        const target = wrapper.querySelector('.depth-v2-glyph--meso') || wrapper;
        const rect = target.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;

        return {
            x: rect.left + rect.width / 2,
            y: rect.top + Math.min(rect.height * 0.28, scale(18))
        };
    },

    draw(ctx) {
        if (!ctx || !this.shouldDraw()) return;

        const sources = this.getLinkSources();
        const notes = this.getVisibleNoteWrappers();
        if (!sources.length || !notes.length) return;

        const { width, opacity, maxDistance } = this.getLineConfig();
        const maxDistSq = maxDistance * maxDistance;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        ctx.save();
        ctx.strokeStyle = this.getLinkColor();
        ctx.lineWidth = width;
        ctx.globalAlpha = opacity;
        ctx.beginPath();

        sources.forEach(block => {
            const from = this.getBlockAnchor(block);
            if (!from) return;

            const fx = from.x - scrollX;
            const fy = from.y - scrollY;

            notes.forEach(wrapper => {
                if (!this.noteMatchesBlock(wrapper, block)) return;

                const to = this.getNoteAnchor(wrapper);
                if (!to) return;

                const tx = to.x - scrollX;
                const ty = to.y - scrollY;
                const dx = tx - fx;
                const dy = ty - fy;
                if (dx * dx + dy * dy > maxDistSq) return;

                ctx.moveTo(fx, fy);
                ctx.lineTo(tx, ty);
            });
        });

        ctx.stroke();
        ctx.restore();
    }
};
/* ==========================================================================
   04. DEPTH CONTROLLER (STATE MACHINE - Z AXIS)
   ========================================================================== */
const DepthController = {
    currentLevel: CONFIG.depth.initialLevel,
    minLevel: CONFIG.depth.minLevel,
    maxLevel: CONFIG.depth.maxLevel,
    lastScrollTime: 0,
    cooldownDelay: CONFIG.depth.cooldownDelay,
    _wheelLockUntil: 0,
    _levelChangeActive: false,
    _microRevealRaf: null,
    _microTransitionFrom: null,
    _microTransitionTo: null,

    isMicroTransitionActive() {
        return document.body.classList.contains('is-meso-to-micro');
    },

    isMacroMesoTransitionActive() {
        return document.body.classList.contains('is-macro-to-meso');
    },

    isAnyTransitionActive() {
        return this.isMicroTransitionActive() ||
            this.isMacroMesoTransitionActive() ||
            document.body.classList.contains('is-depth-transition') ||
            MacroMesoBridge.isAnimating() ||
            (typeof DepthTransitionOrchestrator !== 'undefined' &&
                DepthTransitionOrchestrator.isRunning());
    },

    isWheelLocked() {
        return this._levelChangeActive ||
            this.isAnyTransitionActive() ||
            Date.now() < this._wheelLockUntil;
    },

    lockWheelAfterTransition() {
        this._wheelLockUntil = Date.now() + this.cooldownDelay;
        this.lastScrollTime = Date.now();
    },

    beginLevelChange() {
        this._levelChangeActive = true;
        this.lockWheelAfterTransition();
    },

    endLevelChange() {
        this._levelChangeActive = false;
        this.lockWheelAfterTransition();
    },

    syncViewLevelClass(level = this.currentLevel) {
        [1, 2, 3].forEach(l => document.body.classList.remove(`view-level-${l}`));
        document.body.classList.add(`view-level-${level}`);
        if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.setMacroPhysicsActive) {
            PhysicsEngine.setMacroPhysicsActive(level === 1);
        }
        applySiteGridTokens(document.documentElement, level);
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.onLevelChange(level);
        }
        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            DepthV2.onLevelChange(level);
            return;
        }
        this.syncCatalogLayout(level);
    },

    syncCatalogLayout(level = this.currentLevel) {
        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) return;
        if (typeof CatalogLayoutEngine === 'undefined') return;
        if (CatalogLayoutEngine.isLegacyMode()) return;

        if (level >= 2) {
            if (typeof CatalogState !== 'undefined') {
                CatalogState.rebuildFromWarehouse();
            }
            const layout = CatalogState?.catalogLayout;
            if (layout) {
                CatalogLayoutEngine.applyToDom(layout);
            }
        } else if (
            level === 1 &&
            !this.isMacroMesoTransitionActive() &&
            !MacroMesoBridge.isAnimating()
        ) {
            CatalogLayoutEngine.clearFromDom();
        }
    },

    init() {
        document.body.classList.add(`view-level-${this.currentLevel}`);
        try {
            if (typeof DepthV2 !== 'undefined') {
                DepthV2.init();
            }
        } catch (err) {
            console.error('DepthV2.init failed:', err);
        }

        window.addEventListener('keydown', (e) => {
            const keysToBlock = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
            if (keysToBlock.includes(e.code)) e.preventDefault();
        }, { passive: false });
    },

    zoomIn() {
        const next = getDepthAdjacentLevel(this.currentLevel, 1);
        if (next === this.currentLevel || this.isWheelLocked()) return false;
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.runWheelZoom(next)) {
            return false;
        }
        return this.changeLevel(next);
    },

    zoomOut() {
        const next = getDepthAdjacentLevel(this.currentLevel, -1);
        if (next === this.currentLevel || this.isWheelLocked()) return false;
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.runWheelZoom(next)) {
            return false;
        }
        return this.changeLevel(next);
    },

    changeLevel(newLevel) {
        if (this.currentLevel === newLevel) return false;
        if (!isDepthLevelActive(newLevel)) return false;

        const prevLevel = this.currentLevel;
        const isMacroMesoTransition =
            (prevLevel === 1 && newLevel === 2) || (prevLevel === 2 && newLevel === 1);

        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            return this.changeLevelV2(newLevel);
        }

        if (this.isAnyTransitionActive()) {
            if (MacroMesoBridge.isAnimating()) {
                MacroMesoBridge.cancelAnimation();
                SpatialNavigation.resume();
            } else if (typeof DepthTransitionOrchestrator !== 'undefined' &&
                DepthTransitionOrchestrator.isRunning()) {
                return false;
            } else {
                return false;
            }
        }

        const isMicroTransition =
            (prevLevel === 2 && newLevel === 3) || (prevLevel === 3 && newLevel === 2);

        this.beginLevelChange();
        SpatialNavigation.pause();

        if (isMicroTransition) {
            this._microTransitionFrom = prevLevel;
            this._microTransitionTo = newLevel;

            document.body.classList.add('is-meso-to-micro');
            const mesoZoom = getNoteZoomMeso();
            const microZoom = CONFIG.depth.noteZoomMicro ?? 1;
            document.body.style.setProperty('--note-zoom-meso', String(mesoZoom));
            document.body.style.setProperty('--note-zoom-micro', String(microZoom));
            document.body.style.setProperty(
                '--transition-note-zoom',
                String(newLevel === 3 ? mesoZoom : microZoom)
            );
            document.body.style.setProperty('--micro-reveal', newLevel === 3 ? '0' : '1');
            if (CONFIG.depth.layoutMode === 'catalog') {
                document.body.style.setProperty(
                    '--catalog-cell-lerp',
                    String(newLevel === 3 ? getMesoCellRatio() : 1)
                );
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.runMicroReveal(newLevel === 3, () => {
                        this.currentLevel = newLevel;
                        this.syncViewLevelClass(newLevel);
                        SilhouetteEngine.onLevelEnter(newLevel);
                        ActionWarehouse.updateScrollReserve();
                        ActionWarehouse.updateDotFocusFilter();
                        this.endLevelChange();
                        SpatialNavigation.resume();
                    });
                });
            });

            AppState.centerCanvasOnLayerEnter();
        } else if (isMacroMesoTransition) {
            const zoomIn = newLevel === 2;
            const targetLevel = newLevel;

            const beginBridge = () => {
                MacroMesoBridge.run(zoomIn, () => {
                    this.currentLevel = targetLevel;
                    this.syncViewLevelClass(targetLevel);
                    SilhouetteEngine.onLevelEnter(targetLevel);
                    ActionWarehouse.updateScrollReserve();
                    ActionWarehouse.updateDotFocusFilter();
                    this.endLevelChange();

                    AppState.centerCanvasOnLayerEnter();
                    SpatialNavigation.resume();
                });
            };

            if (zoomIn) {
                const prepMeso = () => {
                    document.body.classList.add('is-silhouette-micro-measure');
                    void document.getElementById('app')?.offsetHeight;
                    return SilhouetteEngine.scheduleBuildAll()
                        .then(() => SilhouetteEngine.ensureAllBuilt());
                };
                prepMeso().then(() => {
                    document.body.classList.remove('is-silhouette-micro-measure');
                    requestAnimationFrame(() => beginBridge());
                }).catch((err) => {
                    console.error('Macro-meso prep failed:', err);
                    this.endLevelChange();
                    SpatialNavigation.resume();
                });
            } else {
                beginBridge();
            }
        } else {
            document.body.classList.remove(`view-level-${prevLevel}`);
            document.body.classList.add(`view-level-${newLevel}`);

            this.currentLevel = newLevel;

            SilhouetteEngine.onLevelEnter(newLevel);
            ActionWarehouse.updateScrollReserve();
            ActionWarehouse.updateDotFocusFilter();

            let startTimestamp = null;
            const duration = CONFIG.depth.cameraLockDuration;
            const lockCameraToCenter = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = timestamp - startTimestamp;

                AppState.centerCanvasOnLayerEnter();

                if (progress < duration) {
                    requestAnimationFrame(lockCameraToCenter);
                } else {
                    if (this.currentLevel === 1) PhysicsEngine.buildWorld();
                    SpatialNavigation.resume();
                    this.endLevelChange();
                }
            };
            requestAnimationFrame(lockCameraToCenter);
        }

        return true;
    },

    // Phase 1: silhouette ↔ text crossfade at fixed scale
    // Phase 2: scale ramp after content has swapped
    runMicroReveal(revealIn, onComplete) {
        if (this._microRevealRaf) {
            cancelAnimationFrame(this._microRevealRaf);
            this._microRevealRaf = null;
        }

        const duration = CONFIG.depth.microRevealDuration;
        const crossfadeEnd = CONFIG.depth.microCrossfadeRatio;
        const mesoZoom = getNoteZoomMeso();
        const microZoom = CONFIG.depth.noteZoomMicro ?? 1;
        const useCatalogCells = CONFIG.depth.layoutMode === 'catalog';
        const mesoCellRatio = getMesoCellRatio();
        const start = performance.now();

        const easeInOutCubic = (t) => (
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        );
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = easeInOutCubic(t);
            const reveal = revealIn ? eased : 1 - eased;

            const zoomPhase = Math.max(0, (easeOutCubic(eased) - crossfadeEnd) / (1 - crossfadeEnd));
            const zoomEased = easeInOutCubic(Math.min(1, zoomPhase));
            const zoom = revealIn
                ? mesoZoom + (microZoom - mesoZoom) * zoomEased
                : microZoom - (microZoom - mesoZoom) * zoomEased;

            const atmosphere = Math.sin(t * Math.PI) * 0.35;

            document.body.style.setProperty('--micro-reveal', String(reveal));
            if (useCatalogCells) {
                const cellLerp = revealIn
                    ? mesoCellRatio + (1 - mesoCellRatio) * zoomEased
                    : 1 - (1 - mesoCellRatio) * zoomEased;
                document.body.style.setProperty('--catalog-cell-lerp', String(cellLerp));
                document.body.style.setProperty('--transition-note-zoom', '1');
            } else {
                document.body.style.setProperty('--transition-note-zoom', String(zoom));
            }
            document.body.style.setProperty('--micro-atmosphere', String(atmosphere));

            if (t < 1) {
                this._microRevealRaf = requestAnimationFrame(tick);
            } else {
                if (typeof onComplete === 'function') onComplete();

                document.body.classList.remove('is-meso-to-micro');
                document.body.style.removeProperty('--micro-reveal');
                document.body.style.removeProperty('--transition-note-zoom');
                document.body.style.removeProperty('--micro-atmosphere');
                document.body.style.removeProperty('--catalog-cell-lerp');
                document.body.style.removeProperty('--note-zoom-meso');
                document.body.style.removeProperty('--note-zoom-micro');

                this._microRevealRaf = null;
                this._microTransitionFrom = null;
                this._microTransitionTo = null;

                SpatialNavigation.resume();
            }
        };

        this._microRevealRaf = requestAnimationFrame(tick);
    },

    /* מעבר מיידי בין שכבות — V2 בלבד (מעברים מורכבים בשלב 2) */
    changeLevelV2(newLevel) {
        const prevLevel = this.currentLevel;

        this.beginLevelChange();
        SpatialNavigation.pause();

        try {
            return this._changeLevelV2Core(newLevel, prevLevel);
        } catch (err) {
            console.error('changeLevelV2 failed:', err);
            this.endLevelChange();
            SpatialNavigation.resume();
            return false;
        }
    },

    _changeLevelV2Core(newLevel, prevLevel) {

        document.body.classList.remove(
            'is-macro-to-meso',
            'is-meso-in-place',
            'is-meso-zoom-out',
            'is-depth-transition',
            'is-catalog-settling',
            'is-macro-grid-settle'
        );

        if (newLevel === 3 && prevLevel === 1) {
            if (MacroMesoBridge.isAnimating()) {
                MacroMesoBridge.cancelAnimation();
            }
            if (typeof DepthV2 !== 'undefined') {
                DepthV2.ensureShell();
            }
            PhysicsEngine.setTransitionFrozen(true);
            if (PhysicsEngine.linkCtx) {
                PhysicsEngine.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            }
            this.currentLevel = newLevel;
            this.syncViewLevelClass(newLevel);
            ActionWarehouse.updateScrollReserve();
            ActionWarehouse.updateDotFocusFilter();
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            requestAnimationFrame(() => {
                AppState.centerCanvasOnLayerEnter();
                requestAnimationFrame(() => {
                    PhysicsEngine.setTransitionFrozen(false);
                    this.endLevelChange();
                    if (typeof SpatialNavigation !== 'undefined') {
                        SpatialNavigation.resume();
                    }
                    AppState.centerCanvasOnLayerEnter();
                });
            });
            return true;
        }

        if (newLevel === 1 && prevLevel === 3) {
            if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
                ArtifactInspector.close();
            }
            // קודם L1 ב-DOM — רק אז סנכרון פיזיקה (לא buildWorld)
            this.currentLevel = newLevel;
            this.syncViewLevelClass(newLevel);

            const app = document.getElementById('app');
            if (app) void app.offsetHeight;

            requestAnimationFrame(() => {
                PhysicsEngine.setTransitionFrozen(false);
                PhysicsEngine.syncDotTransforms();

                if (ActionWarehouse.workspaceCenters) {
                    ActionWarehouse.refreshWorkspaceGrid();
                    PhysicsEngine.syncDotTransforms();
                }

                const app = document.getElementById('app');
                if (typeof DepthV2 !== 'undefined' && app) {
                    DepthV2.restoreNoteWrapperDomOrder(app);
                    PhysicsEngine.syncDotTransforms();
                }

                ActionWarehouse.updateScrollReserve();
                ActionWarehouse.unmountDeployedBlocksFromDepthBar?.();
                ActionWarehouse.updateDotFocusFilter();
                if (typeof applyMacroShellGridPlacement === 'function') {
                    applyMacroShellGridPlacement();
                }
                if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.buildWorld) {
                    PhysicsEngine.buildWorld();
                }
                requestAnimationFrame(() => {
                    AppState.centerCanvasOnLayerEnter();
                    SpatialNavigation.resume();
                    this.endLevelChange();
                });
            });
            return true;
        }

        this.currentLevel = newLevel;
        this.syncViewLevelClass(newLevel);
        ActionWarehouse.updateScrollReserve();
        ActionWarehouse.updateDotFocusFilter();
        AppState.centerCanvasOnLayerEnter();
        SpatialNavigation.resume();
        this.endLevelChange();
        return true;
    }
};

/* ==========================================================================
   05. SPATIAL NAVIGATION (X, Y AXIS)
   ========================================================================== */
const SpatialNavigation = {
    threshold: CONFIG.navigation.edgeThreshold,
    maxSpeed: CONFIG.navigation.maxSpeed,
    mouseX: 0,
    mouseY: 0,
    isScrolling: false,
    isPaused: false,
    navSurface: null,
    spaceHeld: false,
    scrollBypassUntil: 0,
    _constraining: false,
    pan: {
        active: false,
        pointerId: null,
        lastX: 0,
        lastY: 0,
        startX: 0,
        startY: 0,
        didMove: false
    },

    init() {
        this.navSurface = document.getElementById('nav-surface');

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.updateDepthPanCursor(e.clientX, e.clientY);
            if (CONFIG.navigation.edgeScrollEnabled &&
                !this.isScrolling && !this.isPaused && !this.pan.active) {
                this.calculateAndScroll();
            }
        });

        window.addEventListener('mouseleave', () => {
            this.isScrolling = false;
        });

        window.addEventListener('keydown', (e) => {
            if (e.code !== CONFIG.navigation.spacePanKey) return;
            if (e.repeat || this.isPaused || ArtifactInspector.isActive) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            this.spaceHeld = true;
            document.body.classList.add('is-space-pan');
        }, { passive: false });

        window.addEventListener('keyup', (e) => {
            if (e.code !== CONFIG.navigation.spacePanKey) return;
            this.spaceHeld = false;
            document.body.classList.remove('is-space-pan');
        });

        this.onPanDown = (e) => this.handlePanDown(e);
        this.onPanMove = (e) => this.handlePanMove(e);
        this.onPanEnd = (e) => this.handlePanEnd(e);

        if (this.navSurface) {
            this.navSurface.addEventListener('pointerdown', this.onPanDown);
        }
        document.addEventListener('pointerdown', (e) => {
            if (this.spaceHeld) {
                this.handlePanDown(e);
                return;
            }
            if (!e.target?.closest?.('#app')) return;
            if (e.target === this.navSurface) return;
            if (!this.canStartPan(e)) return;
            this.handlePanDown(e);
        }, { capture: true });
        document.addEventListener('pointermove', this.onPanMove);
        document.addEventListener('pointerup', this.onPanEnd);
        document.addEventListener('pointercancel', this.onPanEnd);

        window.addEventListener('scroll', () => this.constrainScrollPosition(), { passive: true });

        window.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    },

    handleWheel(e) {
        if (e.ctrlKey) return;

        if (this.isPaused ||
            (typeof DepthController !== 'undefined' && DepthController.isWheelLocked())) {
            e.preventDefault();
            return;
        }

        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            e.preventDefault();
            return;
        }

        if (this.isPanBlockedTarget(e.target)) return;

        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
            return;
        }

        e.preventDefault();

        const speed = CONFIG.navigation.wheel?.speed ?? 1;
        let dx = e.deltaX * speed;
        let dy = e.deltaY * speed;

        [dx, dy] = this.clampToContent(dx, dy);

        if (dx === 0 && dy === 0) return;

        this.isScrolling = true;
        window.scrollBy(dx, dy);
        IdleRefresh.touch();
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.schedulePanUpdate();
        }
        requestAnimationFrame(() => {
            this.isScrolling = false;
        });
    },

    // Soft guard for wheel/trackpad — viewport-relative, RTL-safe
    constrainScrollPosition() {
        if (this._constraining || this.isPaused || this.pan.active || this.isScrolling) return;
        if (ActionWarehouse.dragState) return;
        if (this.shouldBypassScrollClamp()) return;

        const limits = this.getViewportClampLimits();
        if (!limits) return;

        const { rect, leftMin, leftMax, topMin, topMax } = limits;
        let dx = 0;
        let dy = 0;

        if (rect.left < leftMin) dx = rect.left - leftMin;
        else if (rect.left > leftMax) dx = rect.left - leftMax;

        if (rect.top < topMin) dy = rect.top - topMin;
        else if (rect.top > topMax) dy = rect.top - topMax;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        this._constraining = true;
        window.scrollBy(dx, dy);
        this._constraining = false;
    },

    getViewportClampLimits(forLevel = DepthController.currentLevel) {
        const app = document.getElementById('app');
        if (!app) return null;

        const rect = app.getBoundingClientRect();
        const pad = CONFIG.navigation.contentPadding;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const bottomPad = forLevel === 1
            ? ActionWarehouse.getScrollReserve()
            : pad;

        return {
            rect,
            leftMin: Math.min(pad, vw - rect.width - pad),
            leftMax: pad,
            topMin: Math.min(pad, vh - rect.height - bottomPad),
            topMax: pad
        };
    },

    pause() { this.isPaused = true; },
    resume() { this.isPaused = false; },

    bypassScrollClamp(ms = CONFIG.warehouse.workspaceGrid.rushDuration) {
        this.scrollBypassUntil = performance.now() + ms;
    },

    shouldBypassScrollClamp() {
        return performance.now() < this.scrollBypassUntil ||
            ActionWarehouse.isWorkspaceGridRush();
    },

    getAppBounds() {
        const appElement = document.getElementById('app');
        if (!appElement) return null;
        const rect = appElement.getBoundingClientRect();
        return {
            minX: rect.left + window.pageXOffset,
            maxX: rect.right + window.pageXOffset,
            minY: rect.top + window.pageYOffset,
            maxY: rect.bottom + window.pageYOffset
        };
    },

    mergeBounds(a, b) {
        if (!a) return b;
        if (!b) return a;
        return {
            minX: Math.min(a.minX, b.minX),
            maxX: Math.max(a.maxX, b.maxX),
            minY: Math.min(a.minY, b.minY),
            maxY: Math.max(a.maxY, b.maxY)
        };
    },

    isDepthCanvasLevel() {
        return typeof DepthController !== 'undefined' &&
            DepthController.currentLevel >= 2 &&
            typeof DepthV2 !== 'undefined' &&
            DepthV2.isActive();
    },

    hitTestDepthNote(clientX, clientY) {
        if (!this.isDepthCanvasLevel()) return null;

        const level = DepthController.currentLevel;
        const wrappers = document.querySelectorAll('#app .note-wrapper');
        let hit = null;
        let hitArea = Infinity;

        wrappers.forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded') ||
                wrapper.classList.contains('is-molecule-filtered-out')) {
                return;
            }

            const target = level === 2
                ? (wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                    || wrapper.querySelector('.depth-v2-glyph--meso'))
                : (wrapper.querySelector('.micro-mock__card.note-card')
                    || wrapper.querySelector('.depth-v2-glyph--micro'));
            if (!target) return;
            const rect = target.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            if (clientX < rect.left || clientX > rect.right ||
                clientY < rect.top || clientY > rect.bottom) {
                return;
            }

            const area = rect.width * rect.height;
            if (area < hitArea) {
                hit = wrapper;
                hitArea = area;
            }
        });

        return hit;
    },

    dispatchDepthNoteTap(clientX, clientY) {
        const wrapper = this.hitTestDepthNote(clientX, clientY);
        if (!wrapper) return false;

        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
            if (!NoteCensor.isNoteStudyUnlocked(wrapper)) return false;
        }

        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(clientX, clientY)) {
            return false;
        }

        if (typeof ArtifactInspector !== 'undefined') {
            if (ArtifactInspector.isActive) {
                ArtifactInspector.close();
            } else {
                ArtifactInspector.open(wrapper);
            }
            return true;
        }

        return false;
    },

    updateDepthPanCursor(clientX, clientY) {
        if (!this.navSurface || !this.isDepthCanvasLevel()) {
            if (this.navSurface) this.navSurface.style.removeProperty('cursor');
            return;
        }
        if (this.pan.active || this.spaceHeld) return;

        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
            const overWord = NoteCensor.hitWordAt(clientX, clientY);
            if (overWord) {
                this.navSurface.style.cursor = 'default';
                return;
            }
            const wrapper = this.hitTestDepthNote(clientX, clientY);
            if (wrapper && NoteCensor.isNoteStudyUnlocked(wrapper)) {
                this.navSurface.style.cursor = 'pointer';
                return;
            }
            this.navSurface.style.cursor = 'grab';
            return;
        }

        const overNote = !!this.hitTestDepthNote(clientX, clientY);
        this.navSurface.style.cursor = overNote ? 'pointer' : 'grab';
    },

    isPanBlockedTarget(target) {
        if (!(target instanceof Element)) return true;
        if (ArtifactInspector.isActive) return true;
        if (ActionWarehouse.dragState) return true;
        return !!target.closest('.warehouse-shell, .action-block, .warehouse-reset, .focus-backdrop.active, .site-navigation-layers, .site-navigation-maps');
    },

    canStartPan(e) {
        if (this.isPaused || e.button !== 0) return false;
        if (this.isPanBlockedTarget(e.target)) return false;

        if (this.spaceHeld) return true;

        const target = e.target;
        if (target === this.navSurface) return true;
        if (target.id === 'app') return true;

        if (this.isDepthCanvasLevel() && target.closest?.('#app')) {
            return true;
        }

        return false;
    },

    handlePanDown(e) {
        if (this.pan.active) return;
        if (!this.canStartPan(e)) return;

        e.preventDefault();
        this.pan.active = true;
        this.pan.pointerId = e.pointerId;
        this.pan.lastX = e.clientX;
        this.pan.lastY = e.clientY;
        this.pan.startX = e.clientX;
        this.pan.startY = e.clientY;
        this.pan.didMove = false;
        this.isScrolling = false;
        document.body.classList.add('is-canvas-panning');

        const captureEl = this.navSurface || document.body;
        if (captureEl.setPointerCapture) {
            try { captureEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
    },

    handlePanMove(e) {
        if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;

        if (!this.pan.didMove) {
            const moved = Math.hypot(
                e.clientX - this.pan.startX,
                e.clientY - this.pan.startY
            );
            const threshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved >= threshold) this.pan.didMove = true;
        }

        const dx = e.clientX - this.pan.lastX;
        const dy = e.clientY - this.pan.lastY;
        this.pan.lastX = e.clientX;
        this.pan.lastY = e.clientY;

        if (Math.abs(dx) < CONFIG.navigation.pan.minDrag &&
            Math.abs(dy) < CONFIG.navigation.pan.minDrag) {
            return;
        }

        let scrollDx = -dx;
        let scrollDy = -dy;
        [scrollDx, scrollDy] = this.clampToContent(scrollDx, scrollDy);

        if (scrollDx !== 0 || scrollDy !== 0) {
            window.scrollBy(scrollDx, scrollDy);
            IdleRefresh.touch();
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.schedulePanUpdate();
            }
        }
    },

    handlePanEnd(e) {
        if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;

        const wasTap = !this.pan.didMove;
        const tapX = this.pan.startX;
        const tapY = this.pan.startY;

        this.pan.active = false;
        this.pan.pointerId = null;
        document.body.classList.remove('is-canvas-panning');

        const captureEl = this.navSurface || document.body;
        if (captureEl.releasePointerCapture) {
            try { captureEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }

        if (wasTap && DepthController.currentLevel === 1 &&
            typeof ArtifactInspector !== 'undefined' &&
            ArtifactInspector.openMacroNoteAt(tapX, tapY)) {
            this.updateDepthPanCursor(e.clientX, e.clientY);
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.schedulePanUpdate();
            }
            return;
        }

        if (wasTap && this.isDepthCanvasLevel()) {
            this.dispatchDepthNoteTap(tapX, tapY);
        }

        this.updateDepthPanCursor(e.clientX, e.clientY);

        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.schedulePanUpdate();
        }
    },

    calculateAndScroll() {
        if (!CONFIG.navigation.edgeScrollEnabled) return;
        if (this.isPaused) return;
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(this.mouseX, this.mouseY)) {
            this.isScrolling = false;
            return;
        }

        let dx = 0;
        let dy = 0;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const threshold = this.threshold;
        const bottomThreshold = CONFIG.navigation.bottomEdgeThreshold;

        if (this.mouseX < threshold) {
            dx = -this.maxSpeed * (1 - this.mouseX / threshold);
        } else if (this.mouseX > width - threshold) {
            dx = this.maxSpeed * (1 - (width - this.mouseX) / threshold);
        }

        const bottomSpeed = CONFIG.navigation.bottomMaxSpeed;

        if (this.mouseY < threshold) {
            dy = -this.maxSpeed * (1 - this.mouseY / threshold);
        } else if (this.mouseY > height - bottomThreshold) {
            // Narrow, slow bottom zone; fully suppressed while hovering the warehouse
            if (!ActionWarehouse.isPointOverDock(this.mouseX, this.mouseY)) {
                dy = bottomSpeed * (1 - (height - this.mouseY) / bottomThreshold);
            }
        }

        [dx, dy] = this.clampToContent(dx, dy);

        if (dx !== 0 || dy !== 0) {
            this.isScrolling = true;
            window.scrollBy(dx, dy);
            IdleRefresh.touch();
            requestAnimationFrame(() => this.calculateAndScroll());
        } else {
            this.isScrolling = false;
        }
    },

    // Clamp pan / edge-scroll — viewport-relative (works with dir=rtl)
    clampToContent(dx, dy) {
        const limits = this.getViewportClampLimits();
        if (!limits) return [dx, dy];

        const { rect, leftMin, leftMax, topMin, topMax } = limits;

        if (dx > 0) {
            const maxDx = rect.left - leftMin;
            dx = maxDx > 0 ? Math.min(dx, maxDx) : 0;
        } else if (dx < 0) {
            dx = Math.max(dx, rect.left - leftMax);
        }

        if (dy > 0) {
            const maxDy = rect.top - topMin;
            dy = maxDy > 0 ? Math.min(dy, maxDy) : 0;
        } else if (dy < 0) {
            dy = Math.max(dy, rect.top - topMax);
        }

        return [dx, dy];
    },

    getBottomChromeTop(forLevel = DepthController.currentLevel) {
        let chromeTop = window.innerHeight;
        const selectors = ['.warehouse-shell', '.site-navigation-maps'];
        if (forLevel >= 2) {
            selectors.push('.depth-block-bar.has-blocks', '.warehouse-shell.is-depth-drop-active');
        }

        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) return;
                chromeTop = Math.min(chromeTop, rect.top);
            });
        });

        return chromeTop;
    },

    // Catalog viewport — padded content area; height includes bottom UI strip (warehouse + minimap).
    getCatalogViewportPageRect(forLevel = DepthController.currentLevel) {
        const pad = CONFIG.navigation.contentPadding;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        void forLevel;

        return {
            left: scrollX + pad,
            top: scrollY + pad,
            width: Math.max(0, window.innerWidth - 2 * pad),
            height: Math.max(0, window.innerHeight - pad)
        };
    },

    getViewportPageRect(forLevel = DepthController.currentLevel) {
        return this.getCatalogViewportPageRect(forLevel);
    },

    // Minimap viewport — L1 matches visible canvas band above warehouse; L2/L3 use raw browser viewport.
    getNavigationMapViewportPageRect(forLevel = DepthController.currentLevel) {
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        if (forLevel === 1 && typeof getSiteL1VisibleViewportHeightPx === 'function') {
            return {
                left: scrollX,
                top: scrollY,
                width: window.innerWidth,
                height: Math.round(getSiteL1VisibleViewportHeightPx())
            };
        }

        return {
            left: scrollX,
            top: scrollY,
            width: window.innerWidth,
            height: window.innerHeight
        };
    },

    // Page-rect span of the catalog viewport at scroll extremes; keeps minimap pan aligned with scroll clamp.
    getScrollAlignedMapBounds(forLevel = DepthController.currentLevel) {
        const vp = this.getNavigationMapViewportPageRect(forLevel);
        const vpW = vp.width;
        const vpH = vp.height;
        const viewportOffsetX = vp.left - window.pageXOffset;
        const viewportOffsetY = vp.top - window.pageYOffset;
        const limits = this.getViewportClampLimits(forLevel);

        if (!limits) {
            return {
                minX: vp.left,
                maxX: vp.left + vp.width,
                minY: vp.top,
                maxY: vp.top + vp.height
            };
        }

        const { rect, leftMin, leftMax, topMin, topMax } = limits;
        const appPageLeft = rect.left + window.pageXOffset;
        const appPageTop = rect.top + window.pageYOffset;

        const scrollXAtLeft = appPageLeft - leftMax;
        const scrollXAtRight = appPageLeft - leftMin;
        const scrollYAtTop = appPageTop - topMax;
        const scrollYAtBottom = appPageTop - topMin;

        const docEl = document.documentElement;
        const bodyEl = document.body;
        const maxScrollY = Math.max(
            0,
            Math.max(docEl?.scrollHeight || 0, bodyEl?.scrollHeight || 0) - window.innerHeight
        );

        const achievableScrollYTop = Math.max(0, scrollYAtTop);
        const achievableScrollYBottom = Math.min(Math.max(0, scrollYAtBottom), maxScrollY);
        const achievableScrollXLeft = scrollXAtLeft;
        const achievableScrollXRight = Math.max(achievableScrollXLeft, scrollXAtRight);

        return {
            minX: achievableScrollXLeft + viewportOffsetX,
            maxX: achievableScrollXRight + viewportOffsetX + vpW,
            minY: achievableScrollYTop + viewportOffsetY,
            maxY: achievableScrollYBottom + viewportOffsetY + vpH
        };
    },

    getMacroContentBounds() {
        const appBounds = this.getAppBounds();
        if (!appBounds) return null;

        if (typeof PhysicsEngine === 'undefined' || !PhysicsEngine.bodiesData?.length) {
            return appBounds;
        }

        const orbitCfg = CONFIG.warehouse.orbit;
        const bodiesData = PhysicsEngine.bodiesData;
        const groups = new Map();

        bodiesData.forEach(item => {
            if (item.isFiltered) return;
            if (!groups.has(item.noteIndex)) {
                groups.set(item.noteIndex, []);
            }
            groups.get(item.noteIndex).push(item);
        });

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        groups.forEach((dots) => {
            const radius = ActionWarehouse.noteMoleculeExtent(bodiesData, dots[0].noteIndex, orbitCfg, dots.length);
            let cx = 0;
            let cy = 0;
            let count = 0;
            dots.forEach(item => {
                if (!item.body) return;
                cx += item.body.position.x;
                cy += item.body.position.y;
                count++;
            });
            if (!count) return;
            cx /= count;
            cy /= count;
            minX = Math.min(minX, cx - radius);
            maxX = Math.max(maxX, cx + radius);
            minY = Math.min(minY, cy - radius);
            maxY = Math.max(maxY, cy + radius);
        });

        ActionWarehouse.blocks.forEach(block => {
            if (block.state !== 'active') return;
            const r = ActionWarehouse.getBlockCollisionRadius(block);
            minX = Math.min(minX, block.bodyX - r);
            maxX = Math.max(maxX, block.bodyX + r);
            minY = Math.min(minY, block.bodyY - r);
            maxY = Math.max(maxY, block.bodyY + r);
        });

        if (!Number.isFinite(minX)) return appBounds;
        return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
    },

    getDepthNoteContentBounds() {
        const appBounds = this.getAppBounds();
        if (!appBounds) return null;

        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let count = 0;

        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded')) return;
            if (wrapper.classList.contains('is-molecule-filtered-out')) return;
            const rect = wrapper.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            minX = Math.min(minX, rect.left + scrollX);
            maxX = Math.max(maxX, rect.right + scrollX);
            minY = Math.min(minY, rect.top + scrollY);
            maxY = Math.max(maxY, rect.bottom + scrollY);
            count++;
        });

        if (typeof ActionWarehouse !== 'undefined') {
            ActionWarehouse.blocks.forEach((block) => {
                if (block.state !== 'active' || block.type === 'frame' || !block.element) return;
                const rect = block.element.getBoundingClientRect();
                if (rect.width < 0.5 && rect.height < 0.5) return;
                const pad = scale(20);
                const cx = rect.left + rect.width / 2 + scrollX;
                const cy = rect.top + rect.height / 2 + scrollY;
                minX = Math.min(minX, cx - pad);
                maxX = Math.max(maxX, cx + pad);
                minY = Math.min(minY, cy - pad);
                maxY = Math.max(maxY, cy + pad);
                count++;
            });
        }

        if (!count || !Number.isFinite(minX)) return appBounds;
        return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
    },

    // Shared minimap coordinate frame — same scale/origin as L1 macro on every depth level.
    getMapReferenceBounds() {
        const macro = this.getMacroContentBounds();
        if (macro) return macro;
        const depth = this.getDepthNoteContentBounds();
        if (depth) return depth;
        return this.getAppBounds();
    },

    getCatalogLevelBounds(level) {
        const app = document.getElementById('app');
        const appBounds = this.getAppBounds();
        if (!app || !appBounds) return appBounds;

        const layout = CatalogState?.catalogLayout;
        if (layout?.bounds && layout.mode === 'catalog') {
            const rect = app.getBoundingClientRect();
            const scrollX = window.pageXOffset;
            const scrollY = window.pageYOffset;
            return {
                minX: rect.left + scrollX,
                maxX: rect.left + scrollX + layout.bounds.width,
                minY: rect.top + scrollY,
                maxY: rect.top + scrollY + layout.bounds.height
            };
        }

        return appBounds;
    },

    getContentBoundsForLevel(level) {
        if (level === 1) {
            return this.getMacroContentBounds();
        }

        if (level >= 2) {
            if (DepthController.currentLevel === level) {
                if (DepthController.currentLevel >= 2 && CatalogLayoutEngine.isCatalogLayoutActive()) {
                    return this.getCatalogLevelBounds(level);
                }
                if (MacroMesoBridge.isAnimating() && MacroMesoBridge.anchors.length > 0) {
                    const half = (parseFloat(
                        getComputedStyle(document.documentElement).getPropertyValue('--meso-anchor-size')
                    ) || scale(108)) / 2;
                    let minX = Infinity;
                    let maxX = -Infinity;
                    let minY = Infinity;
                    let maxY = -Infinity;

                    MacroMesoBridge.anchors.forEach(({ pageX, pageY }) => {
                        minX = Math.min(minX, pageX - half);
                        maxX = Math.max(maxX, pageX + half);
                        minY = Math.min(minY, pageY - half);
                        maxY = Math.max(maxY, pageY + half);
                    });

                    if (Number.isFinite(minX)) {
                        return this.mergeBounds(this.getAppBounds(), { minX, maxX, minY, maxY });
                    }
                }

                return this.getDepthNoteContentBounds();
            }
            return this.getAppBounds();
        }

        return this.getAppBounds();
    },

    getContentMarkersForLevel(level) {
        const markers = [];

        if (level === 1 && typeof PhysicsEngine !== 'undefined' && PhysicsEngine.bodiesData?.length > 0) {
            const groups = new Map();
            PhysicsEngine.bodiesData.forEach(item => {
                if (item.isFiltered) return;
                if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
                groups.get(item.noteIndex).push(item);
            });
            groups.forEach((dots) => {
                let cx = 0;
                let cy = 0;
                dots.forEach(item => {
                    cx += item.body.position.x;
                    cy += item.body.position.y;
                });
                markers.push({ x: cx / dots.length, y: cy / dots.length });
            });
            return markers;
        }

        const app = document.getElementById('app');
        if (!app) return markers;

        const appRect = app.getBoundingClientRect();
        const originX = appRect.left + window.pageXOffset;
        const originY = appRect.top + window.pageYOffset;

        const layout = CatalogState?.catalogLayout;
        if (layout?.entries && layout.mode === 'catalog' && level >= 2) {
            layout.entries.forEach((entry) => {
                if (entry.localX != null && entry.localY != null) {
                    markers.push({ x: originX + entry.localX, y: originY + entry.localY });
                }
            });
            if (markers.length > 0) return markers;
        }

        if (DepthController.currentLevel === level) {
            document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
                const rect = wrapper.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) return;
                markers.push({
                    x: rect.left + rect.width / 2 + window.pageXOffset,
                    y: rect.top + rect.height / 2 + window.pageYOffset
                });
            });
        }

        return markers;
    },

    // Live content bounding box in page coords — physics hull + full #app canvas
    getContentBounds() {
        const appBounds = this.getAppBounds();

        if (DepthController.currentLevel >= 2 && CatalogLayoutEngine.isCatalogLayoutActive()) {
            const layout = CatalogState.catalogLayout;
            const app = document.getElementById('app');
            if (layout?.bounds && app) {
                const rect = app.getBoundingClientRect();
                const scrollX = window.pageXOffset;
                const scrollY = window.pageYOffset;
                return {
                    minX: rect.left + scrollX,
                    maxX: rect.left + scrollX + layout.bounds.width,
                    minY: rect.top + scrollY,
                    maxY: rect.top + scrollY + layout.bounds.height
                };
            }
        }

        if (DepthController.currentLevel >= 2 && MacroMesoBridge.isAnimating() && MacroMesoBridge.anchors.length > 0) {
            const half = (parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--meso-anchor-size')
            ) || scale(108)) / 2;
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            MacroMesoBridge.anchors.forEach(({ pageX, pageY }) => {
                minX = Math.min(minX, pageX - half);
                maxX = Math.max(maxX, pageX + half);
                minY = Math.min(minY, pageY - half);
                maxY = Math.max(maxY, pageY + half);
            });

            if (Number.isFinite(minX)) {
                return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
            }
        }

        if (DepthController.currentLevel === 1 &&
            typeof PhysicsEngine !== 'undefined' &&
            PhysicsEngine.bodiesData?.length > 0) {
            const orbitCfg = CONFIG.warehouse.orbit;
            const bodiesData = PhysicsEngine.bodiesData;
            const groups = new Map();

            bodiesData.forEach(item => {
                if (item.isFiltered) return;
                if (!groups.has(item.noteIndex)) {
                    groups.set(item.noteIndex, []);
                }
                groups.get(item.noteIndex).push(item);
            });

            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            groups.forEach((dots) => {
                const radius = ActionWarehouse.noteMoleculeExtent(bodiesData, dots[0].noteIndex, orbitCfg, dots.length);
                let cx = 0;
                let cy = 0;
                dots.forEach(item => {
                    cx += item.body.position.x;
                    cy += item.body.position.y;
                });
                cx /= dots.length;
                cy /= dots.length;
                minX = Math.min(minX, cx - radius);
                maxX = Math.max(maxX, cx + radius);
                minY = Math.min(minY, cy - radius);
                maxY = Math.max(maxY, cy + radius);
            });

            ActionWarehouse.blocks.forEach(block => {
                if (block.state !== 'active') return;
                const r = ActionWarehouse.getBlockCollisionRadius(block);
                minX = Math.min(minX, block.bodyX - r);
                maxX = Math.max(maxX, block.bodyX + r);
                minY = Math.min(minY, block.bodyY - r);
                maxY = Math.max(maxY, block.bodyY + r);
            });

            if (!Number.isFinite(minX)) return appBounds;
            return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
        }

        return appBounds;
    }
};

/* ==========================================================================
   05b. SITE NAVIGATION — layer labels (top-right) + minimap (bottom-right)
   Two separate UI parts; see CONFIG.layerNavigation vs CONFIG.navigationMap.
   ========================================================================== */
function createLayerLabelElement(labelText) {
    const label = document.createElement('span');
    label.className = 'site-navigation-layers__label';

    const text = document.createElement('span');
    text.className = 'site-navigation-layers__label-text';
    text.textContent = labelText;
    label.appendChild(text);

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

        const viewportMarker = document.createElement('div');
        viewportMarker.className = 'site-navigation-maps__viewport-marker is-hidden';
        viewportMarker.setAttribute('aria-hidden', 'true');

        mapWrap.appendChild(canvas);
        mapWrap.appendChild(viewportMarker);
        mapsPanel.appendChild(mapWrap);

        const layerLevels = getDepthActiveLevels();
        layerLevels.forEach((level) => {
            const title = document.createElement('button');
            title.type = 'button';
            title.className = 'site-navigation-layers__title';
            title.dataset.level = String(level);
            const label = createLayerLabelElement(layerCfg?.labels?.[level] || `L${level}`);
            title.appendChild(label);
            title.addEventListener('pointerdown', (e) => e.stopPropagation());
            title.addEventListener('click', (e) => {
                e.stopPropagation();
                this.navigateToLayer(level);
            });
            layersPanel.appendChild(title);
            this.titles.set(level, title);
        });

        mapWrap.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        mapWrap.addEventListener('pointermove', (e) => this.handlePointerMove(e));

        this.layerMarker = document.createElement('span');
        this.layerMarker.className = 'site-navigation-layers__marker';
        this.layerMarker.setAttribute('aria-hidden', 'true');
        this.layerMarker.dataset.level = String(DepthController.currentLevel || 1);
        this._loadLayerMarker(layerCfg?.markerSrc || 'assets/ui/layer-nav-marker.svg');
        layersPanel.appendChild(this.layerMarker);

        document.body.appendChild(layersPanel);

        const mapMount = document.getElementById('warehouse-map-mount');
        if (mapMount) {
            mapMount.appendChild(mapsPanel);
            mapMount.removeAttribute('aria-hidden');
        } else {
            document.body.appendChild(mapsPanel);
        }
        document.body.classList.add('has-site-navigation');

        this.layersPanel = layersPanel;
        this.mapsPanel = mapsPanel;
        this.mapWrap = mapWrap;
        this.viewportMarker = viewportMarker;
        this.canvas = canvas;
        this._activeLevel = DepthController.currentLevel;

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

        this.syncActiveState(this._activeLevel);
        this.resizeCanvas();
        document.fonts?.ready?.then(() => this.syncLayerNavMetrics());
        requestAnimationFrame(() => this.syncLayerNavMetrics());
    },

    isMapReady() {
        return this._bootComplete === true;
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
                x: offsetX + (pageX - panBounds.minX) * t.scale,
                y: offsetY + (pageY - panBounds.minY) * t.scale
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
            x: t.baseOffsetX + (pageX - panBounds.minX) * t.scale,
            y: t.baseOffsetY + (pageY - panBounds.minY) * t.scale
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
        if (!this.titles?.size) return;

        let maxLabelH = 0;
        this.titles.forEach((title) => {
            const label = title.querySelector('.site-navigation-layers__label');
            if (!label) return;
            maxLabelH = Math.max(maxLabelH, label.getBoundingClientRect().height);
        });
        if (maxLabelH <= 0) return;

        const rowGapPx = this._layerNavRowGapPx();

        root.style.setProperty('--layer-nav-label-box-h', `${maxLabelH}px`);
        root.style.setProperty('--layer-nav-row-step', `${maxLabelH + rowGapPx}px`);
        const slotCount = CONFIG.layerNavigation?.slotCount ?? 2;
        root.style.setProperty('--layer-nav-stack-h', `${maxLabelH * slotCount + rowGapPx * (slotCount - 1)}px`);
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
        const inspectorActive = level === 1 &&
            typeof ArtifactInspector !== 'undefined' &&
            ArtifactInspector.isActive;
        const layersDimmed = transitionActive || inspectorActive;
        this.layersPanel?.classList.toggle('is-dimmed', layersDimmed);
        this.mapsPanel?.classList.toggle('is-inspector-dimmed', inspectorActive);

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
        if (this.isTransitionActive()) return;
        if (target === this._activeLevel) return;

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

        const drawW = contentWorldW * scale;
        const drawH = contentWorldH * scale;

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
            x: baseOffsetX + (pageX - panBounds.minX) * scale,
            y: baseOffsetY + (pageY - panBounds.minY) * scale
        });

        const vpTl = viewport
            ? { x: offsetX + (viewport.left - panBounds.minX) * scale, y: offsetY + (viewport.top - panBounds.minY) * scale }
            : null;
        const vpBr = viewport
            ? {
                x: offsetX + (viewport.left + viewport.width - panBounds.minX) * scale,
                y: offsetY + (viewport.top + viewport.height - panBounds.minY) * scale
            }
            : null;

        return {
            scale,
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
                x: offsetX + (pageX - panBounds.minX) * t.scale,
                y: offsetY + (pageY - panBounds.minY) * t.scale
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
        return CONFIG.navigationMap || {};
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
            x: (mx - t.offsetX) / t.scale + panBounds.minX,
            y: (my - t.offsetY) / t.scale + panBounds.minY
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
/* ==========================================================================
   06. ARTIFACT INSPECTOR (FOCUS/ISOLATION)
   ========================================================================== */
const ArtifactInspector = {
    isActive: false,
    activeElement: null,
    backdrop: null,
    panel: null,
    flyer: null,
    mode: null, // 'popup'
    _openAnimTimer: null,
    _openSyntheticCard: false,
    _forceReadableOpen: false,

    init() {
        this.backdrop = document.createElement('div');
        this.backdrop.classList.add('focus-backdrop');
        this.backdrop.addEventListener('click', () => this.close());
        document.body.appendChild(this.backdrop);

        this.panel = document.createElement('div');
        this.panel.classList.add('artifact-inspector-panel');
        this.panel.dataset.siteLayer = 'inspector';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-hidden', 'true');
        this.panel.addEventListener('click', (e) => e.stopPropagation());
        this.panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        document.body.appendChild(this.panel);

        this.flyer = document.createElement('div');
        this.flyer.classList.add('artifact-inspector-flyer');
        this.flyer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.flyer);

        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this.isActive) {
                e.preventDefault();
                this.close();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
    },

    usesPopupMode() {
        return true;
    },

    isOpenableWrapper(noteWrapperNode) {
        if (!noteWrapperNode) return false;
        if (noteWrapperNode.classList.contains('is-layout-excluded') ||
            noteWrapperNode.classList.contains('is-molecule-filtered-out')) {
            return false;
        }
        return true;
    },

    open(noteWrapperNode) {
        if (this.isActive) return;
        if (!this.isOpenableWrapper(noteWrapperNode)) return;

        const studyOpen = typeof NoteCensor !== 'undefined'
            && NoteCensor.isActive()
            && NoteCensor.isNoteStudyUnlocked(noteWrapperNode);
        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive() && !studyOpen) return;

        this._forceReadableOpen = studyOpen;
        this.openPopup(noteWrapperNode);
    },

    openMacroNoteAt(clientX, clientY) {
        if (!this._isMacroLevel()) return false;
        if (typeof PhysicsEngine === 'undefined' || !PhysicsEngine.bodiesData?.length) return false;
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return false;
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.isRunning()) {
            return false;
        }
        if (typeof SpatialNavigation !== 'undefined' &&
            (SpatialNavigation.pan.active || SpatialNavigation.spaceHeld)) {
            return false;
        }
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(clientX, clientY)) {
            return false;
        }

        const noteIndex = PhysicsEngine.hitTestMolecule(clientX, clientY);
        if (noteIndex < 0) return false;

        const wrappers = document.querySelectorAll('.note-wrapper');
        const wrapper = wrappers[noteIndex];
        if (!this.isOpenableWrapper(wrapper)) return false;

        if (this.isActive) {
            this.close();
        } else {
            this.open(wrapper);
        }
        return true;
    },

    openPopup(noteWrapperNode) {
        const item = typeof MicroMock !== 'undefined'
            ? MicroMock.resolveItem(noteWrapperNode)
            : null;
        if (!item) return;

        const source = this._resolveOpenSource(noteWrapperNode, item);
        if (!source) return;

        const { card: sourceCard, firstRect: firstCard, synthetic } = source;

        this.isActive = true;
        this.mode = 'popup';
        this.activeElement = noteWrapperNode;
        this._openSyntheticCard = synthetic;
        this._openFirstCard = firstCard;
        this._openFocusVisualWidth = firstCard.width * (8 / 6);

        SpatialNavigation.pause();

        this.panel.innerHTML = this.buildFocusHTML(item);
        this.panel.setAttribute('aria-hidden', 'false');
        this.panel.dataset.noteId = String(item.id);
        this.panel.scrollTop = 0;

        this.flyer.innerHTML = this.buildFlyerShellHTML(item);
        this._mountFlyingCard(sourceCard);
        this.flyer.setAttribute('aria-hidden', 'false');
        this.flyer.classList.add('is-preparing', 'is-opening');

        noteWrapperNode.classList.add('is-inspector-source-hidden');
        this._hideAllSourceWrappers(item.id);

        this.backdrop.classList.add('active', 'is-popup', 'is-opening');
        this.panel.classList.add('is-open', 'is-opening');
        document.body.classList.add('is-artifact-inspector-open');
        this._applyFocusLandingLayout();

        this.panel.offsetHeight;
        this.flyer.offsetHeight;
        this._runFocusOpenAnimation();
    },

    _hideAllSourceWrappers(noteId) {
        const id = String(noteId);
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            if (String(wrapper.dataset.noteId) === id) {
                wrapper.classList.add('is-inspector-source-hidden');
            }
        });
    },

    _showAllSourceWrappers(noteId) {
        if (!noteId) return;
        const id = String(noteId);
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            if (String(wrapper.dataset.noteId) === id) {
                wrapper.classList.remove('is-inspector-source-hidden');
            }
        });
    },

    _getSourceFocusElements(wrapper) {
        const note = wrapper?.querySelector('.micro-mock__note');
        const card = note?.querySelector('.micro-mock__card.note-card')
            || wrapper?.querySelector('.note-stage .layer-full .note-card')
            || wrapper?.querySelector('.depth-v2-glyph--micro .note-card');
        const tags = note?.querySelector('.micro-mock__tags');
        return { note, card, tags };
    },

    _isMacroLevel() {
        return typeof DepthController !== 'undefined' && DepthController.currentLevel === 1;
    },

    _resolveOpenSource(wrapper, item) {
        const { card } = this._getSourceFocusElements(wrapper);
        const firstRect = card?.getBoundingClientRect();

        if (this._forceReadableOpen && card && firstRect && firstRect.width > 0) {
            const readableCard = this._buildSyntheticFocusCard(item, { forceReadable: true });
            if (readableCard) {
                return { card: readableCard, firstRect, synthetic: true };
            }
        }

        if (card && firstRect && firstRect.width > 0) {
            return { card, firstRect, synthetic: false };
        }

        if (!this._isMacroLevel() || typeof MicroMock === 'undefined') return null;

        const cardSize = this._measureL3CardSize(item);
        const sourceRect = this._resolveMacroSourceRect(wrapper, cardSize);
        if (!sourceRect) return null;

        const syntheticCard = this._buildSyntheticFocusCard(item);
        if (!syntheticCard) return null;

        return { card: syntheticCard, firstRect: sourceRect, synthetic: true };
    },

    _buildSyntheticFocusCard(item, options = {}) {
        const html = MicroMock.buildCardOnlyHTML(item, { focusScale: true, ...options });
        const mount = document.createElement('div');
        mount.innerHTML = html;
        return mount.firstElementChild;
    },

    _measureL3CardSize(item) {
        if (!this._cardMeasureProbe) {
            this._cardMeasureProbe = document.createElement('div');
            this._cardMeasureProbe.className = 'artifact-inspector-card-measure-probe';
            this._cardMeasureProbe.setAttribute('aria-hidden', 'true');
            document.body.appendChild(this._cardMeasureProbe);
        }

        this._cardMeasureProbe.innerHTML = MicroMock.buildCardOnlyHTML(item, { focusScale: true });
        const card = this._cardMeasureProbe.querySelector('.micro-mock__card.note-card');
        const rect = card?.getBoundingClientRect();
        const rootStyle = getComputedStyle(document.documentElement);
        const fallbackW = parseFloat(rootStyle.getPropertyValue('--site-micro-col-width')) || 0;
        const fallbackH = parseFloat(rootStyle.getPropertyValue('--site-micro-note-min-height')) || 0;

        return {
            width: rect?.width > 0 ? rect.width : fallbackW,
            height: rect?.height > 0 ? rect.height : fallbackH
        };
    },

    _resolveMacroSourceRect(wrapper, cardSize) {
        const wrappers = document.querySelectorAll('.note-wrapper');
        const noteIndex = [...wrappers].indexOf(wrapper);
        let bounds = null;

        if (noteIndex >= 0 && typeof PhysicsEngine !== 'undefined') {
            bounds = PhysicsEngine.moleculeViewportBounds(noteIndex);
        }

        if (!bounds) {
            const dots = wrapper.querySelectorAll('.layer-dot');
            dots.forEach((dot) => {
                const r = dot.getBoundingClientRect();
                if (r.width <= 0) return;
                bounds = bounds || { minX: r.left, minY: r.top, maxX: r.right, maxY: r.bottom };
                bounds.minX = Math.min(bounds.minX, r.left);
                bounds.minY = Math.min(bounds.minY, r.top);
                bounds.maxX = Math.max(bounds.maxX, r.right);
                bounds.maxY = Math.max(bounds.maxY, r.bottom);
            });
        }

        if (!bounds || cardSize.width <= 0) return null;

        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cy = (bounds.minY + bounds.maxY) * 0.5;
        const left = cx - cardSize.width * 0.5;
        const top = cy - cardSize.height * 0.5;

        return {
            left,
            top,
            width: cardSize.width,
            height: cardSize.height,
            right: left + cardSize.width,
            bottom: top + cardSize.height,
            x: left,
            y: top
        };
    },

    _mountFlyingCard(sourceCard) {
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        if (!sourceCard || !flyerScaler || !this._openFirstCard) return;
        const baseW = `${this._openFirstCard.width}px`;
        sourceCard.classList.add('micro-mock__card--focus');
        sourceCard.style.width = baseW;
        sourceCard.style.maxWidth = baseW;
        sourceCard.style.boxSizing = 'border-box';
        flyerScaler.style.width = baseW;
        flyerScaler.appendChild(sourceCard);
    },

    _measureInspectorRegionRect() {
        if (!this._inspectorRegionProbe) {
            this._inspectorRegionProbe = document.createElement('div');
            this._inspectorRegionProbe.className = 'artifact-inspector-region-probe';
            this._inspectorRegionProbe.setAttribute('aria-hidden', 'true');
            this._inspectorRegionProbe.style.cssText = [
                'position:fixed',
                'left:var(--site-layer-inspector-left)',
                'width:var(--site-layer-inspector-width)',
                'top:var(--site-layer-inspector-top)',
                'height:var(--site-layer-inspector-height)',
                'visibility:hidden',
                'pointer-events:none'
            ].join(';');
            document.body.appendChild(this._inspectorRegionProbe);
        }
        return this._inspectorRegionProbe.getBoundingClientRect();
    },

    _measureSiteGridSpanWidthPx(colSpan) {
        if (!this._siteGridSpanProbe) {
            this._siteGridSpanProbe = document.createElement('div');
            this._siteGridSpanProbe.setAttribute('aria-hidden', 'true');
            this._siteGridSpanProbe.style.cssText = [
                'position:fixed',
                'visibility:hidden',
                'pointer-events:none',
                'top:0',
                'left:0'
            ].join(';');
            document.body.appendChild(this._siteGridSpanProbe);
        }
        const gapCount = Math.max(0, colSpan - 1);
        this._siteGridSpanProbe.style.width =
            `calc(${colSpan} * var(--site-grid-cell-w) + ${gapCount} * var(--site-grid-gap))`;
        return this._siteGridSpanProbe.getBoundingClientRect().width;
    },

    _getFocusLandingRect() {
        const targetVisualW = this._openFocusVisualWidth
            || (this._openFirstCard ? this._openFirstCard.width * (8 / 6) : 0);
        if (!targetVisualW) return null;

        const inspector = this._measureInspectorRegionRect();
        const panelStyle = this.panel ? getComputedStyle(this.panel) : null;
        const top = parseFloat(panelStyle?.paddingTop)
            || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inspector-card-start-top'))
            || 0;
        const left = inspector.left + (inspector.width - targetVisualW) / 2;

        return {
            left,
            top,
            width: targetVisualW,
            centerX: left + targetVisualW / 2
        };
    },

    _getSiteGridRowStridePx() {
        const rootStyle = getComputedStyle(document.documentElement);
        const cellH = parseFloat(rootStyle.getPropertyValue('--site-grid-cell-h')) || 0;
        const gap = parseFloat(rootStyle.getPropertyValue('--site-grid-gap')) || 0;
        return cellH + gap;
    },

    _getInspectorMetadataShellRowBottomOffsetPx() {
        const cardAnchorRow = CONFIG.inspector?.cardAnchorRow ?? 2;
        const alignRow = CONFIG.inspector?.metadataAlignRow
            ?? CONFIG.siteGrid?.rows
            ?? 12;
        const rowsBelowCard = Math.max(0, alignRow - cardAnchorRow);
        const rootStyle = getComputedStyle(document.documentElement);
        const cellH = parseFloat(rootStyle.getPropertyValue('--site-grid-cell-h')) || 0;
        return rowsBelowCard * this._getSiteGridRowStridePx() + cellH;
    },

    _measureFocusBlockEndPx() {
        const panel = this.panel;
        const focus = panel?.querySelector('.artifact-inspector-focus');
        if (!panel || !focus) return 0;

        const panelStyle = getComputedStyle(panel);
        const contentTop = panel.getBoundingClientRect().top
            + (parseFloat(panelStyle.paddingTop) || 0);

        let end = focus.getBoundingClientRect().bottom - contentTop;

        focus.querySelectorAll('.micro-mock__card.note-card, .micro-mock__tags').forEach((el) => {
            end = Math.max(end, el.getBoundingClientRect().bottom - contentTop);
        });

        return end;
    },

    _syncFocusCardSlotHeight() {
        const panelSlot = this.panel?.querySelector(
            '.artifact-inspector-focus__card-slot'
        );
        const card = this.panel?.querySelector(
            '.artifact-inspector-focus__card-scaler .micro-mock__card.note-card'
        );
        if (!panelSlot || !card) return;

        const cardHeight = card.getBoundingClientRect().height;
        if (cardHeight > 0) {
            panelSlot.style.height = `${Math.ceil(cardHeight)}px`;
        }
    },

    _syncMetadataPanelGap() {
        const metadata = this.panel?.querySelector('.artifact-inspector-metadata');
        const details = metadata?.querySelector('.artifact-inspector-metadata__details');
        if (!metadata || !details || !this.panel) return;

        this._syncFocusCardSlotHeight();

        const minGap = CONFIG.inspector?.metadataMinGap ?? 60;
        const rowBottomOffset = this._getInspectorMetadataShellRowBottomOffsetPx();
        const focusEnd = this._measureFocusBlockEndPx();

        const metadataRect = metadata.getBoundingClientRect();
        const detailsRect = details.getBoundingClientRect();
        const detailsOffsetInMetadata = detailsRect.bottom - metadataRect.top;

        const metadataTopForShortAlign = rowBottomOffset - detailsOffsetInMetadata;
        const longNote = focusEnd + minGap > metadataTopForShortAlign;
        const gap = longNote
            ? minGap
            : Math.max(minGap, metadataTopForShortAlign - focusEnd);

        this.panel.style.setProperty('--inspector-metadata-gap', `${Math.round(gap)}px`);
    },

    _applyFocusLandingLayout() {
        const cardSlot = this._getFocusLandingRect();
        if (!cardSlot || !this.panel) return null;
        const inspector = this._measureInspectorRegionRect();
        const panelWidth = this._measureSiteGridSpanWidthPx(10);
        const centerX = inspector.left + inspector.width / 2;
        this.panel.style.width = `${panelWidth}px`;
        this.panel.style.left = `${centerX}px`;
        return cardSlot;
    },

    _alignFlyerToLandingSlot(flyerNote) {
        const slot = this._getFocusLandingRect();
        if (!flyerNote || !slot) return;
        flyerNote.classList.add('is-positioned');
        flyerNote.style.left = `${slot.left}px`;
        flyerNote.style.top = `${slot.top}px`;
        flyerNote.style.width = `${slot.width}px`;
    },

    _handoffFocusToPanel() {
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const flyerTags = this.flyer?.querySelector('.micro-mock__tags');
        const flyingCard = flyerScaler?.querySelector('.micro-mock__card.note-card');
        const panelFocus = this.panel?.querySelector('.artifact-inspector-focus');
        const panelNote = panelFocus?.querySelector('.artifact-inspector-focus__note');
        const panelScaler = panelFocus?.querySelector('.artifact-inspector-focus__card-scaler');

        if (!flyingCard || !panelScaler || !panelFocus || !this._openFirstCard) {
            if (this.flyer) {
                this.flyer.innerHTML = '';
                this.flyer.classList.remove('is-preparing', 'is-opening', 'is-landed');
                this.flyer.setAttribute('aria-hidden', 'true');
            }
            return;
        }

        const focusScale = 8 / 6;
        const baseW = `${this._openFirstCard.width}px`;
        const panelSlot = panelFocus.querySelector('.artifact-inspector-focus__card-slot');

        flyingCard.style.width = baseW;
        flyingCard.style.maxWidth = baseW;
        flyingCard.style.boxSizing = 'border-box';

        panelScaler.style.width = baseW;
        panelScaler.style.transformOrigin = 'top center';
        panelScaler.style.transform = `scale(${focusScale})`;
        panelScaler.style.removeProperty('transition');

        if (panelSlot) {
            panelSlot.style.height = `${this._openFirstCard.height * focusScale}px`;
        }

        panelScaler.appendChild(flyingCard);
        if (flyerTags && panelNote) panelNote.appendChild(flyerTags);

        if (this.flyer) {
            this.flyer.innerHTML = '';
            this.flyer.classList.remove('is-preparing', 'is-opening', 'is-landed');
            this.flyer.setAttribute('aria-hidden', 'true');
        }
    },

    _runFocusOpenAnimation() {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            this._finishFocusOpenAnimation(true);
            return;
        }

        const firstCard = this._openFirstCard;
        const flyerNote = this.flyer?.querySelector('.artifact-inspector-flyer__note');
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');

        if (!firstCard || !flyerNote || !flyerScaler) {
            this._finishFocusOpenAnimation(true);
            return;
        }

        const focusScale = 8 / 6;
        this._alignFlyerToLandingSlot(flyerNote);

        flyerScaler.style.transform = 'none';
        flyerScaler.style.transition = 'none';
        flyerScaler.style.transformOrigin = 'top center';
        flyerScaler.offsetHeight;

        const layoutRect = flyerScaler.getBoundingClientRect();
        if (layoutRect.width <= 0) {
            this._finishFocusOpenAnimation(true);
            return;
        }

        const invertScale = firstCard.width / layoutRect.width;
        const dx = firstCard.left - layoutRect.left;
        const dy = firstCard.top - layoutRect.top;

        flyerScaler.style.transform = `translate(${dx}px, ${dy}px) scale(${invertScale})`;
        flyerScaler.offsetHeight;
        this.flyer?.classList.remove('is-preparing');

        const duration = `${CONFIG.inspector?.openDuration ?? 0.48}s`;
        const easing = 'cubic-bezier(0.25, 1, 0.5, 1)';
        const onTransitionEnd = (event) => {
            if (event.target !== flyerScaler || event.propertyName !== 'transform') return;
            flyerScaler.removeEventListener('transitionend', onTransitionEnd);
            this._finishFocusOpenAnimation(false);
        };
        flyerScaler.addEventListener('transitionend', onTransitionEnd);

        clearTimeout(this._openAnimTimer);
        const ms = Math.round((CONFIG.inspector?.openDuration ?? 0.48) * 1000) + 120;
        this._openAnimTimer = setTimeout(() => {
            flyerScaler.removeEventListener('transitionend', onTransitionEnd);
            this._finishFocusOpenAnimation(false);
        }, ms);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                flyerScaler.style.transition = `transform ${duration} ${easing}`;
                flyerScaler.style.transform = `translate(0px, 0px) scale(${focusScale})`;
            });
        });
    },

    _finishFocusOpenAnimation(skipMotion) {
        clearTimeout(this._openAnimTimer);
        this._openAnimTimer = null;

        const flyerNote = this.flyer?.querySelector('.artifact-inspector-flyer__note');
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const focusScale = 8 / 6;

        this._applyFocusLandingLayout();
        this._alignFlyerToLandingSlot(flyerNote);

        if (flyerScaler) {
            flyerScaler.style.transition = 'none';
            flyerScaler.style.transformOrigin = 'top center';
            flyerScaler.style.transform = `translate(0px, 0px) scale(${focusScale})`;
            if (!skipMotion) flyerScaler.offsetHeight;
        }

        this._handoffFocusToPanel();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._syncFocusCardSlotHeight();
                this._syncMetadataPanelGap();
            });
        });

        this.panel?.classList.remove('is-opening');
        this.backdrop?.classList.remove('is-opening');
    },

    buildFlyerShellHTML(item) {
        const tagsHtml = typeof MicroMock !== 'undefined'
            ? MicroMock.buildTagsRowHTML(item)
            : '';
        return `
            <div class="artifact-inspector-flyer__note micro-mock__note artifact-inspector-focus__note">
                <div class="artifact-inspector-focus__card-slot">
                    <div class="artifact-inspector-focus__card-scaler"></div>
                </div>
                ${tagsHtml}
            </div>
        `;
    },

    buildFocusHTML(item) {
        const metaHtml = this.buildMetadataHTML(item);
        const relatedHtml = this.buildRelatedNotesHTML(item);
        return `
            <div class="artifact-inspector-focus">
                <div class="micro-mock__note artifact-inspector-focus__note">
                    <div class="artifact-inspector-focus__card-slot">
                        <div class="artifact-inspector-focus__card-scaler"></div>
                    </div>
                </div>
            </div>
            ${metaHtml}
            ${relatedHtml}
        `;
    },

    buildMetadataHTML(item) {
        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive()) {
            const idRedact = NoteCensor.buildRedactBlock(String(item.id || ''), `${item.id}:meta-id`, 'note-redact--meta-title', {
                maxLines: 1,
                minWidth: 0.2,
                maxWidth: 0.45
            });
            return `
            <section class="artifact-inspector-metadata">
                <div class="artifact-inspector-metadata__scroll-glyphs" aria-hidden="true">
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                </div>
                <h2 class="artifact-inspector-metadata__id general-h">${idRedact}</h2>
                <div class="artifact-inspector-metadata__grid">
                    <dl class="artifact-inspector-metadata__details general-t">
                        <div><dt>מחבר</dt><dd>${NoteCensor.buildMetadataValueHTML('author', item)}</dd></div>
                        <div><dt>תאריך כתיבה</dt><dd>${NoteCensor.buildMetadataValueHTML('date', item)}</dd></div>
                        <div><dt>מספר סידורי</dt><dd>${NoteCensor.buildMetadataValueHTML('serial', item)}</dd></div>
                        <div><dt>מבנה טיפולוגי</dt><dd>${NoteCensor.buildMetadataValueHTML('typology', item)}</dd></div>
                    </dl>
                </div>
            </section>
        `;
        }

        const author = item.authorCode
            ? String(item.authorCode).trim().toUpperCase()
            : (item.authorFullName || '—');
        const date = item.dateWritten || '—';
        const serial = item.id || '—';
        const typology = typeof getTypologyLabel === 'function'
            ? (getTypologyLabel(item.typology) || item.typology || '—')
            : (item.typology || '—');
        const blocksHtml = typeof MicroMock !== 'undefined'
            ? MicroMock.buildTagsRowHTML(item)
            : '';
        return `
            <section class="artifact-inspector-metadata">
                <div class="artifact-inspector-metadata__scroll-glyphs" aria-hidden="true">
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                </div>
                <h2 class="artifact-inspector-metadata__id general-h">${this.escapeHtml(item.id || '')}</h2>
                <div class="artifact-inspector-metadata__grid">
                    <div class="artifact-inspector-metadata__tags">
                        <h3 class="general-t">תגיות</h3>
                        <div class="artifact-inspector-metadata__tag-list">${blocksHtml}</div>
                    </div>
                    <dl class="artifact-inspector-metadata__details general-t">
                        <div><dt>מחבר</dt><dd>${this.escapeHtml(author)}</dd></div>
                        <div><dt>תאריך כתיבה</dt><dd>${this.escapeHtml(date)}</dd></div>
                        <div><dt>מספר סידורי</dt><dd>${this.escapeHtml(serial)}</dd></div>
                        <div><dt>מבנה טיפולוגי</dt><dd>${this.escapeHtml(typology)}</dd></div>
                    </dl>
                </div>
            </section>
        `;
    },

    buildRelatedNotesHTML(focusItem) {
        const sections = this.getRelatedTagSections(focusItem);
        if (!sections.length) return '';

        const blocks = sections.map((section) => {
            const pills = (typeof NoteCensor !== 'undefined' && NoteCensor.isActive())
                ? NoteCensor.buildRedactBlock('related', section.key, 'note-redact--related-heading', {
                    maxLines: 1,
                    minWidth: 0.25,
                    maxWidth: 0.5
                })
                : section.tags.map((name) => {
                    const color = AppState.tagColorsMap.get(name) || 'var(--color-3)';
                    return `<span class="artifact-inspector-related__pill action-block general-t"><span class="block-glyph" style="background-color:${color}"></span><span class="block-label">${this.escapeHtml(name)}</span></span>`;
                }).join('<span class="artifact-inspector-related__plus" aria-hidden="true">+</span>');

            const notes = section.items.map((item) => {
                const html = typeof MicroMock !== 'undefined'
                    ? MicroMock.buildCardHTML(item)
                    : '';
                return `<div class="artifact-inspector-related__note">${html}</div>`;
            }).join('');

            return `
                <section class="artifact-inspector-related__section">
                    <div class="artifact-inspector-related__heading general-h">${pills}</div>
                    <div class="artifact-inspector-related__grid">${notes}</div>
                </section>
            `;
        }).join('');

        return `
            <section class="artifact-inspector-related">
                <h2 class="artifact-inspector-related__title general-h">פתקים קשורים</h2>
                ${blocks}
            </section>
        `;
    },

    getRelatedTagSections(focusItem) {
        const focusTags = (focusItem.tags || []).map(t => t.name).filter(Boolean);
        if (!focusTags.length || !AppState.items?.length) return [];

        const focusId = String(focusItem.id);
        const subsets = [];

        const emit = (mask) => {
            const tags = focusTags.filter((_, i) => (mask >> i) & 1);
            if (!tags.length) return;
            const key = tags.slice().sort().join('\0');
            if (subsets.some(s => s.key === key)) return;

            const matches = AppState.items.filter((item) => {
                if (String(item.id) === focusId) return false;
                const names = new Set((item.tags || []).map(t => t.name));
                return tags.every(name => names.has(name));
            });

            if (!matches.length) return;
            subsets.push({ key, tags, items: matches });
        };

        const total = 1 << focusTags.length;
        for (let mask = 1; mask < total; mask++) emit(mask);

        subsets.sort((a, b) => a.tags.length - b.tags.length || a.key.localeCompare(b.key, 'he'));
        return subsets;
    },

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    close() {
        if (!this.isActive) return;
        this.closePopup();
    },

    _restoreSourceCard(noteId) {
        if (this._openSyntheticCard) {
            this._openSyntheticCard = false;
            return;
        }

        const panelScaler = this.panel?.querySelector('.artifact-inspector-focus__card-scaler');
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const card = panelScaler?.querySelector('.micro-mock__card.note-card')
            || flyerScaler?.querySelector('.micro-mock__card.note-card');
        if (!card || !noteId) return;

        card.classList.remove('micro-mock__card--focus');
        card.style.removeProperty('width');
        card.style.removeProperty('max-width');
        card.style.removeProperty('box-sizing');
        card.style.removeProperty('transform');
        card.style.removeProperty('transition');
        card.style.removeProperty('transform-origin');

        const wrapper = this.activeElement
            || document.querySelector(`.note-wrapper[data-note-id="${String(noteId)}"]`);
        const note = wrapper?.querySelector('.micro-mock__note');
        if (!note) {
            if (wrapper && typeof MicroMock !== 'undefined') {
                MicroMock.applyToWrapper(wrapper);
            }
            return;
        }

        const tags = note.querySelector('.micro-mock__tags');
        if (tags) note.insertBefore(card, tags);
        else note.appendChild(card);
    },

    closePopup() {
        clearTimeout(this._openAnimTimer);
        this._openAnimTimer = null;

        this.backdrop.classList.remove('active', 'is-popup', 'is-opening');
        this.panel.classList.remove('is-open', 'is-opening');
        this.panel.setAttribute('aria-hidden', 'true');
        const noteId = this.panel?.dataset?.noteId;
        this._restoreSourceCard(noteId);
        this.panel.innerHTML = '';
        this.panel.style.removeProperty('width');
        this.panel.style.removeProperty('left');
        this.panel.style.removeProperty('--inspector-metadata-gap');
        delete this.panel.dataset.noteId;

        if (this.flyer) {
            this.flyer.innerHTML = '';
            this.flyer.classList.remove('is-preparing', 'is-opening', 'is-landed');
            this.flyer.setAttribute('aria-hidden', 'true');
        }

        document.body.classList.remove('is-artifact-inspector-open');

        this._showAllSourceWrappers(noteId);
        this.activeElement?.classList.remove('is-inspector-source-hidden');
        this._openFirstCard = null;
        this._openFocusVisualWidth = null;
        this._openSyntheticCard = false;
        this._forceReadableOpen = false;
        this.isActive = false;
        this.activeElement = null;
        this.mode = null;
        SpatialNavigation.resume();
    }
};
/* ==========================================================================
   07. PHYSICS ENGINE (MATTER.JS - CLUSTER DYNAMICS)
   ========================================================================== */
const PhysicsEngine = {
    engine: null,
    runner: null,
    bodiesData: [],
    siblingLinks: [],
    noteCenters: [],
    linkCanvas: null,
    linkCtx: null,
    isActive: false,
    
    mouseWorldX: -1000, 
    mouseWorldY: -1000,
    time: 0,
    mouseClientX: 0,
    mouseClientY: 0,
    hoveredNoteIndex: -1,
    moleculeHoverPinnedIndex: -1,
    repulsionHoldNoteIndex: -1,
    moleculeClickIntent: null,
    transitionFrozen: false,
    runnerEnabled: false,
    syncLoopLastTs: 0,
    navPhysicsTickLastTs: 0,
    renderStepTs: 0,

    setTransitionFrozen(value) {
        this.transitionFrozen = !!value;
    },

    setMacroPhysicsActive(active) {
        if (!this.runner || !this.engine) return;
        const shouldRun = !!active;
        if (shouldRun === this.runnerEnabled) return;
        if (shouldRun) {
            Matter.Runner.run(this.runner, this.engine);
        } else {
            Matter.Runner.stop(this.runner);
        }
        this.runnerEnabled = shouldRun;
    },

    shouldThrottleMacroCanvas() {
        if (CONFIG.presentation?.displayInterp) return false;
        if (typeof isPresentationMode !== 'function' || !isPresentationMode()) return false;
        const targetFps = CONFIG.presentation?.targetFps ?? 0;
        if (!targetFps || targetFps >= 60) return false;
        const minDelta = 1000 / targetFps;
        const now = performance.now();
        if (now - this.syncLoopLastTs < minDelta) return true;
        this.syncLoopLastTs = now;
        return false;
    },

    captureRenderSnapshot() {
        const now = performance.now();
        this.bodiesData.forEach(item => {
            if (!item.body) return;
            const x = item.body.position.x;
            const y = item.body.position.y;
            if (item._renderToX == null) {
                item._renderFromX = x;
                item._renderFromY = y;
            } else {
                item._renderFromX = item._renderToX;
                item._renderFromY = item._renderToY;
            }
            item._renderToX = x;
            item._renderToY = y;
        });
        this.renderStepTs = now;
    },

    getDisplayPosition(item) {
        const body = item.body;
        if (!body) return null;

        const useInterp = typeof isPresentationMode === 'function' &&
            isPresentationMode() &&
            CONFIG.presentation?.displayInterp !== false &&
            item._renderToX != null;

        if (!useInterp) {
            return { x: body.position.x, y: body.position.y };
        }

        const physFps = CONFIG.presentation?.physicsFps ?? 30;
        const stepMs = 1000 / physFps;
        const sinceStep = performance.now() - (this.renderStepTs || 0);
        let alpha = Math.min(1, sinceStep / stepMs);
        alpha = alpha * alpha * (3 - 2 * alpha);

        return {
            x: item._renderFromX + (item._renderToX - item._renderFromX) * alpha,
            y: item._renderFromY + (item._renderToY - item._renderFromY) * alpha
        };
    },

    getItemDrawPosition(item) {
        const pos = this.getDisplayPosition(item);
        if (pos) return pos;
        const body = item.body;
        return body ? { x: body.position.x, y: body.position.y } : null;
    },

    init() {
        if (typeof Matter === 'undefined') {
            console.error(
                'Matter.js did not load (vendor/matter.min.js missing or failed). Physics is disabled — serve over HTTP from the project folder.'
            );
            return;
        }

        this.engine = Matter.Engine.create();
        this.engine.world.gravity.x = CONFIG.physics.gravity.x;
        this.engine.world.gravity.y = CONFIG.physics.gravity.y;

        this.initLinkCanvas();

        window.addEventListener('mousemove', (e) => {
            this.mouseWorldX = e.pageX;
            this.mouseWorldY = e.pageY;
            this.mouseClientX = e.clientX;
            this.mouseClientY = e.clientY;
            if (DepthController.currentLevel === 1 && this.bodiesData.length > 0) {
                this.updateMoleculeHoverState();
            }
        });

        this.initMoleculePointer();

        this.moleculeHoverTitle = document.createElement('div');
        this.moleculeHoverTitle.className = 'molecule-hover-title';
        this.moleculeHoverTitle.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.moleculeHoverTitle);

        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                AppState.centerViewport();
                this.resizeLinkCanvas();
                this.buildWorld();
            }, CONFIG.physics.resizeDebounce);
        });

        Matter.Events.on(this.engine, 'beforeUpdate', () => {
            if (this.transitionFrozen) return;
            if (DepthController.currentLevel !== 1 || !this.isActive) return;

            const count = this.bodiesData.length;
            if (count === 0) return;

            const forcesCfg = CONFIG.physics.forces;
            const mouseCfg = CONFIG.physics.mouse;

            this.time += forcesCfg.wanderSpeed;

            // Warehouse: refresh block positions, block-to-block forces, orbit targets
            ActionWarehouse.tick(this.bodiesData, this.time);

            const captureBlockCount = ActionWarehouse.getCrowdedBlockCount();
            const blocksOnSurface = captureBlockCount > 0;
            const kinematicCapture = ActionWarehouse.isKinematicCaptureMode(captureBlockCount);

            // Notes with at least one captured dot: siblings nearly let go of home,
            // so the sibling springs can drag the whole cluster toward the block
            const capturedNotes = new Set();
            this.bodiesData.forEach(item => {
                if (item.overrideTarget) capturedNotes.add(item.noteIndex);
            });
            const homeFactor = CONFIG.warehouse.linkage.homeFactorWhenCaptured;

            // When any block is out of the dock, homes switch to the workspace grid
            const altCenters = ActionWarehouse.workspaceCenters;

            this.bodiesData.forEach(item => {
                if (item.isFiltered || item.isFilterExiting) return;
                if (item.onBankGrid) return;
                if (kinematicCapture && item.overrideTarget) return;

                const rawTarget = item.overrideTarget;
                const isStretchedNote = ActionWarehouse.stretchedNotes.has(item.noteIndex);
                if (isStretchedNote && rawTarget && captureBlockCount >= 2) return;

                const smoothTarget = item.smoothTarget;
                const smoothLag = rawTarget && smoothTarget
                    ? Math.hypot(rawTarget.x - smoothTarget.x, rawTarget.y - smoothTarget.y)
                    : 0;
                const jumpReset = CONFIG.physics.targetSmoothing.stretchJumpReset;
                const rawJumpThreshold = captureBlockCount >= 2 ? jumpReset : jumpReset * 0.35;
                const useRawTarget = rawTarget && (
                    isStretchedNote
                        ? captureBlockCount < 2
                        : captureBlockCount < 2 && smoothLag > rawJumpThreshold
                );
                let pullTarget = useRawTarget
                    ? rawTarget
                    : (rawTarget && smoothTarget ? smoothTarget : rawTarget);
                if (rawTarget && smoothTarget && !useRawTarget && !isStretchedNote) {
                    const bodyDist = Math.hypot(
                        rawTarget.x - item.body.position.x,
                        rawTarget.y - item.body.position.y
                    );
                    const far = scale(60);
                    const near = scale(14);
                    const span = Math.max(scale(8), far - near);
                    const t = Math.max(0, Math.min(1, (bodyDist - near) / span));
                    const chase = CONFIG.physics.targetSmoothing.captureChase ?? 0.38;
                    pullTarget = {
                        x: smoothTarget.x + (rawTarget.x - smoothTarget.x) * t * chase,
                        y: smoothTarget.y + (rawTarget.y - smoothTarget.y) * t * chase
                    };
                }
                if (rawTarget && captureBlockCount === 5 && !isStretchedNote && smoothTarget) {
                    const bodyOrbit = Math.hypot(
                        rawTarget.x - item.body.position.x,
                        rawTarget.y - item.body.position.y
                    );
                    if (bodyOrbit > scale(36)) {
                        pullTarget = rawTarget;
                    }
                }
                if (pullTarget && captureBlockCount >= 5 && !isStretchedNote && !kinematicCapture) {
                    const block = ActionWarehouse.getOrbitAnchorBlock(item);
                    if (block) {
                        pullTarget = ActionWarehouse.clampTargetToBlockRing(
                            pullTarget.x, pullTarget.y, block
                        );
                    }
                }
                const target = pullTarget;
                let pull = target
                    ? (isStretchedNote
                        ? forcesCfg.blockAttractionStretch
                        : (captureBlockCount >= 2
                            ? forcesCfg.blockAttractionMulti
                            : (rawTarget
                                ? forcesCfg.blockAttractionSingle
                                : forcesCfg.blockAttraction)))
                    : forcesCfg.attraction;

                const stretchBinding = isStretchedNote
                    ? ActionWarehouse.stretchBindingByNote.get(item.noteIndex)
                    : null;
                const isStretchAnchor = stretchBinding && (
                    stretchBinding.mode === 'multi'
                        ? stretchBinding.anchors.some(a => a.dot === item)
                        : (item === stretchBinding.dotA || item === stretchBinding.dotB)
                );

                if (isStretchAnchor) {
                    pull *= CONFIG.warehouse.orbit.stretchAnchorPullBoost;
                }
                if (isStretchedNote && captureBlockCount >= 2) {
                    pull *= 0.72;
                }
                if (captureBlockCount >= 2) {
                    pull *= ActionWarehouse.getCrowdedForceScale(captureBlockCount);
                }

                let targetX, targetY;

                if (target) {
                    targetX = target.x;
                    targetY = target.y;
                } else if (capturedNotes.has(item.noteIndex)) {
                    // Sibling of a captured dot: no home pull, the springs carry it
                    pull = forcesCfg.attraction * homeFactor;
                    targetX = item.body.position.x;
                    targetY = item.body.position.y;
                } else if (altCenters && altCenters[item.noteIndex]) {
                    targetX = altCenters[item.noteIndex].x + item.offsetX;
                    targetY = altCenters[item.noteIndex].y + item.offsetY;
                } else {
                    targetX = item.physicsTargetX;
                    targetY = item.physicsTargetY;
                }

                const dx = targetX - item.body.position.x;
                const dy = targetY - item.body.position.y;

                // Cap the effective distance: far dots glide at constant force
                // instead of being yanked (force grows linearly only up close)
                const targetDist = Math.sqrt(dx * dx + dy * dy);
                const distScale = targetDist > forcesCfg.maxPullDistance
                    ? forcesCfg.maxPullDistance / targetDist : 1;

                // Soft landing: captured dots ease off pull as they reach orbit slot
                if (rawTarget && !isStretchedNote && targetDist < forcesCfg.captureSettleRadius) {
                    const settleT = targetDist / forcesCfg.captureSettleRadius;
                    const settleMul = forcesCfg.capturePullFloor +
                        (1 - forcesCfg.capturePullFloor) * settleT;
                    pull *= settleMul;
                }

                let forceX = dx * pull * distScale;
                let forceY = dy * pull * distScale;

                // Stretched molecules: soft bias toward chord center (siblings only — anchors reach blocks)
                if (isStretchedNote && !isStretchAnchor) {
                    const axis = ActionWarehouse.stretchAxisByNote.get(item.noteIndex);
                    const binding = ActionWarehouse.stretchBindingByNote.get(item.noteIndex);
                    const orbitCfg = CONFIG.warehouse.orbit;
                    if (axis && binding) {
                        const tcx = axis.mode === 'multi'
                            ? axis.cx + axis.px * binding.slotLane
                            : axis.bA.bodyX + axis.ux * axis.centerAlong + axis.px * binding.slotLane;
                        const tcy = axis.mode === 'multi'
                            ? axis.cy + axis.py * binding.slotLane
                            : axis.bA.bodyY + axis.uy * axis.centerAlong + axis.py * binding.slotLane;
                        const cdx = tcx - item.body.position.x;
                        const cdy = tcy - item.body.position.y;
                        const cDist = Math.hypot(cdx, cdy) || 1;
                        const cScale = cDist > forcesCfg.maxPullDistance
                            ? forcesCfg.maxPullDistance / cDist : 1;
                        const centerPull = forcesCfg.blockAttractionStretch *
                            orbitCfg.stretchCenterBias *
                            (captureBlockCount >= 2 ? 0.65 : 1);
                        forceX += cdx * centerPull * cScale;
                        forceY += cdy * centerPull * cScale;
                    }
                }

                // Stretched siblings without their own anchor: gentle pull toward chord midpoint
                if (isStretchedNote && !rawTarget) {
                    const axis = ActionWarehouse.stretchAxisByNote.get(item.noteIndex);
                    if (axis) {
                        const midX = axis.mode === 'multi' ? axis.cx : axis.midX;
                        const midY = axis.mode === 'multi' ? axis.cy : axis.midY;
                        const mdx = midX - item.body.position.x;
                        const mdy = midY - item.body.position.y;
                        const midPull = forcesCfg.blockAttractionStretch * 0.35;
                        const midDist = Math.hypot(mdx, mdy) || 1;
                        const midScale = midDist > forcesCfg.maxPullDistance
                            ? forcesCfg.maxPullDistance / midDist : 1;
                        forceX += mdx * midPull * midScale;
                        forceY += mdy * midPull * midScale;
                    }
                }

                if (!capturedNotes.has(item.noteIndex) && !blocksOnSurface) {
                    const wanderX = Math.sin(this.time + item.cssOriginX) * forcesCfg.wanderStrength;
                    const wanderY = Math.cos(this.time + item.cssOriginY) * forcesCfg.wanderStrength;
                    forceX += wanderX;
                    forceY += wanderY;
                }

                const mDx = item.body.position.x - this.mouseWorldX;
                const mDy = item.body.position.y - this.mouseWorldY;
                const distSq = (mDx * mDx) + (mDy * mDy);
                const interactionRadius = mouseCfg.interactionRadius;
                const holdNote = this.repulsionHoldNoteIndex;

                if (item.noteIndex !== holdNote &&
                    distSq < (interactionRadius * interactionRadius) && distSq > 0) {
                    const distance = Math.sqrt(distSq);
                    const repulsionStrength = mouseCfg.repulsionStrength *
                        (1 - (distance / interactionRadius));
                    forceX += (mDx / distance) * repulsionStrength;
                    forceY += (mDy / distance) * repulsionStrength;
                }

                Matter.Body.applyForce(item.body, item.body.position, { x: forceX, y: forceY });
            });
        });

        Matter.Events.on(this.engine, 'afterUpdate', () => {
            if (DepthController.currentLevel !== 1 || !this.isActive) return;

            ActionWarehouse.tickWorkspaceGridRush(this.bodiesData);

            const blockCount = ActionWarehouse.getCrowdedBlockCount();
            const hasStretch = ActionWarehouse.stretchedNotes.size > 0;
            const pres = typeof isPresentationMode === 'function' && isPresentationMode();
            const passCap = CONFIG.presentation?.physicsPassCapAtBlocks ?? 0;
            let passes = hasStretch ? 2 : 1;
            if (pres && passCap > 0 && blockCount >= passCap && !hasStretch) {
                passes = 1;
            }

            const molecules = this.buildMoleculeHulls();

            for (let pass = 0; pass < passes; pass++) {
                if (molecules.length > 1) {
                    this.resolveSharedStretchGroupOverlaps(molecules);
                    this.resolveOutlineShellCollisions(molecules);
                }
                if (molecules.length > 0) {
                    this.resolveBlockHullOverlaps(molecules);
                    this.resolveDotBlockOverlaps();
                }
            }

            this.syncStretchSiblingSprings();
            this.applyStretchKinematicFollow();
            this.applyKinematicCaptureFollow();
            this.applyMotionSettling();

            if (typeof NavigationMap !== 'undefined') {
                const throttleMs = (pres && CONFIG.presentation?.navMapPhysicsThrottleMs)
                    ? CONFIG.presentation.navMapPhysicsThrottleMs
                    : 0;
                if (throttleMs > 0) {
                    const now = performance.now();
                    if (now - this.navPhysicsTickLastTs >= throttleMs) {
                        this.navPhysicsTickLastTs = now;
                        NavigationMap.notifyPhysicsTick();
                    }
                } else {
                    NavigationMap.notifyPhysicsTick();
                }
            }

            this.captureRenderSnapshot();
        });

        this.runner = Matter.Runner.create(
            (typeof isPresentationMode === 'function' && isPresentationMode())
                ? {
                    delta: 1000 / (CONFIG.presentation?.physicsFps ?? 30),
                    isFixed: true
                }
                : undefined
        );
        const startRunner = typeof DepthController === 'undefined' ||
            DepthController.currentLevel === 1;
        if (startRunner) {
            Matter.Runner.run(this.runner, this.engine);
            this.runnerEnabled = true;
        } else {
            this.runnerEnabled = false;
        }

        this.syncLoop();
    },

    // Live molecule hulls for broad-phase + block clearance
    buildMoleculeHulls() {
        const bodyR = CONFIG.physics.body.radius;
        const pad = CONFIG.outlines.padding;
        const orbitCfg = CONFIG.warehouse.orbit;
        const groups = new Map();

        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;
            if (!groups.has(item.noteIndex)) {
                groups.set(item.noteIndex, { noteIndex: item.noteIndex, dots: [], cx: 0, cy: 0 });
            }
            const group = groups.get(item.noteIndex);
            group.dots.push(item);
            group.cx += item.body.position.x;
            group.cy += item.body.position.y;
        });

        return [...groups.values()].map(group => {
            const n = group.dots.length;
            group.cx /= n;
            group.cy /= n;

            let liveReach = 0;
            group.dots.forEach(d => {
                liveReach = Math.max(
                    liveReach,
                    Math.hypot(d.body.position.x - group.cx, d.body.position.y - group.cy)
                );
            });
            const extent = ActionWarehouse.noteMoleculeExtent(
                this.bodiesData, group.noteIndex, orbitCfg
            );
            group.radius = Math.max(extent, liveReach + bodyR + pad);
            return group;
        });
    },

    resolveSharedStretchGroupOverlaps(molecules) {
        const hullCfg = CONFIG.physics.hullCollision;
        const stretched = ActionWarehouse.stretchedNotes;

        for (let i = 0; i < molecules.length; i++) {
            for (let j = i + 1; j < molecules.length; j++) {
                const a = molecules[i];
                const b = molecules[j];
                if (!stretched.has(a.noteIndex) || !stretched.has(b.noteIndex)) continue;

                const bindA = ActionWarehouse.stretchBindingByNote.get(a.noteIndex);
                const bindB = ActionWarehouse.stretchBindingByNote.get(b.noteIndex);
                const keyA = bindA ? ActionWarehouse.getStretchGroupKey(bindA) : '';
                const keyB = bindB ? ActionWarehouse.getStretchGroupKey(bindB) : '';
                if (keyA && keyA === keyB) {
                    this.resolveSharedStretchOverlap(a, b, hullCfg);
                }
            }
        }
    },

    // Hard per-dot outline shell — body-only, never touches orbit targets
    resolveOutlineShellCollisions(molecules) {
        const hullCfg = CONFIG.physics.hullCollision;
        const bodyR = CONFIG.physics.body.radius;
        const shellR = bodyR + CONFIG.outlines.padding;
        const minDist = shellR * 2 + hullCfg.dotGap;
        const broadGap = hullCfg.gap;
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const kinematic = ActionWarehouse.isKinematicCaptureMode(blockCount);
        const shellPasses = hullCfg.shellPasses ?? 1;
        let capturedWeight = hullCfg.capturedBodyWeight ?? 0.55;
        if (blockCount >= 2) capturedWeight = hullCfg.capturedBodyWeightMulti ?? 0.44;
        const multiBlock = blockCount >= 2;

        for (let shellPass = 0; shellPass < shellPasses; shellPass++) {
            const useBroadPhase = shellPass === 0;

            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const molA = molecules[i];
                    const molB = molecules[j];

                    const dx = molB.cx - molA.cx;
                    const dy = molB.cy - molA.cy;
                    const dist = Math.hypot(dx, dy);
                    if (useBroadPhase && dist >= molA.radius + molB.radius + broadGap) continue;

                    if (CONFIG.presentation?.hullCollisionDistanceCull &&
                        typeof isPresentationMode === 'function' && isPresentationMode()) {
                        const viewDiag = Math.hypot(window.innerWidth, window.innerHeight);
                        const viewMul = CONFIG.presentation.hullCollisionViewCull ?? 1.45;
                        const maxDist = viewDiag * viewMul + molA.radius + molB.radius;
                        if (dist > maxDist) continue;
                    }

                    const stretched = ActionWarehouse.stretchedNotes;
                    if (stretched.has(molA.noteIndex) && stretched.has(molB.noteIndex)) {
                        const bindA = ActionWarehouse.stretchBindingByNote.get(molA.noteIndex);
                        const bindB = ActionWarehouse.stretchBindingByNote.get(molB.noteIndex);
                        const keyA = bindA ? ActionWarehouse.getStretchGroupKey(bindA) : '';
                        const keyB = bindB ? ActionWarehouse.getStretchGroupKey(bindB) : '';
                        if (keyA && keyA === keyB) continue;
                    }

                    for (let ai = 0; ai < molA.dots.length; ai++) {
                        const dotA = molA.dots[ai];
                        if (dotA.isFiltered) continue;

                        for (let bi = 0; bi < molB.dots.length; bi++) {
                            const dotB = molB.dots[bi];
                            if (dotB.isFiltered) continue;

                            this.separateOutlineShellPair(
                                dotA, dotB, minDist, capturedWeight, kinematic, multiBlock
                            );
                        }
                    }
                }
            }
        }
    },

    separateOutlineShellPair(dotA, dotB, minDist, capturedWeight, kinematic, multiBlock) {
        if (ActionWarehouse.stretchedNotes.has(dotA.noteIndex) ||
            ActionWarehouse.stretchedNotes.has(dotB.noteIndex)) {
            return;
        }

        const staticA = !dotA.body || dotA.onBankGrid || dotA.body.isStatic;
        const staticB = !dotB.body || dotB.onBankGrid || dotB.body.isStatic;
        let wA = staticA ? 0 : (dotA.overrideTarget ? capturedWeight : 1);
        let wB = staticB ? 0 : (dotB.overrideTarget ? capturedWeight : 1);
        if (kinematic && dotA.overrideTarget) wA = 0;
        if (kinematic && dotB.overrideTarget) wB = 0;
        if (wA <= 0 && wB <= 0) return;

        const pdx = dotB.body.position.x - dotA.body.position.x;
        const pdy = dotB.body.position.y - dotA.body.position.y;
        const pdist = Math.hypot(pdx, pdy) || 0.01;
        if (pdist >= minDist) return;

        const overlap = minDist - pdist;
        const nx = pdx / pdist;
        const ny = pdy / pdist;

        const wSum = wA + wB;
        if (wSum <= 0) return;

        const moveA = overlap * (wB / wSum);
        const moveB = overlap * (wA / wSum);

        if (wA > 0) {
            this.nudgeBodyPosition(dotA.body, -nx * moveA, -ny * moveA);
            this.dampShellNormalVelocity(dotA.body, nx, ny, multiBlock && !!dotA.overrideTarget);
            if (multiBlock && dotA.overrideTarget) {
                const v = dotA.body.velocity;
                Matter.Body.setVelocity(dotA.body, { x: v.x * 0.35, y: v.y * 0.35 });
            }
        }
        if (wB > 0) {
            this.nudgeBodyPosition(dotB.body, nx * moveB, ny * moveB);
            this.dampShellNormalVelocity(dotB.body, -nx, -ny, multiBlock && !!dotB.overrideTarget);
            if (multiBlock && dotB.overrideTarget) {
                const v = dotB.body.velocity;
                Matter.Body.setVelocity(dotB.body, { x: v.x * 0.35, y: v.y * 0.35 });
            }
        }
    },

    dampShellNormalVelocity(body, nx, ny, heavy) {
        const vx = body.velocity.x;
        const vy = body.velocity.y;
        const vn = vx * nx + vy * ny;
        if (vn >= 0) return;
        const damp = heavy ? 0.35 : 0.55;
        Matter.Body.setVelocity(body, {
            x: vx - nx * vn * damp,
            y: vy - ny * vn * damp
        });
    },

    nudgeBodyPosition(body, dx, dy) {
        const p = body.position;
        Matter.Body.setPosition(body, {
            x: p.x + dx,
            y: p.y + dy
        });
    },

    nudgeMoleculeHull(mol, dx, dy, strength = 1) {
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const multiBlock = blockCount >= 2;
        const kinematic = ActionWarehouse.isKinematicCaptureMode(blockCount);
        let weightedDx = 0;
        let weightedDy = 0;
        mol.dots.forEach(dot => {
            if (kinematic && dot.overrideTarget) return;
            const nudgeScale = dot.overrideTarget ? strength * 0.22 : strength;
            this.nudgeBodyPosition(dot.body, dx * nudgeScale, dy * nudgeScale);
            if (multiBlock && dot.overrideTarget) {
                const v = dot.body.velocity;
                Matter.Body.setVelocity(dot.body, { x: v.x * 0.35, y: v.y * 0.35 });
            }
            weightedDx += dx * nudgeScale;
            weightedDy += dy * nudgeScale;
        });
        const n = mol.dots.length || 1;
        mol.cx += weightedDx / n;
        mol.cy += weightedDy / n;
    },

    resolveSharedStretchOverlap(molA, molB, hullCfg) {
        const dx = molB.cx - molA.cx;
        const dy = molB.cy - molA.cy;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minD = molA.radius + molB.radius + hullCfg.gap;
        const overlap = minD - dist;
        if (overlap <= 0) return;

        const axis = ActionWarehouse.stretchAxisByNote.get(molA.noteIndex);
        const bindA = ActionWarehouse.stretchBindingByNote.get(molA.noteIndex);
        const bindB = ActionWarehouse.stretchBindingByNote.get(molB.noteIndex);
        const strength = hullCfg.stretchResolveStrength ?? 0.62;
        const shift = overlap * strength * 0.5;

        if (axis && bindA && bindB) {
            const nx = dx / dist;
            const ny = dy / dist;
            let perpSign = nx * axis.px + ny * axis.py;
            if (Math.abs(perpSign) < 0.01) perpSign = 1;
            else perpSign = Math.sign(perpSign);

            bindA.slotLane -= shift * perpSign;
            bindB.slotLane += shift * perpSign;
            ActionWarehouse.applyBindingOffsets(molA.noteIndex, bindA);
            ActionWarehouse.applyBindingOffsets(molB.noteIndex, bindB);
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        this.nudgeMoleculeHull(molA, -nx * shift, -ny * shift);
        this.nudgeMoleculeHull(molB, nx * shift, ny * shift);
    },

    resolveBlockHullOverlaps(molecules) {
        const orbitCfg = CONFIG.warehouse.orbit;
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const strength = blockCount >= 2 ? 0.52 : 0.82;

        ActionWarehouse.getCollisionBlocks().forEach(block => {
            const blockR = ActionWarehouse.getBlockCollisionRadius(block);

            molecules.forEach(mol => {
                if (ActionWarehouse.stretchedNotes.has(mol.noteIndex)) {
                    const isOwned = mol.dots.some(d =>
                        d.overrideTarget && ActionWarehouse.dotMatchesBlock(block, d));
                    if (isOwned) return;
                }
                if (mol.dots.every(d => d.onBankGrid)) return;

                const isOwned = mol.dots.some(d => d.overrideTarget && ActionWarehouse.dotMatchesBlock(block, d));
                const clearance = isOwned
                    ? ActionWarehouse.orbitFloor(orbitCfg, block)
                    : blockR + mol.radius + orbitCfg.blockClearance;

                const dx = mol.cx - block.bodyX;
                const dy = mol.cy - block.bodyY;
                const dist = Math.hypot(dx, dy) || 0.01;
                const overlap = clearance - dist;
                if (overlap <= 0) return;

                const nx = dx / dist;
                const ny = dy / dist;
                const push = overlap * strength;

                mol.dots.forEach(dot => {
                    this.nudgeBodyPosition(dot.body, nx * push, ny * push);
                    if (blockCount >= 2 && dot.overrideTarget) {
                        const v = dot.body.velocity;
                        Matter.Body.setVelocity(dot.body, { x: v.x * 0.35, y: v.y * 0.35 });
                    }
                });
                mol.cx += nx * push;
                mol.cy += ny * push;
            });
        });
    },

    // Per-dot safety net: pill AABB keeps colliders off block bodies
    resolveDotBlockOverlaps() {
        const orbitCfg = CONFIG.warehouse.orbit;
        const dotR = CONFIG.physics.body.radius;

        ActionWarehouse.getCollisionBlocks().forEach(block => {
            this.bodiesData.forEach(dot => {
                if (dot.onBankGrid || dot.body.isStatic) return;
                if (ActionWarehouse.stretchedNotes.has(dot.noteIndex)) return;

                const isOwnTag = ActionWarehouse.dotMatchesBlock(block, dot);

                const gap = isOwnTag
                    ? (orbitCfg.orbitCaptureClearance ?? orbitCfg.blockClearance)
                    : orbitCfg.blockClearance;

                const pushed = ActionWarehouse.pushPointOutOfBlockAabb(
                    block,
                    dot.body.position.x,
                    dot.body.position.y,
                    dotR + gap
                );
                if (pushed.moved) {
                    const ox = dot.body.position.x;
                    const oy = dot.body.position.y;
                    this.nudgeBodyPosition(dot.body, pushed.x - ox, pushed.y - oy);
                }
            });
        });
    },

    // Softer sibling springs while stretched; rest length follows current span
    syncStretchSiblingSprings() {
        const linkCfg = CONFIG.warehouse.linkage;
        const baseStiff = linkCfg.siblingStiffness;
        const stretchStiff = baseStiff * linkCfg.stretchStiffnessFactor;
        const slack = linkCfg.stretchLengthSlack;
        const linkDamping = linkCfg.siblingDamping;

        this.siblingLinks.forEach(link => {
            if (!link.constraint) return;
            link.constraint.damping = linkDamping;
            const stretched = ActionWarehouse.stretchedNotes.has(link.noteIndex);
            if (!stretched) {
                link.constraint.stiffness = baseStiff;
                link.constraint.length = linkCfg.siblingLength;
                return;
            }

            const blockCount = ActionWarehouse.getCrowdedBlockCount();
            link.constraint.stiffness = (blockCount >= 2 && !ActionWarehouse.isKinematicCaptureMode(blockCount))
                ? 0
                : stretchStiff;
            const ax = link.bodyA.position.x;
            const ay = link.bodyA.position.y;
            const bx = link.bodyB.position.x;
            const by = link.bodyB.position.y;
            const dist = Math.hypot(bx - ax, by - ay) || linkCfg.siblingLength;
            link.constraint.length = Math.max(linkCfg.siblingLength, dist * slack);
        });
    },

    applyStretchKinematicFollow() {
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        if (blockCount < 2 || ActionWarehouse.stretchedNotes.size === 0) return;
        if (ActionWarehouse.isKinematicCaptureMode(blockCount)) return;

        const cfg = CONFIG.physics.crowdedBlock;
        const pres = typeof isPresentationMode === 'function' && isPresentationMode();
        const dragging = ActionWarehouse.isAnyCaptureBlockDragging();
        let lerp = pres
            ? (CONFIG.presentation?.kinematicStretchLerp ?? 0.2)
            : (cfg.kinematicLerpStretch ?? 0.16);
        if (dragging) {
            lerp = pres
                ? (CONFIG.presentation?.kinematicStretchLerpDrag ?? 0.26)
                : (cfg.kinematicSmoothLerpStretch ?? 0.2);
        }
        let maxStep = scale(dragging ? (cfg.kinematicMaxStepDrag ?? 3.6) : (cfg.kinematicMaxStep ?? 2.4));

        this.bodiesData.forEach(item => {
            if (!ActionWarehouse.stretchedNotes.has(item.noteIndex)) return;
            if (!item.overrideTarget || item.onBankGrid || item.isFiltered || item.isFilterExiting) return;
            const tgt = item.overrideTarget;
            const body = item.body;
            if (!body || body.isStatic) return;

            const lag = Math.hypot(tgt.x - body.position.x, tgt.y - body.position.y);
            const stepCap = ActionWarehouse.kinematicAdaptiveMaxStep(maxStep, lag, cfg);
            const next = ActionWarehouse.kinematicLerpToward(
                body.position.x, body.position.y, tgt.x, tgt.y, lerp, stepCap
            );
            Matter.Body.setPosition(body, next);
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
        });
    },

    applyKinematicCaptureFollow() {
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        if (!ActionWarehouse.isKinematicCaptureMode(blockCount)) return;

        const cfg = CONFIG.physics.crowdedBlock;
        const blocksDragging = ActionWarehouse.isAnyCaptureBlockDragging();
        const entryTicks = ActionWarehouse._kinematicEntryTicks || 0;
        const entryTotal = cfg.kinematicEntryTicks ?? 120;
        const entryBoost = cfg.kinematicEntryLerp ?? 0.36;
        let baseLerp = blocksDragging
            ? (cfg.kinematicLerpDrag ?? 0.08)
            : (cfg.kinematicLerp ?? 0.05);
        let stretchLerp = cfg.kinematicLerpStretch ?? 0.07;
        let maxStep = scale(blocksDragging
            ? (cfg.kinematicMaxStepDrag ?? 2.8)
            : (cfg.kinematicMaxStep ?? 1.6));
        if (entryTicks > 0) {
            const ramp = 1 - entryTicks / entryTotal;
            baseLerp = baseLerp + (entryBoost - baseLerp) * (1 - ramp);
            stretchLerp = stretchLerp + (entryBoost - stretchLerp) * (1 - ramp);
            maxStep *= 2.2;
        }
        const blockMul = blockCount >= 7 ? (cfg.kinematicBlock7StepMul ?? 1.3) : 1;
        const transMul = ActionWarehouse._orbitTransitionTicks > 0 ? 1.6 : 1;
        maxStep *= blockMul * transMul;
        let followCount = 0;
        let maxFollowLag = 0;

        this.bodiesData.forEach(item => {
            if (item.onBankGrid || item.isFiltered || item.isFilterExiting) return;
            if (!item.overrideTarget) return;
            const body = item.body;
            if (!body || body.isStatic) return;

            const tgt = item.smoothTarget || item.overrideTarget;
            if (!tgt) return;
            const isStretched = ActionWarehouse.stretchedNotes.has(item.noteIndex);
            const lerp = isStretched ? stretchLerp : baseLerp;
            const lag = Math.hypot(tgt.x - body.position.x, tgt.y - body.position.y);
            if (lag > maxFollowLag) maxFollowLag = lag;

            const stepCap = ActionWarehouse.kinematicAdaptiveMaxStep(maxStep, lag, cfg);
            const next = ActionWarehouse.kinematicLerpToward(
                body.position.x, body.position.y, tgt.x, tgt.y, lerp, stepCap
            );
            Matter.Body.setPosition(body, { x: next.x, y: next.y });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            followCount++;
        });
    },

    applyMotionSettling() {
        const cfg = CONFIG.physics.motion;
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const multiBlock = blockCount >= 2;
        const singleBlock = blockCount === 1;
        const heavyTier = ActionWarehouse.getHeavyWorkspaceTier(blockCount);
        const kinematicCapture = ActionWarehouse.isKinematicCaptureMode(blockCount);
        let transitCap = multiBlock
            ? cfg.transitMaxSpeed * Math.max(0.68, 0.92 - (blockCount - 2) * 0.06)
            : cfg.transitMaxSpeed;
        if (heavyTier >= 0) {
            transitCap = CONFIG.physics.crowdedBlock.transitMaxSpeed;
        }

        this.bodiesData.forEach(item => {
            const body = item.body;
            if (item.onBankGrid || body.isStatic) return;
            if (kinematicCapture && item.overrideTarget) return;
            if (ActionWarehouse.stretchedNotes.has(item.noteIndex) &&
                item.overrideTarget && blockCount >= 2) return;

            let vx = body.velocity.x;
            let vy = body.velocity.y;
            let speed = Math.hypot(vx, vy);

            const pullTarget = item.smoothTarget || item.overrideTarget;
            let distToTarget = Infinity;
            if (pullTarget) {
                distToTarget = Math.hypot(
                    pullTarget.x - body.position.x,
                    pullTarget.y - body.position.y
                );
            }

            const snapR = item.overrideTarget ? cfg.snapRadiusCaptured : cfg.snapRadius;
            if (pullTarget && distToTarget < snapR) {
                const isStretched = ActionWarehouse.stretchedNotes.has(item.noteIndex);
                let allowSnap = !item.overrideTarget || speed < cfg.transitMaxSpeed * 0.4;
                if (item.overrideTarget && blockCount >= 4) {
                    const smoothLag = item.smoothTarget
                        ? Math.hypot(
                            item.overrideTarget.x - item.smoothTarget.x,
                            item.overrideTarget.y - item.smoothTarget.y
                        )
                        : 0;
                    allowSnap = !isStretched &&
                        distToTarget < scale(2.4) &&
                        speed < 0.14 &&
                        smoothLag < scale(3.5);
                }
                if (allowSnap) {
                    Matter.Body.setVelocity(body, { x: 0, y: 0 });
                    return;
                }
            }

            if (item.overrideTarget) {
                let damp = multiBlock
                    ? cfg.multiBlockDamping * 0.82
                    : (singleBlock ? cfg.singleBlockCaptureDamping : 1);
                const heavyDamp = ActionWarehouse.getHeavyCaptureDamping(blockCount);
                if (heavyDamp != null) damp = Math.max(heavyDamp, blockCount >= 6 ? 0.58 : 0.52);
                if (damp < 1) {
                    vx *= damp;
                    vy *= damp;
                    speed = Math.hypot(vx, vy);
                }
            } else if (ActionWarehouse.workspaceCenters) {
                const bankDamp = cfg.workspaceBankDamping ?? 0.38;
                vx *= bankDamp;
                vy *= bankDamp;
                speed = Math.hypot(vx, vy);

                const home = ActionWarehouse.workspaceCenters[item.noteIndex];
                if (home) {
                    const homeDist = Math.hypot(
                        home.x + item.offsetX - body.position.x,
                        home.y + item.offsetY - body.position.y
                    );
                    if (homeDist < cfg.snapRadius * 2.5) {
                        Matter.Body.setVelocity(body, { x: 0, y: 0 });
                        return;
                    }
                }
            }

            if (distToTarget > cfg.transitRadius) {
                if (speed > transitCap) {
                    vx = (vx / speed) * transitCap;
                    vy = (vy / speed) * transitCap;
                }
            } else if (item.overrideTarget && speed > transitCap * 0.52) {
                vx = (vx / speed) * transitCap * 0.52;
                vy = (vy / speed) * transitCap * 0.52;
                speed = Math.hypot(vx, vy);
            } else if (speed < cfg.nearJitterSpeed) {
                vx *= cfg.nearDamping;
                vy *= cfg.nearDamping;
            }

            Matter.Body.setVelocity(body, { x: vx, y: vy });
        });
    },

    /* --- Sibling link rendering (canvas overlay, below the dots) --- */

    initLinkCanvas() {
        this.linkCanvas = document.createElement('canvas');
        this.linkCanvas.classList.add('link-canvas');
        document.body.appendChild(this.linkCanvas);
        this.linkCtx = this.linkCanvas.getContext('2d');

        // Canvas cannot consume CSS variables: resolve the color once from the stylesheet
        this.linkColor = getComputedStyle(document.documentElement)
            .getPropertyValue(CONFIG.warehouse.linkage.line.cssColorVariable).trim() || '#101010';

        this.resizeLinkCanvas();
    },

    resizeLinkCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.linkCanvas.width = window.innerWidth * dpr;
        this.linkCanvas.height = window.innerHeight * dpr;
        this.linkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    drawSiblingLinks() {
        const ctx = this.linkCtx;
        const lineCfg = CONFIG.warehouse.linkage.line;
        if (lineCfg.visible === false) return;
        if (this.bodiesData.length === 0) return;

        const linkCfg = CONFIG.warehouse.linkage;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const maxDistSq = lineCfg.maxVisibleDistance * lineCfg.maxVisibleDistance;
        const stretched = ActionWarehouse.stretchedNotes;

        const groups = new Map();
        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;
            if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
            groups.get(item.noteIndex).push(item);
        });

        ctx.strokeStyle = this.linkColor;
        ctx.lineWidth = lineCfg.width;
        ctx.beginPath();

        groups.forEach((dots, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            if (dots.length < 2) return;

            const isStretched = stretched.has(noteIndex);
            const hasCaptured = dots.some(d => d.overrideTarget);
            const candidates = [];

            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const pi = this.getItemDrawPosition(dots[i]);
                    const pj = this.getItemDrawPosition(dots[j]);
                    if (!pi || !pj) continue;
                    const dx = pi.x - pj.x;
                    const dy = pi.y - pj.y;
                    candidates.push({ i, j, distSq: dx * dx + dy * dy });
                }
            }
            candidates.sort((a, b) => a.distSq - b.distSq);

            const degree = new Array(dots.length).fill(0);
            const drawnPairs = new Set();

            const drawPair = (i, j) => {
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (drawnPairs.has(key)) return false;
                drawnPairs.add(key);
                const a = this.getItemDrawPosition(dots[i]);
                const b = this.getItemDrawPosition(dots[j]);
                if (!a || !b) return false;
                ctx.moveTo(a.x - scrollX, a.y - scrollY);
                ctx.lineTo(b.x - scrollX, b.y - scrollY);
                degree[i]++;
                degree[j]++;
                return true;
            };

            candidates.forEach(pair => {
                if (degree[pair.i] >= linkCfg.maxLinksPerDot ||
                    degree[pair.j] >= linkCfg.maxLinksPerDot) return;
                const relaxDistance = isStretched || hasCaptured;
                if (!relaxDistance && pair.distSq > maxDistSq) return;
                drawPair(pair.i, pair.j);
            });

            // Any dot pulled away by a block must stay linked to its molecule
            if (hasCaptured || isStretched) {
                dots.forEach((dot, i) => {
                    if (degree[i] > 0) return;
                    let bestJ = -1;
                    let bestDist = Infinity;
                    for (let j = 0; j < dots.length; j++) {
                        if (i === j) continue;
                        const pi = this.getItemDrawPosition(dot);
                        const pj = this.getItemDrawPosition(dots[j]);
                        if (!pi || !pj) continue;
                        const dx = pi.x - pj.x;
                        const dy = pi.y - pj.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < bestDist) {
                            bestDist = distSq;
                            bestJ = j;
                        }
                    }
                    if (bestJ >= 0) drawPair(i, bestJ);
                });
            }
        });

        ctx.stroke();
    },

    /* --- Note molecule outlines --- */

    getMacroDotRenderRadius() {
        const factor = CONFIG.outlines?.renderScale ?? 1;
        return scale(10 * factor) / 2;
    },

    getOutlineRenderPadding() {
        const cfg = CONFIG.outlines;
        return cfg.renderPadding ?? cfg.padding;
    },

    collectNoteOutlineGroups() {
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const dotR = this.getMacroDotRenderRadius();

        const groups = new Map();
        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;
            const pos = this.getItemDrawPosition(item);
            if (!pos) return;
            if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
            groups.get(item.noteIndex).push({
                x: pos.x - scrollX,
                y: pos.y - scrollY,
                r: dotR
            });
        });

        return groups;
    },

    shouldCullOutlineGroup(pts) {
        const presCull = CONFIG.presentation?.outlineViewportCull &&
            typeof isPresentationMode === 'function' && isPresentationMode();
        if (!presCull) return false;

        const viewPad = CONFIG.outlines.padding + CONFIG.physics.body.radius + 48;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let cx = 0;
        let cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        cx /= pts.length;
        cy /= pts.length;
        return cx < -viewPad || cx > vw + viewPad || cy < -viewPad || cy > vh + viewPad;
    },

    getMoleculeBackingFill() {
        return CONFIG.outlines.backingFill ||
            getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim() ||
            '#F2F0EE';
    },

    drawNoteBackings() {
        const cfg = CONFIG.outlines;
        if (cfg.mode === 'off' || cfg.backing === false || this.bodiesData.length === 0) return;
        if (!this.linkCtx) return;

        const ctx = this.linkCtx;
        const groups = this.collectNoteOutlineGroups();
        ctx.save();
        ctx.fillStyle = this.getMoleculeBackingFill();

        groups.forEach((pts, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            if (this.shouldCullOutlineGroup(pts)) return;

            const R = pts[0].r + this.getOutlineRenderPadding();
            const useHull = cfg.mode === 'hull' ||
                           (cfg.mode === 'compare' && noteIndex % 2 === 0);
            if (useHull) {
                this.fillHullOutline(pts, R, ctx);
            }
        });

        ctx.restore();
    },

    drawNoteOutlines() {
        const cfg = CONFIG.outlines;
        if (cfg.mode === 'off' || this.bodiesData.length === 0) return;

        const ctx = this.linkCtx;
        const groups = this.collectNoteOutlineGroups();
        ctx.strokeStyle = this.linkColor;
        ctx.lineWidth = cfg.width;

        groups.forEach((pts, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            if (this.shouldCullOutlineGroup(pts)) return;

            const isHover = noteIndex === this.hoveredNoteIndex;
            ctx.lineWidth = isHover ? (cfg.hoverWidth ?? cfg.width * 2.5) : cfg.width;
            const R = pts[0].r + this.getOutlineRenderPadding();
            const useHull = cfg.mode === 'hull' ||
                           (cfg.mode === 'compare' && noteIndex % 2 === 0);

            if (useHull) {
                this.strokeHullOutline(pts, R, ctx);
            } else {
                this.strokeBlobOutline(pts, R, ctx);
            }
        });
    },

    // Option A: rounded convex hull membrane (offset polygon: arcs at vertices,
    // straight tangents along edges)
    traceHullOutlinePath(pts, R, ctx) {
        const hull = pts.length <= 2 ? pts : this.convexHull(pts);

        ctx.beginPath();
        if (hull.length === 1) {
            ctx.arc(hull[0].x, hull[0].y, R, 0, Math.PI * 2);
            return true;
        }

        const n = hull.length;
        for (let i = 0; i < n; i++) {
            const prev = hull[(i - 1 + n) % n];
            const p = hull[i];
            const next = hull[(i + 1) % n];
            // Outward normal angles of the incoming and outgoing edges
            const a1 = Math.atan2(-(p.x - prev.x), p.y - prev.y);
            const a2 = Math.atan2(-(next.x - p.x), next.y - p.y);
            ctx.arc(p.x, p.y, R, a1, a2);
        }
        ctx.closePath();
        return true;
    },

    strokeHullOutline(pts, R, ctx) {
        if (!this.traceHullOutlinePath(pts, R, ctx)) return;
        ctx.stroke();
    },

    fillHullOutline(pts, R, ctx) {
        if (!this.traceHullOutlinePath(pts, R, ctx)) return;
        ctx.fill();
    },

    // Monotone chain; returns hull ordered clockwise in screen coords
    convexHull(points) {
        const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        lower.pop();
        upper.pop();
        const hull = lower.concat(upper);
        return hull.length > 0 ? hull : [points[0]];
    },

    // Option C: exact union contour of per-dot circles. For every circle, the
    // angular sections buried inside sibling circles are removed; what remains
    // is the molecule's outer skin.
    strokeBlobOutline(pts, R, ctx) {
        const TAU = Math.PI * 2;

        pts.forEach((c, i) => {
            const covered = [];
            let fullyCovered = false;

            for (let j = 0; j < pts.length; j++) {
                if (j === i) continue;
                const dx = pts[j].x - c.x;
                const dy = pts[j].y - c.y;
                const d = Math.hypot(dx, dy);

                if (d < 0.5) {
                    // Coincident circles: draw only the first one
                    if (j < i) { fullyCovered = true; break; }
                    continue;
                }
                if (d >= 2 * R) continue;

                const half = Math.acos(d / (2 * R));
                const ang = Math.atan2(dy, dx);
                let s = ((ang - half) % TAU + TAU) % TAU;
                let e = ((ang + half) % TAU + TAU) % TAU;
                if (s <= e) covered.push([s, e]);
                else { covered.push([s, TAU]); covered.push([0, e]); }
            }
            if (fullyCovered) return;

            ctx.beginPath();
            if (covered.length === 0) {
                ctx.arc(c.x, c.y, R, 0, TAU);
                ctx.stroke();
                return;
            }

            covered.sort((a, b) => a[0] - b[0]);
            const merged = [];
            covered.forEach(iv => {
                const last = merged[merged.length - 1];
                if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
                else merged.push([iv[0], iv[1]]);
            });

            // Visible arcs are the gaps between covered intervals (with wraparound)
            for (let k = 0; k < merged.length; k++) {
                const start = merged[k][1];
                const end = (k + 1 < merged.length) ? merged[k + 1][0] : merged[0][0] + TAU;
                if (end - start < 0.01) continue;
                ctx.moveTo(c.x + R * Math.cos(start), c.y + R * Math.sin(start));
                ctx.arc(c.x, c.y, R, start, end);
            }
            ctx.stroke();
        });
    },

    buildWorld() {
        if (!this.engine || typeof Matter === 'undefined') return;

        this.bodiesData.forEach(item => Matter.World.remove(this.engine.world, item.body));
        
        const allConstraints = Matter.Composite.allConstraints(this.engine.world);
        allConstraints.forEach(constraint => Matter.World.remove(this.engine.world, constraint));

        this.bodiesData = [];
        this.siblingLinks = [];
        this.noteCenters = [];

        // No boundary walls: dots may drift past the canvas edge; the scroll
        // clamp follows live body positions, so roaming reaches them anywhere.
        const wrappers = document.querySelectorAll('.note-wrapper');

        wrappers.forEach((wrapper, noteIndex) => {
            const dotElements = wrapper.querySelectorAll('.layer-dot');
            if (dotElements.length === 0) return;

            const rect = wrapper.getBoundingClientRect();
            const globalX = rect.left + window.pageXOffset + rect.width / 2;
            const globalY = rect.top + window.pageYOffset + rect.height / 2;

            this.noteCenters[noteIndex] = { x: globalX, y: globalY };

            let nodeBodies = [];
            
            const clusterCfg = CONFIG.physics.cluster;
            const bodyCfg = CONFIG.physics.body;

            const totalDots = dotElements.length;
            const clusterRadius = totalDots === 1 ? 0 : clusterCfg.baseRadius + (totalDots * clusterCfg.radiusPerDot);

            const item = AppState.items[noteIndex];
            const authorCode = item?.authorCode || null;

            dotElements.forEach((dotElement, index) => {
                const angle = (index / totalDots) * Math.PI * 2;
                const physicsTargetX = globalX + Math.cos(angle) * clusterRadius;
                const physicsTargetY = globalY + Math.sin(angle) * clusterRadius;

                const startX = physicsTargetX + (Math.random() - 0.5) * clusterCfg.spawnJitter;
                const startY = physicsTargetY + (Math.random() - 0.5) * clusterCfg.spawnJitter;

                const body = Matter.Bodies.circle(startX, startY, bodyCfg.radius, { 
                    frictionAir: bodyCfg.frictionAir,
                    friction: bodyCfg.friction,
                    restitution: bodyCfg.restitution, 
                    density: bodyCfg.density
                });

                Matter.World.add(this.engine.world, body);
                nodeBodies.push(body);

                this.bodiesData.push({
                    body: body,
                    element: dotElement,
                    tag: dotElement.dataset.tag || null,
                    authorCode: authorCode,
                    noteIndex: noteIndex,
                    overrideTarget: null,
                    smoothTarget: null,
                    onBankGrid: false,
                    cssOriginX: globalX,
                    cssOriginY: globalY,
                    physicsTargetX: physicsTargetX,
                    physicsTargetY: physicsTargetY,
                    // Dot's cluster offset from the note center, reused by the workspace grid
                    offsetX: physicsTargetX - globalX,
                    offsetY: physicsTargetY - globalY
                });
            });

            // Sibling springs: nearest pairs are linked first, but no dot may
            // exceed maxLinksPerDot. Dense enough to feel molecular, never a hairball.
            const linkCfg = CONFIG.warehouse.linkage;
            const candidates = [];
            for (let i = 0; i < nodeBodies.length; i++) {
                for (let j = i + 1; j < nodeBodies.length; j++) {
                    const ddx = nodeBodies[i].position.x - nodeBodies[j].position.x;
                    const ddy = nodeBodies[i].position.y - nodeBodies[j].position.y;
                    candidates.push({ i, j, dist: ddx * ddx + ddy * ddy });
                }
            }
            candidates.sort((a, b) => a.dist - b.dist);

            const degree = new Array(nodeBodies.length).fill(0);
            candidates.forEach(pair => {
                if (degree[pair.i] >= linkCfg.maxLinksPerDot ||
                    degree[pair.j] >= linkCfg.maxLinksPerDot) return;

                const constraint = Matter.Constraint.create({
                    bodyA: nodeBodies[pair.i],
                    bodyB: nodeBodies[pair.j],
                    length: linkCfg.siblingLength,
                    stiffness: linkCfg.siblingStiffness,
                    damping: linkCfg.siblingDamping
                });
                Matter.World.add(this.engine.world, constraint);
                this.siblingLinks.push({
                    bodyA: nodeBodies[pair.i],
                    bodyB: nodeBodies[pair.j],
                    noteIndex: noteIndex,
                    constraint
                });
                degree[pair.i]++;
                degree[pair.j]++;
            });
        });

        ActionWarehouse.refreshWorkspaceGrid();
        ActionWarehouse.updateDotFocusFilter();
        this.captureRenderSnapshot();
    },

    getLiveWrapperOrigin(noteIndex, cache) {
        if (cache.has(noteIndex)) return cache.get(noteIndex);

        const wrapper = document.querySelectorAll('.note-wrapper')[noteIndex];
        if (!wrapper) return null;

        const rect = wrapper.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;

        const origin = {
            x: rect.left + window.pageXOffset + rect.width / 2,
            y: rect.top + window.pageYOffset + rect.height / 2
        };
        cache.set(noteIndex, origin);
        return origin;
    },

    syncDotTransforms() {
        const wrapperOrigins = new Map();

        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;

            const origin = this.getLiveWrapperOrigin(item.noteIndex, wrapperOrigins);
            if (!origin) return;

            const pos = this.getDisplayPosition(item);
            if (!pos) return;

            const dx = pos.x - origin.x;
            const dy = pos.y - origin.y;

            item.element.style.setProperty('--phys-x', `${dx}px`);
            item.element.style.setProperty('--phys-y', `${dy}px`);
        });
    },

    syncLoop() {
        requestAnimationFrame(() => this.syncLoop());

        if (MacroMesoBridge.isAnimating() && !MacroMesoBridge.isZoomOutActive()) return;

        const macroVisualActive = MacroMesoBridge.isMacroVisualActive();
        const depthFocusLinks = typeof DepthFocusLinks !== 'undefined' &&
            DepthFocusLinks.shouldDraw();
        const skipCanvasDraw = this.shouldThrottleMacroCanvas();

        if (!macroVisualActive && !depthFocusLinks) {
            if (this.isActive) {
                this.bodiesData.forEach(item => {
                    item.element.style.setProperty('--phys-x', '0px');
                    item.element.style.setProperty('--phys-y', '0px');
                });
                this.isActive = false;
            }
            if (this.linkCtx) {
                this.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            }
            return;
        }

        if (macroVisualActive) {
            this.isActive = true;
            this.syncDotTransforms();
        } else {
            this.isActive = false;
        }

        if (!this.linkCtx || skipCanvasDraw) return;

        this.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        if (macroVisualActive) {
            this.drawNoteBackings();
            this.drawSiblingLinks();
            if (typeof DepthFocusLinks !== 'undefined' && DepthFocusLinks.shouldDrawMacro()) {
                DepthFocusLinks.drawMacro(this.linkCtx, this.bodiesData);
            }
            this.drawNoteOutlines();
            this.updateMoleculeHoverState();
        }

        if (depthFocusLinks) {
            DepthFocusLinks.draw(this.linkCtx);
        }
    },

    flushMacroCanvas() {
        if (!this.linkCtx) return;
        this.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.drawNoteBackings();
        this.drawSiblingLinks();
        if (typeof DepthFocusLinks !== 'undefined' && DepthFocusLinks.shouldDrawMacro()) {
            DepthFocusLinks.drawMacro(this.linkCtx, this.bodiesData);
        }
        this.drawNoteOutlines();
    },

    // Axis-aligned bounds of a note's hull in viewport coordinates
    moleculeViewportBounds(noteIndex) {
        const pad = CONFIG.outlines.padding + CONFIG.physics.body.radius;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        this.bodiesData.forEach(item => {
            if (item.noteIndex !== noteIndex) return;
            const x = item.body.position.x - scrollX;
            const y = item.body.position.y - scrollY;
            minX = Math.min(minX, x - pad);
            minY = Math.min(minY, y - pad);
            maxX = Math.max(maxX, x + pad);
            maxY = Math.max(maxY, y + pad);
        });

        if (minX === Infinity) return null;
        return { minX, minY, maxX, maxY };
    },

    hitTestMolecule(clientX, clientY) {
        const notes = new Set(this.bodiesData.map(d => d.noteIndex));
        let hit = -1;
        let bestDist = Infinity;
        const pad = CONFIG.depth.moleculeClickPadding ?? 16;

        notes.forEach(noteIndex => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            const b = this.moleculeViewportBounds(noteIndex);
            if (!b) return;
            if (clientX < b.minX - pad || clientX > b.maxX + pad ||
                clientY < b.minY - pad || clientY > b.maxY + pad) return;

            const cx = (b.minX + b.maxX) * 0.5;
            const cy = (b.minY + b.maxY) * 0.5;
            const dist = Math.hypot(clientX - cx, clientY - cy);
            if (dist < bestDist) {
                bestDist = dist;
                hit = noteIndex;
            }
        });

        return hit;
    },

    canAcceptMoleculeClick(e) {
        if (DepthController.currentLevel !== 1) return false;
        if (!this.bodiesData.length) return false;
        if (ActionWarehouse.dragState) return false;
        if (typeof DepthTransitionOrchestrator !== 'undefined' && DepthTransitionOrchestrator.isRunning()) {
            return false;
        }
        if (typeof SpatialNavigation !== 'undefined' &&
            (SpatialNavigation.pan.active || SpatialNavigation.spaceHeld)) {
            return false;
        }
        const target = e?.target;
        if (target?.closest?.('.warehouse-shell, .action-block, .action-warehouse')) return false;
        if (target?.closest?.('.site-navigation-layers, .site-navigation-maps')) return false;
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
            return false;
        }
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) return false;
        return true;
    },

    initMoleculePointer() {
        this.onMoleculePointerDown = (e) => {
            if (e.button !== 0) return;
            if (!this.canAcceptMoleculeClick(e)) return;

            const noteIndex = this.hitTestMolecule(e.clientX, e.clientY);
            if (noteIndex < 0) return;

            this.repulsionHoldNoteIndex = noteIndex;
            this.moleculeClickIntent = {
                noteIndex,
                startX: e.clientX,
                startY: e.clientY
            };
        };

        this.onMoleculePointerUp = (e) => {
            const intent = this.moleculeClickIntent;
            this.moleculeClickIntent = null;
            this.repulsionHoldNoteIndex = -1;

            if (!intent || e.button !== 0) return;
            if (!this.canAcceptMoleculeClick(e)) return;

            const moved = Math.hypot(e.clientX - intent.startX, e.clientY - intent.startY);
            const threshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved >= threshold) return;

            const stillOver = this.hitTestMolecule(e.clientX, e.clientY);
            if (stillOver !== intent.noteIndex) return;

            const wrappers = document.querySelectorAll('.note-wrapper');
            const wrapper = wrappers[intent.noteIndex];
            if (!wrapper) return;

            if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
                if (typeof ArtifactInspector !== 'undefined') {
                    ArtifactInspector.openMacroNoteAt(e.clientX, e.clientY);
                }
                return;
            }

            if (typeof DepthTransitionOrchestrator === 'undefined') return;

            DepthTransitionOrchestrator.runNoteClick(intent.noteIndex, wrapper);
        };

        document.addEventListener('pointerdown', this.onMoleculePointerDown);
        document.addEventListener('pointerup', this.onMoleculePointerUp);
        document.addEventListener('pointercancel', this.onMoleculePointerUp);
    },

    truncateHoverWords(text, maxWords) {
        if (!text || maxWords <= 0) return '';
        const words = text.trim().split(/\s+/).filter(Boolean);
        if (words.length <= maxWords) return words.join(' ');
        return words.slice(0, maxWords).join(' ');
    },

    noteHasAttachedBlocks(item) {
        if (!item) return false;
        if (Array.isArray(item.tags) && item.tags.length > 0) return true;
        if (String(item.authorCode || item.authorFullName || '').trim()) return true;
        if (String(item.typology || '').trim()) return true;
        return false;
    },

    countAttachedHoverBlocks(item) {
        if (!item) return 0;
        let count = 0;
        if (Array.isArray(item.tags) && item.tags.length > 0) {
            count += item.tags.length;
        }
        if (String(item.typology || '').trim()) count += 1;
        if (String(item.authorCode || item.authorFullName || '').trim()) count += 1;
        return count;
    },

    resolveMoleculeHoverBlocksPerRow(item) {
        const maxPerRow = CONFIG.depth?.moleculeHoverBlocksPerRow ?? 5;
        const singleRowMax = CONFIG.depth?.moleculeHoverBlocksSingleRowMax ?? 6;
        const count = this.countAttachedHoverBlocks(item);
        return count > 0 && count <= singleRowMax ? count : maxPerRow;
    },

    shouldUseBlocksHover(item, noteIndex) {
        const mode = CONFIG.depth?.moleculeHoverMode ?? 'mixed';
        if (mode === 'title') return false;
        if (mode === 'blocks') return true;
        const pct = Math.max(0, Math.min(100, CONFIG.depth?.moleculeHoverBlocksPercent ?? 50));
        const key = String(item?.id ?? noteIndex ?? '');
        let h = 2166136261;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return ((h >>> 0) % 100) < pct;
    },

    clearMoleculeHoverLabel(label) {
        if (!label) return;
        label.textContent = '';
        label.replaceChildren();
        label.classList.remove('is-title-chip', 'is-blocks-row', 'note-title', 'note-body');
    },

    _measureSiteGridTokenPx(tokenName, property = 'height') {
        if (typeof measureSiteGridTokenPx === 'function') {
            return measureSiteGridTokenPx(tokenName, property);
        }
        const root = document.documentElement;
        const raw = getComputedStyle(root).getPropertyValue(tokenName).trim();
        if (!raw) return 0;

        let probe = root.querySelector('[data-site-grid-measure]');
        if (!probe) {
            probe = document.createElement('div');
            probe.dataset.siteGridMeasure = '';
            probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;overflow:hidden;';
            root.appendChild(probe);
        }
        probe.style.width = property === 'width' ? raw : '0';
        probe.style.height = property === 'height' ? raw : '0';
        const px = probe.getBoundingClientRect()[property === 'width' ? 'width' : 'height'];
        probe.style.width = '0';
        probe.style.height = '0';
        return px;
    },

    _getSiteGridPaddingPx() {
        return this._measureSiteGridTokenPx('--site-grid-padding', 'height');
    },

    _getSiteGridRowStridePx() {
        const cellH = this._measureSiteGridTokenPx('--site-grid-cell-h', 'height');
        const gap = this._measureSiteGridTokenPx('--site-grid-gap', 'height');
        return cellH + gap;
    },

    _snapViewportYToShellRowTop(viewportY) {
        const padding = this._getSiteGridPaddingPx();
        const stride = this._getSiteGridRowStridePx();
        if (stride <= 0) return viewportY;

        const rowCount = CONFIG.siteGrid?.rows ?? 12;
        const relative = viewportY - padding;
        const rowIndex = Math.max(0, Math.min(rowCount - 1, Math.floor(relative / stride)));
        return padding + rowIndex * stride;
    },

    positionMoleculeHoverLabel(label, bounds, isLtr) {
        if (!label || !bounds) return;
        label.style.top = `${this._snapViewportYToShellRowTop(bounds.minY)}px`;
        label.style.left = `${isLtr ? bounds.minX : bounds.maxX}px`;
    },

    resolveMoleculeHoverTitle(wrapper) {
        if (!wrapper) return null;
        const maxWords = CONFIG.depth?.moleculeHoverMaxWords ?? 10;
        const titleEl = wrapper.querySelector('.layer-full .note-title');
        const title = titleEl?.textContent?.trim();
        if (title) {
            const firstLine = title.split(/\r?\n/)[0].trim();
            if (firstLine) {
                return {
                    text: this.truncateHoverWords(firstLine, maxWords),
                    role: 'title'
                };
            }
        }
        const bodyEl = wrapper.querySelector('.layer-full .note-body');
        const body = bodyEl?.textContent?.trim();
        if (body) {
            const firstLine = body.split(/\r?\n/)[0].trim();
            if (firstLine) {
                return {
                    text: this.truncateHoverWords(firstLine, maxWords),
                    role: 'body'
                };
            }
        }
        return null;
    },

    updateMoleculeHoverState() {
        const label = this.moleculeHoverTitle;
        const warehouse = typeof ActionWarehouse !== 'undefined' ? ActionWarehouse : null;

        const hideHover = () => {
            this.clearMoleculeHoverLabel(label);
            label?.classList.remove('is-visible');
            warehouse?.clearMoleculeHoverMessage();
            this.hoveredNoteIndex = -1;
            this.moleculeHoverPinnedIndex = -1;
            document.body.classList.remove('is-molecule-hover');
        };

        if (DepthController.currentLevel !== 1 || this.bodiesData.length === 0) {
            hideHover();
            return;
        }

        if (document.body.classList.contains('is-space-pan') ||
            document.body.classList.contains('is-canvas-panning')) {
            hideHover();
            return;
        }

        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(this.mouseClientX, this.mouseClientY)) {
            hideHover();
            return;
        }

        const noteIndex = this.hitTestMolecule(this.mouseClientX, this.mouseClientY);
        this.hoveredNoteIndex = noteIndex;
        document.body.classList.toggle('is-molecule-hover', noteIndex >= 0);

        if (!label) return;

        if (noteIndex < 0) {
            this.moleculeHoverPinnedIndex = -1;
            label.classList.remove('is-visible');
            warehouse?.clearMoleculeHoverMessage();
            return;
        }

        if (noteIndex === this.moleculeHoverPinnedIndex && label.classList.contains('is-visible')) {
            return;
        }

        const bounds = this.moleculeViewportBounds(noteIndex);
        const wrapper = document.querySelectorAll('.note-wrapper')[noteIndex];
        const item = typeof MicroMock !== 'undefined' ? MicroMock.resolveItem(wrapper) : null;
        const isLtr = wrapper?.classList.contains('is-note-ltr');
        const hoverMode = CONFIG.depth?.moleculeHoverMode ?? 'title';
        const useBlocks = hoverMode !== 'title'
            && item
            && this.noteHasAttachedBlocks(item)
            && this.shouldUseBlocksHover(item, noteIndex)
            && typeof MicroMock !== 'undefined';

        this.clearMoleculeHoverLabel(label);
        warehouse?.clearMoleculeHoverMessage();

        if (useBlocks) {
            const blocksPerRow = this.resolveMoleculeHoverBlocksPerRow(item);
            label.style.setProperty('--molecule-hover-blocks-per-row', String(blocksPerRow));
            label.innerHTML = MicroMock.buildTagsRowHTML(item);
            label.classList.add('is-blocks-row');
        } else {
            const hoverContent = this.resolveMoleculeHoverTitle(wrapper);
            if (!hoverContent?.text) {
                label.classList.remove('is-visible');
                this.moleculeHoverPinnedIndex = -1;
                return;
            }
            label.textContent = hoverContent.text;
            label.classList.add('is-title-chip');
            label.classList.add(hoverContent.role === 'body' ? 'note-body' : 'note-title');
        }

        if (!bounds) {
            label.classList.remove('is-visible');
            this.moleculeHoverPinnedIndex = -1;
            return;
        }

        label.classList.toggle('is-note-ltr', isLtr);
        label.classList.toggle('is-note-rtl', !isLtr);
        this.positionMoleculeHoverLabel(label, bounds, isLtr);
        label.classList.add('is-visible');
        this.moleculeHoverPinnedIndex = noteIndex;
    }
};

/* ==========================================================================
   08. ACTION WAREHOUSE (BOTTOM PORTAL DOCK)
   Draggable action blocks. Dots with a matching tag orbit deployed blocks.
   Block lifecycle: docked -> active (dragging / deployed) -> docked.
   ========================================================================== */
const ActionWarehouse = {
    shellElement: null,
    dockElement: null,
    depthBlockBarElement: null,
    trayScrollElement: null,
    trayFramesElement: null,
    trayBlocksElement: null,
    blocks: [],         // { nestedBlocks?, nestedIn?, ... }
    dragState: null,
    workspaceCenters: null,
    workspaceSlotLayout: null,  // frozen bank slots — only void width changes when blocks join
    workspaceGridRush: null,    // null | 'out' (→ workspace) | 'in' (→ original grid)
    workspaceGridRushUntil: 0,
    stretchedNotes: new Set(),
    stretchAxisByNote: new Map(),      // noteIndex → live chord geometry (rebuilt each tick)
    stretchBindingByNote: new Map(),   // noteIndex → stable block/dot/slot contract (persists across ticks)
    stretchGroupCounts: new Map(),     // block-pair key → molecule count (detect group changes)
    orbitAngleByNote: new Map(),       // noteIndex → smoothed ring angle (single-block stability)
    orbitRingCountByBlock: new Map(),  // block tag → ring dot count (detect layout changes)
    _prevOrbitBlockCount: 0,
    _prevStretchedCount: 0,
    _orbitTransitionTicks: 0,
    _kinematicEntryTicks: 0,
    _prevKinematicActive: false,
    _depthDeployAnimating: null,
    _macroIndicationAnimating: null,
    _macroIndicationGhost: null,
    _macroIndicationBlock: null,
    filteredNoteIndices: new Set(),
    filterExitByNote: new Map(),   // noteIndex → { phase: 'hollow'|'peel', phaseStart }
    _navigationMapBlockCount: 0,

    statisticsElement: null,
    messagePortElement: null,
    hoverPortElement: null,
    defaultMessageText: '',
    moleculeHoverMessageActive: false,
    hoverTypewriterTimer: null,
    hoverTypewriterGeneration: 0,
    hoverTypewriterNoteIndex: -1,
    mapMountElement: null,
    statisticsRowElements: null,
    statisticsDisplayValues: new Map(),
    statisticsTargetValues: new Map(),
    statisticsAnimationFrame: null,
    statisticsAnimationStartedAt: 0,
    statisticsAnimationDurationMs: 520,
    _wordPanelWords: null,

    isWordPanelTheme() {
        return (CONFIG.theme?.mode || 'default') === 'censored';
    },

    isWordPanelLevelActive(level) {
        const resolved = level ?? (typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1);
        return this.isWordPanelTheme() && resolved === 3;
    },

    ensureWordPanel() {
        if (!this.trayBlocksElement) return;
        if (!this._wordPanelWords) this._wordPanelWords = new Set();
    },

    syncWordPanelMode(level) {
        const active = this.isWordPanelLevelActive(level);
        document.body.classList.toggle('is-word-panel-mode', active);
        this.shellElement?.classList.toggle('is-word-panel', active);
        this.trayBlocksElement?.classList.toggle('word-panel', active);
        if (active) {
            this.ensureWordPanel();
            this.updateWordPanelMessage();
        } else if (this.messagePortElement) {
            const text = CONFIG.warehouse?.dock?.messageText || 'גררו להפעלה';
            this.messagePortElement.textContent = text;
        }
    },

    updateWordPanelMessage() {
        if (!this.messagePortElement) return;
        const text = CONFIG.theme?.wordPanelMessage
            || CONFIG.warehouse?.dock?.messageText
            || 'החזיקו על מילה לגילוי';
        this.messagePortElement.textContent = text;
    },

    addCommittedWord(text) {
        const key = String(text || '').trim();
        if (!key || !this.isWordPanelTheme()) return;

        this.ensureWordPanel();
        if (this._wordPanelWords.has(key)) return;

        this._wordPanelWords.add(key);

        const chip = document.createElement('div');
        chip.className = 'word-panel__chip general-t';
        chip.dataset.wordKey = key;
        chip.textContent = key;
        chip.setAttribute('dir', 'auto');
        this.trayBlocksElement.appendChild(chip);

        requestAnimationFrame(() => this.updateScrollReserve());
    },

    clearWordPanel() {
        if (!this.trayBlocksElement) return;
        this.trayBlocksElement.querySelectorAll('.word-panel__chip').forEach((el) => el.remove());
        if (this._wordPanelWords) this._wordPanelWords.clear();
    },

    init() {
        this.ensurePhysicsMaps();
        const dockCfg = CONFIG.warehouse.dock;

        this.refreshDisplayTokens();

        const messageText = dockCfg?.messageText || 'גררו להפעלה';
        this.defaultMessageText = messageText;
        this.shellElement = document.createElement('div');
        this.shellElement.classList.add('warehouse-shell');
        this.shellElement.dataset.siteLayer = 'warehouse';
        this.shellElement.innerHTML = `
            <div class="warehouse-shell__corners" aria-hidden="true">
                <span class="warehouse-shell__corner warehouse-shell__corner--tl"></span>
                <span class="warehouse-shell__corner warehouse-shell__corner--tr"></span>
                <span class="warehouse-shell__corner warehouse-shell__corner--bl"></span>
                <span class="warehouse-shell__corner warehouse-shell__corner--br"></span>
            </div>
            <button type="button" class="warehouse-reset general-t" aria-label="נקה לוח">נקה לוח</button>
            <div class="depth-block-bar__drop-zone" aria-hidden="true">
                <div class="depth-block-bar__corners warehouse-panel-corners" aria-hidden="true">
                    <span class="warehouse-panel-corner warehouse-panel-corner--tl"></span>
                    <span class="warehouse-panel-corner warehouse-panel-corner--tr"></span>
                    <span class="warehouse-panel-corner warehouse-panel-corner--bl"></span>
                    <span class="warehouse-panel-corner warehouse-panel-corner--br"></span>
                </div>
            </div>
            <div class="depth-block-bar" aria-hidden="true"></div>
            <div class="warehouse-layout">
                <div class="warehouse-dock">
                    <div class="warehouse-panel-corners warehouse-panel-corners--dock" aria-hidden="true">
                        <span class="warehouse-panel-corner warehouse-panel-corner--tr"></span>
                        <span class="warehouse-panel-corner warehouse-panel-corner--br"></span>
                    </div>
                    <div class="warehouse-statistics general-t" aria-live="polite"></div>
                    <div class="warehouse-message-band">
                        <div class="warehouse-hover-port general-t" aria-live="polite"></div>
                        <div class="warehouse-message-band__divider" aria-hidden="true"></div>
                        <div class="warehouse-message-port general-t">${messageText}</div>
                    </div>
                    <div class="action-warehouse">
                        <div class="warehouse-tray-layout">
                            <div class="warehouse-tray-section warehouse-tray-section--frames"></div>
                            <div class="warehouse-tray-divider" aria-hidden="true"></div>
                            <div class="warehouse-scroll">
                                <div class="warehouse-tray-section warehouse-tray-section--blocks"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="warehouse-map" id="warehouse-map-mount" aria-hidden="true">
                    <div class="warehouse-panel-corners warehouse-panel-corners--map" aria-hidden="true">
                        <span class="warehouse-panel-corner warehouse-panel-corner--tl"></span>
                        <span class="warehouse-panel-corner warehouse-panel-corner--bl"></span>
                    </div>
                </div>
            </div>
        `;
        this.dockElement = this.shellElement.querySelector('.action-warehouse');
        this.depthBlockBarElement = this.shellElement.querySelector('.depth-block-bar');
        this.statisticsElement = this.shellElement.querySelector('.warehouse-statistics');
        this.hoverPortElement = this.shellElement.querySelector('.warehouse-hover-port');
        this.messagePortElement = this.shellElement.querySelector('.warehouse-message-port');
        this.mapMountElement = this.shellElement.querySelector('#warehouse-map-mount');
        if (this.depthBlockBarElement) {
            this.depthBlockBarElement.dataset.siteLayer = 'blockBar';
        }
        this.trayScrollElement = this.shellElement.querySelector('.warehouse-scroll');
        this.trayFramesElement = this.shellElement.querySelector('.warehouse-tray-section--frames');
        this.trayBlocksElement = this.shellElement.querySelector('.warehouse-tray-section--blocks');
        this.trayScrollElement.addEventListener('wheel', (e) => this.onTrayWheel(e), { passive: false, capture: true });
        this.shellElement.querySelector('.warehouse-reset')
            .addEventListener('click', () => this.resetAll());
        const resetBtn = this.shellElement.querySelector('.warehouse-reset');
        document.body.appendChild(this.shellElement);

        this.resizeObserver = new ResizeObserver(() => this.updateScrollReserve());
        this.resizeObserver.observe(this.shellElement);
        window.addEventListener('resize', () => this.updateScrollReserve());
        this.updateScrollReserve();
    },

    cancelHoverTypewriter() {
        this.hoverTypewriterGeneration += 1;
        if (this.hoverTypewriterTimer !== null) {
            clearTimeout(this.hoverTypewriterTimer);
            this.hoverTypewriterTimer = null;
        }
    },

    playHoverTypewriter(text) {
        if (!this.hoverPortElement) return;
        this.cancelHoverTypewriter();
        const generation = this.hoverTypewriterGeneration;
        const msPerChar = CONFIG.warehouse?.dock?.messageTypewriterMsPerChar ?? 35;
        this.hoverPortElement.textContent = '';
        if (!text) return;

        let index = 0;
        const step = () => {
            if (generation !== this.hoverTypewriterGeneration) return;
            index += 1;
            this.hoverPortElement.textContent = text.slice(0, index);
            if (index < text.length) {
                this.hoverTypewriterTimer = setTimeout(step, msPerChar);
            } else {
                this.hoverTypewriterTimer = null;
            }
        };
        step();
    },

    setMoleculeHoverMessage(text, { isLtr = false, noteIndex = -1 } = {}) {
        if (!this.hoverPortElement || !text) return;
        if (this.moleculeHoverMessageActive && this.hoverTypewriterNoteIndex === noteIndex) return;

        this.hoverTypewriterNoteIndex = noteIndex;
        this.hoverPortElement.classList.toggle('is-note-ltr', isLtr);
        this.hoverPortElement.classList.toggle('is-note-rtl', !isLtr);
        this.hoverPortElement.classList.add('is-active');
        this.moleculeHoverMessageActive = true;
        this.playHoverTypewriter(text);
    },

    clearMoleculeHoverMessage() {
        if (!this.hoverPortElement || !this.moleculeHoverMessageActive) return;
        this.cancelHoverTypewriter();
        this.hoverTypewriterNoteIndex = -1;
        this.hoverPortElement.textContent = '';
        this.hoverPortElement.classList.remove('is-active', 'is-note-ltr', 'is-note-rtl');
        this.moleculeHoverMessageActive = false;
    },

    refreshDisplayTokens() {
        const dockCfg = CONFIG.warehouse.dock;
        const frameCfg = CONFIG.warehouse.frame.filter;
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const blockGlyph = scale(CONFIG.warehouse.blockGlyphSize);
        const frameHeight = blockH + frameCfg.paddingY * 2;
        const frameAlignOffset = (frameHeight - blockH) / 2;
        const frameShellWidth = this.computeFrameShellWidth(frameCfg.slotMinWidth);

        document.body.style.setProperty('--block-height', `${blockH}px`);
        document.body.style.setProperty('--block-glyph-size', `${blockGlyph}px`);
        document.body.style.setProperty('--frame-height', `${frameHeight}px`);
        document.body.style.setProperty('--frame-radius', `${frameCfg.borderRadius}px`);
        document.body.style.setProperty('--frame-slot-min-width', `${frameCfg.slotMinWidth}px`);
        document.body.style.setProperty('--frame-padding-x', `${frameCfg.paddingX}px`);
        document.body.style.setProperty('--frame-padding-y', `${frameCfg.paddingY}px`);
        document.body.style.setProperty('--frame-padding-left', `${frameCfg.paddingLeft}px`);
        document.body.style.setProperty('--frame-nested-gap', `${frameCfg.nestedGap}px`);
        document.body.style.setProperty('--frame-align-offset', `${frameAlignOffset}px`);
        document.body.style.setProperty('--frame-shell-width', `${frameShellWidth}px`);
        document.documentElement.style.setProperty('--warehouse-width', `${dockCfg.widthRatio * 100}%`);
        document.documentElement.style.setProperty('--warehouse-radius', `${scale(dockCfg.borderRadius)}px`);
        document.documentElement.style.setProperty('--warehouse-outline', `${dockCfg.outlineWidth}pt`);
        document.documentElement.style.setProperty('--warehouse-bottom-offset', `${scale(dockCfg.bottomOffset)}px`);
        document.documentElement.style.setProperty(
            '--warehouse-tray-max-height',
            'var(--warehouse-block-panel-h, calc(100% - var(--warehouse-message-row-h)))'
        );
    },

    // L1: grid-aligned chrome below canvas (warehouse shell top); L2/L3: measured dock footprint
    getScrollReserve() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (level === 1 && typeof getSiteL1BottomChromePx === 'function') {
            return getSiteL1BottomChromePx();
        }
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--warehouse-reserve');
        return parseFloat(raw) || 0;
    },

    updateScrollReserve() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (!this.shellElement || level < 1) {
            document.documentElement.style.setProperty('--warehouse-reserve', '0px');
            return;
        }
        const rect = this.shellElement.getBoundingClientRect();
        const bottomOffset = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--warehouse-bottom-offset')
        ) || 0;
        let reserve = Math.ceil(rect.height + bottomOffset);
        if (level >= 2 && this.depthBlockBarElement?.childElementCount > 0) {
            reserve += Math.ceil(this.depthBlockBarElement.getBoundingClientRect().height + scale(8));
        }
        document.documentElement.style.setProperty('--warehouse-reserve', `${reserve}px`);
    },

    showDepthDropIndicator() {
        this.shellElement?.classList.remove('is-depth-drop-fading');
        this.shellElement?.classList.add('is-depth-drop-active');
    },

    fadeDepthDropIndicator() {
        const shell = this.shellElement;
        if (!shell?.classList.contains('is-depth-drop-active')) {
            shell?.classList.remove('is-depth-drop-fading');
            return;
        }
        shell.classList.remove('is-depth-drop-active');
        shell.classList.add('is-depth-drop-fading');
        clearTimeout(this._depthDropFadeTimer);
        this._depthDropFadeTimer = setTimeout(() => {
            shell.classList.remove('is-depth-drop-fading');
        }, 280);
    },

    clearDepthDropIndicator() {
        clearTimeout(this._depthDropFadeTimer);
        this.shellElement?.classList.remove('is-depth-drop-active', 'is-depth-drop-fading');
    },

    shouldLeaveEmptyDockSlot() {
        return typeof DepthController !== 'undefined' && DepthController.currentLevel === 3;
    },

    markSlotDockReserve(block) {
        const slot = block?.slotElement;
        if (!slot || block.nestedIn) return;

        this.clearSlotReserve(block);

        const { width, height } = this.blockMetrics(block);
        slot.style.width = `${Math.ceil(width)}px`;
        slot.style.height = `${Math.ceil(height)}px`;

        const reserve = block.element.cloneNode(true);
        reserve.classList.remove(
            'is-dragging', 'is-deployed', 'is-selected', 'is-removable',
            'is-returning', 'is-nested', 'is-depth-ui-mounted', 'is-deploying-to-bar',
            'is-macro-indication', 'is-dock-irrelevant'
        );
        reserve.classList.add('is-dock-reserve');
        reserve.removeAttribute('id');
        reserve.setAttribute('aria-hidden', 'true');
        reserve.style.transform = '';
        reserve.querySelector('.block-remove-mark')?.remove();

        slot.appendChild(reserve);
        block._dockReserveEl = reserve;
        this.restoreDockTrayOrder();
    },

    clearSlotReserve(block) {
        block?._dockReserveEl?.remove();
        delete block?._dockReserveEl;
    },

    markSlotEmpty(block) {
        if (!this.shouldLeaveEmptyDockSlot()) {
            this.markSlotDockReserve(block);
            return;
        }

        const slot = block?.slotElement;
        if (!slot || block.nestedIn) return;
        this.clearSlotReserve(block);
        const { width, height } = this.blockMetrics(block);
        slot.style.width = `${Math.ceil(width)}px`;
        slot.style.height = `${Math.ceil(height)}px`;
        let ghost = slot.querySelector('.block-slot__ghost');
        if (!ghost) {
            ghost = document.createElement('div');
            ghost.className = 'block-slot__ghost general-t';
            slot.appendChild(ghost);
        }
        ghost.innerHTML = this.buildSlotGhostInnerHTML(block);
        slot.classList.add('is-empty');
        this.restoreDockTrayOrder();
    },

    clearSlotEmpty(block) {
        const slot = block?.slotElement;
        if (!slot) return;
        this.clearSlotReserve(block);
        slot.classList.remove('is-empty');
        slot.querySelector('.block-slot__ghost')?.remove();
        slot.style.removeProperty('width');
        slot.style.removeProperty('height');
    },

    buildSlotGhostInnerHTML(block) {
        const label = this.getBlockGhostLabel(block);
        const safeLabel = typeof escapeTypologyHtml === 'function'
            ? escapeTypologyHtml(label)
            : String(label || '').replace(/</g, '&lt;');
        return `<span class="block-slot__glyph-ring" aria-hidden="true"></span>` +
            `<span class="block-slot__ghost-label">${safeLabel}</span>`;
    },

    getBlockGhostLabel(block) {
        if (block.type === 'author') return block.author || '';
        if (block.type === 'typology') {
            return typeof getTypologyLabel === 'function'
                ? getTypologyLabel(block.typology)
                : (block.typology || '');
        }
        return block.tag || '';
    },

    syncBlockRemovable(block) {
        if (!block?.element || block.type === 'frame') return;
        const deployed = block.element.classList.contains('is-deployed');
        const selected = block.element.classList.contains('is-selected');
        const depthUi = this.isDepthUiLevel();
        const removable = deployed && !block.nestedIn && (!depthUi || selected);
        block.element.classList.toggle('is-removable', removable);
    },

    syncAllBlockRemovables() {
        this.blocks.forEach(block => this.syncBlockRemovable(block));
    },

    wireBlockRemoveMark(block) {
        const removeMark = document.createElement('span');
        removeMark.className = 'block-remove-mark';
        removeMark.setAttribute('aria-hidden', 'true');
        removeMark.textContent = '×';
        removeMark.addEventListener('pointerdown', (e) => e.stopPropagation());
        removeMark.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.dragState) return;
            if (!block.element.classList.contains('is-removable')) return;
            this.returnToDock(block);
        });
        block.element.insertBefore(removeMark, block.element.firstChild);
    },

    // Wheel over the tray scrolls vertically through all tag blocks
    onTrayWheel(e) {
        const tray = this.trayScrollElement;
        if (!tray || tray.scrollHeight <= tray.clientHeight) return;

        e.preventDefault();
        e.stopPropagation();
        tray.scrollTop += e.deltaY;
    },

    // Returns every active block to its dock slot (or clears word panel in censored theme)
    resetAll() {
        if (this.dragState) return;

        if (this.isWordPanelLevelActive()) {
            this.clearWordPanel();
            if (typeof NoteCensor !== 'undefined' && NoteCensor._clearAllHoverState) {
                NoteCensor._clearAllHoverState();
            }
            return;
        }

        this.clearMacroIndicationGhost();
        this.ensurePhysicsMaps();
        this.stretchBindingByNote.clear();
        this.stretchGroupCounts.clear();
        this.orbitAngleByNote.clear();
        this.orbitRingCountByBlock.clear();
        this.filteredNoteIndices.clear();
        this.filterExitByNote.clear();
        this.workspaceSlotLayout = null;
        this.restoreAllFilterVisuals(PhysicsEngine.bodiesData);

        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            DepthV2.clearFringeZone();
            if (DepthController.currentLevel >= 2) {
                DepthV2.relayoutForFilterChange({ force: true });
            }
        }

        this.unmountDeployedBlocksFromDepthBar();

        this.blocks.forEach(block => {
            if (block.state !== 'active' || block.nestedIn) return;
            this.returnToDock(block);
        });
    },

    isPointOverDock(x, y) {
        const dock = this.shellElement?.querySelector('.warehouse-dock');
        if (!dock) return false;
        const rect = dock.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    // Called once the data pipeline resolves (tag dictionary is ready)
    populate() {
        if (CONFIG.warehouse.enableFilterFrame) {
            this.createBlock({ type: 'frame', frameKind: 'filter' });
        }

        AppState.tagColorsMap.forEach((color, tagName) => {
            this.createBlock({ type: 'tag', tag: tagName, color: color });
        });

        const retired = new Set(CONFIG.data.retiredTypologies || []);
        const typologies = new Set();
        AppState.items.forEach(item => {
            if (item.typology && !retired.has(item.typology)) typologies.add(item.typology);
        });
        [...typologies]
            .sort((a, b) => getTypologySortIndex(a) - getTypologySortIndex(b) || a.localeCompare(b))
            .forEach(name => {
            this.createBlock({ type: 'typology', typology: name });
        });

        const authorCodes = new Set();
        AppState.items.forEach(item => {
            if (item.authorCode) authorCodes.add(item.authorCode);
        });
        [...authorCodes].sort((a, b) => a.localeCompare(b)).forEach(author => {
            this.createBlock({ type: 'author', author: author });
        });

        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        this.syncWordPanelMode(level);
        requestAnimationFrame(() => this.updateScrollReserve());
        this.captureDockTrayBaseOrder();
        this.updateWarehouseCapacityUI();
    },

    captureDockTrayBaseOrder() {
        this._dockTrayBaseOrder = this.blocks.filter(
            b => (b.type === 'tag' || b.type === 'author' || b.type === 'typology') && b.slotElement
        );
    },

    ensureDockTrayBaseOrder() {
        if (!this._dockTrayBaseOrder?.length) {
            this.captureDockTrayBaseOrder();
        }
    },

    restoreDockTrayOrder() {
        if (!this.trayBlocksElement) return;
        this.ensureDockTrayBaseOrder();
        this._dockTrayBaseOrder.forEach(block => {
            const slot = block.slotElement;
            if (slot?.parentElement === this.trayBlocksElement) {
                this.trayBlocksElement.appendChild(slot);
            }
        });
    },

    reorderDockTrayByRelevance(coTags, coAuthors, coTypologies = new Set()) {
        if (!this.trayBlocksElement) return;
        this.ensureDockTrayBaseOrder();

        const hasReservedSlot = this._dockTrayBaseOrder.some(block => {
            const slot = block.slotElement;
            if (!slot || slot.parentElement !== this.trayBlocksElement) return false;
            return slot.classList.contains('is-empty') || !!block._dockReserveEl;
        });
        if (hasReservedSlot) {
            this.restoreDockTrayOrder();
            return;
        }

        const relevant = [];
        const irrelevant = [];
        const away = [];

        this._dockTrayBaseOrder.forEach(block => {
            const slot = block.slotElement;
            if (!slot || slot.parentElement !== this.trayBlocksElement) return;

            if (!this.isBlockDockedInTray(block)) {
                away.push(block);
                return;
            }

            if (this.isDockBlockCoRelevant(block, coTags, coAuthors, coTypologies)) {
                relevant.push(block);
            } else {
                irrelevant.push(block);
            }
        });

        [...relevant, ...irrelevant, ...away].forEach(block => {
            this.trayBlocksElement.appendChild(block.slotElement);
        });

        if (this.trayScrollElement) {
            this.trayScrollElement.scrollTop = 0;
        }
    },

    createBlock(def) {
        if (def.type === 'frame') return this.createFrameBlock(def);

        const slot = document.createElement('div');
        slot.classList.add('block-slot');

        const el = document.createElement('div');
        const isAuthor = def.type === 'author';
        const isTypology = def.type === 'typology';
        el.classList.add('action-block', 'general-t');
        if (isAuthor) el.classList.add('action-block--author');
        if (isTypology) {
            el.classList.add('action-block--typology');
            el.dataset.typology = def.typology;
            el.dataset.typologyPattern = typeof getTypologyPattern === 'function'
                ? getTypologyPattern(def.typology)
                : 'regular';
        }
        el.dataset.type = def.type || 'tag';
        if (def.color) el.style.setProperty('--block-tag-color', def.color);

        const label = isAuthor ? def.author : (isTypology ? null : def.tag);
        const glyphHTML = (isAuthor || isTypology)
            ? ''
            : `<span class="block-glyph" style="background-color: ${def.color}"></span>`;
        const typologyHTML = isTypology && typeof buildTypologyBlockInnerHTML === 'function'
            ? buildTypologyBlockInnerHTML(def.typology)
            : `<span class="block-label">${label}</span>`;
        el.innerHTML = isTypology ? typologyHTML : `${glyphHTML}${typologyHTML}`;
        slot.appendChild(el);
        this.trayBlocksElement.appendChild(slot);

        const block = {
            type: def.type || 'tag',
            tag: (isAuthor || isTypology) ? null : def.tag,
            author: isAuthor ? def.author : null,
            typology: isTypology ? def.typology : null,
            color: def.color || null,
            frameKind: null,
            element: el,
            slotElement: slot,
            state: 'docked',
            isDragging: false,
            nestedBlocks: [],
            nestedIn: null,
            body: null,
            bodyX: 0, bodyY: 0,
            x: 0, y: 0
        };

        this.wireBlockRemoveMark(block);

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.block-remove-mark')) return;
            e.stopPropagation();
            this.startDrag(block, e);
        });
        this.blocks.push(block);
        return block;
    },

    createFrameBlock(def) {
        const slot = document.createElement('div');
        slot.classList.add('block-slot', 'block-slot--frame');

        const el = document.createElement('div');
        const frameKind = def.frameKind || 'filter';
        el.classList.add('action-block', 'action-block--frame', 'general-t');
        if (frameKind === 'filter') el.classList.add('action-block--frame-filter');
        el.dataset.type = 'frame';
        el.dataset.frameKind = frameKind;

        el.innerHTML = `
            <span class="frame-filter-icon" aria-hidden="true"></span>
            <div class="frame-slot-window"></div>
        `;
        slot.appendChild(el);
        this.trayFramesElement.appendChild(slot);

        const block = {
            type: 'frame',
            frameKind,
            tag: null,
            author: null,
            color: null,
            element: el,
            slotElement: slot,
            state: 'docked',
            isDragging: false,
            nestedBlocks: [],
            nestedIn: null,
            body: null,
            bodyX: 0, bodyY: 0,
            x: 0, y: 0
        };

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.is-nested')) return;
            this.startDrag(block, e);
        });
        this.blocks.push(block);
        return block;
    },

    blockMetrics(block) {
        if (block.type === 'frame') return this.getFrameMetrics(block);
        const rect = block.element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    },

    computeFrameShellWidth(slotWidth) {
        const cfg = CONFIG.warehouse.frame.filter;
        const gap = scale(6);
        const leftPad = cfg.paddingX + (cfg.paddingLeft || 0);
        return leftPad + scale(CONFIG.warehouse.blockGlyphSize) + gap + slotWidth + cfg.paddingX;
    },

    getFrameNestedDimensions(frame) {
        const cfg = CONFIG.warehouse.frame.filter;
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const nested = frame.nestedBlocks || [];
        if (nested.length === 0) {
            return { width: cfg.slotMinWidth, height: blockH };
        }

        const gap = cfg.nestedGap || scale(4);
        let maxW = cfg.slotMinWidth;
        let totalH = 0;

        nested.forEach((b, i) => {
            const w = b.element.offsetWidth || b.element.getBoundingClientRect().width;
            if (w > 0) maxW = Math.max(maxW, Math.ceil(w));
            totalH += blockH + (i > 0 ? gap : 0);
        });

        return { width: maxW, height: totalH };
    },

    getFrameMetrics(block) {
        const cfg = CONFIG.warehouse.frame.filter;
        const slot = this.getFrameNestedDimensions(block);
        const minShellH = scale(CONFIG.warehouse.blockHeight) + cfg.paddingY * 2;
        const height = Math.max(minShellH, slot.height + cfg.paddingY * 2);
        return {
            width: this.computeFrameShellWidth(slot.width),
            height
        };
    },

    refreshFrameLayout(frame) {
        if (frame.type !== 'frame') return;

        const cfg = CONFIG.warehouse.frame.filter;
        const slotEl = this.getFrameSlotElement(frame);
        const nested = frame.nestedBlocks || [];
        const slotDims = this.getFrameNestedDimensions(frame);
        const { width, height } = this.getFrameMetrics(frame);
        const hasNested = nested.length > 0;

        frame.element.style.width = `${width}px`;
        frame.element.style.minWidth = `${width}px`;
        frame.element.style.height = `${height}px`;
        frame.element.style.minHeight = `${height}px`;
        frame.element.style.maxWidth = hasNested ? 'none' : `${width}px`;
        frame.element.classList.toggle('has-nested-blocks', hasNested);

        if (frame.slotElement) {
            frame.slotElement.style.height = `${height}px`;
            frame.slotElement.style.minHeight = `${height}px`;
        }

        if (!slotEl) return;

        slotEl.classList.toggle('is-filled', hasNested);
        if (hasNested) {
            slotEl.style.width = `${slotDims.width}px`;
            slotEl.style.minWidth = `${slotDims.width}px`;
            slotEl.style.height = `${slotDims.height}px`;
            slotEl.style.minHeight = `${slotDims.height}px`;
        } else {
            slotEl.style.width = `${cfg.slotMinWidth}px`;
            slotEl.style.minWidth = `${cfg.slotMinWidth}px`;
            slotEl.style.height = `${scale(CONFIG.warehouse.blockHeight)}px`;
            slotEl.style.minHeight = `${scale(CONFIG.warehouse.blockHeight)}px`;
        }
    },

    frameContainsBlock(frame, block) {
        return (frame.nestedBlocks || []).some(n =>
            n.type === block.type &&
            ((block.type === 'tag' && n.tag === block.tag) ||
             (block.type === 'author' && n.author === block.author) ||
             (block.type === 'typology' && n.typology === block.typology))
        );
    },

    canSnapIntoFrame(block, frame) {
        return frame &&
            frame.type === 'frame' &&
            frame.frameKind === 'filter' &&
            this.isActiveCaptureBlock(block) &&
            !this.frameContainsBlock(frame, block);
    },

    getFrameSlotElement(frame) {
        return frame.element.querySelector('.frame-slot-window');
    },

    getDeployedFrames() {
        return this.blocks.filter(b =>
            b.type === 'frame' && b.state === 'active' && b.element.classList.contains('is-deployed')
        );
    },

    findFrameAtPoint(x, y) {
        for (const frame of this.getDeployedFrames()) {
            const rect = frame.element.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return frame;
            }
        }
        return null;
    },

    frameContainsPoint(frame, x, y) {
        const rect = frame.element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    snapBlockBackIntoFrame(block, frame) {
        block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning');
        block.element.style.transform = '';

        const slot = this.getFrameSlotElement(frame);
        slot.appendChild(block.element);
        block.element.classList.add('is-nested');
        block.state = 'active';

        this.refreshFrameLayout(frame);
        requestAnimationFrame(() => this.refreshFrameLayout(frame));
        this.updateDotFocusFilter();
    },

    ejectFromFrame(block) {
        const frame = block.nestedIn;
        if (!frame) return;

        frame.nestedBlocks = (frame.nestedBlocks || []).filter(b => b !== block);
        block.nestedIn = null;

        const blockRect = block.element.getBoundingClientRect();
        document.body.appendChild(block.element);
        block.element.classList.remove('is-nested');
        block.x = blockRect.left;
        block.y = blockRect.top;
        this.applyTransform(block, 0);

        this.detachBody(block);
        block.body = null;
        this.syncFrameBodyOwnership(frame);
        this.refreshFrameLayout(frame);
        requestAnimationFrame(() => this.refreshFrameLayout(frame));
        this.updateDotFocusFilter();
    },

    syncNestedBlockBody(block) {
        const frame = block.nestedIn;
        if (!frame) return;

        block.bodyX = frame.bodyX;
        block.bodyY = frame.bodyY;
        if (block.body) {
            Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
        }
    },

    syncFrameBodyOwnership(frameOrBlock) {
        if (frameOrBlock.type === 'frame') {
            const frame = frameOrBlock;
            (frame.nestedBlocks || []).forEach(n => this.detachBody(n));

            if (frame.frameKind === 'filter') {
                if (frame.state === 'active' &&
                    frame.element.classList.contains('is-deployed') &&
                    !frame.body) {
                    this.attachBody(frame);
                }
            } else if ((frame.nestedBlocks || []).length > 0) {
                const anchor = frame.nestedBlocks[0];
                this.detachBody(frame);
                if (!anchor.body) this.attachBody(anchor);
                this.syncNestedBlockBody(anchor);
            } else if (frame.state === 'active' &&
                frame.element.classList.contains('is-deployed') &&
                !frame.body) {
                this.attachBody(frame);
            }
            return;
        }

        const block = frameOrBlock;
        if (block.nestedIn) {
            this.syncNestedBlockBody(block);
        }
    },

    snapBlockIntoFrame(block, frame) {
        if (!this.canSnapIntoFrame(block, frame)) return;

        block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning', 'is-depth-ui-mounted');
        block.element.style.transform = '';

        const slot = this.getFrameSlotElement(frame);
        slot.appendChild(block.element);
        block.element.classList.add('is-nested');

        if (!frame.nestedBlocks) frame.nestedBlocks = [];
        block.nestedIn = frame;
        frame.nestedBlocks.push(block);
        block.state = 'active';

        this.detachBody(block);
        block.body = null;

        this.syncFrameBodyOwnership(frame);
        this.refreshFrameLayout(frame);
        requestAnimationFrame(() => this.refreshFrameLayout(frame));
        if (this.isDepthUiLevel()) {
            this.updateDotFocusFilter();
        } else {
            this.updateWorkspaceState();
        }
    },

    isDepthUiLevel() {
        return typeof DepthController !== 'undefined' && DepthController.currentLevel >= 2;
    },

    isPointOverDepthBar(x, y) {
        if (!this.depthBlockBarElement) return false;
        const rect = this.depthBlockBarElement.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    deployBlockToDepthBar(block) {
        if (!this.depthBlockBarElement || block.nestedIn) return;

        block.element.classList.remove('is-dragging', 'is-returning', 'is-nested');
        block.element.classList.add('is-deployed', 'is-depth-ui-mounted', 'is-selected');
        block.element.style.transform = '';
        block.state = 'active';

        this.detachBody(block);
        block.body = null;

        if (!block._depthUiSnapshot) {
            block._depthUiSnapshot = {
                parent: block.slotElement || block.element.parentNode,
                nextSibling: null,
                x: 0,
                y: 0,
                depthUiOnly: true
            };
        }

        this.depthBlockBarElement.appendChild(block.element);
        if (block.type === 'frame') this.refreshFrameLayout(block);
        this.syncBlockRemovable(block);

        const deployedCount = this.blocks.filter(b =>
            b.state === 'active' &&
            b.element?.classList.contains('is-deployed') &&
            !b.nestedIn
        ).length;

        this.depthBlockBarElement.classList.toggle('has-blocks', deployedCount > 0);
        this.fadeDepthDropIndicator();
        if (this.shellElement) {
            this.shellElement.classList.toggle('is-workspace-active', deployedCount > 0);
        }
        this.updateScrollReserve();
        this.updateDotFocusFilter();
    },

    measureDepthBarSlotRect(block) {
        if (!this.depthBlockBarElement) return null;

        const bar = this.depthBlockBarElement;
        const hadBlocks = bar.classList.contains('has-blocks');
        if (!hadBlocks) bar.classList.add('has-blocks');

        block.element.style.visibility = 'hidden';
        block.element.style.transform = 'none';
        bar.appendChild(block.element);
        if (block.type === 'frame') this.refreshFrameLayout(block);

        const rect = block.element.getBoundingClientRect();
        block.element.remove();
        block.element.style.visibility = '';
        block.element.style.transform = '';

        if (!hadBlocks) bar.classList.remove('has-blocks');
        return rect;
    },

    _depthDeployEase(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    _runArcViewportMotion(el, startRect, endRect, options = {}, onDone) {
        const cfg = CONFIG.warehouse;
        const duration = options.duration ?? cfg.depthDeployDuration ?? 520;
        const startScale = options.startScale ?? cfg.depthDeployStartScale ?? 0.94;
        const arcLift = options.arcLift ?? Math.min(
            cfg.depthDeployArcLift ?? scale(14),
            Math.abs(startRect.top - endRect.top) * 0.15 + scale(6)
        );
        const state = options.state || {};
        const t0 = performance.now();
        let finished = false;

        const finish = () => {
            if (finished) return;
            finished = true;
            if (state.raf) {
                cancelAnimationFrame(state.raf);
                state.raf = null;
            }
            clearTimeout(state.timeout);
            state.timeout = null;
            onDone?.();
        };

        const tick = (now) => {
            const raw = Math.min(1, (now - t0) / duration);
            const e = this._depthDeployEase(raw);
            const x = startRect.left + (endRect.left - startRect.left) * e;
            const y = startRect.top + (endRect.top - startRect.top) * e -
                arcLift * Math.sin(raw * Math.PI);
            const s = startScale + (1 - startScale) * e;
            el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;

            if (raw < 1) {
                state.raf = requestAnimationFrame(tick);
            } else {
                finish();
            }
        };

        state.timeout = setTimeout(finish, duration + 32);
        state.raf = requestAnimationFrame(tick);
        return state;
    },

    _runDepthDeployMotion(block, startRect, endRect, onDone) {
        const el = block.element;
        block._depthDeployState = block._depthDeployState || {};
        this._runArcViewportMotion(el, startRect, endRect, {
            state: block._depthDeployState
        }, () => {
            el.style.transform = '';
            el.classList.remove('is-deploying-to-bar');
            onDone?.();
        });
    },

    getMacroIndicationTargetRect(block, startRect) {
        const { width, height } = this.blockMetrics(block);
        const visibleBottom = typeof getSiteL1VisibleViewportHeightPx === 'function'
            ? getSiteL1VisibleViewportHeightPx()
            : window.innerHeight * 0.72;
        const centerY = visibleBottom * 0.5;
        const fullTarget = {
            left: window.innerWidth * 0.5 - width / 2,
            top: centerY - height / 2,
            width,
            height
        };
        if (!startRect) return fullTarget;

        const travel = CONFIG.warehouse.macroIndicationTravel ?? 0.38;
        return {
            left: startRect.left + (fullTarget.left - startRect.left) * travel,
            top: startRect.top + (fullTarget.top - startRect.top) * travel,
            width,
            height
        };
    },

    showMacroIndicationSlot(_block) {
        /* Real block stays in the tray at default dock chrome — ghost arc only. */
    },

    clearMacroIndicationSlot(block) {
        if (!block) return;
        delete block._macroIndicationSlotSnapshot;
    },

    createMacroIndicationGhost(block) {
        const ghost = block.element.cloneNode(true);
        ghost.classList.remove(
            'is-dragging', 'is-deployed', 'is-selected', 'is-removable',
            'is-returning', 'is-nested', 'is-depth-ui-mounted', 'is-deploying-to-bar'
        );
        ghost.classList.add('is-macro-indication');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.display = '';
        ghost.style.visibility = 'visible';
        ghost.style.removeProperty('transform');
        return ghost;
    },

    clearMacroIndicationGhost() {
        const ghost = this._macroIndicationGhost;
        if (ghost) {
            if (ghost._macroIndicationState?.raf) {
                cancelAnimationFrame(ghost._macroIndicationState.raf);
            }
            clearTimeout(ghost._macroIndicationState?.timeout);
            ghost.remove();
            this._macroIndicationGhost = null;
        }
        if (this._macroIndicationBlock) {
            this.clearMacroIndicationSlot(this._macroIndicationBlock);
            this._macroIndicationBlock = null;
        }
        this._macroIndicationAnimating?.clear();
    },

    animateMacroDeployIndication(block) {
        if (DepthController.currentLevel !== 1 || block.state !== 'docked' || block.nestedIn) return;
        if (!this._macroIndicationAnimating) this._macroIndicationAnimating = new Set();
        if (this._macroIndicationAnimating.has(block)) return;

        this.clearMacroIndicationGhost();

        const startRect = block.element.getBoundingClientRect();
        const endRect = this.getMacroIndicationTargetRect(block, startRect);
        if (!startRect.width || !endRect.width) return;

        const ghost = this.createMacroIndicationGhost(block);

        this.showMacroIndicationSlot(block);
        this._macroIndicationBlock = block;

        const cfg = CONFIG.warehouse;
        const startScale = cfg.depthDeployStartScale ?? 0.94;

        document.body.appendChild(ghost);
        this._macroIndicationGhost = ghost;
        this._macroIndicationAnimating.add(block);
        ghost._macroIndicationState = {};
        ghost.style.transform =
            `translate3d(${startRect.left}px, ${startRect.top}px, 0) scale(${startScale})`;

        this._runArcViewportMotion(ghost, startRect, endRect, {
            duration: cfg.macroIndicationDuration ?? cfg.depthDeployDuration ?? 720,
            state: ghost._macroIndicationState
        }, () => {
            this._macroIndicationAnimating.delete(block);
            this.clearMacroIndicationSlot(block);
            this._macroIndicationBlock = null;
            ghost.classList.add('is-fading');
            setTimeout(() => {
                if (ghost.parentNode) ghost.remove();
                if (this._macroIndicationGhost === ghost) this._macroIndicationGhost = null;
            }, cfg.macroIndicationFadeMs ?? 320);
        });
    },

    animateDeployToDepthBar(block) {
        if (!this.depthBlockBarElement || block.nestedIn) return;
        if (block.state !== 'docked') return;
        if (this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull()) return;
        if (!this._depthDeployAnimating) this._depthDeployAnimating = new Set();
        if (this._depthDeployAnimating.has(block)) return;

        const startRect = block.element.getBoundingClientRect();
        if (!block._depthUiSnapshot) {
            block._depthUiSnapshot = {
                parent: block.slotElement,
                nextSibling: null,
                x: 0,
                y: 0,
                depthUiOnly: true
            };
        }

        this.markSlotEmpty(block);
        block.state = 'active';
        block.element.classList.add('is-selected');

        const endRect = this.measureDepthBarSlotRect(block);
        if (!endRect || endRect.width < 1) {
            this.clearSlotEmpty(block);
            block.state = 'docked';
            block.element.classList.remove('is-selected');
            this.deployBlockToDepthBar(block);
            return;
        }

        this._depthDeployAnimating.add(block);
        this.showDepthDropIndicator();

        document.body.appendChild(block.element);
        block.element.classList.add('is-deploying-to-bar');
        block.element.style.transform =
            `translate3d(${startRect.left}px, ${startRect.top}px, 0) scale(${CONFIG.warehouse.depthDeployStartScale ?? 0.94})`;

        this._runDepthDeployMotion(block, startRect, endRect, () => {
            this.deployBlockToDepthBar(block);
            this._depthDeployAnimating.delete(block);
        });
    },

    placeBlockOnCanvasFromDepthUi(block) {
        if (!block.element.classList.contains('is-deployed')) return;

        const { width, height } = this.blockMetrics(block);
        block.x = window.pageXOffset + window.innerWidth * 0.5 - width / 2;
        block.y = window.pageYOffset + window.innerHeight * 0.38 - height / 2;
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2;
        block.bodyY = block.y + height / 2;

        document.body.appendChild(block.element);
        block.element.style.transform = `translate3d(${block.x}px, ${block.y}px, 0)`;

        if (!block.body) this.attachBody(block);
        Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
        if (block.type === 'frame') this.refreshFrameLayout(block);
    },

    endDragDepthUi(e, drag, block) {
        if (drag.hoverFrame) {
            drag.hoverFrame.element.classList.remove('is-drop-target');
        }
        this.fadeDepthDropIndicator();

        if (this.isPointOverDock(e.clientX, e.clientY)) {
            if (drag.pullFromFrame && block.nestedIn) this.ejectFromFrame(block);
            this.returnToDock(block);
            return;
        }

        if (drag.pullFromFrame && block.nestedIn) {
            const sourceFrame = block.nestedIn;
            if (this.frameContainsPoint(sourceFrame, e.clientX, e.clientY)) {
                this.snapBlockBackIntoFrame(block, sourceFrame);
                return;
            }
            const otherFrame = this.findFrameAtPoint(e.clientX, e.clientY);
            if (otherFrame && otherFrame !== sourceFrame && this.canSnapIntoFrame(block, otherFrame)) {
                this.ejectFromFrame(block);
                this.snapBlockIntoFrame(block, otherFrame);
                return;
            }
            this.ejectFromFrame(block);
        }

        const frameTarget = this.isActiveCaptureBlock(block)
            ? this.findFrameAtPoint(e.clientX, e.clientY)
            : null;
        if (frameTarget && this.canSnapIntoFrame(block, frameTarget)) {
            this.snapBlockIntoFrame(block, frameTarget);
            return;
        }

        if (this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull() &&
            !drag.wasCaptureOnSurface) {
            if (drag.pullFromFrame && drag.sourceFrame) {
                this.snapBlockBackIntoFrame(block, drag.sourceFrame);
            } else {
                this.returnToDock(block);
            }
            return;
        }

        this.deployBlockToDepthBar(block);
    },

    /* --- Drag mechanics (spring-follow + velocity tilt) --- */

    beginDragLift(block, e, dragMeta = {}) {
        const depthUi = dragMeta.depthUi === true;
        const pullFromFrame = !!block.nestedIn;
        const liftFromSurface = block.element.classList.contains('is-deployed') || dragMeta.liftFromSurface;
        const liftFromBar = depthUi && (
            block.element.classList.contains('is-depth-ui-mounted') || liftFromSurface
        );
        const wasCaptureOnSurface = this.isActiveCaptureBlock(block) && (
            liftFromSurface ||
            liftFromBar ||
            !!(block.nestedIn && block.nestedIn.element.classList.contains('is-deployed'))
        );
        const rect = block.element.getBoundingClientRect();
        block.x = rect.left;
        block.y = rect.top;

        block.element.classList.add('is-dragging');
        block.element.classList.remove('is-deployed', 'is-nested', 'is-depth-ui-mounted');
        if (!pullFromFrame) {
            this.markSlotEmpty(block);
        }
        document.body.appendChild(block.element);
        this.applyTransform(block, 0);

        if (pullFromFrame) {
            this.refreshFrameLayout(block.nestedIn);
        } else if (!depthUi && (block.state === 'docked' || !block.body)) {
            this.attachBody(block);
        } else if (depthUi) {
            this.detachBody(block);
            block.body = null;
        }

        block.state = 'active';
        block.isDragging = true;
        block.carryOrbitWhileDragging = depthUi ? false : !!liftFromSurface;

        if (depthUi) {
            this.showDepthDropIndicator();
        }

        this.dragState = {
            block: block,
            depthUi: depthUi,
            clickPending: false,
            pullFromFrame: pullFromFrame,
            sourceFrame: pullFromFrame ? block.nestedIn : null,
            wasCaptureOnSurface: wasCaptureOnSurface,
            liftFromSurface: !!liftFromSurface,
            liftFromBar: liftFromBar,
            startClientX: dragMeta.startClientX ?? e.clientX,
            startClientY: dragMeta.startClientY ?? e.clientY,
            restoreX: dragMeta.restoreX ?? block.x,
            restoreY: dragMeta.restoreY ?? block.y,
            pointerX: e.clientX,
            pointerY: e.clientY,
            grabDX: e.clientX - rect.left,
            grabDY: e.clientY - rect.top,
            velX: 0, velY: 0,
            rafId: null,
            hoverFrame: null
        };

        if (pullFromFrame || liftFromSurface || liftFromBar) {
            this.updateDotFocusFilter();
        } else if (!depthUi) {
            this.updateWorkspaceState();
        }

        this.dragLoop();
    },

    startDrag(block, e) {
        const depthUi = this.isDepthUiLevel();
        if (this.dragState || (!depthUi && DepthController.currentLevel !== 1)) return;
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.isRunning()) {
            return;
        }
        if (block.state === 'docked' && !block.nestedIn &&
            this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull()) {
            return;
        }
        e.preventDefault();

        if (!depthUi &&
            DepthController.currentLevel === 1 &&
            this.isBlockClickTransitionEligible(block)) {
            this.dragState = {
                block: block,
                clickPending: true,
                depthUi: false,
                startClientX: e.clientX,
                startClientY: e.clientY,
                pointerX: e.clientX,
                pointerY: e.clientY
            };
            this.boundMove = (ev) => this.onPointerMove(ev);
            this.boundUp = (ev) => this.endDrag(ev);
            document.addEventListener('pointermove', this.boundMove);
            document.addEventListener('pointerup', this.boundUp);
            return;
        }

        if (!depthUi &&
            DepthController.currentLevel === 1 &&
            block.state === 'docked' &&
            !block.nestedIn) {
            this.dragState = {
                block: block,
                clickPending: true,
                macroClickIndicate: true,
                depthUi: false,
                startClientX: e.clientX,
                startClientY: e.clientY,
                pointerX: e.clientX,
                pointerY: e.clientY
            };
            this.boundMove = (ev) => this.onPointerMove(ev);
            this.boundUp = (ev) => this.endDrag(ev);
            document.addEventListener('pointermove', this.boundMove);
            document.addEventListener('pointerup', this.boundUp);
            return;
        }

        if (depthUi && block.element.classList.contains('is-removable') &&
            block.element.classList.contains('is-depth-ui-mounted')) {
            this.dragState = {
                block: block,
                clickPending: true,
                depthUiReturn: true,
                depthUi: true,
                startClientX: e.clientX,
                startClientY: e.clientY,
                pointerX: e.clientX,
                pointerY: e.clientY
            };
            this.boundMove = (ev) => this.onPointerMove(ev);
            this.boundUp = (ev) => this.endDrag(ev);
            document.addEventListener('pointermove', this.boundMove);
            document.addEventListener('pointerup', this.boundUp);
            return;
        }

        if (depthUi && block.state === 'docked' && !block.nestedIn &&
            !this._depthDeployAnimating?.has(block)) {
            this.dragState = {
                block: block,
                clickPending: true,
                depthUi: true,
                depthUiClickDeploy: true,
                startClientX: e.clientX,
                startClientY: e.clientY,
                pointerX: e.clientX,
                pointerY: e.clientY
            };
            this.boundMove = (ev) => this.onPointerMove(ev);
            this.boundUp = (ev) => this.endDrag(ev);
            document.addEventListener('pointermove', this.boundMove);
            document.addEventListener('pointerup', this.boundUp);
            return;
        }

        this.clearMacroIndicationGhost();
        this.beginDragLift(block, e, { depthUi });
        this.boundMove = (ev) => this.onPointerMove(ev);
        this.boundUp = (ev) => this.endDrag(ev);
        document.addEventListener('pointermove', this.boundMove);
        document.addEventListener('pointerup', this.boundUp);
    },

    onPointerMove(e) {
        if (!this.dragState) return;

        if (this.dragState.clickPending) {
            const drag = this.dragState;
            const moved = Math.hypot(
                e.clientX - drag.startClientX,
                e.clientY - drag.startClientY
            );
            const clickThreshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved >= clickThreshold) {
                const block = drag.block;
                const restoreX = block.element.getBoundingClientRect().left;
                const restoreY = block.element.getBoundingClientRect().top;
                document.removeEventListener('pointermove', this.boundMove);
                document.removeEventListener('pointerup', this.boundUp);
                this.dragState = null;
                this.clearMacroIndicationGhost();
                this.beginDragLift(block, e, {
                    depthUi: !!drag.depthUiClickDeploy,
                    liftFromSurface: !drag.depthUiClickDeploy && !drag.macroClickIndicate,
                    startClientX: drag.startClientX,
                    startClientY: drag.startClientY,
                    restoreX,
                    restoreY
                });
                this.boundMove = (ev) => this.onPointerMove(ev);
                this.boundUp = (ev) => this.endDrag(ev);
                document.addEventListener('pointermove', this.boundMove);
                document.addEventListener('pointerup', this.boundUp);
            }
            return;
        }

        this.dragState.pointerX = e.clientX;
        this.dragState.pointerY = e.clientY;
        this.updateFrameDropTarget(e.clientX, e.clientY);
    },

    updateFrameDropTarget(x, y) {
        if (!this.dragState) return;
        const block = this.dragState.block;
        const prev = this.dragState.hoverFrame;
        let next = null;

        if (block.type !== 'frame' && this.isActiveCaptureBlock(block)) {
            next = this.findFrameAtPoint(x, y);
            if (next && !this.canSnapIntoFrame(block, next)) {
                if (!(this.dragState.pullFromFrame && next === this.dragState.sourceFrame)) {
                    next = null;
                }
            }
        }

        if (prev !== next) {
            if (prev) prev.element.classList.remove('is-drop-target');
            if (next) next.element.classList.add('is-drop-target');
            this.dragState.hoverFrame = next;
        }
    },

    dragLoop() {
        if (!this.dragState) return;
        const drag = this.dragState;
        const block = drag.block;
        const follow = CONFIG.warehouse.drag.followFactor;

        // Spring-lag follow: the block trails the cursor, giving it perceived mass
        const targetX = drag.pointerX - drag.grabDX;
        const targetY = drag.pointerY - drag.grabDY;
        drag.velX = (targetX - block.x) * follow;
        drag.velY = (targetY - block.y) * follow;
        block.x += drag.velX;
        block.y += drag.velY;

        const tilt = Math.max(-CONFIG.warehouse.drag.maxTilt,
                     Math.min(CONFIG.warehouse.drag.maxTilt, drag.velX * 0.6));
        this.applyTransform(block, tilt);
        if (!drag.depthUi) {
            this.syncBody(block);
        }
        if (block.type === 'frame' && (block.nestedBlocks || []).length > 0) {
            this.refreshFrameLayout(block);
        }

        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.scheduleMotionRender();
        }

        drag.rafId = requestAnimationFrame(() => this.dragLoop());
    },

    endDrag(e) {
        if (!this.dragState) return;
        const drag = this.dragState;
        const block = drag.block;

        if (drag.clickPending) {
            document.removeEventListener('pointermove', this.boundMove);
            document.removeEventListener('pointerup', this.boundUp);
            this.dragState = null;

            const moved = Math.hypot(
                e.clientX - drag.startClientX,
                e.clientY - drag.startClientY
            );
            const clickThreshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved < clickThreshold) {
                if (drag.depthUiClickDeploy) {
                    this.animateDeployToDepthBar(block);
                } else if (drag.macroClickIndicate) {
                    this.animateMacroDeployIndication(block);
                } else if (drag.depthUiReturn ||
                    block.element.classList.contains('is-removable')) {
                    this.returnToDock(block);
                } else if (typeof DepthTransitionOrchestrator !== 'undefined') {
                    DepthTransitionOrchestrator.runBlockClick(block);
                }
            }
            return;
        }

        cancelAnimationFrame(drag.rafId);
        document.removeEventListener('pointermove', this.boundMove);
        document.removeEventListener('pointerup', this.boundUp);

        const moved = Math.hypot(
            e.clientX - drag.startClientX,
            e.clientY - drag.startClientY
        );
        const clickThreshold = CONFIG.depth.clickDragThreshold ?? 6;

        if (
            drag.liftFromSurface &&
            drag.wasCaptureOnSurface &&
            moved < clickThreshold &&
            DepthController.currentLevel === 1 &&
            typeof DepthTransitionOrchestrator !== 'undefined'
        ) {
            this.dragState = null;
            block.isDragging = false;
            block.carryOrbitWhileDragging = false;
            block.x = drag.restoreX;
            block.y = drag.restoreY;
            block.element.classList.remove('is-dragging');
            block.element.classList.add('is-deployed');
            this.applyTransform(block, 0);
            this.syncBlockRemovable(block);
            if (block.body) {
                Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
            }
            if (block.element.classList.contains('is-removable')) {
                this.returnToDock(block);
                return;
            }
            DepthTransitionOrchestrator.runBlockClick(block);
            return;
        }

        if (drag.hoverFrame) {
            drag.hoverFrame.element.classList.remove('is-drop-target');
        }
        this.dragState = null;
        block.isDragging = false;
        block.carryOrbitWhileDragging = false;

        if (drag.depthUi) {
            this.endDragDepthUi(e, drag, block);
            return;
        }

        const dockRect = this.shellElement.getBoundingClientRect();
        const overDock = e.clientY >= dockRect.top &&
                         e.clientX >= dockRect.left && e.clientX <= dockRect.right;

        if (overDock) {
            if (drag.pullFromFrame && block.nestedIn) this.ejectFromFrame(block);
            this.returnToDock(block);
            return;
        }

        if (drag.pullFromFrame && block.nestedIn) {
            const sourceFrame = block.nestedIn;
            if (this.frameContainsPoint(sourceFrame, e.clientX, e.clientY)) {
                this.snapBlockBackIntoFrame(block, sourceFrame);
                return;
            }
            const otherFrame = this.findFrameAtPoint(e.clientX, e.clientY);
            if (otherFrame && otherFrame !== sourceFrame && this.canSnapIntoFrame(block, otherFrame)) {
                this.ejectFromFrame(block);
                this.snapBlockIntoFrame(block, otherFrame);
                return;
            }
            this.ejectFromFrame(block);
        }

        const frameTarget = this.isActiveCaptureBlock(block)
            ? this.findFrameAtPoint(e.clientX, e.clientY)
            : null;
        if (frameTarget && this.canSnapIntoFrame(block, frameTarget)) {
            this.snapBlockIntoFrame(block, frameTarget);
            return;
        }

        if (this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull() &&
            !drag.wasCaptureOnSurface) {
            if (drag.pullFromFrame && drag.sourceFrame) {
                this.snapBlockBackIntoFrame(block, drag.sourceFrame);
            } else {
                this.returnToDock(block);
            }
            return;
        }

        // Deployed blocks stay static: immovable anchors the dots organize around.
        // Convert viewport coords to page coords so the block scrolls with the canvas.
        block.x += window.pageXOffset;
        block.y += window.pageYOffset;
        const { width, height } = this.blockMetrics(block);
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2;
        block.bodyY = block.y + height / 2;
        if (!block.body) this.attachBody(block);
        Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });

        block.element.classList.remove('is-dragging');
        block.element.classList.add('is-deployed');
        this.applyTransform(block, 0);
        this.syncFrameBodyOwnership(block);
        if (block.type === 'frame') this.refreshFrameLayout(block);
        this.syncBlockRemovable(block);
        this.updateWorkspaceState();
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.flushPendingBlockLayoutRender();
        }
    },

    prepareBlockReturnAnimation(block) {
        const onCanvas = block.element.classList.contains('is-deployed');
        const onDepthBar = block.element.classList.contains('is-depth-ui-mounted');
        if (!onCanvas && !onDepthBar) return;

        const rect = block.element.getBoundingClientRect();
        document.body.appendChild(block.element);
        block.element.classList.remove('is-deployed', 'is-depth-ui-mounted');
        block.element.classList.add('is-dragging');
        block.x = rect.left;
        block.y = rect.top;
        this.applyTransform(block, 0);
        void block.element.offsetWidth;
    },

    returnToDock(block) {
        if (block.type === 'frame' && (block.nestedBlocks || []).length > 0) {
            [...block.nestedBlocks].forEach(nested => {
                this.ejectFromFrame(nested);
                this.returnToDock(nested);
            });
        }

        this.prepareBlockReturnAnimation(block);

        const slotRect = block.slotElement.getBoundingClientRect();
        block.element.classList.add('is-returning');
        block.x = slotRect.left;
        block.y = slotRect.top;
        this.applyTransform(block, 0);

        this.detachBody(block);
        block.state = 'docked';
        block.nestedIn = null;
        block.carryOrbitWhileDragging = false;
        if (this.isDepthUiLevel()) {
            this.updateDotFocusFilter();
        } else {
            this.updateWorkspaceState();
        }
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.flushPendingBlockLayoutRender();
        }

        setTimeout(() => {
            block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning', 'is-nested', 'is-depth-ui-mounted', 'is-selected', 'is-removable');
            block.element.style.transform = '';
            this.clearSlotEmpty(block);
            block.slotElement.appendChild(block.element);
            delete block._depthUiSnapshot;
            if (this.isDepthUiLevel()) {
                const deployedCount = this.blocks.filter(b =>
                    b.state === 'active' &&
                    b.element?.classList.contains('is-deployed') &&
                    !b.nestedIn
                ).length;
                this.depthBlockBarElement?.classList.toggle('has-blocks', deployedCount > 0);
                this.shellElement?.classList.toggle('is-workspace-active', deployedCount > 0);
                this.updateScrollReserve();
                this.updateDotFocusFilter();
            }
        }, CONFIG.warehouse.returnDuration);
    },

    applyTransform(block, tiltDeg) {
        block.element.style.transform = `translate3d(${block.x}px, ${block.y}px, 0) rotate(${tiltDeg}deg)`;
    },

    /* --- Physics integration --- */

    attachBody(block) {
        const radius = scale(CONFIG.warehouse.blockHeight) / 2;
        block.body = Matter.Bodies.circle(0, 0, radius, { isStatic: true });
        this.syncBody(block);
        Matter.World.add(PhysicsEngine.engine.world, block.body);
    },

    detachBody(block) {
        if (!block.body) return;
        Matter.World.remove(PhysicsEngine.engine.world, block.body);
        block.body = null;
    },

    syncBody(block) {
        const { width, height } = this.blockMetrics(block);
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2 + window.pageXOffset;
        block.bodyY = block.y + height / 2 + window.pageYOffset;
        if (block.body) Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
    },

    syncDeployedBlocksForDepth() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (level >= 2) {
            this.mountDeployedBlocksToDepthBar();
        } else {
            this.unmountDeployedBlocksFromDepthBar();
        }
    },

    mountDeployedBlocksToDepthBar() {
        if (!this.depthBlockBarElement) return;

        const deployed = this.blocks.filter(block =>
            block.state === 'active' &&
            block.element?.classList.contains('is-deployed') &&
            !block.nestedIn
        );
        const deployedSet = new Set(deployed);

        this.blocks.forEach(block => {
            if (!block._depthUiSnapshot) return;
            if (block.element.parentNode !== this.depthBlockBarElement) return;
            if (deployedSet.has(block)) return;

            const snap = block._depthUiSnapshot;
            block.element.classList.remove('is-depth-ui-mounted');
            block.x = snap.x;
            block.y = snap.y;
            this.applyTransform(block, 0);
            if (snap.parent) {
                if (snap.nextSibling && snap.nextSibling.parentNode === snap.parent) {
                    snap.parent.insertBefore(block.element, snap.nextSibling);
                } else {
                    snap.parent.appendChild(block.element);
                }
            } else {
                document.body.appendChild(block.element);
            }
            delete block._depthUiSnapshot;
        });

        deployed.forEach(block => {
            if (block._depthUiSnapshot && block.element.parentNode === this.depthBlockBarElement) {
                if (block.type === 'frame') this.refreshFrameLayout(block);
                return;
            }

            if (!block._depthUiSnapshot) {
                block._depthUiSnapshot = {
                    parent: block.element.parentNode,
                    nextSibling: block.element.nextSibling,
                    x: block.x,
                    y: block.y
                };
            }
            block.element.classList.add('is-depth-ui-mounted');
            block.element.style.transform = '';
            this.depthBlockBarElement.appendChild(block.element);
            if (block.type === 'frame') this.refreshFrameLayout(block);
        });

        this.depthBlockBarElement.classList.toggle('has-blocks', deployed.length > 0);
        this.updateScrollReserve();
    },

    unmountDeployedBlocksFromDepthBar() {
        this.blocks.forEach(block => {
            if (!block._depthUiSnapshot) return;

            const snap = block._depthUiSnapshot;
            block.element.classList.remove('is-depth-ui-mounted');

            if (snap.depthUiOnly) {
                delete block._depthUiSnapshot;
                this.placeBlockOnCanvasFromDepthUi(block);
                if (block.type === 'frame') this.refreshFrameLayout(block);
                return;
            }

            block.x = snap.x;
            block.y = snap.y;
            this.applyTransform(block, 0);

            if (snap.parent) {
                if (snap.nextSibling && snap.nextSibling.parentNode === snap.parent) {
                    snap.parent.insertBefore(block.element, snap.nextSibling);
                } else {
                    snap.parent.appendChild(block.element);
                }
            } else {
                document.body.appendChild(block.element);
            }

            delete block._depthUiSnapshot;
            if (block.type === 'frame') this.refreshFrameLayout(block);
        });

        if (this.depthBlockBarElement) {
            this.depthBlockBarElement.classList.remove('has-blocks');
        }
        this.clearDepthDropIndicator();
        this.updateScrollReserve();
    },

    // Pill half-diagonal — wider labels need a larger exclusion zone than blockHeight/2
    getBlockCollisionRadius(block) {
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const w = block.collisionW || blockH;
        const h = block.collisionH || blockH;
        return Math.hypot(w / 2, h / 2);
    },

    // Push a point outside the block pill (axis-aligned) by pad px
    pushPointOutOfBlockAabb(block, x, y, pad) {
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const w = block.collisionW || blockH;
        const h = block.collisionH || blockH;
        const cx = block.bodyX;
        const cy = block.bodyY;
        const hw = w / 2 + pad;
        const hh = h / 2 + pad;
        let dx = x - cx;
        let dy = y - cy;
        const ox = hw - Math.abs(dx);
        const oy = hh - Math.abs(dy);
        if (ox <= 0 || oy <= 0) return { x, y, moved: false };

        if (ox < oy) {
            dx = Math.sign(dx || 1) * hw;
        } else {
            dy = Math.sign(dy || 1) * hh;
        }
        return { x: cx + dx, y: cy + dy, moved: true };
    },

    /* --- Workspace grid (secondary layout) --- */

    // Engages the secondary grid when the first block leaves the dock;
    // recomputes void width as more blocks join, releases when all return
    updateWorkspaceState() {
        const activeCount = this.getActiveBlockCount();
        const anyActive = activeCount > 0;
        const wasOff = !this.workspaceCenters;
        const rushCfg = CONFIG.warehouse.workspaceGrid;
        const blockCountChanged = activeCount !== this._navigationMapBlockCount;
        this._navigationMapBlockCount = activeCount;

        if (anyActive) {
            if (wasOff) {
                this.workspaceCenters = this.computeWorkspaceGrid({ relayout: true });
                this.workspaceGridRush = 'out';
                this.workspaceGridRushUntil = performance.now() + rushCfg.rushDuration;
                SpatialNavigation.bypassScrollClamp(rushCfg.rushDuration);
                AppState.centerViewport({ smooth: true });
            } else {
                // Void expansion — slide bank molecules instead of hard snap
                this.workspaceCenters = this.computeWorkspaceGrid({ relayout: false });
                this.workspaceGridRush = 'shift';
                this.workspaceGridRushUntil = performance.now() + rushCfg.rushDuration * 0.72;
            }
        } else {
            const wasOn = !!this.workspaceCenters;
            this.workspaceCenters = null;
            this.workspaceSlotLayout = null;
            if (wasOn) {
                this.workspaceGridRush = 'in';
                this.workspaceGridRushUntil = performance.now() + rushCfg.rushDuration;
                SpatialNavigation.bypassScrollClamp(rushCfg.rushDuration);
                this.releaseBankGridStatic(PhysicsEngine.bodiesData);
                PhysicsEngine.bodiesData.forEach(d => {
                    d.overrideTarget = null;
                    d.smoothTarget = null;
                });
                AppState.centerViewport({ smooth: true });
            } else {
                this.workspaceGridRush = null;
                this.workspaceGridRushUntil = 0;
            }
        }

        if (this.shellElement) {
            this.shellElement.classList.toggle('is-workspace-active', anyActive);
        }

        this.updateWarehouseCapacityUI();
        this.updateDotFocusFilter();

        if (blockCountChanged && typeof NavigationMap !== 'undefined') {
            NavigationMap.onBlockLayoutChanged();
        }

        this.syncAllBlockRemovables();
    },

    getLiveStatistics() {
        const blocksInUse = typeof this.getCrowdedBlockCount === 'function'
            ? this.getCrowdedBlockCount()
            : 0;
        const activeBlocks = typeof this.getActiveCaptureBlocks === 'function'
            ? this.getActiveCaptureBlocks()
            : [];
        const connectedNotes = new Set();
        let blockNoteConnections = 0;

        if (typeof AppState !== 'undefined' && Array.isArray(AppState.items) && activeBlocks.length) {
            AppState.items.forEach((item, noteIndex) => {
                const noteTags = new Set((item.tags || []).map(tag => tag?.name).filter(Boolean));
                activeBlocks.forEach(block => {
                    const matchesTag = block.type === 'tag' && block.tag && noteTags.has(block.tag);
                    const matchesAuthor = block.type === 'author' && block.author &&
                        (item.authorCode === block.author || item.authorFullName === block.author);
                    const matchesTypology = block.type === 'typology' && block.typology &&
                        item.typology === block.typology;
                    if (!matchesTag && !matchesAuthor && !matchesTypology) return;

                    blockNoteConnections++;
                    connectedNotes.add(noteIndex);
                });
            });
        }

        return {
            blocksInUse,
            blockNoteConnections,
            connectedNotes: connectedNotes.size
        };
    },

    getStatisticRows(stats) {
        return [
            { key: 'blocksInUse', label: 'בלוקים בשימוש', value: stats.blocksInUse },
            { key: 'blockNoteConnections', label: 'חיבורים פעילים', value: stats.blockNoteConnections },
            { key: 'connectedNotes', label: 'פתקים מחוברים', value: stats.connectedNotes }
        ];
    },

    formatStatisticValue(value) {
        return Number(value || 0).toLocaleString('he-IL');
    },

    ensureWarehouseStatisticsRows(rows) {
        if (!this.statisticsElement) return;

        const existingKeys = this.statisticsRowElements
            ? [...this.statisticsRowElements.keys()].join('|')
            : '';
        const nextKeys = rows.map(row => row.key).join('|');
        if (existingKeys === nextKeys) return;

        const list = document.createElement('dl');
        list.className = 'warehouse-statistics__list';
        this.statisticsRowElements = new Map();

        rows.forEach(row => {
            const item = document.createElement('div');
            item.className = 'warehouse-statistics__row';
            item.dataset.statistic = row.key;

            const label = document.createElement('dt');
            label.className = 'warehouse-statistics__label';
            label.textContent = row.label;

            const value = document.createElement('dd');
            value.className = 'warehouse-statistics__value';
            value.textContent = this.formatStatisticValue(this.statisticsDisplayValues.get(row.key) ?? row.value);

            item.append(label, value);
            list.appendChild(item);
            this.statisticsRowElements.set(row.key, { item, label, value });
        });

        this.statisticsElement.replaceChildren(list);
    },

    updateStatisticDisplayValues(rows, now = performance.now()) {
        let shouldAnimate = false;
        rows.forEach(row => {
            const target = Number(row.value || 0);
            const previousTarget = this.statisticsTargetValues.get(row.key);
            if (previousTarget === target) return;

            this.statisticsTargetValues.set(row.key, target);
            if (!this.statisticsDisplayValues.has(row.key)) {
                this.statisticsDisplayValues.set(row.key, target);
                return;
            }

            shouldAnimate = true;
        });

        if (!shouldAnimate) {
            this.paintStatisticValues();
            return;
        }

        this.statisticsAnimationStartedAt = now;
        if (!this.statisticsAnimationFrame) {
            this.statisticsAnimationFrame = requestAnimationFrame((timestamp) => {
                this.tickStatisticAnimation(timestamp);
            });
        }
    },

    tickStatisticAnimation(timestamp) {
        const elapsed = Math.max(0, timestamp - this.statisticsAnimationStartedAt);
        const progress = Math.min(1, elapsed / this.statisticsAnimationDurationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        let animating = false;

        this.statisticsTargetValues.forEach((target, key) => {
            const current = Number(this.statisticsDisplayValues.get(key) || 0);
            const next = current + (target - current) * eased;
            const close = Math.abs(target - next) < 0.5 || progress >= 1;

            this.statisticsDisplayValues.set(key, close ? target : next);
            if (!close) animating = true;
        });

        this.paintStatisticValues();

        if (animating) {
            this.statisticsAnimationFrame = requestAnimationFrame((nextTimestamp) => {
                this.tickStatisticAnimation(nextTimestamp);
            });
        } else {
            this.statisticsAnimationFrame = null;
        }
    },

    paintStatisticValues() {
        if (!this.statisticsRowElements) return;

        this.statisticsRowElements.forEach((elements, key) => {
            const value = this.statisticsDisplayValues.get(key) ?? this.statisticsTargetValues.get(key) ?? 0;
            elements.value.textContent = this.formatStatisticValue(Math.round(value));
        });
    },

    renderWarehouseStatistics() {
        if (!this.statisticsElement) return;

        const stats = this.getLiveStatistics();
        const rows = this.getStatisticRows(stats);
        this.ensureWarehouseStatisticsRows(rows);
        this.updateStatisticDisplayValues(rows);
    },

    // Gray out docked tag/author pills when the workspace capture limit is reached
    updateWarehouseCapacityUI() {
        const full = this.isWarehouseCaptureFull();
        const suppressFullGray = typeof this.shouldUseCooccurrenceDockMute === 'function' &&
            this.shouldUseCooccurrenceDockMute();
        if (this.dockElement) {
            this.dockElement.classList.toggle('is-capture-full', full && !suppressFullGray);
        }
        this.renderWarehouseStatistics();
    },

    // Macro view: matching-tag dots or whole author molecules stay filled;
    // filter-frame nested blocks remove matching molecules from the board.
    updateDotFocusFilter() {
        const level = DepthController.currentLevel;
        const isMacro = level === 1;
        const isV2Depth = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        const isCatalogDepth = level >= 2 &&
            typeof CatalogLayoutEngine !== 'undefined' &&
            !CatalogLayoutEngine.isLegacyMode() &&
            !isV2Depth;

        const { tags: activeTags, authors: activeAuthors, typologies: activeTypologies } =
            this.getActiveFocusCriteria();

        const { tags: filterTags, authors: filterAuthors, typologies: filterTypologies } =
            this.getFilterCriteria();
        const focus = activeTags.size > 0 || activeAuthors.size > 0 || activeTypologies.size > 0;
        const hasFilterCriteria = filterTags.size > 0 || filterAuthors.size > 0 ||
            filterTypologies.size > 0;
        const shouldPeel = hasFilterCriteria && isMacro;

        document.body.classList.toggle(
            'is-block-focus',
            focus && ((isV2Depth && level === 3) || isMacro || isCatalogDepth)
        );
        document.body.classList.toggle('is-block-filter', hasFilterCriteria);
        document.body.classList.toggle('is-catalog-lens', focus && (isCatalogDepth || (isV2Depth && level >= 2)));
        document.body.classList.toggle(
            'is-depth-workspace-active',
            isV2Depth && level >= 2 && this.getActiveBlockCount() > 0
        );
        document.body.classList.toggle(
            'is-depth-filter-layout',
            isV2Depth && level >= 2 && (hasFilterCriteria || focus)
        );

        const shouldFilter = new Set();
        const wrappers = document.querySelectorAll('.note-wrapper');

        wrappers.forEach((wrapper, noteIndex) => {
            if (hasFilterCriteria &&
                this.moleculeMatchesFilter(noteIndex, filterTags, filterAuthors, filterTypologies)) {
                shouldFilter.add(noteIndex);
            }
        });

        // Filter removed — restore molecules
        [...this.filterExitByNote.keys()].forEach(noteIndex => {
            if (!shouldFilter.has(noteIndex)) {
                this.cancelFilterExit(noteIndex, PhysicsEngine.bodiesData);
            }
        });
        [...this.filteredNoteIndices].forEach(noteIndex => {
            if (!shouldFilter.has(noteIndex)) {
                this.restoreFilteredNote(noteIndex, PhysicsEngine.bodiesData);
            }
        });

        wrappers.forEach((wrapper, noteIndex) => {
            const dots = wrapper.querySelectorAll('.layer-dot');
            const authorCode = wrapper.dataset.authorCode || '';

            if (this.filterExitByNote.has(noteIndex)) {
                return;
            }

            if (this.filteredNoteIndices.has(noteIndex)) {
                wrapper.classList.add('is-molecule-filtered-out');
                return;
            }

            if (shouldFilter.has(noteIndex)) {
                if (shouldPeel) {
                    this.beginFilterExit(noteIndex, PhysicsEngine.bodiesData);
                } else {
                    this.applyFilterInstant(noteIndex, PhysicsEngine.bodiesData);
                }
                return;
            }

            wrapper.classList.remove(
                'is-molecule-filtered-out',
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );

            if (!focus) {
                wrapper.classList.remove('is-molecule-focused', 'is-molecule-muted');
                dots.forEach(dot => {
                    dot.classList.remove('is-dot-focused', 'is-dot-muted');
                });
                return;
            }

            const moleculeTags = [...dots]
                .map(dot => dot.dataset.tag)
                .filter(Boolean);
            const noteTypology = this.getNoteTypology(noteIndex, wrapper);
            const isRelevant = this.noteMatchesActiveFocus(
                moleculeTags,
                authorCode,
                activeTags,
                activeAuthors,
                noteTypology,
                activeTypologies
            );

            wrapper.classList.toggle('is-molecule-focused', isRelevant);
            wrapper.classList.toggle('is-molecule-muted', !isRelevant);

            if (!isMacro) return;

            dots.forEach(dot => {
                const tag = dot.dataset.tag || '';
                const dotMatchesTag = tag && activeTags.has(tag);
                const dotMatchesAuthor = authorCode && activeAuthors.has(authorCode);
                const dotMatchesTypology = noteTypology && activeTypologies.has(noteTypology);
                const dotMatches = dotMatchesTag || dotMatchesAuthor || dotMatchesTypology;
                dot.classList.toggle('is-dot-focused', dotMatches);
                dot.classList.toggle('is-dot-muted', !dotMatches);
            });
        });

        if (PhysicsEngine.bodiesData) {
            PhysicsEngine.bodiesData.forEach(item => {
                item.isFiltered = this.filteredNoteIndices.has(item.noteIndex);
            });
        }

        if (typeof CatalogState !== 'undefined') {
            CatalogState.rebuildFromWarehouse();
        }

        if (isV2Depth && level === 3 && typeof DepthV2 !== 'undefined') {
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            DepthV2.relayoutForFilterChange({ force: true });
            if (typeof MicroMock !== 'undefined') {
                MicroMock.applyAll?.();
            }
        }

        this.updateWarehouseBlockRelevance();
        this.updateWarehouseCapacityUI();

        if (typeof NavigationMap !== 'undefined' && level === 3) {
            NavigationMap.notifyMapRefreshTick(false);
        }

        this.syncAllBlockRemovables();
    }
};
Object.assign(ActionWarehouse, {
    isWorkspaceGridRush() {
        return !!this.workspaceGridRush && performance.now() < this.workspaceGridRushUntil;
    },

    // Positional migration between original grid and workspace grid (first block only / last return)
    tickWorkspaceGridRush(bodiesData) {
        const mode = this.workspaceGridRush;
        if (!mode) return;

        if (performance.now() >= this.workspaceGridRushUntil) {
            this.workspaceGridRush = null;
            return;
        }

        const cfg = CONFIG.warehouse.workspaceGrid;
        const centers = this.workspaceCenters;
        const baseLerp = cfg.rushLerp ?? 0.28;
        const nearLerp = cfg.rushLerpNear ?? 0.16;
        const farR = scale(110);
        let allSettled = true;

        bodiesData.forEach(item => {
            if (item.overrideTarget) return;

            let targetX;
            let targetY;

            if (mode === 'out' || mode === 'shift') {
                const home = centers && centers[item.noteIndex];
                if (!home) {
                    allSettled = false;
                    return;
                }
                targetX = home.x + item.offsetX;
                targetY = home.y + item.offsetY;
            } else {
                targetX = item.physicsTargetX;
                targetY = item.physicsTargetY;
            }

            const body = item.body;
            const dx = targetX - body.position.x;
            const dy = targetY - body.position.y;
            const dist = Math.hypot(dx, dy);

            if (dist > cfg.rushSettleRadius) allSettled = false;

            let lerp = baseLerp;
            if (dist > farR) {
                lerp = Math.min(0.38, baseLerp * 1.3);
            } else if (dist < cfg.rushSettleRadius * 2.5) {
                lerp = nearLerp;
            }

            if (body.isStatic) Matter.Body.setStatic(body, false);
            Matter.Body.setPosition(body, {
                x: body.position.x + dx * lerp,
                y: body.position.y + dy * lerp
            });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
        });

        if (allSettled) this.workspaceGridRush = null;
    },

    // Recomputed after world rebuilds (e.g. window resize) while engaged
    refreshWorkspaceGrid() {
        if (this.workspaceCenters) {
            this.workspaceCenters = this.computeWorkspaceGrid({ relayout: false });
            this.realignBankMolecules(PhysicsEngine.bodiesData);
        }
    },

    getWorkspaceVoidRatio() {
        const cfg = CONFIG.warehouse.workspaceGrid;
        const activeCount = Math.max(1, this.getCrowdedBlockCount());
        return Math.min(
            cfg.voidViewportRatioMax,
            cfg.voidViewportRatioBase + (activeCount - 1) * cfg.voidViewportRatioPerBlock
        );
    },

    getWorkspaceCanvasRect() {
        const appRect = document.getElementById('app').getBoundingClientRect();
        return {
            left: appRect.left + window.pageXOffset,
            top: appRect.top + window.pageYOffset,
            W: appRect.width,
            H: appRect.height
        };
    },

    // Reapply frozen slot assignments with current void width (and canvas rect on resize)
    applyWorkspaceVoidExpansion() {
        const layout = this.workspaceSlotLayout;
        if (!layout) return null;

        const { padding: gridPadding } = this.getPrimaryGridMetrics();
        const { left, top, W, H } = this.getWorkspaceCanvasRect();
        const voidW = window.innerWidth * this.getWorkspaceVoidRatio();
        const bankW = Math.max(scale(48), (W - voidW) / 2 - gridPadding);

        const centers = [];

        const placeBankSlots = (bank, cell, slotEntries) => {
            const cols = Math.max(1, Math.floor(bankW / cell));
            const count = slotEntries.length;
            const rows = Math.max(1, Math.ceil(count / cols));
            const originY = top + (H - rows * cell) / 2;

            slotEntries.forEach((entry, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = bank === 'left'
                    ? left + gridPadding + col * cell + cell / 2
                    : left + W - gridPadding - col * cell - cell / 2;
                const y = originY + row * cell + cell / 2;
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    centers[entry.noteIndex] = { x, y };
                }
            });
        };

        const leftSlots = [];
        const rightSlots = [];
        layout.slots.forEach((slot, noteIndex) => {
            const entry = { noteIndex, row: slot.row, col: slot.col };
            if (slot.bank === 'left') leftSlots.push(entry);
            else rightSlots.push(entry);
        });

        leftSlots.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
        rightSlots.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));

        placeBankSlots('left', layout.leftCell ?? layout.cell, leftSlots);
        placeBankSlots('right', layout.rightCell ?? layout.cell, rightSlots);

        return this.relaxBankGridCenters(centers);
    },

    // Pre-separate bank slot centers so hull outlines sit side-by-side, not stacked
    relaxBankGridCenters(centers) {
        if (!centers || !this.workspaceSlotLayout) return centers;

        const orbitCfg = CONFIG.warehouse.orbit;
        const hullCfg = CONFIG.physics.hullCollision;
        const bodiesData = PhysicsEngine.bodiesData;
        const { half } = this.workspaceSlotLayout;
        const gap = hullCfg.gap;
        const strength = 0.48;
        const passes = 12;

        const relaxSide = (indices) => {
            const mols = indices
                .filter(i => centers[i])
                .map(noteIndex => ({
                    noteIndex,
                    cx: centers[noteIndex].x,
                    cy: centers[noteIndex].y,
                    radius: this.noteMoleculeExtent(bodiesData, noteIndex, orbitCfg)
                }));

            for (let pass = 0; pass < passes; pass++) {
                for (let i = 0; i < mols.length; i++) {
                    for (let j = i + 1; j < mols.length; j++) {
                        const a = mols[i];
                        const b = mols[j];
                        const dx = b.cx - a.cx;
                        const dy = b.cy - a.cy;
                        const dist = Math.hypot(dx, dy) || 0.01;
                        const minD = a.radius + b.radius + gap;
                        const overlap = minD - dist;
                        if (overlap <= 0) continue;

                        const nx = dx / dist;
                        const ny = dy / dist;
                        const push = overlap * strength * 0.5;
                        a.cx -= nx * push;
                        a.cy -= ny * push;
                        b.cx += nx * push;
                        b.cy += ny * push;
                    }
                }
            }

            mols.forEach(m => {
                centers[m.noteIndex] = { x: m.cx, y: m.cy };
            });
        };

        const left = [];
        const right = [];
        for (let i = 0; i < centers.length; i++) {
            if (!centers[i]) continue;
            (i < half ? left : right).push(i);
        }
        relaxSide(left);
        relaxSide(right);
        return centers;
    },

    maxBankMoleculeRadius(noteOffset, count) {
        const orbitCfg = CONFIG.warehouse.orbit;
        const bodiesData = PhysicsEngine.bodiesData;
        let maxR = orbitCfg.moleculeFootprint;
        for (let i = 0; i < count; i++) {
            maxR = Math.max(maxR, this.noteMoleculeExtent(bodiesData, noteOffset + i, orbitCfg));
        }
        return maxR;
    },

    // Two compact note banks at the canvas flanks, empty void at the center
    getPrimaryGridMetrics() {
        const cfg = CONFIG.warehouse.workspaceGrid;
        const app = document.getElementById('app');
        const wrapper = document.querySelector('.note-wrapper');
        if (!app) {
            return { gap: scale(5), padding: cfg.marginFallback, cellPitch: cfg.cellSizeFallback };
        }

        const appStyle = getComputedStyle(app);
        const gap = parseFloat(appStyle.columnGap) || parseFloat(appStyle.gap) || scale(5);
        const padding = parseFloat(appStyle.paddingLeft) || cfg.marginFallback;
        const wrapperW = wrapper ? wrapper.getBoundingClientRect().width : cfg.cellSizeFallback - gap;
        const cellPitch = wrapperW + gap;

        return { gap, padding, cellPitch };
    },

    computeWorkspaceGrid(options = {}) {
        if (options.relayout === true) {
            this.workspaceSlotLayout = null;
        } else if (this.workspaceSlotLayout) {
            return this.applyWorkspaceVoidExpansion();
        }

        const noteCenters = PhysicsEngine.noteCenters;
        const noteCount = noteCenters.length;
        if (noteCount === 0) return null;

        const { padding: gridPadding, cellPitch } = this.getPrimaryGridMetrics();
        const { left, top, W, H } = this.getWorkspaceCanvasRect();
        const voidW = window.innerWidth * this.getWorkspaceVoidRatio();
        const bankW = Math.max(scale(48), (W - voidW) / 2 - gridPadding);
        const bankH = H - 2 * gridPadding;
        const half = Math.ceil(noteCount / 2);
        const slots = new Map();

        const layoutBank = (count, isLeftBank, noteOffset) => {
            const hullGap = CONFIG.physics.hullCollision.gap;
            const minDiameter = this.maxBankMoleculeRadius(noteOffset, count) * 2 + hullGap;
            let cell = Math.max(cellPitch, minDiameter * 1.04);
            let cols = Math.max(1, Math.floor(bankW / cell));
            let rows = Math.max(1, Math.floor(bankH / cell));
            if (cols * rows < count) {
                cell = Math.max(minDiameter * 1.04, Math.sqrt((bankW * bankH) / count));
                cols = Math.max(1, Math.floor(bankW / cell));
                rows = Math.ceil(count / cols);
            }

            const usedRows = Math.min(rows, Math.ceil(count / cols));
            const originY = top + (H - usedRows * cell) / 2;
            const positions = [];

            for (let i = 0; i < count; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = isLeftBank
                    ? left + gridPadding + col * cell + cell / 2
                    : left + W - gridPadding - col * cell - cell / 2;
                const y = originY + row * cell + cell / 2;
                positions.push({ x, y });
                slots.set(noteOffset + i, {
                    bank: isLeftBank ? 'left' : 'right',
                    row,
                    col
                });
            }

            return { positions, cell, cols, rows, usedRows, originY };
        };

        const leftLayout = layoutBank(half, true, 0);
        const rightLayout = layoutBank(noteCount - half, false, half);

        this.workspaceSlotLayout = {
            leftCell: leftLayout.cell,
            rightCell: rightLayout.cell,
            half,
            leftUsedRows: leftLayout.usedRows,
            rightUsedRows: rightLayout.usedRows,
            slots
        };

        const centers = [];
        for (let i = 0; i < noteCount; i++) {
            if (!noteCenters[i]) continue;
            centers[i] = i < half ? leftLayout.positions[i] : rightLayout.positions[i - half];
        }
        return this.relaxBankGridCenters(centers);
    },

    getActiveBlockCount() {
        return this.blocks.filter(b => this.isWorkspaceOccupant(b)).length;
    },

    // Capture blocks only — drives crowded physics (not frames / dock phantoms)
    getCrowdedBlockCount() {
        return this.getActiveCaptureBlocks().length;
    },

    getMaxCaptureBlocks() {
        return CONFIG.warehouse.maxCaptureBlocks ?? 5;
    },

    isWarehouseCaptureFull() {
        return this.getCrowdedBlockCount() >= this.getMaxCaptureBlocks();
    },

    ensurePhysicsMaps() {
        if (!(this.orbitRingCountByBlock instanceof Map)) this.orbitRingCountByBlock = new Map();
        if (!(this.orbitAngleByNote instanceof Map)) this.orbitAngleByNote = new Map();
        if (!(this.stretchBindingByNote instanceof Map)) this.stretchBindingByNote = new Map();
        if (!(this.stretchGroupCounts instanceof Map)) this.stretchGroupCounts = new Map();
        if (!(this.stretchAxisByNote instanceof Map)) this.stretchAxisByNote = new Map();
        if (!(this.filterExitByNote instanceof Map)) this.filterExitByNote = new Map();
        if (!(this.stretchedNotes instanceof Set)) this.stretchedNotes = new Set();
        if (!(this.filteredNoteIndices instanceof Set)) this.filteredNoteIndices = new Set();
    },

    syncDeployedBlockPositions() {
        this.blocks.forEach(block => {
            if (!block.isDragging || !block.body) return;
            this.syncBody(block);
        });
    },

    isAnyCaptureBlockDragging() {
        return this.blocks.some(b =>
            b.isDragging &&
            b.carryOrbitWhileDragging &&
            this.isActiveCaptureBlock(b)
        );
    },

    isActiveCaptureBlock(block) {
        if (block.nestedIn) return false;
        if (block.type === 'author') return !!block.author;
        if (block.type === 'typology') return !!block.typology;
        return !!block.tag;
    },

    isBlockClickTransitionEligible(block) {
        if (!block || block.state !== 'active' || block.nestedIn) return false;
        if (!block.element?.classList.contains('is-deployed')) return false;
        if (block.type === 'frame' && block.frameKind === 'filter') return true;
        return this.isActiveCaptureBlock(block);
    },

    isBlockOnSurface(block) {
        if (block.element.classList.contains('is-deployed')) return true;
        if (block.nestedIn && block.nestedIn.element.classList.contains('is-deployed')) return true;
        return false;
    },

    isBlockFocusEligible(block) {
        return this.isBlockOnSurface(block) || !!(block.isDragging && block.carryOrbitWhileDragging);
    },

    // Blocks that occupy the workspace (deployed, dragged from dock/surface — not docked/nested)
    isWorkspaceOccupant(block) {
        if (block.state !== 'active') return false;
        if (block.nestedIn) return false;
        if (block.isDragging) {
            return !!(block.carryOrbitWhileDragging || block.body);
        }
        return this.isBlockOnSurface(block);
    },

    getCollisionBlocks() {
        return this.blocks.filter(b => {
            if (!this.isWorkspaceOccupant(b)) return false;
            if (b.nestedIn?.frameKind === 'filter') return false;
            if (!Number.isFinite(b.bodyX) || !Number.isFinite(b.bodyY)) return false;
            return b.type === 'frame' || b.type === 'tag' || b.type === 'author' || b.type === 'typology';
        });
    },

    getActiveCaptureBlocks() {
        return this.blocks.filter(b => {
            if (b.state !== 'active') return false;
            if (b.isDragging) {
                if (!b.carryOrbitWhileDragging) return false;
            } else if (!this.isBlockOnSurface(b)) {
                return false;
            }
            if (b.nestedIn?.frameKind === 'filter') return false;
            if (b.type === 'author') return !!b.author;
            if (b.type === 'tag') return !!b.tag;
            if (b.type === 'typology') return !!b.typology;
            return false;
        });
    },

    getActiveFocusCriteria() {
        const activeTags = new Set(
            this.blocks
                .filter(b =>
                    b.state === 'active' &&
                    b.type === 'tag' &&
                    b.tag &&
                    !b.nestedIn &&
                    this.isBlockFocusEligible(b)
                )
                .map(b => b.tag)
        );
        const activeAuthors = new Set(
            this.blocks
                .filter(b =>
                    b.state === 'active' &&
                    b.type === 'author' &&
                    b.author &&
                    !b.nestedIn &&
                    this.isBlockFocusEligible(b)
                )
                .map(b => b.author)
        );
        const activeTypologies = new Set(
            this.blocks
                .filter(b =>
                    b.state === 'active' &&
                    b.type === 'typology' &&
                    b.typology &&
                    !b.nestedIn &&
                    this.isBlockFocusEligible(b)
                )
                .map(b => b.typology)
        );
        this.blocks
            .filter(b =>
                b.state === 'active' &&
                b.nestedIn &&
                b.nestedIn.frameKind !== 'filter' &&
                this.isBlockFocusEligible(b)
            )
            .forEach(b => {
                if (b.type === 'tag' && b.tag) activeTags.add(b.tag);
                if (b.type === 'author' && b.author) activeAuthors.add(b.author);
                if (b.type === 'typology' && b.typology) activeTypologies.add(b.typology);
            });
        return { tags: activeTags, authors: activeAuthors, typologies: activeTypologies };
    },

    getNoteTypology(noteIndex, wrapper = null) {
        if (typeof AppState !== 'undefined' && AppState.items?.[noteIndex]) {
            return AppState.items[noteIndex].typology || '';
        }

        const w = wrapper ||
            (typeof this.getNoteWrapper === 'function' ? this.getNoteWrapper(noteIndex) : null) ||
            document.querySelector(`.note-wrapper[data-note-index="${noteIndex}"]`);
        return w?.dataset.typology || '';
    },

    getNoteFocusTagsAndAuthor(noteIndex, wrapper = null) {
        if (typeof AppState !== 'undefined' && AppState.items?.[noteIndex]) {
            const item = AppState.items[noteIndex];
            return {
                tags: (item.tags || []).map(t => t.name).filter(Boolean),
                authorCode: item.authorCode || ''
            };
        }

        const w = wrapper ||
            (typeof this.getNoteWrapper === 'function' ? this.getNoteWrapper(noteIndex) : null) ||
            document.querySelector(`.note-wrapper[data-note-index="${noteIndex}"]`);
        if (!w) return { tags: [], authorCode: '' };

        return {
            tags: [...w.querySelectorAll('.layer-dot')].map(d => d.dataset.tag).filter(Boolean),
            authorCode: w.dataset.authorCode || ''
        };
    },

    /* All active focus tags/authors/typologies must match the same note (AND, not OR). */
    noteMatchesActiveFocus(noteTags, authorCode, activeTags, activeAuthors, noteTypology = '', activeTypologies = null) {
        const tagList = Array.isArray(noteTags) ? noteTags : [...noteTags];
        const typologies = activeTypologies || new Set();
        if (!activeTags.size && !activeAuthors.size && !typologies.size) return false;

        for (const tag of activeTags) {
            if (!tagList.includes(tag)) return false;
        }
        for (const author of activeAuthors) {
            if (authorCode !== author) return false;
        }
        for (const typology of typologies) {
            if (noteTypology !== typology) return false;
        }
        return true;
    },

    noteMatchesActiveFocusForIndex(noteIndex, activeTags, activeAuthors, wrapper = null, activeTypologies = null) {
        const { tags, authorCode } = this.getNoteFocusTagsAndAuthor(noteIndex, wrapper);
        const noteTypology = this.getNoteTypology(noteIndex, wrapper);
        return this.noteMatchesActiveFocus(
            tags,
            authorCode,
            activeTags,
            activeAuthors,
            noteTypology,
            activeTypologies
        );
    },

    getFilterCriteria() {
        const tags = new Set();
        const authors = new Set();
        const typologies = new Set();
        this.blocks.forEach(b => {
            if (b.state !== 'active' || !b.nestedIn || b.nestedIn.frameKind !== 'filter') return;
            if (b.type === 'tag' && b.tag) tags.add(b.tag);
            if (b.type === 'author' && b.author) authors.add(b.author);
            if (b.type === 'typology' && b.typology) typologies.add(b.typology);
        });
        return { tags, authors, typologies };
    },

    isNoteFiltered(noteIndex) {
        return this.filteredNoteIndices.has(noteIndex);
    },

    moleculeMatchesFilter(noteIndex, filterTags, filterAuthors, filterTypologies = new Set()) {
        const wrappers = document.querySelectorAll('.note-wrapper');
        const wrapper = wrappers[noteIndex];
        if (!wrapper) return false;

        const authorCode = wrapper.dataset.authorCode || '';
        if (authorCode && filterAuthors.has(authorCode)) return true;

        const noteTypology = this.getNoteTypology(noteIndex, wrapper);
        if (noteTypology && filterTypologies.has(noteTypology)) return true;

        const dots = wrapper.querySelectorAll('.layer-dot');
        return [...dots].some(dot => {
            const tag = dot.dataset.tag || '';
            return tag && filterTags.has(tag);
        });
    },

    getBlockRingKey(block) {
        if (block.type === 'author') return `@${block.author}`;
        if (block.type === 'typology') return `~${block.typology}`;
        return block.tag;
    },

    dotMatchesBlock(block, dot) {
        if (block.type === 'author') {
            return !!dot.authorCode && dot.authorCode === block.author;
        }
        if (block.type === 'typology') {
            if (!block.typology) return false;
            const item = typeof AppState !== 'undefined' ? AppState.items?.[dot.noteIndex] : null;
            return item?.typology === block.typology;
        }
        return dot.tag === block.tag;
    },

    getCaptureBlockForDot(dot, blocks = null) {
        const active = blocks || this.getActiveCaptureBlocks();
        for (let i = 0; i < active.length; i++) {
            if (this.dotMatchesBlock(active[i], dot)) return active[i];
        }
        return null;
    },

    getNearestCaptureBlock(x, y, blocks = null) {
        const active = blocks || this.getActiveCaptureBlocks();
        let best = null;
        let bestD = Infinity;
        active.forEach(b => {
            if (!Number.isFinite(b.bodyX) || !Number.isFinite(b.bodyY)) return;
            const d = Math.hypot(x - b.bodyX, y - b.bodyY);
            if (d < bestD) {
                bestD = d;
                best = b;
            }
        });
        return best;
    },

    // Tag-matched block, or nearest capture block for siblings / multi-stretch dots
    getOrbitAnchorBlock(dot) {
        const ox = dot.overrideTarget?.x ?? dot.body.position.x;
        const oy = dot.overrideTarget?.y ?? dot.body.position.y;
        const tagged = this.getCaptureBlockForDot(dot);
        if (tagged && Number.isFinite(tagged.bodyX)) return tagged;
        return this.getNearestCaptureBlock(ox, oy);
    },

    refreshCaptureBlockCoords() {
        this.getActiveCaptureBlocks().forEach(block => {
            if (block.isDragging || !block.element) return;
            const rect = block.element.getBoundingClientRect();
            block.x = rect.left;
            block.y = rect.top;
            this.syncBody(block);
        });
    },

    clampTargetToBlockRing(x, y, block, maxRing = scale(280)) {
        if (!block || !Number.isFinite(block.bodyX) || !Number.isFinite(block.bodyY)) {
            return { x, y };
        }
        const bdx = x - block.bodyX;
        const bdy = y - block.bodyY;
        const bdist = Math.hypot(bdx, bdy);
        if (bdist <= maxRing) return { x, y };
        return {
            x: block.bodyX + bdx / bdist * maxRing,
            y: block.bodyY + bdy / bdist * maxRing
        };
    },

    enforceCapturedRingClamp(bodiesData, blockCount) {
        if (blockCount < 5) return;

        let hits = 0;
        let missBlock = 0;
        let bodySnaps = 0;
        let stretchSkipped = 0;
        let stretchBodyRecall = 0;
        const capturedNotes = new Set();
        const runawayRecallR = scale(140);
        const maxBodyReach = scale(280);
        const animating = this._kinematicEntryTicks > 0 || this._orbitTransitionTicks > 0;
        let skippedAnimating = 0;
        const recallBodies = this.isKinematicCaptureMode(blockCount);

        bodiesData.forEach(d => {
            if (!d.overrideTarget || d.onBankGrid) return;
            if (this.stretchedNotes.has(d.noteIndex)) {
                stretchSkipped++;
                return;
            }
            capturedNotes.add(d.noteIndex);
            const block = this.getOrbitAnchorBlock(d);
            if (!block) {
                missBlock++;
                return;
            }
            const beforeX = d.overrideTarget.x;
            const beforeY = d.overrideTarget.y;
            const beforeDist = Math.hypot(beforeX - block.bodyX, beforeY - block.bodyY);
            const c = this.clampTargetToBlockRing(beforeX, beforeY, block);
            if (beforeDist > scale(280) + 1) hits++;
            d.overrideTarget.x = c.x;
            d.overrideTarget.y = c.y;

            if (recallBodies && d.body && !d.body.isStatic && !animating) {
                const bodyDist = Math.hypot(d.body.position.x - c.x, d.body.position.y - c.y);
                if (bodyDist > runawayRecallR) {
                    Matter.Body.setPosition(d.body, { x: c.x, y: c.y });
                    Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
                    bodySnaps++;
                }
            } else if (recallBodies && animating && d.body && !d.body.isStatic) {
                const bodyDist = Math.hypot(d.body.position.x - c.x, d.body.position.y - c.y);
                if (bodyDist > runawayRecallR) skippedAnimating++;
            }
        });

        bodiesData.forEach(d => {
            if (d.onBankGrid || d.overrideTarget || !capturedNotes.has(d.noteIndex)) return;
            if (this.stretchedNotes.has(d.noteIndex)) return;
            const anchor = bodiesData.find(b =>
                b.noteIndex === d.noteIndex && b.overrideTarget && b.body && !b.onBankGrid
            );
            if (!anchor || !d.body || d.body.isStatic) return;
            const dx = d.body.position.x - anchor.body.position.x;
            const dy = d.body.position.y - anchor.body.position.y;
            const dist = Math.hypot(dx, dy);
            const maxSib = scale(100);
            if (dist > maxSib) {
                if (!recallBodies) return;
                Matter.Body.setPosition(d.body, {
                    x: anchor.body.position.x + dx / dist * maxSib,
                    y: anchor.body.position.y + dy / dist * maxSib
                });
                Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
                bodySnaps++;
            }
        });

        bodiesData.forEach(d => {
            if (!this.stretchedNotes.has(d.noteIndex) || d.onBankGrid || !d.overrideTarget) return;
            if (!recallBodies) return;
            if (!d.body || d.body.isStatic) return;
            let tx = d.overrideTarget.x;
            let ty = d.overrideTarget.y;
            const bodyDx = tx - d.body.position.x;
            const bodyDy = ty - d.body.position.y;
            const bodyDist = Math.hypot(bodyDx, bodyDy);
            if (bodyDist > maxBodyReach) {
                const scaleDown = maxBodyReach / bodyDist;
                tx = d.body.position.x + bodyDx * scaleDown;
                ty = d.body.position.y + bodyDy * scaleDown;
                d.overrideTarget.x = tx;
                d.overrideTarget.y = ty;
            }
            const recallDist = Math.hypot(d.body.position.x - tx, d.body.position.y - ty);
            const emergency = recallDist > maxBodyReach;
            if (recallDist > runawayRecallR && (!animating || emergency)) {
                Matter.Body.setPosition(d.body, { x: tx, y: ty });
                Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
                bodySnaps++;
                stretchBodyRecall++;
            }
        });
    },

    getAuthorRingDots(block, bodiesData) {
        const seen = new Set();
        const ringDots = [];
        bodiesData.forEach(d => {
            if (d.authorCode !== block.author) return;
            if (this.isNotePhysicsSuspended(d.noteIndex)) return;
            if (this.stretchedNotes.has(d.noteIndex)) return;
            if (seen.has(d.noteIndex)) return;
            seen.add(d.noteIndex);
            ringDots.push(d);
        });
        return ringDots;
    },

    getTypologyRingDots(block, bodiesData) {
        const seen = new Set();
        const ringDots = [];
        bodiesData.forEach(d => {
            const item = typeof AppState !== 'undefined' ? AppState.items?.[d.noteIndex] : null;
            if (!item || item.typology !== block.typology) return;
            if (this.isNotePhysicsSuspended(d.noteIndex)) return;
            if (this.stretchedNotes.has(d.noteIndex)) return;
            if (seen.has(d.noteIndex)) return;
            seen.add(d.noteIndex);
            ringDots.push(d);
        });
        return ringDots;
    },

    getCrowdedForceScale(blockCount = this.getCrowdedBlockCount()) {
        const table = CONFIG.physics.crowdedBlock.forceScale;
        const idx = Math.max(0, Math.min(blockCount, table.length - 1));
        let scaleVal = table[idx];
        if (blockCount > 7) {
            scaleVal *= Math.pow(0.9, blockCount - 7);
        }
        return scaleVal;
    },

    // Progressive taper from 5+ blocks — uses crowdedBlock tables without full crowded mode
    getHeavyWorkspaceTier(blockCount = this.getCrowdedBlockCount()) {
        if (blockCount < 5) return -1;
        const table = CONFIG.physics.crowdedBlock.targetLerp;
        const tier = Math.min(blockCount - 5, table.length - 1);
        // Block 7+ stays on tier 1 — tier 2 lerp (0.02) lets stretched targets run away
        return blockCount >= 7 ? Math.min(tier, 1) : tier;
    },

    getHeavyTargetLerp(blockCount = this.getCrowdedBlockCount()) {
        const tier = this.getHeavyWorkspaceTier(blockCount);
        if (tier < 0) return null;
        return CONFIG.physics.crowdedBlock.targetLerp[tier];
    },

    getHeavyCaptureDamping(blockCount = this.getCrowdedBlockCount()) {
        const tier = this.getHeavyWorkspaceTier(blockCount);
        if (tier < 0) return null;
        return CONFIG.physics.crowdedBlock.captureDamping[tier];
    },

    isKinematicCaptureMode(blockCount = this.getCrowdedBlockCount()) {
        const minTier = CONFIG.physics.crowdedBlock.kinematicTierMin ?? 1;
        return this.getHeavyWorkspaceTier(blockCount) >= minTier;
    },

    kinematicLerpToward(curX, curY, tgtX, tgtY, lerp, maxStepPx) {
        let dx = (tgtX - curX) * lerp;
        let dy = (tgtY - curY) * lerp;
        const step = Math.hypot(dx, dy);
        if (maxStepPx > 0 && step > maxStepPx) {
            const s = maxStepPx / step;
            dx *= s;
            dy *= s;
        }
        return { x: curX + dx, y: curY + dy };
    },

    kinematicAdaptiveMaxStep(baseStep, lag, cfg = CONFIG.physics.crowdedBlock) {
        const far = scale(cfg.kinematicLagFar ?? 40);
        const veryFar = scale(cfg.kinematicLagVeryFar ?? 110);
        const boostMax = cfg.kinematicLagBoostMax ?? 3.5;
        if (lag <= far) return baseStep;
        if (lag >= veryFar) return baseStep * boostMax;
        const t = (lag - far) / (veryFar - far);
        return baseStep * (1 + t * (boostMax - 1));
    },

    clampStretchLane(slotLane, cfg) {
        const cap = Math.max(scale(260), cfg.stretchLaneSpacing * 8);
        return Math.max(-cap, Math.min(cap, slotLane));
    },

    getOrbitJumpCap(blockCount = this.getCrowdedBlockCount()) {
        if (blockCount >= 7) return scale(25);
        if (blockCount >= 6) return scale(35);
        if (blockCount >= 5) return scale(46);
        if (blockCount >= 3) return scale(90);
        return Infinity;
    },

    // Called by PhysicsEngine every tick, before dot forces are computed
    tick(bodiesData, time) {
        this.ensurePhysicsMaps();
        this.tickFilterExit(bodiesData);
        this.syncDeployedBlockPositions();
        this.refreshCaptureBlockCoords();
        this.updateOrbits(bodiesData, time);
        this.refreshPhysicsFlags(bodiesData);
    },

    // O(n) pass — cache bank/capture flags; freeze settled bank dots as static bodies
    refreshPhysicsFlags(bodiesData) {
        const capturedNotes = new Set();
        bodiesData.forEach(d => {
            if (d.overrideTarget) capturedNotes.add(d.noteIndex);
        });

        const ws = this.workspaceCenters;
        const rushActive = this.isWorkspaceGridRush();

        bodiesData.forEach(item => {
            item.onBankGrid = !!(ws && ws[item.noteIndex] &&
                !item.isFiltered && !item.isFilterExiting &&
                !item.overrideTarget && !capturedNotes.has(item.noteIndex));
        });

        if (ws && !rushActive) {
            this.syncBankGridStatic(bodiesData);
        } else if (!ws) {
            this.releaseBankGridStatic(bodiesData);
        }
    },

    syncBankGridStatic(bodiesData) {
        bodiesData.forEach(item => {
            if (item.onBankGrid) {
                if (!item.body.isStatic) {
                    const home = this.workspaceCenters[item.noteIndex];
                    if (home) {
                        Matter.Body.setPosition(item.body, {
                            x: home.x + item.offsetX,
                            y: home.y + item.offsetY
                        });
                    }
                    Matter.Body.setStatic(item.body, true);
                    item._bankWasStatic = true;
                }
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
            } else if (item._bankWasStatic) {
                Matter.Body.setStatic(item.body, false);
                item._bankWasStatic = false;
            }
        });
    },

    releaseBankGridStatic(bodiesData) {
        bodiesData.forEach(item => {
            item.onBankGrid = false;
            if (item._bankWasStatic) {
                Matter.Body.setStatic(item.body, false);
                item._bankWasStatic = false;
            }
        });
    },
});
Object.assign(ActionWarehouse, {
    isNoteFilterAnimating(noteIndex) {
        return this.filterExitByNote.has(noteIndex);
    },

    isNotePhysicsSuspended(noteIndex) {
        return this.isNoteFiltered(noteIndex) || this.isNoteFilterAnimating(noteIndex);
    },

    // Molecule fully on the workspace bank grid — not captured by any block
    isBankGridDot(item) {
        return !!item.onBankGrid;
    },

    // After void expansion — snap settled bank molecules only; skip mid-transit grid dots
    realignBankMolecules(bodiesData) {
        if (!this.workspaceCenters || !bodiesData) return;

        const capturedNotes = new Set();
        bodiesData.forEach(d => {
            if (d.overrideTarget) capturedNotes.add(d.noteIndex);
        });

        const motionCfg = CONFIG.physics.motion;
        const pinLerp = motionCfg.workspaceBankPinLerp ?? 0.14;
        const settleR = CONFIG.warehouse.workspaceGrid.rushSettleRadius ?? scale(10);
        const driftR = motionCfg.workspaceBankDriftRadius ?? scale(28);
        const nearR = Math.max(settleR * 2, driftR * 2);

        let hardSnap = 0;
        let softPin = 0;
        let skipped = 0;
        let maxDelta = 0;

        bodiesData.forEach(item => {
            if (item.isFiltered || item.isFilterExiting || capturedNotes.has(item.noteIndex)) return;
            const home = this.workspaceCenters[item.noteIndex];
            if (!home) return;

            const tx = home.x + item.offsetX;
            const ty = home.y + item.offsetY;
            const bx = item.body.position.x;
            const by = item.body.position.y;
            const dist = Math.hypot(tx - bx, ty - by);

            if (item.onBankGrid || item._bankWasStatic) {
                maxDelta = Math.max(maxDelta, dist);
                if (item.body.isStatic && dist > settleR) {
                    Matter.Body.setStatic(item.body, false);
                }
                if (dist <= settleR * 0.5) {
                    Matter.Body.setPosition(item.body, { x: tx, y: ty });
                } else {
                    const lerp = dist > scale(90)
                        ? 0.28
                        : (dist > scale(35) ? pinLerp * 1.35 : pinLerp);
                    Matter.Body.setPosition(item.body, {
                        x: bx + (tx - bx) * lerp,
                        y: by + (ty - by) * lerp
                    });
                }
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                hardSnap++;
            } else if (dist < nearR) {
                Matter.Body.setPosition(item.body, {
                    x: bx + (tx - bx) * pinLerp,
                    y: by + (ty - by) * pinLerp
                });
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                softPin++;
            } else {
                skipped++;
            }
        });
        this.refreshPhysicsFlags(bodiesData);

        window.__physDbgRealign = {
            ts: performance.now(),
            hardSnap,
            softPin,
            skipped,
            maxDelta
        };
    },

    getNoteWrapper(noteIndex) {
        const byData = document.querySelector(
            `.note-wrapper[data-note-index="${noteIndex}"]`
        );
        if (byData) return byData;
        return document.querySelectorAll('.note-wrapper')[noteIndex] || null;
    },

    restoreAllFilterVisuals(bodiesData) {
        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            wrapper.classList.remove(
                'is-molecule-filtered-out',
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );
        });
        if (!bodiesData) return;
        bodiesData.forEach(item => {
            item.isFiltered = false;
            item.isFilterExiting = false;
        });
    },

    cancelFilterExit(noteIndex, bodiesData) {
        this.filterExitByNote.delete(noteIndex);
        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );
        }
        if (bodiesData) {
            this.reenterMoleculeFromBank(noteIndex, bodiesData);
        }
    },

    reenterMoleculeFromBank(noteIndex, bodiesData) {
        if (!this.workspaceCenters) {
            this.workspaceCenters = this.computeWorkspaceGrid();
        }

        const cfg = CONFIG.warehouse.filterExit;
        const app = document.getElementById('app');
        const appRect = app ? app.getBoundingClientRect() : null;
        const canvasLeft = appRect ? appRect.left + window.pageXOffset : 0;
        const canvasRight = appRect ? canvasLeft + appRect.width : window.innerWidth;

        const noteCount = PhysicsEngine.noteCenters.length;
        const half = Math.ceil(noteCount / 2);
        const isLeftBank = noteIndex < half;
        const home = this.workspaceCenters && this.workspaceCenters[noteIndex];
        const offScreenPad = cfg.restoreOffScreenPad;

        bodiesData.forEach(item => {
            if (item.noteIndex !== noteIndex) return;

            let spawnX;
            let spawnY;
            if (home) {
                spawnX = home.x + item.offsetX;
                spawnY = home.y + item.offsetY;
            } else {
                spawnX = item.physicsTargetX;
                spawnY = item.physicsTargetY;
            }

            spawnX = isLeftBank
                ? Math.min(spawnX, canvasLeft) - offScreenPad
                : Math.max(spawnX, canvasRight) + offScreenPad;

            Matter.Body.setPosition(item.body, { x: spawnX, y: spawnY });
            Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
            item.overrideTarget = null;
            item.smoothTarget = null;
            item.isFiltered = false;
            item.isFilterExiting = false;
        });
    },

    restoreFilteredNote(noteIndex, bodiesData) {
        this.filteredNoteIndices.delete(noteIndex);
        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) wrapper.classList.remove('is-molecule-filtered-out');
        if (bodiesData) {
            this.reenterMoleculeFromBank(noteIndex, bodiesData);
        }
    },

    // L2/L3 — instant filter (no peel animation)
    applyFilterInstant(noteIndex, bodiesData) {
        if (this.filteredNoteIndices.has(noteIndex)) return;

        this.filterExitByNote.delete(noteIndex);

        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade',
                'is-molecule-focused',
                'is-molecule-muted'
            );
            wrapper.classList.add('is-molecule-filtered-out');
        }

        this.filteredNoteIndices.add(noteIndex);

        if (bodiesData) {
            bodiesData.forEach(item => {
                if (item.noteIndex !== noteIndex) return;
                item.isFiltered = true;
                item.isFilterExiting = false;
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                item.overrideTarget = null;
                item.smoothTarget = null;
            });
        }
    },

    beginFilterExit(noteIndex, bodiesData) {
        if (this.filterExitByNote.has(noteIndex) || this.filteredNoteIndices.has(noteIndex)) return;

        this.filterExitByNote.set(noteIndex, {
            phase: 'hollow',
            phaseStart: performance.now()
        });

        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtered-out',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade',
                'is-molecule-focused',
                'is-molecule-muted'
            );
            wrapper.classList.add('is-molecule-filtering-hollow');
            wrapper.querySelectorAll('.layer-dot').forEach(dot => {
                dot.classList.remove('is-dot-focused');
                dot.classList.add('is-dot-muted');
            });
        }

        if (bodiesData) {
            bodiesData.forEach(item => {
                if (item.noteIndex !== noteIndex) return;
                item.isFilterExiting = true;
                item.isFiltered = false;
                item.overrideTarget = null;
                item.smoothTarget = null;
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
            });
        }
    },

    igniteFilterPeel(noteIndex, bodiesData) {
        const cfg = CONFIG.warehouse.filterExit;
        const dots = bodiesData.filter(d => d.noteIndex === noteIndex);
        if (dots.length === 0) return;

        const app = document.getElementById('app');
        const appRect = app ? app.getBoundingClientRect() : null;
        const canvasCenterX = appRect
            ? appRect.left + window.pageXOffset + appRect.width / 2
            : window.innerWidth / 2;

        let cx = 0;
        dots.forEach(d => { cx += d.body.position.x; });
        cx /= dots.length;

        const dirX = cx < canvasCenterX ? -1 : 1;

        dots.forEach(d => {
            const jitter = cfg.peelJitter;
            const vx = dirX * cfg.peelSpeed + (Math.random() - 0.5) * jitter * 0.15;
            const vy = (Math.random() - 0.5) * jitter;

            Matter.Body.setVelocity(d.body, { x: vx, y: vy });
            Matter.Body.set(d.body, { frictionAir: cfg.peelFrictionAir });
            d.overrideTarget = null;
            d.smoothTarget = null;
            d.isFilterExiting = true;
        });
    },

    completeFilterExit(noteIndex, bodiesData) {
        this.filterExitByNote.delete(noteIndex);
        this.filteredNoteIndices.add(noteIndex);

        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );
            wrapper.classList.add('is-molecule-filtered-out');
        }

        if (bodiesData) {
            bodiesData.forEach(item => {
                if (item.noteIndex !== noteIndex) return;
                item.isFiltered = true;
                item.isFilterExiting = false;
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                item.overrideTarget = null;
                item.smoothTarget = null;
            });
        }
    },

    buildCooccurrenceSets(activeTags, activeAuthors, activeTypologies = new Set()) {
        const coTags = new Set();
        const coAuthors = new Set();
        const coTypologies = new Set();
        const items = typeof AppState !== 'undefined' ? AppState.items : [];

        items.forEach(item => {
            const noteTags = (item.tags || []).map(t => t.name).filter(Boolean);
            const author = item.authorCode || '';
            const typology = item.typology || '';

            if (!this.noteMatchesActiveFocus(
                noteTags, author, activeTags, activeAuthors, typology, activeTypologies
            )) return;

            noteTags.forEach(tag => coTags.add(tag));
            if (author) coAuthors.add(author);
            if (typology) coTypologies.add(typology);
        });

        return { coTags, coAuthors, coTypologies };
    },

    isBlockDockedInTray(block) {
        if (!block?.element || block.nestedIn) return false;
        if (block.state !== 'docked') return false;
        if (block.element.classList.contains('is-deployed')) return false;
        if (block.element.classList.contains('is-depth-ui-mounted')) return false;
        if (block.element.classList.contains('is-dragging')) return false;
        return block.type === 'tag' || block.type === 'author' || block.type === 'typology';
    },

    isDockBlockCoRelevant(block, coTags, coAuthors, coTypologies = new Set()) {
        if (block.type === 'tag' && block.tag) return coTags.has(block.tag);
        if (block.type === 'author' && block.author) return coAuthors.has(block.author);
        if (block.type === 'typology' && block.typology) return coTypologies.has(block.typology);
        return true;
    },

    shouldUseCooccurrenceDockMute() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        const isV2Depth = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        if (!isV2Depth || level < 2 || level > 3) return false;
        const { tags, authors, typologies } = this.getActiveFocusCriteria();
        return tags.size > 0 || authors.size > 0 || typologies.size > 0;
    },

    updateWarehouseBlockRelevance() {
        const useCooccurrence = this.shouldUseCooccurrenceDockMute();
        if (this.dockElement) {
            this.dockElement.classList.toggle('is-cooccurrence-filter', useCooccurrence);
        }

        if (!useCooccurrence) {
            this.blocks.forEach(block => {
                block.element?.classList.remove('is-dock-irrelevant');
                block.slotElement?.classList.remove('is-dock-irrelevant');
            });
            this.restoreDockTrayOrder();
            this.restoreDepthBlockBarOrder();
            return;
        }

        const { tags: activeTags, authors: activeAuthors, typologies: activeTypologies } =
            this.getActiveFocusCriteria();
        const { coTags, coAuthors, coTypologies } =
            this.buildCooccurrenceSets(activeTags, activeAuthors, activeTypologies);

        this.blocks.forEach(block => {
            if (!this.isBlockDockedInTray(block)) {
                block.element?.classList.remove('is-dock-irrelevant');
                block.slotElement?.classList.remove('is-dock-irrelevant');
                return;
            }

            const irrelevant = !this.isDockBlockCoRelevant(block, coTags, coAuthors, coTypologies);
            block.element.classList.toggle('is-dock-irrelevant', irrelevant);
            block.slotElement?.classList.toggle('is-dock-irrelevant', irrelevant);
        });

        this.reorderDockTrayByRelevance(coTags, coAuthors, coTypologies);
        this.reorderDepthBlockBar(coTags, coAuthors, coTypologies);
    },

    getDepthBarDeployedBlocks() {
        if (!this.depthBlockBarElement) return [];
        return this.blocks.filter(block =>
            block.state === 'active' &&
            block.element?.classList.contains('is-deployed') &&
            block.element?.classList.contains('is-depth-ui-mounted') &&
            !block.nestedIn &&
            block.element.parentNode === this.depthBlockBarElement
        );
    },

    getBlockCatalogOrderIndex(block) {
        this.ensureDockTrayBaseOrder();
        const baseIdx = this._dockTrayBaseOrder?.indexOf(block);
        if (baseIdx >= 0) return baseIdx;
        const blocksIdx = this.blocks.indexOf(block);
        return blocksIdx >= 0 ? blocksIdx : 9999;
    },

    reorderDepthBlockBar(coTags, coAuthors, coTypologies = new Set()) {
        if (!this.depthBlockBarElement) return;

        const deployed = this.getDepthBarDeployedBlocks();
        if (!deployed.length) return;

        const { tags: activeTags, authors: activeAuthors, typologies: activeTypologies } =
            this.getActiveFocusCriteria();

        const rank = (block) => {
            const isPrimaryFocus =
                (block.type === 'tag' && activeTags.has(block.tag)) ||
                (block.type === 'author' && activeAuthors.has(block.author)) ||
                (block.type === 'typology' && activeTypologies.has(block.typology));
            if (isPrimaryFocus) return 0;
            if (block.type === 'frame') return 1;
            if (this.isDockBlockCoRelevant(block, coTags, coAuthors, coTypologies)) return 2;
            return 3;
        };

        deployed.sort((a, b) => {
            const byRank = rank(a) - rank(b);
            if (byRank !== 0) return byRank;
            return this.getBlockCatalogOrderIndex(a) - this.getBlockCatalogOrderIndex(b);
        });

        deployed.forEach(block => {
            this.depthBlockBarElement.appendChild(block.element);
        });
    },

    restoreDepthBlockBarOrder() {
        const deployed = this.getDepthBarDeployedBlocks();
        if (!deployed.length) return;

        deployed.sort(
            (a, b) => this.getBlockCatalogOrderIndex(a) - this.getBlockCatalogOrderIndex(b)
        );
        deployed.forEach(block => {
            this.depthBlockBarElement.appendChild(block.element);
        });
    },

    tickFilterExit(bodiesData) {
        if (this.filterExitByNote.size === 0) return;

        const cfg = CONFIG.warehouse.filterExit;
        const now = performance.now();
        const toComplete = [];

        this.filterExitByNote.forEach((state, noteIndex) => {
            const elapsed = now - state.phaseStart;

            if (state.phase === 'hollow' && elapsed >= cfg.hollowDuration) {
                state.phase = 'peel';
                state.phaseStart = now;

                const wrapper = this.getNoteWrapper(noteIndex);
                if (wrapper) {
                    wrapper.classList.remove('is-molecule-filtering-hollow');
                    wrapper.classList.add('is-molecule-filtering-peel');
                    requestAnimationFrame(() => wrapper.classList.add('is-filter-peel-fade'));
                }
                this.igniteFilterPeel(noteIndex, bodiesData);
            } else if (state.phase === 'peel' && elapsed >= cfg.peelDuration) {
                toComplete.push(noteIndex);
            }
        });

        toComplete.forEach(noteIndex => this.completeFilterExit(noteIndex, bodiesData));
    },
});
Object.assign(ActionWarehouse, {
    stabilizeOrbitTargets(bodiesData, prevTargets, blockCount) {
        if (!prevTargets || prevTargets.size === 0 || blockCount < 2) return;

        const heavyLerp = this.getHeavyTargetLerp(blockCount);
        const blend = heavyLerp != null
            ? heavyLerp
            : (CONFIG.physics.targetSmoothing.multiBlock ?? 0.1);
        const kinematic = this.isKinematicCaptureMode(blockCount);
        const kCfg = CONFIG.physics.crowdedBlock;

        let jumpCap = this.getOrbitJumpCap(blockCount);
        if (kinematic) {
            jumpCap = Math.min(jumpCap, scale(kCfg.kinematicJumpCap ?? 22));
        }
        if (blockCount >= 5 && this.stretchedNotes.size >= 7) {
            jumpCap = Math.min(jumpCap, scale(28));
        }
        if (this._orbitTransitionTicks > 0) {
            jumpCap = Math.min(jumpCap, blockCount >= 7 ? scale(10) : scale(14));
            this._orbitTransitionTicks--;
        }
        const moderateJump = scale(16);
        const fuseThreshold = Math.max(scale(150), jumpCap * 3);
        let maxOrbitJump = 0;
        let fuseHits = 0;
        let clippedJumpCount = 0;

        bodiesData.forEach(d => {
            if (!d.overrideTarget) return;

            const captureBlock = blockCount >= 5 && !this.stretchedNotes.has(d.noteIndex)
                ? this.getOrbitAnchorBlock(d) : null;
            const rawLayoutX = d.overrideTarget.x;
            const rawLayoutY = d.overrideTarget.y;
            let layoutX = rawLayoutX;
            let layoutY = rawLayoutY;

            if (captureBlock) {
                const clamped = this.clampTargetToBlockRing(layoutX, layoutY, captureBlock);
                layoutX = clamped.x;
                layoutY = clamped.y;
            }

            const prev = prevTargets.get(d);
            if (!prev) {
                d.overrideTarget.x = layoutX;
                d.overrideTarget.y = layoutY;
                if (d.smoothTarget) {
                    d.smoothTarget.x = layoutX;
                    d.smoothTarget.y = layoutY;
                }
                return;
            }

            const rawJump = Math.hypot(rawLayoutX - prev.x, rawLayoutY - prev.y);
            if (rawJump > maxOrbitJump) maxOrbitJump = rawJump;

            let fuseX = prev.x;
            let fuseY = prev.y;
            if (captureBlock) {
                const ringPrev = this.clampTargetToBlockRing(prev.x, prev.y, captureBlock);
                fuseX = ringPrev.x;
                fuseY = ringPrev.y;
            }

            if (!Number.isFinite(layoutX) || !Number.isFinite(layoutY)) {
                d.overrideTarget.x = fuseX;
                d.overrideTarget.y = fuseY;
            } else {
                let fuseStepped = false;
                const fuseJump = Math.hypot(layoutX - fuseX, layoutY - fuseY);

                if (fuseJump > fuseThreshold) {
                    const tdist = fuseJump || 1;
                    d.overrideTarget.x = fuseX + (layoutX - fuseX) / tdist * jumpCap;
                    d.overrideTarget.y = fuseY + (layoutY - fuseY) / tdist * jumpCap;
                    fuseStepped = true;
                    fuseHits++;
                    clippedJumpCount++;
                } else if (fuseJump > jumpCap) {
                    const tdist = fuseJump || 1;
                    d.overrideTarget.x = fuseX + (layoutX - fuseX) / tdist * jumpCap;
                    d.overrideTarget.y = fuseY + (layoutY - fuseY) / tdist * jumpCap;
                    clippedJumpCount++;
                } else {
                    d.overrideTarget.x = layoutX;
                    d.overrideTarget.y = layoutY;
                }

                if (!fuseStepped) {
                    const curX = d.overrideTarget.x;
                    const curY = d.overrideTarget.y;
                    const postJump = Math.hypot(curX - fuseX, curY - fuseY);
                    let stepBlend = blend;
                    if (rawJump > moderateJump) {
                        const stepCap = kinematic
                            ? (kCfg.kinematicStepCap ?? 0.12)
                            : (blockCount >= 7 ? 0.18 : (blockCount >= 6 ? 0.22 : 0.45));
                        stepBlend = Math.min(stepCap, 0.1 + postJump / scale(55));
                        if (rawJump > jumpCap * 0.85) {
                            const floorBlend = kinematic
                                ? (kCfg.kinematicStepFloor ?? 0.08)
                                : (blockCount >= 7 ? 0.15 : (blockCount >= 6 ? 0.18 : 0.3));
                            stepBlend = Math.max(stepBlend, floorBlend);
                        }
                    }

                    d.overrideTarget.x = fuseX + (curX - fuseX) * stepBlend;
                    d.overrideTarget.y = fuseY + (curY - fuseY) * stepBlend;
                }

                if (fuseStepped && d.smoothTarget) {
                    const catchLerp = blockCount >= 6 ? 0.28 : 0.22;
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchLerp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchLerp;
                } else if (rawJump > jumpCap && d.smoothTarget) {
                    const catchLerp = 0.26;
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchLerp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchLerp;
                }
            }

            if (captureBlock) {
                const ringClamped = this.clampTargetToBlockRing(
                    d.overrideTarget.x, d.overrideTarget.y, captureBlock
                );
                d.overrideTarget.x = ringClamped.x;
                d.overrideTarget.y = ringClamped.y;
                if (d.smoothTarget) {
                    d.smoothTarget.x = ringClamped.x;
                    d.smoothTarget.y = ringClamped.y;
                }
            } else if (blockCount < 6 && d.body && !d.onBankGrid && !this.stretchedNotes.has(d.noteIndex)) {
                const bodyDx = d.overrideTarget.x - d.body.position.x;
                const bodyDy = d.overrideTarget.y - d.body.position.y;
                const bodyDist = Math.hypot(bodyDx, bodyDy);
                const maxBodyReach = scale(280);
                if (bodyDist > maxBodyReach) {
                    const scaleDown = maxBodyReach / bodyDist;
                    d.overrideTarget.x = d.body.position.x + bodyDx * scaleDown;
                    d.overrideTarget.y = d.body.position.y + bodyDy * scaleDown;
                    if (d.smoothTarget) {
                        d.smoothTarget.x = d.overrideTarget.x;
                        d.smoothTarget.y = d.overrideTarget.y;
                    }
                }
            }
        });

        window.__physDbgOrbit = {
            maxOrbitJump, fuseHits, clippedJumpCount, jumpCap, fuseThreshold,
            blockCount, ts: performance.now()
        };
    },

    smoothOrbitTargets(bodiesData, activeBlockCount) {
        if (activeBlockCount === 0) {
            bodiesData.forEach(d => { d.smoothTarget = null; });
            return;
        }

        const smoothCfg = CONFIG.physics.targetSmoothing;
        const blocksDragging = this.isAnyCaptureBlockDragging();
        const kinematic = this.isKinematicCaptureMode(activeBlockCount);
        const kCfg = CONFIG.physics.crowdedBlock;

        bodiesData.forEach(d => {
            if (!d.overrideTarget) {
                d.smoothTarget = null;
                return;
            }

            if (!d.smoothTarget) {
                d.smoothTarget = { x: d.overrideTarget.x, y: d.overrideTarget.y };
                return;
            }

            if (kinematic) {
                const isStretched = this.stretchedNotes.has(d.noteIndex);
                let sLerp;
                let maxStep;
                if (blocksDragging) {
                    sLerp = kCfg.kinematicSmoothLerpDrag ?? 0.22;
                    maxStep = scale(kCfg.kinematicSmoothMaxStepDrag ?? 3.2);
                } else if (isStretched) {
                    sLerp = kCfg.kinematicSmoothLerpStretch ?? 0.16;
                    maxStep = scale(kCfg.kinematicSmoothMaxStep ?? 2.2);
                } else {
                    sLerp = kCfg.kinematicSmoothLerp ?? 0.14;
                    maxStep = scale(kCfg.kinematicSmoothMaxStep ?? 2.2);
                }
                const entryMul = this._kinematicEntryTicks > 0 ? 1.8 : 1;
                const blockMul = activeBlockCount >= 7
                    ? (kCfg.kinematicBlock7StepMul ?? 1.3) : 1;
                const transMul = this._orbitTransitionTicks > 0 ? 1.4 : 1;
                const smoothLag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (smoothLag > scale(22)) {
                    sLerp = Math.min(0.42, sLerp * 2.2);
                    maxStep *= 1.6;
                }
                const stepCap = this.kinematicAdaptiveMaxStep(
                    maxStep * entryMul * blockMul * transMul, smoothLag, kCfg
                );
                const next = this.kinematicLerpToward(
                    d.smoothTarget.x, d.smoothTarget.y,
                    d.overrideTarget.x, d.overrideTarget.y,
                    sLerp, stepCap
                );
                d.smoothTarget.x = next.x;
                d.smoothTarget.y = next.y;
                return;
            }

            const isStretched = this.stretchedNotes.has(d.noteIndex);

            if (activeBlockCount >= 5 && !isStretched) {
                const lag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (lag > scale(18)) {
                    const catchLerp = activeBlockCount === 5 ? 0.16 : 0.2;
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchLerp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchLerp;
                    return;
                }
                if (lag > scale(5)) {
                    const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                    let catchLerp = heavyLerp != null
                        ? Math.min(0.14, heavyLerp * 5)
                        : 0.12;
                    if (activeBlockCount >= 6) {
                        catchLerp = Math.max(catchLerp, 0.22);
                    }
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchLerp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchLerp;
                    return;
                }
            }

            if (isStretched) {
                if (activeBlockCount < 2) {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                    return;
                }
                let stretchLerp = smoothCfg.stretched ?? 0.22;
                if (activeBlockCount >= 6) {
                    const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                    stretchLerp = heavyLerp != null ? heavyLerp * 1.1 : stretchLerp * 0.9;
                }
                if (blocksDragging) {
                    stretchLerp = Math.min(0.42, stretchLerp * 1.45);
                }
                d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * stretchLerp;
                d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * stretchLerp;
                return;
            }

            const jump = Math.hypot(
                d.overrideTarget.x - d.smoothTarget.x,
                d.overrideTarget.y - d.smoothTarget.y
            );
            if (jump > smoothCfg.stretchJumpReset) {
                if (activeBlockCount >= 2) {
                    const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                    const catchUp = heavyLerp != null
                        ? Math.min(0.18, heavyLerp * 3)
                        : Math.min(0.28, (smoothCfg.multiBlock ?? 0.1) * 2.2);
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * catchUp;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * catchUp;
                } else {
                    d.smoothTarget.x = d.overrideTarget.x;
                    d.smoothTarget.y = d.overrideTarget.y;
                }
                return;
            }

            let lerp;
            if (blocksDragging) {
                lerp = smoothCfg.dragBlock ?? 0.28;
            } else {
                const heavyLerp = this.getHeavyTargetLerp(activeBlockCount);
                lerp = heavyLerp != null
                    ? heavyLerp
                    : (activeBlockCount >= 2 ? smoothCfg.multiBlock : smoothCfg.singleBlock);
            }
            if (d.body && !d.onBankGrid) {
                const bodyLag = Math.hypot(
                    d.overrideTarget.x - d.body.position.x,
                    d.overrideTarget.y - d.body.position.y
                );
                const pres = typeof isPresentationMode === 'function' && isPresentationMode();
                if (bodyLag > scale(55)) {
                    lerp = Math.min(pres ? 0.17 : 0.3, lerp * (pres ? 1.25 : 2.1));
                } else if (bodyLag > scale(28)) {
                    lerp = Math.min(pres ? 0.14 : 0.24, lerp * (pres ? 1.15 : 1.45));
                }
            }
            d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * lerp;
            d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * lerp;
        });

        if (activeBlockCount >= 6 && !kinematic) {
            let postSmoothMaxLag = 0;
            bodiesData.forEach(d => {
                if (!d.overrideTarget || !d.smoothTarget) return;
                const lag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (lag > postSmoothMaxLag) postSmoothMaxLag = lag;
                if (lag > scale(10)) {
                    d.smoothTarget.x += (d.overrideTarget.x - d.smoothTarget.x) * 0.24;
                    d.smoothTarget.y += (d.overrideTarget.y - d.smoothTarget.y) * 0.24;
                }
            });
            window.__physDbgLag = { postSmoothMaxLag, ts: performance.now() };
        } else if (kinematic) {
            let postSmoothMaxLag = 0;
            bodiesData.forEach(d => {
                if (!d.overrideTarget || !d.smoothTarget) return;
                const lag = Math.hypot(
                    d.overrideTarget.x - d.smoothTarget.x,
                    d.overrideTarget.y - d.smoothTarget.y
                );
                if (lag > postSmoothMaxLag) postSmoothMaxLag = lag;
            });
            window.__physDbgLag = { postSmoothMaxLag, ts: performance.now() };
        }
    },

    // Bounding radius of a full molecule (anchor + sibling fan + cluster + outline)
    noteMoleculeExtent(bodiesData, noteIndex, cfg, dotCount) {
        const bodyR = CONFIG.physics.body.radius;
        const pad = CONFIG.outlines.padding;
        if (dotCount == null) {
            dotCount = bodiesData.filter(d => d.noteIndex === noteIndex).length;
        }
        const siblingCount = Math.max(0, dotCount - 1);

        let reach = bodyR + pad;
        if (siblingCount > 0) {
            const maxRing = 1 + Math.floor((siblingCount - 1) / cfg.siblingsPerRing);
            reach = Math.max(
                reach,
                cfg.ringSpacing * maxRing + cfg.groupArcSpacing + bodyR * 2 + pad
            );
        }

        if (dotCount > 1) {
            const clusterCfg = CONFIG.physics.cluster;
            const clusterR = clusterCfg.baseRadius + dotCount * clusterCfg.radiusPerDot;
            reach = Math.max(reach, clusterR + bodyR + pad);
        }

        return Math.max(
            cfg.moleculeFootprint,
            reach,
            cfg.moleculeFootprint + siblingCount * cfg.footprintPerSibling
        );
    },

    // Extra radius for slots facing away from the canvas center (peek past screen edge)
    outwardPeekExtension(block, angle, cfg) {
        const app = document.getElementById('app');
        if (!app) return 0;

        const rect = app.getBoundingClientRect();
        const cx = rect.left + window.pageXOffset + rect.width / 2;
        const cy = rect.top + window.pageYOffset + rect.height / 2;
        const outward = Math.cos(angle - Math.atan2(cy - block.bodyY, cx - block.bodyX));
        if (outward < cfg.edgePeekThreshold) return 0;

        const t = (outward - cfg.edgePeekThreshold) / (1 - cfg.edgePeekThreshold);
        return t * cfg.edgePeekExtension;
    },

    blendAngle(prev, next, blend) {
        let diff = next - prev;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return prev + diff * blend;
    },

    // Enforce minimum arc gap between neighbours on the ring (angular, not radial)
    spreadRingAngles(angles, footprints, innerRadius, cfg) {
        const n = angles.length;
        if (n < 2) return angles.slice();

        const items = angles.map((angle, i) => ({
            angle,
            footprint: footprints[i],
            index: i
        })).sort((a, b) => a.angle - b.angle);

        const maxPasses = 12;
        const pushRatio = 0.5;
        const safeRadius = Math.max(innerRadius, 1);

        for (let pass = 0; pass < maxPasses; pass++) {
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const a = items[i];
                const b = items[j];
                let gap = b.angle - a.angle;
                if (i === n - 1) gap = (b.angle + Math.PI * 2) - a.angle;
                const minGap = (a.footprint + b.footprint + cfg.moleculeGap) / safeRadius;
                if (gap >= minGap) continue;
                const push = (minGap - gap) * pushRatio;
                a.angle -= push;
                b.angle += push;
            }
        }

        const sorted = angles.map((_, i) => {
            const item = items.find(it => it.index === i);
            return item ? item.angle : angles[i];
        });
        return sorted;
    },

    clampAnglesToOwnershipArc(angles, ownershipArc) {
        if (!ownershipArc.partial) return angles;
        const { center, span } = ownershipArc;
        const half = span / 2;
        return angles.map(angle => {
            let rel = angle - center;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            rel = Math.max(-half, Math.min(half, rel));
            return center + rel;
        });
    },

    // Push crowded anchors apart; separation stays mostly tangential to keep the ring tight
    relaxMoleculeCluster(molecules, block, cfg, relaxScale = 1) {
        const tangential = cfg.tangentialPushRatio;
        const radialMix = 1 - tangential;
        const iterations = Math.max(3, Math.floor(cfg.clusterRelaxIterations * relaxScale));

        for (let n = 0; n < iterations; n++) {
            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const a = molecules[i];
                    const b = molecules[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.footprint + b.footprint + cfg.moleculeGap;
                    if (dist >= minD) continue;

                    const push = (minD - dist) * 0.5;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    [a, b].forEach((m, idx) => {
                        const sign = idx === 0 ? -1 : 1;
                        const rx = m.x - block.bodyX;
                        const ry = m.y - block.bodyY;
                        const rLen = Math.hypot(rx, ry) || 1;
                        const rux = rx / rLen;
                        const ruy = ry / rLen;
                        const tux = -ruy;
                        const tuy = rux;
                        const pTan = (nx * tux + ny * tuy) * tangential;
                        const pRad = (nx * rux + ny * ruy) * radialMix * 0.35;
                        m.x += sign * push * (tux * pTan + rux * pRad);
                        m.y += sign * push * (tuy * pTan + ruy * pRad);
                    });
                }
            }

            molecules.forEach(m => {
                let dx = m.x - block.bodyX;
                let dy = m.y - block.bodyY;
                let dist = Math.hypot(dx, dy) || 1;
                const minR = Math.max(m.targetR * cfg.radialClampMin, this.orbitFloor(cfg, block));
                const maxR = m.maxTargetR * cfg.radialClampMax;
                dist = Math.max(minR, Math.min(maxR, dist));
                m.x = block.bodyX + (dx / dist) * dist;
                m.y = block.bodyY + (dy / dist) * dist;
            });
        }

        this.nudgeOutwardPeek(molecules, block, cfg);
    },

    findOwningBlock(molecule) {
        const sample = molecule.dots[0];
        if (!sample) return null;
        return this.blocks.find(b => {
            if (b.state !== 'active') return false;
            return molecule.dots.some(d => this.dotMatchesBlock(b, d));
        }) || null;
    },

    // Pass 4: translate whole captured molecules so their hulls no longer overlap
    relaxCapturedMolecules(bodiesData, cfg) {
        const activeBlockCount = this.getCrowdedBlockCount();
        if (activeBlockCount >= 6) return;
        const groups = new Map();
        bodiesData.forEach(d => {
            if (!d.overrideTarget) return;
            if (!groups.has(d.noteIndex)) groups.set(d.noteIndex, []);
            groups.get(d.noteIndex).push(d);
        });
        if (groups.size < 2) return;

        const molecules = [...groups.entries()]
            .filter(([noteIndex]) => !this.stretchedNotes.has(noteIndex))
            .map(([noteIndex, dots]) => {
            let cx = 0;
            let cy = 0;
            dots.forEach(d => {
                cx += d.overrideTarget.x;
                cy += d.overrideTarget.y;
            });
            cx /= dots.length;
            cy /= dots.length;
            return {
                noteIndex,
                dots,
                cx,
                cy,
                offsets: dots.map(d => ({
                    dx: d.overrideTarget.x - cx,
                    dy: d.overrideTarget.y - cy
                })),
                radius: this.noteMoleculeExtent(bodiesData, noteIndex, cfg)
            };
        });

        const applyPositions = (m) => {
            m.dots.forEach((d, k) => {
                d.overrideTarget.x = m.cx + m.offsets[k].dx;
                d.overrideTarget.y = m.cy + m.offsets[k].dy;
            });
        };

        const bodyR = CONFIG.physics.body.radius;
        const shellR = bodyR + CONFIG.outlines.padding;
        const dotMin = shellR * 2 + cfg.dotSeparationGap;
        const hullGap = CONFIG.physics.hullCollision.gap;
        let iterations;
        let pushScale;
        let tugScale;

        if (activeBlockCount >= 2) {
            iterations = Math.max(8, Math.floor(cfg.moleculeRelaxIterations * 0.45));
            pushScale = 0.35;
            tugScale = 0.22;
            if (activeBlockCount >= 4) {
                pushScale *= 0.62;
                tugScale *= 0.55;
            }
            if (activeBlockCount >= 5) {
                pushScale *= 0.72;
                tugScale *= 0.65;
            }
            if (activeBlockCount >= 7) {
                pushScale *= 0.55;
                tugScale *= 0.5;
            }
        } else if (activeBlockCount === 1) {
            iterations = Math.max(4, Math.floor(cfg.moleculeRelaxIterations * cfg.singleBlockRelaxScale));
            pushScale = 0.22;
            tugScale = 0.15;
        } else {
            iterations = cfg.moleculeRelaxIterations;
            pushScale = 0.55;
            tugScale = 0.5;
        }

        for (let pass = 0; pass < iterations; pass++) {
            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const a = molecules[i];
                    const b = molecules[j];
                    let dx = b.cx - a.cx;
                    let dy = b.cy - a.cy;
                    const dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.radius + b.radius + Math.max(cfg.moleculeGap, hullGap);
                    if (dist >= minD) continue;

                    const push = (minD - dist) * pushScale;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const ownA = this.findOwningBlock(a);
                    const ownB = this.findOwningBlock(b);

                    if (ownA && ownB && ownA !== ownB) {
                        const tug = tugScale;
                        const aTo = Math.hypot(ownA.bodyX - a.cx, ownA.bodyY - a.cy) || 1;
                        const bTo = Math.hypot(ownB.bodyX - b.cx, ownB.bodyY - b.cy) || 1;
                        a.cx += (ownA.bodyX - a.cx) / aTo * push * tug - nx * push * (1 - tug);
                        a.cy += (ownA.bodyY - a.cy) / aTo * push * tug - ny * push * (1 - tug);
                        b.cx += (ownB.bodyX - b.cx) / bTo * push * tug + nx * push * (1 - tug);
                        b.cy += (ownB.bodyY - b.cy) / bTo * push * tug + ny * push * (1 - tug);
                    } else {
                        a.cx -= nx * push;
                        a.cy -= ny * push;
                        b.cx += nx * push;
                        b.cy += ny * push;
                    }
                }
            }

            molecules.forEach(applyPositions);

            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const molA = molecules[i];
                    const molB = molecules[j];
                    for (const dotA of molA.dots) {
                        for (const dotB of molB.dots) {
                            let dx = dotB.overrideTarget.x - dotA.overrideTarget.x;
                            let dy = dotB.overrideTarget.y - dotA.overrideTarget.y;
                            const dist = Math.hypot(dx, dy) || 0.01;
                            if (dist >= dotMin) continue;
                            const dotPush = activeBlockCount === 1 ? 0.22 : 0.35;
                            const push = (dotMin - dist) * dotPush;
                            const nx = dx / dist;
                            const ny = dy / dist;
                            dotA.overrideTarget.x -= nx * push;
                            dotA.overrideTarget.y -= ny * push;
                            dotB.overrideTarget.x += nx * push;
                            dotB.overrideTarget.y += ny * push;
                        }
                    }
                }
            }

            molecules.forEach(m => {
                let cx = 0;
                let cy = 0;
                m.dots.forEach(d => {
                    cx += d.overrideTarget.x;
                    cy += d.overrideTarget.y;
                });
                m.cx = cx / m.dots.length;
                m.cy = cy / m.dots.length;
                m.offsets = m.dots.map(d => ({
                    dx: d.overrideTarget.x - m.cx,
                    dy: d.overrideTarget.y - m.cy
                }));
            });
        }

        molecules.forEach(applyPositions);
    },

    // Pull outer slots until they sit slightly past the canvas edge (single/dual block only)
    nudgeOutwardPeek(molecules, block, cfg) {
        const app = document.getElementById('app');
        if (!app) return;

        const rect = app.getBoundingClientRect();
        const left = rect.left + window.pageXOffset;
        const right = left + rect.width;
        const top = rect.top + window.pageYOffset;
        const bottom = top + rect.height;
        const pad = CONFIG.navigation.contentPadding;

        molecules.forEach(m => {
            if (m.peekExtend <= 0) return;
            const dx = m.x - block.bodyX;
            const dy = m.y - block.bodyY;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;

            if (ux < -0.25) {
                const goalX = left - cfg.edgePeekPast;
                if (m.x > goalX) {
                    const need = (m.x - goalX) / Math.max(Math.abs(ux), 0.2);
                    const nextR = Math.min(m.maxTargetR, dist + need);
                    m.x = block.bodyX + ux * nextR;
                    m.y = block.bodyY + uy * nextR;
                }
            } else if (ux > 0.25) {
                const goalX = right + cfg.edgePeekPast;
                if (m.x < goalX) {
                    const need = (goalX - m.x) / Math.max(Math.abs(ux), 0.2);
                    const nextR = Math.min(m.maxTargetR, dist + need);
                    m.x = block.bodyX + ux * nextR;
                    m.y = block.bodyY + uy * nextR;
                }
            }

            m.x = Math.max(left + pad, Math.min(right - pad, m.x));
            m.y = Math.max(top + pad, Math.min(bottom - pad, m.y));
        });
    },

    // Minimum orbit radius from block center (pill hull + dot + clearance)
    orbitFloor(cfg, block) {
        const dotR = CONFIG.physics.body.radius;
        const blockR = block
            ? this.getBlockCollisionRadius(block)
            : scale(CONFIG.warehouse.blockHeight) / 2;
        const clearance = cfg.orbitCaptureClearance ?? cfg.blockClearance;
        return blockR + dotR + clearance;
    },

    // When blocks sit close, each block's molecules occupy the far hemisphere only
    resolveOwnershipArc(block, activeBlocks, cfg) {
        const others = activeBlocks.filter(b => b !== block);
        if (others.length === 0) return { partial: false };

        let nearest = null;
        let nearestDist = Infinity;
        others.forEach(other => {
            const d = Math.hypot(other.bodyX - block.bodyX, other.bodyY - block.bodyY);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = other;
            }
        });

        if (!nearest || nearestDist > cfg.foreignBlockRepulsion) {
            return { partial: false };
        }

        const toOther = Math.atan2(
            nearest.bodyY - block.bodyY,
            nearest.bodyX - block.bodyX
        );
        const center = toOther + Math.PI;
        const closeness = 1 - nearestDist / cfg.foreignBlockRepulsion;
        const minArc = Math.PI * cfg.blockOwnershipArcMin;
        const span = Math.PI * 2 - closeness * (Math.PI * 2 - minArc);

        return { partial: true, center, span, closeness };
    },

    // Push orbit targets away from foreign block hulls (and own block if too tight)
    enforceBlockClearance(bodiesData, cfg) {
        const activeBlocks = this.getActiveCaptureBlocks();
        if (activeBlocks.length === 0) return;

        const blockBodyR = scale(CONFIG.warehouse.blockHeight) / 2;
        const blockCount = activeBlocks.length;
        let foreignPushScale = 1;
        let maxPush = scale(14);
        if (blockCount >= 7) {
            foreignPushScale = 0.32;
            maxPush = scale(4);
        } else if (blockCount >= 5) {
            foreignPushScale = 0.42;
            maxPush = scale(6);
        } else if (blockCount >= 4) {
            foreignPushScale = 0.5;
            maxPush = scale(8);
        } else if (blockCount >= 3) {
            foreignPushScale = 0.68;
        }

        bodiesData.forEach(dot => {
            if (!dot.overrideTarget) return;
            if (this.stretchedNotes.has(dot.noteIndex)) return;

            let bestPush = 0;
            let bestNx = 0;
            let bestNy = 0;
            const skipForeign = blockCount >= 5;

            activeBlocks.forEach(block => {
                const dx = dot.overrideTarget.x - block.bodyX;
                const dy = dot.overrideTarget.y - block.bodyY;
                const dist = Math.hypot(dx, dy) || 0.01;
                const isOwnTag = ActionWarehouse.dotMatchesBlock(block, dot);
                if (skipForeign && !isOwnTag) return;

                const required = isOwnTag
                    ? this.orbitFloor(cfg, block)
                    : blockBodyR +
                      this.noteMoleculeExtent(bodiesData, dot.noteIndex, cfg) +
                      cfg.blockClearance;

                if (dist < required) {
                    let push = Math.min(required - dist, maxPush);
                    if (!isOwnTag) push *= foreignPushScale;
                    if (push > bestPush) {
                        bestPush = push;
                        bestNx = dx / dist;
                        bestNy = dy / dist;
                    }
                }
            });

            if (bestPush > 0) {
                dot.overrideTarget.x += bestNx * bestPush;
                dot.overrideTarget.y += bestNy * bestPush;
            }
        });
    },

    // --- Stretch binding (phase 1): stable block-pair + anchor dots across frames ---

    isStretchEndpointBlock(noteIndex, block) {
        const binding = this.stretchBindingByNote.get(noteIndex);
        if (!binding) return false;
        if (binding.mode === 'multi') {
            return binding.anchors.some(a => a.block === block);
        }
        return block === binding.blockA || block === binding.blockB;
    },

    getStretchGroupKey(binding) {
        if (!binding) return '';
        if (binding.mode === 'multi') {
            return binding.anchors
                .map(a => this.getBlockRingKey(a.block))
                .sort()
                .join('::');
        }
        return [this.getBlockRingKey(binding.blockA), this.getBlockRingKey(binding.blockB)]
            .sort()
            .join('::');
    },

    pruneStretchBindings(activeBlocks) {
        const activeSet = new Set(activeBlocks);
        this.stretchBindingByNote.forEach((binding, noteIndex) => {
            let blocksOk;
            let dotsOk;
            let tagsOk;
            if (binding.mode === 'multi') {
                blocksOk = binding.anchors.every(a => activeSet.has(a.block));
                dotsOk = binding.anchors.every(a => a.dot?.body);
                tagsOk = binding.anchors.every(a =>
                    this.dotMatchesBlock(a.block, a.dot));
            } else {
                blocksOk = activeSet.has(binding.blockA) && activeSet.has(binding.blockB);
                dotsOk = binding.dotA?.body && binding.dotB?.body;
                tagsOk = this.dotMatchesBlock(binding.blockA, binding.dotA) &&
                    this.dotMatchesBlock(binding.blockB, binding.dotB);
            }
            if (!this.stretchedNotes.has(noteIndex) || !blocksOk || !dotsOk || !tagsOk) {
                this.stretchBindingByNote.delete(noteIndex);
            }
        });
    },

    // First dot in bodiesData order matching the block tag — never body.position
    pickStableAnchorDot(block, bodiesData, noteIndex) {
        if (block.type === 'author' || block.type === 'typology') {
            return bodiesData.find(d => d.noteIndex === noteIndex) || null;
        }
        return bodiesData.find(d => d.noteIndex === noteIndex && d.tag === block.tag) || null;
    },

    // Pair from blocks that actually capture this note; stable tie-break by tag name
    resolveStretchBlockPair(blocks) {
        if (blocks.length < 2) return null;

        const tagSort = (a, b) => this.getBlockRingKey(a).localeCompare(this.getBlockRingKey(b));
        const orient = (bA, bB) => (tagSort(bA, bB) <= 0 ? { bA, bB } : { bA: bB, bB: bA });

        if (blocks.length === 2) return orient(blocks[0], blocks[1]);

        let best = null;
        let bestDist = -1;
        for (let i = 0; i < blocks.length; i++) {
            for (let j = i + 1; j < blocks.length; j++) {
                const dist = Math.hypot(
                    blocks[j].bodyX - blocks[i].bodyX,
                    blocks[j].bodyY - blocks[i].bodyY
                );
                const pair = orient(blocks[i], blocks[j]);
                const key = [this.getBlockRingKey(pair.bA), this.getBlockRingKey(pair.bB)].join('::');
                const bestKey = best ? [this.getBlockRingKey(best.bA), this.getBlockRingKey(best.bB)].join('::') : '';
                if (dist > bestDist + 0.01 || (Math.abs(dist - bestDist) < 0.01 && key < bestKey)) {
                    bestDist = dist;
                    best = pair;
                }
            }
        }
        return best;
    },

    ensureStretchBinding(noteIndex, anchors, bodiesData, activeBlocks) {
        const activeSet = new Set(activeBlocks);
        let binding = this.stretchBindingByNote.get(noteIndex);

        const sortedAnchors = anchors
            .filter(a => activeSet.has(a.block) && a.dot?.body)
            .slice()
            .sort((a, b) =>
                this.getBlockRingKey(a.block).localeCompare(this.getBlockRingKey(b.block)));

        if (sortedAnchors.length >= 3) {
            const multiValid = binding &&
                binding.mode === 'multi' &&
                binding.anchors.length === sortedAnchors.length &&
                binding.anchors.every((entry, i) =>
                    entry.block === sortedAnchors[i].block &&
                    entry.dot === sortedAnchors[i].dot);

            if (multiValid) return binding;

            const prevLane = binding?.slotLane ?? 0;
            binding = {
                mode: 'multi',
                anchors: sortedAnchors,
                slotLane: prevLane,
                isNew: true
            };
            this.stretchBindingByNote.set(noteIndex, binding);
            return binding;
        }

        const blocks = [];
        sortedAnchors.forEach(({ block }) => {
            if (!blocks.includes(block)) blocks.push(block);
        });

        const bindingValid = binding &&
            binding.mode !== 'multi' &&
            activeSet.has(binding.blockA) &&
            activeSet.has(binding.blockB) &&
            binding.dotA?.body &&
            binding.dotB?.body &&
            this.dotMatchesBlock(binding.blockA, binding.dotA) &&
            this.dotMatchesBlock(binding.blockB, binding.dotB);

        if (bindingValid) return binding;

        const pair = this.resolveStretchBlockPair(blocks);
        if (!pair) return null;

        const dotA = this.pickStableAnchorDot(pair.bA, bodiesData, noteIndex);
        const dotB = this.pickStableAnchorDot(pair.bB, bodiesData, noteIndex);
        if (!dotA || !dotB) return null;

        const prevLane = binding?.slotLane ?? 0;
        binding = {
            mode: 'pair',
            blockA: pair.bA,
            blockB: pair.bB,
            dotA,
            dotB,
            slotLane: prevLane,
            isNew: true
        };
        this.stretchBindingByNote.set(noteIndex, binding);
        return binding;
    },

    // Assign base slot lanes when a binding is new or group membership changes
    assignStretchSlotLanes(cfg) {
        const groups = new Map();
        const blockCount = this.getCrowdedBlockCount();
        const laneLerp = blockCount >= 6 ? 0.45 : (blockCount >= 5 ? 0.5 : 1);

        this.stretchedNotes.forEach(noteIndex => {
            const binding = this.stretchBindingByNote.get(noteIndex);
            if (!binding) return;
            const key = this.getStretchGroupKey(binding);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(noteIndex);
        });

        const spacingBase = cfg.stretchLaneSpacing * 0.5;
        const hullGap = CONFIG.physics.hullCollision.gap;
        const bodiesData = PhysicsEngine.bodiesData;

        groups.forEach((noteIndices, key) => {
            const sorted = noteIndices.slice().sort((a, b) => a - b);
            const n = sorted.length;
            const prevCount = this.stretchGroupCounts.get(key) || 0;
            const rebalance = prevCount !== n ||
                sorted.some(id => this.stretchBindingByNote.get(id)?.isNew);
            this.stretchGroupCounts.set(key, n);

            let maxExtent = cfg.moleculeFootprint;
            sorted.forEach(noteIndex => {
                maxExtent = Math.max(
                    maxExtent,
                    this.noteMoleculeExtent(bodiesData, noteIndex, cfg)
                );
            });
            const spacing = Math.max(spacingBase, maxExtent * 2 + hullGap);
            let groupLaneLerp = laneLerp;
            if (rebalance && blockCount >= 6) {
                groupLaneLerp = 0.28;
            }

            if (!rebalance && n > 1) {
                sorted.forEach(noteIndex => {
                    const binding = this.stretchBindingByNote.get(noteIndex);
                    if (!binding) return;
                    const idx = sorted.indexOf(noteIndex);
                    const targetLane = (idx - (n - 1) / 2) * spacing;
                    if (Math.abs(binding.slotLane - targetLane) > spacing * 0.25) {
                        if (groupLaneLerp < 1) {
                            binding.slotLane += (targetLane - binding.slotLane) * groupLaneLerp;
                        } else {
                            binding.slotLane = targetLane;
                        }
                        binding.slotLane = this.clampStretchLane(binding.slotLane, cfg);
                    }
                });
                return;
            }

            sorted.forEach((noteIndex, i) => {
                const binding = this.stretchBindingByNote.get(noteIndex);
                if (!binding) return;
                const targetLane = n === 1 ? 0 : (i - (n - 1) / 2) * spacing;
                if (groupLaneLerp < 1 && !binding.isNew) {
                    binding.slotLane += (targetLane - binding.slotLane) * groupLaneLerp;
                } else if (groupLaneLerp < 1) {
                    binding.slotLane += (targetLane - binding.slotLane) * groupLaneLerp;
                } else {
                    binding.slotLane = targetLane;
                }
                binding.slotLane = this.clampStretchLane(binding.slotLane, cfg);
                binding.isNew = false;
            });
        });
    },

    computeStretchChordGeometry(bA, bB, cfg) {
        const dx = bB.bodyX - bA.bodyX;
        const dy = bB.bodyY - bA.bodyY;
        const segLen = Math.hypot(dx, dy) || 1;
        const ux = dx / segLen;
        const uy = dy / segLen;
        const px = -uy;
        const py = ux;

        const dotR = CONFIG.physics.body.radius;
        const pillPad = cfg.stretchPillClearance;
        const minAlongA = this.getBlockCollisionRadius(bA) + dotR + pillPad;
        const minAlongB = this.getBlockCollisionRadius(bB) + dotR + pillPad;
        const inset = cfg.stretchChordInset;

        // Usable chord span (pill clearance only — detached from orbit ring)
        let alongA = segLen * inset;
        let alongB = segLen * (1 - inset);
        alongA = Math.max(minAlongA, alongA);
        alongB = Math.min(segLen - minAlongB, alongB);

        const minMidGap = Math.max(scale(12), segLen * 0.08);
        if (alongB - alongA < minMidGap) {
            const mid = segLen * 0.5;
            alongA = Math.max(minAlongA, mid - minMidGap * 0.5);
            alongB = Math.min(segLen - minAlongB, mid + minMidGap * 0.5);
        }

        const midAlong = segLen * 0.5;
        const stretchHalf = Math.min(
            cfg.stretchCenterSpan,
            Math.max(scale(5), (alongB - alongA) * 0.14)
        );
        let centerAlong = midAlong;
        centerAlong = Math.max(alongA + stretchHalf, Math.min(alongB - stretchHalf, centerAlong));

        return {
            bA, bB, ux, uy, px, py, segLen,
            midX: bA.bodyX + ux * midAlong,
            midY: bA.bodyY + uy * midAlong,
            alongA, alongB, centerAlong, stretchHalf
        };
    },

    // 3+ blocks: anchors on rays toward centroid; siblings at equilibrium center
    layoutMultiBlockStretch(noteIndex, binding, bodiesData, cfg) {
        const { anchors, slotLane } = binding;
        const blocks = anchors.map(a => a.block);
        let cx = 0;
        let cy = 0;
        blocks.forEach(b => { cx += b.bodyX; cy += b.bodyY; });
        cx /= blocks.length;
        cy /= blocks.length;

        const b0 = blocks[0];
        const dx0 = cx - b0.bodyX;
        const dy0 = cy - b0.bodyY;
        const len0 = Math.hypot(dx0, dy0) || 1;
        const ux = dx0 / len0;
        const uy = dy0 / len0;
        const px = -uy;
        const py = ux;
        const reach = cfg.stretchAnchorReach ?? 0.3;

        this.stretchAxisByNote.set(noteIndex, {
            mode: 'multi',
            cx, cy, ux, uy, px, py, blocks
        });

        binding.localOffsets = [];

        anchors.forEach(({ block, dot }) => {
            let dx = cx - block.bodyX;
            let dy = cy - block.bodyY;
            const dist = Math.hypot(dx, dy) || 1;
            dx /= dist;
            dy /= dist;
            const floor = this.orbitFloor(cfg, block);
            const placeDist = Math.max(
                floor,
                Math.min(dist - scale(6), floor + (dist - floor) * (1 - reach * 0.65))
            );
            const tx = block.bodyX + dx * placeDist + px * slotLane;
            const ty = block.bodyY + dy * placeDist + py * slotLane;
            dot.overrideTarget = { x: tx, y: ty };
            binding.localOffsets.push({ dot, isAnchor: true });
        });

        const placed = new Set(anchors.map(a => a.dot));
        const siblings = bodiesData.filter(d => d.noteIndex === noteIndex && !placed.has(d));
        siblings.forEach((s, k) => {
            const ring = Math.floor(k / cfg.siblingsPerRing);
            const idxInRing = k % cfg.siblingsPerRing;
            const side = idxInRing === 0 ? 0 :
                Math.ceil(idxInRing / 2) * (idxInRing % 2 === 1 ? 1 : -1);
            const perp = cfg.groupArcSpacing * (1 + ring * 0.35);
            const sx = cx + px * (slotLane + side * perp);
            const sy = cy + py * (slotLane + side * perp);
            s.overrideTarget = { x: sx, y: sy };
            binding.localOffsets.push({ dot: s, isAnchor: false, perp: side * perp });
        });
    },

    // Cluster centered on chord midpoint; slotLane fans duplicates side-by-side (perpendicular)
    layoutStretchedFromBinding(noteIndex, binding, bodiesData, cfg) {
        if (binding.mode === 'multi') {
            this.layoutMultiBlockStretch(noteIndex, binding, bodiesData, cfg);
            return;
        }
        if (!binding.mode) binding.mode = 'pair';

        const { blockA: bA, blockB: bB, dotA, dotB, slotLane } = binding;
        const chord = this.computeStretchChordGeometry(bA, bB, cfg);
        const { ux, uy, px, py, alongA, alongB, centerAlong, stretchHalf } = chord;

        this.stretchAxisByNote.set(noteIndex, { mode: 'pair', ...chord, slotLane });

        const reach = cfg.stretchAnchorReach ?? 0.3;
        const anchorAAlong = (centerAlong - stretchHalf) + (alongA - (centerAlong - stretchHalf)) * reach;
        const anchorBAlong = (centerAlong + stretchHalf) + (alongB - (centerAlong + stretchHalf)) * reach;

        const placeOnChord = (dot, along, perp) => {
            dot.overrideTarget = {
                x: bA.bodyX + ux * along + px * (perp + slotLane),
                y: bA.bodyY + uy * along + py * (perp + slotLane)
            };
        };

        placeOnChord(dotA, anchorAAlong, 0);
        placeOnChord(dotB, anchorBAlong, 0);

        binding.localOffsets = [
            { dot: dotA, isAnchor: true, along: anchorAAlong, perp: 0 },
            { dot: dotB, isAnchor: true, along: anchorBAlong, perp: 0 }
        ];

        const placed = new Set([dotA, dotB]);
        const siblings = bodiesData.filter(d => d.noteIndex === noteIndex && !placed.has(d));
        siblings.forEach((s, k) => {
            const ring = Math.floor(k / cfg.siblingsPerRing);
            const idxInRing = k % cfg.siblingsPerRing;
            const side = idxInRing === 0 ? 0 :
                Math.ceil(idxInRing / 2) * (idxInRing % 2 === 1 ? 1 : -1);
            const perp = cfg.groupArcSpacing * (1 + ring * 0.35);
            placeOnChord(s, centerAlong, side * perp);
            binding.localOffsets.push({
                dot: s, isAnchor: false, along: centerAlong, perp: side * perp
            });
        });
    },

    applyBindingOffsets(noteIndex, binding) {
        const axis = this.stretchAxisByNote.get(noteIndex);
        if (!axis || !binding.localOffsets) return;

        if (binding.mode === 'multi') {
            const cfg = CONFIG.warehouse.orbit;
            const reach = cfg.stretchAnchorReach ?? 0.3;
            const { slotLane } = binding;
            const blocks = binding.anchors.map(a => a.block);
            let cx = 0;
            let cy = 0;
            blocks.forEach(b => { cx += b.bodyX; cy += b.bodyY; });
            cx /= blocks.length;
            cy /= blocks.length;

            const b0 = blocks[0];
            const dx0 = cx - b0.bodyX;
            const dy0 = cy - b0.bodyY;
            const len0 = Math.hypot(dx0, dy0) || 1;
            const px = -dy0 / len0;
            const py = dx0 / len0;

            axis.cx = cx;
            axis.cy = cy;
            axis.px = px;
            axis.py = py;

            binding.anchors.forEach(({ block, dot }) => {
                let dx = cx - block.bodyX;
                let dy = cy - block.bodyY;
                const dist = Math.hypot(dx, dy) || 1;
                dx /= dist;
                dy /= dist;
                const floor = this.orbitFloor(cfg, block);
                const placeDist = Math.max(
                    floor,
                    Math.min(dist - scale(6), floor + (dist - floor) * (1 - reach * 0.65))
                );
                dot.overrideTarget = {
                    x: block.bodyX + dx * placeDist + px * slotLane,
                    y: block.bodyY + dy * placeDist + py * slotLane
                };
            });

            binding.localOffsets.forEach(({ dot, isAnchor, perp }) => {
                if (isAnchor) return;
                dot.overrideTarget = {
                    x: cx + px * (slotLane + (perp || 0)),
                    y: cy + py * (slotLane + (perp || 0))
                };
            });
            return;
        }

        if (!binding.mode) binding.mode = 'pair';

        const { blockA: bA, localOffsets, slotLane } = binding;
        const { ux, uy, px, py } = axis;

        localOffsets.forEach(({ dot, along, perp }) => {
            dot.overrideTarget = {
                x: bA.bodyX + ux * along + px * (perp + slotLane),
                y: bA.bodyY + uy * along + py * (perp + slotLane)
            };
        });
    },

    // Phase 2: only separate stretched molecules perpendicular to the chord
    relaxStretchedMolecules(bodiesData, cfg, iterFactor = 1) {
        const molecules = [];

        this.stretchedNotes.forEach(noteIndex => {
            const binding = this.stretchBindingByNote.get(noteIndex);
            const axis = this.stretchAxisByNote.get(noteIndex);
            if (!binding || !axis || !binding.localOffsets) return;

            molecules.push({
                noteIndex,
                binding,
                axis,
                pairKey: this.getStretchGroupKey(binding),
                radius: this.noteMoleculeExtent(bodiesData, noteIndex, cfg),
                cx: axis.mode === 'multi'
                    ? axis.cx + axis.px * binding.slotLane
                    : axis.bA.bodyX + axis.ux * axis.centerAlong + axis.px * binding.slotLane,
                cy: axis.mode === 'multi'
                    ? axis.cy + axis.py * binding.slotLane
                    : axis.bA.bodyY + axis.uy * axis.centerAlong + axis.py * binding.slotLane
            });
        });

        if (molecules.length < 2) return;

        const gap = CONFIG.physics.hullCollision.gap;
        let iterations = Math.max(6, Math.floor(cfg.moleculeRelaxIterations * 0.4 * iterFactor));
        if (typeof isPresentationMode === 'function' && isPresentationMode()) {
            const minIter = CONFIG.presentation?.stretchRelaxMinIterations ?? 10;
            iterations = Math.max(minIter, iterations);
        }

        for (let pass = 0; pass < iterations; pass++) {
            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const a = molecules[i];
                    const b = molecules[j];
                    if (a.pairKey !== b.pairKey) continue;
                    const dx = b.cx - a.cx;
                    const dy = b.cy - a.cy;
                    const dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.radius + b.radius + gap;
                    if (dist >= minD) continue;

                    const push = (minD - dist) * 0.55;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const perpDot = nx * a.axis.px + ny * a.axis.py;
                    const perpPush = Math.abs(perpDot) < 0.05
                        ? push
                        : push * Math.sign(perpDot);

                    a.binding.slotLane -= perpPush * 0.5;
                    b.binding.slotLane += perpPush * 0.5;

                    if (a.axis.mode === 'multi') {
                        a.cx = a.axis.cx + a.axis.px * a.binding.slotLane;
                        a.cy = a.axis.cy + a.axis.py * a.binding.slotLane;
                        b.cx = b.axis.cx + b.axis.px * b.binding.slotLane;
                        b.cy = b.axis.cy + b.axis.py * b.binding.slotLane;
                    } else {
                        a.cx = a.axis.bA.bodyX + a.axis.ux * a.axis.centerAlong + a.axis.px * a.binding.slotLane;
                        a.cy = a.axis.bA.bodyY + a.axis.uy * a.axis.centerAlong + a.axis.py * a.binding.slotLane;
                        b.cx = b.axis.bA.bodyX + b.axis.ux * b.axis.centerAlong + b.axis.px * b.binding.slotLane;
                        b.cy = b.axis.bA.bodyY + b.axis.uy * b.axis.centerAlong + b.axis.py * b.binding.slotLane;
                    }
                }
            }
        }

        molecules.forEach(m => {
            this.applyBindingOffsets(m.noteIndex, m.binding);
        });
    },
    // Pass 1 — stretched notes: chord anchors near each block, siblings at midpoint.
    // Pass 2 — single-anchor notes: ring slots around each block, steered from stretch axes.
    // Pass 3 — single-anchor siblings: compact fan behind their matching dot.
    updateOrbits(bodiesData, time) {
        this.ensurePhysicsMaps();

        const prevTargets = new Map();
        const prevStretched = new Set(this.stretchedNotes);
        const prevStretchAxis = new Map(this.stretchAxisByNote);
        bodiesData.forEach(d => {
            if (d.overrideTarget) prevTargets.set(d, { x: d.overrideTarget.x, y: d.overrideTarget.y });
        });

        try {
            bodiesData.forEach(d => { d.overrideTarget = null; });
            this.stretchedNotes.clear();
            this.stretchAxisByNote.clear();

            const cfg = CONFIG.warehouse.orbit;
            const activeBlocks = this.getActiveCaptureBlocks();
            if (activeBlocks.length === 0) {
                this.stretchBindingByNote.clear();
                this.stretchGroupCounts.clear();
                this.orbitAngleByNote.clear();
                this.orbitRingCountByBlock.clear();
                return;
            }

            this._runOrbitPasses(bodiesData, time, activeBlocks, cfg);
            const blockCount = this.getCrowdedBlockCount();
            const stretchedCount = this.stretchedNotes.size;
            const nowKinematic = this.isKinematicCaptureMode(blockCount);
            const blockCountRising = this._prevOrbitBlockCount !== blockCount &&
                blockCount > this._prevOrbitBlockCount;
            if (nowKinematic && !this._prevKinematicActive) {
                const entryTotal = CONFIG.physics.crowdedBlock.kinematicEntryTicks ?? 120;
                this._kinematicEntryTicks = entryTotal;
                bodiesData.forEach(d => {
                    if (!d.overrideTarget || !d.body || d.onBankGrid) return;
                    d.smoothTarget = { x: d.body.position.x, y: d.body.position.y };
                });
            } else if (nowKinematic && blockCountRising) {
                const entryTotal = CONFIG.physics.crowdedBlock.kinematicEntryTicks ?? 120;
                this._kinematicEntryTicks = Math.max(this._kinematicEntryTicks, entryTotal);
                bodiesData.forEach(d => {
                    if (!d.overrideTarget || !d.body || d.onBankGrid) return;
                    if (!d.smoothTarget) {
                        d.smoothTarget = { x: d.body.position.x, y: d.body.position.y };
                    }
                });
            }
            this._prevKinematicActive = nowKinematic;
            if (this._kinematicEntryTicks > 0) this._kinematicEntryTicks--;
            if (this._prevOrbitBlockCount !== blockCount) {
                this._orbitTransitionTicks = blockCount >= 7 ? 200
                    : (blockCount >= 6 ? 120 : 90);
            }
            if (stretchedCount > this._prevStretchedCount) {
                const stretchTicks = blockCount >= 7 ? 150 : 90;
                this._orbitTransitionTicks = Math.max(this._orbitTransitionTicks, stretchTicks);
            }
            bodiesData.forEach(d => {
                if (!d.overrideTarget || prevTargets.has(d)) return;
                if (d.body && !d.onBankGrid) {
                    let spawnBlend = this.isKinematicCaptureMode(blockCount) ? 0.2 : 0.38;
                    if (typeof isPresentationMode === 'function' && isPresentationMode()) {
                        spawnBlend = CONFIG.presentation?.captureSpawnBlend ?? spawnBlend * 0.45;
                    }
                    d.overrideTarget.x = d.body.position.x +
                        (d.overrideTarget.x - d.body.position.x) * spawnBlend;
                    d.overrideTarget.y = d.body.position.y +
                        (d.overrideTarget.y - d.body.position.y) * spawnBlend;
                }
            });
            this.stabilizeOrbitTargets(bodiesData, prevTargets, blockCount);
            if (this._prevOrbitBlockCount !== blockCount) {
                const kBlend = CONFIG.physics.crowdedBlock.kinematicTransitionBlend ?? 0.18;
                const transitionBlend = this.isKinematicCaptureMode(blockCount)
                    ? kBlend
                    : (blockCount >= 7 ? 0.26 : (blockCount >= 6 ? 0.35 : 0.36));
                bodiesData.forEach(d => {
                    const prev = prevTargets.get(d);
                    if (!d.overrideTarget || !prev) {
                        d.smoothTarget = null;
                        return;
                    }
                    let fromX = prev.x;
                    let fromY = prev.y;
                    if (d.body && !d.onBankGrid) {
                        const anchorBlock = this.getOrbitAnchorBlock(d);
                        if (anchorBlock) {
                            const atBody = this.clampTargetToBlockRing(
                                d.body.position.x, d.body.position.y, anchorBlock
                            );
                            fromX = atBody.x;
                            fromY = atBody.y;
                        }
                    }
                    d.overrideTarget.x = fromX + (d.overrideTarget.x - fromX) * transitionBlend;
                    d.overrideTarget.y = fromY + (d.overrideTarget.y - fromY) * transitionBlend;
                    if (!(this.isKinematicCaptureMode(blockCount) && this._kinematicEntryTicks > 0)) {
                        d.smoothTarget = { x: d.overrideTarget.x, y: d.overrideTarget.y };
                    }
                });
                this._prevOrbitBlockCount = blockCount;
            }
            this.smoothOrbitTargets(bodiesData, blockCount);
            if (blockCount >= 5) {
                this.enforceCapturedRingClamp(bodiesData, blockCount);
            }
            this._prevStretchedCount = stretchedCount;
        } catch (err) {
            console.error('[ActionWarehouse] updateOrbits failed:', err);
            prevTargets.forEach((t, d) => { d.overrideTarget = t; });
            this.stretchedNotes = prevStretched;
            this.stretchAxisByNote = prevStretchAxis;
        }
    },

    _runOrbitPasses(bodiesData, time, activeBlocks, cfg) {
        const noteAnchors = new Map();
        activeBlocks.forEach(block => {
            bodiesData.forEach(d => {
                if (this.isNotePhysicsSuspended(d.noteIndex)) return;
                if (!this.dotMatchesBlock(block, d)) return;
                if (block.type === 'author' || block.type === 'typology') {
                    const firstOfNote = bodiesData.find(bd => bd.noteIndex === d.noteIndex);
                    if (d !== firstOfNote) return;
                }
                if (!noteAnchors.has(d.noteIndex)) noteAnchors.set(d.noteIndex, []);
                const list = noteAnchors.get(d.noteIndex);
                if (!list.some(a => a.block === block)) {
                    list.push({ block, dot: d });
                }
            });
        });

        noteAnchors.forEach((anchors, noteIndex) => {
            if (anchors.length > 1) this.stretchedNotes.add(noteIndex);
        });

        this.pruneStretchBindings(activeBlocks);

        const hasStretch = this.stretchedNotes.size > 0;
        const spin = (hasStretch || activeBlocks.length >= 2) ? 0 : time * cfg.rotationSpeed;

        // Pass 1: stable stretch bindings → layout once after lane assignment
        this.stretchedNotes.forEach(noteIndex => {
            if (this.isNotePhysicsSuspended(noteIndex)) return;
            const anchors = noteAnchors.get(noteIndex);
            if (!anchors || anchors.length < 2) return;
            this.ensureStretchBinding(noteIndex, anchors, bodiesData, activeBlocks);
        });
        this.assignStretchSlotLanes(cfg);
        if (activeBlocks.length < 6) {
            this.relaxStretchedMolecules(bodiesData, cfg);
        } else if (activeBlocks.length >= 6) {
            this.relaxStretchedMolecules(bodiesData, cfg, 0.35);
        }
        this.stretchedNotes.forEach(noteIndex => {
            if (this.isNotePhysicsSuspended(noteIndex)) return;
            const binding = this.stretchBindingByNote.get(noteIndex);
            if (binding) {
                this.layoutStretchedFromBinding(noteIndex, binding, bodiesData, cfg);
            }
        });

        // Pass 2: ring layout for single-anchor notes only
        activeBlocks.forEach(block => {
            if (!Number.isFinite(block.bodyX) || !Number.isFinite(block.bodyY)) return;

            const ringDots = block.type === 'author'
                ? this.getAuthorRingDots(block, bodiesData)
                : block.type === 'typology'
                    ? this.getTypologyRingDots(block, bodiesData)
                    : bodiesData.filter(d =>
                        d.tag === block.tag &&
                        !this.stretchedNotes.has(d.noteIndex) &&
                        !this.isNotePhysicsSuspended(d.noteIndex)
                    );
            const ringCount = ringDots.length;
            if (ringCount === 0) return;

            const footprints = ringDots.map(d =>
                this.noteMoleculeExtent(bodiesData, d.noteIndex, cfg)
            );
            const totalArc = footprints.reduce((sum, f) => sum + f * 2 + cfg.moleculeGap, 0);
            const floor = this.orbitFloor(cfg, block);
            const innerRadius = Math.max(
                floor,
                cfg.minRadius,
                (ringCount * cfg.slotWidth) / (Math.PI * 2),
                (totalArc / (Math.PI * 2)) * cfg.arcFillScale
            );
            const reach = cfg.orbitAnchorReach ?? 0.28;
            const captureRadius = floor + (innerRadius - floor) * (1 - reach);

            const stretchAxes = [];
            this.stretchedNotes.forEach(noteIndex => {
                const anchors = noteAnchors.get(noteIndex);
                if (!anchors || anchors.length < 2) return;
                if (!anchors.some(a => a.block === block)) return;
                anchors.forEach(a => {
                    if (a.block === block) return;
                    stretchAxes.push(Math.atan2(
                        a.block.bodyY - block.bodyY,
                        a.block.bodyX - block.bodyX
                    ));
                });
            });

            const ownershipArc = this.resolveOwnershipArc(block, activeBlocks, cfg);
            let angles;
            if (ownershipArc.partial) {
                angles = ringDots.map((_, i) => {
                    const t = ringCount === 1 ? 0.5 : i / Math.max(ringCount - 1, 1);
                    return ownershipArc.center - ownershipArc.span / 2 + t * ownershipArc.span + spin;
                });
            } else {
                angles = ringDots.map((_, i) => (i / ringCount) * Math.PI * 2 + spin);
            }

            if (stretchAxes.length > 0) {
                angles = angles.map(angle => {
                    let pushed = angle;
                    stretchAxes.forEach(axis => {
                        let diff = pushed - axis;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < cfg.stretchClearance) {
                            pushed += Math.sign(diff || 1) * (cfg.stretchClearance - Math.abs(diff));
                        }
                    });
                    return pushed;
                });
            }

            angles = this.spreadRingAngles(angles, footprints, captureRadius, cfg);
            angles = this.clampAnglesToOwnershipArc(angles, ownershipArc);

            const ringKey = this.getBlockRingKey(block);
            const prevCount = this.orbitRingCountByBlock.get(ringKey);
            if (prevCount !== ringCount) {
                ringDots.forEach(d => this.orbitAngleByNote.delete(d.noteIndex));
                this.orbitRingCountByBlock.set(ringKey, ringCount);
            }
            {
                const blend = activeBlocks.length === 1
                    ? (cfg.orbitAngleBlend ?? 0.16)
                    : (CONFIG.physics.crowdedBlock.orbitAngleBlend ?? cfg.orbitAngleBlend ?? 0.16);
                angles = angles.map((angle, i) => {
                    const noteIndex = ringDots[i].noteIndex;
                    const prev = this.orbitAngleByNote.get(noteIndex);
                    const next = prev === undefined ? angle : this.blendAngle(prev, angle, blend);
                    this.orbitAngleByNote.set(noteIndex, next);
                    return next;
                });
            }

            const clusterRelaxScale = (() => {
                let scale = activeBlocks.length === 1
                    ? cfg.singleBlockClusterRelaxScale
                    : cfg.singleBlockClusterRelaxScale * 1.6;
                const heavyTier = this.getHeavyWorkspaceTier(activeBlocks.length);
                if (heavyTier >= 0) {
                    scale *= [0.55, 0.42, 0.32][heavyTier];
                }
                return scale;
            })();

            const cluster = ringDots.map((d, i) => {
                const angle = angles[i];
                const peekExtend = this.outwardPeekExtension(block, angle, cfg);
                const targetR = captureRadius;
                const maxTargetR = captureRadius + peekExtend;
                return {
                    dot: d,
                    noteIndex: d.noteIndex,
                    footprint: footprints[i],
                    targetR: targetR,
                    maxTargetR: maxTargetR,
                    peekExtend: peekExtend,
                    x: block.bodyX + Math.cos(angle) * targetR,
                    y: block.bodyY + Math.sin(angle) * targetR
                };
            });

            this.relaxMoleculeCluster(cluster, block, cfg, clusterRelaxScale);

            cluster.forEach(m => {
                m.dot.overrideTarget = { x: m.x, y: m.y };
                const anchorList = noteAnchors.get(m.noteIndex);
                if (anchorList && anchorList[0]) {
                    anchorList[0].angle = Math.atan2(m.y - block.bodyY, m.x - block.bodyX);
                    anchorList[0].innerRadius = Math.hypot(m.x - block.bodyX, m.y - block.bodyY);
                }
            });
        });

        // Pass 3: siblings of single-anchor notes
        const siblingsByNote = new Map();
        bodiesData.forEach(d => {
            if (d.overrideTarget) return;
            const anchors = noteAnchors.get(d.noteIndex);
            if (!anchors || anchors.length !== 1) return;
            if (!siblingsByNote.has(d.noteIndex)) siblingsByNote.set(d.noteIndex, []);
            siblingsByNote.get(d.noteIndex).push(d);
        });

        siblingsByNote.forEach((siblings, noteIndex) => {
            const anchor = noteAnchors.get(noteIndex)[0];
            const match = anchor.dot;
            if (!match.overrideTarget) return;

            const block = anchor.block;
            const mx = match.overrideTarget.x - block.bodyX;
            const my = match.overrideTarget.y - block.bodyY;
            const anchorAngle = Math.atan2(my, mx);
            const anchorDist = Math.hypot(mx, my) || cfg.minRadius;

            siblings.forEach((s, k) => {
                const ring = 1 + Math.floor(k / cfg.siblingsPerRing);
                const idxInRing = k % cfg.siblingsPerRing;
                const side = idxInRing === 0 ? 0 :
                             Math.ceil(idxInRing / 2) * (idxInRing % 2 === 1 ? 1 : -1);

                const r = anchorDist + ring * cfg.ringSpacing;
                const a = anchorAngle + side * (cfg.groupArcSpacing / r);
                s.overrideTarget = {
                    x: block.bodyX + Math.cos(a) * r,
                    y: block.bodyY + Math.sin(a) * r
                };
            });
        });

        this.relaxCapturedMolecules(bodiesData, cfg);
        if (activeBlocks.length < 6) {
            this.relaxStretchedMolecules(bodiesData, cfg);
        } else if (activeBlocks.length >= 6) {
            this.relaxStretchedMolecules(bodiesData, cfg, 0.35);
        }
        this.enforceBlockClearance(bodiesData, cfg);
    }
});
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

    try {
        if (typeof OpeningBackground !== 'undefined') {
            OpeningBackground.mountSiteBackground();
        }
    } catch (err) {
        console.error('Site background init failed:', err);
    }

    try {
        if (typeof NoteCensor !== 'undefined') NoteCensor.init();
    } catch (err) {
        console.error('NoteCensor.init failed:', err);
    }

    try {
        DepthController.init();
    } catch (err) {
        console.error('DepthController.init failed:', err);
    }

    try {
        MesoSilhouetteCache.init();
    } catch (err) {
        console.error('MesoSilhouetteCache.init failed:', err);
    }

    SilhouetteEngine.init();
    SpatialNavigation.init();
    ArtifactInspector.init();
    ActionWarehouse.init();

    try {
        PhysicsEngine.init();
    } catch (err) {
        console.error('PhysicsEngine.init failed:', err);
    }

    try {
        NavigationMap.init();
    } catch (err) {
        console.error('NavigationMap.init failed:', err);
    }

    try {
        applySiteGridTokens();
    } catch (err) {
        console.error('Site grid refresh failed:', err);
    }

    IdleRefresh.init();

    const safetyMs = CONFIG.boot.safetyRevealMs ?? 5000;
    const safetyTimer = setTimeout(() => {
        console.warn('Boot safety reveal — data pipeline did not finish in time');
        if (typeof AppState.prepareBoot === 'function') AppState.prepareBoot();
        AppState.revealApp();
        try {
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.onBootComplete();
            }
        } catch (err) {
            console.warn('NavigationMap.onBootComplete failed:', err);
        }
    }, safetyMs);

    AppState.init()
        .then(() => AppState.finishBoot())
        .catch((err) => {
            console.error('AppState.init failed:', err);
            AppState.revealApp();
            try {
                if (typeof NavigationMap !== 'undefined') {
                    NavigationMap.onBootComplete();
                }
            } catch (mapErr) {
                console.warn('NavigationMap.onBootComplete failed:', mapErr);
            }
        })
        .finally(() => clearTimeout(safetyTimer));
});
