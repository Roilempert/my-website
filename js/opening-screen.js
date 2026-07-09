/* ==========================================================================
   Opening Screen — ceremonial threshold before Experience 1
   ========================================================================== */
const OpeningScreen = {
    skipped: false,
    mounted: false,
    dismissing: false,
    dataReady: false,
    artReady: false,
    userDismissed: false,
    bootFlushed: false,
    el: null,
    continueBtn: null,
    entryNote: null,
    mountedAt: 0,
    _revealTimer: null,
    _revealFallbackTimer: null,
    _stageTimers: [],
    _titleFullText: '',
    _titleTypewriterTimer: null,
    _titleTypewriterGen: 0,
    titleTyped: false,
    _artMounted: false,
    _warmupStarted: false,
    _preloadStarted: false,
    _onResize: null,
    _notesRendered: false,
    _artRevealScheduled: false,
    _contentRevealStarted: false,
    _contentRevealTimer: null,
    _entryNoteRaf: null,
    _entryNoteMotion: null,
    _entryNotePointer: { x: 0, y: 0, active: false },
    _entryNotePointerBound: false,
    _entryNoteHovered: false,
    _boundEntryNoteMove: null,
    _boundEntryNoteLeave: null,
    _boundEntryNoteHoverIn: null,
    _boundEntryNoteHoverOut: null,

    cfg() {
        return CONFIG.opening || {};
    },

    storageKey() {
        return this.cfg().devSkipStorageKey || 'opening.skip';
    },

    shouldShow() {
        if (!document.getElementById('opening-screen')) return false;

        const cfg = this.cfg();
        if (cfg.enabled === false) return false;

        const params = new URLSearchParams(location.search);
        const isDedicatedPage = document.body.classList.contains('opening-page');

        if (params.has('skipOpening') && params.get('skipOpening') !== '0') {
            return false;
        }

        if (isDedicatedPage) {
            return true;
        }

        if (params.has('opening')) {
            const val = params.get('opening');
            if (val === '1' || val === 'true') {
                try { localStorage.removeItem(this.storageKey()); } catch (_) { /* ignore */ }
                return true;
            }
            if (val === '0' || val === 'false') {
                try { localStorage.setItem(this.storageKey(), '1'); } catch (_) { /* ignore */ }
                return false;
            }
        }

        try {
            if (localStorage.getItem(this.storageKey()) === '1') return false;
        } catch (_) { /* ignore */ }

        return true;
    },

    isActive() {
        return document.body.classList.contains('opening-active');
    },

    initEarly() {
        if (!this.shouldShow()) {
            this.skipped = true;
            return { skipped: true };
        }

        this.skipped = false;
        document.body.classList.add('opening-active');
        this.startWarmup();

        return { skipped: false };
    },

    startWarmup() {
        if (this.skipped || this._warmupStarted) return;
        this._warmupStarted = true;

        this._preloadAssets();
        this._preloadFonts();
    },

    _preloadAssets() {
        if (this._preloadStarted) return;
        this._preloadStarted = true;

        const urls = this.cfg().preloadAssets || [];
        urls.forEach((url) => {
            fetch(url, { cache: 'force-cache' }).catch(() => { /* best-effort */ });
        });
    },

    _preloadFonts() {
        if (!document.fonts?.load) return;

        const loads = [
            document.fonts.load('700 58px NarkissYair'),
            document.fonts.load('700 1rem NarkissYairMono'),
            document.fonts.load('400 1.6667rem TheBasicsDots'),
            document.fonts.load('400 1.125rem FrankRuhl')
        ];

        Promise.allSettled(loads).catch(() => { /* best-effort */ });
    },

    mount() {
        if (this.skipped || this.mounted) return;
        this.el = document.getElementById('opening-screen');
        if (!this.el) return;

        this.mounted = true;
        this.mountedAt = performance.now();
        this.el.hidden = false;
        this.el.removeAttribute('aria-hidden');

        this._applyLabels();
        this._mountCorners();

        this._onResize = () => {
            this._fitOpeningTitle();
            this._positionOpeningCopy();
            this._positionSubtitleParts();
        };
        window.addEventListener('resize', this._onResize);

        this.entryNote = this.el.querySelector('.opening-screen__entry-note');
        this.continueBtn = this.entryNote;

        if (this.entryNote) {
            this.entryNote.disabled = true;
            this.entryNote.addEventListener('click', () => this.onContinue());
        }

        this.el.classList.add('is-visible', 'is-art-pending');
        const fadeMs = this.cfg().artFadeDurationMs ?? 600;
        this.el.style.setProperty('--opening-art-fade-duration', `${fadeMs}ms`);
        this.el.style.setProperty('--opening-subtitle-split-gap', this.cfg().subtitleSplitGap ?? '3rem');
        this.el.style.setProperty('--opening-subtitle-second-nudge-x', `${this.cfg().subtitleSecondNudgeX ?? 0}px`);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._fitOpeningTitle();
                this._positionOpeningCopy();
                this._positionSubtitleParts();
                this._startTitleTypewriter();
            });
        });
        this._scheduleArtReadyFallback();
    },

    _scheduleArtReadyFallback() {
        const ms = this.cfg().artReadyFallbackMs ?? 12000;
        clearTimeout(this._revealFallbackTimer);
        this._revealFallbackTimer = setTimeout(() => {
            if (!this.artReady) this.onArtReady();
        }, ms);
    },

    onArtReady() {
        if (this.skipped || this.artReady) return;
        this.artReady = true;
        clearTimeout(this._revealFallbackTimer);
        this._revealFallbackTimer = null;
        this._tryRevealArt();
    },

    _onTitleTyped() {
        if (this.titleTyped) return;
        this.titleTyped = true;
        const title = this.el?.querySelector('.opening-screen__title');
        title?.classList.remove('is-typing', 'is-cursor-wait');
        title?.classList.add('is-title-typed');
        this._tryRevealArt();
    },

    _tryRevealArt() {
        if (!this.artReady || !this.titleTyped || !this.el || this._artRevealScheduled) return;
        this._artRevealScheduled = true;

        const delayMs = this.cfg().artRevealAfterTitleMs ?? 500;
        clearTimeout(this._revealTimer);
        this._revealTimer = setTimeout(() => {
            this.el?.classList.remove('is-art-pending');
            this.el?.classList.add('is-art-ready');

            // Molecules fade first; text layers cascade after a short pause.
            const start = this.cfg().revealStartDelayMs ?? 450;
            clearTimeout(this._contentRevealTimer);
            this._contentRevealTimer = setTimeout(() => this._onArtRevealed(), start);
        }, delayMs);
    },

    // Staggered reveal: subtitle → entry note.
    _onArtRevealed() {
        if (this._contentRevealStarted) return;
        this._contentRevealStarted = true;

        const stagger = this.cfg().revealStaggerMs ?? 420;

        this._stageTimers.forEach(clearTimeout);
        this._stageTimers = [];

        this._stageTimers.push(setTimeout(() => this._revealSubtitle(), stagger));
        this._stageTimers.push(setTimeout(() => this._revealEntryNote(), stagger * 2));
    },

    _revealSubtitle() {
        this.el?.classList.add('is-reveal-subtitle');
    },

    _revealEntryNote() {
        if (!this.entryNote || this.skipped || this.dismissing) return;
        this.entryNote.disabled = false;
        this.entryNote.classList.add('is-ready');
        this._startEntryNoteMotion();
    },

    _entryNoteCfg() {
        return this.cfg().entryNote || {};
    },

    _entryNoteSwayCfg() {
        return this._entryNoteCfg().sway || {};
    },

    _entryNoteRotateDeg() {
        return this._entryNoteCfg().rotateDeg ?? 0;
    },

    _applyEntryNoteTransform(tx, ty) {
        if (!this.entryNote) return;
        const deg = this._entryNoteRotateDeg();
        this.entryNote.style.transform =
            `rotate(${deg}deg) translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
    },

    _entryNoteMotionReduced() {
        const sway = this._entryNoteSwayCfg();
        if (sway.enabled === false) return true;
        return typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    _startEntryNoteMotion() {
        if (!this.entryNote || this._entryNoteMotionReduced()) {
            this._applyEntryNoteTransform(0, 0);
            return;
        }

        const cfg = this._entryNoteSwayCfg();
        const amp = cfg.driftAmp ?? 14;
        const speed = cfg.driftSpeed ?? 0.00022;
        const rand = (min, max) => min + Math.random() * (max - min);

        this._entryNoteMotion = {
            ampX: amp * rand(0.85, 1.15),
            ampY: amp * rand(0.85, 1.15),
            fx: speed * rand(0.75, 1.25),
            fy: speed * rand(0.75, 1.25),
            phaseX: rand(0, Math.PI * 2),
            phaseY: rand(0, Math.PI * 2),
            vx: 0,
            vy: 0,
            pushX: 0,
            pushY: 0,
            hoverStop: 0
        };

        this._bindEntryNotePointer();
        if (this._entryNoteRaf != null) return;

        const tick = (now) => {
            this._entryNoteRaf = requestAnimationFrame(tick);
            this._entryNoteTick(now);
        };
        this._entryNoteRaf = requestAnimationFrame(tick);
    },

    _stopEntryNoteMotion() {
        if (this._entryNoteRaf != null) {
            cancelAnimationFrame(this._entryNoteRaf);
            this._entryNoteRaf = null;
        }
        this._entryNoteMotion = null;
        this._unbindEntryNotePointer();
    },

    _entryNoteTick(now) {
        const cfg = this._entryNoteSwayCfg();
        const m = this._entryNoteMotion;
        const el = this.entryNote;
        if (!el || !m) return;

        if (this._entryNoteHovered) {
            m.hoverStop = Math.min(1, (m.hoverStop ?? 0) + 0.07);
        } else {
            m.hoverStop = Math.max(0, (m.hoverStop ?? 0) - 0.05);
        }

        const driftScale = 1 - (m.hoverStop ?? 0);
        const driftX = m.ampX * Math.sin(now * m.fx + m.phaseX) * driftScale;
        const driftY = m.ampY * Math.sin(now * m.fy + m.phaseY) * driftScale;

        let tvx = 0;
        let tvy = 0;
        const p = this._entryNotePointer;
        if (p.active && driftScale > 0.05) {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2 + m.pushX;
            const cy = rect.top + rect.height / 2 + m.pushY;
            const dx = cx - p.x;
            const dy = cy - p.y;
            const dist = Math.hypot(dx, dy);
            const radius = cfg.repelRadius ?? 180;
            const maxShift = cfg.repelMaxShift ?? 8;
            if (dist < radius && dist > 0.5) {
                const falloff = 1 - dist / radius;
                const strength = maxShift * falloff * falloff;
                tvx = (dx / dist) * strength;
                tvy = (dy / dist) * strength;
            }
        }

        const smooth = cfg.repelSmoothing ?? 0.12;
        const ret = cfg.repelReturn ?? 0.965;
        const hoverStop = m.hoverStop ?? 0;
        m.vx += (tvx - m.vx) * smooth * (1 - hoverStop);
        m.vy += (tvy - m.vy) * smooth * (1 - hoverStop);

        if (hoverStop < 0.98) {
            m.pushX = (m.pushX + m.vx) * ret;
            m.pushY = (m.pushY + m.vy) * ret;
        } else {
            m.vx = 0;
            m.vy = 0;
        }

        this._applyEntryNoteTransform(driftX + m.pushX, driftY + m.pushY);
    },

    _bindEntryNotePointer() {
        if (this._entryNotePointerBound) return;
        this._entryNotePointerBound = true;

        this._boundEntryNoteMove = (e) => {
            this._entryNotePointer.x = e.clientX;
            this._entryNotePointer.y = e.clientY;
            this._entryNotePointer.active = true;
        };
        this._boundEntryNoteLeave = () => { this._entryNotePointer.active = false; };

        window.addEventListener('pointermove', this._boundEntryNoteMove, { passive: true });
        window.addEventListener('pointerleave', this._boundEntryNoteLeave);
        window.addEventListener('blur', this._boundEntryNoteLeave);

        if (this.entryNote) {
            this._boundEntryNoteHoverIn = () => {
                this._entryNoteHovered = true;
            };
            this._boundEntryNoteHoverOut = () => {
                this._entryNoteHovered = false;
            };
            this.entryNote.addEventListener('pointerenter', this._boundEntryNoteHoverIn);
            this.entryNote.addEventListener('pointerleave', this._boundEntryNoteHoverOut);
            this.entryNote.addEventListener('focus', this._boundEntryNoteHoverIn);
            this.entryNote.addEventListener('blur', this._boundEntryNoteHoverOut);
        }
    },

    _unbindEntryNotePointer() {
        if (!this._entryNotePointerBound) return;
        this._entryNotePointerBound = false;
        window.removeEventListener('pointermove', this._boundEntryNoteMove);
        window.removeEventListener('pointerleave', this._boundEntryNoteLeave);
        window.removeEventListener('blur', this._boundEntryNoteLeave);
        if (this.entryNote) {
            if (this._boundEntryNoteHoverIn) {
                this.entryNote.removeEventListener('pointerenter', this._boundEntryNoteHoverIn);
            }
            if (this._boundEntryNoteHoverOut) {
                this.entryNote.removeEventListener('pointerleave', this._boundEntryNoteHoverOut);
                this.entryNote.removeEventListener('blur', this._boundEntryNoteHoverOut);
            }
            this.entryNote.removeEventListener('focus', this._boundEntryNoteHoverIn);
        }
        this._boundEntryNoteMove = null;
        this._boundEntryNoteLeave = null;
        this._boundEntryNoteHoverIn = null;
        this._boundEntryNoteHoverOut = null;
        this._entryNotePointer.active = false;
        this._entryNoteHovered = false;
    },

    _titleLetterGapPx: 0,

    _titleFitCfg() {
        const opening = this.cfg().titleFit || {};
        const about = CONFIG.about || {};
        return {
            fontSizePx: opening.fontSizePx ?? about.titleFontSizePx ?? null,
            minPx: opening.minPx ?? about.titleMinPx ?? 24,
            maxPx: opening.maxPx ?? about.titleMaxPx ?? 400,
            reducePt: opening.reducePt ?? about.titleReducePt ?? 32,
            sizeScale: opening.sizeScale ?? about.titleSizeScale ?? 1,
            letterGapPx: opening.letterGapPx ?? about.titleLetterGapPx ?? 56
        };
    },

    _titleChars() {
        return [...(this._titleFullText || '')];
    },

    _ensureTitleSkeleton(title) {
        const chars = this._titleChars();
        if (!title || !chars.length) return;

        const skeletonKey = chars.join('');
        if (
            title.dataset.titleSkeletonText === skeletonKey
            && title.querySelectorAll('.opening-screen__title-char').length === chars.length
        ) {
            return;
        }

        title.dataset.titleSkeletonText = skeletonKey;
        title.textContent = '';
        const frag = document.createDocumentFragment();

        chars.forEach((ch, index) => {
            const span = document.createElement('span');
            span.className = 'opening-screen__title-char is-pending';
            span.textContent = ch;
            frag.appendChild(span);
            if (index < chars.length - 1) {
                const gap = document.createElement('span');
                gap.className = 'opening-screen__title-gap';
                gap.setAttribute('aria-hidden', 'true');
                frag.appendChild(gap);
            }
        });

        const caret = document.createElement('span');
        caret.className = 'opening-screen__title-cursor';
        caret.setAttribute('aria-hidden', 'true');
        frag.appendChild(caret);
        title.appendChild(frag);
    },

    _positionTitleCaret(title, visibleCount) {
        const caret = title.querySelector('.opening-screen__title-cursor');
        const charEls = title.querySelectorAll('.opening-screen__title-char');
        if (!caret || !charEls.length) return;

        const titleRect = title.getBoundingClientRect();
        let edgeX;

        if (visibleCount >= charEls.length) {
            edgeX = charEls[charEls.length - 1].getBoundingClientRect().left;
        } else {
            edgeX = charEls[visibleCount].getBoundingClientRect().right;
        }

        caret.style.left = `${edgeX - titleRect.left}px`;
    },

    _renderTitleChars(title, visibleCount) {
        if (!title) return;
        this._ensureTitleSkeleton(title);

        title.querySelectorAll('.opening-screen__title-char').forEach((el, index) => {
            el.classList.toggle('is-pending', index >= visibleCount);
        });

        requestAnimationFrame(() => this._positionTitleCaret(title, visibleCount));
    },

    _fitOpeningTitle() {
        const title = this.el?.querySelector('.opening-screen__content .opening-screen__title');
        if (!title) return;

        const text = (this._titleFullText || this.cfg().labels?.title || title.textContent || '').trim();
        if (!text) return;

        const visibleCount = title.querySelectorAll('.opening-screen__title-char:not(.is-pending)').length;
        const cfg = this._titleFitCfg();
        const reducePx = cfg.reducePt * (96 / 72);
        const targetPx = cfg.fontSizePx ?? Math.max(cfg.minPx, (cfg.maxPx - reducePx) * cfg.sizeScale);

        title.style.fontSize = `${targetPx}px`;
        title.style.letterSpacing = '0px';

        const letterGapPx = cfg.letterGapPx;
        this._titleLetterGapPx = letterGapPx;
        title.style.setProperty('--opening-title-gap', `${letterGapPx}px`);
        this.el?.style.setProperty('--opening-title-gap', `${letterGapPx}px`);

        const lineHeight = 0.88;
        this.el?.querySelectorAll('.opening-screen__title').forEach((el) => {
            el.style.fontSize = `${targetPx}px`;
            el.style.minHeight = `${targetPx * lineHeight}px`;
        });

        const phantom = this.el?.querySelector('.opening-screen__title--phantom');
        if (phantom) {
            this._ensureTitleSkeleton(phantom);
            phantom.querySelectorAll('.opening-screen__title-char').forEach((el) => {
                el.classList.remove('is-pending');
            });
        }

        this.el?.style.setProperty('--opening-title-font-size', `${targetPx}px`);
        this.el?.style.setProperty('--opening-title-line-height', String(lineHeight));
        this._renderTitleChars(title, visibleCount);
        this._positionTitleCaret(title, visibleCount);
        if (typeof OpeningBackground !== 'undefined' && OpeningBackground.refitOpeningLayout) {
            OpeningBackground.refitOpeningLayout();
        }
        this._positionOpeningCopy();
        this._positionSubtitleParts();
    },

    _positionSubtitleParts() {
        const title = this.el?.querySelector('.opening-screen__content .opening-screen__title');
        if (!title || !this.el) return;

        const titleWidth = title.getBoundingClientRect().width;
        if (titleWidth <= 0) return;

        this.el.style.setProperty('--opening-title-width', `${titleWidth}px`);

        let maxPartHeight = 0;
        this.el.querySelectorAll('.opening-screen__subtitle').forEach((subtitle) => {
            subtitle.style.width = `${titleWidth}px`;
            subtitle.querySelectorAll(
                '.opening-screen__subtitle-part--first, .opening-screen__subtitle-part--second'
            ).forEach((part) => {
                maxPartHeight = Math.max(maxPartHeight, part.getBoundingClientRect().height);
            });
        });

        if (maxPartHeight > 0) {
            this.el.querySelectorAll('.opening-screen__subtitle').forEach((subtitle) => {
                subtitle.style.minHeight = `${maxPartHeight}px`;
            });
        }
    },

    _positionOpeningCopy() {
        if (!this.el) return;

        const title = this.el.querySelector('.opening-screen__content .opening-screen__title');
        const subtitle = this.el.querySelector('.opening-screen__content .opening-screen__subtitle');
        if (!title) return;

        this.el.style.setProperty('--opening-copy-shift-y', '0px');
        void title.offsetHeight;

        const titleRect = title.getBoundingClientRect();
        const subtitleRect = subtitle?.getBoundingClientRect();
        const top = titleRect.top;
        const bottom = subtitleRect && subtitleRect.height > 0
            ? subtitleRect.bottom
            : titleRect.bottom;
        const shift = (window.innerHeight * 0.5) - ((top + bottom) * 0.5)
            + (this.cfg().copyNudgeY ?? 0);

        this.el.style.setProperty('--opening-copy-shift-y', `${shift}px`);
    },

    _notesEl() {
        return this.el?.querySelector('.opening-screen__notes');
    },

    _notesCfg() {
        return this.cfg().notes || {};
    },

    _noteFitProbe: null,

    _cssVarPx(varName) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return 0;
        if (raw.endsWith('rem')) {
            const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            return n * rootPx;
        }
        return n;
    },

    _getNoteBoxPx() {
        const grid = this._notesCfg().grid || {};
        const cols = grid.cols ?? 3;
        const rows = grid.rows ?? 3;
        const cellW = this._cssVarPx('--site-grid-cell-w');
        const cellH = this._cssVarPx('--site-grid-cell-h');
        const gap = this._cssVarPx('--site-grid-gap');
        return {
            cols,
            rows,
            width: cols * cellW + (cols - 1) * gap,
            height: rows * cellH + (rows - 1) * gap
        };
    },

    _ensureNoteFitProbe() {
        if (this._noteFitProbe) return this._noteFitProbe;
        const probe = document.createElement('p');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = [
            'position:fixed',
            'left:-9999px',
            'top:0',
            'visibility:hidden',
            'margin:0',
            'box-sizing:border-box',
            'padding:var(--space-10)'
        ].join(';');
        document.body.appendChild(probe);
        this._noteFitProbe = probe;
        return probe;
    },

    _fitNoteTextToBox(text) {
        if (!text) return '';

        const box = this._getNoteBoxPx();
        if (box.width <= 0 || box.height <= 0) return text;

        const probe = this._ensureNoteFitProbe();
        probe.className = 'opening-screen__note note-title';
        probe.style.width = `${box.width}px`;
        probe.style.height = `${box.height}px`;
        probe.style.display = 'block';

        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) return '';

        let result = '';
        for (const word of words) {
            const candidate = result ? `${result} ${word}` : word;
            probe.textContent = candidate;
            if (probe.scrollHeight > probe.clientHeight + 1) break;
            result = candidate;
        }

        return result || words[0];
    },

    _applyNotePosition(el, spot) {
        el.style.left = 'auto';
        el.style.right = `${100 - spot.anchorRightPct}%`;
        el.style.top = `${spot.anchorTopPct}%`;
    },

    _notesPlacementCfg() {
        return this._notesCfg().placement || {};
    },

    _notesQuarterBounds() {
        const cfg = this._notesPlacementCfg();
        const m = cfg.marginPct ?? 10;
        const g = cfg.quarterCenterGapPct ?? 4;
        const mid = 50;

        return [
            { xMin: m, xMax: mid - g, yMin: m, yMax: mid - g },
            { xMin: mid + g, xMax: 100 - m, yMin: m, yMax: mid - g },
            { xMin: m, xMax: mid - g, yMin: mid + g, yMax: 100 - m },
            { xMin: mid + g, xMax: 100 - m, yMin: mid + g, yMax: 100 - m }
        ];
    },

    _shuffleIndices(count) {
        const order = Array.from({ length: count }, (_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        return order;
    },

    _getNoteContentKeepOutRect() {
        const pad = this._notesPlacementCfg();
        const padX = pad.titlePadX ?? 56;
        const padY = pad.titlePadY ?? 40;
        const subtitlePadY = pad.subtitlePadY ?? 24;

        const mergeInto = (rect, next) => {
            if (!next) return rect;
            if (!rect) return { ...next };
            return {
                left: Math.min(rect.left, next.left),
                top: Math.min(rect.top, next.top),
                right: Math.max(rect.right, next.right),
                bottom: Math.max(rect.bottom, next.bottom)
            };
        };

        let rect = null;
        const title = this.el?.querySelector('.opening-screen__title');
        const subtitle = this.el?.querySelector('.opening-screen__subtitle');

        if (title) {
            const r = title.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                rect = mergeInto(rect, {
                    left: r.left - padX,
                    top: r.top - padY,
                    right: r.right + padX,
                    bottom: r.bottom + padY
                });
            }
        }

        if (subtitle) {
            const r = subtitle.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                rect = mergeInto(rect, {
                    left: r.left - padX,
                    top: r.top - subtitlePadY,
                    right: r.right + padX,
                    bottom: r.bottom + subtitlePadY
                });
            }
        }

        return rect;
    },

    _noteAnchorBoxPx(anchorRightPct, anchorTopPct) {
        const box = this._getNoteBoxPx();
        const w = window.innerWidth;
        const h = window.innerHeight;
        const right = (anchorRightPct / 100) * w;
        const top = (anchorTopPct / 100) * h;
        return {
            left: right - box.width,
            top,
            right,
            bottom: top + box.height
        };
    },

    _noteAnchorOverlapsKeepOut(anchorRightPct, anchorTopPct, keepOut) {
        if (!keepOut) return false;
        const box = this._noteAnchorBoxPx(anchorRightPct, anchorTopPct);
        return box.left < keepOut.right
            && box.right > keepOut.left
            && box.top < keepOut.bottom
            && box.bottom > keepOut.top;
    },

    _pickNoteAnchorInQuarter(q, keepOut) {
        const cfg = this._notesPlacementCfg();
        const maxAttempts = cfg.maxAttempts ?? 48;
        const box = this._getNoteBoxPx();
        const w = window.innerWidth;
        const h = window.innerHeight;
        const boxWPct = (box.width / w) * 100;
        const boxHPct = (box.height / h) * 100;
        const rightMin = q.xMin + boxWPct;
        const rightMax = q.xMax;
        const topMin = q.yMin;
        const topMax = q.yMax - boxHPct;

        const candidates = [];
        if (rightMin <= rightMax && topMax >= topMin) {
            candidates.push({ anchorRightPct: rightMax, anchorTopPct: topMin });
            candidates.push({ anchorRightPct: rightMin, anchorTopPct: topMin });
            candidates.push({ anchorRightPct: rightMax, anchorTopPct: topMax });
            candidates.push({ anchorRightPct: rightMin, anchorTopPct: topMax });

            for (let i = 0; i < maxAttempts; i++) {
                candidates.push({
                    anchorRightPct: rightMin + Math.random() * (rightMax - rightMin),
                    anchorTopPct: topMin + Math.random() * (topMax - topMin)
                });
            }
        }

        for (const candidate of candidates) {
            if (!this._noteAnchorOverlapsKeepOut(candidate.anchorRightPct, candidate.anchorTopPct, keepOut)) {
                return candidate;
            }
        }

        let best = { anchorRightPct: rightMax, anchorTopPct: topMin };
        let bestDist = -1;
        const cx = keepOut ? (keepOut.left + keepOut.right) / 2 : w / 2;
        const cy = keepOut ? (keepOut.top + keepOut.bottom) / 2 : h / 2;

        for (const candidate of candidates) {
            const boxPx = this._noteAnchorBoxPx(candidate.anchorRightPct, candidate.anchorTopPct);
            const bx = (boxPx.left + boxPx.right) / 2;
            const by = (boxPx.top + boxPx.bottom) / 2;
            const dist = Math.hypot(bx - cx, by - cy);
            if (dist > bestDist) {
                bestDist = dist;
                best = candidate;
            }
        }

        return best;
    },

    _pickNotePositions(count) {
        const quarters = this._notesQuarterBounds();
        const quarterOrder = this._shuffleIndices(quarters.length);
        const keepOut = this._getNoteContentKeepOutRect();

        const placed = [];
        for (let i = 0; i < count; i++) {
            const q = quarters[quarterOrder[i % quarters.length]];
            placed.push(this._pickNoteAnchorInQuarter(q, keepOut));
        }

        return placed;
    },

    _renderNotes() {
        if (this._notesCfg().enabled === false) return;
        if (this._notesRendered) return;

        const host = this._notesEl();
        if (!host) return;

        const items = (this._notesCfg().items || []).filter((item) => item?.text);
        if (!items.length) return;

        this._notesRendered = true;
        host.textContent = '';

        const positions = this._pickNotePositions(items.length);
        const stagger = this._notesCfg().staggerMs ?? 140;

        items.forEach((item, i) => {
            const spot = positions[i];
            const el = document.createElement('p');
            el.className = item.role === 'body'
                ? 'opening-screen__note note-body'
                : 'opening-screen__note note-title';
            el.textContent = this._fitNoteTextToBox(item.text);
            this._applyNotePosition(el, spot);
            host.appendChild(el);

            setTimeout(() => {
                requestAnimationFrame(() => el.classList.add('is-visible'));
            }, i * stagger);
        });
    },

    _clearNotes() {
        if (this._noteFitProbe) {
            this._noteFitProbe.remove();
            this._noteFitProbe = null;
        }
        const host = this._notesEl();
        if (host) host.textContent = '';
        this._notesRendered = false;
    },

    _applyLabels() {
        const labels = this.cfg().labels || {};
        const title = this.el.querySelector('.opening-screen__title');
        const subtitle = this.el.querySelector('.opening-screen__subtitle');
        const entry = this.el.querySelector('.opening-screen__entry-note');
        const entryCfg = this.cfg().entryNote || {};
        if (title) {
            this._titleFullText = labels.title || title.textContent || '';
            title.textContent = '';
            title.setAttribute('aria-label', this._titleFullText);
            this._renderTitleChars(title, 0);
        }
        if (subtitle) this._applySubtitleLabels(labels);
        if (entry) {
            const arrow = entry.querySelector('.opening-screen__entry-note-arrow');
            const hint = entry.querySelector('.opening-screen__entry-note-hint');
            if (arrow) arrow.textContent = entryCfg.arrow ?? '<----';
            if (hint) hint.textContent = entryCfg.hoverLabel ?? 'הבא';
            entry.setAttribute(
                'aria-label',
                entryCfg.ariaLabel ?? entryCfg.hoverLabel ?? 'הבא'
            );
            entry.style.setProperty('--opening-entry-rotate', `${entryCfg.rotateDeg ?? 0}deg`);
            entry.style.setProperty('--opening-entry-offset-x', `${entryCfg.offsetX ?? 0}px`);
            entry.style.setProperty('--opening-entry-offset-y', `${entryCfg.offsetY ?? 0}px`);
        }
    },

    _applySubtitleLabels(labels = {}) {
        const first = labels.subtitleFirst
            ?? (labels.subtitle ? labels.subtitle.split(/\.\s+(?=המילים)/)[0] + '.' : '');
        const second = labels.subtitleSecond
            ?? (labels.subtitle ? labels.subtitle.split(/\.\s+(?=המילים)/).slice(1).join('').trim() : '');

        this.el?.querySelectorAll('.opening-screen__subtitle').forEach((subtitle) => {
            const firstEl = subtitle.querySelector('.opening-screen__subtitle-part--first');
            const secondEl = subtitle.querySelector('.opening-screen__subtitle-part--second');
            if (firstEl && first) firstEl.textContent = first;
            if (secondEl && second) secondEl.textContent = second;
            if (!firstEl && !secondEl && labels.subtitle) subtitle.textContent = labels.subtitle;
        });
    },

    _cancelTitleTypewriter() {
        this._titleTypewriterGen += 1;
        if (this._titleTypewriterTimer !== null) {
            clearTimeout(this._titleTypewriterTimer);
            this._titleTypewriterTimer = null;
        }
    },

    _startTitleTypewriter() {
        const title = this.el?.querySelector('.opening-screen__title');
        const text = this._titleFullText || this.cfg().labels?.title || '';
        if (!title || !text) return;

        this._cancelTitleTypewriter();
        this.titleTyped = false;
        title.classList.remove('is-title-typed', 'is-typing');
        title.classList.add('is-cursor-wait');
        this._renderTitleChars(title, 0);

        const generation = this._titleTypewriterGen;
        const cursorWaitMs = this.cfg().titleCursorWaitMs ?? 1800;
        const msPerChar = this.cfg().titleTypewriterMsPerChar ?? 320;

        this._titleTypewriterTimer = setTimeout(() => {
            this._titleTypewriterTimer = null;
            if (generation !== this._titleTypewriterGen) return;

            title.classList.remove('is-cursor-wait');
            title.classList.add('is-typing');

            let index = 0;
            const step = () => {
                if (generation !== this._titleTypewriterGen) return;
                index += 1;
                this._renderTitleChars(title, index);
                if (index < text.length) {
                    this._titleTypewriterTimer = setTimeout(step, msPerChar);
                } else {
                    this._titleTypewriterTimer = null;
                    this._onTitleTyped();
                }
            };
            step();
        }, cursorWaitMs);
    },

    _mountCorners() {
        const host = this.el.querySelector('.opening-screen__corners');
        if (!host) return;
        ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
            const mark = document.createElement('span');
            mark.className = `opening-screen__corner opening-screen__corner--${corner}`;
            mark.setAttribute('aria-hidden', 'true');
            host.appendChild(mark);
        });
    },

    onDataReady() {
        this.dataReady = true;

        if (this.skipped) return;

        const art = this.el?.querySelector('.opening-screen__art');
        if (art && typeof OpeningBackground !== 'undefined') {
            if (!this._artMounted) {
                OpeningBackground.mount(art);
                this._artMounted = true;
            }
            OpeningBackground.onDataReady();
        }

        if (this.userDismissed && !this.bootFlushed) {
            this._enterSite();
            return;
        }

        if (this._contentRevealStarted) {
            this._revealEntryNote();
        } else if (this.el?.classList.contains('is-art-ready')) {
            this._onArtRevealed();
        }
    },

    onContinue() {
        if (this.dismissing || this.skipped) return;
        if (this.entryNote?.disabled) return;
        this.dismiss();
    },

    dismiss() {
        if (this.dismissing || this.skipped) return;
        this.dismissing = true;
        this.userDismissed = true;
        this._cancelTitleTypewriter();
        this._stopEntryNoteMotion();
        this._clearNotes();
        this._stageTimers.forEach(clearTimeout);
        this._stageTimers = [];
        clearTimeout(this._contentRevealTimer);
        this._contentRevealTimer = null;
        clearTimeout(this._revealFallbackTimer);
        this._revealFallbackTimer = null;
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }

        this._playExitTransition(() => {
            this.el?.classList.remove('is-cover-expanding');
            document.body.classList.remove('opening-active');
            this.el?.classList.remove('is-visible', 'is-exiting');
            if (this.el) {
                this.el.hidden = true;
                this.el.setAttribute('aria-hidden', 'true');
            }
            this._enterSite();
        });
    },

    _snapCoverFullScreen(cover) {
        cover.style.transition = 'none';
        cover.style.left = '0';
        cover.style.top = '0';
        cover.style.right = '0';
        cover.style.bottom = '0';
        cover.style.width = 'auto';
        cover.style.height = 'auto';
        cover.style.transform = 'none';
        cover.style.borderRadius = '0';
        cover.classList.remove('screen-transition-cover--pill', 'screen-transition-cover--note');
        void cover.offsetWidth;
    },

    _playExitTransition(done) {
        const cfg = this.cfg().screenTransition || {};
        const expandMs = cfg.expandMs ?? this.cfg().exitDurationMs ?? 600;
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.el?.classList.add('is-exiting', 'is-cover-expanding');

        let startLeft = w * 0.5 - 60;
        let startBottom = h * 0.5 - 22;
        let startW = 120;
        let startH = 44;
        let startRadius = 5;

        const note = this.entryNote;
        if (note) {
            const r = note.getBoundingClientRect();
            startLeft = r.left;
            startBottom = h - r.bottom;
            startW = Math.max(1, r.width);
            startH = Math.max(1, r.height);
            const br = parseFloat(getComputedStyle(note).borderRadius);
            startRadius = Number.isFinite(br) && br > 0 ? br : 5;
            note.style.visibility = 'hidden';
        }

        try { sessionStorage.setItem('screenTransition', '1'); } catch (_) { /* ignore */ }

        const cover = document.createElement('div');
        cover.className = 'screen-transition-cover screen-transition-cover--note';
        cover.setAttribute('aria-hidden', 'true');
        cover.style.left = `${startLeft}px`;
        cover.style.bottom = `${startBottom}px`;
        cover.style.top = 'auto';
        cover.style.width = `${startW}px`;
        cover.style.height = `${startH}px`;
        cover.style.borderRadius = `${startRadius}px`;
        document.body.appendChild(cover);

        void cover.offsetWidth;
        const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
        cover.style.transition = [
            `left ${expandMs}ms ${easing}`,
            `bottom ${expandMs}ms ${easing}`,
            `width ${expandMs}ms ${easing}`,
            `height ${expandMs}ms ${easing}`,
            `border-radius ${expandMs}ms ${easing}`
        ].join(', ');
        cover.style.left = '0';
        cover.style.bottom = '0';
        cover.style.width = '100%';
        cover.style.height = '100%';
        cover.style.borderRadius = '0';

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            this._snapCoverFullScreen(cover);
            done();
        };
        setTimeout(finish, expandMs + 80);
    },

    _enterSite() {
        if (this.bootFlushed) return;
        this.bootFlushed = true;

        let target = this.cfg().entryTarget || 'experience.html';
        if (typeof ShowReel !== 'undefined' && ShowReel.consumeAutoEnterFlag()) {
            const sep = target.includes('?') ? '&' : '?';
            target += `${sep}showReel=autostart`;
        }
        window.location.assign(target);
    }
};
