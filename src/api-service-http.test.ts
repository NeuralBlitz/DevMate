import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApiServiceRequest } from "./api-service-http";
import { HttpClientError } from "./http-client";

async function mockApi() {
  const received: Array<{ method?: string; path?: string; auth?: string; body: string }> = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString("utf8");
    received.push({
      method: req.method, path: req.url, auth: req.headers.authorization, body,
    });
    res.setHeader("content-type", "application/json");
    res.statusCode = req.url?.startsWith("/missing") ? 404 : 200;
    res.end(JSON.stringify({ ok: res.statusCode === 200, bodyLength: body.length }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Mock port unavailable");
  return {
    url: `http://127.0.0.1:${address.port}`,
    received,
    close: () => new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())),
  };
}

async function runCli(args: string[], cwd: string, env: Record<string, string> = {}) {
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

test("service presets assign provider-specific authorization without shell arguments", () => {
  const anthropic = buildApiServiceRequest(
    "anthropic", "/messages", "POST", '{"prompt":"quoted"}',
    { ANTHROPIC_API_KEY: "test-anthropic-token" },
  );
  expect(anthropic.headers["x-api-key"]).toBe("test-anthropic-token");
  expect(anthropic.headers.authorization).toBeUndefined();
  expect(anthropic.headers["anthropic-version"]).toBe("2023-06-01");
  expect(anthropic.body).toBe('{"prompt":"quoted"}');

  const stripe = buildApiServiceRequest("stripe", "/customers", "GET", undefined,
    { STRIPE_API_KEY: "sk_test_123" });
  expect(stripe.headers.authorization).toBe(
    "Basic " + Buffer.from("sk_test_123:").toString("base64"),
  );

  const shopify = buildApiServiceRequest("shopify", "/orders.json", "GET", undefined,
    { SHOPIFY_TOKEN: "access-token" });
  expect(shopify.headers["X-Shopify-Access-Token"]).toBe("access-token");

  const notion = buildApiServiceRequest("notion", "/users", "GET", undefined,
    { NOTION_TOKEN: "notion-token" });
  expect(notion.headers["Notion-Version"]).toBe("2022-06-28");
  expect(notion.headers.authorization).toBe("Bearer notion-token");

  const jira = buildApiServiceRequest("jira", "/issue", "GET", undefined, {
    JIRA_URL: "https://jira.example.com/rest/api/3",
    JIRA_EMAIL: "developer@example.com",
    JIRA_TOKEN: "jira-token",
  });
  expect(jira.headers.authorization).toBe(
    "Basic " + Buffer.from("developer@example.com:jira-token").toString("base64"),
  );
  expect(jira.url).toBe("https://jira.example.com/rest/api/3/issue");
});

test("service endpoints reject scheme changes, credentials and invalid methods", () => {
  for (const endpoint of ["//evil.example/steal", "https://evil.example/steal", "file:///etc/passwd"]) {
    expect(() => buildApiServiceRequest("github", endpoint)).toThrow(HttpClientError);
  }
  expect(() => buildApiServiceRequest("jira", "/issue", "GET", undefined,
    { JIRA_URL: "http://remote.example/api" })).toThrow(HttpClientError);
  expect(() => buildApiServiceRequest("jira", "/issue", "GET", undefined,
    { JIRA_URL: "https://name:secret@remote.example/api" })).toThrow(HttpClientError);
  expect(() => buildApiServiceRequest("github", "/users", "TRACE")).toThrow(HttpClientError);
  expect(() => buildApiServiceRequest("unknown", "/api")).toThrow(HttpClientError);
});

test("CLI API service and saved favorites use native HTTP, retaining literal payloads", async () => {
  const api = await mockApi();
  const cwd = mkdtempSync(join(tmpdir(), "devmate-preset-"));
  try {
    const payload = JSON.stringify({
      message: "quotes ' \" ✨ $(touch${IFS}sentinel)",
    });
    const env = {
      JIRA_URL: api.url + "/api",
      JIRA_TOKEN: "token-with-'$(touch${IFS}sentinel)",
    };
    const service = await runCli(
      ["api-service", "jira", "/records", "POST", "'" + payload + "'"], cwd, env,
    );
    expect(service.code).toBe(0);
    expect(service.output).toContain("Status: 200");
    expect(api.received[0]).toEqual({
      method: "POST",
      path: "/api/records",
      auth: "Bearer " + env.JIRA_TOKEN,
      body: payload,
    });

    mkdirSync(join(cwd, ".devmate"), { recursive: true });
    writeFileSync(join(cwd, ".devmate", "api_favorites.json"), JSON.stringify({
      safe: {
        method: "POST",
        url: api.url + "/saved?token=private-query-token",
        body: "'" + payload + "'",
      },
      blocked: { method: "GET", url: "file:///tmp/private-secret" },
    }));
    const favorite = await runCli(["api-run", "safe"], cwd);
    expect(favorite.code).toBe(0);
    expect(favorite.output).toContain("Status: 200");
    expect(favorite.output).not.toContain("private-query-token");
    expect(api.received[1]).toMatchObject({
      method: "POST",
      path: "/saved?token=private-query-token",
      body: payload,
    });
    const blocked = await runCli(["api-run", "blocked"], cwd);
    expect(blocked.output).toContain("Invalid HTTP URL");
    expect(blocked.output).not.toContain("private-secret");
    expect(existsSync(join(cwd, "sentinel"))).toBe(false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await api.close();
  }
}, 60_000);
