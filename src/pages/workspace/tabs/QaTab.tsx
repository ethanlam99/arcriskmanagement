import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useLatestUatRun } from '@/hooks/useUatRuns';
import { useUpdateRiskEditStage } from '@/hooks/useRiskEdits';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { AttachmentUploader } from '@/components/shared/AttachmentUploader';
import type { RiskEdit, TestCase, TestCaseStatus, QaReviewAttachment } from '@/types';

interface QaTabProps {
  change: RiskEdit;
}

const DRAFT_KEY = (changeId: string) => `arc:qa_draft:${changeId}`;

type StatusOverrides = Record<string, TestCaseStatus>;
type Annotations     = Record<string, string>;
type Reviewed        = Record<string, boolean>;

function statusColor(status: TestCaseStatus): string {
  if (status === 'passed')  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed')  return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function ReviewableTestCaseRow({
  tc,
  annotation,
  statusOverride,
  isReviewed,
  attachments,
  onAnnotationChange,
  onStatusOverride,
  onToggleReviewed,
  onUploadAttachment,
  onRemoveAttachment,
  readonly,
}: {
  tc: TestCase;
  annotation: string;
  statusOverride: TestCaseStatus | null;
  isReviewed: boolean;
  attachments: QaReviewAttachment[];
  onAnnotationChange: (val: string) => void;
  onStatusOverride: (val: TestCaseStatus) => void;
  onToggleReviewed: () => void;
  onUploadAttachment: (
    tcId: string,
    file: { filename: string; mime_type: string; size_bytes: number; content_base64: string }
  ) => Promise<void>;
  onRemoveAttachment: (id: string) => Promise<void>;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const displayStatus = statusOverride ?? tc.status;

  return (
    <>
      <tr
        className={`border-b border-arc-200 transition-colors duration-150 ${isReviewed ? 'bg-emerald-50/30' : ''} hover:bg-arc-200`}
      >
        <td className="px-4 py-2.5 font-mono text-xs text-arc-500">{tc.id}</td>
        <td className="px-4 py-2.5 text-sm text-arc-900 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          {tc.description}
        </td>
        <td className="px-4 py-2.5">
          {readonly ? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(displayStatus)}`}>
              {t(`workspace.qa.status_${displayStatus}`)}
            </span>
          ) : (
            <select
              value={displayStatus}
              onChange={(e) => onStatusOverride(e.target.value as TestCaseStatus)}
              className="text-xs border border-arc-200 rounded-lg px-2 py-1 bg-white text-arc-900 focus:outline-none focus:ring-1 focus:ring-arc-500"
            >
              <option value="passed">{t('workspace.qa.status_passed')}</option>
              <option value="failed">{t('workspace.qa.status_failed')}</option>
              <option value="inconclusive">{t('workspace.qa.status_inconclusive')}</option>
            </select>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${tc.frontend_render_ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${tc.frontend_render_ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {tc.frontend_render_ok ? t('workspace.qa.frontend_ok') : t('workspace.qa.frontend_issue')}
          </span>
        </td>
        {!readonly && (
          <td className="px-4 py-2.5">
            <button
              onClick={onToggleReviewed}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${
                isReviewed
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-white border-arc-200 text-arc-500 hover:border-arc-500 hover:text-arc-700'
              }`}
            >
              {isReviewed ? t('workspace.qa.reviewed') : t('workspace.qa.mark_reviewed')}
            </button>
          </td>
        )}
      </tr>
      {expanded && (
        <tr className="border-b border-arc-200 bg-arc-100">
          <td colSpan={readonly ? 4 : 5} className="px-6 py-4">
            <div className="grid grid-cols-3 gap-4 text-xs mb-3">
              {[
                { label: t('workspace.qa.input'),    data: tc.input,    cls: 'bg-white border-arc-200 text-arc-900' },
                { label: t('workspace.qa.expected'), data: tc.expected, cls: 'bg-white border-arc-200 text-arc-900' },
                { label: t('workspace.qa.actual'),   data: tc.actual,   cls: tc.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-arc-200 text-arc-900' },
              ].map(({ label, data, cls }) => (
                <div key={label}>
                  <p className="font-semibold text-arc-500 mb-1.5">{label}</p>
                  <pre className={`border rounded-lg px-3 py-2 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed ${cls}`}>
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-arc-500 mb-1.5">
                {readonly ? t('workspace.qa.annotation') : t('workspace.qa.annotation_optional')}
              </p>
              {readonly ? (
                annotation ? (
                  <p className="text-xs text-arc-900 bg-white border border-arc-200 rounded-lg px-3 py-2 leading-relaxed">
                    {annotation}
                  </p>
                ) : (
                  <p className="text-xs text-arc-500 italic">{t('workspace.qa.no_annotation')}</p>
                )
              ) : (
                <Textarea
                  rows={2}
                  placeholder={t('workspace.qa.annotation_placeholder')}
                  value={annotation}
                  onChange={(e) => onAnnotationChange(e.target.value)}
                  className="text-xs resize-none"
                />
              )}
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold text-arc-500 mb-1.5">
                {t('workspace.qa.supporting_evidence')}
                {!readonly && (
                  <span className="ml-1.5 font-normal text-arc-500">
                    {t('workspace.qa.evidence_help')}
                  </span>
                )}
              </p>
              <AttachmentUploader
                attachments={attachments}
                onUpload={(file) => onUploadAttachment(tc.id, file)}
                onRemove={onRemoveAttachment}
                readonly={readonly}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function QaTab({ change }: QaTabProps) {
  const { t } = useTranslation();
  const { currentUser, role } = useAuth();
  const repo   = useRepository();
  const qc     = useQueryClient();
  const stageTransition = useUpdateRiskEditStage();

  const { data: run, isLoading: runLoading } = useLatestUatRun(change.id);

  const canAct   = (role === 'tester' || role === 'testing_lead' || role === 'admin') && change.current_stage === 'qa_review';
  const isTerminal = ['approved', 'sent_to_it', 'live'].includes(change.current_stage);

  const { data: attachments = [] } = useQuery({
    queryKey: ['arc', 'qa_review_attachments', run?.id],
    queryFn: async () => {
      if (!run) return [] as QaReviewAttachment[];
      const all = await repo.qaReviewAttachments.list();
      return all.filter((a) => a.uat_run_id === run.id);
    },
    enabled: !!run,
  });

  async function handleUploadAttachment(
    tcId: string,
    file: { filename: string; mime_type: string; size_bytes: number; content_base64: string }
  ) {
    if (!currentUser || !run) return;
    await repo.qaReviewAttachments.create({
      uat_run_id:     run.id,
      test_case_id:   tcId,
      filename:       file.filename,
      mime_type:      file.mime_type,
      size_bytes:     file.size_bytes,
      content_base64: file.content_base64,
      uploaded_by:    currentUser.id,
      uploaded_at:    new Date().toISOString(),
    } as Omit<QaReviewAttachment, 'id' | 'created_at'>);
    qc.invalidateQueries({ queryKey: ['arc', 'qa_review_attachments', run.id] });
  }

  async function handleRemoveAttachment(id: string) {
    if (!run) return;
    await repo.qaReviewAttachments.delete(id);
    qc.invalidateQueries({ queryKey: ['arc', 'qa_review_attachments', run.id] });
  }

  const [annotations,    setAnnotations]    = useState<Annotations>({});
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [reviewed,       setReviewed]       = useState<Reviewed>({});
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal,  setShowRejectModal]  = useState(false);
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [toast,            setToast]            = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(change.id));
      if (raw) {
        const draft = JSON.parse(raw);
        setAnnotations(draft.annotations ?? {});
        setStatusOverrides(draft.statusOverrides ?? {});
        setReviewed(draft.reviewed ?? {});
      }
    } catch { /* ignore */ }
  }, [change.id]);

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY(change.id), JSON.stringify({ annotations, statusOverrides, reviewed }));
    showToast(t('workspace.qa.draft_saved'));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleApprove() {
    if (!currentUser || !run) return;
    setIsSubmitting(true);
    try {
      await repo.uatReviews.create({
        uat_run_id:          run.id,
        reviewer_id:         currentUser.id,
        annotations_json:    annotations,
        edits_to_report_json: { test_cases: run.ai_report_json?.test_cases?.map((tc) => ({
          ...tc,
          status: statusOverrides[tc.id] ?? tc.status,
          annotation: annotations[tc.id] ?? tc.annotation,
        })) },
        final_verdict:       'approved',
        decided_at:          new Date().toISOString(),
      });

      await stageTransition.mutateAsync({
        id:        change.id,
        stage:     'approved',
        actorId:   currentUser.id,
        fromStage: change.current_stage,
      });

      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'qa_review.approved',
        entity_type:  'risk_edit',
        entity_id:    change.id,
        payload_json: { uat_run_id: run.id },
      });

      localStorage.removeItem(DRAFT_KEY(change.id));
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setShowApproveModal(false);
      showToast(t('workspace.qa.approved_toast'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReject() {
    if (!currentUser || !run || !rejectionNotes.trim()) return;
    setIsSubmitting(true);
    try {
      await repo.uatReviews.create({
        uat_run_id:          run.id,
        reviewer_id:         currentUser.id,
        annotations_json:    { rejection_notes: rejectionNotes.trim(), ...annotations },
        edits_to_report_json: {},
        final_verdict:       'rejected',
        decided_at:          new Date().toISOString(),
      });

      await stageTransition.mutateAsync({
        id:        change.id,
        stage:     'draft',
        actorId:   currentUser.id,
        fromStage: change.current_stage,
      });

      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'qa_review.rejected',
        entity_type:  'risk_edit',
        entity_id:    change.id,
        payload_json: { uat_run_id: run.id, notes: rejectionNotes.trim() },
      });

      localStorage.removeItem(DRAFT_KEY(change.id));
      qc.invalidateQueries({ queryKey: ['arc', 'uat_reviews', 'rejected', change.id] });
      setShowRejectModal(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (runLoading) {
    return <div className="flex h-full items-center justify-center text-arc-500 text-sm">{t('common.loading')}</div>;
  }

  if (!run || !run.ai_report_json) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-2 text-arc-500">
        <p className="text-sm">{t('workspace.qa.no_report')}</p>
      </div>
    );
  }

  const reviewedCount = Object.values(reviewed).filter(Boolean).length;
  const testCases = run.ai_report_json.test_cases;

  const passedCount = testCases.filter(
    (tc) => (statusOverrides[tc.id] ?? tc.status) === 'passed'
  ).length;
  const allPassed = passedCount === testCases.length;
  const allReviewed = reviewedCount === testCases.length;
  const canApprove = allPassed && allReviewed;

  const failingCount = testCases.length - passedCount;
  const unreviewedCount = testCases.length - reviewedCount;
  const approveBlockedReason = canApprove
    ? ''
    : !allPassed && !allReviewed
      ? t('workspace.qa.blocked_both')
      : !allPassed
        ? t('workspace.qa.blocked_failed', { count: failingCount })
        : t('workspace.qa.blocked_unreviewed', { count: unreviewedCount });

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-3 border-b border-arc-200 bg-amber-50 shrink-0">
          <p className="text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">{t('workspace.qa.review_header', { title: change.title })}</span>
            {canAct && t('workspace.qa.review_header_can_act')}
            {isTerminal && t('workspace.qa.review_header_terminal')}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-5">
            <div className="rounded-xl border border-arc-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-arc-200 bg-arc-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">{t('workspace.qa.col_id')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">{t('workspace.qa.col_description')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">{t('workspace.qa.col_status')}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">{t('workspace.qa.col_frontend')}</th>
                    {canAct && <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">{t('workspace.qa.col_review')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {testCases.map((tc) => (
                    <ReviewableTestCaseRow
                      key={tc.id}
                      tc={tc}
                      annotation={annotations[tc.id] ?? ''}
                      statusOverride={statusOverrides[tc.id] ?? null}
                      isReviewed={!!reviewed[tc.id]}
                      attachments={attachments.filter((a) => a.test_case_id === tc.id)}
                      readonly={!canAct}
                      onAnnotationChange={(val) => setAnnotations((prev) => ({ ...prev, [tc.id]: val }))}
                      onStatusOverride={(val) => setStatusOverrides((prev) => ({ ...prev, [tc.id]: val }))}
                      onToggleReviewed={() => setReviewed((prev) => ({ ...prev, [tc.id]: !prev[tc.id] }))}
                      onUploadAttachment={handleUploadAttachment}
                      onRemoveAttachment={handleRemoveAttachment}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {canAct && (
          <div className="shrink-0 border-t border-arc-200 bg-white px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-xs text-arc-500">
              {t('workspace.qa.summary', {
                passed: passedCount,
                total: testCases.length,
                reviewed: reviewedCount,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={saveDraft}>
                {t('workspace.qa.save_draft')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() => setShowRejectModal(true)}
              >
                {t('workspace.qa.reject_return')}
              </Button>
              <span title={approveBlockedReason || undefined} className="inline-block">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={!canApprove}
                  onClick={() => setShowApproveModal(true)}
                >
                  {t('workspace.qa.approve')}
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-arc-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {showApproveModal && (
        <ConfirmModal
          title={t('workspace.qa.approve_modal_title')}
          description={t('workspace.qa.approve_modal_desc')}
          confirmLabel={t('workspace.qa.approve_modal_confirm')}
          loading={isSubmitting}
          onConfirm={handleApprove}
          onCancel={() => setShowApproveModal(false)}
        />
      )}

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-arc-900/40 backdrop-blur-sm" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-xl border border-arc-200 w-full max-w-md mx-4 p-6 shadow-lg">
            <h2 className="text-base font-semibold text-arc-900 mb-1">{t('workspace.qa.reject_modal_title')}</h2>
            <p className="text-xs text-arc-500 mb-4">{t('workspace.qa.reject_modal_desc')}</p>
            <label className="block text-xs font-medium text-arc-900 mb-1.5">
              {t('workspace.qa.rejection_notes')} <span className="text-rose-500">*</span>
            </label>
            <Textarea
              rows={4}
              placeholder={t('workspace.qa.reject_placeholder')}
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              className="mb-4 resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowRejectModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700"
                disabled={!rejectionNotes.trim()}
                loading={isSubmitting}
                onClick={handleReject}
              >
                {t('workspace.qa.reject_action')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
