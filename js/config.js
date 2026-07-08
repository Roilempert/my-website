/* ==========================================================================
   00. GLOBAL CONFIGURATION
   Central control panel. All tunable parameters live here.
   ========================================================================== */
const VISUAL_SCALE = 1.0;
const scale = (px) => Math.round(px * VISUAL_SCALE);

/* Exhibition type scale — keep in sync with .general-h/t, .note-h/t in styles.css */
const TYPE_SCALE = {
    generalH: { sizePt: 71.33, linePt: 69.33, weight: 700 },
    generalT: { sizeRem: 1, line: 1, weight: 700 },
    noteH:    { sizePt: 20, line: 0.9, weight: 400, style: 'normal' },
    noteT:    { sizePt: 18, line: 1.2, weight: 400 },
    /* Legacy aliases for gradual migration */
    display: { sizeRem: 1.6667, sizePx: 26.67, line: 0.9, weight: 400, style: 'normal' },
    body:    { sizeRem: 1.125, sizePx: 18, line: 1.2, weight: 400, maxCh: 55 },
    meta:    { sizeRem: 1, sizePx: 16, line: 1, weight: 700 },
    ui:      { sizeRem: 1, line: 1, weight: 700 },
    nav:     { sizeRem: 4.4583, line: 0.848, weight: 700, weightActive: 700 },
    debug:   { sizePx: 9 }
};

