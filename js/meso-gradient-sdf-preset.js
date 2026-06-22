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
