# Censored L2 — study loop, tag covers, typography — follow-up

**Date:** 2026-07-07

**Status:** open

**Depth naming (2026-07-07):** Docs call the micro grid **L2**; code still uses level index **`3`** (`view-level-3`, `DepthController.currentLevel === 3`). Filename and code identifiers may still say `l3` / `L3`.

**Prior sessions:**
- Word hover / panel / links: [`2026-07-06-censored-l3-word-hover-followup.md`](2026-07-06-censored-l3-word-hover-followup.md) *(superseded for study loop by this file)*
- Base censored L3: [`2026-07-06-censored-l3-followup.md`](2026-07-06-censored-l3-followup.md)
- Study loop plan (implemented Phase 1): `.cursor/plans/censored_l3_study_loop_85a85667.plan.md`

---

## Agent prompt (copy below)

**Language:** English for agent replies; Hebrew for site UI only.

**Attach:** `@AGENTS.md` · `@docs/work/2026-07-07-censored-l3-study-loop-followup.md` · `@docs/CHECKPOINT.md` (if touching L1 physics/navigation)

────────────

**Censored L3 — study loop + word interaction (continue from current build)**

@AGENTS.md
@docs/work/2026-07-07-censored-l3-study-loop-followup.md

Goal: Continue **censored L3** — word hover/commit, study unlock → tap note → full inspector read, tag-colored covers, word panel on L3 only. Read this file for current behavior and open questions, then follow the user’s priority.

Constraints:
- Edit `js/*.js` → run `./build-js.sh` (never edit `app.js` directly). **`app.js` must stay in sync** — a truncated bundle once rolled the site back to an older build.
- `config.js` loads separately — hard refresh after config-only edits.
- Censored theme is **L3 only** (`NoteCensor.isActive()` = `theme.mode === 'censored'` + `DepthController.currentLevel === 3`).
- **L1 macro** stays fully readable — blocks, physics, inspector (`docs/CHECKPOINT.md` if touching L1).
- Block tray: hide blocks **on L3 only** (`body.is-word-panel-mode`); L1 keeps full warehouse.
- Do not reintroduce `js/l3-terminal.js` (reverted Experience 2 word grid).
- No git commit unless user asks.

Success criteria: depends on task — see **Verification** and **Likely next tasks** below.

Out of scope unless user asks:
- Experience 2 archive-roaming design
- Translating Hebrew UI or note content
- Docs-wide sync (`AGENTS.md`, `visual-language.md`) unless requested

────────────

---

## What was built (2026-07-06 → 2026-07-07)

### Full interaction loop (Phase 1 — shipped)

| Step | Visitor | System |
|------|---------|--------|
| 1 | Hover word | All identical tokens reveal; SVG lines to nearest duplicates (≤48) |
| 2 | Dwell ≥ `dwellMs` (700ms) | Word **commits** — stays revealed, lines persist, chip in word panel |
| 3 | — | Notes containing that word get `.is-study-unlocked` (outline affordance) |
| 4 | Tap unlocked note | `ArtifactInspector` opens with **full readable title + body** (`forceReadable`) |
| 5 | Tap locked note | Nothing |
| 6 | Close inspector | Grid stays censored; commits + unlocks persist |
| 7 | `נקה לוח` | Clears panel, commits, unlocks, lines |

**Unlock rule:** OR — note unlocks if card contains **any** committed word.

**Ceremonial gate:** no note reading without prior word commit. Inspector **metadata** (author, date, typology) stays censored bars; **card body** is readable.

### Word hover (unchanged from prior session)

- Hover → instant reveal of all matching instances
- Leave before dwell → cover + line retract (~920ms)
- After commit → word inert for re-hover; pan still works
- `maxLinks: 48` default — all instances reveal; only nearest 48 get lines

### Word panel vs block tray

- **L3 + censored:** `ActionWarehouse.syncWordPanelMode()` sets `body.is-word-panel-mode` — block slots + frame section hidden; word chips in tray; dock message `החזיקו על מילה לגילוי`
- **L1 + censored:** same theme but **blocks remain** in warehouse (level-gated, not theme-only)

### Visual polish (2026-07-07)

| Feature | Implementation |
|---------|----------------|
| **Tag-colored word covers** | Each `.note-redact__word` gets `--word-cover-color` from note tags; multi-tag notes cycle colors per word |
| **Note ID visible** | `buildIdHTML()` — plain readable ID, not redacted; title/body still censored |
| **Concise `.note-t` rhythm** | `line-height: 1.2` on body + word tokens; paragraph breaks via `.note-redact__break` at `0.35em`; words `inline` not `inline-block` |

### Config (`js/config.js`)

```javascript
theme: {
    mode: 'censored',
    dwellMs: 700,
    wordPanelMessage: 'החזיקו על מילה לגילוי',
    wordLinks: { duration: 1650, stagger: 175, revertDuration: 920, /* … */ }
    // maxLinks: 48 default in note-censor.js
}
```

---

## Key files

