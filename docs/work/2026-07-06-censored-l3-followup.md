# Censored L3 theme — follow-up

**Date:** 2026-07-06

**Status:** paused — superseded for word hover by [`2026-07-06-censored-l3-word-hover-followup.md`](2026-07-06-censored-l3-word-hover-followup.md)

**Prior session:** censored micro grid + disabled note focus (2026-07-06). Transcript: agent session `811e0c11-157d-4628-b648-96eab1c09068`.

---

## Agent prompt (copy below)

**Language:** English for agent replies; Hebrew for site UI only.

**Attach:** `@AGENTS.md` · `@docs/work/2026-07-06-censored-l3-followup.md` · `@docs/CHECKPOINT.md` (if touching L1 physics/navigation)

────────────

**Censored L3 theme — continue from current build**

@AGENTS.md
@docs/work/2026-07-06-censored-l3-followup.md

Goal: Continue work on the **censored L3 micro grid** (redaction bars, no tags, no note focus). Read this file for current state, then ask the user which item from **Likely next tasks** to prioritize — or follow their new instruction.

Constraints:
- Edit `js/*.js` only → run `./build-js.sh` (never edit `app.js` directly). `config.js` loads separately — no rebuild needed for config-only changes.
- **L1 macro must stay fully readable and interactive** — colored tag dots, hover titles, blocks, physics, inspector on L1.
- Censored theme is **L3 only** (`NoteCensor.isActive()` = theme enabled + `DepthController.currentLevel === 3`).
- Do not break opening screen (`opening.html` → `experience.html`), data pipeline, or physics baseline (`docs/CHECKPOINT.md`).
- Do not reintroduce the reverted **L3 word-terminal** (`js/l3-terminal.js` was deleted 2026-07-06).

Success criteria:
- Depends on chosen task — see **Verification checklist** below.

Out of scope unless user asks:
- Experience 2 archive-roaming mechanics (design TBD)
- Translating Hebrew UI or note content
- Git commit/push unless explicitly requested

────────────

---

## Context

**עקבות** — Bezalel graduation project (21.5″ iMac exhibition target).

| Part | Route / layer | Status |
|------|---------------|--------|
| Opening screen | `opening.html` → `opening-app.js` | built |
| Experience 1 — Spatial laboratory | L1 macro + L3 micro on same `#app` | **active** |
| Experience 2 — Archive roaming | TBD (not the reverted word-terminal) | planned |

**Entry flow:** `index.html` redirects → `opening.html` → `experience.html`.

Layer nav **מאקרו / מיקרו** switches L1 ↔ L3 via `NavigationMap` → `DepthController.changeLevel`.

---

## What was built (censored L3, 2026-07-06)

### Toggle

```javascript
// js/config.js
theme: {
    mode: 'censored'   // 'default' | 'censored'
}
```

Set to `'default'` to restore readable L3 (tags, text, focus inspector). Config-only — hard refresh after change.

### Visual (L3 only)

- White `.micro-mock__card.note-card` with black **redaction bars** (`.note-redact__bar`) instead of title/body text
- Bar count/width derived from real note text via `NoteCensor.expandVisualLines()` (title wrap 24 chars, body 38 — aligned with `depth-v2` weight estimate)
- **No tag pills** on cards (`MicroMock.buildTagsRowHTML` returns empty when active)
- **No attached blocks** on L3 cards (censored layout path)
- L1 unchanged: full readable notes, tag dots, hover labels, warehouse/blocks

### Interaction (L3 only — disabled for now)

- Notes **not clickable** — no `ArtifactInspector` open on tap/pan-tap
- **No focus note panel** on L3 enter or L1→L3 note click
- Entering L3 closes inspector if open
- Cursor stays `grab` over notes (not pointer); hover z-index lift disabled on censored cards

### Key files

