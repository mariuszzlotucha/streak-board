// Compare two probe runs probe by probe: status, location, cookies, console line count (ignoring volatile numbers).
import fs from "node:fs";

const [fileA, fileB] = process.argv.slice(2);
const load = (f) => new Map(JSON.parse(fs.readFileSync(f, "utf8")).results.map((r) => [r.id, r]));
const A = load(fileA);
const B = load(fileB);
const norm = (lines) =>
  lines
    .filter((l) => !/^\[stderr\]\s+at /.test(l))
    .map((l) =>
      l
        .replace(/\(\d+ms\)/g, "(Nms)")
        .replace(/\d\d:\d\d:\d\d/g, "HH:MM:SS")
        .replace(/workerd@[0-9a-f]+/g, "workerd@X")
        .replace(/stack: .*/, "stack: ..."),
    )
    .join("\n");
let diffs = 0;
for (const [id, a] of A) {
  const b = B.get(id);
  if (!b) {
    console.log(`${id}: only in ${fileA}`);
    continue;
  }
  const sa = JSON.stringify([a.response.status, a.response.location, a.response.setCookies, a.response.clientError, a.response.hasRoleAlert, a.response.alerts, a.response.notes]);
  const sb = JSON.stringify([b.response.status, b.response.location, b.response.setCookies, b.response.clientError, b.response.hasRoleAlert, b.response.alerts, b.response.notes]);
  const ca = norm(a.console);
  const cb = norm(b.console);
  if (sa !== sb || ca !== cb) {
    diffs++;
    console.log(`DIFF ${id}\n  A: ${sa}\n  B: ${sb}`);
    if (ca !== cb) console.log(`  console A:\n${ca.split("\n").map((l) => `    ${l.slice(0, 160)}`).join("\n")}\n  console B:\n${cb.split("\n").map((l) => `    ${l.slice(0, 160)}`).join("\n")}`);
  }
}
for (const id of B.keys()) if (!A.has(id)) console.log(`${id}: only in ${fileB}`);
console.log(`${diffs} probe(s) differ`);
