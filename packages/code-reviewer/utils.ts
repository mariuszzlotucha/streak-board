/**
 * Reads the diff piped on stdin. Returns `undefined` and prints a usage error
 * on stderr when stdin is a terminal or the piped input is empty.
 */
export async function readDiff(): Promise<string | undefined> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const piped = Buffer.concat(chunks).toString("utf8").trim();
    if (piped) return piped + "\n";
  }
  console.error("error: no diff on stdin (usage: git diff | npx tsx packages/code-reviewer/review.ts)");
}
