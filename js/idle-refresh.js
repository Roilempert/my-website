/* ==========================================================================
   01. SYSTEM BOOTSTRAP
   ========================================================================== */
const IdleRefresh = {
    timerId: null,
    _enabled: false,

    touch() {
        if (!this._enabled) return;
        clearTimeout(this.timerId);
        this.timerId = setTimeout(
            () => window.location.reload(),
            CONFIG.boot.idleRefreshMs
        );
    },

    init() {
        const ms = CONFIG.boot.idleRefreshMs;
        if (!ms || ms <= 0) return;

        this._enabled = true;
        const onActivity = () => this.touch();

        ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(ev => {
            window.addEventListener(ev, onActivity, { passive: true, capture: true });
        });
        window.addEventListener('scroll', onActivity, { passive: true });
        window.addEventListener('mousemove', onActivity, { passive: true });

        this.touch();
    }
};

