export type UserRole = 'risk_analyst' | 'tester' | 'admin' | 'risk_lead' | 'testing_lead' | 'it_team';

export type RiskEditStage =
  | 'draft'
  | 'ready_for_uat'
  | 'uat_in_progress'
  | 'qa_review'
  | 'approved'
  | 'sent_to_it'
  | 'live'
  | 'rejected';

export type VersionSource = 'ai_proposal' | 'human_edit';
export type UatRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type UatVerdict = 'approved' | 'rejected' | 'changes_requested';
export type TestCaseStatus = 'passed' | 'failed' | 'inconclusive';
// v0.4.3 Line 4 — outcome a tester records when executing a case by hand in the
// manual UAT lane. 'pending' = not yet executed; 'blocked' = could not run.
export type ManualCaseStatus = 'pending' | 'passed' | 'failed' | 'blocked';
export type PacketStatus = 'proposed' | 'confirmed' | 'rejected' | 'live';
// v0.4.3 Line 5 — IT-owned deployment lifecycle a packet moves through while it is
// with IT (packet.status stays 'confirmed' until deploy flips it to 'live').
export type ITDeployStatus = 'received' | 'in_development' | 'deployed_to_live';

// ── Core entities ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_seed: string;
}

export interface EngineModule {
  id: string;
  module_name: string;
  description: string;
  // Dual representation (v0.4.3): analysts read/author in Node.js; current_sql_code
  // is the compiled target that runs in the live engine. Both are kept in sync.
  current_node_code: string;
  current_sql_code: string;
  updated_at: string;
  updated_by: string;
}

export interface RiskEdit {
  id: string;
  edit_id_display: string;
  title: string;
  natural_language_brief: string;
  target_module_id: string;
  current_stage: RiskEditStage;
  created_by: string;
  created_at: string;
  updated_at: string;
  rejection_notes?: string;
  cases_reviewed?: boolean;       // v0.4.1: gate for Send to AI UAT
}

export interface RiskEditVersion {
  id: string;
  risk_edit_id: string;
  version_number: number;
  // Node.js is the authored representation (v0.4.3); sql_* is the compiled engine
  // target. node_* are optional until an edit is authored through the chatbox flow.
  node_before?: string;
  node_after?: string;
  sql_before: string;
  sql_after: string;
  diff_summary: string;
  ai_rationale: string;
  author_id: string;
  source: VersionSource;
  created_at: string;
}

export interface TestCase {
  id: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  status: TestCaseStatus;
  frontend_render_ok: boolean;
  annotation?: string;
}

export interface UatReportSummary {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  frontend_ok: number;
  frontend_not_ok: number;
}

export interface UatReport {
  test_cases: TestCase[];
  summary: UatReportSummary;
  screenshot_refs: string[];
  generated_at: string;
}

export interface ProposedTestCase {
  id: string;
  risk_edit_id: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  source: 'ai' | 'human';
  included_in_run: boolean;
  proposed_by: string;          // 'system' for AI-generated, userId for human-added
  created_at: string;
  // v0.4.3 Line 4 — manual UAT execution record. The curated case list IS the plan
  // the tester executes by hand; the result is captured back onto the case. All
  // optional so existing seed cases need no migration.
  manual_status?: ManualCaseStatus;
  manual_actual?: string;       // observed outcome the tester recorded (free text)
  manual_note?: string;         // tester commentary on this case
  executed_by?: string;         // userId of the tester who ran it
  executed_at?: string;
}

// v0.4.3 Line 4 — an AI-surfaced coverage gap ("a case you might miss"). Advisory
// only; the tester turns one into a real case with a single click. Not persisted as
// an entity — produced on demand by testCaseProposer.proposeCoverageCritique.
export interface CoverageGap {
  id: string;
  area: string;                 // short label for the kind of gap (e.g. "Boundary")
  gap: string;                  // the missing scenario, in plain language
  suggested_description: string;
  suggested_input: Record<string, unknown>;
  suggested_expected: Record<string, unknown>;
}

export interface UatRun {
  id: string;
  risk_edit_id: string;
  version_id: string;
  status: UatRunStatus;
  started_at: string;
  completed_at: string | null;
  ai_report_json: UatReport | null;
  screenshot_refs: string[];
}

