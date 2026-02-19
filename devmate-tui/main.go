package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
)

type App struct {
	app          *tview.Application
	fileTree     *tview.TreeView
	outputView   *tview.TextView
	gitView      *tview.TextView
	commandInput *tview.InputField
	currentDir   string
	commandHist  []string
	historyIndex int
}

func main() {
	app := &App{
		app:        tview.NewApplication(),
		currentDir: getCurrentDir(),
	}

	if err := app.run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func (a *App) run() error {
	a.initUI()
	a.loadDirectory(a.currentDir)
	a.updateGitStatus()

	return a.app.Run()
}

func (a *App) initUI() {
	// Create theme colors
	primary := tcell.GetColor("#7aa2f7")   // Blue
	secondary := tcell.GetColor("#9ece6a") // Green
	accent := tcell.GetColor("#bb9af7")    // Purple
	warning := tcell.GetColor("#e0af68")   // Orange
	_ = tcell.GetColor("#f7768e")          // Red (reserved)
	text := tcell.GetColor("#c0caf5")      // Light blue-gray
	dim := tcell.GetColor("#565f89")       // Dim gray

	// File tree (left panel)
	a.fileTree = tview.NewTreeView()
	a.fileTree.SetTitle(" 📁 Files ").SetBorder(true).
		SetBorderColor(primary).
		SetTitleColor(text)
	a.fileTree.SetSelectedFunc(func(node *tview.TreeNode) {
		ref := node.GetReference()
		if ref != nil {
			path := ref.(string)
			info, err := os.Stat(path)
			if err == nil {
				if info.IsDir() {
					if node.IsExpanded() {
						node.Collapse()
					} else {
						node.Expand()
					}
				} else {
					a.executeCommand("cat " + path)
				}
			}
		}
	})

	// Output view (center panel)
	a.outputView = tview.NewTextView()
	a.outputView.SetTitle(" 📤 Output ").SetBorder(true).
		SetBorderColor(secondary).
		SetTitleColor(text)
	a.outputView.SetDynamicColors(true)
	a.outputView.SetScrollable(true)
	a.outputView.SetBackgroundColor(tcell.ColorBlack)

	// Git panel (right)
	a.gitView = tview.NewTextView()
	a.gitView.SetTitle(" 🔀 Git ").SetBorder(true).
		SetBorderColor(accent).
		SetTitleColor(text)
	a.gitView.SetDynamicColors(true)
	a.gitView.SetScrollable(true)

	// Command input (bottom)
	a.commandInput = tview.NewInputField()
	a.commandInput.SetTitle(" ⌨️  Command ").SetBorder(true).
		SetBorderColor(warning).
		SetTitleColor(text)
	a.commandInput.SetPlaceholder("Enter command... (:help for commands, /ai for AI)")
	a.commandInput.SetPlaceholderTextColor(dim)
	a.commandInput.SetFieldTextColor(text)
	a.commandInput.SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEnter {
			command := a.commandInput.GetText()
			if command != "" {
				a.commandHist = append(a.commandHist, command)
				a.historyIndex = len(a.commandHist)
				a.executeCommand(command)
				a.commandInput.SetText("")
			}
		}
	})
	a.commandInput.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		// Command history navigation
		if event.Key() == tcell.KeyUp {
			if a.historyIndex > 0 {
				a.historyIndex--
				a.commandInput.SetText(a.commandHist[a.historyIndex])
			}
			return nil
		}
		if event.Key() == tcell.KeyDown {
			if a.historyIndex < len(a.commandHist)-1 {
				a.historyIndex++
				a.commandInput.SetText(a.commandHist[a.historyIndex])
			} else {
				a.historyIndex = len(a.commandHist)
				a.commandInput.SetText("")
			}
			return nil
		}
		return event
	})

	// Top panels layout
	topPanels := tview.NewFlex().SetDirection(tview.FlexColumn)
	topPanels.AddItem(a.fileTree, 0, 1, false)
	topPanels.AddItem(a.outputView, 0, 2, false)
	topPanels.AddItem(a.gitView, 0, 1, false)

	// Main layout
	mainLayout := tview.NewFlex().SetDirection(tview.FlexRow)
	mainLayout.AddItem(topPanels, 0, 3, false)
	mainLayout.AddItem(a.commandInput, 3, 0, true)

	// Header
	header := tview.NewTextView()
	header.SetDynamicColors(true)
	header.SetTextAlign(tview.AlignCenter)
	header.SetBackgroundColor(tcell.ColorBlack)
	headerText := fmt.Sprintf(`[%s]DevMate[%s] v3.0 - [%s]Golang TUI[white] | [%s]%s[white]`,
		"#f7768e", "white", "#bb9af7", "#7aa2f7", a.currentDir)
	header.SetText(headerText)

	// Footer / Status bar
	footer := tview.NewTextView()
	footer.SetDynamicColors(true)
	footer.SetTextAlign(tview.AlignLeft)
	footer.SetBackgroundColor(tcell.ColorBlack)
	footerText := "[#565f89]Tab[white]: switch | [↑↓]: history | [Ctrl+C]: exit | [:help]: commands"
	footer.SetText(footerText)

	// Root layout
	root := tview.NewFlex().SetDirection(tview.FlexRow)
	root.AddItem(header, 3, 0, false)
	root.AddItem(mainLayout, 0, 1, true)
	root.AddItem(footer, 1, 0, false)

	a.app.SetRoot(root, true)
	a.app.SetFocus(a.commandInput)
	a.app.SetBeforeDrawFunc(func(screen tcell.Screen) bool {
		screen.SetStyle(tcell.StyleDefault.
			Foreground(tcell.ColorWhite).
			Background(tcell.ColorBlack))
		return false
	})

	// Global input handler
	a.app.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		switch {
		case event.Key() == tcell.KeyCtrlC:
			a.app.Stop()
			return nil
		case event.Key() == tcell.KeyTab:
			a.app.SetFocus(a.fileTree)
			return nil
		case event.Key() == tcell.KeyCtrlO:
			a.app.SetFocus(a.outputView)
			return nil
		case event.Key() == tcell.KeyCtrlG:
			a.app.SetFocus(a.gitView)
			return nil
		case event.Rune() == ':' && a.app.GetFocus() != a.commandInput:
			a.app.SetFocus(a.commandInput)
			a.commandInput.SetText(":")
			return nil
		case event.Rune() == '/':
			a.app.SetFocus(a.commandInput)
			a.commandInput.SetText("/ai ")
			return nil
		}
		return event
	})

	// Welcome message
	a.appendOutput("[#7aa2f7]Welcome to DevMate v3.0![white]\n")
	a.appendOutput("[#9ece6a]Quick commands:[white]\n")
	a.appendOutput("  :ls, :cd, :cat, :grep, :find, :mkdir, :rm\n")
	a.appendOutput("  :git <cmd>, :git status, :branches, :graph\n")
	a.appendOutput("  /ai <question> - Ask AI assistant\n")
	a.appendOutput("  :help - Full help\n\n")
}