const CONFIG = {
    visualScale: VISUAL_SCALE,

    typography: TYPE_SCALE,

    /* --- Site shell grid (viewport reference — separate from #app canvas grids) --- */
    siteGrid: {
        columns: 24,
        rows: 12,
        padding: { value: 1.25, unit: 'rem' },  // exhibition: 20px @ 16px root
        gap: { value: 1.25, unit: 'rem' },
        crossStep: 4,                           // decoration at every 4th row/column crossing
        showGridMarks: false,                   // L1 crosses, L2 diagonals, L3 dots on canvas background
        macroGridColStep: 2,                    // L1: every second shell column (12 slots — gaps on grid lines)
        macroGridRowStep: 2,                    // L1: every second shell row (fewer rows than columns)
        debug: false,
        // Reference regions in grid coordinates (colEnd/rowEnd exclusive).
        // Scale/anchor tokens only — layers stay free (scroll, drag, overflow).
        regions: {
            nav:          { colStart: 1, colEnd: 25, rowStart: 1, rowEnd: 13 },
            canvas:       { colStart: 1, colEnd: 25, rowStart: 1, rowEnd: 11 },
            warehouse:    { colStart: 1, colEnd: 25, rowStart: 11, rowEnd: 13 },
            warehouseDock: { colStart: 1, colEnd: 21, rowStart: 11, rowEnd: 13 },
            warehouseMap:  { colStart: 21, colEnd: 25, rowStart: 11, rowEnd: 13 },
            blockBar:       { colStart: 1, colEnd: 21, rowStart: 10, rowEnd: 11 },
            inspector:    { colStart: 8, colEnd: 19, rowStart: 6, rowEnd: 11 },
            filterFringe: { colStart: 23, colEnd: 25, rowStart: 1, rowEnd: 11 },
            navigationLayers: { colStart: 23, colEnd: 25, rowStart: 1, rowEnd: 7  },
            navigationMaps:   { colStart: 21, colEnd: 25, rowStart: 11, rowEnd: 13 }, // alias: warehouseMap
            about:            { colStart: 1, colEnd: 13, rowStart: 11, rowEnd: 13 }
            // reset button: centered above warehouse shell — not a grid region
        },
        regionsByLevel: {
            2: { inspector: { colStart: 7, colEnd: 21, rowStart: 5, rowEnd: 10 } },
            3: { inspector: { colStart: 8, colEnd: 19, rowStart: 4, rowEnd: 10 } }
        },
        // Site columns each content column spans (width reference only — not total column count)
        contentColumns: { 1: 1, 2: 4, 3: 6 },
        contentColumnScale: { 3: 1.0 },
        contentGapScale: 0.88,
        microNoteMinRows: 6,
        macroCanvasScrollFactor: 2
    },

    /* --- Data Sources (local CSV in data/; remote Google Sheets as fallback) --- */
    data: {
        urls: {
            main: 'data/main.csv',
            tags: 'data/tags.csv'
        },
        remoteUrls: {
            main: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7yUXgr2RmRgAg9hWSPesVZsqkROq-PedKOh6KpERDO9HcC5ru11oobFPN8Mhsnruw26JKe4peAIFT/pub?gid=693502086&single=true&output=csv',
            tags: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7yUXgr2RmRgAg9hWSPesVZsqkROq-PedKOh6KpERDO9HcC5ru11oobFPN8Mhsnruw26JKe4peAIFT/pub?gid=946159072&single=true&output=csv'
        },
        preferLocal: false,
        // Column indices in the main CSV (zero-based)
        columns: {
            authorFullName: 1,
            authorCode: 2,
            date: 3,
            id: 4,
            title: 6,
            body: 7,
            tags: 8,
            typology: 9,
            // Optional manual override: ltr | rtl | en | he (empty → auto-detect from title+body)
            direction: 10
        },
        fallbackTagColor: '#898989',
        typologyLabels: {
            Block: 'בלוק',
            List: 'רשימה',
            Fragment: 'מקטע',
            Stanza: 'מחרוזת'
        }
    },

    /* --- About panel (bottom pull-up sheet) --- */
    about: {
        label: 'על הפרויקט',
        bodyHtml: [
            '<p>רשימת קניות, הודעת פרידה, מתכון לספינג׳.<br>הרבה מילים נכתבות בפתקים בטלפון. כל פתק כזה הוא שבריר של מחשבה, המשאיר אחריו עקבות למי שאנחנו. עקבות אלו מספקים הזדמנות להיכנס למחשבה ולנפש של אדם אחר, ומעניקים לגיטימציה ליצר הסקרנות והחטטנות הבסיסי – הדחף לנבור בסודות ובטיוטות של זרים. הפרויקט הוא ארכיון האוסף פתקים מטלפונים של אנשים שונים, ומציע דרך אלטרנטיבית לחקור אותם.<br>באמצעות ניתוק המחשבות החשופות מהקשרן המקורי, הפרויקט הופך אותן למאגר נתונים המאפשר שיטוט ולמידה מחודשת על טבע האדם.</p>'
        ].join(''),
        intro: 'פרויקט גמר במחלקה לתקשורת חזותית,<br>בצלאל אקדמיה לאמנות ועיצוב, ירושלים',
        credits: [
            { category: 'בהנחיית', output: 'אורי סוכרי ואלי מגזינר' },
            { category: 'תודה מיוחדת', output: 'ניר שקד, מאיר סדן<br>וענת קציר' },
            {
                category: 'פונטים בשימוש',
                output: [
                    'פרנקריהל Universal, TheBasics — הגילדה',
                    'נרקיס יאיר — פונטף'
                ]
            },
            { category: 'יעוץ ומחקר', output: 'איתי שרף ואלון צוקרמן' },
            { category: 'עיצוב מחקר ופיתוח', output: 'רועי למפרט' }
        ],
        mainTitle: 'הדברים',
        titleMaxPx: 400,
        titleMinPx: 24,
        titleReducePt: 20,
        titleLetterSpacingBoost: 1.581,
        logoSrc: 'assets/ui/Bezalel_academy_of_arts_and_design_new_logo.svg',
        arrowSrc: 'assets/ui/arrow.svg',
        panelCols: 12,
        panelColStart: 1,
        tabColStart: 2,
        logoCols: 1,
        textCols: 5,
        detailsCols: 6,
        tabTopRowStart: 2,
        openToVh: 50,
        panelHeightVh: 38,
        openMaxPx: 960,
        snapThreshold: 0.35
    },

    /* --- Boot Sequence --- */
    boot: {
        physicsBuildDelay: 350,     // ms to wait after render before building the physics world
        fetchTimeoutMs: 15000,      // abort sheet fetch if network stalls (campus WiFi, etc.)
        safetyRevealMs: 10000,      // show #app even if async boot never completes
        idleRefreshMs: 0 // 0 = disabled; set e.g. 3 * 60 * 1000 for kiosk idle reload
    },

    /* --- Visual theme --- */
    theme: {
        mode: 'censored',           // 'default' | 'censored' — L3 only: redaction bars, word panel
        dwellMs: 700,               // legacy — word commit is click-only on L2 censored
        wordPanelMessage: 'לחצו על מילה לגילוי',
        wordLinks: {
            duration: 1650,
            stagger: 175,
            revertDuration: 920,
            strokeWidthStart: 0.2 * (96 / 72),
            strokeWidthEnd: 0.2 * (96 / 72),
            opacityMax: 0.48,
            soloProbeLength: 96,
            soloProbeDuration: 720,
            soloProbeHoldMs: 160,
            soloProbeFadeMs: 480,
            soloLoopRise: 58,
            soloProbeRevertDuration: 640
        },
        wordClusterCache: {
            enabled: true,
            url: 'assets/cache/word-clusters.json',
            fetchCache: 'default',
            version: 1
        }
    },

    /*
     * --- Site background (ink-blot fold mirror) ---
     * Shared by opening.html (.opening-screen__art) and experience.html (#site-background).
     */
    siteBackground: {
        enabled: true,
        mode: 'grain',
        washOverContent: true,
        showBlobs: false,
        grainMode: 'displace',
        grainDisplacementScale: 2.5,
        grainDisplacementFrequency: 0.75,
        grainDisplacementOctaves: 3,
        grainDisplacementAnimate: true,
        grainDisplacementSeedRate: 0.4,
        bgColor: '#F2F0EE',
        blobCount: 16,
        mirrorFolds: 2,
        foldCreaseAlpha: 10,
        foldCreaseWidth: 0.75,
        scatterSpread: 0.28,
        scatterCenterX: 0.5,
        scatterCenterY: 0.5,
        radiusMin: 0.05,
        radiusMax: 0.13,
        dotCountMin: 1,
        dotCountMax: 5,
        dotRadiusRatio: 0.4,
        hullPaddingRatio: 0.25,
        clusterBaseRatio: 0.38,
        clusterPerDotRatio: 0.004,
        spawnJitterRatio: 0.12,
        pillCount: 0,
        pillHeightMin: 0.024,
        pillHeightMax: 0.04,
        pillWidthMinRatio: 1.35,
        pillWidthMaxRatio: 3.2,
        pillRotationMax: 0.45,
        pillPadX: 10,
        pillBorderWidth: 2,
        pillBorderAlpha: 0.9,
        pillFillColor: 'var(--color-3)',
        grainAlpha: 18,
        grainWashAlpha: 18,
        grainTilePx: 64,
        grainSpread: 40,
        grainMid: 128,
        grainBlurPx: 0.3,
        blurScale: 0.12,
        seed: 'random',
        maxDpr: 1.5,
        mouseFollow: false,
        mouseHoverRadiusScale: 1.1,
        mouseHoverPadding: 10,
        mouseHoverMaxShift: 0.017,
        mouseHoverSmoothing: 0.1,
        mouseReturnOnLeave: false
    },

    /*
     * --- Opening screen (ceremonial threshold) ---
     * Exhibition entry: opening.html (lightweight bundle).
     * Main site: experience.html — no opening layer.
     * Root index.html redirects to opening.html.
     * Dev bypass: opening.html?skipOpening=1 (session only, no localStorage).
     */
    opening: {
        enabled: true,
        entryTarget: 'experience.html',
        dataUrl: 'data/opening-palette.json',
        minDisplayMs: 600,
        artRevealAfterTitleMs: 500,
        artFadeDurationMs: 1000,
        titleTypewriterMsPerChar: 320,
        titleCursorWaitMs: 1800,
        titleCols: 12,
        titleFit: {
            minPx: 24,
            maxPx: 360,
            reducePt: 20
        },
        titleSafeFrame: {
            enabled: true,
            padX: 18,
            padY: 14
        },
        miniTitle: {
            enabled: true,
            notesUrl: 'data/main.csv',
            rotateMs: 4500,
            maxWords: 8
        },
        artReadyFallbackMs: 12000,
        exitDurationMs: 600,
        background: {
            mode: 'full',
            showBlobs: true,
            moleculeStyle: 'l1',
            blurSource: 'content',
            glowOverlay: false,
            glowBlendMode: 'multiply',
            blobBlendMode: 'source-over',
            blobLayerAlpha: 1,
            transparent: true,
            bgColor: 'var(--color-5)',
            blurScale: 0.028,
            contentBlurPx: 3.5,
            glowAlpha: 0.07,
            pillGlowAlpha: 0.42,
            dotVisualScale: 0.85,
            hullStrokeWidth: 0.27,
            hullStrokeAlpha: 0.62,
            hullPaddingPx: 7,
            linkAlpha: 0.48,
            dotCountMin: 2,
            dotCountMax: 5,
            blobCount: 36,
            pillCount: 4,
            pillTextRowColor: '#FFFFFF',
            pillTextRowHeightRatio: 0.16,
            pillTextRowGap: 4,
            pillTextRowAlpha: 0.92,
            scatterSpread: 0.64,
            scatterMirrorInset: 0.02,
            scatterMirrorReach: 1.12,
            spawnJitterRatio: 0.16,
            radiusMin: 0.06,
            radiusMax: 0.16,
            maxDpr: 1,
            repaintThrottleMs: 48,
            dotMotion: true,
            dotAmbientAmp: 0.45,
            dotHomeStiffness: 0.04,
            dotSpringDamping: 0.9,
            dotPointerRepel: false,
            grainAlpha: 14,
            grainBlendMode: 'soft-light',
            grainSpread: 54,
            grainBlurPx: 0.2,
            grainTilePx: 40,
            mouseFollow: true,
            mouseHoverMaxShift: 0.045,
            mouseHoverRadiusScale: 1.45,
            mouseHoverPadding: 16,
            mouseHoverSmoothing: 0.14,
            mouseReturnOnLeave: false,
            foldCreaseAlpha: 0
        },
        devSkipStorageKey: 'opening.skip',
        preloadAssets: [
            'assets/ui/layer-nav-marker.svg',
            'assets/ui/layer-nav-l1.svg',
            'assets/ui/layer-nav-blocks.svg',
            'assets/ui/decoration-corner-tr.svg',
            'assets/fonts/NarkissYair-Bold-TRIAL.woff2',
            'assets/fonts/NarkissYair-RegularMono-TRIAL.woff2',
            'assets/fonts/NarkissYair-BoldMono-TRIAL.woff2',
            'assets/fonts/TheBasics-Dots.woff2',
            'assets/fonts/FrankRuhl_Universal-Mono.woff2'
        ],
        labels: {
            title: 'הדברים',
            subtitle: 'רשימת קניות, הודעת פרידה, מתכון לספינג׳. המילים שנכתבות בטלפון.',
            continue: 'כניסה'
        }
    },

    /* --- Exhibition / low-end profile (auto on localhost and weak hardware) --- */
    presentation: {
        enabled: 'auto',            // true | false | 'auto' — auto: localhost or ≤8 GB / ≤4 cores
        targetFps: 24,              // canvas throttle when displayInterp is off
        physicsFps: 30,
        displayInterp: true,
        hullCollisionShellPasses: 1,
        hullCollisionDistanceCull: true,
        hullCollisionViewCull: 1.45,
        outlineViewportCull: true,
        physicsPassCapAtBlocks: 4,
        navMapPhysicsThrottleMs: 280,
        orbitRelaxScale: 0.72,
        stretchRelaxMinIterations: 10,
        singleBlockLerp: 0.16,
        multiBlockLerp: 0.11,
        stretchedLerp: 0.24,
        captureChase: 0.32,
        capturePullFloor: 0.5,
        captureSpawnBlend: 0.2,
        captureTransitMaxSpeed: 5.8,
        singleBlockCaptureDamping: 0.5,
        multiBlockDamping: 0.55,
        nearDamping: 0.3,
        bodyRestitution: 0.07,
        bodyFrictionAir: 0.09,
        siblingDamping: 0.18,
        dragBlockLerp: 0.25,
        blockAttractionScale: 0.78,
        kinematicStretchLerp: 0.15,
        kinematicStretchLerpDrag: 0.21,
        cooldownDelayMs: 550,
        disableGrain: true,
        mockShaderLiveHover: false,
        mockShaderLiveFps: 12,
        mockP5TextureOverscale: 1.15,
        mockCanvasScale: 1.0,
        mesoBuildBatchSize: 36,
        mesoBakeStructurePerFrame: 6,
        mesoBakeTexturePerFrame: 4,
        mesoInitialBakeColumns: 2,
        macroRefreshMsBlock: 320,
        macroDotStride: 3,
        depthMapMaxCollect: 160,
        wanderScale: 0.85
    },

    /* --- Exhibition show reel (idle attract + scripted demo) --- */
    showReel: {
        enabled: false,             // off while developing — set true | 'auto' for exhibition; test: ?showReel=autostart
        idleMs: 90_000,             // ms before attract/demo; separate from boot.idleRefreshMs
        loopPauseMs: 4_000,
        endBehavior: 'loop',        // 'loop' | 'opening' | 'hold'
        ghostCursor: true,
        openingAutoEnter: true,     // idle on opening.html → dismiss + navigate
        userExitTarget: 'opening',  // 'opening' | 'experience' — where real input sends the visitor
        script: 'default',
        labels: {
            hint: ''
        }
    },

    /* --- Depth Controller (Z-axis zoom levels) --- */
    depth: {
        initialLevel: 1,            // level shown on load (1 = macro / physics view)
        minLevel: 1,
        maxLevel: 3,
        activeLevels: [1, 3],       // Doc/UI: L1 + L2 — micro is code level 3
        cooldownDelay: 1200,        // ms lock after level change (blocks wheel pan during transitions)
        cameraLockDuration: 650,
        macroMesoRevealDuration: 640,
        macroMesoStagger: 12,
        macroMesoStaggerCap: 20,
        macroMesoBlockOpacity: 0.35,
        macroMesoMasterScale: 0.028,
        catalogBlockAnchorOpacity: 0.42,
        microRevealDuration: 1050,
        microCrossfadeRatio: 0.58,
        /* L3 = microRef (1); L1 dots ≈ macroRef; L2 silhouettes = linear midpoint */
        unitScale: {
            macroRef: 0.28,
            microRef: 1,
            mesoBias: 0.72          // 0.5 = אמצע; גבוה יותר → סילואטה קרובה יותר לפתק
        },
        noteZoomMeso: null,             // null → midpoint from unitScale (meso / micro)
        noteZoomMicro: 1,
        microNoteHoverRotation: { negativeMin: -10, negativeMax: -5, positiveMin: 5, positiveMax: 10 },
        depthEngine: 'v2',              // 'v2' = גרידים פשוטים חדשים | 'legacy' = מנוע קטלוג/מעברים
        layoutMode: 'legacy-grid',       // פעיל רק כש-depthEngine === 'legacy'
        noteClickPath: 'direct-l3',      // L1 note click → L3 micro grid
        clickDragThreshold: 6,           // px — below = click navigate, above = drag
        moleculeClickPadding: 16,        // px — extra hit area around hull for L1 note click
        moleculeHoverMaxWords: 8,        // phrase window — soft ceiling before pixel fit
        moleculeHoverMaxWidthVw: 42,     // L1 hover label max width (vw leg of min())
        moleculeHoverMaxWidthRem: 28,    // L1 hover label max width (rem leg of min())
        moleculeHoverMode: 'title',      // 'title' | 'blocks' | 'mixed' — L1 hover label mode
        moleculeHoverBlocksPercent: 50,  // mixed: stable hash % of notes → attached-block row
        moleculeHoverBlocksPerRow: 5,    // blocks-row hover: max pills per row before wrapping
        moleculeHoverBlocksSingleRowMax: 6, // ≤ this count → single row (e.g. 6 pills stay on one line)
        transition: {
            scrollDuration: 520,
            fxDuration: 480,
            handoffRatio: 0.32
        },
        catalogSettleDuration: 640,
        catalogLayout: {
            columns: 8,
            cellWidth: 120,
            cellHeight: 140,
            gap: 12,
            padding: 48
        },
        /* Grid presets — legacy L2/L3; catalog mode uses absolute layout */
        grids: {
            macro: { canvasWidth: '180vw', colCount: 30 },
            micro: { canvasWidth: '400vw', colCount: 10 }
        },
        /* V2 — גרידים נפרדים ל-L2/L3 (מקום שמור בלבד) */
        v2: {
            meso: {
                /* L2 grid — ~5–6 cols in viewport, rest scrolls off-screen (stable 2026-06-22) */
                canvasWidth: '175vw',
                colCount: 9,
                colMinWidth: 0,
                cellHeight: 100,
                rowGap: 52,
                colGap: 28,
                colItemGap: 14,
                pagePaddingX: 36,
                mockScale: 1.25,
                mockSilhouetteFill: 1.42,
                mockColumnFill: 1,
                mockColumnGradient: false, /* per-note mandala; each line slices by lineTop */
                refreshDataOnL2Enter: false,
                mockGradientMinHeight: 72,
                mockGradientMinWidth: 52,
                mockSingleLineGradientBoost: 1.7,
                mockTitleBodyGap: 10,
                /* Unified L2 fill — p5 organic blob bake + per-line slice (see depth-v2.md) */
                mockGradientMode: 'p5',
                mockP5BgColor: '#f4f1ea',
                mockP5BlobCount: 200,
                mockP5RadiusMinScale: 0.04,
                mockP5RadiusMaxScale: 0.32,
                mockP5BlendMode: 'source-over',
                mockP5VerticesMin: 15,
                mockP5VerticesMax: 60,
                mockP5DistortionMin: 0.2,
                mockP5DistortionMax: 2.0,
                mockP5BlurScale: 0.12,
                mockP5GrainAlpha: 18,
                mockP5EdgeDarken: 0.35,
                mockP5ColorEnrich: 0.28,
                mockFocusMutedColor: '#d6d6d6',
                mockFocusMutedGrayMin: 196,
                mockFocusMutedGrayMax: 232,
                mockFocusMutedDesat: 0.94,
                mockP5TextureOverscale: 2.2,
                mockP5GrainOpacity: 0,
                mockShaderPreset: 'sdf-cosine-v1',
                mockShaderMorphComplexity: 1.0,
                mockShaderSymmetry: 4,
                mockShaderMaxTags: 10,
                mockShaderFillScale: 2.35,
                mockShaderColorBlend: 2.6,
                mockShaderTextureOverscale: 1.78,
                mockShaderGrain: 0.006,
                mockShaderAnimSpeed: 0.32,
                mockShaderLiveHover: true,
                mockShaderMouseStrength: 0.82,
                mockShaderFlowAmount: 0.35,
                mockShaderLiveFps: 20,
                mockShaderMouseLerp: 0.12,
                mockShaderBgColor: '#F3F3F3',
                mockSvgRender: 'fill',
                mockSvgStrokeWidth: 1.15,
                mockGradientSoftness: 0.02,
                mockBlobCount: 20,
                mockBlobFalloff: 88,
                mockBlobCore: 44,
                mockBlobEdge: 72,
                mockBlobEdgeOpacity: 0.32,
                mockBlobPeakMin: 0.82,
                mockBlobPeakMax: 0.96,
                mockBlobWashOpacity: 0.12,
                mockBlobWashColor: '#1a1a1a',
                mockBlobRxMin: 42,
                mockBlobRxRange: 48,
                mockBlobRyMin: 36,
                mockBlobRyRange: 42,
                mockBlobEchoChance: 0.72,
                mockCanvasScale: 1.5,
                mockCanvasNoise: 3,
                mockCanvasBlend: 'source-over',
                mockColorEnrich: 0.18,
                mockGrainOpacity: 0,
                mockGrainTile: 64,
                mockGrainContrast: 115,
                mockGrainBrightness: 100,
                mockLineHeight: 11
            },
            micro: {
                viewportCols: 3,
                colCount: 12,
                rowGap: 10,
                colGap: 40,
                pagePaddingX: 36
            },
            fringe: {
                width: '12vw',
                opacity: 0.42,
                cellScale: 0.72
            },
            workspaceLens: {
                padding: 48,
                gap: 14,
                mesoCellWidth: 88,
                mesoCellHeight: 100,
                microCellWidth: 120,
                microCellHeight: 140,
                orbitRadius: 72,
                /* L3 study band: relevant notes round-robin into first N columns when blocks active */
                microClusterCols: 4
            },
            hive: {
                cellWidth: 92,
                cellHeight: 104,
                gap: 18,
                centerYRatio: 0.44
            },
            focusLinks: {
                visible: true,
                width: 0.2 * (96 / 72),
                opacity: 0.48,
                maxVisibleDistance: scale(1200)
            }
        }
    },

    /* --- Meso layer (level 2) — vector silhouettes from line metrics --- */
    meso: {
        silhouetteCache: {
            enabled: true,
            url: 'assets/cache/meso-silhouettes.json',
            fetchCache: 'default',
            version: 1
        },
        includeTitle: true,
        includeBody: true,
        includeTags: false,
        includeId: false,
        maxBodyChars: 420,
        buildBatchSize: 16,
        silhouette: {
            padding: 0
        },
        typography: (() => {
            // Single uniform scale derived from micro type scale (display / body)
            const uniformScale = 0.18;
            const titleSizeBoost = 1.65;
            const micro = {
                titleSize: TYPE_SCALE.display.sizePx,
                titleLine: TYPE_SCALE.display.line,
                bodySize: TYPE_SCALE.body.sizePx,
                bodyLine: TYPE_SCALE.body.line
            };
            return {
                direction: 'rtl',
                microRef: micro,
                uniformScale,
                titleSizeBoost,
                title: {
                    size: scale(micro.titleSize * uniformScale * titleSizeBoost),
                    lineHeight: micro.titleLine,
                    charWidthRatio: 0.54
                },
                body: {
                    size: scale(micro.bodySize * uniformScale),
                    lineHeight: micro.bodyLine,
                    charWidthRatio: 0.5
                },
                titleBodyGap: 0.08
            };
        })(),
        color: {
            fill: '#101010'
        },
        tagMarkers: {
            gap: scale(3),
            maxVisible: 6
        }
    },

    /* --- Spatial Navigation (edge-scroll + background pan) --- */
    navigation: {
        edgeScrollEnabled: false,   // hover near viewport edges to auto-scroll
        edgeThreshold: scale(150),    // px from viewport edge where auto-scroll activates
        maxSpeed: 12,               // px per frame at the very edge
        bottomEdgeThreshold: scale(60),
        bottomMaxSpeed: 5,
        contentPadding: scale(120), // px; breathing room kept around content when clamping the scroll
        pan: {
            minDrag: 2                // px before pan engages (ignores micro-jitter)
        },
        wheel: {
            speed: 1,                  // multiplier on trackpad / mouse wheel delta
            depthZoom: true,           // ctrl+wheel / pinch zoom L1↔L2
            zoomThreshold: 12          // min |deltaY| before level change
        },
        spacePanKey: 'Space',
        toroidalWrap: {
            enabled: true,
            axes: 'both',             // 'x' | 'y' | 'both'
            lockNativeScroll: false
        }
    },

    /* --- Layer navigation — depth symbols (L1 / L2), top-right --- */
    layerNavigation: {
        labels: { 1: 'L1', 3: 'L2' },
        symbols: {
            l1: 'assets/ui/layer-nav-l1.svg',
            3: 'assets/ui/layer-nav-blocks.svg'
        },
        symbolSizeActive: { value: 4.5, unit: 'rem' },
        symbolSizeInactive: { value: 3.25, unit: 'rem' },
        rightInset: { value: 1.25, unit: 'rem' },
        boxGap: { value: 0.625, unit: 'rem' },
        boxPadding: { value: 0.625, unit: 'rem' },
        boxRadius: { value: 0.3125, unit: 'rem' },
        markerGap: { value: 0.625, unit: 'rem' },
        rowGap: { value: 0.625, unit: 'rem' },
        markerSrc: 'assets/ui/layer-nav-marker.svg',
        slotMoveDuration: 0.34,
        slotMoveEasing: 'cubic-bezier(0.9, 0, 0.02, 1)',
        centerOnViewport: false,
        hitAreaPadding: { value: 0, unit: 'rem' },
        toggleMode: true,
        slotCount: 1,
        toggleTopInset: { value: 1.25, unit: 'rem' },
        toggleBoxSize: { value: 80, unit: 'px' },
        toggleBoxPadding: { value: 5, unit: 'px' },
        moleculeSymbolRotateDeg: 0,
        moleculeSymbolScale: 1,
        blocksSymbolScale: 0.9,
        moleculeSymbolNudgeY: { value: 0, unit: 'px' }
    },

    /* --- Navigation minimap — spatial overview canvas, bottom-right (not layer labels) --- */
    navigationMap: {
        frameInset: 0,
        backgroundColor: null,
        showWorldFill: false,
        showViewportFill: true,
        showViewportOutline: true,
        viewportFillColor: 'rgba(45, 45, 45, 0.08)',
        viewportOutlineColor: 'rgba(45, 45, 45, 0.72)',
        viewportOutlineWidth: 0.75,
        offsetY: { value: -0.35, unit: 'cellH' },
        /* Clip frame larger than grid slot; soft fade at clip edges */
        clipFrameScale: 1.38,
        clipEdgeFadePct: 14,
        viewportFollow: true,
        viewportFollowStrength: 1,
        viewportFollowClamp: false,
        /* Shrink map scale so viewport marker is never clipped by map-wrap overflow (scaled mode only) */
        viewportFitInFrame: true,
        mapOverscan: 1.55,
        mapCanvasOverscan: 1.65,
        /* Per-layer map density when viewportMarkerMode is scaled; fixed mode uses marker-driven scale */
        levelMapOverscan: { 1: 1.55, 2: 3.05, 3: 5.0 },
        levelMapScaleAdjust: { 3: 0.92 },
        macroMinScaleLock: true,
        macroRefreshMs: 0,
        macroRefreshMsBlock: 80,
        mesoRefreshMs: 1500,
        mesoRefreshMsBlock: 80,
        microRefreshMs: 1500,
        microRefreshMsBlock: 80,
        microMapMaxCards: 512,
        macroDotStride: 1,
        macroMapNoteCenters: true,
        macroFocusDetails: true,
        macroFocusDetailsWhenBlocks: true,
        macroFocusConnectors: false,
        macroBlockMarkers: true,
        macroDotRadius: 1.265,
        macroDotFill: 'rgba(45, 45, 45, 0.45)',
        macroDotMutedFill: 'rgba(45, 45, 45, 0.14)',
        mesoMapDetailed: true,
        mesoMapUseFrameRects: true,
        mesoMapMaxFrameRects: 320,
        mesoMapViewportEcho: true,
        mesoMapSilhouetteDetail: true,
        mesoMapSilhouetteDetailDuringMotion: true,
        mesoMapCenterSilhouetteFragments: false,
        mesoMapScaleSilhouetteFragments: false,
        mesoMapSilhouetteFragmentScale: 1,
        mesoMapMaxDetailRects: 2500,
        mesoMapEchoSettleMs: 120,
        mesoFrameFill: 'rgba(45, 45, 45, 0.28)',
        mesoFrameMutedFill: 'rgba(45, 45, 45, 0.1)',
        mesoFrameDetailBaseFill: 'rgba(45, 45, 45, 0.08)',
        mesoFrameEchoFill: 'rgba(45, 45, 45, 0.32)',
        mesoSilhouetteDetailFill: 'rgba(45, 45, 45, 0.34)',
        mesoLineFill: 'rgba(45, 45, 45, 0.18)',
        mesoLineMutedFill: 'rgba(45, 45, 45, 0.08)',
        mesoPathFill: 'rgba(45, 45, 45, 0.14)',
        noteCardFill: 'rgba(45, 45, 45, 0.18)',
        noteCardMutedFill: 'rgba(45, 45, 45, 0.08)',
        noteCardStroke: 'rgba(45, 45, 45, 0.12)',
        noteBlockFill: 'rgba(45, 45, 45, 0.22)',
        noteBlockMutedFill: 'rgba(45, 45, 45, 0.09)',
        noteBlockMinHeight: 0.5,
        blockMarkerSize: 2.5,
        blockConnectorAlpha: 0.28,
        authorBlockColor: '#2D2D2D',
        /* L1 minimap — live DOM layer dots match the visible macro field (not physics-only) */
        macroMapUseDomPositions: true,
        macroMapUseLayerDots: true,
        macroMapMaxDots: 900,
        /* Shared macro coordinate frame on L1 only; L2/L3 fit active grid layout */
        sharedReferenceScale: true,
        /* Fixed viewport marker UI size; map scale follows the visible map viewport */
        viewportMarkerMode: 'fixed',
        viewportMarkerWidthRatio: 0.792,
        viewportMarkerHeightRatio: 0.44,
        /* Per-layer glyph size on the shared frame (not map scale) */
        levelGlyphScale: { 1: 0.78, 2: 0.72, 3: 1 },
        microMapCardInsetPx: 1.6,
        /* L2/L3 minimap — cell rects from one batched DOM read; no full silhouette bake */
        depthMapLayoutSettleMs: 480,
        depthMapMaxCollect: 320,
        depthMapBoundsPad: 32
    },

    /* --- Artifact Inspector (focus/isolation overlay) --- */
    inspector: {
        openDuration: 0.48,         // s; focus card FLIP on fixed flyer layer
        closeDuration: 350,         // ms; must match the CSS transition on .note-wrapper
        metadataMinGap: 60,         // px; min gap below focus note when it extends past align row
        cardAnchorRow: 2,           // shell row where focus card top lands
        metadataAlignRow: 10        // shell row whose bottom the details panel aligns to (last content row)
    },

    /* --- Physics Engine (Matter.js) --- */
    physics: {
        gravity: { x: 0, y: 0 },

        // Per-body properties
        body: {
            radius: scale(8),       // collider (px); slightly larger than visual dot for separation
            frictionAir: 0.09,
            friction: 0.35,
            restitution: 0,
            density: 0.005
        },

        // Cluster layout (dots belonging to the same note)
        cluster: {
            baseRadius: scale(9),   // base distance of dots from note center (px)
            radiusPerDot: 0.1,
            spawnJitter: scale(8)
        },

        // Forces applied every tick
        forces: {
            attraction: 0.00015,
            blockAttraction: 0.00032,
            blockAttractionSingle: 0.00024,
            blockAttractionMulti: 0.00014,
            blockAttractionStretch: 0.00042,
            workspaceBankAttraction: 0.00055,
            captureSettleRadius: scale(40),
            capturePullFloor: 0.3,
            maxPullDistance: scale(240),
            wanderStrength: 0.00004,
            wanderSpeed: 0.02
        },

        // Visual-only idle drift — applied in draw positions, not physics bodies
        breathing: {
            enabled: true,
            amplitude: scale(1.8),   // px peak offset per molecule
            speed: 0.55,             // rad/s — slow ~11s loop
            verticalRatio: 0.82,
            capturedScale: 0.2,      // quieter while orbiting blocks
            bankScale: 0.65          // softer on workspace bank
        },

        // Cursor interaction — per-dot repulsion (very soft)
        mouse: {
            interactionRadius: scale(44),
            repulsionStrength: 0.0045
        },

        // Outline shell collider — hard positional separation (body only, never orbit targets)
        hullCollision: {
            gap: scale(4),
            dotGap: 0,
            shellPasses: 2,
            capturedBodyWeight: 0.55,
            capturedBodyWeightMulti: 0.44,
            stretchResolveStrength: 0.48
        },

        motion: {
            transitRadius: scale(48),
            transitMaxSpeed: 8.2,
            nearJitterSpeed: 0.35,
            nearDamping: 0.35,
            multiBlockDamping: 0.58,
            singleBlockCaptureDamping: 0.56, // damp captured dots when one block is active
            workspaceBankDamping: 0.38,   // grid-side molecules when workspace is active
            workspaceBankHullScale: 0.25,   // softer hull resolve between bank-only molecules
            workspaceBankDriftRadius: scale(28),
            workspaceBankPinLerp: 0.2,
            snapRadius: scale(5),       // zero velocity when hugging target
            snapRadiusCaptured: scale(10)
        },

        targetSmoothing: {
            singleBlock: 0.21,
            multiBlock: 0.1,
            dragBlock: 0.31,
            stretched: 0.22,
            captureChase: 0.43,
            stretchJumpReset: scale(55)
        },

        // Reserved — crowded taper disabled; 1–N blocks share the same physics path
        crowdedBlock: {
            forceScale: [1, 1, 1, 1, 0.94, 0.82, 0.76],
            targetLerp: [0.028, 0.024, 0.02],
            captureDamping: [0.52, 0.48, 0.44],
            transitMaxSpeed: 5.5,
            orbitAngleBlend: 0.24,
            // Block 6+ (tier 1): captured dots follow orbit targets kinematically — no force tug-of-war
            kinematicTierMin: 1,
            kinematicLerp: 0.1,
            kinematicLerpDrag: 0.16,
            kinematicLerpStretch: 0.12,
            kinematicSmoothLerp: 0.14,
            kinematicSmoothLerpDrag: 0.22,
            kinematicSmoothLerpStretch: 0.16,
            kinematicMaxStep: 2.4,
            kinematicMaxStepDrag: 3.6,
            kinematicSmoothMaxStep: 2.2,
            kinematicSmoothMaxStepDrag: 3.2,
            kinematicLagFar: 40,
            kinematicLagVeryFar: 110,
            kinematicLagBoostMax: 3.5,
            kinematicBlock7StepMul: 1.3,
            kinematicTransitionBlend: 0.1,
            kinematicStepCap: 0.06,
            kinematicStepFloor: 0.04,
            kinematicJumpCap: 18,
            kinematicEntryTicks: 120,
            kinematicEntryLerp: 0.36,
            softRecallRadius: 36,
            softRecallLerp: 0.32
        },

        resizeDebounce: 300
    },

    /* --- Action Warehouse (bottom portal dock) --- */
    warehouse: {
        blockHeight: 26,            // px; pill height — fits .site-type
        blockGlyphSize: 10,         // px; matches L1 molecule dot size on exhibition iMac
        // Black filter/deletion frame in tray — archived: js/archive/warehouse-filter-frame.js
        enableFilterFrame: false,
        // Block cap — policy: docs/block-cap-policy.md (hard limit 5; kinematic at 6+ deferred)
        maxCaptureBlocks: 5,

        dock: {
            widthRatio: 1,
            bottomOffset: 0,
            borderRadius: 5,
            outlineWidth: 0,
            visibleRows: 2,
            rowGap: 6,
            cornerDecorationSrc: 'assets/ui/decoration-corner-tr.svg',
            messageText: 'גררו להפעלה',
            messageTypewriterMsPerChar: 35,
            blockTrayGap: { value: 3.75, unit: 'rem' },
            // Panel toggles — blocks tray always on; set false to hide chrome while iterating dock layout.
            panels: {
                statistics: false,
                message: false,
                map: false
            }
        },

        // Collapsed by default — full dock slides up as a popup; minimap lives inside.
        popup: {
            enabled: true,
            defaultOpen: false,
            launcherLabel: 'כלים',
            launcherArrowSrc: 'assets/ui/arrow.svg',
            launcherArrowBaseDeg: -90,
            launcherArrowHoverDeg: -135,
            launcherSize: { width: 86, height: 46 },
            launcherPad: 5,
            stayOpenWhileDragging: true,
            closeOnOutsideClick: true,
            closeOnEscape: true,
            launcherStrip: {
                enabled: true,
                expandDrag: true,
                expandCols: 12,
                expandRows: 4,
                mapCols: 3,
                blockCols: 9,
                mapRows: 2,
                showMap: true,
                tagOnly: true,
                snapThreshold: 0.82,
                firstPressTeaser: {
                    enabled: true,
                    peakTravelPx: 72,
                    durationMs: 950,
                    bounces: 2,
                    persist: 'session',
                    storageKey: 'warehouseLauncherExpandHintSeen'
                }
            }
        },

        drag: {
            followFactor: 0.22,     // 0-1; how fast the block catches up to the cursor (lower = heavier feel)
            maxTilt: 12             // deg; max rotation while dragging, derived from velocity
        },

        orbit: {
            slotWidth: scale(15),
            minRadius: scale(8),
            ringSpacing: scale(10),
            groupArcSpacing: scale(8),
            siblingsPerRing: 3,
            rotationSpeed: 0.06,
            stretchClearance: 0.45,
            stretchLaneSpacing: scale(18),  // perpendicular gap between stretched duplicates (same block-pair)
            stretchMoleculeGap: scale(1),   // tighter hull gap for stretched molecules sharing a chord
            stretchEdgeInset: scale(4),
            stretchClusterRelaxPasses: 8,
            moleculeFootprint: scale(14),
            footprintPerSibling: scale(3),
            moleculeGap: scale(1),
            dotSeparationGap: scale(2),
            blockClearance: scale(14),          // gap between block edge and any dot center
            orbitCaptureClearance: scale(10), // tighter sit for single-block anchor dots
            orbitAnchorReach: 0.28,             // pull ring anchors inward toward block (0–1)
            orbitAngleBlend: 0.16,            // smooth ring slot angles across frames
            singleBlockRelaxScale: 0.3,       // captured-molecule relax when one block
            singleBlockClusterRelaxScale: 0.28, // ring cluster relax when one block
            foreignBlockRepulsion: scale(130),  // distance at which ownership arcs engage
            blockOwnershipArcMin: 0.50,         // min arc (×π) per block when neighbours are tight
            blockRepulsionStrength: 0.03,      // physics push for dots drifting into foreign blocks
            moleculeRelaxIterations: 28,
            clusterRelaxIterations: 24,
            radialClampMin: 0.82,
            radialClampMax: 1.02,
            tangentialPushRatio: 0.85,
            edgePeekExtension: scale(24),
            edgePeekThreshold: 0.35,
            edgePeekPast: scale(12),
            arcFillScale: 0.35,
            stretchRelocateLerp: 0.52,
            stretchBodyLerp: 0.32,
            stretchGroupLerp: 0.44,
            stretchChordInset: 0.26,
            stretchPillClearance: scale(3), // min pill gap only — detached from orbit ring
            stretchCenterSpan: scale(13),   // along-chord elongation around midpoint
            stretchAnchorReach: 0.30,       // anchors drift toward their block (0–1, subtle)
            stretchAnchorPullBoost: 1.14,   // slightly stronger target pull on anchor dots
            stretchCenterBias: 0.5          // extra pull toward center for siblings only
        },

        workspaceGrid: {
            voidViewportRatioBase: 0.74,
            voidViewportRatioPerBlock: 0.08,
            voidViewportRatioMax: 0.94,
            cellSizeFallback: scale(78),  // used only before DOM metrics are available
            marginFallback: scale(22),
            rushDuration: 850,
            rushLerp: 0.28,
            rushLerpNear: 0.16,
            rushSettleRadius: scale(10)
        },

        linkage: {
            siblingStiffness: 0.0045,
            stretchStiffnessFactor: 0.45,   // softer internal springs while stretched — cluster elongates naturally
            stretchLengthSlack: 1.10,       // constraint rest length multiplier while stretched
            siblingDamping: 0.20,
            siblingLength: scale(24),
            maxLinksPerDot: 3,
            homeFactorWhenCaptured: 0,
            line: {
                visible: false,
                cssColorVariable: '--main-text',
                width: 0.2 * (96 / 72),
                maxVisibleDistance: scale(90)
            },
            blockNote: {
                visible: true,
                width: 0.2 * (96 / 72),
                opacity: 0.48,
                maxVisibleDistance: scale(1800)
            }
        },

        returnDuration: 350,
        depthDeployDuration: 520,
        depthDeployStartScale: 0.94,
        depthDeployArcLift: scale(14),
        macroIndicationDuration: 720,
        macroIndicationFadeMs: 320,
        macroIndicationTravel: 1,

        frame: {
            filter: {
                paddingY: scale(5),
                paddingLeft: scale(5),
                borderRadius: 6,
                slotMinWidth: scale(56),
                paddingX: scale(6),
                nestedGap: scale(4)
            }
        },

        filterExit: {
            hollowDuration: 120,
            peelDuration: 380,
            peelSpeed: scale(5.5),
            peelJitter: 0.35,
            peelFrictionAir: 0.26,
            restoreOffScreenPad: scale(56)
        }
    },

    /* --- Note molecule outlines --- */
    outlines: {
        mode: 'hull',
        padding: scale(7),         // physics hull shell + molecule extent (unchanged)
        renderScale: 2,            // L1 dot visual diameter = 10px × renderScale → 20px (10px radius); physics unchanged
        renderPadding: scale(5),   // visual hull gap only — effective corner radius = dotR(10) + 5 = 15px
        width: 0.4 * (96 / 72),
        hoverWidth: 0.4 * (96 / 72),
        hoverFillCssVariable: '--color-6',
        hoverFillMode: 'token' // 'tag' = first dot sheet color; 'token' = hoverFillCssVariable
    }
};

