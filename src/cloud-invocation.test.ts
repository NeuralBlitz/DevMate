import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bedrockArguments, cloudInvocation } from "./cloud-invocation";

test("cloud argv keeps strings literally and copies arguments", () => {
  const payload = "resource;touch${IFS}marker";
  const args = ["s3", "ls", payload];
  const invocation = cloudInvocation("aws", args);
  expect(invocation).toEqual({ executable: "aws", argv: args });
  args.push("changed");
  expect(invocation.argv).toEqual(["s3", "ls", payload]);
});

test("Bedrock request JSON safely serializes prompts and leaves region literal", () => {
  const prompt = "say \"hello\"; touch${IFS}marker; \\ and \' apostrophe";
  const region = "us-east-1;touch${IFS}marker";
  const args = bedrockArguments(prompt, region);
  expect(args[0]).toBe("bedrock-runtime");
  expect(args[1]).toBe("invoke-model");
  expect(args[args.indexOf("--region") + 1]).toBe(region);
  expect(JSON.parse(args[args.indexOf("--body") + 1])).toEqual({
    messages: [{ role: "user", content: [{ text: prompt }] }],
    max_tokens: 2048,
  });
});

test("CLI cloud routes pass malicious-looking values as single arguments", () => {
  const dir = mkdtempSync(join(tmpdir(), "devmate-cloud-cli-"));
  const binDir = join(dir, "bin");
  mkdirSync(binDir);
  try {
    for (const executable of ["aws", "gcloud", "az"]) {
      const script = join(binDir, executable);
      writeFileSync(script,
        "#!/bin/sh\nprintf 'tool:" + executable + "\\n'\nfor arg in \"$@\"; do printf 'arg:%s\\n' \"$arg\"; done\n");
      chmodSync(script, 0o755);
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
          AWS_REGION: "us-east-1",
        },
      },
    );

    const payload = "name;touch${IFS}marker";
    const checks: Array<{ input: string[]; tool: string; tokens: string[] }> = [
      { input: ["aws", "s3", "ls", payload], tool: "aws", tokens: ["s3", "ls", payload] },
      { input: ["aws-cmd", "s3", "ls", payload], tool: "aws", tokens: ["s3", "ls", payload] },
      { input: ["s3cp", payload, "destination"], tool: "aws", tokens: ["s3", "cp", payload, "destination"] },
      { input: ["s3sync", payload, "destination"], tool: "aws", tokens: ["s3", "sync", payload, "destination"] },
      { input: ["aws-s3", "ls", payload], tool: "aws", tokens: ["s3", "ls", payload] },
      { input: ["aws-lambda", "list-functions", payload], tool: "aws", tokens: ["lambda", "list-functions", payload] },
      { input: ["gcloud", "compute", payload], tool: "gcloud", tokens: ["compute", payload] },
      { input: ["gcloud-cmd", "compute", payload], tool: "gcloud", tokens: ["compute", payload] },
      { input: ["gcloud-compute", "instances", payload], tool: "gcloud", tokens: ["compute", "instances", payload] },
      { input: ["az", "vm", payload], tool: "az", tokens: ["vm", payload] },
      { input: ["az-cmd", "vm", payload], tool: "az", tokens: ["vm", payload] },
      { input: ["az-vm", "list", payload], tool: "az", tokens: ["vm", "list", payload] },
    ];

    for (const item of checks) {
      const output = run(...item.input);
      expect(output).toContain(`tool:${item.tool}`);
      for (const token of item.tokens) expect(output).toContain(`arg:${token}`);
      expect(existsSync(join(dir, "marker"))).toBe(false);
    }

    const bedrock = run("bedrock", payload);
    expect(bedrock).toContain("tool:aws");
    expect(bedrock).toContain("arg:bedrock-runtime");
    const body = bedrock.split("\n").find((line) => line.startsWith('arg:{"messages":'));
    expect(body).toBeDefined();
    expect(JSON.parse(body!.slice(4)).messages[0].content[0].text).toBe(payload);
    expect(existsSync(join(dir, "marker"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
