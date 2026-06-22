/* ==========================================================================
   MESO GRADIENT P5 — Mandala morph shader (p5 sketch port)
   generateMandala layout; hub = right-edge center; tag colors per ring.
   Baseline: p5-mandala-v1 (docs/architecture/meso-gradient-p5-baseline.md)
   ========================================================================== */
const MesoGradientP5 = {
    MAX_CIRCLES: 25,
    MAX_SEAMS: 8,

    _canvas: null,
    _gl: null,
    _program: null,
    _buffer: null,
    _ready: false,
    _shaderRev: 5,

    VERT_SRC: `
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `,

    FRAG_SRC: `
        precision mediump float;

        uniform vec2 u_resolution;
        uniform int u_count;
        uniform vec2 u_positions[25];
        uniform vec3 u_colors[25];
        uniform float u_radii[25];
        uniform vec2 u_stretch[25];
        uniform float u_blendFactor;
        uniform float u_falloff;
        uniform int u_sharpCircle;
        uniform float u_sharpFalloff;
        uniform float u_sharpBlendK;
        uniform vec3 u_bgColor;
        uniform float u_maskSoft;
        uniform int u_seamCount;
        uniform vec3 u_seamColors[8];
        uniform vec2 u_seamPosA[8];
        uniform vec2 u_seamPosB[8];
        uniform float u_seamStrength;
        uniform float u_colorEdgeSoft;
        uniform float u_colorEdgeCore;
        uniform float u_colorSharpness;
        uniform float u_boundaryGlow;
        uniform float u_colorSatBoost;

        float smin(float a, float b, float k) {
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
        }

        void main() {
            /* hub = right-edge vertical center (RTL) */
            vec2 pixel = gl_FragCoord.xy - vec2(u_resolution.x, u_resolution.y * 0.5);
            vec2 uv = pixel / min(u_resolution.x, u_resolution.y);

            float d = 100.0;
            vec3 colorAcc = vec3(0.0);
            float weightAcc = 0.0;
            float bestInside = -999.0;
            float secondInside = -999.0;

            for (int i = 0; i < 25; i++) {
                if (i >= u_count) break;

                vec2 delta = uv - u_positions[i];
                vec2 stretch = max(u_stretch[i], vec2(0.65));
                vec2 scaled = delta / stretch;
                float dist = length(scaled) * min(stretch.x, stretch.y);
                float inside = u_radii[i] - dist;
                float k = (i == u_sharpCircle) ? u_sharpBlendK : u_blendFactor;
                float f = (i == u_sharpCircle) ? u_sharpFalloff : u_falloff;
                d = smin(d, dist - u_radii[i], k);

                if (inside > bestInside) {
                    secondInside = bestInside;
                    bestInside = inside;
                } else if (inside > secondInside) {
                    secondInside = inside;
                }

                float w = 1.0 / (pow(dist, f) + 0.0001);
                float insideBoost = smoothstep(-u_colorEdgeSoft, u_colorEdgeCore, inside);
                w *= 1.0 + insideBoost * u_colorSatBoost;
                colorAcc += u_colors[i] * w;
                weightAcc += w;
            }

            for (int s = 0; s < 8; s++) {
                if (s >= u_seamCount) break;

                float da = length(uv - u_seamPosA[s]);
                float db = length(uv - u_seamPosB[s]);
                float gap = abs(da - db);
                float seamW = exp(-gap * 14.0) * exp(-min(da, db) * 2.0);
                seamW *= smoothstep(0.12, 0.015, gap);
                colorAcc += u_seamColors[s] * seamW * u_seamStrength;
                weightAcc += seamW * u_seamStrength;
            }

            vec3 finalColor = weightAcc > 0.001
                ? colorAcc / weightAcc
                : u_bgColor;

            float contactGap = abs(bestInside - secondInside);
            float contact = exp(-contactGap * 60.0) * smoothstep(0.0, 0.05, min(bestInside, secondInside));
            vec3 edgeGlow = min(finalColor * 1.4 + vec3(0.1), vec3(1.0));
            finalColor = mix(finalColor, edgeGlow, contact * u_boundaryGlow);

            float mask = smoothstep(u_maskSoft, -0.15, d);

            gl_FragColor = vec4(mix(u_bgColor, finalColor, mask), 1.0);
        }
    `,

    parseColorVec3(color) {
        if (typeof MesoGradientEngine !== 'undefined') {
            return MesoGradientEngine.parseColorVec3(color);
        }
        return [0.5, 0.5, 0.5];
    },

    buildMandalaFromTags(tagColors, seed, opts) {
        const MAX = this.MAX_CIRCLES;
        const MAX_SEAMS = this.MAX_SEAMS;
        const TWO_PI = Math.PI * 2;
        const rand = opts.rand || ((s, i) => ((s ^ i) % 1000) / 1000);
        const geomScale = (opts.scale ?? 1) * (opts.mandalaFit ?? 1);
        const seamChance = opts.seamChance ?? 0.32;
        const positionsFlat = [];
        const colorsFlat = [];
        const radiiFlat = [];
        const stretchFlat = [];
        const circlePositions = [];
        let activeCircleCount = 0;

        const shapeBreak = opts.shapeBreak ?? 0.35;
        const symmetricLayout = (opts.symmetricLayout ?? 1) > 0;
        const symmetryCount = opts.symmetryCount ?? 8;
        const distJitter = symmetricLayout ? 0 : (opts.ringDistJitter ?? 0.04) * shapeBreak;
        const angleJitter = symmetricLayout ? 0 : (opts.ringAngleJitter ?? 0.02) * shapeBreak;
        const circleSquash = (opts.circleSquash ?? 0.12) * shapeBreak;

        const ringCountFor = (slot) => {
            if (symmetricLayout && symmetryCount > 0) return symmetryCount;
            return Math.floor(4 + rand(seed, slot) * 5);
        };

        const squashPair = (slot) => {
            const sx = 1 + (rand(seed, slot) - 0.5) * 2 * circleSquash;
            const sy = 1 + (rand(seed, slot + 1) - 0.5) * 2 * circleSquash;
            return [sx, sy];
        };

        const palette = tagColors.length ? tagColors : ['#888888'];
        const n = palette.length;

        const circleColors = [];
        const seamColorStrs = [];
        for (let i = 0; i < n; i++) {
            if (i === 0) {
                circleColors.push(palette[i]);
            } else if (rand(seed, 600 + i) < seamChance) {
                seamColorStrs.push(palette[i]);
            } else {
                circleColors.push(palette[i]);
            }
        }
        if (circleColors.length === 0) {
            circleColors.push(palette[0]);
        }

        const cn = circleColors.length;
        const tagFit = opts.tagFit ?? 3.2;
        const layoutScale = cn <= 1 ? 1 : Math.min(1, tagFit / (cn + 0.8));
        const ringStepScale = cn <= 3 ? 1 : 3 / cn;
        const totalScale = geomScale * layoutScale;

        const rgbCircle = (idx) => this.parseColorVec3(circleColors[Math.min(idx, cn - 1)]);

        const tagForLayer = (layer) => {
            if (cn === 1) return 0;
            if (cn === 2) return layer === 0 ? 0 : 1;
            return Math.min(layer, cn - 1);
        };

        const push = (x, y, rgb, r, sx = 1, sy = 1) => {
            if (activeCircleCount >= MAX) return;
            const scx = x * totalScale;
            const scy = y * totalScale;
            positionsFlat.push(scx, scy);
            colorsFlat.push(rgb[0], rgb[1], rgb[2]);
            radiiFlat.push(r * totalScale);
            stretchFlat.push(sx, sy);
            circlePositions.push(scx, scy);
            activeCircleCount++;
        };

        const pushOnRing = (baseDist, angle, rgb, r, slot) => {
            const a = angle + (rand(seed, slot) - 0.5) * angleJitter;
            const d = baseDist * (1 + (rand(seed, slot + 1) - 0.5) * 2 * distJitter);
            const [sx, sy] = squashPair(slot + 2);
            push(Math.cos(a) * d, Math.sin(a) * d, rgb, r, sx, sy);
        };

        const [hubSx, hubSy] = symmetricLayout ? [1, 1] : squashPair(5);
        push(0, 0, rgbCircle(tagForLayer(0)), 0.11 + rand(seed, 0) * 0.09, hubSx, hubSy);

        const innerCount = ringCountFor(1);
        const innerDist = 0.2 + rand(seed, 2) * 0.15;
        const innerRadius = 0.08 + rand(seed, 3) * 0.07;
        const innerOffset = symmetricLayout ? 0 : rand(seed, 4) * TWO_PI;
        const colorInner = rgbCircle(tagForLayer(1));

        for (let i = 0; i < innerCount; i++) {
            const angle = innerOffset + i * (TWO_PI / innerCount);
            pushOnRing(innerDist, angle, colorInner, innerRadius, 30 + i);
        }

        const outerCount = ringCountFor(5);
        let outerDist = innerDist + (0.15 + rand(seed, 6) * 0.15) * ringStepScale;
        const outerRadius = 0.05 + rand(seed, 7) * 0.07;
        const outerOffset = symmetricLayout ? 0 : rand(seed, 8) * TWO_PI;
        const colorOuter = rgbCircle(tagForLayer(2));

        for (let i = 0; i < outerCount; i++) {
            if (activeCircleCount >= MAX) break;
            const angle = outerOffset + i * (TWO_PI / outerCount);
            pushOnRing(outerDist, angle, colorOuter, outerRadius, 50 + i);
        }

        for (let tagIdx = 3; tagIdx < cn && activeCircleCount < MAX; tagIdx++) {
            const ringCount = ringCountFor(10 + tagIdx * 4);
            outerDist += (0.15 + rand(seed, 11 + tagIdx * 4) * 0.15) * ringStepScale;
            const ringRadius = 0.05 + rand(seed, 12 + tagIdx * 4) * 0.07;
            const ringOffset = symmetricLayout ? 0 : rand(seed, 13 + tagIdx * 4) * TWO_PI;
            const ringColor = rgbCircle(tagIdx);

            for (let i = 0; i < ringCount; i++) {
                if (activeCircleCount >= MAX) break;
                const angle = ringOffset + i * (TWO_PI / ringCount);
                pushOnRing(outerDist, angle, ringColor, ringRadius, 70 + tagIdx * 10 + i);
            }
        }

        while (positionsFlat.length / 2 < MAX) {
            positionsFlat.push(0, 0);
            colorsFlat.push(0, 0, 0);
            radiiFlat.push(0);
            stretchFlat.push(1, 1);
        }

        const seamColorsFlat = [];
        const seamPosAFlat = [];
        const seamPosBFlat = [];
        let seamCount = 0;
        const circleN = circlePositions.length / 2;

        const pickCirclePair = (si) => {
            if (circleN < 2) return null;
            let a = Math.floor(rand(seed, 700 + si * 3) * circleN);
            let b = Math.floor(rand(seed, 701 + si * 3) * (circleN - 1));
            if (b >= a) b++;
            return {
                ax: circlePositions[a * 2],
                ay: circlePositions[a * 2 + 1],
                bx: circlePositions[b * 2],
                by: circlePositions[b * 2 + 1]
            };
        };

        for (let si = 0; si < seamColorStrs.length && seamCount < MAX_SEAMS; si++) {
            const pair = pickCirclePair(si);
            if (!pair) break;
            const rgb = this.parseColorVec3(seamColorStrs[si]);
            seamColorsFlat.push(rgb[0], rgb[1], rgb[2]);
            seamPosAFlat.push(pair.ax, pair.ay);
            seamPosBFlat.push(pair.bx, pair.by);
            seamCount++;
        }

        while (seamColorsFlat.length / 3 < MAX_SEAMS) {
            seamColorsFlat.push(0, 0, 0);
            seamPosAFlat.push(0, 0);
            seamPosBFlat.push(0, 0);
        }

        let sharpCircleIndex = -1;
        const sharpChance = opts.sharpChance ?? 0.25;
        if (activeCircleCount > 1 && rand(seed, 99) < sharpChance) {
            sharpCircleIndex = Math.floor(rand(seed, 98) * activeCircleCount);
        }

        return {
            positionsFlat: new Float32Array(positionsFlat),
            colorsFlat: new Float32Array(colorsFlat),
            radiiFlat: new Float32Array(radiiFlat),
            stretchFlat: new Float32Array(stretchFlat),
            count: activeCircleCount,
            sharpCircleIndex,
            seamCount,
            seamColorsFlat: new Float32Array(seamColorsFlat),
            seamPosAFlat: new Float32Array(seamPosAFlat),
            seamPosBFlat: new Float32Array(seamPosBFlat)
        };
    },

    _compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('MesoGradientP5 shader:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    },

    init() {
        if (this._ready && this._compiledRev === this._shaderRev) return true;
        this._ready = false;
        if (typeof document === 'undefined') return false;

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
        const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, this.FRAG_SRC);
        if (!vs || !fs) return false;

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn('MesoGradientP5: program link failed', gl.getProgramInfoLog(program));
            return false;
        }

        if (!this._buffer) {
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1, -1, 1, -1, -1, 1,
                -1, 1, 1, -1, 1, 1
            ]), gl.STATIC_DRAW);
            this._buffer = buffer;
        }

        this._canvas = canvas;
        this._gl = gl;
        this._program = program;
        this._loc = {
            a_position: gl.getAttribLocation(program, 'a_position'),
            u_resolution: gl.getUniformLocation(program, 'u_resolution'),
            u_count: gl.getUniformLocation(program, 'u_count'),
            u_positions: gl.getUniformLocation(program, 'u_positions[0]'),
            u_colors: gl.getUniformLocation(program, 'u_colors[0]'),
            u_radii: gl.getUniformLocation(program, 'u_radii[0]'),
            u_stretch: gl.getUniformLocation(program, 'u_stretch[0]'),
            u_blendFactor: gl.getUniformLocation(program, 'u_blendFactor'),
            u_falloff: gl.getUniformLocation(program, 'u_falloff'),
            u_sharpCircle: gl.getUniformLocation(program, 'u_sharpCircle'),
            u_sharpFalloff: gl.getUniformLocation(program, 'u_sharpFalloff'),
            u_sharpBlendK: gl.getUniformLocation(program, 'u_sharpBlendK'),
            u_bgColor: gl.getUniformLocation(program, 'u_bgColor'),
            u_maskSoft: gl.getUniformLocation(program, 'u_maskSoft'),
            u_seamCount: gl.getUniformLocation(program, 'u_seamCount'),
            u_seamColors: gl.getUniformLocation(program, 'u_seamColors[0]'),
            u_seamPosA: gl.getUniformLocation(program, 'u_seamPosA[0]'),
            u_seamPosB: gl.getUniformLocation(program, 'u_seamPosB[0]'),
            u_seamStrength: gl.getUniformLocation(program, 'u_seamStrength'),
            u_colorEdgeSoft: gl.getUniformLocation(program, 'u_colorEdgeSoft'),
            u_colorEdgeCore: gl.getUniformLocation(program, 'u_colorEdgeCore'),
            u_colorSharpness: gl.getUniformLocation(program, 'u_colorSharpness'),
            u_boundaryGlow: gl.getUniformLocation(program, 'u_boundaryGlow'),
            u_colorSatBoost: gl.getUniformLocation(program, 'u_colorSatBoost')
        };
        this._compiledRev = this._shaderRev;
        this._ready = true;
        return true;
    },

    renderFrame(opts) {
        if (!this.init()) return null;

        const gl = this._gl;
        const canvas = this._canvas;
        const w = Math.max(1, Math.round(opts.width || 64));
        const h = Math.max(1, Math.round(opts.height || 64));

        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);

        const mandala = this.buildMandalaFromTags(opts.tagColors || [], opts.seed ?? 0, {
            scale: opts.mandalaScale ?? opts.scale ?? 1,
            mandalaFit: opts.mandalaFit ?? 1,
            tagFit: opts.tagFit,
            symmetricLayout: opts.symmetricLayout,
            symmetryCount: opts.symmetryCount,
            shapeBreak: opts.shapeBreak,
            ringDistJitter: opts.ringDistJitter,
            ringAngleJitter: opts.ringAngleJitter,
            circleSquash: opts.circleSquash,
            sharpChance: opts.sharpChance,
            seamChance: opts.seamChance,
            rand: opts.rand
        });

        gl.useProgram(this._program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
        gl.enableVertexAttribArray(this._loc.a_position);
        gl.vertexAttribPointer(this._loc.a_position, 2, gl.FLOAT, false, 0, 0);

        const bg = this.parseColorVec3(opts.bgColor || '#F3F3F3');

        gl.uniform2f(this._loc.u_resolution, w, h);
        gl.uniform1i(this._loc.u_count, mandala.count);
        gl.uniform2fv(this._loc.u_positions, mandala.positionsFlat);
        gl.uniform3fv(this._loc.u_colors, mandala.colorsFlat);
        gl.uniform1fv(this._loc.u_radii, mandala.radiiFlat);
        gl.uniform2fv(this._loc.u_stretch, mandala.stretchFlat);
        gl.uniform1f(this._loc.u_blendFactor, opts.blendFactor ?? 0.35);
        gl.uniform1f(this._loc.u_falloff, opts.falloff ?? 4.0);
        gl.uniform1i(this._loc.u_sharpCircle, mandala.sharpCircleIndex);
        gl.uniform1f(this._loc.u_sharpFalloff, opts.sharpFalloff ?? 7.0);
        gl.uniform1f(this._loc.u_sharpBlendK, opts.sharpBlendK ?? 0.20);
        gl.uniform1f(this._loc.u_maskSoft, opts.maskSoft ?? 0.2);
        gl.uniform1i(this._loc.u_seamCount, mandala.seamCount);
        gl.uniform3fv(this._loc.u_seamColors, mandala.seamColorsFlat);
        gl.uniform2fv(this._loc.u_seamPosA, mandala.seamPosAFlat);
        gl.uniform2fv(this._loc.u_seamPosB, mandala.seamPosBFlat);
        gl.uniform1f(this._loc.u_seamStrength, opts.seamStrength ?? 1.4);
        gl.uniform1f(this._loc.u_colorEdgeSoft, opts.colorEdgeSoft ?? 0.006);
        gl.uniform1f(this._loc.u_colorEdgeCore, opts.colorEdgeCore ?? 0.048);
        gl.uniform1f(this._loc.u_colorSharpness, opts.colorSharpness ?? 2.0);
        gl.uniform1f(this._loc.u_boundaryGlow, opts.boundaryGlow ?? 0.35);
        gl.uniform1f(this._loc.u_colorSatBoost, opts.colorSatBoost ?? 1.8);
        gl.uniform3f(this._loc.u_bgColor, bg[0], bg[1], bg[2]);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return canvas;
    },

    toDataURL(opts) {
        const canvas = this.renderFrame(opts);
        return canvas ? canvas.toDataURL('image/png') : '';
    }
};
