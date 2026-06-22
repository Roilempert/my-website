/* ==========================================================================
   08. ACTION WAREHOUSE (BOTTOM PORTAL DOCK)
   Draggable action blocks. Dots with a matching tag orbit deployed blocks.
   Block lifecycle: docked -> active (dragging / deployed) -> docked.
   ========================================================================== */
const ActionWarehouse = {
    shellElement: null,
    dockElement: null,
    depthBlockBarElement: null,
    trayScrollElement: null,
    trayFramesElement: null,
    trayBlocksElement: null,
    blocks: [],         // { nestedBlocks?, nestedIn?, ... }
    dragState: null,
    workspaceCenters: null,
    workspaceSlotLayout: null,  // frozen bank slots — only void width changes when blocks join
    workspaceGridRush: null,    // null | 'out' (→ workspace) | 'in' (→ original grid)
    workspaceGridRushUntil: 0,
    stretchedNotes: new Set(),
    stretchAxisByNote: new Map(),      // noteIndex → live chord geometry (rebuilt each tick)
    stretchBindingByNote: new Map(),   // noteIndex → stable block/dot/slot contract (persists across ticks)
    stretchGroupCounts: new Map(),     // block-pair key → molecule count (detect group changes)
    orbitAngleByNote: new Map(),       // noteIndex → smoothed ring angle (single-block stability)
    orbitRingCountByBlock: new Map(),  // block tag → ring dot count (detect layout changes)
    _prevOrbitBlockCount: 0,
    _prevStretchedCount: 0,
    _orbitTransitionTicks: 0,
    _kinematicEntryTicks: 0,
    _prevKinematicActive: false,
    filteredNoteIndices: new Set(),
    filterExitByNote: new Map(),   // noteIndex → { phase: 'hollow'|'peel', phaseStart }

    init() {
        this.ensurePhysicsMaps();
        const dockCfg = CONFIG.warehouse.dock;

        // Set on <body> so blocks keep their size after being re-parented out of the dock
        document.body.style.setProperty('--block-height', `${CONFIG.warehouse.blockHeight}px`);
        document.body.style.setProperty('--block-glyph-size', `${CONFIG.warehouse.blockGlyphSize}px`);
        const frameCfg = CONFIG.warehouse.frame.filter;
        const frameHeight = CONFIG.warehouse.blockHeight + frameCfg.paddingY * 2;
        const frameAlignOffset = (frameHeight - CONFIG.warehouse.blockHeight) / 2;
        const frameShellWidth = this.computeFrameShellWidth(frameCfg.slotMinWidth);
        document.body.style.setProperty('--frame-height', `${frameHeight}px`);
        document.body.style.setProperty('--frame-radius', `${frameCfg.borderRadius}px`);
        document.body.style.setProperty('--frame-slot-min-width', `${frameCfg.slotMinWidth}px`);
        document.body.style.setProperty('--frame-padding-x', `${frameCfg.paddingX}px`);
        document.body.style.setProperty('--frame-padding-y', `${frameCfg.paddingY}px`);
        document.body.style.setProperty('--frame-padding-left', `${frameCfg.paddingLeft}px`);
        document.body.style.setProperty('--frame-nested-gap', `${frameCfg.nestedGap}px`);
        document.body.style.setProperty('--frame-align-offset', `${frameAlignOffset}px`);
        document.body.style.setProperty('--frame-shell-width', `${frameShellWidth}px`);
        document.documentElement.style.setProperty('--warehouse-width', `${dockCfg.widthRatio * 100}%`);
        document.documentElement.style.setProperty('--warehouse-radius', `${dockCfg.borderRadius}px`);
        document.documentElement.style.setProperty('--warehouse-outline', `${dockCfg.outlineWidth}pt`);
        document.documentElement.style.setProperty('--warehouse-bottom-offset', `${dockCfg.bottomOffset}px`);
        document.documentElement.style.setProperty(
            '--warehouse-tray-max-height',
            `calc(var(--block-height) * ${dockCfg.visibleRows} + ${(dockCfg.visibleRows - 1) * dockCfg.rowGap}px)`
        );

        this.shellElement = document.createElement('div');
        this.shellElement.classList.add('warehouse-shell', 'site-type');
        this.shellElement.innerHTML = `
            <button type="button" class="warehouse-reset" aria-label="Reset">×</button>
            <div class="depth-block-bar" aria-hidden="true"></div>
            <div class="action-warehouse">
                <div class="warehouse-label">ACTION REPOSITORY</div>
                <div class="warehouse-tray-layout">
                    <div class="warehouse-tray-section warehouse-tray-section--frames"></div>
                    <div class="warehouse-tray-divider" aria-hidden="true"></div>
                    <div class="warehouse-scroll">
                        <div class="warehouse-tray-section warehouse-tray-section--blocks"></div>
                    </div>
                </div>
            </div>
        `;
        this.dockElement = this.shellElement.querySelector('.action-warehouse');
        this.depthBlockBarElement = this.shellElement.querySelector('.depth-block-bar');
        this.trayScrollElement = this.shellElement.querySelector('.warehouse-scroll');
        this.trayFramesElement = this.shellElement.querySelector('.warehouse-tray-section--frames');
        this.trayBlocksElement = this.shellElement.querySelector('.warehouse-tray-section--blocks');
        this.trayScrollElement.addEventListener('wheel', (e) => this.onTrayWheel(e), { passive: false, capture: true });
        this.shellElement.querySelector('.warehouse-reset')
            .addEventListener('click', () => this.resetAll());
        document.body.appendChild(this.shellElement);

        this.resizeObserver = new ResizeObserver(() => this.updateScrollReserve());
        this.resizeObserver.observe(this.shellElement);
        window.addEventListener('resize', () => this.updateScrollReserve());
        this.updateScrollReserve();
    },

    // Footprint of the dock: extends #app scroll range so dots can clear the overlay
    getScrollReserve() {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--warehouse-reserve');
        return parseFloat(raw) || 0;
    },

    updateScrollReserve() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (!this.shellElement || level < 1) {
            document.documentElement.style.setProperty('--warehouse-reserve', '0px');
            return;
        }
        const rect = this.shellElement.getBoundingClientRect();
        const bottomOffset = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--warehouse-bottom-offset')
        ) || 0;
        let reserve = Math.ceil(rect.height + bottomOffset);
        if (level >= 2 && this.depthBlockBarElement?.childElementCount > 0) {
            reserve += Math.ceil(this.depthBlockBarElement.getBoundingClientRect().height + scale(8));
        }
        document.documentElement.style.setProperty('--warehouse-reserve', `${reserve}px`);
    },

    // Wheel over the tray scrolls vertically through all tag blocks
    onTrayWheel(e) {
        const tray = this.trayScrollElement;
        if (!tray || tray.scrollHeight <= tray.clientHeight) return;

        e.preventDefault();
        e.stopPropagation();
        tray.scrollTop += e.deltaY;
    },

    // Returns every active block to its dock slot
    resetAll() {
        if (this.dragState) return;

        this.ensurePhysicsMaps();
        this.stretchBindingByNote.clear();
        this.stretchGroupCounts.clear();
        this.orbitAngleByNote.clear();
        this.orbitRingCountByBlock.clear();
        this.filteredNoteIndices.clear();
        this.filterExitByNote.clear();
        this.workspaceSlotLayout = null;
        this.restoreAllFilterVisuals(PhysicsEngine.bodiesData);

        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            DepthV2.clearFringeZone();
            if (DepthController.currentLevel >= 2) {
                DepthV2.relayoutForFilterChange({ force: true });
            }
        }

        this.unmountDeployedBlocksFromDepthBar();

        this.blocks.forEach(block => {
            if (block.state !== 'active' || block.nestedIn) return;

            // Normalize deployed (page-space) blocks to viewport-fixed positioning
            // so the snap-back animation runs in screen coordinates
            const rect = block.element.getBoundingClientRect();
            block.element.classList.remove('is-deployed');
            block.element.classList.add('is-dragging');
            block.x = rect.left;
            block.y = rect.top;
            this.applyTransform(block, 0);
            void block.element.offsetWidth; // flush styles so the transition animates

            this.returnToDock(block);
        });
    },

    isPointOverDock(x, y) {
        if (!this.shellElement) return false;
        const rect = this.shellElement.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    // Called once the data pipeline resolves (tag dictionary is ready)
    populate() {
        this.createBlock({ type: 'frame', frameKind: 'filter' });

        AppState.tagColorsMap.forEach((color, tagName) => {
            this.createBlock({ type: 'tag', tag: tagName, color: color });
        });

        const authorCodes = new Set();
        AppState.items.forEach(item => {
            if (item.authorCode) authorCodes.add(item.authorCode);
        });
        [...authorCodes].sort((a, b) => a.localeCompare(b)).forEach(author => {
            this.createBlock({ type: 'author', author: author });
        });

        requestAnimationFrame(() => this.updateScrollReserve());
        this.captureDockTrayBaseOrder();
        this.updateWarehouseCapacityUI();
    },

    captureDockTrayBaseOrder() {
        this._dockTrayBaseOrder = this.blocks.filter(
            b => (b.type === 'tag' || b.type === 'author') && b.slotElement
        );
    },

    ensureDockTrayBaseOrder() {
        if (!this._dockTrayBaseOrder?.length) {
            this.captureDockTrayBaseOrder();
        }
    },

    restoreDockTrayOrder() {
        if (!this.trayBlocksElement) return;
        this.ensureDockTrayBaseOrder();
        this._dockTrayBaseOrder.forEach(block => {
            const slot = block.slotElement;
            if (slot?.parentElement === this.trayBlocksElement) {
                this.trayBlocksElement.appendChild(slot);
            }
        });
    },

    reorderDockTrayByRelevance(coTags, coAuthors) {
        if (!this.trayBlocksElement) return;
        this.ensureDockTrayBaseOrder();

        const relevant = [];
        const irrelevant = [];
        const away = [];

        this._dockTrayBaseOrder.forEach(block => {
            const slot = block.slotElement;
            if (!slot || slot.parentElement !== this.trayBlocksElement) return;

            if (!this.isBlockDockedInTray(block)) {
                away.push(block);
                return;
            }

            if (this.isDockBlockCoRelevant(block, coTags, coAuthors)) {
                relevant.push(block);
            } else {
                irrelevant.push(block);
            }
        });

        [...relevant, ...irrelevant, ...away].forEach(block => {
            this.trayBlocksElement.appendChild(block.slotElement);
        });

        if (this.trayScrollElement) {
            this.trayScrollElement.scrollTop = 0;
        }
    },

    createBlock(def) {
        if (def.type === 'frame') return this.createFrameBlock(def);

        const slot = document.createElement('div');
        slot.classList.add('block-slot');

        const el = document.createElement('div');
        const isAuthor = def.type === 'author';
        el.classList.add('action-block', 'site-type');
        if (isAuthor) el.classList.add('action-block--author');
        el.dataset.type = def.type || 'tag';

        const label = isAuthor ? def.author : def.tag;
        const glyphHTML = isAuthor
            ? ''
            : `<span class="block-glyph" style="background-color: ${def.color}"></span>`;
        el.innerHTML = `${glyphHTML}<span class="block-label">${label}</span>`;
        slot.appendChild(el);
        this.trayBlocksElement.appendChild(slot);

        const block = {
            type: def.type || 'tag',
            tag: isAuthor ? null : def.tag,
            author: isAuthor ? def.author : null,
            color: def.color || null,
            frameKind: null,
            element: el,
            slotElement: slot,
            state: 'docked',
            isDragging: false,
            nestedBlocks: [],
            nestedIn: null,
            body: null,
            bodyX: 0, bodyY: 0,
            x: 0, y: 0
        };

        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.startDrag(block, e);
        });
        this.blocks.push(block);
        return block;
    },

    createFrameBlock(def) {
        const slot = document.createElement('div');
        slot.classList.add('block-slot', 'block-slot--frame');

        const el = document.createElement('div');
        const frameKind = def.frameKind || 'filter';
        el.classList.add('action-block', 'action-block--frame', 'site-type');
        if (frameKind === 'filter') el.classList.add('action-block--frame-filter');
        el.dataset.type = 'frame';
        el.dataset.frameKind = frameKind;

        el.innerHTML = `
            <span class="frame-filter-icon" aria-hidden="true"></span>
            <div class="frame-slot-window"></div>
        `;
        slot.appendChild(el);
        this.trayFramesElement.appendChild(slot);

        const block = {
            type: 'frame',
            frameKind,
            tag: null,
            author: null,
            color: null,
            element: el,
            slotElement: slot,
            state: 'docked',
            isDragging: false,
            nestedBlocks: [],
            nestedIn: null,
            body: null,
            bodyX: 0, bodyY: 0,
            x: 0, y: 0
        };

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.is-nested')) return;
            this.startDrag(block, e);
        });
        this.blocks.push(block);
        return block;
    },

    blockMetrics(block) {
        if (block.type === 'frame') return this.getFrameMetrics(block);
        const rect = block.element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    },

    computeFrameShellWidth(slotWidth) {
        const cfg = CONFIG.warehouse.frame.filter;
        const gap = scale(6);
        const leftPad = cfg.paddingX + (cfg.paddingLeft || 0);
        return leftPad + CONFIG.warehouse.blockGlyphSize + gap + slotWidth + cfg.paddingX;
    },

    getFrameNestedDimensions(frame) {
        const cfg = CONFIG.warehouse.frame.filter;
        const blockH = CONFIG.warehouse.blockHeight;
        const nested = frame.nestedBlocks || [];
        if (nested.length === 0) {
            return { width: cfg.slotMinWidth, height: blockH };
        }

        const gap = cfg.nestedGap || scale(4);
        let maxW = cfg.slotMinWidth;
        let totalH = 0;

        nested.forEach((b, i) => {
            const w = b.element.offsetWidth || b.element.getBoundingClientRect().width;
            if (w > 0) maxW = Math.max(maxW, Math.ceil(w));
            totalH += blockH + (i > 0 ? gap : 0);
        });

        return { width: maxW, height: totalH };
    },

    getFrameMetrics(block) {
        const cfg = CONFIG.warehouse.frame.filter;
        const slot = this.getFrameNestedDimensions(block);
        const minShellH = CONFIG.warehouse.blockHeight + cfg.paddingY * 2;
        const height = Math.max(minShellH, slot.height + cfg.paddingY * 2);
        return {
            width: this.computeFrameShellWidth(slot.width),
            height
        };
    },

    refreshFrameLayout(frame) {
        if (frame.type !== 'frame') return;

        const cfg = CONFIG.warehouse.frame.filter;
        const slotEl = this.getFrameSlotElement(frame);
        const nested = frame.nestedBlocks || [];
        const slotDims = this.getFrameNestedDimensions(frame);
        const { width, height } = this.getFrameMetrics(frame);
        const hasNested = nested.length > 0;

        frame.element.style.width = `${width}px`;
        frame.element.style.minWidth = `${width}px`;
        frame.element.style.height = `${height}px`;
        frame.element.style.minHeight = `${height}px`;
        frame.element.style.maxWidth = hasNested ? 'none' : `${width}px`;
        frame.element.classList.toggle('has-nested-blocks', hasNested);

        if (frame.slotElement) {
            frame.slotElement.style.height = `${height}px`;
            frame.slotElement.style.minHeight = `${height}px`;
        }

        if (!slotEl) return;

        slotEl.classList.toggle('is-filled', hasNested);
        if (hasNested) {
            slotEl.style.width = `${slotDims.width}px`;
            slotEl.style.minWidth = `${slotDims.width}px`;
            slotEl.style.height = `${slotDims.height}px`;
            slotEl.style.minHeight = `${slotDims.height}px`;
        } else {
            slotEl.style.width = `${cfg.slotMinWidth}px`;
            slotEl.style.minWidth = `${cfg.slotMinWidth}px`;
            slotEl.style.height = `${CONFIG.warehouse.blockHeight}px`;
            slotEl.style.minHeight = `${CONFIG.warehouse.blockHeight}px`;
        }
    },

    frameContainsBlock(frame, block) {
        return (frame.nestedBlocks || []).some(n =>
            n.type === block.type &&
            ((block.type === 'tag' && n.tag === block.tag) ||
             (block.type === 'author' && n.author === block.author))
        );
    },

    canSnapIntoFrame(block, frame) {
        return frame &&
            frame.type === 'frame' &&
            frame.frameKind === 'filter' &&
            this.isActiveCaptureBlock(block) &&
            !this.frameContainsBlock(frame, block);
    },

    getFrameSlotElement(frame) {
        return frame.element.querySelector('.frame-slot-window');
    },

    getDeployedFrames() {
        return this.blocks.filter(b =>
            b.type === 'frame' && b.state === 'active' && b.element.classList.contains('is-deployed')
        );
    },

    findFrameAtPoint(x, y) {
        for (const frame of this.getDeployedFrames()) {
            const rect = frame.element.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return frame;
            }
        }
        return null;
    },

    frameContainsPoint(frame, x, y) {
        const rect = frame.element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    snapBlockBackIntoFrame(block, frame) {
        block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning');
        block.element.style.transform = '';

        const slot = this.getFrameSlotElement(frame);
        slot.appendChild(block.element);
        block.element.classList.add('is-nested');
        block.state = 'active';

        this.refreshFrameLayout(frame);
        requestAnimationFrame(() => this.refreshFrameLayout(frame));
        this.updateDotFocusFilter();
    },

    ejectFromFrame(block) {
        const frame = block.nestedIn;
        if (!frame) return;

        frame.nestedBlocks = (frame.nestedBlocks || []).filter(b => b !== block);
        block.nestedIn = null;

        const blockRect = block.element.getBoundingClientRect();
        document.body.appendChild(block.element);
        block.element.classList.remove('is-nested');
        block.x = blockRect.left;
        block.y = blockRect.top;
        this.applyTransform(block, 0);

        this.detachBody(block);
        block.body = null;
        this.syncFrameBodyOwnership(frame);
        this.refreshFrameLayout(frame);
        requestAnimationFrame(() => this.refreshFrameLayout(frame));
        this.updateDotFocusFilter();
    },

    syncNestedBlockBody(block) {
        const frame = block.nestedIn;
        if (!frame) return;

        block.bodyX = frame.bodyX;
        block.bodyY = frame.bodyY;
        if (block.body) {
            Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
        }
    },

    syncFrameBodyOwnership(frameOrBlock) {
        if (frameOrBlock.type === 'frame') {
            const frame = frameOrBlock;
            (frame.nestedBlocks || []).forEach(n => this.detachBody(n));

            if (frame.frameKind === 'filter') {
                if (frame.state === 'active' &&
                    frame.element.classList.contains('is-deployed') &&
                    !frame.body) {
                    this.attachBody(frame);
                }
            } else if ((frame.nestedBlocks || []).length > 0) {
                const anchor = frame.nestedBlocks[0];
                this.detachBody(frame);
                if (!anchor.body) this.attachBody(anchor);
                this.syncNestedBlockBody(anchor);
            } else if (frame.state === 'active' &&
                frame.element.classList.contains('is-deployed') &&
                !frame.body) {
                this.attachBody(frame);
            }
            return;
        }

        const block = frameOrBlock;
        if (block.nestedIn) {
            this.syncNestedBlockBody(block);
        }
    },

    snapBlockIntoFrame(block, frame) {
        if (!this.canSnapIntoFrame(block, frame)) return;

        block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning', 'is-depth-ui-mounted');
        block.element.style.transform = '';

        const slot = this.getFrameSlotElement(frame);
        slot.appendChild(block.element);
        block.element.classList.add('is-nested');

        if (!frame.nestedBlocks) frame.nestedBlocks = [];
        block.nestedIn = frame;
        frame.nestedBlocks.push(block);
        block.state = 'active';

        this.detachBody(block);
        block.body = null;

        this.syncFrameBodyOwnership(frame);
        this.refreshFrameLayout(frame);
        requestAnimationFrame(() => this.refreshFrameLayout(frame));
        if (this.isDepthUiLevel()) {
            this.updateDotFocusFilter();
        } else {
            this.updateWorkspaceState();
        }
    },

    isDepthUiLevel() {
        return typeof DepthController !== 'undefined' && DepthController.currentLevel >= 2;
    },

    isPointOverDepthBar(x, y) {
        if (!this.depthBlockBarElement) return false;
        const rect = this.depthBlockBarElement.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    deployBlockToDepthBar(block) {
        if (!this.depthBlockBarElement || block.nestedIn) return;

        block.element.classList.remove('is-dragging', 'is-returning', 'is-nested');
        block.element.classList.add('is-deployed', 'is-depth-ui-mounted');
        block.element.style.transform = '';
        block.state = 'active';

        this.detachBody(block);
        block.body = null;

        if (!block._depthUiSnapshot) {
            block._depthUiSnapshot = {
                parent: block.slotElement || block.element.parentNode,
                nextSibling: null,
                x: 0,
                y: 0,
                depthUiOnly: true
            };
        }

        this.depthBlockBarElement.appendChild(block.element);
        if (block.type === 'frame') this.refreshFrameLayout(block);

        const deployedCount = this.blocks.filter(b =>
            b.state === 'active' &&
            b.element?.classList.contains('is-deployed') &&
            !b.nestedIn
        ).length;

        this.depthBlockBarElement.classList.toggle('has-blocks', deployedCount > 0);
        this.depthBlockBarElement.classList.remove('is-drop-active');
        if (this.shellElement) {
            this.shellElement.classList.toggle('is-workspace-active', deployedCount > 0);
        }
        this.updateScrollReserve();
        this.updateDotFocusFilter();
    },

    placeBlockOnCanvasFromDepthUi(block) {
        if (!block.element.classList.contains('is-deployed')) return;

        const { width, height } = this.blockMetrics(block);
        block.x = window.pageXOffset + window.innerWidth * 0.5 - width / 2;
        block.y = window.pageYOffset + window.innerHeight * 0.38 - height / 2;
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2;
        block.bodyY = block.y + height / 2;

        document.body.appendChild(block.element);
        block.element.style.transform = `translate3d(${block.x}px, ${block.y}px, 0)`;

        if (!block.body) this.attachBody(block);
        Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
        if (block.type === 'frame') this.refreshFrameLayout(block);
    },

    endDragDepthUi(e, drag, block) {
        if (drag.hoverFrame) {
            drag.hoverFrame.element.classList.remove('is-drop-target');
        }
        this.depthBlockBarElement?.classList.remove('is-drop-active');

        if (this.isPointOverDock(e.clientX, e.clientY)) {
            if (drag.pullFromFrame && block.nestedIn) this.ejectFromFrame(block);
            this.returnToDock(block);
            return;
        }

        if (drag.pullFromFrame && block.nestedIn) {
            const sourceFrame = block.nestedIn;
            if (this.frameContainsPoint(sourceFrame, e.clientX, e.clientY)) {
                this.snapBlockBackIntoFrame(block, sourceFrame);
                return;
            }
            const otherFrame = this.findFrameAtPoint(e.clientX, e.clientY);
            if (otherFrame && otherFrame !== sourceFrame && this.canSnapIntoFrame(block, otherFrame)) {
                this.ejectFromFrame(block);
                this.snapBlockIntoFrame(block, otherFrame);
                return;
            }
            this.ejectFromFrame(block);
        }

        const frameTarget = this.isActiveCaptureBlock(block)
            ? this.findFrameAtPoint(e.clientX, e.clientY)
            : null;
        if (frameTarget && this.canSnapIntoFrame(block, frameTarget)) {
            this.snapBlockIntoFrame(block, frameTarget);
            return;
        }

        if (this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull() &&
            !drag.wasCaptureOnSurface) {
            if (drag.pullFromFrame && drag.sourceFrame) {
                this.snapBlockBackIntoFrame(block, drag.sourceFrame);
            } else {
                this.returnToDock(block);
            }
            return;
        }

        this.deployBlockToDepthBar(block);
    },

    /* --- Drag mechanics (spring-follow + velocity tilt) --- */

    beginDragLift(block, e, dragMeta = {}) {
        const depthUi = dragMeta.depthUi === true;
        const pullFromFrame = !!block.nestedIn;
        const liftFromSurface = block.element.classList.contains('is-deployed') || dragMeta.liftFromSurface;
        const liftFromBar = depthUi && (
            block.element.classList.contains('is-depth-ui-mounted') || liftFromSurface
        );
        const wasCaptureOnSurface = this.isActiveCaptureBlock(block) && (
            liftFromSurface ||
            liftFromBar ||
            !!(block.nestedIn && block.nestedIn.element.classList.contains('is-deployed'))
        );
        const rect = block.element.getBoundingClientRect();
        block.x = rect.left;
        block.y = rect.top;

        block.element.classList.add('is-dragging');
        block.element.classList.remove('is-deployed', 'is-nested', 'is-depth-ui-mounted');
        if (!pullFromFrame) {
            block.slotElement.classList.add('is-empty');
        }
        document.body.appendChild(block.element);
        this.applyTransform(block, 0);

        if (pullFromFrame) {
            this.refreshFrameLayout(block.nestedIn);
        } else if (!depthUi && (block.state === 'docked' || !block.body)) {
            this.attachBody(block);
        } else if (depthUi) {
            this.detachBody(block);
            block.body = null;
        }

        block.state = 'active';
        block.isDragging = true;
        block.carryOrbitWhileDragging = depthUi ? false : !!liftFromSurface;

        if (depthUi) {
            this.depthBlockBarElement?.classList.add('is-drop-active');
        }

        if (pullFromFrame || liftFromSurface || liftFromBar) {
            this.updateDotFocusFilter();
        } else if (!depthUi) {
            this.updateWorkspaceState();
        }

        this.dragState = {
            block: block,
            depthUi: depthUi,
            clickPending: false,
            pullFromFrame: pullFromFrame,
            sourceFrame: pullFromFrame ? block.nestedIn : null,
            wasCaptureOnSurface: wasCaptureOnSurface,
            liftFromSurface: !!liftFromSurface,
            liftFromBar: liftFromBar,
            startClientX: dragMeta.startClientX ?? e.clientX,
            startClientY: dragMeta.startClientY ?? e.clientY,
            restoreX: dragMeta.restoreX ?? block.x,
            restoreY: dragMeta.restoreY ?? block.y,
            pointerX: e.clientX,
            pointerY: e.clientY,
            grabDX: e.clientX - rect.left,
            grabDY: e.clientY - rect.top,
            velX: 0, velY: 0,
            rafId: null,
            hoverFrame: null
        };

        this.dragLoop();
    },

    startDrag(block, e) {
        const depthUi = this.isDepthUiLevel();
        if (this.dragState || (!depthUi && DepthController.currentLevel !== 1)) return;
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.isRunning()) {
            return;
        }
        if (block.state === 'docked' && !block.nestedIn &&
            this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull()) {
            return;
        }
        e.preventDefault();

        if (!depthUi &&
            DepthController.currentLevel === 1 &&
            this.isBlockClickTransitionEligible(block)) {
            this.dragState = {
                block: block,
                clickPending: true,
                depthUi: false,
                startClientX: e.clientX,
                startClientY: e.clientY,
                pointerX: e.clientX,
                pointerY: e.clientY
            };
            this.boundMove = (ev) => this.onPointerMove(ev);
            this.boundUp = (ev) => this.endDrag(ev);
            document.addEventListener('pointermove', this.boundMove);
            document.addEventListener('pointerup', this.boundUp);
            return;
        }

        this.beginDragLift(block, e, { depthUi });
        this.boundMove = (ev) => this.onPointerMove(ev);
        this.boundUp = (ev) => this.endDrag(ev);
        document.addEventListener('pointermove', this.boundMove);
        document.addEventListener('pointerup', this.boundUp);
    },

    onPointerMove(e) {
        if (!this.dragState) return;

        if (this.dragState.clickPending) {
            const drag = this.dragState;
            const moved = Math.hypot(
                e.clientX - drag.startClientX,
                e.clientY - drag.startClientY
            );
            const clickThreshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved >= clickThreshold) {
                const block = drag.block;
                const restoreX = block.element.getBoundingClientRect().left;
                const restoreY = block.element.getBoundingClientRect().top;
                document.removeEventListener('pointermove', this.boundMove);
                document.removeEventListener('pointerup', this.boundUp);
                this.dragState = null;
                this.beginDragLift(block, e, {
                    depthUi: false,
                    liftFromSurface: true,
                    startClientX: drag.startClientX,
                    startClientY: drag.startClientY,
                    restoreX,
                    restoreY
                });
                this.boundMove = (ev) => this.onPointerMove(ev);
                this.boundUp = (ev) => this.endDrag(ev);
                document.addEventListener('pointermove', this.boundMove);
                document.addEventListener('pointerup', this.boundUp);
            }
            return;
        }

        this.dragState.pointerX = e.clientX;
        this.dragState.pointerY = e.clientY;
        this.updateFrameDropTarget(e.clientX, e.clientY);
    },

    updateFrameDropTarget(x, y) {
        if (!this.dragState) return;
        const block = this.dragState.block;
        const prev = this.dragState.hoverFrame;
        let next = null;

        if (block.type !== 'frame' && this.isActiveCaptureBlock(block)) {
            next = this.findFrameAtPoint(x, y);
            if (next && !this.canSnapIntoFrame(block, next)) {
                if (!(this.dragState.pullFromFrame && next === this.dragState.sourceFrame)) {
                    next = null;
                }
            }
        }

        if (prev !== next) {
            if (prev) prev.element.classList.remove('is-drop-target');
            if (next) next.element.classList.add('is-drop-target');
            this.dragState.hoverFrame = next;
        }
    },

    dragLoop() {
        if (!this.dragState) return;
        const drag = this.dragState;
        const block = drag.block;
        const follow = CONFIG.warehouse.drag.followFactor;

        // Spring-lag follow: the block trails the cursor, giving it perceived mass
        const targetX = drag.pointerX - drag.grabDX;
        const targetY = drag.pointerY - drag.grabDY;
        drag.velX = (targetX - block.x) * follow;
        drag.velY = (targetY - block.y) * follow;
        block.x += drag.velX;
        block.y += drag.velY;

        const tilt = Math.max(-CONFIG.warehouse.drag.maxTilt,
                     Math.min(CONFIG.warehouse.drag.maxTilt, drag.velX * 0.6));
        this.applyTransform(block, tilt);
        if (!drag.depthUi) {
            this.syncBody(block);
        }
        if (block.type === 'frame' && (block.nestedBlocks || []).length > 0) {
            this.refreshFrameLayout(block);
        }

        drag.rafId = requestAnimationFrame(() => this.dragLoop());
    },

    endDrag(e) {
        if (!this.dragState) return;
        const drag = this.dragState;
        const block = drag.block;

        if (drag.clickPending) {
            document.removeEventListener('pointermove', this.boundMove);
            document.removeEventListener('pointerup', this.boundUp);
            this.dragState = null;

            const moved = Math.hypot(
                e.clientX - drag.startClientX,
                e.clientY - drag.startClientY
            );
            const clickThreshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved < clickThreshold &&
                typeof DepthTransitionOrchestrator !== 'undefined') {
                DepthTransitionOrchestrator.runBlockClick(block);
            }
            return;
        }

        cancelAnimationFrame(drag.rafId);
        document.removeEventListener('pointermove', this.boundMove);
        document.removeEventListener('pointerup', this.boundUp);

        const moved = Math.hypot(
            e.clientX - drag.startClientX,
            e.clientY - drag.startClientY
        );
        const clickThreshold = CONFIG.depth.clickDragThreshold ?? 6;

        if (
            drag.liftFromSurface &&
            drag.wasCaptureOnSurface &&
            moved < clickThreshold &&
            DepthController.currentLevel === 1 &&
            typeof DepthTransitionOrchestrator !== 'undefined'
        ) {
            this.dragState = null;
            block.isDragging = false;
            block.carryOrbitWhileDragging = false;
            block.x = drag.restoreX;
            block.y = drag.restoreY;
            block.element.classList.remove('is-dragging');
            block.element.classList.add('is-deployed');
            this.applyTransform(block, 0);
            if (block.body) {
                Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
            }
            DepthTransitionOrchestrator.runBlockClick(block);
            return;
        }

        if (drag.hoverFrame) {
            drag.hoverFrame.element.classList.remove('is-drop-target');
        }
        this.dragState = null;
        block.isDragging = false;
        block.carryOrbitWhileDragging = false;

        if (drag.depthUi) {
            this.endDragDepthUi(e, drag, block);
            return;
        }

        const dockRect = this.shellElement.getBoundingClientRect();
        const overDock = e.clientY >= dockRect.top &&
                         e.clientX >= dockRect.left && e.clientX <= dockRect.right;

        if (overDock) {
            if (drag.pullFromFrame && block.nestedIn) this.ejectFromFrame(block);
            this.returnToDock(block);
            return;
        }

        if (drag.pullFromFrame && block.nestedIn) {
            const sourceFrame = block.nestedIn;
            if (this.frameContainsPoint(sourceFrame, e.clientX, e.clientY)) {
                this.snapBlockBackIntoFrame(block, sourceFrame);
                return;
            }
            const otherFrame = this.findFrameAtPoint(e.clientX, e.clientY);
            if (otherFrame && otherFrame !== sourceFrame && this.canSnapIntoFrame(block, otherFrame)) {
                this.ejectFromFrame(block);
                this.snapBlockIntoFrame(block, otherFrame);
                return;
            }
            this.ejectFromFrame(block);
        }

        const frameTarget = this.isActiveCaptureBlock(block)
            ? this.findFrameAtPoint(e.clientX, e.clientY)
            : null;
        if (frameTarget && this.canSnapIntoFrame(block, frameTarget)) {
            this.snapBlockIntoFrame(block, frameTarget);
            return;
        }

        if (this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull() &&
            !drag.wasCaptureOnSurface) {
            if (drag.pullFromFrame && drag.sourceFrame) {
                this.snapBlockBackIntoFrame(block, drag.sourceFrame);
            } else {
                this.returnToDock(block);
            }
            return;
        }

        // Deployed blocks stay static: immovable anchors the dots organize around.
        // Convert viewport coords to page coords so the block scrolls with the canvas.
        block.x += window.pageXOffset;
        block.y += window.pageYOffset;
        const { width, height } = this.blockMetrics(block);
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2;
        block.bodyY = block.y + height / 2;
        if (!block.body) this.attachBody(block);
        Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });

        block.element.classList.remove('is-dragging');
        block.element.classList.add('is-deployed');
        this.applyTransform(block, 0);
        this.syncFrameBodyOwnership(block);
        if (block.type === 'frame') this.refreshFrameLayout(block);
        this.updateWorkspaceState();
    },

    returnToDock(block) {
        if (block.type === 'frame' && (block.nestedBlocks || []).length > 0) {
            [...block.nestedBlocks].forEach(nested => {
                this.ejectFromFrame(nested);
                this.returnToDock(nested);
            });
        }

        const slotRect = block.slotElement.getBoundingClientRect();
        block.element.classList.add('is-returning');
        block.x = slotRect.left;
        block.y = slotRect.top;
        this.applyTransform(block, 0);

        this.detachBody(block);
        block.state = 'docked';
        block.nestedIn = null;
        block.carryOrbitWhileDragging = false;
        if (this.isDepthUiLevel()) {
            this.updateDotFocusFilter();
        } else {
            this.updateWorkspaceState();
        }

        setTimeout(() => {
            block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning', 'is-nested', 'is-depth-ui-mounted');
            block.element.style.transform = '';
            block.slotElement.classList.remove('is-empty');
            block.slotElement.appendChild(block.element);
            delete block._depthUiSnapshot;
            if (this.isDepthUiLevel()) {
                const deployedCount = this.blocks.filter(b =>
                    b.state === 'active' &&
                    b.element?.classList.contains('is-deployed') &&
                    !b.nestedIn
                ).length;
                this.depthBlockBarElement?.classList.toggle('has-blocks', deployedCount > 0);
                this.shellElement?.classList.toggle('is-workspace-active', deployedCount > 0);
                this.updateScrollReserve();
                this.updateDotFocusFilter();
            }
        }, CONFIG.warehouse.returnDuration);
    },

    applyTransform(block, tiltDeg) {
        block.element.style.transform = `translate3d(${block.x}px, ${block.y}px, 0) rotate(${tiltDeg}deg)`;
    },

    /* --- Physics integration --- */

    attachBody(block) {
        const radius = CONFIG.warehouse.blockHeight / 2;
        block.body = Matter.Bodies.circle(0, 0, radius, { isStatic: true });
        this.syncBody(block);
        Matter.World.add(PhysicsEngine.engine.world, block.body);
    },

    detachBody(block) {
        if (!block.body) return;
        Matter.World.remove(PhysicsEngine.engine.world, block.body);
        block.body = null;
    },

    syncBody(block) {
        const { width, height } = this.blockMetrics(block);
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2 + window.pageXOffset;
        block.bodyY = block.y + height / 2 + window.pageYOffset;
        if (block.body) Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
    },

    syncDeployedBlocksForDepth() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (level >= 2) {
            this.mountDeployedBlocksToDepthBar();
        } else {
            this.unmountDeployedBlocksFromDepthBar();
        }
    },

    mountDeployedBlocksToDepthBar() {
        if (!this.depthBlockBarElement) return;

        const deployed = this.blocks.filter(block =>
            block.state === 'active' &&
            block.element?.classList.contains('is-deployed') &&
            !block.nestedIn
        );
        const deployedSet = new Set(deployed);

        this.blocks.forEach(block => {
            if (!block._depthUiSnapshot) return;
            if (block.element.parentNode !== this.depthBlockBarElement) return;
            if (deployedSet.has(block)) return;

            const snap = block._depthUiSnapshot;
            block.element.classList.remove('is-depth-ui-mounted');
            block.x = snap.x;
            block.y = snap.y;
            this.applyTransform(block, 0);
            if (snap.parent) {
                if (snap.nextSibling && snap.nextSibling.parentNode === snap.parent) {
                    snap.parent.insertBefore(block.element, snap.nextSibling);
                } else {
                    snap.parent.appendChild(block.element);
                }
            } else {
                document.body.appendChild(block.element);
            }
            delete block._depthUiSnapshot;
        });

        deployed.forEach(block => {
            if (block._depthUiSnapshot && block.element.parentNode === this.depthBlockBarElement) {
                if (block.type === 'frame') this.refreshFrameLayout(block);
                return;
            }

            if (!block._depthUiSnapshot) {
                block._depthUiSnapshot = {
                    parent: block.element.parentNode,
                    nextSibling: block.element.nextSibling,
                    x: block.x,
                    y: block.y
                };
            }
            block.element.classList.add('is-depth-ui-mounted');
            block.element.style.transform = '';
            this.depthBlockBarElement.appendChild(block.element);
            if (block.type === 'frame') this.refreshFrameLayout(block);
        });

        this.depthBlockBarElement.classList.toggle('has-blocks', deployed.length > 0);
        this.updateScrollReserve();
    },

    unmountDeployedBlocksFromDepthBar() {
        this.blocks.forEach(block => {
            if (!block._depthUiSnapshot) return;

            const snap = block._depthUiSnapshot;
            block.element.classList.remove('is-depth-ui-mounted');

            if (snap.depthUiOnly) {
                delete block._depthUiSnapshot;
                this.placeBlockOnCanvasFromDepthUi(block);
                if (block.type === 'frame') this.refreshFrameLayout(block);
                return;
            }

            block.x = snap.x;
            block.y = snap.y;
            this.applyTransform(block, 0);

            if (snap.parent) {
                if (snap.nextSibling && snap.nextSibling.parentNode === snap.parent) {
                    snap.parent.insertBefore(block.element, snap.nextSibling);
                } else {
                    snap.parent.appendChild(block.element);
                }
            } else {
                document.body.appendChild(block.element);
            }

            delete block._depthUiSnapshot;
            if (block.type === 'frame') this.refreshFrameLayout(block);
        });

        if (this.depthBlockBarElement) {
            this.depthBlockBarElement.classList.remove('has-blocks');
        }
        this.updateScrollReserve();
    },

    // Pill half-diagonal — wider labels need a larger exclusion zone than blockHeight/2
    getBlockCollisionRadius(block) {
        const w = block.collisionW || CONFIG.warehouse.blockHeight;
        const h = block.collisionH || CONFIG.warehouse.blockHeight;
        return Math.hypot(w / 2, h / 2);
    },

    // Push a point outside the block pill (axis-aligned) by pad px
    pushPointOutOfBlockAabb(block, x, y, pad) {
        const w = block.collisionW || CONFIG.warehouse.blockHeight;
        const h = block.collisionH || CONFIG.warehouse.blockHeight;
        const cx = block.bodyX;
        const cy = block.bodyY;
        const hw = w / 2 + pad;
        const hh = h / 2 + pad;
        let dx = x - cx;
        let dy = y - cy;
        const ox = hw - Math.abs(dx);
        const oy = hh - Math.abs(dy);
        if (ox <= 0 || oy <= 0) return { x, y, moved: false };

        if (ox < oy) {
            dx = Math.sign(dx || 1) * hw;
        } else {
            dy = Math.sign(dy || 1) * hh;
        }
        return { x: cx + dx, y: cy + dy, moved: true };
    },

    /* --- Workspace grid (secondary layout) --- */

    // Engages the secondary grid when the first block leaves the dock;
    // recomputes void width as more blocks join, releases when all return
    updateWorkspaceState() {
        const activeCount = this.getActiveBlockCount();
        const anyActive = activeCount > 0;
        const wasOff = !this.workspaceCenters;
        const rushCfg = CONFIG.warehouse.workspaceGrid;

        if (anyActive) {
            if (wasOff) {
                this.workspaceCenters = this.computeWorkspaceGrid({ relayout: true });
                this.workspaceGridRush = 'out';
                this.workspaceGridRushUntil = performance.now() + rushCfg.rushDuration;
                SpatialNavigation.bypassScrollClamp(rushCfg.rushDuration);
                AppState.centerViewport({ smooth: true });
            } else {
                // Void expansion — slide bank molecules instead of hard snap
                this.workspaceCenters = this.computeWorkspaceGrid({ relayout: false });
                this.workspaceGridRush = 'shift';
                this.workspaceGridRushUntil = performance.now() + rushCfg.rushDuration * 0.72;
            }
        } else {
            const wasOn = !!this.workspaceCenters;
            this.workspaceCenters = null;
            this.workspaceSlotLayout = null;
            if (wasOn) {
                this.workspaceGridRush = 'in';
                this.workspaceGridRushUntil = performance.now() + rushCfg.rushDuration;
                SpatialNavigation.bypassScrollClamp(rushCfg.rushDuration);
                this.releaseBankGridStatic(PhysicsEngine.bodiesData);
                PhysicsEngine.bodiesData.forEach(d => {
                    d.overrideTarget = null;
                    d.smoothTarget = null;
                });
                AppState.centerViewport({ smooth: true });
            } else {
                this.workspaceGridRush = null;
                this.workspaceGridRushUntil = 0;
            }
        }

        if (this.shellElement) {
            this.shellElement.classList.toggle('is-workspace-active', anyActive);
        }

        this.updateWarehouseCapacityUI();
        this.updateDotFocusFilter();
    },

    // Gray out docked tag/author pills when the workspace capture limit is reached
    updateWarehouseCapacityUI() {
        const full = this.isWarehouseCaptureFull();
        const suppressFullGray = typeof this.shouldUseCooccurrenceDockMute === 'function' &&
            this.shouldUseCooccurrenceDockMute();
        if (this.dockElement) {
            this.dockElement.classList.toggle('is-capture-full', full && !suppressFullGray);
        }
    },

    // Macro view: matching-tag dots or whole author molecules stay filled;
    // filter-frame nested blocks remove matching molecules from the board.
    updateDotFocusFilter() {
        const level = DepthController.currentLevel;
        const isMacro = level === 1;
        const isV2Depth = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        const isCatalogDepth = level >= 2 &&
            typeof CatalogLayoutEngine !== 'undefined' &&
            !CatalogLayoutEngine.isLegacyMode() &&
            !isV2Depth;

        const { tags: activeTags, authors: activeAuthors } = this.getActiveFocusCriteria();

        const { tags: filterTags, authors: filterAuthors } = this.getFilterCriteria();
        const focus = activeTags.size > 0 || activeAuthors.size > 0;
        const hasFilterCriteria = filterTags.size > 0 || filterAuthors.size > 0;
        const shouldPeel = hasFilterCriteria && isMacro;

        document.body.classList.toggle(
            'is-block-focus',
            focus && ((isV2Depth && level <= 3) || isMacro || isCatalogDepth)
        );
        document.body.classList.toggle('is-block-filter', hasFilterCriteria);
        document.body.classList.toggle('is-catalog-lens', focus && isCatalogDepth);
        document.body.classList.toggle(
            'is-depth-workspace-active',
            isV2Depth && level >= 2 && this.getActiveBlockCount() > 0
        );
        document.body.classList.toggle(
            'is-depth-filter-layout',
            isV2Depth && level >= 2 && (hasFilterCriteria || focus)
        );

        const shouldFilter = new Set();
        const wrappers = document.querySelectorAll('.note-wrapper');

        wrappers.forEach((wrapper, noteIndex) => {
            if (hasFilterCriteria && this.moleculeMatchesFilter(noteIndex, filterTags, filterAuthors)) {
                shouldFilter.add(noteIndex);
            }
        });

        // Filter removed — restore molecules
        [...this.filterExitByNote.keys()].forEach(noteIndex => {
            if (!shouldFilter.has(noteIndex)) {
                this.cancelFilterExit(noteIndex, PhysicsEngine.bodiesData);
            }
        });
        [...this.filteredNoteIndices].forEach(noteIndex => {
            if (!shouldFilter.has(noteIndex)) {
                this.restoreFilteredNote(noteIndex, PhysicsEngine.bodiesData);
            }
        });

        wrappers.forEach((wrapper, noteIndex) => {
            const dots = wrapper.querySelectorAll('.layer-dot');
            const authorCode = wrapper.dataset.authorCode || '';

            if (this.filterExitByNote.has(noteIndex)) {
                return;
            }

            if (this.filteredNoteIndices.has(noteIndex)) {
                wrapper.classList.add('is-molecule-filtered-out');
                return;
            }

            if (shouldFilter.has(noteIndex)) {
                if (shouldPeel) {
                    this.beginFilterExit(noteIndex, PhysicsEngine.bodiesData);
                } else {
                    this.applyFilterInstant(noteIndex, PhysicsEngine.bodiesData);
                }
                return;
            }

            wrapper.classList.remove(
                'is-molecule-filtered-out',
                'is-molecule-filtering-hollow',
                'is-molecule-filtering-peel',
                'is-filter-peel-fade'
            );

            if (!focus) {
                wrapper.classList.remove('is-molecule-focused', 'is-molecule-muted');
                dots.forEach(dot => {
                    dot.classList.remove('is-dot-focused', 'is-dot-muted');
                });
                return;
            }

            const moleculeTags = [...dots]
                .map(dot => dot.dataset.tag)
                .filter(Boolean);
            const isRelevant = this.noteMatchesActiveFocus(
                moleculeTags,
                authorCode,
                activeTags,
                activeAuthors
            );

            wrapper.classList.toggle('is-molecule-focused', isRelevant);
            wrapper.classList.toggle('is-molecule-muted', !isRelevant);

            if (!isMacro) return;

            dots.forEach(dot => {
                const tag = dot.dataset.tag || '';
                const dotMatchesTag = tag && activeTags.has(tag);
                const dotMatchesAuthor = authorCode && activeAuthors.has(authorCode);
                const dotMatches = dotMatchesTag || dotMatchesAuthor;
                dot.classList.toggle('is-dot-focused', dotMatches);
                dot.classList.toggle('is-dot-muted', !dotMatches);
            });
        });

        if (PhysicsEngine.bodiesData) {
            PhysicsEngine.bodiesData.forEach(item => {
                item.isFiltered = this.filteredNoteIndices.has(item.noteIndex);
            });
        }

        if (typeof CatalogState !== 'undefined') {
            CatalogState.rebuildFromWarehouse();
        }

        if (isV2Depth && level >= 2 && typeof DepthV2 !== 'undefined') {
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            DepthV2.relayoutForFilterChange({ force: true });
            if (level === 2 && typeof MesoMock !== 'undefined') {
                MesoMock.refreshFocusLensTextures();
            }
        }

        this.updateWarehouseBlockRelevance();
        this.updateWarehouseCapacityUI();
    }
};
