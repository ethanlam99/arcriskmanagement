import { useAuditLog } from '@/hooks/useAuditLog';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/shared/UserAvatar';
import type { AuditLogEntry } from '@/types';

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const repo = useRepository();
  const { data: actor } = useQuery({
    queryKey: ['aegis', 'users', entry.actor_id],
    queryFn: () => repo.users.get(entry.actor_id),
  });

  const actionLabel = entry.action
    .replace(/_/g, ' ')
    .replace(/\./g, ' · ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex items-start gap-3 py-3 border-b border-aegis-200 last:border-0">
      {actor ? (
        <UserAvatar seed={actor.avatar_seed} name={actor.name} size="sm" className="mt-0.5 shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-zinc-200 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-aegis-900">
            {actor?.name ?? entry.actor_id}
          </span>
          <span className="text-sm text-aegis-500">{actionLabel}</span>
        </div>
        {Object.keys(entry.payload_json).length > 0 && (
          <p className="text-xs text-aegis-200 mt-0.5 font-mono truncate">
            {JSON.stringify(entry.payload_json)}
          </p>
        )}
      </div>
      <time className="text-xs text-aegis-200 font-mono shrink-0 mt-0.5">
        {new Date(entry.created_at).toLocaleString([], {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </time>
    </div>
  );
}

export function AuditTrailTab({ changeId }: { changeId: string }) {
  const { data: entries = [], isLoading } = useAuditLog({
    entity_id: changeId,
  });

  // Also fetch version events for this change
  const { data: versionEntries = [] } = useAuditLog({
    entity_type: 'strategy_change_version',
  });

  const relevantVersionEntries = versionEntries.filter(
    (e) => (e.payload_json as Record<string, unknown>).strategy_change_id === changeId
  );

  const allEntries = [...entries, ...relevantVersionEntries]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-aegis-200 bg-aegis-50 shrink-0 flex items-center justify-between">
        <p className="text-xs font-medium text-aegis-500">
          {allEntries.length} audit event{allEntries.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-2">
        {isLoading ? (
          <p className="text-sm text-aegis-200 py-8 text-center">Loading…</p>
        ) : allEntries.length === 0 ? (
          <p className="text-sm text-aegis-200 py-8 text-center">No audit events yet.</p>
        ) : (
          allEntries.map((entry) => <AuditRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
