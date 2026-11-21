/** Native Telegram Bot API transport. Never execute curl or expose bot tokens in process argv. */
import { basename } from "node:path";

export class TelegramRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "TelegramRequestError";
  }
}

const TELEGRAM_API = "https://api.telegram.org";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** The optional base is exclusively for loopback Bot API servers and tests. */
function telegramEndpoint(token: string, method: string, base = TELEGRAM_API): string {
  if (!/^\d+:[a-zA-Z0-9_-]+$/.test(token)) {
    throw new TelegramRequestError("Invalid Telegram bot token");
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(method)) {
    throw new TelegramRequestError("Invalid Telegram API method");
  }
  let root: URL;
  try { root = new URL(base); }
  catch { throw new TelegramRequestError("Invalid Telegram API endpoint"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(root.hostname);
  if (!(root.origin === TELEGRAM_API || (root.protocol === "http:" && loopback)) ||
      root.username || root.password || root.search || root.hash || root.pathname !== "/") {
    throw new TelegramRequestError("Invalid Telegram API endpoint");
  }
  return new URL(`/bot${token}/${method}`, root).toString();
}

async function telegramPost(
  token: string, method: string, payload: Record<string, unknown> | FormData,
  base?: string,
): Promise<unknown> {
  const url = telegramEndpoint(token, method, base);
  const multipart = payload instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: multipart ? undefined : { "content-type": "application/json" },
      body: multipart ? payload : JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new TelegramRequestError("Telegram request failed (network, redirect or timeout)");
  }
  if (!response.ok) {
    throw new TelegramRequestError(`Telegram request failed (HTTP ${response.status})`, response.status);
  }
  let content = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new TelegramRequestError("Telegram response exceeds size limit");
        }
        content += decoder.decode(value, { stream: true });
      }
      content += decoder.decode();
    }
  } catch (error) {
    if (error instanceof TelegramRequestError) throw error;
    throw new TelegramRequestError("Telegram response could not be read");
  }
  let parsed: any;
  try { parsed = JSON.parse(content); }
  catch { throw new TelegramRequestError("Telegram returned an invalid response"); }
  if (parsed?.ok !== true) throw new TelegramRequestError("Telegram API rejected the request");
  return parsed.result;
}

export async function sendTelegramMessage(
  token: string, chatId: string, text: string, base?: string,
): Promise<void> {
  if (!chatId || !text) throw new TelegramRequestError("Telegram chat and text are required");
  await telegramPost(token, "sendMessage", { chat_id: chatId, text }, base);
}

export async function sendTelegramDocument(
  token: string, chatId: string, path: string, base?: string,
): Promise<void> {
  if (!chatId || !path) throw new TelegramRequestError("Telegram chat and attachment are required");
  const file = Bun.file(path);
  try {
    if (!(await file.exists())) throw new TelegramRequestError("Telegram attachment not found");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new TelegramRequestError("Telegram attachment too large");
  } catch (error) {
    if (error instanceof TelegramRequestError) throw error;
    throw new TelegramRequestError("Telegram attachment could not be read");
  }
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("document", file, basename(path));
  await telegramPost(token, "sendDocument", form, base);
}

export async function callTelegramBot(
  token: string, method: string, payload: Record<string, unknown> = {}, base?: string,
): Promise<unknown> {
  return telegramPost(token, method, payload, base);
}
