export type ProgressArguments =
  | { ok: true; current: number; total: number }
  | { ok: false; error: string };

const decimalInteger = /^[+-]?\d+$/;

/**
 * Parse and validate `progress <current> <total>` without partial-number
 * acceptance (e.g. parseInt("12oops") would previously return 12).
 * Out-of-range *current* values are allowed: the formatter clamps them.
 */
export function parseProgressArguments(args: readonly string[]): ProgressArguments {
  if (args.length !== 2) {
    return { ok: false, error: "Expected exactly two integer arguments." };
  }
  if (!args.every((value) => decimalInteger.test(value))) {
    return { ok: false, error: "Progress values must be decimal integers." };
  }
  const current = Number(args[0]);
  const total = Number(args[1]);
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(total)) {
    return { ok: false, error: "Progress values exceed the safe integer range." };
  }
  if (total <= 0) {
    return { ok: false, error: "Total must be greater than zero." };
  }
  return { ok: true, current, total };
}
