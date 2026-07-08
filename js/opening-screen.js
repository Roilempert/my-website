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
    continueEnabledAt: 0,
    mountedAt: 0,
    _enableTimer: null,
    _revealTimer: null,
    _revealFallbackTimer: null,
    _titleFullText: '',
    _titleTypewriterTimer: null,
    _titleTypewriterGen: 0,
    titleTyped: false,
    _artMounted: false,
    _warmupStarted: false,
    _preloadStarted: false,
    _onResize: null,
    _miniTitleTimer: null,
    _miniTitleIndex: -1,

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

        this._onResize = () => this._fitOpeningTitle();
        window.addEventListener('resize', this._onResize);

        this.continueBtn = this.el.querySelector('.opening-screen__continue');

        if (this.continueBtn) {
            this.continueBtn.disabled = true;
            this.continueBtn.addEventListener('click', () => this.onContinue());
        }

        this.el.classList.add('is-visible', 'is-art-pending');
        const fadeMs = this.cfg().artFadeDurationMs ?? 600;
        this.el.style.setProperty('--opening-art-fade-duration', `${fadeMs}ms`);

        requestAnimationFrame(() => {
            this._fitOpeningTitle();
            this._startTitleTypewriter();
        });
        this._scheduleContinueEnable();
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
        this._startMiniTitleRotation();
        this._tryRevealArt();
    },

    _tryRevealArt() {
        if (!this.artReady || !this.titleTyped || !this.el) return;

        const delayMs = this.cfg().artRevealAfterTitleMs ?? 500;
        clearTimeout(this._revealTimer);
        this._revealTimer = setTimeout(() => {
            this.el?.classList.remove('is-art-pending');
            this.el?.classList.add('is-art-ready');
            this._onArtRevealed();
        }, delayMs);
    },

    _onArtRevealed() {
        this.continueEnabledAt = performance.now() + (this.cfg().minDisplayMs ?? 600);
        this._tryEnableContinue();
    },

    _scheduleContinueEnable() {
        const minMs = this.cfg().minDisplayMs ?? 600;
        this.continueEnabledAt = performance.now() + minMs;
        clearTimeout(this._enableTimer);
        this._enableTimer = setTimeout(() => this._tryEnableContinue(), minMs);
    },

    _tryEnableContinue() {
        if (!this.continueBtn || this.skipped || this.dismissing) return;
        if (!this.artReady || !this.titleTyped) return;
        if (!this.el?.classList.contains('is-art-ready')) return;
        if (performance.now() < this.continueEnabledAt) {
            clearTimeout(this._enableTimer);
            this._enableTimer = setTimeout(
                () => this._tryEnableContinue(),
                Math.max(0, this.continueEnabledAt - performance.now())
            );
            return;
        }
        this.continueBtn.disabled = false;
        this.continueBtn.classList.add('is-ready');
    },

    _titleFitCfg() {
        const opening = this.cfg().titleFit || {};
        const about = CONFIG.about || {};
        return {
            minPx: opening.minPx ?? about.titleMinPx ?? 24,
            maxPx: opening.maxPx ?? about.titleMaxPx ?? 400,
            reducePt: opening.reducePt ?? about.titleReducePt ?? 20
        };
    },

    _titleChars() {
        return [...(this._titleFullText || '')];
    },

    _renderTitleChars(title, visibleCount) {
        const chars = this._titleChars();
        if (!title || !chars.length) return;

        title.textContent = '';
        const frag = document.createDocumentFragment();

        // Zero-width caret placed at the current typing boundary. It never
        // occupies layout width, so revealing letters or hiding it at the end
        // causes no reflow, and it always sits next to the letter being typed.
        const caret = document.createElement('span');
        caret.className = 'opening-screen__title-cursor';
        caret.setAttribute('aria-hidden', 'true');

        chars.forEach((ch, index) => {
            if (index === visibleCount) frag.appendChild(caret);
            const span = document.createElement('span');
            span.className = 'opening-screen__title-char';
            span.textContent = ch;
            if (index >= visibleCount) span.classList.add('is-pending');
            frag.appendChild(span);
        });
        if (visibleCount >= chars.length) frag.appendChild(caret);

        title.appendChild(frag);
    },

    _fitOpeningTitle() {
        const title = this.el?.querySelector('.opening-screen__title');
        if (!title) return;

        const text = (this._titleFullText || this.cfg().labels?.title || title.textContent || '').trim();
        if (!text) return;

        const visibleCount = title.querySelectorAll('.opening-screen__title-char:not(.is-pending)').length;
        title.textContent = text;
        title.style.fontSize = '';
        title.style.letterSpacing = '0px';

        const { minPx, maxPx, reducePt } = this._titleFitCfg();
        const reducePx = reducePt * (96 / 72);
        const maxWidth = title.clientWidth;
        if (maxWidth <= 0) {
            this._renderTitleChars(title, visibleCount);
            return;
        }

        let lo = minPx;
        let hi = maxPx;
        let best = minPx;

        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            title.style.fontSize = `${mid}px`;
            title.style.letterSpacing = '0px';
            if (title.scrollWidth <= maxWidth) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        const targetPx = Math.max(minPx, best - reducePx);
        title.style.fontSize = `${targetPx}px`;
        title.style.letterSpacing = '0px';

        const units = [...text].length;
        if (units > 1) {
            const naturalWidth = title.scrollWidth;
            if (naturalWidth < maxWidth) {
                title.style.letterSpacing = `${(maxWidth - naturalWidth) / (units - 1)}px`;
            }
        }

        title.textContent = text;

        const lineHeight = 0.88;
        title.style.minHeight = `${targetPx * lineHeight}px`;
        this.el?.style.setProperty('--opening-title-font-size', `${targetPx}px`);
        this.el?.style.setProperty('--opening-title-line-height', String(lineHeight));
        this._renderTitleChars(title, visibleCount);
        if (typeof OpeningBackground !== 'undefined' && OpeningBackground.refitOpeningLayout) {
            OpeningBackground.refitOpeningLayout();
        }
    },

    _miniTitleEl() {
        return this.el?.querySelector('.opening-screen__mini-title');
    },

    _miniTitleCfg() {
        return this.cfg().miniTitle || {};
    },

    _miniTitleMeasureCtx: null,

    _getMiniTitleMeasureCtx() {
        if (!this._miniTitleMeasureCtx) {
            const canvas = document.createElement('canvas');
            this._miniTitleMeasureCtx = canvas.getContext('2d');
        }
        return this._miniTitleMeasureCtx;
    },

    _getMiniTitleFont() {
        const root = getComputedStyle(document.documentElement);
        const weight = root.getPropertyValue('--type-display-weight').trim() || '400';
        const size = root.getPropertyValue('--type-display-size').trim() || '1.6667rem';
        const family = root.getPropertyValue('--type-family-note-h').trim() || 'TheBasics-Dots, sans-serif';
        return `normal ${weight} ${size} ${family}`;
    },

    _getMiniTitleMaxWidthPx() {
        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        return Math.min(28 * rootPx, window.innerWidth * 0.42);
    },

    _miniTitleQuarter: -1,

    _miniTitleQuarters() {
        return [
            { x: 28, y: 30 },
            { x: 72, y: 30 },
            { x: 28, y: 70 },
            { x: 72, y: 70 }
        ];
    },

    _placeMiniTitleRandomly(el) {
        if (!el) return;
        const quarters = this._miniTitleQuarters();
        let next = Math.floor(Math.random() * quarters.length);
        if (next === this._miniTitleQuarter && quarters.length > 1) {
            next = (next + 1) % quarters.length;
        }
        this._miniTitleQuarter = next;

        const q = quarters[next];
        el.style.left = `${q.x}%`;
        el.style.top = `${q.y}%`;
        el.style.transform = 'translate(-50%, -50%)';
    },

    _fitMiniTitleToWidth(text, maxWidth) {
        if (!text || maxWidth <= 0) return text || '';

        const ctx = this._getMiniTitleMeasureCtx();
        ctx.font = this._getMiniTitleFont();

        if (ctx.measureText(text).width <= maxWidth) return text;

        const words = text.split(/\s+/).filter(Boolean);
        let result = '';
        for (const word of words) {
            const candidate = result ? `${result} ${word}` : word;
            if (ctx.measureText(candidate).width > maxWidth) break;
            result = candidate;
        }

        return result || words[0] || '';
    },

    _pickRandomHoverLine() {
        const lines = OpeningData?.hoverLines || [];
        if (!lines.length) return null;
        if (lines.length === 1) return lines[0];

        let next = Math.floor(Math.random() * lines.length);
        if (next === this._miniTitleIndex) {
            next = (next + 1) % lines.length;
        }
        this._miniTitleIndex = next;
        return lines[next];
    },

    _setMiniTitle(hover) {
        const el = this._miniTitleEl();
        if (!el) return;

        if (!hover?.text) {
            el.textContent = '';
            el.classList.remove('is-visible', 'note-title', 'note-body');
            el.hidden = true;
            return;
        }

        el.hidden = false;
        el.classList.toggle('note-title', hover.role !== 'body');
        el.classList.toggle('note-body', hover.role === 'body');
        const maxWidth = this._getMiniTitleMaxWidthPx();
        el.textContent = this._fitMiniTitleToWidth(hover.text, maxWidth);
        this._placeMiniTitleRandomly(el);
        el.classList.add('is-visible');
    },

    _showMiniTitle() {
        if (this._miniTitleCfg().enabled === false) return;
        this._setMiniTitle(this._pickRandomHoverLine());
    },

    _startMiniTitleRotation() {
        if (this._miniTitleCfg().enabled === false) return;

        clearInterval(this._miniTitleTimer);
        this._showMiniTitle();

        const rotateMs = this._miniTitleCfg().rotateMs ?? 4500;
        if (rotateMs > 0) {
            this._miniTitleTimer = setInterval(() => this._showMiniTitle(), rotateMs);
        }
    },

    _stopMiniTitleRotation() {
        clearInterval(this._miniTitleTimer);
        this._miniTitleTimer = null;
    },

    _applyLabels() {
        const labels = this.cfg().labels || {};
        const title = this.el.querySelector('.opening-screen__title');
        const subtitle = this.el.querySelector('.opening-screen__subtitle');
        const btn = this.el.querySelector('.opening-screen__continue');
        if (title) {
            this._titleFullText = labels.title || title.textContent || '';
            title.textContent = '';
            title.setAttribute('aria-label', this._titleFullText);
            this._renderTitleChars(title, 0);
        }
        if (subtitle && labels.subtitle) subtitle.textContent = labels.subtitle;
        if (btn && labels.continue) {
            btn.textContent = labels.continue;
            btn.setAttribute('aria-label', labels.continue);
        }
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

        if (this.titleTyped) this._startMiniTitleRotation();

        if (this.userDismissed && !this.bootFlushed) {
            this._enterSite();
        }
    },

    onContinue() {
        if (this.dismissing || this.skipped) return;
        if (this.continueBtn?.disabled) return;
        this.dismiss();
    },

    dismiss() {
        if (this.dismissing || this.skipped) return;
        this.dismissing = true;
        this.userDismissed = true;
        this._cancelTitleTypewriter();
        this._stopMiniTitleRotation();
        clearTimeout(this._revealFallbackTimer);
        this._revealFallbackTimer = null;
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }

        const exitMs = this.cfg().exitDurationMs ?? 600;
        this.el?.classList.add('is-exiting');

        setTimeout(() => {
            document.body.classList.remove('opening-active');
            this.el?.classList.remove('is-visible', 'is-exiting');
            if (this.el) {
                this.el.hidden = true;
                this.el.setAttribute('aria-hidden', 'true');
            }

            this._enterSite();
        }, exitMs);
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
