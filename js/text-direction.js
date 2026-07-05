/* ==========================================================================
   Text direction — Latin-script LTR vs Hebrew/Arabic RTL note content
   ========================================================================== */
const TextDirection = {
    RTL_SCRIPT_RE: /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,
    LATIN_SCRIPT_RE: /\p{Script=Latin}/u,

    LTR_OVERRIDE_RE: /^(ltr|left|en|english|fr|french|français|es|spanish|español|de|german|deutsch|it|italian|italiano|pt|portuguese|português|nl|dutch|pl|polish|sv|swedish|da|danish|no|norwegian|fi|finnish|cs|czech|ro|romanian|hu|hungarian|tr|turkish|ca|catalan|eu|basque|gl|galician|is|icelandic|la|latin)$/,

    RTL_OVERRIDE_RE: /^(rtl|right|he|hebrew|ar|arabic)$/,

    normalizeOverride(raw) {
        const v = String(raw || '').trim().toLowerCase();
        if (!v) return null;
        if (this.LTR_OVERRIDE_RE.test(v)) return 'ltr';
        if (this.RTL_OVERRIDE_RE.test(v)) return 'rtl';
        return null;
    },

    detectFromText(title, body) {
        const text = `${String(title || '')}\n${String(body || '')}`.trim();
        if (!text) return 'rtl';
        if (this.RTL_SCRIPT_RE.test(text)) return 'rtl';
        if (this.LATIN_SCRIPT_RE.test(text)) return 'ltr';
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
