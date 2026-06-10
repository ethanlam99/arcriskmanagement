import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useRiskEditVersions, useCreateVersion } from '@/hooks/useRiskEdits';
import { useChatMessages, useAppendChatMessage } from '@/hooks/useChatMessages';
import { useLatestRejectedReview } from '@/hooks/useUatRuns';
import { useRepository } from '@/data/RepositoryProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { proposeEdit } from '@/integrations/llm';
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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(change.current_stage === 'draft');

  return (
    <div className="shrink-0 border-b border-arc-200 dark:border-arc-dark-200">
      {rejectedReview && change.current_stage === 'draft' && (
        <div className="px-5 py-2.5 bg-rose-50 dark:bg-rose-900/40 border-b border-rose-200 dark:border-rose-900/50 flex items-start gap-2">
          <svg className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              {rejectorName
                ? t('workspace.draft_tab.qa_returned_with_name', {
                    name: rejectorName,
                    date: new Date(rejectedReview.decided_at).toLocaleDateString(),
                  })
                : t('workspace.draft_tab.qa_returned')}
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
        className="w-full px-5 py-3 flex items-center justify-between bg-arc-100 dark:bg-arc-dark-100 hover:bg-arc-100 dark:hover:bg-arc-dark-50 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-xs font-semibold text-arc-500 dark:text-arc-dark-500 uppercase tracking-wide">
          {t('workspace.draft_tab.edit_brief')}
        </span>
        <svg
          className={`w-4 h-4 text-arc-500 dark:text-arc-dark-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 py-3 bg-arc-100 dark:bg-arc-dark-100 border-t border-arc-200 dark:border-arc-dark-200">
          <p className="text-sm text-arc-900 dark:text-arc-dark-700 leading-relaxed">{change.natural_language_brief}</p>
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
        <div className="w-6 h-6 shrink-0 mt-0.5 bg-arc-500 dark:bg-arc-dark-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">AI</span>
        </div>
      )}
      <div className={`max-w-[85%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-arc-500 dark:bg-arc-dark-500 text-white rounded-tr-sm'
              : 'bg-white dark:bg-arc-dark-100 border border-arc-200 dark:border-arc-dark-200 text-arc-900 dark:text-arc-dark-700 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
        {msg.diff_summary && (
          <p className="text-xs text-arc-500 dark:text-arc-dark-500 italic px-1">{msg.diff_summary}</p>
        )}
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function DraftQueueTab({ change }: DraftQueueTabProps) {
  const { t } = useTranslation();
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
  // Dual representation (v0.4.3): the analyst authors in Node.js (editorNode); the
  // compiled engine SQL travels alongside as a read-only view + the engine target.
  const baseNode = latestVersion?.node_after ?? module?.current_node_code ?? '';
  const baseSQL  = latestVersion?.sql_after  ?? module?.current_sql_code  ?? '';

  const [editorNode, setEditorNode] = useState(baseNode);
  const [compiledSql, setCompiledSql] = useState(baseSQL);
  const [codeView, setCodeView] = useState<'node' | 'sql'>('node');
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [pendingNode, setPendingNode] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditorNode(versions[0]?.node_after ?? module?.current_node_code ?? '');
    setCompiledSql(versions[0]?.sql_after ?? module?.current_sql_code ?? '');
  }, [module?.id, versions[0]?.id]);

  // Chat bubble content stays English regardless of language — the AI greeting,
  // user messages, AI responses, and save-version confirmations are all
  // conversation content. Chrome around the chat (placeholder, Send button,
  // History toggle, etc.) translates.
  const uiMessages: ChatMessage[] = messagesLoading
    ? []
    : persistedMessages.length > 0
    ? persistedMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        proposed_node: m.proposed_node ?? undefined,
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
            module ? module.current_node_code.split('\n').length : '…'
          } lines of Node.js) and I'm ready to help.\n\nYour brief:\n\n*"${
            change.natural_language_brief
          }"*\n\nShall I propose a Node.js change based on this brief, or would you like to refine it first?`,
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
      if (value === undefined || !canEdit || codeView !== 'node') return;
      setEditorNode(value);
      setHasManualEdits(true);
    },
    [canEdit, codeView]
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

      const response = await proposeEdit({
        conversation: currentUiMessages,
        moduleNode: editorNode,
        moduleSql: compiledSql,
        moduleContext: module.description,
      });

      await appendMessage.mutateAsync({
        risk_edit_id: change.id,
        role: 'assistant',
        content: response.reply,
        proposed_node: response.proposed_node ?? undefined,
        proposed_sql: response.proposed_sql ?? undefined,
        diff_summary: response.diff_summary ?? undefined,
        rationale: response.rationale ?? undefined,
        author_id: null,
        created_at: new Date().toISOString(),
      });

      if (response.proposed_node) {
        setEditorNode(response.proposed_node);
        setPendingNode(response.proposed_node);
        setHasManualEdits(false);
      }
      // The AI emits the compiled engine SQL alongside the Node.js it authored.
      if (response.proposed_sql) {
        setCompiledSql(response.proposed_sql);
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
        node_before:    baseNode,
        node_after:     editorNode,
        sql_before:     baseSQL,
        sql_after:      compiledSql,
        diff_summary:   hasManualEdits ? 'Manual Node.js edit' : (lastAiMsg?.diff_summary ?? 'Node.js change'),
        ai_rationale:   hasManualEdits ? '' : (lastAiMsg?.rationale ?? ''),
        author_id:      currentUser.id,
        source,
      });

      // Confirmation messages live in the conversation thread — stay English.
      const confirmContent = `Version ${nextVersionNumber} saved (${source === 'human_edit' ? 'manual edit' : 'AI proposal'}). Ready to send for UAT.`;
      await appendMessage.mutateAsync({
        risk_edit_id: change.id,
        role: 'assistant',
        content: confirmContent,
        author_id: null,
        created_at: new Date().toISOString(),
      });

      setPendingNode(null);
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
          <div className="h-10 shrink-0 bg-arc-900 dark:bg-arc-dark-900 border-b border-arc-700 dark:border-arc-dark-200 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-arc-200 dark:text-arc-dark-300">
                {module?.module_name ?? '…'}.{codeView === 'node' ? 'js' : 'sql'}
              </span>
              {latestVersion && (
                <span className="text-xs text-arc-200 dark:text-arc-dark-300 font-mono">· v{latestVersion.version_number}</span>
              )}
              {(hasManualEdits || pendingNode) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
              <div className="ml-1 inline-flex rounded-md border border-arc-700 dark:border-arc-dark-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setCodeView('node')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    codeView === 'node' ? 'bg-arc-700 dark:bg-arc-dark-200 text-white' : 'text-arc-200 dark:text-arc-dark-300 hover:text-white'
                  }`}
                >
                  {t('workspace.draft_tab.view_node')}
                </button>
                <button
                  type="button"
                  onClick={() => setCodeView('sql')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    codeView === 'sql' ? 'bg-arc-700 dark:bg-arc-dark-200 text-white' : 'text-arc-200 dark:text-arc-dark-300 hover:text-white'
                  }`}
                >
                  {t('workspace.draft_tab.view_sql')}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {codeView === 'sql' && (
                <span className="text-[11px] text-arc-300 dark:text-arc-dark-500">{t('workspace.draft_tab.sql_readonly')}</span>
              )}
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="text-xs text-arc-200 dark:text-arc-dark-300 hover:text-white transition-colors"
              >
                {showVersions ? t('workspace.draft_tab.hide_history') : t('workspace.draft_tab.history')}
              </button>
              {canEdit && (hasManualEdits || pendingNode) && (
                <Button size="sm" loading={isSaving} onClick={handleSaveVersion}>
                  {t('workspace.draft_tab.save_version')}
                </Button>
              )}
            </div>
          </div>

          {showVersions && (
            <div className="absolute right-80 top-10 bottom-0 w-64 bg-white dark:bg-arc-dark-100 border-l border-arc-200 dark:border-arc-dark-200 z-10 overflow-y-auto">
              <div className="px-4 py-3 border-b border-arc-200 dark:border-arc-dark-200">
                <p className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700">{t('workspace.draft_tab.version_history')}</p>
              </div>
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setEditorNode(v.node_after ?? module?.current_node_code ?? '');
                    setCompiledSql(v.sql_after);
                    setShowVersions(false);
                  }}
                  className="w-full text-left px-4 py-3 border-b border-arc-200 dark:border-arc-dark-200 hover:bg-arc-100 dark:hover:bg-arc-dark-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700">v{v.version_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${v.source === 'ai_proposal' ? 'bg-arc-100 dark:bg-arc-dark-100 text-arc-500 dark:text-arc-dark-500' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                      {v.source === 'ai_proposal' ? t('workspace.draft_tab.ai_label') : t('workspace.draft_tab.human_label')}
                    </span>
                  </div>
                  <p className="text-xs text-arc-500 dark:text-arc-dark-500 truncate">{v.diff_summary}</p>
                  <p className="text-xs text-arc-500 dark:text-arc-dark-500 mt-0.5 font-mono">
                    {new Date(v.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              path={`${module?.module_name ?? 'module'}.${codeView === 'node' ? 'js' : 'sql'}`}
              language={codeView === 'node' ? 'javascript' : 'sql'}
              value={codeView === 'node' ? editorNode : compiledSql}
              onChange={handleEditorChange}
              options={{
                readOnly: !canEdit || codeView === 'sql',
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Menlo, monospace',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                // SQL editor frame is intentionally dark in both light and
                // dark modes (existing UX: code-editor-style chrome). Monaco
                // theme stays vs-dark to match that frame. useTheme is held
                // in scope in case a future polish pass swaps the frame
                // colors and the editor theme together.
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
        <div className="w-80 shrink-0 border-l border-arc-200 dark:border-arc-dark-200 flex flex-col bg-arc-100 dark:bg-arc-dark-100">
          <div className="h-10 shrink-0 px-4 flex items-center border-b border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-arc-500 dark:bg-arc-dark-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <span className="text-xs font-semibold text-arc-900 dark:text-arc-dark-700">{t('workspace.draft_tab.ai_assistant')}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8 text-arc-500 dark:text-arc-dark-500 text-xs">
                {t('workspace.draft_tab.loading_conversation')}
              </div>
            ) : (
              uiMessages.map((msg) => (
                <MiniChatMessage key={msg.id} msg={msg} userSeed={currentUser?.avatar_seed} />
              ))
            )}

            {isAiLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-arc-500 dark:bg-arc-dark-500 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div className="bg-white dark:bg-arc-dark-100 border border-arc-200 dark:border-arc-dark-200 rounded-xl rounded-tl-sm px-3 py-2">
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
            <div className="p-3 border-t border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100 flex flex-col gap-2">
              <Textarea
                rows={3}
                placeholder={t('workspace.draft_tab.chat_placeholder')}
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
                {t('workspace.draft_tab.send')}
              </Button>
              <p className="text-xs text-arc-500 dark:text-arc-dark-500 text-center">
                {t('workspace.draft_tab.ai_mock_note')}
              </p>
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-arc-200 dark:border-arc-dark-200 bg-white dark:bg-arc-dark-100">
              <p className="text-xs text-arc-500 dark:text-arc-dark-500 text-center">
                {t('workspace.draft_tab.editing_locked', {
                  stage: t(`stage.${change.current_stage}`),
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
