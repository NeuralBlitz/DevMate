import { execFileSync } from "node:child_process";

export type CloudTool = "aws" | "gcloud" | "az";

export interface CloudInvocation {
  executable: CloudTool;
  argv: string[];
}

/** Preserve literal argument boundaries for cloud CLIs, without a host shell. */
export function cloudInvocation(tool: CloudTool, args: readonly string[]): CloudInvocation {
  return { executable: tool, argv: [...args] };
}

export function runCloud(tool: CloudTool, args: readonly string[], captureOutput = false): string {
  const { executable, argv } = cloudInvocation(tool, args);
  const output = execFileSync(executable, argv, {
    encoding: "utf8",
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return typeof output === "string" ? output : "";
}

/**
 * Encode Bedrock prompt text as JSON, not as interpolated shell fragments.
 * Maintains the previous model/arguments while fixing quote handling.
 */
export function bedrockArguments(prompt: string, region: string): string[] {
  const body = JSON.stringify({
    messages: [{ role: "user", content: [{ text: prompt }] }],
    max_tokens: 2048,
  });
  return [
    "bedrock-runtime", "invoke-model",
    "--model-id", "anthropic.claude-3-sonnet-20240229-v1:0",
    "--region", region,
    "--body", body,
    "--cli-binary-format", "raw-in-base64-out",
  ];
}
