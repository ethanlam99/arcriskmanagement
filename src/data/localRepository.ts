import type { Repository, EntityRepo, AuditLogRepo, UserRepo } from './repository';
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
import seedData from './seed.json';

// ── localStorage keys ─────────────────────────────────────────────────────────

const KEYS = {
  users:                   'aegis:users',
  engineModules:           'aegis:engine_modules',
  strategyChanges:         'aegis:strategy_changes',
  strategyChangeVersions:  'aegis:strategy_change_versions',
  uatRuns:                 'aegis:uat_runs',
  uatReviews:              'aegis:uat_reviews',
  itHandoffPackets:        'aegis:it_handoff_packets',
  auditLog:                'aegis:audit_log',
  seeded:                  'aegis:seeded',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Seed ──────────────────────────────────────────────────────────────────────

export function seedIfEmpty(): void {
  if (localStorage.getItem(KEYS.seeded)) return;
  save(KEYS.users,                  seedData.users);
  save(KEYS.engineModules,          seedData.engine_modules);
  save(KEYS.strategyChanges,        seedData.strategy_changes);
  save(KEYS.strategyChangeVersions, seedData.strategy_change_versions);
  save(KEYS.uatRuns,                seedData.uat_runs);
  save(KEYS.uatReviews,             seedData.uat_reviews);
  save(KEYS.itHandoffPackets,       seedData.it_handoff_packets);
  save(KEYS.auditLog,               seedData.audit_log);
  localStorage.setItem(KEYS.seeded, '1');
}

export function resetToSeedData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  seedIfEmpty();
}

// ── Generic localStorage repo factory ────────────────────────────────────────

function makeRepo<T extends { id: string }>(key: string): EntityRepo<T> {
  return {
    async list(filters) {
      let rows = load<T>(key);
      if (filters) {
        rows = rows.filter((row) =>
          Object.entries(filters).every(
            ([k, v]) => v === undefined || (row as Record<string, unknown>)[k] === v
          )
        );
      }
      return rows;
    },

    async get(id) {
      return load<T>(key).find((r) => r.id === id) ?? null;
    },

    async create(input) {
      const rows = load<T>(key);
      const record = {
        ...input,
        id: uid(),
        created_at: now(),
      } as unknown as T;
      rows.push(record);
      save(key, rows);
      return record;
    },

    async update(id, input) {
      const rows = load<T>(key);
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error(`Record ${id} not found in ${key}`);
      const updated = {
        ...rows[idx],
        ...input,
        updated_at: now(),
      };
      rows[idx] = updated;
      save(key, rows);
      return updated;
    },

    async delete(id) {
      const rows = load<T>(key).filter((r) => r.id !== id);
      save(key, rows);
    },
  };
}

// ── Audit log repo ────────────────────────────────────────────────────────────

function makeAuditLogRepo(): AuditLogRepo {
  return {
    async list(filters) {
      let rows = load<AuditLogEntry>(KEYS.auditLog);
      if (filters?.entity_type) rows = rows.filter((r) => r.entity_type === filters.entity_type);
      if (filters?.entity_id)   rows = rows.filter((r) => r.entity_id   === filters.entity_id);
      if (filters?.actor_id)    rows = rows.filter((r) => r.actor_id    === filters.actor_id);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async append(entry) {
      const rows = load<AuditLogEntry>(KEYS.auditLog);
      const record: AuditLogEntry = { ...entry, id: uid(), created_at: now() };
      rows.push(record);
      save(KEYS.auditLog, rows);
      return record;
    },
  };
}

// ── User repo (read-only) ─────────────────────────────────────────────────────

function makeUserRepo(): UserRepo {
  return {
    async list() { return load<User>(KEYS.users); },
    async get(id) { return load<User>(KEYS.users).find((u) => u.id === id) ?? null; },
  };
}

// ── Assemble the repository ───────────────────────────────────────────────────

export function createLocalRepository(): Repository {
  seedIfEmpty();
  return {
    users:                  makeUserRepo(),
    engineModules:          makeRepo<EngineModule>(KEYS.engineModules),
    strategyChanges:        makeRepo<StrategyChange>(KEYS.strategyChanges),
    strategyChangeVersions: makeRepo<StrategyChangeVersion>(KEYS.strategyChangeVersions),
    uatRuns:                makeRepo<UatRun>(KEYS.uatRuns),
    uatReviews:             makeRepo<UatReview>(KEYS.uatReviews),
    itHandoffPackets:       makeRepo<ITHandoffPacket>(KEYS.itHandoffPackets),
    auditLog:               makeAuditLogRepo(),
  };
}
