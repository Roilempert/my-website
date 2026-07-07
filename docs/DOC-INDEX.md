# Documentation index — עקבות

Map of all project documentation. For a short entry point, see [`README.md`](../README.md) at the project root.

---

## Live site (GitHub Pages)

**URL:** https://roilempert.github.io/my-website/

The public site updates **only when you manually publish** — pushes to `main` do not change the live link by themselves.

### One-time setup (GitHub)

1. Open [Pages settings](https://github.com/Roilempert/my-website/settings/pages) → **Build and deployment**
2. Set **Source** to **GitHub Actions**
3. For open sharing (exhibition, reviewers): [repo visibility](https://github.com/Roilempert/my-website/settings) → **Change visibility → Public**

### Publish on demand

1. If you edited modules under `js/` (not `config.js` alone), rebuild locally:
   ```bash
   ./build-js.sh
   ```
2. Commit and push to `main`
3. Open [Deploy to GitHub Pages](https://github.com/Roilempert/my-website/actions/workflows/deploy-pages.yml) → **Run workflow**
4. Wait ~1–2 minutes, then open the live URL and hard-refresh (`Cmd+Shift+R`)

CLI alternative (requires [GitHub CLI](https://cli.github.com/) authenticated):

```bash
gh workflow run deploy-pages.yml
```

---

## Exhibition

**Hardware:** 21.5″ iMac (primary presentation machine). See [`AGENTS.md`](../AGENTS.md) (Context) and [`EXHIBITION-START-HERE.txt`](../EXHIBITION-START-HERE.txt) (launcher on the iMac).

---

## Project brief

**[`AGENTS.md`](../AGENTS.md)** — project goal (mobile-notes laboratory), experience architecture (opening → Experience 1/2), design direction, glossary, working guidelines.

**External agents (outside Cursor):** [`external-agent-brief.md`](external-agent-brief.md) — essence, history, current state, technical pitfalls.

**Experience model:** [`architecture/experience-model.md`](architecture/experience-model.md) — opening screen, silhouette art, Experience 1 inventory, Experience 2 placeholder.

**Site shell grid (24×12):** [`architecture/site-grid.md`](architecture/site-grid.md) — viewport reference; separate from scrollable canvas grids inside `#app`.

**Exhibition visual language:** [`visual-language.md`](visual-language.md) — colors, type classes, spacing, SVG chrome (update with any UI token change).

---

## Product architecture

| Doc | Purpose |
|-----|---------|
| [`architecture/experience-model.md`](architecture/experience-model.md) | Opening screen, Experience 1/2, silhouette art intent |

---

## Saved versions

| Backup | Location | Restore |
|--------|----------|---------|
| **Git branch** | `archive/2026-07-05-pre-redesign` on GitHub | `git fetch origin && git checkout archive/2026-07-05-pre-redesign` |
| **Local folder** | `../my-website-old` (sibling to repo in `פגמר/`) | Open that folder directly |
| **Docs** | [`archive/2026-07-05-pre-redesign/README.md`](archive/2026-07-05-pre-redesign/README.md) | Commit `35a7bc2` — exhibition baseline before major redesign (2026-07-05) |

Active work continues on **`main`**. The archive branch stays frozen unless you deliberately re-save.

---

## Stability and physics

| Doc | Purpose |
|-----|---------|
| [`CHECKPOINT.md`](CHECKPOINT.md) | Physics/navigation restore point — read before block/scroll changes |
| [`block-cap-policy.md`](block-cap-policy.md) | Five-block surface cap |

---

## Layout & boot (working reference)

| Doc | Purpose |
|-----|---------|
| [`REFERENCE-2026-06-25-layout-boot.md`](REFERENCE-2026-06-25-layout-boot.md) | Site loads, warehouse, data pipeline, boot order (25 Jun 2026) |
| [`REFERENCE-2026-06-28-navigation-map-scaling.md`](REFERENCE-2026-06-28-navigation-map-scaling.md) | Minimap L1/L2 scaling (28 Jun 2026) |

Pair layout-boot with `CHECKPOINT.md` for physics.

---

## Depth architecture

| Doc | Purpose |
|-----|---------|
| [`architecture/depth-v2.md`](architecture/depth-v2.md) | Active V2 engine (L2 micro grid; legacy meso for art) |
| [`architecture/depth-legacy.md`](architecture/depth-legacy.md) | Legacy engine (frozen) |
| [`architecture/meso-gradient-p5-baseline.md`](architecture/meso-gradient-p5-baseline.md) | Interim L2 p5 mandala baseline |
| [`architecture/site-grid.md`](architecture/site-grid.md) | 24×12 shell grid |

---

## Work sessions

Ad-hoc tasks — one topic per dated file in `docs/work/`. Not a fixed task board.

**Template:** [`work/session-template.md`](work/session-template.md) — copy to e.g. `docs/work/2026-07-03-meso-silhouettes.md`

**Archive:** `docs/work/archive/` — completed sessions (reference only).

### Three ways to start

**A — Quick (no file)**  
Open an agent chat and describe what you want. Enough for small fixes.

**B — Documented session (recommended)**  
1. Copy `session-template.md` to a new dated file in `docs/work/`
2. Fill in **What I want** and **Verification**
3. New agent chat — attach the file (`@`) + `@AGENTS.md`; paste the prompt block from the template

**C — Agent creates for you**  
In chat: *"Create a work session for [topic] from session-template."*

### Closing a session

- Set **Status** to `done` or `paused`
- Add a line under **Notes / follow-up**
- Move the file to `archive/` when done
- Permanent decisions → own file in `docs/` (e.g. `block-cap-policy.md`)

---

## Maintenance audit

**[`cleanup-report.md`](../cleanup-report.md)** · **[`cleanup-list.md`](../cleanup-list.md)** (2026-07-06) — audit and checklist for unused assets / performance cleanup.
