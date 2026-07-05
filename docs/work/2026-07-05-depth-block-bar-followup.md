# L2/L3 depth block bar & warehouse dock — follow-up handoff

**Date:** 2026-07-05

**Status:** open — core UX implemented locally; polish, L1 margin, and commit remain

---

## What I want

Continue exhibition polish for **deployed filter blocks** in **L2/L3** (meso/micro): blocks stack above the warehouse message panel, click-to-deploy with smooth motion, a full-width drop marker that fades (not resizes), and **empty dock slots** that keep the original pill shape and catalog position after selection.

---

## Context

Attach to the next agent:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@docs/work/2026-07-05-depth-block-bar-followup.md
@styles.css
@js/warehouse-core.js
@js/warehouse-filter.js
@js/spatial-navigation.js
@js/config.js
```

Live preview:

```
http://127.0.0.1:5501/
```

Target viewport: **1920×1080** (21.5″ exhibition iMac).

Use **Playwright MCP** — switch to **מסו** or **מיקרו**, click a dock block, verify animation + slot + drop marker.

If editing `js/*.js`, run:

```
sh ./build-js.sh
```

Do **not** edit `js/app.js` directly — it is bundled.

---

## Completed in prior session (2026-07-05)

### Block stack (L2/L3)

| Behavior | Detail |
|----------|--------|
| Resting position | `.depth-block-bar.has-blocks` — right-anchored above dock, **10px** above shell (`var(--space-10)`) |
| Stack order | RTL — first deployed = rightmost; **10px** gap between pills |
| Clear button | `.warehouse-reset` — left edge aligned with **message panel** left (after statistics column), same 10px gap above dock |

### Drop marker (separate layer)

| Property | Value |
|----------|--------|
| Element | `.depth-block-bar__drop-zone` — **sibling** of `.depth-block-bar` inside `.warehouse-shell` |
| Width | Message panel left → dock right (full strip) |
| Height | **`var(--block-height)`** — one block tall |
| Fill | `color-mix(in srgb, var(--color-5) 50%, transparent)` |
| Corners | Warehouse panel corners (four SVG corners) |
| Show/hide | Shell classes `is-depth-drop-active` / `is-depth-drop-fading` — **opacity fade**, no width collapse |
| JS | `showDepthDropIndicator()`, `fadeDepthDropIndicator()`, `clearDepthDropIndicator()` |

### Click-to-deploy (L2/L3)

| Behavior | Detail |
|----------|--------|
| Trigger | Single click on docked block (pointer threshold 6px); drag still works if moved |
| Motion | `_runDepthDeployMotion()` — rAF arc, ease-out cubic, scale 0.94→1, **`position: fixed`** during flight |
| Config | `depthDeployDuration: 520`, `depthDeployStartScale: 0.94`, `depthDeployArcLift: scale(14)` |
| Class | `.is-deploying-to-bar` during flight — must **not** use `is-deployed` until landing (page vs viewport coords) |
| Bug fixed | L2/L3 rule `visibility: hidden` on `is-deployed:not(.is-depth-ui-mounted)` was hiding the flyer — excluded `:not(.is-deploying-to-bar)` |

### Empty dock slot (all layers)

| Behavior | Detail |
|----------|--------|
| Shape | Pill outline — **not** circle (`min-width: block-height` removed) |
| Size | `markSlotEmpty(block)` locks measured `width`/`height` from `blockMetrics()` |
| Position | `restoreDockTrayOrder()` on mark + when any `is-empty` slot exists during co-occurrence reorder |
| Clear | `clearSlotEmpty(block)` on return to dock |

---

## Current locked baseline — do not break without explicit request

### Drop zone geometry

```
left:  calc(4 * var(--site-grid-cell-w) + 3 * var(--site-grid-gap))
right: calc((100% - var(--site-grid-gap)) * 4 / 24 + var(--site-grid-gap))
height: var(--block-height)
margin-bottom: var(--space-10) above warehouse shell
```

### Block bar (resting, has-blocks)

```
right: calc((100% - var(--site-grid-gap)) * 4 / 24 + var(--site-grid-gap))
max-width: calc((100% - var(--site-grid-gap)) * 20 / 24)
z-index: 903 (above drop zone 902)
```

### Tray order when slots reserved

- `reorderDockTrayByRelevance()` — if any `.block-slot.is-empty` in tray → **`restoreDockTrayOrder()`** and return (no `away` bucket jump).

### Depth UI drag

- `beginDragLift` still supports manual drag to depth bar.
- `endDragDepthUi` → `fadeDepthDropIndicator()` on success.

---

## Likely uncommitted / verify on branch

Local changes may include (not all committed as of session end):

- `js/warehouse-core.js` — deploy animation, drop zone HTML, `markSlotEmpty`, tray order
- `js/spatial-navigation.js` — `getBottomChromeTop` uses `.warehouse-shell.is-depth-drop-active`
- `js/config.js` — `depthDeployDuration`, L3 `microNoteMinRows: 6`, L1 macro bottom margin (if added)
- `styles.css` — depth block bar, drop zone, empty slot, `is-deploying-to-bar`

Last pushed commit: `d064ffa` (L3 columns + LTR detection). **This session’s block-bar work is likely still uncommitted.**

Run `git status` and `git diff js/warehouse-core.js styles.css` before assuming baseline.

---

## Known issues / possible next tasks

Ask user which to tackle:

1. **L1 macro bottom margin** — user requested extra **2 site-grid rows** below canvas so dock does not cover notes (`--warehouse-reserve` / `#app` padding) — confirm if implemented or still pending.
2. **Drop fade timing** — tune `280ms` fade vs deploy `520ms` so marker doesn’t disappear too early/late.
3. **Multiple deployed blocks** — stack order vs focus priority (`reorderDepthBlockBar`) visual check with 3+ blocks.
4. **Frame / typology / author blocks** — empty slot sizing and click-deploy on non-tag pills.
5. **Return-to-dock animation** — symmetric motion from depth bar back to reserved slot.
6. **visual-language.md** — document depth block bar, drop zone, empty slot rules (partial updates may exist).
7. **Commit + push** — user must ask explicitly.

---

## Relevant code files

```
js/warehouse-core.js      — shell HTML, deploy/drag, markSlotEmpty, drop indicator, tray order
js/warehouse-filter.js    — reorderDockTrayByRelevance, reorderDepthBlockBar, co-occurrence mute
js/spatial-navigation.js  — getBottomChromeTop chrome reserve
js/config.js              — warehouse.depthDeploy*, siteGrid, microNoteMinRows
styles.css                — .depth-block-bar*, .depth-block-bar__drop-zone, .block-slot.is-empty
docs/visual-language.md   — warehouse / depth chrome (update if changed)
```

HTML structure (warehouse shell):

```
.warehouse-shell
  .warehouse-reset
  .depth-block-bar__drop-zone   ← fade marker (full width)
  .depth-block-bar              ← deployed pills only
  .warehouse-layout
```

---

## Constraints

- Agent/docs in **English**; Hebrew UI strings unchanged.
- **No physics / scroll / capture changes** without reading `docs/CHECKPOINT.md`.
- Do not break layer nav baseline (`docs/work/2026-07-05-layer-navigation-followup.md`).
- Prefer `--space-*` and site-grid tokens over raw px.
- Scoped warehouse / depth-bar changes only unless user expands scope.

---

## Verification

1. Hard refresh `http://127.0.0.1:5501/` at **1920×1080**.
2. Switch to **מסו** (L2).
3. **Click** a dock block (no drag) — pill flies to stack above message row; drop marker fades out at full width (does not shrink to pill width).
4. **Empty slot** — dashed pill same width as block, **same index** in tray (not moved to end).
5. Deploy 2+ blocks — stack RTL, 10px gaps, clear button left above message panel.
6. **Drag** from dock still works; drop marker fades on release.
7. **נקה לוח** returns blocks; empty slots cleared.

### Playwright — deploy animation + slot position

```js
async () => {
  await new Promise(r => setTimeout(r, 1500));
  DepthController.changeLevel(2);
  await new Promise(r => setTimeout(r, 800));
  const tray = document.querySelector('.warehouse-tray-section--blocks');
  const slots = [...tray.querySelectorAll('.block-slot')];
  const targetIdx = 3;
  const block = ActionWarehouse.blocks.find(b => b.slotElement === slots[targetIdx]);
  const beforeW = Math.round(block.element.getBoundingClientRect().width);
  ActionWarehouse.animateDeployToDepthBar(block);
  await new Promise(r => setTimeout(r, 700));
  ActionWarehouse.updateWarehouseBlockRelevance?.();
  const emptyIdx = [...tray.querySelectorAll('.block-slot')].findIndex(s => s.classList.contains('is-empty'));
  const dz = document.querySelector('.depth-block-bar__drop-zone');
  return {
    emptyIdx,
    stayedInPlace: emptyIdx === targetIdx,
    slotW: Math.round(block.slotElement.getBoundingClientRect().width),
    beforeW,
    dropZoneW: dz ? Math.round(dz.getBoundingClientRect().width) : null,
    mounted: !!document.querySelector('.depth-block-bar .is-depth-ui-mounted')
  };
}
```

Target: `stayedInPlace: true`, `slotW ≈ beforeW`, `mounted: true`.

### Playwright — drop zone width during deploy

During `is-depth-drop-active`, drop zone width should match message panel width (~1253px @ 1920), not pill width (~84px).

---

## Agent prompt

**Language:** English.

**Copy from here**

────────────

Continue **L2/L3 depth block bar & warehouse dock** polish for עקבות | Alternative Index.

Read first:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@docs/work/2026-07-05-depth-block-bar-followup.md
@styles.css
@js/warehouse-core.js
@js/warehouse-filter.js
@js/config.js
```

**Goal:** Apply my next specific correction for deployed blocks, drop marker, click-deploy motion, or empty dock slots. Inspect live at `http://127.0.0.1:5501/` (1920×1080) on **מסו**/**מיקרו** with Playwright before editing.

