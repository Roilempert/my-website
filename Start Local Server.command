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

# Perl is bundled with every macOS and needs no install. It is the
# guaranteed fallback when Python is missing and Ruby has no webrick
# (Ruby 3.0+ dropped webrick from the standard library).
PERL=""
for cmd in perl /usr/bin/perl; do
  if command -v "$cmd" >/dev/null 2>&1; then
    if "$cmd" -MIO::Socket::INET -e "exit 0" 2>/dev/null; then
      PERL="$cmd"
      break
    fi
  fi
done

if [[ -z "$PYTHON" && "$RUBY_OK" -ne 1 && -z "$PERL" ]]; then
  fail "No working Python, Ruby, or Perl on this Mac. Install Xcode Command Line Tools (from another Mac or ask for help)."
fi

CURL="/usr/bin/curl"
[[ -x "$CURL" ]] || CURL="curl"

# Capture the real backend error instead of hiding it in /dev/null.
LOG="$DIR/.server-log.txt"
: > "$LOG" 2>/dev/null || LOG="/tmp/exhibition-server-log.txt"
: > "$LOG" 2>/dev/null || true

start_python_server() {
  local port="$1"
  if "$PYTHON" -m http.server --help 2>&1 | grep -q -- '--bind'; then
    "$PYTHON" -m http.server "$port" --bind 127.0.0.1 >>"$LOG" 2>&1 &
  else
    "$PYTHON" -m http.server "$port" >>"$LOG" 2>&1 &
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
" >>"$LOG" 2>&1 &
  echo $!
}

start_perl_server() {
  local port="$1"
  PERL_ROOT="$DIR" PERL_PORT="$port" "$PERL" - >>"$LOG" 2>&1 <<'PERL_EOF' &
use strict;
use warnings;
use IO::Socket::INET;

my $root = $ENV{PERL_ROOT};
my $port = $ENV{PERL_PORT};

# Reap children automatically so we do not accumulate zombies.
$SIG{CHLD} = 'IGNORE';

my $srv = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1',
  LocalPort => $port,
  Proto     => 'tcp',
  Listen    => 128,
  ReuseAddr => 1,
) or die "Perl server could not bind to 127.0.0.1:$port : $!\n";

my %types = (
  html => 'text/html; charset=utf-8',
  htm  => 'text/html; charset=utf-8',
  css  => 'text/css; charset=utf-8',
  js   => 'application/javascript; charset=utf-8',
  mjs  => 'application/javascript; charset=utf-8',
  json => 'application/json; charset=utf-8',
  csv  => 'text/csv; charset=utf-8',
  svg  => 'image/svg+xml',
  png  => 'image/png',
  jpg  => 'image/jpeg',
  jpeg => 'image/jpeg',
  gif  => 'image/gif',
  webp => 'image/webp',
  ico  => 'image/x-icon',
  woff => 'font/woff',
  woff2=> 'font/woff2',
  ttf  => 'font/ttf',
  otf  => 'font/otf',
  txt  => 'text/plain; charset=utf-8',
  map  => 'application/json; charset=utf-8',
);

while (my $client = $srv->accept) {
  my $pid = fork;
  if (!defined $pid) { close $client; next; }
  if ($pid)          { close $client; next; }   # parent keeps listening
  handle($client);                              # child serves one request
  exit 0;
}

sub handle {
  my ($c) = @_;
  my $req = <$c>;
  return unless defined $req;
  while (my $line = <$c>) { last if $line =~ /^\r?\n$/; }  # drain headers

  unless ($req =~ m{^(GET|HEAD)\s+(\S+)\s+HTTP}) {
    print $c "HTTP/1.0 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
    return;
  }
  my ($method, $path) = ($1, $2);
  $path =~ s/[?#].*//s;
  $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;
  $path =~ s{/\.\.(?=/|$)}{}g;           # block directory traversal
  $path = '/index.html' if $path eq '/';

  my $file = $root . $path;
  $file .= '/index.html' if -d $file;

  unless (-f $file) {
    print $c "HTTP/1.0 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    return;
  }

  my ($ext) = $file =~ /\.([^.\/]+)$/;
  my $ctype = $types{ lc($ext // '') } || 'application/octet-stream';
  my $size  = -s $file;

  open(my $fh, '<', $file) or do {
    print $c "HTTP/1.0 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n";
    return;
  };
  binmode $fh;
  binmode $c;

  print $c "HTTP/1.0 200 OK\r\n";
  print $c "Content-Type: $ctype\r\n";
  print $c "Content-Length: $size\r\n";
  print $c "Access-Control-Allow-Origin: *\r\n";
  print $c "Cache-Control: no-cache\r\n";
  print $c "Connection: close\r\n";
  print $c "\r\n";

  if ($method eq 'GET') {
    my $buf;
    print $c $buf while read($fh, $buf, 65536);
  }
  close $fh;
}
PERL_EOF
  echo $!
}

site_up() {
  local port="$1"
  "$CURL" -sf --max-time 2 "http://127.0.0.1:${port}/opening.html" >/dev/null 2>&1
}

# Poll for the server to answer. Old iMacs can take several seconds to
# start the interpreter, so give it up to ~6s before giving up on a port.
wait_up() {
  local port="$1" pid="$2" i
  for i in $(seq 1 24); do
    kill -0 "$pid" 2>/dev/null || return 1   # backend process already died
    site_up "$port" && return 0
    sleep 0.25
  done
  return 1
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

echo "  Starting server (this can take a few seconds)..."
for try in $(seq 8080 8120); do
  if [[ -n "$PYTHON" ]]; then
    SERVER_PID=$(start_python_server "$try")
    BACKEND="Python ($PYTHON)"
  elif [[ "$RUBY_OK" -eq 1 ]]; then
    SERVER_PID=$(start_ruby_server "$try")
    BACKEND="Ruby"
  elif [[ -n "$PERL" ]]; then
    SERVER_PID=$(start_perl_server "$try")
    BACKEND="Perl ($PERL)"
  fi

  if [[ -n "$SERVER_PID" ]] && wait_up "$try" "$SERVER_PID"; then
    PORT="$try"
    break
  fi

  kill "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
done

if [[ -z "$PORT" ]]; then
  echo ""
  echo "  ----- server error output -----"
  cat "$LOG" 2>/dev/null | tail -n 25
  echo "  -------------------------------"
  echo ""
  DETAIL="$(tail -n 6 "$LOG" 2>/dev/null | tr '\n' ' ')"
  fail "Could not start a local server with $BACKEND. Reason: ${DETAIL:-unknown - see Terminal window}"
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
