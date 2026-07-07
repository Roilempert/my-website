#!/bin/sh
# Rebuild js/opening-app.js after editing opening modules
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD_ID=$(date -u +%Y%m%d%H%M%S)
cd "$ROOT/js"
{
  echo "/* opening build $BUILD_ID */"
    cat \
    opening-background.js \
    opening-data.js \
    opening-screen.js \
    site-about.js \
    opening-bootstrap.js
} > opening-app.js
echo "Built js/opening-app.js ($(wc -l < opening-app.js | tr -d ' ') lines)"
if [ -f "$ROOT/opening.html" ]; then
  tmp="$(mktemp)"
  sed "s|src=\"js/opening-app.js[^\"]*\"|src=\"js/opening-app.js?v=$BUILD_ID\"|; s|href=\"styles.css[^\"]*\"|href=\"styles.css?v=$BUILD_ID\"|" "$ROOT/opening.html" > "$tmp"
  mv "$tmp" "$ROOT/opening.html"
  echo "Updated opening.html cache bust → ?v=$BUILD_ID"
fi
