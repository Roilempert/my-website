/* ==========================================================================
   03f. DEPTH TRANSITION ORCHESTRATOR — scroll → FX → reveal
   ========================================================================== */
const DepthTransitionOrchestrator = {
    _running: false,

    isRunning() {
        return this._running;
    },

    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    run(intent, executeLevelChange, options = {}) {
        if (this._running) return;
        this._running = true;

        CatalogState.rebuildFromWarehouse();

        const tCfg = CONFIG.depth.transition || {};
        const scrollDuration = tCfg.scrollDuration ?? 520;
        const handoffRatio = options.handoffRatio ?? tCfg.handoffRatio ?? 1;
        let handoffDone = false;

        document.body.classList.add('is-depth-transition');

        const finishRun = () => {
            document.body.classList.remove('is-depth-transition');
            document.body.style.removeProperty('--depth-transition-fx');
            document.body.style.removeProperty('--depth-transition-blur');
            this._running = false;
        };

        const maybeHandoff = (t) => {
            if (handoffDone || typeof executeLevelChange !== 'function') return;
            if (handoffRatio >= 1) return;
            if (t < handoffRatio) return;
            handoffDone = true;
            executeLevelChange(intent);
        };

        this._phaseScroll(intent, scrollDuration, () => {
            this._phaseFx(tCfg.fxDuration ?? 480, (t) => {
                maybeHandoff(t);
            }, () => {
                this._phaseReveal(() => {
                    if (!handoffDone && typeof executeLevelChange === 'function') {
                        executeLevelChange(intent);
                    }
                    finishRun();
                });
            });
        });
    },

    runBlockClick(block) {
        if (DepthController.currentLevel !== 1) return;
        if (this.isRunning()) return;
        if (!block || !ActionWarehouse.isBlockClickTransitionEligible(block)) return;
        if (!block.element?.classList.contains('is-deployed')) return;

        CatalogState.rebuildFromWarehouse();

        const useV2 = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        const scrollTarget = useV2
            ? null
            : CatalogLayoutEngine.getScrollTargetForBlock(
                CatalogState.catalogLayout,
                block
            );

        const enterMicroFilterView = () => {
            DepthController.changeLevel(3);
            requestAnimationFrame(() => {
                if (typeof ActionWarehouse !== 'undefined') {
                    ActionWarehouse.syncDeployedBlocksForDepth?.();
                    ActionWarehouse.updateDotFocusFilter();
                }
                if (typeof MicroMock !== 'undefined') {
                    MicroMock.applyAll?.();
                }
                if (typeof AppState !== 'undefined') {
                    AppState.centerCanvasOnLayerEnter();
                }
            });
        };

        this.run({
            type: 'block-click',
            fromLevel: 1,
            toLevel: 3,
            block,
            scrollTarget
        }, enterMicroFilterView);
    },

    runWheelZoom() {
        // Wheel uses MacroMesoBridge / micro reveal directly — no pre-orchestrator
        return false;
    },

    runNoteClick(noteIndex, wrapper) {
        if (DepthController.currentLevel !== 1) return;

        CatalogState.rebuildFromWarehouse();
        const scrollTarget = CatalogLayoutEngine.getScrollTargetForNote(
            noteIndex,
            CatalogState.catalogLayout
        );

        const toLevel = 3;

        this.run({
            type: 'note-click',
            fromLevel: 1,
            toLevel,
            noteIndex,
            wrapper,
            scrollTarget
        }, () => {
            DepthController.changeLevel(toLevel);
            if (wrapper && typeof ArtifactInspector !== 'undefined' &&
                !(typeof NoteCensor !== 'undefined' && NoteCensor.blocksNoteFocus())) {
                requestAnimationFrame(() => {
                    if (DepthController.currentLevel === 3) {
                        ArtifactInspector.open(wrapper);
                    }
                });
            }
        });
    },

    _phaseScroll(intent, duration, onDone) {
        const target = intent.scrollTarget;
        if (!target || !Number.isFinite(target.pageX)) {
            onDone();
            return;
        }

        const startX = window.pageXOffset;
        const startY = window.pageYOffset;
        const destX = target.pageX - window.innerWidth / 2;
        const destY = target.pageY - window.innerHeight / 2;
        const start = performance.now();

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = this.easeInOutCubic(t);
            window.scrollTo(
                startX + (destX - startX) * eased,
                startY + (destY - startY) * eased
            );
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.notifyTransitionTick();
            }
            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                onDone();
            }
        };

        requestAnimationFrame(tick);
    },

    _phaseFx(duration, onTick, onDone) {
        document.body.style.setProperty('--depth-transition-fx', '0');
        document.body.style.setProperty('--depth-transition-blur', '0px');
        const start = performance.now();

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = Math.sin(t * Math.PI);
            const blurPx = eased * 2.5;

            document.body.style.setProperty('--depth-transition-fx', String(eased));
            document.body.style.setProperty('--depth-transition-blur', `${blurPx}px`);

            if (typeof onTick === 'function') onTick(t);

            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.notifyTransitionTick();
            }

            if (t < 1) {
                requestAnimationFrame(tick);
            } else if (typeof onDone === 'function') {
                onDone();
            }
        };

        requestAnimationFrame(tick);
    },

    _phaseReveal(onDone) {
        document.body.style.setProperty('--depth-transition-fx', '0');
        document.body.style.setProperty('--depth-transition-blur', '0px');
        requestAnimationFrame(() => {
            if (typeof onDone === 'function') onDone();
        });
    }
};
