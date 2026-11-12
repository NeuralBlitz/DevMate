import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitInvocation } from "./git-invocation";

test("Git forwarding retains separate argv tokens", () => {
  const args = ["commit", "-m", "message;touch${IFS}marker"];
  const mapped = gitInvocation(args);
  expect(mapped).toEqual({ executable: "git", argv: args });
  args.push("extra");
  expect(mapped.argv).toEqual(["commit", "-m", "message;touch${IFS}marker"]);
});

test("Git CLI routes never pass user arguments through the host shell", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-git-argv-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const trace = join(dir, "git-args.log");
  try {
    const script = join(bin, "git");
    writeFileSync(script, "#!/bin/sh\n: \"${GIT_TRACE_LOG:?}\"\n" +
      "printf 'arg:%s\\n' \"$@\" > \"$GIT_TRACE_LOG\"\n");
    chmodSync(script, 0o755);

    const run = (...args: string[]) => {
      const output = execFileSync(
        process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args],
        {
          cwd: dir, encoding: "utf8", timeout: 20_000,
          env: { ...process.env, HOME: dir, NO_COLOR: "1",
            PATH: bin + ":" + process.env.PATH, GIT_TRACE_LOG: trace },
        },
      );
      return { output, observed: readFileSync(trace, "utf8") };
    };
    const payload = "branch;touch${IFS}marker";
    const commands: Array<{ input: string[]; expected: string[] }> = [
      { input: ["git", "status", payload], expected: ["status", payload] },
      { input: ["g", "status", payload], expected: ["status", payload] },
      { input: ["gclone", payload, "destination"], expected: ["clone", payload, "destination"] },
      { input: ["gamend", payload], expected: ["commit", "--amend", "-m", payload] },
      { input: ["gcp", payload], expected: ["cherry-pick", payload] },
      { input: ["gtag", payload], expected: ["tag", payload] },
      { input: ["gbranch", payload, "-d"], expected: ["branch", "-d", payload] },
      { input: ["grebase", payload], expected: ["rebase", "-i", payload] },
      { input: ["git-commit-quick", payload], expected: ["commit", "-m", payload] },
      { input: ["commit", payload], expected: ["commit", "-m", payload] },
      { input: ["checkout", payload], expected: ["checkout", payload] },
      { input: ["add", payload], expected: ["add", payload] },
      { input: ["git-force", payload], expected: ["reset", "--hard", `origin/${payload}`] },
    ];
    for (const entry of commands) {
      const result = run(...entry.input);
      const lines = result.observed.trimEnd().split("\n");
      expect(lines).toEqual(entry.expected.map((arg) => `arg:${arg}`));
      expect(existsSync(join(dir, "marker"))).toBe(false);
    }

    const folder = "repo$(touch${IFS}marker)";
    const initialized = run("git-init", folder);
    expect(initialized.observed).toBe("arg:init\n");
    expect(existsSync(join(dir, folder))).toBe(true);
    expect(existsSync(join(dir, "marker"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
