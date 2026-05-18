# ARC — AI Risk Control Platform

> **This is a Phase 1 proof of concept. All data is local (localStorage). No external systems are contacted.**
> See [Phase 2 extension points](#phase-2-extension-points) for where real services plug in.

ARC is a web platform for the Webank risk team to author SQL edits to the core risk engine with AI assistance, run AI-powered UAT, bundle approved edits into release packets, and hand those packets off to IT for deployment.

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

No passwords — click any persona card on the login screen to sign in.

| Name | Email | Role | Access |
|---|---|---|---|
| Ahmad Rizaldi    | a.rizaldi@webank.id     | `risk_analyst`  | Author edits, use AI, send for UAT |
| Siti Nurhaliza   | s.nurhaliza@webank.id   | `risk_analyst`  | Author edits, use AI, send for UAT |
| Budi Santoso     | b.santoso@webank.id     | `tester`        | Trigger AI UAT, annotate reports, approve/reject in QA |
| Dewi Rahayu      | d.rahayu@webank.id      | `tester`        | Trigger AI UAT, annotate reports, approve/reject in QA |
| Reza Pramana     | r.pramana@webank.id     | `risk_lead`     | Risk-analyst powers + approve/reject proposed packets |
| Maya Kusuma      | m.kusuma@webank.id      | `testing_lead`  | Tester powers + approve/reject proposed packets |
| Dito Nugroho     | d.nugroho@webank.id     | `it_team`       | View confirmed packets, mark live |
| Ika Widiastuti   | i.widiastuti@webank.id  | `it_team`       | View confirmed packets, mark live |
| Kevin Lim        | k.lim@webank.id         | `admin`         | All permissions + Reset Demo Data |

---

## Sidebar / routes

| Sidebar entry  | Route                  | What it shows |
|---|---|---|
| Overview       | `/overview`            | At-a-glance pipeline counts, engine modules grid, personal queue, last-updated stamp with 30s auto-refresh |
| Workspace      | `/workspace/draft-queue`, `/workspace/uat`, `/workspace/qa` | Three aggregate sub-tabs, each listing **all** edits at that stage |
| Risk Edits     | `/risk-edits`          | Complete history; Active section above, Live & Archived below; search + filters; stage timeline in row expansion |
| Changelog      | `/changelog`           | Approved Pool, Proposed Packets, Confirmed (packet-centric, Sent to IT + Live groupings) |
| IT Handoff     | `/it-handoff-log`      | Confirmed and live packets; side drawer with packet JSON download + Mark as Live |

Legacy redirects: `/home` → `/overview`, `/engine-modules` → `/overview`, `/risk-edits/:id` → `/workspace/draft-queue`.

---

## Workflow stages

A risk edit moves through up to seven stages. Rejected is an off-path terminal stage edits can land in from QA review.

```
draft → ready_for_uat → uat_in_progress → qa_review → approved → sent_to_it → live
                                          ↓
                                       rejected
```

| Stage | Who advances it | Where |
|---|---|---|
| `draft`           | Risk analyst — Send for UAT  | Workspace → Draft & Queue |
| `ready_for_uat`   | Tester — Send to AI UAT      | Workspace → UAT |
| `uat_in_progress` | Auto — `uatRunner` completes | Workspace → UAT (Running section) |
| `qa_review`       | Tester — Approve / Reject    | Workspace → QA |
| `approved`        | Risk analyst / lead — Create proposed packet | Changelog → Approved Pool |
| `sent_to_it`      | Risk lead / Testing lead — Approve packet | Changelog → Proposed Packets |
| `live`            | IT team — Mark as Live (per packet) | IT Handoff drawer |
| `rejected`        | Tester — Reject in QA Review | (terminal) |

---

## Design language tokens

| Token | Hex | Usage |
|---|---|---|
| `arc-50`  | `#EFF8F9` | Page background, input fills |
| `arc-100` | `#B8E3E9` | Hover tint, selected row bg |
| `arc-200` | `#93B1B5` | Borders, dividers, placeholder text |
| `arc-500` | `#4F7C82` | Primary accent — buttons, links, focus rings |
| `arc-700` | `#2A5158` | Accent hover, active state |
| `arc-900` | `#0B2E33` | Sidebar bg, primary headings |

Status semantics (do not change):
- **Emerald** = approved / success / live
- **Amber**   = in-progress / pending review
- **Rose**    = rejected / failed
- **Zinc**    = draft / neutral

Typography: `Inter` for UI, `JetBrains Mono` for SQL and code surfaces.

---

## What's mocked in Phase 1

| Concern | How it's mocked | File |
|---|---|---|
| Database                | `localStorage` seeded from `seed.json`                       | `src/data/localRepository.ts`        |
| Auth                    | Persona picker — no password                                 | `src/auth/AuthProvider.tsx`          |
| LLM / AI proposals      | Keyword-based rule stub; simulates 1.2s delay                | `src/integrations/llm.ts`            |
| UAT runner              | Returns seeded fixture or generic fallback; 2.5s delay       | `src/integrations/uatRunner.ts`      |
| Screenshots             | Serves `public/mock-screenshots/*.png` placeholders          | `src/integrations/screenshots.ts`    |
| IT handoff notification | `notifyIT()` is a no-op; packet JSON written to localStorage | `src/integrations/itHandoff.ts`      |
| Engine SQL source       | Reads from `engine_modules` in localStorage                  | `src/integrations/engineCodeSource.ts` |

---

## Data model summary

Single source of truth: `src/types/index.ts`.

| Entity | Notes |
|---|---|
| `User`             | 6 roles: `risk_analyst`, `tester`, `risk_lead`, `testing_lead`, `it_team`, `admin` |
| `EngineModule`     | A SQL module in the risk engine; edits target one module each |
| `RiskEdit`         | An authored change. `edit_id_display` format: `RE-YYYY-NNNN`. Carries `current_stage` |
| `RiskEditVersion`  | Each save of the SQL within an edit; `source` is `ai_proposal` or `human_edit` |
| `UatRun`           | One AI UAT run against a specific version; holds the generated `UatReport` |
| `UatReview`        | A tester's verdict on a UAT run; carries annotations and rejection notes |
| `Packet`           | A bundle of approved edits, `status` in `proposed | confirmed | rejected | live` |
| `PacketEdit`       | Join row linking a `Packet` to a `RiskEdit` |
| `AuditLogEntry`    | Append-only trail of every state transition (used to reconstruct the per-edit stage timeline) |
| `ChatMessageEntity`| Persisted per-edit AI conversation |

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
- The `dbContext?: DatabaseSchema` parameter in `proposeSqlEdit()` is already typed for the live engine schema. Phase 2 populates it from real SQL Server schema introspection.

### UAT runner → Real sandbox execution
- Replace `src/integrations/uatRunner.ts` with code that applies the SQL diff to a SQL Server dev container, runs sample customer cases, and captures frontend screenshots.

### IT handoff notification → Email / Slack / ITSM
- Implement `notifyIT(packetId)` in `src/integrations/itHandoff.ts`. No other changes needed.

### Engine SQL sync
- Implement `src/integrations/engineCodeSource.ts` against the live SQL Server pull mechanism (on-demand query, scheduled mirror, or webhook on commit).

---

## Seeded demo data

| Entity | Count | Notes |
|---|---|---|
| Users          | 9 | 2 risk analysts, 2 testers, 1 risk lead, 1 testing lead, 2 IT, 1 admin |
| Engine modules | 6 | Schematic placeholder T-SQL |
| Risk edits     | seeded across all stages so each Workspace sub-tab and Changelog tab is non-empty on first load |
| UAT runs       | mix of completed and pending |
| Packets        | both proposed and confirmed, including at least one live |
| Audit log      | full transition trail per edit — feeds the stage-timeline visualisation |

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
├── i18n/          # react-i18next setup
├── hooks/         # React Query wrappers (useRiskEdits, useEngineModules, useAuditLog, useUatRuns…)
├── components/
│   ├── ui/        # Design-system primitives (Button, Badge, Card, Tabs, Stepper, Input, Select…)
│   ├── layout/    # AppShell, Sidebar, TopBar
│   └── shared/    # StageBadge, UserAvatar, ConfirmModal
└── pages/
    ├── login/
    ├── overview/
    ├── engine-modules/      # detail page only — list lives on Overview
    ├── workspace/           # WorkspacePage shell + draft-queue / uat / qa sub-pages + tabs/
    ├── risk-edits/          # complete history; Active vs Live & Archived sections
    ├── changelog/           # Approved Pool / Proposed Packets / Confirmed
    └── it-handoff-log/      # Confirmed + live packets; PacketDrawer with Mark as Live
```

---

## ARC's relationship to the real risk engine

ARC does **not** deploy to the risk engine. It owns the authoring, review, packet-bundling, and approval workflow. IT owns deployment, and signals back into ARC via Mark as Live.

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

---

## Version history

- **v0.3 — ARC.** Renamed from AEGIS. Workspace restructured into stage-aggregating sub-tabs. Packet model introduced (`packets`, `packet_edits`) with proposed/confirmed/live/rejected lifecycle. Live stage added. IT Handoff drawer with Mark as Live. Overview page (at-a-glance + engine modules grid). Two new roles (`risk_lead`, `testing_lead`, `it_team`).
- **v0.2 — AEGIS Round 2.** Closed the full governance workflow loop end-to-end.
- **v0.1 — AEGIS Phase 1 POC.** Initial scaffold of the platform under its original name, **AEGIS — AI-Enabled Governance for Intelligent Strategy**.
