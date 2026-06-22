/* ==========================================================================
   03d. CATALOG STATE — cross-layer snapshot (L1 workspace → L2/L3 layout)
   ========================================================================== */
const CatalogState = {
    revision: 0,
    activeCriteria: { tags: new Set(), authors: new Set() },
    filterCriteria: { tags: new Set(), authors: new Set() },
    noteRoles: new Map(),
    blockAnchors: [],
    catalogLayout: null,
    workspaceLens: null,
    visibleNoteIndices: [],
    filteredNoteIndices: [],
    hasFilterCriteria: false,
    hasFocus: false,
    macroRank: null,
    visibleOrder: [],
    lastMesoAnchors: [],
    _listeners: [],

    subscribe(fn) {
        if (typeof fn === 'function') this._listeners.push(fn);
    },

    _notify() {
        this.revision += 1;
        this._listeners.forEach(fn => {
            try { fn(this); } catch (_) { /* ignore */ }
        });
        if (typeof window !== 'undefined') {
            window.__catalogState = this.snapshot();
        }
    },

    snapshot() {
        return {
            revision: this.revision,
            layoutMode: CONFIG.depth.layoutMode,
            activeTags: [...this.activeCriteria.tags],
            activeAuthors: [...this.activeCriteria.authors],
            filterTags: [...this.filterCriteria.tags],
            filterAuthors: [...this.filterCriteria.authors],
            blockCount: this.blockAnchors.length,
            noteCount: this.noteRoles.size,
            hasCatalogLayout: !!this.catalogLayout,
            visibleNoteIndices: [...this.visibleNoteIndices],
            filteredNoteIndices: [...this.filteredNoteIndices],
            hasFilterCriteria: this.hasFilterCriteria,
            hasFocus: this.hasFocus,
            macroRankSize: this.macroRank?.size ?? 0
        };
    },

    rebuildFromWarehouse() {
        if (typeof ActionWarehouse === 'undefined') return this;

        const activeTags = new Set();
        const activeAuthors = new Set();

        ActionWarehouse.blocks.forEach(block => {
            if (block.state !== 'active') return;
            if (!ActionWarehouse.isBlockFocusEligible(block)) return;

            if (block.type === 'tag' && block.tag) activeTags.add(block.tag);
            if (block.type === 'author' && block.author) activeAuthors.add(block.author);
        });

        ActionWarehouse.blocks.forEach(block => {
            if (block.state !== 'active' || !block.nestedIn) return;
            if (block.nestedIn.frameKind === 'filter') return;
            if (!ActionWarehouse.isBlockFocusEligible(block.nestedIn)) return;
            if (block.type === 'tag' && block.tag) activeTags.add(block.tag);
            if (block.type === 'author' && block.author) activeAuthors.add(block.author);
        });

        const { tags: filterTags, authors: filterAuthors } = ActionWarehouse.getFilterCriteria();

        this.activeCriteria = { tags: activeTags, authors: activeAuthors };
        this.filterCriteria = { tags: filterTags, authors: filterAuthors };
        this.hasFilterCriteria = filterTags.size > 0 || filterAuthors.size > 0;
        this.hasFocus = activeTags.size > 0 || activeAuthors.size > 0;

        this.filteredNoteIndices = [...ActionWarehouse.filteredNoteIndices];
        this.visibleNoteIndices = [];

        this.blockAnchors = ActionWarehouse.blocks
            .filter(b => ActionWarehouse.isWorkspaceOccupant(b))
            .filter(b => b.type === 'tag' || b.type === 'author' || b.type === 'frame')
            .map(b => ({
                id: b.tag || b.author || b.type,
                type: b.type,
                tag: b.tag || null,
                author: b.author || null,
                pageX: b.bodyX,
                pageY: b.bodyY
            }));

        this.noteRoles = new Map();
        const wrappers = document.querySelectorAll('.note-wrapper');
        wrappers.forEach((wrapper, noteIndex) => {
            if (ActionWarehouse.isNoteFiltered(noteIndex)) {
                this.noteRoles.set(noteIndex, 'filtered');
                return;
            }

            const authorCode = wrapper.dataset.authorCode || '';
            const { tags } = ActionWarehouse.getNoteFocusTagsAndAuthor(noteIndex, wrapper);

            const emphasized = ActionWarehouse.noteMatchesActiveFocus(
                tags,
                authorCode,
                activeTags,
                activeAuthors
            );

            let role = emphasized ? 'emphasized' : 'neutral';

            if (typeof PhysicsEngine !== 'undefined' && PhysicsEngine.bodiesData) {
                const noteDots = PhysicsEngine.bodiesData.filter(
                    d => d.noteIndex === noteIndex && !d.isFiltered
                );
                if (noteDots.some(d => d.overrideTarget)) role = 'captured';
                if (ActionWarehouse.stretchedNotes?.has(noteIndex)) role = 'stretched';
            }

            this.noteRoles.set(noteIndex, role);
            if (role !== 'filtered') {
                this.visibleNoteIndices.push(noteIndex);
            }
        });

        this.workspaceLens = {
            activeTags: new Set(activeTags),
            activeAuthors: new Set(activeAuthors),
            blockAnchors: this.blockAnchors.slice(),
            emphasizedNotes: [...this.noteRoles.entries()]
                .filter(([, role]) => role === 'emphasized' || role === 'captured' || role === 'stretched')
                .map(([idx]) => idx)
        };

        if (typeof CatalogLayoutEngine !== 'undefined') {
            this.catalogLayout = CatalogLayoutEngine.buildForState(this);
        }

        this._notify();
        return this;
    }
};
