/* ==========================================================================
   ARCHIVED — Black filter / deletion frame (warehouse tray)
   Not bundled into app.js. Kept for possible restoration.

   The black rounded-square block with the circle-and-slash icon. Drag tag or
   author pills into it to filter matching molecules off the board (L1 peel,
   L2/L3 instant hide).

   ## Restore

   1. In js/config.js set:
        CONFIG.warehouse.enableFilterFrame = true;

   2. Rebuild: ./build-js.sh

   Related runtime (still active, dormant without the block):
   - js/warehouse-core.js   — createFrameBlock, snapBlockIntoFrame, frame layout
   - js/warehouse-filter.js — peel / hollow / instant filter animations
   - js/warehouse-grid.js   — getFilterCriteria, isBlockFocusEligible
   - styles.css             — .action-block--frame, .action-block--frame-filter

   ========================================================================== */

/* --- populate hook (warehouse-core.js) --- */
/*
    populate() {
        if (CONFIG.warehouse.enableFilterFrame) {
            this.createBlock({ type: 'frame', frameKind: 'filter' });
        }
        // ... tag + author blocks
    }
*/

/* --- block factory (warehouse-core.js — createFrameBlock) --- */
/*
    createFrameBlock(def) {
        const slot = document.createElement('div');
        slot.classList.add('block-slot', 'block-slot--frame');

        const el = document.createElement('div');
        const frameKind = def.frameKind || 'filter';
        el.classList.add('action-block', 'action-block--frame', 'general-t');
        if (frameKind === 'filter') el.classList.add('action-block--frame-filter');
        el.dataset.type = 'frame';
        el.dataset.frameKind = frameKind;

        el.innerHTML = `
            <span class="frame-filter-icon" aria-hidden="true"></span>
            <div class="frame-slot-window"></div>
        `;
        slot.appendChild(el);
        this.trayFramesElement.appendChild(slot);

        const block = {
            type: 'frame',
            frameKind,
            tag: null,
            author: null,
            color: null,
            element: el,
            slotElement: slot,
            state: 'docked',
            isDragging: false,
            nestedBlocks: [],
            nestedIn: null,
            body: null,
            bodyX: 0, bodyY: 0,
            x: 0, y: 0
        };

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.is-nested')) return;
            this.startDrag(block, e);
        });
        this.blocks.push(block);
        return block;
    },
*/

/* --- CONFIG frame metrics (js/config.js → warehouse.frame.filter) --- */
/*
    frame: {
        filter: {
            paddingY: scale(5),
            paddingLeft: scale(5),
            borderRadius: 6,
            slotMinWidth: scale(56),
            paddingX: scale(6),
            nestedGap: scale(4)
        }
    },

    filterExit: {
        hollowDuration: 120,
        peelDuration: 380,
        peelSpeed: scale(5.5),
        peelJitter: 0.35,
        peelFrictionAir: 0.26,
        restoreOffScreenPad: scale(56)
    }
*/
