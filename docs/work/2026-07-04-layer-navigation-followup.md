# Layer Navigation Refinement — work session

**Date:** 2026-07-04

**Status:** open

---

## What I want

Continue refining the exhibition layer navigation without losing the current locked state. The layer labels should remain aligned to the site-shell grid logic and should keep the current chrome unless the user gives a specific correction.

---

## Context

Files to attach to the next agent:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@styles.css
@js/config.js
```

Use Live Server at:

```
http://127.0.0.1:5501/
```

Use Playwright MCP whenever possible for visual verification.

---

## Current Layer Navigation State

- Labels: `מאקרו`, `מזו`, `מיקרו`.
- Active label: color 3 fill, color 6 text.
- Inactive labels: color 6 fill, color 3 text.
- Label type: `.general-h` / nav token at `4.375rem` = 70px on the 16px root.
- Line height: derived from the 3-row stack formula; latest measured value was about `62.67px`.
- Padding: `var(--space-10)` = 10px.
- Radius: `var(--space-5)` = 5px.
- Full three-label stack: `3 * var(--site-grid-cell-h)`, with two `var(--space-5)` gaps included.
- Active label placement: aligns to the 75% vertical guide of shell row 4.
- Active label column: back in the original right-aligned column, no permanent offset.
- Inactive hover only: label shifts left by `var(--space-20)` = 20px.
- Active hover: no shift.
- Selection marker SVG: `assets/ui/layer-nav-marker.svg`, mounted as `.site-navigation-layers__marker`, on the right side of the active label.

Key CSS variables in `styles.css`:

```
--type-nav-size: 4.375rem;
--layer-nav-box-pad: var(--space-10);
--layer-nav-hover-shift: calc(-1 * var(--space-20));
--layer-nav-stack-h: calc(3 * var(--site-grid-cell-h));
--layer-nav-row-gap: var(--space-5);
--layer-nav-label-h: calc((var(--layer-nav-stack-h) - 2 * var(--layer-nav-row-gap)) / 3);
--layer-nav-line-h: calc(var(--layer-nav-label-h) - var(--layer-nav-box-pad) * 2);
--layer-nav-font-size: var(--type-nav-size);
```

Runtime token source in `js/config.js`:

```
TYPE_SCALE.generalH.sizePt = 70
TYPE_SCALE.nav.sizeRem = 4.375
```

If `js/config.js` changes, run:

```
sh ./build-js.sh
```

---

## Relevant code files

```
styles.css
js/config.js
js/app.js
docs/visual-language.md
assets/ui/layer-nav-marker.svg
```

Do not edit `js/app.js` directly. It is generated.

---

## Constraints

- Agent/docs in English; Hebrew UI/content stays Hebrew.
- No broad refactors. Ask for the next correction list before changing more chrome.
- Prefer `rem`, `--space-*`, and site-grid units.
- Avoid raw px in final CSS except accepted cases; translate Figma px to tokens.
- After visual chrome changes, update `docs/visual-language.md` in the same session.
- If editing `js/*.js`, run `sh ./build-js.sh`.
- Use Playwright MCP to verify rendered positions and hover behavior.
- For physics/navigation behavior changes beyond this label chrome, read `docs/CHECKPOINT.md` first.

---

## Verification

How to verify the current layer-navigation baseline:

1. Open `http://127.0.0.1:5501/` at `1920×1080`.
2. Confirm label font size computes to `70px`.
3. Confirm active label has color 3 fill and color 6 text.
4. Confirm inactive labels have color 6 fill and color 3 text.
5. Confirm active label has no hover transform.
6. Hover an inactive label and confirm transform is `translateX(-20px)` / matrix x = `-20`.
7. Confirm full stack height equals `3 * site-grid-cell-h` and includes the two 5px gaps.
8. Confirm active label center aligns to the 75% guide of shell row 4.

Useful Playwright measurement snippet:

```js
() => [...document.querySelectorAll('.site-navigation-layers__title')].map(btn => {
  const label = btn.querySelector('.site-navigation-layers__label');
  const marker = btn.querySelector('.site-navigation-layers__marker');
  const rect = label.getBoundingClientRect();
  const style = getComputedStyle(label);
  return {
    level: btn.dataset.level,
    active: btn.classList.contains('is-active'),
    hovered: btn.matches(':hover') || label.matches(':hover'),
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    padding: style.padding,
    transform: style.transform,
    top: rect.top,
    bottom: rect.bottom,
    height: rect.height,
    marker: !!marker
  };
})
```

---

## Agent Prompt

**Language:** English.

**Copy from here**

────────────

Continue the exhibition layer-navigation refinement for עקבות | Alternative Index.

Read first:

```
@AGENTS.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@styles.css
@js/config.js
```

Current locked layer-navigation state:

- `.general-h` / layer nav text is `4.375rem` = 70px.
- Active label: color 3 fill, color 6 text.
- Inactive labels: color 6 fill, color 3 text.
- Padding: `var(--space-10)`.
- Radius: `var(--space-5)`.
- Full stack: 3 shell rows total, including two 5px gaps.
- Active label aligns to the 75% vertical guide of shell row 4.
- Active label is back in the original right-aligned column.
- Inactive hover only shifts left by `var(--space-20)` = 20px.
- Active hover does not shift.
- Marker SVG: `assets/ui/layer-nav-marker.svg`, mounted on the right side of the active label.

Workflow:

1. Ask me for the next exact correction before broad changes.
2. Inspect the current rendered state with Playwright at `http://127.0.0.1:5501/`.
3. Make scoped edits only.
4. If editing `js/*.js`, run `sh ./build-js.sh`.
5. Run `ReadLints` on changed files.
6. Verify with Playwright.
7. Update `docs/visual-language.md` for any chrome change.

Success criteria:

- Hebrew labels stay Hebrew.
- No Figma placeholder text is introduced.
- Layer-navigation geometry remains tied to site-grid variables.
- Hover affects inactive labels only unless I explicitly ask otherwise.

Out of scope:

- Physics, canvas movement, minimap behavior, data pipeline, note content, and broad layout refactors.

────────────

**End**

---

## Notes / Follow-Up

Latest verified state before this handoff:

- Active label returned to original column after a temporary 20px active offset experiment.
- Inactive hover remains a 20px left movement.
- `ReadLints` was clear after the latest layer-nav edit.
