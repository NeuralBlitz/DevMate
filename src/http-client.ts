/** Shell-free HTTP transport for DevMate API/GraphQL commands. */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export class HttpClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpClientError";
  }
}

export interface HttpResult {
  status: number;
  elapsedMs: number;
  text: string;
}

export function normalizeCliBody(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const body = raw.trim();
  if (body.length >= 2 &&
    ((body[0] === "'" && body.at(-1) === "'") ||
     (body[0] === '"' && body.at(-1) === '"'))) {
    return body.slice(1, -1);
  }
  return body;
}

export function validateHttpMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase();
  if (!HTTP_METHODS.includes(normalized as HttpMethod)) {
    throw new HttpClientError("Unsupported HTTP method");
  }
  return normalized as HttpMethod;
}

/**
 * Only HTTP(S) URLs are accepted. Network failures deliberately omit URLs,
 * query tokens, response bodies, headers and credentials from exception text.
 */
export async function requestHttp(options: {
  method: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<HttpResult> {
  const method = validateHttpMethod(options.method);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(options.url);
  } catch {
    throw new HttpClientError("Invalid HTTP URL");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol) ||
      parsedUrl.username || parsedUrl.password) {
    throw new HttpClientError("Invalid HTTP URL");
  }
  if (method === "GET" && options.body !== undefined) {
    throw new HttpClientError("GET requests cannot include a request body");
  }
  const timeout = Number.isSafeInteger(options.timeoutMs) &&
    (options.timeoutMs ?? 0) > 0 ? options.timeoutMs! : 15_000;
  const maxBytes = Number.isSafeInteger(options.maxBytes) &&
    (options.maxBytes ?? 0) > 0 ? options.maxBytes! : 5 * 1024 * 1024;

  const start = Date.now();
  let response: Response;
  try {
    response = await fetch(parsedUrl.toString(), {
      method,
      headers: options.headers ?? (options.body === undefined
        ? { accept: "application/json" }
        : { "content-type": "application/json" }),
      body: options.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new HttpClientError("HTTP request failed (network or timeout)");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new HttpClientError("HTTP response exceeds configured size limit");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      if (error instanceof HttpClientError) throw error;
      throw new HttpClientError("HTTP response could not be read");
    }
  }
  return { status: response.status, elapsedMs: Date.now() - start, text };
}
