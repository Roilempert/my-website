#!/bin/bash
# Wrapper — runs the self-contained launcher in the same folder.
DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$DIR/Start Local Server.command"
