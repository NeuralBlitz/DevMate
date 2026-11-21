import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callTelegramBot, sendTelegramDocument, sendTelegramMessage, TelegramRequestError,
} from "./telegram-http";

const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg";

async function mockTelegram() {
  const received: Array<{ path: string | undefined; type: string | undefined; body: string }> = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const data of req) body += data.toString("utf8");
    received.push({ path: req.url, type: req.headers["content-type"], body });
    res.setHeader("content-type", "application/json");
    if (req.url?.endsWith("/fail")) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, description: "secret-details" }));
    } else if (req.url?.endsWith("/rejected")) {
      res.end(JSON.stringify({ ok: false, description: "secret-details" }));
    } else {
      res.end(JSON.stringify({ ok: true, result: { message_id: 123 } }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("Mock server port unavailable");
  return {
    base: `http://127.0.0.1:${addr.port}`,
    received,
    close: () => new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())),
  };
}

test("Telegram native POST preserves quotes, Unicode and metacharacters", async () => {
  const mock = await mockTelegram();
  try {
    const msg = "literal \" ' ✨ $(touch${IFS}sentinel)";
    await sendTelegramMessage(TOKEN, "@team_updates", msg, mock.base);
    expect(mock.received[0].path).toBe(`/bot${TOKEN}/sendMessage`);
    expect(mock.received[0].type).toContain("application/json");
    expect(JSON.parse(mock.received[0].body)).toEqual({
      chat_id: "@team_updates", text: msg,
    });
  } finally {
    await mock.close();
  }
});

test("Telegram native multipart upload treats file paths as data", async () => {
  const mock = await mockTelegram();
  const cwd = mkdtempSync(join(tmpdir(), "devmate-telegram-"));
  const source = join(cwd, "report-$(touch${IFS}sentinel).txt");
  writeFileSync(source, "secret document ✨");
  try {
    await sendTelegramDocument(TOKEN, "-100123", source, mock.base);
    expect(mock.received[0].path).toBe(`/bot${TOKEN}/sendDocument`);
    expect(mock.received[0].type).toContain("multipart/form-data; boundary=");
    expect(mock.received[0].body).toContain('name="chat_id"');
    expect(mock.received[0].body).toContain("-100123");
    expect(mock.received[0].body).toContain('name="document"');
    expect(mock.received[0].body).toContain("secret document");
    expect(existsSync(join(cwd, "sentinel"))).toBe(false);
    expect(readFileSync(source, "utf-8")).toBe("secret document ✨");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    await mock.close();
  }
});

test("Telegram bot methods restrict paths and sanitize API errors", async () => {
  const mock = await mockTelegram();
  try {
    expect(await callTelegramBot(TOKEN, "getMe", {}, mock.base)).toEqual({ message_id: 123 });
    for (const method of ["../secret", "getMe;touch", "/getMe"]) {
      await expect(callTelegramBot(TOKEN, method, {}, mock.base))
        .rejects.toThrow("Invalid Telegram API method");
    }
    await expect(callTelegramBot("bad-token", "getMe", {}, mock.base))
      .rejects.toThrow("Invalid Telegram bot token");
    await expect(callTelegramBot(TOKEN, "getMe", {}, "https://evil.example"))
      .rejects.toThrow("Invalid Telegram API endpoint");
    for (const method of ["fail", "rejected"]) {
      try {
        await callTelegramBot(TOKEN, method, {}, mock.base);
        throw Error("Expected Telegram API rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(TelegramRequestError);
        expect((error as Error).message).not.toContain(TOKEN);
        expect((error as Error).message).not.toContain("secret-details");
      }
    }
  } finally {
    await mock.close();
  }
});

test("CLI Telegram dispatchers no longer use interpolated curl shells", () => {
  const source = readFileSync(join(import.meta.dir, "index.ts"), "utf-8");
  const telegramCases = source.slice(
    source.indexOf('    case "telegram":'),
    source.indexOf('    case "discord": case "discord-msg":'),
  );
  expect(telegramCases).toContain("sendTelegramMessage");
  expect(telegramCases).toContain("sendTelegramDocument");
  expect(telegramCases).toContain("callTelegramBot");
  expect(telegramCases).not.toContain("execSync(");
  expect(telegramCases).not.toContain("curl");
  expect(source).not.toContain("api.telegram.org");
  expect(source).toContain("await sendTelegramMessage(token, chatId, msg)");
  expect(source).toContain("await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, msg)");
});
