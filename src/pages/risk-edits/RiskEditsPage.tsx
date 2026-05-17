import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useEngineModules } from '@/hooks/useEngineModules';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { StageBadge } from '@/components/shared/StageBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { CreateRiskEditModal } from './CreateRiskEditModal';
import type { AuditLogEntry, RiskEdit, RiskEditStage } from '@/types';

const STAGE_OPTIONS: { value: '' | RiskEditStage; label: string }[] = [
  { value: '',                label: 'All stages'      },
  { value: 'draft',           label: 'Draft'           },
  { value: 'ready_for_uat',   label: 'Ready for UAT'   },
  { value: 'uat_in_progress', label: 'UAT Running'     },
  { value: 'qa_review',       label: 'QA Review'       },
  { value: 'approved',        label: 'Approved'        },
  { value: 'sent_to_it',      label: 'Sent to IT'      },
  { value: 'live',            label: 'Live'            },
  { value: 'rejected',        label: 'Rejected'        },
];

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtAction(entry: AuditLogEntry): string {
  const p = entry.payload_json;
  switch (entry.action) {
    case 'risk_edit.stage_transition':
      return `Stage: ${p.from} → ${p.to}`;
    case 'risk_edit_version.created':
      return `Version v${p.version_number} saved (${p.source})`;
    case 'uat_run.triggered':
      return 'UAT run triggered';
    case 'uat_run.completed':
      return `UAT completed — ${p.cases_passed}/${p.cases_total} passed`;
    case 'uat_run.failed':
      return 'UAT run failed';
    case 'packet.confirmed':
      return 'Packet confirmed → sent to IT';
    case 'packet.live':
      return 'Marked live';
    default:
      return entry.action;
  }
}

// ── Audit panel (loaded lazily when row expands) ──────────────────────────────

function AuditPanel({ editId, userMap }: { editId: string; userMap: Record<string, string> }) {
  const { data: entries = [], isLoading } = useAuditLog({ entity_type: 'risk_edit', entity_id: editId });

  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  if (isLoading) return <p className="text-xs text-arc-200 py-2">Loading…</p>;
  if (sorted.length === 0) return <p className="text-xs text-arc-200 py-2">No audit entries yet.</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-arc-300 mt-1.5 shrink-0" />
          <span className="text-arc-900 font-medium min-w-0">{fmtAction(entry)}</span>
          <span className="text-arc-200 shrink-0 ml-auto pl-4">
            {userMap[entry.actor_id] ?? entry.actor_id} · {fmt(entry.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Author cell ───────────────────────────────────────────────────────────────

function AuthorCell({ userId }: { userId: string }) {
  const repo = useRepository();
  const { data: user } = useQuery({
    queryKey: ['arc', 'users', userId],
    queryFn: () => repo.users.get(userId),
  });
  if (!user) return <span className="text-arc-200 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <UserAvatar seed={user.avatar_seed} name={user.name} size="sm" />
      <span className="text-sm text-arc-900">{user.name}</span>
    </div>
  );
}

function ModuleCell({ moduleId }: { moduleId: string }) {
  const repo = useRepository();
  const { data: mod } = useQuery({
    queryKey: ['arc', 'engine_modules', moduleId],
    queryFn: () => repo.engineModules.get(moduleId),
  });
  return <span className="font-mono text-xs text-arc-500">{mod?.module_name ?? moduleId}</span>;
}

// ── Expandable row ────────────────────────────────────────────────────────────

function EditRow({ edit, userMap }: { edit: RiskEdit; userMap: Record<string, string> }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="border-b border-arc-200 hover:bg-arc-50 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-3 w-32">
          <span className="font-mono text-xs text-arc-500">{edit.edit_id_display}</span>
        </td>
        <td className="px-4 py-3">
          <span className="font-medium text-arc-900">{edit.title}</span>
        </td>
        <td className="px-4 py-3 w-36">
          <StageBadge stage={edit.current_stage} />
        </td>
        <td className="px-4 py-3 w-48">
          <ModuleCell moduleId={edit.target_module_id} />
        </td>
        <td className="px-4 py-3 w-44">
          <AuthorCell userId={edit.created_by} />
        </td>
        <td className="px-4 py-3 w-28">
          <span className="text-xs text-arc-200 font-mono">
            {new Date(edit.updated_at).toLocaleDateString()}
          </span>
        </td>
        <td className="px-4 py-3 w-8 text-arc-300 text-xs text-right">
          {open ? '▲' : '▼'}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-arc-200 bg-arc-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="flex gap-8">
              {/* Brief */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-2">Brief</p>
                <p className="text-xs text-arc-900 leading-relaxed line-clamp-3">
                  {edit.natural_language_brief || <span className="text-arc-200 italic">No brief provided.</span>}
                </p>
              </div>

              {/* Divider */}
              <div className="w-px bg-arc-200 shrink-0" />

              {/* Audit trail */}
              <div className="flex-[2] min-w-0">
                <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-2">Recent Activity</p>
                <AuditPanel editId={edit.id} userMap={userMap} />
              </div>

              {/* Actions */}
              <div className="shrink-0 flex flex-col items-end justify-between">
                <Link
                  to={`/risk-edits/${edit.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-arc-900 text-white text-xs font-medium hover:bg-arc-700 transition-colors"
                >
                  Open Workspace →
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function RiskEditsPage() {
  const { role } = useAuth();
  const repo = useRepository();
  const { data: modules = [] } = useEngineModules();

  const [stageFilter,  setStageFilter]  = useState<'' | RiskEditStage>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);

  const { data: rawEdits = [], isLoading } = useRiskEdits();
  const edits = [...rawEdits].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const filtered = edits.filter((e) => {
    if (stageFilter  && e.current_stage    !== stageFilter)  return false;
    if (moduleFilter && e.target_module_id !== moduleFilter) return false;
    return true;
  });

  // Pre-load all users for the audit panel actor names
  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'batch', 'all'],
    queryFn: async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
  });

  const canCreate = role === 'risk_analyst' || role === 'risk_lead' || role === 'admin';

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={<Breadcrumb items={[{ label: 'Risk Edits' }]} />}
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>+ New Edit</Button>
            ) : undefined
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-arc-900">Risk Edits</h1>
              <p className="text-sm text-arc-200 mt-0.5">
                Complete history of every risk engine edit — sorted by most recent activity.
              </p>
            </div>

            <div className="flex gap-3 mb-4">
              <Select value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as '' | RiskEditStage)}
                className="w-44">
                {STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <Select value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-52">
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.module_name}</option>
                ))}
              </Select>
            </div>

            <div className="bg-white rounded-xl border border-arc-200 shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-arc-200 text-sm">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-arc-200 text-sm">
                  No risk edits match the current filters.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arc-200 bg-arc-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide w-32">ID</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Title</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide w-36">Stage</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide w-48">Module</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide w-44">Author</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide w-28">Updated</th>
                      <th className="px-4 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <EditRow key={e.id} edit={e} userMap={userMap} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreate && <CreateRiskEditModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
