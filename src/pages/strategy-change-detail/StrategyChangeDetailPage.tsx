import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdit, useUpdateRiskEditStage } from '@/hooks/useRiskEdits';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { Stepper } from '@/components/ui/Stepper';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/Tabs';
import { EditTab } from './tabs/EditTab';
import { UatReportTab } from './tabs/UatReportTab';
import { QaReviewTab } from './tabs/QaReviewTab';
import { AuditTrailTab } from './tabs/AuditTrailTab';
import { useState } from 'react';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import type { RiskEditStage } from '@/types';

export function RiskEditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();
  const repo = useRepository();

  const { data: change, isLoading } = useRiskEdit(id ?? '');
  const { data: module } = useEngineModule(change?.target_module_id ?? '');
  const { data: author } = useQuery({
    queryKey: ['aegis', 'users', change?.created_by],
    queryFn: () => repo.users.get(change!.created_by),
    enabled: !!change?.created_by,
  });

  const stageTransition = useUpdateRiskEditStage();
  const [showConfirm, setShowConfirm] = useState<{ to: RiskEditStage; label: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-arc-200 text-sm">Loading…</div>
    );
  }

  if (!change) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-arc-900 font-medium">Change not found</p>
        <Button variant="secondary" size="sm" onClick={() => navigate('/strategy-changes')}>
          Back to list
        </Button>
      </div>
    );
  }

  const canSendForUat = (role === 'risk_analyst' || role === 'admin') && change.current_stage === 'draft';

  async function handleTransition(to: RiskEditStage) {
    if (!currentUser) return;
    await stageTransition.mutateAsync({
      id: change!.id,
      stage: to,
      actorId: currentUser.id,
      fromStage: change!.current_stage,
    });
    setShowConfirm(null);
  }

  const stage = change.current_stage;
  const uatAvailable = ['uat_in_progress', 'qa_review', 'approved_for_it', 'sent_to_it'].includes(stage);
  const qaAvailable  = ['qa_review', 'approved_for_it', 'sent_to_it'].includes(stage);

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Strategy Changes', to: '/strategy-changes' },
                { label: change.title },
              ]}
            />
          }
          actions={
            canSendForUat ? (
              <Button
                size="sm"
                onClick={() => setShowConfirm({ to: 'ready_for_uat', label: 'Send for UAT' })}
                loading={stageTransition.isPending}
              >
                Send for UAT
              </Button>
            ) : undefined
          }
        />

        {/* Change header */}
        <div className="px-6 py-4 border-b border-arc-200 bg-white shrink-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
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
          <Stepper currentStage={change.current_stage} />
        </div>

        {/* Tabbed body */}
        <Tabs defaultTab="edit" className="flex-1 min-h-0 overflow-hidden">
          <TabList className="px-6 bg-white shrink-0">
            <TabTrigger id="edit">Edit</TabTrigger>
            <TabTrigger id="uat" disabled={!uatAvailable}>UAT Report</TabTrigger>
            <TabTrigger id="qa"  disabled={!qaAvailable}>QA Review</TabTrigger>
            <TabTrigger id="audit">Audit Trail</TabTrigger>
          </TabList>

          <TabPanel id="edit" className="overflow-hidden">
            <EditTab change={change} />
          </TabPanel>

          <TabPanel id="uat" className="overflow-hidden">
            <UatReportTab change={change} />
          </TabPanel>

          <TabPanel id="qa" className="overflow-hidden">
            <QaReviewTab change={change} />
          </TabPanel>

          <TabPanel id="audit" className="overflow-hidden">
            <AuditTrailTab changeId={change.id} />
          </TabPanel>
        </Tabs>
      </div>

      {showConfirm && (
        <ConfirmModal
          title={showConfirm.label}
          description={'This will move the change to “Ready for UAT” and queue it for team lead confirmation on the Changelog page.'}
          confirmLabel={showConfirm.label}
          loading={stageTransition.isPending}
          onConfirm={() => handleTransition(showConfirm.to)}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </>
  );
}
