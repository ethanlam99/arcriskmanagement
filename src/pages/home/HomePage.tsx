import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useStrategyChanges } from '@/hooks/useStrategyChanges';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StageBadge } from '@/components/shared/StageBadge';
import type { StrategyChange } from '@/types';

function ChangeRow({ change, onClick }: { change: StrategyChange; onClick: () => void }) {
  const repo = useRepository();
  const { data: module } = useQuery({
    queryKey: ['aegis', 'engine_modules', change.target_module_id],
    queryFn: () => repo.engineModules.get(change.target_module_id),
  });

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-2.5 px-1 hover:bg-aegis-50 rounded-lg transition-colors text-left group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-aegis-900 truncate group-hover:text-aegis-700">
          {change.title}
        </p>
        <p className="text-xs text-aegis-200 mt-0.5 truncate font-mono">
          {module?.module_name ?? change.target_module_id}
        </p>
      </div>
      <StageBadge stage={change.current_stage} className="ml-3 shrink-0" />
    </button>
  );
}

export function HomePage() {
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();
  const { data: allChanges = [] } = useStrategyChanges();

  const myDrafts = allChanges.filter(
    (c) => c.created_by === currentUser?.id && c.current_stage === 'draft'
  );
  const pendingRevisions = allChanges.filter(
    (c) => c.created_by === currentUser?.id && c.current_stage === 'ready_for_uat'
  );
  const awaitingReview = allChanges.filter(
    (c) => c.current_stage === 'qa_review'
  );
  const recentHandoffs = allChanges.filter(
    (c) => c.current_stage === 'sent_to_it' || c.current_stage === 'approved_for_it'
  );
  const inFlight = allChanges.filter(
    (c) => c.current_stage === 'uat_in_progress'
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Home' }]} />} />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Welcome */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-aegis-900">
              Welcome back, {currentUser?.name}
            </h1>
            <p className="text-sm text-aegis-200 mt-0.5 capitalize">
              {role?.replace('_', ' ')} · Webank Risk Platform
            </p>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'In Draft', value: allChanges.filter((c) => c.current_stage === 'draft').length, color: 'text-zinc-600' },
              { label: 'In UAT', value: inFlight.length, color: 'text-amber-600' },
              { label: 'QA Review', value: awaitingReview.length, color: 'text-amber-600' },
              { label: 'Sent to IT', value: allChanges.filter((c) => c.current_stage === 'sent_to_it').length, color: 'text-emerald-600' },
            ].map((stat) => (
              <Card key={stat.label} padding="md" className="text-center">
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-aegis-200 mt-0.5">{stat.label}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Risk Analyst panels */}
            {(role === 'risk_analyst' || role === 'admin') && (
              <>
                <Card padding="md">
                  <CardHeader>
                    <CardTitle>Your Drafts</CardTitle>
                    <span className="text-xs text-aegis-200">{myDrafts.length} changes</span>
                  </CardHeader>
                  {myDrafts.length === 0 ? (
                    <p className="text-sm text-aegis-200 py-4 text-center">No drafts.</p>
                  ) : (
                    <div className="divide-y divide-aegis-200">
                      {myDrafts.map((c) => (
                        <ChangeRow key={c.id} change={c} onClick={() => navigate(`/strategy-changes/${c.id}`)} />
                      ))}
                    </div>
                  )}
                </Card>

                <Card padding="md">
                  <CardHeader>
                    <CardTitle>Pending UAT</CardTitle>
                    <span className="text-xs text-aegis-200">{pendingRevisions.length} changes</span>
                  </CardHeader>
                  {pendingRevisions.length === 0 ? (
                    <p className="text-sm text-aegis-200 py-4 text-center">Nothing queued.</p>
                  ) : (
                    <div className="divide-y divide-aegis-200">
                      {pendingRevisions.map((c) => (
                        <ChangeRow key={c.id} change={c} onClick={() => navigate(`/strategy-changes/${c.id}`)} />
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}

            {/* Tester panels */}
            {(role === 'tester' || role === 'admin') && (
              <>
                <Card padding="md">
                  <CardHeader>
                    <CardTitle>Awaiting QA Review</CardTitle>
                    <span className="text-xs text-aegis-200">{awaitingReview.length} changes</span>
                  </CardHeader>
                  {awaitingReview.length === 0 ? (
                    <p className="text-sm text-aegis-200 py-4 text-center">Queue is clear.</p>
                  ) : (
                    <div className="divide-y divide-aegis-200">
                      {awaitingReview.map((c) => (
                        <ChangeRow key={c.id} change={c} onClick={() => navigate(`/strategy-changes/${c.id}`)} />
                      ))}
                    </div>
                  )}
                </Card>

                <Card padding="md">
                  <CardHeader>
                    <CardTitle>Recent Handoffs</CardTitle>
                    <span className="text-xs text-aegis-200">{recentHandoffs.length} changes</span>
                  </CardHeader>
                  {recentHandoffs.length === 0 ? (
                    <p className="text-sm text-aegis-200 py-4 text-center">None yet.</p>
                  ) : (
                    <div className="divide-y divide-aegis-200">
                      {recentHandoffs.map((c) => (
                        <ChangeRow key={c.id} change={c} onClick={() => navigate(`/strategy-changes/${c.id}`)} />
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
