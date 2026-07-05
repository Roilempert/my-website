/* ==========================================================================
   06. ARTIFACT INSPECTOR (FOCUS/ISOLATION)
   ========================================================================== */
const ArtifactInspector = {
    isActive: false,
    activeElement: null,
    backdrop: null,
    panel: null,
    mode: null, // 'popup'

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

        this.isActive = true;
        this.mode = 'popup';
        this.activeElement = noteWrapperNode;

        SpatialNavigation.pause();

        this.panel.innerHTML = this.buildFocusHTML(item);
        this.panel.setAttribute('aria-hidden', 'false');
        this.panel.dataset.noteId = String(item.id);

        this.backdrop.classList.add('active', 'is-popup');
        this.panel.classList.add('is-open');
        document.body.classList.add('is-artifact-inspector-open');
    },

    buildFocusHTML(item) {
        const cardHtml = typeof MicroMock !== 'undefined'
            ? MicroMock.buildCardHTML(item, { focusScale: true })
            : '';
        const metaHtml = this.buildMetadataHTML(item);
        const relatedHtml = this.buildRelatedNotesHTML(item);
        return `
            <div class="artifact-inspector-focus">
                ${cardHtml}
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

    closePopup() {
        this.backdrop.classList.remove('active', 'is-popup');
        this.panel.classList.remove('is-open');
        this.panel.setAttribute('aria-hidden', 'true');
        this.panel.innerHTML = '';
        delete this.panel.dataset.noteId;
        document.body.classList.remove('is-artifact-inspector-open');

        this.isActive = false;
        this.activeElement = null;
        this.mode = null;
        SpatialNavigation.resume();
    }
};
