#!/bin/bash
# Self-contained exhibition launcher — double-click to start (no keyboard needed).
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

clear
echo ""
echo "  ========================================"
echo "    עקבות — exhibition server"
echo "  ========================================"
echo ""

fail() {
  echo ""
  echo "  ERROR: $1"
  echo ""
  osascript -e "display alert \"Server failed\" message \"$1\"" 2>/dev/null || true
  sleep 60
  exit 1
}

REQUIRED=(
  index.html opening.html experience.html styles.css
  js/config.js js/opening-app.js js/app.js
  vendor/matter.min.js
  data/main.csv data/tags.csv data/opening-palette.json
)
MISSING=()
for rel in "${REQUIRED[@]}"; do
  [[ -f "$DIR/$rel" ]] || MISSING+=("$rel")
done
if (( ${#MISSING[@]} > 0 )); then
  fail "Missing: ${MISSING[*]}. Copy the whole my-website folder."
fi

xattr -cr "$DIR" 2>/dev/null || true

echo "  Closing old servers..."
pkill -f "python3 -m http.server" 2>/dev/null || true
pkill -f "python -m http.server" 2>/dev/null || true
pkill -f "ruby -rwebrick" 2>/dev/null || true
sleep 1

PYTHON=""
for cmd in python3 python /usr/bin/python3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    if "$cmd" -c "import http.server" 2>/dev/null; then
      PYTHON="$cmd"
      break
    fi
  fi
done

RUBY_OK=0
if command -v ruby >/dev/null 2>&1; then
  if ruby -rwebrick -e "exit 0" 2>/dev/null; then
    RUBY_OK=1
  fi
fi

if [[ -z "$PYTHON" && "$RUBY_OK" -ne 1 ]]; then
  fail "No working Python or Ruby on this Mac. Install Xcode Command Line Tools (from another Mac or ask for help)."
fi

CURL="/usr/bin/curl"
[[ -x "$CURL" ]] || CURL="curl"

start_python_server() {
  local port="$1"
  if "$PYTHON" -m http.server --help 2>&1 | grep -q -- '--bind'; then
    "$PYTHON" -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
  else
    "$PYTHON" -m http.server "$port" >/dev/null 2>&1 &
  fi
  echo $!
}

start_ruby_server() {
  local port="$1"
  ruby -rwebrick -e "
require 'webrick'
root = '$DIR'
server = WEBrick::HTTPServer.new(
  :Port => $port,
  :BindAddress => '127.0.0.1',
  :DocumentRoot => root,
  :Logger => WEBrick::Log.new(File::NULL),
  :AccessLog => []
)
trap('INT') { server.shutdown }
server.start
" >/dev/null 2>&1 &
  echo $!
}

site_up() {
  local port="$1"
  "$CURL" -sf --max-time 2 "http://127.0.0.1:${port}/opening.html" >/dev/null 2>&1
}

open_site() {
  local url="$1"
  if [[ -d "/Applications/Google Chrome.app" ]]; then
    open -na "Google Chrome" --args --new-window --app="$url" 2>/dev/null && return
  fi
  open "$url"
}

SERVER_PID=""
PORT=""
BACKEND=""

for try in $(seq 8080 8120); do
  if [[ -n "$PYTHON" ]]; then
    SERVER_PID=$(start_python_server "$try")
    BACKEND="Python ($PYTHON)"
  elif [[ "$RUBY_OK" -eq 1 ]]; then
    SERVER_PID=$(start_ruby_server "$try")
    BACKEND="Ruby"
  fi

  sleep 0.4

  if kill -0 "$SERVER_PID" 2>/dev/null && site_up "$try"; then
    PORT="$try"
    break
  fi

  kill "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
done

if [[ -z "$PORT" ]]; then
  fail "Could not start a local server. See Terminal for details, or ask for help installing Python."
fi

echo "  Folder:  $DIR"
echo "  Backend: $BACKEND"
echo "  Port:    $PORT"
echo ""
SITE_URL="http://127.0.0.1:${PORT}/opening.html"
echo "  Site is ready: $SITE_URL"
echo "  (opening screen → experience after כניסה)"
echo ""
echo "  Leave THIS window open while presenting."
echo "  To stop: close this Terminal window."
echo ""

open_site "$SITE_URL"

wait "$SERVER_PID" 2>/dev/null
