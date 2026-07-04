Object.assign(ActionWarehouse, {
    isWorkspaceGridRush() {
        return !!this.workspaceGridRush && performance.now() < this.workspaceGridRushUntil;
    },

    // Positional migration between original grid and workspace grid (first block only / last return)
    tickWorkspaceGridRush(bodiesData) {
        const mode = this.workspaceGridRush;
        if (!mode) return;

        if (performance.now() >= this.workspaceGridRushUntil) {
            this.workspaceGridRush = null;
            return;
        }

        const cfg = CONFIG.warehouse.workspaceGrid;
        const centers = this.workspaceCenters;
        const baseLerp = cfg.rushLerp ?? 0.28;
        const nearLerp = cfg.rushLerpNear ?? 0.16;
        const farR = scale(110);
        let allSettled = true;

        bodiesData.forEach(item => {
            if (item.overrideTarget) return;

            let targetX;
            let targetY;

            if (mode === 'out' || mode === 'shift') {
                const home = centers && centers[item.noteIndex];
                if (!home) {
                    allSettled = false;
                    return;
                }
                targetX = home.x + item.offsetX;
                targetY = home.y + item.offsetY;
            } else {
                targetX = item.physicsTargetX;
                targetY = item.physicsTargetY;
            }

            const body = item.body;
            const dx = targetX - body.position.x;
            const dy = targetY - body.position.y;
            const dist = Math.hypot(dx, dy);

            if (dist > cfg.rushSettleRadius) allSettled = false;

            let lerp = baseLerp;
            if (dist > farR) {
                lerp = Math.min(0.38, baseLerp * 1.3);
            } else if (dist < cfg.rushSettleRadius * 2.5) {
                lerp = nearLerp;
            }

            if (body.isStatic) Matter.Body.setStatic(body, false);
            Matter.Body.setPosition(body, {
                x: body.position.x + dx * lerp,
                y: body.position.y + dy * lerp
            });
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
        });

        if (allSettled) this.workspaceGridRush = null;
    },

    // Recomputed after world rebuilds (e.g. window resize) while engaged
    refreshWorkspaceGrid() {
        if (this.workspaceCenters) {
            this.workspaceCenters = this.computeWorkspaceGrid({ relayout: false });
            this.realignBankMolecules(PhysicsEngine.bodiesData);
        }
    },

    getWorkspaceVoidRatio() {
        const cfg = CONFIG.warehouse.workspaceGrid;
        const activeCount = Math.max(1, this.getCrowdedBlockCount());
        return Math.min(
            cfg.voidViewportRatioMax,
            cfg.voidViewportRatioBase + (activeCount - 1) * cfg.voidViewportRatioPerBlock
        );
    },

    getWorkspaceCanvasRect() {
        const appRect = document.getElementById('app').getBoundingClientRect();
        return {
            left: appRect.left + window.pageXOffset,
            top: appRect.top + window.pageYOffset,
            W: appRect.width,
            H: appRect.height
        };
    },

    // Reapply frozen slot assignments with current void width (and canvas rect on resize)
    applyWorkspaceVoidExpansion() {
        const layout = this.workspaceSlotLayout;
        if (!layout) return null;

        const { padding: gridPadding } = this.getPrimaryGridMetrics();
        const { left, top, W, H } = this.getWorkspaceCanvasRect();
        const voidW = window.innerWidth * this.getWorkspaceVoidRatio();
        const bankW = Math.max(scale(48), (W - voidW) / 2 - gridPadding);

        const centers = [];

        const placeBankSlots = (bank, cell, slotEntries) => {
            const cols = Math.max(1, Math.floor(bankW / cell));
            const count = slotEntries.length;
            const rows = Math.max(1, Math.ceil(count / cols));
            const originY = top + (H - rows * cell) / 2;

            slotEntries.forEach((entry, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = bank === 'left'
                    ? left + gridPadding + col * cell + cell / 2
                    : left + W - gridPadding - col * cell - cell / 2;
                const y = originY + row * cell + cell / 2;
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    centers[entry.noteIndex] = { x, y };
                }
            });
        };

        const leftSlots = [];
        const rightSlots = [];
        layout.slots.forEach((slot, noteIndex) => {
            const entry = { noteIndex, row: slot.row, col: slot.col };
            if (slot.bank === 'left') leftSlots.push(entry);
            else rightSlots.push(entry);
        });

        leftSlots.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
        rightSlots.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));

        placeBankSlots('left', layout.leftCell ?? layout.cell, leftSlots);
        placeBankSlots('right', layout.rightCell ?? layout.cell, rightSlots);

        return this.relaxBankGridCenters(centers);
    },

    // Pre-separate bank slot centers so hull outlines sit side-by-side, not stacked
    relaxBankGridCenters(centers) {
        if (!centers || !this.workspaceSlotLayout) return centers;

        const orbitCfg = CONFIG.warehouse.orbit;
        const hullCfg = CONFIG.physics.hullCollision;
        const bodiesData = PhysicsEngine.bodiesData;
        const { half } = this.workspaceSlotLayout;
        const gap = hullCfg.gap;
        const strength = 0.48;
        const passes = 12;

        const relaxSide = (indices) => {
            const mols = indices
                .filter(i => centers[i])
                .map(noteIndex => ({
                    noteIndex,
                    cx: centers[noteIndex].x,
                    cy: centers[noteIndex].y,
                    radius: this.noteMoleculeExtent(bodiesData, noteIndex, orbitCfg)
                }));

            for (let pass = 0; pass < passes; pass++) {
                for (let i = 0; i < mols.length; i++) {
                    for (let j = i + 1; j < mols.length; j++) {
                        const a = mols[i];
                        const b = mols[j];
                        const dx = b.cx - a.cx;
                        const dy = b.cy - a.cy;
                        const dist = Math.hypot(dx, dy) || 0.01;
                        const minD = a.radius + b.radius + gap;
                        const overlap = minD - dist;
                        if (overlap <= 0) continue;

                        const nx = dx / dist;
                        const ny = dy / dist;
                        const push = overlap * strength * 0.5;
                        a.cx -= nx * push;
                        a.cy -= ny * push;
                        b.cx += nx * push;
                        b.cy += ny * push;
                    }
                }
            }

            mols.forEach(m => {
                centers[m.noteIndex] = { x: m.cx, y: m.cy };
            });
        };

        const left = [];
        const right = [];
        for (let i = 0; i < centers.length; i++) {
            if (!centers[i]) continue;
            (i < half ? left : right).push(i);
        }
        relaxSide(left);
        relaxSide(right);
        return centers;
    },

    maxBankMoleculeRadius(noteOffset, count) {
        const orbitCfg = CONFIG.warehouse.orbit;
        const bodiesData = PhysicsEngine.bodiesData;
        let maxR = orbitCfg.moleculeFootprint;
        for (let i = 0; i < count; i++) {
            maxR = Math.max(maxR, this.noteMoleculeExtent(bodiesData, noteOffset + i, orbitCfg));
        }
        return maxR;
    },

    // Two compact note banks at the canvas flanks, empty void at the center
    getPrimaryGridMetrics() {
        const cfg = CONFIG.warehouse.workspaceGrid;
        const app = document.getElementById('app');
        const wrapper = document.querySelector('.note-wrapper');
        if (!app) {
            return { gap: scale(5), padding: cfg.marginFallback, cellPitch: cfg.cellSizeFallback };
        }

        const appStyle = getComputedStyle(app);
        const gap = parseFloat(appStyle.columnGap) || parseFloat(appStyle.gap) || scale(5);
        const padding = parseFloat(appStyle.paddingLeft) || cfg.marginFallback;
        const wrapperW = wrapper ? wrapper.getBoundingClientRect().width : cfg.cellSizeFallback - gap;
        const cellPitch = wrapperW + gap;

        return { gap, padding, cellPitch };
    },

    computeWorkspaceGrid(options = {}) {
        if (options.relayout === true) {
            this.workspaceSlotLayout = null;
        } else if (this.workspaceSlotLayout) {
            return this.applyWorkspaceVoidExpansion();
        }

        const noteCenters = PhysicsEngine.noteCenters;
        const noteCount = noteCenters.length;
        if (noteCount === 0) return null;

        const { padding: gridPadding, cellPitch } = this.getPrimaryGridMetrics();
        const { left, top, W, H } = this.getWorkspaceCanvasRect();
        const voidW = window.innerWidth * this.getWorkspaceVoidRatio();
        const bankW = Math.max(scale(48), (W - voidW) / 2 - gridPadding);
        const bankH = H - 2 * gridPadding;
        const half = Math.ceil(noteCount / 2);
        const slots = new Map();

        const layoutBank = (count, isLeftBank, noteOffset) => {
            const hullGap = CONFIG.physics.hullCollision.gap;
            const minDiameter = this.maxBankMoleculeRadius(noteOffset, count) * 2 + hullGap;
            let cell = Math.max(cellPitch, minDiameter * 1.04);
            let cols = Math.max(1, Math.floor(bankW / cell));
            let rows = Math.max(1, Math.floor(bankH / cell));
            if (cols * rows < count) {
                cell = Math.max(minDiameter * 1.04, Math.sqrt((bankW * bankH) / count));
                cols = Math.max(1, Math.floor(bankW / cell));
                rows = Math.ceil(count / cols);
            }

            const usedRows = Math.min(rows, Math.ceil(count / cols));
            const originY = top + (H - usedRows * cell) / 2;
            const positions = [];

            for (let i = 0; i < count; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = isLeftBank
                    ? left + gridPadding + col * cell + cell / 2
                    : left + W - gridPadding - col * cell - cell / 2;
                const y = originY + row * cell + cell / 2;
                positions.push({ x, y });
                slots.set(noteOffset + i, {
                    bank: isLeftBank ? 'left' : 'right',
                    row,
                    col
                });
            }

            return { positions, cell, cols, rows, usedRows, originY };
        };

        const leftLayout = layoutBank(half, true, 0);
        const rightLayout = layoutBank(noteCount - half, false, half);

        this.workspaceSlotLayout = {
            leftCell: leftLayout.cell,
            rightCell: rightLayout.cell,
            half,
            leftUsedRows: leftLayout.usedRows,
            rightUsedRows: rightLayout.usedRows,
            slots
        };

        const centers = [];
        for (let i = 0; i < noteCount; i++) {
            if (!noteCenters[i]) continue;
            centers[i] = i < half ? leftLayout.positions[i] : rightLayout.positions[i - half];
        }
        return this.relaxBankGridCenters(centers);
    },

    getActiveBlockCount() {
        return this.blocks.filter(b => this.isWorkspaceOccupant(b)).length;
    },

    // Capture blocks only — drives crowded physics (not frames / dock phantoms)
    getCrowdedBlockCount() {
        return this.getActiveCaptureBlocks().length;
    },

    getMaxCaptureBlocks() {
        return CONFIG.warehouse.maxCaptureBlocks ?? 5;
    },

    isWarehouseCaptureFull() {
        return this.getCrowdedBlockCount() >= this.getMaxCaptureBlocks();
    },

    ensurePhysicsMaps() {
        if (!(this.orbitRingCountByBlock instanceof Map)) this.orbitRingCountByBlock = new Map();
        if (!(this.orbitAngleByNote instanceof Map)) this.orbitAngleByNote = new Map();
        if (!(this.stretchBindingByNote instanceof Map)) this.stretchBindingByNote = new Map();
        if (!(this.stretchGroupCounts instanceof Map)) this.stretchGroupCounts = new Map();
        if (!(this.stretchAxisByNote instanceof Map)) this.stretchAxisByNote = new Map();
        if (!(this.filterExitByNote instanceof Map)) this.filterExitByNote = new Map();
        if (!(this.stretchedNotes instanceof Set)) this.stretchedNotes = new Set();
        if (!(this.filteredNoteIndices instanceof Set)) this.filteredNoteIndices = new Set();
    },

    syncDeployedBlockPositions() {
        this.blocks.forEach(block => {
            if (!block.isDragging || !block.body) return;
            this.syncBody(block);
        });
    },

    isAnyCaptureBlockDragging() {
        return this.blocks.some(b =>
            b.isDragging &&
            b.carryOrbitWhileDragging &&
            this.isActiveCaptureBlock(b)
        );
    },

    isActiveCaptureBlock(block) {
        if (block.nestedIn) return false;
        if (block.type === 'author') return !!block.author;
        if (block.type === 'typology') return !!block.typology;
        return !!block.tag;
    },

    isBlockClickTransitionEligible(block) {
        if (!block || block.state !== 'active' || block.nestedIn) return false;
        if (!block.element?.classList.contains('is-deployed')) return false;
        if (block.type === 'frame' && block.frameKind === 'filter') return true;
        return this.isActiveCaptureBlock(block);
    },

    isBlockOnSurface(block) {
        if (block.element.classList.contains('is-deployed')) return true;
        if (block.nestedIn && block.nestedIn.element.classList.contains('is-deployed')) return true;
        return false;
    },

    isBlockFocusEligible(block) {
        return this.isBlockOnSurface(block) || !!(block.isDragging && block.carryOrbitWhileDragging);
    },

    // Blocks that occupy the workspace (deployed, dragged from dock/surface — not docked/nested)
    isWorkspaceOccupant(block) {
        if (block.state !== 'active') return false;
        if (block.nestedIn) return false;
        if (block.isDragging) {
            return !!(block.carryOrbitWhileDragging || block.body);
        }
        return this.isBlockOnSurface(block);
    },

    getCollisionBlocks() {
        return this.blocks.filter(b => {
            if (!this.isWorkspaceOccupant(b)) return false;
            if (b.nestedIn?.frameKind === 'filter') return false;
            if (!Number.isFinite(b.bodyX) || !Number.isFinite(b.bodyY)) return false;
            return b.type === 'frame' || b.type === 'tag' || b.type === 'author' || b.type === 'typology';
        });
    },

    getActiveCaptureBlocks() {
        return this.blocks.filter(b => {
            if (b.state !== 'active') return false;
            if (b.isDragging) {
                if (!b.carryOrbitWhileDragging) return false;
            } else if (!this.isBlockOnSurface(b)) {
                return false;
            }
            if (b.nestedIn?.frameKind === 'filter') return false;
            if (b.type === 'author') return !!b.author;
            if (b.type === 'tag') return !!b.tag;
            if (b.type === 'typology') return !!b.typology;
            return false;
        });
    },

    getActiveFocusCriteria() {
        const activeTags = new Set(
            this.blocks
                .filter(b =>
                    b.state === 'active' &&
                    b.type === 'tag' &&
                    b.tag &&
                    !b.nestedIn &&
                    this.isBlockFocusEligible(b)
                )
                .map(b => b.tag)
        );
        const activeAuthors = new Set(
            this.blocks
                .filter(b =>
                    b.state === 'active' &&
                    b.type === 'author' &&
                    b.author &&
                    !b.nestedIn &&
                    this.isBlockFocusEligible(b)
                )
                .map(b => b.author)
        );
        const activeTypologies = new Set(
            this.blocks
                .filter(b =>
                    b.state === 'active' &&
                    b.type === 'typology' &&
                    b.typology &&
                    !b.nestedIn &&
                    this.isBlockFocusEligible(b)
                )
                .map(b => b.typology)
        );
        this.blocks
            .filter(b =>
                b.state === 'active' &&
                b.nestedIn &&
                b.nestedIn.frameKind !== 'filter' &&
                this.isBlockFocusEligible(b)
            )
            .forEach(b => {
                if (b.type === 'tag' && b.tag) activeTags.add(b.tag);
                if (b.type === 'author' && b.author) activeAuthors.add(b.author);
                if (b.type === 'typology' && b.typology) activeTypologies.add(b.typology);
            });
        return { tags: activeTags, authors: activeAuthors, typologies: activeTypologies };
    },

    getNoteTypology(noteIndex, wrapper = null) {
        if (typeof AppState !== 'undefined' && AppState.items?.[noteIndex]) {
            return AppState.items[noteIndex].typology || '';
        }

        const w = wrapper ||
            (typeof this.getNoteWrapper === 'function' ? this.getNoteWrapper(noteIndex) : null) ||
            document.querySelector(`.note-wrapper[data-note-index="${noteIndex}"]`);
        return w?.dataset.typology || '';
    },

    getNoteFocusTagsAndAuthor(noteIndex, wrapper = null) {
        if (typeof AppState !== 'undefined' && AppState.items?.[noteIndex]) {
            const item = AppState.items[noteIndex];
            return {
                tags: (item.tags || []).map(t => t.name).filter(Boolean),
                authorCode: item.authorCode || ''
            };
        }

        const w = wrapper ||
            (typeof this.getNoteWrapper === 'function' ? this.getNoteWrapper(noteIndex) : null) ||
            document.querySelector(`.note-wrapper[data-note-index="${noteIndex}"]`);
        if (!w) return { tags: [], authorCode: '' };

        return {
            tags: [...w.querySelectorAll('.layer-dot')].map(d => d.dataset.tag).filter(Boolean),
            authorCode: w.dataset.authorCode || ''
        };
    },

    /* All active focus tags/authors/typologies must match the same note (AND, not OR). */
    noteMatchesActiveFocus(noteTags, authorCode, activeTags, activeAuthors, noteTypology = '', activeTypologies = null) {
        const tagList = Array.isArray(noteTags) ? noteTags : [...noteTags];
        const typologies = activeTypologies || new Set();
        if (!activeTags.size && !activeAuthors.size && !typologies.size) return false;

        for (const tag of activeTags) {
            if (!tagList.includes(tag)) return false;
        }
        for (const author of activeAuthors) {
            if (authorCode !== author) return false;
        }
        for (const typology of typologies) {
            if (noteTypology !== typology) return false;
        }
        return true;
    },

    noteMatchesActiveFocusForIndex(noteIndex, activeTags, activeAuthors, wrapper = null, activeTypologies = null) {
        const { tags, authorCode } = this.getNoteFocusTagsAndAuthor(noteIndex, wrapper);
        const noteTypology = this.getNoteTypology(noteIndex, wrapper);
        return this.noteMatchesActiveFocus(
            tags,
            authorCode,
            activeTags,
            activeAuthors,
            noteTypology,
            activeTypologies
        );
    },

    getFilterCriteria() {
        const tags = new Set();
        const authors = new Set();
        const typologies = new Set();
        this.blocks.forEach(b => {
            if (b.state !== 'active' || !b.nestedIn || b.nestedIn.frameKind !== 'filter') return;
            if (b.type === 'tag' && b.tag) tags.add(b.tag);
            if (b.type === 'author' && b.author) authors.add(b.author);
            if (b.type === 'typology' && b.typology) typologies.add(b.typology);
        });
        return { tags, authors, typologies };
    },

    isNoteFiltered(noteIndex) {
        return this.filteredNoteIndices.has(noteIndex);
    },

    moleculeMatchesFilter(noteIndex, filterTags, filterAuthors, filterTypologies = new Set()) {
        const wrappers = document.querySelectorAll('.note-wrapper');
        const wrapper = wrappers[noteIndex];
        if (!wrapper) return false;

        const authorCode = wrapper.dataset.authorCode || '';
        if (authorCode && filterAuthors.has(authorCode)) return true;

        const noteTypology = this.getNoteTypology(noteIndex, wrapper);
        if (noteTypology && filterTypologies.has(noteTypology)) return true;

        const dots = wrapper.querySelectorAll('.layer-dot');
        return [...dots].some(dot => {
            const tag = dot.dataset.tag || '';
            return tag && filterTags.has(tag);
        });
    },

    getBlockRingKey(block) {
        if (block.type === 'author') return `@${block.author}`;
        if (block.type === 'typology') return `~${block.typology}`;
        return block.tag;
    },

    dotMatchesBlock(block, dot) {
        if (block.type === 'author') {
            return !!dot.authorCode && dot.authorCode === block.author;
        }
        if (block.type === 'typology') {
            if (!block.typology) return false;
            const item = typeof AppState !== 'undefined' ? AppState.items?.[dot.noteIndex] : null;
            return item?.typology === block.typology;
        }
        return dot.tag === block.tag;
    },

    getCaptureBlockForDot(dot, blocks = null) {
        const active = blocks || this.getActiveCaptureBlocks();
        for (let i = 0; i < active.length; i++) {
            if (this.dotMatchesBlock(active[i], dot)) return active[i];
        }
        return null;
    },

    getNearestCaptureBlock(x, y, blocks = null) {
        const active = blocks || this.getActiveCaptureBlocks();
        let best = null;
        let bestD = Infinity;
        active.forEach(b => {
            if (!Number.isFinite(b.bodyX) || !Number.isFinite(b.bodyY)) return;
            const d = Math.hypot(x - b.bodyX, y - b.bodyY);
            if (d < bestD) {
                bestD = d;
                best = b;
            }
        });
        return best;
    },

    // Tag-matched block, or nearest capture block for siblings / multi-stretch dots
    getOrbitAnchorBlock(dot) {
        const ox = dot.overrideTarget?.x ?? dot.body.position.x;
        const oy = dot.overrideTarget?.y ?? dot.body.position.y;
        const tagged = this.getCaptureBlockForDot(dot);
        if (tagged && Number.isFinite(tagged.bodyX)) return tagged;
        return this.getNearestCaptureBlock(ox, oy);
    },

    refreshCaptureBlockCoords() {
        this.getActiveCaptureBlocks().forEach(block => {
            if (block.isDragging || !block.element) return;
            const rect = block.element.getBoundingClientRect();
            block.x = rect.left;
            block.y = rect.top;
            this.syncBody(block);
        });
    },

    clampTargetToBlockRing(x, y, block, maxRing = scale(280)) {
        if (!block || !Number.isFinite(block.bodyX) || !Number.isFinite(block.bodyY)) {
            return { x, y };
        }
        const bdx = x - block.bodyX;
        const bdy = y - block.bodyY;
        const bdist = Math.hypot(bdx, bdy);
        if (bdist <= maxRing) return { x, y };
        return {
            x: block.bodyX + bdx / bdist * maxRing,
            y: block.bodyY + bdy / bdist * maxRing
        };
    },

    enforceCapturedRingClamp(bodiesData, blockCount) {
        if (blockCount < 5) return;

        let hits = 0;
        let missBlock = 0;
        let bodySnaps = 0;
        let stretchSkipped = 0;
        let stretchBodyRecall = 0;
        const capturedNotes = new Set();
        const runawayRecallR = scale(140);
        const maxBodyReach = scale(280);
        const animating = this._kinematicEntryTicks > 0 || this._orbitTransitionTicks > 0;
        let skippedAnimating = 0;
        const recallBodies = this.isKinematicCaptureMode(blockCount);

        bodiesData.forEach(d => {
            if (!d.overrideTarget || d.onBankGrid) return;
            if (this.stretchedNotes.has(d.noteIndex)) {
                stretchSkipped++;
                return;
            }
            capturedNotes.add(d.noteIndex);
            const block = this.getOrbitAnchorBlock(d);
            if (!block) {
                missBlock++;
                return;
            }
            const beforeX = d.overrideTarget.x;
            const beforeY = d.overrideTarget.y;
            const beforeDist = Math.hypot(beforeX - block.bodyX, beforeY - block.bodyY);
            const c = this.clampTargetToBlockRing(beforeX, beforeY, block);
            if (beforeDist > scale(280) + 1) hits++;
            d.overrideTarget.x = c.x;
            d.overrideTarget.y = c.y;

            if (recallBodies && d.body && !d.body.isStatic && !animating) {
                const bodyDist = Math.hypot(d.body.position.x - c.x, d.body.position.y - c.y);
                if (bodyDist > runawayRecallR) {
                    Matter.Body.setPosition(d.body, { x: c.x, y: c.y });
                    Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
                    bodySnaps++;
                }
            } else if (recallBodies && animating && d.body && !d.body.isStatic) {
                const bodyDist = Math.hypot(d.body.position.x - c.x, d.body.position.y - c.y);
                if (bodyDist > runawayRecallR) skippedAnimating++;
            }
        });

        bodiesData.forEach(d => {
            if (d.onBankGrid || d.overrideTarget || !capturedNotes.has(d.noteIndex)) return;
            if (this.stretchedNotes.has(d.noteIndex)) return;
            const anchor = bodiesData.find(b =>
                b.noteIndex === d.noteIndex && b.overrideTarget && b.body && !b.onBankGrid
            );
            if (!anchor || !d.body || d.body.isStatic) return;
            const dx = d.body.position.x - anchor.body.position.x;
            const dy = d.body.position.y - anchor.body.position.y;
            const dist = Math.hypot(dx, dy);
            const maxSib = scale(100);
            if (dist > maxSib) {
                if (!recallBodies) return;
                Matter.Body.setPosition(d.body, {
                    x: anchor.body.position.x + dx / dist * maxSib,
                    y: anchor.body.position.y + dy / dist * maxSib
                });
                Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
                bodySnaps++;
            }
        });

        bodiesData.forEach(d => {
            if (!this.stretchedNotes.has(d.noteIndex) || d.onBankGrid || !d.overrideTarget) return;
            if (!recallBodies) return;
            if (!d.body || d.body.isStatic) return;
            let tx = d.overrideTarget.x;
            let ty = d.overrideTarget.y;
            const bodyDx = tx - d.body.position.x;
            const bodyDy = ty - d.body.position.y;
            const bodyDist = Math.hypot(bodyDx, bodyDy);
            if (bodyDist > maxBodyReach) {
                const scaleDown = maxBodyReach / bodyDist;
                tx = d.body.position.x + bodyDx * scaleDown;
                ty = d.body.position.y + bodyDy * scaleDown;
                d.overrideTarget.x = tx;
                d.overrideTarget.y = ty;
            }
            const recallDist = Math.hypot(d.body.position.x - tx, d.body.position.y - ty);
            const emergency = recallDist > maxBodyReach;
            if (recallDist > runawayRecallR && (!animating || emergency)) {
                Matter.Body.setPosition(d.body, { x: tx, y: ty });
                Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
                bodySnaps++;
                stretchBodyRecall++;
            }
        });
    },

    getAuthorRingDots(block, bodiesData) {
        const seen = new Set();
        const ringDots = [];
        bodiesData.forEach(d => {
            if (d.authorCode !== block.author) return;
            if (this.isNotePhysicsSuspended(d.noteIndex)) return;
            if (this.stretchedNotes.has(d.noteIndex)) return;
            if (seen.has(d.noteIndex)) return;
            seen.add(d.noteIndex);
            ringDots.push(d);
        });
        return ringDots;
    },

    getTypologyRingDots(block, bodiesData) {
        const seen = new Set();
        const ringDots = [];
        bodiesData.forEach(d => {
            const item = typeof AppState !== 'undefined' ? AppState.items?.[d.noteIndex] : null;
            if (!item || item.typology !== block.typology) return;
            if (this.isNotePhysicsSuspended(d.noteIndex)) return;
            if (this.stretchedNotes.has(d.noteIndex)) return;
            if (seen.has(d.noteIndex)) return;
            seen.add(d.noteIndex);
            ringDots.push(d);
        });
        return ringDots;
    },

    getCrowdedForceScale(blockCount = this.getCrowdedBlockCount()) {
        const table = CONFIG.physics.crowdedBlock.forceScale;
        const idx = Math.max(0, Math.min(blockCount, table.length - 1));
        let scaleVal = table[idx];
        if (blockCount > 7) {
            scaleVal *= Math.pow(0.9, blockCount - 7);
        }
        return scaleVal;
    },

    // Progressive taper from 5+ blocks — uses crowdedBlock tables without full crowded mode
    getHeavyWorkspaceTier(blockCount = this.getCrowdedBlockCount()) {
        if (blockCount < 5) return -1;
        const table = CONFIG.physics.crowdedBlock.targetLerp;
        const tier = Math.min(blockCount - 5, table.length - 1);
        // Block 7+ stays on tier 1 — tier 2 lerp (0.02) lets stretched targets run away
        return blockCount >= 7 ? Math.min(tier, 1) : tier;
    },

    getHeavyTargetLerp(blockCount = this.getCrowdedBlockCount()) {
        const tier = this.getHeavyWorkspaceTier(blockCount);
        if (tier < 0) return null;
        return CONFIG.physics.crowdedBlock.targetLerp[tier];
    },

    getHeavyCaptureDamping(blockCount = this.getCrowdedBlockCount()) {
        const tier = this.getHeavyWorkspaceTier(blockCount);
        if (tier < 0) return null;
        return CONFIG.physics.crowdedBlock.captureDamping[tier];
    },

    isKinematicCaptureMode(blockCount = this.getCrowdedBlockCount()) {
        const minTier = CONFIG.physics.crowdedBlock.kinematicTierMin ?? 1;
        return this.getHeavyWorkspaceTier(blockCount) >= minTier;
    },

    kinematicLerpToward(curX, curY, tgtX, tgtY, lerp, maxStepPx) {
        let dx = (tgtX - curX) * lerp;
        let dy = (tgtY - curY) * lerp;
        const step = Math.hypot(dx, dy);
        if (maxStepPx > 0 && step > maxStepPx) {
            const s = maxStepPx / step;
            dx *= s;
            dy *= s;
        }
        return { x: curX + dx, y: curY + dy };
    },

    kinematicAdaptiveMaxStep(baseStep, lag, cfg = CONFIG.physics.crowdedBlock) {
        const far = scale(cfg.kinematicLagFar ?? 40);
        const veryFar = scale(cfg.kinematicLagVeryFar ?? 110);
        const boostMax = cfg.kinematicLagBoostMax ?? 3.5;
        if (lag <= far) return baseStep;
        if (lag >= veryFar) return baseStep * boostMax;
        const t = (lag - far) / (veryFar - far);
        return baseStep * (1 + t * (boostMax - 1));
    },

    clampStretchLane(slotLane, cfg) {
        const cap = Math.max(scale(260), cfg.stretchLaneSpacing * 8);
        return Math.max(-cap, Math.min(cap, slotLane));
    },

    getOrbitJumpCap(blockCount = this.getCrowdedBlockCount()) {
        if (blockCount >= 7) return scale(25);
        if (blockCount >= 6) return scale(35);
        if (blockCount >= 5) return scale(46);
        if (blockCount >= 3) return scale(90);
        return Infinity;
    },

    // Called by PhysicsEngine every tick, before dot forces are computed
    tick(bodiesData, time) {
        this.ensurePhysicsMaps();
        this.tickFilterExit(bodiesData);
        this.syncDeployedBlockPositions();
        this.refreshCaptureBlockCoords();
        this.updateOrbits(bodiesData, time);
        this.refreshPhysicsFlags(bodiesData);
    },

    // O(n) pass — cache bank/capture flags; freeze settled bank dots as static bodies
    refreshPhysicsFlags(bodiesData) {
        const capturedNotes = new Set();
        bodiesData.forEach(d => {
            if (d.overrideTarget) capturedNotes.add(d.noteIndex);
        });

        const ws = this.workspaceCenters;
        const rushActive = this.isWorkspaceGridRush();

        bodiesData.forEach(item => {
            item.onBankGrid = !!(ws && ws[item.noteIndex] &&
                !item.isFiltered && !item.isFilterExiting &&
                !item.overrideTarget && !capturedNotes.has(item.noteIndex));
        });

        if (ws && !rushActive) {
            this.syncBankGridStatic(bodiesData);
        } else if (!ws) {
            this.releaseBankGridStatic(bodiesData);
        }
    },

    syncBankGridStatic(bodiesData) {
        bodiesData.forEach(item => {
            if (item.onBankGrid) {
                if (!item.body.isStatic) {
                    const home = this.workspaceCenters[item.noteIndex];
                    if (home) {
                        Matter.Body.setPosition(item.body, {
                            x: home.x + item.offsetX,
                            y: home.y + item.offsetY
                        });
                    }
                    Matter.Body.setStatic(item.body, true);
                    item._bankWasStatic = true;
                }
                Matter.Body.setVelocity(item.body, { x: 0, y: 0 });
            } else if (item._bankWasStatic) {
                Matter.Body.setStatic(item.body, false);
                item._bankWasStatic = false;
            }
        });
    },

    releaseBankGridStatic(bodiesData) {
        bodiesData.forEach(item => {
            item.onBankGrid = false;
            if (item._bankWasStatic) {
                Matter.Body.setStatic(item.body, false);
                item._bankWasStatic = false;
            }
        });
    },
});
