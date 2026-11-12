/** Native webhook requests without shell interpolation or credential-bearing argv. */

export class WebhookRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "WebhookRequestError";
  }
}

/**
 * Webhook tokens are often embedded in URL paths. Never include the URL,
 * response body or request payload in errors. Only HTTPS endpoints are
 * accepted, except loopback HTTP for local development and tests.
 */
export function validateWebhookUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookRequestError("Invalid webhook URL");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback))) {
    throw new WebhookRequestError("Webhook URL requires HTTPS or loopback HTTP");
  }
  if (url.username || url.password) {
    throw new WebhookRequestError("Webhook URL must not contain URL credentials");
  }
  return url.toString();
}

export async function postWebhookJson(
  rawUrl: string,
  body: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<void> {
  const url = validateWebhookUrl(rawUrl);
  const timeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs : 10_000;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
    });
  } catch {
    throw new WebhookRequestError("Webhook request failed (network, redirect or timeout)");
  }
  if (!response.ok) {
    throw new WebhookRequestError(`Webhook request failed (HTTP ${response.status})`, response.status);
  }
}
