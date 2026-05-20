// INTEGRATION STUB — Phase 2 will replace with real AI agent reading the
// core risk codebase and proposing test cases. Do not call external services here.
//
// Phase 2 notes:
//   - Agent reads the full SQL of the target module + sibling modules for context.
//   - Agent enumerates likely edge cases, boundary conditions, and regression
//     scenarios based on the diff being proposed.
//   - Returns 3–10 proposed cases with description/input/expected.

import type { ProposedTestCase, RiskEdit } from '@/types';
import type { Repository } from '@/data/repository';

const SIMULATED_DELAY_MS = 800;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type FixtureCase = Pick<ProposedTestCase, 'description' | 'input' | 'expected'>;

// Per-module fixture map. Keys match seeded module IDs in src/data/seed.json.
// 3 proposed cases per module — enough to demonstrate the review flow without
// overwhelming the tester drawer.
const FIXTURE_BY_MODULE: Record<string, FixtureCase[]> = {
  // module-001 — loan_limit_rules
  'module-001': [
    {
      description: 'Customer at exact income-bracket boundary — limit recalculation',
      input:    { customer_id: 10001, monthly_income: 20000000, employment_type: 'salaried', tenure_months: 24, credit_score: 720 },
      expected: { loan_limit_bracket: '20M+', applied_multiplier: 30.0 },
    },
    {
      description: 'New customer under 6 months tenure — 50% haircut should apply',
      input:    { customer_id: 10002, monthly_income: 8000000, employment_type: 'salaried', tenure_months: 3, credit_score: 680 },
      expected: { tenure_haircut: 0.5, limit_adjusted: true },
    },
    {
      description: 'Sub-500 credit score — falls back to floor limit',
      input:    { customer_id: 10003, monthly_income: 15000000, employment_type: 'salaried', tenure_months: 36, credit_score: 480 },
      expected: { loan_limit: 1000000, fallback: 'floor' },
    },
  ],
  // module-002 — leverage_ratio_rules
  'module-002': [
    {
      description: 'Retail segment customer at standard leverage cap',
      input:    { customer_id: 20001, segment: 'retail', total_debt: 50000000, monthly_income: 12000000 },
      expected: { max_leverage_ratio: 5.0, within_cap: true },
    },
    {
      description: 'SME customer exceeding new tighter leverage ceiling',
      input:    { customer_id: 20002, segment: 'sme', total_debt: 800000000, monthly_income: 80000000 },
      expected: { within_cap: false, rejection_reason: 'leverage_exceeded' },
    },
    {
      description: 'Corporate customer — leverage rule should not apply',
      input:    { customer_id: 20003, segment: 'corporate', total_debt: 5000000000, monthly_income: 200000000 },
      expected: { rule_applied: false, segment_excluded: 'corporate' },
    },
  ],
  // module-003 — repayment_behavior_score
  'module-003': [
    {
      description: 'Customer with 12 consecutive on-time payments — highest score band',
      input:    { customer_id: 30001, on_time_months: 12, missed_months: 0 },
      expected: { behavior_score_band: 'A', score_min: 90 },
    },
    {
      description: 'Customer with a single recent missed payment',
      input:    { customer_id: 30002, on_time_months: 11, missed_months: 1, last_missed_month_ago: 2 },
      expected: { behavior_score_band: 'B', score_max: 79 },
    },
    {
      description: 'New customer with no payment history yet',
      input:    { customer_id: 30003, on_time_months: 0, missed_months: 0 },
      expected: { behavior_score_band: 'unknown', requires_review: true },
    },
  ],
  // module-004 — kyc_eligibility_rules
  'module-004': [
    {
      description: 'Customer with valid KTP + selfie verification — pass',
      input:    { customer_id: 40001, ktp_status: 'verified', selfie_match_score: 0.92 },
      expected: { kyc_eligible: true },
    },
    {
      description: 'Customer missing ID document — fallback to manual review',
      input:    { customer_id: 40002, ktp_status: 'missing', selfie_match_score: null },
      expected: { kyc_eligible: false, route: 'manual_review' },
    },
    {
      description: 'Selfie match below threshold but ID verified',
      input:    { customer_id: 40003, ktp_status: 'verified', selfie_match_score: 0.55 },
      expected: { kyc_eligible: false, route: 'additional_verification' },
    },
  ],
  // module-005 — interest_rate_adjustment
  'module-005': [
    {
      description: 'High-risk customer — adjustment increases rate by full premium',
      input:    { customer_id: 50001, risk_band: 'high', base_rate: 0.18 },
      expected: { adjusted_rate_min: 0.22 },
    },
    {
      description: 'Prime customer — adjustment leaves rate near base',
      input:    { customer_id: 50002, risk_band: 'prime', base_rate: 0.12 },
      expected: { adjusted_rate_max: 0.13 },
    },
    {
      description: 'Mid-band customer at exact threshold of premium tier',
      input:    { customer_id: 50003, risk_band: 'mid', base_rate: 0.15, threshold: 'upper_mid' },
      expected: { adjusted_rate_min: 0.16, adjusted_rate_max: 0.17 },
    },
  ],
  // module-006 — credit_utilization_cap
  'module-006': [
    {
      description: 'Customer at exact utilization cap — boundary case',
      input:    { customer_id: 60001, current_utilization: 0.80, credit_limit: 50000000 },
      expected: { within_cap: true, headroom: 0 },
    },
    {
      description: 'Customer above lowered utilization cap',
      input:    { customer_id: 60002, current_utilization: 0.85, credit_limit: 50000000 },
      expected: { within_cap: false, over_by_pct: 0.05 },
    },
    {
      description: 'Customer with no outstanding balance',
      input:    { customer_id: 60003, current_utilization: 0.0, credit_limit: 30000000 },
      expected: { within_cap: true, headroom: 30000000 },
    },
  ],
};

