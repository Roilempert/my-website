/* ==========================================================================
   DEPTH FOCUS LINKS — L2 block ↔ note lines (hive / column focus)
   ========================================================================== */
const DepthFocusLinks = {
    shouldDraw() {
        const cfg = CONFIG.depth?.v2?.focusLinks;
        if (cfg?.visible === false) return false;
        if (typeof DepthV2 === 'undefined' || !DepthV2.isActive()) return false;
        if (DepthController.currentLevel !== 2) return false;
        if (!document.body.classList.contains('is-depth-workspace-active')) return false;
        if (typeof CatalogState === 'undefined' || !CatalogState.hasFocus) return false;
        return true;
    },

    getLineConfig() {
        const cfg = CONFIG.depth?.v2?.focusLinks || {};
        const macroLine = CONFIG.warehouse?.linkage?.line || {};
        return {
            width: cfg.width ?? macroLine.width ?? 0.27,
            opacity: cfg.opacity ?? 0.48,
            maxDistance: cfg.maxVisibleDistance ?? macroLine.maxVisibleDistance ?? scale(900)
        };
    },

    getLinkSources() {
        if (typeof ActionWarehouse === 'undefined') return [];

        return ActionWarehouse.blocks.filter(block => {
            if (block.state !== 'active') return false;
            if (block.type !== 'tag' && block.type !== 'author') return false;
            if (block.nestedIn?.frameKind === 'filter') return false;
            if (!ActionWarehouse.isBlockFocusEligible(block)) return false;

            if (block.nestedIn) {
                if (!ActionWarehouse.isBlockFocusEligible(block.nestedIn)) return false;
                return !!block.nestedIn.element?.classList.contains('is-depth-ui-mounted');
            }

            return block.element?.classList.contains('is-depth-ui-mounted');
        });
    },

    getVisibleNoteWrappers() {
        const app = document.getElementById('app');
        if (!app) return [];

        if (app.classList.contains('is-meso-hive-layout')) {
            return [...app.querySelectorAll('.note-wrapper.is-meso-hive-anchored')];
        }

        if (app.classList.contains('is-meso-column-layout')) {
            return [...app.querySelectorAll(
                '#app.is-meso-column-layout .note-wrapper:not(.is-layout-excluded):not(.is-molecule-filtered-out)'
            )];
        }

        return [];
    },

    noteMatchesBlock(wrapper, block) {
        const noteIndex = typeof MesoSpatialLayout !== 'undefined'
            ? MesoSpatialLayout.getNoteIndex(wrapper)
            : -1;
        if (noteIndex < 0) return false;

        const authorCode = wrapper.dataset.authorCode || '';
        if (block.type === 'author') {
            return !!block.author && authorCode === block.author;
        }

        if (block.type === 'tag' && block.tag) {
            const { tags } = ActionWarehouse.getNoteFocusTagsAndAuthor(noteIndex, wrapper);
            return tags.includes(block.tag);
        }

        return false;
    },

    getBlockAnchor(block) {
        const el = block.element;
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;

        return {
            x: rect.left + rect.width / 2,
            y: rect.bottom
        };
    },

    getNoteAnchor(wrapper) {
        const target = wrapper.querySelector('.depth-v2-glyph--meso') || wrapper;
        const rect = target.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;

        return {
            x: rect.left + rect.width / 2,
            y: rect.top + Math.min(rect.height * 0.28, scale(18))
        };
    },

    draw(ctx) {
        if (!ctx || !this.shouldDraw()) return;

        const sources = this.getLinkSources();
        const notes = this.getVisibleNoteWrappers();
        if (!sources.length || !notes.length) return;

        const { width, opacity, maxDistance } = this.getLineConfig();
        const maxDistSq = maxDistance * maxDistance;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;
        const color = PhysicsEngine.linkColor ||
            getComputedStyle(document.documentElement)
                .getPropertyValue('--main-text').trim() || '#101010';

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.globalAlpha = opacity;
        ctx.beginPath();

        sources.forEach(block => {
            const from = this.getBlockAnchor(block);
            if (!from) return;

            const fx = from.x - scrollX;
            const fy = from.y - scrollY;

            notes.forEach(wrapper => {
                if (!this.noteMatchesBlock(wrapper, block)) return;

                const to = this.getNoteAnchor(wrapper);
                if (!to) return;

                const tx = to.x - scrollX;
                const ty = to.y - scrollY;
                const dx = tx - fx;
                const dy = ty - fy;
                if (dx * dx + dy * dy > maxDistSq) return;

                ctx.moveTo(fx, fy);
                ctx.lineTo(tx, ty);
            });
        });

        ctx.stroke();
        ctx.restore();
    }
};
