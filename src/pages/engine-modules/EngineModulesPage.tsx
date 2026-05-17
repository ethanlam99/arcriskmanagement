import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEngineModules } from '@/hooks/useEngineModules';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CreateRiskEditModal } from '@/pages/risk-edits/CreateRiskEditModal';
import type { EngineModule } from '@/types';

interface ModuleCardProps {
  module: EngineModule;
  onCreateChange: () => void;
  onViewDetail: () => void;
}

function ModuleCard({ module, onCreateChange, onViewDetail }: ModuleCardProps) {
  const repo = useRepository();
  const { data: updatedByUser } = useQuery({
    queryKey: ['arc', 'users', module.updated_by],
    queryFn: () => repo.users.get(module.updated_by),
  });

  const lineCount = module.current_sql_code.split('\n').length;
  const preview   = module.current_sql_code.split('\n').slice(0, 3).join('\n');

  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      {/* Clickable card body → navigates to detail */}
      <button
        className="flex flex-col text-left flex-1 cursor-pointer group"
        onClick={onViewDetail}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-arc-200 w-full group-hover:bg-arc-50 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-arc-900 font-mono truncate">
                {module.module_name}
              </h3>
              <p className="text-xs text-arc-200 mt-0.5 line-clamp-2">{module.description}</p>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-arc-50 text-arc-500 border border-arc-200">
              {lineCount} lines
            </span>
          </div>
        </div>

        {/* SQL preview */}
        <div className="flex-1 bg-arc-900 px-4 py-3 overflow-hidden w-full">
          <pre className="text-xs text-arc-100 font-mono leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {preview}
          </pre>
        </div>
      </button>

      {/* Footer — not part of the card-click target */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-arc-200">
        <p className="text-xs text-arc-200">
          Updated {new Date(module.updated_at).toLocaleDateString()}
          {updatedByUser ? ` · ${updatedByUser.name}` : ''}
        </p>
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onCreateChange(); }}>
          New change
        </Button>
      </div>
    </Card>
  );
}

export function EngineModulesPage() {
  const { data: modules = [], isLoading } = useEngineModules();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [creatingForModuleId, setCreatingForModuleId] = useState<string | null>(null);

  const canCreate = role === 'risk_analyst' || role === 'admin';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        breadcrumb={<Breadcrumb items={[{ label: 'Engine Modules' }]} />}
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-arc-900">Engine Modules</h1>
            <p className="text-sm text-arc-200 mt-0.5">
              Browse the SQL modules that make up the risk engine. Click a module to view its code, or start a change from the card footer.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-arc-200 text-sm">
              Loading modules…
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {modules.map((mod) => (
                <ModuleCard
                  key={mod.id}
                  module={mod}
                  onViewDetail={() => navigate(`/engine-modules/${mod.id}`)}
                  onCreateChange={canCreate ? () => setCreatingForModuleId(mod.id) : () => {}}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {creatingForModuleId && (
        <CreateRiskEditModal
          defaultModuleId={creatingForModuleId}
          onClose={() => setCreatingForModuleId(null)}
        />
      )}
    </div>
  );
}
