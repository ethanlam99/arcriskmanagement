import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { CreateRiskEditModal } from '@/pages/risk-edits/CreateRiskEditModal';

export function EngineModuleDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const repo = useRepository();

  const { data: module, isLoading } = useEngineModule(id ?? '');
  const { data: updatedByUser } = useQuery({
    queryKey: ['arc', 'users', module?.updated_by],
    queryFn: () => repo.users.get(module!.updated_by),
    enabled: !!module?.updated_by,
  });

  const [showModal, setShowModal] = useState(false);

  const canCreate = role === 'risk_analyst' || role === 'risk_lead' || role === 'admin';

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-arc-500 dark:text-arc-dark-500 text-sm">{t('common.loading')}</div>
    );
  }

  if (!module) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-arc-900 dark:text-arc-dark-700 font-medium">{t('engine_modules.module_not_found')}</p>
        <Button variant="secondary" size="sm" onClick={() => navigate('/overview')}>
          {t('engine_modules.back_to_overview')}
        </Button>
      </div>
    );
  }

  const lineCount = module.current_sql_code.split('\n').length;

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={
            <Breadcrumb
              items={[
                { label: t('engine_modules.title'), to: '/overview' },
                { label: `${module.module_name}.sql` },
              ]}
            />
          }
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setShowModal(true)}>
                {t('engine_modules.new_edit_on_module')}
              </Button>
            ) : undefined
          }
        />

        <div className="px-6 py-4 border-b border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 shrink-0">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-arc-900 dark:text-arc-dark-700 font-mono">
                {module.module_name}.sql
              </h1>
              <p className="text-sm text-arc-500 dark:text-arc-dark-500 mt-0.5 leading-relaxed">{module.description}</p>
            </div>
            <div className="shrink-0 flex items-center gap-6 text-xs text-arc-500 dark:text-arc-dark-500">
              <div className="text-right">
                <p className="text-arc-500 dark:text-arc-dark-500 font-medium">{lineCount}</p>
                <p>{t('engine_modules.lines')}</p>
              </div>
              <div className="text-right">
                <p className="text-arc-500 dark:text-arc-dark-500 font-medium">
                  {new Date(module.updated_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p>{t('engine_modules.last_updated')}</p>
              </div>
              {updatedByUser && (
                <div className="text-right">
                  <p className="text-arc-500 dark:text-arc-dark-500 font-medium">{updatedByUser.name}</p>
                  <p>{t('engine_modules.updated_by')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-arc-900 dark:bg-arc-dark-900">
          <Editor
            height="100%"
            language="sql"
            value={module.current_sql_code}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'JetBrains Mono, Menlo, monospace',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              theme: 'vs-dark',
              renderLineHighlight: 'gutter',
              padding: { top: 12, bottom: 12 },
            }}
            theme="vs-dark"
          />
        </div>
      </div>

      {showModal && (
        <CreateRiskEditModal
          defaultModuleId={module.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
