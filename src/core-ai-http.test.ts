import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCoreAiRequest, type CoreAiProvider } from "./core-ai-http";
import { HttpClientError, requestHttp } from "./http-client";

async function localEndpoint() {
  const calls: Array<{ method?: string; headers: Record<string, string | string[] | undefined>; body: string }> = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString("utf8");
    calls.push({ method: req.method, headers: req.headers, body });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Local test port missing");
  return {
    url: `http://127.0.0.1:${address.port}/echo`,
    calls,
    close: () => new Promise<void>((resolve, reject) =>
      server.close(e => e ? reject(e) : resolve())),
  };
}

test("core AI provider requests preserve literal prompts and credential headers", async () => {
  const endpoint = await localEndpoint();
  const prompt = "quoted \"double\" and 'single'\n\t✨ $(touch${IFS}sentinel); echo no-shell";
  const env = {
    OPENAI_API_KEY: "openai-TEST-'$(touch${IFS}sentinel)",
    ANTHROPIC_API_KEY: "anthropic-test",
    GEMINI_API_KEY: "gemini-test",
    OPENAI_MODEL: "gpt-4.1-mini",
    ANTHROPIC_MODEL: "claude-sonnet-4-5",
    GEMINI_MODEL: "gemini-2.5-flash",
  };
  const cwd = mkdtempSync(join(tmpdir(), "devmate-ai-http-"));
  try {
    const providers: CoreAiProvider[] = ["openai", "anthropic", "gemini"];
    for (const provider of providers) {
      const options = buildCoreAiRequest(provider, prompt, env);
      expect(options.method).toBe("POST");
      expect(options.url.startsWith("https://")).toBe(true);
      expect(options.url).not.toContain("test");
      const body = JSON.parse(options.body);
      const text = provider === "gemini"
        ? body.contents[0].parts[0].text : body.messages[0].content;
      expect(text).toBe(prompt);
      const response = await requestHttp({ ...options, url: endpoint.url });
      expect(response.status).toBe(200);
      expect(endpoint.calls.at(-1)?.method).toBe("POST");
      expect(endpoint.calls.at(-1)?.body).toBe(options.body);
    }
    expect(endpoint.calls[0]?.headers.authorization).toBe("Bearer " + env.OPENAI_API_KEY);
    expect(endpoint.calls[1]?.headers["x-api-key"]).toBe(env.ANTHROPIC_API_KEY);
    expect(endpoint.calls[1]?.headers["anthropic-version"]).toBe("2023-06-01");
    expect(endpoint.calls[2]?.headers["x-goog-api-key"]).toBe(env.GEMINI_API_KEY);
    expect(endpoint.calls[2]?.headers.authorization).toBeUndefined();
    expect(existsSync(join(cwd, "sentinel"))).toBe(false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await endpoint.close();
  }
});

test("core AI requests reject invalid model IDs without exposing secrets", () => {
  expect(() => buildCoreAiRequest("openai", "hello", {})).toThrow(
    "Missing OPENAI_API_KEY",
  );
  expect(() => buildCoreAiRequest("gemini", "", { GEMINI_API_KEY: "hidden" }))
    .toThrow(HttpClientError);
  for (const model of ["bad/model", "quoted \" model", "bad$(touch /tmp/sentinel)"]) {
    try {
      buildCoreAiRequest("anthropic", "hello", {
        ANTHROPIC_API_KEY: "private-key-123", ANTHROPIC_MODEL: model,
      });
      throw Error("Expected invalid model");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpClientError);
      expect((e as Error).message).not.toContain("private-key-123");
    }
  }
  expect(() => buildCoreAiRequest("openai", "test", {
    OPENAI_API_KEY: "private",
  }, 100_000)).toThrow(HttpClientError);
});

test("all core AI CLI handlers are shell-free", () => {
  const source = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
  const gemini = source.split('case "gemini": case "google-ai":')[1]
    ?.split('case "google-auth":')[0];
  const core = source.split('case "openai": case "chatgpt":')[1]
    ?.split('case "huggingface": case "hf":')[0];
  expect(gemini).toBeDefined();
  expect(core).toBeDefined();
  expect(gemini).not.toContain("execSync");
  expect(core).not.toContain("execSync");
  expect(gemini).toContain('requestCoreAi("gemini"');
  expect(core).toContain('requestCoreAi("openai"');
  expect(core).toContain('requestCoreAi("anthropic"');
});

async function runCli(args: string[], cwd: string, env: Record<string, string>) {
  const child = spawn(process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args], {
    cwd, env: { ...process.env, HOME: cwd, NO_COLOR: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => output += data.toString());
  child.stderr.on("data", data => output += data.toString());
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, output };
}

test("CLI rejects unsafe model identifiers without invoking providers or leaking keys", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "devmate-ai-cli-"));
  try {
    const cases = [
      { cmd: "openai", key: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
      { cmd: "claude", key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
      { cmd: "gemini", key: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
      { cmd: "anthropic-api", key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
    ];
    for (const item of cases) {
      const output = await runCli([item.cmd, "hello"], cwd, {
        [item.key]: "secret-api-key-unique",
        [item.model]: "bad/model",
      });
      expect(output.code).toBe(0);
      expect(output.output).toContain("Invalid AI model identifier");
      expect(output.output).not.toContain("secret-api-key-unique");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 60_000);
