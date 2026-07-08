/* ==========================================================================
   NOTE ID STICKY — focus inspector only; L2 grid IDs stay fixed on card
   JS corridor clamp (top m / bottom m); release when card leaves scrollport.
   ========================================================================== */
const NoteIdSticky = {
    _panel: null,
    _onPanelScroll: null,
    _onGlobalSync: null,
    _minHeightProbe: null,
    _inited: false,

    init() {
        if (this._inited) return;
        this._inited = true;

        this.clearGridStickyState();

        this._onGlobalSync = () => this.syncAll();
        window.addEventListener('scroll', this._onGlobalSync, { passive: true, capture: true });
        window.addEventListener('resize', this._onGlobalSync, { passive: true });
    },

    isFocusCard(card) {
        return !!card?.closest(
            '.artifact-inspector-panel, .artifact-inspector-flyer, .artifact-inspector-card-measure-probe'
        );
    },

    clearGridStickyState(root = document.getElementById('app')) {
        if (!root) return;
        root.querySelectorAll('.micro-mock__card.note-card').forEach((card) => {
            card.classList.remove('is-note-id-sticky-enabled', 'is-note-id-viewport-track');
            card.querySelector('.note-idcode')?.style.removeProperty('transform');
        });
    },

    measureMinCardHeightPx() {
        if (!this._minHeightProbe) {
            this._minHeightProbe = document.createElement('div');
            this._minHeightProbe.setAttribute('aria-hidden', 'true');
            this._minHeightProbe.style.cssText = [
                'position:fixed',
                'visibility:hidden',
                'pointer-events:none',
                'top:0',
                'left:0',
                'height:var(--site-micro-note-min-height)'
            ].join(';');
            document.body.appendChild(this._minHeightProbe);
        }
        return this._minHeightProbe.getBoundingClientRect().height;
    },

    isStickyEligible(card) {
        if (!card) return false;
        const minH = this.measureMinCardHeightPx();
        if (!Number.isFinite(minH) || minH <= 0) return false;
        return card.offsetHeight > minH + 2;
    },

    findScroller(card) {
        const panel = card?.closest('.artifact-inspector-panel');
        if (panel) return panel;
        return document.documentElement;
    },

    getScrollerRect(scroller) {
        if (scroller === document.documentElement) {
            return {
                top: 0,
                bottom: window.innerHeight,
                left: 0,
                right: window.innerWidth
            };
        }
        return scroller.getBoundingClientRect();
    },

    measureNaturalTop(id) {
        const prev = id.style.transform;
        id.style.transform = 'none';
        const top = id.getBoundingClientRect().top;
        id.style.transform = prev;
        return top;
    },

    getAncestorScaleY(el) {
        let node = el?.parentElement;
        while (node) {
            const transform = getComputedStyle(node).transform;
            if (transform && transform !== 'none') {
                const matrix = new DOMMatrix(transform);
                if (Math.abs(matrix.a - 1) > 0.001 || Math.abs(matrix.d - 1) > 0.001) {
                    return matrix.a;
                }
            }
            node = node.parentElement;
        }
        return 1;
    },

    refreshCard(card) {
        if (!card?.classList.contains('note-card')) return;

        if (!this.isFocusCard(card)) {
            card.classList.remove('is-note-id-sticky-enabled', 'is-note-id-viewport-track');
            card.querySelector('.note-idcode')?.style.removeProperty('transform');
            return;
        }

        const enabled = this.isStickyEligible(card);
        card.classList.toggle('is-note-id-sticky-enabled', enabled);
        card.classList.remove('is-note-id-viewport-track');

        const id = card.querySelector('.note-idcode');
        if (!enabled && id) {
            id.style.removeProperty('transform');
        }
    },

    refreshAllCards(root = document) {
        root.querySelectorAll('.micro-mock__card.note-card').forEach((card) => {
            this.refreshCard(card);
        });
    },

    bindFocusPanel(panel) {
        this.unbindFocusPanel();
        if (!panel) return;

        this._panel = panel;
        this._onPanelScroll = () => this.syncAll();
        panel.addEventListener('scroll', this._onPanelScroll, { passive: true });
        this.refreshAllCards(panel);
        this.syncAll();
    },

    unbindFocusPanel() {
        if (this._panel && this._onPanelScroll) {
            this._panel.removeEventListener('scroll', this._onPanelScroll);
        }
        this._panel = null;
        this._onPanelScroll = null;
    },

    resetFocusIds(root = document) {
        root.querySelectorAll('.micro-mock__card .note-idcode').forEach((id) => {
            id.style.removeProperty('transform');
        });
    },

    syncAll() {
        const focusRoots = [this._panel, document.querySelector('.artifact-inspector-flyer')].filter(Boolean);
        focusRoots.forEach((root) => this.refreshAllCards(root));

        document.querySelectorAll(
            '.artifact-inspector-panel .micro-mock__card.is-note-id-sticky-enabled, ' +
            '.artifact-inspector-flyer .micro-mock__card.is-note-id-sticky-enabled, ' +
            '.artifact-inspector-card-measure-probe .micro-mock__card.is-note-id-sticky-enabled'
        ).forEach((card) => {
            this.syncStickyCard(card, this.findScroller(card));
        });
    },

    syncFocusPanel() {
        this.syncAll();
    },

    syncStickyCard(card, scroller) {
        const id = card?.querySelector('.note-idcode');
        const rail = card?.querySelector('.note-id-rail');
        if (!id || !rail || !scroller) return;

        if (!this.isFocusCard(card) || !card.classList.contains('is-note-id-sticky-enabled')) {
            id.style.removeProperty('transform');
            return;
        }

        const railStyle = getComputedStyle(rail);
        const scale = this.getAncestorScaleY(card);
        const padTop = (parseFloat(railStyle.paddingTop) || 0) * scale;
        const padBottom = (parseFloat(railStyle.paddingBottom) || 0) * scale;

        const naturalTop = this.measureNaturalTop(id);
        const idRect = id.getBoundingClientRect();
        const idHeight = idRect.height;
        const railRect = rail.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        if (railRect.height <= 0 || idHeight <= 0) return;

        const scrollerRect = this.getScrollerRect(scroller);
        const corridorTop = railRect.top + padTop;
        const corridorBottom = railRect.bottom - padBottom;
        const maxY = corridorBottom - idHeight;

        // Card lane not in scrollport — ID rides with note, no synthetic offset.
        if (
            corridorBottom < scrollerRect.top ||
            corridorTop > scrollerRect.bottom ||
            cardRect.right < scrollerRect.left ||
            cardRect.left > scrollerRect.right
        ) {
            id.style.removeProperty('transform');
            return;
        }

        const stickY = scrollerRect.top + padTop;
        const lo = Math.min(stickY, maxY);
        const hi = Math.max(stickY, maxY);
        const targetY = Math.min(Math.max(naturalTop, lo), hi);

        const delta = targetY - naturalTop;

        if (Math.abs(delta) < 0.5) {
            id.style.removeProperty('transform');
        } else {
            id.style.transform = `translateY(${delta / scale}px)`;
        }
    }
};
