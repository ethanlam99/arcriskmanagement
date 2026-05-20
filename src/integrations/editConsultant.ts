// INTEGRATION STUB — Phase 2 will replace with real LLM consultative agent.
// Do not call external services here.
//
// Phase 2 notes:
//   - Agent receives the full conversation + the catalog of engine modules.
//   - Agent decides which module the user is referring to and what kind of
//     edit they want, then proposes a title + brief.

import type { OverviewChatMessage, EngineModule } from '@/types';

const SIMULATED_DELAY_MS = 1200;

export interface EditConsultantRequest {
  conversation: OverviewChatMessage[];
  modules:      EngineModule[];
  userInput:    string;
}

export interface EditConsultantResponse {
  reply:                 string;
  suggested_module_id?:  string;
  suggested_title?:      string;
  suggested_brief?:      string;
  awaiting_confirmation: boolean;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ES2020-safe equivalent of conversation.findLast(...). tsconfig target is
// ES2020, which doesn't yet have Array.prototype.findLast (ES2023).
function findLastAssistant(messages: OverviewChatMessage[]): OverviewChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return messages[i];
  }
  return undefined;
}

function deriveTitle(input: string): string {
  const firstSentence = input.split(/[.!?]/)[0].trim();
  const words = firstSentence.split(/\s+/).slice(0, 8).join(' ');
  if (!words) return 'New risk edit';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export async function consultOnEdit(req: EditConsultantRequest): Promise<EditConsultantResponse> {
  await delay(SIMULATED_DELAY_MS);

  // Keyword-based module identification — match user input + conversation
  // history against module names and descriptions. First match wins.
  const haystack = (req.userInput + ' ' + req.conversation.map((m) => m.content).join(' ')).toLowerCase();
  const match = req.modules.find((m) => {
    if (haystack.includes(m.module_name.toLowerCase())) return true;
    if (haystack.includes(m.module_name.replace(/_/g, ' ').toLowerCase())) return true;
    return m.description
      .toLowerCase()
      .split(/\W+/)
      .some((w) => w.length > 4 && haystack.includes(w));
  });

  if (!match) {
    return {
      reply: "Got it — can you tell me a bit more about which area of the risk engine this affects? It might help to name the module or describe what's being scored.",
      awaiting_confirmation: false,
    };
  }

  // First identification — propose module, ask user to confirm.
  const lastAssistant = findLastAssistant(req.conversation);
  if (!lastAssistant?.suggested_module_id) {
    return {
      reply: `Sounds like this affects **${match.module_name}** — does that match what you have in mind? If yes, tell me the change in your own words.`,
      suggested_module_id: match.id,
      awaiting_confirmation: true,
    };
  }

  // User has confirmed module (or kept the same one) — propose title + brief
  // from their input.
  return {
    reply: "Here's what I'll propose as the draft. Have a look and confirm to create.",
    suggested_module_id:  match.id,
    suggested_title:      deriveTitle(req.userInput),
    suggested_brief:      req.userInput,
    awaiting_confirmation: false,
  };
}
