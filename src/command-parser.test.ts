import { expect, test } from "bun:test";
import { parseCommand } from "./command-parser";

test("normalizes command names while preserving argument tokens", () => {
  expect(parseCommand("  GiT    status  --short  ")).toEqual({
    resolved: "GiT    status  --short",
    cmd: "git",
    args: ["status", "--short"],
  });
});

test("empty command is safely represented", () => {
  expect(parseCommand(" \t ")).toEqual({ resolved: "", cmd: "", args: [] });
});

test("applies built-in and custom aliases before tokenization", () => {
  expect(parseCommand("GS -sb")).toEqual({
    resolved: "git status -sb",
    cmd: "git",
    args: ["status", "-sb"],
  });
  expect(parseCommand("gs --porcelain", { gs: "git status --short" })).toEqual({
    resolved: "git status --short --porcelain",
    cmd: "git",
    args: ["status", "--short", "--porcelain"],
  });
});

test("does not expand inherited properties or invalid alias values", () => {
  expect(parseCommand("constructor")).toEqual({
    resolved: "constructor", cmd: "constructor", args: [],
  });
  expect(parseCommand("gs -sb", { gs: null })).toEqual({
    resolved: "gs -sb", cmd: "gs", args: ["-sb"],
  });
});

test("preserves the legacy whitespace-only treatment of quoted strings", () => {
  expect(parseCommand('gcm "hello world"')).toEqual({
    resolved: 'git commit -m "hello world"',
    cmd: "git",
    args: ["commit", "-m", '"hello', 'world"'],
  });
});
