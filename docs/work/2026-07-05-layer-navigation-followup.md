# Layer Navigation — follow-up handoff

**Date:** 2026-07-05

**Status:** open — chrome baseline locked; ask user before broad changes

---

## What I want

Continue exhibition layer-navigation polish without breaking the current locked geometry. The next agent should treat the label stack, marker skeleton, selection dot, and spine gap as one system tied to site-grid tokens.

---

## Context

Attach to the next agent:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@docs/work/2026-07-04-layer-navigation-followup.md
@styles.css
@js/config.js
@js/navigation-map.js
@assets/ui/layer-nav-marker.svg
```

Live preview:

```
http://127.0.0.1:5501/
```

Target viewport: **1920×1080** (21.5″ exhibition iMac).

Use **Playwright MCP** for rendered measurements and layer switching (macro → meso → micro).

If editing `js/*.js`, run:

```
sh ./build-js.sh
```

Do **not** edit `js/app.js` directly — it is bundled.

---

## Current locked state (2026-07-05)

### Labels (מאקרו / מזו / מיקרו)

| Property | Value |
|---|---|
| Type | NarkissYair via `--type-family-general-h` / `--layer-nav-font-size` |
| Size | `calc(3.625rem + 10pt)` (~71px @ 16px root) |
| Active | color 3 fill, color 6 text |
| Inactive | color 6 fill, color 3 text |
| Horizontal padding | `var(--layer-nav-box-pad-x)` = `var(--space-10)` = 10px |
| Vertical padding | **asymmetric** — top `calc(var(--space-10) - 4px)`, bottom `calc(var(--space-10) + 4px)` (optical balance for Hebrew descenders, e.g. ק in **מיקרו**) |
| Inter-label gap | `var(--layer-nav-row-gap)` = `var(--space-10)` = 10px |
| Radius | `var(--layer-nav-box-radius)` = `var(--space-5)` = 5px |
| Optical trim | `text-box-trim: trim-both; text-box-edge: cap alphabetic` on `.site-navigation-layers__label` |
| Line height | `1` on labels (not `.general-h` line-height) |
| Inactive hover | `translateX(calc(-1 * var(--space-20)))` = −20px left |
| Active hover | no shift |

### Stack geometry

- Heights are **measured at runtime** in `NavigationMap.syncLayerNavMetrics()` from rendered label boxes — not a fixed 2.5-row grid.
- Sets `--layer-nav-label-box-h`, `--layer-nav-row-step`, `--layer-nav-stack-h` on `:root`.
- Active label anchors to shell row 4 at the **75% vertical guide** via `--layer-nav-active-top`.
- Labels slot with `top: calc(var(--layer-nav-slot-base-top) + var(--layer-nav-slot) * var(--layer-nav-row-step))`.

Key CSS tokens (`styles.css` `:root`):

```css
--layer-nav-box-pad-x: var(--space-10);
--layer-nav-box-pad-y-top: calc(var(--space-10) - 4px);
--layer-nav-box-pad-y-bottom: calc(var(--space-10) + 4px);
--layer-nav-row-gap: var(--space-10);
--layer-nav-hover-shift: calc(-1 * var(--space-20));
--layer-nav-font-size: var(--type-nav-size); /* calc(3.625rem + 10pt) */
```

Runtime config mirror: `CONFIG.layerNavigation` in `js/config.js` (`boxPadding`, `rowGap`, `markerGap`, etc. at `0.625rem`).

### Marker skeleton (`assets/ui/layer-nav-marker.svg`)

- Fixed curved spine + two divider ticks + 6px corners.
- 1px non-scaling hairlines (`--outline-weight`), `currentColor`.
- Spine gap: SVG mask `#layer-nav-marker-spine-gap` — black `layer-nav-marker__gap-mask` line punches transparent notch in spine.
- Selection indicator: **filled SVG circle** (`.layer-nav-marker__dot`), not an X.
- Selection group (dot + gap mask) moves via CSS `--layer-nav-marker-selection-y`:
  - level 1 (macro): `-66.67%`
  - level 2 (meso): `-33.33%`
  - level 3 (micro): `0%`
