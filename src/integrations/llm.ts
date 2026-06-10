// INTEGRATION STUB — Phase 2 will replace with real LLM provider (TBD, subject to Indonesian data-residency constraints). Do not call external services here.
//
// Phase 2 notes:
//   - proposeEdit() will send the full conversation + module Node.js + dbContext to the LLM.
//   - Dual representation (v0.4.3): the model authors the Node.js snippet the analyst
//     reads, and emits the compiled SQL that runs in the live engine. Phase 2 may
//     generate the SQL by a real transpile step; here the mock emits both directly.
//   - dbContext (DatabaseSchema) is already typed — Phase 2 populates it from the live engine schema.
//   - Consider streaming responses for long diffs.

import type { LlmEditRequest, LlmEditResponse } from '@/types';

// Simulated network latency (ms)
const MOCK_DELAY = 1200;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Keyword-based mock response generation ────────────────────────────────────

interface EditIntent {
  verb: 'increase' | 'decrease' | 'add' | 'remove' | 'adjust' | 'fix' | 'unknown';
  subject: string;
  magnitude?: string;
}

function parseIntent(text: string): EditIntent {
  const lower = text.toLowerCase();

  const verb = lower.includes('increase') || lower.includes('raise') || lower.includes('boost')
    ? 'increase'
    : lower.includes('decrease') || lower.includes('lower') || lower.includes('reduce') || lower.includes('tighten')
    ? 'decrease'
    : lower.includes('add') || lower.includes('introduce') || lower.includes('extend')
    ? 'add'
    : lower.includes('remove') || lower.includes('delete') || lower.includes('drop')
    ? 'remove'
    : lower.includes('fix') || lower.includes('correct') || lower.includes('bug')
    ? 'fix'
    : lower.includes('adjust') || lower.includes('modify') || lower.includes('change') || lower.includes('update')
    ? 'adjust'
    : 'unknown';

  // Extract a noun phrase after the verb
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  const numberMatch  = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:IDR|M IDR|x|times|months?|years?|pts?|points?)?/i);
  const magnitude    = percentMatch?.[0] ?? numberMatch?.[0] ?? undefined;

  const subjectMatch = text.match(
    /\b(loan limit|leverage ratio|credit score|utilization cap|interest rate|repayment score|kyc|eligibility|discount|multiplier|threshold|bracket|tier)\b/i
  );
  const subject = subjectMatch?.[0] ?? 'the targeted parameter';

  return { verb, subject, magnitude };
}

// Mutate the first non-comment numeric literal as a plausible demo edit. Works on
// both the Node.js source (commentToken '//') and the compiled SQL ('--').
function mutateNumericLiteral(code: string, intent: EditIntent, commentToken: string): string {
  const numericPattern = /(\d+\.\d+|\d{4,})/;
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('--') || trimmed.startsWith('//')) continue;
    if (!numericPattern.test(lines[i])) continue;

    lines[i] = lines[i].replace(numericPattern, (m) => {
      const n = parseFloat(m.replace(/,/g, ''));
      const delta = intent.verb === 'increase' ? n * 1.1 : intent.verb === 'decrease' ? n * 0.9 : n;
      return Number.isInteger(n) ? Math.round(delta).toString() : delta.toFixed(4);
    }) + `  ${commentToken} AI: adjusted for "${intent.subject}"`;
    return lines.join('\n');
  }
  return code;
}

function buildMockDiff(
  node: string,
  sql: string,
  intent: EditIntent,
): { proposed_node: string; proposed_sql: string; diff_summary: string } {
  const proposed_node = mutateNumericLiteral(node, intent, '//');
  const proposed_sql  = mutateNumericLiteral(sql, intent, '--');

  const diff_summary =
    intent.verb === 'unknown'
      ? `Reviewed the module for "${intent.subject}". No automatic modification applied — please clarify the exact change.`
      : `${intent.verb.charAt(0).toUpperCase() + intent.verb.slice(1)}d ${intent.subject}${intent.magnitude ? ` by ${intent.magnitude}` : ''}.`;

  return { proposed_node, proposed_sql, diff_summary };
}

function buildReply(intent: EditIntent, diff_summary: string, isFollowUp: boolean): string {
  if (isFollowUp) {
    return (
      `Understood — I've revised the proposal based on your feedback.\n\n` +
      `**Updated change:** ${diff_summary}\n\n` +
      `The surrounding logic is unchanged. Does this match what you had in mind, or would you like further refinement?`
    );
  }

  if (intent.verb === 'unknown') {
    return (
      `I've reviewed the module SQL. To propose a precise diff I need a bit more detail — ` +
      `for example: *"increase the income threshold from X to Y"* or *"add a new bracket at 15M IDR with a 28x multiplier."* ` +
      `What specific value or condition would you like to change?`
    );
  }

  return (
    `I've analysed the module and located the relevant section.\n\n` +
    `**Proposed change:** ${diff_summary}\n\n` +
    `**Rationale:** This targets the ${intent.subject} parameter directly. The surrounding validation logic and boundary checks are preserved. ` +
    `Review the proposed Node.js in the editor (the compiled engine SQL updates alongside it) — accept it as-is or ask me to refine.\n\n` +
    `Any follow-up questions before you confirm?`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function proposeEdit(request: LlmEditRequest): Promise<LlmEditResponse> {
  await delay(MOCK_DELAY);

  const latestUserMessage = [...request.conversation]
    .reverse()
    .find((m) => m.role === 'user');

  if (!latestUserMessage) {
    return { reply: 'No user message found in conversation.' };
  }

  const isFollowUp = request.conversation.filter((m) => m.role === 'assistant').length > 0;
  const intent     = parseIntent(latestUserMessage.content);
  const { proposed_node, proposed_sql, diff_summary } = buildMockDiff(
    request.moduleNode ?? '',
    request.moduleSql,
    intent,
  );
  const reply = buildReply(intent, diff_summary, isFollowUp);

  return {
    reply,
    proposed_node,
    proposed_sql,
    diff_summary,
    rationale: `Mock rationale: ${diff_summary} Surrounding logic preserved.`,
    location_hint: 'See highlighted line in the editor.',
  };
}
