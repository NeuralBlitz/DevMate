import { execFileSync } from "node:child_process";

export type FileSearchQuery =
  | { kind: "files" | "directories"; pattern: string }
  | { kind: "extension"; extension: string; name: string }
  | { kind: "recent"; days: string }
  | { kind: "size"; limit: string }
  | { kind: "content"; pattern: string };

export interface FileSearchInvocation {
  executable: "find" | "grep";
  argv: string[];
}

const validDays = /^\d+$/;
const validSize = /^\d+(?:[bcwkMG])?$/;
const sourceExtensions = ["js", "ts", "jsx", "tsx", "py", "go"];

/** Construct a shell-free command, preserving the existing find/grep patterns. */
export function fileSearchInvocation(query: FileSearchQuery): FileSearchInvocation {
  switch (query.kind) {
    case "files":
    case "directories":
      return {
        executable: "find",
        argv: [".", "-name", `*${query.pattern}*`, "-type",
          query.kind === "files" ? "f" : "d", "-print"],
      };
    case "extension":
      return {
        executable: "find",
        argv: [".", "-name", `*${query.name}*.${query.extension}`, "-print"],
      };
    case "recent": {
      const days = Number(query.days);
      if (!validDays.test(query.days) || !Number.isSafeInteger(days) || days < 1) {
        throw new RangeError("Days must be a positive integer.");
      }
      return { executable: "find", argv: [".", "-type", "f", "-mtime", `-${days}`, "-ls"] };
    }
    case "size": {
      const match = query.limit.match(validSize);
      const amount = match ? Number.parseInt(match[0], 10) : Number.NaN;
      if (!match || !Number.isSafeInteger(amount)) {
        throw new RangeError("Size must be an integer with an optional b, c, w, k, M, or G suffix.");
      }
      return { executable: "find", argv: [".", "-type", "f", "-size", `+${query.limit}`, "-ls"] };
    }
    case "content":
      return {
        executable: "grep",
        argv: ["-rn", ...sourceExtensions.map((ext) => `--include=*.${ext}`),
          "-e", query.pattern, "."],
      };
  }
}

/**
 * Collect search output without a shell pipeline. Caller may limit displayed
 * lines; a bounded buffer/timeout prevents runaway collection in huge trees.
 */
export function runFileSearch(
  query: FileSearchQuery,
  options: { maxLines?: number; sortBySize?: boolean; cwd?: string } = {},
): string {
  const { executable, argv } = fileSearchInvocation(query);
  const output = execFileSync(executable, argv, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 20_000,
    cwd: options.cwd,
  });
  if (options.maxLines === undefined && !options.sortBySize) return output;
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (options.sortBySize) {
    // GNU find -ls field 7 (zero-based 6) is the numeric file size.
    lines.sort((a, b) =>
      (Number(b.trim().split(/\s+/)[6]) || 0) -
      (Number(a.trim().split(/\s+/)[6]) || 0));
  }
  return lines.slice(0, options.maxLines ?? lines.length).join("\n");
}
