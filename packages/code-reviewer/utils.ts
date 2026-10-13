import { DEFAULT_MAX_DIFF_CHARS } from "./config";

/**
 * Upper bound on bytes read from stdin. A UTF-8 character takes at most four
 * bytes, so this never rejects a diff that `reviewDiff` would accept, and it
 * stops a huge pipe before it is buffered in full.
 */
const MAX_STDIN_BYTES = DEFAULT_MAX_DIFF_CHARS * 4;

/**
 * Reads the diff piped on stdin. Returns `undefined` and prints an error on
 * stderr when stdin is a terminal, the piped input is empty, or it is longer
 * than `maxBytes`.
 */
export async function readDiff(maxBytes = MAX_STDIN_BYTES): Promise<string | undefined> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += (chunk as Buffer).length;
      if (bytes > maxBytes) {
        console.error(`error: diff too large (over ${maxBytes} bytes on stdin)`);
        return undefined;
      }
      chunks.push(chunk as Buffer);
    }
    const piped = Buffer.concat(chunks).toString("utf8").trim();
    if (piped) return piped + "\n";
  }
  console.error("error: no diff on stdin (usage: git diff | npx tsx packages/code-reviewer/review.ts)");
}
