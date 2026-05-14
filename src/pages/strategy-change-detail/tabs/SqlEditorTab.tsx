import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useAuth } from '@/auth/AuthProvider';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useStrategyChangeVersions, useCreateVersion } from '@/hooks/useStrategyChanges';
import { proposeSqlEdit } from '@/integrations/llm';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useQueryClient } from '@tanstack/react-query';
import type { StrategyChange, ChatMessage } from '@/types';

interface SqlEditorTabProps {
  change: StrategyChange;
}

function MiniChatMessage({ msg, userSeed }: { msg: ChatMessage; userSeed?: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {isUser ? (
        <UserAvatar seed={userSeed ?? 'U'} size="sm" className="shrink-0 mt-0.5" />
      ) : (
        <div className="w-6 h-6 shrink-0 mt-0.5 bg-aegis-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">AI</span>
        </div>
      )}
      <div className={`max-w-[85%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-aegis-500 text-white rounded-tr-sm'
              : 'bg-white border border-aegis-200 text-aegis-900 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
        {msg.diff_summary && (
          <p className="text-xs text-aegis-200 italic px-1">{msg.diff_summary}</p>
        )}
      </div>
    </div>
  );
}

export function SqlEditorTab({ change }: SqlEditorTabProps) {
  const { currentUser } = useAuth();
  const { data: module } = useEngineModule(change.target_module_id);
  const { data: versions = [] } = useStrategyChangeVersions(change.id);
  const createVersion = useCreateVersion();
  const qc = useQueryClient();

  const latestVersion = versions[0];
  const baseSQL = latestVersion?.sql_after ?? module?.current_sql_code ?? '';

  const [editorSQL, setEditorSQL]       = useState(baseSQL);
  const [messages, setMessages]         = useState<ChatMessage[]>([{
    id: 'sql-greeting',
    role: 'assistant',
    content: 'SQL Editor active. Ask me to refine the proposed change, or edit the SQL directly — I\'ll track both.',
    created_at: new Date().toISOString(),
  }]);
  const [chatInput, setChatInput]       = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [pendingSql, setPendingSql]     = useState<string | null>(null);
  const [isSaving, setIsSaving]         = useState(false);
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync editor when versions or module loads
  useEffect(() => {
    const sql = versions[0]?.sql_after ?? module?.current_sql_code ?? '';
    setEditorSQL(sql);
  }, [module?.id, versions[0]?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const canEdit = change.current_stage === 'draft';

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value || !canEdit) return;
    setEditorSQL(value);
    setHasManualEdits(true);
  }, [canEdit]);

  async function handleChatSend() {
    if (!chatInput.trim() || isLoading || !module) return;

    const userMsg: ChatMessage = {
      id: `sql-msg-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsLoading(true);

    try {
      const response = await proposeSqlEdit({
        conversation: [...messages, userMsg],
        moduleSql: editorSQL,
        moduleContext: module.description,
      });

      const aiMsg: ChatMessage = {
        id: `sql-msg-${Date.now()}-ai`,
        role: 'assistant',
        content: response.reply,
        proposed_sql: response.proposed_sql,
        diff_summary: response.diff_summary,
        rationale:    response.rationale,
        created_at:   new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (response.proposed_sql) {
        setEditorSQL(response.proposed_sql);
        setPendingSql(response.proposed_sql);
        setHasManualEdits(false);
      }
    } finally {
      setIsLoading(false);
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

      await createVersion.mutateAsync({
        strategy_change_id: change.id,
        version_number:     nextVersionNumber,
        sql_before:         baseSQL,
        sql_after:          editorSQL,
        diff_summary:       hasManualEdits
          ? 'Manual SQL edit'
          : messages.filter((m) => m.role === 'assistant' && m.diff_summary).pop()?.diff_summary ?? 'SQL change',
        ai_rationale:       messages.filter((m) => m.role === 'assistant' && m.rationale).pop()?.rationale ?? '',
        author_id:          currentUser.id,
        source,
      });

      const confirmMsg: ChatMessage = {
        id: `sql-msg-${Date.now()}-saved`,
        role: 'assistant',
        content: `Version ${nextVersionNumber} saved (${source === 'human_edit' ? 'manual edit' : 'AI proposal'}). Ready to send for UAT.`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
      setPendingSql(null);
      setHasManualEdits(false);
      qc.invalidateQueries({ queryKey: ['aegis', 'strategy_change_versions', change.id] });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Monaco editor — left pane */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Editor toolbar */}
        <div className="h-10 shrink-0 bg-aegis-900 border-b border-aegis-700 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-aegis-200">
              {module?.module_name ?? '…'}.sql
            </span>
            {latestVersion && (
              <span className="text-xs text-aegis-200 font-mono">
                · v{latestVersion.version_number}
              </span>
            )}
            {(hasManualEdits || pendingSql) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="text-xs text-aegis-200 hover:text-white transition-colors"
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

        {/* Version history sidebar overlay */}
        {showVersions && (
          <div className="absolute right-80 top-0 bottom-0 w-64 bg-white border-l border-aegis-200 z-10 overflow-y-auto">
            <div className="px-4 py-3 border-b border-aegis-200">
              <p className="text-xs font-semibold text-aegis-900">Version history</p>
            </div>
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => { setEditorSQL(v.sql_after); setShowVersions(false); }}
                className="w-full text-left px-4 py-3 border-b border-aegis-200 hover:bg-aegis-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold text-aegis-900">v{v.version_number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${v.source === 'ai_proposal' ? 'bg-aegis-50 text-aegis-500' : 'bg-amber-50 text-amber-700'}`}>
                    {v.source === 'ai_proposal' ? 'AI' : 'Human'}
                  </span>
                </div>
                <p className="text-xs text-aegis-200 truncate">{v.diff_summary}</p>
                <p className="text-xs text-aegis-200 mt-0.5 font-mono">
                  {new Date(v.created_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Monaco */}
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

      {/* AI chat panel — right pane */}
      <div className="w-80 shrink-0 border-l border-aegis-200 flex flex-col bg-aegis-50">
        {/* Chat header */}
        <div className="h-10 shrink-0 px-4 flex items-center border-b border-aegis-200 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-aegis-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <span className="text-xs font-semibold text-aegis-900">AI Assistant</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {messages.map((msg) => (
            <MiniChatMessage key={msg.id} msg={msg} userSeed={currentUser?.avatar_seed} />
          ))}

          {isLoading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 bg-aegis-500 rounded-full flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div className="bg-white border border-aegis-200 rounded-xl rounded-tl-sm px-3 py-2">
                <div className="flex gap-1 items-center h-4">
                  {[0, 150, 300].map((d) => (
                    <div key={d} className="w-1.5 h-1.5 bg-aegis-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Chat input */}
        {canEdit && (
          <div className="p-3 border-t border-aegis-200 bg-white flex flex-col gap-2">
            <Textarea
              rows={3}
              placeholder="Refine the SQL change… (Enter to send)"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              disabled={isLoading}
              className="text-xs resize-none"
            />
            <Button size="sm" onClick={handleChatSend} disabled={!chatInput.trim() || isLoading} className="w-full">
              Send
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
