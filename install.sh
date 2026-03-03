#!/bin/bash

# DevMate CLI Installer
# Usage: ./install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building DevMate..."
bun build src/index.ts --outdir dist --target bun

echo "Making executable..."
chmod +x dist/index.js

echo "Installing globally..."
npm link

echo ""
echo "✓ DevMate installed successfully!"
echo "Run 'devmate' to start"
