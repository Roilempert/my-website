/* ==========================================================================
   03. RENDER ENGINE (DOM GENERATION)
   ========================================================================== */
const RenderEngine = {
    getStableMicroHoverRotationDeg(item, noteIndex = 0) {
        const cfg = CONFIG.depth?.microNoteHoverRotation ?? {};
        const negMin = cfg.negativeMin ?? -10;
        const negMax = cfg.negativeMax ?? -5;
        const posMin = cfg.positiveMin ?? 5;
        const posMax = cfg.positiveMax ?? 10;
        const idx = Number(noteIndex) || 0;
        const payload = `${String(item?.id ?? '')}\0${String(item?.authorCode ?? '')}\0${idx}`;

        let h = 2166136261;
        for (let i = 0; i < payload.length; i++) {
            h ^= payload.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }

        const signPick = ((h >>> 0) % 10000) / 10000;
        const magPick = (((h >>> 12) & 0xffff) % 10000) / 10000;
        const positive = signPick >= 0.5;

        if (positive) {
            return Math.round((posMin + magPick * (posMax - posMin)) * 100) / 100;
        }
        return Math.round((negMin + magPick * (negMax - negMin)) * 100) / 100;
    },

    resolveSheetColor(color) {
        const raw = String(color || '').trim();
        if (!raw) return '';
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) return raw;
        if (raw.startsWith('rgb')) return raw;

        const varName = raw.match(/var\(\s*(--[^,)]+)/)?.[1];
        if (varName && typeof getComputedStyle === 'function') {
            const resolved = getComputedStyle(document.documentElement)
                .getPropertyValue(varName).trim();
            if (resolved) return resolved;
        }
        return raw;
    },

    dotMarkup(tag, index) {
        const color = this.resolveSheetColor(tag.color) ||
            CONFIG.data.fallbackTagColor ||
            '#898989';
        return `<div class="layer-item layer-dot" data-index="${index}" data-tag="${tag.name}" style="--dot-bg:${color};"></div>`;
    },

    createNoteDOM(item, noteIndex = -1) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('note-wrapper', 'snap-point');
        wrapper.dataset.noteId = item.id;
        if (noteIndex >= 0) wrapper.dataset.noteIndex = String(noteIndex);
        if (item.authorCode) wrapper.dataset.authorCode = item.authorCode;

        const hoverDeg = this.getStableMicroHoverRotationDeg(item, noteIndex >= 0 ? noteIndex : 0);
        wrapper.style.setProperty('--note-micro-hover-rotation', `${hoverDeg}deg`);

        let tagsHTML = '';
        if (item.tags && item.tags.length > 0) {
            tagsHTML = item.tags.map(t => 
                `<span class="tag"><span class="tag-circle" style="background-color: ${this.resolveSheetColor(t.color) || CONFIG.data.fallbackTagColor}"></span>${t.name}</span>`
            ).join('');
        }

        const layerFull = `
            <div class="layer-item layer-full">
                <div class="note-card">
                    <div class="note-idcode">${item.id}</div>
                    <h2 class="note-title">${item.title}</h2>
                    <div class="note-body">${item.body}</div>
                    <div class="note-tags">${tagsHTML}</div>
                </div>
            </div>
        `;
        
        const useV2SilhouetteSkip = typeof DepthV2 !== 'undefined' && DepthV2.isActive();
        const layerSmall = useV2SilhouetteSkip ? '' : `
            <div class="layer-item layer-small">
                <div class="meso-silhouette" aria-hidden="true" data-silhouette-state="pending">
                    <svg class="meso-silhouette__svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path class="meso-silhouette__shape"></path>
                    </svg>
                    <div class="meso-silhouette__tags"></div>
                </div>
            </div>
        `;
        
        let dotsHTML = '';
        if (item.tags && item.tags.length > 0) {
            item.tags.forEach((tag, index) => {
                dotsHTML += this.dotMarkup(tag, index);
            });
        } else {
            const fallback = this.resolveSheetColor('var(--color-3)') || '#2D2D2D';
            dotsHTML = `<div class="layer-item layer-dot" style="--dot-bg:${fallback};"></div>`;
        }

        wrapper.innerHTML = `
            <div class="note-stage" data-layout-source="meso" aria-hidden="false">
                ${layerSmall}
                ${layerFull}
                <div class="depth-v2-glyph depth-v2-glyph--micro" aria-hidden="true"></div>
            </div>
            <div class="depth-v2-glyph depth-v2-glyph--meso meso-mock" aria-hidden="true"></div>
            ${dotsHTML}
        `;

        wrapper.addEventListener('click', (e) => {
            if (e.target.closest('.layer-dot')) return;
            if (e.target.closest('.note-redact__word')) return;
            if (typeof NoteCensor !== 'undefined' && NoteCensor.shouldSuppressNoteOpen?.()) return;
            if (typeof isPointOverSiteNavigationUI === 'function' &&
                isPointOverSiteNavigationUI(e.clientX, e.clientY)) {
                return;
            }
            e.stopPropagation();

            if (DepthController.currentLevel >= 2 &&
                (wrapper.classList.contains('is-layout-excluded') ||
                 wrapper.classList.contains('is-molecule-filtered-out'))) {
                return;
            }

            if (DepthController.currentLevel === 1) {
                const noteIndex = [...document.querySelectorAll('.note-wrapper')].indexOf(wrapper);
                if (noteIndex < 0) return;

                if (typeof DepthV2 !== 'undefined' && DepthV2.isActive()) {
                    DepthController.changeLevel(3);
                    if (!(typeof NoteCensor !== 'undefined' && NoteCensor.blocksNoteFocus())) {
                        requestAnimationFrame(() => {
                            if (DepthController.currentLevel === 3) {
                                ArtifactInspector.open(wrapper);
                            }
                        });
                    }
                    return;
                }

                if (typeof DepthTransitionOrchestrator !== 'undefined') {
                    DepthTransitionOrchestrator.runNoteClick(noteIndex, wrapper);
                }
                return;
            }

            if (ArtifactInspector.isActive) {
                ArtifactInspector.close();
            } else {
                ArtifactInspector.open(wrapper);
            }
        });
        
        if (!useV2SilhouetteSkip) {
            SilhouetteEngine.registerWrapper(wrapper, item);
        }
        if (typeof TextDirection !== 'undefined') {
            TextDirection.applyToWrapper(wrapper, item.textDirection);
        }
        return wrapper;
    }
};

