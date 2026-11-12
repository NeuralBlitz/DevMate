/**
 * Render a bounded terminal progress bar.
 *
 * Invalid totals and invalid progress values are treated as 0%, and
 * percentages are clamped to the interval [0, 100].
 */
export function progressBar(current: number, total: number, width = 30): string {
  const safeWidth = Number.isFinite(width) ? Math.min(120, Math.max(0, Math.floor(width))) : 30;
  const ratio = Number.isFinite(current) && Number.isFinite(total) && total > 0
    ? Math.min(1, Math.max(0, current / total))
    : 0;
  const percent = Math.round(ratio * 100);
  const filled = Math.round(safeWidth * ratio);
  const bar = "█".repeat(filled) + "░".repeat(safeWidth - filled);
  return `[${bar}] ${percent}%`;
}
