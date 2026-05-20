// INTEGRATION STUB — Phase 2 will replace with real sandbox apply + sample-case execution + frontend-render capture. Do not call external services here.
//
// Phase 2 notes:
//   - Apply the SQL diff to an isolated engine sandbox (SQL Server dev instance or container).
//   - Run the seeded customer sample cases against the sandbox.
//   - Capture frontend display via headless browser against the customer-facing app.
//   - Return structured UatReport including real screenshot refs.

import type { UatReport, UatRunRequest, TestCase } from '@/types';
import seedData from '@/data/seed.json';

const SIMULATED_DELAY_MS = 2500;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Build a UatReport from the tester-curated proposed cases. First case fails
// 5% of the time for demo realism; all others pass. Frontend renders pass
// except for one in four cases.
function buildReportFromIncluded(request: UatRunRequest): UatReport | null {
  if (!request.includedCases || request.includedCases.length === 0) return null;

  const generated_at = new Date().toISOString();
  const test_cases: TestCase[] = request.includedCases.map((p, idx) => {
    const isFirstAndUnlucky = idx === 0 && Math.random() < 0.05;
    const status: TestCase['status'] = isFirstAndUnlucky ? 'failed' : 'passed';
    return {
      id:                  `tc-${p.id}`,
      description:         p.description,
      input:               p.input,
      expected:            p.expected,
      actual:              status === 'passed' ? p.expected : { ...p.expected, _drift: 'unexpected_value' },
      status,
      frontend_render_ok:  idx % 4 !== 3,
    };
  });

  const passed = test_cases.filter((c) => c.status === 'passed').length;
  const failed = test_cases.filter((c) => c.status === 'failed').length;
  const inconclusive = test_cases.filter((c) => c.status === 'inconclusive').length;
  const frontend_ok = test_cases.filter((c) => c.frontend_render_ok).length;

  return {
    generated_at,
    screenshot_refs: ['screenshot-generic-before.png', 'screenshot-generic-after.png'],
    summary: {
      total:           test_cases.length,
      passed,
      failed,
      inconclusive,
      frontend_ok,
      frontend_not_ok: test_cases.length - frontend_ok,
    },
    test_cases,
  };
}

export async function runUat(request: UatRunRequest): Promise<UatReport> {
  await delay(SIMULATED_DELAY_MS);

  // If the tester curated a case list, build the report from it.
  const fromIncluded = buildReportFromIncluded(request);
  if (fromIncluded) return fromIncluded;

  // Return a seeded fixture if one exists for this strategy change
  const existingRun = seedData.uat_runs.find(
    (r) => r.risk_edit_id === request.riskEditId && r.ai_report_json
  );

  if (existingRun?.ai_report_json) {
    return existingRun.ai_report_json as UatReport;
  }

  // Generic fallback fixture
  const generated_at = new Date().toISOString();
  return {
    generated_at,
    screenshot_refs: ['screenshot-generic-before.png', 'screenshot-generic-after.png'],
    summary: {
      total: 4,
      passed: 3,
      failed: 0,
      inconclusive: 1,
      frontend_ok: 3,
      frontend_not_ok: 1,
    },
    test_cases: [
      {
        id: 'tc-gen-01',
        description: 'Baseline customer case — expected output unchanged',
        input: { customer_id: 10001, scenario: 'baseline' },
        expected: { result: 'pass' },
        actual: { result: 'pass' },
        status: 'passed',
        frontend_render_ok: true,
      },
      {
        id: 'tc-gen-02',
        description: 'Edge case — value at boundary of changed parameter',
        input: { customer_id: 10002, scenario: 'boundary' },
        expected: { result: 'pass' },
        actual: { result: 'pass' },
        status: 'passed',
        frontend_render_ok: true,
      },
      {
        id: 'tc-gen-03',
        description: 'High-value customer — confirm no regression',
        input: { customer_id: 10003, scenario: 'high_value' },
        expected: { result: 'pass' },
        actual: { result: 'pass' },
        status: 'passed',
        frontend_render_ok: false,
      },
      {
        id: 'tc-gen-04',
        description: 'New parameter range — output requires manual verification',
        input: { customer_id: 10004, scenario: 'new_range' },
        expected: { result: 'tbd' },
        actual: { result: 'tbd' },
        status: 'inconclusive',
        frontend_render_ok: true,
      },
    ],
  };
}
