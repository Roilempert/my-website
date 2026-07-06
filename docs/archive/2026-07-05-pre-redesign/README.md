# Exhibition baseline — saved before major redesign

**Saved:** 2026-07-05  
**Git commit:** `35a7bc2` — *Save exhibition baseline before major redesign.*  
**Git branch (GitHub):** `archive/2026-07-05-pre-redesign`  
**Local folder copy:** `../my-website-old` (sibling to this repo in `פגמר/`)

## What this is

A full copy of the site **before drastic redesign work** on `main`. Use it to restore, compare, or open the old version without digging through history.

## Two ways to restore

### A — Local folder (simplest)

Open or serve from:

```
…/פגמר/my-website-old/
```

That folder includes its own `.git` history (copied at save time). You can open `index.html` directly or run your usual local server from there.

### B — Git branch (any machine)

```bash
git fetch origin
git checkout archive/2026-07-05-pre-redesign
```

GitHub: https://github.com/Roilempert/my-website/tree/archive/2026-07-05-pre-redesign

To return to current work:

```bash
git checkout main
```

## Compare old vs new

```bash
git diff archive/2026-07-05-pre-redesign..main
```

## What was included in the save

- Depth block bar and warehouse dock polish (L2/L3)
- MiriamLibre + TheBasics-Dots fonts
- Recent updates to `physics-engine.js`, `warehouse-core.js`, `config.js`, `styles.css`, docs
- Rebuilt `js/app.js` from modules via `./build-js.sh`

**Not included:** accidental duplicate `assets/fonts/MiriamLibre-Black (1).woff2` (left untracked).

## Workflow after save

- **`main`** — active development; redesign happens here
- **`archive/2026-07-05-pre-redesign`** — frozen on GitHub; do not update unless intentionally re-baselining

Physics stability reference for this era: [`docs/CHECKPOINT.md`](../../CHECKPOINT.md).
