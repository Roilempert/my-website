/* ==========================================================================
   Note censor — L3 redacted theme (same grid/cards as original, bars not text)
   ========================================================================== */
const NoteCensor = {
    _boundRevealMove: null,
    _wordIndex: null,
    _linkSvg: null,
    _linkAnimToken: 0,
    _activeSourceWord: null,
    _activeKey: null,
    _activeRoutes: [],
    _dwellTimer: null,
    _dwellWord: null,
    _committedKeys: null,
    _persistedRoutes: null,
    _persistedSources: null,
    _retractingRoutes: null,
    _wordNoteIndex: null,

    _initPersistState() {
        if (!this._committedKeys) {
            this._committedKeys = new Set();
            this._persistedRoutes = [];
            this._persistedSources = new Map();
        }
    },

    _dwellMs() {
        return this.cfg().dwellMs ?? 1000;
    },

    _isCommitted(key) {
        this._initPersistState();
        return !!key && this._committedKeys.has(key);
    },

    _cancelDwell() {
        if (this._dwellTimer) {
            clearTimeout(this._dwellTimer);
            this._dwellTimer = null;
        }
        this._dwellWord = null;
    },

    _startDwell(word) {
        this._cancelDwell();
        if (!word || this._isCommitted(this._wordKey(word))) return;
        this._dwellWord = word;
        this._dwellTimer = setTimeout(() => {
            this._dwellTimer = null;
            this._commitActiveHover();
        }, this._dwellMs());
    },

    _commitActiveHover() {
        if (!this._activeSourceWord || this._dwellWord !== this._activeSourceWord) return;

        this._initPersistState();
        const key = this._activeKey;
        const sourceWord = this._activeSourceWord;
        if (!key || !sourceWord) return;

        this._committedKeys.add(key);
        this._persistedSources.set(key, sourceWord);

        const cfg = this._linkCfg();
        this._linkAnimToken += 1;
        const token = this._linkAnimToken;

        const routes = this._activeRoutes.slice();
        this._activeRoutes = [];

        routes.forEach((route) => {
            route.key = key;
            route.sourceWord = sourceWord;
            route.isPersisted = true;
            this._persistedRoutes.push(route);
            this._completeRouteStretch(route.trail, token, cfg);
        });

        this._cancelDwell();
        this._activeSourceWord = null;
        this._activeKey = null;
        this._wordsForKey(key).forEach((word) => word.classList.add('is-word-committed'));

        if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.addCommittedWord) {
            ActionWarehouse.addCommittedWord(key);
        }

        this.refreshStudyUnlocks();
    },

    _removeRouteGroups(routes) {
        (routes || []).forEach((route) => route.group?.remove?.());
    },

    _syncLinkOverlayActive() {
        if (!this._linkSvg) return;
        this._linkSvg.classList.toggle('is-active', !!this._linkSvg.firstChild);
    },

    _abortRetractInProgress() {
        if (!this._retractingRoutes?.length) return;
        this._removeRouteGroups(this._retractingRoutes);
        this._retractingRoutes = [];
        this._syncLinkOverlayActive();
    },

    _clearActiveRouteGroups() {
        this._removeRouteGroups(this._activeRoutes);
        this._activeRoutes = [];
    },

    _linkCfg() {
        const cfg = this.cfg().wordLinks || {};
        return {
            duration: cfg.duration ?? 1650,
            stagger: cfg.stagger ?? 175,
            staggerSpreadMs: cfg.staggerSpreadMs ?? 900,
            retractStaggerSpreadMs: cfg.retractStaggerSpreadMs ?? 0,
            revertDuration: cfg.revertDuration ?? 920,
            maxLinks: cfg.maxLinks ?? 48,
            opacityMin: cfg.opacityMin ?? 0,
            opacityMax: cfg.opacityMax ?? 0.82,
            strokeWidthStart: cfg.strokeWidthStart ?? 0.9,
            strokeWidthEnd: cfg.strokeWidthEnd ?? 2.5,
            curveBend: cfg.curveBend ?? 0.24
        };
    },

    _routeStaggerMs(count, spreadMs, cfg) {
        if (count <= 1) return 0;
        const spread = spreadMs ?? 0;
        if (spread <= 0) return 0;
        return Math.min(cfg.stagger ?? 175, spread / (count - 1));
    },

    _updateRouteGeometry(trail, from, to, routeIndex, cfg, snapFull = false) {
        const prevLen = trail.getTotalLength();
        const prevOffset = Number.parseFloat(trail.style.strokeDashoffset);
        const prevOp = trail.style.opacity;
        const prevSw = trail.getAttribute('stroke-width');

        trail.setAttribute('d', this._buildRoutePath(from, to, routeIndex).d);
        const nextLen = trail.getTotalLength();

        if (snapFull || prevLen <= 0 || !Number.isFinite(prevOffset)) {
            this._finishRoute(trail, cfg);
            return;
        }

        const progress = Math.max(0, Math.min(1, (prevLen - prevOffset) / prevLen));
        trail.style.strokeDasharray = `${nextLen}`;
        trail.style.strokeDashoffset = `${nextLen * (1 - progress)}`;
        if (prevOp) trail.style.opacity = prevOp;
        if (prevSw) trail.setAttribute('stroke-width', prevSw);
    },

    isThemeEnabled() {
        return (CONFIG.theme?.mode || 'default') === 'censored';
    },

    isActive() {
        if (!this.isThemeEnabled()) return false;
        return typeof DepthController !== 'undefined' && DepthController.currentLevel === 3;
    },

    init() {
        const level = typeof DepthController !== 'undefined' ? DepthController.currentLevel : 1;
        this.onLevelChange(level);
        if (!this._boundRevealMove) {
            this._boundRevealMove = (e) => this._updateWordReveal(e.clientX, e.clientY);
            this._boundRevealScroll = () => this._onRevealLayoutChange();
            this._boundRevealResize = () => this._onRevealLayoutChange();
            window.addEventListener('mousemove', this._boundRevealMove, { passive: true });
            window.addEventListener('scroll', this._boundRevealScroll, { passive: true, capture: true });
            window.addEventListener('resize', this._boundRevealResize, { passive: true });
        }
    },

    onLevelChange(level) {
        document.body.classList.toggle('is-theme-censored', this.isThemeEnabled() && level === 3);
        if (!(this.isThemeEnabled() && level === 3)) {
            this._releaseActiveHover(true);
            this._invalidateWordHitCache();
        } else {
            this._initPersistState();
            this._committedKeys.forEach((key) => {
                this._uncoverMatches(key);
                this._wordsForKey(key).forEach((word) => word.classList.add('is-word-committed'));
            });
            this._refreshPersistedRoutes();
            this.refreshStudyUnlocks();
        }
        if (typeof ActionWarehouse !== 'undefined' && ActionWarehouse.syncWordPanelMode) {
            ActionWarehouse.syncWordPanelMode(level);
        }
        if (this.isThemeEnabled() && level === 3 &&
            typeof ArtifactInspector !== 'undefined' && ArtifactInspector.isActive) {
            ArtifactInspector.close();
        }
    },

    /** Topmost censored word under pointer — skips already-committed tokens. */
    hitWordAt(clientX, clientY) {
        if (!this.isActive()) return null;

        let word = null;
        if (typeof document.elementsFromPoint === 'function') {
            const stack = document.elementsFromPoint(clientX, clientY);
            for (const el of stack) {
                word = el?.closest?.('.note-redact__word');
                if (word) break;
            }
        } else {
            word = this._hitWordByRect(clientX, clientY);
        }

        if (!word || this._isCommitted(this._wordKey(word))) return null;
        return word;
    },

    _invalidateWordHitCache() {
        this._wordHitCache = null;
        this._wordIndex = null;
        this._wordNoteIndex = null;
    },

    invalidateWordLayout() {
        this._invalidateWordHitCache();
        this._initPersistState();
        this._committedKeys.forEach((key) => {
            this._uncoverMatches(key);
            this._wordsForKey(key).forEach((word) => word.classList.add('is-word-committed'));
        });
        if (this._activeKey) this._uncoverMatches(this._activeKey);
        this._refreshPersistedRoutes();
        this._refreshActiveRoutes();
        this.refreshStudyUnlocks();
    },

    _wordKey(wordEl) {
        return String(wordEl?.textContent || '');
    },

    _buildWordIndex() {
        const index = new Map();
        const noteIndex = new Map();
        document.querySelectorAll('.note-redact__word').forEach((word) => {
            const key = this._wordKey(word);
            if (!key) return;
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(word);

            const noteId = word.closest?.('.micro-mock__card')?.dataset?.noteId
                || word.closest?.('.note-wrapper')?.dataset?.noteId;
            if (noteId) {
                if (!noteIndex.has(key)) noteIndex.set(key, new Set());
                noteIndex.get(key).add(String(noteId));
            }
        });
        this._wordIndex = index;
        this._wordNoteIndex = noteIndex;
    },

    _noteIdsForCommittedKeys() {
        this._initPersistState();
        const ids = new Set();
        if (this._committedKeys.size && !this._wordNoteIndex) this._buildWordIndex();
        this._committedKeys.forEach((key) => {
            const noteIds = this._wordNoteIndex?.get(key);
            if (noteIds) noteIds.forEach((id) => ids.add(id));
        });
        return ids;
    },

    refreshStudyUnlocks() {
        if (!this.isActive()) {
            document.querySelectorAll('.note-wrapper.is-study-unlocked').forEach((wrapper) => {
                wrapper.classList.remove('is-study-unlocked');
            });
            return;
        }

        const unlockedIds = this._noteIdsForCommittedKeys();
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            const noteId = String(wrapper.dataset?.noteId || '');
            wrapper.classList.toggle('is-study-unlocked', !!(noteId && unlockedIds.has(noteId)));
        });
    },

    isNoteStudyUnlocked(wrapper) {
        if (!this.isActive() || !wrapper) return false;
        return wrapper.classList.contains('is-study-unlocked');
    },

    allowsStudyNoteOpen(wrapper) {
        return this.isNoteStudyUnlocked(wrapper);
    },

    _wordsForKey(key) {
        if (!key) return [];
        if (!this._wordIndex) this._buildWordIndex();
        return this._wordIndex.get(key) || [];
    },

    _uncoverMatches(key) {
        this._wordsForKey(key).forEach((word) => word.classList.add('is-revealed'));
    },

    _coverMatches(key) {
        if (!key || this._isCommitted(key)) return;
        this._wordsForKey(key).forEach((word) => {
            if (word.isConnected) word.classList.remove('is-revealed');
        });
    },

    _clearAllHoverState() {
        this._cancelDwell();
        this._initPersistState();
        this._committedKeys.forEach((key) => {
            this._wordsForKey(key).forEach((word) => {
                if (word.isConnected) {
                    word.classList.remove('is-revealed', 'is-word-committed');
                }
            });
        });
        this._committedKeys.clear();
        this._persistedSources.clear();
        this._persistedRoutes = [];
        this._activeSourceWord = null;
        this._activeKey = null;
        this._cancelLinkAnimations();
        this._activeRoutes = [];
        this._retractingRoutes = [];
        this._clearWordLinks();
        this.refreshStudyUnlocks();
    },

    _releaseActiveHover(immediate = false, onComplete) {
        if (!this._activeSourceWord && !this._activeRoutes.length && !this._retractingRoutes?.length) {
            this._cancelDwell();
            onComplete?.();
            return;
        }

        const key = this._activeKey;
        const committed = this._isCommitted(key);
        this._activeSourceWord = null;
        this._activeKey = null;
        this._cancelDwell();

        if (!committed) {
            this._coverMatches(key);
            const routesToRetract = this._activeRoutes.slice();
            this._activeRoutes = [];

            if (!routesToRetract.length || immediate) {
                this._cancelLinkAnimations();
                this._removeRouteGroups(routesToRetract);
                onComplete?.();
                return;
            }

            this._stopStretchAndRetract(routesToRetract, onComplete);
            return;
        }

        this._activeRoutes = [];
        onComplete?.();
    },

    _resetHoverState(immediate = false, onComplete) {
        this._releaseActiveHover(immediate, onComplete);
    },

    _activateHover(sourceWord) {
        if (!sourceWord) return;

        const key = this._wordKey(sourceWord);
        if (this._isCommitted(key)) return;

        this._activeSourceWord = sourceWord;
        this._activeKey = key;
        this._uncoverMatches(key);

        this._cancelLinkAnimations();
        this._clearActiveRouteGroups();

        const matches = this._wordsForKey(key);
        if (matches.length > 1) {
            this._buildActiveRoutes(sourceWord, matches);
        }

        this._startDwell(sourceWord);
    },

    _switchActiveHover(sourceWord) {
        if (!sourceWord) return;

        const key = this._wordKey(sourceWord);
        if (this._isCommitted(key)) {
            this._releaseActiveHover(true);
            return;
        }

        const oldKey = this._activeKey;
        const sameKey = oldKey === key;

        if (sameKey) {
            this._activeSourceWord = sourceWord;
            this._cancelDwell();
            this._startDwell(sourceWord);
            this._refreshActiveRoutes();
            return;
        }

        this._releaseActiveHover(true);
        this._activateHover(sourceWord);
    },

    _stopStretchAndRetract(routes, onComplete) {
        this._abortRetractInProgress();
        this._linkAnimToken += 1;
        const token = this._linkAnimToken;
        this._retractingRoutes = routes;

        if (!routes.length) {
            this._retractingRoutes = [];
            onComplete?.();
            return;
        }

        const cfg = this._linkCfg();
        let remaining = routes.length;
        const staggerStep = this._routeStaggerMs(routes.length, cfg.retractStaggerSpreadMs, cfg);

        const onRouteDone = () => {
            remaining -= 1;
            if (remaining <= 0) {
                this._retractingRoutes = [];
                this._syncLinkOverlayActive();
                onComplete?.();
            }
        };

        routes.forEach((route, index) => {
            this._retractRoute(route.trail, index * staggerStep, token, () => {
                onRouteDone();
            });
        });
    },

    _onRevealLayoutChange() {
        this._invalidateWordHitCache();
        if (this._linkLayoutRaf) return;
        this._linkLayoutRaf = requestAnimationFrame(() => {
            this._linkLayoutRaf = null;
            this._refreshPersistedRoutes();
            this._refreshActiveRoutes();
        });
    },

    _refreshPersistedRoutesForKey(key, sourceWord) {
        if (!key || !sourceWord?.isConnected) return;
        this._initPersistState();
        this._persistedSources.set(key, sourceWord);
        const cfg = this._linkCfg();
        const from = this._wordAnchor(sourceWord);

        this._persistedRoutes = this._persistedRoutes.filter((route) => {
            if (route.key !== key) return true;
            if (!route.targetWord?.isConnected) {
                route.group?.remove?.();
                return false;
            }
            const to = this._wordAnchor(route.targetWord);
            const snapFull = this._routeStretchProgress(route.trail) >= 0.995;
            this._updateRouteGeometry(route.trail, from, to, route.routeIndex, cfg, snapFull);
            route.sourceWord = sourceWord;
            return true;
        });
    },

    _refreshPersistedRoutes() {
        this._initPersistState();
        this._persistedSources.forEach((sourceWord, key) => {
            this._refreshPersistedRoutesForKey(key, sourceWord);
        });
    },

    _refreshActiveRoutes() {
        if (!this._activeSourceWord?.isConnected) return;
        const cfg = this._linkCfg();
        const from = this._wordAnchor(this._activeSourceWord);

        this._activeRoutes = this._activeRoutes.filter((route) => {
            if (!route.targetWord?.isConnected) {
                route.group?.remove?.();
                return false;
            }
            const to = this._wordAnchor(route.targetWord);
            this._updateRouteGeometry(route.trail, from, to, route.routeIndex, cfg, false);
            return true;
        });
    },

    _wordInstanceId(wordEl) {
        const noteId = wordEl?.closest?.('.micro-mock__card')?.dataset?.noteId || '';
        return `${noteId}:${this._wordKey(wordEl)}`;
    },

    _ensureLinkOverlay() {
        if (this._linkSvg) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'note-censor-word-links');
        svg.setAttribute('aria-hidden', 'true');
        document.body.appendChild(svg);
        this._linkSvg = svg;
    },

    _wordAnchor(wordEl) {
        const rect = wordEl.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    },

    _easeStretch(t) {
        if (t >= 1) return 1;
        return 1 - Math.pow(1 - t, 5);
    },

    _easeFlight(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    _easeStroke(t) {
        if (t >= 1) return 1;
        return 1 - Math.pow(2, -8 * t);
    },

    _buildRoutePath(from, to, routeIndex) {
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const bendSign = routeIndex % 2 === 0 ? 1 : -1;
        const bend = Math.min(140, dist * (this._linkCfg().curveBend ?? 0.24)) * bendSign;
        const cx = mx + (-dy / dist) * bend;
        const cy = my + (dx / dist) * bend;
        return {
            d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`
        };
    },

    _createRouteLink(from, to, routeIndex) {
        const { d } = this._buildRoutePath(from, to, routeIndex);
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'note-censor-word-links__route');

        const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        trail.setAttribute('class', 'note-censor-word-links__trail');
        trail.setAttribute('d', d);
        trail.setAttribute('fill', 'none');

        group.appendChild(trail);

        return { group, trail };
    },

    _finishRoute(trail, cfg) {
        const len = trail.getTotalLength();
        trail.style.strokeDasharray = `${len}`;
        trail.style.strokeDashoffset = '0';
        trail.style.opacity = String(cfg.opacityMax);
        trail.setAttribute('stroke-width', String(cfg.strokeWidthEnd));
    },

    _routeStretchProgress(trail) {
        const len = trail.getTotalLength();
        if (len <= 0) return 1;
        const off = Number.parseFloat(trail.style.strokeDashoffset);
        if (!Number.isFinite(off)) return 0;
        return Math.max(0, Math.min(1, (len - off) / len));
    },

    _completeRouteStretch(trail, token, cfg) {
        const progress = this._routeStretchProgress(trail);
        if (progress >= 0.995) {
            this._finishRoute(trail, cfg);
            return;
        }

        const parsedOp = Number.parseFloat(trail.style.opacity);
        const opacityStart = Number.isFinite(parsedOp) ? parsedOp : cfg.opacityMin;
        const parsedSw = Number.parseFloat(trail.getAttribute('stroke-width'));
        const swStart = Number.isFinite(parsedSw) ? parsedSw : cfg.strokeWidthStart;
        const remainMs = Math.max(220, (1 - progress) * cfg.duration);
        const startAt = performance.now();

        const tick = (now) => {
            if (token !== this._linkAnimToken || !trail.isConnected) return;

            const curLen = trail.getTotalLength();
            const t = Math.min(1, (now - startAt) / remainMs);
            const flight = this._easeFlight(t);
            const p = progress + (1 - progress) * flight;

            trail.style.strokeDasharray = `${curLen}`;
            trail.style.strokeDashoffset = `${curLen * (1 - p)}`;
            trail.style.opacity = String(opacityStart + (cfg.opacityMax - opacityStart) * flight);
            const sw = swStart + (cfg.strokeWidthEnd - swStart) * flight;
            trail.setAttribute('stroke-width', String(sw));

            if (t >= 1) {
                this._finishRoute(trail, cfg);
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    },

    _animateRoute(trail, delayMs, token) {
        const cfg = this._linkCfg();
        const startAt = performance.now() + delayMs;
        const len = trail.getTotalLength();

        trail.style.strokeDasharray = `${len}`;
        trail.style.strokeDashoffset = `${len}`;
        trail.style.opacity = String(cfg.opacityMin);
        trail.setAttribute('stroke-width', String(cfg.strokeWidthStart));

        const tick = (now) => {
            if (token !== this._linkAnimToken || !trail.isConnected) return;

            if (now < startAt) {
                requestAnimationFrame(tick);
                return;
            }

            const len = trail.getTotalLength();
            const t = Math.min(1, (now - startAt) / cfg.duration);
            const flight = this._easeFlight(t);
            const strokeP = this._easeStroke(t);
            const traveled = len * flight;

            trail.style.strokeDashoffset = `${len - traveled}`;
            trail.style.opacity = String(cfg.opacityMin + (cfg.opacityMax - cfg.opacityMin) * strokeP);
            const sw = cfg.strokeWidthStart + (cfg.strokeWidthEnd - cfg.strokeWidthStart) * strokeP;
            trail.setAttribute('stroke-width', String(sw));

            if (t >= 1) {
                this._finishRoute(trail, cfg);
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    },

    _retractRoute(trail, delayMs, token, onComplete) {
        const cfg = this._linkCfg();
        const group = trail.parentNode;
        const startAt = performance.now() + delayMs;
        const len = trail.getTotalLength();

        const removeGroup = () => {
            if (group?.isConnected) group.remove();
            else if (trail.isConnected && trail.parentNode) trail.parentNode.remove();
        };

        const finish = () => {
            removeGroup();
            onComplete?.();
        };

        if (len <= 0) {
            finish();
            return;
        }

        trail.style.strokeDasharray = `${len}`;
        const startOffset = Number.parseFloat(trail.style.strokeDashoffset);
        const visible = Number.isFinite(startOffset) ? Math.max(0, len - startOffset) : 0;

        const tick = (now) => {
            if (token !== this._linkAnimToken) {
                finish();
                return;
            }
            if (!trail.isConnected) {
                onComplete?.();
                return;
            }

            if (now < startAt) {
                requestAnimationFrame(tick);
                return;
            }

            const t = Math.min(1, (now - startAt) / cfg.revertDuration);
            const flight = this._easeFlight(t);
            const traveled = visible * (1 - flight);

            trail.style.strokeDashoffset = `${len - traveled}`;
            trail.style.opacity = String(cfg.opacityMax * (1 - flight * 0.9));
            const sw = cfg.strokeWidthEnd - (cfg.strokeWidthEnd - cfg.strokeWidthStart) * flight;
            trail.setAttribute('stroke-width', String(sw));

            if (t >= 1) {
                finish();
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    },

    _cancelLinkAnimations() {
        this._linkAnimToken += 1;
        this._abortRetractInProgress();
    },

    _buildActiveRoutes(sourceWord, matches) {
        if (!this.isActive() || !sourceWord || matches.length <= 1) return;

        if (!this._linkSvg) this._ensureLinkOverlay();
        const svg = this._linkSvg;
        const cfg = this._linkCfg();
        const from = this._wordAnchor(sourceWord);
        const token = this._linkAnimToken;
        const key = this._wordKey(sourceWord);

        const targets = matches
            .filter((word) => word !== sourceWord)
            .map((word) => ({ word, anchor: this._wordAnchor(word) }))
            .sort((a, b) => {
                const da = Math.hypot(a.anchor.x - from.x, a.anchor.y - from.y);
                const db = Math.hypot(b.anchor.x - from.x, b.anchor.y - from.y);
                return da - db;
            })
            .slice(0, cfg.maxLinks);

        const staggerStep = this._routeStaggerMs(targets.length, cfg.staggerSpreadMs, cfg);

        targets.forEach(({ word, anchor: to }, index) => {
            const routeIndex = index;
            const { group, trail } = this._createRouteLink(from, to, routeIndex);
            svg.appendChild(group);
            this._animateRoute(trail, index * staggerStep, token);

            this._activeRoutes.push({
                key,
                sourceWord,
                targetWord: word,
                group,
                trail,
                routeIndex
            });
        });

        svg.classList.add('is-active');
    },

    _clearWordLinks() {
        if (!this._linkSvg) return;
        while (this._linkSvg.firstChild) this._linkSvg.removeChild(this._linkSvg.firstChild);
        this._linkSvg.classList.remove('is-active');
        this._initPersistState();
        this._persistedRoutes = [];
    },

    _hitWordByRect(clientX, clientY) {
        const now = performance.now();
        if (!this._wordHitCache || now - this._wordHitCacheAt > 400) {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            this._wordHitCache = [];
            document.querySelectorAll('.note-redact__word').forEach((word) => {
                const r = word.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
                this._wordHitCache.push({ word, r });
            });
            this._wordHitCacheAt = now;
        }

        let best = null;
        let bestArea = Infinity;
        for (const { word, r } of this._wordHitCache) {
            if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
            if (this._isCommitted(this._wordKey(word))) continue;
            const area = r.width * r.height;
            if (area < bestArea) {
                bestArea = area;
                best = word;
            }
        }
        return best;
    },

    _updateWordReveal(clientX, clientY) {
        if (!this.isActive()) {
            this._clearAllHoverState();
            return;
        }
        if (this._revealRaf) return;
        this._revealPending = { x: clientX, y: clientY };
        this._revealRaf = requestAnimationFrame(() => {
            this._revealRaf = null;
            const pending = this._revealPending;
            if (!pending) return;

            const word = this.hitWordAt(pending.x, pending.y);

            if (word === this._activeSourceWord) return;

            if (this._activeSourceWord) {
                if (word) {
                    this._switchActiveHover(word);
                } else {
                    this._resetHoverState(false);
                }
                return;
            }

            if (word) this._activateHover(word);
        });
    },

    /** Censored theme — skip L1→L3 auto-open inspector; L3 study opens via allowsStudyNoteOpen. */
    blocksNoteFocus() {
        return this.isThemeEnabled();
    },

    cfg() {
        return CONFIG.theme || {};
    },

    escapeHTML(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    /** Tag colors for word covers — cycles when a note has multiple tags. */
    _resolveTagColors(item) {
        const tags = (item?.tags || []).filter((t) => t?.color);
        if (tags.length) return tags.map((t) => t.color);
        return [CONFIG.data?.fallbackTagColor || 'var(--color-4)'];
    },

    _sanitizeCoverColor(color) {
        const c = String(color || '').trim();
        if (/^#[0-9A-Fa-f]{3,8}$/.test(c)) return c;
        if (/^var\(--[\w-]+\)$/.test(c)) return c;
        if (/^rgba?\(/.test(c)) return c;
        return CONFIG.data?.fallbackTagColor || 'var(--color-4)';
    },

    _wordCoverStyle(tagColors, wordIndex) {
        const color = this._sanitizeCoverColor(tagColors[wordIndex % tagColors.length]);
        return ` style="--word-cover-color:${color}"`;
    },

    /** Split visible text into hover-reveal word tokens (whitespace-separated). */
    tokenizeWords(text) {
        return String(text || '').split(/\s+/).filter(Boolean);
    },

    buildWordsBlock(text, extraClass = '', tagColors = null) {
        const colors = tagColors || [CONFIG.data?.fallbackTagColor || 'var(--color-4)'];
        const paragraphs = String(text || '').split(/\r?\n/);
        const chunks = [];
        let wordIndex = 0;

        paragraphs.forEach((paragraph) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return;

            if (chunks.length) {
                chunks.push('<span class="note-redact__break" aria-hidden="true"></span>');
            }

            this.tokenizeWords(trimmed).forEach((word, indexInLine) => {
                if (indexInLine > 0) chunks.push(' ');
                const coverStyle = this._wordCoverStyle(colors, wordIndex);
                wordIndex += 1;
                chunks.push(`<span class="note-redact__word"${coverStyle}>${this.escapeHTML(word)}</span>`);
            });
        });

        if (!chunks.length) return '';
        return `<span class="note-redact note-redact--words ${extraClass}">${chunks.join('')}</span>`;
    },

    _hashUnit(seed) {
        const s = String(seed ?? '');
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return ((h >>> 0) % 10000) / 10000;
    },

    /** Match depth-v2 layout weight — visual lines after soft wrap. */
    expandVisualLines(text, wrapAt) {
        const lines = [];
        String(text || '').split(/\r?\n/).forEach((paragraph) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return;
            const chars = Array.from(trimmed);
            if (chars.length <= wrapAt) {
                lines.push(trimmed);
                return;
            }
            for (let i = 0; i < chars.length; i += wrapAt) {
                lines.push(chars.slice(i, i + wrapAt).join(''));
            }
        });
        return lines;
    },

    buildBars(text, seed, options = {}) {
        const wrapAt = options.wrapAt ?? 38;
        const minW = options.minWidth ?? 0.24;
        const maxW = options.maxWidth ?? 0.96;
        const lines = this.expandVisualLines(text, wrapAt);
        if (!lines.length) return '';

        return lines.map((line, i) => {
            const chars = Array.from(line.replace(/\s+/g, ' ')).length || 4;
            const lengthBias = Math.min(maxW, Math.max(minW, chars / wrapAt * 0.92));
            const jitter = (this._hashUnit(`${seed}:${i}`) - 0.5) * 0.1;
            const w = Math.min(maxW, Math.max(minW, lengthBias + jitter));
            return `<span class="note-redact__bar" style="width:${Math.round(w * 100)}%"></span>`;
        }).join('');
    },

    buildRedactBlock(text, seed, extraClass = '', options = {}) {
        const bars = this.buildBars(text, seed, options);
        if (!bars) return '';
        return `<span class="note-redact ${extraClass}">${bars}</span>`;
    },

    buildTitleHTML(item) {
        const title = String(item?.title || '').trim();
        if (!title) return '';
        const tagColors = this._resolveTagColors(item);
        const inner = this.buildWordsBlock(title, 'note-redact--title', tagColors);
        return `<h2 class="note-title note-h">${inner}</h2>`;
    },

    buildBodyHTML(item) {
        const body = String(item?.body || '');
        if (!String(body).trim()) return '';
        const tagColors = this._resolveTagColors(item);
        const inner = this.buildWordsBlock(body, 'note-redact--body', tagColors);
        return `<div class="note-body note-t">${inner}</div>`;
    },

    buildIdHTML(item) {
        const idText = String(item?.id || '').trim();
        if (!idText) return '';
        return `<div class="note-idcode general-t">${this.escapeHTML(idText)}</div>`;
    },

    buildCardOnlyHTML(item, options = {}) {
        const esc = this.escapeHTML.bind(this);
        const focusClass = options.focusScale ? ' micro-mock__card--focus' : '';
        const dir = item.textDirection === 'ltr' ? 'ltr' : 'rtl';
        return `<div class="micro-mock__card note-card${focusClass}" data-note-id="${esc(item.id)}" dir="${dir}">` +
            this.buildIdHTML(item) +
            this.buildTitleHTML(item) +
            this.buildBodyHTML(item) +
            `</div>`;
    },

    buildMetadataValueHTML(label, item) {
        const seed = `${item?.id}:meta:${label}`;
        return this.buildRedactBlock('████████', seed, 'note-redact--meta', {
            wrapAt: 20,
            minWidth: 0.28,
            maxWidth: 0.72
        });
    }
};
