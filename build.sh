#!/bin/sh
# Vercel / CI entry: rebuild both JS bundles from source modules.
set -eu
cd "$(dirname "$0")"
sh ./build-js.sh
sh ./build-opening.sh
