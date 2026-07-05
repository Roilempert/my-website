/* ==========================================================================
   06. ARTIFACT INSPECTOR (FOCUS/ISOLATION)
   ========================================================================== */
const ArtifactInspector = {
    isActive: false,
    activeElement: null,
    backdrop: null,
    panel: null,
    flyer: null,
    mode: null, // 'popup'
    _openAnimTimer: null,

    init() {
        this.backdrop = document.createElement('div');
        this.backdrop.classList.add('focus-backdrop');
        this.backdrop.addEventListener('click', () => this.close());
        document.body.appendChild(this.backdrop);

        this.panel = document.createElement('div');
        this.panel.classList.add('artifact-inspector-panel');
        this.panel.dataset.siteLayer = 'inspector';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-hidden', 'true');
        this.panel.addEventListener('click', (e) => e.stopPropagation());
        this.panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        document.body.appendChild(this.panel);

        this.flyer = document.createElement('div');
        this.flyer.classList.add('artifact-inspector-flyer');
        this.flyer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.flyer);

        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this.isActive) {
                e.preventDefault();
                this.close();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
    },

    usesPopupMode() {
        return true;
    },

    isOpenableWrapper(noteWrapperNode) {
        if (!noteWrapperNode) return false;
        if (noteWrapperNode.classList.contains('is-layout-excluded') ||
            noteWrapperNode.classList.contains('is-molecule-filtered-out')) {
            return false;
        }
        return true;
    },

    open(noteWrapperNode) {
        if (this.isActive) return;
        if (!this.isOpenableWrapper(noteWrapperNode)) return;
        this.openPopup(noteWrapperNode);
    },

    openPopup(noteWrapperNode) {
        const item = typeof MicroMock !== 'undefined'
            ? MicroMock.resolveItem(noteWrapperNode)
            : null;
        if (!item) return;

        const { card: sourceCard } = this._getSourceFocusElements(noteWrapperNode);
        const firstCard = sourceCard?.getBoundingClientRect();
        if (!sourceCard || !firstCard || firstCard.width <= 0) return;

        this.isActive = true;
        this.mode = 'popup';
        this.activeElement = noteWrapperNode;
        this._openFirstCard = firstCard;
        this._openFocusVisualWidth = firstCard.width * (8 / 6);

        SpatialNavigation.pause();

        this.panel.innerHTML = this.buildFocusHTML(item);
        this.panel.setAttribute('aria-hidden', 'false');
        this.panel.dataset.noteId = String(item.id);
        this.panel.scrollTop = 0;

        this.flyer.innerHTML = this.buildFlyerShellHTML(item);
        this._mountFlyingCard(sourceCard);
        this.flyer.setAttribute('aria-hidden', 'false');
        this.flyer.classList.add('is-preparing', 'is-opening');

        noteWrapperNode.classList.add('is-inspector-source-hidden');
        this._hideAllSourceWrappers(item.id);

        this.backdrop.classList.add('active', 'is-popup', 'is-opening');
        this.panel.classList.add('is-open', 'is-opening');
        document.body.classList.add('is-artifact-inspector-open');
        this._applyFocusLandingLayout();

        this.panel.offsetHeight;
        this.flyer.offsetHeight;
        this._runFocusOpenAnimation();
    },

    _hideAllSourceWrappers(noteId) {
        const id = String(noteId);
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            if (String(wrapper.dataset.noteId) === id) {
                wrapper.classList.add('is-inspector-source-hidden');
            }
        });
    },

    _showAllSourceWrappers(noteId) {
        if (!noteId) return;
        const id = String(noteId);
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            if (String(wrapper.dataset.noteId) === id) {
                wrapper.classList.remove('is-inspector-source-hidden');
            }
        });
    },

    _getSourceFocusElements(wrapper) {
        const note = wrapper?.querySelector('.micro-mock__note');
        const card = note?.querySelector('.micro-mock__card.note-card')
            || wrapper?.querySelector('.note-stage .layer-full .note-card')
            || wrapper?.querySelector('.depth-v2-glyph--micro .note-card');
        const tags = note?.querySelector('.micro-mock__tags');
        return { note, card, tags };
    },

    _mountFlyingCard(sourceCard) {
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        if (!sourceCard || !flyerScaler || !this._openFirstCard) return;
        const baseW = `${this._openFirstCard.width}px`;
        sourceCard.classList.add('micro-mock__card--focus');
        sourceCard.style.width = baseW;
        sourceCard.style.maxWidth = baseW;
        sourceCard.style.boxSizing = 'border-box';
        flyerScaler.style.width = baseW;
        flyerScaler.appendChild(sourceCard);
    },

    _measureInspectorRegionRect() {
        if (!this._inspectorRegionProbe) {
            this._inspectorRegionProbe = document.createElement('div');
            this._inspectorRegionProbe.className = 'artifact-inspector-region-probe';
            this._inspectorRegionProbe.setAttribute('aria-hidden', 'true');
            this._inspectorRegionProbe.style.cssText = [
                'position:fixed',
                'left:var(--site-layer-inspector-left)',
                'width:var(--site-layer-inspector-width)',
                'top:var(--site-layer-inspector-top)',
                'height:var(--site-layer-inspector-height)',
                'visibility:hidden',
                'pointer-events:none'
            ].join(';');
            document.body.appendChild(this._inspectorRegionProbe);
        }
        return this._inspectorRegionProbe.getBoundingClientRect();
    },

    _getFocusLandingRect() {
        const targetVisualW = this._openFocusVisualWidth
            || (this._openFirstCard ? this._openFirstCard.width * (8 / 6) : 0);
        if (!targetVisualW) return null;

        const inspector = this._measureInspectorRegionRect();
        const panelStyle = this.panel ? getComputedStyle(this.panel) : null;
        const top = parseFloat(panelStyle?.paddingTop)
            || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inspector-card-start-top'))
            || 0;
        const left = inspector.left + (inspector.width - targetVisualW) / 2;

        return {
            left,
            top,
            width: targetVisualW,
            centerX: left + targetVisualW / 2
        };
    },

    _applyFocusLandingLayout() {
        const slot = this._getFocusLandingRect();
        if (!slot || !this.panel) return null;
        this.panel.style.width = `${slot.width}px`;
        this.panel.style.left = `${slot.centerX}px`;
        return slot;
    },

    _alignFlyerToLandingSlot(flyerNote) {
        const slot = this._getFocusLandingRect();
        if (!flyerNote || !slot) return;
        flyerNote.classList.add('is-positioned');
        flyerNote.style.left = `${slot.left}px`;
        flyerNote.style.top = `${slot.top}px`;
        flyerNote.style.width = `${slot.width}px`;
    },

    _syncFlyerCardSlot() {
        const slot = this.flyer?.querySelector('.artifact-inspector-focus__card-slot');
        if (!slot || !this._openFirstCard) return;
        slot.style.height = `${this._openFirstCard.height * (8 / 6)}px`;
    },

    _syncPanelSpacer() {
        const flyerNote = this.flyer?.querySelector('.artifact-inspector-flyer__note');
        const tags = this.flyer?.querySelector('.micro-mock__tags');
        const spacer = this.panel?.querySelector('.artifact-inspector-focus-spacer');
        if (!flyerNote || !spacer || !this._openFirstCard) return;

        const visualH = this._openFirstCard.height * (8 / 6);
        const gap = parseFloat(getComputedStyle(flyerNote).rowGap
            || getComputedStyle(flyerNote).gap) || 0;
        const tagsH = tags?.offsetHeight || 0;
        const tagsBlock = tags ? gap + tagsH : 0;
        spacer.style.height = `${visualH + tagsBlock + 40}px`;
    },

    _runFocusOpenAnimation() {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            this._finishFocusOpenAnimation(true);
            return;
        }

        const firstCard = this._openFirstCard;
        const flyerNote = this.flyer?.querySelector('.artifact-inspector-flyer__note');
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');

        if (!firstCard || !flyerNote || !flyerScaler) {
            this._finishFocusOpenAnimation(true);
            return;
        }

        const focusScale = 8 / 6;
        this._alignFlyerToLandingSlot(flyerNote);

        flyerScaler.style.transform = 'none';
        flyerScaler.style.transition = 'none';
        flyerScaler.style.transformOrigin = 'top center';
        flyerScaler.offsetHeight;

        const layoutRect = flyerScaler.getBoundingClientRect();
        if (layoutRect.width <= 0) {
            this._finishFocusOpenAnimation(true);
            return;
        }

        const invertScale = firstCard.width / layoutRect.width;
        const dx = firstCard.left - layoutRect.left;
        const dy = firstCard.top - layoutRect.top;

        flyerScaler.style.transform = `translate(${dx}px, ${dy}px) scale(${invertScale})`;
        flyerScaler.offsetHeight;
        this.flyer?.classList.remove('is-preparing');

        const duration = `${CONFIG.inspector?.openDuration ?? 0.48}s`;
        const easing = 'cubic-bezier(0.25, 1, 0.5, 1)';
        const onTransitionEnd = (event) => {
            if (event.target !== flyerScaler || event.propertyName !== 'transform') return;
            flyerScaler.removeEventListener('transitionend', onTransitionEnd);
            this._finishFocusOpenAnimation(false);
        };
        flyerScaler.addEventListener('transitionend', onTransitionEnd);

        clearTimeout(this._openAnimTimer);
        const ms = Math.round((CONFIG.inspector?.openDuration ?? 0.48) * 1000) + 120;
        this._openAnimTimer = setTimeout(() => {
            flyerScaler.removeEventListener('transitionend', onTransitionEnd);
            this._finishFocusOpenAnimation(false);
        }, ms);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                flyerScaler.style.transition = `transform ${duration} ${easing}`;
                flyerScaler.style.transform = `translate(0px, 0px) scale(${focusScale})`;
            });
        });
    },

    _finishFocusOpenAnimation(skipMotion) {
        clearTimeout(this._openAnimTimer);
        this._openAnimTimer = null;

        const flyerNote = this.flyer?.querySelector('.artifact-inspector-flyer__note');
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const focusScale = 8 / 6;

        this._applyFocusLandingLayout();
        this._alignFlyerToLandingSlot(flyerNote);

        if (flyerScaler) {
            flyerScaler.style.transition = 'none';
            flyerScaler.style.transformOrigin = 'top center';
            flyerScaler.style.transform = `translate(0px, 0px) scale(${focusScale})`;
            if (!skipMotion) flyerScaler.offsetHeight;
        }

        this.flyer?.classList.remove('is-preparing', 'is-opening');
        this.flyer?.classList.add('is-landed');

        this._syncFlyerCardSlot();
        this._syncPanelSpacer();

        this.panel?.classList.remove('is-opening');
        this.backdrop?.classList.remove('is-opening');
    },

    buildFlyerShellHTML(item) {
        const tagsHtml = typeof MicroMock !== 'undefined'
            ? MicroMock.buildTagsRowHTML(item)
            : '';
        return `
            <div class="artifact-inspector-flyer__note micro-mock__note artifact-inspector-focus__note">
                <div class="artifact-inspector-focus__card-slot">
                    <div class="artifact-inspector-focus__card-scaler"></div>
                </div>
                ${tagsHtml}
            </div>
        `;
    },

    buildFocusHTML(item) {
        const metaHtml = this.buildMetadataHTML(item);
        const relatedHtml = this.buildRelatedNotesHTML(item);
        return `
            <div class="artifact-inspector-focus-spacer" aria-hidden="true"></div>
            ${metaHtml}
            ${relatedHtml}
        `;
    },

    buildMetadataHTML(item) {
        const author = item.authorCode
            ? String(item.authorCode).trim().toUpperCase()
            : (item.authorFullName || '—');
        const date = item.dateWritten || '—';
        const serial = item.id || '—';
        const typology = typeof getTypologyLabel === 'function'
            ? (getTypologyLabel(item.typology) || item.typology || '—')
            : (item.typology || '—');
        const tags = (item.tags || []).map(t => t.name).join('، ');
        return `
            <section class="artifact-inspector-metadata">
                <h2 class="artifact-inspector-metadata__id general-h">${this.escapeHtml(item.id || '')}</h2>
                <div class="artifact-inspector-metadata__grid">
                    <div class="artifact-inspector-metadata__tags">
                        <h3 class="general-t">תגיות</h3>
                        <div class="artifact-inspector-metadata__tag-list general-t">${this.escapeHtml(tags || '—')}</div>
                    </div>
                    <dl class="artifact-inspector-metadata__details general-t">
                        <div><dt>מחבר</dt><dd>${this.escapeHtml(author)}</dd></div>
                        <div><dt>תאריך כתיבה</dt><dd>${this.escapeHtml(date)}</dd></div>
                        <div><dt>מספר סידורי</dt><dd>${this.escapeHtml(serial)}</dd></div>
                        <div><dt>מבנה טיפולוגי</dt><dd>${this.escapeHtml(typology)}</dd></div>
                    </dl>
                </div>
            </section>
        `;
    },

    buildRelatedNotesHTML(focusItem) {
        const sections = this.getRelatedTagSections(focusItem);
        if (!sections.length) return '';

        const blocks = sections.map((section) => {
            const pills = section.tags.map((name) => {
                const color = AppState.tagColorsMap.get(name) || 'var(--color-3)';
                return `<span class="artifact-inspector-related__pill action-block general-t"><span class="block-glyph" style="background-color:${color}"></span><span class="block-label">${this.escapeHtml(name)}</span></span>`;
            }).join('<span class="artifact-inspector-related__plus" aria-hidden="true">+</span>');

            const notes = section.items.map((item) => {
                const html = typeof MicroMock !== 'undefined'
                    ? MicroMock.buildCardHTML(item)
                    : '';
                return `<div class="artifact-inspector-related__note">${html}</div>`;
            }).join('');

            return `
                <section class="artifact-inspector-related__section">
                    <div class="artifact-inspector-related__heading general-h">${pills}</div>
                    <div class="artifact-inspector-related__grid">${notes}</div>
                </section>
            `;
        }).join('');

        return `
            <section class="artifact-inspector-related">
                <h2 class="artifact-inspector-related__title general-h">פתקים קשורים</h2>
                ${blocks}
            </section>
        `;
    },

    getRelatedTagSections(focusItem) {
        const focusTags = (focusItem.tags || []).map(t => t.name).filter(Boolean);
        if (!focusTags.length || !AppState.items?.length) return [];

        const focusId = String(focusItem.id);
        const subsets = [];

        const emit = (mask) => {
            const tags = focusTags.filter((_, i) => (mask >> i) & 1);
            if (!tags.length) return;
            const key = tags.slice().sort().join('\0');
            if (subsets.some(s => s.key === key)) return;

            const matches = AppState.items.filter((item) => {
                if (String(item.id) === focusId) return false;
                const names = new Set((item.tags || []).map(t => t.name));
                return tags.every(name => names.has(name));
            });

            if (!matches.length) return;
            subsets.push({ key, tags, items: matches });
        };

        const total = 1 << focusTags.length;
        for (let mask = 1; mask < total; mask++) emit(mask);

        subsets.sort((a, b) => a.tags.length - b.tags.length || a.key.localeCompare(b.key, 'he'));
        return subsets;
    },

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    close() {
        if (!this.isActive) return;
        this.closePopup();
    },

    _restoreSourceCard(noteId) {
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const card = flyerScaler?.querySelector('.micro-mock__card.note-card');
        if (!card || !noteId) return;

        card.classList.remove('micro-mock__card--focus');
        card.style.removeProperty('width');
        card.style.removeProperty('max-width');
        card.style.removeProperty('box-sizing');
        card.style.removeProperty('transform');
        card.style.removeProperty('transition');
        card.style.removeProperty('transform-origin');

        const wrapper = this.activeElement
            || document.querySelector(`.note-wrapper[data-note-id="${String(noteId)}"]`);
        const note = wrapper?.querySelector('.micro-mock__note');
        if (!note) {
            if (wrapper && typeof MicroMock !== 'undefined') {
                MicroMock.applyToWrapper(wrapper);
            }
            return;
        }

        const tags = note.querySelector('.micro-mock__tags');
        if (tags) note.insertBefore(card, tags);
        else note.appendChild(card);
    },

    closePopup() {
        clearTimeout(this._openAnimTimer);
        this._openAnimTimer = null;

        this.backdrop.classList.remove('active', 'is-popup', 'is-opening');
        this.panel.classList.remove('is-open', 'is-opening');
        this.panel.setAttribute('aria-hidden', 'true');
        const noteId = this.panel?.dataset?.noteId;
        this._restoreSourceCard(noteId);
        this.panel.innerHTML = '';
        this.panel.style.removeProperty('width');
        this.panel.style.removeProperty('left');
        delete this.panel.dataset.noteId;

        if (this.flyer) {
            this.flyer.innerHTML = '';
            this.flyer.classList.remove('is-preparing', 'is-opening', 'is-landed');
            this.flyer.setAttribute('aria-hidden', 'true');
        }

        document.body.classList.remove('is-artifact-inspector-open');

        this._showAllSourceWrappers(noteId);
        this.activeElement?.classList.remove('is-inspector-source-hidden');
        this._openFirstCard = null;
        this._openFocusVisualWidth = null;
        this.isActive = false;
        this.activeElement = null;
        this.mode = null;
        SpatialNavigation.resume();
    }
};
