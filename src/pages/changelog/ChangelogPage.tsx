import { useState } from 'react';
import { PackageOpen, Package, Send } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import {
  usePackets,
  useAllPacketEdits,
  useCreatePacket,
} from '@/hooks/useITHandoffPackets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Tabs, TabList, TabTrigger, TabPanel } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import type { Packet, RiskEdit } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function exportPacketsCsv(
  packets: Packet[],
  userMap: Record<string, string>,
  editCounts: Record<string, number>,
) {
  const headers = [
    'Name', 'Status', 'Created by', 'Confirmed by',
    'Confirmed at', 'Lived at', 'Edit count',
  ];
  const rows = packets.map((p) => [
    `"${p.name.replace(/"/g, '""')}"`,
    p.status,
    `"${userMap[p.created_by] ?? p.created_by}"`,
    p.confirmed_by ? `"${userMap[p.confirmed_by] ?? p.confirmed_by}"` : '',
    p.confirmed_at ? fmt(p.confirmed_at) : '',
    p.lived_at ? fmt(p.lived_at) : '',
    String(editCounts[p.id] ?? 0),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'arc-changelog-packets.csv';
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

function useAllUserNames() {
  const repo = useRepository();
  return useQuery({
    queryKey: ['arc', 'users', 'map', 'name'],
    queryFn:  async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
  });
}

// ── Tab 1: Approved Pool (unbundled edits only) ───────────────────────────────

function ApprovedPoolTab() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  const createPacket = useCreatePacket();

  const { data: changes = [], isLoading } = useRiskEdits({ current_stage: 'approved' } as Partial<RiskEdit>);
  const { data: allPackets = [] } = usePackets();
  const { data: allPacketEdits = [] } = useAllPacketEdits();
  const userIds = [...new Set(changes.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

  // Unbundled = approved AND not in any packet whose status is 'proposed' or 'confirmed'.
  // Rejected packets release their edits back to the pool; confirmed packets
  // already moved their edits to sent_to_it (defensive — caught by stage filter too).
  const lockedEditIds = new Set<string>();
  for (const pe of allPacketEdits) {
    const pkt = allPackets.find((p) => p.id === pe.packet_id);
    if (pkt && (pkt.status === 'proposed' || pkt.status === 'confirmed')) {
      lockedEditIds.add(pe.risk_edit_id);
    }
  }
  const unbundled = changes.filter((c) => !lockedEditIds.has(c.id));

  const canAct = role !== null && role !== 'it_team';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPacketName, setNewPacketName] = useState('');
  const [newPacketDescription, setNewPacketDescription] = useState('');

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === unbundled.length ? new Set() : new Set(unbundled.map((c) => c.id))
    );
  }

  async function handleCreate() {
    if (!currentUser || !newPacketName.trim() || selected.size === 0) return;
    const name = newPacketName.trim();
    const description = newPacketDescription.trim() || undefined;
    const editIds = [...selected];

    const { packet } = await createPacket.mutateAsync({
      name,
      description,
      createdBy:   currentUser.id,
      riskEditIds: editIds,
    });

    await Promise.all(editIds.map((editId) =>
      repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'packet.proposed',
        entity_type:  'risk_edit',
        entity_id:    editId,
        payload_json: { packet_id: packet.id, packet_name: packet.name },
      })
    ));
    await repo.auditLog.append({
      actor_id:     currentUser.id,
      action:       'packet.proposed',
      entity_type:  'packet',
      entity_id:    packet.id,
      payload_json: { risk_edit_ids: editIds, name: packet.name },
    });

    qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });

    setSelected(new Set());
    setShowCreateModal(false);
    setNewPacketName('');
    setNewPacketDescription('');
  }

  function closeModal() {
    if (createPacket.isPending) return;
    setShowCreateModal(false);
    setNewPacketName('');
    setNewPacketDescription('');
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
          <p className="text-xs text-arc-200">
            {unbundled.length === 0
              ? 'No approved edits available to bundle.'
              : `${unbundled.length} approved edit${unbundled.length !== 1 ? 's' : ''} available`}
          </p>
          {canAct && (
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setShowCreateModal(true)}
            >
              Create proposed packet from selected ({selected.size})
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
          ) : unbundled.length === 0 ? (
            <div className="flex items-center justify-center py-16 flex-col gap-3 text-arc-200 px-6 text-center">
              <PackageOpen className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
              <p className="text-sm max-w-sm">
                No approved edits available to bundle. Edits will appear here after testers approve UAT reports.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arc-200 bg-arc-50 sticky top-0">
                  {canAct && (
                    <th className="px-4 py-2.5 w-10">
                      <input type="checkbox"
                        checked={selected.size === unbundled.length && unbundled.length > 0}
                        onChange={toggleAll}
                        className="rounded border-arc-300" />
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Change</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Module</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Author</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Approved</th>
                </tr>
              </thead>
              <tbody>
                {unbundled.map((c) => (
                  <tr key={c.id} className="border-b border-arc-200 last:border-0 transition-colors odd:bg-white even:bg-arc-50/40 hover:bg-arc-50">
                    {canAct && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-40 bg-arc-900/30 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl border border-arc-200 shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-arc-900 mb-0.5">Create proposed packet</h3>
              <p className="text-xs text-arc-200">
                Bundling {selected.size} approved edit{selected.size !== 1 ? 's' : ''}.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-arc-500 mb-1.5 block">
                Packet name <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full border border-arc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors"
                placeholder="e.g. May 2026 Batch C"
                value={newPacketName}
                onChange={(e) => setNewPacketName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-arc-500 mb-1.5 block">Description (optional)</label>
              <textarea
                className="w-full border border-arc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors resize-none"
                rows={3}
                placeholder="Short context for the lead reviewer (optional)."
                value={newPacketDescription}
                onChange={(e) => setNewPacketDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={closeModal} disabled={createPacket.isPending}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newPacketName.trim() || createPacket.isPending}
                loading={createPacket.isPending}
                onClick={handleCreate}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 2: Proposed Packets (Approve / Reject) ────────────────────────────────

function ProposedPacketsTab() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();

  const { data: packets = [], isLoading } = usePackets({ status: 'proposed' } as Partial<Packet>);
  const { data: allEdits = [] } = useRiskEdits();
  const { data: allPacketEdits = [] } = useAllPacketEdits();
  const { data: userMap = {} } = useAllUserNames();

  const canAct = role === 'risk_lead' || role === 'testing_lead' || role === 'admin';

  const [showApprove, setShowApprove] = useState<Packet | null>(null);
  const [showReject,  setShowReject]  = useState<Packet | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function getPacketEdits(packetId: string): RiskEdit[] {
    const pes = allPacketEdits.filter((pe) => pe.packet_id === packetId);
    return pes.map((pe) => allEdits.find((e) => e.id === pe.risk_edit_id)).filter(Boolean) as RiskEdit[];
  }

  async function handleApprove(packet: Packet) {
    if (!currentUser) return;
    const edits = getPacketEdits(packet.id);
    const editIds = edits.map((e) => e.id);
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      await repo.packets.update(packet.id, {
        status:       'confirmed',
        confirmed_by: currentUser.id,
        confirmed_at: now,
      } as Partial<Packet>);
      await Promise.all(edits.map((e) =>
        repo.riskEdits.update(e.id, {
          current_stage: 'sent_to_it',
          updated_at:    now,
        } as Partial<RiskEdit>)
      ));
      await Promise.all(editIds.map((editId) =>
        repo.auditLog.append({
          actor_id:     currentUser.id,
          action:       'packet.confirmed',
          entity_type:  'risk_edit',
          entity_id:    editId,
          payload_json: { packet_id: packet.id, packet_name: packet.name },
        })
      ));
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'packet.confirmed',
        entity_type:  'packet',
        entity_id:    packet.id,
        payload_json: { risk_edit_ids: editIds, name: packet.name },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setShowApprove(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(packet: Packet) {
    if (!currentUser) return;
    const notes = rejectNotes.trim();
    if (!notes) return;
    const edits = getPacketEdits(packet.id);
    const editIds = edits.map((e) => e.id);
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      // Edits stay at 'approved'; packet_edits rows are preserved on purpose so
      // the audit trail of which edits were in the rejected packet survives.
      await repo.packets.update(packet.id, {
        status:           'rejected',
        rejected_by:      currentUser.id,
        rejected_at:      now,
        rejection_notes:  notes,
      } as Partial<Packet>);
      await Promise.all(editIds.map((editId) =>
        repo.auditLog.append({
          actor_id:     currentUser.id,
          action:       'packet.rejected',
          entity_type:  'risk_edit',
          entity_id:    editId,
          payload_json: { packet_id: packet.id, packet_name: packet.name, rejection_notes: notes },
        })
      ));
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'packet.rejected',
        entity_type:  'packet',
        entity_id:    packet.id,
        payload_json: { risk_edit_ids: editIds, name: packet.name, rejection_notes: notes },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setShowReject(null);
      setRejectNotes('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center gap-4 shrink-0">
          <p className="text-xs text-arc-200">
            {packets.length === 0
              ? 'No packets awaiting review.'
              : `${packets.length} packet${packets.length !== 1 ? 's' : ''} proposed`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
          ) : packets.length === 0 ? (
            <div className="flex items-center justify-center py-16 flex-col gap-3 text-arc-200">
              <Package className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
              <p className="text-sm">No packets are proposed.</p>
              <p className="text-xs text-center max-w-xs">
                Create a packet from approved edits in the Approved Pool tab.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {packets.map((pkt) => {
                const edits  = getPacketEdits(pkt.id);
                const isOpen = expanded.has(pkt.id);
                return (
                  <div key={pkt.id} className="rounded-xl border border-arc-200 bg-white shadow-sm overflow-hidden">
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
                          {isOpen ? 'Hide edits ▲' : 'Show edits ▼'}
                        </button>
                        {canAct && (
                          <>
                            <Button
                              size="sm"
                              className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800"
                              onClick={() => setShowApprove(pkt)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="!border-rose-500 !text-rose-600 hover:!bg-rose-50 active:!bg-rose-100"
                              onClick={() => { setShowReject(pkt); setRejectNotes(''); }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-arc-200 divide-y divide-arc-200 bg-arc-50">
                        {edits.length === 0 ? (
                          <p className="px-5 py-3 text-xs text-arc-200">No edits attached.</p>
                        ) : (
                          edits.map((e) => (
                            <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-arc-900 truncate block">{e.title}</span>
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

      {showApprove && (() => {
        const edits = getPacketEdits(showApprove.id);
        return (
          <ConfirmModal
            title="Approve packet"
            description={`Approve packet "${showApprove.name}"? This will mark the packet confirmed and move all ${edits.length} edit${edits.length !== 1 ? 's' : ''} to Sent to IT.`}
            confirmLabel="Approve"
            loading={submitting}
            onConfirm={() => handleApprove(showApprove)}
            onCancel={() => setShowApprove(null)}
          />
        );
      })()}

      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-arc-900/40 backdrop-blur-sm"
            onClick={() => { if (!submitting) { setShowReject(null); setRejectNotes(''); } }}
          />
          <div className="relative bg-white rounded-xl border border-arc-200 shadow-lg w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-arc-900 mb-2">Reject packet</h2>
            <p className="text-sm text-arc-500 mb-4">
              Rejecting "{showReject.name}". The packet will be closed and its edits will return to the Approved Pool.
            </p>
            <label className="text-xs font-medium text-arc-500 mb-1.5 block">
              Rejection notes <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full border border-arc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors resize-none mb-4"
              rows={4}
              placeholder="Explain why this packet is being rejected so the analyst can address it."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowReject(null); setRejectNotes(''); }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="!bg-rose-600 hover:!bg-rose-700 active:!bg-rose-800 !text-white"
                disabled={!rejectNotes.trim() || submitting}
                loading={submitting}
                onClick={() => handleReject(showReject)}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 3: Confirmed (packet-centric: Sent to IT + Live) ──────────────────────

interface PacketSectionProps {
  title: string;
  packets: Packet[];
  userMap: Record<string, string>;
  getPacketEdits: (id: string) => RiskEdit[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  badge: { label: string; className: string };
  emptyText: string;
}

function PacketSection({
  title, packets, userMap, getPacketEdits, expanded, onToggle, badge, emptyText,
}: PacketSectionProps) {
  return (
    <section>
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-arc-900 uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-arc-200">{packets.length} packet{packets.length !== 1 ? 's' : ''}</span>
      </header>
      {packets.length === 0 ? (
        <p className="text-xs text-arc-200 px-1 py-3">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {packets.map((pkt) => {
            const edits  = getPacketEdits(pkt.id);
            const isOpen = expanded.has(pkt.id);
            return (
              <div key={pkt.id} className="rounded-xl border border-arc-200 bg-white overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-arc-200">{edits.length} edit{edits.length !== 1 ? 's' : ''}</span>
                    </div>
                    <h3 className="font-semibold text-arc-900">{pkt.name}</h3>
                    {pkt.description && (
                      <p className="text-xs text-arc-200 mt-0.5 leading-relaxed">{pkt.description}</p>
                    )}
                    <p className="text-xs text-arc-200 mt-1">
                      Created by {userMap[pkt.created_by] ?? pkt.created_by} · {fmt(pkt.created_at)}
                      {pkt.confirmed_by && pkt.confirmed_at && (
                        <> · Confirmed by {userMap[pkt.confirmed_by] ?? pkt.confirmed_by} · {fmt(pkt.confirmed_at)}</>
                      )}
                      {pkt.lived_by && pkt.lived_at && (
                        <> · Lived by {userMap[pkt.lived_by] ?? pkt.lived_by} · {fmt(pkt.lived_at)}</>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => onToggle(pkt.id)}
                    className="shrink-0 text-xs text-arc-500 hover:text-arc-900 transition-colors px-2 py-1 rounded border border-arc-200 hover:border-arc-500"
                  >
                    {isOpen ? 'Hide edits ▲' : 'Show edits ▼'}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-arc-200 divide-y divide-arc-200 bg-white">
                    {edits.length === 0 ? (
                      <p className="px-5 py-3 text-xs text-arc-200">No edits attached.</p>
                    ) : (
                      edits.map((e) => (
                        <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-4 odd:bg-white even:bg-arc-50/40">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-arc-900 truncate block">{e.title}</span>
                            <span className="text-xs font-mono text-arc-200">{e.edit_id_display} · {e.target_module_id}</span>
                          </div>
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
    </section>
  );
}

function ConfirmedTab() {
  const { data: allPackets = [], isLoading } = usePackets();
  const { data: allEdits = [] } = useRiskEdits();
  const { data: allPacketEdits = [] } = useAllPacketEdits();
  const { data: userMap = {} } = useAllUserNames();

  const sentToIt = allPackets
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => (b.confirmed_at ?? '').localeCompare(a.confirmed_at ?? ''));
  const live = allPackets
    .filter((p) => p.status === 'live')
    .sort((a, b) => (b.lived_at ?? '').localeCompare(a.lived_at ?? ''));

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function getPacketEdits(packetId: string): RiskEdit[] {
    const pes = allPacketEdits.filter((pe) => pe.packet_id === packetId);
    return pes.map((pe) => allEdits.find((e) => e.id === pe.risk_edit_id)).filter(Boolean) as RiskEdit[];
  }

  const editCounts: Record<string, number> = {};
  for (const p of allPackets) {
    editCounts[p.id] = allPacketEdits.filter((pe) => pe.packet_id === p.id).length;
  }

  function handleExport() {
    exportPacketsCsv([...sentToIt, ...live], userMap, editCounts);
  }

  const totalVisible = sentToIt.length + live.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-arc-200 bg-white flex items-center justify-between gap-4 shrink-0">
        <p className="text-xs text-arc-200">
          {totalVisible === 0
            ? 'No confirmed packets yet.'
            : `${sentToIt.length} sent to IT · ${live.length} live`}
        </p>
        <Button variant="secondary" size="sm" disabled={totalVisible === 0} onClick={handleExport}>
          Export CSV
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-arc-200 text-sm">Loading…</div>
        ) : totalVisible === 0 ? (
          <div className="flex items-center justify-center py-16 flex-col gap-3 text-arc-200 text-center">
            <Send className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
            <p className="text-sm max-w-sm">
              No confirmed packets yet. Packets approved on the Proposed Packets tab will appear here.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col gap-8">
            <PacketSection
              title="Sent to IT"
              packets={sentToIt}
              userMap={userMap}
              getPacketEdits={getPacketEdits}
              expanded={expanded}
              onToggle={toggleExpand}
              badge={{ label: 'Confirmed', className: 'bg-arc-50 text-arc-700 border-arc-200' }}
              emptyText="No packets currently with IT."
            />
            <PacketSection
              title="Live"
              packets={live}
              userMap={userMap}
              getPacketEdits={getPacketEdits}
              expanded={expanded}
              onToggle={toggleExpand}
              badge={{ label: 'Live', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }}
              emptyText="No packets live yet."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ChangelogPage() {
  const { data: proposedPackets = [] } = usePackets({ status: 'proposed' } as Partial<Packet>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'Changelog' }]} />} />

      <Tabs defaultTab="approved" className="flex-1 min-h-0 overflow-hidden">
        <TabList className="px-6 bg-white shrink-0">
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

        <TabPanel id="approved"  className="overflow-hidden"><ApprovedPoolTab /></TabPanel>
        <TabPanel id="proposed"  className="overflow-hidden"><ProposedPacketsTab /></TabPanel>
        <TabPanel id="confirmed" className="overflow-hidden"><ConfirmedTab /></TabPanel>
      </Tabs>
    </div>
  );
}
