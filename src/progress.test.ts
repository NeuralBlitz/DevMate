import { expect, test } from "bun:test";
import { progressBar } from "./progress";

test("renders the documented half-complete progress bar", () => {
  expect(progressBar(5, 10, 10)).toBe("[█████░░░░░] 50%");
});

test("supports completed and empty progress", () => {
  expect(progressBar(10, 10, 4)).toBe("[████] 100%");
  expect(progressBar(0, 10, 4)).toBe("[░░░░] 0%");
});

test("clamps out-of-bounds progress without throwing", () => {
  expect(progressBar(15, 10, 4)).toBe("[████] 100%");
  expect(progressBar(-2, 10, 4)).toBe("[░░░░] 0%");
});

test("handles zero, negative, and invalid totals", () => {
  expect(progressBar(2, 0, 4)).toBe("[░░░░] 0%");
  expect(progressBar(2, -10, 4)).toBe("[░░░░] 0%");
  expect(progressBar(Number.NaN, 10, 4)).toBe("[░░░░] 0%");
  expect(progressBar(2, Number.POSITIVE_INFINITY, 4)).toBe("[░░░░] 0%");
});

test("bounds bar width and keeps percentages valid", () => {
  expect(progressBar(1, 2, 4.8)).toBe("[██░░] 50%");
  expect(progressBar(1, 2, 0)).toBe("[] 50%");
  expect(progressBar(1, 2, 1000)).toBe("[" + "█".repeat(60) + "░".repeat(60) + "] 50%");
  expect(progressBar(1, 2, Number.NaN)).toBe("[" + "█".repeat(15) + "░".repeat(15) + "] 50%");
});
