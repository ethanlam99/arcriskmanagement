import type {
  User,
  EngineModule,
  RiskEdit,
  RiskEditVersion,
  UatRun,
  UatReview,
  ITHandoffPacket,
  Packet,
  PacketEdit,
  AuditLogEntry,
  ChatMessageEntity,
  UatContextAttachment,
  QaReviewAttachment,
  ProposedTestCase,
} from '@/types';

// ── Generic repo shape ────────────────────────────────────────────────────────

export interface EntityRepo<T> {
  list(filters?: Partial<Record<string, unknown>>): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(input: Omit<T, 'id' | 'created_at'>): Promise<T>;
  update(id: string, input: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

// ── Audit log is append-only — no update/delete ───────────────────────────────

export interface AuditLogRepo {
  list(filters?: {
    entity_type?: string;
    entity_id?: string;
    actor_id?: string;
  }): Promise<AuditLogEntry[]>;
  append(
    entry: Omit<AuditLogEntry, 'id' | 'created_at'>
  ): Promise<AuditLogEntry>;
}

// ── Users are read-only from the UI perspective ───────────────────────────────

export interface UserRepo {
  list(): Promise<User[]>;
  get(id: string): Promise<User | null>;
}

// ── Chat message repo ─────────────────────────────────────────────────────────

export interface ChatMessageRepo {
  listByChange(riskEditId: string): Promise<ChatMessageEntity[]>;
  append(message: Omit<ChatMessageEntity, 'id'>): Promise<ChatMessageEntity>;
}

// ── Proposed test case repo — adds a listForEdit helper for the UAT review gate

export interface ProposedTestCaseRepo extends EntityRepo<ProposedTestCase> {
  listForEdit(riskEditId: string): Promise<ProposedTestCase[]>;
}

// ── Packet repo — enforces the one-active-packet-per-edit business rule ───────

export interface PacketRepo extends EntityRepo<Packet> {
  // Business rule: a risk_edit_id may appear in at most one packet with status
  // 'proposed' or 'confirmed'. Enforced in the localStorage implementation;
  // Phase 2 enforces via DB unique partial index.
  addEditsToPacket(packetId: string, riskEditIds: string[], addedBy: string): Promise<PacketEdit[]>;
  getEditsForPacket(packetId: string): Promise<PacketEdit[]>;
  releaseEditsFromPacket(packetId: string): Promise<void>;
}

// ── The central Repository contract ──────────────────────────────────────────
// Phase 2: write SupabaseRepository implementing this interface and swap
// one line in RepositoryProvider.tsx.

export interface Repository {
  users: UserRepo;
  engineModules: EntityRepo<EngineModule>;
  riskEdits: EntityRepo<RiskEdit>;
  riskEditVersions: EntityRepo<RiskEditVersion>;
  uatRuns: EntityRepo<UatRun>;
  uatReviews: EntityRepo<UatReview>;
  itHandoffPackets: EntityRepo<ITHandoffPacket>;
  packets: PacketRepo;
  packetEdits: EntityRepo<PacketEdit>;
  auditLog: AuditLogRepo;
  chatMessages: ChatMessageRepo;
  uatContextAttachments: EntityRepo<UatContextAttachment>;
  qaReviewAttachments: EntityRepo<QaReviewAttachment>;
  proposedTestCases: ProposedTestCaseRepo;
}
