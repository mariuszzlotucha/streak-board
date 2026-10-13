import { ToolLoopAgent, Output, stepCountIs } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { REVIEWER_PROMPT, ReviewResult } from "./review-schema";
import { readDiff } from "./utils";

async function review(diff: string): Promise<ReviewResult> {
  const reviewer = new ToolLoopAgent({
    model: openrouter("z-ai/glm-5.1"),
    instructions: REVIEWER_PROMPT,
    tools: {},
    output: Output.object({ schema: ReviewResult }),
    stopWhen: stepCountIs(2),
  });

  const { output } = await reviewer.generate({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
  });
  return output;
}

const diff = await readDiff();
if (diff === undefined) process.exit(1);
console.log(JSON.stringify(await review(diff), null, 2));