**Locked baseline — do not break without explicit request:**

- Deployed blocks: right-anchored stack above message panel, 10px above dock, 10px between pills.
- Clear button: left edge = message panel left, 10px above dock.
- Drop marker: full-width strip, block height, color-5 50% fill, corner decorations, **fade only** (no resize to pill width).
- Click deploy: fixed-position arc animation; `.is-deploying-to-bar` visible during flight.
- Empty slot: pill-shaped, measured width/height, **catalog order preserved** (no jump to tray end).

**Workflow:**

1. Ask for the exact next correction if not provided.
2. `git status` / `git diff` — much of this work may be uncommitted.
3. Playwright verification (see session file).
4. Scoped edits; `sh ./build-js.sh` if `js/*.js` changed.
5. `ReadLints` on touched files.
6. Update `docs/visual-language.md` for chrome changes.

**Success criteria:**

- Hebrew UI unchanged.
- Click deploy visibly animates; slot stays in place with correct pill ghost.
- Drop marker fades at full width.
- No regressions to physics, layer nav, L3 grids, or focus inspector.

**Out of scope:**

- Macro physics, capture, stretch, scroll clamp (unless user asks re L1 bottom margin), note content, data pipeline.

────────────

**End**

---

## Notes / session history

| When | What |
|------|------|
| 2026-07-05 | Repositioned depth block stack + clear button above message panel |
| 2026-07-05 | Drop indicator: corners + color-5 fill; separated drop zone layer; block-height strip |
| 2026-07-05 | Click-to-deploy; fixed invisible animation (visibility + fixed vs absolute coords) |
| 2026-07-05 | Empty slot: pill size via `markSlotEmpty`; catalog position via `restoreDockTrayOrder` |

**Do not break:** `docs/CHECKPOINT.md` physics/navigation. Depth block bar is **warehouse chrome + L2/L3 filter UX** — keep changes in warehouse-core, warehouse-filter, styles, config tokens.
