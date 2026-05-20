import { useState, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Beaker, AlertCircle, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useAllUatRuns } from '@/hooks/useUatRuns';
import { useProposedTestCases } from '@/hooks/useProposedTestCases';
import { useRepository } from '@/data/RepositoryProvider';
import { runUat } from '@/integrations/uatRunner';
import { ensureProposedCasesForReadyForUat } from '@/integrations/testCaseProposer';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { AttachmentUploader } from '@/components/shared/AttachmentUploader';
import type { RiskEdit, UatContextAttachment, ProposedTestCase } from '@/types';

const AI_TASK_STEP_KEYS = [
  'workspace.uat.task_step_load',
  'workspace.uat.task_step_diff',
  'workspace.uat.task_step_run',
  'workspace.uat.task_step_capture',
  'workspace.uat.task_step_compile',
] as const;

function ElapsedTimer({ updatedAt }: { updatedAt: string }) {
  const { t } = useTranslation();
  const [secs, setSecs] = useState(() =>
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)
  );
  useEffect(() => {
    const id = setInterval(
      () => setSecs(Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [updatedAt]);
  return <span>{t('workspace.uat.task_running_elapsed', { secs })}</span>;
}

function AiTaskList({
  mode,
  startedAt,
}: {
  mode: 'queued' | 'running' | 'done';
  startedAt?: string;
}) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (mode !== 'running') return;
    const id = setInterval(() => setTick((c) => c + 1), 400);
    return () => clearInterval(id);
  }, [mode]);

  let currentStep = -1;
  if (mode === 'done') {
    currentStep = AI_TASK_STEP_KEYS.length;
  } else if (mode === 'running' && startedAt) {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    currentStep = Math.min(
      AI_TASK_STEP_KEYS.length - 1,
      Math.floor(elapsed / 500)
    );
  }
  void tick;

  return (
    <ol className="flex flex-col gap-2">
      {AI_TASK_STEP_KEYS.map((labelKey, idx) => {
        const isDone = mode === 'done' || idx < currentStep;
        const isActive = mode === 'running' && idx === currentStep;
        const isPending = !isDone && !isActive;
        return (
          <li key={labelKey} className="flex items-center gap-2.5 text-xs">
            <span
              className={`flex items-center justify-center w-4 h-4 rounded-full shrink-0 ${
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isActive
                  ? 'bg-white dark:bg-arc-dark-100 border border-arc-500 dark:border-arc-dark-500'
                  : 'bg-white dark:bg-arc-dark-100 border border-arc-200 dark:border-arc-dark-200'
              }`}
            >
              {isDone ? (
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : isActive ? (
                <span className="w-2 h-2 rounded-full border border-arc-500 dark:border-arc-dark-500 border-t-transparent animate-spin" />
              ) : null}
            </span>
            <span
              className={
                isDone
                  ? 'text-arc-500 dark:text-arc-dark-500 line-through'
                  : isActive
                  ? 'text-arc-900 dark:text-arc-dark-700 font-medium'
                  : isPending
                  ? 'text-arc-200 dark:text-arc-dark-300'
                  : 'text-arc-500 dark:text-arc-dark-500'
              }
            >
              {t(labelKey)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ProposedCaseRow({
  proposed,
  locked,
  onToggleInclude,
  onRemove,
}: {
  proposed: ProposedTestCase;
  locked: boolean;
  onToggleInclude: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const isHuman = proposed.source === 'human';
  return (
    <li className={`rounded-lg border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-3 py-2.5 flex items-start gap-2.5 transition-opacity ${locked ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={proposed.included_in_run}
        onChange={onToggleInclude}
        disabled={locked}
        className="mt-0.5 rounded border-arc-300 dark:border-arc-dark-300 shrink-0"
        aria-label={proposed.included_in_run ? t('workspace.uat.case_exclude_aria') : t('workspace.uat.case_include_aria')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-arc-900 dark:text-arc-dark-700 leading-snug">{proposed.description}</p>
          <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
            isHuman ? 'text-forest-600 dark:text-forest-dark-700' : 'text-arc-500 dark:text-arc-dark-500'
          }`}>
            {isHuman ? t('workspace.uat.case_source_human') : t('workspace.uat.case_source_ai')}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className="bg-arc-100 dark:bg-arc-dark-100 rounded px-1.5 py-1 overflow-hidden">
            <span className="block text-arc-500 dark:text-arc-dark-500 mb-0.5">{t('workspace.uat.case_input')}</span>
            <span className="block text-arc-700 dark:text-arc-dark-700 truncate" title={JSON.stringify(proposed.input)}>
              {JSON.stringify(proposed.input)}
            </span>
          </div>
          <div className="bg-arc-100 dark:bg-arc-dark-100 rounded px-1.5 py-1 overflow-hidden">
            <span className="block text-arc-500 dark:text-arc-dark-500 mb-0.5">{t('workspace.uat.case_expected')}</span>
            <span className="block text-arc-700 dark:text-arc-dark-700 truncate" title={JSON.stringify(proposed.expected)}>
              {JSON.stringify(proposed.expected)}
            </span>
          </div>
        </div>
      </div>
      {isHuman && (
        <button
          type="button"
          onClick={onRemove}
          disabled={locked}
          className="shrink-0 mt-0.5 text-arc-400 dark:text-arc-dark-500 hover:text-rose-500 disabled:text-arc-200 transition-colors"
          aria-label={t('workspace.uat.case_remove_aria')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
}

function AddCaseForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { description: string; input: Record<string, unknown>; expected: Record<string, unknown> }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [inputJson, setInputJson] = useState('{\n  \n}');
  const [expectedJson, setExpectedJson] = useState('{\n  \n}');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError(t('workspace.uat.add_case_err_desc'));
      return;
    }
    let parsedInput: Record<string, unknown>;
    let parsedExpected: Record<string, unknown>;
    try {
      parsedInput = JSON.parse(inputJson);
    } catch {
      setError(t('workspace.uat.add_case_err_input'));
      return;
    }
    try {
      parsedExpected = JSON.parse(expectedJson);
    } catch {
      setError(t('workspace.uat.add_case_err_expected'));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ description: description.trim(), input: parsedInput, expected: parsedExpected });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 rounded-lg border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-3 py-3 flex flex-col gap-2.5">
      <label className="block">
        <span className="block text-[11px] font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-1">{t('workspace.uat.add_case_description')}</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('workspace.uat.add_case_description_placeholder')}
          className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2 py-1.5 text-xs focus:outline-none focus:border-forest-500"
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-1">{t('workspace.uat.add_case_input')}</span>
        <textarea
          value={inputJson}
          onChange={(e) => setInputJson(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:border-forest-500"
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-1">{t('workspace.uat.add_case_expected')}</span>
        <textarea
          value={expectedJson}
          onChange={(e) => setExpectedJson(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:border-forest-500"
        />
      </label>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-2.5 py-1 rounded-md text-arc-700 dark:text-arc-dark-700 hover:bg-arc-100 dark:hover:bg-arc-dark-50 transition-colors"
        >
          {t('workspace.uat.add_case_cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-2.5 py-1 rounded-md bg-forest-600 dark:bg-forest-dark-600 text-white hover:bg-forest-700 dark:hover:bg-forest-dark-700 disabled:bg-arc-300 transition-colors"
        >
          {submitting ? t('workspace.uat.add_case_submitting') : t('workspace.uat.add_case_submit')}
        </button>
      </div>
    </form>
  );
}

function ProposedCasesSection({
  edit,
  locked,
  onSendFromPanel,
}: {
  edit: RiskEdit;
  locked: boolean;
  onSendFromPanel: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();
  const { data: cases = [] } = useProposedTestCases(edit.id);
  const [showAddCase, setShowAddCase] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [sendingFromPanel, setSendingFromPanel] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const casesLocked = edit.cases_reviewed === true || locked;
  const includedCount = cases.filter((c) => c.included_in_run).length;

  async function toggleInclude(c: ProposedTestCase) {
    await repo.proposedTestCases.update(c.id, { included_in_run: !c.included_in_run });
    qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', edit.id] });
  }

  async function removeCase(c: ProposedTestCase) {
    await repo.proposedTestCases.delete(c.id);
    qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', edit.id] });
  }

  async function handleAddCase(data: { description: string; input: Record<string, unknown>; expected: Record<string, unknown> }) {
    if (!currentUser) return;
    await repo.proposedTestCases.create({
      risk_edit_id:    edit.id,
      description:     data.description,
      input:           data.input,
      expected:        data.expected,
      source:          'human',
      included_in_run: true,
      proposed_by:     currentUser.id,
    });
    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'test_cases.added_manually',
      entity_type:  'risk_edit',
      entity_id:    edit.id,
      payload_json: { description: data.description },
    });
    qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', edit.id] });
    setShowAddCase(false);
  }

  async function confirmReview() {
    if (!currentUser || edit.cases_reviewed) return;
    setMarkingReviewed(true);
    try {
      await repo.riskEdits.update(edit.id, { cases_reviewed: true } as Partial<RiskEdit>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'test_cases.marked_reviewed',
        entity_type:  'risk_edit',
        entity_id:    edit.id,
        payload_json: { case_count: includedCount },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setShowReviewConfirm(false);
      setShowAddCase(false);
    } finally {
      setMarkingReviewed(false);
    }
  }

  async function handleUnlock() {
    if (!currentUser || !edit.cases_reviewed || unlocking) return;
    setUnlocking(true);
    try {
      await repo.riskEdits.update(edit.id, { cases_reviewed: false } as Partial<RiskEdit>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'test_cases.unlocked',
        entity_type:  'risk_edit',
        entity_id:    edit.id,
        payload_json: { case_count: includedCount },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSendClick() {
    if (sendingFromPanel) return;
    setSendingFromPanel(true);
    try {
      await onSendFromPanel();
    } finally {
      setSendingFromPanel(false);
    }
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide mb-2">
        {t('workspace.uat.proposed_cases_heading')}
      </h3>
      <p className="text-xs text-arc-500 dark:text-arc-dark-500 mb-3 leading-relaxed">
        {t('workspace.uat.proposed_cases_help')}
      </p>
      {cases.length === 0 ? (
        <p className="text-xs text-arc-500 dark:text-arc-dark-500 italic">{t('workspace.uat.no_proposed_cases')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cases.map((c) => (
            <ProposedCaseRow
              key={c.id}
              proposed={c}
              locked={casesLocked}
              onToggleInclude={() => toggleInclude(c)}
              onRemove={() => removeCase(c)}
            />
          ))}
        </ul>
      )}
      {!showAddCase ? (
        <button
          type="button"
          onClick={() => setShowAddCase(true)}
          disabled={casesLocked}
          className="mt-2 text-xs font-medium text-forest-600 dark:text-forest-dark-700 hover:text-forest-700 dark:hover:text-forest-dark-700 disabled:text-arc-300"
        >
          {t('workspace.uat.propose_new_case')}
        </button>
      ) : (
        <AddCaseForm
          onSubmit={handleAddCase}
          onCancel={() => setShowAddCase(false)}
        />
      )}
      {edit.current_stage === 'ready_for_uat' && (
        <div className="mt-3">
          {!edit.cases_reviewed ? (
            <button
              type="button"
              onClick={() => setShowReviewConfirm(true)}
              disabled={markingReviewed || includedCount === 0}
              className="w-full rounded-lg bg-arc-900 dark:bg-arc-dark-900 text-white text-sm font-medium py-2 disabled:bg-arc-300 hover:bg-arc-700 dark:hover:bg-arc-dark-200 transition-colors"
              title={includedCount === 0 ? t('workspace.uat.include_at_least_one') : undefined}
            >
              {t('workspace.uat.mark_reviewed')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSendClick}
                disabled={sendingFromPanel || includedCount === 0}
                className="w-full rounded-lg bg-forest-600 dark:bg-forest-dark-600 text-white text-sm font-medium py-2 disabled:bg-arc-300 hover:bg-forest-700 dark:hover:bg-forest-dark-700 transition-colors"
              >
                {sendingFromPanel ? t('workspace.uat.sending') : t('workspace.uat.send_for_ai_uat_report')}
              </button>
              <button
                type="button"
                onClick={handleUnlock}
                disabled={sendingFromPanel || unlocking}
                className="mt-2 w-full text-center text-xs text-arc-500 dark:text-arc-dark-500 hover:text-arc-700 dark:hover:text-arc-dark-700 disabled:text-arc-300 transition-colors"
              >
                {unlocking ? t('workspace.uat.unlocking') : t('workspace.uat.unlock_cases')}
              </button>
            </>
          )}
        </div>
      )}
      {showReviewConfirm && (
        <ConfirmModal
          title={t('workspace.uat.lock_modal_title')}
          description={t('workspace.uat.lock_modal_desc', { count: includedCount })}
          confirmLabel={t('workspace.uat.lock_modal_confirm')}
          loading={markingReviewed}
          onConfirm={confirmReview}
          onCancel={() => setShowReviewConfirm(false)}
        />
      )}
    </section>
  );
}

function UatContextPanel({
  edit,
  onClose,
  onSendFromPanel,
}: {
  edit: RiskEdit;
  onClose: () => void;
  onSendFromPanel: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();

  const { data: attachments = [] } = useQuery({
    queryKey: ['arc', 'uat_context_attachments', edit.id],
    queryFn: async () => {
      const all = await repo.uatContextAttachments.list();
      return all.filter((a) => a.risk_edit_id === edit.id);
    },
  });

  const locked = edit.current_stage !== 'ready_for_uat';

  async function handleUpload(file: {
    filename: string;
    mime_type: string;
    size_bytes: number;
    content_base64: string;
  }) {
    if (!currentUser) return;
    await repo.uatContextAttachments.create({
      risk_edit_id:   edit.id,
      filename:       file.filename,
      mime_type:      file.mime_type,
      size_bytes:     file.size_bytes,
      content_base64: file.content_base64,
      uploaded_by:    currentUser.id,
      uploaded_at:    new Date().toISOString(),
    } as Omit<UatContextAttachment, 'id' | 'created_at'>);
    qc.invalidateQueries({ queryKey: ['arc', 'uat_context_attachments', edit.id] });
  }

  async function handleRemove(id: string) {
    await repo.uatContextAttachments.delete(id);
    qc.invalidateQueries({ queryKey: ['arc', 'uat_context_attachments', edit.id] });
  }

  const mode: 'queued' | 'running' | 'done' =
    edit.current_stage === 'ready_for_uat'
      ? 'queued'
      : edit.current_stage === 'uat_in_progress'
      ? 'running'
      : 'done';

  return (
    <div className="bg-arc-100/60 dark:bg-arc-dark-100/60 border-t border-arc-200 dark:border-arc-dark-200 px-5 py-5">
      <div className="flex items-center justify-end mb-3">
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-arc-500 dark:text-arc-dark-500 hover:text-arc-700 dark:hover:text-arc-dark-700 transition-colors"
        >
          {t('workspace.uat.panel_hide')}
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <ProposedCasesSection edit={edit} locked={locked} onSendFromPanel={onSendFromPanel} />
        </div>
        <div className="lg:col-span-1 order-1 lg:order-2 flex flex-col gap-5">
          <section>
            <h3 className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide mb-1">
              {t('workspace.uat.context_attachments')}
            </h3>
            <p className="text-xs text-arc-500 dark:text-arc-dark-500 mb-3 leading-relaxed">
              {locked
                ? t('workspace.uat.context_attachments_locked')
                : t('workspace.uat.context_attachments_open')}
            </p>
            <AttachmentUploader
              attachments={attachments}
              onUpload={handleUpload}
              onRemove={handleRemove}
              readonly={locked}
            />
          </section>

          <section>
            <h3 className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide mb-2">
              {t('workspace.uat.task_list')}
            </h3>
            <div className="rounded-lg border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-3 py-3">
              <AiTaskList mode={mode} startedAt={edit.updated_at} />
              {mode === 'queued' && (
                <p className="mt-3 pt-2.5 border-t border-arc-200 dark:border-arc-dark-200 text-[11px] text-arc-500 dark:text-arc-dark-500">
                  {t('workspace.uat.task_waiting')}
                </p>
              )}
              {mode === 'running' && (
                <p className="mt-3 pt-2.5 border-t border-arc-200 dark:border-arc-dark-200 text-[11px] text-arc-500 dark:text-arc-dark-500">
                  <ElapsedTimer updatedAt={edit.updated_at} />
                </p>
              )}
              {mode === 'done' && (
                <p className="mt-3 pt-2.5 border-t border-arc-200 dark:border-arc-dark-200 text-[11px] text-emerald-600">
                  {t('workspace.uat.task_done')}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function UatWorkspacePage() {
  const { t } = useTranslation();
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();

  const { data: allEdits = [] } = useRiskEdits();

  const queued  = allEdits.filter((e) => e.current_stage === 'ready_for_uat');
  const running = allEdits.filter((e) => e.current_stage === 'uat_in_progress');

  const canAct = role === 'tester' || role === 'testing_lead' || role === 'admin';

  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState<Set<string>>(new Set());
  const [openEditId, setOpenEditId] = useState<string | null>(null);
  type ToastPayload =
    | { ok: true;  kind: 'completion'; editId: string; displayId: string }
    | { ok: true;  kind: 'unstuck';    editId: string; displayId: string }
    | { ok: false; displayId: string;  error: string };

  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [confirmUnstickId, setConfirmUnstickId] = useState<string | null>(null);
  const [unsticking, setUnsticking] = useState(false);

  function showOutcomeToast(payload: ToastPayload) {
    setToast(payload);
    setTimeout(() => setToast(null), 5000);
  }

  const { data: allRuns = [] } = useAllUatRuns();

  function latestRun(editId: string) {
    return allRuns
      .filter((r) => r.risk_edit_id === editId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  }
  function isOrphaned(editId: string) {
    return latestRun(editId)?.status === 'failed';
  }

  function formatElapsed(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  async function handleUnstick(editId: string) {
    if (!currentUser) return;
    setUnsticking(true);
    try {
      await repo.riskEdits.update(editId, {
        current_stage:   'ready_for_uat',
        updated_at:      new Date().toISOString(),
        cases_reviewed:  false,
      } as Partial<RiskEdit>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'uat_run.unstuck',
        entity_type:  'risk_edit',
        entity_id:    editId,
        payload_json: { note: 'Admin manual recovery from orphaned uat_in_progress state' },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      const edit = allEdits.find((e) => e.id === editId);
      if (edit) {
        try {
          await ensureProposedCasesForReadyForUat(repo, edit);
        } catch {
          // Swallow — admin can still recover; tester can manually add cases.
        }
        qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', editId] });
      }
      showOutcomeToast({
        ok: true,
        kind: 'unstuck',
        editId,
        displayId: edit?.edit_id_display ?? editId,
      });
    } finally {
      setConfirmUnstickId(null);
      setUnsticking(false);
    }
  }

  const openEdit =
    [...queued, ...running].find((e) => e.id === openEditId) ?? null;

  useEffect(() => {
    if (openEditId && !openEdit) setOpenEditId(null);
  }, [openEditId, openEdit]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === queued.length ? new Set() : new Set(queued.map((e) => e.id))
    );
  }

  async function triggerUatForEdit(editId: string) {
    if (!currentUser) return;

    await repo.riskEdits.update(editId, {
      current_stage: 'uat_in_progress',
      updated_at:    new Date().toISOString(),
    } as Partial<RiskEdit>);
    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });

    const allVersions = await repo.riskEditVersions.list();
    const latest = allVersions
      .filter((v) => v.risk_edit_id === editId)
      .sort((a, b) => b.version_number - a.version_number)[0];

    if (!latest) throw new Error(`No version found for edit ${editId}`);

    const allProposed = await repo.proposedTestCases.listForEdit(editId);
    const included    = allProposed.filter((c) => c.included_in_run);

    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'uat_run.triggered',
      entity_type:  'risk_edit',
      entity_id:    editId,
      payload_json: { version_id: latest.id, case_count: included.length },
    });

    const run = await repo.uatRuns.create({
      risk_edit_id:    editId,
      version_id:      latest.id,
      status:          'running',
      started_at:      new Date().toISOString(),
      completed_at:    null,
      ai_report_json:  null,
      screenshot_refs: [],
    } as Parameters<typeof repo.uatRuns.create>[0]);

    try {
      const report = await runUat({ riskEditId: editId, versionId: latest.id, includedCases: included });

      await repo.uatRuns.update(run.id, {
        status:          'completed',
        completed_at:    new Date().toISOString(),
        ai_report_json:  report,
        screenshot_refs: report.screenshot_refs,
      } as Partial<typeof run>);

      await repo.riskEdits.update(editId, {
        current_stage: 'qa_review',
        updated_at:    new Date().toISOString(),
      } as Partial<RiskEdit>);

      const displayId = allEdits.find((e) => e.id === editId)?.edit_id_display ?? editId;
      showOutcomeToast({ ok: true, kind: 'completion', editId, displayId });

      await repo.auditLog.append({
        actor_id:     'system',
        action:       'uat_run.completed',
        entity_type:  'uat_run',
        entity_id:    run.id,
        payload_json: {
          risk_edit_id:  editId,
          cases_total:   report.summary.total,
          cases_passed:  report.summary.passed,
        },
      });
    } catch (err) {
      await repo.uatRuns.update(run.id, { status: 'failed' } as Partial<typeof run>);
      await repo.riskEdits.update(editId, {
        current_stage:   'ready_for_uat',
        updated_at:      new Date().toISOString(),
        cases_reviewed:  false,
      } as Partial<RiskEdit>);
      await repo.auditLog.append({
        actor_id:     'system',
        action:       'uat_run.failed',
        entity_type:  'uat_run',
        entity_id:    run.id,
        payload_json: { risk_edit_id: editId, error: String(err) },
      });
      const edit = allEdits.find((e) => e.id === editId);
      if (edit) {
        try {
          await ensureProposedCasesForReadyForUat(repo, edit);
        } catch {
          // Swallow — tester can manually add cases.
        }
        qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', editId] });
      }
      const displayId = edit?.edit_id_display ?? editId;
      showOutcomeToast({ ok: false, displayId, error: String(err) });
      throw err;
    } finally {
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });
    }
  }

  async function handleTrigger(ids: string[]) {
    setTriggering(new Set(ids));
    setSelected(new Set());
    await Promise.allSettled(ids.map((id) => triggerUatForEdit(id)));
    setTriggering(new Set());
    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
    qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });
  }

  const selectedIds = [...selected];

  function reviewQueueSubheading(): string {
    if (queued.length === 0) return t('workspace.uat.review_queue_sub_zero');
    return t('workspace.uat.review_queue_sub', { count: queued.length });
  }

  function runningSubheading(): string {
    if (running.length === 0) return t('workspace.uat.running_sub_zero');
    return t('workspace.uat.running_sub', { count: running.length });
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">

          {/* ── Section 1: AI UAT Review Queue ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-arc-900 dark:text-arc-dark-700">{t('workspace.uat.review_queue_heading')}</h2>
                <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5">{reviewQueueSubheading()}</p>
              </div>
              {canAct && selectedIds.length > 0 && (() => {
                const reviewedIds = selectedIds.filter((id) => {
                  const e = queued.find((q) => q.id === id);
                  return e?.cases_reviewed === true;
                });
                const noneReviewed = reviewedIds.length === 0;
                return (
                  <Button
                    size="sm"
                    onClick={() => handleTrigger(reviewedIds)}
                    loading={triggering.size > 0}
                    disabled={noneReviewed}
                    title={noneReviewed ? t('workspace.uat.review_cases_first_tip') : undefined}
                  >
                    {t('workspace.uat.send_selected_to_ai_uat', { count: reviewedIds.length })}
                  </Button>
                );
              })()}
            </div>

            {queued.length === 0 ? (
              <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-sm bg-white dark:bg-arc-dark-100 flex items-center justify-center py-12 flex-col gap-3 text-arc-500 dark:text-arc-dark-500">
                <Beaker className="w-12 h-12 text-arc-500 dark:text-arc-dark-500" strokeWidth={1.5} />
                <p className="text-sm">{t('workspace.uat.no_edits_review')}</p>
                <p className="text-xs text-center max-w-xs text-arc-500 dark:text-arc-dark-500">
                  {t('workspace.uat.no_edits_review_help')}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-sm overflow-hidden bg-white dark:bg-arc-dark-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arc-200 dark:border-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100">
                      {canAct && (
                        <th className="px-4 py-2.5 w-10">
                          <input
                            type="checkbox"
                            checked={selected.size === queued.length && queued.length > 0}
                            onChange={toggleAll}
                            className="rounded border-arc-300 dark:border-arc-dark-300"
                          />
                        </th>
                      )}
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('workspace.uat.col_edit')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('workspace.uat.col_module')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('workspace.uat.col_queued')}</th>
                      {canAct && <th className="px-4 py-2.5 w-44" />}
                    </tr>
                  </thead>
                  <tbody>
                    {queued.map((edit) => {
                      const isTriggering = triggering.has(edit.id);
                      const isOpen = openEditId === edit.id;
                      const colCount = canAct ? 5 : 4;
                      return (
                        <Fragment key={edit.id}>
                          <tr
                            onClick={() => setOpenEditId(isOpen ? null : edit.id)}
                            className={`border-b border-arc-200 dark:border-arc-dark-200 cursor-pointer transition-colors duration-150 ${
                              isOpen ? 'bg-arc-200 dark:bg-arc-dark-200' : 'hover:bg-arc-200 dark:hover:bg-arc-dark-200'
                            }`}
                          >
                            {canAct && (
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selected.has(edit.id)}
                                  onChange={() => toggleSelect(edit.id)}
                                  disabled={isTriggering || triggering.size > 0}
                                  className="rounded border-arc-300 dark:border-arc-dark-300"
                                />
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <p className="font-medium text-arc-900 dark:text-arc-dark-700">{edit.title}</p>
                              <p className="text-xs font-mono text-arc-500 dark:text-arc-dark-500 mt-0.5">{edit.edit_id_display}</p>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-arc-500 dark:text-arc-dark-500">{edit.target_module_id}</td>
                            <td className="px-4 py-3 text-xs text-arc-500 dark:text-arc-dark-500">
                              {new Date(edit.updated_at).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short',
                              })}
                            </td>
                            {canAct && (
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                {isTriggering ? (
                                  <span className="flex items-center gap-1.5 text-xs text-arc-500 dark:text-arc-dark-500">
                                    <span className="w-3 h-3 border border-arc-500 dark:border-arc-dark-500 border-t-transparent rounded-full animate-spin" />
                                    {t('workspace.uat.triggering')}
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={triggering.size > 0 || !edit.cases_reviewed}
                                    onClick={() => handleTrigger([edit.id])}
                                    title={!edit.cases_reviewed ? t('workspace.uat.review_cases_first_tip') : undefined}
                                  >
                                    {t('workspace.uat.send_to_ai_uat')}
                                  </Button>
                                )}
                              </td>
                            )}
                          </tr>
                          {isOpen && (
                            <tr className="border-b border-arc-200 dark:border-arc-dark-200 last:border-0">
                              <td colSpan={colCount} className="p-0">
                                <UatContextPanel
                                  edit={edit}
                                  onClose={() => setOpenEditId(null)}
                                  onSendFromPanel={() => handleTrigger([edit.id])}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!canAct && queued.length > 0 && (
              <p className="mt-2 text-xs text-arc-500 dark:text-arc-dark-500">
                {t('workspace.uat.only_testers')}
              </p>
            )}
          </section>

          {/* ── Section 2: UAT Running ── */}
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-arc-900 dark:text-arc-dark-700">{t('workspace.uat.running_heading')}</h2>
              <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5">{runningSubheading()}</p>
            </div>

            {running.length === 0 ? (
              <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-sm bg-white dark:bg-arc-dark-100 flex items-center justify-center py-12 flex-col gap-3 text-arc-500 dark:text-arc-dark-500">
                <Beaker className="w-12 h-12 text-arc-500 dark:text-arc-dark-500" strokeWidth={1.5} />
                <p className="text-sm">{t('workspace.uat.no_runs')}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-sm overflow-hidden bg-white dark:bg-arc-dark-100">
                {running.map((edit) => {
                  const isOpen = openEditId === edit.id;
                  const orphan = isOrphaned(edit.id);
                  const rowClass = `w-full text-left px-5 py-4 flex items-center gap-4 transition-colors duration-150 ${
                    isOpen ? 'bg-arc-200 dark:bg-arc-dark-200' : 'hover:bg-arc-200 dark:hover:bg-arc-dark-200'
                  }`;

                  const row = orphan ? (() => {
                    const run = latestRun(edit.id);
                    return (
                      <div
                        onClick={() => setOpenEditId(isOpen ? null : edit.id)}
                        className={`${rowClass} cursor-pointer`}
                      >
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" strokeWidth={2} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate">{edit.title}</p>
                          <p className="text-xs font-mono text-arc-500 dark:text-arc-dark-500 mt-0.5">
                            {edit.edit_id_display} · {edit.target_module_id}
                          </p>
                        </div>
                        <span className="text-xs text-rose-600 font-medium shrink-0">
                          {run
                            ? t('workspace.uat.uat_run_failed_stuck', { elapsed: formatElapsed(run.started_at) })
                            : t('workspace.uat.uat_run_failed_stuck_unknown')}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 shrink-0">
                          {t('workspace.uat.stuck')}
                        </span>
                        {role === 'admin' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmUnstickId(edit.id);
                            }}
                          >
                            {t('workspace.uat.unstick')}
                          </Button>
                        )}
                      </div>
                    );
                  })() : (
                    <button
                      onClick={() => setOpenEditId(isOpen ? null : edit.id)}
                      className={rowClass}
                    >
                      <div className="w-5 h-5 border-2 border-arc-500 dark:border-arc-dark-500 border-t-transparent rounded-full animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate">{edit.title}</p>
                        <p className="text-xs font-mono text-arc-500 dark:text-arc-dark-500 mt-0.5">
                          {edit.edit_id_display} · {edit.target_module_id}
                        </p>
                      </div>
                      <span className="text-xs text-arc-500 dark:text-arc-dark-500 font-medium shrink-0">
                        {t('workspace.uat.ai_generating')} <ElapsedTimer updatedAt={edit.updated_at} />
                      </span>
                      <StageBadge stage={edit.current_stage} />
                    </button>
                  );

                  return (
                    <div key={edit.id} className="border-b border-arc-200 dark:border-arc-dark-200 last:border-0">
                      {row}
                      {isOpen && (
                        <UatContextPanel
                          edit={edit}
                          onClose={() => setOpenEditId(null)}
                          onSendFromPanel={() => handleTrigger([edit.id])}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 ${toast.ok ? 'bg-arc-900 dark:bg-arc-dark-900' : 'bg-rose-900 dark:bg-rose-900'} text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3`}>
          <span>
            {toast.ok && toast.kind === 'completion'
              ? t('toast.uat_completion', { displayId: toast.displayId })
              : toast.ok && toast.kind === 'unstuck'
              ? t('toast.uat_unstuck', { displayId: toast.displayId })
              : !toast.ok
              ? t('toast.uat_failed', { displayId: toast.displayId })
              : ''}
          </span>
          {toast.ok && toast.kind === 'completion' && (
            <Link
              to={`/workspace/qa?edit=${toast.editId}`}
              className="text-forest-100 dark:text-forest-dark-700 hover:text-white font-medium underline-offset-2 hover:underline"
              onClick={() => setToast(null)}
            >
              {t('toast.open_arrow')}
            </Link>
          )}
        </div>
      )}

      {confirmUnstickId && (
        <ConfirmModal
          title={t('workspace.uat.unstick_modal_title')}
          description={t('workspace.uat.unstick_modal_desc', {
            title: allEdits.find((e) => e.id === confirmUnstickId)?.title ?? confirmUnstickId,
          })}
          confirmLabel={t('workspace.uat.unstick')}
          loading={unsticking}
          onConfirm={() => handleUnstick(confirmUnstickId)}
          onCancel={() => setConfirmUnstickId(null)}
        />
      )}
    </div>
  );
}
