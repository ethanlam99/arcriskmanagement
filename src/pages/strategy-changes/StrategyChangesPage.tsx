import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStrategyChanges } from '@/hooks/useStrategyChanges';
import { useEngineModules } from '@/hooks/useEngineModules';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable } from '@/components/ui/DataTable';
import { StageBadge } from '@/components/shared/StageBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { CreateStrategyChangeModal } from './CreateStrategyChangeModal';
import type { StrategyChange, StrategyChangeStage } from '@/types';

const STAGE_OPTIONS: { value: '' | StrategyChangeStage; label: string }[] = [
  { value: '', label: 'All stages' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready_for_uat', label: 'Ready for UAT' },
  { value: 'uat_in_progress', label: 'UAT in Progress' },
  { value: 'qa_review', label: 'QA Review' },
  { value: 'approved_for_it', label: 'Approved for IT' },
  { value: 'sent_to_it', label: 'Sent to IT' },
  { value: 'rejected', label: 'Rejected' },
];

function AuthorCell({ userId }: { userId: string }) {
  const repo = useRepository();
  const { data: user } = useQuery({
    queryKey: ['aegis', 'users', userId],
    queryFn: () => repo.users.get(userId),
  });
  if (!user) return <span className="text-aegis-200 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <UserAvatar seed={user.avatar_seed} name={user.name} size="sm" />
      <span className="text-sm text-aegis-900">{user.name}</span>
    </div>
  );
}

function ModuleCell({ moduleId }: { moduleId: string }) {
  const repo = useRepository();
  const { data: mod } = useQuery({
    queryKey: ['aegis', 'engine_modules', moduleId],
    queryFn: () => repo.engineModules.get(moduleId),
  });
  return (
    <span className="font-mono text-xs text-aegis-500">
      {mod?.module_name ?? moduleId}
    </span>
  );
}

export function StrategyChangesPage() {
  const { role } = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: modules = [] } = useEngineModules();

  const [stageFilter,  setStageFilter]  = useState<'' | StrategyChangeStage>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);

  const defaultModuleId = searchParams.get('module') ?? undefined;

  const { data: changes = [], isLoading } = useStrategyChanges();

  const filtered = changes.filter((c) => {
    if (stageFilter  && c.current_stage     !== stageFilter)  return false;
    if (moduleFilter && c.target_module_id  !== moduleFilter) return false;
    return true;
  });

  const canCreate = role === 'risk_analyst' || role === 'admin';

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (c: StrategyChange) => (
        <span className="font-medium text-aegis-900">{c.title}</span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (c: StrategyChange) => <StageBadge stage={c.current_stage} />,
      className: 'w-36',
    },
    {
      key: 'module',
      header: 'Module',
      render: (c: StrategyChange) => <ModuleCell moduleId={c.target_module_id} />,
      className: 'w-48',
    },
    {
      key: 'author',
      header: 'Author',
      render: (c: StrategyChange) => <AuthorCell userId={c.created_by} />,
      className: 'w-44',
    },
    {
      key: 'created',
      header: 'Created',
      render: (c: StrategyChange) => (
        <span className="text-xs text-aegis-200 font-mono">
          {new Date(c.created_at).toLocaleDateString()}
        </span>
      ),
      className: 'w-28',
    },
  ];

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={<Breadcrumb items={[{ label: 'Strategy Changes' }]} />}
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                + New Change
              </Button>
            ) : undefined
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-aegis-900">Strategy Changes</h1>
              <p className="text-sm text-aegis-200 mt-0.5">
                All in-flight and completed risk engine edits.
              </p>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-4">
              <Select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as '' | StrategyChangeStage)}
                className="w-44"
              >
                {STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <Select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-52"
              >
                <option value="">All modules</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.module_name}</option>
                ))}
              </Select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-aegis-200 overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-aegis-200 text-sm">Loading…</div>
              ) : (
                <DataTable
                  columns={columns}
                  rows={filtered}
                  getRowKey={(c) => c.id}
                  onRowClick={(c) => navigate(`/strategy-changes/${c.id}`)}
                  emptyMessage="No strategy changes match the current filters."
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateStrategyChangeModal
          defaultModuleId={defaultModuleId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