- Marker container `top` also shifts per level by `--layer-nav-row-step`.

### Dot sizing & gap sync (`js/navigation-map.js`)

- `syncLayerMarkerDot()` sets circle `r` from `--dot-size` (scaled 10px macro dot), not `--tag-dot-size` (8px tag pill dot).
- Gap line `y1`/`y2` derived from dot `cy ± r`.
- Called from `syncLayerNavMetrics()` on load, font ready, resize, and level change.

**Session note (verified working approach):** A prior iteration used an HTML `.tag-circle` dot + `syncLayerMarkerGap()` reading the dot’s `getBoundingClientRect()` every frame during the 480ms transition. User confirmed gap alignment was **perfect** with that approach. Current code uses SVG circle + `--dot-size`. If dot/tag size unity is revisited, prefer the HTML `.tag-circle` + rect-sync pattern over scaling an SVG `r`.

---

## Relevant code files

```
styles.css                          — layer nav tokens, label chrome, marker CSS
js/navigation-map.js                — label mount, syncLayerNavMetrics, syncLayerMarkerDot
js/config.js                        — layerNavigation + TYPE_SCALE tokens
assets/ui/layer-nav-marker.svg      — skeleton + dot + gap mask
docs/visual-language.md             — changelog (may still say “X” in marker table — update if touching marker)
```

---

## Constraints

- Agent/docs in **English**; Hebrew UI strings stay Hebrew.
- **No physics / scroll / capture changes** without reading `docs/CHECKPOINT.md`.
- Scoped visual chrome edits only unless user expands scope.
- Prefer `--space-*`, `rem`, and site-grid tokens over raw px.
- After chrome changes, update `docs/visual-language.md` in the same session.
- Do not reintroduce fixed 2.5-row label slot grid — stack height is content-driven.

---

## Verification

1. Open `http://127.0.0.1:5501/` at 1920×1080; hard refresh.
2. **Labels:** active/inactive colors, 10px side padding, asymmetric vertical padding, optical trim looks even (especially **מזו** and **מיקרו**).
3. **Hover:** inactive shifts −20px; active does not.
4. **Layer switch:** click מאקרו → מזו → מיקרו; active label stays on fixed viewport anchor; marker spine follows stack.
5. **Dot + gap:** circle centered on active row tick; spine notch clears the dot at rest and during transition.
6. **Dot size:** confirm whether user wants `--dot-size` (10px) or `--tag-dot-size` (8px) — unify if asked.

### Playwright — label metrics

```js
async () => {
  await new Promise(r => setTimeout(r, 2000));
  return [...document.querySelectorAll('.site-navigation-layers__label')].map(label => {
    const lr = label.getBoundingClientRect();
    const cs = getComputedStyle(label);
    return {
      text: label.textContent.trim(),
      fontSize: cs.fontSize,
      padding: cs.padding,
      height: Math.round(lr.height)
    };
  });
}
```

### Playwright — dot vs gap alignment (all levels)