function getTypologyLabel(name) {
    const labels = CONFIG.data.typologyLabels || {};
    if (!name) return '';
    if (labels[name]) return labels[name];
    const key = Object.keys(labels).find(k => k.toLowerCase() === String(name).toLowerCase());
    return key ? labels[key] : String(name);
}

function getDepthUnitScales() {
    const unit = CONFIG.depth.unitScale || {};
    const cfg = CONFIG.depth.catalogLayout;
    const cellW = scale(cfg.cellWidth || 120);
    const orbit = CONFIG.warehouse?.orbit || {};
    const moleculePx = scale((orbit.moleculeFootprint || 14) * 2.8);
    const macro = unit.macroRef ?? Math.min(0.45, moleculePx / cellW);
    const micro = unit.microRef ?? 1;
    const meso = unit.mesoRef != null
        ? unit.mesoRef
        : macro + (micro - macro) * (unit.mesoBias ?? 0.72);
    return { macro, meso, micro, cellW, moleculePx };
}

function getDepthActiveLevels() {
    return CONFIG.depth.activeLevels || [1, 3];
}

function isDepthLevelActive(level) {
    return getDepthActiveLevels().includes(level);
}

function getDepthAdjacentLevel(current, direction) {
    const levels = getDepthActiveLevels();
    const idx = levels.indexOf(current);
    if (idx < 0) return current;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= levels.length) return current;
    return levels[nextIdx];
}

