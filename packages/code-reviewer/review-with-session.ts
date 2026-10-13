import { ToolLoopAgent, isStepCount, type ModelMessage } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { createReviewer } from "./agent";
import { resolveReviewerModel } from "./config";
import { buildReviewPrompt } from "./prompts/reviewer";
import { loadEnv, readDiff } from "./utils";

loadEnv();
const model = resolveReviewerModel();
const structuredReviewer = createReviewer({ model });

const recaller = new ToolLoopAgent({
  model: openrouter(model),
  instructions: "Jesteś tym samym recenzentem. Odpowiadaj zwięźle, zwykłym tekstem, korzystając z historii rozmowy.",
  stopWhen: isStepCount(1),
});

const diff = await readDiff();
if (diff === undefined) process.exit(1);
const messages: ModelMessage[] = [{ role: "user", content: buildReviewPrompt(diff) }];

const first = await structuredReviewer.generate({ messages });
messages.push(...first.responseMessages);
console.error("[1] recenzja:");
console.log(JSON.stringify(first.output, null, 2));

messages.push({
  role: "user",
  content:
    "Bez ponownego wczytywania diffa: który plik recenzowałeś i które kryterium dostało najniższą ocenę? Odpowiedz krótko, zwykłym tekstem.",
});
const second = await recaller.generate({ messages });
console.error("\n[2] po doniesieniu historii (bez ponownego diffa):");
console.log(second.text);
