import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useAllUatRuns } from '@/hooks/useUatRuns';
import {
  usePackets,
  useAllPacketEdits,
  useCreatePacket,
} from '@/hooks/useITHandoffPackets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { runUat } from '@/integrations/uatRunner';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import type { Packet, RiskEdit, RiskEditStage } from '@/types';

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

// ── UAT trigger helper ────────────────────────────────────────────────────────

async function triggerUatForChange(
  changeId: string,
  repo: ReturnType<typeof useRepository>,
  actorId: string
): Promise<void> {
  await repo.riskEdits.update(changeId, {
    current_stage: 'uat_in_progress',
    updated_at:    new Date().toISOString(),
  } as Partial<RiskEdit>);

  const allVersions = await repo.riskEditVersions.list();
  const latestVersion = allVersions
    .filter((v) => v.risk_edit_id === changeId)
    .sort((a, b) => b.version_number - a.version_number)[0];

  if (!latestVersion) throw new Error(`No version found for change ${changeId}`);

  await repo.auditLog.append({
    actor_id:     actorId,
    action:       'uat_run.triggered',
    entity_type:  'risk_edit',
    entity_id:    changeId,
    payload_json: { version_id: latestVersion.id },
  });

  const run = await repo.uatRuns.create({
    risk_edit_id:    changeId,
    version_id:      latestVersion.id,
    status:          'running',
    started_at:      new Date().toISOString(),
    completed_at:    null,
    ai_report_json:  null,
    screenshot_refs: [],
  } as Parameters<typeof repo.uatRuns.create>[0]);

  try {
    const report = await runUat({ riskEditId: changeId, versionId: latestVersion.id });

    await repo.uatRuns.update(run.id, {
      status:          'completed',
      completed_at:    new Date().toISOString(),
      ai_report_json:  report,
      screenshot_refs: report.screenshot_refs,
    } as Partial<typeof run>);

    await repo.riskEdits.update(changeId, {
      current_stage: 'qa_review',
      updated_at:    new Date().toISOString(),
    } as Partial<RiskEdit>);

    await repo.auditLog.append({
      actor_id:     'system',
      action:       'uat_run.completed',
      entity_type:  'uat_run',
      entity_id:    run.id,
      payload_json: {
        risk_edit_id: changeId,
        cases_total:  report.summary.total,
        cases_passed: report.summary.passed,
      },
    });
  } catch (err) {
    await repo.uatRuns.update(run.id, { status: 'failed' } as Partial<typeof run>);
    await repo.auditLog.append({
      actor_id:     'system',
      action:       'uat_run.failed',
      entity_type:  'uat_run',
      entity_id:    run.id,
      payload_json: { risk_edit_id: changeId, error: String(err) },
    });
    throw err;
  }
}

// ── Tab 1: UAT Queue ──────────────────────────────────────────────────────────

