# Censored L3 — word hover, links, word panel — follow-up

**Date:** 2026-07-06

**Status:** open

**Prior sessions:**
- Base censored L3: [`2026-07-06-censored-l3-followup.md`](2026-07-06-censored-l3-followup.md)
- Agent transcript (word hover / panel / link fixes): `2150b84f-96c9-43db-a72a-ed9fdee9924e`

---

## Agent prompt (copy below)

**Language:** English for agent replies; Hebrew for site UI only.

**Attach:** `@AGENTS.md` · `@docs/work/2026-07-06-censored-l3-word-hover-followup.md`

────────────

**Censored L3 — word reveal, connection lines, word panel**

@AGENTS.md
@docs/work/2026-07-06-censored-l3-word-hover-followup.md

Goal: Continue the **censored L3 word interaction** — hover reveal, identical-word links, dwell-to-commit, word panel. Read this file for current behavior and open questions, then follow the user’s priority.

Constraints:
- Edit `js/*.js` → run `./build-js.sh`. `config.js` loads separately — hard refresh after config-only edits.
- Censored theme is **L3 only** (`NoteCensor.isActive()` = `theme.mode === 'censored'` + `DepthController.currentLevel === 3`).
- **L1 macro** stays fully readable — blocks, physics, inspector (see `docs/CHECKPOINT.md` if touching L1).
- Do not reintroduce `js/l3-terminal.js` (reverted Experience 2 word grid).
- No git commit unless user asks.

Success criteria: depends on task — see **Verification** and **Open questions** below.

Out of scope unless user asks:
- Experience 2 archive-roaming design
- Translating Hebrew UI or note content
- Docs-wide sync (`AGENTS.md`, `visual-language.md`) unless requested

────────────

---

## What was built (2026-07-06)

### Interaction model

| Phase | Behavior |
|-------|----------|
| **Hover enter** | Hovered word + all identical instances (same `textContent`) get `.is-revealed` immediately |
| **While hovering** | Curved SVG lines stretch from hovered instance to duplicates (nearest first, capped) |
| **Leave before dwell** | Words cover again; lines retract (~920ms, parallel retract) |
| **Dwell ≥ `dwellMs`** | Word group **commits**: stays revealed, lines persist, chip added to word panel |
| **After commit** | That word text is inert — `hitWordAt()` skips committed keys; no re-hover |
| **Reset** | `נקה לוח` clears panel, committed reveals, and all lines |

### Word panel (replaces block tray on censored L3)

- `ActionWarehouse.populate()` skips tag/author/typology blocks when `theme.mode === 'censored'`
- Committed words appear as `.word-panel__chip` in the bottom tray
- Dock message: `theme.wordPanelMessage` (default `החזיקו על מילה לגילוי`)
- Styles: `styles.css` ~4910+ (`body.view-level-3.is-theme-censored .word-panel__chip`)

### Connection lines

- SVG overlay: `.note-censor-word-links` on `document.body`
- Quadratic paths; stretch/retract via `stroke-dashoffset`
- **Performance cap:** `maxLinks` default **48** — only nearest duplicates get lines; **all instances still reveal**
- Stagger spread capped (`staggerSpreadMs` default 900ms); retract has no stagger (`retractStaggerSpreadMs: 0`)
- On commit: `_completeRouteStretch()` finishes partial lines smoothly (no snap, no freeze)

### Config (`js/config.js`)

```javascript
theme: {
    mode: 'censored',
    dwellMs: 500,                    // ms hover to commit + add to panel
    wordPanelMessage: 'החזיקו על מילה לגילוי',
    wordLinks: {
        duration: 1650,
        stagger: 175,
        revertDuration: 920,
        strokeWidthStart: 0.9,
        strokeWidthEnd: 2.5,
        opacityMax: 0.82
        // Optional (defaults in note-censor.js): maxLinks, staggerSpreadMs, retractStaggerSpreadMs
    }
}
```

---

## Key files

