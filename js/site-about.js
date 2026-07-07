/* ==========================================================================
   Site About — bottom-center pull-up sheet (opening + Experience 1)
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

    init() {
        if (this.root) return;

        const label = this.cfg().label || 'על הפרויקט';
        const bodyHtml = this.cfg().bodyHtml || '';
        const logoSrc = this.cfg().logoSrc || '';
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
            <section class="artifact-inspector-metadata site-about__metadata">
                <div class="artifact-inspector-metadata__scroll-glyphs" aria-hidden="true">
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                </div>
                <div class="site-about__body general-t" dir="rtl">${bodyHtml}</div>
                ${logoHtml}
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
            this._measureOpenHeight();
            this._measureTabHeight();
            this._progress = wasOpen ? 1 : 0;
            this._applyProgress(false);
        };
        window.addEventListener('resize', this._onResize);

        requestAnimationFrame(() => {
            this._measureOpenHeight();
            this._measureTabHeight();
            this._applyProgress(false);
        });
    },

    _measureOpenHeight() {
        const vh = this.cfg().openHeightVh ?? 65;
        const maxPx = this.cfg().openMaxPx ?? 640;
        this._openHeight = Math.round(Math.min(window.innerHeight * (vh / 100), maxPx));
        this.root?.style.setProperty('--site-about-open-height', `${this._openHeight}px`);
    },

    _measureTabHeight() {
        if (!this.trigger) return;
        const h = Math.ceil(this.trigger.getBoundingClientRect().height);
        this._tabHeight = h > 0 ? h : 40;
        this.root?.style.setProperty('--site-about-tab-h', `${this._tabHeight}px`);

        const cols = this.cfg().panelCols ?? 12;
        this.root?.style.setProperty(
            '--site-about-panel-width',
            `calc(${cols} * var(--site-grid-cell-w) + ${Math.max(0, cols - 1)} * var(--site-grid-gap))`
        );
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

        const travel = this._openHeight || 1;
        this._progress = Math.min(1, Math.max(0, this._dragStartProgress + dy / travel));
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

        const lift = this._progress * this._openHeight;
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
    }
};
