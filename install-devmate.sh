#!/bin/bash

# DevMate Omni-Shell Installer
# Installs DevMate CLI globally as 'devmate' command

INSTALL_DIR="$HOME/.local/bin"
BUN_PATH="${BUN_PATH:-$(which bun 2>/dev/null || echo "/home/runner/workspace/.config/npm/node_global/bin/bun")}"

echo "🔧 Installing DevMate Omni-Shell..."

# Check if bun exists
if ! command -v bun &> /dev/null; then
    echo "📦 Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
fi

# Create install directory
mkdir -p "$INSTALL_DIR"

# Get the source directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create bunx wrapper that runs the actual source file
echo '#!/bin/bash
SCRIPT_DIR="'"$SCRIPT_DIR"'"
if command -v bun &> /dev/null; then
    bun run "$SCRIPT_DIR/src/index.ts" "$@"
elif [ -f "$HOME/.config/npm/node_global/bin/bun" ]; then
    "$HOME/.config/npm/node_global/bin/bun" run "$SCRIPT_DIR/src/index.ts" "$@"
else
    echo "Bun not found. Install from https://bun.sh"
    exit 1
fi' > "$INSTALL_DIR/devmate"

chmod +x "$INSTALL_DIR/devmate"

# Add to PATH if not already
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.bashrc
    echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> ~/.zshrc
    echo "✅ Added $INSTALL_DIR to PATH"
fi

echo "✅ DevMate installed!"
echo "🚀 Run 'devmate' to start"
echo ""
echo "Features:"
echo "  • 600+ commands across ALL platforms"
echo "  • Tab autocomplete with 500+ completions"
echo "  • Custom commands, snippets, bookmarks, sessions"
echo "  • AI integration (OpenAI, Claude, Gemini, HuggingFace, etc.)"
echo "  • 20+ messaging platforms (Telegram, Discord, Slack, WhatsApp, etc.)"
echo "  • Google Ecosystem (GCP, Firebase, Flutter, Vertex AI)"
echo "  • GitHub/GitLab complete integration"
echo "  • Cloud IDEs (Replit, Cursor, Codespaces, Gitpod)"
echo "  • Serverless (Vercel, Netlify, Railway, Supabase)"
echo "  • Kubernetes & Edge computing"
echo "  • Monitoring & Observability"
echo "  • Security & Secrets management"
echo "  • Blockchain & Web3 tools"
echo "  • Data Engineering & ML tools"
echo "  • CI/CD pipelines"
echo "  • 30+ programming language runtimes"
echo ""
echo "Quick start:"
echo "  devmate              # Start DevMate"
echo "  devmate help         # Show help"
echo "  devmate cmd add hi echo Hello  # Add custom command"
