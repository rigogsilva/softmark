#!/bin/bash
# ─────────────────────────────────────────────
# Softmark installer
# Downloads softmark.sh and softmark.jsx from GitHub and installs them.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/rigogsilva/softmark/main/install.sh | bash
# or locally:
#   ./install.sh
# ─────────────────────────────────────────────

set -euo pipefail

REPO="rigogsilva/softmark"
BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

BIN_DIR="${HOME}/.local/bin"
CONFIG_DIR="${HOME}/.config/softmark"

GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}Softmark${NC} — installer"
echo ""

# ── Dependency check ──
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}Error:${NC} python3 is required but not found."
  exit 1
fi

# ── Create directories ──
mkdir -p "$BIN_DIR" "$CONFIG_DIR"

# ── Download files ──
echo -e "Downloading files from ${DIM}${RAW_BASE}${NC}..."

if command -v curl &>/dev/null; then
  curl -fsSL "${RAW_BASE}/softmark.sh" -o "${BIN_DIR}/softmark"
  curl -fsSL "${RAW_BASE}/softmark.jsx" -o "${CONFIG_DIR}/softmark.jsx"
elif command -v wget &>/dev/null; then
  wget -qO "${BIN_DIR}/softmark" "${RAW_BASE}/softmark.sh"
  wget -qO "${CONFIG_DIR}/softmark.jsx" "${RAW_BASE}/softmark.jsx"
else
  echo -e "${RED}Error:${NC} curl or wget is required."
  exit 1
fi

chmod +x "${BIN_DIR}/softmark"

echo -e "${GREEN}✓${NC} Installed ${BOLD}softmark${NC} to ${DIM}${BIN_DIR}/softmark${NC}"
echo -e "${GREEN}✓${NC} Installed ${BOLD}softmark.jsx${NC} to ${DIM}${CONFIG_DIR}/softmark.jsx${NC}"
echo ""

# ── PATH check ──
if ! echo "$PATH" | grep -q "${BIN_DIR}"; then
  echo -e "Add ${BOLD}~/.local/bin${NC} to your PATH:"
  echo -e "  ${DIM}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc${NC}"
  echo ""
fi

echo -e "Done. Try: ${GREEN}softmark --help${NC}"