| File | Role |
|------|------|
| `js/note-censor.js` | Word tokens, hover, dwell, commit, link SVG, retract/complete animations |
| `js/warehouse-core.js` | Word panel: `isWordPanelTheme()`, `addCommittedWord()`, `populate()` skip blocks |
| `js/micro-mock.js` | `buildWordsBlock` via `NoteCensor`; `invalidateWordLayout()` on card apply |
| `js/spatial-navigation.js` | `hitWordAt()` for cursor; blocks note tap when censored |
| `js/config.js` | `theme.mode`, `dwellMs`, `wordLinks` |
| `styles.css` | `.note-redact__word`, `.is-revealed`, `.is-word-committed`, word panel, link trails (~4769+) |

### Important `NoteCensor` methods

- `hitWordAt(x, y)` — skips committed words
- `_activateHover` / `_switchActiveHover` / `_releaseActiveHover`
- `_commitActiveHover` — dwell complete → persist + word panel chip
- `_buildActiveRoutes` — capped nearest targets
- `_completeRouteStretch` — smooth finish on commit
- `_clearAllHoverState` — reset + panel clear via warehouse

---

## Bugs fixed this session

1. Transient hover vs dwell vs commit ordering
2. Frozen half-drawn lines on early leave (retract cleanup)
3. Glitchy lines with many duplicates (scroll snap, same-key rebuild, stagger, maxLinks)
4. Lines frozen at commit (token bump + finish)
5. Lines jumping to full length at commit (`_completeRouteStretch` instead of instant `_finishRoute`)

**Debug instrumentation:** removed — no `_dbg` / ingest logs in repo.

---

## Open questions (user may want next)

1. **Reveal all vs link all** — User reported **אני**: all identicals revealed after commit but **not all have connection lines**. This is **by design** (`maxLinks: 48`). Decide with user:
   - Raise/remove cap for common words?
   - Show lines to all instances but only within viewport?
   - Visual hint that more matches exist off-screen?
2. **`dwellMs`** — currently **500** in `config.js`; user previously asked for **700**. Confirm intended value.
3. **Word matching** — `_wordKey()` is raw `textContent` (no normalization). Punctuation/whitespace variants = different keys.
4. **Committed word still under pointer** — after commit, pointer is over revealed text but `hitWordAt` returns null (inert). Pan still works. OK?
5. **Docs sync** — `AGENTS.md` / `visual-language.md` still describe bars-only censored L3, not word hover/panel.

---

## Likely next tasks

1. **Align reveal vs links policy** — if user wants every **אני** instance linked, adjust `maxLinks` or link strategy (see open question 1)
2. **Tune `dwellMs` / animation** — commit timing, `duration`, `staggerSpreadMs`
3. **Word panel UX** — chip order, remove individual chips, scroll tray, typography
4. **Redaction polish** — bar rhythm, grid spacing (from prior follow-up)
5. **Re-enable L3 note focus** — separate from word hover; see [`2026-07-06-censored-l3-followup.md`](2026-07-06-censored-l3-followup.md)

---

## Verification

### Baseline

- [ ] `opening.html` → `experience.html`; L1 macro unchanged (blocks, physics, readable notes)
- [ ] `theme.mode: 'default'` → L3 readable, block tray populated

### Word hover (censored L3)

- [ ] Hover censored word → instant reveal of all matching instances
- [ ] Lines stretch to nearest duplicates (≤48)
- [ ] Leave before `dwellMs` → words cover, lines retract fully
- [ ] Hold ≥ `dwellMs` → words + lines stay; chip in word panel
- [ ] Committed word: hover again does nothing; pan still works
- [ ] `נקה לוח` clears panel, reveals, lines
- [ ] Scroll while hovering — no line snap/freeze (active routes)
- [ ] Commit mid-stretch — lines complete smoothly, no jump to end

### Regression words to test

- High count: **את**, **לא**, **-** (100+ instances — only 48 lines)
- Low count: word with 3–5 instances (all should link)
- User case: **אני** — confirm reveal vs link expectation with user

---

## Build & serve

```bash
./build-js.sh          # after js/*.js edits
python3 -m http.server 8765
# experience.html — hard refresh (Cmd+Shift+R)
```

Playwright MCP was used for L3 hover regression; word must be in viewport for real pointer hit (`elementsFromPoint`).

---

## Notes / follow-up

*(Next agent: add outcome here when closing session)*
