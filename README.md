# DevMate v2.0 🚀 - Advanced Developer CLI

Your intelligent, extensible CLI companion for modern development. Now with advanced features including code execution, system monitoring, file watching, project scaffolding, and more.

## 🌟 What's New in v2.0

- **Code Execution**: Run code in 10+ languages with syntax highlighting
- **System Monitoring**: Real-time CPU, memory, disk, and process monitoring
- **File Watcher**: Auto-run commands when files change
- **Project Templates**: Scaffold new projects in seconds
- **Clipboard Integration**: Copy/paste from system clipboard
- **Session Management**: Save and restore work sessions
- **Enhanced Git**: Branch trees, commit graphs, blame view
- **Battery & Network Info**: System details at your fingertips

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start DevMate
bun run src/index.ts

# Or make it global
bun link
devmate
```

## 📖 Commands

### 📁 File Operations

```bash
ls [dir]              # List files with icons and sizes
cat <file>            # Read file with syntax highlighting
edit <file>           # Interactive file editor
grep <pattern>        # Search file contents
find <pattern>        # Find files by name
cd <dir>              # Change directory
pwd                   # Show current directory
mkdir <dir>           # Create directory
rm <file>             # Remove files/directories
```

### 🔧 Git Commands

```bash
git status            # Visual git status with icons
git log [n]           # Show recent commits
git add [files]       # Stage files
git commit <msg>      # Commit changes
git push/pull         # Sync with remote
git diff              # Show changes
git checkout <branch> # Switch branches

# Enhanced Git
branches              # Visual branch tree
graph [n]             # Commit graph visualization
diff [file]           # Colored diff view
staged                # View staged changes
blame <file>          # Line-by-line git blame
activity              # Recent commit activity
```

### 🤖 AI Assistant

```bash
ask <question>        # Ask OpenAI/Claude AI
ai config             # Configure AI provider
```

**Supported AI Providers:**
- OpenAI (GPT-3.5-turbo, GPT-4)
- Anthropic Claude (Haiku, Sonnet, Opus)

### 💻 Code Execution

```bash
run <file>            # Execute code files
exec <lang> <code>    # Run code snippets
```

**Supported Languages:** JavaScript, TypeScript, Python, Ruby, Bash, Go, Rust, PHP, Perl

Example:
```bash
exec python "print('Hello, World!')"
run script.ts
```

### 📊 System Monitoring

```bash
sysinfo               # System information
monitor               # Real-time system monitor (CPU, RAM, processes)
network               # Network interfaces and stats
battery               # Battery status
```

### 👁️ File Watcher

```bash
watch <pattern> <command>
```

Auto-run commands when files change:
```bash
watch "*.ts" "bun test"           # Run tests on TypeScript changes
watch "src/**/*" "bun run build"  # Rebuild on any source change
```

### 📦 Project Templates

```bash
new <template> <project-name>
templates             # List available templates
```

**Available Templates:**
- `node` - Node.js project
- `typescript` - TypeScript with Bun
- `react` - React + Vite + TypeScript
- `python` - Python project with venv
- `cli` - CLI tool with Commander

Example:
```bash
new react my-app      # Create React app
new typescript api    # Create TypeScript API
```

### 💾 Session Management

```bash
session save <name>   # Save current session
session load <name>   # Restore session
session list          # List saved sessions
session rm <name>     # Delete session
```

### 📋 Clipboard

```bash
copy <text>           # Copy to clipboard
paste                 # Paste from clipboard
```

### ✅ Task Management

```bash
task add <description>  # Add a task
task list               # List all tasks
task done <id>          # Mark task complete
task rm <id>            # Delete task
```

### 🔖 Bookmarks

```bash
bookmark add          # Bookmark current directory
bookmark list         # Show all bookmarks
bookmark goto         # Jump to bookmark
bookmark rm <name>    # Delete bookmark
```

### ⚙️ Configuration

```bash
config                # Show all settings
config <key> [value]  # Get/set config value
```

## 🛠️ Configuration

Create `~/.devmate/config.json`:

```json
{
  "aiProvider": "openai",
  "aiApiKey": "sk-...",
  "aiModel": "gpt-3.5-turbo",
  "theme": "dark",
  "editor": "nano"
}
```

Or use the interactive config:
```bash
devmate
> ai config
```

## 📁 Project Structure

```
src/
├── commands/          # Command handlers
├── services/          # Core services
│   ├── ai.ts         # AI integration (OpenAI/Claude)
│   ├── database.ts   # JSON persistence
│   ├── executor.ts   # Code execution sandbox
│   ├── file.ts       # File operations
│   ├── git.ts        # Git operations
│   ├── git-enhanced.ts  # Enhanced git features
│   ├── system.ts     # System monitoring
│   ├── watcher.ts    # File watcher
│   ├── templates.ts  # Project scaffolding
│   └── clipboard.ts  # Clipboard & sessions
├── config/           # Configuration management
├── plugins/          # Plugin system
├── ui/              # UI components
├── types/           # TypeScript types
└── index.ts         # Entry point

tests/               # Test suite
```

## 🧪 Development

```bash
# Run in dev mode (auto-reload)
bun run dev

# Run tests
bun test

# Build for distribution
bun run build
```

## 📦 Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **CLI Framework:** Inquirer.js
- **Styling:** Chalk
- **Loading Spinners:** Ora
- **Syntax Highlighting:** Shiki
- **File Watching:** Chokidar
- **System Info:** Systeminformation
- **Clipboard:** Clipboardy
- **Testing:** Bun test runner

## 🎯 Advanced Features

### Syntax Highlighting
Files are displayed with syntax highlighting for 20+ languages including:
- JavaScript/TypeScript
- Python
- Rust
- Go
- Java
- Ruby
- PHP
- HTML/CSS
- And more!

### Git Visualizations
- **Branch Tree**: Hierarchical view of all branches
- **Commit Graph**: ASCII graph of commit history
- **Diff View**: Color-coded diffs with additions/removals
- **Blame**: Line-by-line author attribution

### System Monitor
Real-time display of:
- CPU usage and temperature
- Memory consumption
- Disk usage
- Top processes by CPU
- Network interfaces

### Code Execution Sandbox
Safely execute code in isolated environments for:
- Quick testing
- Script execution
- Algorithm verification
- Learning new languages

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📄 License

MIT License - feel free to use in your own projects!

---

**DevMate** - Your code, amplified. 🚀
