# Focus Note (Inspector) — follow-up handoff

**Date:** 2026-07-05

**Status:** open — open animation + metadata done; polish and close motion remain

---

## What I want

Continue exhibition **focus note** polish for עקבות | Alternative Index. The inspector popup should feel like the clicked L3 card flies to center, enlarges proportionally from **6 → 8 columns**, leaves an **empty grid slot**, and lands as a complete card (not clipped) with tag blocks at grid pill size and metadata below.

---

## Context

Attach to the next agent:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@docs/work/2026-07-05-focus-note-followup.md
@styles.css
@js/artifact-inspector.js
@js/micro-mock.js
@js/config.js
```

Live preview:

```
http://127.0.0.1:5501/
```

Target viewport: **1920×1080** (21.5″ exhibition iMac).

Use **Playwright MCP** — switch to **מיקרו**, click a visible note, measure open animation + final layout.

If editing `js/*.js`, run:

```
sh ./build-js.sh
```

Do **not** edit `js/app.js` directly — it is bundled.

---

## Completed in prior session (2026-07-05)

### Metadata panel (`js/artifact-inspector.js`)

| Field | Output |
|-------|--------|
| מחבר | **Author Code** uppercase (e.g. `MFR`) — not full name |
| מבנה טיפולוגי | Hebrew via `getTypologyLabel()` (e.g. `רשימה` for `List`) |

### Open animation architecture

- **Fixed flyer layer** `.artifact-inspector-flyer` (`z-index: 1005`) — FLIP runs outside scrollable panel (avoids `overflow` clip).
- **Panel** `.artifact-inspector-panel` builds final HTML invisibly (`is-measuring` / `is-opening`), then flyer hands off.
- **Card scaler** `.artifact-inspector-focus__card-scaler` — proportional **6→8** via `--focus-card-scale: calc(8 / 6)`.
- **Tag row** outside scaler — grid pill size (26px); translate-only on flyer.
- **Source hide** — `is-inspector-source-hidden` on all `.note-wrapper[data-note-id="…"]` via `_hideAllSourceWrappers()`.
- **Timing** — `CONFIG.inspector.openDuration: 0.48` s; easing `cubic-bezier(0.25, 1, 0.5, 1)`.

### `js/micro-mock.js` split

- `buildCardOnlyHTML()` — card without tags
- `buildTagsRowHTML()` — tag/author/typology row
- `buildCardHTML()` — composes both (L3 grid unchanged)

---

## Current locked baseline — do not break without explicit request

### Focus card geometry

| Property | Value |
|----------|--------|
| Grid width | **6 site cols** (`--site-micro-col-width`) |
| Focus width | **8 site cols** (`calc(8/6 * --site-micro-col-width)`) |
| Scale token | `--focus-card-scale: calc(8 / 6)` |
| Card min-height | L3 `--site-micro-note-min-height` (6 rows), scaled in focus |
| Padding / type | Same rules as L3 `.micro-mock__card`, scaled with card |
| Tag pills | **Unscaled** — same as warehouse/L3 blocks (`--space-10` gap below card) |
| Focus anchor | Shell **row 2** top (`--inspector-card-start-top`) |
| Metadata gap | **40px** (`2.5rem`) below focus note block |

### Open motion

- Measure source card rect **before** hiding.
- FLIP on flyer card scaler: **top-left** origin, uniform width-based scale.
- Play to `scale(8/6)` on flyer; remove flyer; reveal panel focus + fade metadata.
- `prefers-reduced-motion: reduce` → skip animation, show panel immediately.

### Source slot

- All wrappers with matching `data-note-id` get `is-inspector-source-hidden`.
- Grid cell stays (layout preserved); content must not paint in slot.

---

## Known issues / verify first

These were diagnosed with Playwright in-session. **Confirm on live site before broad refactors:**

### 1. Ghost note in grid slot

**Cause:** L3 `.note-stage { visibility: visible }` can override parent `visibility: hidden` on `.note-wrapper.is-inspector-source-hidden`.

**Fix if still reproducing:**

```css
body.is-artifact-inspector-open .note-wrapper.is-inspector-source-hidden,
body.is-artifact-inspector-open .note-wrapper.is-inspector-source-hidden .note-stage,
body.is-artifact-inspector-open .note-wrapper.is-inspector-source-hidden .depth-v2-glyph--micro,
body.is-artifact-inspector-open .note-wrapper.is-inspector-source-hidden .micro-mock__note {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}
```

### 2. Focus card clipped / metadata overlapping card

**Cause:** `transform: scale(8/6)` on `.artifact-inspector-focus__card-scaler` does **not** reserve layout height — tags/metadata collapse upward.

**Fix if still reproducing:** use **`zoom: var(--focus-card-scale)`** on panel scaler (layout-aware on exhibition Chrome/Safari), or add explicit spacer `margin-bottom` after scaler. Target gaps: **10px** card→tags, **40px** tags→metadata.

### 3. Animation not smooth

- Use **top-left** FLIP (not center-center).
- Animate on **flyer only**, not inside `.artifact-inspector-panel` scrollport.
- Hide flyer with `.is-preparing` until invert transform is applied (no one-frame flash).

---

## Relevant code files

```
js/artifact-inspector.js   — open/close, flyer FLIP, metadata, related notes
js/micro-mock.js           — buildCardOnlyHTML, buildTagsRowHTML
js/config.js               — CONFIG.inspector.openDuration
styles.css                 — .artifact-inspector-*, .focus-backdrop, --focus-card-scale
docs/visual-language.md    — Focus popup section + changelog
```

**Opens inspector from:** `js/render-engine.js` (L2/L3 click), `js/spatial-navigation.js`, `js/physics-engine.js` (L1).

---

## Constraints

- Agent/docs in **English**; Hebrew UI strings stay Hebrew.
- **No physics / scroll / capture changes** without reading `docs/CHECKPOINT.md`.
- Scoped inspector chrome only unless user expands scope.
- Prefer `--space-*`, `rem`, site-grid tokens over raw px.
- After chrome changes, update `docs/visual-language.md` in the same session.

---

## Verification

1. Hard refresh `http://127.0.0.1:5501/` at **1920×1080**.
2. Switch to **מיקרו**; click a **visible** note (not off-screen toroidal copy).
3. **Source slot:** empty — no card text/pills in original grid cell.
4. **Animation:** card flies from click position to center; uniform enlargement; no clip mid-flight.
5. **Final layout:** full white card visible; tags below (26px pills); metadata 40px below tags.
6. **Metadata:** מחבר = uppercase code; מבנה טיפולוגי = Hebrew label.
7. **Close:** Escape or backdrop — source note reappears in slot.

### Playwright — source ghost check

```js
async () => {
  // open focus on a visible note first (click manually or via evaluate)
  const focusBody = document.querySelector('.artifact-inspector-focus .note-body')?.textContent?.trim()?.slice(0, 20);
  const dupes = [...document.querySelectorAll('.note-wrapper .micro-mock__card')].filter(c => {
    const r = c.getBoundingClientRect();
    const inView = r.bottom > 0 && r.top < innerHeight && r.width > 0;
    return inView && c.querySelector('.note-body')?.textContent?.trim()?.slice(0, 20) === focusBody;
  });
  return { focusBody, duplicateVisibleCount: dupes.length }; // target: 0
}
```

### Playwright — layout gaps (final state)

```js
async () => {
  const card = document.querySelector('.artifact-inspector-focus .micro-mock__card')?.getBoundingClientRect();
  const tags = document.querySelector('.artifact-inspector-focus .micro-mock__tags')?.getBoundingClientRect();
  const meta = document.querySelector('.artifact-inspector-metadata')?.getBoundingClientRect();
  return {
    cardToTags: tags && card ? Math.round(tags.top - card.bottom) : null,
    tagsToMeta: meta && tags ? Math.round(meta.top - tags.bottom) : null,
    cardH: card ? Math.round(card.height) : null
  };
}
```

Target: `cardToTags ≈ 10`, `tagsToMeta ≈ 40`, no negative gaps.

---

## Possible next tasks (ask user)

- **Close animation** — reverse FLIP back to grid slot on dismiss
- **Metadata colors** — spec says color 4 text; runtime may still use color 1 on dark panel
- **Motion polish** — easing, duration, tags stagger, backdrop fade sync
- **Meso/L1 open** — same fly behavior when opening from non-L3 cards
- **Related notes** — layout/spacing polish inside inspector scrollport
- **Layer nav** — separate track; see `docs/work/2026-07-05-layer-navigation-followup.md`

---

## Agent prompt

**Language:** English.

**Copy from here**

────────────

Continue exhibition **focus note** polish for עקבות | Alternative Index.

Read first:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@docs/work/2026-07-05-focus-note-followup.md
@styles.css
@js/artifact-inspector.js
@js/micro-mock.js
@js/config.js
```

**Goal:** Apply my next specific focus-note correction only. Inspect live at `http://127.0.0.1:5501/` (1920×1080) with Playwright on **מיקרו** before editing.

**Locked baseline — do not break without explicit request:**

- Focus card: **6 → 8 cols** proportional scale (`--focus-card-scale`); L3 padding/type rules scaled with card; tag pills **unscaled** at 26px.
- Open: fixed `.artifact-inspector-flyer` FLIP from clicked card → shell row 2 center; metadata/related fade after landing.
- Source: all matching `data-note-id` wrappers hidden; grid slot visually empty.
- Metadata: author = uppercase Author Code; typology = Hebrew `typologyLabels`.

**Workflow:**

1. Ask me for the exact next correction if not provided.
2. Playwright: verify source empty, layout gaps, no clip — see Verification in session file.
3. Scoped edits only; match existing token patterns.
4. If editing `js/*.js` → `sh ./build-js.sh`.
5. `ReadLints` on changed files.
6. Re-verify with Playwright.
7. Update `docs/visual-language.md` for any chrome change.

**Success criteria:**

- Hebrew labels unchanged.
- Clicked note slot empty while inspector open.
- Focus card lands complete (not cut); tags + metadata below in correct gaps.
- No regressions to physics, layer nav, depth transitions, or data pipeline.

**Out of scope:**

- Macro physics, blocks, capture, stretch, scroll clamping, data pipeline, note content, broad layout refactors.

────────────

**End**

---

## Notes / session history

| When | What |
|------|------|
| 2026-07-05 early | Metadata: author code + Hebrew typology |
| 2026-07-05 mid | First FLIP attempt inside panel — clipped, janky scale |
| 2026-07-05 late | Flyer layer + hide all noteId wrappers + top-left FLIP |
| 2026-07-05 late | Diagnosed `.note-stage { visibility: visible }` ghost + transform layout clip; zoom/spacer fix proposed |

**Do not break:** `docs/CHECKPOINT.md` physics/navigation baseline. Inspector is **visual chrome + popup UX** — keep changes isolated to `artifact-inspector.js`, `micro-mock.js`, `styles.css`, `config.js` tokens.
