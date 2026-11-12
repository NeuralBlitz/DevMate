import { execFileSync } from "node:child_process";

export interface GitInvocation {
  executable: "git";
  argv: string[];
}

export function gitInvocation(args: readonly string[]): GitInvocation {
  return { executable: "git", argv: [...args] };
}

/** Git commands always receive a literal argv vector; never a shell string. */
export function runGit(
  args: readonly string[],
  options: { cwd?: string; captureOutput?: boolean } = {},
): string {
  const { executable, argv } = gitInvocation(args);
  const output = execFileSync(executable, argv, {
    encoding: "utf8",
    cwd: options.cwd,
    stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return typeof output === "string" ? output : "";
}