export interface UatReview {
  id: string;
  uat_run_id: string;
  reviewer_id: string;
  annotations_json: Record<string, unknown>;
  edits_to_report_json: Partial<UatReport>;
  final_verdict: UatVerdict;
  decided_at: string;
  rejection_notes?: string;
}

export interface ITHandoffPacket {
  id: string;
  risk_edit_id: string;
  version_id: string;
  packet_json: Record<string, unknown>;
  risk_author_id: string;
  qa_approver_id: string;
  sent_at: string;
  sent_by: string;
}

// ── Packet entities (v0.3) ────────────────────────────────────────────────────

export interface Packet {
  id: string;
  name: string;
  description?: string;
  status: PacketStatus;
  created_by: string;
  created_at: string;
  confirmed_by?: string;
  confirmed_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_notes?: string;
  lived_by?: string;
  lived_at?: string;
  // v0.4.3 Line 5 — IT deployment lifecycle (bidirectional handoff). Tracked while
  // the packet is with IT; surfaced back on the changelog + originating edits.
  // lived_by / lived_at double as the deployed_to_live actor + timestamp.
  it_status?: ITDeployStatus;
  received_by?: string;
  received_at?: string;
  dev_started_by?: string;
  dev_started_at?: string;
  release_ref?: string;         // IT's release/deployment reference, e.g. "REL-2026-06-15.1"
}

export interface PacketEdit {
  id: string;
  packet_id: string;
  risk_edit_id: string;
  added_by: string;
  added_at: string;
}

export interface UatContextAttachment {
  id: string;
  risk_edit_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_base64: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface QaReviewAttachment {
  id: string;
  uat_run_id: string;
  test_case_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_base64: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  payload_json: Record<string, unknown>;
  created_at: string;
}

// ── AI chat types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposed_node?: string;   // v0.4.3: Node.js snippet shown to the analyst
  proposed_sql?: string;    // compiled engine target
  diff_summary?: string;
  rationale?: string;
  created_at: string;
}

export interface ChatMessageEntity {
  id: string;
  risk_edit_id: string;
  role: 'user' | 'assistant';
  content: string;
  proposed_node?: string;   // v0.4.3: Node.js snippet shown to the analyst
  proposed_sql?: string;    // compiled engine target
  diff_summary?: string;
  rationale?: string;
  author_id: string | null;
  created_at: string;
}

// ── Overview chatbox (v0.4.1a) ────────────────────────────────────────────────
// Separate from ChatMessage(Entity) — semantics differ (consultative vs
// SQL-proposal). Kept distinct intentionally; do not unify.

export interface OverviewChatThread {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  resulting_risk_edit_id?: string;   // set after transmute (Issue 2B)
}

export interface OverviewChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  suggested_module_id?: string;
  suggested_title?: string;
  suggested_brief?: string;
  created_at: string;
}

// ── LLM integration types (Phase 2: real schema passed as dbContext) ──────────

export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DatabaseTable {
  schema: string;
  name: string;
  columns: DatabaseColumn[];
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
  source_description: string;
}

export interface LlmEditRequest {
  conversation: ChatMessage[];
  moduleNode?: string;   // v0.4.3: Node.js source the analyst is editing
  moduleSql: string;
  moduleContext: string;
  dbContext?: DatabaseSchema;
}

export interface LlmEditResponse {
  reply: string;
  proposed_node?: string;   // v0.4.3: Node.js snippet shown to the analyst
  proposed_sql?: string;    // compiled engine target
  diff_summary?: string;
  rationale?: string;
  location_hint?: string;
}

// ── UAT runner types ──────────────────────────────────────────────────────────

export interface UatRunRequest {
  versionId: string;
  riskEditId: string;
  includedCases?: ProposedTestCase[];   // v0.4.1: cases curated by tester
}

// ── IT handoff types ──────────────────────────────────────────────────────────

export interface HandoffSummary {
  change_title: string;
  target_module: string;
  risk_author: string;
  qa_approver: string;
  approved_at: string;
  diff_summary: string;
  test_cases_passed: number;
  test_cases_total: number;
}
