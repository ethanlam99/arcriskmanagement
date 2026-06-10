import { useState } from 'react';
import { Send, CheckCircle2, Circle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { usePackets, useAllPacketEdits } from '@/hooks/useITHandoffPackets';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { StageBadge } from '@/components/shared/StageBadge';
import { IT_DEPLOY_STEPS, effectiveItStatus, IT_STATUS_LABEL_KEY } from '@/lib/itDeploy';
import type { Packet, RiskEdit, ITDeployStatus } from '@/types';

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

const IT_BADGE_CLS: Record<ITDeployStatus | 'awaiting', string> = {
  awaiting:         'bg-arc-100 dark:bg-arc-dark-200 text-arc-700 dark:text-arc-dark-700 border-arc-200 dark:border-arc-dark-200',
  received:         'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50',
  in_development:   'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
  deployed_to_live: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50 font-semibold',
};

function ITStatusBadge({ packet }: { packet: Packet }) {
  const { t } = useTranslation();
  const eff = effectiveItStatus(packet) ?? 'awaiting';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${IT_BADGE_CLS[eff]}`}>
      {t(IT_STATUS_LABEL_KEY[eff])}
    </span>
  );
}

function LifecycleStepper({ packet, userMap }: { packet: Packet; userMap: Record<string, string> }) {
  const { t } = useTranslation();
  const eff = effectiveItStatus(packet);
  const reachedIdx = eff ? IT_DEPLOY_STEPS.indexOf(eff) : -1;

  const stepMeta: Record<ITDeployStatus, { labelKey: string; actor?: string; at?: string; extra?: string }> = {
    received: {
      labelKey: 'it_handoff.it_received',
      actor: packet.received_by, at: packet.received_at,
    },
    in_development: {
      labelKey: 'it_handoff.it_in_development',
      actor: packet.dev_started_by, at: packet.dev_started_at,
    },
    deployed_to_live: {
      labelKey: 'it_handoff.it_deployed',
      actor: packet.lived_by, at: packet.lived_at,
      extra: packet.release_ref,
    },
  };

  return (
    <ol className="flex flex-col">
      {IT_DEPLOY_STEPS.map((step, idx) => {
        const isDone    = idx <= reachedIdx;
        // Spinner only on the active frontier step while the lifecycle is still in
        // flight; the terminal deployed step (and all past steps) read as complete.
        const isInFlight = idx === reachedIdx && eff !== 'deployed_to_live';
        const m = stepMeta[step];
        const isLast = idx === IT_DEPLOY_STEPS.length - 1;
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              {isDone ? (
                isInFlight ? (
                  <Loader className="w-4 h-4 text-forest-600 dark:text-forest-dark-700 shrink-0 animate-spin" strokeWidth={2.5} />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" strokeWidth={2.5} />
                )
              ) : (
                <Circle className="w-4 h-4 text-arc-300 dark:text-arc-dark-300 shrink-0" strokeWidth={2} />
              )}
              {!isLast && <span className={`w-px flex-1 my-0.5 ${idx < reachedIdx ? 'bg-emerald-400 dark:bg-emerald-700' : 'bg-arc-200 dark:bg-arc-dark-200'}`} />}
            </div>
            <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
              <p className={`text-xs font-medium ${isDone ? 'text-arc-900 dark:text-arc-dark-700' : 'text-arc-400 dark:text-arc-dark-300'}`}>
                {t(m.labelKey)}
              </p>
              {isDone && m.actor && m.at && (
                <p className="text-[11px] text-arc-500 dark:text-arc-dark-500 mt-0.5">
                  {userMap[m.actor] ?? m.actor} · {fmt(m.at)}
                </p>
              )}
              {isDone && m.extra && (
                <p className="text-[11px] font-mono text-forest-700 dark:text-forest-dark-700 mt-0.5">
                  {t('it_handoff.released_as', { ref: m.extra })}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DeployModal({
  packet,
  editCount,
  loading,
  onConfirm,
  onCancel,
}: {
  packet: Packet;
  editCount: number;
  loading: boolean;
  onConfirm: (releaseRef: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [ref, setRef] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-arc-900/40 dark:bg-arc-dark-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-arc-dark-100 rounded-xl border border-arc-200 dark:border-arc-dark-200 shadow-lg w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-semibold text-arc-900 dark:text-arc-dark-700 mb-2">{t('it_handoff.deploy_modal_title')}</h2>
        <p className="text-sm text-arc-500 dark:text-arc-dark-500 mb-4">{t('it_handoff.deploy_modal_desc', { name: packet.name, count: editCount })}</p>
        <label className="block mb-5">
          <span className="block text-[11px] font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-1">
            {t('it_handoff.release_ref_label')} <span className="text-rose-500">*</span>
          </span>
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={t('it_handoff.release_ref_placeholder')}
            autoFocus
            className="w-full rounded-md border border-arc-200 dark:border-arc-dark-200 px-2.5 py-2 text-sm font-mono focus:outline-none focus:border-forest-500"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" loading={loading} disabled={!ref.trim()} onClick={() => onConfirm(ref.trim())}>
            {t('it_handoff.deploy_confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PacketDrawer({
  packet,
  edits,
  userMap,
  canAct,
  busy,
  onAcknowledge,
  onStartDev,
  onDeploy,
  onClose,
}: {
  packet:       Packet;
  edits:        RiskEdit[];
  userMap:      Record<string, string>;
  canAct:       boolean;
  busy:         boolean;
  onAcknowledge: () => void;
  onStartDev:    () => void;
  onDeploy:      () => void;
  onClose:       () => void;
}) {
  const { t } = useTranslation();
  const eff = effectiveItStatus(packet);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-arc-900/20 dark:bg-arc-dark-900/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[560px] bg-white dark:bg-arc-dark-100 border-l border-arc-200 dark:border-arc-dark-200 flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-arc-200 dark:border-arc-dark-200 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ITStatusBadge packet={packet} />
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
          <div>
            <p className="text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide mb-3">
              {t('it_handoff.lifecycle_heading')}
            </p>
            <LifecycleStepper packet={packet} userMap={userMap} />
          </div>

          <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-arc-100 dark:bg-arc-dark-100 divide-y divide-arc-200 dark:divide-arc-dark-200">
            {[
              { label: t('it_handoff.drawer_created_by'), value: userMap[packet.created_by] ?? packet.created_by },
              { label: t('it_handoff.drawer_created_at'), value: fmtDate(packet.created_at) },
              ...(packet.confirmed_by ? [
                { label: t('it_handoff.drawer_confirmed_by'), value: userMap[packet.confirmed_by] ?? packet.confirmed_by },
                { label: t('it_handoff.drawer_confirmed_at'), value: packet.confirmed_at ? fmt(packet.confirmed_at) : '—' },
              ] : []),
              ...(packet.release_ref ? [
                { label: t('it_handoff.drawer_release_ref'), value: packet.release_ref },
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
          {eff === 'deployed_to_live' ? (
            <span className="text-xs text-forest-700 dark:text-forest-dark-700 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-forest-500 dark:bg-forest-dark-500" />
              {t('it_handoff.live_in_engine')}
            </span>
          ) : canAct ? (
            eff === undefined ? (
              <Button size="sm" loading={busy} onClick={onAcknowledge}>{t('it_handoff.acknowledge')}</Button>
            ) : eff === 'received' ? (
              <Button size="sm" loading={busy} onClick={onStartDev}>{t('it_handoff.start_dev')}</Button>
            ) : eff === 'in_development' ? (
              <Button size="sm" loading={busy} onClick={onDeploy}>{t('it_handoff.deploy')}</Button>
            ) : null
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

  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [deployTarget, setDeployTarget] = useState<Packet | null>(null);
  const [busy,         setBusy]         = useState(false);

  // Re-read the live packet object so the drawer reflects each lifecycle advance.
  const selected = selectedId ? packets.find((p) => p.id === selectedId) ?? null : null;

  function getPacketEdits(packetId: string): RiskEdit[] {
    const pes = allPacketEdits.filter((pe) => pe.packet_id === packetId);
    return pes.map((pe) => allEdits.find((e) => e.id === pe.risk_edit_id)).filter(Boolean) as RiskEdit[];
  }

  async function acknowledgeReceipt(packet: Packet) {
    if (!currentUser) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await repo.packets.update(packet.id, {
        it_status:   'received',
        received_by: currentUser.id,
        received_at: now,
      } as Partial<Packet>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'it_handoff.received',
        entity_type:  'packet',
        entity_id:    packet.id,
        payload_json: {},
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
    } finally {
      setBusy(false);
    }
  }

  async function startDevelopment(packet: Packet) {
    if (!currentUser) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await repo.packets.update(packet.id, {
        it_status:      'in_development',
        dev_started_by: currentUser.id,
        dev_started_at: now,
      } as Partial<Packet>);
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'it_handoff.in_development',
        entity_type:  'packet',
        entity_id:    packet.id,
        payload_json: {},
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
    } finally {
      setBusy(false);
    }
  }

  async function deployToLive(packet: Packet, releaseRef: string) {
    if (!currentUser) return;
    const edits = getPacketEdits(packet.id);
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await repo.packets.update(packet.id, {
        status:      'live',
        it_status:   'deployed_to_live',
        release_ref: releaseRef,
        lived_by:    currentUser.id,
        lived_at:    now,
      } as Partial<Packet>);
      await Promise.all(edits.map((e) =>
        repo.riskEdits.update(e.id, { current_stage: 'live', updated_at: now })
      ));
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'it_handoff.deployed',
        entity_type:  'packet',
        entity_id:    packet.id,
        payload_json: { risk_edit_ids: edits.map((e) => e.id), release_ref: releaseRef },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'packets'] });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });
      setDeployTarget(null);
    } finally {
      setBusy(false);
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
                          onClick={() => setSelectedId(pkt.id)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-arc-900 dark:text-arc-dark-700">{pkt.name}</p>
                            {pkt.description && (
                              <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5 truncate max-w-xs">{pkt.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <ITStatusBadge packet={pkt} />
                            {pkt.release_ref && (
                              <p className="text-[11px] font-mono text-forest-700 dark:text-forest-dark-700 mt-1">{pkt.release_ref}</p>
                            )}
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
                              onClick={(e) => { e.stopPropagation(); setSelectedId(pkt.id); }}>
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
          canAct={canAct}
          busy={busy}
          onAcknowledge={() => acknowledgeReceipt(selected)}
          onStartDev={() => startDevelopment(selected)}
          onDeploy={() => setDeployTarget(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {deployTarget && (
        <DeployModal
          packet={deployTarget}
          editCount={getPacketEdits(deployTarget.id).length}
          loading={busy}
          onConfirm={(ref) => deployToLive(deployTarget, ref)}
          onCancel={() => setDeployTarget(null)}
        />
      )}
    </>
  );
}
