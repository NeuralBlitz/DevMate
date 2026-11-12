import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";

const supportedHashes = new Set(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"]);

/** Calculate a file hash with streaming I/O and no shell interpretation. */
export async function hashFile(path: string, algorithm = "sha256"): Promise<string> {
  if (!supportedHashes.has(algorithm)) {
    throw new RangeError("Unsupported hash algorithm. Choose md5, sha1, sha224, sha256, sha384 or sha512.");
  }
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/**
 * Count newline bytes in files matching the legacy `*.<extension>` glob.
 * This matches wc -l semantics (a final unterminated line is not counted).
 * Using find -print0 preserves filenames with whitespace and newlines.
 * Stream file content rather than loading every matching file into memory.
 */
export async function countLinesByExtension(extension: string, cwd = process.cwd()): Promise<number> {
  const entries = execFileSync(
    "find",
    [".", "-name", `*.${extension}`, "-type", "f", "-print0"],
    { cwd, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const filenames = entries.toString("utf8").split("\0").filter(Boolean);
  let total = 0;
  for (const file of filenames) {
    for await (const chunk of createReadStream(join(cwd, file))) {
      const bytes = chunk as Buffer;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 10) total++;
      }
    }
  }
  return total;
}
