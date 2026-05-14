// INTEGRATION STUB — Phase 2 will replace with real sandbox apply + sample-case execution + frontend-render capture. Do not call external services here.
//
// Phase 2 notes:
//   - Apply the SQL diff to an isolated engine sandbox (SQL Server dev instance or container).
//   - Run the seeded customer sample cases against the sandbox.
//   - Capture frontend display via headless browser against the customer-facing app.
//   - Return structured UatReport including real screenshot refs.

import type { UatReport, UatRunRequest } from '@/types';
import seedData from '@/data/seed.json';

const SIMULATED_DELAY_MS = 2500;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function runUat(request: UatRunRequest): Promise<UatReport> {
  await delay(SIMULATED_DELAY_MS);

  // Return a seeded fixture if one exists for this strategy change
  const existingRun = seedData.uat_runs.find(
    (r) => r.strategy_change_id === request.strategyChangeId && r.ai_report_json
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
