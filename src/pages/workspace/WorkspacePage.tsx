import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdit, useUpdateRiskEditStage } from '@/hooks/useRiskEdits';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { Stepper } from '@/components/ui/Stepper';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/Tabs';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { DraftQueueTab } from './tabs/DraftQueueTab';
import { UatTab } from './tabs/UatTab';
import { QaTab } from './tabs/QaTab';
import type { RiskEditStage } from '@/types';

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();
  const repo = useRepository();

  const { data: change, isLoading } = useRiskEdit(id ?? '');
  const { data: module } = useEngineModule(change?.target_module_id ?? '');
  const { data: author } = useQuery({
    queryKey: ['arc', 'users', change?.created_by],
    queryFn: () => repo.users.get(change!.created_by),
    enabled: !!change?.created_by,
  });

  const stageTransition = useUpdateRiskEditStage();
  const [showConfirm, setShowConfirm] = useState<{ to: RiskEditStage; label: string; description: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-arc-200 text-sm">Loading…</div>
    );
  }

  if (!change) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-arc-900 font-medium">Risk edit not found</p>
        <Button variant="secondary" size="sm" onClick={() => navigate('/risk-edits')}>
          Back to Risk Edits
        </Button>
      </div>
    );
  }

  const stage = change.current_stage;
  const isTerminal = stage === 'live' || stage === 'rejected';

  const canSendForUat =
    (role === 'risk_analyst' || role === 'risk_lead' || role === 'admin') &&
    stage === 'draft';

  const uatAvailable = ['uat_in_progress', 'qa_review', 'approved', 'sent_to_it', 'live'].includes(stage);
  const qaAvailable  = ['qa_review', 'approved', 'sent_to_it', 'live'].includes(stage);

  async function handleTransition(to: RiskEditStage) {
    if (!currentUser) return;
    await stageTransition.mutateAsync({
      id:        change!.id,
      stage:     to,
      actorId:   currentUser.id,
      fromStage: change!.current_stage,
    });
    setShowConfirm(null);
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Risk Edits', to: '/risk-edits' },
                { label: change.title },
              ]}
            />
          }
          actions={
            canSendForUat ? (
              <Button
                size="sm"
                onClick={() =>
                  setShowConfirm({
                    to: 'ready_for_uat',
                    label: 'Send for UAT',
                    description: 'This will move the edit to "Ready for UAT" and queue it for team lead confirmation on the Changelog page.',
                  })
                }
                loading={stageTransition.isPending}
              >
                Send for UAT
              </Button>
            ) : undefined
          }
        />

        {/* Edit header */}
        <div className="px-6 py-4 border-b border-arc-200 bg-white shrink-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs text-arc-300">{change.edit_id_display}</span>
              </div>
              <h1 className="text-lg font-semibold text-arc-900 truncate">{change.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-arc-200">
                <span className="font-mono">{module?.module_name ?? change.target_module_id}</span>
                <span>·</span>
                <span>by {author?.name ?? change.created_by}</span>
                <span>·</span>
                <span>{new Date(change.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <StageBadge stage={change.current_stage} />
          </div>

          {isTerminal && stage === 'live' && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
              <p className="text-xs text-teal-800 font-medium">
                This change is live in the risk engine. All views are read-only.
              </p>
            </div>
          )}

          {isTerminal && stage === 'rejected' && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <p className="text-xs text-rose-800 font-medium">
                This change was rejected. Create a new risk edit to start fresh.
              </p>
            </div>
          )}

          <Stepper currentStage={change.current_stage} />
        </div>

        {/* Tabbed workspace */}
        <Tabs defaultTab="draft" className="flex-1 min-h-0 overflow-hidden">
          <TabList className="px-6 bg-white shrink-0">
            <TabTrigger id="draft">Draft &amp; Queue</TabTrigger>
            <TabTrigger id="uat" disabled={!uatAvailable}>UAT</TabTrigger>
            <TabTrigger id="qa"  disabled={!qaAvailable}>QA</TabTrigger>
          </TabList>

          <TabPanel id="draft" className="overflow-hidden">
            <DraftQueueTab change={change} />
          </TabPanel>

          <TabPanel id="uat" className="overflow-hidden">
            <UatTab change={change} />
          </TabPanel>

          <TabPanel id="qa" className="overflow-hidden">
            <QaTab change={change} />
          </TabPanel>
        </Tabs>
      </div>

      {showConfirm && (
        <ConfirmModal
          title={showConfirm.label}
          description={showConfirm.description}
          confirmLabel={showConfirm.label}
          loading={stageTransition.isPending}
          onConfirm={() => handleTransition(showConfirm.to)}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </>
  );
}
