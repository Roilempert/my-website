/* ==========================================================================
   Text direction — English LTR vs Hebrew RTL note content
   ========================================================================== */
const TextDirection = {
    HEBREW_RE: /[\u0590-\u05FF\uFB1D-\uFB4F]/,
    ARABIC_RE: /[\u0600-\u06FF]/,
    LATIN_RE: /[A-Za-z]/,

    normalizeOverride(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return null;
        if (v === 'ltr' || v === 'en' || v === 'english' || v === 'left') return 'ltr';
        if (v === 'rtl' || v === 'he' || v === 'hebrew' || v === 'right') return 'rtl';
        return null;
    },

    detectFromText(title, body) {
        const text = `${String(title || '')}\n${String(body || '')}`.trim();
        if (!text) return 'rtl';
        if (this.HEBREW_RE.test(text) || this.ARABIC_RE.test(text)) return 'rtl';
        if (this.LATIN_RE.test(text)) return 'ltr';
        return 'rtl';
    },

    resolve(title, body, overrideRaw) {
        const override = this.normalizeOverride(overrideRaw);
        if (override) return override;
        return this.detectFromText(title, body);
    },

    applyToWrapper(wrapper, direction) {
        if (!wrapper) return;
        const dir = direction === 'ltr' ? 'ltr' : 'rtl';
        wrapper.dataset.textDirection = dir;
        wrapper.classList.toggle('is-note-ltr', dir === 'ltr');
        wrapper.classList.toggle('is-note-rtl', dir === 'rtl');

        wrapper.querySelectorAll('.note-card').forEach(card => {
            card.setAttribute('dir', dir);
        });
    }
};
