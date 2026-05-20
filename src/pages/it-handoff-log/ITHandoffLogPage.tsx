import { useState } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const styles: Record<Packet['status'], string> = {
    proposed:  'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
    confirmed: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50',
    rejected:  'bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/50',
    live:      'bg-forest-50 dark:bg-forest-dark-700/20 text-forest-700 dark:text-forest-dark-700 border-forest-100 dark:border-forest-dark-700 font-semibold',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${styles[status]}`}>
      {t(`it_handoff.status_${status}`)}
    </span>
  );
}

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
  const { t } = useTranslation();
  return (
    <>
      <div className="fixed inset-0 z-40 bg-arc-900/20 dark:bg-arc-dark-900/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[560px] bg-white dark:bg-arc-dark-100 border-l border-arc-200 dark:border-arc-dark-200 flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-arc-200 dark:border-arc-dark-200 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <PacketStatusBadge status={packet.status} />
            </div>
            <h2 className="text-base font-semibold text-arc-900 dark:text-arc-dark-700">{packet.name}</h2>
            {packet.description && (
              <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5 leading-relaxed">{packet.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-arc-500 dark:text-arc-dark-500 hover:text-arc-900 dark:hover:text-arc-dark-700 transition-colors ml-4 shrink-0" aria-label={t('common.close')}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100 divide-y divide-arc-200 dark:divide-arc-dark-200">
            {[
              { label: t('it_handoff.drawer_created_by'), value: userMap[packet.created_by] ?? packet.created_by },
              { label: t('it_handoff.drawer_created_at'), value: fmtDate(packet.created_at) },
              ...(packet.confirmed_by ? [
                { label: t('it_handoff.drawer_confirmed_by'), value: userMap[packet.confirmed_by] ?? packet.confirmed_by },
                { label: t('it_handoff.drawer_confirmed_at'), value: packet.confirmed_at ? fmt(packet.confirmed_at) : '—' },
              ] : []),
              ...(packet.lived_by ? [
                { label: t('it_handoff.drawer_marked_live_by'), value: userMap[packet.lived_by] ?? packet.lived_by },
                { label: t('it_handoff.drawer_went_live_at'), value: packet.lived_at ? fmt(packet.lived_at) : '—' },
              ] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-xs text-arc-500 dark:text-arc-dark-500 w-28 shrink-0 pt-0.5">{label}</span>
                <span className="text-xs text-arc-900 dark:text-arc-dark-700 font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-3">
              {t('it_handoff.drawer_risk_edits', { count: edits.length })}
            </p>
            {edits.length === 0 ? (
              <p className="text-xs text-arc-500 dark:text-arc-dark-500">{t('it_handoff.drawer_no_edits')}</p>
            ) : (
              <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 overflow-hidden bg-white dark:bg-arc-dark-100 divide-y divide-arc-200 dark:divide-arc-dark-200">
                {edits.map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate block">{e.title}</span>
                      <span className="text-xs font-mono text-arc-500 dark:text-arc-dark-500">{e.edit_id_display} · {e.target_module_id}</span>
                    </div>
                    <StageBadge stage={e.current_stage} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-arc-200 dark:border-arc-dark-200 shrink-0 flex items-center justify-end">
          {canMarkLive && packet.status === 'confirmed' ? (
            <Button size="sm" onClick={onMarkLive}>
              {t('it_handoff.mark_as_live')}
            </Button>
          ) : packet.status === 'live' ? (
            <span className="text-xs text-forest-700 dark:text-forest-dark-700 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-forest-500 dark:bg-forest-dark-500" />
              {t('it_handoff.live_in_engine')}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function ITHandoffLogPage() {
  const { t } = useTranslation();
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
          breadcrumb={<Breadcrumb items={[{ label: t('it_handoff.title') }]} />}
          actions={
            <span className="px-2.5 py-1 rounded-full bg-arc-100 dark:bg-arc-dark-100 border border-arc-200 dark:border-arc-dark-200 text-xs font-semibold text-arc-500 dark:text-arc-dark-500">
              {t('it_handoff.packets_count', { count: packets.length })}
            </span>
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-arc-900 dark:text-arc-dark-700">{t('it_handoff.title')}</h1>
              <p className="text-sm text-arc-500 dark:text-arc-dark-500 mt-0.5">{t('it_handoff.subtitle')}</p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-24 text-arc-500 dark:text-arc-dark-500 text-sm">{t('common.loading')}</div>
            ) : packets.length === 0 ? (
              <div className="flex items-center justify-center py-24 flex-col gap-3 text-arc-500 dark:text-arc-dark-500">
                <Send className="w-12 h-12 text-arc-500 dark:text-arc-dark-500" strokeWidth={1.5} />
                <p className="text-sm">{t('it_handoff.empty')}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-sm overflow-hidden bg-white dark:bg-arc-dark-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arc-200 dark:border-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('it_handoff.col_packet')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('it_handoff.col_status')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('it_handoff.col_edits')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('it_handoff.col_confirmed_by')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">{t('it_handoff.col_confirmed_at')}</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {packets.map((pkt) => {
                      const edits = getPacketEdits(pkt.id);
                      return (
                        <tr key={pkt.id}
                          className="border-b border-arc-200 dark:border-arc-dark-200 last:border-0 odd:bg-white even:bg-arc-100/40 hover:bg-arc-200 dark:hover:bg-arc-dark-200 transition-colors duration-150 cursor-pointer"
                          onClick={() => setSelected(pkt)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-arc-900 dark:text-arc-dark-700">{pkt.name}</p>
                            {pkt.description && (
                              <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5 truncate max-w-xs">{pkt.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <PacketStatusBadge status={pkt.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-arc-500 dark:text-arc-dark-500">
                            {t('it_handoff.edits_count', { count: edits.length })}
                          </td>
                          <td className="px-4 py-3 text-xs text-arc-500 dark:text-arc-dark-500">
                            {pkt.confirmed_by ? (userMap[pkt.confirmed_by] ?? pkt.confirmed_by) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-arc-500 dark:text-arc-dark-500">
                            {pkt.confirmed_at ? fmt(pkt.confirmed_at) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="secondary"
                              onClick={(e) => { e.stopPropagation(); setSelected(pkt); }}>
                              {t('it_handoff.view')}
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
          title={t('it_handoff.mark_live_modal_title')}
          description={t('it_handoff.mark_live_modal', {
            name: selected.name,
            count: selectedEdits.length,
          })}
          confirmLabel={t('it_handoff.mark_live_confirm')}
          loading={markingLive}
          onConfirm={handleMarkLive}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