function getDepthSlotIndex(level, activeLevel) {
    const levels = getDepthActiveLevels();
    const activeIdx = levels.indexOf(activeLevel);
    const levelIdx = levels.indexOf(level);
    if (activeIdx < 0 || levelIdx < 0) return level - activeLevel;
    return levelIdx - activeIdx;
}

function getMesoRevealCellSize() {
    const cfg = CONFIG.depth.catalogLayout;
    const cellW = scale(cfg.cellWidth || 120);
    const cellH = scale(cfg.cellHeight || 140);
    const ratio = getMesoCellRatio();
    return {
        width: Math.round(cellW * ratio),
        height: Math.round(cellH * ratio)
    };
}

function applyMesoAnchorTokens(root = document.documentElement) {
    const { moleculePx } = getDepthUnitScales();
    const mesoCell = getMesoRevealCellSize();
    const sizeMin = Math.min(moleculePx / mesoCell.width, moleculePx / mesoCell.height, 0.92);

    root.style.setProperty('--meso-anchor-w', `${mesoCell.width}px`);
    root.style.setProperty('--meso-anchor-h', `${mesoCell.height}px`);
    root.style.setProperty('--meso-molecule-size', `${moleculePx}px`);
    root.style.setProperty('--macro-meso-size-min', String(sizeMin));
}

