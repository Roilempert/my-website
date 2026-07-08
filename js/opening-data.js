/* ==========================================================================
   Opening page — static palette (tag colors + sample molecules for background art)
   ========================================================================== */
const OpeningData = {
    items: [],
    tagColorsMap: new Map(),
    hoverLines: [],

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

        await this._loadHoverLines();

        window.AppState = { items: this.items, tagColorsMap: this.tagColorsMap };
    },

    async _loadHoverLines() {
        const miniCfg = CONFIG.opening?.miniTitle || {};
        if (miniCfg.enabled === false) {
            this.hoverLines = [];
            return;
        }

        const url = miniCfg.notesUrl
            || CONFIG.data?.local?.main
            || 'data/main.csv';
        const maxWords = miniCfg.maxWords ?? CONFIG.depth?.moleculeHoverMaxWords ?? 8;

        try {
            const response = await fetch(url, { cache: 'force-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
            const csv = await response.text();
            if (typeof OpeningHoverLabel !== 'undefined') {
                this.hoverLines = OpeningHoverLabel.extractFromMainCsv(csv, maxWords);
            }
        } catch (err) {
            console.warn('Opening hover lines failed:', err);
            this.hoverLines = [];
        }
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
