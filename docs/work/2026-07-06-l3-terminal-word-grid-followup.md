# L3 Terminal — word grid follow-up

**Date:** 2026-07-06

**Status:** superseded — L3 terminal reverted 2026-07-06. Use [`2026-07-06-censored-l3-followup.md`](2026-07-06-censored-l3-followup.md) instead.

---

## Agent prompt (copy below)

**Language:** English for agent replies; Hebrew for site UI only.

**Attach:** `@AGENTS.md` · `@docs/work/2026-07-06-l3-terminal-word-grid-followup.md`

---

### Context

**עקבות** — Bezalel graduation project. Three-part architecture:

| Part | Layer | Status |
|------|-------|--------|
| Opening screen | `opening.html` → `opening-app.js` | built |
| Experience 1 — Spatial laboratory | L1 macro (blocks, physics, warehouse) | active |
| **Experience 2 — Archive word terminal** | **L3 micro** via layer nav **מיקרו** | **in progress** |

Experience 2 is **not** a parallel route. It lives on the **same `#app` canvas** as Exp 1. User switches via layer labels **מאקרו / מיקרו** (`NavigationMap.navigateToLayer` → `DepthController.changeLevel(3)`).

**Entry flow:** `index.html` redirects → `opening.html` → `experience.html` (main app).

The old brick-wall / `#archive-roam` / `ExperienceRouter` path was **deleted**. Do not reintroduce it.

---

### What was built (2026-07-05 → 2026-07-06)

**Module:** `js/l3-terminal.js` (bundled via `./build-js.sh` → `js/app.js`; never edit `app.js` directly)

**Interaction:**
1. Enter L3 → empty canvas, **no note cards visible** (`body.is-l3-terminal-idle` hides `#app > .note-wrapper`)
2. **Word grid** fills canvas — all tokens with **minDocFreq ≥ 2** (~**949 words** on live Google Sheet, ~279 on local CSV)
3. Each word is a **note-style tile**: `.note-t` typography, white fill (`--color-1`), 5px radius, 1pt border, 5px flex-wrap gap
4. **Drag tile → terminal drop zone** in dock → instant OR search → matching notes appear in micro grid
5. Chips in terminal; **נקה** clears search and restores word grid
6. Viewport pans to revealed notes (`AppState.centerL3TerminalResults`)

**Performance fix:** Micro grid layout is **deferred** until first search (`DepthV2.shouldDeferTerminalMicroGrid()`). L3 entry was ~8s freeze before this; now ~30ms.

**Key files:**

| File | Role |
|------|------|
| `js/l3-terminal.js` | Word index, grid render, drag-to-terminal, search, chips |
| `js/depth-v2.js` | `shouldDeferTerminalMicroGrid`, `teardownTerminalMicroGrid`, partition filter via `L3Terminal.isNoteVisible()` |
| `js/app-state.js` | `centerL3TerminalResults`, data-load hook refreshes grid if already on L3 |
| `js/config.js` | `CONFIG.l3Terminal` — `floatWords: { minDocFreq: 2, maxCount: 0 }` |
| `styles.css` | `.l3-word-grid`, `.l3-word-tile`, `.is-l3-terminal-idle` note hiding |
| `experience.html` | Main app shell (no opening screen inline) |

**Do not break:** L1 physics/blocks (`docs/CHECKPOINT.md`), opening screen, data pipeline, `MicroMock` cards, `ArtifactInspector`.

---

### Word counts (verified)

Same tokenization as L3 terminal (title + body, min 2 chars, Hebrew stop words, no pure numbers):

| Source | Notes | Words in **2+ notes** | 3+ | 5+ |
|--------|-------|----------------------|-----|-----|
| Live Google Sheet | 294 | **949** | 378 | 133 |
| Local `data/main.csv` | 129 | **279** | 95 | 19 |

Config `maxCount: 0` = show all qualifying words.

---

### Likely next tasks (pick with user)

1. **Visual polish** — tile sizing, density, frequency-based opacity/scale, English vs Hebrew tile direction (`TextDirection`), filter English tokens like `the`
2. **Grid layout** — fixed column width vs content-width tiles; canvas padding aligned to 24×12 site grid; sticky terminal while scrolling 949 tiles
3. **Performance** — 949 DOM nodes on enter; consider virtualized scroll or viewport culling if exhibition iMac struggles
4. **Interaction** — magnetic snap into terminal, multi-word combine UX, click-to-search alternative to drag
5. **Search results** — note grid layout for matches, return-to-word-grid animation on clear
6. **Docs** — update `AGENTS.md`, `docs/architecture/experience-model.md`, `docs/external-agent-brief.md` (still describe deleted brick wall)

---

### Verification checklist

- [ ] `opening.html` → כניסה → `experience.html` loads
- [ ] L1 macro: blocks + physics unchanged
- [ ] Click **מיקרו**: fast entry, **no note cards**, ~949 word tiles in flex grid
- [ ] Drag word → terminal → notes appear, viewport pans to cluster
- [ ] **נקה** → word grid returns, notes hidden
- [ ] Click **מאקרו** → block tray returns, terminal unmounts
- [ ] After `./build-js.sh`, refresh cache-busted `app.js`

---

### Build

```bash
./build-js.sh   # after any js/*.js edit (except config.js — loads separately)
```

Serve: `python3 -m http.server 8765` → open `opening.html` or `experience.html`.

---

## What I want

*(User fills in priority for next session)*

```
[e.g. polish tile grid density / filter English tokens / virtualize 949 tiles / update docs]
```

---

## Notes

- Previous transcript: agent session on L3 terminal + word grid (2026-07-05/06)
- Saved pre-redesign baseline: branch `archive/2026-07-05-pre-redesign`, folder `my-website-old`
