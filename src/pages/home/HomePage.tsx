import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useEngineModules } from '@/hooks/useEngineModules';
import { usePackets } from '@/hooks/useITHandoffPackets';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { StageBadge } from '@/components/shared/StageBadge';
import type { Packet, RiskEdit } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-arc-200 bg-white px-4 py-3 text-center">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-arc-200 mt-0.5">{label}</p>
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
      className="w-full flex items-center justify-between py-2.5 px-1 hover:bg-arc-50 rounded-lg transition-colors text-left group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-arc-900 truncate group-hover:text-arc-700">{change.title}</p>
        <p className="text-xs text-arc-200 mt-0.5 font-mono truncate">
          {module?.module_name ?? change.target_module_id} · {change.edit_id_display}
        </p>
      </div>
      <StageBadge stage={change.current_stage} className="ml-3 shrink-0" />
    </button>
  );
}

function Panel({
  title,
  count,
  empty,
  children,
  linkTo,
  linkLabel,
}: {
  title:      string;
  count:      number;
  empty:      string;
  children?:  React.ReactNode;
  linkTo?:    string;
  linkLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-arc-200 bg-white overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-arc-200 flex items-center justify-between">
        <p className="text-sm font-semibold text-arc-900">{title}</p>
        <span className="text-xs text-arc-200">{count} item{count !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 px-4 py-1">
        {count === 0 ? (
          <p className="text-sm text-arc-200 py-4 text-center">{empty}</p>
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

// ── Engine module mini-grid ───────────────────────────────────────────────────

function ModuleMiniCard({ module }: { module: { id: string; module_name: string; description: string; updated_at: string; current_sql_code: string } }) {
  const navigate = useNavigate();
  const lines = module.current_sql_code.split('\n').length;
  return (
    <button
      onClick={() => navigate(`/engine-modules/${module.id}`)}
      className="rounded-xl border border-arc-200 bg-white px-4 py-3 text-left hover:border-arc-500 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-mono text-sm font-semibold text-arc-900 group-hover:text-arc-700 truncate">
          {module.module_name}
        </p>
        <span className="shrink-0 text-xs text-arc-200 font-mono">{lines}L</span>
      </div>
      <p className="text-xs text-arc-200 line-clamp-2 leading-relaxed">{module.description}</p>
      <p className="text-xs text-arc-200 mt-2">Updated {fmt(module.updated_at)}</p>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HomePage() {
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();

  const { data: allEdits = [] } = useRiskEdits();
  const { data: allModules = [] } = useEngineModules();
  const { data: confirmedPackets = [] } = usePackets({ status: 'confirmed' } as Partial<Packet>);

  // Stage counts
  const counts = {
    draft:           allEdits.filter((e) => e.current_stage === 'draft').length,
    ready_for_uat:   allEdits.filter((e) => e.current_stage === 'ready_for_uat').length,
    uat_in_progress: allEdits.filter((e) => e.current_stage === 'uat_in_progress').length,
    qa_review:       allEdits.filter((e) => e.current_stage === 'qa_review').length,
    approved:        allEdits.filter((e) => e.current_stage === 'approved').length,
    sent_to_it:      allEdits.filter((e) => e.current_stage === 'sent_to_it').length,
    live:            allEdits.filter((e) => e.current_stage === 'live').length,
  };

  // Role-specific edit lists
  const myId = currentUser?.id;

  const myDrafts        = allEdits.filter((e) => e.created_by === myId && e.current_stage === 'draft');
  const myReadyForUat   = allEdits.filter((e) => e.created_by === myId && e.current_stage === 'ready_for_uat');
  const uatQueue        = allEdits.filter((e) => e.current_stage === 'ready_for_uat');
  const uatRunning      = allEdits.filter((e) => e.current_stage === 'uat_in_progress');
  const qaQueue         = allEdits.filter((e) => e.current_stage === 'qa_review');
  const approvedPool    = allEdits.filter((e) => e.current_stage === 'approved');

  // Engine modules — show 4 most recently updated
  const topModules = [...allModules]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 4);

  const ROLE_LABELS: Record<string, string> = {
    risk_analyst: 'Risk Analyst', risk_lead: 'Risk Lead',
    tester: 'Tester', testing_lead: 'Testing Lead',
    it_team: 'IT Team', admin: 'Admin',
  };
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : '';

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
              <p className="text-sm text-arc-200 mt-0.5">
                {roleLabel} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Pipeline stats */}
          <div>
            <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Pipeline at a glance</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              <StatCard label="Draft"       value={counts.draft}           color="text-arc-500"    />
              <StatCard label="UAT Queue"   value={counts.ready_for_uat}   color="text-amber-600"  />
              <StatCard label="In UAT"      value={counts.uat_in_progress} color="text-amber-600"  />
              <StatCard label="QA Review"   value={counts.qa_review}       color="text-amber-600"  />
              <StatCard label="Approved"    value={counts.approved}        color="text-emerald-600" />
              <StatCard label="Sent to IT"  value={counts.sent_to_it}      color="text-emerald-600" />
              <StatCard label="Live"        value={counts.live}            color="text-teal-600"    />
            </div>
          </div>

          {/* Role-specific action panels */}
          <div>
            <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Your queue</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Risk Analyst */}
              {(role === 'risk_analyst' || role === 'admin') && (
                <>
                  <Panel title="Your Drafts" count={myDrafts.length} empty="No drafts."
                    linkTo="/risk-edits" linkLabel="Go to Risk Edits →">
                    {myDrafts.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="Pending UAT Confirmation" count={myReadyForUat.length} empty="Nothing queued."
                    linkTo="/risk-edits" linkLabel="Go to Risk Edits →">
                    {myReadyForUat.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                </>
              )}

              {/* Risk Lead */}
              {role === 'risk_lead' && (
                <>
                  <Panel title="UAT Queue" count={uatQueue.length} empty="No changes queued."
                    linkTo="/changelog" linkLabel="Confirm on Changelog →">
                    {uatQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="UAT Running" count={uatRunning.length} empty="None in progress."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {uatRunning.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                </>
              )}

              {/* Tester */}
              {role === 'tester' && (
                <>
                  <Panel title="QA Review Queue" count={qaQueue.length} empty="Queue is clear."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {qaQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="Approved Pool" count={approvedPool.length} empty="None approved yet."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {approvedPool.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                </>
              )}

              {/* Testing Lead */}
              {role === 'testing_lead' && (
                <>
                  <Panel title="QA Review Queue" count={qaQueue.length} empty="Queue is clear."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {qaQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="Approved — Ready to Package" count={approvedPool.length} empty="Nothing approved yet."
                    linkTo="/changelog" linkLabel="Go to Approved Pool →">
                    {approvedPool.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                </>
              )}

              {/* IT Team */}
              {role === 'it_team' && (
                <>
                  <Panel title="Confirmed Packets" count={confirmedPackets.length}
                    empty="No packets awaiting deployment."
                    linkTo="/it-handoff-log" linkLabel="Go to IT Handoff Log →">
                    {confirmedPackets.slice(0, 5).map((pkt) => (
                      <button key={pkt.id}
                        onClick={() => navigate('/it-handoff-log')}
                        className="w-full flex items-start justify-between py-2.5 px-1 hover:bg-arc-50 rounded-lg transition-colors text-left group">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-arc-900 group-hover:text-arc-700 truncate">{pkt.name}</p>
                          {pkt.description && (
                            <p className="text-xs text-arc-200 mt-0.5 truncate">{pkt.description}</p>
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
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                </>
              )}

              {/* Admin — show cross-cutting view */}
              {role === 'admin' && (
                <>
                  <Panel title="UAT Queue" count={uatQueue.length} empty="No changes queued."
                    linkTo="/changelog" linkLabel="Confirm on Changelog →">
                    {uatQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="QA Review" count={qaQueue.length} empty="Queue is clear."
                    linkTo="/changelog" linkLabel="View Changelog →">
                    {qaQueue.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="Approved Pool" count={approvedPool.length} empty="Nothing to package."
                    linkTo="/changelog" linkLabel="Go to Approved Pool →">
                    {approvedPool.slice(0, 5).map((e) => (
                      <EditRow key={e.id} change={e} onClick={() => navigate(`/risk-edits/${e.id}`)} />
                    ))}
                  </Panel>
                  <Panel title="Confirmed Packets" count={confirmedPackets.length}
                    empty="No packets awaiting deployment."
                    linkTo="/it-handoff-log" linkLabel="Go to IT Handoff Log →">
                    {confirmedPackets.slice(0, 5).map((pkt) => (
                      <button key={pkt.id} onClick={() => navigate('/it-handoff-log')}
                        className="w-full flex items-start justify-between py-2.5 px-1 hover:bg-arc-50 rounded-lg transition-colors text-left group">
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

          {/* Engine modules mini-grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide">Engine Modules</p>
              <Link to="/engine-modules" className="text-xs text-arc-500 hover:text-arc-900 font-medium transition-colors">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {topModules.map((mod) => (
                <ModuleMiniCard key={mod.id} module={mod} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
