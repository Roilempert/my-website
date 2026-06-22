/* ==========================================================================
   03c. MACRO ↔ MESO BRIDGE — in-place reveal, then micro grid (L3 layout)
   ========================================================================== */
const MacroMesoBridge = {
    anchors: [],
    _raf: null,
    _safetyTimer: null,

    isActive() {
        return document.body.classList.contains('is-meso-in-place');
    },

    isAnimating() {
        return this._raf != null || document.body.classList.contains('is-macro-to-meso');
    },

    isZoomOutActive() {
        return document.body.classList.contains('is-meso-zoom-out');
    },

    isMacroVisualActive() {
        return DepthController.currentLevel === 1 || this.isZoomOutActive();
    },

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    easeOutQuart(t) {
        return 1 - Math.pow(1 - t, 4);
    },

    noteRevealEase(zoomIn, t) {
        return zoomIn ? this.easeOutQuart(t) : this.easeInOutCubic(t);
    },

    masterEase(zoomIn, t) {
        return zoomIn ? this.easeOutQuart(t) : this.easeInOutCubic(t);
    },

    setMacroMesoAtmosphere(master) {
        const m = Math.max(0, Math.min(1, master));
        document.body.style.setProperty('--macro-meso-master', String(m));
        document.body.style.setProperty(
            '--macro-meso-link-fade',
            String(Math.max(0, 1 - m * 1.15))
        );
    },

    clearMacroMesoAtmosphere() {
        document.body.style.removeProperty('--macro-meso-master');
        document.body.style.removeProperty('--macro-meso-link-fade');
        document.body.style.removeProperty('--catalog-settle-progress');
    },

    cancelAnimation() {
        if (this._safetyTimer) {
            clearTimeout(this._safetyTimer);
            this._safetyTimer = null;
        }
        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
        document.body.classList.remove('is-macro-to-meso', 'is-meso-in-place', 'is-meso-zoom-out');
        document.body.style.removeProperty('--macro-meso-block-opacity');
        this.clearMesoAnchors();
        if (typeof CatalogLayoutEngine !== 'undefined') {
            CatalogLayoutEngine.clearFromDom();
        }
        this.clearMacroMesoAtmosphere();
        if (typeof DepthController !== 'undefined' &&
            !(typeof DepthV2 !== 'undefined' && DepthV2.isActive())) {
            DepthController.syncViewLevelClass(DepthController.currentLevel);
        }
        PhysicsEngine.setTransitionFrozen(false);
    },

    getVisualMoleculeCenter(noteIndex, wrapper) {
        if (DepthController.currentLevel >= 2) {
            return this.getWrapperPageCenter(wrapper);
        }

        const dots = PhysicsEngine.bodiesData.filter(
            d => d.noteIndex === noteIndex && !d.isFiltered && !d.isFilterExiting
        );

        if (dots.length > 0) {
            let x = 0;
            let y = 0;
            dots.forEach(d => {
                const r = d.element.getBoundingClientRect();
                x += r.left + r.width / 2;
                y += r.top + r.height / 2;
            });
            return {
                pageX: x / dots.length + window.pageXOffset,
                pageY: y / dots.length + window.pageYOffset
            };
        }

        return this.getWrapperPageCenter(wrapper);
    },

    getWrapperPageCenter(wrapper) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        return {
            pageX: rect.left + window.pageXOffset + rect.width / 2,
            pageY: rect.top + window.pageYOffset + rect.height / 2
        };
    },

    captureAnchors() {
        const wrappers = document.querySelectorAll('.note-wrapper');
        const notes = [];
        let cellSize = 0;

        wrappers.forEach((wrapper, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) return;

            const center = this.getVisualMoleculeCenter(noteIndex, wrapper);
            if (!center) return;

            const rect = wrapper.getBoundingClientRect();
            if (rect.width > 0) cellSize = Math.max(cellSize, rect.width);

            notes.push({
                noteIndex,
                wrapper,
                pageX: center.pageX,
                pageY: center.pageY
            });
        });

        const sorted = [...notes].sort((a, b) => {
            if (Math.abs(a.pageX - b.pageX) > 12) return b.pageX - a.pageX;
            return a.pageY - b.pageY;
        });

        const rankByNote = new Map(sorted.map((n, rank) => [n.noteIndex, rank]));
        notes.forEach(n => {
            n.rank = rankByNote.get(n.noteIndex) ?? 0;
        });

        return { notes, cellSize: cellSize || scale(108) };
    },

    pageToAppLocal(pageX, pageY) {
        const app = document.getElementById('app');
        if (!app) return { x: pageX, y: pageY };
        const rect = app.getBoundingClientRect();
        return {
            x: pageX - window.pageXOffset - rect.left,
            y: pageY - window.pageYOffset - rect.top
        };
    },

    freezeDotsForTransition() {
        PhysicsEngine.bodiesData.forEach(item => {
            if (item.isFiltered || item.isFilterExiting) return;
            item.element.style.setProperty('--phys-x', '0px');
            item.element.style.setProperty('--phys-y', '0px');
        });
    },

    // Align physics bodies + cssOrigin to meso anchor before L2→L1 reveal
    reseedPhysicsFromAnchors(notes) {
        const byNote = new Map(notes.map(n => [n.noteIndex, n]));

        PhysicsEngine.bodiesData.forEach(item => {
            const anchor = byNote.get(item.noteIndex);
            if (!anchor) return;

            item.cssOriginX = anchor.pageX;
            item.cssOriginY = anchor.pageY;
            item.physicsTargetX = anchor.pageX + item.offsetX;
            item.physicsTargetY = anchor.pageY + item.offsetY;

            Matter.Body.setPosition(item.body, {
                x: item.physicsTargetX,
                y: item.physicsTargetY
            });
            Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
        });
    },

    applyAnchors(notes, cellSize) {
        const useCatalogMeso = typeof CatalogLayoutEngine !== 'undefined' &&
            !CatalogLayoutEngine.isLegacyMode() &&
            CONFIG.depth.layoutMode === 'catalog';

        if (useCatalogMeso && typeof applyMesoAnchorTokens === 'function') {
            applyMesoAnchorTokens();
        } else if (cellSize > 0) {
            document.documentElement.style.setProperty('--meso-anchor-w', `${cellSize}px`);
            document.documentElement.style.setProperty('--meso-anchor-h', `${cellSize}px`);
        }

        const mesoCell = useCatalogMeso ? getMesoRevealCellSize() : null;
        const anchorW = mesoCell?.width ?? cellSize;
        const anchorH = mesoCell?.height ?? cellSize;
        const halfW = anchorW / 2;
        const halfH = anchorH / 2;
        const pad = scale(120);
        let maxX = 0;
        let maxY = 0;

        notes.forEach(note => {
            const local = this.pageToAppLocal(note.pageX, note.pageY);
            note.localX = local.x;
            note.localY = local.y;

            note.wrapper.classList.add('is-meso-anchored');
            note.wrapper.style.left = `${local.x}px`;
            note.wrapper.style.top = `${local.y}px`;
            note.wrapper.style.setProperty('--macro-meso-reveal', '0');

            maxX = Math.max(maxX, local.x + halfW);
            maxY = Math.max(maxY, local.y + halfH);
        });

        const app = document.getElementById('app');
        if (app) {
            app.style.minHeight = `${Math.max(window.innerHeight, maxY + pad)}px`;
        }

        this.anchors = notes;
    },

    clearMesoAnchors() {
        document.querySelectorAll('.note-wrapper.is-meso-anchored').forEach(wrapper => {
            wrapper.classList.remove('is-meso-anchored');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.removeProperty('--macro-meso-reveal');
        });

        const app = document.getElementById('app');
        if (app && !CatalogLayoutEngine.isCatalogLayoutActive()) {
            app.style.minHeight = '';
        }

        document.documentElement.style.removeProperty('--meso-anchor-w');
        document.documentElement.style.removeProperty('--meso-anchor-h');
        this.anchors = [];
    },

    clearAnchors() {
        this.clearMesoAnchors();
    },

    finishZoomInToLevel2(onComplete) {
        if (typeof CatalogLayoutEngine !== 'undefined' &&
            !CatalogLayoutEngine.isLegacyMode()) {
            this.runCatalogSettle(onComplete);
            return;
        }

        const handoff = () => {
            this.clearAnchors();
            document.body.classList.remove('is-meso-in-place');
            if (typeof DepthController !== 'undefined') {
                DepthController.syncViewLevelClass(2);
            } else {
                document.body.classList.remove('view-level-1');
                document.body.classList.add('view-level-2');
            }
            if (typeof onComplete === 'function') onComplete();
        };

        requestAnimationFrame(() => requestAnimationFrame(handoff));
    },

    runCatalogSettle(onComplete) {
        CatalogState.rebuildFromWarehouse();
        const layout = CatalogState.catalogLayout;
        const duration = CONFIG.depth.catalogSettleDuration ?? 640;
        const start = performance.now();
        document.body.classList.add('is-catalog-settling');

        const targets = this.anchors.map(note => {
            const entry = layout?.entries?.get(note.noteIndex);
            return {
                note,
                fromX: note.localX,
                fromY: note.localY,
                toX: entry?.localX ?? note.localX,
                toY: entry?.localY ?? note.localY
            };
        });

        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = this.easeOutCubic(t);
            document.body.style.setProperty('--catalog-settle-progress', String(eased));

            targets.forEach(({ note, fromX, fromY, toX, toY }) => {
                const x = fromX + (toX - fromX) * eased;
                const y = fromY + (toY - fromY) * eased;
                note.wrapper.style.left = `${x}px`;
                note.wrapper.style.top = `${y}px`;
                note.localX = x;
                note.localY = y;
            });

            if (t < 1) {
                this._raf = requestAnimationFrame(tick);
            } else {
                this._raf = null;
                document.body.classList.remove('is-catalog-settling');
                if (layout) {
                    CatalogLayoutEngine.applyToDom(layout);
                }
                this.clearMesoAnchors();
                document.body.classList.remove('is-meso-in-place');
                if (typeof DepthController !== 'undefined') {
                    DepthController.syncViewLevelClass(2);
                } else {
                    document.body.classList.remove('view-level-1');
                    document.body.classList.add('view-level-2');
                }
                this.clearMacroMesoAtmosphere();
                if (typeof onComplete === 'function') onComplete();
            }
        };

        this._raf = requestAnimationFrame(tick);
    },

    run(zoomIn, onComplete) {
        this.cancelAnimation();

        PhysicsEngine.setTransitionFrozen(true);

        const duration = CONFIG.depth.macroMesoRevealDuration;
        const stagger = CONFIG.depth.macroMesoStagger;
        const staggerCap = CONFIG.depth.macroMesoStaggerCap;
        const totalDuration = duration + staggerCap * stagger;

        SpatialNavigation.bypassScrollClamp(totalDuration + 150);

        const finishTransition = () => {
            if (this._safetyTimer) {
                clearTimeout(this._safetyTimer);
                this._safetyTimer = null;
            }
            document.body.classList.remove('is-macro-to-meso', 'is-meso-zoom-out');
            document.body.style.removeProperty('--macro-meso-block-opacity');
            this.clearMacroMesoAtmosphere();
            this._raf = null;
            PhysicsEngine.setTransitionFrozen(false);
            if (typeof onComplete === 'function') onComplete();
        };

        this._safetyTimer = setTimeout(() => {
            if (!this._raf && !document.body.classList.contains('is-macro-to-meso')) return;
            this.cancelAnimation();
            finishTransition();
        }, totalDuration + 600);

        if (zoomIn) {
            this.freezeDotsForTransition();

            const useCatalogMeso = typeof CatalogLayoutEngine !== 'undefined' &&
                !CatalogLayoutEngine.isLegacyMode() &&
                CONFIG.depth.layoutMode === 'catalog';

            if (useCatalogMeso) {
                if (typeof CatalogState !== 'undefined') {
                    CatalogState.rebuildFromWarehouse();
                }
                document.body.classList.add('is-catalog-layout');
                if (typeof applyCatalogCellTokens === 'function') {
                    applyCatalogCellTokens();
                }
                if (typeof applyMesoAnchorTokens === 'function') {
                    applyMesoAnchorTokens();
                }
                const app = document.getElementById('app');
                if (app) {
                    app.style.display = 'block';
                    app.style.position = 'relative';
                }
            }

            const { notes, cellSize } = this.captureAnchors();
            document.body.classList.add('is-macro-to-meso', 'is-meso-in-place');
            document.body.style.setProperty(
                '--macro-meso-block-opacity',
                String(CONFIG.depth.macroMesoBlockOpacity)
            );
            this.applyAnchors(notes, cellSize);
            this.setMacroMesoAtmosphere(0);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const start = performance.now();
                    const tick = (now) => {
                        const elapsed = now - start;
                        const master = Math.min(1, elapsed / totalDuration);
                        this.setMacroMesoAtmosphere(this.masterEase(true, master));

                        this.anchors.forEach(note => {
                            const localStart = Math.min(note.rank, staggerCap) * stagger;
                            const t = Math.min(1, Math.max(0, (elapsed - localStart) / duration));
                            const eased = this.noteRevealEase(true, t);
                            note.wrapper.style.setProperty('--macro-meso-reveal', String(eased));
                        });

                        if (elapsed < totalDuration) {
                            this._raf = requestAnimationFrame(tick);
                        } else {
                            this.anchors.forEach(note => {
                                note.wrapper.style.setProperty('--macro-meso-reveal', '1');
                            });
                            this.finishZoomInToLevel2(finishTransition);
                        }
                    };
                    this._raf = requestAnimationFrame(tick);
                });
            });
        } else {
            const { notes, cellSize } = this.captureAnchors();
            this.reseedPhysicsFromAnchors(notes);
            PhysicsEngine.syncDotTransforms();

            document.body.classList.add('is-macro-to-meso', 'is-meso-in-place', 'is-meso-zoom-out');
            this.applyAnchors(notes, cellSize);

            document.body.style.setProperty(
                '--macro-meso-block-opacity',
                String(CONFIG.depth.macroMesoBlockOpacity)
            );
            this.anchors.forEach(note => {
                note.wrapper.style.setProperty('--macro-meso-reveal', '1');
            });
            this.setMacroMesoAtmosphere(1);

            requestAnimationFrame(() => {
                const start = performance.now();
                const tick = (now) => {
                    const elapsed = now - start;
                    const master = Math.min(1, elapsed / totalDuration);
                    this.setMacroMesoAtmosphere(1 - this.masterEase(false, master));

                    this.anchors.forEach(note => {
                        const localStart = Math.min(note.rank, staggerCap) * stagger;
                        const t = Math.min(1, Math.max(0, (elapsed - localStart) / duration));
                        const eased = this.noteRevealEase(false, t);
                        note.wrapper.style.setProperty('--macro-meso-reveal', String(1 - eased));
                    });

                    if (elapsed < totalDuration) {
                        this._raf = requestAnimationFrame(tick);
                    } else {
                        this._raf = null;
                        document.body.classList.add('is-macro-grid-settle');
                        document.body.classList.remove('is-meso-in-place', 'is-meso-zoom-out');
                        if (typeof DepthController !== 'undefined') {
                            DepthController.syncViewLevelClass(1);
                        } else {
                            document.body.classList.remove('view-level-2');
                            document.body.classList.add('view-level-1');
                        }
                        this.clearAnchors();
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                DepthController.currentLevel = 1;
                                if (typeof CatalogLayoutEngine !== 'undefined') {
                                    CatalogLayoutEngine.clearFromDom();
                                }
                                PhysicsEngine.buildWorld();
                                PhysicsEngine.syncDotTransforms();
                                PhysicsEngine.flushMacroCanvas();
                                ActionWarehouse.refreshWorkspaceGrid();
                                document.body.classList.remove('is-macro-grid-settle');
                                finishTransition();
                            });
                        });
                    }
                };
                this._raf = requestAnimationFrame(tick);
            });
        }
    }
};

