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
SOFTMARK_AI_URL="${SOFTMARK_AI_URL:-https://claude.ai/public/artifacts/45ebea89-f898-436a-96fa-c6587e0aa08d}"

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
  echo -e "  ${GREEN}softmark${NC} <folder/>             Open all .md files in folder"
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
  if ! $FORCE_BROWSER && command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
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

FOLDER_MODE=false
if [[ -d "$FILE" ]]; then
  FOLDER_MODE=true
  FOLDER_PATH="$(cd "$FILE" && pwd)"
  FILENAME=$(basename "$FOLDER_PATH")
  # Build JSON array of files using Python
  ESCAPED_FILES=$(python3 -c "
import sys, os, json
folder = sys.argv[1]
files = []
for root, dirs, filenames in sorted(os.walk(folder)):
    for f in sorted(filenames):
        if f.lower().endswith(('.md', '.markdown', '.txt', '.mdx')):
            path = os.path.join(root, f)
            rel = os.path.relpath(path, folder)
            with open(path, 'r') as fh:
                files.append({'name': f, 'path': rel, 'content': fh.read()})
if not files:
    print('ERROR: no markdown files found in ' + folder, file=sys.stderr)
    sys.exit(1)
print(json.dumps(files))
" "$FOLDER_PATH")
  if [[ $? -ne 0 ]]; then
    echo -e "${RED}Error:${NC} no markdown files found in ${FILE}"
    exit 1
  fi
elif [[ -f "$FILE" ]]; then
  FILENAME=$(basename "$FILE")
  CONTENT=$(cat "$FILE")
else
  echo -e "${RED}Error:${NC} not found: ${FILE}"
  exit 1
fi

# ── AI Mode: copy to clipboard + open Claude artifact ──
if $AI_MODE && $FOLDER_MODE; then
  echo -e "${RED}Error:${NC} --ai mode is not supported for folders"
  exit 1
fi
if $AI_MODE; then
  echo "$CONTENT" | pbcopy
  echo -e "${GREEN}✓${NC} Copied ${BOLD}${FILENAME}${NC} to clipboard (${#CONTENT} chars)"
  echo -e "${DIM}Opening Softmark AI... paste your content there${NC}"
  if ! $FORCE_BROWSER && command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
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

# Build inject JSON
if $FOLDER_MODE; then
  INJECT_JSON="$ESCAPED_FILES"
  # Wrap in folder mode object
  INJECT_JSON=$(python3 -c "
import sys, json
files = json.loads(sys.argv[1])
print(json.dumps({'mode': 'folder', 'files': files, 'folderName': sys.argv[2]}))
" "$ESCAPED_FILES" "$FILENAME")
else
  INJECT_JSON=$(python3 -c "
import sys, json
with open(sys.argv[1], 'r') as f:
    content = f.read()
print(json.dumps({'content': content, 'filename': sys.argv[2]}))
" "$FILE" "$FILENAME")
fi

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
window.__SOFTMARK_INJECT__ = __SOFTMARK_INJECT_DATA__;

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

# Inject everything using Python for safety — write inject JSON to temp file to avoid arg limits
INJECT_TMPFILE=$(mktemp /tmp/softmark-inject-XXXXXX.json)
echo "$INJECT_JSON" > "$INJECT_TMPFILE"

python3 - "$TMPFILE" "$INJECT_TMPFILE" "$JSX_MODIFIED" << 'PYEOF'
import sys

tmpfile = sys.argv[1]
inject_file = sys.argv[2]
jsx = sys.argv[3]

with open(tmpfile, 'r') as f:
    html = f.read()

with open(inject_file, 'r') as f:
    inject_json = f.read()

html = html.replace('__SOFTMARK_INJECT_DATA__', inject_json)
html = html.replace('__SOFTMARK_JSX_SOURCE__', jsx)

with open(tmpfile, 'w') as f:
    f.write(html)

import os
os.unlink(inject_file)
PYEOF

# ── Open ──
if ! $FORCE_BROWSER && command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
  PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
  TMPDIR_SERVE=$(dirname "$TMPFILE")
  TMPNAME=$(basename "$TMPFILE")
  python3 -m http.server "$PORT" --directory "$TMPDIR_SERVE" --bind 127.0.0.1 &>/dev/null &
  SERVER_PID=$!
  if $FOLDER_MODE; then
    echo -e "${GREEN}✓${NC} Opening folder ${BOLD}${FILENAME}${NC} in cmux browser pane"
  else
    echo -e "${GREEN}✓${NC} Opening ${BOLD}${FILENAME}${NC} in cmux browser pane"
  fi
  cmux browser open-split "http://127.0.0.1:${PORT}/${TMPNAME}"
  cmux notify --title "Softmark" --body "Opened ${FILENAME}" 2>/dev/null || true
  (sleep 30 && kill "$SERVER_PID" 2>/dev/null; rm -f "$TMPFILE") &
else
  if $FOLDER_MODE; then
    echo -e "${GREEN}✓${NC} Opening folder ${BOLD}${FILENAME}${NC} in browser"
  else
    echo -e "${GREEN}✓${NC} Opening ${BOLD}${FILENAME}${NC} in browser"
  fi
  open "$TMPFILE"
  (sleep 10 && rm -f "$TMPFILE") &
fi
