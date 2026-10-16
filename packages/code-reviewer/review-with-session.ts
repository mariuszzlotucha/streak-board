import {
  ToolLoopAgent,
  isStepCount,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type FinishReason,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { createReviewer } from "./agent";
import { DEFAULT_MAX_DIFF_CHARS, DEFAULT_MAX_OUTPUT_TOKENS, resolveReviewerModel } from "./config";
import { buildReviewPrompt } from "./prompts/reviewer";
import { formatUsageLine, loadEnv, readDiff } from "./utils";

loadEnv();
const model = resolveReviewerModel();
const structuredReviewer = createReviewer({ model });

const recaller = new ToolLoopAgent({
  // `usage.include` makes OpenRouter report the cost, so the usage line can show it.
  model: openrouter(model, { usage: { include: true } }),
  instructions: "Jesteś tym samym recenzentem. Odpowiadaj zwięźle, zwykłym tekstem, korzystając z historii rozmowy.",
  stopWhen: isStepCount(1),
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
});

/** The parts of a finished step the usage line is built from. */
interface Step {
  usage: LanguageModelUsage;
  providerMetadata: unknown;
  finishReason: FinishReason;
}

const NO_USAGE: LanguageModelUsage = {
  inputTokens: undefined,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokens: undefined,
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  totalTokens: undefined,
};

/** The CLI's usage line for the last step of one call (each agent here makes one step), `unknown` without one. */
function usageLine(step: Step | undefined): string {
  const metadata = step?.providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined;
  const cost = metadata?.openrouter?.usage?.cost;
  return formatUsageLine({
    model,
    finishReason: step?.finishReason,
    usage: step?.usage ?? NO_USAGE,
    costUsd: typeof cost === "number" ? cost : null,
    toolCalls: [],
  });
}

/** Runs the two calls and returns the exit code: 1 without a diff or output, 3 for a diff over the CLI's limit. */
async function main(): Promise<number> {
  const read = await readDiff();
  if ("error" in read) return read.error === "too-large" ? 3 : 1;
  // The CLI's limit, checked before any model call (`reviewDiff` does the same for the CLI).
  if (read.diff.length > DEFAULT_MAX_DIFF_CHARS) {
    console.error(`error: the diff is ${read.diff.length} characters, over the ${DEFAULT_MAX_DIFF_CHARS} limit`);
    return 3;
  }
  const messages: ModelMessage[] = [{ role: "user", content: buildReviewPrompt(read.diff) }];

  let lastStep: Step | undefined;
  const onStepEnd = (step: Step) => {
    lastStep = step;
  };
  try {
    const first = await structuredReviewer.generate({ messages, onStepEnd });
    console.error(usageLine(lastStep));
    messages.push(...first.responseMessages);
    console.error("[1] recenzja:");
    console.log(JSON.stringify(first.output, null, 2));

    messages.push({
      role: "user",
      content:
        "Bez ponownego wczytywania diffa: który plik recenzowałeś i które kryterium dostało najniższą ocenę? Odpowiedz krótko, zwykłym tekstem.",
    });
    lastStep = undefined;
    const second = await recaller.generate({ messages, onStepEnd });
    console.error(usageLine(lastStep));
    console.error("\n[2] po doniesieniu historii (bez ponownego diffa):");
    console.log(second.text);
    return 0;
  } catch (error) {
    // A call that ended without a valid output was still billed, so its usage comes first.
    console.error(usageLine(lastStep));
    if (!NoObjectGeneratedError.isInstance(error) && !NoOutputGeneratedError.isInstance(error)) throw error;
    console.error(`error: ${error.message}`);
    return 1;
  }
}

process.exitCode = await main();
