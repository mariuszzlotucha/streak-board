import { DEFAULT_MAX_DIFF_CHARS } from "./config";

/**
 * Upper bound on bytes read from stdin. A UTF-8 character takes at most four
 * bytes, so this never rejects a diff that `reviewDiff` would accept, and it
 * stops a huge pipe before it is buffered in full.
 */
const MAX_STDIN_BYTES = DEFAULT_MAX_DIFF_CHARS * 4;

/**
 * Loads `.env` from the current directory into `process.env` when the file
 * exists (Node's `process.loadEnvFile`); variables already set in the shell win.
 */
export function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** What `readDiff` read: the diff, or why there is none. */
export type ReadDiffResult = { diff: string } | { error: "empty" | "too-large" };

/**
 * Reads the diff piped on stdin. Returns `{ error: "empty" }` when stdin is a
 * terminal or the piped input is empty or whitespace only, and
 * `{ error: "too-large" }` when it is longer than `maxBytes`; either prints an
 * error on stderr. Only trailing newlines are stripped, so the diff's own
 * whitespace (e.g. a blank context line) is kept.
 */
export async function readDiff(maxBytes = MAX_STDIN_BYTES): Promise<ReadDiffResult> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
      // Chunks are strings if anyone has called `setEncoding` on stdin.
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        console.error(`error: diff too large (over ${maxBytes} bytes on stdin)`);
        return { error: "too-large" };
      }
      chunks.push(buffer);
    }
    const piped = Buffer.concat(chunks).toString("utf8");
    if (piped.trim()) return { diff: piped.replace(/\n+$/, "") + "\n" };
  }
  console.error("error: no diff on stdin (usage: git diff | npx tsx packages/code-reviewer/review.ts)");
  return { error: "empty" };
}
