import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postWebhookJson, validateWebhookUrl, WebhookRequestError } from "./webhook-http";

type CapturedRequest = {
  url: string | undefined;
  contentType: string | undefined;
  body: unknown;
};

async function createMockWebhook() {
  const received: CapturedRequest[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let data = "";
    for await (const chunk of request) data += chunk.toString("utf8");
    received.push({
      url: request.url,
      contentType: request.headers["content-type"],
      body: JSON.parse(data),
    });
    response.statusCode = request.url?.startsWith("/failure") ? 422 : 204;
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No mock server port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    received,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

async function runCli(args: string[], cwd: string, env: Record<string, string>) {
  const child = spawn(process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args], {
    cwd,
    env: { ...process.env, HOME: cwd, NO_COLOR: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (data: Buffer) => { output += data.toString("utf8"); });
  child.stderr.on("data", (data: Buffer) => { errors += data.toString("utf8"); });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, output, errors };
}

test("native JSON webhook serializes quoted and Unicode text", async () => {
  const mock = await createMockWebhook();
  try {
    const text = 'hello "world" and apostrophe \' plus ✨ $(touch marker)';
    await postWebhookJson(mock.url + "/ok", { content: text });
    expect(mock.received).toEqual([{
      url: "/ok",
      contentType: "application/json",
      body: { content: text },
    }]);
  } finally {
    await mock.close();
  }
});

test("webhook URL validation and HTTP failures never reveal URL tokens", async () => {
  expect(() => validateWebhookUrl("file:///tmp/example")).toThrow(WebhookRequestError);
  expect(() => validateWebhookUrl("http://example.com/webhook")).toThrow(WebhookRequestError);
  expect(() => validateWebhookUrl("https://name:secret@example.com/hook")).toThrow(WebhookRequestError);
  const mock = await createMockWebhook();
  try {
    const secretUrl = mock.url + "/failure/super-secret-token";
    try {
      await postWebhookJson(secretUrl, { text: "error path" });
      throw Error("Expected HTTP failure");
    } catch (error) {
      expect(error).toBeInstanceOf(WebhookRequestError);
      expect((error as WebhookRequestError).status).toBe(422);
      expect((error as Error).message).not.toContain("super-secret-token");
      expect((error as Error).message).toContain("HTTP 422");
    }
  } finally {
    await mock.close();
  }
});

test("Discord and Slack CLI webhook commands use native JSON without a host shell", async () => {
  const mock = await createMockWebhook();
  const cwd = mkdtempSync(join(tmpdir(), "devmate-webhooks-"));
  try {
    const msg = 'quoted "text" with $(touch${IFS}sentinel) and Unicode 🔐';
    const env = {
      DISCORD_WEBHOOK: mock.url + "/discord-token",
      SLACK_WEBHOOK: mock.url + "/slack-token",
    };
    const cases: Array<{ args: string[]; expected: Record<string, string> }> = [
      { args: ["discord-send", msg], expected: { content: msg } },
      { args: ["slack-send", msg], expected: { text: msg } },
      { args: ["discord", msg], expected: { content: msg } },
      { args: ["slack", msg], expected: { text: msg } },
      { args: ["discord-webhook", mock.url + "/explicit-discord", msg], expected: { content: msg } },
      { args: ["slack-webhook", mock.url + "/explicit-slack", msg], expected: { text: msg } },
      { args: ["send", "discord", msg], expected: { content: msg } },
      { args: ["send", "slack", msg], expected: { text: msg } },
    ];
    for (const item of cases) {
      const before = mock.received.length;
      const result = await runCli(item.args, cwd, env);
      expect(result.code).toBe(0);
      expect(result.output + result.errors).toContain("Sent!");
      expect(mock.received.length).toBe(before + 1);
      expect(mock.received.at(-1)?.body).toEqual(item.expected);
      expect(existsSync(join(cwd, "sentinel"))).toBe(false);
    }
    const failed = await runCli(
      ["discord-send", "cannot-send"],
      cwd,
      { ...env, DISCORD_WEBHOOK: mock.url + "/failure/secret" },
    );
    expect(failed.output + failed.errors).toContain("Send failed");
    expect(failed.output + failed.errors).not.toContain("/failure/secret");
    expect(existsSync(join(cwd, "sentinel"))).toBe(false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await mock.close();
  }
}, 60_000);
