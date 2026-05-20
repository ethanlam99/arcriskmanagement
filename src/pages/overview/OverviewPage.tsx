import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useEngineModules } from '@/hooks/useEngineModules';
import { usePackets } from '@/hooks/useITHandoffPackets';
import { useRepository } from '@/data/RepositoryProvider';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { StageBadge } from '@/components/shared/StageBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Button } from '@/components/ui/Button';
import { CreateRiskEditModal } from '@/pages/risk-edits/CreateRiskEditModal';
import { OverviewChat } from '@/pages/overview/OverviewChat';
import type { EngineModule, Packet, RiskEdit, RiskEditStage } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const REFETCH_MS = 3_600_000;

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTimeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function workspaceUrl(edit: RiskEdit): string {
  if (edit.current_stage === 'uat_in_progress') return '/workspace/uat';
  if (edit.current_stage === 'qa_review')       return `/workspace/qa?edit=${edit.id}`;
  if (['draft', 'ready_for_uat'].includes(edit.current_stage)) {
    return `/workspace/draft-queue?edit=${edit.id}`;
  }
  return '/workspace/draft-queue';
}

// Pipeline-stage stat cards (the seven boxes)
type StageKey = Extract<
  RiskEditStage,
  'draft' | 'ready_for_uat' | 'uat_in_progress' | 'qa_review' | 'approved' | 'sent_to_it' | 'live'
>;

const STAGE_CARDS: { key: StageKey; label: string; color: string }[] = [
  { key: 'draft',           label: 'Draft',      color: 'text-arc-500'    },
  { key: 'ready_for_uat',   label: 'UAT Queue',  color: 'text-amber-600'  },
  { key: 'uat_in_progress', label: 'In UAT',     color: 'text-amber-600'  },
  { key: 'qa_review',       label: 'QA Review',  color: 'text-amber-600'  },
  { key: 'approved',        label: 'Approved',   color: 'text-emerald-600' },
  { key: 'sent_to_it',      label: 'Sent to IT', color: 'text-emerald-600' },
  { key: 'live',            label: 'Live',       color: 'text-forest-600'    },
];