const GENERIC_FALLBACK: FixtureCase[] = [
  { description: 'Baseline customer case — expected output unchanged', input: { customer_id: 10001 }, expected: { result: 'pass' } },
  { description: 'Boundary case at the new threshold', input: { customer_id: 10002, value: 'at_threshold' }, expected: { result: 'pass' } },
  { description: 'Out-of-bound case — should reject', input: { customer_id: 10003, value: 'above_threshold' }, expected: { result: 'fail' } },
];

export async function proposeTestCases(
  edit: RiskEdit,
): Promise<Array<Omit<ProposedTestCase, 'id' | 'created_at'>>> {
  await delay(SIMULATED_DELAY_MS);

  const fixture = FIXTURE_BY_MODULE[edit.target_module_id] ?? GENERIC_FALLBACK;
  return fixture.map((c) => ({
    risk_edit_id:    edit.id,
    description:     c.description,
    input:           c.input,
    expected:        c.expected,
    source:          'ai',
    included_in_run: true,
    proposed_by:     'system',
  }));
}

// Helper used by every site that transitions an edit into ready_for_uat
// (DraftQueue Send-for-UAT, UAT on-failure rollback, admin Unstick).
// Idempotent: if proposed cases already exist for the edit, skip the proposer
// call and the audit log entry so recovery transitions don't duplicate cases.
//
// Returns whether the proposer actually ran, so callers can invalidate the
// right queries.
export async function ensureProposedCasesForReadyForUat(
  repo: Repository,
  edit: RiskEdit,
): Promise<{ proposed: boolean; count: number }> {
  const existing = await repo.proposedTestCases.listForEdit(edit.id);
  if (existing.length > 0) {
    return { proposed: false, count: existing.length };
  }

  const proposals = await proposeTestCases(edit);
  for (const p of proposals) {
    await repo.proposedTestCases.create(p);
  }
  await repo.auditLog.append({
    actor_id:     'system',
    action:       'test_cases.proposed',
    entity_type:  'risk_edit',
    entity_id:    edit.id,
    payload_json: { count: proposals.length },
  });
  return { proposed: true, count: proposals.length };
}
