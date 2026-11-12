import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { externalInvocation } from "./external-command";

test("external commands preserve argument boundaries and do not mutate inputs", () => {
  const args = ["install", "name;touch${IFS}marker"];
  const mapped = externalInvocation("npm", args);
  expect(mapped).toEqual({ executable: "npm", argv: args });
  args.push("new");
  expect(mapped.argv).toEqual(["install", "name;touch${IFS}marker"]);
  expect(externalInvocation("grep", ["-rn", "a|b"])).toEqual({
    executable: "grep", argv: ["-rn", "a|b"],
  });
});

test("CLI external forwarding treats shell operators as literal argv", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-external-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  try {
    const executables = [
      "npm", "grep", "awk", "uv", "sam", "ocaml", "kustomize", "dust",
    ];
    for (const executable of executables) {
      const path = join(bin, executable);
      writeFileSync(path, "#!/bin/sh\nprintf 'tool:" + executable +
        "\\n'\nfor arg in \"$@\"; do printf 'arg:%s\\n' \"$arg\"; done\n");
      chmodSync(path, 0o755);
    }
    const run = (...args: string[]) => execFileSync(
      process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args],
      { cwd: dir, encoding: "utf8", timeout: 20_000,
        env: { ...process.env, HOME: dir, NO_COLOR: "1", PATH: bin + ":" + process.env.PATH } },
    );

    const payload = "name;touch${IFS}marker";
    const checks: Array<{ command: string[]; tool: string; argv: string[] }> = [
      { command: ["npm", "install", payload], tool: "npm", argv: ["install", payload] },
      { command: ["npmi", payload], tool: "npm", argv: ["install", payload] },
      { command: ["grep", payload, "."], tool: "grep", argv: [payload, "."] },
      { command: ["awk", payload], tool: "awk", argv: [payload] },
      { command: ["uv", "pip", payload], tool: "uv", argv: ["pip", payload] },
      { command: ["sam", "deploy", payload], tool: "sam", argv: ["deploy", payload] },
      { command: ["ocaml", payload], tool: "ocaml", argv: [payload] },
      { command: ["kustomize", "build", payload], tool: "kustomize", argv: ["build", payload] },
      { command: ["dust", payload], tool: "dust", argv: [payload] },
    ];
    for (const item of checks) {
      const output = run(...item.command);
      expect(output).toContain(`tool:${item.tool}`);
      for (const arg of item.argv) expect(output).toContain(`arg:${arg}`);
      expect(existsSync(join(dir, "marker"))).toBe(false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