function StatBox({
  label, value, color, isActive, onClick,
}: {
  label: string; value: number; color: string; isActive: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white shadow-sm p-1.5 text-center transition-all duration-150 ${
        isActive
          ? 'border-arc-500 ring-1 ring-arc-500'
          : 'border-arc-200 hover:border-forest-500 hover:bg-white hover:shadow-md'
      }`}
    >
      <div className="bg-arc-100 rounded-lg px-3 py-2">
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
        <p className="text-xs text-arc-500 mt-0.5">{label}</p>
      </div>
    </button>
  );
}

// Inline expansion panel listing edits in a stage
function StageExpansionPanel({
  stageLabel,
  edits,
  userMap,
  onClose,
}: {
  stageLabel: string;
  edits: RiskEdit[];
  userMap: Record<string, { name: string; avatar_seed: string }>;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-arc-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-arc-200 flex items-center justify-between">
        <p className="text-sm font-semibold text-arc-900">
          {stageLabel} — {edits.length} edit{edits.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={onClose}
          className="text-arc-500 hover:text-arc-900 transition-colors"
          title="Collapse"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {edits.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-arc-500">No edits in this stage.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-arc-100 text-xs text-arc-500 uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-28">Edit ID</th>
              <th className="text-left font-medium px-4 py-2">Title</th>
              <th className="text-left font-medium px-4 py-2 w-40">Author</th>
              <th className="text-left font-medium px-4 py-2 w-24">In stage</th>
              <th className="text-right font-medium px-4 py-2 w-44">{/* action */}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-arc-200">
            {edits.map((e) => {
              const author = userMap[e.created_by];
              return (
                <tr key={e.id} className="hover:bg-arc-100">
                  <td className="px-4 py-2 font-mono text-xs text-arc-900">{e.edit_id_display}</td>
                  <td className="px-4 py-2 text-arc-900 truncate">{e.title}</td>
                  <td className="px-4 py-2">
                    {author ? (
                      <span className="inline-flex items-center gap-2">
                        <UserAvatar seed={author.avatar_seed} name={author.name} size="sm" />
                        <span className="text-arc-900">{author.name}</span>
                      </span>
                    ) : (
                      <span className="text-arc-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-arc-500 tabular-nums">
                    {formatTimeSince(e.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={workspaceUrl(e)}
                      className="text-xs font-medium text-arc-500 hover:text-arc-900 transition-colors"
                    >
                      Open in Workspace →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EditRow({ change, onClick }: { change: RiskEdit; onClick: () => void }) {
  const repo = useRepository();
  const { data: module } = useQuery({
    queryKey: ['arc', 'engine_modules', change.target_module_id],
    queryFn:  () => repo.engineModules.get(change.target_module_id),
  });
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-2.5 px-1 hover:bg-arc-200 rounded-lg transition-colors duration-150 text-left group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-arc-900 truncate group-hover:text-arc-700">{change.title}</p>
        <p className="text-xs text-arc-500 mt-0.5 font-mono truncate">
          {module?.module_name ?? change.target_module_id} · {change.edit_id_display}
        </p>
      </div>
      <StageBadge stage={change.current_stage} className="ml-3 shrink-0" />
    </button>
  );
}

function Panel({
  title, count, empty, children, linkTo, linkLabel,
}: {
  title: string;
  count: number;
  empty: string;
  children?: React.ReactNode;
  linkTo?: string;
  linkLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-arc-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-arc-200 flex items-center justify-between">
        <p className="text-sm font-semibold text-arc-900">{title}</p>
        <span className="text-xs text-arc-500">{count} item{count !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 px-4 py-1">
        {count === 0 ? (
          <p className="text-sm text-arc-500 py-4 text-center">{empty}</p>
        ) : (
          <div className="divide-y divide-arc-200">{children}</div>
        )}
      </div>
      {linkTo && (
        <div className="px-4 py-2.5 border-t border-arc-200">
          <Link to={linkTo} className="text-xs text-arc-500 hover:text-arc-900 font-medium transition-colors">
            {linkLabel ?? 'View all →'}
          </Link>
        </div>
      )}
    </div>
  );
}

function ModuleMiniCard({
  module,
  canCreate,
  onNewEdit,
}: {
  module: EngineModule;
  canCreate: boolean;
  onNewEdit: () => void;
}) {
  const navigate = useNavigate();
  const lines = module.current_sql_code.split('\n').length;
  return (
    <div
      onClick={() => navigate(`/engine-modules/${module.id}`)}
      className="rounded-xl border border-arc-200 bg-white shadow-sm p-1.5 text-left hover:border-forest-500 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 group cursor-pointer"
    >
      <div className="bg-arc-100 group-hover:bg-arc-50 rounded-lg p-5 flex flex-col gap-3 min-h-[160px] transition-colors duration-200">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-sm font-semibold text-arc-900 group-hover:text-arc-700 truncate">
            {module.module_name}
          </p>
          <span className="shrink-0 text-xs text-arc-500 font-mono">{lines}L</span>
        </div>
        <p className="text-xs text-arc-500 line-clamp-3 leading-relaxed flex-1">{module.description}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-arc-500">Updated {fmtDate(module.updated_at)}</p>
          {canCreate && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onNewEdit();
              }}
            >
              New Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();
  const repo     = useRepository();
  const qc       = useQueryClient();

  const canCreateRiskEdit = role === 'risk_analyst' || role === 'risk_lead' || role === 'admin';
  const [newEditModuleId, setNewEditModuleId] = useState<string | null>(null);

  const editsQuery   = useRiskEdits(undefined, { refetchInterval: REFETCH_MS });
  const modulesQuery = useEngineModules({ refetchInterval: REFETCH_MS });
  const packetsQuery = usePackets({ status: 'confirmed' } as Partial<Packet>, { refetchInterval: REFETCH_MS });

  const allEdits         = editsQuery.data ?? [];
  const allModules       = modulesQuery.data ?? [];
  const confirmedPackets = packetsQuery.data ?? [];

  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'map', 'profile'],
    queryFn: async () => {
      const users = await repo.users.list();
      return Object.fromEntries(
        users.map((u) => [u.id, { name: u.name, avatar_seed: u.avatar_seed }]),
      );
    },
  });

  // Stage counts
  const counts = useMemo<Record<StageKey, number>>(() => {
    const c: Record<StageKey, number> = {
      draft: 0, ready_for_uat: 0, uat_in_progress: 0, qa_review: 0,
      approved: 0, sent_to_it: 0, live: 0,
    };
    for (const e of allEdits) {
      if (e.current_stage in c) c[e.current_stage as StageKey] += 1;
    }
    return c;
  }, [allEdits]);

  // Expansion state — only one stage's panel open at a time
  const [expandedStage, setExpandedStage] = useState<StageKey | null>(null);
  const expandedEdits = useMemo(() => {
    if (!expandedStage) return [];
    return allEdits
      .filter((e) => e.current_stage === expandedStage)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [allEdits, expandedStage]);

  // Role-specific edit lists
  const myId          = currentUser?.id;
  const myDrafts      = allEdits.filter((e) => e.created_by === myId && e.current_stage === 'draft');
  const myReadyForUat = allEdits.filter((e) => e.created_by === myId && e.current_stage === 'ready_for_uat');
  const uatQueue      = allEdits.filter((e) => e.current_stage === 'ready_for_uat');
  const uatRunning    = allEdits.filter((e) => e.current_stage === 'uat_in_progress');
  const qaQueue       = allEdits.filter((e) => e.current_stage === 'qa_review');
  const approvedPool  = allEdits.filter((e) => e.current_stage === 'approved');

  const modulesSorted = useMemo(
    () => [...allModules].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [allModules],
  );

  const ROLE_LABELS: Record<string, string> = {
    risk_analyst: 'Risk Analyst', risk_lead: 'Risk Lead',
    tester: 'Tester', testing_lead: 'Testing Lead',
    it_team: 'IT Team', admin: 'Admin',
  };
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : '';

  // Refresh: invalidate the three queries that drive the dashboard
  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
    qc.invalidateQueries({ queryKey: ['arc', 'engine_modules'] });
    qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
  }

  const lastUpdated = Math.max(
    editsQuery.dataUpdatedAt || 0,
    modulesQuery.dataUpdatedAt || 0,
    packetsQuery.dataUpdatedAt || 0,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Overview' }]} />} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">

          {/* Welcome strip */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-arc-900">
                Welcome back, {currentUser?.name}
              </h1>
              <p className="text-sm text-arc-500 mt-0.5">
                {roleLabel} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Pipeline stats */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide">Pipeline at a glance</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-arc-500 tabular-nums">
                  Last updated {lastUpdated ? fmtClock(lastUpdated) : '—'}
                </span>
                <button
                  onClick={handleRefresh}
                  title="Refresh now"
                  className="text-arc-500 hover:text-arc-900 transition-colors p-1 rounded hover:bg-arc-100"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {STAGE_CARDS.map((s) => (
                <StatBox
                  key={s.key}
                  label={s.label}
                  value={counts[s.key]}
                  color={s.color}
                  isActive={expandedStage === s.key}
                  onClick={() =>
                    setExpandedStage((current) => (current === s.key ? null : s.key))
                  }
                />
              ))}
            </div>

            {expandedStage && (
              <StageExpansionPanel
                stageLabel={STAGE_CARDS.find((s) => s.key === expandedStage)!.label}
                edits={expandedEdits}
                userMap={userMap}
                onClose={() => setExpandedStage(null)}
              />
            )}
          </div>

          {/* Role-specific action panels */}
          <div>
            <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Your queue</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {(role === 'risk_analyst' || role === 'admin') && (
                <>
                  <Panel title="Your Drafts" count={myDrafts.length} empty="No drafts."
                    linkTo="/risk-edits" linkLabel="Go to Risk Edits →">
                    {myDrafts.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="Pending UAT Confirmation" count={myReadyForUat.length} empty="Nothing queued."
                    linkTo="/risk-edits" linkLabel="Go to Risk Edits →">
                    {myReadyForUat.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                </>
              )}

              {role === 'risk_lead' && (
                <>
                  <Panel title="UAT Queue" count={uatQueue.length} empty="No changes queued."
                    linkTo="/changelog" linkLabel="Confirm on Changelog →">
                    {uatQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="UAT Running" count={uatRunning.length} empty="None in progress."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {uatRunning.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                </>
              )}

              {role === 'tester' && (
                <>
                  <Panel title="QA Review Queue" count={qaQueue.length} empty="Queue is clear."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {qaQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="Approved Pool" count={approvedPool.length} empty="None approved yet."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {approvedPool.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                </>
              )}

              {role === 'testing_lead' && (
                <>
                  <Panel title="QA Review Queue" count={qaQueue.length} empty="Queue is clear."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {qaQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="Approved — Ready to Package" count={approvedPool.length} empty="Nothing approved yet."
                    linkTo="/changelog" linkLabel="Go to Approved Pool →">
                    {approvedPool.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                </>
              )}

              {role === 'it_team' && (
                <>
                  <Panel title="Confirmed Packets" count={confirmedPackets.length}
                    empty="No packets awaiting deployment."
                    linkTo="/it-handoff-log" linkLabel="Go to IT Handoff Log →">
                    {confirmedPackets.slice(0, 5).map((pkt) => (
                      <button key={pkt.id}
                        onClick={() => navigate('/it-handoff-log')}
                        className="w-full flex items-start justify-between py-2.5 px-1 hover:bg-arc-200 rounded-lg transition-colors duration-150 text-left group">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-arc-900 group-hover:text-arc-700 truncate">{pkt.name}</p>
                          {pkt.description && (
                            <p className="text-xs text-arc-500 mt-0.5 truncate">{pkt.description}</p>
                          )}
                        </div>
                        <span className="ml-3 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          Confirmed
                        </span>
                      </button>
                    ))}
                  </Panel>
                  <Panel title="Sent to IT" count={counts.sent_to_it}
                    empty="No edits sent to IT yet."
                    linkTo="/risk-edits" linkLabel="View Risk Edits →">
                    {allEdits.filter((e) => e.current_stage === 'sent_to_it').slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                </>
              )}

              {role === 'admin' && (
                <>
                  <Panel title="UAT Queue" count={uatQueue.length} empty="No changes queued."
                    linkTo="/changelog" linkLabel="Confirm on Changelog →">
                    {uatQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="QA Review" count={qaQueue.length} empty="Queue is clear."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {qaQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="Approved Pool" count={approvedPool.length} empty="Nothing to package."
                    linkTo="/changelog" linkLabel="Go to Approved Pool →">
                    {approvedPool.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(workspaceUrl(e))} />
                    ))}
                  </Panel>
                  <Panel title="Confirmed Packets" count={confirmedPackets.length}
                    empty="No packets awaiting deployment."
                    linkTo="/it-handoff-log" linkLabel="Go to IT Handoff Log →">
                    {confirmedPackets.slice(0, 5).map((pkt) => (
                      <button key={pkt.id} onClick={() => navigate('/it-handoff-log')}
                        className="w-full flex items-start justify-between py-2.5 px-1 hover:bg-arc-200 rounded-lg transition-colors duration-150 text-left group">
                        <p className="text-sm font-medium text-arc-900 group-hover:text-arc-700 truncate">{pkt.name}</p>
                        <span className="ml-3 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          Confirmed
                        </span>
                      </button>
                    ))}
                  </Panel>
                </>
              )}
            </div>
          </div>

          {/* Create a new risk edit — chatbox + module browser */}
          {canCreateRiskEdit && (
            <div>
              <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Create a new risk edit</p>
              <OverviewChat />
            </div>
          )}

          {/* Engine modules — full grid, no separate listing page */}
          <div>
            <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">
              {canCreateRiskEdit ? 'Or browse modules to start from' : 'Engine Modules'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modulesSorted.map((mod) => (
                <ModuleMiniCard
                  key={mod.id}
                  module={mod}
                  canCreate={canCreateRiskEdit}
                  onNewEdit={() => setNewEditModuleId(mod.id)}
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      {newEditModuleId && (
        <CreateRiskEditModal
          defaultModuleId={newEditModuleId}
          onClose={() => setNewEditModuleId(null)}
        />
      )}
    </div>
  );
}
