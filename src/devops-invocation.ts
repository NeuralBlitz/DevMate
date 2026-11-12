import { execFileSync } from "node:child_process";

export type DevopsTool = "docker" | "kubectl";

export interface DevopsInvocation {
  executable: DevopsTool;
  argv: string[];
}

/**
 * Construct a subprocess command without involving a host shell.
 * The CLI deliberately keeps existing whitespace-based tokenization,
 * so this function does not interpret quotes or expand shell operators.
 */
export function devopsInvocation(tool: DevopsTool, args: readonly string[]): DevopsInvocation {
  return { executable: tool, argv: [...args] };
}

/**
 * Run a Docker / kubectl command with literal argument boundaries.
 * Never interpolate arguments into a command string.
 */
export function runDevops(
  tool: DevopsTool,
  args: readonly string[],
  captureOutput = false,
): string {
  const { executable, argv } = devopsInvocation(tool, args);
  const output = execFileSync(executable, argv, {
    encoding: "utf8",
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return typeof output === "string" ? output : "";
}
