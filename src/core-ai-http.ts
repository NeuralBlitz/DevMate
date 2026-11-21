/** Shell-free, bounded HTTP integrations for DevMate's core AI commands. */
import { HttpClientError, requestHttp, type HttpResult } from "./http-client";

export type CoreAiProvider = "openai" | "anthropic" | "gemini";

export interface CoreAiRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

const PROVIDERS = {
  openai: {
    key: "OPENAI_API_KEY", model: "OPENAI_MODEL", defaultModel: "gpt-4.1-mini",
  },
  anthropic: {
    key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-5",
  },
  gemini: {
    key: "GEMINI_API_KEY", model: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash",
  },
} as const;

export function buildCoreAiRequest(
  provider: CoreAiProvider,
  prompt: string,
  env: Record<string, string | undefined> = process.env,
  maxTokens = 2048,
): CoreAiRequest {
  const spec = PROVIDERS[provider];
  if (!spec) throw new HttpClientError("Unsupported AI provider");
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new HttpClientError("AI prompt is required");
  }
  const key = env[spec.key];
  if (!key) throw new HttpClientError(`Missing ${spec.key} environment variable`);
  const model = env[spec.model] || spec.defaultModel;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(model)) {
    throw new HttpClientError("Invalid AI model identifier");
  }
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 16_384) {
    throw new HttpClientError("Invalid max tokens");
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (provider === "openai") {
    headers.authorization = `Bearer ${key}`;
    return {
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      }),
    };
  }
  if (provider === "anthropic") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    return {
      method: "POST",
      url: "https://api.anthropic.com/v1/messages",
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    };
  }
  // Gemini keys belong in a header, never a query string or an executable argv.
  headers["x-goog-api-key"] = key;
  return {
    method: "POST",
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers,
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  };
}

/** Preserve all characters in prompts; sanitize transport exceptions. */
export function requestCoreAi(
  provider: CoreAiProvider,
  prompt: string,
  env: Record<string, string | undefined> = process.env,
  maxTokens = 2048,
): Promise<HttpResult> {
  return requestHttp(buildCoreAiRequest(provider, prompt, env, maxTokens));
}
