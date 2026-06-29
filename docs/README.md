# Documentation — עקבות

Index of project documentation files.

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

## Project root

**AGENTS.md**  
Agent context — goals, glossary, working guidelines.

---

## Stability and physics

**Checkpoint**

```
docs/CHECKPOINT.md
```

**Block cap**

```
docs/block-cap-policy.md
```

Read before physics/navigation changes.

---

## Layout & boot (working reference)

**Verified 25 June 2026 — site loads, warehouse visible, sheet data + physics**

```
docs/REFERENCE-2026-06-25-layout-boot.md
```

Restore point for scaling, boot order, `index.html` structure, and blank-screen fixes. Pair with `CHECKPOINT.md` for physics.

**Verified 28 June 2026 — navigation minimap L1/L2/L3 scaling**

```
docs/REFERENCE-2026-06-28-navigation-map-scaling.md
```

Fixed viewport marker, marker-driven scale, L3 edge alignment (`levelMapScaleAdjust[3]: 0.92`). Read before minimap regressions.

---

## Depth architecture

**Active engine (V2)**

```
docs/architecture/depth-v2.md
```

**Legacy engine (frozen)**

```
docs/architecture/depth-legacy.md
```

**Baseline — p5 mandala (active, approved 2026-06-21)**

```
docs/architecture/meso-gradient-p5-baseline.md
js/meso-gradient-p5.js
```

---

## Work sessions (ad hoc)

**Guide**

```
docs/work/README.md
```

**Template for a new session**

```
docs/work/TEMPLATE.md
```

Pick a topic → new file in this folder → agent chat.
