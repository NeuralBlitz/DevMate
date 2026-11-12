import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aliases, resolveAlias } from "./aliases";

test("built-in aliases expand to their intended commands", () => {
  expect(resolveAlias("gs")).toBe("git status");
  expect(resolveAlias("ll /tmp")).toBe("ls -la /tmp");
  expect(resolveAlias("gcm 'message here'")).toBe("git commit -m 'message here'");
});

test("alias matching ignores command case but preserves arguments", () => {
  expect(resolveAlias("GS --short")).toBe("git status --short");
  expect(resolveAlias("  npmb  ")).toBe("npmb");
  expect(resolveAlias("git status")).toBe("git status");
});

test("custom aliases override defaults without mutating them", () => {
  expect(resolveAlias("gs -sb", { gs: "git status --branch" })).toBe("git status --branch -sb");
  expect(resolveAlias("gs")).toBe("git status");
  expect(aliases.gs).toBe("git status");
});

test("unknown and inherited object properties do not expand", () => {
  expect(resolveAlias("constructor")).toBe("constructor");
  expect(resolveAlias("toString --help")).toBe("toString --help");
  expect(resolveAlias("")).toBe("");
  expect(resolveAlias("gs", { gs: 42 })).toBe("gs");
});

test("CLI version command starts and exits successfully", () => {
  const home = mkdtempSync(join(tmpdir(), "devmate-test-"));
  try {
    const stdout = execFileSync(process.execPath, ["run", "src/index.ts", "--version"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
      timeout: 20000,
      env: { ...process.env, HOME: home, NO_COLOR: "1" },
    });
    expect(stdout).toContain("DevMate v3.0.0");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
