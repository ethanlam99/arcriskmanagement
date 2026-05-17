import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useAllUatRuns } from '@/hooks/useUatRuns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { runUat } from '@/integrations/uatRunner';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import type { RiskEdit, RiskEditStage } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function exportCsv(changes: RiskEdit[], userMap: Record<string, string>) {
  const headers = ['Title', 'Module', 'Author', 'Stage', 'Last Updated'];
  const rows = changes.map((c) => [
    `"${c.title}"`,
    c.target_module_id,
    `"${userMap[c.created_by] ?? c.created_by}"`,
    c.current_stage,
    fmt(c.updated_at),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'arc-changelog.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── User name lookup ──────────────────────────────────────────────────────────

function useUserNames(userIds: string[]) {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'users', 'batch', userIds.sort().join(',')],
    queryFn:  async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
    enabled: userIds.length > 0,
  });
}

// ── UAT confirmation logic ────────────────────────────────────────────────────

async function confirmChangeForUat(
  changeId: string,
  repo: ReturnType<typeof useRepository>,
  actorId: string
): Promise<void> {
  // 1. Transition to uat_in_progress
  await repo.riskEdits.update(changeId, {
    current_stage: 'uat_in_progress',
    updated_at:    new Date().toISOString(),
  } as Partial<RiskEdit>);

  // 2. Find latest version
  const allVersions = await repo.riskEditVersions.list();
  const latestVersion = allVersions
    .filter((v) => v.risk_edit_id === changeId)
    .sort((a, b) => b.version_number - a.version_number)[0];

  if (!latestVersion) throw new Error(`No version found for change ${changeId}`);

  // 3. Write triggered audit entry
  await repo.auditLog.append({
    actor_id:    actorId,
    action:      'uat_run.triggered',
    entity_type: 'strategy_change',
    entity_id:   changeId,
    payload_json: { version_id: latestVersion.id },
  });

  // 4. Create the uat_runs row (status: running)
  const run = await repo.uatRuns.create({
    risk_edit_id: changeId,
    version_id:         latestVersion.id,
    status:             'running',
    started_at:         new Date().toISOString(),
    completed_at:       null,
    ai_report_json:     null,
    screenshot_refs:    [],
  } as Parameters<typeof repo.uatRuns.create>[0]);

  try {
    // 5. Execute UAT (2.5s simulated delay)
    const report = await runUat({ riskEditId: changeId, versionId: latestVersion.id });

    // 6. Persist completed run
    await repo.uatRuns.update(run.id, {
      status:         'completed',
      completed_at:   new Date().toISOString(),
      ai_report_json: report,
      screenshot_refs: report.screenshot_refs,
    } as Partial<typeof run>);

    // 7. Transition to qa_review
    await repo.riskEdits.update(changeId, {
      current_stage: 'qa_review',
      updated_at:    new Date().toISOString(),
    } as Partial<RiskEdit>);

    await repo.auditLog.append({
      actor_id:    'system',
      action:      'uat_run.completed',
      entity_type: 'uat_run',
      entity_id:   run.id,
      payload_json: {
        risk_edit_id: changeId,
        cases_total:  report.summary.total,
        cases_passed: report.summary.passed,
      },
    });
  } catch (err) {
    // On failure: mark run as failed, leave stage as uat_in_progress
    await repo.uatRuns.update(run.id, { status: 'failed' } as Partial<typeof run>);
    await repo.auditLog.append({
      actor_id:    'system',
      action:      'uat_run.failed',
      entity_type: 'uat_run',
      entity_id:   run.id,
      payload_json: { risk_edit_id: changeId, error: String(err) },
    });
    throw err;
  }
}

// ── Preview Changelog tab ─────────────────────────────────────────────────────

