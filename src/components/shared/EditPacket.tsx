import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// v0.4.3: the standardised format an edit is packaged into when the analyst confirms
// it. Assembled from the latest version + the risk edit, it is the single artifact
// the UAT stage (and later QA/IT) review. Presentational only — callers supply data.
export interface EditPacketData {
  editIdDisplay: string;
  title: string;
  brief: string;
  moduleName: string;
  nodeSource: string;
  compiledSql: string;
  diffSummary?: string;
  rationale?: string;
  authorName?: string;
  affectedSegments?: string[];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-arc-500 dark:text-arc-dark-500 mb-0.5">
        {label}
      </p>
      <div className="text-sm text-arc-900 dark:text-arc-dark-700">{children}</div>
    </div>
  );
}

export function EditPacket({ data }: { data: EditPacketData }) {
  const { t } = useTranslation();
  const [codeView, setCodeView] = useState<'node' | 'sql'>('node');

  const code = codeView === 'node' ? data.nodeSource : data.compiledSql;

  return (
    <div className="rounded-xl border border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-arc-200 dark:border-arc-dark-200 bg-arc-50 dark:bg-arc-dark-50 flex items-center gap-2">
        <span className="font-mono text-xs text-arc-700 dark:text-arc-dark-700">{data.editIdDisplay}</span>
        <span className="text-sm font-medium text-arc-900 dark:text-arc-dark-700 truncate">{data.title}</span>
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-forest-700 dark:text-forest-dark-700">
          {t('packet.label')}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('packet.module')}>
            <span className="font-mono text-xs">{data.moduleName}</span>
          </Field>
          {data.authorName && (
            <Field label={t('packet.author')}>
              <span className="text-xs">{data.authorName}</span>
            </Field>
          )}
        </div>

        <Field label={t('packet.brief')}>
          <p className="text-xs leading-relaxed text-arc-700 dark:text-arc-dark-700">{data.brief}</p>
        </Field>

        {data.diffSummary && (
          <Field label={t('packet.change')}>
            <p className="text-xs leading-relaxed text-arc-700 dark:text-arc-dark-700">{data.diffSummary}</p>
          </Field>
        )}

        {data.rationale && (
          <Field label={t('packet.rationale')}>
            <p className="text-xs leading-relaxed text-arc-700 dark:text-arc-dark-700">{data.rationale}</p>
          </Field>
        )}

        {data.affectedSegments && data.affectedSegments.length > 0 && (
          <Field label={t('packet.affected_segments')}>
            <div className="flex flex-wrap gap-1.5">
              {data.affectedSegments.map((seg) => (
                <span
                  key={seg}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-arc-100 dark:bg-arc-dark-200 text-arc-700 dark:text-arc-dark-700"
                >
                  {seg}
                </span>
              ))}
            </div>
          </Field>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-arc-500 dark:text-arc-dark-500">
              {t('packet.code')}
            </p>
            <div className="inline-flex rounded-md border border-arc-200 dark:border-arc-dark-200 p-0.5 bg-arc-50 dark:bg-arc-dark-50">
              <button
                type="button"
                onClick={() => setCodeView('node')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  codeView === 'node'
                    ? 'bg-white dark:bg-arc-dark-200 text-arc-900 dark:text-arc-dark-700 shadow-sm'
                    : 'text-arc-500 dark:text-arc-dark-500 hover:text-arc-900 dark:hover:text-arc-dark-700'
                }`}
              >
                {t('packet.code_node')}
              </button>
              <button
                type="button"
                onClick={() => setCodeView('sql')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  codeView === 'sql'
                    ? 'bg-white dark:bg-arc-dark-200 text-arc-900 dark:text-arc-dark-700 shadow-sm'
                    : 'text-arc-500 dark:text-arc-dark-500 hover:text-arc-900 dark:hover:text-arc-dark-700'
                }`}
              >
                {t('packet.code_sql')}
              </button>
            </div>
          </div>
          <pre className="text-[11px] leading-relaxed font-mono text-arc-100 bg-arc-900 dark:bg-arc-dark-900 rounded-lg p-3 overflow-auto max-h-56">
            {code}
          </pre>
          {codeView === 'sql' && (
            <p className="mt-1 text-[11px] text-arc-400 dark:text-arc-dark-500">{t('packet.sql_note')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
