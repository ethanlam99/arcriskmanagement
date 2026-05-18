import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { useEngineModules } from '@/hooks/useEngineModules';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { TopBar, Breadcrumb } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { StageBadge } from '@/components/shared/StageBadge';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { CreateRiskEditModal } from './CreateRiskEditModal';
import type { AuditLogEntry, RiskEdit, RiskEditStage, User } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_STAGES: RiskEditStage[] = [
  'draft', 'ready_for_uat', 'uat_in_progress', 'qa_review', 'approved', 'sent_to_it',
];
const ARCHIVED_STAGES: RiskEditStage[] = ['live', 'rejected'];
const TERMINAL_STAGES: ReadonlySet<RiskEditStage> = new Set(['live', 'rejected']);

// Linear happy-path through the pipeline — used by the stage timeline to draw
// greyed segments for stages that haven't been reached yet. Rejected is a
// branch, not part of the linear path; handled separately.
const PIPELINE: RiskEditStage[] = [
  'draft', 'ready_for_uat', 'uat_in_progress', 'qa_review', 'approved', 'sent_to_it', 'live',
];

const STAGE_OPTIONS: { value: '' | RiskEditStage; label: string }[] = [
  { value: '',                label: 'All stages'      },
  { value: 'draft',           label: 'Draft'           },
  { value: 'ready_for_uat',   label: 'Ready for UAT'   },
  { value: 'uat_in_progress', label: 'UAT Running'     },
  { value: 'qa_review',       label: 'QA Review'       },
  { value: 'approved',        label: 'Approved'        },
  { value: 'sent_to_it',      label: 'Sent to IT'      },
  { value: 'live',            label: 'Live'            },
  { value: 'rejected',        label: 'Rejected'        },
];

