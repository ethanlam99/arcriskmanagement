import { useState } from 'react';
import { Send } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { usePackets, useAllPacketEdits } from '@/hooks/useITHandoffPackets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { ConfirmModal } from '@/components/shared/ConfirmModal';
import type { Packet, RiskEdit } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function PacketStatusBadge({ status }: { status: Packet['status'] }) {
  const styles: Record<Packet['status'], string> = {
    proposed:  'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    rejected:  'bg-rose-50 text-rose-700 border-rose-200',
    live:      'bg-forest-50 text-forest-700 border-forest-100 font-semibold',
  };
  const labels: Record<Packet['status'], string> = {
    proposed:  'Proposed',
    confirmed: 'Confirmed',
    rejected:  'Rejected',
    live:      'Live',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ── Packet drawer ─────────────────────────────────────────────────────────────

function PacketDrawer({
  packet,
  edits,
  userMap,
  canMarkLive,
  onMarkLive,
  onClose,
}: {
  packet:      Packet;
  edits:       RiskEdit[];
  userMap:     Record<string, string>;
  canMarkLive: boolean;
  onMarkLive:  () => void;
  onClose:     () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-arc-900/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[560px] bg-white border-l border-arc-200 flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-arc-200 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <PacketStatusBadge status={packet.status} />
            </div>
            <h2 className="text-base font-semibold text-arc-900">{packet.name}</h2>
            {packet.description && (
              <p className="text-xs text-arc-200 mt-0.5 leading-relaxed">{packet.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-arc-200 hover:text-arc-900 transition-colors ml-4 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Meta */}
          <div className="rounded-xl border border-arc-200 bg-arc-100 divide-y divide-arc-200">
            {[
              { label: 'Created by',   value: userMap[packet.created_by] ?? packet.created_by },
              { label: 'Created at',   value: fmtDate(packet.created_at) },
              ...(packet.confirmed_by ? [
                { label: 'Confirmed by', value: userMap[packet.confirmed_by] ?? packet.confirmed_by },
                { label: 'Confirmed at', value: packet.confirmed_at ? fmt(packet.confirmed_at) : '—' },
              ] : []),
              ...(packet.lived_by ? [
                { label: 'Marked live by', value: userMap[packet.lived_by] ?? packet.lived_by },
                { label: 'Went live at',   value: packet.lived_at ? fmt(packet.lived_at) : '—' },
              ] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-xs text-arc-200 w-28 shrink-0 pt-0.5">{label}</span>
                <span className="text-xs text-arc-900 font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Edits in packet */}
          <div>
            <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">
              Risk Edits ({edits.length})
            </p>
            {edits.length === 0 ? (
              <p className="text-xs text-arc-200">No edits in this packet.</p>
            ) : (
              <div className="rounded-xl border border-arc-200 overflow-hidden bg-white divide-y divide-arc-200">
                {edits.map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-arc-900 truncate block">{e.title}</span>
                      <span className="text-xs font-mono text-arc-200">{e.edit_id_display} · {e.target_module_id}</span>
                    </div>
                    <StageBadge stage={e.current_stage} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-arc-200 shrink-0 flex items-center justify-end">
          {canMarkLive && packet.status === 'confirmed' ? (
            <Button size="sm" onClick={onMarkLive}>
              Mark as Live
            </Button>
          ) : packet.status === 'live' ? (
            <span className="text-xs text-forest-700 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-forest-500" />
              Live in risk engine
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ITHandoffLogPage() {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const qc   = useQueryClient();

  const { data: allPackets = [], isLoading } = usePackets();
  const { data: allEdits = [] } = useRiskEdits();
  const { data: allPacketEdits = [] } = useAllPacketEdits();

  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'map', 'name'],
    queryFn:  async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
  });

  // Only show confirmed + live packets (the IT-relevant ones)
  const packets = [...allPackets]
    .filter((p) => p.status === 'confirmed' || p.status === 'live')
    .sort((a, b) => {
      const aDate = a.confirmed_at ?? a.created_at;
      const bDate = b.confirmed_at ?? b.created_at;
      return bDate.localeCompare(aDate);
    });

  const canAct = role === 'it_team' || role === 'admin';

  const [selected,     setSelected]     = useState<Packet | null>(null);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [markingLive,  setMarkingLive]  = useState(false);

  function getPacketEdits(packetId: string): RiskEdit[] {
    const pes = allPacketEdits.filter((pe) => pe.packet_id === packetId);
    return pes.map((pe) => allEdits.find((e) => e.id === pe.risk_edit_id)).filter(Boolean) as RiskEdit[];
  }

  async function handleMarkLive() {
    if (!currentUser || !selected) return;
    const edits = getPacketEdits(selected.id);
    setMarkingLive(true);
    try {
      await repo.packets.update(selected.id, {
        status:   'live',
        lived_by: currentUser.id,
        lived_at: new Date().toISOString(),
      } as Partial<Packet>);
      await Promise.all(edits.map((e) =>
        repo.riskEdits.update(e.id, { current_stage: 'live', updated_at: new Date().toISOString() })
      ));
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'packet.live',
        entity_type:  'packet',
        entity_id:    selected.id,
        payload_json: { risk_edit_ids: edits.map((e) => e.id) },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setShowConfirm(false);
      setSelected(null);
    } finally {
      setMarkingLive(false);
    }
  }

  const selectedEdits = selected ? getPacketEdits(selected.id) : [];

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={<Breadcrumb items={[{ label: 'IT Handoff Log' }]} />}
          actions={
            <span className="px-2.5 py-1 rounded-full bg-arc-100 border border-arc-200 text-xs font-semibold text-arc-500">
              {packets.length} packet{packets.length !== 1 ? 's' : ''}
            </span>
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-arc-900">IT Handoff Log</h1>
              <p className="text-sm text-arc-200 mt-0.5">
                Confirmed packets awaiting deployment, and live packets already in the risk engine.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-24 text-arc-200 text-sm">Loading…</div>
            ) : packets.length === 0 ? (
              <div className="flex items-center justify-center py-24 flex-col gap-3 text-arc-200">
                <Send className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
                <p className="text-sm">No packets have been confirmed yet.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-arc-200 shadow-sm overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arc-200 bg-arc-100">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Packet</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Edits</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Confirmed by</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Confirmed at</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {packets.map((pkt) => {
                      const edits = getPacketEdits(pkt.id);
                      return (
                        <tr key={pkt.id}
                          className="border-b border-arc-200 last:border-0 odd:bg-white even:bg-arc-100/40 hover:bg-arc-100 transition-colors cursor-pointer"
                          onClick={() => setSelected(pkt)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-arc-900">{pkt.name}</p>
                            {pkt.description && (
                              <p className="text-xs text-arc-200 mt-0.5 truncate max-w-xs">{pkt.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <PacketStatusBadge status={pkt.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-arc-500">
                            {edits.length} edit{edits.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-4 py-3 text-xs text-arc-200">
                            {pkt.confirmed_by ? (userMap[pkt.confirmed_by] ?? pkt.confirmed_by) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-arc-200">
                            {pkt.confirmed_at ? fmt(pkt.confirmed_at) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="secondary"
                              onClick={(e) => { e.stopPropagation(); setSelected(pkt); }}>
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <PacketDrawer
          packet={selected}
          edits={selectedEdits}
          userMap={userMap}
          canMarkLive={canAct}
          onMarkLive={() => setShowConfirm(true)}
          onClose={() => setSelected(null)}
        />
      )}

      {showConfirm && selected && (
        <ConfirmModal
          title="Mark packet as Live"
          description={`"${selected.name}" contains ${selectedEdits.length} edit${selectedEdits.length !== 1 ? 's' : ''}. Marking as live will update their stage to Live and cannot be undone.`}
          confirmLabel="Mark as Live"
          loading={markingLive}
          onConfirm={handleMarkLive}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
