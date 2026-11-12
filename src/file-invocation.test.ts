import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileInvocation } from "./file-invocation";

test("filesystem commands never interpolate paths into shell strings", () => {
  expect(fileInvocation("ls", ["-test"])).toEqual({
    executable: "ls", argv: ["-la", "--", "-test"],
  });
  expect(fileInvocation("cat", ["a;echo bad"])).toEqual({
    executable: "cat", argv: ["--", "a;echo bad"],
  });
  expect(fileInvocation("mkdir", ["a$(touch marker)"])).toEqual({
    executable: "mkdir", argv: ["-p", "--", "a$(touch marker)"],
  });
  expect(fileInvocation("rm", ["-foo"])).toEqual({
    executable: "rm", argv: ["-rf", "--", "-foo"],
  });
  expect(fileInvocation("rmdir", ["-foo"])).toEqual({
    executable: "rm", argv: ["-d", "--", "-foo"],
  });
  expect(fileInvocation("cp", ["-src", "-dst"])).toEqual({
    executable: "cp", argv: ["-r", "--", "-src", "-dst"],
  });
  expect(fileInvocation("mv", ["-src", "-dst"])).toEqual({
    executable: "mv", argv: ["--", "-src", "-dst"],
  });
});

test("core CLI filesystem operations treat metacharacters literally", () => {
  const workspace = mkdtempSync(join(tmpdir(), "devmate-argv-"));
  try {
    const run = (...args: string[]) => execFileSync(
      process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args],
      {
        cwd: workspace,
        encoding: "utf8",
        timeout: 20000,
        env: { ...process.env, HOME: workspace, NO_COLOR: "1" },
      },
    );
    // This string would execute a shell command if put inside double quotes
    // in a shell-interpolated execSync call. Here it is a literal filename.
    const literalDir = 'folder$(touch${IFS}marker)';
    const literalFile = 'file$(touch${IFS}marker)';
    run("mkdir", literalDir);
    expect(existsSync(join(workspace, literalDir))).toBe(true);
    expect(existsSync(join(workspace, "marker"))).toBe(false);

    run("touch", literalFile);
    expect(existsSync(join(workspace, literalFile))).toBe(true);
    writeFileSync(join(workspace, literalFile), "safe-data");
    expect(run("cat", literalFile)).toContain("safe-data");
    expect(run("ls", literalFile)).toContain(literalFile);

    run("cp", literalFile, "copy-data");
    expect(readFileSync(join(workspace, "copy-data"), "utf8")).toBe("safe-data");
    run("mv", "copy-data", "moved-data");
    expect(readFileSync(join(workspace, "moved-data"), "utf8")).toBe("safe-data");
    run("rm", "moved-data");
    expect(existsSync(join(workspace, "moved-data"))).toBe(false);

    const invalidWhich = run("which", 'bun;touch${IFS}marker');
    expect(invalidWhich).toContain("not found");
    expect(existsSync(join(workspace, "marker"))).toBe(false);

    run("rmdir", literalDir);
    expect(existsSync(join(workspace, literalDir))).toBe(false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
