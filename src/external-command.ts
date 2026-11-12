import { execFileSync } from "node:child_process";

export interface ExternalInvocation {
  executable: string;
  argv: string[];
}

/**
 * Preserve the CLI's existing whitespace token boundaries and forward them
 * literally to the chosen executable. No host shell is used.
 *
 * Callers retain responsibility for selecting the intended command. Use the
 * explicit `!` passthrough for user-requested shell operators or expansions.
 */
export function externalInvocation(
  executable: string,
  args: readonly string[],
): ExternalInvocation {
  return { executable, argv: [...args] };
}

/** Run a preselected executable without implicit shell interpretation. */
export function runExternalCommand(executable: string, args: readonly string[]): void {
  const invocation = externalInvocation(executable, args);
  execFileSync(invocation.executable, invocation.argv, {
    encoding: "utf8",
    stdio: "inherit",
  });
}