const STAGE_LABELS: Record<RiskEditStage, string> = {
  draft:           'Draft',
  ready_for_uat:   'Ready for UAT',
  uat_in_progress: 'UAT Running',
  qa_review:       'QA Review',
  approved:        'Approved',
  sent_to_it:      'Sent to IT',
  live:            'Live',
  rejected:        'Rejected',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function workspaceUrl(edit: RiskEdit): string {
  if (edit.current_stage === 'uat_in_progress') return '/workspace/uat';
  if (edit.current_stage === 'qa_review')       return `/workspace/qa?edit=${edit.id}`;
  if (['draft', 'ready_for_uat'].includes(edit.current_stage)) {
    return `/workspace/draft-queue?edit=${edit.id}`;
  }
  return '/workspace/draft-queue';
}

function fmtDateTime(dateStr: string) {
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

/** Coarse relative duration for table cells: "3d 4h" / "2h 15m" / "45m" / "just now". */
function fmtRelative(ms: number): string {
  const clamped = Math.max(0, ms);
  const sec = Math.floor(clamped / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  const days = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr > 0 ? `${days}d ${remHr}h` : `${days}d`;
}

/** Full duration breakdown for timeline tooltips: "2d 6h 15m". */
function fmtDurationLong(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return '<1m';
  const days = Math.floor(totalMin / 1440);
  const hr = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hr   > 0) parts.push(`${hr}h`);
  if (min  > 0) parts.push(`${min}m`);
  return parts.join(' ');
}

function isTerminal(stage: RiskEditStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

// Frozen terminal timestamp uses updated_at as proxy — when an edit transitions
// to live/rejected, updated_at is written at that moment and nothing mutates
// it after. Same proxy already used by UatWorkspacePage's ElapsedTimer.
function terminalAt(edit: RiskEdit): string | null {
  return isTerminal(edit.current_stage) ? edit.updated_at : null;
}

function totalElapsedMs(edit: RiskEdit, nowMs: number): number {
  const created = new Date(edit.created_at).getTime();
  const end = isTerminal(edit.current_stage)
    ? new Date(edit.updated_at).getTime()
    : nowMs;
  return Math.max(0, end - created);
}

function sinceUpdateMs(edit: RiskEdit, nowMs: number): number {
  return Math.max(0, nowMs - new Date(edit.updated_at).getTime());
}

function fmtAction(entry: AuditLogEntry): string {
  const p = entry.payload_json;
  switch (entry.action) {
    case 'risk_edit.stage_transition':
      return `Stage: ${p.from} → ${p.to}`;
    case 'risk_edit_version.created':
      return `Version v${p.version_number} saved (${p.source})`;
    case 'uat_run.triggered':
      return 'UAT run triggered';
    case 'uat_run.completed':
      return `UAT completed — ${p.cases_passed}/${p.cases_total} passed`;
    case 'uat_run.failed':
      return 'UAT run failed';
    case 'packet.proposed':
      return 'Bundled into proposed packet';
    case 'packet.confirmed':
      return 'Packet confirmed → sent to IT';
    case 'packet.rejected':
      return 'Packet rejected — returned to Approved Pool';
    case 'packet.live':
      return 'Marked live';
    default:
      return entry.action;
  }
}

// ── Audit panel ───────────────────────────────────────────────────────────────

function AuditPanel({ editId, userMap }: { editId: string; userMap: Record<string, string> }) {
  const { data: entries = [], isLoading } = useAuditLog({ entity_type: 'risk_edit', entity_id: editId });
  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  if (isLoading) return <p className="text-xs text-arc-200 py-2">Loading…</p>;
  if (sorted.length === 0) return <p className="text-xs text-arc-200 py-2">No audit entries yet.</p>;

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-arc-300 mt-1.5 shrink-0" />
          <span className="text-arc-900 font-medium min-w-0">{fmtAction(entry)}</span>
          <span className="text-arc-200 shrink-0 ml-auto pl-4">
            {userMap[entry.actor_id] ?? entry.actor_id} · {fmtDateTime(entry.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Stage timeline ────────────────────────────────────────────────────────────

interface TimelineSegment {
  stage:   RiskEditStage;
  startMs: number;
  endMs:   number;
}

function buildTimeline(edit: RiskEdit, audit: AuditLogEntry[], nowMs: number): TimelineSegment[] {
  const transitions = audit
    .filter((e) => e.action === 'risk_edit.stage_transition')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let stage: RiskEditStage = 'draft';
  let segStart = new Date(edit.created_at).getTime();
  const segments: TimelineSegment[] = [];

  for (const t of transitions) {
    const tMs = new Date(t.created_at).getTime();
    const to = t.payload_json.to as RiskEditStage | undefined;
    segments.push({ stage, startMs: segStart, endMs: tMs });
    if (!to) break;
    stage = to;
    segStart = tMs;
  }

  // Final open segment extends to terminal timestamp or to now (live-ticking)
  const endMs = isTerminal(edit.current_stage)
    ? new Date(edit.updated_at).getTime()
    : nowMs;
  segments.push({ stage, startMs: segStart, endMs });

  return segments;
}

function stageBarColor(stage: RiskEditStage): string {
  switch (stage) {
    case 'draft':           return 'bg-zinc-400';
    case 'ready_for_uat':   return 'bg-amber-300';
    case 'uat_in_progress': return 'bg-amber-400';
    case 'qa_review':       return 'bg-amber-500';
    case 'approved':        return 'bg-emerald-400';
    case 'sent_to_it':      return 'bg-emerald-500';
    case 'live':            return 'bg-emerald-600';
    case 'rejected':        return 'bg-rose-400';
  }
}

function StageTimeline({ edit, nowMs }: { edit: RiskEdit; nowMs: number }) {
  const { data: audit = [], isLoading } = useAuditLog({ entity_type: 'risk_edit', entity_id: edit.id });

  if (isLoading) return <p className="text-xs text-arc-200">Loading timeline…</p>;

  const segments = buildTimeline(edit, audit, nowMs);
  const reachedStages = new Set(segments.map((s) => s.stage));
  const totalReachedMs = segments.reduce((acc, s) => acc + Math.max(1, s.endMs - s.startMs), 0);

  const lastReachedStage = segments[segments.length - 1].stage;
  const lastReachedIdx = PIPELINE.indexOf(lastReachedStage);
  // No greyed remainder for rejected branch (terminal off-path)
  const future: RiskEditStage[] = (lastReachedIdx >= 0 && !isTerminal(edit.current_stage))
    ? PIPELINE.slice(lastReachedIdx + 1)
    : [];

  // Reached segments share 70% of the bar width by duration; greyed future
  // stages share the remaining 30% equally. This keeps the very-short early
  // segments still visible without the future stages dominating the bar.
  const futureShare  = future.length > 0 ? 0.3 : 0;
  const reachedShare = 1 - futureShare;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3 rounded-md overflow-hidden border border-arc-200 bg-arc-50">
        {segments.map((seg, idx) => {
          const dur = Math.max(1, seg.endMs - seg.startMs);
          const widthPct = (dur / totalReachedMs) * reachedShare * 100;
          return (
            <div
              key={`${seg.stage}-${idx}`}
              className={`${stageBarColor(seg.stage)} h-full`}
              style={{ width: `${widthPct}%` }}
              title={`${STAGE_LABELS[seg.stage]}: ${fmtDurationLong(dur)}`}
            />
          );
        })}
        {future.map((stage) => (
          <div
            key={`future-${stage}`}
            className="bg-arc-100/60 h-full border-l border-white"
            style={{ width: `${(futureShare / future.length) * 100}%` }}
            title={`${STAGE_LABELS[stage]}: not yet reached`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {PIPELINE.map((stage) => {
          const reached = reachedStages.has(stage);
          return (
            <span
              key={stage}
              className={`flex items-center gap-1.5 ${reached ? 'text-arc-700' : 'text-arc-200'}`}
            >
              <span className={`w-2 h-2 rounded-sm ${reached ? stageBarColor(stage) : 'bg-arc-100'}`} />
              {STAGE_LABELS[stage]}
            </span>
          );
        })}
        {edit.current_stage === 'rejected' && (
          <span className="flex items-center gap-1.5 text-rose-600">
            <span className="w-2 h-2 rounded-sm bg-rose-400" />
            Rejected
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cells ─────────────────────────────────────────────────────────────────────

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
  return <span className="font-mono text-xs text-arc-500">{mod?.module_name ?? moduleId}</span>;
}

// ── Expandable row ────────────────────────────────────────────────────────────

interface RowProps {
  edit:        RiskEdit;
  userMap:     Record<string, string>;
  nowMs:       number;
  showFinalTs: boolean;
}

function EditRow({ edit, userMap, nowMs, showFinalTs }: RowProps) {
  const [open, setOpen] = useState(false);
  const colSpan = showFinalTs ? 9 : 8;
  const tAt = terminalAt(edit);

  return (
    <>
      <tr
        className="border-b border-arc-200 hover:bg-arc-50 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-3 w-32">
          <span className="font-mono text-xs text-arc-500">{edit.edit_id_display}</span>
        </td>
        <td className="px-4 py-3">
          <span className="font-medium text-arc-900">{edit.title}</span>
        </td>
        <td className="px-4 py-3 w-36">
          <StageBadge stage={edit.current_stage} />
        </td>
        <td className="px-4 py-3 w-40">
          <ModuleCell moduleId={edit.target_module_id} />
        </td>
        <td className="px-4 py-3 w-44">
          <AuthorCell userId={edit.created_by} />
        </td>
        <td className="px-4 py-3 w-28">
          <span className="text-xs text-arc-500 font-mono whitespace-nowrap">
            {fmtRelative(sinceUpdateMs(edit, nowMs))}
          </span>
        </td>
        <td className="px-4 py-3 w-28">
          <span className="text-xs text-arc-500 font-mono whitespace-nowrap">
            {fmtRelative(totalElapsedMs(edit, nowMs))}
          </span>
        </td>
        {showFinalTs && (
          <td className="px-4 py-3 w-32">
            <span className="text-xs text-arc-500 font-mono whitespace-nowrap">
              {tAt ? fmtDate(tAt) : '—'}
            </span>
          </td>
        )}
        <td className="px-4 py-3 w-8 text-arc-300 text-xs text-right">
          {open ? '▲' : '▼'}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-arc-200 bg-arc-50">
          <td colSpan={colSpan} className="px-6 py-4">
            <div className="flex flex-col gap-5">
              <div className="flex gap-8">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-2">Edit brief</p>
                  <p className="text-xs text-arc-900 leading-relaxed line-clamp-3">
                    {edit.natural_language_brief || <span className="text-arc-200 italic">No brief provided.</span>}
                  </p>
                </div>
                <div className="w-px bg-arc-200 shrink-0" />
                <div className="flex-[2] min-w-0">
                  <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-2">Recent Activity</p>
                  <AuditPanel editId={edit.id} userMap={userMap} />
                </div>
                <div className="shrink-0 flex flex-col items-end justify-between">
                  <Link
                    to={workspaceUrl(edit)}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-arc-900 text-white text-xs font-medium hover:bg-arc-700 transition-colors"
                  >
                    Open Workspace →
                  </Link>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-arc-500 uppercase tracking-wide mb-2">Stage timeline</p>
                <StageTimeline edit={edit} nowMs={nowMs} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

type SortKey = 'id' | 'title' | 'stage' | 'module' | 'author' | 'since_update' | 'total_elapsed' | 'final_ts';
type SortDir = 'asc' | 'desc';
interface SortState { key: SortKey; dir: SortDir }

function HeaderCell({
  label, width, sortKey, sort, onSort,
}: {
  label: string;
  width?: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors ${width ?? ''} ${active ? 'text-arc-700' : 'text-arc-500 hover:text-arc-700'}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-arc-300">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

function sortEdits(
  edits: RiskEdit[],
  sort: SortState,
  userMap: Record<string, string>,
  moduleNames: Record<string, string>,
  nowMs: number,
): RiskEdit[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...edits].sort((a, b) => {
    let av: string | number = '';
    let bv: string | number = '';
    switch (sort.key) {
      case 'id':            av = a.edit_id_display;                         bv = b.edit_id_display;                         break;
      case 'title':         av = a.title.toLowerCase();                     bv = b.title.toLowerCase();                     break;
      case 'stage':         av = a.current_stage;                           bv = b.current_stage;                           break;
      case 'module':        av = (moduleNames[a.target_module_id] ?? '');   bv = (moduleNames[b.target_module_id] ?? '');   break;
      case 'author':        av = (userMap[a.created_by] ?? '').toLowerCase(); bv = (userMap[b.created_by] ?? '').toLowerCase(); break;
      case 'since_update':  av = sinceUpdateMs(a, nowMs);                   bv = sinceUpdateMs(b, nowMs);                   break;
      case 'total_elapsed': av = totalElapsedMs(a, nowMs);                  bv = totalElapsedMs(b, nowMs);                  break;
      case 'final_ts': {
        const at = terminalAt(a); const bt = terminalAt(b);
        av = at ? new Date(at).getTime() : 0;
        bv = bt ? new Date(bt).getTime() : 0;
        break;
      }
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return  1 * sign;
    return 0;
  });
}

// ── Table ─────────────────────────────────────────────────────────────────────

function EditsTable({
  edits, userMap, nowMs, sort, onSort, showFinalTs,
}: {
  edits:       RiskEdit[];
  userMap:     Record<string, string>;
  nowMs:       number;
  sort:        SortState;
  onSort:      (k: SortKey) => void;
  showFinalTs: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-arc-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-arc-200 bg-arc-50">
            <HeaderCell label="ID"            width="w-32" sortKey="id"            sort={sort} onSort={onSort} />
            <HeaderCell label="Title"                       sortKey="title"         sort={sort} onSort={onSort} />
            <HeaderCell label="Stage"         width="w-36" sortKey="stage"         sort={sort} onSort={onSort} />
            <HeaderCell label="Module"        width="w-40" sortKey="module"        sort={sort} onSort={onSort} />
            <HeaderCell label="Author"        width="w-44" sortKey="author"        sort={sort} onSort={onSort} />
            <HeaderCell label="Since update"  width="w-28" sortKey="since_update"  sort={sort} onSort={onSort} />
            <HeaderCell label="Total elapsed" width="w-28" sortKey="total_elapsed" sort={sort} onSort={onSort} />
            {showFinalTs && (
              <HeaderCell label="Final stage" width="w-32" sortKey="final_ts" sort={sort} onSort={onSort} />
            )}
            <th className="px-4 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {edits.map((e) => (
            <EditRow key={e.id} edit={e} userMap={userMap} nowMs={nowMs} showFinalTs={showFinalTs} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function RiskEditsPage() {
  const { role } = useAuth();
  const repo = useRepository();
  const { data: modules = [] } = useEngineModules();

  const [search,       setSearch]       = useState('');
  const [stageFilter,  setStageFilter]  = useState<'' | RiskEditStage>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [showCreate,   setShowCreate]   = useState(false);
  const [sort,         setSort]         = useState<SortState>({ key: 'since_update', dir: 'asc' });

  const { data: rawEdits = [], isLoading } = useRiskEdits();

  const { data: users = [] } = useQuery({
    queryKey: ['arc', 'users', 'batch', 'all'],
    queryFn: () => repo.users.list(),
  });

  const userMap = useMemo<Record<string, string>>(
    () => Object.fromEntries(users.map((u: User) => [u.id, u.name])),
    [users],
  );
  const moduleNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(modules.map((m) => [m.id, m.module_name])),
    [modules],
  );

  // Live-tick "now" so since-update / total-elapsed cells and the current
  // stage's timeline segment grow in real time. 1s cadence is enough — the
  // page rerenders only this state, sort/filter memos remain stable unless
  // the relevant sort key depends on time.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawEdits.filter((e) => {
      if (stageFilter  && e.current_stage    !== stageFilter)  return false;
      if (moduleFilter && e.target_module_id !== moduleFilter) return false;
      if (authorFilter && e.created_by       !== authorFilter) return false;
      if (q) {
        const hay = `${e.title} ${e.natural_language_brief ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rawEdits, search, stageFilter, moduleFilter, authorFilter]);

  const active   = useMemo(() => filtered.filter((e) => ACTIVE_STAGES.includes(e.current_stage)),   [filtered]);
  const archived = useMemo(() => filtered.filter((e) => ARCHIVED_STAGES.includes(e.current_stage)), [filtered]);

  const sortedActive   = useMemo(
    () => sortEdits(active, sort, userMap, moduleNames, nowMs),
    [active, sort, userMap, moduleNames, nowMs],
  );
  const sortedArchived = useMemo(
    () => sortEdits(archived, sort, userMap, moduleNames, nowMs),
    [archived, sort, userMap, moduleNames, nowMs],
  );

  const authorOptions = useMemo(() => {
    const ids = new Set(rawEdits.map((e) => e.created_by));
    return users
      .filter((u: User) => ids.has(u.id))
      .sort((a: User, b: User) => a.name.localeCompare(b.name));
  }, [rawEdits, users]);

  function onSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  const canCreate = role === 'risk_analyst' || role === 'risk_lead' || role === 'admin';

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <TopBar
          breadcrumb={<Breadcrumb items={[{ label: 'Risk Edits' }]} />}
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>+ New Edit</Button>
            ) : undefined
          }
        />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-5">
              <h1 className="text-xl font-semibold text-arc-900">Risk Edits</h1>
              <p className="text-sm text-arc-200 mt-0.5">
                Complete history of every risk engine edit — active work above, terminal stages below.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 mb-5 items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or brief…"
                className="w-64"
              />
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
              <Select
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                className="w-48"
              >
                <option value="">All authors</option>
                {authorOptions.map((u: User) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>

            {isLoading ? (
              <div className="bg-white rounded-xl border border-arc-200 shadow-sm py-16 text-center text-arc-200 text-sm">
                Loading…
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <section>
                  <div className="flex items-baseline justify-between mb-2">
                    <h2 className="text-sm font-semibold text-arc-900">
                      Active Edits{' '}
                      <span className="text-arc-200 font-normal">({sortedActive.length})</span>
                    </h2>
                    <p className="text-xs text-arc-200">Pre-terminal stages</p>
                  </div>
                  {sortedActive.length === 0 ? (
                    <div className="bg-white rounded-xl border border-arc-200 shadow-sm py-10 text-center text-arc-200 text-sm">
                      No active edits match the current filters.
                    </div>
                  ) : (
                    <EditsTable
                      edits={sortedActive}
                      userMap={userMap}
                      nowMs={nowMs}
                      sort={sort}
                      onSort={onSort}
                      showFinalTs={false}
                    />
                  )}
                </section>

                <section>
                  <div className="flex items-baseline justify-between mb-2">
                    <h2 className="text-sm font-semibold text-arc-900">
                      Live &amp; Archived Edits{' '}
                      <span className="text-arc-200 font-normal">({sortedArchived.length})</span>
                    </h2>
                    <p className="text-xs text-arc-200">Terminal stages: live, rejected</p>
                  </div>
                  {sortedArchived.length === 0 ? (
                    <div className="bg-white rounded-xl border border-arc-200 shadow-sm py-10 text-center text-arc-200 text-sm">
                      No live or archived edits match the current filters.
                    </div>
                  ) : (
                    <EditsTable
                      edits={sortedArchived}
                      userMap={userMap}
                      nowMs={nowMs}
                      sort={sort}
                      onSort={onSort}
                      showFinalTs={true}
                    />
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && <CreateRiskEditModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
