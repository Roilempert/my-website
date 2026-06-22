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
        if (level === 2 || level === 3) this.scheduleBuildAll();
    }
};

