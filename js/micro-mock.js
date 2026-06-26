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

    buildTagsHTML(tags) {
        if (!tags?.length) {
            return `<span class="action-block micro-mock__tag-block site-type">` +
                `<span class="block-glyph" style="background-color:var(--main-text)"></span>` +
                `<span class="block-label">—</span></span>`;
        }
        return tags.map(tag => (
            `<span class="action-block micro-mock__tag-block site-type">` +
            `<span class="block-glyph" style="background-color:${tag.color}"></span>` +
            `<span class="block-label">${this.escapeHTML(tag.name)}</span></span>`
        )).join('');
    },

    buildCardHTML(item) {
        return `<div class="micro-mock__card note-card" data-note-id="${this.escapeHTML(item.id)}">` +
            `<div class="note-idcode">${this.escapeHTML(item.id)}</div>` +
            `<h2 class="note-title">${this.escapeHTML(item.title)}</h2>` +
            `<div class="note-body">${this.escapeHTML(item.body)}</div>` +
            `<div class="micro-mock__tags">${this.buildTagsHTML(item.tags)}</div>` +
            `</div>`;
    },

    applyToWrapper(wrapper, item = null) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return false;

        const glyph = wrapper.querySelector('.depth-v2-glyph--micro');
        if (!glyph) return false;

        const resolved = item || this.resolveItem(wrapper);
        if (!resolved) return false;

        glyph.innerHTML = this.buildCardHTML(resolved);
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
