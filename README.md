# AEGIS — AI-Enabled Governance for Intelligent Strategy

> **This is a Phase 1 proof of concept. All data is local (localStorage). No external systems are contacted.**
> See [Phase 2 extension points](#phase-2-extension-points) for where real services plug in.

AEGIS is a web platform for the Webank risk team to author SQL edits to the core risk engine with AI assistance, run AI-powered UAT, and hand off approved changelogs to the IT team for deployment.

---

## Quick start

```bash
cd Desktop/aegis
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and pick a persona on the login screen.

---

## Persona credentials

No passwords — click any persona card to sign in.

| Name | Email | Role | Access |
|---|---|---|---|
| Ahmad Rizaldi | a.rizaldi@webank.id | `risk_analyst` | Author changes, use AI, send for UAT |
| Siti Nurhaliza | s.nurhaliza@webank.id | `risk_analyst` | Author changes, use AI, send for UAT |
| Budi Santoso | b.santoso@webank.id | `tester` | View + annotate UAT reports, approve/reject |
| Dewi Rahayu | d.rahayu@webank.id | `tester` | View + annotate UAT reports, approve/reject |
| Kevin Lim | k.lim@webank.id | `admin` | All permissions + Reset Demo Data |

---

## Design language tokens

| Token | Hex | Usage |
|---|---|---|
| `aegis-50` | `#EFF8F9` | Page background, input fills |
| `aegis-100` | `#B8E3E9` | Hover tint, selected row bg |
| `aegis-200` | `#93B1B5` | Borders, dividers, placeholder text |
| `aegis-500` | `#4F7C82` | Primary accent — buttons, links, focus rings |
| `aegis-700` | `#2A5158` | Accent hover, active state |
| `aegis-900` | `#0B2E33` | Sidebar bg, primary headings |

Status semantics (do not change):
- **Emerald** = approved / success
- **Amber** = in-progress / pending review
- **Rose** = rejected / failed
- **Zinc** = draft / neutral

Typography: `Inter` for UI, `JetBrains Mono` for SQL and code surfaces.

---

## What's mocked in Phase 1

| Concern | How it's mocked | File |
|---|---|---|
| Database | `localStorage` seeded from `seed.json` | `src/data/localRepository.ts` |
| Auth | Persona picker — no password | `src/auth/AuthProvider.tsx` |
| LLM / AI proposals | Keyword-based rule stub; simulates 1.2s delay | `src/integrations/llm.ts` |
| UAT runner | Returns seeded fixture or generic fallback; 2.5s delay | `src/integrations/uatRunner.ts` |
| Screenshots | Serves `public/mock-screenshots/*.png` placeholders | `src/integrations/screenshots.ts` |
| IT handoff notification | `notifyIT()` is a no-op; packet JSON written to localStorage | `src/integrations/itHandoff.ts` |
| Engine SQL source | Reads from `engine_modules` in localStorage | `src/integrations/engineCodeSource.ts` |

---

## Phase 2 extension points

Every external dependency is behind a typed interface. Swapping Phase 1 mocks for real services is a single-file change each.

### Database → Supabase / Postgres
1. Write `src/data/supabaseRepository.ts` implementing `Repository` from `src/data/repository.ts`
2. Change one line in `src/data/RepositoryProvider.tsx`:
   ```ts
   - const repo = useMemo(() => createLocalRepository(), []);
   + const repo = useMemo(() => createSupabaseRepository(supabaseClient), []);
   ```

### Auth → Real auth provider (SSO / corporate IdP)
- Replace `src/auth/AuthProvider.tsx` implementation only — the `useAuth()` interface stays the same.

### LLM → Real provider (TBD — Indonesian data-residency constraints apply)
- Replace the export body of `src/integrations/llm.ts`.
- The `dbContext?: DatabaseSchema` parameter in `proposeSqlEdit()` is already typed for the live engine schema. Phase 2 populates it from the real SQL Server schema introspection.

### UAT runner → Real sandbox execution
- Replace `src/integrations/uatRunner.ts` with code that applies the SQL diff to a SQL Server dev container, runs sample customer cases, and captures frontend screenshots.

### IT handoff notification → Email / Slack / ITSM
- Implement `notifyIT(packetId)` in `src/integrations/itHandoff.ts`. No other changes needed.

### Engine SQL sync
- Implement `src/integrations/engineCodeSource.ts` against the live SQL Server pull mechanism (on-demand query, scheduled mirror, or webhook on commit). See [open question 5](#open-questions).

---

## Seeded demo data

| Entity | Count | Notes |
|---|---|---|
| Users | 5 | 2 risk analysts, 2 testers, 1 admin |
| Engine modules | 6 | Schematic placeholder T-SQL — see §8 of briefing |
| Strategy changes | 6 | One per stage (draft, ready\_for\_uat, uat\_in\_progress, qa\_review, approved\_for\_it, sent\_to\_it) |
| Versions | 7 | Mix of `ai_proposal` and `human_edit` sources |
| UAT runs | 3 | Includes completed runs with full test-case reports |
| UAT reviews | 2 | One approved with annotations |
| IT handoff packets | 2 | sc-005 and sc-006, both with complete packet JSON |
| Audit log entries | 30 | Full trail from sc-002 through sc-006 |

### Reset demo data
Sign in as **Kevin Lim (admin)**, then click **Reset Demo Data** in the sidebar footer. This clears `localStorage` and reseeds from `seed.json`.

---

## Project structure

```
src/
├── types/         # All domain types — single source of truth
├── data/          # Repository interface + localStorage implementation + seed
├── auth/          # AuthProvider + useAuth hook
├── integrations/  # All external stubs — Phase 2 replaces these
├── i18n/          # react-i18next setup; en.json fully populated; zh/id empty
├── hooks/         # React Query wrappers (useEngineModules, useStrategyChanges, useAuditLog)
├── components/
│   ├── ui/        # Design-system primitives (Button, Badge, Card, Tabs, Stepper, DataTable…)
│   ├── layout/    # AppShell, Sidebar, TopBar
│   └── shared/    # StageBadge, UserAvatar, ConfirmModal
└── pages/
    ├── login/
    ├── home/
    ├── engine-modules/
    ├── strategy-changes/
    └── strategy-change-detail/   # Detail page + 5 tabs
```

---

## AEGIS's relationship to the real risk engine

AEGIS does **not** deploy to the risk engine. It owns the authoring, review, and approval workflow. IT owns deployment.

In Phase 1, the engine's SQL modules are represented as seeded mock data in `engine_modules`. In Phase 2, `src/integrations/engineCodeSource.ts` will sync with the real SQL Server instance via a pull mechanism agreed with IT.

---

## Open questions (do not block Phase 1)

1. Exact UAT methodology — frontend-display verification only, or also engine output reconciliation, replay against historical traffic, statistical drift checks?
2. What does the IT handoff packet need to contain to be useful — raw diff, formatted summary, signed approval record, expected rollback steps?
3. Peer-review or risk-manager approval before UAT, or is the authoring analyst the sole authority?
4. LLM provider choice and data-residency constraints (Indonesian banking regulations, OJK).
5. Engine SQL sync mechanism — pull on demand, scheduled mirror, or webhook on commit?
6. Backend choice — Supabase, self-hosted Postgres, or something IT prefers?
7. Audit log retention period and export format required by Risk Compliance.
8. Rollback workflow and UI when a deployed change needs to be reverted.
9. Real customer-frontend capture mechanism for UAT screenshots.
