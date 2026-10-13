import "dotenv/config";
import { ToolLoopAgent, stepCountIs } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const agent = new ToolLoopAgent({
  model: openrouter("z-ai/glm-5.1", { usage: { include: true } }),
  instructions: "Jesteś zwięzły. Odpowiadaj jednym zdaniem.",
  stopWhen: stepCountIs(1),
});

const { text, usage, finalStep } = await agent.generate({
  prompt: "Napisz jednozdaniowe powitanie dla zespołu programistów.",
  onStepFinish: ({ stepNumber, usage, finishReason }) => {
    console.error(`krok ${stepNumber}: ${usage.inputTokens} in / ${usage.outputTokens} out (${finishReason})`);
  },
});

const providerMetadata = finalStep.providerMetadata as
  { openrouter?: { usage?: { cost?: number; totalTokens?: number } } } | undefined;
const openrouterUsage = providerMetadata?.openrouter?.usage;

const report = {
  cost_usd: openrouterUsage?.cost ?? null,
  usage: {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  },
  model: "z-ai/glm-5.1",
};

const outPath = join(import.meta.dirname, "cost.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Odpowiedź: ${text}`);
console.log(`Koszt zapisany do: ${outPath}`);
