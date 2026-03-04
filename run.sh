#!/bin/bash
# DevMate Zero-Install Runner
# Usage: curl -sL https://devmate.dev/run | bash
#    Or: curl -sL https://devmate.dev/run -o devmate && chmod +x devmate && ./devmate
#    Or: npx devmate
#    Or: bunx devmate

set -e

VERSION="3.0.0"
TEMP_DIR="/tmp/devmate-$RANDOM"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}DevMate v${VERSION} Zero-Install${NC}"

# Check for bun
if command -v bun &> /dev/null; then
    echo -e "${GREEN}Using Bun...${NC}"
    bun run --bun "https://devmate.dev/src/index.ts" "$@"
    exit $?
fi

# Check for npx (Node.js)
if command -v npx &> /dev/null; then
    echo -e "${GREEN}Using npx...${NC}"
    npx "devmate@latest" "$@"
    exit $?
fi

# Check for Node.js
if command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing bun for faster execution...${NC}"
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    bun run --bun "https://devmate.dev/src/index.ts" "$@"
    exit $?
fi

# No runtime found - give instructions
echo -e "${RED}No runtime found!${NC}"
echo ""
echo "Please install one of:"
echo "  • Bun:     curl -fsSL https://bun.sh/install | bash"
echo "  • Node.js: https://nodejs.org"
echo ""
echo "Or run with Docker:"
echo "  docker run -it devmate"