function PreviewTab() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();
  const navigate = useNavigate();

  const { data: changes = [], isLoading } = useRiskEdits({ current_stage: 'ready_for_uat' } as Partial<RiskEdit>);
  const userIds = [...new Set(changes.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<Set<string>>(new Set()); // changes currently running UAT

  const canAct = role === 'admin' || role === 'tester';

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === changes.length ? new Set() : new Set(changes.map((c) => c.id))
    );
  }

  async function handleConfirm(ids: string[]) {
    if (!currentUser) return;
    setConfirming(new Set(ids));

    const results = await Promise.allSettled(
      ids.map((id) => confirmChangeForUat(id, repo, currentUser.id))
    );

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`UAT run failed for ${ids[i]}:`, result.reason);
      }
    });

    setConfirming(new Set());
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['arc', 'strategy_changes'] });
    qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });
  }

  const selectedIds = [...selected];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
        <p className="text-xs text-arc-200">
          {changes.length === 0 ? 'No changes awaiting confirmation.' : `${changes.length} change${changes.length !== 1 ? 's' : ''} awaiting confirmation`}
        </p>
        {canAct && selectedIds.length > 0 && (
          <Button
            size="sm"
            disabled={confirming.size > 0}
            loading={confirming.size > 0}
            onClick={() => handleConfirm(selectedIds)}
          >
            Confirm batch ({selectedIds.length}) and send to UAT
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
        ) : changes.length === 0 ? (
          <div className="flex items-center justify-center py-16 flex-col gap-2 text-arc-200">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="text-sm">No changes are awaiting confirmation.</p>
            <p className="text-xs text-center max-w-xs">
              Risk analysts will queue their changes here after clicking "Send for UAT" on a strategy change.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arc-200 bg-arc-50 sticky top-0">
                {canAct && (
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === changes.length && changes.length > 0}
                      onChange={toggleAll}
                      className="rounded border-arc-300"
                    />
                  </th>
                )}
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Change</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Module</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Author</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Submitted</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Brief</th>
                {canAct && <th className="px-4 py-2.5 w-36"></th>}
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => {
                const isRunning = confirming.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className="border-b border-arc-200 last:border-0 hover:bg-arc-50 transition-colors"
                  >
                    {canAct && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          disabled={isRunning}
                          className="rounded border-arc-300"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link
                        to={`/strategy-changes/${c.id}`}
                        className="text-arc-900 font-medium hover:text-arc-500 transition-colors"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-arc-500">{c.target_module_id}</td>
                    <td className="px-4 py-3 text-xs text-arc-200">{userMap[c.created_by] ?? c.created_by}</td>
                    <td className="px-4 py-3 text-xs text-arc-200">{fmt(c.updated_at)}</td>
                    <td className="px-4 py-3 text-xs text-arc-200 max-w-xs truncate" title={c.natural_language_brief}>
                      {c.natural_language_brief}
                    </td>
                    {canAct && (
                      <td className="px-4 py-3">
                        {isRunning ? (
                          <span className="flex items-center gap-1.5 text-xs text-arc-200">
                            <span className="w-3 h-3 border border-arc-500 border-t-transparent rounded-full animate-spin" />
                            Running UAT…
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={confirming.size > 0}
                            onClick={() => handleConfirm([c.id])}
                          >
                            Confirm &amp; send to UAT
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!canAct && changes.length > 0 && (
          <p className="px-6 py-3 text-xs text-arc-200 border-t border-arc-200">
            Only admins and testers can confirm changes for UAT. Contact a team lead to proceed.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Confirmed Changelog tab ───────────────────────────────────────────────────

const CONFIRMED_STAGES: RiskEditStage[] = ['uat_in_progress', 'qa_review', 'approved', 'sent_to_it'];
type FilterChip = 'all' | 'uat_in_progress' | 'qa_review' | 'sent_to_it';

function ConfirmedTab() {
  const repo = useRepository();
  const { data: allChanges = [], isLoading } = useRiskEdits();
  const { data: allRuns = [] } = useAllUatRuns();

  const [filter, setFilter] = useState<FilterChip>('all');

  const confirmedChanges = allChanges.filter((c) => CONFIRMED_STAGES.includes(c.current_stage));

  const filtered = filter === 'all'
    ? confirmedChanges
    : confirmedChanges.filter((c) =>
        filter === 'sent_to_it'
          ? c.current_stage === 'sent_to_it' || c.current_stage === 'approved'
          : c.current_stage === filter
      );

  const userIds = [...new Set(confirmedChanges.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

  const { data: packets = [] } = useQuery({
    queryKey: ['arc', 'it_handoff_packets'],
    queryFn:  () => repo.itHandoffPackets.list(),
  });

  const packetByChange = Object.fromEntries(packets.map((p) => [p.risk_edit_id, p.id]));

  function handleExport() {
    exportCsv(filtered, userMap);
  }

  const CHIPS: { id: FilterChip; label: string }[] = [
    { id: 'all',            label: 'All' },
    { id: 'uat_in_progress', label: 'In UAT' },
    { id: 'qa_review',      label: 'In QA Review' },
    { id: 'sent_to_it',     label: 'Sent to IT' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter chips + export */}
      <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === chip.id
                  ? 'bg-arc-500 text-white border-arc-500'
                  : 'bg-white text-arc-500 border-arc-200 hover:border-arc-500'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 flex-col gap-2 text-arc-200">
            <p className="text-sm">No changes have been confirmed to UAT yet.</p>
            <p className="text-xs text-center max-w-xs">
              Changes appear here after a team lead sends them to UAT from the Preview tab.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arc-200 bg-arc-50 sticky top-0">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Change</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Module</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Author</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Stage</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Last Updated</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">IT Packet</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const packetId = packetByChange[c.id];
                return (
                  <tr key={c.id} className="border-b border-arc-200 last:border-0 hover:bg-arc-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/strategy-changes/${c.id}`}
                        className="text-arc-900 font-medium hover:text-arc-500 transition-colors"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-arc-500">{c.target_module_id}</td>
                    <td className="px-4 py-3 text-xs text-arc-200">{userMap[c.created_by] ?? c.created_by}</td>
                    <td className="px-4 py-3">
                      <StageBadge stage={c.current_stage} />
                    </td>
                    <td className="px-4 py-3 text-xs text-arc-200">{fmt(c.updated_at)}</td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {packetId ? (
                        <Link to="/it-handoff-log" className="text-arc-500 hover:underline">
                          {packetId.slice(0, 12)}…
                        </Link>
                      ) : (
                        <span className="text-arc-200">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ChangelogPage() {
  const { data: readyChanges = [] } = useRiskEdits({ current_stage: 'ready_for_uat' } as Partial<RiskEdit>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Changelog' }]} />} />

      <Tabs defaultTab="preview" className="flex-1 min-h-0 overflow-hidden">
        <TabList className="px-6 bg-white shrink-0">
          <TabTrigger id="preview">
            Preview Changelog
            {readyChanges.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                {readyChanges.length}
              </span>
            )}
          </TabTrigger>
          <TabTrigger id="confirmed">Confirmed Changelog</TabTrigger>
        </TabList>

        <TabPanel id="preview" className="overflow-hidden">
          <PreviewTab />
        </TabPanel>

        <TabPanel id="confirmed" className="overflow-hidden">
          <ConfirmedTab />
        </TabPanel>
      </Tabs>
    </div>
  );
}
