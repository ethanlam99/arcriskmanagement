import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Beaker, AlertCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useAllUatRuns } from '@/hooks/useUatRuns';
import { useRepository } from '@/data/RepositoryProvider';
import { runUat } from '@/integrations/uatRunner';
import { ensureProposedCasesForReadyForUat } from '@/integrations/testCaseProposer';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import { AttachmentUploader } from '@/components/shared/AttachmentUploader';
import type { RiskEdit, UatContextAttachment } from '@/types';

const AI_TASK_STEPS = [
  'Loading sandbox engine',
  'Applying SQL diff',
  'Running test cases',
  'Capturing frontend renders',
  'Compiling report',
] as const;

function ElapsedTimer({ updatedAt }: { updatedAt: string }) {
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
  return <span>{secs}s elapsed</span>;
}

function AiTaskList({
  mode,
  startedAt,
}: {
  mode: 'queued' | 'running' | 'done';
  startedAt?: string;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (mode !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 400);
    return () => clearInterval(id);
  }, [mode]);

  // Distribute steps over the simulated UAT delay (~2.5s). For animation we
  // walk through steps roughly every 500ms while running.
  let currentStep = -1;
  if (mode === 'done') {
    currentStep = AI_TASK_STEPS.length;
  } else if (mode === 'running' && startedAt) {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    currentStep = Math.min(
      AI_TASK_STEPS.length - 1,
      Math.floor(elapsed / 500)
    );
  }
  // tick reference keeps the linter happy and forces a re-render
  void tick;

  return (
    <ol className="flex flex-col gap-2">
      {AI_TASK_STEPS.map((label, idx) => {
        const isDone = mode === 'done' || idx < currentStep;
        const isActive = mode === 'running' && idx === currentStep;
        const isPending = !isDone && !isActive;
        return (
          <li key={label} className="flex items-center gap-2.5 text-xs">
            <span
              className={`flex items-center justify-center w-4 h-4 rounded-full shrink-0 ${
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isActive
                  ? 'bg-white border border-arc-500'
                  : 'bg-white border border-arc-200'
              }`}
            >
              {isDone ? (
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : isActive ? (
                <span className="w-2 h-2 rounded-full border border-arc-500 border-t-transparent animate-spin" />
              ) : null}
            </span>
            <span
              className={
                isDone
                  ? 'text-arc-500 line-through'
                  : isActive
                  ? 'text-arc-900 font-medium'
                  : isPending
                  ? 'text-arc-200'
                  : 'text-arc-500'
              }
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function UatContextDrawer({
  edit,
  onClose,
}: {
  edit: RiskEdit;
  onClose: () => void;
}) {
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

  // Uploads are locked once the edit transitions to uat_in_progress or beyond.
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
    <aside className="w-96 shrink-0 border-l border-arc-200 bg-arc-100/40 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-arc-200 bg-white flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-arc-500">{edit.edit_id_display}</p>
          <p className="text-sm font-medium text-arc-900 truncate">{edit.title}</p>
        </div>
        <button
          onClick={onClose}
          className="text-arc-500 hover:text-arc-700 transition-colors text-base leading-none px-1"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        <section>
          <h3 className="text-xs font-semibold text-arc-900 uppercase tracking-wide mb-1">
            AI context attachments
          </h3>
          <p className="text-xs text-arc-500 mb-3 leading-relaxed">
            {locked
              ? 'Uploads are locked once UAT has started. Existing files remain visible to the AI.'
              : 'Upload screenshots or supporting media that the AI bot should consider when generating the AI UAT report. Up to 5 files, 1MB each, image or PDF only.'}
          </p>
          <AttachmentUploader
            attachments={attachments}
            onUpload={handleUpload}
            onRemove={handleRemove}
            readonly={locked}
          />
        </section>

        <section>
          <h3 className="text-xs font-semibold text-arc-900 uppercase tracking-wide mb-2">
            AI task list
          </h3>
          <div className="rounded-lg border border-arc-200 bg-white px-3 py-3">
            <AiTaskList mode={mode} startedAt={edit.updated_at} />
            {mode === 'queued' && (
              <p className="mt-3 pt-2.5 border-t border-arc-200 text-[11px] text-arc-500">
                Waiting to start — send to AI UAT to begin.
              </p>
            )}
            {mode === 'running' && (
              <p className="mt-3 pt-2.5 border-t border-arc-200 text-[11px] text-arc-500">
                <ElapsedTimer updatedAt={edit.updated_at} />
              </p>
            )}
            {mode === 'done' && (
              <p className="mt-3 pt-2.5 border-t border-arc-200 text-[11px] text-emerald-600">
                Run complete — review in QA.
              </p>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

export function UatWorkspacePage() {
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

  // Local time-since helper — mirrors OverviewPage.formatTimeSince. Inline to
  // keep this patch self-contained; if a third caller emerges, extract.
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
      // Re-propose cases only if none exist yet (idempotent helper).
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

  // Auto-close drawer if the opened edit moves out of UAT scope.
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

    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'uat_run.triggered',
      entity_type:  'risk_edit',
      entity_id:    editId,
      payload_json: { version_id: latest.id },
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
      const report = await runUat({ riskEditId: editId, versionId: latest.id });

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
      // Roll the edit back so the tester can retry — orphan-on-failure fix.
      // Reset cases_reviewed so the tester explicitly re-confirms the case
      // list before the retry transmits. Existing curated cases are preserved.
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

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">

          {/* ── Section 1: Queued for UAT ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-arc-900">Queued for UAT</h2>
                <p className="text-xs text-arc-500 mt-0.5">
                  {queued.length === 0
                    ? 'No edits waiting.'
                    : `${queued.length} edit${queued.length !== 1 ? 's' : ''} ready to run · click a row for AI context`}
                </p>
              </div>
              {canAct && selectedIds.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => handleTrigger(selectedIds)}
                  loading={triggering.size > 0}
                >
                  Send selected to AI UAT ({selectedIds.length})
                </Button>
              )}
            </div>

            {queued.length === 0 ? (
              <div className="rounded-xl border border-arc-200 shadow-sm bg-white flex items-center justify-center py-12 flex-col gap-3 text-arc-500">
                <Beaker className="w-12 h-12 text-arc-500" strokeWidth={1.5} />
                <p className="text-sm">No edits queued for UAT.</p>
                <p className="text-xs text-center max-w-xs text-arc-500">
                  Risk analysts send edits for UAT from the Draft &amp; Queue workspace.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-arc-200 shadow-sm overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arc-200 bg-arc-100">
                      {canAct && (
                        <th className="px-4 py-2.5 w-10">
                          <input
                            type="checkbox"
                            checked={selected.size === queued.length && queued.length > 0}
                            onChange={toggleAll}
                            className="rounded border-arc-300"
                          />
                        </th>
                      )}
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Edit</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Module</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Queued</th>
                      {canAct && <th className="px-4 py-2.5 w-44" />}
                    </tr>
                  </thead>
                  <tbody>
                    {queued.map((edit) => {
                      const isTriggering = triggering.has(edit.id);
                      const isOpen = openEditId === edit.id;
                      return (
                        <tr
                          key={edit.id}
                          onClick={() => setOpenEditId(edit.id)}
                          className={`border-b border-arc-200 last:border-0 cursor-pointer transition-colors duration-150 ${
                            isOpen ? 'bg-arc-200' : 'hover:bg-arc-200'
                          }`}
                        >
                          {canAct && (
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selected.has(edit.id)}
                                onChange={() => toggleSelect(edit.id)}
                                disabled={isTriggering || triggering.size > 0}
                                className="rounded border-arc-300"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <p className="font-medium text-arc-900">{edit.title}</p>
                            <p className="text-xs font-mono text-arc-500 mt-0.5">{edit.edit_id_display}</p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-arc-500">{edit.target_module_id}</td>
                          <td className="px-4 py-3 text-xs text-arc-500">
                            {new Date(edit.updated_at).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short',
                            })}
                          </td>
                          {canAct && (
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {isTriggering ? (
                                <span className="flex items-center gap-1.5 text-xs text-arc-500">
                                  <span className="w-3 h-3 border border-arc-500 border-t-transparent rounded-full animate-spin" />
                                  Triggering…
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={triggering.size > 0}
                                  onClick={() => handleTrigger([edit.id])}
                                >
                                  Send to AI UAT
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!canAct && queued.length > 0 && (
              <p className="mt-2 text-xs text-arc-500">
                Only Testers, Testing Leads, and Admins can trigger AI UAT runs.
              </p>
            )}
          </section>

          {/* ── Section 2: UAT Running ── */}
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-arc-900">UAT Running</h2>
              <p className="text-xs text-arc-500 mt-0.5">
                {running.length === 0
                  ? 'No active runs.'
                  : `${running.length} run${running.length !== 1 ? 's' : ''} in progress · click a row for live AI progress`}
              </p>
            </div>

            {running.length === 0 ? (
              <div className="rounded-xl border border-arc-200 shadow-sm bg-white flex items-center justify-center py-12 flex-col gap-3 text-arc-500">
                <Beaker className="w-12 h-12 text-arc-500" strokeWidth={1.5} />
                <p className="text-sm">No UAT runs in progress.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-arc-200 shadow-sm overflow-hidden bg-white">
                {running.map((edit) => {
                  const isOpen = openEditId === edit.id;
                  const orphan = isOrphaned(edit.id);
                  const rowClass = `w-full text-left px-5 py-4 border-b border-arc-200 last:border-0 flex items-center gap-4 transition-colors duration-150 ${
                    isOpen ? 'bg-arc-200' : 'hover:bg-arc-200'
                  }`;

                  if (orphan) {
                    const run = latestRun(edit.id);
                    return (
                      <div
                        key={edit.id}
                        onClick={() => setOpenEditId(edit.id)}
                        className={`${rowClass} cursor-pointer`}
                      >
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" strokeWidth={2} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-arc-900 truncate">{edit.title}</p>
                          <p className="text-xs font-mono text-arc-500 mt-0.5">
                            {edit.edit_id_display} · {edit.target_module_id}
                          </p>
                        </div>
                        <span className="text-xs text-rose-600 font-medium shrink-0">
                          UAT run failed · stuck since {run ? formatElapsed(run.started_at) : '—'}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                          Stuck
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
                            Unstick
                          </Button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={edit.id}
                      onClick={() => setOpenEditId(edit.id)}
                      className={rowClass}
                    >
                      <div className="w-5 h-5 border-2 border-arc-500 border-t-transparent rounded-full animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-arc-900 truncate">{edit.title}</p>
                        <p className="text-xs font-mono text-arc-500 mt-0.5">
                          {edit.edit_id_display} · {edit.target_module_id}
                        </p>
                      </div>
                      <span className="text-xs text-arc-500 font-medium shrink-0">
                        AI generating report · <ElapsedTimer updatedAt={edit.updated_at} />
                      </span>
                      <StageBadge stage={edit.current_stage} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 ${toast.ok ? 'bg-arc-900' : 'bg-rose-900'} text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3`}>
          <span>
            {toast.ok && toast.kind === 'completion'
              ? `UAT complete — ${toast.displayId} moved to QA Review.`
              : toast.ok && toast.kind === 'unstuck'
              ? `${toast.displayId} returned to queue for retry.`
              : !toast.ok
              ? `UAT failed for ${toast.displayId} — back in queue for retry.`
              : ''}
          </span>
          {toast.ok && toast.kind === 'completion' && (
            <Link
              to={`/workspace/qa?edit=${toast.editId}`}
              className="text-forest-100 hover:text-white font-medium underline-offset-2 hover:underline"
              onClick={() => setToast(null)}
            >
              Open →
            </Link>
          )}
        </div>
      )}

      {openEdit && (
        <UatContextDrawer edit={openEdit} onClose={() => setOpenEditId(null)} />
      )}

      {confirmUnstickId && (
        <ConfirmModal
          title="Unstick UAT run"
          description={`Return "${allEdits.find((e) => e.id === confirmUnstickId)?.title ?? confirmUnstickId}" to the UAT queue? The failed run record stays in history for audit. A tester can retrigger UAT from the queue.`}
          confirmLabel="Unstick"
          loading={unsticking}
          onConfirm={() => handleUnstick(confirmUnstickId)}
          onCancel={() => setConfirmUnstickId(null)}
        />
      )}
    </div>
  );
}
