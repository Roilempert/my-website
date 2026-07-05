/* ==========================================================================
   03b. MICRO MOCK — תצוגת פתקים ב-L3 (V2, מחובר ל-AppState.items)
   ========================================================================== */
const MicroMock = {
    escapeHTML(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    resolveItem(wrapper) {
        const noteId = wrapper?.dataset?.noteId;
        if (!noteId) return null;

        if (typeof AppState !== 'undefined') {
            const item = AppState.items.find(i => String(i.id) === String(noteId));
            if (item) return item;
        }

        if (typeof SilhouetteEngine !== 'undefined') {
            return SilhouetteEngine.entries.get(String(noteId))?.item ?? null;
        }

        return null;
    },

    buildTagsHTML(tags, options = {}) {
        const pillClass = options.noteStyle
            ? 'micro-mock__tag-pill general-t'
            : 'action-block micro-mock__tag-block general-t';
        if (!tags?.length) {
            return `<span class="${pillClass}">` +
                `<span class="block-glyph" style="background-color:var(--color-4)"></span>` +
                `<span class="block-label">—</span></span>`;
        }
        return tags.map(tag => (
            `<span class="${pillClass}">` +
            `<span class="block-glyph" style="background-color:${tag.color}"></span>` +
            `<span class="block-label">${this.escapeHTML(tag.name)}</span></span>`
        )).join('');
    },

    buildAuthorHTML(item) {
        const author = String(item?.authorCode || item?.authorFullName || '').trim();
        if (!author) return '';
        return `<span class="action-block action-block--author micro-mock__author-block general-t">` +
            `<span class="block-label">${this.escapeHTML(author)}</span></span>`;
    },

    buildTypologyHTML(item) {
        const typology = String(item?.typology || '').trim();
        if (!typology) return '';
        const pattern = typeof getTypologyPattern === 'function'
            ? getTypologyPattern(typology)
            : 'regular';
        const inner = typeof buildTypologyBlockInnerHTML === 'function'
            ? buildTypologyBlockInnerHTML(typology)
            : `<span class="block-label">${this.escapeHTML(typology)}</span>`;
        return `<span class="action-block action-block--typology micro-mock__typology-block general-t" data-typology="${this.escapeHTML(typology)}" data-typology-pattern="${pattern}">${inner}</span>`;
    },

    buildCardOnlyHTML(item, options = {}) {
        const title = String(item.title || '').trim();
        const titleHTML = title
            ? `<h2 class="note-title note-h">${this.escapeHTML(title)}</h2>`
            : '';
        const focusClass = options.focusScale ? ' micro-mock__card--focus' : '';
        const dir = item.textDirection === 'ltr' ? 'ltr' : 'rtl';
        return `<div class="micro-mock__card note-card${focusClass}" data-note-id="${this.escapeHTML(item.id)}" dir="${dir}">` +
            `<div class="note-idcode general-t">${this.escapeHTML(item.id)}</div>` +
            titleHTML +
            `<div class="note-body note-t">${this.escapeHTML(item.body)}</div>` +
            `</div>`;
    },

    buildTagsRowHTML(item) {
        return `<div class="micro-mock__tags">` +
            `${this.buildTagsHTML(item.tags, { noteStyle: true })}` +
            `${this.buildTypologyHTML(item)}` +
            `${this.buildAuthorHTML(item)}` +
            `</div>`;
    },

    buildCardHTML(item, options = {}) {
        const card = this.buildCardOnlyHTML(item, options);
        const tags = this.buildTagsRowHTML(item);
        return `<div class="micro-mock__note">${card}${tags}</div>`;
    },

    applyToWrapper(wrapper, item = null) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return false;

        const glyph = wrapper.querySelector('.depth-v2-glyph--micro');
        if (!glyph) return false;

        const resolved = item || this.resolveItem(wrapper);
        if (!resolved) return false;

        glyph.innerHTML = this.buildCardHTML(resolved);
        if (typeof TextDirection !== 'undefined') {
            TextDirection.applyToWrapper(wrapper, resolved.textDirection);
        }
        wrapper.style.removeProperty('--micro-mock-row-span');
        wrapper.dataset.microMockNoteId = String(resolved.id);
        return true;
    },

    applyAll() {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 3) return 0;

        let applied = 0;
        [...document.querySelectorAll('#app .note-wrapper:not(.is-layout-excluded)')].forEach(wrapper => {
            try {
                if (this.applyToWrapper(wrapper)) applied++;
            } catch (err) {
                console.warn('MicroMock apply failed', wrapper.dataset.noteId, err);
            }
        });
        return applied;
    }
};