func (a *App) loadDirectory(dir string) {
	a.currentDir = dir

	root := tview.NewTreeNode(dir).
		SetReference(dir)
	root.SetColor(tcell.GetColor("#7aa2f7"))

	a.addChildren(root, dir, 1)
	a.fileTree.SetRoot(root)
	a.fileTree.SetCurrentNode(root)
}

func (a *App) addChildren(node *tview.TreeNode, path string, depth int) {
	if depth > 3 {
		return // Limit depth for performance
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return
	}

	var dirs []os.DirEntry
	var files []os.DirEntry

	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if entry.IsDir() {
			dirs = append(dirs, entry)
		} else {
			files = append(files, entry)
		}
	}

	// Add directories first
	for _, entry := range dirs {
		name := entry.Name()
		fullPath := filepath.Join(path, name)
		child := tview.NewTreeNode("[#7aa2f7]📁[white] " + name).
			SetReference(fullPath)
		// Add placeholder for lazy loading
		child.AddChild(tview.NewTreeNode(""))
		node.AddChild(child)
	}

	// Then files
	for _, entry := range files {
		name := entry.Name()
		fullPath := filepath.Join(path, name)
		icon := getFileIcon(name)
		child := tview.NewTreeNode(icon + " " + name).
			SetReference(fullPath)
		node.AddChild(child)
	}
}

