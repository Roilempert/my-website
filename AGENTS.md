# עקבות | Alternative Index

## Project goal

A **laboratory** for exploring how people use mobile notes — a platform to investigate, explore, and learn from short written traces captured on phones. Visitors are invited to express **nosiness**: unconventional filtering and digital roaming to snoop through a live note archive. The site is **ceremonial** — a threshold for seeing into the human mind through its words — while remaining **slick, fun, and well designed**, not a dry database or institutional archive.

Full experience architecture: [`docs/architecture/experience-model.md`](docs/architecture/experience-model.md).

## What I want to achieve

- **Live data pipeline:** A stable system that loads note data (Google Sheets with local CSV fallback) and maps each row to an object on the canvas.
- **Three-part experience** *(opening screen planned; Experience 2 planned):*
  - **Opening screen** — ceremonial onboarding threshold; typographic **silhouette forms** as abstract artistic decoration (not readable notes). *Status: planned.*
  - **Experience 1 — Spatial laboratory** — the current build: L1 macro physics, L2 micro (full notes grid), blocks, capture, inspector. Two complementary modes inside this path:
    - **Discovery (roaming)** — curiosity-driven snooping through motion, proximity, and aimless roaming across a deep scroll/zoom space.
    - **Study (focus)** — intentional investigation via blocks, tags, capture, and depth zoom (macro → micro).
  - **Experience 2 — Archive roaming** — a second, different way to roam the archive. *Status: planned — design TBD.*
- **Deep display space:** Two zoom levels — **L1** macro (dots + physics) and **L2** micro (full readable notes). Legacy meso silhouettes removed from navigation; silhouette geometry kept for opening-screen art only.
- **Data-driven physics:** Stable object behavior, clustering, and capture driven by each note's data (tags, layout), with precise colliders and no clipping.
- **Typographic meso:** Medium zoom showed **typographic silhouettes** — abstract structure from title/body layout, not full readable notes. Silhouettes also serve opening-screen art. *(Legacy meso code / MesoMock interim — not a navigable level; see Meso layer below.)*
- **Optimization:** High, stable client-side performance for exhibition hardware and large note counts.

## Experience architecture

| Part | Status | Role |
|------|--------|------|
| **Opening screen** | planned | Ceremonial entry; sets the rules of looking; silhouette SVG paths as decorative art |
| **Experience 1 — Spatial laboratory** | **active** | Full current build — L1 macro + L2 micro grid, warehouse/blocks, inspector |
| **Experience 2 — Archive roaming** | planned | Complementary archive path — different roaming and filtering mechanics TBD |

Details, silhouette art intent, and Experience 2 open questions: [`docs/architecture/experience-model.md`](docs/architecture/experience-model.md).

## Context

Bezalel visual communication graduation project, year 4. Built for **frontal exhibition display** on a **21.5″ iMac** (primary presentation machine). Print and other offline media are **out of scope**.

**Exhibition hardware:** 21.5-inch screen — design and performance targets assume this viewport; launcher steps in [`EXHIBITION-START-HERE.txt`](EXHIBITION-START-HERE.txt).

**Saved baseline (2026-07-05):** Before major redesign, the pre-change site was saved in two places — Git branch `archive/2026-07-05-pre-redesign` (GitHub) and local folder `my-website-old` (sibling to this repo). Details: [`docs/archive/2026-07-05-pre-redesign/README.md`](docs/archive/2026-07-05-pre-redesign/README.md).

## Design direction

| Layer | Direction |
|-------|-----------|
| **Product UI** | Slick, fun, well crafted — spatial, responsive, rewarding to move through |
| **Ceremonial tone** | Threshold and invitation to look — respect for private words; nosiness as a designed affordance, not voyeurism for its own sake |
| **Content** | Hebrew personal notes from phones; tags as investigation categories |
| **Agent/docs tone** | Clear, professional, analytical (English) — see `.cursor/rules/english-communication.mdc` |

Do not default to a cold clinical or faux-archival aesthetic unless a specific task calls for it.

## Layout reference

**Site shell grid:** **24 columns × 12 rows** — viewport-level proportions, padding, and UI anchors (`CONFIG.siteGrid`). See [`docs/architecture/site-grid.md`](docs/architecture/site-grid.md).

Canvas grids inside `#app` (macro physics, L2 micro) are separate and wider than the viewport; do not confuse them with the 24×12 shell.

**Depth naming:** Two navigable levels — **L1** (macro) and **L2** (micro). Internal code still uses level index `3` for micro (`activeLevels: [1, 3]`, `view-level-3`, `DepthController.currentLevel === 3`). Legacy meso (old middle zoom) is code level `2` only — not navigable.

## Technical stack

- Static site: `index.html`, `styles.css`, `js/app.js` (bundled from `js/*.js` via `build-js.sh`)
- **Site language:** Hebrew, RTL at the UI layer (content stays Hebrew).
- **Work language:** English for docs, agents, and code comments.
- Libraries: Matter.js (`vendor/matter.min.js` — bundled locally for offline/exhibition).
- **Docs:** [`docs/DOC-INDEX.md`](docs/DOC-INDEX.md) · **Visual language:** [`docs/visual-language.md`](docs/visual-language.md) · **Stability:** [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md)
- **Experience model:** [`docs/architecture/experience-model.md`](docs/architecture/experience-model.md) · **Depth (V2 active):** [`docs/architecture/depth-v2.md`](docs/architecture/depth-v2.md) · legacy: [`docs/architecture/depth-legacy.md`](docs/architecture/depth-legacy.md)

## Glossary

