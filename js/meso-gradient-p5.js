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
