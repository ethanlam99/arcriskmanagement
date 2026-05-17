import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRiskEdits } from '@/hooks/useRiskEdits';
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
import { CreateRiskEditModal } from './CreateRiskEditModal';
import type { RiskEdit, RiskEditStage } from '@/types';

const STAGE_OPTIONS: { value: '' | RiskEditStage; label: string }[] = [
  { value: '',               label: 'All stages'      },
  { value: 'draft',          label: 'Draft'           },
  { value: 'ready_for_uat',  label: 'Ready for UAT'   },
  { value: 'uat_in_progress',label: 'UAT Running'     },
  { value: 'qa_review',      label: 'QA Review'       },
  { value: 'approved',       label: 'Approved'        },
  { value: 'sent_to_it',     label: 'Sent to IT'      },
  { value: 'live',           label: 'Live'            },
  { value: 'rejected',       label: 'Rejected'        },
];

function AuthorCell({ userId }: { userId: string }) {
  const repo = useRepository();
  const { data: user } = useQuery({
    queryKey: ['arc', 'users', userId],
    queryFn: () => repo.users.get(userId),
  });
  if (!user) return <span className="text-arc-200 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <UserAvatar seed={user.avatar_seed} name={user.name} size="sm" />
      <span className="text-sm text-arc-900">{user.name}</span>
    </div>
  );
}

function ModuleCell({ moduleId }: { moduleId: string }) {
  const repo = useRepository();
  const { data: mod } = useQuery({
    queryKey: ['arc', 'engine_modules', moduleId],
    queryFn: () => repo.engineModules.get(moduleId),
  });
  return (
    <span className="font-mono text-xs text-arc-500">
      {mod?.module_name ?? moduleId}
    </span>
  );
}

export function RiskEditsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { data: modules = [] } = useEngineModules();

  const [stageFilter,  setStageFilter]  = useState<'' | RiskEditStage>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);

  const { data: edits = [], isLoading } = useRiskEdits();

  const filtered = edits.filter((e) => {
    if (stageFilter  && e.current_stage    !== stageFilter)  return false;
    if (moduleFilter && e.target_module_id !== moduleFilter) return false;
    return true;
  });

  const canCreate = role === 'risk_analyst' || role === 'risk_lead' || role === 'admin';

  const columns = [
    {
      key: 'id_display',
      header: 'ID',
      render: (e: RiskEdit) => (
        <span className="font-mono text-xs text-arc-500">{e.edit_id_display}</span>
      ),
      className: 'w-32',
    },
    {
      key: 'title',
      header: 'Title',
      render: (e: RiskEdit) => (
        <span className="font-medium text-arc-900">{e.title}</span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (e: RiskEdit) => <StageBadge stage={e.current_stage} />,
      className: 'w-36',
    },
    {
      key: 'module',
      header: 'Module',
      render: (e: RiskEdit) => <ModuleCell moduleId={e.target_module_id} />,
      className: 'w-48',
    },
    {
      key: 'author',
      header: 'Author',
      render: (e: RiskEdit) => <AuthorCell userId={e.created_by} />,
      className: 'w-44',
    },
    {
      key: 'created',
      header: 'Created',
      render: (e: RiskEdit) => (
        <span className="text-xs text-arc-200 font-mono">
          {new Date(e.created_at).toLocaleDateString()}
        </span>
      ),
      className: 'w-28',
    },
  ];

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={<Breadcrumb items={[{ label: 'Risk Edits' }]} />}
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                + New Edit
              </Button>
            ) : undefined
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-arc-900">Risk Edits</h1>
              <p className="text-sm text-arc-200 mt-0.5">
                All in-flight and completed risk engine edits.
              </p>
            </div>

            <div className="flex gap-3 mb-4">
              <Select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as '' | RiskEditStage)}
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

            <div className="bg-white rounded-xl border border-arc-200 overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-arc-200 text-sm">Loading…</div>
              ) : (
                <DataTable
                  columns={columns}
                  rows={filtered}
                  getRowKey={(e) => e.id}
                  onRowClick={(e) => navigate(`/risk-edits/${e.id}`)}
                  emptyMessage="No risk edits match the current filters."
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateRiskEditModal onClose={() => setShowCreate(false)} />
      )}
    </>
  );
}
