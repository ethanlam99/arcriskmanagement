// INTEGRATION STUB — Phase 2 will replace with real email/Slack/ticketing notification to IT. Do not call external services here.
//
// Phase 2 notes:
//   - notifyIT() will send an email or post a Slack message with the packet summary.
//   - Consider a webhook to the IT team's ITSM (ServiceNow, Jira, etc.).
//   - downloadPacket() URL will become a signed storage URL in Phase 2.

import type { Repository } from '@/data/repository';
import type { ITHandoffPacket, HandoffSummary } from '@/types';

let _repo: Repository | null = null;

export function initItHandoff(repo: Repository) {
  _repo = repo;
}

function assertRepo() {
  if (!_repo) throw new Error('itHandoff not initialised — call initItHandoff(repo) first');
  return _repo;
}

export async function packageChangeForIT(
  riskEditId: string,
  actorId: string
): Promise<ITHandoffPacket> {
  const repo = assertRepo();

  const edit = await repo.riskEdits.get(riskEditId);
  if (!edit) throw new Error(`RiskEdit ${riskEditId} not found`);

  const allRuns = await repo.uatRuns.list();
  const run = allRuns
    .filter((r) => r.risk_edit_id === riskEditId && r.status === 'completed')
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];

  if (!run) throw new Error('No completed UAT run found for this edit');

  const reviews = await repo.uatReviews.list();
  const review = reviews.find((r) => r.uat_run_id === run.id && r.final_verdict === 'approved');
  if (!review) throw new Error('No approved UAT review found');

  const versions = await repo.riskEditVersions.list();
  const version = versions
    .filter((v) => v.risk_edit_id === riskEditId)
    .sort((a, b) => b.version_number - a.version_number)[0];

  if (!version) throw new Error('No version found for this edit');

  const author = await repo.users.get(edit.created_by);
  const approver = await repo.users.get(review.reviewer_id);
  const module = await repo.engineModules.get(edit.target_module_id);

  const summary: HandoffSummary = {
    change_title:       edit.title,
    target_module:      module?.module_name ?? edit.target_module_id,
    risk_author:        author?.name ?? edit.created_by,
    qa_approver:        approver?.name ?? review.reviewer_id,
    approved_at:        review.decided_at,
    diff_summary:       version.diff_summary,
    test_cases_passed:  run.ai_report_json?.summary.passed ?? 0,
    test_cases_total:   run.ai_report_json?.summary.total ?? 0,
  };

  const packet = await repo.itHandoffPackets.create({
    risk_edit_id:   riskEditId,
    version_id:     version.id,
    risk_author_id: edit.created_by,
    qa_approver_id: review.reviewer_id,
    sent_at:        new Date().toISOString(),
    sent_by:        actorId,
    packet_json: {
      summary,
      diff: `- ${version.sql_before}\n+ ${version.sql_after}`,
      uat_report_ref: run.id,
      deployment_notes:
        'Review the diff and apply to the target stored procedure/function. No schema migration required unless noted. Test in staging before production.',
    },
  });

  await repo.auditLog.append({
    actor_id:     actorId,
    action:       'it_handoff_packet.created',
    entity_type:  'it_handoff_packet',
    entity_id:    packet.id,
    payload_json: { risk_edit_id: riskEditId },
  });

  return packet;
}

// Phase 2: replace with real notification delivery
export async function notifyIT(_packetId: string): Promise<void> {
  // no-op in Phase 1
  console.info('[ARC] notifyIT called — no-op in Phase 1. Phase 2: wire email/Slack/ITSM.');
}

export function buildPacketDownloadData(packet: ITHandoffPacket): string {
  return JSON.stringify(packet.packet_json, null, 2);
}
