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
