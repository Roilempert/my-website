/* ==========================================================================
   05. SPATIAL NAVIGATION (X, Y AXIS)
   ========================================================================== */
const SpatialNavigation = {
    threshold: CONFIG.navigation.edgeThreshold,
    maxSpeed: CONFIG.navigation.maxSpeed,
    mouseX: 0,
    mouseY: 0,
    isScrolling: false,
    isPaused: false,
    navSurface: null,
    spaceHeld: false,
    scrollBypassUntil: 0,
    _constraining: false,
    pan: {
        active: false,
        pointerId: null,
        lastX: 0,
        lastY: 0,
        startX: 0,
        startY: 0,
        didMove: false
    },

    init() {
        this.navSurface = document.getElementById('nav-surface');

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.updateDepthPanCursor(e.clientX, e.clientY);
            if (CONFIG.navigation.edgeScrollEnabled &&
                !this.isScrolling && !this.isPaused && !this.pan.active) {
                this.calculateAndScroll();
            }
        });

        window.addEventListener('mouseleave', () => {
            this.isScrolling = false;
        });

        window.addEventListener('keydown', (e) => {
            if (e.code !== CONFIG.navigation.spacePanKey) return;
            if (e.repeat || this.isPaused || ArtifactInspector.isActive) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            this.spaceHeld = true;
            document.body.classList.add('is-space-pan');
        }, { passive: false });

        window.addEventListener('keyup', (e) => {
            if (e.code !== CONFIG.navigation.spacePanKey) return;
            this.spaceHeld = false;
            document.body.classList.remove('is-space-pan');
        });

        this.onPanDown = (e) => this.handlePanDown(e);
        this.onPanMove = (e) => this.handlePanMove(e);
        this.onPanEnd = (e) => this.handlePanEnd(e);

        if (this.navSurface) {
            this.navSurface.addEventListener('pointerdown', this.onPanDown);
        }
        document.addEventListener('pointerdown', (e) => {
            if (this.spaceHeld) {
                this.handlePanDown(e);
                return;
            }
            if (!e.target?.closest?.('#app')) return;
            if (e.target === this.navSurface) return;
            if (!this.canStartPan(e)) return;
            this.handlePanDown(e);
        }, { capture: true });
        document.addEventListener('pointermove', this.onPanMove);
        document.addEventListener('pointerup', this.onPanEnd);
        document.addEventListener('pointercancel', this.onPanEnd);

        window.addEventListener('scroll', () => this.constrainScrollPosition(), { passive: true });

        window.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    },

    handleWheel(e) {
        if (e.ctrlKey) return;

        if (this.isPaused ||
            (typeof DepthController !== 'undefined' && DepthController.isWheelLocked())) {
            e.preventDefault();
            return;
        }

        if (typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            e.preventDefault();
            return;
        }

        if (this.isPanBlockedTarget(e.target)) return;

        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
            return;
        }

        e.preventDefault();

        const speed = CONFIG.navigation.wheel?.speed ?? 1;
        let dx = e.deltaX * speed;
        let dy = e.deltaY * speed;

        [dx, dy] = this.clampToContent(dx, dy);

        if (dx === 0 && dy === 0) return;

        this.isScrolling = true;
        window.scrollBy(dx, dy);
        IdleRefresh.touch();
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.schedulePanUpdate();
        }
        requestAnimationFrame(() => {
            this.isScrolling = false;
        });
    },

    // Soft guard for wheel/trackpad — viewport-relative, RTL-safe
    constrainScrollPosition() {
        if (this._constraining || this.isPaused || this.pan.active || this.isScrolling) return;
        if (ActionWarehouse.dragState) return;
        if (this.shouldBypassScrollClamp()) return;

        const limits = this.getViewportClampLimits();
        if (!limits) return;

        const { rect, leftMin, leftMax, topMin, topMax } = limits;
        let dx = 0;
        let dy = 0;

        if (rect.left < leftMin) dx = rect.left - leftMin;
        else if (rect.left > leftMax) dx = rect.left - leftMax;

        if (rect.top < topMin) dy = rect.top - topMin;
        else if (rect.top > topMax) dy = rect.top - topMax;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        this._constraining = true;
        window.scrollBy(dx, dy);
        this._constraining = false;
    },

    getViewportClampLimits() {
        const app = document.getElementById('app');
        if (!app) return null;

        const rect = app.getBoundingClientRect();
        const pad = CONFIG.navigation.contentPadding;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const bottomPad = pad + (DepthController.currentLevel === 1 ? ActionWarehouse.getScrollReserve() : 0);

        return {
            rect,
            leftMin: Math.min(pad, vw - rect.width - pad),
            leftMax: pad,
            topMin: Math.min(pad, vh - rect.height - bottomPad),
            topMax: pad
        };
    },

    pause() { this.isPaused = true; },
    resume() { this.isPaused = false; },

    bypassScrollClamp(ms = CONFIG.warehouse.workspaceGrid.rushDuration) {
        this.scrollBypassUntil = performance.now() + ms;
    },

    shouldBypassScrollClamp() {
        return performance.now() < this.scrollBypassUntil ||
            ActionWarehouse.isWorkspaceGridRush();
    },

    getAppBounds() {
        const appElement = document.getElementById('app');
        if (!appElement) return null;
        const rect = appElement.getBoundingClientRect();
        return {
            minX: rect.left + window.pageXOffset,
            maxX: rect.right + window.pageXOffset,
            minY: rect.top + window.pageYOffset,
            maxY: rect.bottom + window.pageYOffset
        };
    },

    mergeBounds(a, b) {
        if (!a) return b;
        if (!b) return a;
        return {
            minX: Math.min(a.minX, b.minX),
            maxX: Math.max(a.maxX, b.maxX),
            minY: Math.min(a.minY, b.minY),
            maxY: Math.max(a.maxY, b.maxY)
        };
    },

    isDepthCanvasLevel() {
        return typeof DepthController !== 'undefined' &&
            DepthController.currentLevel >= 2 &&
            typeof DepthV2 !== 'undefined' &&
            DepthV2.isActive();
    },

    hitTestDepthNote(clientX, clientY) {
        if (!this.isDepthCanvasLevel()) return null;

        const level = DepthController.currentLevel;
        const wrappers = document.querySelectorAll('#app .note-wrapper');
        let hit = null;
        let hitArea = Infinity;

        wrappers.forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded') ||
                wrapper.classList.contains('is-molecule-filtered-out')) {
                return;
            }

            const target = level === 2
                ? (wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                    || wrapper.querySelector('.depth-v2-glyph--meso'))
                : (wrapper.querySelector('.micro-mock__card.note-card')
                    || wrapper.querySelector('.depth-v2-glyph--micro'));
            if (!target) return;
            const rect = target.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            if (clientX < rect.left || clientX > rect.right ||
                clientY < rect.top || clientY > rect.bottom) {
                return;
            }

            const area = rect.width * rect.height;
            if (area < hitArea) {
                hit = wrapper;
                hitArea = area;
            }
        });

        return hit;
    },

    dispatchDepthNoteTap(clientX, clientY) {
        const wrapper = this.hitTestDepthNote(clientX, clientY);
        if (!wrapper) return false;

        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(clientX, clientY)) {
            return false;
        }

        if (typeof ArtifactInspector !== 'undefined') {
            if (ArtifactInspector.isActive) {
                ArtifactInspector.close();
            } else {
                ArtifactInspector.open(wrapper);
            }
            return true;
        }

        return false;
    },

    updateDepthPanCursor(clientX, clientY) {
        if (!this.navSurface || !this.isDepthCanvasLevel()) {
            if (this.navSurface) this.navSurface.style.removeProperty('cursor');
            return;
        }
        if (this.pan.active || this.spaceHeld) return;

        const overNote = !!this.hitTestDepthNote(clientX, clientY);
        this.navSurface.style.cursor = overNote ? 'pointer' : 'grab';
    },

    isPanBlockedTarget(target) {
        if (!(target instanceof Element)) return true;
        if (ArtifactInspector.isActive) return true;
        if (ActionWarehouse.dragState) return true;
        return !!target.closest('.warehouse-shell, .action-block, .warehouse-reset, .focus-backdrop.active, .site-navigation-layers, .site-navigation-maps');
    },

    canStartPan(e) {
        if (this.isPaused || e.button !== 0) return false;
        if (this.isPanBlockedTarget(e.target)) return false;

        if (this.spaceHeld) return true;

        const target = e.target;
        if (target === this.navSurface) return true;
        if (target.id === 'app') return true;

        if (this.isDepthCanvasLevel() && target.closest?.('#app')) {
            return true;
        }

        return false;
    },

    handlePanDown(e) {
        if (this.pan.active) return;
        if (!this.canStartPan(e)) return;

        e.preventDefault();
        this.pan.active = true;
        this.pan.pointerId = e.pointerId;
        this.pan.lastX = e.clientX;
        this.pan.lastY = e.clientY;
        this.pan.startX = e.clientX;
        this.pan.startY = e.clientY;
        this.pan.didMove = false;
        this.isScrolling = false;
        document.body.classList.add('is-canvas-panning');

        const captureEl = this.navSurface || document.body;
        if (captureEl.setPointerCapture) {
            try { captureEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
    },

    handlePanMove(e) {
        if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;

        if (!this.pan.didMove) {
            const moved = Math.hypot(
                e.clientX - this.pan.startX,
                e.clientY - this.pan.startY
            );
            const threshold = CONFIG.depth.clickDragThreshold ?? 6;
            if (moved >= threshold) this.pan.didMove = true;
        }

        const dx = e.clientX - this.pan.lastX;
        const dy = e.clientY - this.pan.lastY;
        this.pan.lastX = e.clientX;
        this.pan.lastY = e.clientY;

        if (Math.abs(dx) < CONFIG.navigation.pan.minDrag &&
            Math.abs(dy) < CONFIG.navigation.pan.minDrag) {
            return;
        }

        let scrollDx = -dx;
        let scrollDy = -dy;
        [scrollDx, scrollDy] = this.clampToContent(scrollDx, scrollDy);

        if (scrollDx !== 0 || scrollDy !== 0) {
            window.scrollBy(scrollDx, scrollDy);
            IdleRefresh.touch();
            if (typeof NavigationMap !== 'undefined') {
                NavigationMap.schedulePanUpdate();
            }
        }
    },

    handlePanEnd(e) {
        if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;

        const wasTap = !this.pan.didMove;
        const tapX = this.pan.startX;
        const tapY = this.pan.startY;

        this.pan.active = false;
        this.pan.pointerId = null;
        document.body.classList.remove('is-canvas-panning');

        const captureEl = this.navSurface || document.body;
        if (captureEl.releasePointerCapture) {
            try { captureEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }

        if (wasTap && this.isDepthCanvasLevel()) {
            this.dispatchDepthNoteTap(tapX, tapY);
        }

        this.updateDepthPanCursor(e.clientX, e.clientY);

        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.schedulePanUpdate();
        }
    },

    calculateAndScroll() {
        if (!CONFIG.navigation.edgeScrollEnabled) return;
        if (this.isPaused) return;
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(this.mouseX, this.mouseY)) {
            this.isScrolling = false;
            return;
        }

        let dx = 0;
        let dy = 0;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const threshold = this.threshold;
        const bottomThreshold = CONFIG.navigation.bottomEdgeThreshold;

        if (this.mouseX < threshold) {
            dx = -this.maxSpeed * (1 - this.mouseX / threshold);
        } else if (this.mouseX > width - threshold) {
            dx = this.maxSpeed * (1 - (width - this.mouseX) / threshold);
        }

        const bottomSpeed = CONFIG.navigation.bottomMaxSpeed;

        if (this.mouseY < threshold) {
            dy = -this.maxSpeed * (1 - this.mouseY / threshold);
        } else if (this.mouseY > height - bottomThreshold) {
            // Narrow, slow bottom zone; fully suppressed while hovering the warehouse
            if (!ActionWarehouse.isPointOverDock(this.mouseX, this.mouseY)) {
                dy = bottomSpeed * (1 - (height - this.mouseY) / bottomThreshold);
            }
        }

        [dx, dy] = this.clampToContent(dx, dy);

        if (dx !== 0 || dy !== 0) {
            this.isScrolling = true;
            window.scrollBy(dx, dy);
            IdleRefresh.touch();
            requestAnimationFrame(() => this.calculateAndScroll());
        } else {
            this.isScrolling = false;
        }
    },

    // Clamp pan / edge-scroll — viewport-relative (works with dir=rtl)
    clampToContent(dx, dy) {
        const limits = this.getViewportClampLimits();
        if (!limits) return [dx, dy];

        const { rect, leftMin, leftMax, topMin, topMax } = limits;

        if (dx > 0) {
            const maxDx = rect.left - leftMin;
            dx = maxDx > 0 ? Math.min(dx, maxDx) : 0;
        } else if (dx < 0) {
            dx = Math.max(dx, rect.left - leftMax);
        }

        if (dy > 0) {
            const maxDy = rect.top - topMin;
            dy = maxDy > 0 ? Math.min(dy, maxDy) : 0;
        } else if (dy < 0) {
            dy = Math.max(dy, rect.top - topMax);
        }

        return [dx, dy];
    },

    getBottomChromeTop(forLevel = DepthController.currentLevel) {
        let chromeTop = window.innerHeight;
        const selectors = ['.warehouse-shell', '.site-navigation-maps'];
        if (forLevel >= 2) {
            selectors.push('.depth-block-bar.has-blocks', '.depth-block-bar.is-drop-active');
        }

        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) return;
                chromeTop = Math.min(chromeTop, rect.top);
            });
        });

        return chromeTop;
    },

    // Catalog viewport — padded content area; height includes bottom UI strip (warehouse + minimap).
    getCatalogViewportPageRect(forLevel = DepthController.currentLevel) {
        const pad = CONFIG.navigation.contentPadding;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        void forLevel;

        return {
            left: scrollX + pad,
            top: scrollY + pad,
            width: Math.max(0, window.innerWidth - 2 * pad),
            height: Math.max(0, window.innerHeight - pad)
        };
    },

    getViewportPageRect(forLevel = DepthController.currentLevel) {
        return this.getCatalogViewportPageRect(forLevel);
    },

    // Page-rect span of the catalog viewport at scroll extremes; keeps minimap pan aligned with scroll clamp.
    getScrollAlignedMapBounds(forLevel = DepthController.currentLevel) {
        const pad = CONFIG.navigation.contentPadding;
        const vpW = Math.max(0, window.innerWidth - 2 * pad);
        const vpH = Math.max(0, window.innerHeight - pad);
        const limits = this.getViewportClampLimits();

        if (!limits) {
            const vp = this.getCatalogViewportPageRect(forLevel);
            return {
                minX: vp.left,
                maxX: vp.left + vp.width,
                minY: vp.top,
                maxY: vp.top + vp.height
            };
        }

        const { rect, leftMin, leftMax, topMin, topMax } = limits;
        const appPageLeft = rect.left + window.pageXOffset;
        const appPageTop = rect.top + window.pageYOffset;

        const scrollXAtLeft = appPageLeft - leftMax;
        const scrollXAtRight = appPageLeft - leftMin;
        const scrollYAtTop = appPageTop - topMax;
        const scrollYAtBottom = appPageTop - topMin;

        const docEl = document.documentElement;
        const bodyEl = document.body;
        const maxScrollY = Math.max(
            0,
            Math.max(docEl?.scrollHeight || 0, bodyEl?.scrollHeight || 0) - window.innerHeight
        );

        const achievableScrollYTop = Math.max(0, scrollYAtTop);
        const achievableScrollYBottom = Math.min(Math.max(0, scrollYAtBottom), maxScrollY);
        const achievableScrollXLeft = scrollXAtLeft;
        const achievableScrollXRight = Math.max(achievableScrollXLeft, scrollXAtRight);

        return {
            minX: achievableScrollXLeft + pad,
            maxX: achievableScrollXRight + pad + vpW,
            minY: achievableScrollYTop + pad,
            maxY: achievableScrollYBottom + pad + vpH
        };
    },

    getMacroContentBounds() {
        const appBounds = this.getAppBounds();
        if (!appBounds) return null;

        if (typeof PhysicsEngine === 'undefined' || !PhysicsEngine.bodiesData?.length) {
            return appBounds;
        }

        const orbitCfg = CONFIG.warehouse.orbit;
        const bodiesData = PhysicsEngine.bodiesData;
        const groups = new Map();

        bodiesData.forEach(item => {
            if (item.isFiltered) return;
            if (!groups.has(item.noteIndex)) {
                groups.set(item.noteIndex, []);
            }
            groups.get(item.noteIndex).push(item);
        });

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        groups.forEach((dots) => {
            const radius = ActionWarehouse.noteMoleculeExtent(bodiesData, dots[0].noteIndex, orbitCfg, dots.length);
            let cx = 0;
            let cy = 0;
            let count = 0;
            dots.forEach(item => {
                if (!item.body) return;
                cx += item.body.position.x;
                cy += item.body.position.y;
                count++;
            });
            if (!count) return;
            cx /= count;
            cy /= count;
            minX = Math.min(minX, cx - radius);
            maxX = Math.max(maxX, cx + radius);
            minY = Math.min(minY, cy - radius);
            maxY = Math.max(maxY, cy + radius);
        });

        ActionWarehouse.blocks.forEach(block => {
            if (block.state !== 'active') return;
            const r = ActionWarehouse.getBlockCollisionRadius(block);
            minX = Math.min(minX, block.bodyX - r);
            maxX = Math.max(maxX, block.bodyX + r);
            minY = Math.min(minY, block.bodyY - r);
            maxY = Math.max(maxY, block.bodyY + r);
        });

        if (!Number.isFinite(minX)) return appBounds;
        return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
    },

    getDepthNoteContentBounds() {
        const appBounds = this.getAppBounds();
        if (!appBounds) return null;

        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let count = 0;

        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            if (wrapper.classList.contains('is-layout-excluded')) return;
            if (wrapper.classList.contains('is-molecule-filtered-out')) return;
            const rect = wrapper.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            minX = Math.min(minX, rect.left + scrollX);
            maxX = Math.max(maxX, rect.right + scrollX);
            minY = Math.min(minY, rect.top + scrollY);
            maxY = Math.max(maxY, rect.bottom + scrollY);
            count++;
        });

        if (typeof ActionWarehouse !== 'undefined') {
            ActionWarehouse.blocks.forEach((block) => {
                if (block.state !== 'active' || block.type === 'frame' || !block.element) return;
                const rect = block.element.getBoundingClientRect();
                if (rect.width < 0.5 && rect.height < 0.5) return;
                const pad = scale(20);
                const cx = rect.left + rect.width / 2 + scrollX;
                const cy = rect.top + rect.height / 2 + scrollY;
                minX = Math.min(minX, cx - pad);
                maxX = Math.max(maxX, cx + pad);
                minY = Math.min(minY, cy - pad);
                maxY = Math.max(maxY, cy + pad);
                count++;
            });
        }

        if (!count || !Number.isFinite(minX)) return appBounds;
        return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
    },

    // Shared minimap coordinate frame — same scale/origin as L1 macro on every depth level.
    getMapReferenceBounds() {
        const macro = this.getMacroContentBounds();
        if (macro) return macro;
        const depth = this.getDepthNoteContentBounds();
        if (depth) return depth;
        return this.getAppBounds();
    },

    getCatalogLevelBounds(level) {
        const app = document.getElementById('app');
        const appBounds = this.getAppBounds();
        if (!app || !appBounds) return appBounds;

        const layout = CatalogState?.catalogLayout;
        if (layout?.bounds && layout.mode === 'catalog') {
            const rect = app.getBoundingClientRect();
            const scrollX = window.pageXOffset;
            const scrollY = window.pageYOffset;
            return {
                minX: rect.left + scrollX,
                maxX: rect.left + scrollX + layout.bounds.width,
                minY: rect.top + scrollY,
                maxY: rect.top + scrollY + layout.bounds.height
            };
        }

        return appBounds;
    },

    getContentBoundsForLevel(level) {
        if (level === 1) {
            return this.getMacroContentBounds();
        }

        if (level >= 2) {
            if (DepthController.currentLevel === level) {
                if (DepthController.currentLevel >= 2 && CatalogLayoutEngine.isCatalogLayoutActive()) {
                    return this.getCatalogLevelBounds(level);
                }
                if (MacroMesoBridge.isAnimating() && MacroMesoBridge.anchors.length > 0) {
                    const half = (parseFloat(
                        getComputedStyle(document.documentElement).getPropertyValue('--meso-anchor-size')
                    ) || scale(108)) / 2;
                    let minX = Infinity;
                    let maxX = -Infinity;
                    let minY = Infinity;
                    let maxY = -Infinity;

                    MacroMesoBridge.anchors.forEach(({ pageX, pageY }) => {
                        minX = Math.min(minX, pageX - half);
                        maxX = Math.max(maxX, pageX + half);
                        minY = Math.min(minY, pageY - half);
                        maxY = Math.max(maxY, pageY + half);
                    });

                    if (Number.isFinite(minX)) {
                        return this.mergeBounds(this.getAppBounds(), { minX, maxX, minY, maxY });
                    }
                }

                return this.getDepthNoteContentBounds();
            }
            return this.getAppBounds();
        }

        return this.getAppBounds();
    },

    getContentMarkersForLevel(level) {
        const markers = [];

        if (level === 1 && typeof PhysicsEngine !== 'undefined' && PhysicsEngine.bodiesData?.length > 0) {
            const groups = new Map();
            PhysicsEngine.bodiesData.forEach(item => {
                if (item.isFiltered) return;
                if (!groups.has(item.noteIndex)) groups.set(item.noteIndex, []);
                groups.get(item.noteIndex).push(item);
            });
            groups.forEach((dots) => {
                let cx = 0;
                let cy = 0;
                dots.forEach(item => {
                    cx += item.body.position.x;
                    cy += item.body.position.y;
                });
                markers.push({ x: cx / dots.length, y: cy / dots.length });
            });
            return markers;
        }

        const app = document.getElementById('app');
        if (!app) return markers;

        const appRect = app.getBoundingClientRect();
        const originX = appRect.left + window.pageXOffset;
        const originY = appRect.top + window.pageYOffset;

        const layout = CatalogState?.catalogLayout;
        if (layout?.entries && layout.mode === 'catalog' && level >= 2) {
            layout.entries.forEach((entry) => {
                if (entry.localX != null && entry.localY != null) {
                    markers.push({ x: originX + entry.localX, y: originY + entry.localY });
                }
            });
            if (markers.length > 0) return markers;
        }

        if (DepthController.currentLevel === level) {
            document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
                const rect = wrapper.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) return;
                markers.push({
                    x: rect.left + rect.width / 2 + window.pageXOffset,
                    y: rect.top + rect.height / 2 + window.pageYOffset
                });
            });
        }

        return markers;
    },

    // Live content bounding box in page coords — physics hull + full #app canvas
    getContentBounds() {
        const appBounds = this.getAppBounds();

        if (DepthController.currentLevel >= 2 && CatalogLayoutEngine.isCatalogLayoutActive()) {
            const layout = CatalogState.catalogLayout;
            const app = document.getElementById('app');
            if (layout?.bounds && app) {
                const rect = app.getBoundingClientRect();
                const scrollX = window.pageXOffset;
                const scrollY = window.pageYOffset;
                return {
                    minX: rect.left + scrollX,
                    maxX: rect.left + scrollX + layout.bounds.width,
                    minY: rect.top + scrollY,
                    maxY: rect.top + scrollY + layout.bounds.height
                };
            }
        }

        if (DepthController.currentLevel >= 2 && MacroMesoBridge.isAnimating() && MacroMesoBridge.anchors.length > 0) {
            const half = (parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--meso-anchor-size')
            ) || scale(108)) / 2;
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            MacroMesoBridge.anchors.forEach(({ pageX, pageY }) => {
                minX = Math.min(minX, pageX - half);
                maxX = Math.max(maxX, pageX + half);
                minY = Math.min(minY, pageY - half);
                maxY = Math.max(maxY, pageY + half);
            });

            if (Number.isFinite(minX)) {
                return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
            }
        }

        if (DepthController.currentLevel === 1 &&
            typeof PhysicsEngine !== 'undefined' &&
            PhysicsEngine.bodiesData?.length > 0) {
            const orbitCfg = CONFIG.warehouse.orbit;
            const bodiesData = PhysicsEngine.bodiesData;
            const groups = new Map();

            bodiesData.forEach(item => {
                if (item.isFiltered) return;
                if (!groups.has(item.noteIndex)) {
                    groups.set(item.noteIndex, []);
                }
                groups.get(item.noteIndex).push(item);
            });

            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            groups.forEach((dots) => {
                const radius = ActionWarehouse.noteMoleculeExtent(bodiesData, dots[0].noteIndex, orbitCfg, dots.length);
                let cx = 0;
                let cy = 0;
                dots.forEach(item => {
                    cx += item.body.position.x;
                    cy += item.body.position.y;
                });
                cx /= dots.length;
                cy /= dots.length;
                minX = Math.min(minX, cx - radius);
                maxX = Math.max(maxX, cx + radius);
                minY = Math.min(minY, cy - radius);
                maxY = Math.max(maxY, cy + radius);
            });

            ActionWarehouse.blocks.forEach(block => {
                if (block.state !== 'active') return;
                const r = ActionWarehouse.getBlockCollisionRadius(block);
                minX = Math.min(minX, block.bodyX - r);
                maxX = Math.max(maxX, block.bodyX + r);
                minY = Math.min(minY, block.bodyY - r);
                maxY = Math.max(maxY, block.bodyY + r);
            });

            if (!Number.isFinite(minX)) return appBounds;
            return this.mergeBounds(appBounds, { minX, maxX, minY, maxY });
        }

        return appBounds;
    }
};

