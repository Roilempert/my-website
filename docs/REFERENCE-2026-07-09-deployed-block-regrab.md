# REFERENCE — deployed block re-grab (9 July 2026)

**Purpose:** Restore point when a block placed on the L1 surface cannot be grabbed again after drop. Pair with `docs/CHECKPOINT.md` (block drag section).

---

## Symptom

- Block drags out of the warehouse / launcher strip and deploys on the canvas (`is-deployed`).
- Subsequent pointerdown on the deployed block does nothing — no drag, or only the strip unpins on the first attempt.
- Plain click on a deployed capture block should still run `DepthTransitionOrchestrator.runBlockClick` (L1 → L2); drag past threshold should reposition on canvas.

---

## Root causes (two independent blockers)

### 1. Popup backdrop above deployed blocks

While the launcher strip is **pinned** (`body.is-launcher-strip-pinned`) or the warehouse popup is open, `.warehouse-popup-backdrop` is visible at **`z-index: 895`** with `pointer-events: auto`.

Deployed blocks used **`z-index: 100`**. The invisible full-screen backdrop sat **above** the block and swallowed the first grab. The document-level outside-click handler still ran (unpinning the strip), but `startDrag` never reached the block element.

**Fix (`styles.css`):** raise deployed blocks above the backdrop, below strip chrome:

```css
body.is-launcher-strip-pinned .action-block.is-deployed,
body.is-warehouse-popup-open .action-block.is-deployed {
    z-index: 896;
}
```

Strip / launcher UI stays at 900+. Dragging blocks use `z-index: 950` (`.is-dragging`).

### 2. Strip tray guard rejecting active blocks

`ActionWarehouse.startDrag` blocked grabs when:

- launcher strip mode is on,
- the block's **home slot** is in `launcherStripTrayElement`,
- the strip is not pinned.

Deployed blocks **keep** their home slot in the tray DOM. The grab pointerdown **unpins** the strip first (capture-phase outside handler), so `!launcherStripPinned` is true on the next guard check — and `startDrag` returned before wiring drag.

**Fix (`js/warehouse-core.js`):** only apply the guard to blocks still **docked** in the tray:

```javascript
if (this.isLauncherStripMode() &&
    block.state === 'docked' &&
    block.slotElement?.parentElement === this.launcherStripTrayElement &&
    !this.launcherStripPinned) {
    return;
}
```

---

## Related drag patterns (same session — do not regress)

| Pattern | File | Why |
|---|---|---|
| Deployed blocks on `document.body` | `deployBlockAtPageCoords` | L1 `#app { pointer-events: none }` must not swallow hits |
| `promoteClickPendingToDrag` | `warehouse-core.js` | Do not unwire pointer capture when click-pending crosses drag threshold |
| `wireDragPointerTracking` / `unwireDragPointerTracking` | `warehouse-core.js` | Consistent capture on `document` with `{ capture: true }` |
| `surfaceReposition: true` for deployed blocks | `startDrag` | Click-pending path for blocks already on canvas |
| `markSlotEmpty` only when `!liftFromSurface` | `beginDragLift` | Re-grab from surface must not clear dock slot reserve |

---

## Verification

1. Pin launcher strip → drag a tag block to the canvas → release.
2. **Immediately** re-grab the deployed block (strip still pinned) → drag to a new position.
3. Re-grab again (strip now unpinned) → drag again.
4. Short click on deployed capture block → depth transition (L1 → L2), not stuck drag.
5. Collapsed strip (not pinned) → docked block in tray does **not** start drag.

Playwright repro (1920×1080): pin strip, deploy block 0 to ~(900, 420), re-grab with +250/+130 delta — `dragState` must promote to live drag (`clickPending: false`).

---

## Key files

| File | Role |
|---|---|
| `js/warehouse-core.js` | `startDrag`, `promoteClickPendingToDrag`, `deployBlockAtPageCoords` |
| `styles.css` | `.warehouse-popup-backdrop` (895), `.action-block.is-deployed` (100 → 896 when pinned/open) |
| `docs/visual-language.md` | Changelog entry for z-index rule |

After editing `warehouse-core.js`, run `./build-js.sh`.

---

## Do not reintroduce

| Change | Effect |
|---|---|
| Strip guard without `block.state === 'docked'` | Deployed blocks permanently un-draggable after first unpin |
| Backdrop z-index above deployed blocks without raising block z-index | First grab hits backdrop only |
| `pointer-events: none` on deployed blocks at L1 | Same symptom as backdrop overlap |
| Unwire pointer capture inside `promoteClickPendingToDrag` | Surface re-grab drops mid-gesture |
