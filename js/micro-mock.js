/* ==========================================================================
   03b. MICRO MOCK — תצוגת פתקים ב-L3 (V2, מחובר ל-AppState.items)
   ========================================================================== */
const MicroMock = {
    _prewarmScheduled: false,
    _prewarmComplete: false,
    _prewarmToken: 0,

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
            ? 'micro-mock__tag-pill action-block--attached general-t'
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
        return `<span class="action-block action-block--author action-block--attached micro-mock__author-block general-t">` +
            `<span class="block-label">${this.escapeHTML(author)}</span></span>`;
    },

    /** Sheet date codes like `0421` → `04 2021` (MM YYYY); empty / `0000` → לא ידוע. */
    formatFocusDateWritten(raw) {
        const s = String(raw || '').trim();
        if (!s) return 'לא ידוע';

        const compact = s.replace(/\s+/g, '');
        if (/^0+$/.test(compact)) return 'לא ידוע';

        const match = compact.match(/^(\d{2})(\d{2})$/);
        if (match) {
            const month = match[1];
            const yearPart = match[2];
            if (month === '00' && yearPart === '00') return 'לא ידוע';
            const year = parseInt(yearPart, 10) >= 70 ? `19${yearPart}` : `20${yearPart}`;
            return `${month} ${year}`;
        }

        return s;
    },

    buildFocusFooterHTML(item, options = {}) {
        const readable = options.forceReadable || options.focusScale;
        const useCensor = typeof NoteCensor !== 'undefined'
            && NoteCensor.isActive()
            && !readable;

        const row = (label, valueHtml) =>
            `<div class="note-card__focus-detail">` +
            `<dt class="note-card__focus-label">${this.escapeHTML(label)}</dt>` +
            `<dd class="note-card__focus-value">${valueHtml}</dd>` +
            `</div>`;

        if (useCensor) {
            return `<footer class="note-card__focus-footer general-d" aria-label="פרטי פתק">` +
                `<dl class="note-card__focus-details">` +
                row('מחבר', NoteCensor.buildMetadataValueHTML('author', item)) +
                row('תאריך', NoteCensor.buildMetadataValueHTML('date', item)) +
                row('מבנה', NoteCensor.buildMetadataValueHTML('typology', item)) +
                `</dl></footer>`;
        }

        const author = item.authorCode
            ? String(item.authorCode).trim().toUpperCase()
            : (item.authorFullName || '—');
        const date = this.formatFocusDateWritten(item.dateWritten);
        const typology = typeof getTypologyLabel === 'function'
            ? (getTypologyLabel(item.typology) || item.typology || '—')
            : (item.typology || '—');

        return `<footer class="note-card__focus-footer general-d" aria-label="פרטי פתק">` +
            `<dl class="note-card__focus-details">` +
            row('מחבר', this.escapeHTML(author)) +
            row('תאריך', this.escapeHTML(date)) +
            row('מבנה', this.escapeHTML(typology)) +
            `</dl></footer>`;
    },

    buildCardOnlyHTML(item, options = {}) {
        const readable = options.forceReadable || options.focusScale;
        const useCensor = typeof NoteCensor !== 'undefined'
            && NoteCensor.isThemeEnabled()
            && !readable
            && (NoteCensor.isActive() || options.prewarmCensored === true);
        const focusClass = options.focusScale ? ' micro-mock__card--focus' : '';
        const dir = item.textDirection === 'ltr' ? 'ltr' : 'rtl';
        const focusMainOpen = options.focusScale ? '<div class="note-card__focus-main">' : '';
        const focusMainClose = options.focusScale ? '</div>' : '';
        const footerHtml = (useCensor && !options.focusScale)
            ? ''
            : this.buildFocusFooterHTML(item, options);

        if (useCensor) {
            return `<div class="micro-mock__card note-card${focusClass}" data-note-id="${this.escapeHTML(item.id)}" dir="${dir}">` +
                NoteCensor.buildIdHTML(item) +
                focusMainOpen +
                NoteCensor.buildTitleHTML(item) +
                NoteCensor.buildBodyHTML(item) +
                focusMainClose +
                footerHtml +
                `</div>`;
        }

        const title = String(item.title || '').trim();
        const titleHTML = title
            ? `<h2 class="note-title note-h">${this.escapeHTML(title)}</h2>`
            : '';
        return `<div class="micro-mock__card note-card${focusClass}" data-note-id="${this.escapeHTML(item.id)}" dir="${dir}">` +
            `<div class="note-id-rail"><div class="note-idcode general-t">${this.escapeHTML(item.id)}</div></div>` +
            focusMainOpen +
            titleHTML +
            `<div class="note-body note-t">${this.escapeHTML(item.body)}</div>` +
            focusMainClose +
            footerHtml +
            `</div>`;
    },

    buildTagsRowHTML(item, options = {}) {
        return `<div class="micro-mock__tags">` +
            `${this.buildTagsHTML(item.tags, { noteStyle: true })}` +
            `${this.buildAuthorHTML(item)}` +
            `</div>`;
    },

    buildCardHTML(item, options = {}) {
        const card = this.buildCardOnlyHTML(item, options);
        const tags = this.buildTagsRowHTML(item);
        return `<div class="micro-mock__note">${card}${tags}</div>`;
    },

    applyToWrapper(wrapper, item = null, options = {}) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return false;

        const glyph = wrapper.querySelector('.depth-v2-glyph--micro');
        if (!glyph) return false;

        const resolved = item || this.resolveItem(wrapper);
        if (!resolved) return false;

        const force = options.force === true;
        const noteId = String(resolved.id);
        if (!force && wrapper.dataset.microMockNoteId === noteId && glyph.querySelector('.micro-mock__note')) {
            return true;
        }

        glyph.innerHTML = this.buildCardHTML(resolved);
        if (typeof TextDirection !== 'undefined') {
            TextDirection.applyToWrapper(wrapper, resolved.textDirection);
        }
        wrapper.style.removeProperty('--micro-mock-row-span');
        wrapper.dataset.microMockNoteId = noteId;
        return true;
    },

    applyAll(options = {}) {
        if (typeof DepthV2 !== 'undefined' && !DepthV2.isActive()) return 0;
        if (typeof DepthController !== 'undefined' && DepthController.currentLevel !== 3) return 0;


        let applied = 0;
        let rebuilt = 0;
        [...document.querySelectorAll('#app .note-wrapper:not(.is-layout-excluded)')].forEach(wrapper => {
            try {
                const hadCard = !!wrapper.querySelector('.micro-mock__note');
                if (this.applyToWrapper(wrapper, null, options)) {
                    applied++;
                    if (!hadCard || options.force === true) rebuilt++;
                }
            } catch (err) {
                console.warn('MicroMock apply failed', wrapper.dataset.noteId, err);
            }
        });


        if (typeof NoteCensor !== 'undefined' && NoteCensor.isActive() && rebuilt > 0) {
            NoteCensor.invalidateWordLayout();
        }

        return applied;
    },

    countPrewarmedWrappers() {
        let count = 0;
        document.querySelectorAll('#app .note-wrapper').forEach((wrapper) => {
            if (wrapper.querySelector('.depth-v2-glyph--micro .micro-mock__note')) count++;
        });
        return count;
    },

    isPrewarmComplete() {
        if (this._prewarmComplete) return true;
        const total = typeof AppState !== 'undefined' ? AppState.items.length : 0;
        if (!total) return false;
        return this.countPrewarmedWrappers() >= total;
    },

    invalidatePrewarm() {
        this._prewarmComplete = false;
        this._prewarmScheduled = false;
        this._prewarmToken++;
    },

    prewarmWrapper(wrapper, item) {
        const glyph = wrapper?.querySelector('.depth-v2-glyph--micro');
        if (!glyph || !item) return false;

        const noteId = String(item.id);
        if (wrapper.dataset.microMockNoteId === noteId && glyph.querySelector('.micro-mock__note')) {
            wrapper.dataset.microMockPrewarmed = '1';
            return true;
        }

        glyph.innerHTML = this.buildCardHTML(item, { prewarmCensored: true });
        if (typeof TextDirection !== 'undefined') {
            TextDirection.applyToWrapper(wrapper, item.textDirection);
        }
        wrapper.style.removeProperty('--micro-mock-row-span');
        wrapper.dataset.microMockNoteId = noteId;
        wrapper.dataset.microMockPrewarmed = '1';
        return true;
    },

    prewarmAllSync() {
        if (typeof NoteCensor === 'undefined' || !NoteCensor.isThemeEnabled()) return 0;
        if (typeof AppState === 'undefined' || !AppState.items?.length) return 0;
        if (this.isPrewarmComplete()) return this.countPrewarmedWrappers();


        const wrappers = [...document.querySelectorAll('#app .note-wrapper')];
        const itemsById = new Map(AppState.items.map((item) => [String(item.id), item]));
        let applied = 0;

        wrappers.forEach((wrapper) => {
            const item = itemsById.get(wrapper.dataset.noteId);
            if (item && this.prewarmWrapper(wrapper, item)) applied++;
        });

        this._prewarmComplete = true;
        this._prewarmScheduled = false;


        return applied;
    },

    schedulePrewarm() {
        if (this.isPrewarmComplete()) return;
        if (this._prewarmScheduled) return;
        this._prewarmScheduled = true;
        this.prewarmAllSync();
    },
};
