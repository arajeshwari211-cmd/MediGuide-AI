import {
  Loader2,
  MessageSquarePlus,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { getDateLocale } from '../i18n/index.ts';
import { apiRequest } from '../services/api.ts';
import type { ChatMessage, Conversation } from '../types/index.ts';

export function AssistantPage() {
  const { showToast } = useToast();
  const { language, t } = useLanguage();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');

  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<'all' | string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      const data = await apiRequest<{ conversations: Conversation[] }>(
        '/api/assistant/conversations'
      );
      setConversations(data.conversations);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.assistant.loadHistoryError, 'error');
    } finally {
      setLoadingConvos(false);
    }
  };

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const selectConversation = async (id: string) => {
    setActiveConvoId(id);
    setError(null);
    setLoadingMessages(true);
    try {
      const data = await apiRequest<{ messages: ChatMessage[] }>(
        `/api/assistant/conversations/${id}/messages`
      );
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.assistant.loadMessagesError);
    } finally {
      setLoadingMessages(false);
    }
  };

  const startNewConversation = () => {
    setActiveConvoId(null);
    setMessages([]);
    setError(null);
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;

    setError(null);
    setSending(true);
    setInput('');

    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await apiRequest<{
        conversationId: string;
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
      }>('/api/assistant/chat', {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify({
          conversationId: activeConvoId,
          message: trimmed,
          language,
        }),
      });

      if (!res?.assistantMessage?.content) {
        throw new Error(t.assistant.invalidResponseError);
      }

      setActiveConvoId(res.conversationId);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        res.userMessage,
        res.assistantMessage,
      ]);
      void loadConversations();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      setInput(trimmed);
      setError(err instanceof Error ? err.message : t.assistant.unreachableError);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'all') {
        await apiRequest('/api/assistant/conversations', { method: 'DELETE' });
        setConversations([]);
        startNewConversation();
        showToast(t.assistant.allDeletedToast, 'success');
      } else {
        await apiRequest(`/api/assistant/conversations/${deleteTarget}`, {
          method: 'DELETE',
        });
        setConversations((prev) => prev.filter((c) => c.id !== deleteTarget));
        if (activeConvoId === deleteTarget) {
          startNewConversation();
        }
        showToast(t.assistant.deletedToast, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t.assistant.deleteFailedToast, 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Conversation History Panel */}
      <aside className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4 xl:col-span-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={startNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>{t.assistant.newConversation}</span>
        </button>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t.assistant.savedConversations}
          </span>
          {conversations.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteTarget('all')}
              className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
            >
              {t.assistant.clearAll}
            </button>
          )}
        </div>

        <div className="mt-3 max-h-[420px] flex-1 space-y-1.5 overflow-y-auto">
          {loadingConvos ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t.assistant.noSavedConversations}
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeConvoId === c.id
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void selectConversation(c.id)}
                  className="min-w-0 flex-1 truncate text-left font-medium"
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c.id)}
                  aria-label={t.assistant.deleteConversationAria(c.title)}
                  className="ml-2 rounded p-1 text-slate-400 opacity-70 hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Chat Panel */}
      <section className="flex min-h-[580px] flex-col rounded-xl border border-slate-200 bg-white lg:col-span-8 xl:col-span-9 dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <strong>{t.assistant.disclaimerPrefix}</strong> {t.assistant.disclaimerBody}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {loadingMessages ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-600" />
              {t.assistant.loadingConversation}
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                {t.assistant.emptyTitle}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {t.assistant.emptySubtitle}
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {t.assistant.suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  {msg.role === 'model' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-headings:font-display">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  <div
                    className={`mt-1.5 font-mono text-[10px] ${
                      msg.role === 'user'
                        ? 'text-emerald-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString(getDateLocale(language), {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span>{t.assistant.generatingResponse}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-200 p-4 dark:border-slate-800"
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.assistant.inputPlaceholder}
              disabled={sending}
              aria-label={t.assistant.inputLabel}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending || input.trim().length < 2}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">{t.assistant.send}</span>
            </button>
          </div>
        </form>
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget === 'all' ? t.assistant.clearAllTitle : t.assistant.deleteTitle}
        description={
          deleteTarget === 'all'
            ? t.assistant.clearAllDescription
            : t.assistant.deleteDescription
        }
        confirmLabel={t.assistant.deleteConfirm}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
