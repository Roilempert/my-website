/* ==========================================================================
   07. PHYSICS ENGINE (MATTER.JS - CLUSTER DYNAMICS)
   ========================================================================== */
const PhysicsEngine = {
    engine: null,
    runner: null,
    bodiesData: [],
    siblingLinks: [],
    noteCenters: [],
    linkCanvas: null,
    linkCtx: null,
    isActive: false,
    
    mouseWorldX: -1000, 
    mouseWorldY: -1000,
    time: 0,
    mouseClientX: 0,
    mouseClientY: 0,
    hoveredNoteIndex: -1,
    lastCanvasHoverIndex: -2,
    moleculeHoverPinnedIndex: -1,
    repulsionHoldNoteIndex: -1,
    moleculeClickIntent: null,
    transitionFrozen: false,
    aboutFrozen: false,
    runnerEnabled: false,
    syncLoopLastTs: 0,
    navPhysicsTickLastTs: 0,
    renderStepTs: 0,

    setTransitionFrozen(value) {
        this.transitionFrozen = !!value;
    },

    setMacroPhysicsActive(active) {
        if (!this.runner || !this.engine) return;
        const shouldRun = !!active;
        if (shouldRun === this.runnerEnabled) return;
        if (shouldRun) {
            Matter.Runner.run(this.runner, this.engine);
        } else {
            Matter.Runner.stop(this.runner);
        }
        this.runnerEnabled = shouldRun;
    },

    shouldThrottleMacroCanvas() {
        if (CONFIG.presentation?.displayInterp) return false;
        if (typeof isPresentationMode !== 'function' || !isPresentationMode()) return false;
        const targetFps = CONFIG.presentation?.targetFps ?? 0;
        if (!targetFps || targetFps >= 60) return false;
        const minDelta = 1000 / targetFps;
        const now = performance.now();
        if (now - this.syncLoopLastTs < minDelta) return true;
        this.syncLoopLastTs = now;
        return false;
    },

    captureRenderSnapshot() {
        const now = performance.now();
        this.bodiesData.forEach(item => {
            if (!item.body) return;
            const x = item.body.position.x;
            const y = item.body.position.y;
            if (item._renderToX == null) {
                item._renderFromX = x;
                item._renderFromY = y;
            } else {
                item._renderFromX = item._renderToX;
                item._renderFromY = item._renderToY;
            }
            item._renderToX = x;
            item._renderToY = y;
        });
        this.renderStepTs = now;
    },

    getBreathingOffset(item) {
        const cfg = CONFIG.physics?.breathing;
        if (!cfg?.enabled || !this.isActive || this.transitionFrozen) return null;
        if (item.isFiltered || item.isFilterExiting) return null;

        let amp = cfg.amplitude ?? scale(1.8);
        if (item.overrideTarget) {
            amp *= cfg.capturedScale ?? 0.2;
        } else if (item.onBankGrid) {
            amp *= cfg.bankScale ?? 0.65;
        }

        const t = performance.now() * 0.001;
        const phase = item.noteIndex * 2.399;
        const speed = cfg.speed ?? 0.55;
        const vRatio = cfg.verticalRatio ?? 0.82;
        return {
            x: Math.sin(t * speed + phase) * amp,
            y: Math.cos(t * speed * 0.87 + phase * 1.37) * amp * vRatio
        };
    },

    getDisplayPosition(item) {
        const body = item.body;
        if (!body) return null;

        const useInterp = typeof isPresentationMode === 'function' &&
            isPresentationMode() &&
            CONFIG.presentation?.displayInterp !== false &&
            item._renderToX != null;

        if (!useInterp) {
            return { x: body.position.x, y: body.position.y };
        }

        const physFps = CONFIG.presentation?.physicsFps ?? 30;
        const stepMs = 1000 / physFps;
        const sinceStep = performance.now() - (this.renderStepTs || 0);
        let alpha = Math.min(1, sinceStep / stepMs);
        alpha = alpha * alpha * (3 - 2 * alpha);

        return {
            x: item._renderFromX + (item._renderToX - item._renderFromX) * alpha,
            y: item._renderFromY + (item._renderToY - item._renderFromY) * alpha
        };
    },

    getItemDrawPosition(item) {
        const pos = this.getDisplayPosition(item);
        if (!pos) {
            const body = item.body;
            return body ? { x: body.position.x, y: body.position.y } : null;
        }
        const breath = this.getBreathingOffset(item);
        if (!breath) return pos;
        return { x: pos.x + breath.x, y: pos.y + breath.y };
    },

    init() {
        if (typeof Matter === 'undefined') {
            console.error(
                'Matter.js did not load (vendor/matter.min.js missing or failed). Physics is disabled — serve over HTTP from the project folder.'
            );
            return;
        }

        this.engine = Matter.Engine.create();
        this.engine.world.gravity.x = CONFIG.physics.gravity.x;
        this.engine.world.gravity.y = CONFIG.physics.gravity.y;

        this.initLinkCanvas();

        window.addEventListener('mousemove', (e) => {
            this.mouseWorldX = e.pageX;
            this.mouseWorldY = e.pageY;
            this.mouseClientX = e.clientX;
            this.mouseClientY = e.clientY;
            if (DepthController.currentLevel === 1 && this.bodiesData.length > 0) {
                this.updateMoleculeHoverState();
            }
        });

        this.initMoleculePointer();

        this.moleculeHoverTitle = document.createElement('div');
        this.moleculeHoverTitle.className = 'molecule-hover-title';
        this.moleculeHoverTitle.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.moleculeHoverTitle);

        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                AppState.centerViewport();
                this.resizeLinkCanvas();
                this.buildWorld();
            }, CONFIG.physics.resizeDebounce);
        });

        Matter.Events.on(this.engine, 'beforeUpdate', () => {
            if (this.transitionFrozen) return;
            if (DepthController.currentLevel !== 1 || !this.isActive) return;

            const count = this.bodiesData.length;
            if (count === 0) return;

            const forcesCfg = CONFIG.physics.forces;
            const mouseCfg = CONFIG.physics.mouse;

            this.time += forcesCfg.wanderSpeed;

            // Warehouse: refresh block positions, block-to-block forces, orbit targets
            ActionWarehouse.tick(this.bodiesData, this.time);

            const captureBlockCount = ActionWarehouse.getCrowdedBlockCount();
            const blocksOnSurface = captureBlockCount > 0;
            const kinematicCapture = ActionWarehouse.isKinematicCaptureMode(captureBlockCount);

            // Notes with at least one captured dot: siblings nearly let go of home,
            // so the sibling springs can drag the whole cluster toward the block
            const capturedNotes = new Set();
            this.bodiesData.forEach(item => {
                if (item.overrideTarget) capturedNotes.add(item.noteIndex);
            });
            const homeFactor = CONFIG.warehouse.linkage.homeFactorWhenCaptured;

            // When any block is out of the dock, homes switch to the workspace grid
            const altCenters = ActionWarehouse.workspaceCenters;

            this.bodiesData.forEach(item => {
                if (item.isFiltered || item.isFilterExiting) return;
                if (item.onBankGrid) return;
                if (kinematicCapture && item.overrideTarget) return;

                const rawTarget = item.overrideTarget;
                const isStretchedNote = ActionWarehouse.stretchedNotes.has(item.noteIndex);
                if (isStretchedNote && rawTarget && captureBlockCount >= 2) return;

                const smoothTarget = item.smoothTarget;
                const smoothLag = rawTarget && smoothTarget
                    ? Math.hypot(rawTarget.x - smoothTarget.x, rawTarget.y - smoothTarget.y)
                    : 0;
                const jumpReset = CONFIG.physics.targetSmoothing.stretchJumpReset;
                const rawJumpThreshold = captureBlockCount >= 2 ? jumpReset : jumpReset * 0.35;
                const useRawTarget = rawTarget && (
                    isStretchedNote
                        ? captureBlockCount < 2
                        : captureBlockCount < 2 && smoothLag > rawJumpThreshold
                );
                let pullTarget = useRawTarget
                    ? rawTarget
                    : (rawTarget && smoothTarget ? smoothTarget : rawTarget);
                if (rawTarget && smoothTarget && !useRawTarget && !isStretchedNote) {
                    const bodyDist = Math.hypot(
                        rawTarget.x - item.body.position.x,
                        rawTarget.y - item.body.position.y
                    );
                    const far = scale(60);
                    const near = scale(14);
                    const span = Math.max(scale(8), far - near);
                    const t = Math.max(0, Math.min(1, (bodyDist - near) / span));
                    const chase = CONFIG.physics.targetSmoothing.captureChase ?? 0.38;
                    pullTarget = {
                        x: smoothTarget.x + (rawTarget.x - smoothTarget.x) * t * chase,
                        y: smoothTarget.y + (rawTarget.y - smoothTarget.y) * t * chase
                    };
                }
                if (rawTarget && captureBlockCount === 5 && !isStretchedNote && smoothTarget) {
                    const bodyOrbit = Math.hypot(
                        rawTarget.x - item.body.position.x,
                        rawTarget.y - item.body.position.y
                    );
                    if (bodyOrbit > scale(36)) {
                        pullTarget = rawTarget;
                    }
                }
                if (pullTarget && captureBlockCount >= 5 && !isStretchedNote && !kinematicCapture) {
                    const block = ActionWarehouse.getOrbitAnchorBlock(item);
                    if (block) {
                        pullTarget = ActionWarehouse.clampTargetToBlockRing(
                            pullTarget.x, pullTarget.y, block
                        );
                    }
                }
                const target = pullTarget;
                let pull = target
                    ? (isStretchedNote
                        ? forcesCfg.blockAttractionStretch
                        : (captureBlockCount >= 2
                            ? forcesCfg.blockAttractionMulti
                            : (rawTarget
                                ? forcesCfg.blockAttractionSingle
                                : forcesCfg.blockAttraction)))
                    : forcesCfg.attraction;

                const stretchBinding = isStretchedNote
                    ? ActionWarehouse.stretchBindingByNote.get(item.noteIndex)
                    : null;
                const isStretchAnchor = stretchBinding && (
                    stretchBinding.mode === 'multi'
                        ? stretchBinding.anchors.some(a => a.dot === item)
                        : (item === stretchBinding.dotA || item === stretchBinding.dotB)
                );

                if (isStretchAnchor) {
                    pull *= CONFIG.warehouse.orbit.stretchAnchorPullBoost;
                }
                if (isStretchedNote && captureBlockCount >= 2) {
                    pull *= 0.72;
                }
                if (captureBlockCount >= 2) {
                    pull *= ActionWarehouse.getCrowdedForceScale(captureBlockCount);
                }

                let targetX, targetY;

                if (target) {
                    targetX = target.x;
                    targetY = target.y;
                } else if (capturedNotes.has(item.noteIndex)) {
                    // Sibling of a captured dot: no home pull, the springs carry it
                    pull = forcesCfg.attraction * homeFactor;
                    targetX = item.body.position.x;
                    targetY = item.body.position.y;
                } else if (altCenters && altCenters[item.noteIndex]) {
                    targetX = altCenters[item.noteIndex].x + item.offsetX;
                    targetY = altCenters[item.noteIndex].y + item.offsetY;
                } else {
                    targetX = item.physicsTargetX;
                    targetY = item.physicsTargetY;
                }

                const dx = targetX - item.body.position.x;
                const dy = targetY - item.body.position.y;

                // Cap the effective distance: far dots glide at constant force
                // instead of being yanked (force grows linearly only up close)
                const targetDist = Math.sqrt(dx * dx + dy * dy);
                const distScale = targetDist > forcesCfg.maxPullDistance
                    ? forcesCfg.maxPullDistance / targetDist : 1;

                // Soft landing: captured dots ease off pull as they reach orbit slot
                if (rawTarget && !isStretchedNote && targetDist < forcesCfg.captureSettleRadius) {
                    const settleT = targetDist / forcesCfg.captureSettleRadius;
                    const settleMul = forcesCfg.capturePullFloor +
                        (1 - forcesCfg.capturePullFloor) * settleT;
                    pull *= settleMul;
                }

                let forceX = dx * pull * distScale;
                let forceY = dy * pull * distScale;

                // Stretched molecules: soft bias toward chord center (siblings only — anchors reach blocks)
                if (isStretchedNote && !isStretchAnchor) {
                    const axis = ActionWarehouse.stretchAxisByNote.get(item.noteIndex);
                    const binding = ActionWarehouse.stretchBindingByNote.get(item.noteIndex);
                    const orbitCfg = CONFIG.warehouse.orbit;
                    if (axis && binding) {
                        const tcx = axis.mode === 'multi'
                            ? axis.cx + axis.px * binding.slotLane
                            : axis.bA.bodyX + axis.ux * axis.centerAlong + axis.px * binding.slotLane;
                        const tcy = axis.mode === 'multi'
                            ? axis.cy + axis.py * binding.slotLane
                            : axis.bA.bodyY + axis.uy * axis.centerAlong + axis.py * binding.slotLane;
                        const cdx = tcx - item.body.position.x;
                        const cdy = tcy - item.body.position.y;
                        const cDist = Math.hypot(cdx, cdy) || 1;
                        const cScale = cDist > forcesCfg.maxPullDistance
                            ? forcesCfg.maxPullDistance / cDist : 1;
                        const centerPull = forcesCfg.blockAttractionStretch *
                            orbitCfg.stretchCenterBias *
                            (captureBlockCount >= 2 ? 0.65 : 1);
                        forceX += cdx * centerPull * cScale;
                        forceY += cdy * centerPull * cScale;
                    }
                }

                // Stretched siblings without their own anchor: gentle pull toward chord midpoint
                if (isStretchedNote && !rawTarget) {
                    const axis = ActionWarehouse.stretchAxisByNote.get(item.noteIndex);
                    if (axis) {
                        const midX = axis.mode === 'multi' ? axis.cx : axis.midX;
                        const midY = axis.mode === 'multi' ? axis.cy : axis.midY;
                        const mdx = midX - item.body.position.x;
                        const mdy = midY - item.body.position.y;
                        const midPull = forcesCfg.blockAttractionStretch * 0.35;
                        const midDist = Math.hypot(mdx, mdy) || 1;
                        const midScale = midDist > forcesCfg.maxPullDistance
                            ? forcesCfg.maxPullDistance / midDist : 1;
                        forceX += mdx * midPull * midScale;
                        forceY += mdy * midPull * midScale;
                    }
                }

                if (!capturedNotes.has(item.noteIndex) && !blocksOnSurface) {
                    const wanderX = Math.sin(this.time + item.cssOriginX) * forcesCfg.wanderStrength;
                    const wanderY = Math.cos(this.time + item.cssOriginY) * forcesCfg.wanderStrength;
                    forceX += wanderX;
                    forceY += wanderY;
                }

                const mDx = item.body.position.x - this.mouseWorldX;
                const mDy = item.body.position.y - this.mouseWorldY;
                const distSq = (mDx * mDx) + (mDy * mDy);
                const interactionRadius = mouseCfg.interactionRadius;
                const holdNote = this.repulsionHoldNoteIndex;

                if (item.noteIndex !== holdNote &&
                    distSq < (interactionRadius * interactionRadius) && distSq > 0) {
                    const distance = Math.sqrt(distSq);
                    const repulsionStrength = mouseCfg.repulsionStrength *
                        (1 - (distance / interactionRadius));
                    forceX += (mDx / distance) * repulsionStrength;
                    forceY += (mDy / distance) * repulsionStrength;
                }

                Matter.Body.applyForce(item.body, item.body.position, { x: forceX, y: forceY });
            });
        });

        Matter.Events.on(this.engine, 'afterUpdate', () => {
            if (DepthController.currentLevel !== 1 || !this.isActive) return;

            ActionWarehouse.tickWorkspaceGridRush(this.bodiesData);

            const blockCount = ActionWarehouse.getCrowdedBlockCount();
            const hasStretch = ActionWarehouse.stretchedNotes.size > 0;
            const pres = typeof isPresentationMode === 'function' && isPresentationMode();
            const passCap = CONFIG.presentation?.physicsPassCapAtBlocks ?? 0;
            let passes = hasStretch ? 2 : 1;
            if (pres && passCap > 0 && blockCount >= passCap && !hasStretch) {
                passes = 1;
            }

            const molecules = this.buildMoleculeHulls();

            for (let pass = 0; pass < passes; pass++) {
                if (molecules.length > 1) {
                    this.resolveSharedStretchGroupOverlaps(molecules);
                    this.resolveOutlineShellCollisions(molecules);
                }
                if (molecules.length > 0) {
                    this.resolveBlockHullOverlaps(molecules);
                    this.resolveDotBlockOverlaps();
                }
            }

            this.syncStretchSiblingSprings();
            this.applyStretchKinematicFollow();
            this.applyKinematicCaptureFollow();
            this.applyMotionSettling();

            if (typeof NavigationMap !== 'undefined') {
                const throttleMs = (pres && CONFIG.presentation?.navMapPhysicsThrottleMs)
                    ? CONFIG.presentation.navMapPhysicsThrottleMs
                    : 0;
                if (throttleMs > 0) {
                    const now = performance.now();
                    if (now - this.navPhysicsTickLastTs >= throttleMs) {
                        this.navPhysicsTickLastTs = now;
                        NavigationMap.notifyPhysicsTick();
                    }
                } else {
                    NavigationMap.notifyPhysicsTick();
                }
            }

            this.captureRenderSnapshot();
        });

        this.runner = Matter.Runner.create(
            (typeof isPresentationMode === 'function' && isPresentationMode())
                ? {
                    delta: 1000 / (CONFIG.presentation?.physicsFps ?? 30),
                    isFixed: true
                }
                : undefined
        );
        const startRunner = typeof DepthController === 'undefined' ||
            DepthController.currentLevel === 1;
        if (startRunner) {
            Matter.Runner.run(this.runner, this.engine);
            this.runnerEnabled = true;
        } else {
            this.runnerEnabled = false;
        }

        this.syncLoop();
    },

    // Live molecule hulls for broad-phase + block clearance
    buildMoleculeHulls() {
        const bodyR = CONFIG.physics.body.radius;
        const pad = CONFIG.outlines.padding;
        const orbitCfg = CONFIG.warehouse.orbit;
        const groups = new Map();

        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;
            if (!groups.has(item.noteIndex)) {
                groups.set(item.noteIndex, { noteIndex: item.noteIndex, dots: [], cx: 0, cy: 0 });
            }
            const group = groups.get(item.noteIndex);
            group.dots.push(item);
            group.cx += item.body.position.x;
            group.cy += item.body.position.y;
        });

        return [...groups.values()].map(group => {
            const n = group.dots.length;
            group.cx /= n;
            group.cy /= n;

            let liveReach = 0;
            group.dots.forEach(d => {
                liveReach = Math.max(
                    liveReach,
                    Math.hypot(d.body.position.x - group.cx, d.body.position.y - group.cy)
                );
            });
            const extent = ActionWarehouse.noteMoleculeExtent(
                this.bodiesData, group.noteIndex, orbitCfg
            );
            group.radius = Math.max(extent, liveReach + bodyR + pad);
            return group;
        });
    },

    resolveSharedStretchGroupOverlaps(molecules) {
        const hullCfg = CONFIG.physics.hullCollision;
        const stretched = ActionWarehouse.stretchedNotes;

        for (let i = 0; i < molecules.length; i++) {
            for (let j = i + 1; j < molecules.length; j++) {
                const a = molecules[i];
                const b = molecules[j];
                if (!stretched.has(a.noteIndex) || !stretched.has(b.noteIndex)) continue;

                const bindA = ActionWarehouse.stretchBindingByNote.get(a.noteIndex);
                const bindB = ActionWarehouse.stretchBindingByNote.get(b.noteIndex);
                const keyA = bindA ? ActionWarehouse.getStretchGroupKey(bindA) : '';
                const keyB = bindB ? ActionWarehouse.getStretchGroupKey(bindB) : '';
                if (keyA && keyA === keyB) {
                    this.resolveSharedStretchOverlap(a, b, hullCfg);
                }
            }
        }
    },

    // Hard per-dot outline shell — body-only, never touches orbit targets
    resolveOutlineShellCollisions(molecules) {
        const hullCfg = CONFIG.physics.hullCollision;
        const bodyR = CONFIG.physics.body.radius;
        const shellR = bodyR + CONFIG.outlines.padding;
        const minDist = shellR * 2 + hullCfg.dotGap;
        const broadGap = hullCfg.gap;
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const kinematic = ActionWarehouse.isKinematicCaptureMode(blockCount);
        const shellPasses = hullCfg.shellPasses ?? 1;
        let capturedWeight = hullCfg.capturedBodyWeight ?? 0.55;
        if (blockCount >= 2) capturedWeight = hullCfg.capturedBodyWeightMulti ?? 0.44;
        const multiBlock = blockCount >= 2;

        for (let shellPass = 0; shellPass < shellPasses; shellPass++) {
            const useBroadPhase = shellPass === 0;

            for (let i = 0; i < molecules.length; i++) {
                for (let j = i + 1; j < molecules.length; j++) {
                    const molA = molecules[i];
                    const molB = molecules[j];

                    const dx = molB.cx - molA.cx;
                    const dy = molB.cy - molA.cy;
                    const dist = Math.hypot(dx, dy);
                    if (useBroadPhase && dist >= molA.radius + molB.radius + broadGap) continue;

                    if (CONFIG.presentation?.hullCollisionDistanceCull &&
                        typeof isPresentationMode === 'function' && isPresentationMode()) {
                        const viewDiag = Math.hypot(window.innerWidth, window.innerHeight);
                        const viewMul = CONFIG.presentation.hullCollisionViewCull ?? 1.45;
                        const maxDist = viewDiag * viewMul + molA.radius + molB.radius;
                        if (dist > maxDist) continue;
                    }

                    const stretched = ActionWarehouse.stretchedNotes;
                    if (stretched.has(molA.noteIndex) && stretched.has(molB.noteIndex)) {
                        const bindA = ActionWarehouse.stretchBindingByNote.get(molA.noteIndex);
                        const bindB = ActionWarehouse.stretchBindingByNote.get(molB.noteIndex);
                        const keyA = bindA ? ActionWarehouse.getStretchGroupKey(bindA) : '';
                        const keyB = bindB ? ActionWarehouse.getStretchGroupKey(bindB) : '';
                        if (keyA && keyA === keyB) continue;
                    }

                    for (let ai = 0; ai < molA.dots.length; ai++) {
                        const dotA = molA.dots[ai];
                        if (dotA.isFiltered) continue;

                        for (let bi = 0; bi < molB.dots.length; bi++) {
                            const dotB = molB.dots[bi];
                            if (dotB.isFiltered) continue;

                            this.separateOutlineShellPair(
                                dotA, dotB, minDist, capturedWeight, kinematic, multiBlock
                            );
                        }
                    }
                }
            }
        }
    },

    separateOutlineShellPair(dotA, dotB, minDist, capturedWeight, kinematic, multiBlock) {
        if (ActionWarehouse.stretchedNotes.has(dotA.noteIndex) ||
            ActionWarehouse.stretchedNotes.has(dotB.noteIndex)) {
            return;
        }

        const staticA = !dotA.body || dotA.onBankGrid || dotA.body.isStatic;
        const staticB = !dotB.body || dotB.onBankGrid || dotB.body.isStatic;
        let wA = staticA ? 0 : (dotA.overrideTarget ? capturedWeight : 1);
        let wB = staticB ? 0 : (dotB.overrideTarget ? capturedWeight : 1);
        if (kinematic && dotA.overrideTarget) wA = 0;
        if (kinematic && dotB.overrideTarget) wB = 0;
        if (wA <= 0 && wB <= 0) return;

        const pdx = dotB.body.position.x - dotA.body.position.x;
        const pdy = dotB.body.position.y - dotA.body.position.y;
        const pdist = Math.hypot(pdx, pdy) || 0.01;
        if (pdist >= minDist) return;

        const overlap = minDist - pdist;
        const nx = pdx / pdist;
        const ny = pdy / pdist;

        const wSum = wA + wB;
        if (wSum <= 0) return;

        const moveA = overlap * (wB / wSum);
        const moveB = overlap * (wA / wSum);

        if (wA > 0) {
            this.nudgeBodyPosition(dotA.body, -nx * moveA, -ny * moveA);
            this.dampShellNormalVelocity(dotA.body, nx, ny, multiBlock && !!dotA.overrideTarget);
            if (multiBlock && dotA.overrideTarget) {
                const v = dotA.body.velocity;
                Matter.Body.setVelocity(dotA.body, { x: v.x * 0.35, y: v.y * 0.35 });
            }
        }
        if (wB > 0) {
            this.nudgeBodyPosition(dotB.body, nx * moveB, ny * moveB);
            this.dampShellNormalVelocity(dotB.body, -nx, -ny, multiBlock && !!dotB.overrideTarget);
            if (multiBlock && dotB.overrideTarget) {
                const v = dotB.body.velocity;
                Matter.Body.setVelocity(dotB.body, { x: v.x * 0.35, y: v.y * 0.35 });
            }
        }
    },

    dampShellNormalVelocity(body, nx, ny, heavy) {
        const vx = body.velocity.x;
        const vy = body.velocity.y;
        const vn = vx * nx + vy * ny;
        if (vn >= 0) return;
        const damp = heavy ? 0.35 : 0.55;
        Matter.Body.setVelocity(body, {
            x: vx - nx * vn * damp,
            y: vy - ny * vn * damp
        });
    },

    nudgeBodyPosition(body, dx, dy) {
        const p = body.position;
        Matter.Body.setPosition(body, {
            x: p.x + dx,
            y: p.y + dy
        });
    },

    nudgeMoleculeHull(mol, dx, dy, strength = 1) {
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const multiBlock = blockCount >= 2;
        const kinematic = ActionWarehouse.isKinematicCaptureMode(blockCount);
        let weightedDx = 0;
        let weightedDy = 0;
        mol.dots.forEach(dot => {
            if (kinematic && dot.overrideTarget) return;
            const nudgeScale = dot.overrideTarget ? strength * 0.22 : strength;
            this.nudgeBodyPosition(dot.body, dx * nudgeScale, dy * nudgeScale);
            if (multiBlock && dot.overrideTarget) {
                const v = dot.body.velocity;
                Matter.Body.setVelocity(dot.body, { x: v.x * 0.35, y: v.y * 0.35 });
            }
            weightedDx += dx * nudgeScale;
            weightedDy += dy * nudgeScale;
        });
        const n = mol.dots.length || 1;
        mol.cx += weightedDx / n;
        mol.cy += weightedDy / n;
    },

    resolveSharedStretchOverlap(molA, molB, hullCfg) {
        const dx = molB.cx - molA.cx;
        const dy = molB.cy - molA.cy;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minD = molA.radius + molB.radius + hullCfg.gap;
        const overlap = minD - dist;
        if (overlap <= 0) return;

        const axis = ActionWarehouse.stretchAxisByNote.get(molA.noteIndex);
        const bindA = ActionWarehouse.stretchBindingByNote.get(molA.noteIndex);
        const bindB = ActionWarehouse.stretchBindingByNote.get(molB.noteIndex);
        const strength = hullCfg.stretchResolveStrength ?? 0.62;
        const shift = overlap * strength * 0.5;

        if (axis && bindA && bindB) {
            const nx = dx / dist;
            const ny = dy / dist;
            let perpSign = nx * axis.px + ny * axis.py;
            if (Math.abs(perpSign) < 0.01) perpSign = 1;
            else perpSign = Math.sign(perpSign);

            bindA.slotLane -= shift * perpSign;
            bindB.slotLane += shift * perpSign;
            ActionWarehouse.applyBindingOffsets(molA.noteIndex, bindA);
            ActionWarehouse.applyBindingOffsets(molB.noteIndex, bindB);
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        this.nudgeMoleculeHull(molA, -nx * shift, -ny * shift);
        this.nudgeMoleculeHull(molB, nx * shift, ny * shift);
    },

    resolveBlockHullOverlaps(molecules) {
        const orbitCfg = CONFIG.warehouse.orbit;
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const strength = blockCount >= 2 ? 0.52 : 0.82;

        ActionWarehouse.getCollisionBlocks().forEach(block => {
            const blockR = ActionWarehouse.getBlockCollisionRadius(block);

            molecules.forEach(mol => {
                if (ActionWarehouse.stretchedNotes.has(mol.noteIndex)) {
                    const isOwned = mol.dots.some(d =>
                        d.overrideTarget && ActionWarehouse.dotMatchesBlock(block, d));
                    if (isOwned) return;
                }
                if (mol.dots.every(d => d.onBankGrid)) return;

                const isOwned = mol.dots.some(d => d.overrideTarget && ActionWarehouse.dotMatchesBlock(block, d));
                const clearance = isOwned
                    ? ActionWarehouse.orbitFloor(orbitCfg, block)
                    : blockR + mol.radius + orbitCfg.blockClearance;

                const dx = mol.cx - block.bodyX;
                const dy = mol.cy - block.bodyY;
                const dist = Math.hypot(dx, dy) || 0.01;
                const overlap = clearance - dist;
                if (overlap <= 0) return;

                const nx = dx / dist;
                const ny = dy / dist;
                const push = overlap * strength;

                mol.dots.forEach(dot => {
                    this.nudgeBodyPosition(dot.body, nx * push, ny * push);
                    if (blockCount >= 2 && dot.overrideTarget) {
                        const v = dot.body.velocity;
                        Matter.Body.setVelocity(dot.body, { x: v.x * 0.35, y: v.y * 0.35 });
                    }
                });
                mol.cx += nx * push;
                mol.cy += ny * push;
            });
        });
    },

    // Per-dot safety net: pill AABB keeps colliders off block bodies
    resolveDotBlockOverlaps() {
        const orbitCfg = CONFIG.warehouse.orbit;
        const dotR = CONFIG.physics.body.radius;

        ActionWarehouse.getCollisionBlocks().forEach(block => {
            this.bodiesData.forEach(dot => {
                if (dot.onBankGrid || dot.body.isStatic) return;
                if (ActionWarehouse.stretchedNotes.has(dot.noteIndex)) return;

                const isOwnTag = ActionWarehouse.dotMatchesBlock(block, dot);

                const gap = isOwnTag
                    ? (orbitCfg.orbitCaptureClearance ?? orbitCfg.blockClearance)
                    : orbitCfg.blockClearance;

                const pushed = ActionWarehouse.pushPointOutOfBlockAabb(
                    block,
                    dot.body.position.x,
                    dot.body.position.y,
                    dotR + gap
                );
                if (pushed.moved) {
                    const ox = dot.body.position.x;
                    const oy = dot.body.position.y;
                    this.nudgeBodyPosition(dot.body, pushed.x - ox, pushed.y - oy);
                }
            });
        });
    },

    // Softer sibling springs while stretched; rest length follows current span
    syncStretchSiblingSprings() {
        const linkCfg = CONFIG.warehouse.linkage;
        const baseStiff = linkCfg.siblingStiffness;
        const stretchStiff = baseStiff * linkCfg.stretchStiffnessFactor;
        const slack = linkCfg.stretchLengthSlack;
        const linkDamping = linkCfg.siblingDamping;

        this.siblingLinks.forEach(link => {
            if (!link.constraint) return;
            link.constraint.damping = linkDamping;
            const stretched = ActionWarehouse.stretchedNotes.has(link.noteIndex);
            if (!stretched) {
                link.constraint.stiffness = baseStiff;
                link.constraint.length = linkCfg.siblingLength;
                return;
            }

            const blockCount = ActionWarehouse.getCrowdedBlockCount();
            link.constraint.stiffness = (blockCount >= 2 && !ActionWarehouse.isKinematicCaptureMode(blockCount))
                ? 0
                : stretchStiff;
            const ax = link.bodyA.position.x;
            const ay = link.bodyA.position.y;
            const bx = link.bodyB.position.x;
            const by = link.bodyB.position.y;
            const dist = Math.hypot(bx - ax, by - ay) || linkCfg.siblingLength;
            link.constraint.length = Math.max(linkCfg.siblingLength, dist * slack);
        });
    },

    applyStretchKinematicFollow() {
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        if (blockCount < 2 || ActionWarehouse.stretchedNotes.size === 0) return;
        if (ActionWarehouse.isKinematicCaptureMode(blockCount)) return;

        const cfg = CONFIG.physics.crowdedBlock;
        const pres = typeof isPresentationMode === 'function' && isPresentationMode();
        const dragging = ActionWarehouse.isAnyCaptureBlockDragging();
        let lerp = pres
            ? (CONFIG.presentation?.kinematicStretchLerp ?? 0.2)
            : (cfg.kinematicLerpStretch ?? 0.16);
        if (dragging) {
            lerp = pres
                ? (CONFIG.presentation?.kinematicStretchLerpDrag ?? 0.26)
                : (cfg.kinematicSmoothLerpStretch ?? 0.2);
        }
        let maxStep = scale(dragging ? (cfg.kinematicMaxStepDrag ?? 3.6) : (cfg.kinematicMaxStep ?? 2.4));

        this.bodiesData.forEach(item => {
            if (!ActionWarehouse.stretchedNotes.has(item.noteIndex)) return;
            if (!item.overrideTarget || item.onBankGrid || item.isFiltered || item.isFilterExiting) return;
            const tgt = item.overrideTarget;
            const body = item.body;
            if (!body || body.isStatic) return;

            const lag = Math.hypot(tgt.x - body.position.x, tgt.y - body.position.y);
            const stepCap = ActionWarehouse.kinematicAdaptiveMaxStep(maxStep, lag, cfg);
            const next = ActionWarehouse.kinematicLerpToward(
                body.position.x, body.position.y, tgt.x, tgt.y, lerp, stepCap
            );
            Matter.Body.setPosition(body, next);
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
        });
    },

    applyKinematicCaptureFollow() {
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        if (!ActionWarehouse.isKinematicCaptureMode(blockCount)) return;

        const cfg = CONFIG.physics.crowdedBlock;
        const blocksDragging = ActionWarehouse.isAnyCaptureBlockDragging();
        const entryTicks = ActionWarehouse._kinematicEntryTicks || 0;
        const entryTotal = cfg.kinematicEntryTicks ?? 120;
        const entryBoost = cfg.kinematicEntryLerp ?? 0.36;
        let baseLerp = blocksDragging
            ? (cfg.kinematicLerpDrag ?? 0.08)
            : (cfg.kinematicLerp ?? 0.05);
        let stretchLerp = cfg.kinematicLerpStretch ?? 0.07;
        let maxStep = scale(blocksDragging
            ? (cfg.kinematicMaxStepDrag ?? 2.8)
            : (cfg.kinematicMaxStep ?? 1.6));
        if (entryTicks > 0) {
            const ramp = 1 - entryTicks / entryTotal;
            baseLerp = baseLerp + (entryBoost - baseLerp) * (1 - ramp);
            stretchLerp = stretchLerp + (entryBoost - stretchLerp) * (1 - ramp);
            maxStep *= 2.2;
        }
        const blockMul = blockCount >= 7 ? (cfg.kinematicBlock7StepMul ?? 1.3) : 1;
        const transMul = ActionWarehouse._orbitTransitionTicks > 0 ? 1.6 : 1;
        maxStep *= blockMul * transMul;
        let followCount = 0;
        let maxFollowLag = 0;

        this.bodiesData.forEach(item => {
            if (item.onBankGrid || item.isFiltered || item.isFilterExiting) return;
            if (!item.overrideTarget) return;
            const body = item.body;
            if (!body || body.isStatic) return;

            const tgt = item.smoothTarget || item.overrideTarget;
            if (!tgt) return;
            const isStretched = ActionWarehouse.stretchedNotes.has(item.noteIndex);
            const lerp = isStretched ? stretchLerp : baseLerp;
            const lag = Math.hypot(tgt.x - body.position.x, tgt.y - body.position.y);
            if (lag > maxFollowLag) maxFollowLag = lag;

            const stepCap = ActionWarehouse.kinematicAdaptiveMaxStep(maxStep, lag, cfg);
            const next = ActionWarehouse.kinematicLerpToward(
                body.position.x, body.position.y, tgt.x, tgt.y, lerp, stepCap
            );
            Matter.Body.setPosition(body, { x: next.x, y: next.y });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            followCount++;
        });
    },

    applyMotionSettling() {
        const cfg = CONFIG.physics.motion;
        const blockCount = ActionWarehouse.getCrowdedBlockCount();
        const multiBlock = blockCount >= 2;
        const singleBlock = blockCount === 1;
        const heavyTier = ActionWarehouse.getHeavyWorkspaceTier(blockCount);
        const kinematicCapture = ActionWarehouse.isKinematicCaptureMode(blockCount);
        let transitCap = multiBlock
            ? cfg.transitMaxSpeed * Math.max(0.68, 0.92 - (blockCount - 2) * 0.06)
            : cfg.transitMaxSpeed;
        if (heavyTier >= 0) {
            transitCap = CONFIG.physics.crowdedBlock.transitMaxSpeed;
        }

        this.bodiesData.forEach(item => {
            const body = item.body;
            if (item.onBankGrid || body.isStatic) return;
            if (kinematicCapture && item.overrideTarget) return;
            if (ActionWarehouse.stretchedNotes.has(item.noteIndex) &&
                item.overrideTarget && blockCount >= 2) return;

            let vx = body.velocity.x;
            let vy = body.velocity.y;
            let speed = Math.hypot(vx, vy);

            const pullTarget = item.smoothTarget || item.overrideTarget;
            let distToTarget = Infinity;
            if (pullTarget) {
                distToTarget = Math.hypot(
                    pullTarget.x - body.position.x,
                    pullTarget.y - body.position.y
                );
            }

            const snapR = item.overrideTarget ? cfg.snapRadiusCaptured : cfg.snapRadius;
            if (pullTarget && distToTarget < snapR) {
                const isStretched = ActionWarehouse.stretchedNotes.has(item.noteIndex);
                let allowSnap = !item.overrideTarget || speed < cfg.transitMaxSpeed * 0.4;
                if (item.overrideTarget && blockCount >= 4) {
                    const smoothLag = item.smoothTarget
                        ? Math.hypot(
                            item.overrideTarget.x - item.smoothTarget.x,
                            item.overrideTarget.y - item.smoothTarget.y
                        )
                        : 0;
                    allowSnap = !isStretched &&
                        distToTarget < scale(2.4) &&
                        speed < 0.14 &&
                        smoothLag < scale(3.5);
                }
                if (allowSnap) {
                    Matter.Body.setVelocity(body, { x: 0, y: 0 });
                    return;
                }
            }

            if (item.overrideTarget) {
                let damp = multiBlock
                    ? cfg.multiBlockDamping * 0.82
                    : (singleBlock ? cfg.singleBlockCaptureDamping : 1);
                const heavyDamp = ActionWarehouse.getHeavyCaptureDamping(blockCount);
                if (heavyDamp != null) damp = Math.max(heavyDamp, blockCount >= 6 ? 0.58 : 0.52);
                if (damp < 1) {
                    vx *= damp;
                    vy *= damp;
                    speed = Math.hypot(vx, vy);
                }
            } else if (ActionWarehouse.workspaceCenters) {
                const bankDamp = cfg.workspaceBankDamping ?? 0.38;
                vx *= bankDamp;
                vy *= bankDamp;
                speed = Math.hypot(vx, vy);

                const home = ActionWarehouse.workspaceCenters[item.noteIndex];
                if (home) {
                    const homeDist = Math.hypot(
                        home.x + item.offsetX - body.position.x,
                        home.y + item.offsetY - body.position.y
                    );
                    if (homeDist < cfg.snapRadius * 2.5) {
                        Matter.Body.setVelocity(body, { x: 0, y: 0 });
                        return;
                    }
                }
            }

            if (distToTarget > cfg.transitRadius) {
                if (speed > transitCap) {
                    vx = (vx / speed) * transitCap;
                    vy = (vy / speed) * transitCap;
                }
            } else if (item.overrideTarget && speed > transitCap * 0.52) {
                vx = (vx / speed) * transitCap * 0.52;
                vy = (vy / speed) * transitCap * 0.52;
                speed = Math.hypot(vx, vy);
            } else if (speed < cfg.nearJitterSpeed) {
                vx *= cfg.nearDamping;
                vy *= cfg.nearDamping;
            }

            Matter.Body.setVelocity(body, { x: vx, y: vy });
        });
    },

    /* --- Sibling link rendering (canvas overlay, below the dots) --- */

    initLinkCanvas() {
        this.linkCanvas = document.createElement('canvas');
        this.linkCanvas.classList.add('link-canvas');
        document.body.appendChild(this.linkCanvas);
        this.linkCtx = this.linkCanvas.getContext('2d');

        // Canvas cannot consume CSS variables: resolve the color once from the stylesheet
        this.linkColor = getComputedStyle(document.documentElement)
            .getPropertyValue(CONFIG.warehouse.linkage.line.cssColorVariable).trim() || '#101010';

        const hoverFillVar = CONFIG.outlines?.hoverFillCssVariable || '--color-6';
        this.hoverFillCssVariable = hoverFillVar;
        this.hoverFillColor = this.resolveHoverFillColor();

        this.resizeLinkCanvas();
    },

    resolveHoverFillColor() {
        const cssVar = this.hoverFillCssVariable ||
            CONFIG.outlines?.hoverFillCssVariable ||
            '--color-6';
        return getComputedStyle(document.documentElement)
            .getPropertyValue(cssVar).trim() || '#E6E0DA';
    },

    resizeLinkCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.linkCanvas.width = window.innerWidth * dpr;
        this.linkCanvas.height = window.innerHeight * dpr;
        this.linkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    drawSiblingLinks() {
        const ctx = this.linkCtx;
        const lineCfg = CONFIG.warehouse.linkage.line;
        if (lineCfg.visible === false) return;
        if (this.bodiesData.length === 0) return;

        const linkCfg = CONFIG.warehouse.linkage;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const maxDistSq = lineCfg.maxVisibleDistance * lineCfg.maxVisibleDistance;
        const stretched = ActionWarehouse.stretchedNotes;

        const groups = new Map();
        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;
            if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
            groups.get(item.noteIndex).push(item);
        });

        ctx.strokeStyle = this.linkColor;
        ctx.lineWidth = lineCfg.width;
        ctx.beginPath();

        groups.forEach((dots, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            if (dots.length < 2) return;

            const isStretched = stretched.has(noteIndex);
            const hasCaptured = dots.some(d => d.overrideTarget);
            const candidates = [];

            for (let i = 0; i < dots.length; i++) {
                for (let j = i + 1; j < dots.length; j++) {
                    const pi = this.getItemDrawPosition(dots[i]);
                    const pj = this.getItemDrawPosition(dots[j]);
                    if (!pi || !pj) continue;
                    const dx = pi.x - pj.x;
                    const dy = pi.y - pj.y;
                    candidates.push({ i, j, distSq: dx * dx + dy * dy });
                }
            }
            candidates.sort((a, b) => a.distSq - b.distSq);

            const degree = new Array(dots.length).fill(0);
            const drawnPairs = new Set();

            const drawPair = (i, j) => {
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (drawnPairs.has(key)) return false;
                drawnPairs.add(key);
                const a = this.getItemDrawPosition(dots[i]);
                const b = this.getItemDrawPosition(dots[j]);
                if (!a || !b) return false;
                ctx.moveTo(a.x - scrollX, a.y - scrollY);
                ctx.lineTo(b.x - scrollX, b.y - scrollY);
                degree[i]++;
                degree[j]++;
                return true;
            };

            candidates.forEach(pair => {
                if (degree[pair.i] >= linkCfg.maxLinksPerDot ||
                    degree[pair.j] >= linkCfg.maxLinksPerDot) return;
                const relaxDistance = isStretched || hasCaptured;
                if (!relaxDistance && pair.distSq > maxDistSq) return;
                drawPair(pair.i, pair.j);
            });

            // Any dot pulled away by a block must stay linked to its molecule
            if (hasCaptured || isStretched) {
                dots.forEach((dot, i) => {
                    if (degree[i] > 0) return;
                    let bestJ = -1;
                    let bestDist = Infinity;
                    for (let j = 0; j < dots.length; j++) {
                        if (i === j) continue;
                        const pi = this.getItemDrawPosition(dot);
                        const pj = this.getItemDrawPosition(dots[j]);
                        if (!pi || !pj) continue;
                        const dx = pi.x - pj.x;
                        const dy = pi.y - pj.y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < bestDist) {
                            bestDist = distSq;
                            bestJ = j;
                        }
                    }
                    if (bestJ >= 0) drawPair(i, bestJ);
                });
            }
        });

        ctx.stroke();
    },

    /* --- Note molecule outlines --- */

    getMacroDotRenderRadius() {
        const factor = CONFIG.outlines?.renderScale ?? 1;
        return scale(10 * factor) / 2;
    },

    getOutlineRenderPadding() {
        const cfg = CONFIG.outlines;
        return cfg.renderPadding ?? cfg.padding;
    },

    resolveSheetColorValue(color) {
        const raw = String(color || '').trim();
        if (!raw) return '';
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) return raw;
        if (raw.startsWith('rgb')) return raw;

        const varName = raw.match(/var\(\s*(--[^,)]+)/)?.[1];
        if (varName) {
            const resolved = getComputedStyle(document.documentElement)
                .getPropertyValue(varName).trim();
            if (resolved) return resolved;
        }
        return raw;
    },

    getDotFillColor(element) {
        if (!element) return '';

        const raw = element.style.getPropertyValue('--dot-bg').trim()
            || getComputedStyle(element).getPropertyValue('--dot-bg').trim();
        if (raw) {
            const resolved = this.resolveSheetColorValue(raw);
            if (resolved && resolved !== this.linkColor) return resolved;
        }

        const tagName = element.dataset?.tag;
        if (tagName && typeof AppState !== 'undefined') {
            const fromMap = AppState.tagColorsMap?.get(tagName);
            if (fromMap) {
                const resolved = this.resolveSheetColorValue(fromMap);
                if (resolved) return resolved;
            }
        }

        const bg = getComputedStyle(element).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        return '';
    },

    getMoleculeHoverFillColor(pts) {
        const mode = CONFIG.outlines?.hoverFillMode ?? 'tag';
        if (mode === 'tag' && pts?.length) {
            for (let i = 0; i < pts.length; i++) {
                const color = pts[i].color;
                if (color) return color;
            }
        }
        return this.resolveHoverFillColor();
    },

    collectNoteOutlineGroups() {
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const dotR = this.getMacroDotRenderRadius();

        const groups = new Map();
        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;
            const pos = this.getItemDrawPosition(item);
            if (!pos) return;
            if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
            groups.get(item.noteIndex).push({
                x: pos.x - scrollX,
                y: pos.y - scrollY,
                r: dotR,
                color: this.getDotFillColor(item.element)
            });
        });

        return groups;
    },

    shouldCullOutlineGroup(pts) {
        const presCull = CONFIG.presentation?.outlineViewportCull &&
            typeof isPresentationMode === 'function' && isPresentationMode();
        if (!presCull) return false;

        const viewPad = CONFIG.outlines.padding + CONFIG.physics.body.radius + 48;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let cx = 0;
        let cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        cx /= pts.length;
        cy /= pts.length;
        return cx < -viewPad || cx > vw + viewPad || cy < -viewPad || cy > vh + viewPad;
    },

    getMoleculeBackingFill() {
        return CONFIG.outlines.backingFill ||
            getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim() ||
            '#F2F0EE';
    },

    drawNoteBackings() {
        const cfg = CONFIG.outlines;
        if (cfg.mode === 'off' || cfg.backing === false || this.bodiesData.length === 0) return;
        if (!this.linkCtx) return;

        const ctx = this.linkCtx;
        const groups = this.collectNoteOutlineGroups();
        ctx.save();
        ctx.fillStyle = this.getMoleculeBackingFill();

        groups.forEach((pts, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            if (noteIndex === this.hoveredNoteIndex) return;
            if (this.shouldCullOutlineGroup(pts)) return;

            const R = pts[0].r + this.getOutlineRenderPadding();
            const useHull = cfg.mode === 'hull' ||
                           (cfg.mode === 'compare' && noteIndex % 2 === 0);
            if (useHull) {
                this.fillHullOutline(pts, R, ctx);
            }
        });

        ctx.restore();
    },

    drawNoteHoverFills() {
        const noteIndex = this.hoveredNoteIndex;
        if (noteIndex < 0) return;

        const cfg = CONFIG.outlines;
        if (cfg.mode === 'off' || this.bodiesData.length === 0) return;
        if (!this.linkCtx) return;
        if (ActionWarehouse.isNoteFiltered(noteIndex)) return;

        const groups = this.collectNoteOutlineGroups();
        const pts = groups.get(noteIndex);
        if (!pts?.length) return;
        if (this.shouldCullOutlineGroup(pts)) return;

        const R = pts[0].r + this.getOutlineRenderPadding();
        const useHull = cfg.mode === 'hull' ||
                       (cfg.mode === 'compare' && noteIndex % 2 === 0);
        if (!useHull) return;

        const ctx = this.linkCtx;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.getMoleculeHoverFillColor(pts);
        this.fillHullOutline(pts, R, ctx);
        ctx.restore();
    },

    drawNoteOutlines() {
        const cfg = CONFIG.outlines;
        if (cfg.mode === 'off' || this.bodiesData.length === 0) return;

        const ctx = this.linkCtx;
        const groups = this.collectNoteOutlineGroups();
        ctx.strokeStyle = this.linkColor;
        ctx.lineWidth = cfg.width;

        groups.forEach((pts, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            if (this.shouldCullOutlineGroup(pts)) return;

            const R = pts[0].r + this.getOutlineRenderPadding();
            const useHull = cfg.mode === 'hull' ||
                           (cfg.mode === 'compare' && noteIndex % 2 === 0);

            if (useHull) {
                this.strokeHullOutline(pts, R, ctx);
            } else {
                this.strokeBlobOutline(pts, R, ctx);
            }
        });
    },

    // Option A: rounded convex hull membrane (offset polygon: arcs at vertices,
    // straight tangents along edges)
    traceHullOutlinePath(pts, R, ctx) {
        const hull = pts.length <= 2 ? pts : this.convexHull(pts);

        ctx.beginPath();
        if (hull.length === 1) {
            ctx.arc(hull[0].x, hull[0].y, R, 0, Math.PI * 2);
            return true;
        }

        const n = hull.length;
        for (let i = 0; i < n; i++) {
            const prev = hull[(i - 1 + n) % n];
            const p = hull[i];
            const next = hull[(i + 1) % n];
            // Outward normal angles of the incoming and outgoing edges
            const a1 = Math.atan2(-(p.x - prev.x), p.y - prev.y);
            const a2 = Math.atan2(-(next.x - p.x), next.y - p.y);
            ctx.arc(p.x, p.y, R, a1, a2);
        }
        ctx.closePath();
        return true;
    },

    strokeHullOutline(pts, R, ctx) {
        if (!this.traceHullOutlinePath(pts, R, ctx)) return;
        ctx.stroke();
    },

    fillHullOutline(pts, R, ctx) {
        if (!this.traceHullOutlinePath(pts, R, ctx)) return;
        ctx.fill();
    },

    // Monotone chain; returns hull ordered clockwise in screen coords
    convexHull(points) {
        const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        lower.pop();
        upper.pop();
        const hull = lower.concat(upper);
        return hull.length > 0 ? hull : [points[0]];
    },

    // Option C: exact union contour of per-dot circles. For every circle, the
    // angular sections buried inside sibling circles are removed; what remains
    // is the molecule's outer skin.
    strokeBlobOutline(pts, R, ctx) {
        const TAU = Math.PI * 2;

        pts.forEach((c, i) => {
            const covered = [];
            let fullyCovered = false;

            for (let j = 0; j < pts.length; j++) {
                if (j === i) continue;
                const dx = pts[j].x - c.x;
                const dy = pts[j].y - c.y;
                const d = Math.hypot(dx, dy);

                if (d < 0.5) {
                    // Coincident circles: draw only the first one
                    if (j < i) { fullyCovered = true; break; }
                    continue;
                }
                if (d >= 2 * R) continue;

                const half = Math.acos(d / (2 * R));
                const ang = Math.atan2(dy, dx);
                let s = ((ang - half) % TAU + TAU) % TAU;
                let e = ((ang + half) % TAU + TAU) % TAU;
                if (s <= e) covered.push([s, e]);
                else { covered.push([s, TAU]); covered.push([0, e]); }
            }
            if (fullyCovered) return;

            ctx.beginPath();
            if (covered.length === 0) {
                ctx.arc(c.x, c.y, R, 0, TAU);
                ctx.stroke();
                return;
            }

            covered.sort((a, b) => a[0] - b[0]);
            const merged = [];
            covered.forEach(iv => {
                const last = merged[merged.length - 1];
                if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
                else merged.push([iv[0], iv[1]]);
            });

            // Visible arcs are the gaps between covered intervals (with wraparound)
            for (let k = 0; k < merged.length; k++) {
                const start = merged[k][1];
                const end = (k + 1 < merged.length) ? merged[k + 1][0] : merged[0][0] + TAU;
                if (end - start < 0.01) continue;
                ctx.moveTo(c.x + R * Math.cos(start), c.y + R * Math.sin(start));
                ctx.arc(c.x, c.y, R, start, end);
            }
            ctx.stroke();
        });
    },

    buildWorld() {
        if (!this.engine || typeof Matter === 'undefined') return;

        this.bodiesData.forEach(item => Matter.World.remove(this.engine.world, item.body));
        
        const allConstraints = Matter.Composite.allConstraints(this.engine.world);
        allConstraints.forEach(constraint => Matter.World.remove(this.engine.world, constraint));

        this.bodiesData = [];
        this.siblingLinks = [];
        this.noteCenters = [];

        // No boundary walls: dots may drift past the canvas edge; the scroll
        // clamp follows live body positions, so roaming reaches them anywhere.
        const wrappers = document.querySelectorAll('.note-wrapper');

        wrappers.forEach((wrapper, noteIndex) => {
            const dotElements = wrapper.querySelectorAll('.layer-dot');
            if (dotElements.length === 0) return;

            const rect = wrapper.getBoundingClientRect();
            const globalX = rect.left + window.pageXOffset + rect.width / 2;
            const globalY = rect.top + window.pageYOffset + rect.height / 2;

            this.noteCenters[noteIndex] = { x: globalX, y: globalY };

            let nodeBodies = [];
            
            const clusterCfg = CONFIG.physics.cluster;
            const bodyCfg = CONFIG.physics.body;

            const totalDots = dotElements.length;
            const clusterRadius = totalDots === 1 ? 0 : clusterCfg.baseRadius + (totalDots * clusterCfg.radiusPerDot);

            const item = AppState.items[noteIndex];
            const authorCode = item?.authorCode || null;

            dotElements.forEach((dotElement, index) => {
                const angle = (index / totalDots) * Math.PI * 2;
                const physicsTargetX = globalX + Math.cos(angle) * clusterRadius;
                const physicsTargetY = globalY + Math.sin(angle) * clusterRadius;

                const startX = physicsTargetX + (Math.random() - 0.5) * clusterCfg.spawnJitter;
                const startY = physicsTargetY + (Math.random() - 0.5) * clusterCfg.spawnJitter;

                const body = Matter.Bodies.circle(startX, startY, bodyCfg.radius, { 
                    frictionAir: bodyCfg.frictionAir,
                    friction: bodyCfg.friction,
                    restitution: bodyCfg.restitution, 
                    density: bodyCfg.density
                });

                Matter.World.add(this.engine.world, body);
                nodeBodies.push(body);

                this.bodiesData.push({
                    body: body,
                    element: dotElement,
                    tag: dotElement.dataset.tag || null,
                    authorCode: authorCode,
                    noteIndex: noteIndex,
                    overrideTarget: null,
                    smoothTarget: null,
                    onBankGrid: false,
                    cssOriginX: globalX,
                    cssOriginY: globalY,
                    physicsTargetX: physicsTargetX,
                    physicsTargetY: physicsTargetY,
                    // Dot's cluster offset from the note center, reused by the workspace grid
                    offsetX: physicsTargetX - globalX,
                    offsetY: physicsTargetY - globalY
                });
            });

            // Sibling springs: nearest pairs are linked first, but no dot may
            // exceed maxLinksPerDot. Dense enough to feel molecular, never a hairball.
            const linkCfg = CONFIG.warehouse.linkage;
            const candidates = [];
            for (let i = 0; i < nodeBodies.length; i++) {
                for (let j = i + 1; j < nodeBodies.length; j++) {
                    const ddx = nodeBodies[i].position.x - nodeBodies[j].position.x;
                    const ddy = nodeBodies[i].position.y - nodeBodies[j].position.y;
                    candidates.push({ i, j, dist: ddx * ddx + ddy * ddy });
                }
            }
            candidates.sort((a, b) => a.dist - b.dist);

            const degree = new Array(nodeBodies.length).fill(0);
            candidates.forEach(pair => {
                if (degree[pair.i] >= linkCfg.maxLinksPerDot ||
                    degree[pair.j] >= linkCfg.maxLinksPerDot) return;

                const constraint = Matter.Constraint.create({
                    bodyA: nodeBodies[pair.i],
                    bodyB: nodeBodies[pair.j],
                    length: linkCfg.siblingLength,
                    stiffness: linkCfg.siblingStiffness,
                    damping: linkCfg.siblingDamping
                });
                Matter.World.add(this.engine.world, constraint);
                this.siblingLinks.push({
                    bodyA: nodeBodies[pair.i],
                    bodyB: nodeBodies[pair.j],
                    noteIndex: noteIndex,
                    constraint
                });
                degree[pair.i]++;
                degree[pair.j]++;
            });
        });

        ActionWarehouse.refreshWorkspaceGrid();
        ActionWarehouse.updateDotFocusFilter();
        this.captureRenderSnapshot();
    },

    getLiveWrapperOrigin(noteIndex, cache) {
        if (cache.has(noteIndex)) return cache.get(noteIndex);

        const wrapper = document.querySelectorAll('.note-wrapper')[noteIndex];
        if (!wrapper) return null;

        const rect = wrapper.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;

        const origin = {
            x: rect.left + window.pageXOffset + rect.width / 2,
            y: rect.top + window.pageYOffset + rect.height / 2
        };
        cache.set(noteIndex, origin);
        return origin;
    },

    syncDotTransforms() {
        const wrapperOrigins = new Map();

        this.bodiesData.forEach(item => {
            if (item.isFiltered) return;

            const origin = this.getLiveWrapperOrigin(item.noteIndex, wrapperOrigins);
            if (!origin) return;

            const pos = this.getItemDrawPosition(item);
            if (!pos) return;

            const dx = pos.x - origin.x;
            const dy = pos.y - origin.y;

            item.element.style.setProperty('--phys-x', `${dx}px`);
            item.element.style.setProperty('--phys-y', `${dy}px`);
        });
    },

    syncLoop() {
        requestAnimationFrame(() => this.syncLoop());

        // About panel open: canvas is frozen + blurred behind the sheet — skip all recompute/draw.
        if (this.aboutFrozen) return;

        if (MacroMesoBridge.isAnimating() && !MacroMesoBridge.isZoomOutActive()) return;

        const macroVisualActive = MacroMesoBridge.isMacroVisualActive();
        const depthFocusLinks = typeof DepthFocusLinks !== 'undefined' &&
            DepthFocusLinks.shouldDraw();
        const skipCanvasDraw = this.shouldThrottleMacroCanvas();

        if (!macroVisualActive && !depthFocusLinks) {
            if (this.isActive) {
                this.bodiesData.forEach(item => {
                    item.element.style.setProperty('--phys-x', '0px');
                    item.element.style.setProperty('--phys-y', '0px');
                });
                this.isActive = false;
            }
            if (this.linkCtx) {
                this.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            }
            return;
        }

        if (macroVisualActive) {
            this.isActive = true;
            this.syncDotTransforms();
            this.updateMoleculeHoverState();
        } else {
            this.isActive = false;
        }

        const hoverChanged = this.hoveredNoteIndex !== this.lastCanvasHoverIndex;
        if (!this.linkCtx || (skipCanvasDraw && !hoverChanged)) return;

        this.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        if (macroVisualActive) {
            this.drawNoteBackings();
            this.drawSiblingLinks();
            if (typeof DepthFocusLinks !== 'undefined' && DepthFocusLinks.shouldDrawMacro()) {
                DepthFocusLinks.drawMacro(this.linkCtx, this.bodiesData);
            }
            this.drawNoteOutlines();
            this.drawNoteHoverFills();
            this.lastCanvasHoverIndex = this.hoveredNoteIndex;
        }

        if (depthFocusLinks) {
            DepthFocusLinks.draw(this.linkCtx);
        }
    },

    flushMacroCanvas() {
        if (!this.linkCtx) return;
        this.updateMoleculeHoverState();
        this.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.drawNoteBackings();
        this.drawSiblingLinks();
        if (typeof DepthFocusLinks !== 'undefined' && DepthFocusLinks.shouldDrawMacro()) {
            DepthFocusLinks.drawMacro(this.linkCtx, this.bodiesData);
        }
        this.drawNoteOutlines();
        this.drawNoteHoverFills();
        this.lastCanvasHoverIndex = this.hoveredNoteIndex;
    },

    // Axis-aligned bounds of a note's hull in viewport coordinates
    moleculeViewportBounds(noteIndex) {
        const pad = CONFIG.outlines.padding + CONFIG.physics.body.radius;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        this.bodiesData.forEach(item => {
            if (item.noteIndex !== noteIndex) return;
            const drawPos = this.getItemDrawPosition(item);
            if (!drawPos) return;
            const x = drawPos.x - scrollX;
            const y = drawPos.y - scrollY;
            minX = Math.min(minX, x - pad);
            minY = Math.min(minY, y - pad);
            maxX = Math.max(maxX, x + pad);
            maxY = Math.max(maxY, y + pad);
        });

        if (minX === Infinity) return null;
        return { minX, minY, maxX, maxY };
    },

    hitTestMolecule(clientX, clientY) {
        const notes = new Set(this.bodiesData.map(d => d.noteIndex));
        let hit = -1;
        let bestDist = Infinity;
        const pad = CONFIG.depth.moleculeClickPadding ?? 16;

        notes.forEach(noteIndex => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;
            const b = this.moleculeViewportBounds(noteIndex);
            if (!b) return;
            if (clientX < b.minX - pad || clientX > b.maxX + pad ||
                clientY < b.minY - pad || clientY > b.maxY + pad) return;

            const cx = (b.minX + b.maxX) * 0.5;
            const cy = (b.minY + b.maxY) * 0.5;
            const dist = Math.hypot(clientX - cx, clientY - cy);
            if (dist < bestDist) {
                bestDist = dist;
                hit = noteIndex;
            }
        });

        return hit;
    },

    canAcceptMoleculeClick(e) {
        if (DepthController.currentLevel !== 1) return false;
        if (!this.bodiesData.length) return false;
        if (ActionWarehouse.dragState) return false;
        if (typeof DepthTransitionOrchestrator !== 'undefined' && DepthTransitionOrchestrator.isRunning()) {
            return false;
        }
        if (typeof SpatialNavigation !== 'undefined' &&
            (SpatialNavigation.pan.active || SpatialNavigation.spaceHeld)) {
            return false;
        }
        const target = e?.target;
        if (target?.closest?.('.warehouse-shell, .action-block, .action-warehouse, .warehouse-launcher, .warehouse-launcher-wrap, .warehouse-reset, .warehouse-popup-backdrop, .depth-block-bar')) return false;
        if (typeof isPointOverWarehouseChrome === 'function' &&
            isPointOverWarehouseChrome(e.clientX, e.clientY)) {
            return false;
        }
        if (target?.closest?.('.site-navigation-layers, .site-navigation-maps')) return false;
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
            return false;
        }
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) return false;
        return true;
    },

    initMoleculePointer() {
        this.onMoleculePointerDown = (e) => {
            if (e.button !== 0) return;
            if (!this.canAcceptMoleculeClick(e)) return;

            const noteIndex = this.hitTestMolecule(e.clientX, e.clientY);
            if (noteIndex < 0) return;

            this.repulsionHoldNoteIndex = noteIndex;
            this.moleculeClickIntent = {
                noteIndex,
                startX: e.clientX,
                startY: e.clientY
            };
        };

        this.onMoleculePointerUp = (e) => {
            const intent = this.moleculeClickIntent;
            this.moleculeClickIntent = null;
            this.repulsionHoldNoteIndex = -1;

            if (!intent || e.button !== 0) return;
            if (!this.canAcceptMoleculeClick(e)) return;

            const moved = Math.hypot(e.clientX - intent.startX, e.clientY - intent.startY);
            const threshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved >= threshold) return;

            const stillOver = this.hitTestMolecule(e.clientX, e.clientY);
            if (stillOver !== intent.noteIndex) return;

            const wrappers = document.querySelectorAll('.note-wrapper');
            const wrapper = wrappers[intent.noteIndex];
            if (!wrapper) return;

            if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
                if (typeof ArtifactInspector !== 'undefined') {
                    ArtifactInspector.openMacroNoteAt(e.clientX, e.clientY);
                }
                return;
            }

            if (typeof DepthTransitionOrchestrator === 'undefined') return;

            DepthTransitionOrchestrator.runNoteClick(intent.noteIndex, wrapper);
        };

        document.addEventListener('pointerdown', this.onMoleculePointerDown);
        document.addEventListener('pointerup', this.onMoleculePointerUp);
        document.addEventListener('pointercancel', this.onMoleculePointerUp);
    },

    truncateHoverLabel(text) {
        if (!text) return '';
        const line = String(text).trim().split(/\r?\n/)[0].trim();
        if (!line) return '';

        const maxWords = CONFIG.depth?.moleculeHoverMaxWords ?? 8;
        const phraseClip = this.clipHoverAtPhraseBoundary(line, maxWords);
        return this.fitHoverLabelToWidth(phraseClip, this.getMoleculeHoverMaxWidthPx());
    },

    clipHoverAtPhraseBoundary(line, maxWords) {
        const words = line.split(/\s+/).filter(Boolean);
        if (words.length <= maxWords) return line;

        const windowText = words.slice(0, maxWords).join(' ');
        const breakPatterns = [
            /[.!?…](?=\s|$)/g,   // sentence end
            /[,;:—–-](?=\s|$)/g  // clause / list break
        ];

        for (const pattern of breakPatterns) {
            let lastEnd = -1;
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(windowText)) !== null) {
                lastEnd = match.index + match[0].length;
            }
            if (lastEnd > 0) {
                const candidate = windowText.slice(0, lastEnd).trim();
                if (candidate.split(/\s+/).filter(Boolean).length >= 2) return candidate;
            }
        }

        return windowText;
    },

    _moleculeHoverMeasureCtx: null,

    getMoleculeHoverMeasureCtx() {
        if (!this._moleculeHoverMeasureCtx) {
            const canvas = document.createElement('canvas');
            this._moleculeHoverMeasureCtx = canvas.getContext('2d');
        }
        return this._moleculeHoverMeasureCtx;
    },

    getMoleculeHoverFont() {
        const root = getComputedStyle(document.documentElement);
        const weight = root.getPropertyValue('--type-display-weight').trim() || '400';
        const size = root.getPropertyValue('--type-display-size').trim() || '1.6667rem';
        const family = root.getPropertyValue('--type-family-note-h').trim() || 'TheBasics-Dots, sans-serif';
        return `normal ${weight} ${size} ${family}`;
    },

    getMoleculeHoverMaxWidthPx() {
        const cfg = CONFIG.depth || {};
        const vw = cfg.moleculeHoverMaxWidthVw ?? 42;
        const rem = cfg.moleculeHoverMaxWidthRem ?? 28;
        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        return Math.min(window.innerWidth * vw / 100, rem * rootPx);
    },

    fitHoverLabelToWidth(text, maxWidth) {
        if (!text || maxWidth <= 0) return text || '';
        const ctx = this.getMoleculeHoverMeasureCtx();
        ctx.font = this.getMoleculeHoverFont();

        if (ctx.measureText(text).width <= maxWidth) return text;

        const words = text.split(/\s+/).filter(Boolean);
        let result = '';
        for (const word of words) {
            const candidate = result ? `${result} ${word}` : word;
            if (ctx.measureText(candidate).width > maxWidth) break;
            result = candidate;
        }
        return result || words[0] || '';
    },

    noteHasAttachedBlocks(item) {
        if (!item) return false;
        if (Array.isArray(item.tags) && item.tags.length > 0) return true;
        if (String(item.authorCode || item.authorFullName || '').trim()) return true;
        return false;
    },

    countAttachedHoverBlocks(item) {
        if (!item) return 0;
        let count = 0;
        if (Array.isArray(item.tags) && item.tags.length > 0) {
            count += item.tags.length;
        }
        if (String(item.authorCode || item.authorFullName || '').trim()) count += 1;
        return count;
    },

    resolveMoleculeHoverBlocksPerRow(item) {
        const maxPerRow = CONFIG.depth?.moleculeHoverBlocksPerRow ?? 5;
        const singleRowMax = CONFIG.depth?.moleculeHoverBlocksSingleRowMax ?? 6;
        const count = this.countAttachedHoverBlocks(item);
        return count > 0 && count <= singleRowMax ? count : maxPerRow;
    },

    shouldUseBlocksHover(item, noteIndex) {
        const mode = CONFIG.depth?.moleculeHoverMode ?? 'mixed';
        if (mode === 'title') return false;
        if (mode === 'blocks') return true;
        const pct = Math.max(0, Math.min(100, CONFIG.depth?.moleculeHoverBlocksPercent ?? 50));
        const key = String(item?.id ?? noteIndex ?? '');
        let h = 2166136261;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return ((h >>> 0) % 100) < pct;
    },

    clearMoleculeHoverLabel(label) {
        if (!label) return;
        label.textContent = '';
        label.replaceChildren();
        label.classList.remove('is-title-chip', 'is-blocks-row', 'note-title', 'note-body', 'is-row-gap-y');
    },

    _macroRowStridePx: 0,

    getMacroRowStridePx() {
        if (this._macroRowStridePx > 0) return this._macroRowStridePx;
        const app = document.getElementById('app');
        if (!app) return 0;
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:var(--site-macro-row-stride);';
        app.appendChild(probe);
        const h = probe.getBoundingClientRect().height;
        probe.remove();
        if (h > 0) this._macroRowStridePx = h;
        return h;
    },

    parseMacroGridRowStart(wrapper) {
        const raw = wrapper?.style?.gridRow;
        if (!raw) return -1;
        const match = String(raw).match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : -1;
    },

    resolveMacroRowGapCenterY(noteIndex) {
        const wrappers = [...document.querySelectorAll('#app .note-wrapper')];
        const wrapper = wrappers[noteIndex];
        if (!wrapper) return null;

        const rect = wrapper.getBoundingClientRect();
        if (rect.height < 1) return null;

        const rowStep = CONFIG.siteGrid?.macroGridRowStep ?? CONFIG.siteGrid?.macroGridStep ?? 2;
        const startRow = this.parseMacroGridRowStart(wrapper);

        if (startRow > 1) {
            const prevWrapper = wrappers.find((w) => this.parseMacroGridRowStart(w) === startRow - rowStep);
            if (prevWrapper) {
                const prevRect = prevWrapper.getBoundingClientRect();
                if (prevRect.height > 0) {
                    return (prevRect.bottom + rect.top) * 0.5;
                }
            }
        }

        const stride = this.getMacroRowStridePx();
        if (stride <= 0) return null;
        const slotHeight = rowStep * stride;
        const margin = (slotHeight - rect.height) * 0.5;
        if (margin <= 0) return null;
        return rect.top - margin * 0.5;
    },

    shouldAlignHoverToMacroRowGap() {
        if (DepthController.currentLevel !== 1) return false;
        if (!document.body.classList.contains('site-grid')) return false;
        const warehouse = typeof ActionWarehouse !== 'undefined' ? ActionWarehouse : null;
        if (!warehouse || typeof warehouse.getCrowdedBlockCount !== 'function') return true;
        return warehouse.getCrowdedBlockCount() === 0;
    },

    positionMoleculeHoverLabel(label, bounds, isLtr, noteIndex = -1) {
        if (!label || !bounds) return;
        const useRowGapY = noteIndex >= 0 && this.shouldAlignHoverToMacroRowGap();
        const gapCenterY = useRowGapY ? this.resolveMacroRowGapCenterY(noteIndex) : null;
        label.classList.toggle('is-row-gap-y', useRowGapY && gapCenterY != null);
        label.style.top = `${gapCenterY ?? bounds.minY}px`;
        label.style.left = `${isLtr ? bounds.minX : bounds.maxX}px`;
    },

    resolveMoleculeHoverTitle(wrapper) {
        if (!wrapper) return null;
        const titleEl = wrapper.querySelector('.layer-full .note-title');
        const title = titleEl?.textContent?.trim();
        if (title) {
            const firstLine = title.split(/\r?\n/)[0].trim();
            if (firstLine) {
                return {
                    text: this.truncateHoverLabel(firstLine),
                    role: 'title'
                };
            }
        }
        const bodyEl = wrapper.querySelector('.layer-full .note-body');
        const body = bodyEl?.textContent?.trim();
        if (body) {
            const firstLine = body.split(/\r?\n/)[0].trim();
            if (firstLine) {
                return {
                    text: this.truncateHoverLabel(firstLine),
                    role: 'body'
                };
            }
        }
        return null;
    },

    updateMoleculeHoverState() {
        const label = this.moleculeHoverTitle;
        const warehouse = typeof ActionWarehouse !== 'undefined' ? ActionWarehouse : null;

        const hideHover = () => {
            this.clearMoleculeHoverLabel(label);
            label?.classList.remove('is-visible');
            warehouse?.clearMoleculeHoverMessage();
            this.hoveredNoteIndex = -1;
            this.moleculeHoverPinnedIndex = -1;
            document.body.classList.remove('is-molecule-hover');
        };

        if (DepthController.currentLevel !== 1 || this.bodiesData.length === 0) {
            hideHover();
            return;
        }

        if (document.body.classList.contains('is-space-pan') ||
            document.body.classList.contains('is-canvas-panning')) {
            hideHover();
            return;
        }

        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(this.mouseClientX, this.mouseClientY)) {
            hideHover();
            return;
        }

        if (typeof isPointOverWarehouseChrome === 'function' &&
            isPointOverWarehouseChrome(this.mouseClientX, this.mouseClientY)) {
            hideHover();
            return;
        }

        const noteIndex = this.hitTestMolecule(this.mouseClientX, this.mouseClientY);
        this.hoveredNoteIndex = noteIndex;
        document.body.classList.toggle('is-molecule-hover', noteIndex >= 0);

        if (!label) return;

        if (noteIndex < 0) {
            this.moleculeHoverPinnedIndex = -1;
            label.classList.remove('is-visible');
            warehouse?.clearMoleculeHoverMessage();
            return;
        }

        if (noteIndex === this.moleculeHoverPinnedIndex && label.classList.contains('is-visible')) {
            return;
        }

        const bounds = this.moleculeViewportBounds(noteIndex);
        const wrapper = document.querySelectorAll('.note-wrapper')[noteIndex];
        const item = typeof MicroMock !== 'undefined' ? MicroMock.resolveItem(wrapper) : null;
        const isLtr = wrapper?.classList.contains('is-note-ltr');
        const hoverMode = CONFIG.depth?.moleculeHoverMode ?? 'title';
        const useBlocks = hoverMode !== 'title'
            && item
            && this.noteHasAttachedBlocks(item)
            && this.shouldUseBlocksHover(item, noteIndex)
            && typeof MicroMock !== 'undefined';

        this.clearMoleculeHoverLabel(label);
        warehouse?.clearMoleculeHoverMessage();

        if (useBlocks) {
            const blocksPerRow = this.resolveMoleculeHoverBlocksPerRow(item);
            label.style.setProperty('--molecule-hover-blocks-per-row', String(blocksPerRow));
            label.innerHTML = MicroMock.buildTagsRowHTML(item);
            label.classList.add('is-blocks-row');
        } else {
            const hoverContent = this.resolveMoleculeHoverTitle(wrapper);
            if (!hoverContent?.text) {
                label.classList.remove('is-visible');
                this.moleculeHoverPinnedIndex = -1;
                return;
            }
            label.textContent = hoverContent.text;
            label.classList.add('is-title-chip');
            label.classList.add(hoverContent.role === 'body' ? 'note-body' : 'note-title');
        }

        if (!bounds) {
            label.classList.remove('is-visible');
            this.moleculeHoverPinnedIndex = -1;
            return;
        }

        label.classList.toggle('is-note-ltr', isLtr);
        label.classList.toggle('is-note-rtl', !isLtr);
        this.positionMoleculeHoverLabel(label, bounds, isLtr, noteIndex);
        label.classList.add('is-visible');
        this.moleculeHoverPinnedIndex = noteIndex;
    }
};

