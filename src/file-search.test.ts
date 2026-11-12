import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileSearchInvocation, runFileSearch } from "./file-search";

test("file search and content search pass user patterns as literal argv", () => {
  expect(fileSearchInvocation({ kind: "files", pattern: 'x$(touch${IFS}marker)' })).toEqual({
    executable: "find",
    argv: [".", "-name", '*x$(touch${IFS}marker)*', "-type", "f", "-print"],
  });
  expect(fileSearchInvocation({ kind: "directories", pattern: 'safe";echo' })).toEqual({
    executable: "find",
    argv: [".", "-name", '*safe";echo*', "-type", "d", "-print"],
  });
  expect(fileSearchInvocation({ kind: "extension", extension: "txt", name: "report" })).toEqual({
    executable: "find", argv: [".", "-name", "*report*.txt", "-print"],
  });
  const grep = fileSearchInvocation({ kind: "content", pattern: 'a";touch marker;echo "' });
  expect(grep.executable).toBe("grep");
  expect(grep.argv).toContain('a";touch marker;echo "');
  expect(grep.argv).toContain("-e");
});

test("recent and size searches reject malformed predicates", () => {
  expect(fileSearchInvocation({ kind: "recent", days: "7" }).argv).toEqual([
    ".", "-type", "f", "-mtime", "-7", "-ls",
  ]);
  expect(fileSearchInvocation({ kind: "size", limit: "1M" }).argv).toEqual([
    ".", "-type", "f", "-size", "+1M", "-ls",
  ]);
  for (const value of ["0", "-2", "1;touch marker", "1.5", "Infinity", "9007199254740992"]) {
    expect(() => fileSearchInvocation({ kind: "recent", days: value })).toThrow(RangeError);
  }
  for (const value of ["2;touch marker", "-1M", "3TB", "4.5M", "NaN", "9007199254740992M"]) {
    expect(() => fileSearchInvocation({ kind: "size", limit: value })).toThrow(RangeError);
  }
});

test("search output can be truncated without invoking a shell", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-search-helper-"));
  try {
    writeFileSync("first-match.txt", "hello");
    writeFileSync("second-match.txt", "hello");
    const result = runFileSearch({ kind: "files", pattern: "match" }, { maxLines: 1, cwd: dir });
    expect(result.split("\n")).toHaveLength(1);
    expect(result).toContain("match");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI searches do not execute shell substitutions or embedded statements", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-search-cli-"));
  try {
    const run = (...args: string[]) => execFileSync(
      process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args],
      { cwd: dir, encoding: "utf8", timeout: 20_000,
        env: { ...process.env, HOME: dir, NO_COLOR: "1" } },
    );

    const payload = 'safe$(touch${IFS}marker)';
    const file = `${payload}.txt`;
    writeFileSync(join(dir, file), "hello");
    mkdirSync(join(dir, payload));
    expect(run("find-files", payload)).toContain(file);
    expect(run("find-dirs", payload)).toContain(payload);
    expect(run("find-ext", "txt", payload)).toContain(file);
    expect(existsSync(join(dir, "marker"))).toBe(false);

    const content = 'needle";touch marker;echo "';
    writeFileSync(join(dir, "content.ts"), content + "\n");
    expect(run("search", content)).toContain(content);
    expect(existsSync(join(dir, "marker"))).toBe(false);

    expect(run("recent", "1;touch${IFS}marker")).toContain("Days must be a positive integer");
    expect(run("size", "2;touch${IFS}marker")).toContain("Size must be an integer");
    expect(existsSync(join(dir, "marker"))).toBe(false);

    expect(run("recent", "7")).toContain("Files modified in last 7 days");
    expect(run("size", "0c")).toContain("Files larger than 0c");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
