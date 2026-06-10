import type { Packet, ITDeployStatus } from '@/types';

// v0.4.3 Line 5 — shared IT deployment-lifecycle helpers, used by the IT Handoff
// Log (where IT drives the lifecycle) and the risk-facing surfaces that mirror it
// back (changelog "Sent to IT" + the risk-edits deployment line).

export const IT_DEPLOY_STEPS: ITDeployStatus[] = ['received', 'in_development', 'deployed_to_live'];

// A 'live' packet is deployed; a 'confirmed' packet with no it_status is awaiting
// receipt (undefined). Any other status is not in the IT lifecycle.
export function effectiveItStatus(p: Packet): ITDeployStatus | undefined {
  if (p.status === 'live') return 'deployed_to_live';
  return p.it_status;
}

// i18n keys (under the it_handoff namespace) for each lifecycle state, including
// the implicit "awaiting receipt" state a freshly-confirmed packet sits in.
export const IT_STATUS_LABEL_KEY: Record<ITDeployStatus | 'awaiting', string> = {
  awaiting:         'it_handoff.it_awaiting',
  received:         'it_handoff.it_received',
  in_development:   'it_handoff.it_in_development',
  deployed_to_live: 'it_handoff.it_deployed',
};
