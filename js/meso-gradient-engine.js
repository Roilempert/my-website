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
