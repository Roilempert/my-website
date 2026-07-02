/* ==========================================================================
   04. DEPTH CONTROLLER (STATE MACHINE - Z AXIS)
   ========================================================================== */
const DepthController = {
    currentLevel: CONFIG.depth.initialLevel,
    minLevel: CONFIG.depth.minLevel,
    maxLevel: CONFIG.depth.maxLevel,
    lastScrollTime: 0,
    cooldownDelay: CONFIG.depth.cooldownDelay,
    _wheelLockUntil: 0,
    _levelChangeActive: false,
    _microRevealRaf: null,
    _microTransitionFrom: null,
    _microTransitionTo: null,

    isMicroTransitionActive() {
        return document.body.classList.contains('is-meso-to-micro');
    },

    isMacroMesoTransitionActive() {
        return document.body.classList.contains('is-macro-to-meso');
    },

    isAnyTransitionActive() {
        return this.isMicroTransitionActive() ||
            this.isMacroMesoTransitionActive() ||
            document.body.classList.contains('is-depth-transition') ||
            MacroMesoBridge.isAnimating() ||
            (typeof DepthTransitionOrchestrator !== 'undefined' &&
                DepthTransitionOrchestrator.isRunning());
    },

    isWheelLocked() {
        return this._levelChangeActive ||
            this.isAnyTransitionActive() ||
            Date.now() < this._wheelLockUntil ||
            (this.currentLevel === 2 &&
                typeof DepthV2 !== 'undefined' &&
                DepthV2.isActive() &&
                !!DepthV2._prepareMesoPromise);
    },

    lockWheelAfterTransition() {
        this._wheelLockUntil = Date.now() + this.cooldownDelay;
        this.lastScrollTime = Date.now();
    },

    beginLevelChange() {
        this._levelChangeActive = true;
        this.lockWheelAfterTransition();
    },

    endLevelChange() {
        this._levelChangeActive = false;
        this.lockWheelAfterTransition();
    },

    syncViewLevelClass(level = this.currentLevel) {
        [1, 2, 3].forEach(l => document.body.classList.remove(`view-level-${l}`));
        document.body.classList.add(`view-level-${level}`);
        if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.setMacroPhysicsActive) {
            PhysicsEngine.setMacroPhysicsActive(level === 1);
        }
        applySiteGridTokens(document.documentElement, level);
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.onLevelChange(level);
        }
        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            DepthV2.onLevelChange(level);
            return;
        }
        this.syncCatalogLayout(level);
    },

    syncCatalogLayout(level = this.currentLevel) {
        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) return;
        if (typeof CatalogLayoutEngine === 'undefined') return;
        if (CatalogLayoutEngine.isLegacyMode()) return;

        if (level >= 2) {
            if (typeof CatalogState !== 'undefined') {
                CatalogState.rebuildFromWarehouse();
            }
            const layout = CatalogState?.catalogLayout;
            if (layout) {
                CatalogLayoutEngine.applyToDom(layout);
            }
        } else if (
            level === 1 &&
            !this.isMacroMesoTransitionActive() &&
            !MacroMesoBridge.isAnimating()
        ) {
            CatalogLayoutEngine.clearFromDom();
        }
    },

    init() {
        document.body.classList.add(`view-level-${this.currentLevel}`);
        try {
            if (typeof DepthV2 !== 'undefined') {
                DepthV2.init();
            }
        } catch (err) {
            console.error('DepthV2.init failed:', err);
        }

        window.addEventListener('keydown', (e) => {
            const keysToBlock = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
            if (keysToBlock.includes(e.code)) e.preventDefault();
        }, { passive: false });
    },

    zoomIn() {
        if (this.currentLevel >= this.maxLevel || this.isWheelLocked()) return false;
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }
        const next = this.currentLevel + 1;
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.runWheelZoom(next)) {
            return false;
        }
        return this.changeLevel(next);
    },

    zoomOut() {
        if (this.currentLevel <= this.minLevel || this.isWheelLocked()) return false;
        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }
        const next = this.currentLevel - 1;
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.runWheelZoom(next)) {
            return false;
        }
        return this.changeLevel(next);
    },

    changeLevel(newLevel) {
        if (this.currentLevel === newLevel) return false;

        const prevLevel = this.currentLevel;
        const isMacroMesoTransition =
            (prevLevel === 1 && newLevel === 2) || (prevLevel === 2 && newLevel === 1);

        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            return this.changeLevelV2(newLevel);
        }

        if (this.isAnyTransitionActive()) {
            if (MacroMesoBridge.isAnimating()) {
                MacroMesoBridge.cancelAnimation();
                SpatialNavigation.resume();
            } else if (typeof DepthTransitionOrchestrator !== 'undefined' &&
                DepthTransitionOrchestrator.isRunning()) {
                return false;
            } else {
                return false;
            }
        }

        const isMicroTransition =
            (prevLevel === 2 && newLevel === 3) || (prevLevel === 3 && newLevel === 2);

        this.beginLevelChange();
        SpatialNavigation.pause();

        if (isMicroTransition) {
            this._microTransitionFrom = prevLevel;
            this._microTransitionTo = newLevel;

            document.body.classList.add('is-meso-to-micro');
            const mesoZoom = getNoteZoomMeso();
            const microZoom = CONFIG.depth.noteZoomMicro ?? 1;
            document.body.style.setProperty('--note-zoom-meso', String(mesoZoom));
            document.body.style.setProperty('--note-zoom-micro', String(microZoom));
            document.body.style.setProperty(
                '--transition-note-zoom',
                String(newLevel === 3 ? mesoZoom : microZoom)
            );
            document.body.style.setProperty('--micro-reveal', newLevel === 3 ? '0' : '1');
            if (CONFIG.depth.layoutMode === 'catalog') {
                document.body.style.setProperty(
                    '--catalog-cell-lerp',
                    String(newLevel === 3 ? getMesoCellRatio() : 1)
                );
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this.runMicroReveal(newLevel === 3, () => {
                        this.currentLevel = newLevel;
                        this.syncViewLevelClass(newLevel);
                        SilhouetteEngine.onLevelEnter(newLevel);
                        ActionWarehouse.updateScrollReserve();
                        ActionWarehouse.updateDotFocusFilter();
                        this.endLevelChange();
                        SpatialNavigation.resume();
                    });
                });
            });

            AppState.centerViewport();
        } else if (isMacroMesoTransition) {
            const zoomIn = newLevel === 2;
            const targetLevel = newLevel;

            const beginBridge = () => {
                MacroMesoBridge.run(zoomIn, () => {
                    this.currentLevel = targetLevel;
                    this.syncViewLevelClass(targetLevel);
                    SilhouetteEngine.onLevelEnter(targetLevel);
                    ActionWarehouse.updateScrollReserve();
                    ActionWarehouse.updateDotFocusFilter();
                    this.endLevelChange();

                    AppState.centerViewport();
                    SpatialNavigation.resume();
                });
            };

            if (zoomIn) {
                const prepMeso = () => {
                    document.body.classList.add('is-silhouette-micro-measure');
                    void document.getElementById('app')?.offsetHeight;
                    return SilhouetteEngine.scheduleBuildAll()
                        .then(() => SilhouetteEngine.ensureAllBuilt());
                };
                prepMeso().then(() => {
                    document.body.classList.remove('is-silhouette-micro-measure');
                    requestAnimationFrame(() => beginBridge());
                }).catch((err) => {
                    console.error('Macro-meso prep failed:', err);
                    this.endLevelChange();
                    SpatialNavigation.resume();
                });
            } else {
                beginBridge();
            }
        } else {
            document.body.classList.remove(`view-level-${prevLevel}`);
            document.body.classList.add(`view-level-${newLevel}`);

            this.currentLevel = newLevel;

            SilhouetteEngine.onLevelEnter(newLevel);
            ActionWarehouse.updateScrollReserve();
            ActionWarehouse.updateDotFocusFilter();

            let startTimestamp = null;
            const duration = CONFIG.depth.cameraLockDuration;
            const lockCameraToCenter = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = timestamp - startTimestamp;

                AppState.centerViewport();

                if (progress < duration) {
                    requestAnimationFrame(lockCameraToCenter);
                } else {
                    if (this.currentLevel === 1) PhysicsEngine.buildWorld();
                    SpatialNavigation.resume();
                    this.endLevelChange();
                }
            };
            requestAnimationFrame(lockCameraToCenter);
        }

        return true;
    },

    // Phase 1: silhouette ↔ text crossfade at fixed scale
    // Phase 2: scale ramp after content has swapped
    runMicroReveal(revealIn, onComplete) {
        if (this._microRevealRaf) {
            cancelAnimationFrame(this._microRevealRaf);
            this._microRevealRaf = null;
        }

        const duration = CONFIG.depth.microRevealDuration;
        const crossfadeEnd = CONFIG.depth.microCrossfadeRatio;
        const mesoZoom = getNoteZoomMeso();
        const microZoom = CONFIG.depth.noteZoomMicro ?? 1;
        const useCatalogCells = CONFIG.depth.layoutMode === 'catalog';
        const mesoCellRatio = getMesoCellRatio();
        const start = performance.now();

        const easeInOutCubic = (t) => (
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        );
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = easeInOutCubic(t);
            const reveal = revealIn ? eased : 1 - eased;

            const zoomPhase = Math.max(0, (easeOutCubic(eased) - crossfadeEnd) / (1 - crossfadeEnd));
            const zoomEased = easeInOutCubic(Math.min(1, zoomPhase));
            const zoom = revealIn
                ? mesoZoom + (microZoom - mesoZoom) * zoomEased
                : microZoom - (microZoom - mesoZoom) * zoomEased;

            const atmosphere = Math.sin(t * Math.PI) * 0.35;

            document.body.style.setProperty('--micro-reveal', String(reveal));
            if (useCatalogCells) {
                const cellLerp = revealIn
                    ? mesoCellRatio + (1 - mesoCellRatio) * zoomEased
                    : 1 - (1 - mesoCellRatio) * zoomEased;
                document.body.style.setProperty('--catalog-cell-lerp', String(cellLerp));
                document.body.style.setProperty('--transition-note-zoom', '1');
            } else {
                document.body.style.setProperty('--transition-note-zoom', String(zoom));
            }
            document.body.style.setProperty('--micro-atmosphere', String(atmosphere));

            if (t < 1) {
                this._microRevealRaf = requestAnimationFrame(tick);
            } else {
                if (typeof onComplete === 'function') onComplete();

                document.body.classList.remove('is-meso-to-micro');
                document.body.style.removeProperty('--micro-reveal');
                document.body.style.removeProperty('--transition-note-zoom');
                document.body.style.removeProperty('--micro-atmosphere');
                document.body.style.removeProperty('--catalog-cell-lerp');
                document.body.style.removeProperty('--note-zoom-meso');
                document.body.style.removeProperty('--note-zoom-micro');

                this._microRevealRaf = null;
                this._microTransitionFrom = null;
                this._microTransitionTo = null;

                SpatialNavigation.resume();
            }
        };

        this._microRevealRaf = requestAnimationFrame(tick);
    },

    /* מעבר מיידי בין שכבות — V2 בלבד (מעברים מורכבים בשלב 2) */
    changeLevelV2(newLevel) {
        const prevLevel = this.currentLevel;

        this.beginLevelChange();
        SpatialNavigation.pause();

        try {
            return this._changeLevelV2Core(newLevel, prevLevel);
        } catch (err) {
            console.error('changeLevelV2 failed:', err);
            this.endLevelChange();
            SpatialNavigation.resume();
            return false;
        }
    },

    _changeLevelV2Core(newLevel, prevLevel) {

        document.body.classList.remove(
            'is-macro-to-meso',
            'is-meso-in-place',
            'is-meso-zoom-out',
            'is-depth-transition',
            'is-catalog-settling',
            'is-macro-grid-settle'
        );

        if (newLevel >= 2 && prevLevel === 1) {
            if (MacroMesoBridge.isAnimating()) {
                MacroMesoBridge.cancelAnimation();
            }
            if (typeof MesoSpatialLayout !== 'undefined') {
                MesoSpatialLayout.captureAndStoreSnapshot();
            }
            if (typeof DepthV2 !== 'undefined') {
                DepthV2.ensureShell();
            }
            PhysicsEngine.setTransitionFrozen(true);
            if (PhysicsEngine.linkCtx) {
                PhysicsEngine.linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            }
            this.currentLevel = newLevel;
            this.syncViewLevelClass(newLevel);
            ActionWarehouse.updateScrollReserve();
            ActionWarehouse.updateDotFocusFilter();
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            requestAnimationFrame(() => {
                AppState.centerMesoViewport();
                requestAnimationFrame(() => {
                    PhysicsEngine.setTransitionFrozen(false);
                    this.endLevelChange();
                    if (typeof SpatialNavigation !== 'undefined') {
                        SpatialNavigation.resume();
                    }
                    const pending = typeof MesoMock !== 'undefined' && MesoMock.hasPendingTextureBakes();
                    if (!pending) {
                        AppState.centerMesoViewport();
                    }
                });
            });
            return true;
        }

        if (prevLevel === 2 && newLevel === 3) {
            this.currentLevel = newLevel;
            this.syncViewLevelClass(newLevel);
            ActionWarehouse.updateScrollReserve();
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            ActionWarehouse.updateDotFocusFilter();
            requestAnimationFrame(() => {
                AppState.centerViewport();
                if (typeof SpatialNavigation !== 'undefined') {
                    SpatialNavigation.resume();
                }
                this.endLevelChange();
            });
            return true;
        }

        if (prevLevel === 3 && newLevel === 2) {
            if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
                ArtifactInspector.close();
            }
            this.currentLevel = newLevel;
            this.syncViewLevelClass(newLevel);
            ActionWarehouse.updateScrollReserve();
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            ActionWarehouse.updateDotFocusFilter();
            requestAnimationFrame(() => {
                AppState.centerMesoViewport();
                if (typeof SpatialNavigation !== 'undefined') {
                    SpatialNavigation.resume();
                }
                this.endLevelChange();
            });
            return true;
        }

        if (newLevel === 1 && prevLevel >= 2) {
            // קודם L1 ב-DOM — רק אז סנכרון פיזיקה (לא buildWorld)
            this.currentLevel = newLevel;
            this.syncViewLevelClass(newLevel);

            const app = document.getElementById('app');
            if (app) void app.offsetHeight;

            requestAnimationFrame(() => {
                PhysicsEngine.setTransitionFrozen(false);
                PhysicsEngine.syncDotTransforms();

                if (ActionWarehouse.workspaceCenters) {
                    ActionWarehouse.refreshWorkspaceGrid();
                    PhysicsEngine.syncDotTransforms();
                }

                const app = document.getElementById('app');
                if (typeof DepthV2 !== 'undefined' && app) {
                    DepthV2.restoreNoteWrapperDomOrder(app);
                    PhysicsEngine.syncDotTransforms();
                }

                ActionWarehouse.updateScrollReserve();
                ActionWarehouse.unmountDeployedBlocksFromDepthBar?.();
                ActionWarehouse.updateDotFocusFilter();
                AppState.centerViewport();
                SpatialNavigation.resume();
                this.endLevelChange();
            });
            return true;
        }

        this.currentLevel = newLevel;
        this.syncViewLevelClass(newLevel);
        ActionWarehouse.updateScrollReserve();
        ActionWarehouse.updateDotFocusFilter();
        AppState.centerViewport();
        SpatialNavigation.resume();
        this.endLevelChange();
        return true;
    }
};