| File | Role |
|------|------|
| `js/note-censor.js` | Words, hover, dwell, commit, links, **study unlock** (`refreshStudyUnlocks`, `isNoteStudyUnlocked`), tag cover colors |
| `js/warehouse-core.js` | Word panel: `isWordPanelLevelActive()`, chips, `resetAll()` clears censor state on L3 |
| `js/artifact-inspector.js` | Study-gated `open()`, `_forceReadableOpen` → readable card in censored L3 |
| `js/micro-mock.js` | `forceReadable` bypasses censor for inspector card |
| `js/spatial-navigation.js` | Pan-tap + pointer cursor on unlocked notes |
| `js/render-engine.js` | L3 click → inspector when unlocked |
| `js/config.js` | `theme.mode`, `dwellMs`, `wordLinks` |
| `styles.css` | Censored L3 block ~4769+ — word covers, unlock outline, word panel, `.note-t` rhythm |

### Important APIs

**NoteCensor**
- `hitWordAt(x, y)` — skips committed words
- `refreshStudyUnlocks()` / `isNoteStudyUnlocked(wrapper)` / `allowsStudyNoteOpen(wrapper)`
- `_resolveTagColors(item)` / `_wordCoverStyle()` — per-word `--word-cover-color`
- `blocksNoteFocus()` — still `true` for censored theme (blocks L1→L3 auto-inspector)

**ArtifactInspector**
- `open(wrapper)` — allowed on censored L3 only when `isNoteStudyUnlocked(wrapper)`
- `_forceReadableOpen` — inspector card uses `MicroMock.buildCardOnlyHTML(..., { forceReadable: true })`

**ActionWarehouse**
- `isWordPanelLevelActive(level)` — censored + L3
- `syncWordPanelMode(level)` — toggles `is-word-panel-mode` on body

---

## Phase 2 — not built (deferred)

From study loop plan — **word chips as study lens**:
- Toggleable chips (active/inactive)
- AND filter across active chips — dim non-matching notes (`warehouse-filter.js` pattern)
- Chip click → scroll to nearest matching note

Ask user before implementing.

---

## Open questions

1. **Reveal vs link all** — high-count words (**אני**, **לא**, **את**): all reveal, ≤48 lines. Raise cap or viewport-only links?
2. **Word matching** — `_wordKey()` is raw `textContent`; punctuation variants = different keys. Normalize?
3. **Inspector metadata** — keep censored bars or reveal on study open?
4. **Unlock affordance** — outline enough, or stronger (glow, lift)?
5. **Tag cover colors** — cycle per word OK, or single dominant tag color per note?
6. **Docs sync** — `AGENTS.md`, `visual-language.md` still lag censored L3 + study loop
7. **Readable L3 paragraphs** — `pre-wrap` blank lines in default theme may still feel loose; censored word-break spacing tuned separately

---

## Likely next tasks (pick with user)

1. **Phase 2 word-chip filter** — AND lens + grid dim + scroll-to-note
2. **Tune study UX** — unlock visual, inspector metadata policy, related notes in inspector
3. **Word panel UX** — remove individual chips, chip order, tray scroll
4. **Link policy** — `maxLinks`, viewport culling, off-screen hint
5. **Redaction / grid spacing** — card density, overlap (prior follow-up)
6. **Docs sync** — AGENTS + visual-language censored L3 section
7. **Bundle hygiene** — confirm CI/build always runs `build-js.sh`; optional pre-commit check

---

## Verification

### Baseline

- [ ] `opening.html` → `experience.html`; L1 macro unchanged (blocks, physics, readable notes)
- [ ] Censored theme on L1: block tray **populated**; word panel **not** active
- [ ] `theme.mode: 'default'` → L3 readable, normal tap-to-inspector, block tray

### Word hover (censored L3)

- [ ] Hover → reveal all matches; lines to ≤48 nearest
- [ ] Leave before 700ms → cover + retract
- [ ] Dwell commit → chip in panel; word inert on re-hover
- [ ] `נקה לוח` clears all

### Study loop (censored L3)

- [ ] Commit word → matching notes get unlock outline
- [ ] Tap locked note → nothing
- [ ] Tap unlocked note → inspector with **readable** title + body
- [ ] Pan-tap on unlocked note → same
- [ ] Pointer on unlocked cards; word hover on **uncommitted** words only
- [ ] Inspector metadata still censored (bars)
- [ ] Close inspector → grid still censored; unlocks persist

### Visual

- [ ] Word covers use tag colors (multi-tag notes cycle)
- [ ] Note ID readable on cards; title/body censored
- [ ] Body line rhythm tight (1.2) within lines and between paragraphs

### Build regression

- [ ] After any `js/*.js` edit: `./build-js.sh` — `app.js` line count ~22620 (not truncated)
- [ ] Hard refresh `experience.html` (Cmd+Shift+R)

### Regression words

- **אני** / **לא** / **את** — many instances, few lines, all unlock on commit
- Low-count word (3–5 instances) — all link + all unlock

---

## Build & serve

```bash
./build-js.sh          # after js/*.js edits — REQUIRED
python3 -m http.server 8765
# experience.html — hard refresh (Cmd+Shift+R)
```

**Incident (2026-07-07):** Stale/truncated `js/app.js` (~1000 lines short) served an older build. Fix: `./build-js.sh`. Do not hand-edit `app.js`.

---

## Notes / follow-up

*(Next agent: add outcome here when closing session)*
