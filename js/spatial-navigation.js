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
        lastY: 0
    },

    init() {
        this.navSurface = document.getElementById('nav-surface');

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            if (!this.isScrolling && !this.isPaused && !this.pan.active) this.calculateAndScroll();
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
            if (this.spaceHeld) this.handlePanDown(e);
        });
        document.addEventListener('pointermove', this.onPanMove);
        document.addEventListener('pointerup', this.onPanEnd);
        document.addEventListener('pointercancel', this.onPanEnd);

        window.addEventListener('scroll', () => this.constrainScrollPosition(), { passive: true });
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
        this.isScrolling = false;
        document.body.classList.add('is-canvas-panning');

        const captureEl = this.navSurface || document.body;
        if (captureEl.setPointerCapture) {
            try { captureEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
    },

    handlePanMove(e) {
        if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;

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
        }
    },

    handlePanEnd(e) {
        if (!this.pan.active || e.pointerId !== this.pan.pointerId) return;

        this.pan.active = false;
        this.pan.pointerId = null;
        document.body.classList.remove('is-canvas-panning');

        const captureEl = this.navSurface || document.body;
        if (captureEl.releasePointerCapture) {
            try { captureEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
    },

    calculateAndScroll() {
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

    getViewportPageRect(forLevel = DepthController.currentLevel) {
        const bottomReserve = forLevel === 1 ? ActionWarehouse.getScrollReserve() : 0;
        return {
            left: window.pageXOffset,
            top: window.pageYOffset,
            width: window.innerWidth,
            height: Math.max(0, window.innerHeight - bottomReserve)
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

        groups.forEach((dots, noteIndex) => {
            const radius = ActionWarehouse.noteMoleculeExtent(bodiesData, noteIndex, orbitCfg);
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

            groups.forEach((dots, noteIndex) => {
                const radius = ActionWarehouse.noteMoleculeExtent(bodiesData, noteIndex, orbitCfg);
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

