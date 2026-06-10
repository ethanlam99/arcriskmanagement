import { useState, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Beaker, Trash2, Sparkles, CheckCircle2, XCircle, Ban, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits, useRiskEditVersions } from '@/hooks/useRiskEdits';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useAllUatRuns } from '@/hooks/useUatRuns';
import { useProposedTestCases, useCoverageCritique } from '@/hooks/useProposedTestCases';
import { useRepository } from '@/data/RepositoryProvider';
import { runUat } from '@/integrations/uatRunner';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { AttachmentUploader } from '@/components/shared/AttachmentUploader';
import { EditPacket, type EditPacketData } from '@/components/shared/EditPacket';
import type {
  RiskEdit,
  UatContextAttachment,
  ProposedTestCase,
  ManualCaseStatus,
  CoverageGap,
  UatRun,
  TestCase,
  UatReport,
} from '@/types';

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

// ── AI coverage critique ("cases you might miss") ─────────────────────────────
// The standout tester-facing AI outcome in the manual lane. When `onAddCase` is
// supplied the gaps are actionable (add to plan); otherwise they render read-only.
function CoverageCritiqueCard({
  edit,
  open,
  existingDescriptions,
  onAddCase,
}: {
  edit: RiskEdit;
  open: boolean;
  existingDescriptions: Set<string>;
  onAddCase?: (gap: CoverageGap) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { data: gaps = [], isLoading } = useCoverageCritique(edit, open);
  const [adding, setAdding] = useState<string | null>(null);

  // A gap whose suggested case is already in the plan is considered handled.
  const remaining = gaps.filter((g) => !existingDescriptions.has(g.suggested_description));

  async function handleAdd(gap: CoverageGap) {
    if (!onAddCase) return;
    setAdding(gap.id);
    try {
      await onAddCase(gap);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="rounded-xl border border-forest-100 dark:border-forest-dark-600/40 bg-forest-50/50 dark:bg-forest-dark-600/10 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-forest-100 dark:border-forest-dark-600/40 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-forest-600 dark:text-forest-dark-700 shrink-0" strokeWidth={2} />
        <span className="text-sm font-semibold text-arc-900 dark:text-arc-dark-700">{t('workspace.uat.critique.heading')}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-forest-700 dark:text-forest-dark-700">
          {t('workspace.uat.critique.badge')}
        </span>
      </div>
      <div className="p-4">
        <p className="text-xs text-arc-500 dark:text-arc-dark-500 mb-3 leading-relaxed">
          {t('workspace.uat.critique.help')}
        </p>
        {isLoading ? (
          <p className="text-xs text-arc-500 dark:text-arc-dark-500 italic flex items-center gap-2">
            <span className="w-3 h-3 border border-forest-500 border-t-transparent rounded-full animate-spin" />
            {t('workspace.uat.critique.loading')}
          </p>
        ) : gaps.length === 0 ? (
          <p className="text-xs text-arc-500 dark:text-arc-dark-500 italic">{t('workspace.uat.critique.none')}</p>
        ) : remaining.length === 0 ? (
          <p className="text-xs text-forest-700 dark:text-forest-dark-700 font-medium">{t('workspace.uat.critique.all_added')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {remaining.map((g) => (
              <li
                key={g.id}
                className="rounded-lg border border-forest-100 dark:border-forest-dark-600/30 bg-white dark:bg-arc-dark-100 px-3 py-2.5 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-forest-700 dark:text-forest-dark-700 bg-forest-100 dark:bg-forest-dark-600/20 rounded px-1.5 py-0.5 mb-1">
                    {g.area}
                  </span>
                  <p className="text-xs text-arc-700 dark:text-arc-dark-700 leading-snug">{g.gap}</p>
                  <p className="mt-1 text-[11px] text-arc-500 dark:text-arc-dark-500 font-mono truncate" title={g.suggested_description}>
                    → {g.suggested_description}
                  </p>
                </div>
                {onAddCase && (
                  <button
                    type="button"
                    onClick={() => handleAdd(g)}
                    disabled={adding === g.id}
                    className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md bg-forest-600 dark:bg-forest-dark-600 text-white hover:bg-forest-700 dark:hover:bg-forest-dark-700 disabled:bg-arc-300 transition-colors"
                  >
                    {adding === g.id ? t('workspace.uat.critique.added') : t('workspace.uat.critique.add')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!onAddCase && remaining.length > 0 && (
          <p className="mt-2 text-[11px] text-arc-500 dark:text-arc-dark-500 italic">{t('workspace.uat.critique.add_locked_hint')}</p>
        )}
      </div>
    </div>
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

// ── Plan curation + lock (the ready_for_uat phase) ────────────────────────────
function ProposedCasesSection({
  edit,
  onBeginFromPanel,
}: {
  edit: RiskEdit;
  onBeginFromPanel: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();
  const { data: cases = [] } = useProposedTestCases(edit.id);
  const [showAddCase, setShowAddCase] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [beginningFromPanel, setBeginningFromPanel] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const casesLocked = edit.cases_reviewed === true;
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

  async function handleBeginClick() {
    if (beginningFromPanel) return;
    setBeginningFromPanel(true);
    try {
      await onBeginFromPanel();
    } finally {
      setBeginningFromPanel(false);
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
      <div className="mt-3">
        {!casesLocked ? (
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
            <p className="text-xs text-arc-500 dark:text-arc-dark-500 mb-2">{t('workspace.uat.plan_locked_hint')}</p>
            <button
              type="button"
              onClick={handleBeginClick}
              disabled={beginningFromPanel || includedCount === 0}
              className="w-full rounded-lg bg-forest-600 dark:bg-forest-dark-600 text-white text-sm font-medium py-2 disabled:bg-arc-300 hover:bg-forest-700 dark:hover:bg-forest-dark-700 transition-colors"
            >
              {beginningFromPanel ? t('workspace.uat.beginning') : t('workspace.uat.begin_uat')}
            </button>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={beginningFromPanel || unlocking}
              className="mt-2 w-full text-center text-xs text-arc-500 dark:text-arc-dark-500 hover:text-arc-700 dark:hover:text-arc-dark-700 disabled:text-arc-300 transition-colors"
            >
              {unlocking ? t('workspace.uat.unlocking') : t('workspace.uat.unlock_cases')}
            </button>
          </>
        )}
      </div>
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

// ── Manual execution lane (the gate) ──────────────────────────────────────────
const MANUAL_STATUSES: ManualCaseStatus[] = ['passed', 'failed', 'blocked'];

function statusMeta(status: ManualCaseStatus) {
  switch (status) {
    case 'passed':  return { icon: CheckCircle2, key: 'workspace.uat.manual.status_passed', cls: 'text-emerald-600 dark:text-emerald-400', active: 'bg-emerald-500 text-white border-emerald-500' };
    case 'failed':  return { icon: XCircle,      key: 'workspace.uat.manual.status_failed', cls: 'text-rose-600 dark:text-rose-400',       active: 'bg-rose-500 text-white border-rose-500' };
    case 'blocked': return { icon: Ban,          key: 'workspace.uat.manual.status_blocked', cls: 'text-amber-600 dark:text-amber-accent-400', active: 'bg-amber-500 text-white border-amber-500' };
    default:        return { icon: CheckCircle2, key: 'workspace.uat.manual.status_pending', cls: 'text-arc-400', active: '' };
  }
}

function ManualCaseRow({
  proposed,
  canAct,
  userName,
  onSetStatus,
  onSaveActual,
  onSaveNote,
}: {
  proposed: ProposedTestCase;
  canAct: boolean;
  userName?: string;
  onSetStatus: (status: ManualCaseStatus) => Promise<void>;
  onSaveActual: (actual: string) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [actual, setActual] = useState(proposed.manual_actual ?? '');
  const [note, setNote] = useState(proposed.manual_note ?? '');

  // Keep local inputs in sync if the case is updated elsewhere (e.g. a reset).
  useEffect(() => { setActual(proposed.manual_actual ?? ''); }, [proposed.manual_actual]);
  useEffect(() => { setNote(proposed.manual_note ?? ''); }, [proposed.manual_note]);

  const current = proposed.manual_status ?? 'pending';
  const executed = current !== 'pending';

  return (
    <li className="rounded-lg border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-arc-900 dark:text-arc-dark-700 leading-snug">{proposed.description}</p>
        <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${proposed.source === 'human' ? 'text-forest-600 dark:text-forest-dark-700' : 'text-arc-500 dark:text-arc-dark-500'}`}>
          {proposed.source === 'human' ? t('workspace.uat.case_source_human') : t('workspace.uat.case_source_ai')}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="bg-arc-100 dark:bg-arc-dark-100 rounded px-1.5 py-1 overflow-hidden">
          <span className="block text-arc-500 dark:text-arc-dark-500 mb-0.5">{t('workspace.uat.case_input')}</span>
          <span className="block text-arc-700 dark:text-arc-dark-700 truncate" title={JSON.stringify(proposed.input)}>{JSON.stringify(proposed.input)}</span>
        </div>
        <div className="bg-arc-100 dark:bg-arc-dark-100 rounded px-1.5 py-1 overflow-hidden">
          <span className="block text-arc-500 dark:text-arc-dark-500 mb-0.5">{t('workspace.uat.manual.expected_ai')}</span>
          <span className="block text-arc-700 dark:text-arc-dark-700 truncate" title={JSON.stringify(proposed.expected)}>{JSON.stringify(proposed.expected)}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {MANUAL_STATUSES.map((s) => {
          const meta = statusMeta(s);
          const isActive = current === s;
          return (
            <button
              key={s}
              type="button"
              disabled={!canAct}
              onClick={() => onSetStatus(s)}
              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                isActive
                  ? meta.active
                  : 'border-arc-200 dark:border-arc-dark-200 text-arc-500 dark:text-arc-dark-500 hover:border-arc-300 dark:hover:border-arc-dark-300'
              }`}
            >
              <meta.icon className="w-3 h-3" strokeWidth={2} />
              {t(meta.key)}
            </button>
          );
        })}
        {executed && proposed.executed_at && (
          <span className="ml-auto text-[10px] text-arc-400 dark:text-arc-dark-500 truncate">
            {userName ? t('workspace.uat.manual.executed_by', { name: userName }) : null}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5">
        <textarea
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          onBlur={() => { if (actual !== (proposed.manual_actual ?? '')) onSaveActual(actual); }}
          disabled={!canAct}
          rows={2}
          placeholder={t('workspace.uat.manual.actual_placeholder')}
          className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:border-forest-500 disabled:opacity-60"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (proposed.manual_note ?? '')) onSaveNote(note); }}
          disabled={!canAct}
          placeholder={t('workspace.uat.manual.note_placeholder')}
          className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2 py-1.5 text-[11px] focus:outline-none focus:border-forest-500 disabled:opacity-60"
        />
      </div>
    </li>
  );
}

function ManualLane({
  edit,
  canAct,
  userMap,
  busy,
  onRequestSignOff,
  onRequestReturn,
}: {
  edit: RiskEdit;
  canAct: boolean;
  userMap: Record<string, { name: string }>;
  busy: boolean;
  onRequestSignOff: (total: number) => void;
  onRequestReturn: (failCount: number) => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();
  const { data: cases = [] } = useProposedTestCases(edit.id);

  const included = cases.filter((c) => c.included_in_run);
  const executed = included.filter((c) => c.manual_status && c.manual_status !== 'pending');
  const failures = included.filter((c) => c.manual_status === 'failed' || c.manual_status === 'blocked');
  const total = included.length;
  const allExecuted = total > 0 && executed.length === total;
  const pct = total === 0 ? 0 : Math.round((executed.length / total) * 100);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', edit.id] });
  }

  async function setStatus(c: ProposedTestCase, status: ManualCaseStatus) {
    if (!currentUser) return;
    await repo.proposedTestCases.update(c.id, {
      manual_status: status,
      executed_by:   currentUser.id,
      executed_at:   new Date().toISOString(),
    });
    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'manual_uat.case_executed',
      entity_type:  'risk_edit',
      entity_id:    edit.id,
      payload_json: { case_id: c.id, status },
    });
    invalidate();
  }

  async function saveActual(c: ProposedTestCase, actual: string) {
    await repo.proposedTestCases.update(c.id, { manual_actual: actual });
    invalidate();
  }

  async function saveNote(c: ProposedTestCase, note: string) {
    await repo.proposedTestCases.update(c.id, { manual_note: note });
    invalidate();
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide">
          {t('workspace.uat.manual.heading')}
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-forest-700 dark:text-forest-dark-700 bg-forest-100 dark:bg-forest-dark-600/20 rounded-full px-2 py-0.5">
          {t('workspace.uat.manual.gate_badge')}
        </span>
      </div>
      <p className="text-xs text-arc-500 dark:text-arc-dark-500 mb-3 leading-relaxed">
        {t('workspace.uat.manual.help')}
      </p>

      {/* Coverage bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] text-arc-500 dark:text-arc-dark-500 mb-1">
          <span>{allExecuted ? t('workspace.uat.manual.coverage_complete') : t('workspace.uat.manual.coverage', { done: executed.length, total })}</span>
          <span className="font-mono">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-arc-200 dark:bg-arc-dark-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${failures.length > 0 ? 'bg-amber-500' : 'bg-forest-500 dark:bg-forest-dark-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="text-xs text-arc-500 dark:text-arc-dark-500 italic">{t('workspace.uat.manual.no_cases')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {included.map((c) => (
            <ManualCaseRow
              key={c.id}
              proposed={c}
              canAct={canAct}
              userName={c.executed_by ? userMap[c.executed_by]?.name : undefined}
              onSetStatus={(s) => setStatus(c, s)}
              onSaveActual={(a) => saveActual(c, a)}
              onSaveNote={(n) => saveNote(c, n)}
            />
          ))}
        </ul>
      )}

      {canAct && (
        <div className="mt-4">
          {failures.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-accent-400 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
              {t('workspace.uat.manual.failures_present', { count: failures.length })}
            </p>
          )}
          {failures.length > 0 ? (
            <button
              type="button"
              onClick={() => onRequestReturn(failures.length)}
              disabled={busy}
              className="w-full rounded-lg bg-rose-600 text-white text-sm font-medium py-2 disabled:bg-arc-300 hover:bg-rose-700 transition-colors"
            >
              {t('workspace.uat.manual.return_to_author')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestSignOff(total)}
              disabled={busy || !allExecuted}
              className="w-full rounded-lg bg-forest-600 dark:bg-forest-dark-600 text-white text-sm font-medium py-2 disabled:bg-arc-300 hover:bg-forest-700 dark:hover:bg-forest-dark-700 transition-colors"
              title={!allExecuted ? t('workspace.uat.manual.sign_off_blocked_incomplete') : undefined}
            >
              {t('workspace.uat.manual.sign_off')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ── AI advisory lane (badged POC; never gates progression) ────────────────────
function AiAdvisoryLane({
  edit,
  canAct,
  isRunning,
  latestRun,
  onRun,
}: {
  edit: RiskEdit;
  canAct: boolean;
  isRunning: boolean;
  latestRun: UatRun | undefined;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const mode: 'queued' | 'running' | 'done' = isRunning
    ? 'running'
    : latestRun?.status === 'completed'
    ? 'done'
    : 'queued';
  const report = latestRun?.status === 'completed' ? latestRun.ai_report_json : null;
  const failed = !isRunning && latestRun?.status === 'failed';

  return (
    <section className="rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-arc-200 dark:border-arc-dark-200 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-arc-500 dark:text-arc-dark-500 shrink-0" strokeWidth={2} />
        <span className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700">{t('workspace.uat.ai_lane.heading')}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-accent-400 bg-amber-50 dark:bg-amber-accent-400/10 rounded-full px-2 py-0.5">
          {t('workspace.uat.ai_lane.badge')}
        </span>
      </div>
      <div className="px-3 py-3">
        <p className="text-[11px] text-arc-500 dark:text-arc-dark-500 mb-3 leading-relaxed">{t('workspace.uat.ai_lane.help')}</p>

        {mode === 'queued' && !failed && (
          <p className="text-[11px] text-arc-500 dark:text-arc-dark-500 italic mb-3">{t('workspace.uat.ai_lane.no_run_yet')}</p>
        )}

        {(mode === 'running' || mode === 'done') && (
          <div className="mb-3">
            <AiTaskList mode={mode} startedAt={latestRun?.started_at} />
            {mode === 'running' && latestRun && (
              <p className="mt-2.5 pt-2 border-t border-arc-200 dark:border-arc-dark-200 text-[11px] text-arc-500 dark:text-arc-dark-500">
                <ElapsedTimer updatedAt={latestRun.started_at} />
              </p>
            )}
          </div>
        )}

        {report && (
          <p className="text-[11px] text-arc-700 dark:text-arc-dark-700 mb-3 font-medium">
            {t('workspace.uat.ai_lane.report_summary', {
              passed: report.summary.passed,
              total: report.summary.total,
              frontend_ok: report.summary.frontend_ok,
            })}
          </p>
        )}

        {failed && (
          <p className="text-[11px] text-rose-600 mb-3">{t('workspace.uat.ai_lane.report_failed')}</p>
        )}

        {canAct && (
          <Button
            size="sm"
            variant="secondary"
            loading={isRunning}
            disabled={isRunning}
            onClick={onRun}
          >
            {isRunning
              ? t('workspace.uat.ai_lane.running')
              : latestRun
              ? t('workspace.uat.ai_lane.rerun')
              : t('workspace.uat.ai_lane.run')}
          </Button>
        )}
      </div>
    </section>
  );
}

function ReturnToAuthorModal({
  failCount,
  loading,
  onConfirm,
  onCancel,
}: {
  failCount: number;
  loading: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-arc-900/40 dark:bg-arc-dark-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-arc-dark-100 rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-lg w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-semibold text-arc-900 dark:text-arc-dark-700 mb-2">{t('workspace.uat.manual.return_modal_title')}</h2>
        <p className="text-sm text-arc-500 dark:text-arc-dark-500 mb-4">{t('workspace.uat.manual.return_modal_desc', { count: failCount })}</p>
        <label className="block mb-5">
          <span className="block text-[11px] font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-1">{t('workspace.uat.manual.return_notes_label')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={t('workspace.uat.manual.return_notes_placeholder')}
            className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2 py-1.5 text-xs focus:outline-none focus:border-forest-500"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            {t('confirm.default_cancel')}
          </Button>
          <Button variant="destructive" size="sm" loading={loading} onClick={() => onConfirm(notes)}>
            {t('workspace.uat.manual.return_modal_confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UatContextPanel({
  edit,
  canAct,
  onClose,
  onBeginFromPanel,
  aiRunning,
  latestRun,
  onRunAi,
  signOffBusy,
  onRequestSignOff,
  onRequestReturn,
}: {
  edit: RiskEdit;
  canAct: boolean;
  onClose: () => void;
  onBeginFromPanel: () => Promise<void>;
  aiRunning: boolean;
  latestRun: UatRun | undefined;
  onRunAi: () => void;
  signOffBusy: boolean;
  onRequestSignOff: (total: number) => void;
  onRequestReturn: (failCount: number) => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();

  const isPlanning = edit.current_stage === 'ready_for_uat';

  // Author / executor name resolution for the packet + manual lane.
  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'map', 'profile'],
    queryFn: async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, { name: u.name }])) as Record<string, { name: string }>;
    },
  });

  // Assemble the standardised packet (deferred from Line 3) from the latest version.
  const { data: versions = [] } = useRiskEditVersions(edit.id);
  const { data: module } = useEngineModule(edit.target_module_id);
  const latestVersion = versions[0];
  const packet: EditPacketData = {
    editIdDisplay: edit.edit_id_display,
    title:         edit.title,
    brief:         edit.natural_language_brief,
    moduleName:    module?.module_name ?? edit.target_module_id,
    nodeSource:    latestVersion?.node_after ?? module?.current_node_code ?? '',
    compiledSql:   latestVersion?.sql_after ?? module?.current_sql_code ?? '',
    diffSummary:   latestVersion?.diff_summary,
    rationale:     latestVersion?.ai_rationale || undefined,
    authorName:    userMap[edit.created_by]?.name,
  };

  const { data: cases = [] } = useProposedTestCases(edit.id);
  const existingDescriptions = new Set(cases.map((c) => c.description));

  const { data: attachments = [] } = useQuery({
    queryKey: ['arc', 'uat_context_attachments', edit.id],
    queryFn: async () => {
      const all = await repo.uatContextAttachments.list();
      return all.filter((a) => a.risk_edit_id === edit.id);
    },
  });

  const attachmentsLocked = !isPlanning;

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

  async function addCaseFromGap(gap: CoverageGap) {
    if (!currentUser) return;
    await repo.proposedTestCases.create({
      risk_edit_id:    edit.id,
      description:     gap.suggested_description,
      input:           gap.suggested_input,
      expected:        gap.suggested_expected,
      source:          'human',
      included_in_run: true,
      proposed_by:     currentUser.id,
    });
    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'test_cases.added_from_critique',
      entity_type:  'risk_edit',
      entity_id:    edit.id,
      payload_json: { area: gap.area, description: gap.suggested_description },
    });
    qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', edit.id] });
  }

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

      <div className="flex flex-col gap-5">
        <EditPacket data={packet} />

        <CoverageCritiqueCard
          edit={edit}
          open
          existingDescriptions={existingDescriptions}
          onAddCase={isPlanning && !edit.cases_reviewed && canAct ? addCaseFromGap : undefined}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 order-2 lg:order-1">
            {isPlanning ? (
              <ProposedCasesSection edit={edit} onBeginFromPanel={onBeginFromPanel} />
            ) : (
              <ManualLane
                edit={edit}
                canAct={canAct}
                userMap={userMap}
                busy={signOffBusy}
                onRequestSignOff={onRequestSignOff}
                onRequestReturn={onRequestReturn}
              />
            )}
          </div>

          <div className="lg:col-span-1 order-1 lg:order-2 flex flex-col gap-5">
            {!isPlanning && (
              <AiAdvisoryLane
                edit={edit}
                canAct={canAct}
                isRunning={aiRunning}
                latestRun={latestRun}
                onRun={onRunAi}
              />
            )}

            <section>
              <h3 className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide mb-1">
                {t('workspace.uat.context_attachments')}
              </h3>
              <p className="text-xs text-arc-500 dark:text-arc-dark-500 mb-3 leading-relaxed">
                {attachmentsLocked
                  ? t('workspace.uat.context_attachments_locked')
                  : t('workspace.uat.context_attachments_open')}
              </p>
              <AttachmentUploader
                attachments={attachments}
                onUpload={handleUpload}
                onRemove={handleRemove}
                readonly={attachmentsLocked}
              />
            </section>

            {isPlanning && (
              <section className="rounded-lg border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 px-3 py-3">
                <h3 className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide mb-1">
                  {t('workspace.uat.next_steps_heading')}
                </h3>
                <p className="text-[11px] text-arc-500 dark:text-arc-dark-500 leading-relaxed">
                  {t('workspace.uat.next_steps_body')}
                </p>
              </section>
            )}
          </div>
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
  const { data: allRuns = [] } = useAllUatRuns();

  const queued  = allEdits.filter((e) => e.current_stage === 'ready_for_uat');
  const running = allEdits.filter((e) => e.current_stage === 'uat_in_progress');

  const canAct = role === 'tester' || role === 'testing_lead' || role === 'admin';

  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [beginning, setBeginning] = useState<Set<string>>(new Set());
  const [aiRunning, setAiRunning] = useState<Set<string>>(new Set());
  const [openEditId, setOpenEditId] = useState<string | null>(null);

  type ToastPayload =
    | { ok: true;  kind: 'signed_off'; editId: string; displayId: string }
    | { ok: true;  kind: 'ai_done';    editId: string; displayId: string }
    | { ok: true;  kind: 'returned';   editId: string; displayId: string }
    | { ok: false; displayId: string;  error: string };

  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [signOffModal, setSignOffModal] = useState<{ editId: string; total: number } | null>(null);
  const [returnModal,  setReturnModal]  = useState<{ editId: string; failCount: number } | null>(null);
  const [signOffBusy, setSignOffBusy] = useState(false);

  function showOutcomeToast(payload: ToastPayload) {
    setToast(payload);
    setTimeout(() => setToast(null), 5000);
  }

  function latestRun(editId: string): UatRun | undefined {
    return allRuns
      .filter((r) => r.risk_edit_id === editId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  }

  const openEdit = [...queued, ...running].find((e) => e.id === openEditId) ?? null;

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

  // ── Begin UAT: ready_for_uat → uat_in_progress (no run; manual lane drives) ──
  async function beginUat(editId: string) {
    if (!currentUser) return;
    await repo.riskEdits.update(editId, {
      current_stage: 'uat_in_progress',
      updated_at:    new Date().toISOString(),
    } as Partial<RiskEdit>);
    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'manual_uat.began',
      entity_type:  'risk_edit',
      entity_id:    editId,
      payload_json: {},
    });
    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
  }

  async function handleBegin(ids: string[]) {
    setBeginning(new Set(ids));
    setSelected(new Set());
    await Promise.allSettled(ids.map((id) => beginUat(id)));
    setBeginning(new Set());
    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
    if (ids.length === 1) setOpenEditId(ids[0]); // jump straight into execution
  }

  // ── AI advisory run: produces a report; never changes the stage ─────────────
  async function runAiAdvisory(editId: string) {
    if (!currentUser) return;
    setAiRunning((prev) => new Set(prev).add(editId));

    const allVersions = await repo.riskEditVersions.list();
    const latest = allVersions
      .filter((v) => v.risk_edit_id === editId)
      .sort((a, b) => b.version_number - a.version_number)[0];

    const allProposed = await repo.proposedTestCases.listForEdit(editId);
    const included    = allProposed.filter((c) => c.included_in_run);

    const run = await repo.uatRuns.create({
      risk_edit_id:    editId,
      version_id:      latest?.id ?? '',
      status:          'running',
      started_at:      new Date().toISOString(),
      completed_at:    null,
      ai_report_json:  null,
      screenshot_refs: [],
    } as Parameters<typeof repo.uatRuns.create>[0]);

    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'ai_uat.advisory_triggered',
      entity_type:  'risk_edit',
      entity_id:    editId,
      payload_json: { version_id: latest?.id, case_count: included.length },
    });
    qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });

    try {
      const report = await runUat({ riskEditId: editId, versionId: latest?.id ?? '', includedCases: included });
      await repo.uatRuns.update(run.id, {
        status:          'completed',
        completed_at:    new Date().toISOString(),
        ai_report_json:  report,
        screenshot_refs: report.screenshot_refs,
      } as Partial<typeof run>);
      await repo.auditLog.append({
        actor_id:     'system',
        action:       'ai_uat.advisory_completed',
        entity_type:  'uat_run',
        entity_id:    run.id,
        payload_json: { risk_edit_id: editId, cases_total: report.summary.total, cases_passed: report.summary.passed },
      });
      const displayId = allEdits.find((e) => e.id === editId)?.edit_id_display ?? editId;
      showOutcomeToast({ ok: true, kind: 'ai_done', editId, displayId });
    } catch (err) {
      await repo.uatRuns.update(run.id, { status: 'failed' } as Partial<typeof run>);
      await repo.auditLog.append({
        actor_id:     'system',
        action:       'ai_uat.advisory_failed',
        entity_type:  'uat_run',
        entity_id:    run.id,
        payload_json: { risk_edit_id: editId, error: String(err) },
      });
      const displayId = allEdits.find((e) => e.id === editId)?.edit_id_display ?? editId;
      showOutcomeToast({ ok: false, displayId, error: String(err) });
    } finally {
      setAiRunning((prev) => {
        const n = new Set(prev);
        n.delete(editId);
        return n;
      });
      qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });
    }
  }

  // ── Sign-off (the gate): uat_in_progress → qa_review ────────────────────────
  // The manual execution results become the UAT report of record, persisted as a
  // completed uat_run so the downstream QA stage has the signed-off cases to review.
  async function handleSignOff(editId: string) {
    if (!currentUser) return;
    setSignOffBusy(true);
    try {
      const included = (await repo.proposedTestCases.listForEdit(editId)).filter((c) => c.included_in_run);
      const passed = included.filter((c) => c.manual_status === 'passed').length;

      const test_cases: TestCase[] = included.map((c) => ({
        id:                 `tc-${c.id}`,
        description:        c.description,
        input:             c.input,
        expected:          c.expected,
        actual:            { observed: c.manual_actual || '(matched expected)' },
        status:            c.manual_status === 'failed' ? 'failed' : c.manual_status === 'blocked' ? 'inconclusive' : 'passed',
        frontend_render_ok: true,
        ...(c.manual_note ? { annotation: c.manual_note } : {}),
      }));
      const report: UatReport = {
        generated_at:    new Date().toISOString(),
        screenshot_refs: [],
        summary: {
          total:           test_cases.length,
          passed:          test_cases.filter((tc) => tc.status === 'passed').length,
          failed:          test_cases.filter((tc) => tc.status === 'failed').length,
          inconclusive:    test_cases.filter((tc) => tc.status === 'inconclusive').length,
          frontend_ok:     test_cases.length,
          frontend_not_ok: 0,
        },
        test_cases,
      };

      const allVersions = await repo.riskEditVersions.list();
      const latest = allVersions
        .filter((v) => v.risk_edit_id === editId)
        .sort((a, b) => b.version_number - a.version_number)[0];

      await repo.uatRuns.create({
        risk_edit_id:    editId,
        version_id:      latest?.id ?? '',
        status:          'completed',
        started_at:      new Date().toISOString(),
        completed_at:    new Date().toISOString(),
        ai_report_json:  report,
        screenshot_refs: [],
      } as Parameters<typeof repo.uatRuns.create>[0]);

      await repo.riskEdits.update(editId, {
        current_stage: 'qa_review',
        updated_at:    new Date().toISOString(),
      } as Partial<RiskEdit>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'manual_uat.signed_off',
        entity_type:  'risk_edit',
        entity_id:    editId,
        payload_json: { cases_total: included.length, cases_passed: passed },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });
      const displayId = allEdits.find((e) => e.id === editId)?.edit_id_display ?? editId;
      showOutcomeToast({ ok: true, kind: 'signed_off', editId, displayId });
      setSignOffModal(null);
    } finally {
      setSignOffBusy(false);
    }
  }

  // ── Return to author: uat_in_progress → draft, with notes + plan reset ───────
  async function handleReturnToAuthor(editId: string, notes: string) {
    if (!currentUser) return;
    setSignOffBusy(true);
    try {
      const included = (await repo.proposedTestCases.listForEdit(editId)).filter((c) => c.included_in_run);
      const failCount = included.filter((c) => c.manual_status === 'failed' || c.manual_status === 'blocked').length;

      // Reset the plan so the re-test starts clean when the edit returns.
      for (const c of included) {
        await repo.proposedTestCases.update(c.id, { manual_status: 'pending', manual_actual: '', manual_note: '' });
      }
      await repo.riskEdits.update(editId, {
        current_stage:  'draft',
        updated_at:     new Date().toISOString(),
        cases_reviewed: false,
        rejection_notes: notes.trim() || undefined,
      } as Partial<RiskEdit>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'manual_uat.returned_to_author',
        entity_type:  'risk_edit',
        entity_id:    editId,
        payload_json: { fail_count: failCount, notes: notes.trim() },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      qc.invalidateQueries({ queryKey: ['arc', 'proposed_test_cases', editId] });
      const displayId = allEdits.find((e) => e.id === editId)?.edit_id_display ?? editId;
      showOutcomeToast({ ok: true, kind: 'returned', editId, displayId });
      setReturnModal(null);
    } finally {
      setSignOffBusy(false);
    }
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

          {/* ── Section 1: UAT Review Queue (plan curation + lock) ── */}
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
                    onClick={() => handleBegin(reviewedIds)}
                    loading={beginning.size > 0}
                    disabled={noneReviewed}
                    title={noneReviewed ? t('workspace.uat.lock_plan_first_tip') : undefined}
                  >
                    {t('workspace.uat.begin_selected', { count: reviewedIds.length })}
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
                      const isBeginning = beginning.has(edit.id);
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
                                  disabled={isBeginning || beginning.size > 0}
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
                                {isBeginning ? (
                                  <span className="flex items-center gap-1.5 text-xs text-arc-500 dark:text-arc-dark-500">
                                    <span className="w-3 h-3 border border-arc-500 dark:border-arc-dark-500 border-t-transparent rounded-full animate-spin" />
                                    {t('workspace.uat.beginning')}
                                  </span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={beginning.size > 0 || !edit.cases_reviewed}
                                    onClick={() => handleBegin([edit.id])}
                                    title={!edit.cases_reviewed ? t('workspace.uat.lock_plan_first_tip') : undefined}
                                  >
                                    {t('workspace.uat.begin_uat')}
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
                                  canAct={canAct}
                                  onClose={() => setOpenEditId(null)}
                                  onBeginFromPanel={() => handleBegin([edit.id])}
                                  aiRunning={aiRunning.has(edit.id)}
                                  latestRun={latestRun(edit.id)}
                                  onRunAi={() => runAiAdvisory(edit.id)}
                                  signOffBusy={signOffBusy}
                                  onRequestSignOff={(total) => setSignOffModal({ editId: edit.id, total })}
                                  onRequestReturn={(failCount) => setReturnModal({ editId: edit.id, failCount })}
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

          {/* ── Section 2: Manual UAT in progress ── */}
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
                  const rowClass = `w-full text-left px-5 py-4 flex items-center gap-4 transition-colors duration-150 ${
                    isOpen ? 'bg-arc-200 dark:bg-arc-dark-200' : 'hover:bg-arc-200 dark:hover:bg-arc-dark-200'
                  }`;
                  return (
                    <div key={edit.id} className="border-b border-arc-200 dark:border-arc-dark-200 last:border-0">
                      <button onClick={() => setOpenEditId(isOpen ? null : edit.id)} className={rowClass}>
                        <Beaker className="w-5 h-5 text-forest-600 dark:text-forest-dark-700 shrink-0" strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate">{edit.title}</p>
                          <p className="text-xs font-mono text-arc-500 dark:text-arc-dark-500 mt-0.5">
                            {edit.edit_id_display} · {edit.target_module_id}
                          </p>
                        </div>
                        <span className="text-xs text-arc-500 dark:text-arc-dark-500 font-medium shrink-0">
                          {t('workspace.uat.manual_in_progress')}
                        </span>
                        <StageBadge stage={edit.current_stage} />
                      </button>
                      {isOpen && (
                        <UatContextPanel
                          edit={edit}
                          canAct={canAct}
                          onClose={() => setOpenEditId(null)}
                          onBeginFromPanel={() => handleBegin([edit.id])}
                          aiRunning={aiRunning.has(edit.id)}
                          latestRun={latestRun(edit.id)}
                          onRunAi={() => runAiAdvisory(edit.id)}
                          signOffBusy={signOffBusy}
                          onRequestSignOff={(total) => setSignOffModal({ editId: edit.id, total })}
                          onRequestReturn={(failCount) => setReturnModal({ editId: edit.id, failCount })}
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
            {toast.ok && toast.kind === 'signed_off'
              ? t('toast.uat_signed_off', { displayId: toast.displayId })
              : toast.ok && toast.kind === 'ai_done'
              ? t('toast.uat_ai_done', { displayId: toast.displayId })
              : toast.ok && toast.kind === 'returned'
              ? t('toast.uat_returned', { displayId: toast.displayId })
              : !toast.ok
              ? t('toast.uat_failed', { displayId: toast.displayId })
              : ''}
          </span>
          {toast.ok && toast.kind === 'signed_off' && (
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

      {signOffModal && (
        <ConfirmModal
          title={t('workspace.uat.manual.signoff_modal_title')}
          description={t('workspace.uat.manual.signoff_modal_desc', {
            total: signOffModal.total,
            displayId: allEdits.find((e) => e.id === signOffModal.editId)?.edit_id_display ?? signOffModal.editId,
          })}
          confirmLabel={t('workspace.uat.manual.signoff_modal_confirm')}
          loading={signOffBusy}
          onConfirm={() => handleSignOff(signOffModal.editId)}
          onCancel={() => setSignOffModal(null)}
        />
      )}

      {returnModal && (
        <ReturnToAuthorModal
          failCount={returnModal.failCount}
          loading={signOffBusy}
          onConfirm={(notes) => handleReturnToAuthor(returnModal.editId, notes)}
          onCancel={() => setReturnModal(null)}
        />
      )}
    </div>
  );
}