function getLegacyMesoZoom() {
    const { meso, micro, cellW } = getDepthUnitScales();
    const mesoRatio = meso / micro;
    const colCount = CONFIG.depth.grids?.micro?.colCount || 10;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const legacyCell = (vw * 4) / colCount;
    return (cellW / legacyCell) * mesoRatio;
}

function getNoteZoomMeso() {
    const override = CONFIG.depth.noteZoomMeso;
    if (override != null) return override;
    if (CONFIG.depth.layoutMode === 'catalog') return 1;
    return getLegacyMesoZoom();
}

function getMesoCellRatio() {
    const { meso, micro } = getDepthUnitScales();
    return meso / micro;
}

function applyCatalogCellTokens(root = document.documentElement) {
    const cfg = CONFIG.depth.catalogLayout;
    const cellW = scale(cfg.cellWidth || 120);
    const cellH = scale(cfg.cellHeight || 140);
    const { meso, micro } = getDepthUnitScales();
    const mesoRatio = meso / micro;

    root.style.setProperty('--catalog-cell-w', `${cellW}px`);
    root.style.setProperty('--catalog-cell-h', `${cellH}px`);
    root.style.setProperty('--catalog-cell-w-meso', `${Math.round(cellW * mesoRatio)}px`);
    root.style.setProperty('--catalog-cell-h-meso', `${Math.round(cellH * mesoRatio)}px`);
}

function siteGridCssLength({ value, unit }) {
    return `${value}${unit}`;
}

function getSiteGridColumnSpan(level = 1) {
    const spans = CONFIG.siteGrid?.contentColumns || { 1: 1, 2: 4, 3: 8 };
    return spans[level] ?? spans[1] ?? 1;
}

function getSiteGridContentColCount(level = 1) {
    const cols = CONFIG.siteGrid?.columns || 24;
    const span = getSiteGridColumnSpan(level);
    return Math.max(1, Math.floor(cols / span));
}

function siteGridSpanWidth(span) {
    if (span <= 1) return 'var(--site-grid-cell-w)';
    return `calc(${span} * var(--site-grid-cell-w) + ${span - 1} * var(--site-grid-gap))`;
}

function siteGridSpanHeight(span) {
    if (span <= 1) return 'var(--site-grid-cell-h)';
    return `calc(${span} * var(--site-grid-cell-h) + ${span - 1} * var(--site-grid-gap))`;
}

/** Resolve a site-grid CSS length token to pixels (for scroll reserve math). */
function measureSiteGridTokenPx(tokenName, property = 'height') {
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
}

function isWarehouseDockPanelEnabled(panel) {
    const panels = CONFIG.warehouse?.dock?.panels;
    if (!panels) return true;
    return panels[panel] !== false;
}

function isWarehouseDockBlocksOnly() {
    const panels = CONFIG.warehouse?.dock?.panels;
    if (!panels) return false;
    return panels.statistics === false &&
        panels.message === false &&
        panels.map === false;
}

function isWarehouseLauncherStripMode() {
    const popup = CONFIG.warehouse?.popup;
    return popup?.enabled === true && popup?.launcherStrip?.enabled === true;
}

function isWarehouseLauncherExpandDragMode() {
    const stripCfg = CONFIG.warehouse?.popup?.launcherStrip;
    return isWarehouseLauncherStripMode() && stripCfg?.expandDrag === true;
}

function isWarehouseLauncherMapEnabled() {
    const stripCfg = CONFIG.warehouse?.popup?.launcherStrip;
    if (isWarehouseLauncherStripMode() && stripCfg?.showMap) return true;
    return isWarehouseDockPanelEnabled('map');
}

function applyWarehouseLauncherStripTokens(root = document.documentElement) {
    const stripCfg = CONFIG.warehouse?.popup?.launcherStrip;
    if (!isWarehouseLauncherStripMode() || !stripCfg) return;
    const mapCols = Math.max(1, stripCfg.mapCols ?? 3);
    const expandCols = Math.max(1, stripCfg.expandCols ?? 12);
    const expandRows = Math.max(1, stripCfg.expandRows ?? 4);
    const blockCols = Math.max(1, stripCfg.blockCols ?? Math.max(1, expandCols - mapCols));
    const mapRows = Math.max(1, stripCfg.mapRows ?? 2);
    root.style.setProperty('--warehouse-launcher-expand-width', siteGridSpanWidth(expandCols));
    root.style.setProperty('--warehouse-launcher-expand-height', siteGridSpanHeight(expandRows));
    root.style.setProperty('--warehouse-launcher-map-width', siteGridSpanWidth(mapCols));
    root.style.setProperty('--warehouse-launcher-blocks-width', siteGridSpanWidth(blockCols));
    root.style.setProperty('--warehouse-launcher-map-height', siteGridSpanHeight(mapRows));
    root.style.setProperty('--warehouse-launcher-handle-band', siteGridSpanHeight(1));
    root.style.setProperty('--warehouse-launcher-blocks-pad-end', 'var(--space-20)');
    root.style.setProperty('--warehouse-launcher-blocks-shift-left', 'var(--space-10)');
    if (isWarehouseLauncherExpandDragMode()) return;
    const peekCols = Math.max(1, stripCfg.expandCols ?? 6);
    const pinCols = Math.max(1, stripCfg.pinCols ?? 8);
    const pinRows = Math.max(1, stripCfg.pinRows ?? 3);
    root.style.setProperty('--warehouse-launcher-strip-width', siteGridSpanWidth(peekCols));
    root.style.setProperty('--warehouse-launcher-pin-blocks-width', siteGridSpanWidth(pinCols));
    root.style.setProperty('--warehouse-launcher-pin-height', siteGridSpanHeight(pinRows));
    root.style.setProperty(
        '--warehouse-launcher-pin-width',
        `calc(var(--warehouse-launcher-map-width) + var(--space-10) + var(--warehouse-launcher-pin-blocks-width))`
    );
}

