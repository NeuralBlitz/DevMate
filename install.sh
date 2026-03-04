#!/bin/bash

# DevMate CLI Installer - Simple & Robust
# Run: ./install.sh

echo "DevMate Installer v3.0"
echo "======================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check bun
if ! command -v bun &> /dev/null; then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

echo "Installing dependencies..."
bun install

echo "Building..."
bun run build

echo "Installing CLI..."
chmod +x dist/index.js
mkdir -p "$HOME/.local/bin"
cp dist/index.js "$HOME/.local/bin/devmate"

# Add to path if needed
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    echo "Added ~/.local/bin to PATH (run 'source ~/.bashrc')"
fi

echo ""
echo "Done! Run: devmate"
echo "Or: ~/.local/bin/devmate"
