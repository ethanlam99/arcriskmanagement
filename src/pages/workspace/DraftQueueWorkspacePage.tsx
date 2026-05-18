import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits, useUpdateRiskEditStage } from '@/hooks/useRiskEdits';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Stepper } from '@/components/ui/Stepper';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { DraftQueueTab } from './tabs/DraftQueueTab';
import type { RiskEdit } from '@/types';

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

function EditListItem({
  edit,
  userMap,
  isSelected,
  onClick,
}: {
  edit: RiskEdit;
  userMap: Record<string, { name: string; avatar_seed: string }>;
  isSelected: boolean;
  onClick: () => void;
}) {
  const user = userMap[edit.created_by];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b border-arc-200 transition-colors ${
        isSelected
          ? 'bg-arc-50 border-l-2 border-l-arc-500'
          : 'hover:bg-arc-50 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-arc-900 leading-snug line-clamp-2">{edit.title}</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0 font-medium tabular-nums bg-arc-100 text-arc-400">
          {formatTimeSince(edit.updated_at)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-arc-300 truncate">{edit.target_module_id}</span>
        {user && (
          <div className="flex items-center gap-1 shrink-0">
            <UserAvatar seed={user.avatar_seed} name={user.name} size="sm" />
            <span className="text-xs text-arc-300 truncate max-w-[72px]">{user.name.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </button>
  );
}

export function DraftQueueWorkspacePage() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: allEdits = [] } = useRiskEdits();
  const stageTransition = useUpdateRiskEditStage();

  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'map', 'profile'],
    queryFn: async () => {
      const users = await repo.users.list();
      return Object.fromEntries(
        users.map((u) => [u.id, { name: u.name, avatar_seed: u.avatar_seed }])
      );
    },
  });

  const drafts = allEdits
    .filter((e) => e.current_stage === 'draft')
    .sort((a, b) => a.edit_id_display.localeCompare(b.edit_id_display));
  const queued = allEdits
    .filter((e) => e.current_stage === 'ready_for_uat')
    .sort((a, b) => a.edit_id_display.localeCompare(b.edit_id_display));
  const combined = [...drafts, ...queued];

  const selectedId   = searchParams.get('edit') ?? '';
  const selectedEdit = combined.find((e) => e.id === selectedId) ?? null;
  const selectedIdx  = selectedEdit ? combined.findIndex((e) => e.id === selectedId) : -1;

  function selectEdit(edit: RiskEdit) {
    setSearchParams({ edit: edit.id }, { replace: true });
  }

  function goToPrev() {
    if (selectedIdx > 0) selectEdit(combined[selectedIdx - 1]);
  }
  function goToNext() {
    if (selectedIdx < combined.length - 1) selectEdit(combined[selectedIdx + 1]);
  }

  const canSendForUat =
    selectedEdit?.current_stage === 'draft' &&
    (role === 'risk_analyst' || role === 'risk_lead' || role === 'admin');

  async function handleSendForUat() {
    if (!currentUser || !selectedEdit) return;
    await stageTransition.mutateAsync({
      id:        selectedEdit.id,
      stage:     'ready_for_uat',
      actorId:   currentUser.id,
      fromStage: selectedEdit.current_stage,
    });
    setShowConfirm(false);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left pane ── */}
      <div className="w-72 shrink-0 border-r border-arc-200 bg-white flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-arc-200 bg-arc-50 shrink-0">
          <p className="text-xs font-semibold text-arc-500 uppercase tracking-wider">
            Drafts
            <span className="ml-1.5 font-mono font-normal text-arc-300">({drafts.length})</span>
          </p>
        </div>

        <div className="overflow-y-auto flex-1">
          {drafts.length === 0 ? (
            <p className="px-3 py-4 text-xs text-arc-200 text-center italic">No drafts.</p>
          ) : (
            drafts.map((e) => (
              <EditListItem
                key={e.id}
                edit={e}
                userMap={userMap}
                isSelected={e.id === selectedId}
                onClick={() => selectEdit(e)}
              />
            ))
          )}

          <div className="px-3 py-2.5 border-b border-t border-arc-200 bg-arc-50 shrink-0">
            <p className="text-xs font-semibold text-arc-500 uppercase tracking-wider">
              Queued for UAT
              <span className="ml-1.5 font-mono font-normal text-arc-300">({queued.length})</span>
            </p>
          </div>

          {queued.length === 0 ? (
            <p className="px-3 py-4 text-xs text-arc-200 text-center italic">No edits queued.</p>
          ) : (
            queued.map((e) => (
              <EditListItem
                key={e.id}
                edit={e}
                userMap={userMap}
                isSelected={e.id === selectedId}
                onClick={() => selectEdit(e)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right pane ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selectedEdit ? (
          <div className="flex h-full items-center justify-center flex-col gap-3 text-arc-200">
            <Inbox className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
            <p className="text-sm">Select an edit from the list to begin.</p>
          </div>
        ) : (
          <>
            {/* Right pane header */}
            <div className="px-4 py-2.5 border-b border-arc-200 bg-white flex items-center gap-3 shrink-0">
              {/* Sequential nav */}
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPrev}
                  disabled={selectedIdx <= 0}
                  className="w-6 h-6 flex items-center justify-center rounded border border-arc-200 text-arc-400 hover:border-arc-500 hover:text-arc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  ←
                </button>
                <span className="text-xs text-arc-300 tabular-nums w-10 text-center">
                  {selectedIdx + 1} / {combined.length}
                </span>
                <button
                  onClick={goToNext}
                  disabled={selectedIdx >= combined.length - 1}
                  className="w-6 h-6 flex items-center justify-center rounded border border-arc-200 text-arc-400 hover:border-arc-500 hover:text-arc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  →
                </button>
              </div>

              <div className="w-px h-4 bg-arc-200 shrink-0" />

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-mono text-xs text-arc-300 shrink-0">{selectedEdit.edit_id_display}</span>
                <span className="text-sm font-medium text-arc-900 truncate">{selectedEdit.title}</span>
                <StageBadge stage={selectedEdit.current_stage} />
              </div>

              {canSendForUat && (
                <Button
                  size="sm"
                  onClick={() => setShowConfirm(true)}
                  loading={stageTransition.isPending}
                >
                  Send for UAT
                </Button>
              )}
            </div>

            {/* Stepper */}
            <div className="px-4 py-2.5 border-b border-arc-200 bg-white shrink-0">
              <Stepper currentStage={selectedEdit.current_stage} />
            </div>

            {/* DraftQueueTab fills the rest */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <DraftQueueTab change={selectedEdit} />
            </div>
          </>
        )}
      </div>

      {showConfirm && selectedEdit && (
        <ConfirmModal
          title="Send for UAT"
          description={`Queue "${selectedEdit.title}" for AI UAT testing. A tester can trigger the run from the UAT workspace.`}
          confirmLabel="Send for UAT"
          loading={stageTransition.isPending}
          onConfirm={handleSendForUat}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
