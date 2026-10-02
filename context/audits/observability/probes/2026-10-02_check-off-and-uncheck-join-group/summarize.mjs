// Compact per-probe summary of a probe run: node summarize.mjs <results.json> [idPrefix]
import fs from "node:fs";

const [file, prefix] = process.argv.slice(2);
const { meta, results } = JSON.parse(fs.readFileSync(file, "utf8"));
console.log(`run=${meta.run} node=${meta.node} probes=${results.length}`);
for (const r of results) {
  if (prefix && !r.id.startsWith(prefix)) continue;
  const x = r.response;
  const head = x.clientError
    ? `CLIENT ERROR ${x.clientError}`
    : `${x.status}${x.location ? ` -> ${x.location}` : ""}${x.setCookies?.length ? ` [${x.setCookies.join(", ")}]` : ""} ${x.ms}ms${x.bodyError ? ` BODYERR ${x.bodyError}` : ""}${x.hasRoleAlert ? ` ALERT=${JSON.stringify(x.alerts)}` : ""}${x.notes?.length && x.contentType?.includes("html") ? ` NOTES=${JSON.stringify(x.notes)}` : ""}`;
  console.log(`\n${r.id}: ${head}`);
  if (x.bodySnippet !== undefined && !x.contentType?.includes("html")) console.log(`   body: ${x.bodySnippet.slice(0, 120)}`);
  for (const s of r.stubRequests ?? []) console.log(`   stub: ${s}`);
  for (const c of r.console) {
    if (/^\[stderr\]\s+at /.test(c)) continue; // skip stack frames
    console.log(`   ${c.slice(0, 220)}`);
  }
}
