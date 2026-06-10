// INTEGRATION STUB — Phase 2 will replace with real AI agent reading the
// core risk codebase and proposing test cases. Do not call external services here.
//
// Phase 2 notes:
//   - Agent reads the full SQL of the target module + sibling modules for context.
//   - Agent enumerates likely edge cases, boundary conditions, and regression
//     scenarios based on the diff being proposed.
//   - Returns 3–10 proposed cases with description/input/expected.

import type { CoverageGap, ProposedTestCase, RiskEdit } from '@/types';
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

// ── Coverage critique ("cases you might miss") ────────────────────────────────
// v0.4.3 Line 4. The standout tester-facing AI outcome in the manual UAT lane:
// the AI reviews the curated plan and flags scenarios that look unguarded. Each
// gap carries a ready-made case so the tester can add it with one click.
//
// Phase 2 notes: a real agent would diff the proposed change against the module's
// branch/boundary structure and the already-included cases, then reason about what
// is provably untested. The fixtures below are hand-authored to complement the
// 3 proposed cases per module above (they target scenarios those 3 don't cover).
type FixtureGap = Pick<CoverageGap, 'area' | 'gap' | 'suggested_description' | 'suggested_input' | 'suggested_expected'>;

const CRITIQUE_BY_MODULE: Record<string, FixtureGap[]> = {
  // module-001 — loan_limit_rules
  'module-001': [
    {
      area: 'Boundary',
      gap: 'No case sits just below the 20M income bracket — an off-by-one here would silently mis-bracket customers.',
      suggested_description: 'Income one rupiah under the 20M bracket — must stay in the lower bracket',
      suggested_input:    { customer_id: 10004, monthly_income: 19999999, employment_type: 'salaried', tenure_months: 24, credit_score: 720 },
      suggested_expected: { loan_limit_bracket: '10M-20M', applied_multiplier: 25.0 },
    },
    {
      area: 'Segment',
      gap: 'Self-employed applicants are never exercised; the multiplier path for non-salaried income is unverified.',
      suggested_description: 'Self-employed customer — non-salaried multiplier path',
      suggested_input:    { customer_id: 10005, monthly_income: 15000000, employment_type: 'self_employed', tenure_months: 24, credit_score: 700 },
      suggested_expected: { income_verification: 'required', applied_multiplier: 20.0 },
    },
  ],
  // module-002 — leverage_ratio_rules
  'module-002': [
    {
      area: 'Boundary',
      gap: 'No case lands exactly on the new tighter leverage ceiling — the inclusive/exclusive edge is untested.',
      suggested_description: 'SME customer exactly at the new leverage ceiling — boundary inclusive',
      suggested_input:    { customer_id: 20004, segment: 'sme', total_debt: 600000000, monthly_income: 80000000 },
      suggested_expected: { within_cap: true, at_ceiling: true },
    },
    {
      area: 'Regression',
      gap: 'Retail customers below the cap are checked, but none confirm the cap value itself is unchanged for retail.',
      suggested_description: 'Retail customer at prior cap — confirm retail ceiling did not move',
      suggested_input:    { customer_id: 20005, segment: 'retail', total_debt: 60000000, monthly_income: 12000000 },
      suggested_expected: { max_leverage_ratio: 5.0, within_cap: false },
    },
  ],
  // module-003 — repayment_behavior_score
  'module-003': [
    {
      area: 'Boundary',
      gap: 'The A/B band cutoff (score 80) is never hit exactly — a customer right on the threshold is unverified.',
      suggested_description: 'Customer scoring exactly 80 — A/B band cutoff',
      suggested_input:    { customer_id: 30004, on_time_months: 10, missed_months: 2, last_missed_month_ago: 8 },
      suggested_expected: { behavior_score_band: 'A', score_min: 80 },
    },
    {
      area: 'Edge',
      gap: 'Multiple recent missed payments (vs a single one) are not exercised — the penalty stacking is unverified.',
      suggested_description: 'Two missed payments in last quarter — penalty stacking',
      suggested_input:    { customer_id: 30005, on_time_months: 9, missed_months: 3, last_missed_month_ago: 1 },
      suggested_expected: { behavior_score_band: 'C', requires_review: true },
    },
  ],
  // module-004 — kyc_eligibility_rules
  'module-004': [
    {
      area: 'Boundary',
      gap: 'Selfie match exactly at the acceptance threshold is untested — the >= vs > behaviour is unverified.',
      suggested_description: 'Selfie match exactly at threshold — boundary acceptance',
      suggested_input:    { customer_id: 40004, ktp_status: 'verified', selfie_match_score: 0.70 },
      suggested_expected: { kyc_eligible: true, at_threshold: true },
    },
    {
      area: 'Edge',
      gap: 'An expired (not missing) ID document is a distinct branch that no case covers.',
      suggested_description: 'Expired KTP — distinct from missing document',
      suggested_input:    { customer_id: 40005, ktp_status: 'expired', selfie_match_score: 0.91 },
      suggested_expected: { kyc_eligible: false, route: 'document_renewal' },
    },
  ],
  // module-005 — interest_rate_adjustment
  'module-005': [
    {
      area: 'Boundary',
      gap: 'No case checks the rate cap — a high-risk customer whose adjusted rate would exceed the regulatory ceiling is unguarded.',
      suggested_description: 'High-risk customer near the regulatory rate ceiling — must clamp',
      suggested_input:    { customer_id: 50004, risk_band: 'high', base_rate: 0.23 },
      suggested_expected: { adjusted_rate_max: 0.24, clamped_to_ceiling: true },
    },
    {
      area: 'Edge',
      gap: 'A zero or missing base_rate is never exercised — the adjustment maths on a null input is unverified.',
      suggested_description: 'Missing base rate — adjustment should not divide by zero',
      suggested_input:    { customer_id: 50005, risk_band: 'mid', base_rate: null },
      suggested_expected: { error: 'base_rate_required', adjusted_rate: null },
    },
  ],
  // module-006 — credit_utilization_cap
  'module-006': [
    {
      area: 'Boundary',
      gap: 'Utilization one point over the lowered cap is untested — the just-over edge is where breaches first appear.',
      suggested_description: 'Utilization one point over the new cap — first breach',
      suggested_input:    { customer_id: 60004, current_utilization: 0.81, credit_limit: 50000000 },
      suggested_expected: { within_cap: false, over_by_pct: 0.01 },
    },
    {
      area: 'Edge',
      gap: 'A customer over their limit (utilization > 1.0) is a distinct overflow branch no case covers.',
      suggested_description: 'Utilization above 100% — over-limit overflow branch',
      suggested_input:    { customer_id: 60005, current_utilization: 1.15, credit_limit: 30000000 },
      suggested_expected: { within_cap: false, over_limit: true },
    },
  ],
};

const GENERIC_CRITIQUE: FixtureGap[] = [
  {
    area: 'Boundary',
    gap: 'No case sits exactly on the changed threshold — the inclusive/exclusive edge is untested.',
    suggested_description: 'Value exactly at the new threshold — boundary case',
    suggested_input:    { customer_id: 10005, value: 'at_threshold' },
    suggested_expected: { result: 'pass', at_threshold: true },
  },
  {
    area: 'Regression',
    gap: 'No case confirms unrelated customers are unaffected by this change.',
    suggested_description: 'Out-of-scope customer — confirm no behaviour change',
    suggested_input:    { customer_id: 10006, scenario: 'unrelated' },
    suggested_expected: { result: 'pass', unchanged: true },
  },
];

export async function proposeCoverageCritique(edit: RiskEdit): Promise<CoverageGap[]> {
  await delay(SIMULATED_DELAY_MS);
  const gaps = CRITIQUE_BY_MODULE[edit.target_module_id] ?? GENERIC_CRITIQUE;
  // Deterministic ids so the same gap maps to the same dismiss-state across renders.
  return gaps.map((g, idx) => ({ id: `${edit.id}-gap-${idx}`, ...g }));
}

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
