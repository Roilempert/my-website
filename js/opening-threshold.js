/* ==========================================================================
   Opening Threshold — drag block to surface, molecule capture payoff
   ========================================================================== */
const OpeningThreshold = {
    mounted: false,
    ready: false,
    completing: false,
    dragging: false,
    el: null,
    surfaceEl: null,
    hintEl: null,
    blockEl: null,
    slotEl: null,
    tagColor: null,
    tagName: null,
    moleculeIndex: null,
    _pointerId: null,
    _dragX: 0,
    _dragY: 0,
    _autoTimer: null,
    _keyHandler: null,
    _boundMove: null,
    _boundUp: null,
    _boundCancel: null,

    cfg() {
        return CONFIG.opening?.threshold || {};
    },

    isEnabled() {
        return this.cfg().enabled !== false;
    },

    mount(openingEl) {
        if (!openingEl || !this.isEnabled()) return;
        this.el = openingEl.querySelector('.opening-threshold');
        if (!this.el) return;

        this.surfaceEl = this.el.querySelector('.opening-threshold__surface');
        this.hintEl = this.el.querySelector('.opening-threshold__hint');
        this.blockEl = this.el.querySelector('.opening-threshold__block');
        this.slotEl = this.el.querySelector('.opening-threshold__slot');

        const hint = this.cfg().hintText
            || CONFIG.opening?.labels?.continue
            || 'גררו לכניסה';
        if (this.hintEl) this.hintEl.textContent = hint;
        if (this.el) this.el.setAttribute('aria-label', hint);

        if (this.blockEl) {
            this.blockEl.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        }

        this.mounted = true;
    },

    enable() {
        if (!this.mounted || this.ready || !this.isEnabled()) return;
        if (!this._populateTag()) return;

        this.ready = true;
        this.el?.classList.add('is-ready');
        this.blockEl?.removeAttribute('disabled');

        if (this.cfg().allowKeyboardEnter !== false) {
            this._keyHandler = (e) => {
                if (e.key === 'Enter' && !this.completing && !this.dragging) {
                    e.preventDefault();
                    this._runCapture({ auto: true });
                }
            };
            window.addEventListener('keydown', this._keyHandler);
        }

        this._scheduleAutoComplete();
    },

    _scheduleAutoComplete() {
        const ms = this.cfg().autoCompleteMs;
        if (!ms || ms <= 0) return;
        clearTimeout(this._autoTimer);
        this._autoTimer = setTimeout(() => {
            if (!this.completing && !this.dragging) {
                this._runCapture({ auto: true });
            }
        }, ms);
    },

    _populateTag() {
        const options = typeof OpeningBackground !== 'undefined'
            ? OpeningBackground.getThresholdTagOptions()
            : [];
        if (!options.length) return false;

        const cfg = this.cfg();
        let pick = options[0];
        if (typeof cfg.tagIndex === 'number' && options[cfg.tagIndex]) {
            pick = options[cfg.tagIndex];
        } else {
            pick = this._pickClosestToContent(options) || pick;
        }

        this.tagColor = pick.tagColor;
        this.tagName = this._resolveTagName(pick.tagColor);
        this.moleculeIndex = pick.moleculeIndex;

        if (this.blockEl) {
            const glyph = this.blockEl.querySelector('.block-glyph');
            const label = this.blockEl.querySelector('.block-label');
            if (glyph) glyph.style.backgroundColor = pick.tagColor;
            if (label) label.textContent = this.tagName;
            this.blockEl.style.setProperty('--block-tag-color', pick.tagColor);
            this.blockEl.setAttribute('aria-label', `${this.tagName} — ${this.hintEl?.textContent || ''}`);
        }

        return true;
    },

    _pickClosestToContent(options) {
        const content = document.querySelector('#opening-screen .opening-screen__content');
        if (!content || typeof OpeningBackground === 'undefined') return options[0];

        const anchor = content.getBoundingClientRect();
        const targetX = anchor.left + anchor.width * 0.5;
        const targetY = anchor.top + anchor.height * 0.35;
        let best = options[0];
        let bestDist = Infinity;

        options.forEach((opt) => {
            const pt = OpeningBackground.moleculeCenterToClient(opt.moleculeIndex);
            if (!pt) return;
            const dist = Math.hypot(pt.x - targetX, pt.y - targetY);
            if (dist < bestDist) {
                bestDist = dist;
                best = opt;
            }
        });

        return best;
    },

    _resolveTagName(color) {
        const norm = String(color || '').trim().toLowerCase();
        if (typeof OpeningData !== 'undefined' && OpeningData.tagColorsMap?.size) {
            for (const [name, hex] of OpeningData.tagColorsMap) {
                if (String(hex).trim().toLowerCase() === norm) return name;
            }
        }
        return 'תגית';
    },

    _onPointerDown(e) {
        if (!this.ready || this.completing || this.blockEl?.disabled) return;
        if (e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = this.blockEl.getBoundingClientRect();
        this._dragX = e.clientX - rect.left;
        this._dragY = e.clientY - rect.top;
        this.dragging = true;
        this._pointerId = e.pointerId;

        this.blockEl.classList.add('is-dragging');
        this.el?.classList.add('is-dragging');
        this._setDragPosition(e.clientX, e.clientY);

        this._boundMove = (ev) => this._onPointerMove(ev);
        this._boundUp = (ev) => this._onPointerUp(ev);
        this._boundCancel = (ev) => this._onPointerUp(ev);

        try {
            this.blockEl.setPointerCapture(e.pointerId);
        } catch (_) { /* synthetic events may fail capture */ }

        document.addEventListener('pointermove', this._boundMove);
        document.addEventListener('pointerup', this._boundUp);
        document.addEventListener('pointercancel', this._boundCancel);
    },

    _onPointerMove(e) {
        if (!this.dragging) return;
        if (this._pointerId != null && e.pointerId !== this._pointerId) return;
        this._setDragPosition(e.clientX, e.clientY);
        this._updateSurfaceHover();
    },

    _setDragPosition(clientX, clientY) {
        if (!this.blockEl) return;
        const x = clientX - this._dragX;
        const y = clientY - this._dragY;
        this.blockEl.style.transform = `translate(${x}px, ${y}px)`;
    },

    _updateSurfaceHover() {
        if (!this.surfaceEl || !this.blockEl) return;
        const over = this._isOverSurface();
        this.el?.classList.toggle('is-over-surface', over);
    },

    _blockCenter() {
        if (!this.blockEl) return null;
        const r = this.blockEl.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    _isOverSurface() {
        const center = this._blockCenter();
        const surface = this.surfaceEl?.getBoundingClientRect();
        if (!center || !surface) return false;

        const pad = this.cfg().surfaceRadiusPx ?? 48;
        const cx = surface.left + surface.width / 2;
        const cy = surface.top + surface.height / 2;
        const rx = surface.width / 2 + pad;
        const ry = surface.height / 2 + pad;
        const dx = (center.x - cx) / rx;
        const dy = (center.y - cy) / ry;
        return (dx * dx + dy * dy) <= 1;
    },

    _onPointerUp(e) {
        if (!this.dragging) return;
        if (this._pointerId != null && e.pointerId !== this._pointerId) return;

        const overSurface = this._isOverSurface();

        this.dragging = false;
        this._pointerId = null;
        this.el?.classList.remove('is-over-surface');

        document.removeEventListener('pointermove', this._boundMove);
        document.removeEventListener('pointerup', this._boundUp);
        document.removeEventListener('pointercancel', this._boundCancel);
        this._boundMove = null;
        this._boundUp = null;
        this._boundCancel = null;

        try {
            this.blockEl?.releasePointerCapture(e.pointerId);
        } catch (_) { /* ignore */ }

        if (overSurface) {
            this._snapToSurface();
            this.blockEl?.classList.remove('is-dragging');
            this.el?.classList.remove('is-dragging');
            this._runCapture({ auto: false });
        } else {
            this.blockEl?.classList.remove('is-dragging');
            this.el?.classList.remove('is-dragging');
            this._returnToDock();
        }
    },

    _snapToSurface() {
        const surface = this.surfaceEl?.getBoundingClientRect();
        const block = this.blockEl?.getBoundingClientRect();
        if (!surface || !block || !this.blockEl) return;

        const x = surface.left + surface.width / 2 - block.width / 2;
        const y = surface.top + surface.height / 2 - block.height / 2;
        this.blockEl.style.transition = 'transform 180ms ease';
        this.blockEl.style.transform = `translate(${x}px, ${y}px)`;
        this.el?.classList.add('is-captured');
    },

    _returnToDock() {
        if (!this.blockEl || !this.slotEl) return;
        const slot = this.slotEl.getBoundingClientRect();
        const block = this.blockEl.getBoundingClientRect();
        const x = slot.left + (slot.width - block.width) / 2;
        const y = slot.top + (slot.height - block.height) / 2;

        this.blockEl.style.transition = 'transform 220ms ease';
        this.blockEl.style.transform = `translate(${x}px, ${y}px)`;

        const reset = () => {
            this.blockEl.style.transition = '';
            this.blockEl.style.transform = '';
            this.blockEl.removeEventListener('transitionend', reset);
        };
        this.blockEl.addEventListener('transitionend', reset);
    },

    async _runCapture({ auto }) {
        if (this.completing) return;
        this.completing = true;
        clearTimeout(this._autoTimer);
        this._autoTimer = null;

        if (auto && !this.el?.classList.contains('is-captured')) {
            this._snapToSurface();
        }

        const center = this._blockCenter();
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

        if (!reduced && center && typeof OpeningBackground !== 'undefined') {
            await OpeningBackground.playThresholdCapture({
                moleculeIndex: this.moleculeIndex,
                tagColor: this.tagColor,
                clientX: center.x,
                clientY: center.y,
                durationMs: this.cfg().captureDurationMs ?? 650
            });
        }

        const hold = this.cfg().holdBeforeExitMs ?? 400;
        setTimeout(() => {
            if (typeof OpeningScreen !== 'undefined' && OpeningScreen.onThresholdComplete) {
                OpeningScreen.onThresholdComplete();
            }
        }, hold);
    },

    destroy() {
        clearTimeout(this._autoTimer);
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    }
};
