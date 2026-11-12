import { resolveAlias } from "./aliases";

export interface ParsedCommand {
  /** Expanded command line, preserving the original arguments and spacing. */
  resolved: string;
  /** Lowercase command token, matching the legacy dispatcher behavior. */
  cmd: string;
  /** Whitespace-separated arguments; quoted strings are not interpreted. */
  args: string[];
}

/**
 * Parse a normal CLI command without executing it.
 * Explicit `!` shell passthrough is handled by the caller before this function.
 * Keep legacy whitespace tokenization until a deliberate interface migration.
 */
export function parseCommand(
  input: string,
  customAliases: Record<string, unknown> = {},
): ParsedCommand {
  const raw = input.trim();
  if (!raw) return { resolved: "", cmd: "", args: [] };
  const resolved = resolveAlias(raw, customAliases);
  const parts = resolved.split(/\s+/);
  return { resolved, cmd: parts[0]?.toLowerCase() || "", args: parts.slice(1) };
}
