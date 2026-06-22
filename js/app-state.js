/* ==========================================================================
   02. DATA PIPELINE & STATE MANAGER
   ========================================================================== */
const AppState = {
    items: [],
    tagColorsMap: new Map(),

    async init() {
        this.appContainer = document.getElementById('app');
        await this.buildDataPipeline();
        this.render();
        ActionWarehouse.populate();
        setTimeout(() => {
            try {
                this.centerViewport();
                PhysicsEngine.buildWorld();
            } catch (err) {
                console.error('Boot physics failed', err);
            }
            requestAnimationFrame(() => {
                this.appContainer.classList.add('is-ready');
                this.appContainer.style.opacity = '1';
            });
        }, CONFIG.boot.physicsBuildDelay);
    },

    async buildDataPipeline() {
        try {
            const tagsResponse = await fetch(CONFIG.data.urls.tags);
            const tagsCsv = await tagsResponse.text();
            this.parseTagsDictionary(tagsCsv);

            const mainResponse = await fetch(CONFIG.data.urls.main);
            const mainCsv = await mainResponse.text();
            this.items = this.parseMainNotes(mainCsv);
        } catch (error) {
            console.error('Data pipeline error:', error);
        }
    },

    normalizeString(str) {
        if (!str) return '';
        return str.replace(/[#\u200B-\u200D\uFEFF]/g, '').replace(/_/g, ' ').trim().toLowerCase();
    },

    parseCSVToArray(csvText) {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let insideQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                currentRow.push(currentCell.trim());
                currentCell = '';
            } else if ((char === '\n' || char === '\r') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') i++;
                currentRow.push(currentCell.trim());
                if (currentRow.join('').trim() !== '') rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        return rows;
    },

    parseTagsDictionary(csvText) {
        const rows = this.parseCSVToArray(csvText);
        rows.slice(1).forEach(columns => {
            if (columns.length < 2) return;
            const tagName = this.normalizeString(columns[0]);
            if (!tagName) return;

            let tagColor = columns[1].trim();
            if (!tagColor.startsWith('#') && tagColor.length >= 3) tagColor = '#' + tagColor;

            // Invalid hex would render as a transparent (invisible) dot:
            // fall back to the default color and flag the dictionary entry
            if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(tagColor)) {
                console.warn(`Tag dictionary: invalid color "${tagColor}" for tag "${tagName}", using fallback`);
                tagColor = CONFIG.data.fallbackTagColor;
            }

            this.tagColorsMap.set(tagName, tagColor);
        });
    },

    parseMainNotes(csvText) {
        const rows = this.parseCSVToArray(csvText);
        const cols = CONFIG.data.columns;
        return rows.slice(1).map((columns, index) => {
            const authorCode = this.normalizeString(columns[cols.authorCode] || '');
            const id = (columns[cols.id] || `SYS-${index}`).replace(/_/g, ' ');
            const tagsRaw = columns[cols.tags] || '';
            
            let titleRaw = columns[cols.title] || '';
            const title = titleRaw.replace(/^#+\s*/, '').replace(/_/g, ' ').trim();
            
            const body = (columns[cols.body] || '').replace(/_/g, ' ').trim();
            
            const tagsArray = tagsRaw.split(',').map(t => {
                const norm = this.normalizeString(t);
                return { name: norm, color: this.tagColorsMap.get(norm) || CONFIG.data.fallbackTagColor };
            }).filter(t => t.name);

            return { id, title, body, tags: tagsArray, authorCode };
        });
    },

    render() {
        if (!this.appContainer) return;
        this.appContainer.innerHTML = '';
        this.items.forEach((item, noteIndex) => {
            const wrapper = RenderEngine.createNoteDOM(item, noteIndex);
            this.appContainer.appendChild(wrapper);
        });

        if (typeof DepthV2 !== 'undefined') {
            DepthV2.afterNotesRender();
        }
    },

    syncNoteDomFromItems() {
        const itemsById = new Map(this.items.map(item => [String(item.id), item]));
        document.querySelectorAll('.note-wrapper').forEach(wrapper => {
            const item = itemsById.get(wrapper.dataset.noteId);
            if (!item) return;

            const titleEl = wrapper.querySelector('.note-title');
            const bodyEl = wrapper.querySelector('.note-body');
            const idEl = wrapper.querySelector('.note-idcode');
            if (titleEl) titleEl.textContent = item.title || '';
            if (bodyEl) bodyEl.textContent = item.body || '';
            if (idEl) idEl.textContent = item.id || '';

            if (typeof SilhouetteEngine !== 'undefined') {
                const entry = SilhouetteEngine.entries.get(String(item.id));
                if (entry) entry.item = item;
            }

            if (DepthController.currentLevel === 3 && typeof MicroMock !== 'undefined') {
                MicroMock.applyToWrapper(wrapper, item);
            }
        });
    },

    async refreshDataFromSheet() {
        await this.buildDataPipeline();
        this.syncNoteDomFromItems();
        return this.items;
    },

    centerViewport(options = {}) {
        const appElement = document.getElementById('app');
        if (!appElement) return;

        if (DepthController.currentLevel >= 2 &&
            (appElement.classList.contains('is-meso-column-layout') ||
             appElement.classList.contains('is-meso-hive-layout'))) {
            this.centerMesoViewport(options);
            return;
        }

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 80
        );

        const rect = appElement.getBoundingClientRect();
        const dX = rect.left + rect.width / 2 - window.innerWidth / 2;
        const dY = rect.top + rect.height / 2 - window.innerHeight / 2;

        if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

        window.scrollBy({
            left: dX,
            top: dY,
            behavior: options.smooth ? 'smooth' : 'auto'
        });
    },

    centerMesoHiveCluster(options = {}) {
        const app = document.getElementById('app');
        if (!app) return;

        const anchors = [...app.querySelectorAll('.note-wrapper.is-meso-hive-anchored')];
        if (!anchors.length) {
            this.centerMesoViewport({ ...options, _skipHive: true });
            return;
        }

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 300
        );

        const reserve = typeof ActionWarehouse !== 'undefined'
            ? ActionWarehouse.getScrollReserve()
            : 0;

        const scrollToCluster = () => {
            const viewMidY = (window.innerHeight - reserve) / 2;
            let minL = Infinity;
            let minT = Infinity;
            let maxR = -Infinity;
            let maxB = -Infinity;

            anchors.forEach(wrapper => {
                const rect = wrapper.getBoundingClientRect();
                if (rect.width < 1 && rect.height < 1) return;
                minL = Math.min(minL, rect.left);
                minT = Math.min(minT, rect.top);
                maxR = Math.max(maxR, rect.right);
                maxB = Math.max(maxB, rect.bottom);
            });

            if (!Number.isFinite(minL)) {
                const appRect = app.getBoundingClientRect();
                const cx = parseFloat(app.dataset.hiveCenterX);
                const cy = parseFloat(app.dataset.hiveCenterY);
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

                const pageX = appRect.left + window.pageXOffset + cx;
                const pageY = appRect.top + window.pageYOffset + cy;
                const dX = pageX - (window.pageXOffset + window.innerWidth / 2);
                const dY = pageY - (window.pageYOffset + viewMidY);

                if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

                window.scrollBy({
                    left: dX,
                    top: dY,
                    behavior: options.smooth ? 'smooth' : 'auto'
                });
                return;
            }

            const cx = (minL + maxR) / 2;
            const cy = (minT + maxB) / 2;
            const dX = cx - window.innerWidth / 2;
            const dY = cy - viewMidY;

            if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

            window.scrollBy({
                left: dX,
                top: dY,
                behavior: options.smooth ? 'smooth' : 'auto'
            });
        };

        requestAnimationFrame(() => {
            scrollToCluster();
            requestAnimationFrame(scrollToCluster);
        });
    },

    centerMesoViewport(options = {}) {
        const app = document.getElementById('app');
        if (!app) return;

        if (app.classList.contains('is-meso-hive-layout') && !options._skipHive) {
            this.centerMesoHiveCluster(options);
            return;
        }

        SpatialNavigation.bypassScrollClamp(
            options.smooth
                ? CONFIG.warehouse.workspaceGrid.rushDuration + 450
                : 300
        );

        const centerOnCanvas = () => {
            const rect = app.getBoundingClientRect();
            const dX = rect.left + rect.width / 2 - window.innerWidth / 2;
            const dY = rect.top + rect.height / 2 - window.innerHeight / 2;

            if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

            window.scrollBy({
                left: dX,
                top: dY,
                behavior: options.smooth ? 'smooth' : 'auto'
            });
        };

        if (app.classList.contains('is-meso-column-layout') ||
            app.classList.contains('is-meso-hive-layout')) {
            requestAnimationFrame(() => {
                centerOnCanvas();
                requestAnimationFrame(centerOnCanvas);
            });
            return;
        }

        const limits = SpatialNavigation.getViewportClampLimits();
        if (!limits) return;

        const { rect, leftMax, topMax } = limits;
        const dX = rect.left - leftMax;
        const dY = rect.top - topMax;

        if (Math.abs(dX) < 0.5 && Math.abs(dY) < 0.5) return;

        window.scrollBy({
            left: dX,
            top: dY,
            behavior: options.smooth ? 'smooth' : 'auto'
        });
    }
};


