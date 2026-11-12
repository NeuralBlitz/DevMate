import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpClientError, normalizeCliBody, requestHttp } from "./http-client";

type Received = {
  method: string | undefined;
  url: string | undefined;
  body: string;
  contentType: string | undefined;
};

async function startMockApi() {
  const received: Received[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString("utf8");
    received.push({
      method: req.method, url: req.url, body,
      contentType: req.headers["content-type"],
    });
    res.setHeader("content-type", "application/json");
    res.statusCode = req.url?.startsWith("/missing") ? 404 : 200;
    res.end(JSON.stringify({ ok: res.statusCode === 200, length: body.length }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Mock API port unavailable");
  return {
    url: `http://127.0.0.1:${address.port}`,
    received,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

async function runCli(args: string[], cwd: string) {
  const child = spawn(process.execPath, ["run", join(import.meta.dir, "index.ts"), ...args], {
    cwd, env: { ...process.env, HOME: cwd, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (data: Buffer) => output += data.toString("utf8"));
  child.stderr.on("data", (data: Buffer) => errors += data.toString("utf8"));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, output: output + errors };
}

test("normalizes shell-style outer quotes without altering JSON content", () => {
  expect(normalizeCliBody(undefined)).toBeUndefined();
  expect(normalizeCliBody(`'{"message":"hello \\"quoted\\""}'`))
    .toBe('{"message":"hello \\"quoted\\""}');
  expect(normalizeCliBody('{"ok":true}')).toBe('{"ok":true}');
});

test("HTTP transport preserves raw request data, statuses and response limits", async () => {
  const mock = await startMockApi();
  try {
    const payload = JSON.stringify({ msg: 'hello \' " ✨ $(touch marker)' });
    const response = await requestHttp({
      method: "POST", url: mock.url + "/ok",
      body: payload,
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.text).ok).toBe(true);
    expect(mock.received[0]).toMatchObject({
      method: "POST", url: "/ok", body: payload,
      contentType: "application/json",
    });
    const missing = await requestHttp({ method: "GET", url: mock.url + "/missing" });
    expect(missing.status).toBe(404);
    await expect(requestHttp({
      method: "GET", url: mock.url + "/ok", maxBytes: 8,
    })).rejects.toThrow("HTTP response exceeds configured size limit");
  } finally {
    await mock.close();
  }
});

test("HTTP transport rejects invalid methods and URLs without disclosing secrets", async () => {
  await expect(requestHttp({ method: "TRACE", url: "https://example.com" }))
    .rejects.toThrow(HttpClientError);
  for (const url of [
    "file:///tmp/secret",
    "https://user:secret@example.com/api",
    "not-a-url-with-secret",
  ]) {
    try {
      await requestHttp({ method: "GET", url });
      throw Error("Expected URL rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpClientError);
      expect((error as Error).message).not.toContain("secret");
    }
  }
});

test("CLI API and GraphQL commands use native HTTP and preserve payloads", async () => {
  const mock = await startMockApi();
  const cwd = mkdtempSync(join(tmpdir(), "devmate-api-"));
  try {
    const raw = '{"message":"quotes \\"inside\\" and $(touch${IFS}sentinel) ✨"}';
    const get = await runCli(["api", "GET", mock.url + "/ok"], cwd);
    expect(get.code).toBe(0);
    expect(get.output).toContain("Status: 200");
    const implicitGet = await runCli(["api", mock.url + "/ok"], cwd);
    expect(implicitGet.output).toContain("Status: 200");

    const posted = await runCli(["api", "POST", mock.url + "/json", `'${raw}'`], cwd);
    expect(posted.output).toContain("Status: 200");
    expect(mock.received.at(-1)?.body).toBe(raw);
    expect(JSON.parse(mock.received.at(-1)!.body).message).toContain("sentinel");

    const query = 'query Example { viewer { login } } $(touch${IFS}sentinel)';
    const gql = await runCli(["gql", mock.url + "/graphql", `'${query}'`], cwd);
    expect(gql.output).toContain("Status: 200");
    expect(JSON.parse(mock.received.at(-1)!.body)).toEqual({ query });

    const status = await runCli(["api", "GET", mock.url + "/missing"], cwd);
    expect(status.output).toContain("Status: 404");
    expect(existsSync(join(cwd, "sentinel"))).toBe(false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await mock.close();
  }
}, 60_000);
