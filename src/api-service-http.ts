/** Typed API-service presets. Credentials never pass through a shell or argv. */
import { HttpClientError, normalizeCliBody, validateHttpMethod } from "./http-client";

export const API_SERVICE_BASES: Readonly<Record<string, string>> = {
  github: "https://api.github.com",
  gitlab: "https://gitlab.com/api/v4",
  notion: "https://api.notion.com/v1",
  stripe: "https://api.stripe.com/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  replicate: "https://api.replicate.com/v1",
  jira: "https://your-domain.atlassian.net/rest/api/3",
  sendgrid: "https://api.sendgrid.com/v3",
  linear: "https://api.linear.app/graphql",
  shopify: "https://your-store.myshopify.com/admin/api/2024-01",
};

export interface ApiServiceRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Construct a request without ever assembling executable shell syntax.
 * The Jira base URL is configurable; require HTTPS except for loopback tests.
 */
export function buildApiServiceRequest(
  service: string,
  endpoint = "",
  method = "GET",
  rawBody?: string,
  env: Record<string, string | undefined> = process.env,
): ApiServiceRequest {
  const key = service.toLowerCase();
  const configuredBase = API_SERVICE_BASES[key];
  if (!configuredBase) throw new HttpClientError("Unknown API service");
  const base = key === "jira" ? (env.JIRA_URL || configuredBase) : configuredBase;
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new HttpClientError("Invalid API service base URL");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
  if ((baseUrl.protocol !== "https:" && !(isLoopback && baseUrl.protocol === "http:")) ||
      baseUrl.username || baseUrl.password) {
    throw new HttpClientError("API service base URL requires HTTPS or loopback HTTP");
  }
  const path = endpoint.trim();
  if (path.startsWith("//") || path.includes("\\") ||
      /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("#")) {
    throw new HttpClientError("Invalid API service endpoint");
  }
  let requestUrl: URL;
  try {
    requestUrl = new URL(base.replace(/\/+$/, "") +
      (path ? (path.startsWith("/") ? path : "/" + path) : ""));
  } catch {
    throw new HttpClientError("Invalid API service endpoint");
  }
  if (requestUrl.origin !== baseUrl.origin || requestUrl.username || requestUrl.password) {
    throw new HttpClientError("Invalid API service endpoint");
  }
  const headers: Record<string, string> = { accept: "application/json" };
  if (key === "github") headers.accept = "application/vnd.github+json";
  if (key === "notion") headers["Notion-Version"] = "2022-06-28";

  const token = env[`${key.toUpperCase()}_TOKEN`] ||
    env[`${key.toUpperCase()}_API_KEY`];
  if (token) {
    if (key === "stripe") {
      headers.authorization = "Basic " + Buffer.from(token + ":").toString("base64");
    } else if (key === "jira" && env.JIRA_EMAIL) {
      headers.authorization = "Basic " +
        Buffer.from(env.JIRA_EMAIL + ":" + token).toString("base64");
    } else if (key === "anthropic") {
      headers["x-api-key"] = token;
      headers["anthropic-version"] = "2023-06-01";
    } else if (key === "shopify") {
      headers["X-Shopify-Access-Token"] = token;
    } else {
      headers.authorization = "Bearer " + token;
    }
  }
  // Anthropic requires the version header even for requests with no key.
  if (key === "anthropic") headers["anthropic-version"] = "2023-06-01";
  const body = rawBody ? normalizeCliBody(rawBody) : undefined;
  if (body !== undefined) headers["content-type"] = "application/json";
  return { method: validateHttpMethod(method), url: requestUrl.toString(), headers, body };
}
