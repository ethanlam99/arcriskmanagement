import { useState, useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useRepository } from '@/data/RepositoryProvider';
import { useQueryClient } from '@tanstack/react-query';
import { runUat } from '@/integrations/uatRunner';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import type { RiskEdit } from '@/types';

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
      await repo.auditLog.append({
        actor_id:     'system',
        action:       'uat_run.failed',
        entity_type:  'uat_run',
        entity_id:    run.id,
        payload_json: { risk_edit_id: editId, error: String(err) },
      });
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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">

        {/* ── Section 1: Queued for UAT ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-arc-900">Queued for UAT</h2>
              <p className="text-xs text-arc-200 mt-0.5">
                {queued.length === 0
                  ? 'No edits waiting.'
                  : `${queued.length} edit${queued.length !== 1 ? 's' : ''} ready to run`}
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
            <div className="rounded-xl border border-arc-200 bg-white flex items-center justify-center py-12 flex-col gap-2 text-arc-200">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-sm">No edits queued for UAT.</p>
              <p className="text-xs text-center max-w-xs text-arc-200">
                Risk analysts send edits for UAT from the Draft &amp; Queue workspace.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-arc-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-arc-200 bg-arc-50">
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
                    return (
                      <tr key={edit.id} className="border-b border-arc-200 last:border-0 hover:bg-arc-50 transition-colors">
                        {canAct && (
                          <td className="px-4 py-3">
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
                          <p className="text-xs font-mono text-arc-200 mt-0.5">{edit.edit_id_display}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-arc-500">{edit.target_module_id}</td>
                        <td className="px-4 py-3 text-xs text-arc-200">
                          {new Date(edit.updated_at).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short',
                          })}
                        </td>
                        {canAct && (
                          <td className="px-4 py-3">
                            {isTriggering ? (
                              <span className="flex items-center gap-1.5 text-xs text-arc-200">
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
            <p className="mt-2 text-xs text-arc-200">
              Only Testers, Testing Leads, and Admins can trigger AI UAT runs.
            </p>
          )}
        </section>

        {/* ── Section 2: UAT Running ── */}
        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-arc-900">UAT Running</h2>
            <p className="text-xs text-arc-200 mt-0.5">
              {running.length === 0
                ? 'No active runs.'
                : `${running.length} run${running.length !== 1 ? 's' : ''} in progress`}
            </p>
          </div>

          {running.length === 0 ? (
            <div className="rounded-xl border border-arc-200 bg-white flex items-center justify-center py-12 flex-col gap-2 text-arc-200">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No UAT runs in progress.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-arc-200 overflow-hidden bg-white">
              {running.map((edit) => (
                <div
                  key={edit.id}
                  className="px-5 py-4 border-b border-arc-200 last:border-0 flex items-center gap-4"
                >
                  <div className="w-5 h-5 border-2 border-arc-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-arc-900 truncate">{edit.title}</p>
                    <p className="text-xs font-mono text-arc-200 mt-0.5">
                      {edit.edit_id_display} · {edit.target_module_id}
                    </p>
                  </div>
                  <span className="text-xs text-arc-500 font-medium shrink-0">
                    AI generating report · <ElapsedTimer updatedAt={edit.updated_at} />
                  </span>
                  <StageBadge stage={edit.current_stage} />
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