```js
async () => {
  const measure = () => {
    const marker = document.querySelector('.site-navigation-layers__marker');
    const svg = marker?.querySelector('svg');
    const dot = svg?.querySelector('.layer-nav-marker__dot');
    const gapLine = svg?.querySelector('.layer-nav-marker__gap-mask');
    const dotRect = dot?.getBoundingClientRect();
    const dotCenter = dotRect ? { x: dotRect.x + dotRect.width / 2, y: dotRect.y + dotRect.height / 2 } : null;
    let gapCenter = null;
    if (gapLine && svg) {
      const pt = svg.createSVGPoint();
      pt.x = parseFloat(gapLine.getAttribute('x1'));
      pt.y = (parseFloat(gapLine.getAttribute('y1')) + parseFloat(gapLine.getAttribute('y2'))) / 2;
      const ctm = gapLine.getScreenCTM();
      if (ctm) gapCenter = { x: pt.matrixTransform(ctm).x, y: pt.matrixTransform(ctm).y };
    }
    return {
      level: marker?.dataset.level,
      deltaY: dotCenter && gapCenter ? +(dotCenter.y - gapCenter.y).toFixed(2) : null,
      deltaX: dotCenter && gapCenter ? +(dotCenter.x - gapCenter.x).toFixed(2) : null
    };
  };
  const results = [];
  for (const name of ['מאקרו', 'מזו', 'מיקרו']) {
    [...document.querySelectorAll('.site-navigation-layers__title')]
      .find(b => b.textContent.includes(name))?.click();
    await new Promise(r => setTimeout(r, 700));
    results.push({ name, ...measure() });
  }
  return results;
}
```

Target: **|deltaY| < 1px** and **|deltaX| < 1px** on all three levels.

---

## Agent prompt

**Language:** English.

**Copy from here**

────────────

Continue exhibition **layer navigation** polish for עקבות | Alternative Index.

Read first:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@docs/work/2026-07-05-layer-navigation-followup.md
@styles.css
@js/navigation-map.js
@js/config.js
@assets/ui/layer-nav-marker.svg
```

**Goal:** Apply my next specific layer-nav corrections only. Inspect the live state at `http://127.0.0.1:5501/` (1920×1080) with Playwright before editing.

**Locked baseline — do not break without explicit request:**

- Label stack: content-measured heights via `syncLayerNavMetrics()`; 10px inter-label gap; asymmetric vertical padding for Hebrew optical balance; `text-box-trim` on labels.
- Active label: color 3 / color 6; inactive: color 6 / color 3; inactive hover −20px only.
- Marker: fixed SVG skeleton + moving selection circle + spine gap mask; selection shifts −66.67% / −33.33% / 0% for macro/meso/micro.
- Typography: `--type-nav-size` = `calc(3.625rem + 10pt)`.

**Workflow:**

1. Ask me for the exact next correction if not provided.
2. Measure with Playwright (switch all three layers).
3. Scoped edits only; match existing token patterns.
4. If editing `js/*.js` → `sh ./build-js.sh`.
5. `ReadLints` on changed files.
6. Re-verify with Playwright.
7. Update `docs/visual-language.md` for any chrome change.

**Success criteria:**

- Hebrew labels unchanged.
- Layer-nav geometry stays tied to site-grid / measured label boxes.
- Dot and spine gap stay aligned through layer transitions.
- No regressions to physics, minimap, or depth transitions.

**Out of scope:**

- Macro physics, blocks, capture, stretch, scroll clamping, data pipeline, note content, broad layout refactors.

────────────

**End**

---

## Notes / follow-up

### Completed in prior session (2026-07-04 late)

- Label padding optical fix via `text-box-trim` (cap–alphabetic).
- Extra vertical padding for Hebrew descenders (ק in **מיקרו**).
- Marker selection changed from **X** to **filled circle**.
- Circle/tag size unity explored — user wants same circle unit as tag pills site-wide.
- Gap mask alignment fix: slot-based dot position + gap synced from dot `getBoundingClientRect()` (user verified **perfect**).

### Possible next tasks (ask user)

- Unify marker dot with `--tag-dot-size` (8px) vs current `--dot-size` (10px).
- Update `docs/visual-language.md` marker row (still references “X” in asset table).
- Fine-tune divider tick Y if label box heights drift after font/token changes.
- Reconcile toroidal-scroll archive patch (`docs/archive/2026-07-05-toroidal-infinite-scroll/`) if that branch is merged — it contains alternate layer-nav implementations.

### Do not break

See `@docs/CHECKPOINT.md` for physics/navigation baseline. Layer nav is **visual chrome only** — keep changes isolated to `styles.css`, `navigation-map.js`, marker SVG, and `config.js` tokens.
