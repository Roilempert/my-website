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
    _onResize: null,

    cfg() {
        return CONFIG.about || {};
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
                    <h2 class="site-about__headline main-t" dir="rtl">${mainTitle}</h2>
                    ${logoHtml}
                    <div class="site-about__text general-t" dir="rtl">${bodyHtml}</div>
                    <div class="site-about__details" dir="rtl">${detailsHtml}</div>
                </div>
            </section>
        `;

        this.sheet.appendChild(this.trigger);
        this.sheet.appendChild(this.panel);
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

        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this._progress > 0) {
                e.preventDefault();
                this.close();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);

        this._onResize = () => {
            const wasOpen = this.isOpen;
            this._measureDimensions();
            this._fitMainTitle();
            this._progress = wasOpen ? 1 : 0;
            this._applyProgress(false);
        };
        window.addEventListener('resize', this._onResize);

        requestAnimationFrame(() => {
            this._measureDimensions();
            this._fitMainTitle();
            this._applyProgress(false);
        });
    },

    _fitMainTitle() {
        const headline = this.panel?.querySelector('.site-about__headline');
        if (!headline) return;

        headline.style.fontSize = '';
        headline.style.letterSpacing = '0px';

        const minPx = this.cfg().titleMinPx ?? 24;
        const maxPx = this.cfg().titleMaxPx ?? 400;
        const reducePt = this.cfg().titleReducePt ?? 12;
        const reducePx = reducePt * (96 / 72);
        const spacingBoost = this.cfg().titleLetterSpacingBoost ?? 1.55;
        const maxWidth = headline.clientWidth;
        if (maxWidth <= 0) return;

        let lo = minPx;
        let hi = maxPx;
        let best = minPx;

        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            headline.style.fontSize = `${mid}px`;
            headline.style.letterSpacing = '0px';
            if (headline.scrollWidth <= maxWidth) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        const targetPx = Math.max(minPx, best - reducePx);
        headline.style.fontSize = `${targetPx}px`;
        headline.style.letterSpacing = '0px';

        const text = (headline.textContent || '').trim();
        const units = [...text].length;
        if (units <= 1) return;

        const naturalWidth = headline.scrollWidth;
        if (naturalWidth >= maxWidth) return;

        headline.style.letterSpacing = `${((maxWidth - naturalWidth) / (units - 1)) * spacingBoost}px`;
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
        this._openHeight = Math.round(Math.min(Math.max(target, vhFallback), configMax, viewportCap));
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
        const textCols = this.cfg().textCols ?? 6;
        const detailsCols = this.cfg().detailsCols ?? 5;
        const logoStart = 1;
        const detailsStart = logoCols + 1;
        const textStart = detailsStart + detailsCols;

        this.root?.style.setProperty('--site-about-logo-cols', String(logoCols));
        this.root?.style.setProperty('--site-about-logo-col-start', String(logoStart));
        this.root?.style.setProperty('--site-about-text-cols', String(textCols));
        this.root?.style.setProperty('--site-about-text-col-start', String(textStart));
        this.root?.style.setProperty('--site-about-details-cols', String(detailsCols));
        this.root?.style.setProperty('--site-about-details-col-start', String(detailsStart));
    },

    _measureOpenLift() {
        this._openLift = Math.max(0, Math.round(
            (window.innerHeight + this._openHeight - this._tabHeight) / 2
        ));
    },

    _dragTravel() {
        return this._openLift || 1;
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

    _applyProgress(animate) {
        if (!this.root) return;

        const lift = this._progress * this._openLift;
        this.root.style.setProperty('--site-about-lift', `${lift}px`);
        this.root.style.setProperty('--site-about-progress', String(this._progress));
        this.isOpen = this._progress >= 1;

        this.root.classList.toggle('is-open', this.isOpen);
        this.root.classList.toggle('is-revealed', this._progress > 0);
        this.root.classList.toggle('is-snap', !!animate);

        this.backdrop?.setAttribute('aria-hidden', this._progress <= 0 ? 'true' : 'false');
        this.trigger?.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
        this.panel?.setAttribute('aria-hidden', this._progress <= 0 ? 'true' : 'false');
        document.body.classList.toggle('is-site-about-open', this._progress > 0);

        if (this._progress > 0) {
            requestAnimationFrame(() => this._fitMainTitle());
        }
    }
};
