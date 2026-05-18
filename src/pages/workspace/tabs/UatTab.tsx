import { useState } from 'react';
import { useLatestUatRun } from '@/hooks/useUatRuns';
import { resolveScreenshotUrls } from '@/integrations/screenshots';
import type { RiskEdit, TestCase, TestCaseStatus } from '@/types';

interface UatTabProps {
  change: RiskEdit;
}

function statusColor(status: TestCaseStatus): string {
  if (status === 'passed')  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed')  return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function statusLabel(status: TestCaseStatus): string {
  if (status === 'passed')  return 'Passed';
  if (status === 'failed')  return 'Failed';
  return 'Inconclusive';
}

function StatCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-arc-200 bg-white px-4 py-3">
      <p className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</p>
      <p className="text-xs text-arc-200 mt-0.5">{label}</p>
    </div>
  );
}

function TestCaseRow({ tc }: { tc: TestCase }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-arc-200 cursor-pointer hover:bg-arc-100 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-2.5 font-mono text-xs text-arc-500">{tc.id}</td>
        <td className="px-4 py-2.5 text-sm text-arc-900">{tc.description}</td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(tc.status)}`}>
            {statusLabel(tc.status)}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${tc.frontend_render_ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${tc.frontend_render_ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {tc.frontend_render_ok ? 'OK' : 'Issue'}
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-arc-200">{expanded ? 'Collapse ▲' : 'Expand ▼'}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-arc-200 bg-arc-100">
          <td colSpan={5} className="px-6 py-4">
            <div className="grid grid-cols-3 gap-4 text-xs">
              {[
                { label: 'Input',    data: tc.input,    cls: 'bg-white border-arc-200 text-arc-900' },
                { label: 'Expected', data: tc.expected,  cls: 'bg-white border-arc-200 text-arc-900' },
                { label: 'Actual',   data: tc.actual,    cls: tc.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-arc-200 text-arc-900' },
              ].map(({ label, data, cls }) => (
                <div key={label}>
                  <p className="font-semibold text-arc-500 mb-1.5">{label}</p>
                  <pre className={`border rounded-lg px-3 py-2 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed ${cls}`}>
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
            {tc.annotation && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">Annotation</p>
                <p className="text-xs text-amber-800 leading-relaxed">{tc.annotation}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ScreenshotGallery({ refs }: { refs: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const urls = resolveScreenshotUrls(refs);

  if (urls.length === 0) return null;

  return (
    <>
      <div>
        <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">
          Frontend Screenshots
        </p>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {urls.map((url, i) => (
            <button
              key={i}
              className="shrink-0 w-40 h-24 rounded-lg border border-arc-200 overflow-hidden hover:border-arc-500 transition-colors bg-arc-900"
              onClick={() => setLightbox(url)}
            >
              <img
                src={url}
                alt={`Screenshot ${i + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }}
              />
            </button>
          ))}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-arc-900/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox} alt="Screenshot" className="rounded-xl max-h-[80vh] object-contain" />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center text-arc-900 hover:bg-arc-100 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function UatTab({ change }: UatTabProps) {
  const { data: run, isLoading } = useLatestUatRun(change.id);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-arc-200 text-sm">Loading…</div>;
  }

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-2 text-arc-200">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">No UAT run found for this change.</p>
      </div>
    );
  }

  if (run.status === 'running') {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3 text-arc-200">
        <div className="w-8 h-8 border-2 border-arc-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-arc-900 font-medium">UAT run in progress…</p>
        <p className="text-xs max-w-xs text-center">The AI is running test cases against the sandbox. This usually takes a few seconds.</p>
      </div>
    );
  }

  if (run.status === 'failed') {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-2">
        <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm font-medium text-rose-600">UAT run failed</p>
        <p className="text-xs text-arc-200">A team lead can re-confirm this change on the Changelog page to retry.</p>
      </div>
    );
  }

  const report = run.ai_report_json;
  if (!report) return null;

  const { summary, test_cases, screenshot_refs } = report;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-5 flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Summary</p>
          <div className="flex gap-3 mb-3">
            <StatCard label="Total cases"  value={summary.total}        colorClass="text-arc-900" />
            <StatCard label="Passed"        value={summary.passed}       colorClass="text-emerald-600" />
            <StatCard label="Failed"        value={summary.failed}       colorClass="text-rose-600" />
            <StatCard label="Inconclusive"  value={summary.inconclusive} colorClass="text-amber-600" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-arc-200 bg-white px-4 py-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-arc-900">
                <span className="font-bold text-emerald-600">{summary.frontend_ok}</span> frontend renders OK
              </span>
            </div>
            <div className="flex-1 rounded-xl border border-arc-200 bg-white px-4 py-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-xs text-arc-900">
                <span className="font-bold text-rose-600">{summary.frontend_not_ok}</span> frontend renders with issues
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-3">Test Cases</p>
          <div className="rounded-xl border border-arc-200 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-arc-200 bg-arc-100">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">ID</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Description</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-arc-500 uppercase tracking-wide">Frontend</th>
                  <th className="px-4 py-2.5 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {test_cases.map((tc) => (
                  <TestCaseRow key={tc.id} tc={tc} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ScreenshotGallery refs={screenshot_refs} />

        <div className="border-t border-arc-200 pt-4 flex items-center gap-6 text-xs text-arc-200">
          <span>Generated {new Date(report.generated_at).toLocaleString()}</span>
          <span>·</span>
          <span className="font-mono">Run ID: {run.id}</span>
        </div>
      </div>
    </div>
  );
}
