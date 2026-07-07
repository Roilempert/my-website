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
            document.fonts.load('400 2rem TheBasicsDots'),
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

        this.continueBtn = this.el.querySelector('.opening-screen__continue');

        if (this.continueBtn) {
            this.continueBtn.disabled = true;
            this.continueBtn.addEventListener('click', () => this.onContinue());
        }

        this.el.classList.add('is-visible', 'is-art-pending');
        const fadeMs = this.cfg().artFadeDurationMs ?? 600;
        this.el.style.setProperty('--opening-art-fade-duration', `${fadeMs}ms`);
        this._startTitleTypewriter();
        this._scheduleContinueEnable();
    },

    onArtReady() {
        if (this.skipped || this.artReady) return;
        this.artReady = true;
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

    _applyLabels() {
        const labels = this.cfg().labels || {};
        const title = this.el.querySelector('.opening-screen__title');
        const subtitle = this.el.querySelector('.opening-screen__subtitle');
        const btn = this.el.querySelector('.opening-screen__continue');
        if (title) {
            this._titleFullText = labels.title || title.textContent || '';
            title.textContent = '';
            title.setAttribute('aria-label', this._titleFullText);
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
        title.textContent = '';
        title.classList.remove('is-title-typed', 'is-typing');
        title.classList.add('is-cursor-wait');

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
                title.textContent = text.slice(0, index);
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
