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
    _openSyntheticCard: false,

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

    openMacroNoteAt(clientX, clientY) {
        if (!this._isMacroLevel()) return false;
        if (typeof PhysicsEngine === 'undefined' || !PhysicsEngine.bodiesData?.length) return false;
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return false;
        if (typeof DepthTransitionOrchestrator !== 'undefined' &&
            DepthTransitionOrchestrator.isRunning()) {
            return false;
        }
        if (typeof SpatialNavigation !== 'undefined' &&
            (SpatialNavigation.pan.active || SpatialNavigation.spaceHeld)) {
            return false;
        }
        if (typeof isPointOverSiteNavigationUI === 'function' &&
            isPointOverSiteNavigationUI(clientX, clientY)) {
            return false;
        }

        const noteIndex = PhysicsEngine.hitTestMolecule(clientX, clientY);
        if (noteIndex < 0) return false;

        const wrappers = document.querySelectorAll('.note-wrapper');
        const wrapper = wrappers[noteIndex];
        if (!this.isOpenableWrapper(wrapper)) return false;

        if (this.isActive) {
            this.close();
        } else {
            this.open(wrapper);
        }
        return true;
    },

    openPopup(noteWrapperNode) {
        const item = typeof MicroMock !== 'undefined'
            ? MicroMock.resolveItem(noteWrapperNode)
            : null;
        if (!item) return;

        const source = this._resolveOpenSource(noteWrapperNode, item);
        if (!source) return;

        const { card: sourceCard, firstRect: firstCard, synthetic } = source;

        this.isActive = true;
        this.mode = 'popup';
        this.activeElement = noteWrapperNode;
        this._openSyntheticCard = synthetic;
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

    _isMacroLevel() {
        return typeof DepthController !== 'undefined' && DepthController.currentLevel === 1;
    },

    _resolveOpenSource(wrapper, item) {
        const { card } = this._getSourceFocusElements(wrapper);
        const firstRect = card?.getBoundingClientRect();
        if (card && firstRect && firstRect.width > 0) {
            return { card, firstRect, synthetic: false };
        }

        if (!this._isMacroLevel() || typeof MicroMock === 'undefined') return null;

        const cardSize = this._measureL3CardSize(item);
        const sourceRect = this._resolveMacroSourceRect(wrapper, cardSize);
        if (!sourceRect) return null;

        const syntheticCard = this._buildSyntheticFocusCard(item);
        if (!syntheticCard) return null;

        return { card: syntheticCard, firstRect: sourceRect, synthetic: true };
    },

    _buildSyntheticFocusCard(item) {
        const html = MicroMock.buildCardOnlyHTML(item, { focusScale: true });
        const mount = document.createElement('div');
        mount.innerHTML = html;
        return mount.firstElementChild;
    },

    _measureL3CardSize(item) {
        if (!this._cardMeasureProbe) {
            this._cardMeasureProbe = document.createElement('div');
            this._cardMeasureProbe.className = 'artifact-inspector-card-measure-probe';
            this._cardMeasureProbe.setAttribute('aria-hidden', 'true');
            document.body.appendChild(this._cardMeasureProbe);
        }

        this._cardMeasureProbe.innerHTML = MicroMock.buildCardOnlyHTML(item, { focusScale: true });
        const card = this._cardMeasureProbe.querySelector('.micro-mock__card.note-card');
        const rect = card?.getBoundingClientRect();
        const rootStyle = getComputedStyle(document.documentElement);
        const fallbackW = parseFloat(rootStyle.getPropertyValue('--site-micro-col-width')) || 0;
        const fallbackH = parseFloat(rootStyle.getPropertyValue('--site-micro-note-min-height')) || 0;

        return {
            width: rect?.width > 0 ? rect.width : fallbackW,
            height: rect?.height > 0 ? rect.height : fallbackH
        };
    },

    _resolveMacroSourceRect(wrapper, cardSize) {
        const wrappers = document.querySelectorAll('.note-wrapper');
        const noteIndex = [...wrappers].indexOf(wrapper);
        let bounds = null;

        if (noteIndex >= 0 && typeof PhysicsEngine !== 'undefined') {
            bounds = PhysicsEngine.moleculeViewportBounds(noteIndex);
        }

        if (!bounds) {
            const dots = wrapper.querySelectorAll('.layer-dot');
            dots.forEach((dot) => {
                const r = dot.getBoundingClientRect();
                if (r.width <= 0) return;
                bounds = bounds || { minX: r.left, minY: r.top, maxX: r.right, maxY: r.bottom };
                bounds.minX = Math.min(bounds.minX, r.left);
                bounds.minY = Math.min(bounds.minY, r.top);
                bounds.maxX = Math.max(bounds.maxX, r.right);
                bounds.maxY = Math.max(bounds.maxY, r.bottom);
            });
        }

        if (!bounds || cardSize.width <= 0) return null;

        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cy = (bounds.minY + bounds.maxY) * 0.5;
        const left = cx - cardSize.width * 0.5;
        const top = cy - cardSize.height * 0.5;

        return {
            left,
            top,
            width: cardSize.width,
            height: cardSize.height,
            right: left + cardSize.width,
            bottom: top + cardSize.height,
            x: left,
            y: top
        };
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

    _measureSiteGridSpanWidthPx(colSpan) {
        if (!this._siteGridSpanProbe) {
            this._siteGridSpanProbe = document.createElement('div');
            this._siteGridSpanProbe.setAttribute('aria-hidden', 'true');
            this._siteGridSpanProbe.style.cssText = [
                'position:fixed',
                'visibility:hidden',
                'pointer-events:none',
                'top:0',
                'left:0'
            ].join(';');
            document.body.appendChild(this._siteGridSpanProbe);
        }
        const gapCount = Math.max(0, colSpan - 1);
        this._siteGridSpanProbe.style.width =
            `calc(${colSpan} * var(--site-grid-cell-w) + ${gapCount} * var(--site-grid-gap))`;
        return this._siteGridSpanProbe.getBoundingClientRect().width;
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

    _getSiteGridRowStridePx() {
        const rootStyle = getComputedStyle(document.documentElement);
        const cellH = parseFloat(rootStyle.getPropertyValue('--site-grid-cell-h')) || 0;
        const gap = parseFloat(rootStyle.getPropertyValue('--site-grid-gap')) || 0;
        return cellH + gap;
    },

    _getInspectorMetadataShellRowBottomOffsetPx() {
        const cardAnchorRow = CONFIG.inspector?.cardAnchorRow ?? 2;
        const alignRow = CONFIG.inspector?.metadataAlignRow
            ?? CONFIG.siteGrid?.rows
            ?? 12;
        const rowsBelowCard = Math.max(0, alignRow - cardAnchorRow);
        const rootStyle = getComputedStyle(document.documentElement);
        const cellH = parseFloat(rootStyle.getPropertyValue('--site-grid-cell-h')) || 0;
        return rowsBelowCard * this._getSiteGridRowStridePx() + cellH;
    },

    _measureFocusBlockEndPx() {
        const panel = this.panel;
        const focus = panel?.querySelector('.artifact-inspector-focus');
        if (!panel || !focus) return 0;

        const panelStyle = getComputedStyle(panel);
        const contentTop = panel.getBoundingClientRect().top
            + (parseFloat(panelStyle.paddingTop) || 0);

        let end = focus.getBoundingClientRect().bottom - contentTop;

        focus.querySelectorAll('.micro-mock__card.note-card, .micro-mock__tags').forEach((el) => {
            end = Math.max(end, el.getBoundingClientRect().bottom - contentTop);
        });

        return end;
    },

    _syncFocusCardSlotHeight() {
        const panelSlot = this.panel?.querySelector(
            '.artifact-inspector-focus__card-slot'
        );
        const card = this.panel?.querySelector(
            '.artifact-inspector-focus__card-scaler .micro-mock__card.note-card'
        );
        if (!panelSlot || !card) return;

        const cardHeight = card.getBoundingClientRect().height;
        if (cardHeight > 0) {
            panelSlot.style.height = `${Math.ceil(cardHeight)}px`;
        }
    },

    _syncMetadataPanelGap() {
        const metadata = this.panel?.querySelector('.artifact-inspector-metadata');
        const details = metadata?.querySelector('.artifact-inspector-metadata__details');
        if (!metadata || !details || !this.panel) return;

        this._syncFocusCardSlotHeight();

        const minGap = CONFIG.inspector?.metadataMinGap ?? 60;
        const rowBottomOffset = this._getInspectorMetadataShellRowBottomOffsetPx();
        const focusEnd = this._measureFocusBlockEndPx();

        const metadataRect = metadata.getBoundingClientRect();
        const detailsRect = details.getBoundingClientRect();
        const detailsOffsetInMetadata = detailsRect.bottom - metadataRect.top;

        const metadataTopForShortAlign = rowBottomOffset - detailsOffsetInMetadata;
        const longNote = focusEnd + minGap > metadataTopForShortAlign;
        const gap = longNote
            ? minGap
            : Math.max(minGap, metadataTopForShortAlign - focusEnd);

        this.panel.style.setProperty('--inspector-metadata-gap', `${Math.round(gap)}px`);
    },

    _applyFocusLandingLayout() {
        const cardSlot = this._getFocusLandingRect();
        if (!cardSlot || !this.panel) return null;
        const inspector = this._measureInspectorRegionRect();
        const panelWidth = this._measureSiteGridSpanWidthPx(10);
        const centerX = inspector.left + inspector.width / 2;
        this.panel.style.width = `${panelWidth}px`;
        this.panel.style.left = `${centerX}px`;
        return cardSlot;
    },

    _alignFlyerToLandingSlot(flyerNote) {
        const slot = this._getFocusLandingRect();
        if (!flyerNote || !slot) return;
        flyerNote.classList.add('is-positioned');
        flyerNote.style.left = `${slot.left}px`;
        flyerNote.style.top = `${slot.top}px`;
        flyerNote.style.width = `${slot.width}px`;
    },

    _handoffFocusToPanel() {
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const flyerTags = this.flyer?.querySelector('.micro-mock__tags');
        const flyingCard = flyerScaler?.querySelector('.micro-mock__card.note-card');
        const panelFocus = this.panel?.querySelector('.artifact-inspector-focus');
        const panelNote = panelFocus?.querySelector('.artifact-inspector-focus__note');
        const panelScaler = panelFocus?.querySelector('.artifact-inspector-focus__card-scaler');

        if (!flyingCard || !panelScaler || !panelFocus || !this._openFirstCard) {
            if (this.flyer) {
                this.flyer.innerHTML = '';
                this.flyer.classList.remove('is-preparing', 'is-opening', 'is-landed');
                this.flyer.setAttribute('aria-hidden', 'true');
            }
            return;
        }

        const focusScale = 8 / 6;
        const baseW = `${this._openFirstCard.width}px`;
        const panelSlot = panelFocus.querySelector('.artifact-inspector-focus__card-slot');

        flyingCard.style.width = baseW;
        flyingCard.style.maxWidth = baseW;
        flyingCard.style.boxSizing = 'border-box';

        panelScaler.style.width = baseW;
        panelScaler.style.transformOrigin = 'top center';
        panelScaler.style.transform = `scale(${focusScale})`;
        panelScaler.style.removeProperty('transition');

        if (panelSlot) {
            panelSlot.style.height = `${this._openFirstCard.height * focusScale}px`;
        }

        panelScaler.appendChild(flyingCard);
        if (flyerTags && panelNote) panelNote.appendChild(flyerTags);

        if (this.flyer) {
            this.flyer.innerHTML = '';
            this.flyer.classList.remove('is-preparing', 'is-opening', 'is-landed');
            this.flyer.setAttribute('aria-hidden', 'true');
        }
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

        this._handoffFocusToPanel();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._syncFocusCardSlotHeight();
                this._syncMetadataPanelGap();
            });
        });

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
            <div class="artifact-inspector-focus">
                <div class="micro-mock__note artifact-inspector-focus__note">
                    <div class="artifact-inspector-focus__card-slot">
                        <div class="artifact-inspector-focus__card-scaler"></div>
                    </div>
                </div>
            </div>
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
        const blocksHtml = typeof MicroMock !== 'undefined'
            ? MicroMock.buildTagsRowHTML(item)
            : '';
        return `
            <section class="artifact-inspector-metadata">
                <div class="artifact-inspector-metadata__scroll-glyphs" aria-hidden="true">
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                    <span class="artifact-inspector-metadata__scroll-glyph general-h">^</span>
                </div>
                <h2 class="artifact-inspector-metadata__id general-h">${this.escapeHtml(item.id || '')}</h2>
                <div class="artifact-inspector-metadata__grid">
                    <div class="artifact-inspector-metadata__tags">
                        <h3 class="general-t">תגיות</h3>
                        <div class="artifact-inspector-metadata__tag-list">${blocksHtml}</div>
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
        if (this._openSyntheticCard) {
            this._openSyntheticCard = false;
            return;
        }

        const panelScaler = this.panel?.querySelector('.artifact-inspector-focus__card-scaler');
        const flyerScaler = this.flyer?.querySelector('.artifact-inspector-focus__card-scaler');
        const card = panelScaler?.querySelector('.micro-mock__card.note-card')
            || flyerScaler?.querySelector('.micro-mock__card.note-card');
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
        this.panel.style.removeProperty('--inspector-metadata-gap');
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
        this._openSyntheticCard = false;
        this.isActive = false;
        this.activeElement = null;
        this.mode = null;
        SpatialNavigation.resume();
    }
};
