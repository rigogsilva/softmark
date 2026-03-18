#!/bin/bash
# ─────────────────────────────────────────────
# Softmark uninstaller
# ─────────────────────────────────────────────

set -euo pipefail

BIN_DIR="${HOME}/.local/bin"
CONFIG_DIR="${HOME}/.config/softmark"

GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}Softmark${NC} — uninstaller"
echo ""

rm -f "${BIN_DIR}/softmark"
rm -rf "${CONFIG_DIR}"

echo -e "${GREEN}✓${NC} Removed ${DIM}${BIN_DIR}/softmark${NC}"
echo -e "${GREEN}✓${NC} Removed ${DIM}${CONFIG_DIR}${NC}"
