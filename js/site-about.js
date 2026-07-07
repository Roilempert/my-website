/* ==========================================================================
   Site About — top-left hover panel (opening + Experience 1)
   ========================================================================== */
const SiteAbout = {
    root: null,
    trigger: null,
    panel: null,
    isOpen: false,
    isPinned: false,
    _closeTimer: null,
    _closeDelayMs: 120,

    cfg() {
        return CONFIG.about || {};
    },

    init() {
        if (this.root) return;

        const label = this.cfg().label || 'על הפרויקט';
        const bodyHtml = this.cfg().bodyHtml || '';

        this.root = document.createElement('div');
        this.root.className = 'site-about';
        this.root.dataset.siteLayer = 'about';

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
            </section>
        `;

        this.root.appendChild(this.trigger);
        this.root.appendChild(this.panel);
        document.body.appendChild(this.root);

        this.root.addEventListener('mouseenter', () => this._onPointerEnter());
        this.root.addEventListener('mouseleave', () => this._onPointerLeave());
        this.trigger.addEventListener('click', (e) => this._onTriggerClick(e));
        this.trigger.addEventListener('keydown', (e) => this._onTriggerKeyDown(e));

        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                e.preventDefault();
                this.close(true);
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
    },

    _clearCloseTimer() {
        if (this._closeTimer !== null) {
            clearTimeout(this._closeTimer);
            this._closeTimer = null;
        }
    },

    _onPointerEnter() {
        this._clearCloseTimer();
        this.open();
    },

    _onPointerLeave() {
        if (this.isPinned) return;
        this._clearCloseTimer();
        this._closeTimer = setTimeout(() => {
            this._closeTimer = null;
            if (!this.isPinned) this.close();
        }, this._closeDelayMs);
    },

    _onTriggerClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.isPinned && this.isOpen) {
            this.close(true);
            return;
        }
        this.isPinned = true;
        this.open();
    },

    _onTriggerKeyDown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._onTriggerClick(e);
        }
    },

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.syncState();
    },

    close(unpin = false) {
        if (unpin) this.isPinned = false;
        if (!this.isOpen) return;
        this.isOpen = false;
        this.syncState();
    },

    syncState() {
        this.root?.classList.toggle('is-open', this.isOpen);
        this.trigger?.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
        this.panel?.setAttribute('aria-hidden', this.isOpen ? 'false' : 'true');
        document.body.classList.toggle('is-site-about-open', this.isOpen);
    }
};
