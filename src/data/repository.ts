import type {
  User,
  EngineModule,
  StrategyChange,
  StrategyChangeVersion,
  UatRun,
  UatReview,
  ITHandoffPacket,
  AuditLogEntry,
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

// ── The central Repository contract ──────────────────────────────────────────
// Phase 2: write SupabaseRepository implementing this interface and swap
// one line in RepositoryProvider.tsx.

export interface Repository {
  users: UserRepo;
  engineModules: EntityRepo<EngineModule>;
  strategyChanges: EntityRepo<StrategyChange>;
  strategyChangeVersions: EntityRepo<StrategyChangeVersion>;
  uatRuns: EntityRepo<UatRun>;
  uatReviews: EntityRepo<UatReview>;
  itHandoffPackets: EntityRepo<ITHandoffPacket>;
  auditLog: AuditLogRepo;
}
