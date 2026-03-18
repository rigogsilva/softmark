#!/bin/bash
# ─────────────────────────────────────────────
# Softmark — Markdown, made simple
# 
# Thin launcher that wraps softmark.jsx with React CDN and opens in browser.
# One .jsx file powers both Claude artifact and local browser.
#
# Usage:
#   softmark spec.md                  Open in cmux browser pane (or fallback to browser)
#   softmark --ai spec.md             Copy content to clipboard + open Claude artifact
#   softmark --browser spec.md        Force open in default browser
#   softmark --config                 Configure Softmark settings
#   softmark -h | --help
#
# Install:
#   mkdir -p ~/.local/bin ~/.config/softmark
#   cp softmark.sh ~/.local/bin/softmark
#   cp softmark.jsx ~/.config/softmark/softmark.jsx
#   chmod +x ~/.local/bin/softmark
# ─────────────────────────────────────────────

set -euo pipefail

# ── Config file ──
SOFTMARK_DIR="${HOME}/.config/softmark"
SOFTMARK_CONFIG="${SOFTMARK_DIR}/config"
SOFTMARK_JSX="${SOFTMARK_DIR}/softmark.jsx"

load_config() {
  if [[ -f "$SOFTMARK_CONFIG" ]]; then
    source "$SOFTMARK_CONFIG"
  fi
}

save_config() {
  mkdir -p "$SOFTMARK_DIR"
  cat > "$SOFTMARK_CONFIG" << EOF
# Softmark config
SOFTMARK_AI_URL="${SOFTMARK_AI_URL}"
EOF
}

load_config
SOFTMARK_AI_URL="${SOFTMARK_AI_URL:-https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480}"

# ── Colors ──
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# ── Config wizard ──
run_config() {
  echo -e "${BOLD}Softmark${NC} — Configuration"
  echo ""
  echo -e "Config dir:  ${DIM}${SOFTMARK_DIR}${NC}"
  echo -e "JSX file:    ${DIM}${SOFTMARK_JSX}${NC}"
  echo ""
  echo -e "Current settings:"
  echo -e "  AI URL: ${CYAN}${SOFTMARK_AI_URL}${NC}"
  if [[ -f "$SOFTMARK_JSX" ]]; then
    echo -e "  JSX:    ${GREEN}✓ found${NC}"
  else
    echo -e "  JSX:    ${RED}✗ not found${NC}"
    echo -e "         Copy softmark.jsx to ${SOFTMARK_JSX}"
  fi
  echo ""
  echo -e "Enter your published Softmark artifact URL"
  echo -e "${DIM}(paste the URL from Claude after publishing, or press Enter to keep current)${NC}"
  read -r -p "> " new_url
  if [[ -n "$new_url" ]]; then
    SOFTMARK_AI_URL="$new_url"
  fi
  save_config
  echo ""
  echo -e "${GREEN}✓${NC} Config saved to ${DIM}${SOFTMARK_CONFIG}${NC}"
  echo -e "  AI URL: ${CYAN}${SOFTMARK_AI_URL}${NC}"
  echo ""
  echo -e "Test it: ${GREEN}softmark your-file.md${NC}"
}

# ── Help ──
show_help() {
  echo -e "${BOLD}Softmark${NC} — Markdown, made simple"
  echo ""
  echo -e "  ${GREEN}softmark${NC} <file.md>              Open in cmux pane (or browser)"
  echo -e "  ${GREEN}softmark --ai${NC} <file.md>         Copy to clipboard + open Claude artifact"
  echo -e "  ${GREEN}softmark --open${NC}                 Open the Claude artifact viewer (no file)"
  echo -e "  ${GREEN}softmark --browser${NC} <file.md>    Force open in default browser"
  echo -e "  ${GREEN}softmark --config${NC}               Configure Softmark settings"
  echo -e "  ${GREEN}softmark -h${NC}                      Show this help"
  echo ""
  echo -e "Config: ${DIM}${SOFTMARK_CONFIG}${NC}"
  echo -e "AI URL: ${DIM}${SOFTMARK_AI_URL}${NC}"
  echo -e "JSX:    ${DIM}${SOFTMARK_JSX}${NC}"
}

# ── Args ──
AI_MODE=false
FORCE_BROWSER=false
OPEN_MODE=false
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ai) AI_MODE=true; shift ;;
    --browser) FORCE_BROWSER=true; shift ;;
    --open) OPEN_MODE=true; shift ;;
    --config) run_config; exit 0 ;;
    -h|--help) show_help; exit 0 ;;
    *) FILE="$1"; shift ;;
  esac