function applyWarehouseLauncherTokens(root = document.documentElement) {
    const size = CONFIG.warehouse?.popup?.launcherSize || { width: 80, height: 40 };
    const width = Math.max(1, size.width ?? 80);
    const height = Math.max(1, size.height ?? 40);
    const pad = Math.max(0, CONFIG.warehouse?.popup?.launcherPad ?? 5);
    root.style.setProperty('--warehouse-launcher-width', `${width}px`);
    root.style.setProperty('--warehouse-launcher-height', `${height}px`);
    root.style.setProperty('--warehouse-launcher-size', `${height}px`);
    root.style.setProperty('--warehouse-launcher-radius', `${height / 2}px`);
    root.style.setProperty('--warehouse-launcher-pad', `${pad}px`);
}

/** L1 viewport chrome below the canvas region — aligned to warehouse shell top. */
function getSiteL1BottomChromePx() {
    if (typeof ActionWarehouse !== 'undefined' &&
        ActionWarehouse.isPopupMode?.() &&
        !ActionWarehouse.isPopupOpen?.()) {
        return 0;
    }
    const wh = document.querySelector('.warehouse-shell');
    if (wh) {
        return Math.max(0, Math.ceil(window.innerHeight - wh.getBoundingClientRect().top));
    }
    return measureSiteGridTokenPx('--site-l1-bottom-chrome');
}

/** Visible canvas height on L1 — viewport minus warehouse shell chrome. */
function getSiteL1VisibleViewportHeightPx() {
    if (typeof ActionWarehouse !== 'undefined' &&
        ActionWarehouse.isPopupMode?.() &&
        !ActionWarehouse.isPopupOpen?.()) {
        return window.innerHeight;
    }
    const wh = document.querySelector('.warehouse-shell');
    if (wh) {
        return Math.max(0, wh.getBoundingClientRect().top);
    }
    const chrome = getSiteL1BottomChromePx();
    return Math.max(0, window.innerHeight - chrome);
}

/** Shell grid line position — viewport-fixed reference (padding origin). */
function siteGridLinePosition(axis, lineIndex, lineCount) {
    const cellVar = axis === 'col' ? 'var(--site-grid-cell-w)' : 'var(--site-grid-cell-h)';
    const pad = 'var(--site-grid-padding)';
    const gap = 'var(--site-grid-gap)';
    if (lineIndex <= 0) return `calc(${pad})`;
    if (lineIndex >= lineCount) {
        return `calc(${pad} + ${lineCount} * ${cellVar} + ${Math.max(0, lineCount - 1)} * ${gap})`;
    }
    return `calc(${pad} + ${lineIndex} * (${cellVar} + ${gap}))`;
}

/** Canvas-local shell line position — origin is #app content top-left (scrolls with canvas). */
function siteGridCanvasLinePosition(axis, lineIndex) {
    const cellVar = axis === 'col' ? 'var(--site-grid-cell-w)' : 'var(--site-grid-cell-h)';
    const gap = 'var(--site-grid-gap)';
    if (lineIndex <= 0) return '0px';
    return `calc(${lineIndex} * (${cellVar} + ${gap}))`;
}

/** Center of a single shell cell (canvas-local, scrolls with #app). */
function siteGridCanvasCellCenter(axis, cellIndex) {
    const cellVar = axis === 'col' ? 'var(--site-grid-cell-w)' : 'var(--site-grid-cell-h)';
    const gap = 'var(--site-grid-gap)';
    return `calc(${cellIndex} * (${cellVar} + ${gap}) + ${cellVar} / 2)`;
}

/** Center of a multi-cell shell slot (canvas-local, scrolls with #app). */
function siteGridCanvasSlotCenter(axis, slotIndex, slotSpan = 2) {
    const cellVar = axis === 'col' ? 'var(--site-grid-cell-w)' : 'var(--site-grid-cell-h)';
    const gap = 'var(--site-grid-gap)';
    const startLines = slotIndex * slotSpan;
    if (slotSpan <= 1) {
        return siteGridCanvasCellCenter(axis, startLines);
    }
    return `calc(${startLines} * (${cellVar} + ${gap}) + (${slotSpan} * ${cellVar} + ${Math.max(0, slotSpan - 1)} * ${gap}) / 2)`;
}

function measureCrossTileLineCounts() {
    const g = CONFIG.siteGrid;
    const shellCols = g?.columns || 24;
    const canvasRegion = g?.regions?.canvas;
    const shellRows = canvasRegion
        ? canvasRegion.rowEnd - canvasRegion.rowStart
        : (g?.rows || 12) - 1;
    const scrollFactor = g?.macroCanvasScrollFactor ?? 1.5;

    let colLines = Math.ceil(shellCols * scrollFactor);
    let rowLines = shellRows;

    const app = document.getElementById('app');
    if (!app?.isConnected) {
        return { colCells: Math.ceil(shellCols * scrollFactor), rowCells: shellRows };
    }

    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:var(--site-grid-cell-w);height:var(--site-grid-cell-h);';
    app.appendChild(probe);
    const cellRect = probe.getBoundingClientRect();
    probe.style.width = 'var(--site-grid-gap)';
    probe.style.height = 'auto';
    const gapRect = probe.getBoundingClientRect();
    probe.remove();

    const cellW = cellRect.width;
    const cellH = cellRect.height;
    const gap = gapRect.width;
    if (Number.isFinite(cellW) && cellW > 0 && Number.isFinite(cellH) && cellH > 0) {
        const appStyle = getComputedStyle(app);
        const padH = parseFloat(appStyle.paddingLeft) + parseFloat(appStyle.paddingRight);
        const padV = parseFloat(appStyle.paddingTop) + parseFloat(appStyle.paddingBottom);
        const contentW = Math.max(0, app.scrollWidth - padH);
        const contentH = Math.max(0, app.scrollHeight - padV);
        const stepW = cellW + gap;
        const stepH = cellH + gap;
        colLines = Math.max(colLines, Math.ceil((contentW + gap) / stepW));
        rowLines = Math.max(rowLines, Math.ceil((contentH + gap) / stepH));
    }

    return { colCells: colLines, rowCells: rowLines };
}

function syncCrossLayerSize(layer, app) {
    if (!layer || !app) return;
    const w = Math.max(app.scrollWidth, app.clientWidth);
    const h = Math.max(app.scrollHeight, app.clientHeight);
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
}

let _crossResizeObserver = null;

function bindCrossLayerResize(app) {
    if (_crossResizeObserver || typeof ResizeObserver === 'undefined' || !app) return;
    _crossResizeObserver = new ResizeObserver(() => {
        updateSiteGridCrosses({ force: true });
    });
    _crossResizeObserver.observe(app);
}

function ensureSiteGridCrossesLayer() {
    const app = document.getElementById('app');
    if (!app) return null;

    let layer = document.getElementById('site-grid-crosses');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'site-grid-crosses';
        layer.setAttribute('aria-hidden', 'true');
        layer.dataset.siteLayer = 'gridCrosses';
    }
    if (layer.parentElement !== app) {
        app.insertBefore(layer, app.firstChild);
    }
    return layer;
}

function getSiteGridViewportColCount(level = 1) {
    return getSiteGridContentColCount(level);
}

function siteGridContentColumnWidth(level) {
    const span = getSiteGridColumnSpan(level);
    const viewportCols = getSiteGridViewportColCount(level);
    const scale = CONFIG.siteGrid?.contentColumnScale?.[level] ?? 1;
    if (level === 3) {
        return `calc(${siteGridSpanWidth(span)} * ${scale})`;
    }
    const gapScale = CONFIG.siteGrid?.contentGapScale ?? 1;
    const gapVar = gapScale === 1 ? 'var(--site-grid-gap)' : 'var(--site-content-gap)';
    if (level === 2) {
        const gaps = Math.max(0, viewportCols - 1);
        return `calc(((var(--site-grid-content-w) - ${gaps} * ${gapVar}) / ${viewportCols}) * ${scale})`;
    }
    return siteGridSpanWidth(span);
}

function applySiteGridContentScale(root = document.documentElement) {
    const g = CONFIG.siteGrid;
    if (!g?.contentColumns) return;

    const span1 = getSiteGridColumnSpan(1);
    const span2 = getSiteGridColumnSpan(2);
    const span3 = getSiteGridColumnSpan(3);
    const shellCols = g.columns || 24;
    const scrollFactor = g.macroCanvasScrollFactor ?? 1.5;
    const macroCols = Math.ceil(shellCols * scrollFactor);
    const viewportMesoCols = getSiteGridViewportColCount(2);
    const viewportMicroCols = getSiteGridViewportColCount(3);
    const canvasRegion = g.regions?.canvas;
    const macroRows = canvasRegion
        ? canvasRegion.rowEnd - canvasRegion.rowStart
        : (g.rows || 12) - 1;
    const gapScale = g.contentGapScale ?? 1;
    if (gapScale !== 1) {
        root.style.setProperty('--site-content-gap', `calc(var(--site-grid-gap) * ${gapScale})`);
        root.style.setProperty('--site-micro-row-gap', 'var(--site-content-gap)');
    } else {
        root.style.removeProperty('--site-content-gap');
        root.style.setProperty('--site-micro-row-gap', 'var(--site-grid-gap)');
    }

    root.style.setProperty('--site-content-col-span-l1', String(span1));
    root.style.setProperty('--site-content-col-span-l2', String(span2));
    root.style.setProperty('--site-content-col-span-l3', String(span3));
    root.style.setProperty('--site-macro-col-count', String(macroCols));
    root.style.setProperty('--site-macro-row-count', String(macroRows));
    root.style.setProperty('--site-meso-viewport-cols', String(viewportMesoCols));
    root.style.setProperty('--site-micro-viewport-cols', String(viewportMicroCols));
    root.style.setProperty('--site-macro-cell-width', siteGridSpanWidth(span1));
    root.style.setProperty('--site-macro-row-height', 'var(--site-grid-cell-h)');
    const macroColStep = g.macroGridColStep ?? g.macroGridStep ?? 2;
    const macroRowStep = g.macroGridRowStep ?? g.macroGridStep ?? 2;
    root.style.setProperty('--site-macro-grid-col-step', String(macroColStep));
    root.style.setProperty('--site-macro-grid-row-step', String(macroRowStep));
    /* One shell row/column step per grid track; placement skips via macroGridCol/RowStep */
    root.style.setProperty(
        '--site-macro-row-stride',
        'calc(var(--site-grid-cell-h) + var(--site-grid-gap))'
    );
    root.style.setProperty(
        '--site-macro-slot-cols',
        String(Math.floor(macroCols / macroColStep))
    );
    root.style.setProperty('--site-meso-col-width', siteGridContentColumnWidth(2));
    root.style.setProperty('--site-micro-col-width', siteGridContentColumnWidth(3));
    const microMinRows = g.microNoteMinRows ?? 6;
    root.style.setProperty('--site-micro-note-min-height', siteGridSpanHeight(microMinRows));
    root.style.setProperty(
        '--note-id-sticky-inset',
        'calc((var(--site-micro-note-min-height) - 1.2em) / 2)'
    );
    root.style.setProperty(
        '--site-macro-canvas-width',
        `calc(2 * var(--site-grid-padding) + ${macroCols} * var(--site-grid-cell-w) + ${Math.max(0, macroCols - 1)} * var(--site-grid-gap))`
    );
    root.style.setProperty(
        '--site-macro-canvas-min-height',
        `calc(2 * var(--site-grid-padding) + ${macroRows} * var(--site-grid-cell-h) + ${Math.max(0, macroRows - 1)} * var(--site-grid-gap))`
    );
}

