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
