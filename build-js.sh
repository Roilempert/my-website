#!/bin/sh
# Rebuild js/app.js after editing modules in js/
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD_ID=$(date -u +%Y%m%d%H%M%S)
cd "$ROOT/js"
# config.js loads separately from experience.html — edit it, then refresh (no build needed)
{
  echo "/* app build $BUILD_ID */"
  cat \
    idle-refresh.js \
    text-direction.js \
    app-state.js \
    meso-gradient-visual-preset.js \
    meso-gradient-sdf-preset.js \
    meso-gradient-engine.js \
    meso-gradient-p5.js \
    meso-silhouette-cache.js \
    note-censor.js \
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
    navigation-map.js \
    artifact-inspector.js \
    physics-engine.js \
    warehouse-core.js \
    warehouse-grid.js \
    warehouse-filter.js \
    warehouse-orbit.js \
    opening-background.js \
    bootstrap.js
} > app.js
echo "Built js/app.js ($(wc -l < app.js | tr -d ' ') lines)"
if [ -f "$ROOT/experience.html" ]; then
  sed -i '' "s|src=\"js/app.js[^\"]*\"|src=\"js/app.js?v=$BUILD_ID\"|" "$ROOT/experience.html"
  echo "Updated experience.html cache bust → ?v=$BUILD_ID"
fi
