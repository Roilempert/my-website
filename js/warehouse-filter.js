Object.assign(ActionWarehouse, {
    isNoteFilterAnimating(noteIndex) {
        return this.filterExitByNote.has(noteIndex);
    },

    isNotePhysicsSuspended(noteIndex) {
        return this.isNoteFiltered(noteIndex) || this.isNoteFilterAnimating(noteIndex);
    },

    // Molecule fully on the workspace bank grid — not captured by any block
    isBankGridDot(item) {
        return !!item.onBankGrid;
    },

    // After void expansion — snap settled bank molecules only; skip mid-transit grid dots
    realignBankMolecules(bodiesData) {
        if (!this.workspaceCenters || !bodiesData) return;

        const capturedNotes = new Set();
        bodiesData.forEach(d => {
            if (d.overrideTarget) capturedNotes.add(d.noteIndex);
        });

        const motionCfg = CONFIG.physics.motion;
        const pinLerp = motionCfg.workspaceBankPinLerp ?? 0.14;
        const settleR = CONFIG.warehouse.workspaceGrid.rushSettleRadius ?? scale(10);
        const driftR = motionCfg.workspaceBankDriftRadius ?? scale(28);
        const nearR = Math.max(settleR * 2, driftR * 2);

        let hardSnap = 0;
        let softPin = 0;
        let skipped = 0;
        let maxDelta = 0;

        bodiesData.forEach(item => {
            if (item.isFiltered || item.isFilterExiting || capturedNotes.has(item.noteIndex)) return;
            const home = this.workspaceCenters[item.noteIndex];
            if (!home) return;

            const tx = home.x + item.offsetX;
            const ty = home.y + item.offsetY;
            const bx = item.body.position.x;
            const by = item.body.position.y;
            const dist = Math.hypot(tx - bx, ty - by);

            if (item.onBankGrid || item._bankWasStatic) {
                maxDelta = Math.max(maxDelta, dist);
                if (item.body.isStatic && dist > settleR) {
                    Matter.Body.setStatic(item.body, false);
                }
                if (dist <= settleR * 0.5) {
                    Matter.Body.setPosition(item.body, { x: tx, y: ty });
                } else {
                    const lerp = dist > scale(90)
                        ? 0.28
                        : (dist > scale(35) ? pinLerp * 1.35 : pinLerp);
                    Matter.Body.setPosition(item.body, {
                        x: bx + (tx - bx) * lerp,
                        y: by + (ty - by) * lerp
                    });
                }
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                hardSnap++;
            } else if (dist < nearR) {
                Matter.Body.setPosition(item.body, {
                    x: bx + (tx - bx) * pinLerp,
                    y: by + (ty - by) * pinLerp
                });
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                softPin++;
            } else {
                skipped++;
            }
        });
        this.refreshPhysicsFlags(bodiesData);

        window.__physDbgRealign = {
            ts: performance.now(),
            hardSnap,
            softPin,
            skipped,
            maxDelta
        };
    },

    getNoteWrapper(noteIndex) {
        const byData = document.querySelector(
            `.note-wrapper[data-note-index="${noteIndex}"]`
        );
        if (byData) return byData;
        return document.querySelectorAll('.note-wrapper')[noteIndex] || null;
    },

    restoreAllFilterVisuals(bodiesData) {
        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            wrapper.classList.remove(
                'is-molecule-filtered-out',
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );
        });
        if (!bodiesData) return;
        bodiesData.forEach(item => {
            item.isFiltered = false;
            item.isFilterExiting = false;
        });
    },

    cancelFilterExit(noteIndex, bodiesData) {
        this.filterExitByNote.delete(noteIndex);
        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );
        }
        if (bodiesData) {
            this.reenterMoleculeFromBank(noteIndex, bodiesData);
        }
    },

    reenterMoleculeFromBank(noteIndex, bodiesData) {
        if (!this.workspaceCenters) {
            this.workspaceCenters = this.computeWorkspaceGrid();
        }

        const cfg = CONFIG.warehouse.filterExit;
        const app = document.getElementById('app');
        const appRect = app ? app.getBoundingClientRect() : null;
        const canvasLeft = appRect ? appRect.left + window.pageXOffset : 0;
        const canvasRight = appRect ? canvasLeft + appRect.width : window.innerWidth;

        const noteCount = PhysicsEngine.noteCenters.length;
        const half = Math.ceil(noteCount / 2);
        const isLeftBank = noteIndex < half;
        const home = this.workspaceCenters && this.workspaceCenters[noteIndex];
        const offScreenPad = cfg.restoreOffScreenPad;

        bodiesData.forEach(item => {
            if (item.noteIndex !== noteIndex) return;

            let spawnX;
            let spawnY;
            if (home) {
                spawnX = home.x + item.offsetX;
                spawnY = home.y + item.offsetY;
            } else {
                spawnX = item.physicsTargetX;
                spawnY = item.physicsTargetY;
            }

            spawnX = isLeftBank
                ? Math.min(spawnX, canvasLeft) - offScreenPad
                : Math.max(spawnX, canvasRight) + offScreenPad;

            Matter.Body.setPosition(item.body, { x: spawnX, y: spawnY });
            Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
            item.overrideTarget = null;
            item.smoothTarget = null;
            item.isFiltered = false;
            item.isFilterExiting = false;
        });
    },

    restoreFilteredNote(noteIndex, bodiesData) {
        this.filteredNoteIndices.delete(noteIndex);
        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) wrapper.classList.remove('is-molecule-filtered-out');
        if (bodiesData) {
            this.reenterMoleculeFromBank(noteIndex, bodiesData);
        }
    },

    // L2/L3 — instant filter (no peel animation)
    applyFilterInstant(noteIndex, bodiesData) {
        if (this.filteredNoteIndices.has(noteIndex)) return;

        this.filterExitByNote.delete(noteIndex);

        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade',
                'is-molecule-focused',
                'is-molecule-muted'
            );
            wrapper.classList.add('is-molecule-filtered-out');
        }

        this.filteredNoteIndices.add(noteIndex);

        if (bodiesData) {
            bodiesData.forEach(item => {
                if (item.noteIndex !== noteIndex) return;
                item.isFiltered = true;
                item.isFilterExiting = false;
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                item.overrideTarget = null;
                item.smoothTarget = null;
            });
        }
    },

    beginFilterExit(noteIndex, bodiesData) {
        if (this.filterExitByNote.has(noteIndex) || this.filteredNoteIndices.has(noteIndex)) return;

        this.filterExitByNote.set(noteIndex, {
            phase: 'hollow',
            phaseStart: performance.now()
        });

        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtered-out',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade',
                'is-molecule-focused',
                'is-molecule-muted'
            );
            wrapper.classList.add('is-molecule-filtering-hollow');
            wrapper.querySelectorAll('.layer-dot').forEach(dot => {
                dot.classList.remove('is-dot-focused');
                dot.classList.add('is-dot-muted');
            });
        }

        if (bodiesData) {
            bodiesData.forEach(item => {
                if (item.noteIndex !== noteIndex) return;
                item.isFilterExiting = true;
                item.isFiltered = false;
                item.overrideTarget = null;
                item.smoothTarget = null;
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
            });
        }
    },

    igniteFilterPeel(noteIndex, bodiesData) {
        const cfg = CONFIG.warehouse.filterExit;
        const dots = bodiesData.filter(d => d.noteIndex === noteIndex);
        if (dots.length === 0) return;

        const app = document.getElementById('app');
        const appRect = app ? app.getBoundingClientRect() : null;
        const canvasCenterX = appRect
            ? appRect.left + window.pageXOffset + appRect.width / 2
            : window.innerWidth / 2;

        let cx = 0;
        dots.forEach(d => { cx += d.body.position.x; });
        cx /= dots.length;

        const dirX = cx < canvasCenterX ? -1 : 1;

        dots.forEach(d => {
            const jitter = cfg.peelJitter;
            const vx = dirX * cfg.peelSpeed + (Math.random() - 0.5) * jitter * 0.15;
            const vy = (Math.random() - 0.5) * jitter;

            Matter.Body.setVelocity(d.body, { x: vx, y: vy });
            Matter.Body.set(d.body, { frictionAir: cfg.peelFrictionAir });
            d.overrideTarget = null;
            d.smoothTarget = null;
            d.isFilterExiting = true;
        });
    },

    completeFilterExit(noteIndex, bodiesData) {
        this.filterExitByNote.delete(noteIndex);
        this.filteredNoteIndices.add(noteIndex);

        const wrapper = this.getNoteWrapper(noteIndex);
        if (wrapper) {
            wrapper.classList.remove(
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );
            wrapper.classList.add('is-molecule-filtered-out');
        }

        if (bodiesData) {
            bodiesData.forEach(item => {
                if (item.noteIndex !== noteIndex) return;
                item.isFiltered = true;
                item.isFilterExiting = false;
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
                item.overrideTarget = null;
                item.smoothTarget = null;
            });
        }
    },

    buildCooccurrenceSets(activeTags, activeAuthors) {
        const coTags = new Set();
        const coAuthors = new Set();
        const items = typeof AppState !== 'undefined' ? AppState.items : [];

        items.forEach(item => {
            const noteTags = (item.tags || []).map(t => t.name).filter(Boolean);
            const author = item.authorCode || '';

            if (!this.noteMatchesActiveFocus(
                noteTags, author, activeTags, activeAuthors
            )) return;

            noteTags.forEach(tag => coTags.add(tag));
            if (author) coAuthors.add(author);
        });

        return { coTags, coAuthors };
    },

    isBlockDockedInTray(block) {
        if (!block?.element || block.nestedIn) return false;
        if (block.state !== 'docked') return false;
        if (block.element.classList.contains('is-deployed')) return false;
        if (block.element.classList.contains('is-depth-ui-mounted')) return false;
        if (block.element.classList.contains('is-dragging')) return false;
        return block.type === 'tag' || block.type === 'author';
    },

    isDockBlockCoRelevant(block, coTags, coAuthors) {
        if (block.type === 'tag' && block.tag) return coTags.has(block.tag);
        if (block.type === 'author' && block.author) return coAuthors.has(block.author);
        return true;
    },

    shouldUseCooccurrenceDockMute() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        const isV2Depth = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        if (!isV2Depth || level < 2 || level > 3) return false;
        const { tags, authors } = this.getActiveFocusCriteria();
        return tags.size > 0 || authors.size > 0;
    },

    updateWarehouseBlockRelevance() {
        const useCooccurrence = this.shouldUseCooccurrenceDockMute();
        if (this.dockElement) {
            this.dockElement.classList.toggle('is-cooccurrence-filter', useCooccurrence);
        }
        if (this.launcherWrapElement) {
            this.launcherWrapElement.classList.toggle('is-cooccurrence-filter', useCooccurrence);
        }

        if (!useCooccurrence) {
            this.blocks.forEach(block => {
                block.element?.classList.remove('is-dock-irrelevant');
                block.slotElement?.classList.remove('is-dock-irrelevant');
            });
            this.restoreDockTrayOrder();
            this.restoreDepthBlockBarOrder();
            return;
        }

        const { tags: activeTags, authors: activeAuthors } =
            this.getActiveFocusCriteria();
        const { coTags, coAuthors } =
            this.buildCooccurrenceSets(activeTags, activeAuthors);

        this.blocks.forEach(block => {
            if (!this.isBlockDockedInTray(block)) {
                block.element?.classList.remove('is-dock-irrelevant');
                block.slotElement?.classList.remove('is-dock-irrelevant');
                return;
            }

            const irrelevant = !this.isDockBlockCoRelevant(block, coTags, coAuthors);
            block.element.classList.toggle('is-dock-irrelevant', irrelevant);
            block.slotElement?.classList.toggle('is-dock-irrelevant', irrelevant);
        });

        this.reorderDockTrayByRelevance(coTags, coAuthors);
        this.reorderDepthBlockBar(coTags, coAuthors);
    },

    getDepthBarDeployedBlocks() {
        if (!this.depthBlockBarElement) return [];
        return this.blocks.filter(block =>
            block.state === 'active' &&
            block.element?.classList.contains('is-deployed') &&
            block.element?.classList.contains('is-depth-ui-mounted') &&
            !block.nestedIn &&
            block.element.parentNode === this.depthBlockBarElement
        );
    },

    getBlockCatalogOrderIndex(block) {
        this.ensureDockTrayBaseOrder();
        const baseIdx = this._dockTrayBaseOrder?.indexOf(block);
        if (baseIdx >= 0) return baseIdx;
        const blocksIdx = this.blocks.indexOf(block);
        return blocksIdx >= 0 ? blocksIdx : 9999;
    },

    reorderDepthBlockBar(coTags, coAuthors) {
        if (!this.depthBlockBarElement) return;

        const deployed = this.getDepthBarDeployedBlocks();
        if (!deployed.length) return;

        const { tags: activeTags, authors: activeAuthors } =
            this.getActiveFocusCriteria();

        const rank = (block) => {
            const isPrimaryFocus =
                (block.type === 'tag' && activeTags.has(block.tag)) ||
                (block.type === 'author' && activeAuthors.has(block.author));
            if (isPrimaryFocus) return 0;
            if (block.type === 'frame') return 1;
            if (this.isDockBlockCoRelevant(block, coTags, coAuthors)) return 2;
            return 3;
        };

        deployed.sort((a, b) => {
            const byRank = rank(a) - rank(b);
            if (byRank !== 0) return byRank;
            return this.getBlockCatalogOrderIndex(a) - this.getBlockCatalogOrderIndex(b);
        });

        deployed.forEach(block => {
            this.depthBlockBarElement.appendChild(block.element);
        });
    },

    restoreDepthBlockBarOrder() {
        const deployed = this.getDepthBarDeployedBlocks();
        if (!deployed.length) return;

        deployed.sort(
            (a, b) => this.getBlockCatalogOrderIndex(a) - this.getBlockCatalogOrderIndex(b)
        );
        deployed.forEach(block => {
            this.depthBlockBarElement.appendChild(block.element);
        });
    },

    tickFilterExit(bodiesData) {
        if (this.filterExitByNote.size === 0) return;

        const cfg = CONFIG.warehouse.filterExit;
        const now = performance.now();
        const toComplete = [];

        this.filterExitByNote.forEach((state, noteIndex) => {
            const elapsed = now - state.phaseStart;

            if (state.phase === 'hollow' && elapsed >= cfg.hollowDuration) {
                state.phase = 'peel';
                state.phaseStart = now;

                const wrapper = this.getNoteWrapper(noteIndex);
                if (wrapper) {
                    wrapper.classList.remove('is-molecule-filtering-hollow');
                    wrapper.classList.add('is-molecule-filtering-peel');
                    requestAnimationFrame(() => wrapper.classList.add('is-filter-peel-fade'));
                }
                this.igniteFilterPeel(noteIndex, bodiesData);
            } else if (state.phase === 'peel' && elapsed >= cfg.peelDuration) {
                toComplete.push(noteIndex);
            }
        });

        toComplete.forEach(noteIndex => this.completeFilterExit(noteIndex, bodiesData));
    },
});
