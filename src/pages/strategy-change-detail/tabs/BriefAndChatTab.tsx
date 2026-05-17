import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useEngineModule } from '@/hooks/useEngineModules';
import { useRiskEditVersions, useCreateVersion } from '@/hooks/useRiskEdits';
import { proposeSqlEdit } from '@/integrations/llm';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useQueryClient } from '@tanstack/react-query';
import type { RiskEdit, ChatMessage } from '@/types';

interface BriefAndChatTabProps {
  change: RiskEdit;
}

function MessageBubble({ msg, userSeed, userName }: { msg: ChatMessage; userSeed?: string; userName?: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {isUser ? (
        <UserAvatar seed={userSeed ?? 'U'} name={userName} size="sm" className="mt-0.5 shrink-0" />
      ) : (
        <div className="w-6 h-6 mt-0.5 shrink-0 bg-arc-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">AI</span>
        </div>
      )}

      <div className={`max-w-[80%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        <div
          className={`px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-arc-500 text-white rounded-tr-sm'
              : 'bg-white border border-arc-200 text-arc-900 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>

        {/* Proposed SQL block */}
        {msg.proposed_sql && (
          <div className="w-full bg-arc-900 rounded-xl overflow-hidden border border-arc-700">
            <div className="flex items-center justify-between px-4 py-2 border-b border-arc-700">
              <span className="text-xs font-medium text-arc-200">Proposed SQL change</span>
              {msg.diff_summary && (
                <span className="text-xs text-arc-200 italic">{msg.diff_summary}</span>
              )}
            </div>
            <pre className="px-4 py-3 text-xs font-mono text-arc-100 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {msg.proposed_sql}
            </pre>
          </div>
        )}

        <span className="text-xs text-arc-200">
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export function BriefAndChatTab({ change }: BriefAndChatTabProps) {
  const { currentUser } = useAuth();
  const { data: module } = useEngineModule(change.target_module_id);
  const { data: versions = [] } = useRiskEditVersions(change.id);
  const createVersion = useCreateVersion();
  const qc = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Seed chat with the brief as context
    return [{
      id: 'brief-context',
      role: 'assistant',
      content: `I've loaded the **${module?.module_name ?? 'module'}** SQL and I'm ready to help.\n\nYour brief:\n\n*"${change.natural_language_brief}"*\n\nShall I propose a SQL change based on this brief, or would you like to refine it first?`,
      created_at: change.created_at,
    }];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProposedSql, setPendingProposedSql] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Re-initialise greeting when module loads
  useEffect(() => {
    if (module && messages[0]?.id === 'brief-context') {
      setMessages([{
        id: 'brief-context',
        role: 'assistant',
        content: `I've loaded **${module.module_name}** (${module.current_sql_code.split('\n').length} lines) and I'm ready to help.\n\nYour brief:\n\n*"${change.natural_language_brief}"*\n\nShall I propose a SQL change based on this brief, or would you like to refine it first?`,
        created_at: change.created_at,
      }]);
    }
  }, [module?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const latestVersion = versions[0];
  const currentSql = latestVersion?.sql_after ?? module?.current_sql_code ?? '';

  async function handleSend() {
    if (!input.trim() || isLoading || !module) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await proposeSqlEdit({
        conversation: [...messages, userMsg],
        moduleSql: currentSql,
        moduleContext: module.description,
      });

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: response.reply,
        proposed_sql:  response.proposed_sql,
        diff_summary:  response.diff_summary,
        rationale:     response.rationale,
        created_at:    new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (response.proposed_sql) setPendingProposedSql(response.proposed_sql);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleConfirmChanges() {
    if (!pendingProposedSql || !currentUser || !module) return;
    setIsConfirming(true);

    try {
      const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;
      await createVersion.mutateAsync({
        risk_edit_id: change.id,
        version_number:     nextVersionNumber,
        sql_before:         currentSql,
        sql_after:          pendingProposedSql,
        diff_summary:       messages.filter((m) => m.role === 'assistant' && m.diff_summary).pop()?.diff_summary ?? 'AI-proposed change',
        ai_rationale:       messages.filter((m) => m.role === 'assistant' && m.rationale).pop()?.rationale ?? '',
        author_id:          currentUser.id,
        source:             'ai_proposal',
      });

      const confirmMsg: ChatMessage = {
        id: `msg-${Date.now()}-confirm`,
        role: 'assistant',
        content: `Changes saved as version ${nextVersionNumber}. You can review the SQL in the **SQL Editor** tab and send for UAT when ready.`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
      setPendingProposedSql(null);
      qc.invalidateQueries({ queryKey: ['aegis', 'strategy_change_versions', change.id] });
    } finally {
      setIsConfirming(false);
    }
  }

  const canEdit = change.current_stage === 'draft';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brief banner */}
      <div className="px-6 py-3 border-b border-arc-200 bg-arc-50 shrink-0">
        <p className="text-xs font-medium text-arc-500 mb-0.5">Natural Language Brief</p>
        <p className="text-sm text-arc-900 leading-relaxed">{change.natural_language_brief}</p>
      </div>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            userSeed={currentUser?.avatar_seed}
            userName={currentUser?.name}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-6 h-6 bg-arc-500 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div className="bg-white border border-arc-200 rounded-xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 150, 300].map((delay) => (
                  <div
                    key={delay}
                    className="w-1.5 h-1.5 bg-arc-300 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Confirm changes gate */}
      {pendingProposedSql && canEdit && (
        <div className="px-6 py-3 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between gap-4 shrink-0">
          <p className="text-sm text-emerald-700 font-medium">
            AI has proposed SQL changes. Confirm to save as a new version.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPendingProposedSql(null)}>
              Discard
            </Button>
            <Button size="sm" loading={isConfirming} onClick={handleConfirmChanges}>
              Confirm & Save Changes
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      {canEdit && (
        <div className="px-6 py-4 border-t border-arc-200 bg-white shrink-0">
          <div className="flex gap-3 items-end">
            <Textarea
              ref={inputRef}
              rows={2}
              placeholder="Ask the AI to propose, refine, or clarify the SQL change… (Shift+Enter for newline)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1 resize-none"
            />
            <Button
              size="md"
              onClick={handleSend}
              disabled={!input.trim() || isLoading || !module}
              loading={isLoading}
            >
              Send
            </Button>
          </div>
          <p className="text-xs text-arc-200 mt-1.5">
            Phase 1 — AI responses are mocked. Phase 2 will connect to the real LLM provider.
          </p>
        </div>
      )}

      {!canEdit && (
        <div className="px-6 py-3 border-t border-arc-200 bg-zinc-50 shrink-0">
          <p className="text-sm text-zinc-500 text-center">
            This change is in <strong>{change.current_stage.replace(/_/g, ' ')}</strong> — editing is locked.
          </p>
        </div>
      )}
    </div>
  );
}
