import { useState, useMemo, useRef, useEffect } from "react";
import { categories, stats, type Category } from "./data";

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function TerminalIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  );
}

function CmdCard({ cmd, desc, color }: { cmd: string; desc: string; color: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const text = cmd.split(",")[0].trim().replace(/<[^>]+>/g, "").trim();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        transition: "border-color 0.15s, background 0.15s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = color;
        (e.currentTarget as HTMLDivElement).style.background = "var(--surface2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.background = "var(--surface)";
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span
          className="mono"
          style={{
            color,
            fontSize: 12,
            fontWeight: 600,
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {cmd}
        </span>
        <span style={{ color: "var(--text2)", fontSize: 11, lineHeight: 1.4 }}>{desc}</span>
      </div>
      <button
        onClick={copy}
        title="Copy command"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: copied ? "var(--green)" : "var(--text3)",
          padding: "4px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!copied) (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          if (!copied) (e.currentTarget as HTMLButtonElement).style.color = "var(--text3)";
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

function CategoryPanel({ cat }: { cat: Category }) {
  return (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>{cat.icon}</span>
        <span style={{ fontWeight: 600, color: cat.color, fontSize: 13 }}>{cat.name}</span>
        <span
          style={{
            marginLeft: "auto",
            background: "var(--surface)",
            color: "var(--text3)",
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 20,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {cat.commands.length}
        </span>
      </div>
      <div
        style={{
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {cat.commands.map((c, i) => (
          <CmdCard key={i} cmd={c.cmd} desc={c.desc} color={cat.color} />
        ))}
      </div>
    </div>
  );
}

type TermLine = { type: "input" | "output" | "error" | "info"; text: string };

const DEMO_COMMANDS: Record<string, string[]> = {
  help: [
    "DevMate v3.0 — Available commands:",
    "",
    "  Files:     ls, cat, mkdir, rm, cp, mv, tree",
    "  Git:       status, commit, push, pull, gh",
    "  AI:        openai, claude, gemini, ask",
    "  Cloud:     vercel, netlify, fly, railway",
    "  Docker:    docker, kubectl, helm, k9s",
    "  Messaging: telegram, discord, slack, whatsapp",
    "  Quick:     ip, weather, qr, passgen, uuid",
    "",
    "Type any command to explore. Use 'clear' to reset.",
  ],
  clear: ["__CLEAR__"],
  ip: ["Public IP: 203.0.113.42", "Local:     192.168.1.105"],
  uuid: ["f47ac10b-58cc-4372-a567-0e02b2c3d479"],
  timestamp: [new Date().toISOString()],
  passgen: [
    "Generated password: xK#9mP@2nQ!vL5rT",
    "Strength: ████████████ Strong",
  ],
  weather: [
    "📍 San Francisco, CA",
    "🌤  Partly Cloudy  68°F / 20°C",
    "💨 Wind: 12 mph NW",
    "💧 Humidity: 72%",
  ],
  status: [
    "On branch main",
    "Your branch is up to date with 'origin/main'.",
    "",
    "nothing to commit, working tree clean",
  ],
  ls: ["dist/   node_modules/   src/   web/   README.md   package.json"],
  version: ["DevMate v3.0.0"],
  "--version": ["DevMate v3.0.0"],
  "-v": ["DevMate v3.0.0"],
  doctor: [
    "✓ bun          v1.1.34",
    "✓ node         v20.18.1",
    "✓ git          v2.47.0",
    "✓ docker       v27.3.1",
    "✓ kubectl      v1.31.0",
    "⚠ terraform    not installed  →  brew install terraform",
    "⚠ gh           not installed  →  brew install gh",
    "",
    "2 tools missing. Run 'devmate install' to fix.",
  ],
};

function TerminalPanel() {
  const [lines, setLines] = useState<TermLine[]>([
    { type: "info", text: "DevMate v3.0 Interactive Shell — type 'help' to start" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  function run(raw: string) {
    const cmd = raw.trim();
    if (!cmd) return;

    setHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);

    const newLines: TermLine[] = [...lines, { type: "input", text: cmd }];

    const key = cmd.split(" ")[0].toLowerCase();
    const resp = DEMO_COMMANDS[key] ?? DEMO_COMMANDS[cmd.toLowerCase()];

    if (resp) {
      if (resp[0] === "__CLEAR__") {
        setLines([{ type: "info", text: "Screen cleared." }]);
        setInput("");
        return;
      }
      resp.forEach((r) => newLines.push({ type: "output", text: r }));
    } else {
      newLines.push({
        type: "error",
        text: `command '${cmd}' not found in demo. Try: help, ip, uuid, passgen, weather, status, ls, doctor`,
      });
    }

    setLines(newLines);
    setInput("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      run(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(idx);
      setInput(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx === -1 ? "" : history[idx]);
    }
  }

  const lineColor: Record<string, string> = {
    input: "var(--green)",
    output: "var(--text)",
    error: "var(--red)",
    info: "var(--text3)",
  };

  return (
    <div
      style={{
        background: "var(--bg2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        <span style={{ marginLeft: 8, color: "var(--text3)", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
          devmate — demo shell
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12.5,
          lineHeight: 1.7,
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ color: lineColor[l.type] }}>
            {l.type === "input" ? (
              <span>
                <span style={{ color: "var(--green2)", marginRight: 8 }}>❯</span>
                {l.text}
              </span>
            ) : (
              <span style={{ paddingLeft: l.type === "error" ? 0 : 0 }}>
                {l.type === "error" && (
                  <span style={{ color: "var(--red)", marginRight: 4 }}>✗</span>
                )}
                {l.text}
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg3)",
        }}
      >
        <span style={{ color: "var(--green2)", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>❯</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="type a command…"
          autoFocus
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            caretColor: "var(--green)",
          }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"explorer" | "terminal">("explorer");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q && !selectedCat) return categories;
    return categories
      .filter((c) => !selectedCat || c.id === selectedCat)
      .map((cat) => ({
        ...cat,
        commands: cat.commands.filter(
          (cmd) =>
            !q ||
            cmd.cmd.toLowerCase().includes(q) ||
            cmd.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.commands.length > 0);
  }, [search, selectedCat]);

  const totalFiltered = filtered.reduce((a, c) => a + c.commands.length, 0);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          height: 56,
          flexShrink: 0,
          background: "var(--bg2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 700,
              fontSize: 16,
              color: "var(--green)",
              letterSpacing: "-0.5px",
            }}
          >
            DevMate
          </div>
          <span
            style={{
              background: "var(--surface)",
              color: "var(--text3)",
              fontSize: 10,
              fontFamily: "JetBrains Mono, monospace",
              padding: "2px 7px",
              borderRadius: 20,
              border: "1px solid var(--border)",
            }}
          >
            v3.0
          </span>
        </div>

        <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
          {(["explorer", "terminal"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? "var(--surface)" : "none",
                border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
                color: activeTab === tab ? "var(--text)" : "var(--text3)",
                padding: "4px 14px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: activeTab === tab ? 600 : 400,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s",
              }}
            >
              {tab === "terminal" && <TerminalIcon size={12} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            gap: 20,
            fontSize: 11,
            color: "var(--text3)",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {[
            { label: "commands", val: stats.commands + "+" },
            { label: "categories", val: stats.categories },
            { label: "aliases", val: stats.aliases + "+" },
          ].map((s) => (
            <span key={s.label}>
              <span style={{ color: "var(--green)", fontWeight: 700 }}>{s.val}</span>{" "}
              {s.label}
            </span>
          ))}
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {activeTab === "explorer" ? (
          <>
            {/* Sidebar */}
            <aside
              style={{
                width: 220,
                borderRight: "1px solid var(--border)",
                overflowY: "auto",
                background: "var(--bg2)",
                flexShrink: 0,
                padding: "12px 8px",
              }}
            >
              <div style={{ padding: "4px 8px 10px", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: 1 }}>
                Categories
              </div>
              <button
                onClick={() => setSelectedCat(null)}
                style={{
                  width: "100%",
                  background: selectedCat === null ? "var(--surface)" : "none",
                  border: selectedCat === null ? "1px solid var(--border)" : "1px solid transparent",
                  color: selectedCat === null ? "var(--text)" : "var(--text3)",
                  padding: "7px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🌐</span>
                <span>All Categories</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.id === selectedCat ? null : cat.id)}
                  style={{
                    width: "100%",
                    background: selectedCat === cat.id ? "var(--surface)" : "none",
                    border: selectedCat === cat.id ? `1px solid ${cat.color}33` : "1px solid transparent",
                    color: selectedCat === cat.id ? cat.color : "var(--text3)",
                    padding: "7px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                    marginBottom: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCat !== cat.id) {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCat !== cat.id) {
                      (e.currentTarget as HTMLButtonElement).style.color = "var(--text3)";
                      (e.currentTarget as HTMLButtonElement).style.background = "none";
                    }
                  }}
                >
                  <span>{cat.icon}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cat.name}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.6 }}>{cat.commands.length}</span>
                </button>
              ))}
            </aside>

            {/* Main content */}
            <main style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {/* Search */}
              <div style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    flex: 1,
                    position: "relative",
                    maxWidth: 500,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text3)",
                      pointerEvents: "none",
                    }}
                  >
                    <SearchIcon />
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search 700+ commands…"
                    style={{
                      width: "100%",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "9px 14px 9px 38px",
                      color: "var(--text)",
                      fontSize: 13,
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                    onFocus={(e) => ((e.target as HTMLInputElement).style.borderColor = "var(--green)")}
                    onBlur={(e) => ((e.target as HTMLInputElement).style.borderColor = "var(--border)")}
                  />
                </div>
                <span style={{ color: "var(--text3)", fontSize: 12, whiteSpace: "nowrap" }}>
                  {totalFiltered} commands
                </span>
                {(search || selectedCat) && (
                  <button
                    onClick={() => { setSearch(""); setSelectedCat(null); }}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text3)",
                      padding: "6px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Command grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                  gap: 16,
                }}
              >
                {filtered.map((cat) => (
                  <CategoryPanel key={cat.id} cat={cat} />
                ))}
              </div>

              {filtered.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text3)",
                    marginTop: 80,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div>No commands found for "{search}"</div>
                </div>
              )}
            </main>
          </>
        ) : (
          <div style={{ flex: 1, padding: 20 }}>
            <TerminalPanel />
          </div>
        )}
      </div>
    </div>
  );
}