func getFileIcon(filename string) string {
	ext := strings.TrimPrefix(filepath.Ext(filename), ".")
	icons := map[string]string{
		"ts":         "[#519aba]🔷[white]",
		"tsx":        "[#519aba]⚛️[white]",
		"js":         "[#f7df1e]🟨[white]",
		"jsx":        "[#61dafb]⚛️[white]",
		"json":       "[#cbcb41]📋[white]",
		"md":         "[#519aba]📝[white]",
		"go":         "[#00add8]🐹[white]",
		"rs":         "[#dea584]🦀[white]",
		"py":         "[#3572A5]🐍[white]",
		"yaml":       "[#cb171e]📄[white]",
		"yml":        "[#cb171e]📄[white]",
		"toml":       "[#9c4121]⚙️[white]",
		"sh":         "[#89e051]🖥️[white]",
		"bash":       "[#89e051]🖥️[white]",
		"zsh":        "[#89e051]🖥️[white]",
		"html":       "[#e34c26]🌐[white]",
		"css":        "[#563d7c]🎨[white]",
		"sql":        "[#e38c00]🗃️[white]",
		"dockerfile": "[#0db7ed]🐳[white]",
		"gitignore":  "[#f05032]🔧[white]",
	}

	if icon, ok := icons[ext]; ok {
		return icon
	}
	if icon, ok := icons[strings.ToLower(filename)]; ok {
		return icon
	}
	return "[#565f89]📄[white]"
}

