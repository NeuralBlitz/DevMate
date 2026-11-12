/**
 * Build argument-vector invocations for DevMate's core filesystem commands.
 *
 * No user-controlled path is interpolated into a shell command string.
 * Every path operand follows `--` so leading dashes are treated as filenames.
 * Argument counts are checked by the dispatcher before this function is called.
 */
export type FileUtility = "ls" | "ll" | "la" | "l" | "lt" | "llh"
  | "cat" | "head" | "tail" | "less" | "mkdir" | "rm" | "rmdir"
  | "touch" | "cp" | "mv";

export interface FileInvocation {
  executable: string;
  argv: string[];
}

export function fileInvocation(cmd: FileUtility, args: readonly string[]): FileInvocation {
  switch (cmd) {
    case "ls": case "ll": case "la": case "l": case "lt": case "llh":
      // Preserve the prior implementation's "-la" behavior for these names.
      return { executable: "ls", argv: ["-la", "--", args[0] || "."] };
    case "cat": case "head": case "tail": case "less":
      return { executable: cmd, argv: ["--", args[0]] };
    case "mkdir":
      return { executable: "mkdir", argv: ["-p", "--", args[0]] };
    case "rm":
      return { executable: "rm", argv: ["-rf", "--", args[0]] };
    case "rmdir":
      return { executable: "rm", argv: ["-d", "--", args[0]] };
    case "touch":
      return { executable: "touch", argv: ["--", args[0]] };
    case "cp":
      return { executable: "cp", argv: ["-r", "--", args[0], args[1]] };
    case "mv":
      return { executable: "mv", argv: ["--", args[0], args[1]] };
  }
}