/** Minimum rows at full canvas width; require more columns than rows. */
function computeMacroGridRowCount(total, placementCols) {
    const minRows = Math.max(1, Math.ceil(total / placementCols));
    for (let rows = 1; rows <= minRows; rows++) {
        const colsInUse = Math.min(placementCols, Math.ceil(total / rows));
        if (colsInUse > rows) return rows;
    }
    return minRows;
}

/** Map note index → centered slot in the macro shell grid (wide field). */
function computeMacroGridSlot(index, total, placementCols, maxPlacementRows, colStep, rowStep) {
    let rowsUsed = computeMacroGridRowCount(total, placementCols);
    if (rowsUsed * placementCols < total) {
        rowsUsed = Math.ceil(total / placementCols);
    }

    const toGrid = (colSlot, rowSlot) => ({
        gridColumn: `${colSlot * colStep + 1} / span ${colStep}`,
        gridRow: `${rowSlot * rowStep + 1} / span ${rowStep}`
    });

    const base = Math.floor(total / rowsUsed);
    const extra = total % rowsUsed;
    let rem = index;
    for (let rowSlot = 0; rowSlot < rowsUsed; rowSlot++) {
        const count = base + (rowSlot < extra ? 1 : 0);
        if (rem < count) {
            const colOffset = Math.floor((placementCols - count) / 2);
            return toGrid(colOffset + rem, rowSlot);
        }
        rem -= count;
    }

    const colSlot = index % placementCols;
    const rowSlot = rowsUsed + Math.floor(index / placementCols);
    return toGrid(colSlot, rowSlot);
}

function siteGridRegionRect(placement) {
    const colSpan = placement.colEnd - placement.colStart;
    const rowSpan = placement.rowEnd - placement.rowStart;
    const colOffset = placement.colStart - 1;
    const rowOffset = placement.rowStart - 1;
    const cellStepW = 'calc(var(--site-grid-cell-w) + var(--site-grid-gap))';
    const cellStepH = 'calc(var(--site-grid-cell-h) + var(--site-grid-gap))';

    return {
        left: `calc(var(--site-grid-padding) + ${colOffset} * (${cellStepW}))`,
        top: `calc(var(--site-grid-padding) + ${rowOffset} * (${cellStepH}))`,
        width: `calc(${colSpan} * var(--site-grid-cell-w) + ${Math.max(0, colSpan - 1)} * var(--site-grid-gap))`,
        height: `calc(${rowSpan} * var(--site-grid-cell-h) + ${Math.max(0, rowSpan - 1)} * var(--site-grid-gap))`
    };
}

function getLayerNavHitAreaPaddingPx() {
    const btn = document.querySelector('.site-navigation-layers__title');
    if (btn) {
        const pad = parseFloat(window.getComputedStyle(btn).paddingTop);
        if (Number.isFinite(pad) && pad > 0) return pad;
    }
    return 10;
}

function isPointOverSiteNavigationUI(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

    const pad = getLayerNavHitAreaPaddingPx();

    const layerButtons = document.querySelectorAll('.site-navigation-layers__title:not(:disabled)');
    for (const btn of layerButtons) {
        const rect = btn.getBoundingClientRect();
        if (
            clientX >= rect.left - pad &&
            clientX <= rect.right + pad &&
            clientY >= rect.top - pad &&
            clientY <= rect.bottom + pad
        ) {
            return true;
        }
    }

    const layersPanel = document.getElementById('site-navigation-layers');
    if (layersPanel && window.getComputedStyle(layersPanel).pointerEvents !== 'none') {
        const rect = layersPanel.getBoundingClientRect();
        if (
            clientX >= rect.left - pad &&
            clientX <= rect.right + pad &&
            clientY >= rect.top - pad &&
            clientY <= rect.bottom + pad
        ) {
            return true;
        }
    }

    const mapsPanel = document.getElementById('site-navigation-maps');
    if (mapsPanel && window.getComputedStyle(mapsPanel).pointerEvents !== 'none') {
        const rect = mapsPanel.getBoundingClientRect();
        if (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
        ) {
            return true;
        }
    }

    const aboutRoot = document.querySelector('.site-about');
    if (aboutRoot) {
        const sheet = aboutRoot.querySelector('.site-about__sheet');
        const backdrop = aboutRoot.querySelector('.site-about__backdrop');
        const targets = [sheet, backdrop].filter(Boolean);
        for (const el of targets) {
            if (window.getComputedStyle(el).pointerEvents === 'none') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 && rect.height <= 0) continue;
            if (
                clientX >= rect.left - pad &&
                clientX <= rect.right + pad &&
                clientY >= rect.top - pad &&
                clientY <= rect.bottom + pad
            ) {
                return true;
            }
        }
    }

    return false;
}

/** Warehouse popup chrome — block canvas note hits through launcher / reset / deployed bar. */
function isPointOverWarehouseChrome(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

    const pad = 4;
    const selectors = [
        '.warehouse-launcher',
        '.warehouse-launcher-wrap',
        '.warehouse-popup-backdrop',
        '.warehouse-reset',
        '.depth-block-bar.has-blocks'
    ];

    if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.isPopupOpen?.()) {
        selectors.push('.warehouse-shell.is-popup-open');
    }

    for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
            const style = window.getComputedStyle(el);
            if (style.pointerEvents === 'none' || style.visibility === 'hidden') continue;
            if (el.classList.contains('warehouse-reset') && parseFloat(style.opacity) < 0.05) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (
                clientX >= rect.left - pad &&
                clientX <= rect.right + pad &&
                clientY >= rect.top - pad &&
                clientY <= rect.bottom + pad
            ) {
                return true;
            }
        }
    }

    return false;
}

function getSiteGridLevel() {
    if (typeof DepthController !== 'undefined' && DepthController.currentLevel) {
        return DepthController.currentLevel;
    }
    const body = document.body;
    if (body?.classList.contains('view-level-3')) return 3;
    if (body?.classList.contains('view-level-2')) return 2;
    return 1;
}

function getSiteGridActiveRegions(level = null) {
    const g = CONFIG.siteGrid;
    if (!g) return {};
    const base = { ...(g.regions || g.layers || {}) };
    const resolvedLevel = level ?? getSiteGridLevel();
    const overrides = g.regionsByLevel?.[resolvedLevel] || {};
    return { ...base, ...overrides };
}

function updateSiteGridCrosses(options = {}) {
    const g = CONFIG.siteGrid;
    if (!g || !document.body) return;

    const app = document.getElementById('app');
    const layer = ensureSiteGridCrossesLayer();
    if (!layer || !app) return;

    if (g.showGridMarks === false) {
        layer.replaceChildren();
        layer.style.display = 'none';
        return;
    }
    layer.style.removeProperty('display');

    bindCrossLayerResize(app);

    const { colCells, rowCells } = measureCrossTileLineCounts();
    const step = g.crossStep ?? 4;
    const cacheKey = `${g.columns || 24}x${g.rows || 12}s${step}t${colCells}x${rowCells}`;
    if (!options.force && layer.dataset.crossKey === cacheKey && layer.children.length > 0) return;

    layer.dataset.crossKey = cacheKey;
    layer.replaceChildren();
    syncCrossLayerSize(layer, app);
    const fragment = document.createDocumentFragment();
    for (let row = 0; row <= rowCells; row += step) {
        for (let col = 0; col <= colCells; col += step) {
            const cross = document.createElement('span');
            cross.className = 'site-grid-cross';
            cross.style.left = siteGridCanvasLinePosition('col', col);
            cross.style.top = siteGridCanvasLinePosition('row', row);
            fragment.appendChild(cross);
        }
    }
    layer.appendChild(fragment);
    requestAnimationFrame(() => syncCrossLayerSize(layer, app));
}

function applyMacroShellGridPlacement() {
    const body = document.body;
    const useShellGrid = body?.classList.contains('site-grid') &&
        body.classList.contains('view-level-1');
    const g = CONFIG.siteGrid;
    const colStep = g?.macroGridColStep ?? g?.macroGridStep ?? 2;
    const rowStep = g?.macroGridRowStep ?? g?.macroGridStep ?? 2;
    const shellCols = g?.columns || 24;
    const scrollFactor = g?.macroCanvasScrollFactor ?? 1.5;
    const gridCols = Math.ceil(shellCols * scrollFactor);
    const placementCols = Math.floor(gridCols / colStep);
    const canvasRegion = g?.regions?.canvas;
    const macroRows = canvasRegion
        ? canvasRegion.rowEnd - canvasRegion.rowStart
        : (g?.rows || 12) - 1;
    const maxPlacementRows = Math.max(1, Math.floor(macroRows / rowStep));

    const wrappers = [...document.querySelectorAll('#app .note-wrapper')];
    const total = wrappers.length;

    wrappers.forEach((wrapper, index) => {
        if (!useShellGrid || placementCols < 1) {
            wrapper.style.removeProperty('grid-column');
            wrapper.style.removeProperty('grid-row');
            return;
        }
        const slot = computeMacroGridSlot(
            index, total, placementCols, maxPlacementRows, colStep, rowStep
        );
        wrapper.style.gridColumn = slot.gridColumn;
        wrapper.style.gridRow = slot.gridRow;
    });

    updateSiteGridCrosses({ force: true });
}

