import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Send, ChevronUp, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useRepository } from '@/data/RepositoryProvider';
import { useEngineModules } from '@/hooks/useEngineModules';
import { useCreateRiskEdit } from '@/hooks/useRiskEdits';
import { useRiskEdits } from '@/hooks/useRiskEdits';
import { consultOnEdit } from '@/integrations/editConsultant';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Button } from '@/components/ui/Button';
import type { OverviewChatThread, OverviewChatMessage, EngineModule } from '@/types';

function formatTimeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DraftPreviewCard({
  msg,
  modules,
  alreadyCreated,
  onCreate,
  onRefine,
  creating,
}: {
  msg: OverviewChatMessage;
  modules: EngineModule[];
  alreadyCreated: boolean;
  onCreate: () => void;
  onRefine: () => void;
  creating: boolean;
}) {
  const module = modules.find((m) => m.id === msg.suggested_module_id);
  return (
    <div className="flex gap-2">
      <div className="shrink-0 mt-0.5">
        <div className="w-7 h-7 rounded-full bg-forest-500 flex items-center justify-center text-white text-[10px] font-semibold">
          AI
        </div>
      </div>
      <div className="flex-1 rounded-xl border border-forest-200 bg-forest-50/60 p-4 max-w-[80%]">
        <p className="text-xs font-semibold text-forest-700 uppercase tracking-wide mb-2">
          Draft preview
        </p>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs text-arc-500">Title</span>
            <p className="font-medium text-arc-900">{msg.suggested_title}</p>
          </div>
          <div>
            <span className="text-xs text-arc-500">Module</span>
            <p className="font-mono text-xs text-arc-900">
              {module?.module_name ?? msg.suggested_module_id ?? 'Unknown module'}
            </p>
          </div>
          <div>
            <span className="text-xs text-arc-500">Brief</span>
            <p className="text-arc-700 leading-relaxed text-xs">{msg.suggested_brief}</p>
          </div>
        </div>
        {alreadyCreated ? (
          <p className="mt-3 text-xs font-medium text-forest-700">Draft already created from this thread.</p>
        ) : (
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={onCreate} loading={creating}>Create draft</Button>
            <Button size="sm" variant="secondary" onClick={onRefine} disabled={creating}>Refine</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  userName,
  userSeed,
}: {
  msg: OverviewChatMessage;
  userName: string;
  userSeed: string;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="shrink-0 mt-0.5">
        {isUser ? (
          <UserAvatar seed={userSeed} name={userName} size="sm" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-forest-500 flex items-center justify-center text-white text-[10px] font-semibold">
            AI
          </div>
        )}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-arc-900 text-white'
            : 'bg-arc-100 text-arc-900'
        }`}
      >
        {msg.content.split('**').map((part, i) =>
          i % 2 === 1 ? (
            <strong key={i}>{part}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </div>
    </div>
  );
}

export function OverviewChat() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const repo = useRepository();
  const qc   = useQueryClient();
  const { data: modules = [] } = useEngineModules();
  const { data: allEdits = [] } = useRiskEdits();
  const createEdit = useCreateRiskEdit();

  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { data: threads = [] } = useQuery({
    queryKey: ['arc', 'overview_chat_threads', currentUser?.id],
    queryFn:  () => (currentUser ? repo.overviewChatThreads.listForUser(currentUser.id) : Promise.resolve([])),
    enabled:  !!currentUser,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['arc', 'overview_chat_messages', threadId],
    queryFn:  () => (threadId ? repo.overviewChatMessages.listForThread(threadId) : Promise.resolve([])),
    enabled:  !!threadId,
  });

  // Auto-scroll the messages container to its own bottom — directly setting
  // scrollTop keeps the scroll local. scrollIntoView would walk up the ancestor
  // tree and scroll the page itself when the container is already at-bottom.
  useEffect(() => {
    if (!expanded) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, expanded, sending]);

  async function handleSend() {
    if (!currentUser || !draft.trim() || sending) return;
    const input = draft.trim();
    setDraft('');
    setSending(true);

    try {
      // Ensure a thread exists.
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const now = new Date().toISOString();
        const thread = await repo.overviewChatThreads.create({
          created_by: currentUser.id,
          updated_at: now,
        } as Omit<OverviewChatThread, 'id' | 'created_at'>);
        activeThreadId = thread.id;
        setThreadId(activeThreadId);
        qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_threads', currentUser.id] });
      }

      // Append user message.
      await repo.overviewChatMessages.create({
        thread_id: activeThreadId,
        role:      'user',
        content:   input,
      } as Omit<OverviewChatMessage, 'id' | 'created_at'>);
      qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_messages', activeThreadId] });

      // Build conversation snapshot for the consultant (user message included).
      const prior = await repo.overviewChatMessages.listForThread(activeThreadId);
      const resp = await consultOnEdit({
        conversation: prior,
        modules,
        userInput: input,
      });

      // Append assistant message.
      await repo.overviewChatMessages.create({
        thread_id:            activeThreadId,
        role:                 'assistant',
        content:              resp.reply,
        suggested_module_id:  resp.suggested_module_id,
        suggested_title:      resp.suggested_title,
        suggested_brief:      resp.suggested_brief,
      } as Omit<OverviewChatMessage, 'id' | 'created_at'>);

      // Bump thread's updated_at so history is freshest-first.
      await repo.overviewChatThreads.update(activeThreadId, {
        updated_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_messages', activeThreadId] });
      qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_messages', 'all'] });
      qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_threads', currentUser.id] });
    } finally {
      setSending(false);
    }
  }

  function loadThread(t: OverviewChatThread) {
    setThreadId(t.id);
    setHistoryOpen(false);
    setExpanded(true);
  }

  function startNewThread() {
    setThreadId(null);
    setHistoryOpen(false);
    setExpanded(true);
    setDraft('');
  }

  // ── Thread labels: resulting edit title, else first user message snippet ──
  // We need first-user-message lookups across past threads. Fetch all
  // overview chat messages once and build a map. Cheap at demo scale.
  const { data: allMessages = [] } = useQuery({
    queryKey: ['arc', 'overview_chat_messages', 'all'],
    queryFn:  () => repo.overviewChatMessages.list(),
  });

  const firstUserByThread = useMemo(() => {
    const map: Record<string, string> = {};
    const sorted = [...allMessages].sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const m of sorted) {
      if (m.role !== 'user') continue;
      if (map[m.thread_id]) continue;
      map[m.thread_id] = m.content;
    }
    return map;
  }, [allMessages]);

  function threadLabel(t: OverviewChatThread): string {
    if (t.resulting_risk_edit_id) {
      const edit = allEdits.find((e) => e.id === t.resulting_risk_edit_id);
      if (edit) return `✓ ${edit.title}`;
    }
    const snippet = firstUserByThread[t.id];
    if (snippet) {
      return snippet.length > 40 ? snippet.slice(0, 40) + '…' : snippet;
    }
    return `Thread · ${formatTimeShort(t.updated_at)}`;
  }

  // ── Active thread + preview-card state ──────────────────────────────────────
  const activeThread = threads.find((t) => t.id === threadId) ?? null;
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  const lastIsPreview =
    !!lastAssistant?.suggested_title &&
    !!lastAssistant?.suggested_brief &&
    !!lastAssistant?.suggested_module_id;

  async function handleCreateDraft() {
    if (!currentUser || !activeThread || !lastAssistant || !lastIsPreview) return;
    setCreating(true);
    try {
      const now = new Date().toISOString();
      const edit = await createEdit.mutateAsync({
        title:                  lastAssistant.suggested_title!,
        natural_language_brief: lastAssistant.suggested_brief!,
        target_module_id:       lastAssistant.suggested_module_id!,
        current_stage:          'draft',
        created_by:             currentUser.id,
        updated_at:             now,
      });

      await repo.overviewChatThreads.update(activeThread.id, {
        resulting_risk_edit_id: edit.id,
        updated_at:             now,
      });
      await repo.auditLog.append({
        actor_id:     currentUser.id,
        action:       'risk_edit.created_via_chat',
        entity_type:  'risk_edit',
        entity_id:    edit.id,
        payload_json: {
          thread_id: activeThread.id,
          module_id: lastAssistant.suggested_module_id,
          title:     lastAssistant.suggested_title,
        },
      });
      qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_threads', currentUser.id] });
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edits'] });

      // Reset the chatbox to compact for the next session, then navigate.
      setExpanded(false);
      navigate(`/workspace/draft-queue?edit=${edit.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleRefine() {
    if (!activeThread) return;
    // Append an assistant message inviting refinement. The next user message
    // will go back through consultOnEdit and produce a fresh proposal.
    await repo.overviewChatMessages.create({
      thread_id: activeThread.id,
      role:      'assistant',
      content:   'Tell me what to change about the proposal.',
    } as Omit<OverviewChatMessage, 'id' | 'created_at'>);
    await repo.overviewChatThreads.update(activeThread.id, {
      updated_at: new Date().toISOString(),
    });
    qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_messages', activeThread.id] });
    qc.invalidateQueries({ queryKey: ['arc', 'overview_chat_messages', 'all'] });
  }

  if (!currentUser) return null;

  // ── Compact (collapsed) ─────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div className="rounded-xl border border-arc-200 bg-white shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-arc-900 leading-tight">
              Start a new risk edit
            </h3>
            <p className="text-xs text-arc-500 mt-0.5 leading-relaxed">
              Tell me what you&apos;d like to change — I&apos;ll figure out the module and draft the brief with you.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2.5 bg-arc-100 hover:bg-arc-200 transition-colors rounded-lg px-3 py-2.5 text-left"
        >
          <MessageSquarePlus className="w-4 h-4 text-arc-500 shrink-0" />
          <span className="text-sm text-arc-500 flex-1">
            What would you like to edit today?
          </span>
          <span className="inline-flex items-center justify-center h-7 px-3 rounded-full bg-forest-600 text-white text-xs font-medium">
            Send
          </span>
        </button>
        {threads.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-arc-500">
            <History className="w-3 h-3" />
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setHistoryOpen(true);
              }}
              className="font-medium hover:text-arc-700 transition-colors"
            >
              History ({threads.length})
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Expanded (full chat) ────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-arc-200 bg-white shadow-sm flex flex-col transition-all duration-200" style={{ minHeight: '450px' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-arc-200">
        <div>
          <h3 className="text-sm font-semibold text-arc-900">Start a new risk edit</h3>
          <p className="text-[11px] text-arc-500">
            {threadId ? 'Conversation in progress' : 'New conversation'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="p-1.5 rounded-md hover:bg-arc-100 text-arc-500 hover:text-arc-700 transition-colors"
              aria-label="History"
            >
              <History className="w-4 h-4" />
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 max-h-72 overflow-y-auto bg-white border border-arc-200 rounded-lg shadow-lg z-10">
                <div className="px-3 py-2 border-b border-arc-200 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-arc-500 uppercase tracking-wide">Past threads</span>
                  <button
                    type="button"
                    onClick={startNewThread}
                    className="text-[11px] font-medium text-forest-600 hover:text-forest-700"
                  >
                    + New
                  </button>
                </div>
                {threads.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-arc-500 italic">No past threads yet.</p>
                ) : (
                  <ul>
                    {threads.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => loadThread(t)}
                          className={`w-full text-left px-3 py-2 hover:bg-arc-100 transition-colors ${
                            t.id === threadId ? 'bg-arc-100' : ''
                          }`}
                        >
                          <p className="text-xs font-medium text-arc-900 truncate">{threadLabel(t)}</p>
                          <p className="text-[10px] text-arc-500 mt-0.5">{new Date(t.updated_at).toLocaleString()}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="p-1.5 rounded-md hover:bg-arc-100 text-arc-500 hover:text-arc-700 transition-colors"
            aria-label="Collapse"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm text-arc-700 mb-1">Tell me what you&apos;d like to change.</p>
              <p className="text-xs text-arc-500 leading-relaxed">
                For example: &ldquo;I want to tighten the credit utilization cap&rdquo; or &ldquo;Adjust the leverage rules for SME customers.&rdquo;
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => {
            // Render preview card in place of the bubble when the message has
            // a full proposal AND it is the latest assistant message AND no
            // draft has been created yet from this thread.
            const isPreviewable =
              m.role === 'assistant' &&
              !!m.suggested_title &&
              !!m.suggested_brief &&
              !!m.suggested_module_id;
            const isLatestPreviewable =
              isPreviewable && lastAssistant?.id === m.id && lastIsPreview;

            if (isLatestPreviewable) {
              return (
                <DraftPreviewCard
                  key={m.id}
                  msg={m}
                  modules={modules}
                  alreadyCreated={!!activeThread?.resulting_risk_edit_id}
                  onCreate={handleCreateDraft}
                  onRefine={handleRefine}
                  creating={creating}
                />
              );
            }
            return (
              <MessageBubble
                key={m.id}
                msg={m}
                userName={currentUser.name}
                userSeed={currentUser.avatar_seed}
              />
            );
          })
        )}
        {sending && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-forest-500 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">AI</div>
            <div className="bg-arc-100 rounded-lg px-3 py-2 text-sm text-arc-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-arc-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-arc-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-arc-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-arc-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What would you like to edit today?"
            disabled={sending}
            className="flex-1 rounded-lg border border-arc-200 bg-arc-100 px-3 py-2 text-sm focus:outline-none focus:border-forest-500 focus:bg-white transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:bg-arc-300 transition-colors"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
