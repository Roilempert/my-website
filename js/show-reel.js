/* ==========================================================================
   Show Reel — exhibition attract mode + scripted demo driver
   ========================================================================== */
const ShowReel = {
    state: 'off',
    page: null,
    onAutoEnter: null,
    _autoEnterTriggered: false,
    _abortDemo: false,
    _demoGen: 0,
    idleTimerId: null,
    _watching: false,
    cursorEl: null,
    hintEl: null,
    _cursorRAF: null,
    _cursorX: 0,
    _cursorY: 0,
    _cursorTargetX: 0,
    _cursorTargetY: 0,
    _userListenersBound: false,

    cfg() {
        return CONFIG.showReel || {};
    },

    isEnabled() {
        return typeof isShowReelEnabled === 'function' && isShowReelEnabled();
    },

    isActive() {
        return this.state === 'demo';
    },

    consumeAutoEnterFlag() {
        const was = this._autoEnterTriggered;
        this._autoEnterTriggered = false;
        return was;
    },

    init(options = {}) {
        if (!this.isEnabled()) return;

        this.page = options.page || 'experience';
        this.onAutoEnter = options.onAutoEnter || null;

        this._bindUserStopListeners();

        if (this.page === 'opening') {
            if (this.cfg().openingAutoEnter !== false) {
                this.startWatching();
            }
            return;
        }

        if (typeof isShowReelAutostart === 'function' && isShowReelAutostart()) {
            this._waitForExperienceReady(() => this.start({ reason: 'autostart' }));
        } else {
            this._waitForExperienceReady(() => this.startWatching());
        }
    },

    _waitForExperienceReady(cb) {
        const tryReady = () => {
            const app = document.getElementById('app');
            if (!app || app.getAttribute('aria-hidden') === 'true') {
                requestAnimationFrame(tryReady);
                return;
            }
            if (typeof DepthController === 'undefined') {
                requestAnimationFrame(tryReady);
                return;
            }
            cb();
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryReady, { once: true });
        } else {
            tryReady();
        }
    },

    _bindUserStopListeners() {
        if (this._userListenersBound) return;
        this._userListenersBound = true;

        const onUserActivity = (e) => {
            if (this._isInternalEvent(e)) return;

            if (this.state === 'demo') {
                this._exitDemo({ reason: 'user', eventType: e.type });
                return;
            }

            if (this._watching) {
                this._resetIdleTimer();
            }
        };

        ['pointerdown', 'keydown', 'wheel', 'pointermove', 'mousemove'].forEach((ev) => {
            window.addEventListener(ev, onUserActivity, { passive: true, capture: true });
        });
    },

    _exitDemo(options = {}) {
        const target = this.cfg().userExitTarget || 'opening';
        this.stop({ reason: options.reason || 'user', skipResumeWatch: target === 'opening' });

        if (target === 'opening') {
            window.location.assign('opening.html');
        }
    },

    _isInternalEvent() {
        return false;
    },

    startWatching() {
        if (!this.isEnabled() || this.state === 'demo') return;
        this._watching = true;
        this.state = 'watching';
        this._resetIdleTimer();
    },

    stopWatching() {
        this._watching = false;
        clearTimeout(this.idleTimerId);
        this.idleTimerId = null;
        if (this.state === 'watching') this.state = 'off';
    },

    _resetIdleTimer() {
        clearTimeout(this.idleTimerId);
        const ms = this.cfg().idleMs ?? 90_000;
        if (!ms || ms <= 0) return;

        this.idleTimerId = setTimeout(() => this._onIdleTimeout(), ms);
    },

    _onIdleTimeout() {
        if (this.state === 'demo') return;

        if (this.page === 'opening') {
            this._autoEnterTriggered = true;
            if (typeof this.onAutoEnter === 'function') {
                this.onAutoEnter();
            }
            return;
        }

        this.start({ reason: 'idle' });
    },

    start(options = {}) {
        if (!this.isEnabled()) return;
        this.stopWatching();
        this._abortDemo = false;
        this._demoGen += 1;
        const gen = this._demoGen;
        this.state = 'demo';

        document.body.classList.add('is-show-reel');
        this._mountChrome();
        this._runDemo(gen, options.reason || 'manual');
    },

    stop(options = {}) {
        this._abortDemo = true;
        this._demoGen += 1;
        this.state = 'off';

        document.body.classList.remove('is-show-reel');
        this._unmountChrome();

        if (this.page === 'experience' && options.reason === 'user' && !options.skipResumeWatch) {
            this.startWatching();
        }
    },

    async _runDemo(gen, reason) {
        const ctx = this._createContext(gen);
        const scriptKey = this.cfg().script || 'default';
        const factory = ShowReelScripts?.[scriptKey];
        if (typeof factory !== 'function') {
            console.warn('ShowReel: unknown script', scriptKey);
            this.stop();
            return;
        }

        const steps = factory(ctx);
        try {
            for (const step of steps) {
                if (gen !== this._demoGen || this._abortDemo) break;
                this._setCursorTarget(step.cursor);
                if (typeof step.run === 'function') {
                    await step.run(ctx);
                } else if (step.durationMs) {
                    await ctx.delay(step.durationMs);
                }
            }
        } catch (err) {
            console.error('ShowReel demo failed:', err);
        }

        if (gen !== this._demoGen || this._abortDemo) return;

        await this._handleEnd(gen);
    },

    async _handleEnd(gen) {
        const behavior = this.cfg().endBehavior || 'loop';

        if (behavior === 'opening') {
            window.location.assign('opening.html');
            return;
        }

        if (behavior === 'hold') {
            this.state = 'demo';
            return;
        }

        const pauseMs = this.cfg().loopPauseMs ?? 4000;
        await this._delay(pauseMs, gen);
        if (gen !== this._demoGen || this._abortDemo) return;

        this.start({ reason: 'loop' });
    },

    _createContext(gen) {
        const self = this;
        return {
            delay(ms) {
                return self._delay(ms, gen);
            },

            scrollTo(dx, dy, ms) {
                return self._scrollTo(dx, dy, ms, gen);
            },

            centerCanvas() {
                if (typeof AppState !== 'undefined' && AppState.centerViewport) {
                    AppState.centerViewport({ smooth: true });
                }
                return self._delay(900, gen);
            },

            openWarehouse() {
                if (typeof ActionWarehouse !== 'undefined') {
                    ActionWarehouse.openPopup();
                }
            },

            closeWarehouse() {
                if (typeof ActionWarehouse !== 'undefined') {
                    ActionWarehouse.closePopup(true);
                }
            },

            pickTagBlock() {
                if (typeof ActionWarehouse === 'undefined') return null;
                const blocks = ActionWarehouse.blocks || [];
                return blocks.find((b) =>
                    b.state === 'docked' &&
                    !b.nestedIn &&
                    b.type !== 'frame' &&
                    ActionWarehouse.isActiveCaptureBlock(b)
                ) || blocks.find((b) =>
                    b.state === 'docked' && !b.nestedIn && b.type !== 'frame'
                ) || null;
            },

            placeBlock(block, pageX, pageY) {
                if (typeof ActionWarehouse !== 'undefined') {
                    ActionWarehouse.deployBlockAtPageCoords(block, pageX, pageY);
                }
            },

            waitCaptureSettle(ms) {
                return self._delay(ms, gen);
            },

            goToL2() {
                if (typeof DepthController !== 'undefined' &&
                    DepthController.currentLevel === 1) {
                    DepthController.changeLevel(3);
                }
                return self._delay(600, gen);
            },

            goToL1() {
                if (typeof DepthController !== 'undefined' &&
                    DepthController.currentLevel !== 1) {
                    DepthController.changeLevel(1);
                }
                return self._delay(600, gen);
            },

            resetBoard() {
                if (typeof ActionWarehouse !== 'undefined') {
                    ActionWarehouse.resetAll();
                }
            }
        };
    },

    _delay(ms, gen) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (gen !== this._demoGen || this._abortDemo) resolve();
                else resolve();
            }, ms);
        });
    },

    _scrollTo(dx, dy, ms, gen) {
        return new Promise((resolve) => {
            if (typeof SpatialNavigation !== 'undefined') {
                SpatialNavigation.bypassScrollClamp(ms + 120);
            }
            const start = performance.now();
            const startX = window.pageXOffset;
            const startY = window.pageYOffset;

            const tick = (now) => {
                if (gen !== this._demoGen || this._abortDemo) {
                    resolve();
                    return;
                }
                const t = Math.min(1, (now - start) / ms);
                const ease = t < 0.5
                    ? 2 * t * t
                    : 1 - Math.pow(-2 * t + 2, 2) / 2;
                window.scrollTo(startX + dx * ease, startY + dy * ease);
                if (t < 1) {
                    requestAnimationFrame(tick);
                } else {
                    resolve();
                }
            };
            requestAnimationFrame(tick);
        });
    },

    _mountChrome() {
        const cfg = this.cfg();
        if (cfg.ghostCursor !== false) {
            this._mountCursor();
        }
        const hint = cfg.labels?.hint;
        if (hint) {
            this._mountHint(hint);
        }
    },

    _unmountChrome() {
        if (this._cursorRAF) {
            cancelAnimationFrame(this._cursorRAF);
            this._cursorRAF = null;
        }
        this.cursorEl?.remove();
        this.cursorEl = null;
        this.hintEl?.remove();
        this.hintEl = null;
    },

    _mountCursor() {
        if (this.cursorEl) return;
        const el = document.createElement('div');
        el.id = 'show-reel-cursor';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        this.cursorEl = el;
        this._cursorX = window.innerWidth * 0.5;
        this._cursorY = window.innerHeight * 0.5;
        this._cursorTargetX = this._cursorX;
        this._cursorTargetY = this._cursorY;
        this._applyCursorTransform();
        this._tickCursor();
    },

    _mountHint(text) {
        if (this.hintEl) return;
        const el = document.createElement('p');
        el.className = 'show-reel-hint general-t';
        el.textContent = text;
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        this.hintEl = el;
    },

    _setCursorTarget(cursor) {
        if (!this.cursorEl || typeof cursor !== 'function') return;
        const pos = cursor();
        if (!pos) return;
        this._cursorTargetX = pos.x;
        this._cursorTargetY = pos.y;
    },

    _tickCursor() {
        if (!this.cursorEl) return;
        const lerp = 0.14;
        this._cursorX += (this._cursorTargetX - this._cursorX) * lerp;
        this._cursorY += (this._cursorTargetY - this._cursorY) * lerp;
        this._applyCursorTransform();
        this._cursorRAF = requestAnimationFrame(() => this._tickCursor());
    },

    _applyCursorTransform() {
        if (!this.cursorEl) return;
        this.cursorEl.style.transform =
            `translate3d(${this._cursorX}px, ${this._cursorY}px, 0) translate(-50%, -50%)`;
    }
};