function updateSiteGridDebugRegions(regionNames) {
    const enabled = !!CONFIG.siteGrid?.debug;
    let layer = document.getElementById('site-grid-debug-regions');
    if (!enabled) {
        layer?.remove();
        return;
    }
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'site-grid-debug-regions';
        layer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(layer);
    }
    layer.replaceChildren();
    regionNames.forEach((name) => {
        const div = document.createElement('div');
        div.className = 'site-grid-debug-region';
        div.dataset.siteRegion = name;
        div.style.left = `var(--site-layer-${name}-left)`;
        div.style.top = `var(--site-layer-${name}-top)`;
        div.style.width = `var(--site-layer-${name}-width)`;
        div.style.height = `var(--site-layer-${name}-height)`;
        div.textContent = name;
        layer.appendChild(div);
    });
}

function applySiteGridTokens(root = document.documentElement, level = null) {
    const g = CONFIG.siteGrid;
    if (!g) return;

    root.style.setProperty('--site-grid-cols', String(g.columns));
    root.style.setProperty('--site-grid-rows', String(g.rows));
    root.style.setProperty('--site-grid-padding', siteGridCssLength(g.padding));
    root.style.setProperty('--site-grid-gap', siteGridCssLength(g.gap));

    const regions = getSiteGridActiveRegions(level);
    for (const [name, placement] of Object.entries(regions)) {
        const rect = siteGridRegionRect(placement);
        root.style.setProperty(`--site-layer-${name}-left`, rect.left);
        root.style.setProperty(`--site-layer-${name}-top`, rect.top);
        root.style.setProperty(`--site-layer-${name}-width`, rect.width);
        root.style.setProperty(`--site-layer-${name}-height`, rect.height);
    }

    if (regions.canvas) {
        root.style.setProperty('--scroll-breathing-room', 'var(--site-layer-canvas-top)');
        root.style.setProperty('--site-canvas-page-padding-x', 'var(--site-grid-padding)');
        if (g.regions?.warehouse) {
            root.style.setProperty(
                '--site-l1-bottom-chrome',
                'calc(100vh - var(--site-layer-warehouse-top))'
            );
        } else {
            root.style.removeProperty('--site-l1-bottom-chrome');
        }
    }

    if (regions.filterFringe) {
        root.style.setProperty('--v2-fringe-width', 'var(--site-layer-filterFringe-width)');
    }

    updateSiteGridDebugRegions(Object.keys(regions));
    updateSiteGridCrosses();

    applySiteGridContentScale(root);

    applyWarehouseLauncherTokens(root);
    applyWarehouseLauncherStripTokens(root);

    applyMacroShellGridPlacement();

    if (document.body) {
        document.body.classList.add('site-grid');
        document.body.classList.toggle('is-site-grid-debug', !!g.debug);
    }
}

function applyTypographyTokens() {
    const root = document.documentElement;
    const t = TYPE_SCALE;
    root.style.setProperty('--type-display-size', `${t.display.sizeRem}rem`);
    root.style.setProperty('--type-body-size', `${t.body.sizeRem}rem`);
    root.style.setProperty('--type-meta-size', `${t.meta.sizeRem}rem`);
    root.style.setProperty('--type-ui-size', `${t.ui.sizeRem}rem`);
    root.style.setProperty('--type-nav-size', `${t.nav.sizeRem}rem`);
    root.style.setProperty('--type-debug-size', `${t.debug.sizePx}px`);
}

function applyVisualScaleTokens() {
    applyTypographyTokens();
    const root = document.documentElement;
    const mesoTags = CONFIG.meso.tagMarkers;
    const { meso, micro } = getDepthUnitScales();
    const mesoZoom = getNoteZoomMeso();

    root.style.setProperty('--dot-size', `${scale(10)}px`);
    const dotRenderScale = CONFIG.outlines?.renderScale ?? 1;
    root.style.setProperty('--dot-render-size', `${scale(10 * dotRenderScale)}px`);
    root.style.setProperty('--warehouse-block-dot', '10px');
    root.style.setProperty('--tag-dot-size', `${scale(8)}px`);
    root.style.setProperty('--meso-tag-gap', `${mesoTags.gap}px`);
    if (!CONFIG.siteGrid?.regions?.canvas) {
        root.style.setProperty('--scroll-breathing-room', `${CONFIG.navigation.contentPadding}px`);
    }
    root.style.setProperty(
        '--catalog-block-anchor-opacity',
        String(CONFIG.depth.catalogBlockAnchorOpacity ?? 0.42)
    );
    root.style.setProperty(
        '--macro-meso-scale',
        String(CONFIG.depth.macroMesoMasterScale ?? 0.028)
    );
    root.style.setProperty('--depth-meso-unit-scale', String(meso / micro));
    root.style.setProperty('--depth-meso-legacy-zoom', String(getLegacyMesoZoom()));
    root.style.setProperty('--note-zoom-meso', String(mesoZoom));
    root.style.setProperty('--note-zoom-micro', String(CONFIG.depth.noteZoomMicro ?? 1));
    applyCatalogCellTokens(root);
    applyMesoAnchorTokens(root);
}

function isShowReelEnabled() {
    const params = new URLSearchParams(location.search);
    if (params.has('showReel')) {
        const val = params.get('showReel');
        if (val === '0' || val === 'false') return false;
        return true;
    }

    const cfg = CONFIG.showReel?.enabled;
    if (cfg === true) return true;
    if (cfg === false) return false;

    return isPresentationMode();
}

function isShowReelAutostart() {
    const params = new URLSearchParams(location.search);
    return params.get('showReel') === 'autostart';
}

function isPresentationMode() {
    if (CONFIG.presentation?._resolved != null) return CONFIG.presentation._resolved;

    const params = new URLSearchParams(location.search);
    if (params.has('presentation')) {
        return params.get('presentation') !== '0';
    }

    const cfg = CONFIG.presentation?.enabled;
    if (cfg === true) return true;
    if (cfg === false) return false;

    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(location.origin)) return true;

    const mem = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;
    if (typeof mem === 'number' && mem <= 8) return true;
    if (typeof cores === 'number' && cores <= 4) return true;

    return false;
}

function applyPresentationProfile() {
    const on = isPresentationMode();
    CONFIG.presentation._resolved = on;
    if (!on) return;

    const p = CONFIG.presentation;
    CONFIG.physics.hullCollision.shellPasses = p.hullCollisionShellPasses ?? 1;
    if (CONFIG.physics.forces && p.wanderScale) {
        CONFIG.physics.forces.wanderStrength *= p.wanderScale;
    }
    const smooth = CONFIG.physics.targetSmoothing;
    if (smooth) {
        if (p.singleBlockLerp) smooth.singleBlock = p.singleBlockLerp;
        if (p.multiBlockLerp) smooth.multiBlock = p.multiBlockLerp;
        if (p.stretchedLerp) smooth.stretched = p.stretchedLerp;
        if (p.captureChase) smooth.captureChase = p.captureChase;
    }
    const forces = CONFIG.physics.forces;
    if (forces) {
        if (p.capturePullFloor) forces.capturePullFloor = p.capturePullFloor;
        if (p.blockAttractionScale) {
            const s = p.blockAttractionScale;
            forces.blockAttractionSingle *= s;
            forces.blockAttractionMulti *= s;
            forces.blockAttractionStretch *= s;
        }
    }
    const motion = CONFIG.physics.motion;
    if (motion) {
        if (p.captureTransitMaxSpeed) motion.transitMaxSpeed = p.captureTransitMaxSpeed;
        if (p.singleBlockCaptureDamping) motion.singleBlockCaptureDamping = p.singleBlockCaptureDamping;
        if (p.multiBlockDamping) motion.multiBlockDamping = p.multiBlockDamping;
        if (p.nearDamping) motion.nearDamping = p.nearDamping;
    }
    const body = CONFIG.physics.body;
    if (body) {
        if (p.bodyRestitution != null) body.restitution = p.bodyRestitution;
        if (p.bodyFrictionAir != null) body.frictionAir = p.bodyFrictionAir;
    }
    const linkage = CONFIG.warehouse?.linkage;
    if (linkage && p.siblingDamping) linkage.siblingDamping = p.siblingDamping;
    if (smooth && p.dragBlockLerp) smooth.dragBlock = p.dragBlockLerp;
    if (p.cooldownDelayMs && CONFIG.depth) {
        CONFIG.depth.cooldownDelay = p.cooldownDelayMs;
    }
    if (p.mesoBuildBatchSize && CONFIG.meso) {
        CONFIG.meso.buildBatchSize = p.mesoBuildBatchSize;
    }
    const orbit = CONFIG.warehouse?.orbit;
    if (orbit && p.orbitRelaxScale) {
        orbit.moleculeRelaxIterations = Math.max(
            8,
            Math.floor(orbit.moleculeRelaxIterations * p.orbitRelaxScale)
        );
        orbit.clusterRelaxIterations = Math.max(
            6,
            Math.floor(orbit.clusterRelaxIterations * p.orbitRelaxScale)
        );
    }

    const meso = CONFIG.depth?.v2?.meso;
    if (meso) {
        if (p.mockShaderLiveHover === false) meso.mockShaderLiveHover = false;
        if (p.mockShaderLiveFps) meso.mockShaderLiveFps = p.mockShaderLiveFps;
        if (p.mockP5TextureOverscale) meso.mockP5TextureOverscale = p.mockP5TextureOverscale;
        if (p.mockCanvasScale) meso.mockCanvasScale = p.mockCanvasScale;
    }

    const navMap = CONFIG.navigationMap;
    if (navMap) {
        if (p.macroRefreshMsBlock) navMap.macroRefreshMsBlock = p.macroRefreshMsBlock;
        if (p.macroDotStride) navMap.macroDotStride = p.macroDotStride;
        if (p.depthMapMaxCollect) navMap.depthMapMaxCollect = p.depthMapMaxCollect;
    }

    const openingBg = CONFIG.opening?.background;
    if (openingBg) {
        openingBg.dotMotion = false;
        openingBg.maxDpr = 1;
        if (typeof openingBg.blobCount === 'number') {
            openingBg.blobCount = Math.min(openingBg.blobCount, 20);
        }
        if (typeof openingBg.pillCount === 'number') {
            openingBg.pillCount = Math.min(openingBg.pillCount, 4);
        }
        if (!openingBg.repaintThrottleMs) {
            openingBg.repaintThrottleMs = 56;
        }
    }

    document.documentElement.classList.add('is-presentation');
    if (document.body) document.body.classList.add('is-presentation');

    console.info('Presentation mode: on (exhibition performance profile)');
}

applyPresentationProfile();

