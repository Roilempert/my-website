# Opening screen — planning session

**Date:** 2026-07-05

**Status:** open

---

## What I want

Plan the **opening screen** — the ceremonial threshold before Experience 1 or Experience 2. Produce a design + implementation plan (not code yet unless I ask).

---

## Context

Attach to the agent:

```
@AGENTS.md
@docs/architecture/experience-model.md
@docs/visual-language.md
@docs/architecture/site-grid.md
@js/silhouette-engine.js
@js/meso-silhouette-cache.js
```

---

## Relevant code files

```
index.html
styles.css
js/config.js
js/silhouette-engine.js
js/meso-silhouette-cache.js
js/bootstrap.js
```

---

## Constraints

- **Plan mode first** — deliver a structured plan; do not implement until I approve.
- Site UI copy stays **Hebrew**; agent communication in **English**.
- Match exhibition target: **21.5″ iMac @ 1920×1080**, shell grid **24×12** (`CONFIG.siteGrid`).
- Tone: **slick, fun, ceremonial** — not clinical or faux-archival.
- Silhouette SVG paths are **decorative art only** on opening — no readable note text.
- Do not break Experience 1 (spatial laboratory) — opening is a new entry layer on top.

---

## Verification

1. Plan covers layout, motion, silhouette art treatment, and path choice (Experience 1 vs 2).
2. Plan names concrete files to touch and a phased build order.
3. Plan respects existing visual language tokens where possible; lists new tokens needed.
4. Hebrew UI strings are proposed but not translated from note data.

---

## Agent prompt

**Language:** English.

**Copy from here**

────────────

# Opening screen — plan the ceremonial threshold

@AGENTS.md
@docs/architecture/experience-model.md
@docs/visual-language.md
@docs/architecture/site-grid.md

## Site purpose (read this first)

**עקבות** is no longer framed as a generic “study platform.” It is a **laboratory** for exploring how people use **mobile notes** — a place to investigate, explore, and learn. Visitors are invited to express **nosiness**: unconventional filtering and digital roaming to snoop through a live note archive.

The site is **ceremonial** — a threshold for seeing into the human mind through its words — while staying **slick, fun, and well designed** (not a dry database or institutional archive).

The product has **three parts**:

1. **Opening screen** *(you are planning this)* — ceremonial entry; silhouette art; visitor chooses a path
2. **Experience 1 — Spatial laboratory** *(built today)* — L1 macro physics + L3 micro notes grid, blocks, warehouse, inspector
3. **Experience 2 — Archive roaming** *(planned separately)* — a second, different way to roam the archive

## Recent architecture changes (important)

- **Depth levels:** Only **L1 (macro)** and **L3 (micro)** are navigable (`CONFIG.depth.activeLevels: [1, 3]`). **L2 meso was removed** from the live site.
- **L2 silhouettes** are **not** a zoom level anymore. `SilhouetteEngine` + `meso-silhouette-cache.js` remain in the codebase specifically to supply **abstract typographic shapes** for opening-screen art and future offline use.
- Experience 1 today loads directly into L1; there is **no opening screen yet** in `index.html`.
- Layer nav labels today: **מאקרו** / **מיקרו** (inside Experience 1 only).

## Your task

**Plan** the opening screen — do not implement until I approve the plan.

### The opening screen must

1. **Set ceremonial tone** — establish the rules of looking: what it means to peer into private phone notes with permission to be curious.
2. **Show silhouette art** — reuse measured typographic silhouette SVG paths (from `SilhouetteEngine` / cache) as **abstract decorative forms** — scaled, scattered, layered, or animated. **No readable note text** on this screen.
3. **Offer path choice** — visitor enters **Experience 1** (spatial laboratory) or **Experience 2** (archive roaming — can be a placeholder/disabled state until Exp 2 is built).
4. **Fit the exhibition shell** — 24×12 site grid, existing color/type system where possible; propose new tokens in `docs/visual-language.md` if needed.

### Deliver in your plan

- **User flow** — first visit → opening → chosen experience; return visit behavior (skip opening? always show?)
- **Layout** — wireframe-level description tied to site grid rows/columns
- **Silhouette art direction** — how many shapes, motion (if any), density, relationship to background; how to sample from cache without blocking load
- **Copy** — Hebrew UI strings for invitation, path labels, any legal/ceremonial framing (propose text, do not translate note content)
- **Motion & timing** — entrance, idle, exit transition into Experience 1 or 2
- **Technical approach** — new HTML layer vs full-screen overlay; routing/state flag; where init hooks in `bootstrap.js`; what to add to `config.js`
- **Phased implementation** — MVP (static opening + one path) vs full (both paths + animation)
- **Risks** — performance with many SVG paths on exhibition iMac; RTL; not breaking `#app` boot

### Constraints

- Agent replies in **English**; site UI in **Hebrew**.
- Do not modify note data or translate sheet content.
- Do not refactor Experience 1 physics/navigation unless the plan explicitly requires an entry hook.
- Prefer reusing `SilhouetteEngine` / cache over re-measuring all notes on every load.

### Success criteria

- I can hand your plan to a second agent and they know exactly what to build.
- Clear distinction between opening chrome and Experience 1/2 runtime.
- Silhouette art intent is specific enough to sketch in Figma or code.

### Out of scope for this session

- Building Experience 2 (only plan how the opening routes to it).
- Removing dead L2 meso code from the repo.
- Changing Hebrew site title (`עקבות | אינדקס אלטרנטיבי`) unless you justify it.

────────────

**End**

---

## Notes / follow-up

(filled in after work)