func (a *App) updateGitStatus() {
	a.gitView.Clear()

	// Check if git repo
	gitDir := filepath.Join(a.currentDir, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		a.gitView.SetText("[#565f89]Not a git repository[white]")
		return
	}

	// Get branch
	branch := a.runGitCmd("rev-parse --abbrev-ref HEAD")
	if branch == "" {
		branch = "unknown"
	}

	// Get status
	status := a.runGitCmd("status --porcelain")
	lines := strings.Split(status, "\n")

	staged := 0
	modified := 0
	untracked := 0

	for _, line := range lines {
		if len(line) > 0 {
			if line[0] == '?' {
				untracked++
			} else if line[0] != ' ' {
				staged++
			}
			if len(line) > 1 && line[1] == 'M' {
				modified++
			}
		}
	}

	// Get recent commits
	commits := a.runGitCmd("log --oneline -5")

	// Format output
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[#7aa2f7]Branch:[white] %s\n\n", branch))

	if staged > 0 {
		sb.WriteString(fmt.Sprintf("[#9ece6a]✓ %d staged[white]\n", staged))
	}
	if modified > 0 {
		sb.WriteString(fmt.Sprintf("[#e0af68]~ %d modified[white]\n", modified))
	}
	if untracked > 0 {
		sb.WriteString(fmt.Sprintf("[#565f89]? %d untracked[white]\n", untracked))
	}

	if staged == 0 && modified == 0 && untracked == 0 {
		sb.WriteString("[#9ece6a]✓ Working tree clean[white]\n")
	}

	sb.WriteString("\n[#bb9af7]Recent commits:[white]\n")
	sb.WriteString(commits)

	a.gitView.SetText(sb.String())
}

func (a *App) runGitCmd(args string) string {
	cmd := exec.Command("git", strings.Fields(args)...)
	cmd.Dir = a.currentDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func (a *App) executeCommand(cmd string) {
	a.appendOutput(fmt.Sprintf("[#e0af68]$ %s[white]\n", cmd))

	// AI commands
	if strings.HasPrefix(cmd, "/ai ") || strings.HasPrefix(cmd, "/ask ") {
		question := strings.TrimPrefix(cmd, "/ai ")
		question = strings.TrimPrefix(question, "/ask ")
		a.runAI(question)
		return
	}

	// Skip empty commands
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return
	}

	// Parse command
	parts := strings.Fields(cmd)
	command := parts[0]
	args := parts[1:]

	switch command {
	case ":help", "help":
		a.showHelp()
	case ":clear", "clear":
		a.outputView.Clear()
	case ":exit", "quit", "q":
		a.app.Stop()
	case ":ls":
		a.cmdLs(args)
	case ":cd":
		a.cmdCd(args)
	case ":cat":
		a.cmdCat(args)
	case ":pwd":
		a.appendOutput(a.currentDir + "\n")
	case ":mkdir":
		a.cmdMkdir(args)
	case ":rm":
		a.cmdRm(args)
	case ":grep":
		a.cmdGrep(args)
	case ":find":
		a.cmdFind(args)
	case ":git":
		a.cmdGit(args)
	case ":branches":
		a.cmdBranches()
	case ":graph":
		a.cmdGraph(args)
	case ":status":
		a.cmdGitStatus()
	default:
		// Try as shell command
		a.runShellCommand(cmd)
	}
}

func (a *App) showHelp() {
	helpText := `[#7aa2f7]DevMate Commands[white]

[#9ece6a]File Operations:[white]
  :ls [dir]           List files
  :cd <dir>           Change directory
  :cat <file>         Read file
  :pwd                Print working directory
  :mkdir <dir>        Create directory
  :rm <file>          Remove file/directory

[#e0af68]Search:[white]
  :grep <pattern> [file]  Search in files
  :find <name>           Find files by name

[#bb9af7]Git:[white]
  :git <cmd>        Run git command
  :git status       Show git status
  :branches         Show branch tree
  :graph [n]       Show commit graph

[#f7768e]AI:[white]
  /ai <question>   Ask AI assistant
  /ask <question>  Ask AI assistant

[#565f89]System:[white]
  :clear              Clear output
  :help              Show this help
  :exit              Exit DevMate

[#7aa2f7]Keyboard Shortcuts:[white]
  Tab         Switch panel
  Ctrl+O     Focus output
  Ctrl+G     Focus git panel
  ↑/↓        Command history
  :           Open command input
  /           Open AI input
`
	a.appendOutput(helpText)
}

func (a *App) cmdLs(args []string) {
	dir := a.currentDir
	if len(args) > 0 {
		dir = filepath.Join(a.currentDir, args[0])
	}

	output := a.runCmd("ls", []string{"-la", "--color=never", dir})
	a.appendOutput(output)
}

func (a *App) cmdCd(args []string) {
	if len(args) == 0 {
		home := os.Getenv("HOME")
		if home != "" {
			a.loadDirectory(home)
			a.updateGitStatus()
			a.appendOutput(fmt.Sprintf("[#9ece6a]Changed to %s[white]\n", home))
		}
		return
	}

	dir := args[0]
	if dir == "~" {
		dir = os.Getenv("HOME")
	}

	fullPath := filepath.Join(a.currentDir, dir)
	if info, err := os.Stat(fullPath); err == nil && info.IsDir() {
		a.loadDirectory(fullPath)
		a.updateGitStatus()
		a.appendOutput(fmt.Sprintf("[#9ece6a]Changed to %s[white]\n", fullPath))
	} else {
		a.appendOutput(fmt.Sprintf("[#f7768e]Directory not found: %s[white]\n", fullPath))
	}
}

func (a *App) cmdCat(args []string) {
	if len(args) == 0 {
		a.appendOutput("[#f7768e]Usage: :cat <file>[white]\n")
		return
	}

	fullPath := filepath.Join(a.currentDir, args[0])
	content, err := os.ReadFile(fullPath)
	if err != nil {
		a.appendOutput(fmt.Sprintf("[#f7768e]Error reading file: %s[white]\n", err.Error()))
		return
	}

	// Limit output length
	maxLines := 500
	lines := strings.Split(string(content), "\n")
	if len(lines) > maxLines {
		lines = lines[:maxLines]
		a.appendOutput(fmt.Sprintf("[#e0af68]... (showing first %d lines)[white]\n", maxLines))
	}

	for _, line := range lines {
		a.appendOutput(line + "\n")
	}
}

func (a *App) cmdMkdir(args []string) {
	if len(args) == 0 {
		a.appendOutput("[#f7768e]Usage: :mkdir <directory>[white]\n")
		return
	}

	fullPath := filepath.Join(a.currentDir, args[0])
	err := os.MkdirAll(fullPath, 0755)
	if err != nil {
		a.appendOutput(fmt.Sprintf("[#f7768e]Error: %s[white]\n", err.Error()))
		return
	}

	a.appendOutput(fmt.Sprintf("[#9ece6a]Created directory: %s[white]\n", fullPath))
	a.loadDirectory(a.currentDir)
}

func (a *App) cmdRm(args []string) {
	if len(args) == 0 {
		a.appendOutput("[#f7768e]Usage: :rm <file/directory>[white]\n")
		return
	}

	fullPath := filepath.Join(a.currentDir, args[0])
	info, err := os.Stat(fullPath)
	if err != nil {
		a.appendOutput(fmt.Sprintf("[#f7768e]Not found: %s[white]\n", fullPath))
		return
	}

	if info.IsDir() {
		err = os.RemoveAll(fullPath)
	} else {
		err = os.Remove(fullPath)
	}

	if err != nil {
		a.appendOutput(fmt.Sprintf("[#f7768e]Error: %s[white]\n", err.Error()))
		return
	}

	a.appendOutput(fmt.Sprintf("[#9ece6a]Removed: %s[white]\n", fullPath))
	a.loadDirectory(a.currentDir)
}

func (a *App) cmdGrep(args []string) {
	if len(args) == 0 {
		a.appendOutput("[#f7768e]Usage: :grep <pattern> [path][white]\n")
		return
	}

	pattern := args[0]
	path := a.currentDir
	if len(args) > 1 {
		path = filepath.Join(a.currentDir, args[1])
	}

	// Use grep -r
	output := a.runCmd("grep", []string{"-rn", "--color=never", pattern, path})
	a.appendOutput(output)
}

func (a *App) cmdFind(args []string) {
	if len(args) == 0 {
		a.appendOutput("[#f7768e]Usage: :find <name>[white]\n")
		return
	}

	name := args[0]
	// Use find command
	output := a.runCmd("find", []string{a.currentDir, "-name", name, "-type", "f"})
	a.appendOutput(output)
}

func (a *App) cmdGit(args []string) {
	if len(args) == 0 {
		a.cmdGitStatus()
		return
	}

	gitArgs := args
	output := a.runCmd("git", gitArgs)
	a.appendOutput(output)
	a.updateGitStatus()
}

func (a *App) cmdGitStatus() {
	output := a.runCmd("git", []string{"status"})
	a.appendOutput(output)
	a.updateGitStatus()
}

func (a *App) cmdBranches() {
	output := a.runCmd("git", []string{"branch", "-a"})
	a.appendOutput(output)
}

func (a *App) cmdGraph(args []string) {
	n := "10"
	if len(args) > 0 {
		n = args[0]
	}
	output := a.runCmd("git", []string{"log", "--oneline", "--graph", "--decorate", "-n", n})
	a.appendOutput(output)
}

func (a *App) runAI(question string) {
	a.appendOutput("[#7aa2f7]🤖 Asking OpenCode AI... (may take a moment)[white]\n")

	opencodePath := "/home/runner/workspace/.config/npm/node_global/bin/opencode"
	cmd := exec.Command(opencodePath, "run", question)
	cmd.Dir = a.currentDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		a.appendOutput(fmt.Sprintf("[#f7768e]AI Error: %s[white]\n", err.Error()))
	}

	a.appendOutput("\n[#7aa2f7]🤖 Response:[white]\n")
	a.appendOutput(string(output))
	a.appendOutput("\n")
}

func (a *App) runCmd(name string, args []string) string {
	cmd := exec.Command(name, args...)
	cmd.Dir = a.currentDir
	output, err := cmd.CombinedOutput()
	if err != nil && len(output) == 0 {
		return fmt.Sprintf("[#f7768e]Error: %s[white]\n", err.Error())
	}
	return string(output)
}

func (a *App) runShellCommand(cmd string) {
	shell := "/bin/sh"
	if runtime.GOOS == "windows" {
		shell = "cmd.exe"
	}

	command := exec.Command(shell, "-c", cmd)
	command.Dir = a.currentDir
	output, err := command.CombinedOutput()
	if err != nil && len(output) == 0 {
		a.appendOutput(fmt.Sprintf("[#f7768e]Error: %s[white]\n", err.Error()))
	}
	a.appendOutput(string(output))
}

func (a *App) appendOutput(text string) {
	fmt.Fprint(a.outputView, text)
	a.outputView.ScrollToEnd()
}

func getCurrentDir() string {
	dir, err := os.Getwd()
	if err != nil {
		return "/"
	}
	return dir
}
