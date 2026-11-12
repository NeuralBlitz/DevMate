import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countLinesByExtension, hashFile } from "./file-metrics";

test("count matches wc newline semantics over multiple files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-lines-"));
  try {
    writeFileSync(join(dir, "one.txt"), "a\nb\n");
    writeFileSync(join(dir, "two.txt"), "c\n");
    writeFileSync(join(dir, "unterminated.txt"), "not a newline");
    writeFileSync(join(dir, "file\nwith-newline.txt"), "d\n");
    writeFileSync(join(dir, "other.js"), "e\n");
    expect(await countLinesByExtension("txt", dir)).toBe(4);
    expect(await countLinesByExtension("js", dir)).toBe(1);
    expect(await countLinesByExtension("absent", dir)).toBe(0);
    expect(await countLinesByExtension("*", dir)).toBe(5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hash reads literal filenames and validates algorithms", async () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-hash-"));
  try {
    const file = join(dir, 'report$(touch${IFS}marker).txt');
    writeFileSync(file, "known-data");
    const expectedSha = createHash("sha256").update("known-data").digest("hex");
    const expectedMd5 = createHash("md5").update("known-data").digest("hex");
    expect(await hashFile(file)).toBe(expectedSha);
    expect(await hashFile(file, "md5")).toBe(expectedMd5);
    expect(existsSync(join(dir, "marker"))).toBe(false);
    await expect(hashFile(file, "sha256;touch${IFS}marker")).rejects.toThrow(RangeError);
    expect(existsSync(join(dir, "marker"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI count and hash reject shell metacharacters without executing them", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-metrics-cli-"));
  try {
    const run = (...args: string[]) => execFileSync(
      process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args],
      { cwd: dir, encoding: "utf8", timeout: 20_000,
        env: { ...process.env, HOME: dir, NO_COLOR: "1" } },
    );
    const filename = 'report$(touch${IFS}marker).txt';
    writeFileSync(join(dir, filename), "hello\nworld\n");
    expect(run("count", "txt")).toContain("Total lines in .txt files: 2");
    expect(run("count", 'txt";touch${IFS}marker;echo"')).toContain("Total lines in");
    expect(existsSync(join(dir, "marker"))).toBe(false);

    const expected = createHash("sha256").update("hello\nworld\n").digest("hex");
    expect(run("hash", filename)).toContain(`SHA256: ${expected}`);
    expect(run("hash", filename, "sha256;touch${IFS}marker"))
      .toContain("Unsupported hash algorithm");
    expect(existsSync(join(dir, "marker"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
