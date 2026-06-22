#!/bin/sh
# One-shot: init local repo, first commit, optional GitHub remote + push.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "git not found."
  echo "Install Xcode Command Line Tools, then run this script again:"
  echo "  xcode-select --install"
  exit 1
fi

if [ ! -d .git ]; then
  git init
  git branch -M main
  echo "Initialized git repository."
fi

git add .
if git diff --cached --quiet; then
  echo "Nothing to commit (working tree clean)."
else
  git commit -m "$(cat <<'EOF'
Initial commit: עקבות catalog site with physics canvas and depth layers.

EOF
)"
  echo "Created initial commit."
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin: $(git remote get-url origin)"
  git push -u origin main
  echo "Pushed to origin/main."
  exit 0
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  REPO_NAME="${1:-my-website}"
  VISIBILITY="${2:-private}"
  gh repo create "$REPO_NAME" --"$VISIBILITY" --source=. --remote=origin --push
  echo "Created GitHub repo and pushed: $REPO_NAME ($VISIBILITY)"
  exit 0
fi

echo ""
echo "Local repo is ready. To push to GitHub:"
echo "  1. Create an empty repo at https://github.com/new"
echo "  2. Run:"
echo "     git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git"
echo "     git push -u origin main"
echo ""
echo "Or install GitHub CLI and re-run:"
echo "  brew install gh && gh auth login"
echo "  ./scripts/setup-git.sh REPO_NAME private"
