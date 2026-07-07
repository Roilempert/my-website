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
    _depthDeployAnimating: null,
    _macroIndicationAnimating: null,
    _macroIndicationGhost: null,
    _macroIndicationBlock: null,
    filteredNoteIndices: new Set(),
    filterExitByNote: new Map(),   // noteIndex → { phase: 'hollow'|'peel', phaseStart }
    _navigationMapBlockCount: 0,
    popupOpen: false,
    launcherStripPinned: false,
    launcherExpandProgress: 0,
    launcherExpandDragState: null,
    launcherExpandReleaseLockUntil: 0,
    launcherExpandTeaserActive: false,
    _launcherExpandTeaserRaf: null,
    launcherWrapElement: null,
    launcherStripElement: null,
    launcherPillElement: null,
    launcherMapMountElement: null,
    launcherStripTrayElement: null,
    launcherElement: null,
    launcherGlyphElement: null,
    backdropElement: null,
    _popupOutsidePointerBound: null,
    _launcherPointerBound: null,
    _launcherPointerRaf: null,
    _launcherPointerXY: null,

    statisticsElement: null,
    messagePortElement: null,
    hoverPortElement: null,
    defaultMessageText: '',
    moleculeHoverMessageActive: false,
    hoverTypewriterTimer: null,
    hoverTypewriterGeneration: 0,
    hoverTypewriterNoteIndex: -1,
    mapMountElement: null,
    statisticsRowElements: null,
    statisticsDisplayValues: new Map(),
    statisticsTargetValues: new Map(),
    statisticsAnimationFrame: null,
    statisticsAnimationStartedAt: 0,
    statisticsAnimationDurationMs: 520,
    _wordPanelWords: null,
    resetElement: null,

    isWordPanelTheme() {
        return (CONFIG.theme?.mode || 'default') === 'censored';
    },

    isWordPanelLevelActive(level) {
        const resolved = level ?? (typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1);
        return this.isWordPanelTheme() && resolved === 3;
    },

    ensureWordPanel() {
        if (!this.trayBlocksElement) return;
        if (!this._wordPanelWords) this._wordPanelWords = new Set();
    },

    syncWordPanelMode(level) {
        const active = this.isWordPanelLevelActive(level);
        document.body.classList.toggle('is-word-panel-mode', active);
        this.shellElement?.classList.toggle('is-word-panel', active);
        this.trayBlocksElement?.classList.toggle('word-panel', active);
        if (active) {
            this.ensureWordPanel();
            this.updateWordPanelMessage();
        } else if (this.messagePortElement) {
            const text = CONFIG.warehouse?.dock?.messageText || 'גררו להפעלה';
            this.messagePortElement.textContent = text;
        }
        this.syncClearControlVisibility();
    },

    updateWordPanelMessage() {
        if (!this.messagePortElement) return;
        const text = CONFIG.theme?.wordPanelMessage
            || CONFIG.warehouse?.dock?.messageText
            || 'החזיקו על מילה לגילוי';
        this.messagePortElement.textContent = text;
    },

    addCommittedWord(_text) {
        // Word commits stay on canvas only — no dock chips.
    },

    hasClearableSelection() {
        if (this.isWordPanelLevelActive()) {
            return typeof NoteCensor !== 'undefined'
                && NoteCensor._committedKeys
                && NoteCensor._committedKeys.size > 0;
        }
        return this.blocks.some(b =>
            b.state === 'active' &&
            b.element?.classList.contains('is-deployed') &&
            !b.nestedIn
        );
    },

    syncClearControlVisibility() {
        document.body.classList.toggle('is-clear-visible', this.hasClearableSelection());
    },

    clearWordPanel() {
        if (!this.trayBlocksElement) return;
        this.trayBlocksElement.querySelectorAll('.word-panel__chip').forEach((el) => el.remove());
        if (this._wordPanelWords) this._wordPanelWords.clear();
    },

    init() {
        this.ensurePhysicsMaps();
        const dockCfg = CONFIG.warehouse.dock;

        this.refreshDisplayTokens();

        const messageText = dockCfg?.messageText || 'גררו להפעלה';
        this.defaultMessageText = messageText;
        this.shellElement = document.createElement('div');
        this.shellElement.classList.add('warehouse-shell');
        this.shellElement.dataset.siteLayer = 'warehouse';
        this.shellElement.innerHTML = `
            <div class="warehouse-shell__corners" aria-hidden="true">
                <span class="warehouse-shell__corner warehouse-shell__corner--tl"></span>
                <span class="warehouse-shell__corner warehouse-shell__corner--tr"></span>
                <span class="warehouse-shell__corner warehouse-shell__corner--bl"></span>
                <span class="warehouse-shell__corner warehouse-shell__corner--br"></span>
            </div>
            <button type="button" class="warehouse-reset general-t" aria-label="נקה לוח">נקה לוח</button>
            <div class="depth-block-bar__drop-zone" aria-hidden="true">
                <div class="depth-block-bar__corners warehouse-panel-corners" aria-hidden="true">
                    <span class="warehouse-panel-corner warehouse-panel-corner--tl"></span>
                    <span class="warehouse-panel-corner warehouse-panel-corner--tr"></span>
                    <span class="warehouse-panel-corner warehouse-panel-corner--bl"></span>
                    <span class="warehouse-panel-corner warehouse-panel-corner--br"></span>
                </div>
            </div>
            <div class="depth-block-bar" aria-hidden="true"></div>
            <div class="warehouse-layout">
                <div class="warehouse-dock">
                    <div class="warehouse-panel-corners warehouse-panel-corners--dock" aria-hidden="true">
                        <span class="warehouse-panel-corner warehouse-panel-corner--tr"></span>
                        <span class="warehouse-panel-corner warehouse-panel-corner--br"></span>
                    </div>
                    <div class="warehouse-statistics general-t" aria-live="polite"></div>
                    <div class="warehouse-message-band">
                        <div class="warehouse-hover-port general-t" aria-live="polite"></div>
                        <div class="warehouse-message-band__divider" aria-hidden="true"></div>
                        <div class="warehouse-message-port general-t">${messageText}</div>
                    </div>
                    <div class="action-warehouse">
                        <div class="warehouse-tray-layout">
                            <div class="warehouse-tray-section warehouse-tray-section--frames"></div>
                            <div class="warehouse-tray-divider" aria-hidden="true"></div>
                            <div class="warehouse-scroll">
                                <div class="warehouse-tray-section warehouse-tray-section--blocks"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="warehouse-map" id="warehouse-map-mount" aria-hidden="true">
                    <div class="warehouse-panel-corners warehouse-panel-corners--map" aria-hidden="true">
                        <span class="warehouse-panel-corner warehouse-panel-corner--tl"></span>
                        <span class="warehouse-panel-corner warehouse-panel-corner--bl"></span>
                    </div>
                </div>
            </div>
        `;
        this.dockElement = this.shellElement.querySelector('.action-warehouse');
        this.depthBlockBarElement = this.shellElement.querySelector('.depth-block-bar');
        this.statisticsElement = this.shellElement.querySelector('.warehouse-statistics');
        this.hoverPortElement = this.shellElement.querySelector('.warehouse-hover-port');
        this.messagePortElement = this.shellElement.querySelector('.warehouse-message-port');
        this.mapMountElement = this.shellElement.querySelector('#warehouse-map-mount');
        if (this.depthBlockBarElement) {
            this.depthBlockBarElement.dataset.siteLayer = 'blockBar';
        }
        this.trayScrollElement = this.shellElement.querySelector('.warehouse-scroll');
        this.trayFramesElement = this.shellElement.querySelector('.warehouse-tray-section--frames');
        this.trayBlocksElement = this.shellElement.querySelector('.warehouse-tray-section--blocks');
        this.trayScrollElement.addEventListener('wheel', (e) => this.onTrayWheel(e), { passive: false, capture: true });
        this.resetElement = this.shellElement.querySelector('.warehouse-reset');
        this.resetElement.addEventListener('click', () => this.resetAll());
        document.body.appendChild(this.shellElement);
        if (typeof isWarehouseDockBlocksOnly === 'function' && isWarehouseDockBlocksOnly()) {
            document.body.classList.add('is-warehouse-dock-blocks-only');
        }
        this.initWarehousePopup();
        this.syncClearControlVisibility();

        this.resizeObserver = new ResizeObserver(() => this.updateScrollReserve());
        this.resizeObserver.observe(this.shellElement);
        window.addEventListener('resize', () => this.updateScrollReserve());
        this.updateScrollReserve();
    },

    isPopupMode() {
        return CONFIG.warehouse?.popup?.enabled === true;
    },

    isLauncherStripMode() {
        return typeof isWarehouseLauncherStripMode === 'function' && isWarehouseLauncherStripMode();
    },

    isLauncherExpandDragMode() {
        return typeof isWarehouseLauncherExpandDragMode === 'function' &&
            isWarehouseLauncherExpandDragMode();
    },

    isLauncherExpandDismissBlocked() {
        return performance.now() < (this.launcherExpandReleaseLockUntil || 0);
    },

    lockLauncherExpandDismiss(ms = 450) {
        this.launcherExpandReleaseLockUntil = performance.now() + ms;
    },

    suppressLauncherExpandClickBurst() {
        if (this._launcherExpandClickSuppressBound) {
            document.removeEventListener('click', this._launcherExpandClickSuppressBound, true);
        }
        this._launcherExpandClickSuppressBound = (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.removeEventListener('click', this._launcherExpandClickSuppressBound, true);
            this._launcherExpandClickSuppressBound = null;
        };
        document.addEventListener('click', this._launcherExpandClickSuppressBound, true);
        window.setTimeout(() => {
            if (!this._launcherExpandClickSuppressBound) return;
            document.removeEventListener('click', this._launcherExpandClickSuppressBound, true);
            this._launcherExpandClickSuppressBound = null;
        }, 400);
    },

    getLauncherExpandTeaserCfg() {
        return CONFIG.warehouse?.popup?.launcherStrip?.firstPressTeaser ?? {};
    },

    hasSeenLauncherExpandTeaser() {
        const cfg = this.getLauncherExpandTeaserCfg();
        if (cfg.enabled === false) return true;
        const key = cfg.storageKey || 'warehouseLauncherExpandHintSeen';
        try {
            if (cfg.persist === 'session') {
                return sessionStorage.getItem(key) === '1';
            }
            return localStorage.getItem(key) === '1';
        } catch (_) {
            return false;
        }
    },

    markLauncherExpandTeaserSeen() {
        const cfg = this.getLauncherExpandTeaserCfg();
        const key = cfg.storageKey || 'warehouseLauncherExpandHintSeen';
        try {
            if (cfg.persist === 'session') {
                sessionStorage.setItem(key, '1');
            } else {
                localStorage.setItem(key, '1');
            }
        } catch (_) { /* private mode */ }
    },

    shouldPlayLauncherExpandTeaser() {
        const cfg = this.getLauncherExpandTeaserCfg();
        if (cfg.enabled === false) return false;
        if (!this.isLauncherExpandDragMode()) return false;
        if (this.hasSeenLauncherExpandTeaser()) return false;
        if (this.launcherExpandTeaserActive) return false;
        if (this.launcherStripPinned) return false;
        if (this.launcherExpandDragState) return false;
        if ((this.launcherExpandProgress ?? 0) > 0.05) return false;
        return true;
    },

    isLauncherExpandCollapsedTap(drag) {
        if (!drag || drag.startProgress !== 0 || this.launcherStripPinned) return false;
        const progress = this.launcherExpandProgress ?? 0;
        if (progress > 0.05) return false;
        const maxTravel = drag.maxRailTravel ?? 0;
        if (maxTravel > 0.05) return false;
        const pointerDist = Math.hypot(
            (drag.lastX ?? drag.startX) - drag.startX,
            (drag.lastY ?? drag.startY) - drag.startY
        );
        if (drag.didMove && pointerDist > 10) return false;
        return true;
    },

    tryPlayLauncherExpandTeaserFromTap() {
        if (!this.shouldPlayLauncherExpandTeaser()) return false;
        this.playLauncherExpandTeaser();
        return true;
    },

    cancelLauncherExpandTeaser() {
        if (this._launcherExpandTeaserRaf !== null) {
            cancelAnimationFrame(this._launcherExpandTeaserRaf);
            this._launcherExpandTeaserRaf = null;
        }
        this.launcherExpandTeaserActive = false;
        this.launcherWrapElement?.classList.remove('is-expand-teaser');
        document.body.classList.remove('is-launcher-expand-teaser');
    },

    easeLauncherExpandTeaser(t, mode) {
        const x = Math.max(0, Math.min(1, t));
        switch (mode) {
            case 'inQuad':
                return x * x;
            case 'outQuad':
                return 1 - (1 - x) * (1 - x);
            case 'inCubic':
                return x * x * x;
            case 'outCubic':
                return 1 - Math.pow(1 - x, 3);
            default:
                return x;
        }
    },

    buildLauncherExpandTeaserSegments(peak, bounces = 2) {
        const bounceHeights = [0.38, 0.14];
        const segments = [];
        let t = 0;

        const push = (dt, p0, p1, ease) => {
            const t0 = t;
            t += dt;
            segments.push({ t0, t1: t, p0, p1, ease });
        };

        push(0.30, 0, peak, 'outCubic');
        push(0.17, peak, 0, 'inQuad');

        for (let i = 0; i < bounces; i += 1) {
            const h = peak * (bounceHeights[i] ?? bounceHeights[bounceHeights.length - 1]);
            push(0.09, 0, h, 'outQuad');
            push(0.12, h, 0, 'inQuad');
        }

        push(0.08, 0, 0, 'linear');
        const endT = t || 1;
        segments.forEach((seg) => {
            seg.t0 /= endT;
            seg.t1 /= endT;
        });
        return segments;
    },

    sampleLauncherExpandTeaserProgress(u, segments) {
        const t = Math.max(0, Math.min(1, u));
        const seg = segments.find((s) => t >= s.t0 && t <= s.t1) || segments[segments.length - 1];
        const span = Math.max(1e-6, seg.t1 - seg.t0);
        const local = (t - seg.t0) / span;
        const eased = this.easeLauncherExpandTeaser(local, seg.ease);
        return seg.p0 + (seg.p1 - seg.p0) * eased;
    },

    getLauncherExpandTeaserPeakProgress(bounds = null) {
        const cfg = this.getLauncherExpandTeaserCfg();
        if (typeof cfg.peakProgress === 'number') {
            return Math.max(0.04, Math.min(0.42, cfg.peakProgress));
        }
        const b = bounds || this.getLauncherExpandBounds();
        const rail = this.getLauncherExpandRail(b);
        const travelPx = cfg.peakTravelPx ?? 72;
        return Math.max(0.04, Math.min(0.42, travelPx / rail.length));
    },

    playLauncherExpandTeaser() {
        if (!this.shouldPlayLauncherExpandTeaser()) return;
        this.cancelLauncherExpandTeaser();

        const cfg = this.getLauncherExpandTeaserCfg();
        const bounds = this.getLauncherExpandBounds();
        const peak = this.getLauncherExpandTeaserPeakProgress(bounds);
        const segments = this.buildLauncherExpandTeaserSegments(peak, cfg.bounces ?? 2);
        const durationMs = Math.max(500, cfg.durationMs ?? 950);
        const wrap = this.launcherWrapElement;

        this.launcherExpandTeaserActive = true;
        wrap?.classList.add('is-expand-teaser');
        document.body.classList.add('is-launcher-expand-teaser');
        this.lockLauncherExpandDismiss(durationMs + 120);
        this.suppressLauncherExpandClickBurst();

        let startTime = null;
        const step = (now) => {
            if (!this.launcherExpandTeaserActive) return;
            if (startTime === null) startTime = now;
            const u = Math.max(0, Math.min(1, (now - startTime) / durationMs));
            const progress = this.sampleLauncherExpandTeaserProgress(u, segments);
            this.applyLauncherExpandSize(progress, true);

            const rail = this.getLauncherExpandRail(bounds);
            const pt = this._launcherPointerXY || {
                x: window.innerWidth * 0.5,
                y: window.innerHeight * 0.5
            };
            if (progress > 0.02) {
                const wrapRect = wrap?.getBoundingClientRect();
                if (wrapRect) {
                    const cx = wrapRect.right - bounds.collapsedW / 2;
                    const cy = wrapRect.bottom - bounds.collapsedH / 2;
                    this.updateLauncherGlyphRotation(
                        cx - rail.ux * progress * rail.length,
                        cy - rail.uy * progress * rail.length
                    );
                }
            } else {
                this.updateLauncherGlyphRotation(pt.x, pt.y);
            }

            if (u < 1) {
                this._launcherExpandTeaserRaf = requestAnimationFrame(step);
                return;
            }

            this.applyLauncherExpandSize(0, false);
            this.cancelLauncherExpandTeaser();
            this.updateLauncherGlyphRotation(pt.x, pt.y);
        };

        this._launcherExpandTeaserRaf = requestAnimationFrame(step);
    },

    getLauncherExpandBounds() {
        const root = getComputedStyle(document.documentElement);
        const collapsedW = parseFloat(root.getPropertyValue('--warehouse-launcher-width')) || 80;
        const collapsedH = parseFloat(root.getPropertyValue('--warehouse-launcher-height')) || 40;
        const expandedW = typeof measureSiteGridTokenPx === 'function'
            ? measureSiteGridTokenPx('--warehouse-launcher-expand-width', 'width')
            : 0;
        const expandedH = typeof measureSiteGridTokenPx === 'function'
            ? measureSiteGridTokenPx('--warehouse-launcher-expand-height', 'height')
            : 0;
        return {
            collapsedW,
            collapsedH,
            expandedW: Math.max(collapsedW, expandedW || collapsedW),
            expandedH: Math.max(collapsedH, expandedH || collapsedH)
        };
    },

    /** Diagonal rail — tilt matches expand panel growth (width vs height delta). */
    getLauncherExpandRail(bounds = null) {
        const b = bounds || this.getLauncherExpandBounds();
        const deltaW = Math.max(0, b.expandedW - b.collapsedW);
        const deltaH = Math.max(0, b.expandedH - b.collapsedH);
        const length = Math.hypot(deltaW, deltaH) || 1;
        return {
            deltaW,
            deltaH,
            length,
            ux: deltaW / length,
            uy: deltaH / length
        };
    },

    getLauncherExpandRailArrowDeg() {
        const popupCfg = CONFIG.warehouse?.popup;
        const baseDeg = popupCfg?.launcherArrowBaseDeg ?? -90;
        const rail = this.getLauncherExpandRail();
        const aimDeg = Math.atan2(-rail.deltaH, -rail.deltaW) * (180 / Math.PI);
        return aimDeg - baseDeg;
    },

    getLauncherExpandRetractArrowDeg() {
        const popupCfg = CONFIG.warehouse?.popup;
        const baseDeg = popupCfg?.launcherArrowBaseDeg ?? -90;
        const wrap = this.launcherWrapElement;
        const launcher = this.launcherElement;
        if (!wrap || !launcher) return 0;
        const wrapRect = wrap.getBoundingClientRect();
        const launcherRect = launcher.getBoundingClientRect();
        const cx = launcherRect.left + launcherRect.width / 2;
        const cy = launcherRect.top + launcherRect.height / 2;
        const aimDeg = Math.atan2(wrapRect.bottom - cy, wrapRect.right - cx) * (180 / Math.PI);
        return aimDeg - baseDeg;
    },

    applyLauncherExpandHandlePosition(clamped, isDragging) {
        const launcher = this.launcherElement;
        if (!launcher || !this.isLauncherExpandDragMode()) return;

        const bounds = this.getLauncherExpandBounds();
        const lw = bounds.collapsedW;
        const lh = bounds.collapsedH;
        const pinned = this.launcherStripPinned && clamped >= 1 && !isDragging;

        launcher.style.left = '';
        launcher.style.top = '';
        launcher.style.right = '';
        launcher.style.bottom = '';
        launcher.style.transform = '';

        if (pinned) {
            launcher.style.left = '0';
            launcher.style.top = '0';
            return;
        }

        if (clamped <= 0 && !isDragging) {
            launcher.style.right = '0';
            launcher.style.bottom = '0';
            return;
        }

        const tx = -clamped * (bounds.expandedW - lw);
        const ty = -clamped * (bounds.expandedH - lh);
        launcher.style.right = '0';
        launcher.style.bottom = '0';
        launcher.style.transform = `translate(${tx}px, ${ty}px)`;
    },

    applyLauncherExpandSize(progress, isDragging) {
        const clamped = Math.max(0, Math.min(1, progress));
        this.launcherExpandProgress = clamped;
        const bounds = this.getLauncherExpandBounds();
        const w = bounds.collapsedW + clamped * (bounds.expandedW - bounds.collapsedW);
        const h = bounds.collapsedH + clamped * (bounds.expandedH - bounds.collapsedH);
        const wrap = this.launcherWrapElement;
        if (!wrap) return;

        wrap.style.width = `${w}px`;
        wrap.style.height = `${h}px`;
        const ease = '0.34s cubic-bezier(0.25, 1, 0.5, 1)';
        wrap.style.transition = isDragging
            ? 'none'
            : `width ${ease}, height ${ease}`;

        const launcher = this.launcherElement;
        if (launcher && this.isLauncherExpandDragMode()) {
            launcher.style.transition = isDragging ? 'none' : `transform ${ease}, left ${ease}, top ${ease}, right ${ease}, bottom ${ease}`;
            this.applyLauncherExpandHandlePosition(clamped, isDragging);
        }

        const showContent = clamped > 0.06;
        wrap.classList.toggle('is-showing-content', showContent);
        wrap.classList.toggle('is-partially-expanded', clamped > 0 && clamped < 1);
        wrap.setAttribute('aria-hidden', showContent ? 'false' : 'true');
        this.launcherMapMountElement?.setAttribute('aria-hidden', showContent ? 'false' : 'true');

        if (!isDragging && typeof NavigationMap !== 'undefined' && NavigationMap.mapsPanel && showContent) {
            requestAnimationFrame(() => {
                NavigationMap._contentDirty = true;
                NavigationMap.resizeCanvas?.();
                if (NavigationMap.isMapReady?.()) NavigationMap.scheduleRender?.();
            });
        }
        this.updateScrollReserve();
    },

    isBlockTrayContainer(el) {
        return el === this.trayBlocksElement || el === this.launcherStripTrayElement;
    },

    getBlockTrayParent(def) {
        const stripCfg = CONFIG.warehouse?.popup?.launcherStrip;
        if (this.isLauncherStripMode() && stripCfg?.tagOnly !== false) {
            const type = def.type || 'tag';
            if (type === 'tag' && this.launcherStripTrayElement) {
                return this.launcherStripTrayElement;
            }
        }
        return this.trayBlocksElement;
    },

    isPopupOpen() {
        return !this.isPopupMode() || this.popupOpen;
    },

    initWarehousePopup() {
        const popupCfg = CONFIG.warehouse?.popup;
        if (!popupCfg?.enabled) return;

        document.body.classList.add('is-warehouse-popup-mode');
        const stripMode = this.isLauncherStripMode();
        const expandDrag = this.isLauncherExpandDragMode();
        if (stripMode) {
            document.body.classList.add('is-warehouse-launcher-strip-mode');
            if (expandDrag) {
                document.body.classList.add('is-warehouse-launcher-expand-drag-mode');
            }
            if (typeof applyWarehouseLauncherTokens === 'function') {
                applyWarehouseLauncherTokens();
            }
            if (typeof applyWarehouseLauncherStripTokens === 'function') {
                applyWarehouseLauncherStripTokens();
            }
        }

        this.backdropElement = document.createElement('div');
        this.backdropElement.className = 'warehouse-popup-backdrop';
        this.backdropElement.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.backdropElement);

        this.launcherElement = document.createElement('button');
        this.launcherElement.type = 'button';
        this.launcherElement.className = 'warehouse-launcher';
        this.launcherElement.setAttribute('aria-expanded', 'false');
        this.launcherElement.setAttribute(
            'aria-controls',
            stripMode ? 'warehouse-launcher-strip' : 'warehouse-popup-panel'
        );
        this.launcherElement.setAttribute('aria-label', popupCfg.launcherLabel || 'כלים');
        const arrowSrc = popupCfg.launcherArrowSrc || 'assets/ui/arrow.svg';
        if (expandDrag) {
            this.launcherElement.innerHTML =
                '<span class="warehouse-launcher__pill" aria-hidden="true"></span>' +
                '<span class="warehouse-launcher__glyph" aria-hidden="true"></span>';
            this.launcherPillElement = this.launcherElement.querySelector('.warehouse-launcher__pill');
        } else {
            this.launcherElement.innerHTML =
                '<span class="warehouse-launcher__glyph" aria-hidden="true"></span>';
            this.launcherPillElement = null;
        }
        const glyph = this.launcherElement.querySelector('.warehouse-launcher__glyph');
        if (glyph) glyph.style.webkitMaskImage = glyph.style.maskImage = `url("${arrowSrc}")`;
        this.launcherGlyphElement = glyph;

        if (stripMode) {
            this.launcherWrapElement = document.createElement('div');
            this.launcherWrapElement.className = 'warehouse-launcher-wrap';
            this.launcherWrapElement.id = 'warehouse-launcher-strip';
            this.launcherWrapElement.setAttribute('aria-hidden', 'true');

            this.launcherStripTrayElement = document.createElement('div');
            this.launcherStripTrayElement.className =
                'warehouse-launcher-strip__tray warehouse-tray-section--blocks';

            this.launcherMapMountElement = document.createElement('div');
            this.launcherMapMountElement.id = 'warehouse-launcher-map-mount';
            this.launcherMapMountElement.className = 'warehouse-launcher-map-mount';
            this.launcherMapMountElement.setAttribute('aria-hidden', 'true');

            this.launcherWrapElement.appendChild(this.launcherMapMountElement);
            this.launcherWrapElement.appendChild(this.launcherStripTrayElement);
            this.launcherWrapElement.appendChild(this.launcherElement);
            document.body.appendChild(this.launcherWrapElement);
            this.launcherStripElement = this.launcherWrapElement;
        } else {
            document.body.appendChild(this.launcherElement);
        }

        this.initLauncherGlyphTracking();
        if (expandDrag) {
            this.initLauncherExpandDrag();
        }

        if (this.resetElement) {
            document.body.appendChild(this.resetElement);
        }

        this.shellElement.id = 'warehouse-popup-panel';
        this.shellElement.setAttribute('role', 'dialog');
        this.shellElement.setAttribute('aria-modal', 'true');
        this.shellElement.setAttribute('aria-label', popupCfg.launcherLabel || 'כלים');

        this.launcherElement.addEventListener('click', (e) => {
            e.stopPropagation();
            if (expandDrag) {
                if (this.isLauncherExpandDismissBlocked()) return;
                if (this.launcherExpandDragState) return;
                if (this.launcherStripPinned) {
                    this.unpinLauncherStrip(true);
                }
                return;
            }
            if (stripMode) this.toggleLauncherStripPin();
            else this.togglePopup();
        });

        this.launcherElement.addEventListener('pointerdown', (e) => {
            if (expandDrag) return;
            e.stopPropagation();
        }, true);

        this.launcherElement.addEventListener('pointerup', (e) => {
            if (expandDrag) return;
            e.stopPropagation();
        }, true);

        if (popupCfg.closeOnOutsideClick) {
            this.backdropElement.addEventListener('click', () => {
                if (expandDrag && this.isLauncherExpandDismissBlocked()) return;
                if (stripMode) this.unpinLauncherStrip();
                else this.closePopup();
            });
            this._popupOutsidePointerBound = (e) => {
                const target = e.target;
                if (!(target instanceof Element)) return;
                if (stripMode) {
                    if (expandDrag && this.isLauncherExpandDismissBlocked()) return;
                    const partialExpand = expandDrag && (this.launcherExpandProgress ?? 0) > 0;
                    if (!this.launcherStripPinned && !partialExpand) return;
                    if (this.launcherExpandDragState) return;
                    if (target.closest('.warehouse-launcher-wrap, .action-block.is-dragging')) return;
                    this.unpinLauncherStrip();
                    return;
                }
                if (!this.popupOpen || this.dragState) return;
                if (target.closest('.warehouse-shell, .warehouse-launcher, .action-block.is-dragging')) return;
                this.closePopup();
            };
            document.addEventListener('pointerdown', this._popupOutsidePointerBound, true);
        }

        if (popupCfg.closeOnEscape) {
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                if (stripMode) {
                    const partialExpand = expandDrag && (this.launcherExpandProgress ?? 0) > 0;
                    if (!this.launcherStripPinned && !partialExpand) return;
                    if (this.dragState && popupCfg.stayOpenWhileDragging) return;
                    if (this.launcherExpandDragState) return;
                    this.unpinLauncherStrip();
                    return;
                }
                if (!this.popupOpen) return;
                if (this.dragState && popupCfg.stayOpenWhileDragging) return;
                this.closePopup();
            });
        }

        if (stripMode) {
            this.syncLauncherStripPin(false);
            if (expandDrag) {
                this.applyLauncherExpandSize(0, false);
            }
        } else {
            this.syncPopupState(popupCfg.defaultOpen === true);
        }
    },

    initLauncherGlyphTracking() {
        if (!this.launcherGlyphElement) return;

        this._launcherPointerBound = (e) => {
            this._launcherPointerXY = { x: e.clientX, y: e.clientY };
            if (this._launcherPointerRaf !== null) return;
            this._launcherPointerRaf = requestAnimationFrame(() => {
                this._launcherPointerRaf = null;
                const pt = this._launcherPointerXY;
                if (!pt) return;
                this.updateLauncherGlyphRotation(pt.x, pt.y);
            });
        };

        document.addEventListener('pointermove', this._launcherPointerBound, { passive: true });

        if (this.isLauncherStripMode() && this.launcherWrapElement) {
            const syncGlyph = () => {
                const pt = this._launcherPointerXY || {
                    x: window.innerWidth * 0.5,
                    y: window.innerHeight * 0.5
                };
                this.updateLauncherGlyphRotation(pt.x, pt.y);
            };
            this.launcherWrapElement.addEventListener('mouseenter', syncGlyph);
            this.launcherWrapElement.addEventListener('mouseleave', syncGlyph);

            if (!this.isLauncherExpandDragMode()) {
                const syncPeek = () => {
                    requestAnimationFrame(() => {
                        this.syncLauncherStripPeek();
                        requestAnimationFrame(() => this.syncLauncherStripPeek());
                    });
                };
                this.launcherWrapElement.addEventListener('mouseenter', syncPeek);
                this.launcherWrapElement.addEventListener('mouseleave', () => {
                    this.syncLauncherStripPeek();
                });
                this.launcherWrapElement.addEventListener('transitionend', (e) => {
                    if (e.propertyName === 'width' || e.propertyName === 'height') {
                        this.syncLauncherStripPeek();
                    }
                });
                this._launcherStripPeekResizeBound = () => this.syncLauncherStripPeek();
                window.addEventListener('resize', this._launcherStripPeekResizeBound, { passive: true });
                this._launcherStripPeekObserver = new ResizeObserver(() => {
                    if (!this.launcherStripPinned && this.launcherWrapElement?.matches(':hover')) {
                        this.syncLauncherStripPeek();
                    }
                });
                this._launcherStripPeekObserver.observe(this.launcherWrapElement);
            }
        }

        this.updateLauncherGlyphRotation(window.innerWidth * 0.5, window.innerHeight * 0.5);
    },

    updateLauncherGlyphRotation(clientX, clientY) {
        const glyph = this.launcherGlyphElement;
        const anchor = this.launcherElement;
        if (!glyph || !anchor) return;

        const popupCfg = CONFIG.warehouse?.popup;
        const baseDeg = popupCfg?.launcherArrowBaseDeg ?? -90;

        if (this.isLauncherStripMode() && this.launcherWrapElement) {
            const hovered = this.launcherWrapElement.matches(':hover');
            const open = this.launcherStripPinned ||
                this.launcherExpandDragState ||
                (this.launcherExpandProgress ?? 0) > 0;
            if (this.isLauncherExpandDragMode()) {
                const retracting = this.launcherStripPinned ||
                    (this.launcherExpandDragState?.startProgress ?? 0) >= 1 ||
                    (this.launcherExpandProgress ?? 0) >= 0.92;
                if (retracting && (hovered || open)) {
                    glyph.style.transform = `rotate(${this.getLauncherExpandRetractArrowDeg()}deg)`;
                    return;
                }
                if (hovered || open) {
                    glyph.style.transform = `rotate(${this.getLauncherExpandRailArrowDeg()}deg)`;
                    return;
                }
            } else if (this.launcherStripPinned || hovered) {
                glyph.style.transform = `rotate(${popupCfg?.launcherArrowHoverDeg ?? -90}deg)`;
                return;
            }
        }

        const rect = anchor.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const aimDeg = Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
        glyph.style.transform = `rotate(${aimDeg - baseDeg}deg)`;
    },

    syncLauncherStripPin(pinned) {
        if (pinned) {
            this.cancelLauncherExpandTeaser();
            this.markLauncherExpandTeaserSeen();
        }
        this.launcherStripPinned = !!pinned;
        document.body.classList.toggle('is-launcher-strip-pinned', this.launcherStripPinned);
        this.launcherWrapElement?.classList.toggle('is-pinned', this.launcherStripPinned);
        this.launcherElement?.classList.toggle('is-active', this.launcherStripPinned);
        this.launcherElement?.setAttribute('aria-expanded', this.launcherStripPinned ? 'true' : 'false');
        this.launcherWrapElement?.setAttribute(
            'aria-hidden',
            this.launcherStripPinned ? 'false' : 'true'
        );
        this.launcherMapMountElement?.setAttribute(
            'aria-hidden',
            this.launcherStripPinned ? 'false' : 'true'
        );
        this.backdropElement?.setAttribute('aria-hidden', this.launcherStripPinned ? 'false' : 'true');
        const pt = this._launcherPointerXY || {
            x: window.innerWidth * 0.5,
            y: window.innerHeight * 0.5
        };
        this.updateLauncherGlyphRotation(pt.x, pt.y);
        if (typeof NavigationMap !== 'undefined' && NavigationMap.mapsPanel) {
            requestAnimationFrame(() => {
                NavigationMap._contentDirty = true;
                NavigationMap.resizeCanvas?.();
                if (NavigationMap.isMapReady?.()) NavigationMap.scheduleRender?.();
            });
        }
        this.updateScrollReserve();
        if (!this.isLauncherExpandDragMode()) {
            this.syncLauncherStripPeek();
        } else {
            this.applyLauncherExpandSize(pinned ? 1 : 0, false);
        }
    },

    initLauncherExpandDrag() {
        const launcher = this.launcherElement;
        const wrap = this.launcherWrapElement;
        if (!launcher || !wrap) return;

        const clearExpandDragChrome = () => {
            this.launcherExpandDragState = null;
            launcher.classList.remove('is-grabbed');
            wrap.classList.remove('is-expanding');
            document.body.classList.remove('is-launcher-expanding');
            if (this._launcherExpandDocPointerBound) {
                document.removeEventListener('pointermove', this._launcherExpandDocPointerBound);
                document.removeEventListener('pointerup', this._launcherExpandDocPointerBound);
                document.removeEventListener('pointercancel', this._launcherExpandDocPointerBound);
                this._launcherExpandDocPointerBound = null;
            }
        };

        const finish = (e) => {
            const drag = this.launcherExpandDragState;
            if (!drag || e.pointerId !== drag.pointerId) return;
            e.preventDefault();
            this.launcherExpandDragState = null;

            try {
                launcher.releasePointerCapture(e.pointerId);
            } catch (_) { /* already released */ }

            clearExpandDragChrome();

            if (!drag.didMove && drag.startProgress >= 1) {
                const pt = this._launcherPointerXY || { x: e.clientX, y: e.clientY };
                this.updateLauncherGlyphRotation(pt.x, pt.y);
                return;
            }

            if (this.isLauncherExpandCollapsedTap(drag)) {
                this.lockLauncherExpandDismiss();
                this.suppressLauncherExpandClickBurst();
                this.syncLauncherStripPin(true);
                const pt = this._launcherPointerXY || { x: e.clientX, y: e.clientY };
                this.updateLauncherGlyphRotation(pt.x, pt.y);
                return;
            }

            const threshold = CONFIG.warehouse?.popup?.launcherStrip?.snapThreshold ?? 0.82;
            const progress = this.launcherExpandProgress ?? 0;

            this.lockLauncherExpandDismiss();
            this.suppressLauncherExpandClickBurst();

            if (progress >= threshold) {
                this.syncLauncherStripPin(true);
            } else {
                this.syncLauncherStripPin(false);
            }

            const pt = this._launcherPointerXY || { x: e.clientX, y: e.clientY };
            this.updateLauncherGlyphRotation(pt.x, pt.y);
        };

        const onPointerDown = (e) => {
            if (e.button !== 0) return;
            if (this.launcherExpandTeaserActive) return;
            e.stopPropagation();
            if (this.dragState) return;

            const bounds = this.getLauncherExpandBounds();
            const startProgress = this.launcherStripPinned ? 1 : (this.launcherExpandProgress ?? 0);

            this.launcherExpandDragState = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                startProgress,
                bounds,
                didMove: false,
                maxRailTravel: 0
            };

            launcher.setPointerCapture(e.pointerId);
            launcher.classList.add('is-grabbed');
            wrap.classList.add('is-expanding');
            document.body.classList.add('is-launcher-expanding');

            this._launcherExpandDocPointerBound = (ev) => {
                const active = this.launcherExpandDragState;
                if (!active || ev.pointerId !== active.pointerId) return;
                if (ev.type === 'pointermove') {
                    this.updateLauncherExpandFromDrag(ev.clientX, ev.clientY);
                    return;
                }
                finish(ev);
            };
            document.addEventListener('pointermove', this._launcherExpandDocPointerBound);
            document.addEventListener('pointerup', this._launcherExpandDocPointerBound);
            document.addEventListener('pointercancel', this._launcherExpandDocPointerBound);

            this.updateLauncherGlyphRotation(e.clientX, e.clientY);
        };

        const onLostCapture = (e) => {
            if (!this.launcherExpandDragState || e.pointerId !== this.launcherExpandDragState.pointerId) return;
            finish(e);
        };

        launcher.addEventListener('pointerdown', onPointerDown);
        launcher.addEventListener('pointerup', finish);
        launcher.addEventListener('pointercancel', finish);
        launcher.addEventListener('lostpointercapture', onLostCapture);
    },

    updateLauncherExpandFromDrag(clientX, clientY) {
        const drag = this.launcherExpandDragState;
        if (!drag) return;

        const { startX, startY, startProgress, bounds } = drag;
        drag.lastX = clientX;
        drag.lastY = clientY;
        if (Math.hypot(clientX - startX, clientY - startY) > 6) {
            drag.didMove = true;
        }
        const rail = this.getLauncherExpandRail(bounds);
        const travel = (startX - clientX) * rail.ux + (startY - clientY) * rail.uy;
        const progress = Math.max(0, Math.min(1, startProgress + travel / rail.length));
        drag.maxRailTravel = Math.max(drag.maxRailTravel || 0, Math.abs(progress - startProgress));

        this.applyLauncherExpandSize(progress, true);
        this.updateLauncherGlyphRotation(clientX, clientY);
    },

    syncLauncherStripPeek() {
        if (this.isLauncherExpandDragMode()) return;
        const tray = this.launcherStripTrayElement;
        const wrap = this.launcherWrapElement;
        if (!tray || !wrap || !this.isLauncherStripMode()) return;

        const preview = !this.launcherStripPinned && wrap.matches(':hover');
        wrap.classList.toggle('is-strip-preview', preview);

        const slots = [...tray.querySelectorAll('.block-slot:not(.is-empty)')];
        slots.forEach((slot) => slot.classList.remove('is-peek-clipped'));

        if (!preview) return;

        const getPeekBounds = () => {
            const wrapRect = wrap.getBoundingClientRect();
            const root = getComputedStyle(document.documentElement);
            const space10 = parseFloat(root.getPropertyValue('--space-10')) || 0;
            const launcherW = parseFloat(root.getPropertyValue('--warehouse-launcher-width')) || 0;
            return {
                left: wrapRect.left + space10,
                right: wrapRect.right - launcherW - space10
            };
        };

        const clipPartialSlots = () => {
            const { left: peekLeft, right: peekRight } = getPeekBounds();
            let clipped = false;
            const ordered = [...slots].sort(
                (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
            );

            for (const slot of ordered) {
                if (slot.classList.contains('is-peek-clipped')) continue;
                const rect = slot.getBoundingClientRect();
                if (rect.width <= 0) continue;
                const fullyVisible =
                    rect.left >= peekLeft - 0.5 &&
                    rect.right <= peekRight + 0.5;
                if (!fullyVisible) {
                    slot.classList.add('is-peek-clipped');
                    clipped = true;
                }
            }
            return clipped;
        };

        let passes = 0;
        while (clipPartialSlots() && passes < 4) passes += 1;
    },

    pinLauncherStrip() {
        if (!this.isLauncherStripMode() || this.launcherStripPinned) return;
        this.syncLauncherStripPin(true);
    },

    unpinLauncherStrip(force = false) {
        if (!force && this.isLauncherExpandDismissBlocked()) return;
        if (!this.isLauncherStripMode() || (!this.launcherStripPinned && !(this.launcherExpandProgress ?? 0))) return;
        const popupCfg = CONFIG.warehouse?.popup;
        if (!force && this.dragState && popupCfg?.stayOpenWhileDragging) return;
        this.syncLauncherStripPin(false);
    },

    toggleLauncherStripPin() {
        if (this.launcherStripPinned) this.unpinLauncherStrip(true);
        else this.pinLauncherStrip();
    },

    syncPopupState(open) {
        if (this.isLauncherStripMode()) return;
        this.popupOpen = !!open;
        document.body.classList.toggle('is-warehouse-popup-open', this.popupOpen);
        this.shellElement?.classList.toggle('is-popup-open', this.popupOpen);
        this.shellElement?.classList.toggle('is-popup-collapsed', this.isPopupMode() && !this.popupOpen);
        this.launcherElement?.classList.toggle('is-active', this.popupOpen);
        this.launcherElement?.setAttribute('aria-expanded', this.popupOpen ? 'true' : 'false');
        this.backdropElement?.setAttribute('aria-hidden', this.popupOpen ? 'false' : 'true');
        this.updateScrollReserve();
    },

    openPopup() {
        if (!this.isPopupMode()) return;
        if (this.isLauncherStripMode()) {
            this.pinLauncherStrip();
            return;
        }
        if (this.popupOpen) return;
        this.syncPopupState(true);
    },

    closePopup(force = false) {
        if (!this.isPopupMode()) return;
        if (this.isLauncherStripMode()) {
            this.unpinLauncherStrip(force);
            return;
        }
        if (!this.popupOpen) return;
        const popupCfg = CONFIG.warehouse?.popup;
        if (!force && this.dragState && popupCfg?.stayOpenWhileDragging) return;
        this.syncPopupState(false);
    },

    togglePopup() {
        if (this.popupOpen) this.closePopup(true);
        else this.openPopup();
    },

    getCollapsedChromeReserve() {
        const gap = scale(10);
        let chromeTop = window.innerHeight;

        const launcherAnchor = this.launcherWrapElement || this.launcherElement;
        if (launcherAnchor) {
            chromeTop = Math.min(chromeTop, launcherAnchor.getBoundingClientRect().top);
        }

        const reset = this.resetElement;
        if (reset && document.body.classList.contains('is-clear-visible')) {
            const resetRect = reset.getBoundingClientRect();
            if (resetRect.height > 0 && resetRect.width > 0) {
                chromeTop = Math.min(chromeTop, resetRect.top);
            }
        }

        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (level >= 2 && this.depthBlockBarElement?.childElementCount > 0) {
            const barRect = this.depthBlockBarElement.getBoundingClientRect();
            if (barRect.height > 0) {
                chromeTop = Math.min(chromeTop, barRect.top);
            }
        }

        if (chromeTop >= window.innerHeight) {
            const inset = parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--space-40')
            ) || 40;
            const size = parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--warehouse-launcher-height')
            ) || parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--warehouse-launcher-size')
            ) || 40;
            return Math.ceil(inset + size + gap);
        }

        return Math.ceil(window.innerHeight - chromeTop + gap);
    },

    cancelHoverTypewriter() {
        this.hoverTypewriterGeneration += 1;
        if (this.hoverTypewriterTimer !== null) {
            clearTimeout(this.hoverTypewriterTimer);
            this.hoverTypewriterTimer = null;
        }
    },

    playHoverTypewriter(text) {
        if (!this.hoverPortElement) return;
        this.cancelHoverTypewriter();
        const generation = this.hoverTypewriterGeneration;
        const msPerChar = CONFIG.warehouse?.dock?.messageTypewriterMsPerChar ?? 35;
        this.hoverPortElement.textContent = '';
        if (!text) return;

        let index = 0;
        const step = () => {
            if (generation !== this.hoverTypewriterGeneration) return;
            index += 1;
            this.hoverPortElement.textContent = text.slice(0, index);
            if (index < text.length) {
                this.hoverTypewriterTimer = setTimeout(step, msPerChar);
            } else {
                this.hoverTypewriterTimer = null;
            }
        };
        step();
    },

    setMoleculeHoverMessage(text, { isLtr = false, noteIndex = -1 } = {}) {
        if (!this.hoverPortElement || !text) return;
        if (this.moleculeHoverMessageActive && this.hoverTypewriterNoteIndex === noteIndex) return;

        this.hoverTypewriterNoteIndex = noteIndex;
        this.hoverPortElement.classList.toggle('is-note-ltr', isLtr);
        this.hoverPortElement.classList.toggle('is-note-rtl', !isLtr);
        this.hoverPortElement.classList.add('is-active');
        this.moleculeHoverMessageActive = true;
        this.playHoverTypewriter(text);
    },

    clearMoleculeHoverMessage() {
        if (!this.hoverPortElement || !this.moleculeHoverMessageActive) return;
        this.cancelHoverTypewriter();
        this.hoverTypewriterNoteIndex = -1;
        this.hoverPortElement.textContent = '';
        this.hoverPortElement.classList.remove('is-active', 'is-note-ltr', 'is-note-rtl');
        this.moleculeHoverMessageActive = false;
    },

    refreshDisplayTokens() {
        const dockCfg = CONFIG.warehouse.dock;
        const frameCfg = CONFIG.warehouse.frame.filter;
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const blockGlyph = scale(CONFIG.warehouse.blockGlyphSize);
        const frameHeight = blockH + frameCfg.paddingY * 2;
        const frameAlignOffset = (frameHeight - blockH) / 2;
        const frameShellWidth = this.computeFrameShellWidth(frameCfg.slotMinWidth);

        document.body.style.setProperty('--block-height', `${blockH}px`);
        document.body.style.setProperty('--block-glyph-size', `${blockGlyph}px`);
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
        document.documentElement.style.setProperty('--warehouse-radius', `${scale(dockCfg.borderRadius)}px`);
        document.documentElement.style.setProperty('--warehouse-outline', `${dockCfg.outlineWidth}pt`);
        document.documentElement.style.setProperty('--warehouse-bottom-offset', `${scale(dockCfg.bottomOffset)}px`);
        document.documentElement.style.setProperty(
            '--warehouse-tray-max-height',
            'var(--warehouse-block-panel-h, calc(100% - var(--warehouse-message-row-h)))'
        );
    },

    // L1: grid-aligned chrome below canvas (warehouse shell top); L2/L3: measured dock footprint
    getScrollReserve() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (level === 1 && typeof getSiteL1BottomChromePx === 'function') {
            return getSiteL1BottomChromePx();
        }
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--warehouse-reserve');
        return parseFloat(raw) || 0;
    },

    updateScrollReserve() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        if (!this.shellElement || level < 1) {
            document.documentElement.style.setProperty('--warehouse-reserve', '0px');
            return;
        }

        if (this.isPopupMode() && !this.popupOpen) {
            const pinnedStrip = this.isLauncherStripMode() &&
                (this.launcherStripPinned || (this.launcherExpandProgress ?? 0) > 0);
            const collapsedReserve = (level === 1 && !pinnedStrip) ? 0 : this.getCollapsedChromeReserve();
            document.documentElement.style.setProperty('--warehouse-reserve', `${collapsedReserve}px`);
            const launcherAnchor = this.launcherWrapElement || this.launcherElement;
            if (launcherAnchor) {
                const launcherH = Math.ceil(launcherAnchor.getBoundingClientRect().height);
                document.documentElement.style.setProperty('--warehouse-launcher-reserve', `${launcherH}px`);
            }
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

    showDepthDropIndicator() {
        this.shellElement?.classList.remove('is-depth-drop-fading');
        this.shellElement?.classList.add('is-depth-drop-active');
    },

    fadeDepthDropIndicator() {
        const shell = this.shellElement;
        if (!shell?.classList.contains('is-depth-drop-active')) {
            shell?.classList.remove('is-depth-drop-fading');
            return;
        }
        shell.classList.remove('is-depth-drop-active');
        shell.classList.add('is-depth-drop-fading');
        clearTimeout(this._depthDropFadeTimer);
        this._depthDropFadeTimer = setTimeout(() => {
            shell.classList.remove('is-depth-drop-fading');
        }, 280);
    },

    clearDepthDropIndicator() {
        clearTimeout(this._depthDropFadeTimer);
        this.shellElement?.classList.remove('is-depth-drop-active', 'is-depth-drop-fading');
    },

    shouldLeaveEmptyDockSlot() {
        return typeof DepthController !== 'undefined' && DepthController.currentLevel === 3;
    },

    markSlotDockReserve(block) {
        const slot = block?.slotElement;
        if (!slot || block.nestedIn) return;

        this.clearSlotReserve(block);

        const { width, height } = this.blockMetrics(block);
        slot.style.width = `${Math.ceil(width)}px`;
        slot.style.height = `${Math.ceil(height)}px`;

        const reserve = block.element.cloneNode(true);
        reserve.classList.remove(
            'is-dragging', 'is-deployed', 'is-selected', 'is-removable',
            'is-returning', 'is-nested', 'is-depth-ui-mounted', 'is-deploying-to-bar',
            'is-macro-indication', 'is-dock-irrelevant'
        );
        reserve.classList.add('is-dock-reserve');
        reserve.removeAttribute('id');
        reserve.setAttribute('aria-hidden', 'true');
        reserve.style.transform = '';
        reserve.querySelector('.block-remove-mark')?.remove();

        slot.appendChild(reserve);
        block._dockReserveEl = reserve;
        this.restoreDockTrayOrder();
    },

    clearSlotReserve(block) {
        block?._dockReserveEl?.remove();
        delete block?._dockReserveEl;
    },

    markSlotEmpty(block) {
        if (!this.shouldLeaveEmptyDockSlot()) {
            this.markSlotDockReserve(block);
            return;
        }

        const slot = block?.slotElement;
        if (!slot || block.nestedIn) return;
        this.clearSlotReserve(block);
        const { width, height } = this.blockMetrics(block);
        slot.style.width = `${Math.ceil(width)}px`;
        slot.style.height = `${Math.ceil(height)}px`;
        let ghost = slot.querySelector('.block-slot__ghost');
        if (!ghost) {
            ghost = document.createElement('div');
            ghost.className = 'block-slot__ghost general-t';
            slot.appendChild(ghost);
        }
        ghost.innerHTML = this.buildSlotGhostInnerHTML(block);
        slot.classList.add('is-empty');
        this.restoreDockTrayOrder();
    },

    clearSlotEmpty(block) {
        const slot = block?.slotElement;
        if (!slot) return;
        this.clearSlotReserve(block);
        slot.classList.remove('is-empty');
        slot.querySelector('.block-slot__ghost')?.remove();
        slot.style.removeProperty('width');
        slot.style.removeProperty('height');
    },

    buildSlotGhostInnerHTML(block) {
        const label = this.getBlockGhostLabel(block);
        const safeLabel = typeof escapeTypologyHtml === 'function'
            ? escapeTypologyHtml(label)
            : String(label || '').replace(/</g, '&lt;');
        return `<span class="block-slot__glyph-ring" aria-hidden="true"></span>` +
            `<span class="block-slot__ghost-label">${safeLabel}</span>`;
    },

    getBlockGhostLabel(block) {
        if (block.type === 'author') return block.author || '';
        if (block.type === 'typology') {
            return typeof getTypologyLabel === 'function'
                ? getTypologyLabel(block.typology)
                : (block.typology || '');
        }
        return block.tag || '';
    },

    syncBlockRemovable(block) {
        if (!block?.element || block.type === 'frame') return;
        const deployed = block.element.classList.contains('is-deployed');
        const selected = block.element.classList.contains('is-selected');
        const depthUi = this.isDepthUiLevel();
        const removable = deployed && !block.nestedIn && (!depthUi || selected);
        block.element.classList.toggle('is-removable', removable);
    },

    syncAllBlockRemovables() {
        this.blocks.forEach(block => this.syncBlockRemovable(block));
    },

    wireBlockRemoveMark(block) {
        const removeMark = document.createElement('span');
        removeMark.className = 'block-remove-mark';
        removeMark.setAttribute('aria-hidden', 'true');
        removeMark.textContent = '×';
        removeMark.addEventListener('pointerdown', (e) => e.stopPropagation());
        removeMark.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.dragState) return;
            if (!block.element.classList.contains('is-removable')) return;
            this.returnToDock(block);
        });
        block.element.insertBefore(removeMark, block.element.firstChild);
    },

    // Wheel over the tray scrolls vertically through all tag blocks
    onTrayWheel(e) {
        const tray = this.trayScrollElement;
        if (!tray || tray.scrollHeight <= tray.clientHeight) return;

        e.preventDefault();
        e.stopPropagation();
        tray.scrollTop += e.deltaY;
    },

    // Returns every active block to its dock slot (or clears word panel in censored theme)
    resetAll() {
        if (this.dragState) return;

        if (this.isWordPanelLevelActive()) {
            this.clearWordPanel();
            if (typeof NoteCensor !== 'undefined' && NoteCensor._clearAllHoverState) {
                NoteCensor._clearAllHoverState();
            }
            this.syncClearControlVisibility();
            return;
        }

        this.clearMacroIndicationGhost();
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
            this.returnToDock(block);
        });
        this.syncClearControlVisibility();
    },

    isPointOverDock(x, y) {
        if (this.isPopupMode() && !this.popupOpen) return false;
        const dock = this.shellElement?.querySelector('.warehouse-dock');
        if (!dock) return false;
        const rect = dock.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    },

    // Called once the data pipeline resolves (tag dictionary is ready)
    populate() {
        if (CONFIG.warehouse.enableFilterFrame) {
            this.createBlock({ type: 'frame', frameKind: 'filter' });
        }

        AppState.tagColorsMap.forEach((color, tagName) => {
            this.createBlock({ type: 'tag', tag: tagName, color: color });
        });

        const retired = new Set(CONFIG.data.retiredTypologies || []);
        const typologies = new Set();
        AppState.items.forEach(item => {
            if (item.typology && !retired.has(item.typology)) typologies.add(item.typology);
        });
        [...typologies]
            .sort((a, b) => getTypologySortIndex(a) - getTypologySortIndex(b) || a.localeCompare(b))
            .forEach(name => {
            this.createBlock({ type: 'typology', typology: name });
        });

        const authorCodes = new Set();
        AppState.items.forEach(item => {
            if (item.authorCode) authorCodes.add(item.authorCode);
        });
        [...authorCodes].sort((a, b) => a.localeCompare(b)).forEach(author => {
            this.createBlock({ type: 'author', author: author });
        });

        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        this.syncWordPanelMode(level);
        requestAnimationFrame(() => this.updateScrollReserve());
        this.captureDockTrayBaseOrder();
        this.updateWarehouseCapacityUI();
        this.syncLauncherStripPeek();
    },

    captureDockTrayBaseOrder() {
        this._dockTrayBaseOrder = this.blocks.filter(
            b => (b.type === 'tag' || b.type === 'author' || b.type === 'typology') && b.slotElement
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
            if (!slot || !this.isBlockTrayContainer(slot.parentElement)) return;
            slot.parentElement.appendChild(slot);
        });
    },

    reorderDockTrayByRelevance(coTags, coAuthors, coTypologies = new Set()) {
        if (!this.trayBlocksElement) return;
        this.ensureDockTrayBaseOrder();

        const hasReservedSlot = this._dockTrayBaseOrder.some(block => {
            const slot = block.slotElement;
            if (!slot || !this.isBlockTrayContainer(slot.parentElement)) return false;
            return slot.classList.contains('is-empty') || !!block._dockReserveEl;
        });
        if (hasReservedSlot) {
            this.restoreDockTrayOrder();
            return;
        }

        const relevant = [];
        const irrelevant = [];
        const away = [];

        this._dockTrayBaseOrder.forEach(block => {
            const slot = block.slotElement;
            if (!slot || !this.isBlockTrayContainer(slot.parentElement)) return;
            if (this.isLauncherStripMode() && slot.parentElement === this.launcherStripTrayElement) return;

            if (!this.isBlockDockedInTray(block)) {
                away.push(block);
                return;
            }

            if (this.isDockBlockCoRelevant(block, coTags, coAuthors, coTypologies)) {
                relevant.push(block);
            } else {
                irrelevant.push(block);
            }
        });

        [...relevant, ...irrelevant, ...away].forEach(block => {
            const parent = block.slotElement?.parentElement;
            if (!parent || !this.isBlockTrayContainer(parent)) return;
            if (this.isLauncherStripMode() && parent === this.launcherStripTrayElement) return;
            parent.appendChild(block.slotElement);
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
        const isTypology = def.type === 'typology';
        el.classList.add('action-block', 'general-t');
        if (isAuthor) el.classList.add('action-block--author');
        if (isTypology) {
            el.classList.add('action-block--typology');
            el.dataset.typology = def.typology;
            el.dataset.typologyPattern = typeof getTypologyPattern === 'function'
                ? getTypologyPattern(def.typology)
                : 'regular';
        }
        el.dataset.type = def.type || 'tag';
        if (def.color) el.style.setProperty('--block-tag-color', def.color);

        const label = isAuthor ? def.author : (isTypology ? null : def.tag);
        const glyphHTML = (isAuthor || isTypology)
            ? ''
            : `<span class="block-glyph" style="background-color: ${def.color}"></span>`;
        const typologyHTML = isTypology && typeof buildTypologyBlockInnerHTML === 'function'
            ? buildTypologyBlockInnerHTML(def.typology)
            : `<span class="block-label">${label}</span>`;
        el.innerHTML = isTypology ? typologyHTML : `${glyphHTML}${typologyHTML}`;
        slot.appendChild(el);
        const trayParent = this.getBlockTrayParent(def);
        if (trayParent) trayParent.appendChild(slot);

        const block = {
            type: def.type || 'tag',
            tag: (isAuthor || isTypology) ? null : def.tag,
            author: isAuthor ? def.author : null,
            typology: isTypology ? def.typology : null,
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

        this.wireBlockRemoveMark(block);

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.block-remove-mark')) return;
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
        el.classList.add('action-block', 'action-block--frame', 'general-t');
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
        return leftPad + scale(CONFIG.warehouse.blockGlyphSize) + gap + slotWidth + cfg.paddingX;
    },

    getFrameNestedDimensions(frame) {
        const cfg = CONFIG.warehouse.frame.filter;
        const blockH = scale(CONFIG.warehouse.blockHeight);
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
        const minShellH = scale(CONFIG.warehouse.blockHeight) + cfg.paddingY * 2;
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
            slotEl.style.height = `${scale(CONFIG.warehouse.blockHeight)}px`;
            slotEl.style.minHeight = `${scale(CONFIG.warehouse.blockHeight)}px`;
        }
    },

    frameContainsBlock(frame, block) {
        return (frame.nestedBlocks || []).some(n =>
            n.type === block.type &&
            ((block.type === 'tag' && n.tag === block.tag) ||
             (block.type === 'author' && n.author === block.author) ||
             (block.type === 'typology' && n.typology === block.typology))
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
        block.element.classList.add('is-deployed', 'is-depth-ui-mounted', 'is-selected');
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
        this.syncBlockRemovable(block);

        const deployedCount = this.blocks.filter(b =>
            b.state === 'active' &&
            b.element?.classList.contains('is-deployed') &&
            !b.nestedIn
        ).length;

        this.depthBlockBarElement.classList.toggle('has-blocks', deployedCount > 0);
        this.fadeDepthDropIndicator();
        if (this.shellElement) {
            this.shellElement.classList.toggle('is-workspace-active', deployedCount > 0);
        }
        this.syncClearControlVisibility();
        this.updateScrollReserve();
        this.updateDotFocusFilter();
    },

    measureDepthBarSlotRect(block) {
        if (!this.depthBlockBarElement) return null;

        const bar = this.depthBlockBarElement;
        const hadBlocks = bar.classList.contains('has-blocks');
        if (!hadBlocks) bar.classList.add('has-blocks');

        block.element.style.visibility = 'hidden';
        block.element.style.transform = 'none';
        bar.appendChild(block.element);
        if (block.type === 'frame') this.refreshFrameLayout(block);

        const rect = block.element.getBoundingClientRect();
        block.element.remove();
        block.element.style.visibility = '';
        block.element.style.transform = '';

        if (!hadBlocks) bar.classList.remove('has-blocks');
        return rect;
    },

    _depthDeployEase(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    _runArcViewportMotion(el, startRect, endRect, options = {}, onDone) {
        const cfg = CONFIG.warehouse;
        const duration = options.duration ?? cfg.depthDeployDuration ?? 520;
        const startScale = options.startScale ?? cfg.depthDeployStartScale ?? 0.94;
        const arcLift = options.arcLift ?? Math.min(
            cfg.depthDeployArcLift ?? scale(14),
            Math.abs(startRect.top - endRect.top) * 0.15 + scale(6)
        );
        const state = options.state || {};
        const t0 = performance.now();
        let finished = false;

        const finish = () => {
            if (finished) return;
            finished = true;
            if (state.raf) {
                cancelAnimationFrame(state.raf);
                state.raf = null;
            }
            clearTimeout(state.timeout);
            state.timeout = null;
            onDone?.();
        };

        const tick = (now) => {
            const raw = Math.min(1, (now - t0) / duration);
            const e = this._depthDeployEase(raw);
            const x = startRect.left + (endRect.left - startRect.left) * e;
            const y = startRect.top + (endRect.top - startRect.top) * e -
                arcLift * Math.sin(raw * Math.PI);
            const s = startScale + (1 - startScale) * e;
            el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;

            if (raw < 1) {
                state.raf = requestAnimationFrame(tick);
            } else {
                finish();
            }
        };

        state.timeout = setTimeout(finish, duration + 32);
        state.raf = requestAnimationFrame(tick);
        return state;
    },

    _runDepthDeployMotion(block, startRect, endRect, onDone) {
        const el = block.element;
        block._depthDeployState = block._depthDeployState || {};
        this._runArcViewportMotion(el, startRect, endRect, {
            state: block._depthDeployState
        }, () => {
            el.style.transform = '';
            el.classList.remove('is-deploying-to-bar');
            onDone?.();
        });
    },

    getMacroIndicationTargetRect(block, startRect) {
        const { width, height } = this.blockMetrics(block);
        const visibleBottom = typeof getSiteL1VisibleViewportHeightPx === 'function'
            ? getSiteL1VisibleViewportHeightPx()
            : window.innerHeight * 0.72;
        const centerY = visibleBottom * 0.5;
        const fullTarget = {
            left: window.innerWidth * 0.5 - width / 2,
            top: centerY - height / 2,
            width,
            height
        };
        if (!startRect) return fullTarget;

        const travel = CONFIG.warehouse.macroIndicationTravel ?? 0.38;
        return {
            left: startRect.left + (fullTarget.left - startRect.left) * travel,
            top: startRect.top + (fullTarget.top - startRect.top) * travel,
            width,
            height
        };
    },

    showMacroIndicationSlot(_block) {
        /* Real block stays in the tray at default dock chrome — ghost arc only. */
    },

    clearMacroIndicationSlot(block) {
        if (!block) return;
        delete block._macroIndicationSlotSnapshot;
    },

    createMacroIndicationGhost(block) {
        const ghost = block.element.cloneNode(true);
        ghost.classList.remove(
            'is-dragging', 'is-deployed', 'is-selected', 'is-removable',
            'is-returning', 'is-nested', 'is-depth-ui-mounted', 'is-deploying-to-bar'
        );
        ghost.classList.add('is-macro-indication');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.display = '';
        ghost.style.visibility = 'visible';
        ghost.style.removeProperty('transform');
        return ghost;
    },

    clearMacroIndicationGhost() {
        const ghost = this._macroIndicationGhost;
        if (ghost) {
            if (ghost._macroIndicationState?.raf) {
                cancelAnimationFrame(ghost._macroIndicationState.raf);
            }
            clearTimeout(ghost._macroIndicationState?.timeout);
            ghost.remove();
            this._macroIndicationGhost = null;
        }
        if (this._macroIndicationBlock) {
            this.clearMacroIndicationSlot(this._macroIndicationBlock);
            this._macroIndicationBlock = null;
        }
        this._macroIndicationAnimating?.clear();
    },

    animateMacroDeployIndication(block) {
        if (DepthController.currentLevel !== 1 || block.state !== 'docked' || block.nestedIn) return;
        if (!this._macroIndicationAnimating) this._macroIndicationAnimating = new Set();
        if (this._macroIndicationAnimating.has(block)) return;

        this.clearMacroIndicationGhost();

        const startRect = block.element.getBoundingClientRect();
        const endRect = this.getMacroIndicationTargetRect(block, startRect);
        if (!startRect.width || !endRect.width) return;

        const ghost = this.createMacroIndicationGhost(block);

        this.showMacroIndicationSlot(block);
        this._macroIndicationBlock = block;

        const cfg = CONFIG.warehouse;
        const startScale = cfg.depthDeployStartScale ?? 0.94;

        document.body.appendChild(ghost);
        this._macroIndicationGhost = ghost;
        this._macroIndicationAnimating.add(block);
        ghost._macroIndicationState = {};
        ghost.style.transform =
            `translate3d(${startRect.left}px, ${startRect.top}px, 0) scale(${startScale})`;

        this._runArcViewportMotion(ghost, startRect, endRect, {
            duration: cfg.macroIndicationDuration ?? cfg.depthDeployDuration ?? 720,
            state: ghost._macroIndicationState
        }, () => {
            this._macroIndicationAnimating.delete(block);
            this.clearMacroIndicationSlot(block);
            this._macroIndicationBlock = null;
            ghost.classList.add('is-fading');
            setTimeout(() => {
                if (ghost.parentNode) ghost.remove();
                if (this._macroIndicationGhost === ghost) this._macroIndicationGhost = null;
            }, cfg.macroIndicationFadeMs ?? 320);
        });
    },

    animateDeployToDepthBar(block) {
        if (!this.depthBlockBarElement || block.nestedIn) return;
        if (block.state !== 'docked') return;
        if (this.isActiveCaptureBlock(block) && this.isWarehouseCaptureFull()) return;
        if (!this._depthDeployAnimating) this._depthDeployAnimating = new Set();
        if (this._depthDeployAnimating.has(block)) return;

        const startRect = block.element.getBoundingClientRect();
        if (!block._depthUiSnapshot) {
            block._depthUiSnapshot = {
                parent: block.slotElement,
                nextSibling: null,
                x: 0,
                y: 0,
                depthUiOnly: true
            };
        }

        this.markSlotEmpty(block);
        block.state = 'active';
        block.element.classList.add('is-selected');

        const endRect = this.measureDepthBarSlotRect(block);
        if (!endRect || endRect.width < 1) {
            this.clearSlotEmpty(block);
            block.state = 'docked';
            block.element.classList.remove('is-selected');
            this.deployBlockToDepthBar(block);
            return;
        }

        this._depthDeployAnimating.add(block);
        this.showDepthDropIndicator();

        document.body.appendChild(block.element);
        block.element.classList.add('is-deploying-to-bar');
        block.element.style.transform =
            `translate3d(${startRect.left}px, ${startRect.top}px, 0) scale(${CONFIG.warehouse.depthDeployStartScale ?? 0.94})`;

        this._runDepthDeployMotion(block, startRect, endRect, () => {
            this.deployBlockToDepthBar(block);
            this._depthDeployAnimating.delete(block);
        });
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
        this.fadeDepthDropIndicator();

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
            this.markSlotEmpty(block);
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
            this.showDepthDropIndicator();
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

        if (pullFromFrame || liftFromSurface || liftFromBar) {
            this.updateDotFocusFilter();
        } else if (!depthUi) {
            this.updateWorkspaceState();
        }

        this.dragLoop();
    },

    startDrag(block, e) {
        const depthUi = this.isDepthUiLevel();
        if (this.dragState || (!depthUi && DepthController.currentLevel !== 1)) return;
        if (this.isLauncherStripMode() &&
            block.slotElement?.parentElement === this.launcherStripTrayElement &&
            !this.launcherStripPinned) {
            return;
        }
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.isRunning()) {
            return;
        }
        if (block.state === 'docked' && !block.nestedIn) {
            this.openPopup();
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

        if (!depthUi &&
            DepthController.currentLevel === 1 &&
            block.state === 'docked' &&
            !block.nestedIn) {
            this.dragState = {
                block: block,
                clickPending: true,
                macroClickIndicate: true,
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

        if (depthUi && block.element.classList.contains('is-removable') &&
            block.element.classList.contains('is-depth-ui-mounted')) {
            this.dragState = {
                block: block,
                clickPending: true,
                depthUiReturn: true,
                depthUi: true,
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

        if (depthUi && block.state === 'docked' && !block.nestedIn &&
            !this._depthDeployAnimating?.has(block)) {
            this.dragState = {
                block: block,
                clickPending: true,
                depthUi: true,
                depthUiClickDeploy: true,
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

        this.clearMacroIndicationGhost();
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
                this.clearMacroIndicationGhost();
                this.beginDragLift(block, e, {
                    depthUi: !!drag.depthUiClickDeploy,
                    liftFromSurface: !drag.depthUiClickDeploy && !drag.macroClickIndicate,
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

        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.scheduleMotionRender();
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
            if (moved < clickThreshold) {
                if (drag.depthUiClickDeploy) {
                    this.animateDeployToDepthBar(block);
                } else if (drag.macroClickIndicate) {
                    this.animateMacroDeployIndication(block);
                } else if (drag.depthUiReturn ||
                    block.element.classList.contains('is-removable')) {
                    this.returnToDock(block);
                } else if (typeof DepthTransitionOrchestrator !== 'undefined') {
                    DepthTransitionOrchestrator.runBlockClick(block);
                }
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
            this.syncBlockRemovable(block);
            if (block.body) {
                Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });
            }
            if (block.element.classList.contains('is-removable')) {
                this.returnToDock(block);
                return;
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
        this.deployBlockAtPageCoords(block, block.x, block.y);
    },

    deployBlockAtPageCoords(block, pageX, pageY) {
        if (!block || this.dragState) return false;
        if (block.nestedIn) return false;
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 1) return false;

        const docked = block.state === 'docked' ||
            block.element.parentElement === block.slotElement;
        if (docked) {
            this.markSlotEmpty(block);
            document.body.appendChild(block.element);
            block.element.classList.remove('is-deployed', 'is-nested', 'is-depth-ui-mounted', 'is-dragging');
        }

        const { width, height } = this.blockMetrics(block);
        block.x = pageX;
        block.y = pageY;
        block.collisionW = width;
        block.collisionH = height;
        block.bodyX = block.x + width / 2;
        block.bodyY = block.y + height / 2;
        if (!block.body) this.attachBody(block);
        Matter.Body.setPosition(block.body, { x: block.bodyX, y: block.bodyY });

        block.state = 'active';
        block.isDragging = false;
        block.carryOrbitWhileDragging = false;
        block.element.classList.remove('is-dragging');
        block.element.classList.add('is-deployed');
        this.applyTransform(block, 0);
        this.syncFrameBodyOwnership(block);
        if (block.type === 'frame') this.refreshFrameLayout(block);
        this.syncBlockRemovable(block);
        this.updateWorkspaceState();
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.flushPendingBlockLayoutRender();
        }
        return true;
    },

    prepareBlockReturnAnimation(block) {
        const onCanvas = block.element.classList.contains('is-deployed');
        const onDepthBar = block.element.classList.contains('is-depth-ui-mounted');
        if (!onCanvas && !onDepthBar) return;

        const rect = block.element.getBoundingClientRect();
        document.body.appendChild(block.element);
        block.element.classList.remove('is-deployed', 'is-depth-ui-mounted');
        block.element.classList.add('is-dragging');
        block.x = rect.left;
        block.y = rect.top;
        this.applyTransform(block, 0);
        void block.element.offsetWidth;
    },

    returnToDock(block) {
        if (block.type === 'frame' && (block.nestedBlocks || []).length > 0) {
            [...block.nestedBlocks].forEach(nested => {
                this.ejectFromFrame(nested);
                this.returnToDock(nested);
            });
        }

        this.prepareBlockReturnAnimation(block);

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
        if (typeof NavigationMap !== 'undefined') {
            NavigationMap.flushPendingBlockLayoutRender();
        }

        setTimeout(() => {
            block.element.classList.remove('is-dragging', 'is-deployed', 'is-returning', 'is-nested', 'is-depth-ui-mounted', 'is-selected', 'is-removable');
            block.element.style.transform = '';
            this.clearSlotEmpty(block);
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
                this.syncClearControlVisibility();
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
        const radius = scale(CONFIG.warehouse.blockHeight) / 2;
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
        this.clearDepthDropIndicator();
        this.updateScrollReserve();
    },

    // Pill half-diagonal — wider labels need a larger exclusion zone than blockHeight/2
    getBlockCollisionRadius(block) {
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const w = block.collisionW || blockH;
        const h = block.collisionH || blockH;
        return Math.hypot(w / 2, h / 2);
    },

    // Push a point outside the block pill (axis-aligned) by pad px
    pushPointOutOfBlockAabb(block, x, y, pad) {
        const blockH = scale(CONFIG.warehouse.blockHeight);
        const w = block.collisionW || blockH;
        const h = block.collisionH || blockH;
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
        const blockCountChanged = activeCount !== this._navigationMapBlockCount;
        this._navigationMapBlockCount = activeCount;

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
        this.syncClearControlVisibility();

        this.updateWarehouseCapacityUI();
        this.updateDotFocusFilter();

        if (blockCountChanged && typeof NavigationMap !== 'undefined') {
            NavigationMap.onBlockLayoutChanged();
        }

        this.syncAllBlockRemovables();
    },

    getLiveStatistics() {
        const blocksInUse = typeof this.getCrowdedBlockCount === 'function'
            ? this.getCrowdedBlockCount()
            : 0;
        const activeBlocks = typeof this.getActiveCaptureBlocks === 'function'
            ? this.getActiveCaptureBlocks()
            : [];
        const connectedNotes = new Set();
        let blockNoteConnections = 0;

        if (typeof AppState !== 'undefined' && Array.isArray(AppState.items) && activeBlocks.length) {
            AppState.items.forEach((item, noteIndex) => {
                const noteTags = new Set((item.tags || []).map(tag => tag?.name).filter(Boolean));
                activeBlocks.forEach(block => {
                    const matchesTag = block.type === 'tag' && block.tag && noteTags.has(block.tag);
                    const matchesAuthor = block.type === 'author' && block.author &&
                        (item.authorCode === block.author || item.authorFullName === block.author);
                    const matchesTypology = block.type === 'typology' && block.typology &&
                        item.typology === block.typology;
                    if (!matchesTag && !matchesAuthor && !matchesTypology) return;

                    blockNoteConnections++;
                    connectedNotes.add(noteIndex);
                });
            });
        }

        return {
            blocksInUse,
            blockNoteConnections,
            connectedNotes: connectedNotes.size
        };
    },

    getStatisticRows(stats) {
        return [
            { key: 'blocksInUse', label: 'בלוקים בשימוש', value: stats.blocksInUse },
            { key: 'blockNoteConnections', label: 'חיבורים פעילים', value: stats.blockNoteConnections },
            { key: 'connectedNotes', label: 'פתקים מחוברים', value: stats.connectedNotes }
        ];
    },

    formatStatisticValue(value) {
        return Number(value || 0).toLocaleString('he-IL');
    },

    ensureWarehouseStatisticsRows(rows) {
        if (!this.statisticsElement) return;

        const existingKeys = this.statisticsRowElements
            ? [...this.statisticsRowElements.keys()].join('|')
            : '';
        const nextKeys = rows.map(row => row.key).join('|');
        if (existingKeys === nextKeys) return;

        const list = document.createElement('dl');
        list.className = 'warehouse-statistics__list';
        this.statisticsRowElements = new Map();

        rows.forEach(row => {
            const item = document.createElement('div');
            item.className = 'warehouse-statistics__row';
            item.dataset.statistic = row.key;

            const label = document.createElement('dt');
            label.className = 'warehouse-statistics__label';
            label.textContent = row.label;

            const value = document.createElement('dd');
            value.className = 'warehouse-statistics__value';
            value.textContent = this.formatStatisticValue(this.statisticsDisplayValues.get(row.key) ?? row.value);

            item.append(label, value);
            list.appendChild(item);
            this.statisticsRowElements.set(row.key, { item, label, value });
        });

        this.statisticsElement.replaceChildren(list);
    },

    updateStatisticDisplayValues(rows, now = performance.now()) {
        let shouldAnimate = false;
        rows.forEach(row => {
            const target = Number(row.value || 0);
            const previousTarget = this.statisticsTargetValues.get(row.key);
            if (previousTarget === target) return;

            this.statisticsTargetValues.set(row.key, target);
            if (!this.statisticsDisplayValues.has(row.key)) {
                this.statisticsDisplayValues.set(row.key, target);
                return;
            }

            shouldAnimate = true;
        });

        if (!shouldAnimate) {
            this.paintStatisticValues();
            return;
        }

        this.statisticsAnimationStartedAt = now;
        if (!this.statisticsAnimationFrame) {
            this.statisticsAnimationFrame = requestAnimationFrame((timestamp) => {
                this.tickStatisticAnimation(timestamp);
            });
        }
    },

    tickStatisticAnimation(timestamp) {
        const elapsed = Math.max(0, timestamp - this.statisticsAnimationStartedAt);
        const progress = Math.min(1, elapsed / this.statisticsAnimationDurationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        let animating = false;

        this.statisticsTargetValues.forEach((target, key) => {
            const current = Number(this.statisticsDisplayValues.get(key) || 0);
            const next = current + (target - current) * eased;
            const close = Math.abs(target - next) < 0.5 || progress >= 1;

            this.statisticsDisplayValues.set(key, close ? target : next);
            if (!close) animating = true;
        });

        this.paintStatisticValues();

        if (animating) {
            this.statisticsAnimationFrame = requestAnimationFrame((nextTimestamp) => {
                this.tickStatisticAnimation(nextTimestamp);
            });
        } else {
            this.statisticsAnimationFrame = null;
        }
    },

    paintStatisticValues() {
        if (!this.statisticsRowElements) return;

        this.statisticsRowElements.forEach((elements, key) => {
            const value = this.statisticsDisplayValues.get(key) ?? this.statisticsTargetValues.get(key) ?? 0;
            elements.value.textContent = this.formatStatisticValue(Math.round(value));
        });
    },

    renderWarehouseStatistics() {
        if (!this.statisticsElement) return;

        const stats = this.getLiveStatistics();
        const rows = this.getStatisticRows(stats);
        this.ensureWarehouseStatisticsRows(rows);
        this.updateStatisticDisplayValues(rows);
    },

    // Gray out docked tag/author pills when the workspace capture limit is reached
    updateWarehouseCapacityUI() {
        const full = this.isWarehouseCaptureFull();
        const suppressFullGray = typeof this.shouldUseCooccurrenceDockMute === 'function' &&
            this.shouldUseCooccurrenceDockMute();
        if (this.dockElement) {
            this.dockElement.classList.toggle('is-capture-full', full && !suppressFullGray);
        }
        if (this.launcherWrapElement) {
            this.launcherWrapElement.classList.toggle('is-capture-full', full && !suppressFullGray);
        }
        this.renderWarehouseStatistics();
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

        const { tags: activeTags, authors: activeAuthors, typologies: activeTypologies } =
            this.getActiveFocusCriteria();

        const { tags: filterTags, authors: filterAuthors, typologies: filterTypologies } =
            this.getFilterCriteria();
        const focus = activeTags.size > 0 || activeAuthors.size > 0 || activeTypologies.size > 0;
        const hasFilterCriteria = filterTags.size > 0 || filterAuthors.size > 0 ||
            filterTypologies.size > 0;
        const shouldPeel = hasFilterCriteria && isMacro;

        document.body.classList.toggle(
            'is-block-focus',
            focus && ((isV2Depth && level === 3) || isMacro || isCatalogDepth)
        );
        document.body.classList.toggle('is-block-filter', hasFilterCriteria);
        document.body.classList.toggle('is-catalog-lens', focus && (isCatalogDepth || (isV2Depth && level >= 2)));
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
            if (hasFilterCriteria &&
                this.moleculeMatchesFilter(noteIndex, filterTags, filterAuthors, filterTypologies)) {
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
            const noteTypology = this.getNoteTypology(noteIndex, wrapper);
            const isRelevant = this.noteMatchesActiveFocus(
                moleculeTags,
                authorCode,
                activeTags,
                activeAuthors,
                noteTypology,
                activeTypologies
            );

            wrapper.classList.toggle('is-molecule-focused', isRelevant);
            wrapper.classList.toggle('is-molecule-muted', !isRelevant);

            if (!isMacro) return;

            dots.forEach(dot => {
                const tag = dot.dataset.tag || '';
                const dotMatchesTag = tag && activeTags.has(tag);
                const dotMatchesAuthor = authorCode && activeAuthors.has(authorCode);
                const dotMatchesTypology = noteTypology && activeTypologies.has(noteTypology);
                const dotMatches = dotMatchesTag || dotMatchesAuthor || dotMatchesTypology;
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

        if (isV2Depth && level === 3 && typeof DepthV2 !== 'undefined') {
            ActionWarehouse.syncDeployedBlocksForDepth?.();
            DepthV2.relayoutForFilterChange({ force: true });
            if (typeof MicroMock !== 'undefined') {
                MicroMock.applyAll?.();
            }
        }

        this.updateWarehouseBlockRelevance();
        this.updateWarehouseCapacityUI();

        if (typeof NavigationMap !== 'undefined' && level === 3) {
            NavigationMap.notifyMapRefreshTick(false);
        }

        this.syncAllBlockRemovables();
    }
};
