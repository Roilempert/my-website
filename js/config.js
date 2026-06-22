/* ==========================================================================
   00. GLOBAL CONFIGURATION
   Central control panel. All tunable parameters live here.
   ========================================================================== */
const VISUAL_SCALE = 0.72;
const scale = (px) => Math.round(px * VISUAL_SCALE);

const CONFIG = {
    visualScale: VISUAL_SCALE,

    /* --- Data Sources (published Google Sheets, CSV format) --- */
    data: {
        urls: {
            main: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7yUXgr2RmRgAg9hWSPesVZsqkROq-PedKOh6KpERDO9HcC5ru11oobFPN8Mhsnruw26JKe4peAIFT/pub?gid=693502086&single=true&output=csv',
            tags: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7yUXgr2RmRgAg9hWSPesVZsqkROq-PedKOh6KpERDO9HcC5ru11oobFPN8Mhsnruw26JKe4peAIFT/pub?gid=946159072&single=true&output=csv'
        },
        // Column indices in the main CSV (zero-based)
        columns: {
            authorCode: 2,
            id: 4,
            title: 6,
            body: 7,
            tags: 8
        },
        fallbackTagColor: 'var(--main-text)'
    },

    /* --- Boot Sequence --- */
    boot: {
        physicsBuildDelay: 350,     // ms to wait after render before building the physics world
        idleRefreshMs: 0 // 0 = disabled; set e.g. 3 * 60 * 1000 for kiosk idle reload
    },

    /* --- Depth Controller (Z-axis zoom levels) --- */
    depth: {
        initialLevel: 1,            // level shown on load (1 = macro / physics view)
        minLevel: 1,
        maxLevel: 3,
        cooldownDelay: 1200,        // ms between accepted wheel gestures
        wheelThreshold: 15,         // minimal |deltaY| to register a zoom intent
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
        depthEngine: 'v2',              // 'v2' = גרידים פשוטים חדשים | 'legacy' = מנוע קטלוג/מעברים
        layoutMode: 'legacy-grid',       // פעיל רק כש-depthEngine === 'legacy'
        noteClickPath: 'direct-l3',      // 'direct-l3' | 'l2-preview-then-l3'
        clickDragThreshold: 6,           // px — below = click navigate, above = drag
        moleculeClickPadding: 16,        // px — extra hit area around hull for L1 note click
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
                /* Unified L2 fill — p5 mandala bake + per-line slice (see depth-v2.md) */
                mockGradientMode: 'p5',
                mockP5Scale: 0.85,
                mockP5MandalaFit: 1.0,
                mockP5TagFit: 3.2,
                mockP5SymmetricLayout: 1,
                mockP5SymmetryCount: 8,
                mockP5ShapeBreak: 0.35,
                mockP5RingDistJitter: 0.04,
                mockP5RingAngleJitter: 0.02,
                mockP5CircleSquash: 0.12,
                mockP5BlendFactor: 0.35,
                mockP5Falloff: 4.0,
                mockP5ColorEdgeSoft: 0.008,
                mockP5ColorEdgeCore: 0.055,
                mockP5ColorSharpness: 2.0,
                mockP5ColorSatBoost: 1.8,
                mockP5ColorEnrich: 0.28,
                mockFocusMutedColor: '#d6d6d6',
                mockFocusMutedGrayMin: 196,
                mockFocusMutedGrayMax: 232,
                mockFocusMutedDesat: 0.94,
                mockP5BoundaryGlow: 0.35,
                mockP5MaskSoft: 0.2,
                mockP5SharpChance: 0.25,
                mockP5SharpFalloff: 6.5,
                mockP5SharpBlendK: 0.24,
                mockP5SeamChance: 0.32,
                mockP5SeamStrength: 1.4,
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
                colGap: 12,
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
                orbitRadius: 72
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
            // Single uniform scale derived from micro (.note-title / .note-body) ratios
            const uniformScale = 0.18;
            const titleSizeBoost = 1.65;
            const micro = { titleSize: 66, titleLine: 0.9, bodySize: 16, bodyLine: 1.2 };
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
        edgeThreshold: scale(150),    // px from viewport edge where auto-scroll activates
        maxSpeed: 12,               // px per frame at the very edge
        bottomEdgeThreshold: scale(60),
        bottomMaxSpeed: 5,
        contentPadding: scale(120), // px; breathing room kept around content when clamping the scroll
        pan: {
            minDrag: 2                // px before pan engages (ignores micro-jitter)
        },
        spacePanKey: 'Space'
    },

    /* --- Artifact Inspector (focus/isolation overlay) --- */
    inspector: {
        closeDuration: 350          // ms; must match the CSS transition on .note-wrapper
    },

    /* --- Physics Engine (Matter.js) --- */
    physics: {
        gravity: { x: 0, y: 0 },

        // Per-body properties
        body: {
            radius: scale(11),      // collider (px); slightly larger than visual dot for separation
            frictionAir: 0.1,
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
            blockAttractionSingle: 0.0002,
            blockAttractionMulti: 0.00012,
            blockAttractionStretch: 0.00042,
            workspaceBankAttraction: 0.00055,
            captureSettleRadius: scale(40),
            capturePullFloor: 0.3,
            maxPullDistance: scale(240),
            wanderStrength: 0.00004,
            wanderSpeed: 0.02
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
            transitMaxSpeed: 7.5,
            nearJitterSpeed: 0.35,
            nearDamping: 0.35,
            multiBlockDamping: 0.58,
            singleBlockCaptureDamping: 0.5, // damp captured dots when one block is active
            workspaceBankDamping: 0.38,   // grid-side molecules when workspace is active
            workspaceBankHullScale: 0.25,   // softer hull resolve between bank-only molecules
            workspaceBankDriftRadius: scale(28),
            workspaceBankPinLerp: 0.2,
            snapRadius: scale(5),       // zero velocity when hugging target
            snapRadiusCaptured: scale(10)
        },

        targetSmoothing: {
            singleBlock: 0.18,
            multiBlock: 0.1,
            dragBlock: 0.28,
            stretched: 1,
            stretchJumpReset: scale(55)
        },

        // Reserved — crowded taper disabled; 1–N blocks share the same physics path
        crowdedBlock: {
            forceScale: [1, 1, 1, 1, 0.9, 0.82, 0.76],
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
        blockGlyphSize: 12,         // px; colored tag circle inside the pill
        // Block cap — policy: docs/block-cap-policy.md (hard limit 5; kinematic at 6+ deferred)
        maxCaptureBlocks: 5,

        dock: {
            widthRatio: 0.5,
            bottomOffset: 12,
            borderRadius: 22,
            outlineWidth: 1,
            visibleRows: 2,
            rowGap: 6
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
            siblingStiffness: 0.004,
            stretchStiffnessFactor: 0.45,   // softer internal springs while stretched — cluster elongates naturally
            stretchLengthSlack: 1.10,       // constraint rest length multiplier while stretched
            siblingDamping: 0.22,
            siblingLength: scale(24),
            maxLinksPerDot: 3,
            homeFactorWhenCaptured: 0,
            line: {
                visible: false,
                cssColorVariable: '--main-text',
                width: 0.2 * (96 / 72),
                maxVisibleDistance: scale(90)
            }
        },

        returnDuration: 350,

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
        padding: scale(7),         // px between a dot's edge and the outline membrane
        width: 0.2 * (96 / 72),
        hoverWidth: 0.55 * (96 / 72)
    }
};

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

function applyVisualScaleTokens() {
    const root = document.documentElement;
    const mesoTags = CONFIG.meso.tagMarkers;
    const { meso, micro } = getDepthUnitScales();
    const mesoZoom = getNoteZoomMeso();

    root.style.setProperty('--dot-size', `${scale(10)}px`);
    root.style.setProperty('--warehouse-block-dot', '10px');
    root.style.setProperty('--tag-dot-size', `${scale(8)}px`);
    root.style.setProperty('--meso-tag-gap', `${mesoTags.gap}px`);
    root.style.setProperty('--scroll-breathing-room', `${CONFIG.navigation.contentPadding}px`);
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

