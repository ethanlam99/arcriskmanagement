import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useAuth } from '@/auth/AuthProvider';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useRiskEditVersions, useCreateVersion } from '@/hooks/useRiskEdits';
import { useChatMessages, useAppendChatMessage } from '@/hooks/useChatMessages';
import { useLatestRejectedReview } from '@/hooks/useUatRuns';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { proposeSqlEdit } from '@/integrations/llm';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { UserAvatar } from '@/components/shared/UserAvatar';
import type { RiskEdit, ChatMessage } from '@/types';

interface DraftQueueTabProps {
  change: RiskEdit;
}

// ── Brief panel ───────────────────────────────────────────────────────────────

function BriefPanel({
  change,
  rejectedReview,
  rejectorName,
}: {
  change: RiskEdit;
  rejectedReview: { annotations_json: Record<string, unknown>; decided_at: string } | null;
  rejectorName?: string;
}) {
  const [expanded, setExpanded] = useState(change.current_stage === 'draft');

  return (
    <div className="shrink-0 border-b border-arc-200">
      {rejectedReview && change.current_stage === 'draft' && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex items-start gap-2">
          <svg className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-rose-700">
              QA returned this change{rejectorName ? ` — ${rejectorName}` : ''},{' '}
              {new Date(rejectedReview.decided_at).toLocaleDateString()}
            </p>
            {rejectedReview.annotations_json?.['rejection_notes'] ? (
              <p className="text-xs text-rose-600 mt-0.5 leading-relaxed">
                {String(rejectedReview.annotations_json['rejection_notes'])}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <button
        className="w-full px-5 py-3 flex items-center justify-between bg-arc-100 hover:bg-arc-100 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-xs font-semibold text-arc-500 uppercase tracking-wide">
          Edit brief
        </span>
        <svg
          className={`w-4 h-4 text-arc-200 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 py-3 bg-arc-100 border-t border-arc-200">
          <p className="text-sm text-arc-900 leading-relaxed">{change.natural_language_brief}</p>
        </div>
      )}
    </div>
  );
}

// ── Chat message bubble ───────────────────────────────────────────────────────

function MiniChatMessage({ msg, userSeed }: { msg: ChatMessage; userSeed?: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {isUser ? (
        <UserAvatar seed={userSeed ?? 'U'} size="sm" className="shrink-0 mt-0.5" />
      ) : (
        <div className="w-6 h-6 shrink-0 mt-0.5 bg-arc-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">AI</span>
        </div>
      )}
      <div className={`max-w-[85%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-arc-500 text-white rounded-tr-sm'
              : 'bg-white border border-arc-200 text-arc-900 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
        {msg.diff_summary && (
          <p className="text-xs text-arc-200 italic px-1">{msg.diff_summary}</p>
        )}
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function DraftQueueTab({ change }: DraftQueueTabProps) {
  const { currentUser, role } = useAuth();
  const repo = useRepository();
  const { data: module } = useEngineModule(change.target_module_id);
  const { data: versions = [] } = useRiskEditVersions(change.id);
  const createVersion = useCreateVersion();
  const appendMessage = useAppendChatMessage();
  const qc = useQueryClient();

  const { data: persistedMessages = [], isLoading: messagesLoading } = useChatMessages(change.id);
  const { data: rejectedReview } = useLatestRejectedReview(change.id);
  const { data: rejectorUser } = useQuery({
    queryKey: ['arc', 'users', rejectedReview?.reviewer_id],
    queryFn: () => repo.users.get(rejectedReview!.reviewer_id),
    enabled: !!rejectedReview?.reviewer_id,
  });

  const latestVersion = versions[0];
  const baseSQL = latestVersion?.sql_after ?? module?.current_sql_code ?? '';

  const [editorSQL, setEditorSQL] = useState(baseSQL);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sql = versions[0]?.sql_after ?? module?.current_sql_code ?? '';
    setEditorSQL(sql);
  }, [module?.id, versions[0]?.id]);

  const uiMessages: ChatMessage[] = messagesLoading
    ? []
    : persistedMessages.length > 0
    ? persistedMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        proposed_sql: m.proposed_sql ?? undefined,
        diff_summary: m.diff_summary ?? undefined,
        rationale: m.rationale ?? undefined,
        created_at: m.created_at,
      }))
    : [
        {
          id: 'greeting',
          role: 'assistant',
          content: `I've loaded **${module?.module_name ?? 'the module'}** (${
            module ? module.current_sql_code.split('\n').length : '…'
          } lines) and I'm ready to help.\n\nYour brief:\n\n*"${
            change.natural_language_brief
          }"*\n\nShall I propose a SQL change based on this brief, or would you like to refine it first?`,
          created_at: change.created_at,
        },
      ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [uiMessages.length, isAiLoading]);

  const canEdit =
    change.current_stage === 'draft' &&
    (role === 'risk_analyst' || role === 'risk_lead' || role === 'admin');

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!value || !canEdit) return;
      setEditorSQL(value);
      setHasManualEdits(true);
    },
    [canEdit]
  );

  async function handleChatSend() {
    if (!chatInput.trim() || isAiLoading || !module || !currentUser) return;

    const userContent = chatInput.trim();
    setChatInput('');
    setIsAiLoading(true);

    await appendMessage.mutateAsync({
      risk_edit_id: change.id,
      role: 'user',
      content: userContent,
      author_id: currentUser.id,
      created_at: new Date().toISOString(),
    });

    try {
      const currentUiMessages = uiMessages.concat({
        id: 'pending-user',
        role: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
      });

      const response = await proposeSqlEdit({
        conversation: currentUiMessages,
        moduleSql: editorSQL,
        moduleContext: module.description,
      });

      await appendMessage.mutateAsync({
        risk_edit_id: change.id,
        role: 'assistant',
        content: response.reply,
        proposed_sql: response.proposed_sql ?? undefined,
        diff_summary: response.diff_summary ?? undefined,
        rationale: response.rationale ?? undefined,
        author_id: null,
        created_at: new Date().toISOString(),
      });

      if (response.proposed_sql) {
        setEditorSQL(response.proposed_sql);
        setPendingSql(response.proposed_sql);
        setHasManualEdits(false);
      }
    } finally {
      setIsAiLoading(false);
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }

  async function handleSaveVersion() {
    if (!currentUser || !module) return;
    setIsSaving(true);

    try {
      const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;
      const source = hasManualEdits ? 'human_edit' : 'ai_proposal';
      const lastAiMsg = [...uiMessages].reverse().find((m) => m.role === 'assistant' && m.diff_summary);

      await createVersion.mutateAsync({
        risk_edit_id:   change.id,
        version_number: nextVersionNumber,
        sql_before:     baseSQL,
        sql_after:      editorSQL,
        diff_summary:   hasManualEdits ? 'Manual SQL edit' : (lastAiMsg?.diff_summary ?? 'SQL change'),
        ai_rationale:   hasManualEdits ? '' : (lastAiMsg?.rationale ?? ''),
        author_id:      currentUser.id,
        source,
      });

      const confirmContent = `Version ${nextVersionNumber} saved (${source === 'human_edit' ? 'manual edit' : 'AI proposal'}). Ready to send for UAT.`;
      await appendMessage.mutateAsync({
        risk_edit_id: change.id,
        role: 'assistant',
        content: confirmContent,
        author_id: null,
        created_at: new Date().toISOString(),
      });

      setPendingSql(null);
      setHasManualEdits(false);
      qc.invalidateQueries({ queryKey: ['arc', 'risk_edit_versions', change.id] });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BriefPanel
        change={change}
        rejectedReview={rejectedReview ?? null}
        rejectorName={rejectorUser?.name}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Monaco editor */}
        <div className="flex-1 min-w-0 flex flex-col relative">
          <div className="h-10 shrink-0 bg-arc-900 border-b border-arc-700 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-arc-200">
                {module?.module_name ?? '…'}.sql
              </span>
              {latestVersion && (
                <span className="text-xs text-arc-200 font-mono">· v{latestVersion.version_number}</span>
              )}
              {(hasManualEdits || pendingSql) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="text-xs text-arc-200 hover:text-white transition-colors"
              >
                {showVersions ? 'Hide history' : 'History'}
              </button>
              {canEdit && (hasManualEdits || pendingSql) && (
                <Button size="sm" loading={isSaving} onClick={handleSaveVersion}>
                  Save version
                </Button>
              )}
            </div>
          </div>

          {showVersions && (
            <div className="absolute right-80 top-10 bottom-0 w-64 bg-white border-l border-arc-200 z-10 overflow-y-auto">
              <div className="px-4 py-3 border-b border-arc-200">
                <p className="text-xs font-semibold text-arc-900">Version history</p>
              </div>
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => { setEditorSQL(v.sql_after); setShowVersions(false); }}
                  className="w-full text-left px-4 py-3 border-b border-arc-200 hover:bg-arc-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-arc-900">v{v.version_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${v.source === 'ai_proposal' ? 'bg-arc-100 text-arc-500' : 'bg-amber-50 text-amber-700'}`}>
                      {v.source === 'ai_proposal' ? 'AI' : 'Human'}
                    </span>
                  </div>
                  <p className="text-xs text-arc-200 truncate">{v.diff_summary}</p>
                  <p className="text-xs text-arc-200 mt-0.5 font-mono">
                    {new Date(v.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language="sql"
              value={editorSQL}
              onChange={handleEditorChange}
              options={{
                readOnly: !canEdit,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                theme: 'vs-dark',
                renderLineHighlight: 'gutter',
                padding: { top: 12, bottom: 12 },
                suggest: { showWords: false },
              }}
              theme="vs-dark"
            />
          </div>
        </div>

        {/* AI chat panel */}
        <div className="w-80 shrink-0 border-l border-arc-200 flex flex-col bg-arc-100">
          <div className="h-10 shrink-0 px-4 flex items-center border-b border-arc-200 bg-white">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-arc-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <span className="text-xs font-semibold text-arc-900">AI Assistant</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8 text-arc-200 text-xs">
                Loading conversation…
              </div>
            ) : (
              uiMessages.map((msg) => (
                <MiniChatMessage key={msg.id} msg={msg} userSeed={currentUser?.avatar_seed} />
              ))
            )}

            {isAiLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-arc-500 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div className="bg-white border border-arc-200 rounded-xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    {[0, 150, 300].map((d) => (
                      <div key={d} className="w-1.5 h-1.5 bg-arc-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {canEdit ? (
            <div className="p-3 border-t border-arc-200 bg-white flex flex-col gap-2">
              <Textarea
                rows={3}
                placeholder="Ask the AI to propose or refine the SQL change… (Enter to send)"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={isAiLoading}
                className="text-xs resize-none"
              />
              <Button
                size="sm"
                onClick={handleChatSend}
                disabled={!chatInput.trim() || isAiLoading || !module}
                loading={isAiLoading}
                className="w-full"
              >
                Send
              </Button>
              <p className="text-xs text-arc-200 text-center">
                Phase 1 — AI responses are mocked.
              </p>
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-arc-200 bg-white">
              <p className="text-xs text-arc-200 text-center">
                Editing locked — stage is{' '}
                <span className="font-medium text-arc-500">
                  {change.current_stage.replace(/_/g, ' ')}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
