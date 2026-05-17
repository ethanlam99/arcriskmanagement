import type {
  Repository,
  EntityRepo,
  AuditLogRepo,
  UserRepo,
  ChatMessageRepo,
  PacketRepo,
} from './repository';
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
} from '@/types';
import { generateEditIdDisplay } from './editIdGenerator';
import seedData from './seed.json';

// ── localStorage keys ─────────────────────────────────────────────────────────

const KEYS = {
  users:             'arc:users',
  engineModules:     'arc:engine_modules',
  riskEdits:         'arc:risk_edits',
  riskEditVersions:  'arc:risk_edit_versions',
  uatRuns:           'arc:uat_runs',
  uatReviews:        'arc:uat_reviews',
  itHandoffPackets:  'arc:it_handoff_packets',
  packets:           'arc:packets',
  packetEdits:       'arc:packet_edits',
  auditLog:          'arc:audit_log',
  chatMessages:      'arc:chat_messages',
  // Versioned seed key — bump to force reseed after schema changes
  seeded:            'arc:seeded_v3',
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
  // Clear any stale v0.1/v0.2 data before seeding
  Object.keys(localStorage)
    .filter((k) => k.startsWith('aegis:') || k.startsWith('arc:'))
    .forEach((k) => localStorage.removeItem(k));
  save(KEYS.users,            (seedData as Record<string, unknown[]>).users);
  save(KEYS.engineModules,    (seedData as Record<string, unknown[]>).engine_modules);
  save(KEYS.riskEdits,        (seedData as Record<string, unknown[]>).risk_edits);
  save(KEYS.riskEditVersions, (seedData as Record<string, unknown[]>).risk_edit_versions);
  save(KEYS.uatRuns,          (seedData as Record<string, unknown[]>).uat_runs);
  save(KEYS.uatReviews,       (seedData as Record<string, unknown[]>).uat_reviews);
  save(KEYS.itHandoffPackets, (seedData as Record<string, unknown[]>).it_handoff_packets);
  save(KEYS.packets,          (seedData as Record<string, unknown[]>).packets);
  save(KEYS.packetEdits,      (seedData as Record<string, unknown[]>).packet_edits);
  save(KEYS.auditLog,         (seedData as Record<string, unknown[]>).audit_log);
  save(KEYS.chatMessages,     (seedData as Record<string, unknown[]>).chat_messages);
  localStorage.setItem(KEYS.seeded, '1');
}

export function resetToSeedData(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('arc:') || k.startsWith('aegis:'))
    .forEach((k) => localStorage.removeItem(k));
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
      const updated = { ...rows[idx], ...input, updated_at: now() };
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

// ── RiskEdit repo — overrides create to inject edit_id_display ────────────────

function makeRiskEditRepo(): EntityRepo<RiskEdit> {
  const base = makeRepo<RiskEdit>(KEYS.riskEdits);
  return {
    ...base,
    async create(input) {
      const rows = load<RiskEdit>(KEYS.riskEdits);
      const record: RiskEdit = {
        ...input,
        id: uid(),
        edit_id_display: generateEditIdDisplay(),
        created_at: now(),
      } as RiskEdit;
      rows.push(record);
      save(KEYS.riskEdits, rows);
      return record;
    },
  };
}

// ── Packet repo — enforces one-active-packet-per-edit rule ───────────────────

function makePacketRepo(): PacketRepo {
  const base = makeRepo<Packet>(KEYS.packets);

  function isActive(status: Packet['status']): boolean {
    return status === 'proposed' || status === 'confirmed';
  }

  return {
    ...base,

    async addEditsToPacket(packetId, riskEditIds, addedBy) {
      const allPacketEdits = load<PacketEdit>(KEYS.packetEdits);
      const allPackets = load<Packet>(KEYS.packets);

      // Business rule: each edit may only be in one active packet at a time
      for (const riskEditId of riskEditIds) {
        const conflict = allPacketEdits.find((pe) => {
          if (pe.risk_edit_id !== riskEditId) return false;
          const pkt = allPackets.find((p) => p.id === pe.packet_id);
          return pkt && isActive(pkt.status);
        });
        if (conflict) {
          throw new Error(
            `Risk edit ${riskEditId} is already in an active packet (${conflict.packet_id})`
          );
        }
      }

      const newEdges = riskEditIds.map<PacketEdit>((riskEditId) => ({
        id: uid(),
        packet_id: packetId,
        risk_edit_id: riskEditId,
        added_by: addedBy,
        added_at: now(),
      }));

      save(KEYS.packetEdits, [...allPacketEdits, ...newEdges]);
      return newEdges;
    },

    async getEditsForPacket(packetId) {
      return load<PacketEdit>(KEYS.packetEdits).filter(
        (pe) => pe.packet_id === packetId
      );
    },

    async releaseEditsFromPacket(_packetId) {
      // packet_edits rows are kept for audit; the rejected packet's status
      // naturally excludes its edits from the Approved Pool query.
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

// ── Chat message repo ─────────────────────────────────────────────────────────

function makeChatMessageRepo(): ChatMessageRepo {
  return {
    async listByChange(riskEditId) {
      return load<ChatMessageEntity>(KEYS.chatMessages)
        .filter((m) => m.risk_edit_id === riskEditId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async append(message) {
      const rows = load<ChatMessageEntity>(KEYS.chatMessages);
      const record: ChatMessageEntity = { ...message, id: uid() };
      rows.push(record);
      save(KEYS.chatMessages, rows);
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
    users:            makeUserRepo(),
    engineModules:    makeRepo<EngineModule>(KEYS.engineModules),
    riskEdits:        makeRiskEditRepo(),
    riskEditVersions: makeRepo<RiskEditVersion>(KEYS.riskEditVersions),
    uatRuns:          makeRepo<UatRun>(KEYS.uatRuns),
    uatReviews:       makeRepo<UatReview>(KEYS.uatReviews),
    itHandoffPackets: makeRepo<ITHandoffPacket>(KEYS.itHandoffPackets),
    packets:          makePacketRepo(),
    packetEdits:      makeRepo<PacketEdit>(KEYS.packetEdits),
    auditLog:         makeAuditLogRepo(),
    chatMessages:     makeChatMessageRepo(),
  };
}
