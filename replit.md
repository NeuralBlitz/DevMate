# DevMate v3.0 — OMNI-SHELL

## Overview

DevMate is the ultimate cross-platform CLI connecting 700+ tools, services, and platforms into one unified interface. It also ships with a web dashboard for browsing and discovering commands.

## Project Structure

```
devmate/
├── src/
│   └── index.ts          # Main CLI (TypeScript/Bun) — interactive shell
├── web/                  # Web dashboard (React + Vite)
│   ├── src/
│   │   ├── App.tsx       # Main app component (Explorer + Terminal tabs)
│   │   ├── data.ts       # All command categories and data
│   │   ├── main.tsx      # Entry point
│   │   └── index.css     # Global styles (dark terminal theme)
│   ├── package.json
│   └── vite.config.ts
├── devmate-tui/          # Go-based TUI (separate)
├── dist/                 # Built CLI output
├── install.sh            # Installer script
├── ROADMAP.md
└── README.md
```

## Running the Project

### Web Dashboard (primary — runs in preview pane)
```bash
cd web && npm run dev
# Runs on port 5000
```

### CLI (interactive shell)
```bash
bun run src/index.ts
```

## Web Dashboard Features

- **Explorer tab** — Browse all 700+ commands organized by 16 categories with search/filter
- **Terminal tab** — Interactive demo shell (ip, uuid, passgen, weather, help, doctor, etc.)
- Sidebar category filter
- Copy-to-clipboard on every command
- Dark terminal-inspired theme (JetBrains Mono + Inter)

## CLI Features

- 700+ commands across all platforms
- 50+ smart aliases
- Interactive REPL with readline
- Custom commands, snippets, bookmarks, sessions
- Tab autocomplete

## Tech Stack

- CLI: TypeScript + Bun + chalk + cli-table3
- Web: React 18 + Vite + TypeScript (no external UI library)
- Fonts: JetBrains Mono, Inter
