import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { useITHandoffPackets } from '@/hooks/useITHandoffPackets';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { buildPacketDownloadData } from '@/integrations/itHandoff';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import type { ITHandoffPacket, HandoffSummary } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function downloadJson(packet: ITHandoffPacket) {
  const data = buildPacketDownloadData(packet);
  const blob  = new Blob([data], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `arc-handoff-${packet.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function PacketDrawer({
  packet,
  onClose,
}: {
  packet: ITHandoffPacket;
  onClose: () => void;
}) {
  const repo = useRepository();
  const summary = packet.packet_json.summary as HandoffSummary | undefined;
  const diff    = typeof packet.packet_json.diff === 'string' ? packet.packet_json.diff : '';
  const notes   = typeof packet.packet_json.deployment_notes === 'string' ? packet.packet_json.deployment_notes : '';

  const { data: author   } = useQuery({
    queryKey: ['arc', 'users', packet.risk_author_id],
    queryFn:  () => repo.users.get(packet.risk_author_id),
  });
  const { data: approver } = useQuery({
    queryKey: ['arc', 'users', packet.qa_approver_id],
    queryFn:  () => repo.users.get(packet.qa_approver_id),
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-arc-900/20" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[600px] bg-white border-l border-arc-200 flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-arc-200 flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-arc-200 font-mono mb-0.5">{packet.id}</p>
            <h2 className="text-base font-semibold text-arc-900">
              {summary?.change_title ?? 'IT Handoff Packet'}
            </h2>
          </div>
          <button onClick={onClose} className="text-arc-200 hover:text-arc-900 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Summary block */}
          {summary && (
            <div>
              <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Summary</p>
              <div className="rounded-xl border border-arc-200 bg-arc-50 divide-y divide-arc-200">
                {[
                  { label: 'Module',        value: summary.target_module },
                  { label: 'Risk Author',   value: author?.name ?? summary.risk_author },
                  { label: 'QA Approver',   value: approver?.name ?? summary.qa_approver },
                  { label: 'Approved At',   value: fmt(summary.approved_at) },
                  { label: 'Diff',          value: summary.diff_summary },
                  { label: 'Test Cases',    value: `${summary.test_cases_passed} / ${summary.test_cases_total} passed` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-xs text-arc-200 w-28 shrink-0 pt-0.5">{label}</span>
                    <span className="text-xs text-arc-900 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diff */}
          {diff && (
            <div>
              <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">SQL Diff</p>
              <div className="rounded-xl overflow-hidden border border-arc-200" style={{ height: 220 }}>
                <Editor
                  height={220}
                  language="sql"
                  value={diff}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, Menlo, monospace',
                    lineNumbers: 'off',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    theme: 'vs-dark',
                    padding: { top: 8, bottom: 8 },
                  }}
                  theme="vs-dark"
                />
              </div>
            </div>
          )}

          {/* Deployment notes */}
          {notes && (
            <div>
              <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-2">Deployment Notes</p>
              <p className="text-xs text-arc-900 leading-relaxed bg-arc-50 border border-arc-200 rounded-xl px-4 py-3">
                {notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-arc-200 shrink-0 flex items-center justify-between">
          <p className="text-xs text-arc-200">Sent {fmt(packet.sent_at)}</p>
          <Button size="sm" onClick={() => downloadJson(packet)}>
            Download as JSON
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ITHandoffLogPage() {
  const repo = useRepository();
  const { data: packets = [], isLoading } = useITHandoffPackets();
  const [selected, setSelected] = useState<ITHandoffPacket | null>(null);

  const authorIds   = [...new Set(packets.map((p) => p.risk_author_id))];
  const approverIds = [...new Set(packets.map((p) => p.qa_approver_id))];
  const { data: userMap = {} } = useQuery({
    queryKey: ['arc', 'users', 'batch', [...authorIds, ...approverIds].sort().join(',')],
    queryFn: async () => {
      const users = await repo.users.list();
      return Object.fromEntries(users.map((u) => [u.id, u.name]));
    },
    enabled: packets.length > 0,
  });

  const columns = [
    {
      key: 'id',
      header: 'Packet ID',
      render: (p: ITHandoffPacket) => (
        <span className="font-mono text-xs text-arc-500">{p.id.slice(0, 12)}…</span>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      render: (p: ITHandoffPacket) => {
        const summary = p.packet_json.summary as { change_title?: string } | undefined;
        return <span className="font-medium text-arc-900">{summary?.change_title ?? p.risk_edit_id}</span>;
      },
    },
    {
      key: 'module',
      header: 'Module',
      render: (p: ITHandoffPacket) => {
        const summary = p.packet_json.summary as { target_module?: string } | undefined;
        return <span className="font-mono text-xs text-arc-500">{summary?.target_module ?? p.version_id}</span>;
      },
    },
    {
      key: 'author',
      header: 'Risk Author',
      render: (p: ITHandoffPacket) => (
        <span className="text-xs text-arc-200">{userMap[p.risk_author_id] ?? p.risk_author_id}</span>
      ),
    },
    {
      key: 'approver',
      header: 'QA Approver',
      render: (p: ITHandoffPacket) => (
        <span className="text-xs text-arc-200">{userMap[p.qa_approver_id] ?? p.qa_approver_id}</span>
      ),
    },
    {
      key: 'sent_at',
      header: 'Sent At',
      render: (p: ITHandoffPacket) => (
        <span className="text-xs text-arc-200">{fmt(p.sent_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p: ITHandoffPacket) => (
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelected(p); }}>
          View
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={<Breadcrumb items={[{ label: 'IT Handoff Log' }]} />}
          actions={
            <span className="px-2.5 py-1 rounded-full bg-arc-50 border border-arc-200 text-xs font-semibold text-arc-500">
              {packets.length} packet{packets.length !== 1 ? 's' : ''}
            </span>
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-arc-900">IT Handoff Log</h1>
              <p className="text-sm text-arc-200 mt-0.5">
                Approved changes packaged and handed off to the IT team for deployment to the live risk engine.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-24 text-arc-200 text-sm">Loading…</div>
            ) : (
              <div className="rounded-xl border border-arc-200 overflow-hidden bg-white">
                <DataTable
                  columns={columns}
                  rows={packets}
                  getRowKey={(p) => p.id}
                  onRowClick={setSelected}
                  emptyMessage="No handoff packets have been generated yet."
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <PacketDrawer packet={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
