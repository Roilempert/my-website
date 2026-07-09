/* ==========================================================================
   Site About — tab at col 1; tab + panel slide up from below to mid-screen
   ========================================================================== */
const SiteAbout = {
    root: null,
    backdrop: null,
    sheet: null,
    trigger: null,
    panel: null,
    isOpen: false,
    _progress: 0,
    _openHeight: 0,
    _openLift: 0,
    _tabHeight: 40,
    _dragging: false,
    _pointerActive: false,
    _dragCommitted: false,
    _dragThresholdPx: 8,
    _dragStartY: 0,
    _dragStartProgress: 0,
    _wheelSnapTimer: null,
    _onResize: null,

    cfg() {
        return CONFIG.about || {};
    },

    _escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    _cornerNoteLines() {
        const lines = this.cfg().cornerNoteLines;
        if (Array.isArray(lines) && lines.length) return lines;
        const fallback = this.cfg().cornerNoteText ?? 'רועי היה פה';
        const parts = String(fallback).trim().split(/\s+/);
        if (parts.length >= 2) return [parts[0], parts.slice(1).join(' ')];
        return [fallback];
    },

    _cornerNoteLabelHtml() {
        return this._cornerNoteLines()
            .map((line) => `<span class="site-about__corner-note-line">${this._escapeHtml(line)}</span>`)
            .join('');
    },

    _renderDetailsHtml() {
        const intro = this.cfg().intro || '';
        const credits = Array.isArray(this.cfg().credits) ? this.cfg().credits : [];
        const rows = credits.map(({ category, output }) => {
            const outHtml = Array.isArray(output)
                ? output.map((line) => `<span class="site-about__credit-output-line">${line}</span>`).join('')
                : output;
            return `<div class="site-about__credit-detail">
                <dt class="site-about__credit-cat general-t">${category}</dt>
                <dd class="site-about__credit-out general-t">${outHtml}</dd>
            </div>`;
        }).join('');

        return `
            ${intro ? `<p class="site-about__intro general-t">${intro}</p>` : ''}
            ${rows ? `<dl class="site-about__credits general-t">${rows}</dl>` : ''}
        `;
    },

    init() {
        if (this.root) return;

        const label = this.cfg().label || 'על הפרויקט';
        const mainTitle = this.cfg().mainTitle || 'הדברים';
        const bodyHtml = this.cfg().bodyHtml || '';
        const detailsHtml = this._renderDetailsHtml();
        const logoSrc = this.cfg().logoSrc || '';
        const arrowGlyph = `
            <svg class="site-about__scroll-glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17.71 11.65" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M3.47,11.38c-.4.4-.92.33-1.32-.07l-1.85-1.85c-.4-.4-.4-.92,0-1.32L8.22.3c.4-.4.92-.4,1.32,0l7.85,7.85c.4.4.46.92,0,1.32l-1.65,1.85c-.46.4-.92.46-1.39.07l-5.48-4.82-5.41,4.82Z"/>
            </svg>`;
        const logoHtml = logoSrc
            ? `<div class="site-about__brand"><img class="site-about__logo" src="${logoSrc}" alt="בצלאל אקדמיה לאמנות ועיצוב"></div>`
            : '';
        const cornerNoteLines = this._cornerNoteLines();

        this.root = document.createElement('div');
        this.root.className = 'site-about';
        this.root.dataset.siteLayer = 'about';

        this.backdrop = document.createElement('div');
        this.backdrop.className = 'site-about__backdrop focus-backdrop';
        this.backdrop.setAttribute('aria-hidden', 'true');
        this.backdrop.addEventListener('click', () => this.close());

        this.sheet = document.createElement('div');
        this.sheet.className = 'site-about__sheet';

        this.trigger = document.createElement('button');
        this.trigger.type = 'button';
        this.trigger.className = 'site-about__trigger general-t';
        this.trigger.id = 'site-about-trigger';
        this.trigger.setAttribute('aria-expanded', 'false');
        this.trigger.setAttribute('aria-controls', 'site-about-panel');
        this.trigger.textContent = label;

        this.panel = document.createElement('aside');
        this.panel.id = 'site-about-panel';
        this.panel.className = 'site-about__panel';
        this.panel.setAttribute('aria-labelledby', 'site-about-trigger');
        this.panel.setAttribute('aria-hidden', 'true');
        this.panel.innerHTML = `
            <section class="site-about__metadata">
                <div class="site-about__scroll-glyphs" aria-hidden="true">
                    ${arrowGlyph}
                    ${arrowGlyph}
                    ${arrowGlyph}
                </div>
                <div class="site-about__content">
                    <h2 class="site-about__headline opening-screen__title main-t" dir="rtl">${mainTitle}</h2>
                    ${logoHtml}
                    <div class="site-about__text general-t" dir="rtl">${bodyHtml}</div>
                    <div class="site-about__details" dir="rtl">${detailsHtml}</div>
                </div>
            </section>
        `;

        this.cornerNote = document.createElement('div');
        this.cornerNote.className = 'site-about__corner-note opening-screen__entry-note note-title';
        this.cornerNote.setAttribute('role', 'group');
        this.cornerNote.setAttribute('aria-label', cornerNoteLines.join(' '));

        this.cornerNoteLabel = document.createElement('div');
        this.cornerNoteLabel.className = 'opening-screen__entry-note-label site-about__corner-note-editor';
        this.cornerNoteLabel.contentEditable = 'plaintext-only';
        this.cornerNoteLabel.setAttribute('role', 'textbox');
        this.cornerNoteLabel.setAttribute('aria-multiline', 'true');
        this.cornerNoteLabel.setAttribute('spellcheck', 'false');
        this.cornerNoteLabel.setAttribute('tabindex', '0');
        this.cornerNoteLabel.innerHTML = this._cornerNoteLabelHtml();

        this.cornerNote.appendChild(this.cornerNoteLabel);

        this.cornerNoteLabel.addEventListener('mousedown', (e) => e.stopPropagation());
        this.cornerNoteLabel.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.cornerNoteLabel.addEventListener('click', (e) => e.stopPropagation());
        this.cornerNoteLabel.addEventListener('keydown', (e) => e.stopPropagation());

        this.sheet.appendChild(this.trigger);
        this.sheet.appendChild(this.panel);
        this.sheet.appendChild(this.cornerNote);
        this.root.appendChild(this.backdrop);
        this.root.appendChild(this.sheet);
        document.body.appendChild(this.root);

        this.trigger.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        this.trigger.addEventListener('pointermove', (e) => this._onPointerMove(e));
        this.trigger.addEventListener('pointerup', (e) => this._endPointer(e));
        this.trigger.addEventListener('pointercancel', (e) => this._endPointer(e, { cancelled: true }));
        this.trigger.addEventListener('lostpointercapture', (e) => this._endPointer(e, { cancelled: true }));
        this.trigger.addEventListener('click', (e) => e.preventDefault());
        this.trigger.addEventListener('keydown', (e) => this._onTriggerKeyDown(e));

        this._onWheel = (e) => this._handleWheel(e);
        this.root.addEventListener('wheel', this._onWheel, { passive: false, capture: true });

        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this._progress > 0) {
                if (this.cornerNoteLabel?.contains(document.activeElement)) {
                    e.preventDefault();
                    this.cornerNoteLabel.blur();
                    return;
                }
                e.preventDefault();
                this.close();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);

        this._onResize = () => {
            const wasOpen = this.isOpen;
            this._syncBackdropTokens();
            this._measureDimensions();
            this._fitMainTitle();
            this._progress = wasOpen ? 1 : 0;
            this._applyProgress(false);
        };
        window.addEventListener('resize', this._onResize);

        this._syncBackdropTokens();

        requestAnimationFrame(() => {
            this._measureDimensions();
            this._fitMainTitle();
            this._applyProgress(false);
        });
    },

    _titleFitCfg() {
        const opening = CONFIG.opening?.titleFit || {};
        const about = this.cfg();
        return {
            fontSizePx: opening.fontSizePx ?? about.titleFontSizePx ?? null,
            minPx: opening.minPx ?? about.titleMinPx ?? 24,
            maxPx: opening.maxPx ?? about.titleMaxPx ?? 400,
            reducePt: opening.reducePt ?? about.titleReducePt ?? 32,
            sizeScale: opening.sizeScale ?? about.titleSizeScale ?? 1,
            letterGapPx: opening.letterGapPx ?? about.titleLetterGapPx ?? 56
        };
    },

    _titleChars(text) {
        return [...(text || '')];
    },

    _ensureTitleSkeleton(headline) {
        const text = (headline.dataset.titleText || headline.textContent || '').trim();
        const chars = this._titleChars(text);
        if (!headline || !chars.length) return;

        const skeletonKey = chars.join('');
        if (
            headline.dataset.titleSkeletonText === skeletonKey
            && headline.querySelectorAll('.opening-screen__title-char').length === chars.length
        ) {
            return;
        }

        headline.dataset.titleSkeletonText = skeletonKey;
        headline.dataset.titleText = text;
        headline.textContent = '';
        const frag = document.createDocumentFragment();

        chars.forEach((ch, index) => {
            const span = document.createElement('span');
            span.className = 'opening-screen__title-char';
            span.textContent = ch;
            frag.appendChild(span);
            if (index < chars.length - 1) {
                const gap = document.createElement('span');
                gap.className = 'opening-screen__title-gap';
                gap.setAttribute('aria-hidden', 'true');
                frag.appendChild(gap);
            }
        });

        headline.appendChild(frag);
    },

    _syncBackdropTokens() {
        const openingBg = CONFIG.opening?.background || {};
        const blurScale = openingBg.blurScale ?? 0.028;
        const canvasBlurPx = 6;
        const contentBlurPx = Math.max(
            8,
            Math.min(24, Math.round(window.innerHeight * blurScale * 0.85))
        );
        const blurPx = contentBlurPx + canvasBlurPx;
        const grainTilePx = openingBg.grainTilePx ?? 40;
        const grainAlpha = (openingBg.grainAlpha ?? 14) / 255;
        const grainBlendMode = openingBg.grainBlendMode ?? 'soft-light';
        const washPct = Math.round((openingBg.glowAlpha ?? 0.07) * 100);
        const noteRotateDeg = this.cfg().cornerNoteRotateDeg ?? 25;
        const noteOffsetX = this.cfg().cornerNoteOffsetX ?? 20;
        const noteOffsetY = this.cfg().cornerNoteOffsetY ?? -40;
        const noteLineHeightScale = this.cfg().cornerNoteLineHeightScale ?? 1.1;
        const targets = [document.documentElement, this.root].filter(Boolean);

        targets.forEach((el) => {
            el.style.setProperty('--site-about-bg-blur', `${blurPx}px`);
            el.style.setProperty('--site-about-backdrop-wash', `${washPct}%`);
            el.style.setProperty('--site-about-backdrop-grain-opacity', String(grainAlpha));
            el.style.setProperty('--site-about-backdrop-grain-blend', grainBlendMode);
            el.style.setProperty('--site-about-backdrop-grain-tile', `${grainTilePx}px`);
            el.style.setProperty('--site-about-corner-note-rotate', `${noteRotateDeg}deg`);
            el.style.setProperty('--site-about-corner-note-offset-x', `${noteOffsetX}px`);
            el.style.setProperty('--site-about-corner-note-offset-y', `${noteOffsetY}px`);
            el.style.setProperty('--site-about-corner-note-line-height-scale', String(noteLineHeightScale));
        });
    },

    _fitMainTitle() {
        const headline = this.panel?.querySelector('.site-about__headline');
        if (!headline) return;

        const text = (this.cfg().mainTitle || headline.dataset.titleText || headline.textContent || '').trim();
        if (!text) return;

        headline.dataset.titleText = text;
        this._ensureTitleSkeleton(headline);

        const cfg = this._titleFitCfg();
        const reducePx = cfg.reducePt * (96 / 72);
        const targetPx = cfg.fontSizePx ?? Math.max(cfg.minPx, (cfg.maxPx - reducePx) * cfg.sizeScale);
        const lineHeight = 0.88;

        headline.style.fontSize = `${targetPx}px`;
        headline.style.letterSpacing = '0px';
        headline.style.minHeight = `${targetPx * lineHeight}px`;
        headline.style.setProperty('--opening-title-gap', `${cfg.letterGapPx}px`);
        headline.style.setProperty('--opening-title-font-size', `${targetPx}px`);
        headline.style.setProperty('--opening-title-line-height', String(lineHeight));

        headline.querySelectorAll('.opening-screen__title-char').forEach((el) => {
            el.classList.remove('is-pending');
        });
    },

    _cssVarPx(varName) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return 0;
        if (raw.endsWith('rem')) {
            return n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
        }
        return n;
    },

    _shellRowTopPx(rowStart1Based) {
        const pad = this._shellPaddingPx();
        const cellH = this._cssVarPx('--site-grid-cell-h');
        const gap = this._cssVarPx('--site-grid-gap');
        const rowOffset = Math.max(0, (rowStart1Based ?? 3) - 1);
        return pad + rowOffset * (cellH + gap);
    },

    _measureDimensions() {
        this._measureTabHeight();
        this._fitMainTitle();
        this._measurePanelHeight();
        this._measureOpenLift();
    },

    _shellPaddingPx() {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--site-grid-padding').trim();
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return 20;
        return raw.endsWith('rem') ? n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) : n;
    },

    _measurePanelHeight() {
        const panelVh = this.cfg().panelHeightVh ?? 38;
        const configMax = this.cfg().openMaxPx ?? 960;
        const vhFallback = Math.round(window.innerHeight * (panelVh / 100));
        const pad = this._shellPaddingPx();
        const viewportCap = Math.max(vhFallback, Math.round(window.innerHeight - this._tabHeight - pad * 2));

        let contentHeight = 0;
        const metadata = this.panel?.querySelector('.site-about__metadata');
        if (metadata && this.panel) {
            const panel = this.panel;
            const prev = {
                height: panel.style.height,
                overflow: panel.style.overflow,
                visibility: panel.style.visibility,
                position: panel.style.position
            };
            panel.style.height = 'auto';
            panel.style.overflow = 'visible';
            panel.style.visibility = 'hidden';
            panel.style.position = 'absolute';
            panel.style.left = '0';
            panel.style.width = '100%';
            this._fitMainTitle();
            contentHeight = Math.ceil(metadata.getBoundingClientRect().height);
            panel.style.height = prev.height;
            panel.style.overflow = prev.overflow;
            panel.style.visibility = prev.visibility;
            panel.style.position = prev.position;
            panel.style.left = '';
            panel.style.width = '';
        }

        const target = contentHeight > 0 ? contentHeight : vhFallback;
        const tabRow = this.cfg().tabTopRowStart;
        let maxHeight = viewportCap;

        if (tabRow) {
            const panelTopPx = this._shellRowTopPx(tabRow) + this._tabHeight;
            maxHeight = Math.round(window.innerHeight - pad - panelTopPx);
        }

        this._openHeight = Math.round(Math.min(Math.max(target, vhFallback), configMax, maxHeight));
        this.root?.style.setProperty('--site-about-panel-height', `${this._openHeight}px`);
    },

    _measureTabHeight() {
        if (!this.trigger) return;
        const h = Math.ceil(this.trigger.getBoundingClientRect().height);
        this._tabHeight = h > 0 ? h : 40;
        this.root?.style.setProperty('--site-about-tab-h', `${this._tabHeight}px`);

        const cols = this.cfg().panelCols ?? 12;
        const panelCol = this.cfg().panelColStart ?? 1;
        const tabCol = this.cfg().tabColStart ?? 2;
        const region = {
            colStart: panelCol,
            colEnd: panelCol + cols,
            rowStart: 1,
            rowEnd: 2
        };

        if (typeof siteGridRegionRect === 'function') {
            const rect = siteGridRegionRect(region);
            this.root?.style.setProperty('--site-about-panel-width', rect.width);
            this.root?.style.setProperty('--site-about-panel-left', rect.left);
        } else {
            const colOffset = Math.max(0, panelCol - 1);
            const cellStep = '(var(--site-grid-cell-w) + var(--site-grid-gap))';
            this.root?.style.setProperty(
                '--site-about-panel-width',
                `calc(${cols} * var(--site-grid-cell-w) + ${Math.max(0, cols - 1)} * var(--site-grid-gap))`
            );
            this.root?.style.setProperty(
                '--site-about-panel-left',
                `calc(var(--site-grid-padding) + ${colOffset} * ${cellStep})`
            );
        }

        const tabColOffset = Math.max(0, tabCol - panelCol);
        const cellStep = '(var(--site-grid-cell-w) + var(--site-grid-gap))';
        if (tabColOffset > 0) {
            this.root?.style.setProperty(
                '--site-about-tab-inset-left',
                `calc(${tabColOffset} * ${cellStep})`
            );
        } else {
            this.root?.style.setProperty('--site-about-tab-inset-left', '0px');
        }

        this.root?.style.setProperty('--site-about-panel-cols', String(cols));

        const logoCols = this.cfg().logoCols ?? 1;
        const textCols = this.cfg().textCols ?? 5;
        const detailsCols = this.cfg().detailsCols ?? 5;
        const contentGapCols = this.cfg().contentGapCols ?? 1;
        const logoStart = 1;
        const detailsStart = logoCols + 1;
        const detailsGridSpan = Math.floor(Number(detailsCols));
        const textStart = detailsStart + detailsGridSpan + contentGapCols;

        this.root?.style.setProperty('--site-about-logo-cols', String(logoCols));
        this.root?.style.setProperty('--site-about-logo-col-start', String(logoStart));
        this.root?.style.setProperty('--site-about-text-cols', String(textCols));
        this.root?.style.setProperty('--site-about-text-col-start', String(textStart));
        this.root?.style.setProperty('--site-about-details-cols', String(detailsCols));
        this.root?.style.setProperty('--site-about-details-col-start', String(detailsStart));
    },

    _measureOpenLift() {
        const tabRow = this.cfg().tabTopRowStart;
        if (tabRow) {
            const tabTopPx = this._shellRowTopPx(tabRow);
            this._openLift = Math.max(0, Math.round(window.innerHeight - this._tabHeight - tabTopPx));
            return;
        }

        this._openLift = Math.max(0, Math.round(
            (window.innerHeight + this._openHeight - this._tabHeight) / 2
        ));
    },

    _dragTravel() {
        return this._openLift || 1;
    },

    _wheelHitTarget(e) {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        return hit && this.root?.contains(hit) ? hit : null;
    },

    _isPanelScrollable() {
        if (!this.panel) return false;
        return this.panel.scrollHeight > this.panel.clientHeight + 1;
    },

    _shouldPanelConsumeWheel(e, hit) {
        if (!this.panel || this._progress < 1 || !this._isPanelScrollable()) return false;
        if (!this.panel.contains(hit)) return false;

        const atTop = this.panel.scrollTop <= 0;
        const atBottom = this.panel.scrollTop + this.panel.clientHeight >= this.panel.scrollHeight - 1;

        // At scroll top, wheel-down closes the sheet — leave that to the sheet handler.
        if (atTop && e.deltaY < 0) return false;

        if (e.deltaY > 0 && !atTop) return true;
        if (e.deltaY < 0 && !atBottom) return true;
        return false;
    },

    _applyWheelDelta(deltaY) {
        const travel = this._dragTravel();
        // Match tab drag + natural trackpad direction (up on tab opens, down closes).
        this._progress = Math.min(1, Math.max(0, this._progress + deltaY / travel));
        this.root.classList.add('is-dragging');
        this._applyProgress(false);

        clearTimeout(this._wheelSnapTimer);
        this._wheelSnapTimer = setTimeout(() => {
            this._wheelSnapTimer = null;
            this.root.classList.remove('is-dragging');
            const threshold = this.cfg().snapThreshold ?? 0.35;
            this._progress = this._progress >= threshold ? 1 : 0;
            this._applyProgress(true);
        }, this.cfg().wheelSnapMs ?? 140);
    },

    _handleWheel(e) {
        if (!this.root || this._pointerActive) return;

        const hit = this._wheelHitTarget(e);
        if (!hit) return;

        if (hit.closest?.('.site-about__corner-note')) return;

        if (this._shouldPanelConsumeWheel(e, hit)) return;

        e.preventDefault();
        this._applyWheelDelta(e.deltaY);
    },

    _onPointerDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        this._pointerActive = true;
        this._dragCommitted = false;
        this._dragging = false;
        this._dragStartY = e.clientY;
        this._dragStartProgress = this._progress;
        try {
            this.trigger.setPointerCapture(e.pointerId);
        } catch (_) { /* ignore */ }
    },

    _onPointerMove(e) {
        if (!this._pointerActive) return;

        const dy = this._dragStartY - e.clientY;
        if (!this._dragCommitted) {
            if (Math.abs(dy) < this._dragThresholdPx) return;
            this._dragCommitted = true;
            this._dragging = true;
            this.root.classList.add('is-dragging');
        }

        this._progress = Math.min(1, Math.max(0, this._dragStartProgress + dy / this._dragTravel()));
        this._applyProgress(false);
    },

    _endPointer(e, { cancelled = false } = {}) {
        if (!this._pointerActive) return;

        const wasDrag = this._dragCommitted;
        this._pointerActive = false;
        this._dragCommitted = false;
        this._dragging = false;
        this.root.classList.remove('is-dragging');

        try {
            this.trigger.releasePointerCapture(e.pointerId);
        } catch (_) { /* ignore */ }

        if (wasDrag) {
            const threshold = this.cfg().snapThreshold ?? 0.35;
            this._progress = this._progress >= threshold ? 1 : 0;
            this._applyProgress(true);
        } else if (cancelled) {
            this._progress = this._dragStartProgress;
            this._applyProgress(true);
        } else {
            this._progress = this._dragStartProgress >= 1 ? 0 : 1;
            this._applyProgress(true);
        }
    },

    _onTriggerKeyDown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._progress = this.isOpen ? 0 : 1;
            this._applyProgress(true);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._progress = 1;
            this._applyProgress(true);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.close();
        }
    },

    open() {
        this._progress = 1;
        this._applyProgress(true);
    },

    close() {
        this._progress = 0;
        this._applyProgress(true);
    },

    // Freeze the canvas physics/render while the panel is open, to cut background
    // computation. Restores the runner to the current depth level on close.
    _setBackgroundFrozen(frozen) {
        if (this._bgFrozen === frozen) return;
        this._bgFrozen = frozen;

        if (typeof PhysicsEngine === 'undefined') return;

        if (frozen) {
            PhysicsEngine.aboutFrozen = true;
            if (typeof PhysicsEngine.setMacroPhysicsActive === 'function') {
                PhysicsEngine.setMacroPhysicsActive(false);
            }
        } else {
            PhysicsEngine.aboutFrozen = false;
            const level = (typeof DepthController !== 'undefined' && DepthController.currentLevel) || 1;
            if (typeof PhysicsEngine.setMacroPhysicsActive === 'function') {
                PhysicsEngine.setMacroPhysicsActive(level === 1);
            }
        }
    },

    _applyProgress(animate) {
        if (!this.root) return;

        const lift = this._progress * this._openLift;
        this.root.style.setProperty('--site-about-lift', `${lift}px`);
        this.root.style.setProperty('--site-about-progress', String(this._progress));
        document.documentElement.style.setProperty('--site-about-progress', String(this._progress));
        this.isOpen = this._progress >= 1;

        this.root.classList.toggle('is-open', this.isOpen);
        this.root.classList.toggle('is-revealed', this._progress > 0);
        this.root.classList.toggle('is-snap', !!animate);

        this.backdrop?.setAttribute('aria-hidden', this._progress <= 0 ? 'true' : 'false');
        this.trigger?.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
        this.panel?.setAttribute('aria-hidden', this._progress <= 0 ? 'true' : 'false');
        document.body.classList.toggle('is-site-about-open', this._progress > 0);
        document.body.classList.toggle('is-site-about-snap', !!animate);
        document.body.classList.toggle('is-site-about-dragging', this.root.classList.contains('is-dragging'));

        this._setBackgroundFrozen(this._progress > 0);

        if (this._progress > 0) {
            requestAnimationFrame(() => this._fitMainTitle());
        }
    }
};