done

# ── Open mode: just open the artifact viewer ──
if $OPEN_MODE; then
  echo -e "${DIM}Opening Softmark AI viewer...${NC}"
  if command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
    cmux browser open "$SOFTMARK_AI_URL"
  else
    open "$SOFTMARK_AI_URL"
  fi
  exit 0
fi

if [[ -z "$FILE" ]]; then
  show_help
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo -e "${RED}Error:${NC} file not found: ${FILE}"
  exit 1
fi

FILENAME=$(basename "$FILE")
CONTENT=$(cat "$FILE")

# ── AI Mode: copy to clipboard + open Claude artifact ──
if $AI_MODE; then
  echo "$CONTENT" | pbcopy
  echo -e "${GREEN}✓${NC} Copied ${BOLD}${FILENAME}${NC} to clipboard (${#CONTENT} chars)"
  echo -e "${DIM}Opening Softmark AI... paste your content there${NC}"
  if command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
    cmux browser open "$SOFTMARK_AI_URL"
  else
    open "$SOFTMARK_AI_URL"
  fi
  exit 0
fi

# ── Check JSX exists ──
if [[ ! -f "$SOFTMARK_JSX" ]]; then
  echo -e "${RED}Error:${NC} softmark.jsx not found at ${SOFTMARK_JSX}"
  echo -e "Run: ${GREEN}cp softmark.jsx ${SOFTMARK_JSX}${NC}"
  exit 1
fi

# ── Generate HTML wrapper ──
TMPFILE=$(mktemp /tmp/softmark-XXXXXX.html)

# Read the JSX source
JSX_SOURCE=$(cat "$SOFTMARK_JSX")

# Escape content for JS embedding
ESCAPED_CONTENT=$(python3 -c "
import sys, json
with open(sys.argv[1], 'r') as f:
    content = f.read()
print(json.dumps(content))
" "$FILE")

ESCAPED_FILENAME=$(python3 -c "
import sys, json
print(json.dumps(sys.argv[1]))
" "$FILENAME")

# Build the HTML wrapper
cat > "$TMPFILE" << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Softmark</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-type="module">
// Provide React hooks globally (artifact runtime does this automatically)
const { useState, useCallback, useRef, useEffect } = React;

// ── INJECTED CONTENT ──
window.__SOFTMARK_INJECT__ = {
  content: __SOFTMARK_CONTENT__,
  filename: __SOFTMARK_FILENAME__,
};

// ── JSX SOURCE ──
__SOFTMARK_JSX_SOURCE__

// ── Mount ──
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App || window.default, null));
</script>
</body>
</html>
HTMLEOF

# Strip the import line from JSX (React is loaded via CDN)
# Replace "export default function App" with "function App"
JSX_MODIFIED=$(echo "$JSX_SOURCE" | sed \
  -e 's/^import.*from.*"react".*;//' \
  -e 's/^export default function/function/' \
)

# Inject everything using Python for safety
python3 - "$TMPFILE" "$ESCAPED_CONTENT" "$ESCAPED_FILENAME" "$JSX_MODIFIED" << 'PYEOF'
import sys

tmpfile = sys.argv[1]
content = sys.argv[2]
filename = sys.argv[3]
jsx = sys.argv[4]

with open(tmpfile, 'r') as f:
    html = f.read()

html = html.replace('__SOFTMARK_CONTENT__', content)
html = html.replace('__SOFTMARK_FILENAME__', filename)
html = html.replace('__SOFTMARK_JSX_SOURCE__', jsx)

with open(tmpfile, 'w') as f:
    f.write(html)
PYEOF

# ── Open ──
if ! $FORCE_BROWSER && command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
  PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
  TMPDIR_SERVE=$(dirname "$TMPFILE")
  TMPNAME=$(basename "$TMPFILE")
  python3 -m http.server "$PORT" --directory "$TMPDIR_SERVE" --bind 127.0.0.1 &>/dev/null &
  SERVER_PID=$!
  echo -e "${GREEN}✓${NC} Opening ${BOLD}${FILENAME}${NC} in cmux browser pane"
  cmux browser open-split "http://127.0.0.1:${PORT}/${TMPNAME}"
  cmux notify --title "Softmark" --body "Opened ${FILENAME}" 2>/dev/null || true
  (sleep 30 && kill "$SERVER_PID" 2>/dev/null; rm -f "$TMPFILE") &
else
  echo -e "${GREEN}✓${NC} Opening ${BOLD}${FILENAME}${NC} in browser"
  open "$TMPFILE"
  (sleep 10 && rm -f "$TMPFILE") &
fi
