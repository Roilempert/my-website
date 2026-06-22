/* ==========================================================================
   06. ARTIFACT INSPECTOR (FOCUS/ISOLATION)
   ========================================================================== */
const ArtifactInspector = {
    isActive: false,
    activeElement: null,
    backdrop: null,
    panel: null,
    mode: null, // 'center' | 'popup'

    init() {
        this.backdrop = document.createElement('div');
        this.backdrop.classList.add('focus-backdrop');
        this.backdrop.addEventListener('click', () => this.close());
        document.body.appendChild(this.backdrop);

        this.panel = document.createElement('div');
        this.panel.classList.add('artifact-inspector-panel');
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
        if (typeof DepthController === 'undefined') return false;
        const level = DepthController.currentLevel;
        if (level === 3) return false;
        if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
            return level === 1 || level === 2;
        }
        return level === 2;
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

        if (this.usesPopupMode()) {
            this.openPopup(noteWrapperNode);
            return;
        }

        this.openCentered(noteWrapperNode);
    },

    openCentered(noteWrapperNode) {
        this.isActive = true;
        this.mode = 'center';
        this.activeElement = noteWrapperNode;

        SpatialNavigation.pause();

        const rect = noteWrapperNode.getBoundingClientRect();
        const elemCenterX = rect.left + rect.width / 2;
        const elemCenterY = rect.top + rect.height / 2;

        const dX = (window.innerWidth / 2) - elemCenterX;
        const dY = (window.innerHeight / 2) - elemCenterY;

        noteWrapperNode.classList.add('is-centered');
        noteWrapperNode.style.transform = `translate(${dX}px, ${dY}px)`;

        this.backdrop.classList.add('active');
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

        this.panel.innerHTML = typeof MicroMock !== 'undefined'
            ? MicroMock.buildCardHTML(item)
            : '';
        this.panel.setAttribute('aria-hidden', 'false');
        this.panel.dataset.noteId = String(item.id);

        this.backdrop.classList.add('active', 'is-popup');
        this.panel.classList.add('is-open');
        document.body.classList.add('is-artifact-inspector-open');
    },

    close() {
        if (!this.isActive) return;

        if (this.mode === 'popup') {
            this.closePopup();
            return;
        }

        this.closeCentered();
    },

    closeCentered() {
        if (!this.activeElement) return;
        const el = this.activeElement;

        el.style.transform = 'translate(0, 0)';
        this.backdrop.classList.remove('active');

        setTimeout(() => {
            el.classList.remove('is-centered');
            el.style.transform = '';
            this.isActive = false;
            this.activeElement = null;
            this.mode = null;
            SpatialNavigation.resume();
        }, CONFIG.inspector.closeDuration);
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
