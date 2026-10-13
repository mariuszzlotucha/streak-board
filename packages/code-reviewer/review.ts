import { reviewDiff } from "./agent";
import { readDiff } from "./utils";

const diff = await readDiff();
if (diff === undefined) process.exit(1);
const run = await reviewDiff(diff);
console.log(JSON.stringify(run.output, null, 2));
