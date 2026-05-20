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
export type PacketStatus = 'proposed' | 'confirmed' | 'rejected' | 'live';

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
  proposed_sql?: string;
  diff_summary?: string;
  rationale?: string;
  created_at: string;
}

export interface ChatMessageEntity {
  id: string;
  risk_edit_id: string;
  role: 'user' | 'assistant';
  content: string;
  proposed_sql?: string;
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
  moduleSql: string;
  moduleContext: string;
  dbContext?: DatabaseSchema;
}

export interface LlmEditResponse {
  reply: string;
  proposed_sql?: string;
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
