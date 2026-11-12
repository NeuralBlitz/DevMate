import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devopsInvocation } from "./devops-invocation";

test("Docker and Kubernetes command arguments are kept as exact argv tokens", () => {
  const payload = "pod;touch${IFS}marker";
  const input = ["logs", "-f", payload];
  expect(devopsInvocation("docker", input)).toEqual({ executable: "docker", argv: input });
  expect(devopsInvocation("kubectl", input)).toEqual({ executable: "kubectl", argv: input });
  input.push("other");
  expect(devopsInvocation("docker", ["get", payload]).argv).toEqual(["get", payload]);
});

test("CLI Docker and kubectl aliases do not execute shell metacharacters", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-devops-"));
  const binDir = join(dir, "bin");
  mkdirSync(binDir);
  try {
    for (const executable of ["docker", "kubectl"]) {
      const file = join(binDir, executable);
      const fake = "#!/bin/sh\nprintf 'tool:" + executable + "\\n'\nfor arg in \"$@\"; do printf 'arg:%s\\n' \"$arg\"; done\n";
      writeFileSync(file, fake);
      chmodSync(file, 0o755);
    }

    const run = (...args: string[]) => execFileSync(
      process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 20_000,
        env: {
          ...process.env,
          HOME: dir,
          NO_COLOR: "1",
          PATH: binDir + ":" + process.env.PATH,
        },
      },
    );

    const payload = "pod;touch${IFS}marker";
    const checks: Array<{ input: string[]; tool: string; tokens: string[] }> = [
      { input: ["docker", "logs", payload], tool: "docker", tokens: ["logs", payload] },
      { input: ["dlogs", payload], tool: "docker", tokens: ["logs", "--tail", "50", "-f", payload] },
      { input: ["dex", payload, "echo", "hello"], tool: "docker", tokens: ["exec", "-it", payload, "echo", "hello"] },
      { input: ["dc", "ps", payload], tool: "docker", tokens: ["compose", "ps", payload] },
      { input: ["docker-build", payload], tool: "docker", tokens: ["build", "-t", payload, "."] },
      { input: ["dexec", payload, "echo", "hello"], tool: "docker", tokens: ["exec", "-it", payload, "echo", "hello"] },
      { input: ["kubectl", "logs", payload], tool: "kubectl", tokens: ["logs", payload] },
      { input: ["k", "get", "pods", payload], tool: "kubectl", tokens: ["get", "pods", payload] },
      { input: ["kd", "pod", payload], tool: "kubectl", tokens: ["describe", "pod", payload] },
      { input: ["kl", payload], tool: "kubectl", tokens: ["logs", "-f", payload] },
      { input: ["k-logs", payload], tool: "kubectl", tokens: ["logs", "-f", payload] },
      { input: ["k-exec", payload, "echo", "hello"], tool: "kubectl", tokens: ["exec", "-it", payload, "--", "echo", "hello"] },
      { input: ["k-quick", "get", payload], tool: "kubectl", tokens: ["get", payload] },
      { input: ["d-quick", "ps", payload], tool: "docker", tokens: ["ps", payload] },
      { input: ["dbuild", payload], tool: "docker", tokens: ["build", "-t", `myapp:${payload}`, "."] },
      { input: ["drun", payload, "8080"], tool: "docker", tokens: ["run", "-d", "-p", "8080:8080", "--name", payload, payload] },
      { input: ["dshell", payload], tool: "docker", tokens: ["exec", "-it", payload, "/bin/sh"] },
      { input: ["kapply", payload], tool: "kubectl", tokens: ["apply", "-f", payload] },
      { input: ["kdelete", "pod", payload], tool: "kubectl", tokens: ["delete", "pod", payload] },
      { input: ["klogsf", payload], tool: "kubectl", tokens: ["logs", "-f", payload] },
      { input: ["kexec", payload, "echo", "hello"], tool: "kubectl", tokens: ["exec", "-it", payload, "--", "echo", "hello"] },
      { input: ["kpf", payload, "1111", "2222"], tool: "kubectl", tokens: ["port-forward", payload, "1111:2222"] },
      { input: ["kns", payload], tool: "kubectl", tokens: ["config", "set-context", "--current", `--namespace=${payload}`] },
      { input: ["kdebug", payload], tool: "kubectl", tokens: ["debug", "-it", payload, "--image=busybox", "--share-processes=true"] },
      { input: ["docker-push", payload], tool: "docker", tokens: ["push", payload] },
      { input: ["docker-swarm", "join", payload], tool: "docker", tokens: ["swarm", "join", payload] },
    ];
    for (const item of checks) {
      const output = run(...item.input);
      expect(output).toContain(`tool:${item.tool}`);
      for (const token of item.tokens) {
        expect(output).toContain(`arg:${token}`);
      }
      expect(existsSync(join(dir, "marker"))).toBe(false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
