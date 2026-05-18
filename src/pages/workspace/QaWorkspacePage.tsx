import { useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useAllUatRuns } from '@/hooks/useUatRuns';
import { StageBadge } from '@/components/shared/StageBadge';
import { QaTab } from './tabs/QaTab';
import type { RiskEdit } from '@/types';

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span className={`text-xs font-medium tabular-nums ${color}`}>
      {value} {label}
    </span>
  );
}

export function QaWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: allEdits = [] } = useRiskEdits();
  const { data: allRuns  = [] } = useAllUatRuns();

  const qaEdits = allEdits
    .filter((e) => e.current_stage === 'qa_review')
    .sort((a, b) => a.edit_id_display.localeCompare(b.edit_id_display));

  function getRunStats(editId: string) {
    const run = allRuns
      .filter((r) => r.risk_edit_id === editId && r.status === 'completed')
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    return run?.ai_report_json?.summary ?? null;
  }

  const selectedId   = searchParams.get('edit') ?? '';
  const selectedEdit = qaEdits.find((e) => e.id === selectedId) ?? null;

  function selectEdit(edit: RiskEdit) {
    setSearchParams({ edit: edit.id }, { replace: true });
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left pane ── */}
      <div className="w-72 shrink-0 border-r border-arc-200 bg-white flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b border-arc-200 bg-arc-100 shrink-0">
          <p className="text-xs font-semibold text-arc-500 uppercase tracking-wider">
            QA Review
            <span className="ml-1.5 font-mono font-normal text-arc-300">({qaEdits.length})</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {qaEdits.length === 0 ? (
            <div className="flex items-center justify-center py-12 flex-col gap-3 text-arc-200 px-3">
              <CheckCircle2 className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
              <p className="text-sm text-center">No edits in QA Review.</p>
            </div>
          ) : (
            qaEdits.map((edit) => {
              const stats     = getRunStats(edit.id);
              const isSelected = edit.id === selectedId;
              return (
                <button
                  key={edit.id}
                  onClick={() => selectEdit(edit)}
                  className={`w-full text-left px-3 py-3 border-b border-arc-200 transition-colors ${
                    isSelected
                      ? 'bg-arc-100 border-l-2 border-l-arc-500'
                      : 'hover:bg-arc-100 border-l-2 border-l-transparent'
                  }`}
                >
                  <p className="text-xs font-medium text-arc-900 leading-snug line-clamp-2 mb-1.5">
                    {edit.title}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-arc-300">{edit.edit_id_display}</span>
                    {stats ? (
                      <div className="flex items-center gap-2">
                        <StatChip value={stats.passed}       label="pass" color="text-emerald-600" />
                        <StatChip value={stats.failed}       label="fail" color="text-rose-600" />
                        <StatChip value={stats.inconclusive} label="inc"  color="text-amber-600" />
                      </div>
                    ) : (
                      <span className="text-xs text-arc-200 italic">No report yet</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right pane ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selectedEdit ? (
          <div className="flex h-full items-center justify-center flex-col gap-3 text-arc-200">
            <CheckCircle2 className="w-12 h-12 text-arc-200" strokeWidth={1.5} />
            <p className="text-sm">Select an edit from the list to review.</p>
          </div>
        ) : (
          <>
            {/* Right pane header */}
            <div className="px-4 py-2.5 border-b border-arc-200 bg-white flex items-center gap-2 shrink-0">
              <span className="font-mono text-xs text-arc-300 shrink-0">{selectedEdit.edit_id_display}</span>
              <span className="text-sm font-medium text-arc-900 truncate flex-1 min-w-0">
                {selectedEdit.title}
              </span>
              <StageBadge stage={selectedEdit.current_stage} />
            </div>

            {/* QaTab fills the rest */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <QaTab change={selectedEdit} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
