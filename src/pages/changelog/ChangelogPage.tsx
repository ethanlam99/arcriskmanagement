import { useState } from 'react';
import { PackageOpen, Package, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { effectiveItStatus, IT_STATUS_LABEL_KEY } from '@/lib/itDeploy';
import type { Packet, RiskEdit } from '@/types';

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

// ── Tab 1: Approved Pool ─────────────────────────────────────────────────────

function ApprovedPoolTab() {
  const { t } = useTranslation();
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc = useQueryClient();
  const createPacket = useCreatePacket();

  const { data: changes = [], isLoading } = useRiskEdits({ current_stage: 'approved' } as Partial<RiskEdit>);
  const { data: allPackets = [] } = usePackets();
  const { data: allPacketEdits = [] } = useAllPacketEdits();
  const userIds = [...new Set(changes.map((c) => c.created_by))];
  const { data: userMap = {} } = useUserNames(userIds);

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
        <div className="px-6 py-3 border-b border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 flex items-center justify-between gap-4 shrink-0">
          <p className="text-xs text-arc-500 dark:text-arc-dark-500">
            {unbundled.length === 0
              ? t('changelog.approved_no_available')
              : t('changelog.approved_count', { count: unbundled.length })}
          </p>
          {canAct && (
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setShowCreateModal(true)}
            >
              {t('changelog.create_from_selected', { count: selected.size })}
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-arc-500 dark:text-arc-dark-500 text-sm">{t('common.loading')}</div>
          ) : unbundled.length === 0 ? (
            <div className="flex items-center justify-center py-16 flex-col gap-3 text-arc-500 dark:text-arc-dark-500 px-6 text-center">
              <PackageOpen className="w-12 h-12 text-arc-500 dark:text-arc-dark-500" strokeWidth={1.5} />
              <p className="text-sm max-w-sm">{t('changelog.approved_empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arc-200 dark:border-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100 sticky top-0">
                  {canAct && (
                    <th className="px-4 py-2.5 w-10">
                      <input type="checkbox"
                        checked={selected.size === unbundled.length && unbundled.length > 0}
                        onChange={toggleAll}
                        className="rounded border-arc-300 dark:border-arc-dark-300" />
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('changelog.col_change')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('changelog.col_module')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('changelog.col_author')}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('changelog.col_approved')}</th>
                </tr>
              </thead>
              <tbody>
                {unbundled.map((c) => (
                  <tr key={c.id} className="border-b border-arc-200 dark:border-arc-dark-200 last:border-0 transition-colors duration-150 odd:bg-white even:bg-arc-100/40 hover:bg-arc-200 dark:hover:bg-arc-dark-200">
                    {canAct && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="rounded border-arc-300 dark:border-arc-dark-300" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-arc-900 dark:text-arc-dark-700 font-medium">{c.title}</span>
                      <p className="text-xs font-mono text-arc-500 dark:text-arc-dark-500 mt-0.5">{c.edit_id_display}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-arc-500 dark:text-arc-dark-500">{c.target_module_id}</td>
                    <td className="px-4 py-3 text-xs text-arc-500 dark:text-arc-dark-500">{userMap[c.created_by] ?? c.created_by}</td>
                    <td className="px-4 py-3 text-xs text-arc-500 dark:text-arc-dark-500">{fmt(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-40 bg-arc-900/30 dark:bg-arc-dark-900/60 flex items-center justify-center p-6">
          <div className="bg-white dark:bg-arc-dark-100 rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-arc-900 dark:text-arc-dark-700 mb-0.5">{t('changelog.create_packet_title')}</h3>
              <p className="text-xs text-arc-500 dark:text-arc-dark-500">
                {t('changelog.create_packet_bundling', { count: selected.size })}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-arc-500 dark:text-arc-dark-500 mb-1.5 block">
                {t('changelog.packet_name')} <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full border border-arc-200 dark:border-arc-dark-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors"
                placeholder={t('changelog.packet_name_placeholder')}
                value={newPacketName}
                onChange={(e) => setNewPacketName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-arc-500 dark:text-arc-dark-500 mb-1.5 block">{t('changelog.packet_description')}</label>
              <textarea
                className="w-full border border-arc-200 dark:border-arc-dark-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors resize-none"
                rows={3}
                placeholder={t('changelog.packet_description_placeholder')}
                value={newPacketDescription}
                onChange={(e) => setNewPacketDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={closeModal} disabled={createPacket.isPending}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={!newPacketName.trim() || createPacket.isPending}
                loading={createPacket.isPending}
                onClick={handleCreate}
              >
                {t('changelog.create')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 2: Proposed Packets ──────────────────────────────────────────────────

function ProposedPacketsTab() {
  const { t } = useTranslation();
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
        <div className="px-6 py-3 border-b border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 flex items-center gap-4 shrink-0">
          <p className="text-xs text-arc-500 dark:text-arc-dark-500">
            {packets.length === 0
              ? t('changelog.proposed_no_awaiting')
              : t('changelog.proposed_count', { count: packets.length })}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-arc-500 dark:text-arc-dark-500 text-sm">{t('common.loading')}</div>
          ) : packets.length === 0 ? (
            <div className="flex items-center justify-center py-16 flex-col gap-3 text-arc-500 dark:text-arc-dark-500">
              <Package className="w-12 h-12 text-arc-500 dark:text-arc-dark-500" strokeWidth={1.5} />
              <p className="text-sm">{t('changelog.no_proposed_packets')}</p>
              <p className="text-xs text-center max-w-xs">{t('changelog.no_proposed_create')}</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {packets.map((pkt) => {
                const edits  = getPacketEdits(pkt.id);
                const isOpen = expanded.has(pkt.id);
                return (
                  <div key={pkt.id} className="rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                            {t('changelog.status_proposed')}
                          </span>
                          <span className="text-xs text-arc-500 dark:text-arc-dark-500">{t('changelog.edits_count', { count: edits.length })}</span>
                        </div>
                        <h3 className="font-semibold text-arc-900 dark:text-arc-dark-700">{pkt.name}</h3>
                        {pkt.description && (
                          <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5 leading-relaxed">{pkt.description}</p>
                        )}
                        <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-1">
                          {t('changelog.proposed_by', {
                            name: userMap[pkt.created_by] ?? pkt.created_by,
                            date: fmt(pkt.created_at),
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleExpand(pkt.id)}
                          className="text-xs text-arc-500 dark:text-arc-dark-500 hover:text-arc-900 dark:hover:text-arc-dark-700 transition-colors px-2 py-1 rounded border border-arc-200 dark:border-arc-dark-200 hover:border-arc-500 dark:hover:border-arc-dark-300"
                        >
                          {isOpen ? t('changelog.hide_edits') : t('changelog.show_edits')}
                        </button>
                        {canAct && (
                          <>
                            <Button
                              size="sm"
                              className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800"
                              onClick={() => setShowApprove(pkt)}
                            >
                              {t('changelog.approve_packet')}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="!border-rose-500 dark:border-rose-500 !text-rose-600 hover:!bg-rose-50 dark:bg-rose-900/40 active:!bg-rose-100 dark:bg-rose-900/50"
                              onClick={() => { setShowReject(pkt); setRejectNotes(''); }}
                            >
                              {t('changelog.reject_packet')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-arc-200 dark:border-arc-dark-200 divide-y divide-arc-200 dark:divide-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100">
                        {edits.length === 0 ? (
                          <p className="px-5 py-3 text-xs text-arc-500 dark:text-arc-dark-500">{t('changelog.no_edits_attached')}</p>
                        ) : (
                          edits.map((e) => (
                            <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate block">{e.title}</span>
                                <span className="text-xs font-mono text-arc-500 dark:text-arc-dark-500">{e.edit_id_display} · {e.target_module_id}</span>
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
            title={t('changelog.approve_packet_modal_title')}
            description={t('changelog.approve_packet_modal', {
              name: showApprove.name,
              count: edits.length,
            })}
            confirmLabel={t('changelog.approve_packet')}
            loading={submitting}
            onConfirm={() => handleApprove(showApprove)}
            onCancel={() => setShowApprove(null)}
          />
        );
      })()}

      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-arc-900/40 dark:bg-arc-dark-900/60 backdrop-blur-sm"
            onClick={() => { if (!submitting) { setShowReject(null); setRejectNotes(''); } }}
          />
          <div className="relative bg-white dark:bg-arc-dark-100 rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-lg w-full max-w-md mx-4 p-6">
            <h2 className="text-base font-semibold text-arc-900 dark:text-arc-dark-700 mb-2">{t('changelog.reject_packet_modal_title')}</h2>
            <p className="text-sm text-arc-500 dark:text-arc-dark-500 mb-4">
              {t('changelog.reject_packet_modal', { name: showReject.name })}
            </p>
            <label className="text-xs font-medium text-arc-500 dark:text-arc-dark-500 mb-1.5 block">
              {t('workspace.qa.rejection_notes')} <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full border border-arc-200 dark:border-arc-dark-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-arc-500 transition-colors resize-none mb-4"
              rows={4}
              placeholder={t('changelog.reject_packet_placeholder')}
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
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                className="!bg-rose-600 hover:!bg-rose-700 active:!bg-rose-800 !text-white"
                disabled={!rejectNotes.trim() || submitting}
                loading={submitting}
                onClick={() => handleReject(showReject)}
              >
                {t('changelog.reject_packet')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 3: Confirmed ─────────────────────────────────────────────────────────

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
  const { t } = useTranslation();
  return (
    <section>
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-arc-900 dark:text-arc-dark-700 uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-arc-500 dark:text-arc-dark-500">{t('changelog.packets_count', { count: packets.length })}</span>
      </header>
      {packets.length === 0 ? (
        <p className="text-xs text-arc-500 dark:text-arc-dark-500 px-1 py-3">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {packets.map((pkt) => {
            const edits  = getPacketEdits(pkt.id);
            const isOpen = expanded.has(pkt.id);
            // Mirror the IT-owned lifecycle back to the risk side: show where with IT
            // a still-confirmed packet is (awaiting/received/in development).
            const itEff = pkt.status === 'confirmed' ? (effectiveItStatus(pkt) ?? 'awaiting') : null;
            return (
              <div key={pkt.id} className="rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 overflow-hidden">
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
                        {badge.label}
                      </span>
                      {itEff && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-arc-200 dark:border-arc-dark-200 text-arc-700 dark:text-arc-dark-700">
                          {t(IT_STATUS_LABEL_KEY[itEff])}
                        </span>
                      )}
                      <span className="text-xs text-arc-500 dark:text-arc-dark-500">{t('changelog.edits_count', { count: edits.length })}</span>
                    </div>
                    <h3 className="font-semibold text-arc-900 dark:text-arc-dark-700">{pkt.name}</h3>
                    {pkt.description && (
                      <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5 leading-relaxed">{pkt.description}</p>
                    )}
                    <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-1">
                      {t('changelog.created_by', {
                        name: userMap[pkt.created_by] ?? pkt.created_by,
                        date: fmt(pkt.created_at),
                      })}
                      {pkt.confirmed_by && pkt.confirmed_at && (
                        <> · {t('changelog.confirmed_by', {
                          name: userMap[pkt.confirmed_by] ?? pkt.confirmed_by,
                          date: fmt(pkt.confirmed_at),
                        })}</>
                      )}
                      {pkt.lived_by && pkt.lived_at && (
                        <> · {t('changelog.lived_by', {
                          name: userMap[pkt.lived_by] ?? pkt.lived_by,
                          date: fmt(pkt.lived_at),
                        })}</>
                      )}
                      {pkt.release_ref && (
                        <> · <span className="font-mono text-forest-700 dark:text-forest-dark-700">{t('it_handoff.released_as', { ref: pkt.release_ref })}</span></>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => onToggle(pkt.id)}
                    className="shrink-0 text-xs text-arc-500 dark:text-arc-dark-500 hover:text-arc-900 dark:hover:text-arc-dark-700 transition-colors px-2 py-1 rounded border border-arc-200 dark:border-arc-dark-200 hover:border-arc-500 dark:hover:border-arc-dark-300"
                  >
                    {isOpen ? t('changelog.hide_edits') : t('changelog.show_edits')}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-arc-200 dark:border-arc-dark-200 divide-y divide-arc-200 dark:divide-arc-dark-200 bg-white dark:bg-arc-dark-100">
                    {edits.length === 0 ? (
                      <p className="px-5 py-3 text-xs text-arc-500 dark:text-arc-dark-500">{t('changelog.no_edits_attached')}</p>
                    ) : (
                      edits.map((e) => (
                        <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-4 odd:bg-white even:bg-arc-100/40">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate block">{e.title}</span>
                            <span className="text-xs font-mono text-arc-500 dark:text-arc-dark-500">{e.edit_id_display} · {e.target_module_id}</span>
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
  const { t } = useTranslation();
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
      <div className="px-6 py-3 border-b border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 flex items-center justify-between gap-4 shrink-0">
        <p className="text-xs text-arc-500 dark:text-arc-dark-500">
          {totalVisible === 0
            ? t('changelog.confirmed_no_packets')
            : t('changelog.confirmed_count', { sent: sentToIt.length, live: live.length })}
        </p>
        <Button variant="secondary" size="sm" disabled={totalVisible === 0} onClick={handleExport}>
          {t('common.export_csv')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-arc-500 dark:text-arc-dark-500 text-sm">{t('common.loading')}</div>
        ) : totalVisible === 0 ? (
          <div className="flex items-center justify-center py-16 flex-col gap-3 text-arc-500 dark:text-arc-dark-500 text-center">
            <Send className="w-12 h-12 text-arc-500 dark:text-arc-dark-500" strokeWidth={1.5} />
            <p className="text-sm max-w-sm">{t('changelog.confirmed_empty')}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col gap-8">
            <PacketSection
              title={t('changelog.section_sent_to_it')}
              packets={sentToIt}
              userMap={userMap}
              getPacketEdits={getPacketEdits}
              expanded={expanded}
              onToggle={toggleExpand}
              badge={{ label: t('changelog.badge_confirmed'), className: 'bg-arc-100 dark:bg-arc-dark-100 text-arc-700 dark:text-arc-dark-700 border-arc-200 dark:border-arc-dark-200' }}
              emptyText={t('changelog.section_sent_to_it_empty')}
            />
            <PacketSection
              title={t('changelog.section_live')}
              packets={live}
              userMap={userMap}
              getPacketEdits={getPacketEdits}
              expanded={expanded}
              onToggle={toggleExpand}
              badge={{ label: t('changelog.badge_live'), className: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50' }}
              emptyText={t('changelog.section_live_empty')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ChangelogPage() {
  const { t } = useTranslation();
  const { data: proposedPackets = [] } = usePackets({ status: 'proposed' } as Partial<Packet>);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar breadcrumb={<Breadcrumb items={[{ label: t('changelog.title') }]} />} />

      <Tabs defaultTab="approved" className="flex-1 min-h-0 overflow-hidden">
        <TabList className="px-6 bg-white dark:bg-arc-dark-100 shrink-0">
          <TabTrigger id="approved">{t('changelog.tab_approved')}</TabTrigger>
          <TabTrigger id="proposed">
            {t('changelog.tab_proposed')}
            {proposedPackets.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                {proposedPackets.length}
              </span>
            )}
          </TabTrigger>
          <TabTrigger id="confirmed">{t('changelog.tab_confirmed')}</TabTrigger>
        </TabList>

        <TabPanel id="approved"  className="overflow-hidden"><ApprovedPoolTab /></TabPanel>
        <TabPanel id="proposed"  className="overflow-hidden"><ProposedPacketsTab /></TabPanel>
        <TabPanel id="confirmed" className="overflow-hidden"><ConfirmedTab /></TabPanel>
      </Tabs>
    </div>
  );
}
