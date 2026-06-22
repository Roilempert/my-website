/* ==========================================================================
   03. RENDER ENGINE (DOM GENERATION)
   ========================================================================== */
const RenderEngine = {
    createNoteDOM(item, noteIndex = -1) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('note-wrapper', 'snap-point');
        wrapper.dataset.noteId = item.id;
        if (noteIndex >= 0) wrapper.dataset.noteIndex = String(noteIndex);
        if (item.authorCode) wrapper.dataset.authorCode = item.authorCode;

        let tagsHTML = '';
        if (item.tags && item.tags.length > 0) {
            tagsHTML = item.tags.map(t => 
                `<span class="tag"><span class="tag-circle" style="background-color: ${t.color}"></span>${t.name}</span>`
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
        
        const layerSmall = `
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
                dotsHTML += `<div class="layer-item layer-dot" data-index="${index}" data-tag="${tag.name}" style="--dot-bg: ${tag.color};"></div>`;
            });
        } else {
            dotsHTML = `<div class="layer-item layer-dot" style="--dot-bg: var(--main-text);"></div>`;
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
                    if (ArtifactInspector.isActive) {
                        ArtifactInspector.close();
                    } else {
                        ArtifactInspector.open(wrapper);
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
        
        SilhouetteEngine.registerWrapper(wrapper, item);
        return wrapper;
    }
};