function UatQueueTab() {
  const { currentUser, role } = useAuth();
  const repo  = useRepository();
  const qc    = useQueryClient();

  const { data: changes = [], isLoading } = useRiskEdits({ current_stage: 'ready_for_uat' } as Partial<RiskEdit>);
  const userIds = [...new Set(changes.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState<Set<string>>(new Set());

  const canAct = role === 'risk_lead' || role === 'admin';

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((prev) => prev.size === changes.length ? new Set() : new Set(changes.map((c) => c.id)));
  }

  async function handleTrigger(ids: string[]) {
    if (!currentUser) return;
    setTriggering(new Set(ids));
    await Promise.allSettled(ids.map((id) => triggerUatForChange(id, repo, currentUser.id)));
    setTriggering(new Set());
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
    qc.invalidateQueries({ queryKey: ['arc', 'uat_runs'] });
  }

  const selectedIds = [...selected];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
        <p className="text-xs text-arc-200">
          {changes.length === 0
            ? 'No changes awaiting UAT confirmation.'
            : `${changes.length} change${changes.length !== 1 ? 's' : ''} awaiting confirmation`}
        </p>
        {canAct && selectedIds.length > 0 && (
          <Button size="sm" disabled={triggering.size > 0} loading={triggering.size > 0}
            onClick={() => handleTrigger(selectedIds)}>
            Confirm &amp; run UAT ({selectedIds.length})
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
        ) : changes.length === 0 ? (
          <div className="flex items-center justify-center py-16 flex-col gap-2 text-arc-200">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No changes are queued for UAT.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arc-200 bg-arc-50 sticky top-0">
                {canAct && (
                  <th className="px-4 py-2.5 w-10">
                    <input type="checkbox"
                      checked={selected.size === changes.length && changes.length > 0}
                      onChange={toggleAll} className="rounded border-arc-300" />
                  </th>
                )}
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Change</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Module</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Author</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Submitted</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Brief</th>
                {canAct && <th className="px-4 py-2.5 w-44" />}
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => {
                const isRunning = triggering.has(c.id);
                return (
                  <tr key={c.id} className="border-b border-arc-200 last:border-0 hover:bg-arc-50 transition-colors">
                    {canAct && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)} disabled={isRunning}
                          className="rounded border-arc-300" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link to={`/workspace/draft-queue?edit=${c.id}`}
                        className="text-arc-900 font-medium hover:text-arc-500 transition-colors">
                        {c.title}
                      </Link>
                      <p className="text-xs font-mono text-arc-200 mt-0.5">{c.edit_id_display}</p>
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
                          <Button size="sm" variant="secondary" disabled={triggering.size > 0}
                            onClick={() => handleTrigger([c.id])}>
                            Confirm &amp; run UAT
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
            Only Risk Leads and admins can confirm changes for UAT.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Approved Pool ──────────────────────────────────────────────────────

function ApprovedPoolTab() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const createPacket = useCreatePacket();

  const { data: changes = [], isLoading } = useRiskEdits({ current_stage: 'approved' } as Partial<RiskEdit>);
  const { data: allPackets = [] } = usePackets();
  const { data: allPacketEdits = [] } = useAllPacketEdits();
  const userIds = [...new Set(changes.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

  const canAct = role === 'testing_lead' || role === 'admin';

  // Which approved edits are already in a proposed packet?
  const editPacketMap = new Map<string, Packet>();
  for (const pe of allPacketEdits) {
    const pkt = allPackets.find((p) => p.id === pe.packet_id && p.status === 'proposed');
    if (pkt) editPacketMap.set(pe.risk_edit_id, pkt);
  }

  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPacketName,  setNewPacketName]   = useState('');

  function toggleSelect(id: string) {
    if (editPacketMap.has(id)) return; // already in a packet
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const freeChanges = changes.filter((c) => !editPacketMap.has(c.id));

  function toggleAll() {
    setSelected((prev) =>
      prev.size === freeChanges.length ? new Set() : new Set(freeChanges.map((c) => c.id))
    );
  }

  async function handleCreate() {
    if (!currentUser || !newPacketName.trim()) return;
    await createPacket.mutateAsync({
      name:        newPacketName.trim(),
      createdBy:   currentUser.id,
      riskEditIds: [...selected],
    });
    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'packet.created',
      entity_type:  'packet',
      entity_id:    'new',
      payload_json: { risk_edit_ids: [...selected], name: newPacketName.trim() },
    });
    setSelected(new Set());
    setShowCreateModal(false);
    setNewPacketName('');
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
          <p className="text-xs text-arc-200">
            {changes.length === 0
              ? 'No approved edits.'
              : `${freeChanges.length} free · ${changes.length - freeChanges.length} already in a packet`}
          </p>
          {canAct && selected.size > 0 && (
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              Create packet ({selected.size} edit{selected.size !== 1 ? 's' : ''})
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
          ) : changes.length === 0 ? (
            <div className="flex items-center justify-center py-16 flex-col gap-2 text-arc-200">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No approved edits waiting to be packaged.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arc-200 bg-arc-50 sticky top-0">
                  {canAct && (
                    <th className="px-4 py-2.5 w-10">
                      <input type="checkbox"
                        checked={selected.size === freeChanges.length && freeChanges.length > 0}
                        onChange={toggleAll} className="rounded border-arc-300"
                        disabled={freeChanges.length === 0} />
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Change</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Module</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Author</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Approved</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Packet</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => {
                  const inPacket = editPacketMap.get(c.id);
                  return (
                    <tr key={c.id} className={`border-b border-arc-200 last:border-0 transition-colors ${inPacket ? 'opacity-60' : 'hover:bg-arc-50'}`}>
                      {canAct && (
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(c.id)}
                            onChange={() => toggleSelect(c.id)} disabled={!!inPacket}
                            className="rounded border-arc-300" />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="text-arc-900 font-medium">{c.title}</span>
                        <p className="text-xs font-mono text-arc-200 mt-0.5">{c.edit_id_display}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-arc-500">{c.target_module_id}</td>
                      <td className="px-4 py-3 text-xs text-arc-200">{userMap[c.created_by] ?? c.created_by}</td>
                      <td className="px-4 py-3 text-xs text-arc-200">{fmt(c.updated_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        {inPacket ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-arc-50 border border-arc-200 text-arc-500 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            {inPacket.name}
                          </span>
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

      {/* Create packet modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 bg-arc-900/30 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl border border-arc-200 shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-arc-900 mb-0.5">Create IT Packet</h3>
              <p className="text-xs text-arc-200">
                Packaging {selected.size} edit{selected.size !== 1 ? 's' : ''} into a proposed packet.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-arc-500 mb-1.5 block">Packet name</label>
              <input
                className="w-full border border-arc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors"
                placeholder="e.g. June 2026 Batch A"
                value={newPacketName}
                onChange={(e) => setNewPacketName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setShowCreateModal(false); setNewPacketName(''); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={!newPacketName.trim() || createPacket.isPending}
                loading={createPacket.isPending} onClick={handleCreate}>
                Create &amp; propose
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 3: Proposed Packets ───────────────────────────────────────────────────

function ProposedPacketsTab() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();

  const { data: packets = [], isLoading } = usePackets({ status: 'proposed' } as Partial<Packet>);
  const { data: allEdits  = [] } = useRiskEdits();
  const { data: allPacketEdits = [] } = useAllPacketEdits();
  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'batch', 'all'],
    queryFn:  async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
  });

  const canAct = role === 'testing_lead' || role === 'admin';

  const [showConfirm, setShowConfirm] = useState<Packet | null>(null);
  const [confirming,  setConfirming]  = useState(false);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function getPacketEdits(packetId: string) {
    const pes = allPacketEdits.filter((pe) => pe.packet_id === packetId);
    return pes.map((pe) => allEdits.find((e) => e.id === pe.risk_edit_id)).filter(Boolean) as RiskEdit[];
  }

  async function handleConfirm(packet: Packet) {
    if (!currentUser) return;
    const edits = getPacketEdits(packet.id);
    setConfirming(true);
    try {
      await repo.packets.update(packet.id, {
        status:       'confirmed',
        confirmed_by: currentUser.id,
        confirmed_at: new Date().toISOString(),
      } as Partial<Packet>);
      await Promise.all(edits.map((e) =>
        repo.riskEdits.update(e.id, { current_stage: 'sent_to_it', updated_at: new Date().toISOString() })
      ));
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'packet.confirmed',
        entity_type:  'packet',
        entity_id:    packet.id,
        payload_json: { risk_edit_ids: edits.map((e) => e.id) },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setShowConfirm(null);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center gap-4 shrink-0">
          <p className="text-xs text-arc-200">
            {packets.length === 0
              ? 'No packets awaiting confirmation.'
              : `${packets.length} packet${packets.length !== 1 ? 's' : ''} proposed`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
          ) : packets.length === 0 ? (
            <div className="flex items-center justify-center py-16 flex-col gap-2 text-arc-200">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
              </svg>
              <p className="text-sm">No packets are proposed.</p>
              <p className="text-xs text-center max-w-xs">Create a packet from approved edits in the Approved Pool tab.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {packets.map((pkt) => {
                const edits   = getPacketEdits(pkt.id);
                const isOpen  = expanded.has(pkt.id);
                return (
                  <div key={pkt.id} className="rounded-xl border border-arc-200 bg-white overflow-hidden">
                    {/* Packet header */}
                    <div className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Proposed
                          </span>
                          <span className="text-xs text-arc-200">{edits.length} edit{edits.length !== 1 ? 's' : ''}</span>
                        </div>
                        <h3 className="font-semibold text-arc-900">{pkt.name}</h3>
                        {pkt.description && (
                          <p className="text-xs text-arc-200 mt-0.5 leading-relaxed">{pkt.description}</p>
                        )}
                        <p className="text-xs text-arc-200 mt-1">
                          Proposed by {userMap[pkt.created_by] ?? pkt.created_by} · {fmt(pkt.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleExpand(pkt.id)}
                          className="text-xs text-arc-500 hover:text-arc-900 transition-colors px-2 py-1 rounded border border-arc-200 hover:border-arc-500"
                        >
                          {isOpen ? 'Hide edits ▲' : `Show edits ▼`}
                        </button>
                        {canAct && (
                          <Button size="sm" onClick={() => setShowConfirm(pkt)}>
                            Confirm packet
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded edit list */}
                    {isOpen && (
                      <div className="border-t border-arc-200 divide-y divide-arc-200 bg-arc-50">
                        {edits.length === 0 ? (
                          <p className="px-5 py-3 text-xs text-arc-200">No edits attached.</p>
                        ) : (
                          edits.map((e) => (
                            <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-arc-900 truncate block">
                                  {e.title}
                                </span>
                                <span className="text-xs font-mono text-arc-200">{e.edit_id_display} · {e.target_module_id}</span>
                              </div>
                              <StageBadge stage={e.current_stage} />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (() => {
        const edits = getPacketEdits(showConfirm.id);
        return (
          <ConfirmModal
            title="Confirm packet"
            description={`"${showConfirm.name}" contains ${edits.length} edit${edits.length !== 1 ? 's' : ''}. Confirming will send ${edits.length !== 1 ? 'them' : 'it'} to the IT team and lock further QA changes.`}
            confirmLabel="Confirm packet"
            loading={confirming}
            onConfirm={() => handleConfirm(showConfirm)}
            onCancel={() => setShowConfirm(null)}
          />
        );
      })()}
    </>
  );
}

// ── Tab 4: Confirmed Changelog ────────────────────────────────────────────────

const HISTORY_STAGES: RiskEditStage[] = ['uat_in_progress', 'qa_review', 'approved', 'sent_to_it'];
type FilterChip = 'all' | 'uat_in_progress' | 'qa_review' | 'approved' | 'sent_to_it';

function ConfirmedTab() {
  const { data: allChanges = [], isLoading } = useRiskEdits();
  useAllUatRuns(); // pre-warm

  const [filter, setFilter] = useState<FilterChip>('all');

  const historyChanges = allChanges.filter((c) => HISTORY_STAGES.includes(c.current_stage));
  const filtered = filter === 'all' ? historyChanges : historyChanges.filter((c) => c.current_stage === filter);

  const userIds = [...new Set(historyChanges.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

  const CHIPS: { id: FilterChip; label: string }[] = [
    { id: 'all',             label: 'All' },
    { id: 'uat_in_progress', label: 'In UAT' },
    { id: 'qa_review',       label: 'QA Review' },
    { id: 'approved',        label: 'Approved' },
    { id: 'sent_to_it',      label: 'Sent to IT' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          {CHIPS.map((chip) => (
            <button key={chip.id} onClick={() => setFilter(chip.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === chip.id
                  ? 'bg-arc-500 text-white border-arc-500'
                  : 'bg-white text-arc-500 border-arc-200 hover:border-arc-500'
              }`}>
              {chip.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={() => exportCsv(filtered, userMap)}>
          Export CSV
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-arc-200">
            <p className="text-sm">No changes in this view.</p>
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-arc-200 last:border-0 hover:bg-arc-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-arc-900 font-medium">{c.title}</span>
                    <p className="text-xs font-mono text-arc-200 mt-0.5">{c.edit_id_display}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-arc-500">{c.target_module_id}</td>
                  <td className="px-4 py-3 text-xs text-arc-200">{userMap[c.created_by] ?? c.created_by}</td>
                  <td className="px-4 py-3"><StageBadge stage={c.current_stage} /></td>
                  <td className="px-4 py-3 text-xs text-arc-200">{fmt(c.updated_at)}</td>
                </tr>
              ))}
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
  const { data: proposedPackets = [] } = usePackets({ status: 'proposed' } as Partial<Packet>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Changelog' }]} />} />

      <Tabs defaultTab="uatqueue" className="flex-1 min-h-0 overflow-hidden">
        <TabList className="px-6 bg-white shrink-0">
          <TabTrigger id="uatqueue">
            UAT Queue
            {readyChanges.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                {readyChanges.length}
              </span>
            )}
          </TabTrigger>
          <TabTrigger id="approved">Approved Pool</TabTrigger>
          <TabTrigger id="proposed">
            Proposed Packets
            {proposedPackets.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                {proposedPackets.length}
              </span>
            )}
          </TabTrigger>
          <TabTrigger id="confirmed">Confirmed</TabTrigger>
        </TabList>

        <TabPanel id="uatqueue"  className="overflow-hidden"><UatQueueTab /></TabPanel>
        <TabPanel id="approved"  className="overflow-hidden"><ApprovedPoolTab /></TabPanel>
        <TabPanel id="proposed"  className="overflow-hidden"><ProposedPacketsTab /></TabPanel>
        <TabPanel id="confirmed" className="overflow-hidden"><ConfirmedTab /></TabPanel>
      </Tabs>
    </div>
  );
}
