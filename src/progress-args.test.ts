import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProgressArguments } from "./progress-args";

test("accepts safe decimal integers including zero or out-of-range progress", () => {
  expect(parseProgressArguments(["0", "10"])).toEqual({ ok: true, current: 0, total: 10 });
  expect(parseProgressArguments(["15", "10"])).toEqual({ ok: true, current: 15, total: 10 });
  expect(parseProgressArguments(["-3", "+10"])).toEqual({ ok: true, current: -3, total: 10 });
});

test("requires exactly two arguments", () => {
  for (const args of [[], ["5"], ["5", "10", "extra"]]) {
    expect(parseProgressArguments(args).ok).toBe(false);
  }
});

test("rejects partially numeric and non-decimal formats", () => {
  for (const value of ["12abc", "1.5", "1e2", "0x10", "NaN", "Infinity", "", "--1"]) {
    expect(parseProgressArguments([value, "10"]).ok).toBe(false);
  }
});

test("rejects zero, negative and unsafe totals", () => {
  expect(parseProgressArguments(["1", "0"])).toEqual({
    ok: false, error: "Total must be greater than zero.",
  });
  expect(parseProgressArguments(["1", "-3"]).ok).toBe(false);
  expect(parseProgressArguments(["1", "9007199254740992"]).ok).toBe(false);
  expect(parseProgressArguments(["9007199254740992", "10"]).ok).toBe(false);
});

test("CLI rejects malformed progress input without crashing", () => {
  const home = mkdtempSync(join(tmpdir(), "devmate-progress-"));
  try {
    const options = {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8" as const,
      timeout: 20000,
      env: { ...process.env, HOME: home, NO_COLOR: "1" },
    };
    const invalid = execFileSync(process.execPath, [
      "run", "src/index.ts", "progress", "12abc", "100",
    ], options);
    expect(invalid).toContain("Invalid progress arguments:");
    expect(invalid).toContain("Usage: progress");

    const valid = execFileSync(process.execPath, [
      "run", "src/index.ts", "progress", "4", "10",
    ], options);
    expect(valid).toContain("40%");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
