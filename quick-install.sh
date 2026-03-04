#!/bin/bash

# DevMate Quick Start - No dependencies required!
# Just run: bash <(curl -sL https://devmate.dev/install)

set -e

echo "DevMate Quick Installer"
echo "======================="

# Check if bun is available
if command -v bun &> /dev/null; then
    echo "Bun found, using it..."
    BUN_CMD="bun"
else
    # Install bun
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    BUN_CMD="$BUN_INSTALL/bin/bun"
fi

# Create temp dir
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Clone or download
echo "Downloading DevMate..."
curl -sL "https://raw.githubusercontent.com/devmate-cli/devmate/main/src/index.ts" -o index.ts 2>/dev/null || {
    echo "Could not download. Please install manually:"
    echo "  git clone https://github.com/devmate-cli/devmate.git"
    echo "  cd devmate && ./install.sh"
    exit 1
}

# Install deps and run
echo "Installing..."
$BUN_CMD install

echo ""
echo "DevMate is ready!"
echo "Run: bun run src/index.ts"