| Term | Definition | In code |
|---|---|---|
| **Opening screen** | Pre-experience onboarding threshold; silhouette art, path choice. *Planned.* | — |
| **Experience 1** | Spatial laboratory — current full build (L1 + depth + blocks). | — |
| **Experience 2** | Complementary archive-roaming path. *Planned.* | — |
| **Note** | Base content unit from data (title, body, ID, tags). | `item` / `.note-wrapper` |
| **Tag** | Category with name and color from the sheet tag dictionary. | `tagColorsMap` |
| **Dot** | Visual for one tag inside a note; the small physics body in space. | `.layer-dot` / `bodiesData` |
| **Silhouette** | Meso view: SVG path from row rectangles — width × height from `.note-title` / `.note-body` layout. | `.meso-silhouette__shape` |
| **Meso frame** | Shared geometry anchor for silhouette and note inside `.note-stage`. | `syncMicroFrame` / `--meso-frame-w` |
| **Tag marker** | Coarse colored circle on the silhouette; static. | `.meso-tag-dot` |
| **Molecule** | Note in macro mode: its dot cluster plus sibling links. | — |
| **Link / line** | Thin line between sibling dots; also a physics spring. Drawn on proximity, or always while stretched. | `siblingLinks` |
| **Hull** | Rounded outline around a molecule (convex hull). | `strokeHullOutline` |
| **Block** | Warehouse element placed on the surface; affects notes and their motion. | `ActionWarehouse.blocks` |
| **Frame** | Special block (rounded square) dragged to the surface; other blocks snap into its inner elliptical window. The frame does not capture notes itself — only the nested block. | `type: 'frame'` / `.action-block--frame` |
| **Window** | Elliptical slot inside a frame where another block lands. | `.frame-slot-window` |
| **Snap** | Locking a regular block into a spread frame window; inner block remains a capture anchor. | `snapBlockIntoFrame` / `nestedBlock` |
| **Warehouse** | Bottom portal storing all blocks; includes RESET. | `.action-warehouse` |
| **Message band** | Top half-row of action dock (after statistics): hover port, midpoint divider, system message. | `.warehouse-message-band` |
| **Hover port** | Left **¼** of message band; reserved dock chrome (L1 hover uses floating canvas label). | `.warehouse-hover-port` |
| **System message** | Right **¾** of message band; static dock instruction (`גררו להפעלה`). | `.warehouse-message-port` |
| **Slot** | Single block storage cell in the warehouse. | `.block-slot` |
| **Surface** | Canvas area where blocks are placed so notes orbit them — the cleared center in the work grid. | — |
| **Canvas** | Full workspace (wider than the viewport) where notes and blocks live. | `#app` |
| **Original grid** | Initial note layout when no blocks are on the surface. | `physicsTarget` |
| **Work grid** | Secondary layout: notes move to both sides; center clears for the surface. Active when a block leaves the warehouse. | `workspaceCenters` |
| **Capture** | Note whose tag matches a spread block and is pulled toward it. | `noteAnchors` |
| **Anchor** | Matching dot of a captured note on the ring, facing the block. | `overrideTarget` |
| **Ring** | Radial layout of captured notes around a block; radius grows with count. | `updateOrbits` |
| **Stretch** | Note captured by two or more blocks, pulled between them on springs. | `stretchedNotes` |
| **Edge scroll** | Canvas navigation by holding the pointer at screen edges; clamped to content bounds. | `SpatialNavigation` |
| **Depth levels** | Two active levels: **L1** macro (dots + physics), **L2** micro (full notes grid). Legacy meso not navigable; silhouettes reserved for opening-screen art. | `DepthController`, `activeLevels: [1, 3]` (micro = code level 3) |
| **Inspector** | Single-note focus popup (optional on L2 click). | `ArtifactInspector` |

## Working guidelines

- **Reply in English** for agent communication, plans, and technical summaries.
- **Do not translate site content** — Hebrew UI and note data stay as-is.
- Code and identifiers in English only; prefer English code comments.
- Communication rules: `.cursor/rules/english-communication.mdc`
- Keep agent replies direct and analytical; no filler.
- When describing study themes in docs, use precise observational language — not generic self-help jargon.
- Practical modular JavaScript solutions; no unnecessary external dependencies.
- **Physics/navigation changes:** read [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md) first.

## Work session (new topic)

No fixed task board. Per topic:

1. Copy `docs/work/session-template.md` to a dated file (e.g. `docs/work/2026-06-18-meso-transition.md`), or ask the agent to create one.
2. Fill in "What I want" and "Verification".
3. New agent chat — attach the session file + `@AGENTS.md`; for physics also `@docs/CHECKPOINT.md`.

Details: [`docs/DOC-INDEX.md`](docs/DOC-INDEX.md#work-sessions)

## Meso layer (legacy — not navigable)

**Target (opening art):** Typographic **silhouettes** — measured from each note's title/body layout (`SilhouetteEngine`), abstract structure rather than readable text.

**Current build:** Legacy meso / **MesoMock** (p5 gradient placeholders) remains in the codebase for silhouette geometry and opening-screen art. It is **not** a navigable depth level. The readable deep layer is **L2 micro**.

| Topic | Reference |
|-------|-----------|
| V2 grids, legacy meso vs L2 micro | [`docs/architecture/depth-v2.md`](docs/architecture/depth-v2.md) |
| Silhouette measurement | `js/silhouette-engine.js` |
| Interim mock | `js/meso-mock.js`, `js/meso-gradient-p5.js` |
| Layout | `js/depth-v2.js` — L2 micro canvas grid (+ legacy meso code) |
| Structure | `.note-stage` — silhouette + note, shared zoom (`--note-zoom`) |
| Zoom transitions | `DepthTransitionOrchestrator`, `MacroMesoBridge`, `CatalogState` |
