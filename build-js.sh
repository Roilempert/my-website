#!/bin/sh
# Rebuild js/app.js after editing modules in js/
set -e
cd "$(dirname "$0")/js"
# config.js loads separately from index.html — edit it, then refresh (no build needed)
cat \
  idle-refresh.js \
  app-state.js \
  meso-gradient-visual-preset.js \
  meso-gradient-sdf-preset.js \
  meso-gradient-engine.js \
  meso-gradient-p5.js \
  meso-mock.js \
  micro-mock.js \
  render-engine.js \
  silhouette-engine.js \
  catalog-layout-engine.js \
  catalog-state.js \
  depth-transition-orchestrator.js \
  macro-meso-bridge.js \
  meso-spatial-layout.js \
  depth-v2.js \
  depth-focus-links.js \
  depth-controller.js \
  spatial-navigation.js \
  artifact-inspector.js \
  physics-engine.js \
  warehouse-core.js \
  warehouse-grid.js \
  warehouse-filter.js \
  warehouse-orbit.js \
  bootstrap.js \
  > app.js
echo "Built js/app.js ($(wc -l < app.js | tr -d ' ') lines)"