| File | Role |
|------|------|
| `js/note-censor.js` | Theme flag, redaction HTML, `isActive()`, `blocksNoteFocus()`, `onLevelChange()` |
| `js/config.js` | `CONFIG.theme.mode` |
| `js/micro-mock.js` | Routes card HTML through `NoteCensor` when active; empty tags row |
| `js/depth-v2.js` | Calls `NoteCensor.onLevelChange(level)` |
| `js/bootstrap.js` | `NoteCensor.init()` |
| `js/render-engine.js` | Early return on L3 wrapper click when censored |
| `js/spatial-navigation.js` | Blocks `dispatchDepthNoteTap`; no pointer cursor over notes |
| `js/artifact-inspector.js` | `open()` blocked when `NoteCensor.isActive()`; censored metadata HTML if ever opened |
| `js/depth-transition-orchestrator.js` | Skips auto-open inspector after L1→L3 note click |
| `styles.css` | `body.view-level-3.is-theme-censored` block (~4769+) — bars, hidden tags, disabled hover |

### Reverted (do not restore without user request)

- **`js/l3-terminal.js`** — Experience 2 word grid on L3 was built then fully reverted to `origin/main` L3 (2026-07-06). Old brief: `docs/work/2026-07-06-l3-terminal-word-grid-followup.md` (**stale**).

---

## Likely next tasks (pick with user)

1. **Grid spacing / overlap** — user wanted notes closer with less overlap; review `--space-*` column gaps, card min-height, and default L3 hover rules at `styles.css` ~4406–4420 vs censored overrides ~4808+
2. **Redaction polish** — bar height rhythm, title/body gap, empty-note fallback, ID code redaction on card edge
3. **Re-enable note focus** — when ready: remove or gate `NoteCensor.isActive()` guards in render-engine, spatial-navigation, artifact-inspector, depth-transition-orchestrator; restore hover affordances
4. **Filter fringe on censored L3** — confirm block/filter behavior on micro grid matches intent (tags hidden but filtering may still apply via L1 blocks)
5. **Docs sync** — update `AGENTS.md`, `docs/visual-language.md`, `docs/external-agent-brief.md` to describe censored L3 interim state (not word-terminal)
6. **Experience 2 direction** — user may pivot to a different archive-roaming mechanic; censored grid may be exhibition placeholder

---

## What I want

*(User fills in priority for next session)*

```
[e.g. tighten column gap / polish redaction bars / re-enable focus / update docs]
```

---

## Constraints

- `./build-js.sh` after any `js/*.js` edit
- Read `docs/CHECKPOINT.md` before L1 physics, scroll clamp, stretch, or warehouse changes
- `#app { direction: ltr }` + `.note-card { direction: rtl }` — do not break
- Site UI stays Hebrew; agent/docs in English

---

## Verification checklist

### Baseline (always)

- [ ] `opening.html` → כניסה → `experience.html` loads
- [ ] L1 **מאקרו**: blocks, physics, tag dots, hover titles — unchanged
- [ ] L1 note tap still opens focus inspector (when censored theme is on)

### Censored L3 (`CONFIG.theme.mode: 'censored'`)

- [ ] Click **מיקרו**: micro grid with white cards + black bars (no readable text)
- [ ] No tag pills on L3 cards
- [ ] Click/tap a note → **nothing** (no inspector, no focus panel)
- [ ] Pan-tap on note → no inspector; cursor `grab` not `pointer`
- [ ] L1 note click → navigates to L3 but **does not** auto-open focus
- [ ] Switch back to **מאקרו** → readable L1, blocks/warehouse normal

### Restore default L3

- [ ] Set `theme.mode: 'default'` → hard refresh → readable text, tags, note click opens inspector

---

## Build & serve

```bash
./build-js.sh   # after js/*.js edits (not required for config.js alone)
python3 -m http.server 8765
# open opening.html or experience.html — hard refresh (Cmd+Shift+R)
```

---

## Notes / follow-up

- Saved pre-redesign baseline: branch `archive/2026-07-05-pre-redesign`, folder `../my-website-old`
- Maintenance audit: `cleanup-list.md`, `cleanup-report.md` (2026-07-06)
- When closing this session: set **Status** to `done` or `paused`, add outcome under this section, move to `docs/work/archive/` if complete
