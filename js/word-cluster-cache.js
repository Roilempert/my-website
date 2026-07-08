/* ==========================================================================
   WORD CLUSTER CACHE — preloaded morphological match groups (L2 censored study)
   ========================================================================== */
const WordClusterCache = {
    data: null,
    surfaceToCluster: null,
    ready: Promise.resolve(false),
    loaded: false,

    init() {
        const cfg = CONFIG?.theme?.wordClusterCache || {};
        if (cfg.enabled === false || !cfg.url) {
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
                if (this.loaded &&
                    typeof NoteCensor !== 'undefined' &&
                    NoteCensor.isActive?.()) {
                    NoteCensor.invalidateWordLayout();
                }
                return this.loaded;
            })
            .catch((err) => {
                console.warn('Word cluster cache unavailable, using exact match only', err);
                this.clear();
                return false;
            });

        return this.ready;
    },

    clear() {
        this.data = null;
        this.surfaceToCluster = null;
        this.loaded = false;
    },

    ingest(data) {
        this.clear();
        const expectedVersion = CONFIG?.theme?.wordClusterCache?.version;
        const cacheVersion = data?.meta?.cacheVersion;
        if (expectedVersion != null && cacheVersion != null &&
            Number(cacheVersion) !== Number(expectedVersion)) {
            console.warn(`Word cluster cache version mismatch: expected ${expectedVersion}, got ${cacheVersion}`);
            return;
        }

        const map = data?.surfaceToCluster;
        if (!map || typeof map !== 'object') return;

        this.surfaceToCluster = new Map(Object.entries(map));
        this.data = data;
        this.loaded = this.surfaceToCluster.size > 0;
    },

    /** Normalize then resolve cluster id; fallback keeps exact-match behavior. */
    clusterKey(surface) {
        const normalized = typeof normalizeWordSurface === 'function'
            ? normalizeWordSurface(surface)
            : String(surface || '').trim();
        if (!normalized) return '';

        if (this.loaded && this.surfaceToCluster?.has(normalized)) {
            return this.surfaceToCluster.get(normalized);
        }
        return `exact:${normalized}`;
    }
};
