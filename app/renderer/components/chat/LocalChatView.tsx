// LocalChatView (F2) — the chat surface shown when the app runs in LOCAL mode.
//
// It talks to the `claude` CLI on this PC through useLocalChat (main-process ws
// bridge), NOT to byan_web. The cloud chat UI (conversation list, byan_web
// history) does not apply locally, so this is a focused single-session view:
// start / resume-in-memory a session, send, watch the stream. Session
// persistence + resume across restarts is F3.

import React, { useEffect, useRef, useState } from 'react';
import { Send, X, Plus, Loader2, MessageSquare, Cpu, History, Check, Folder } from 'lucide-react';
import MessageMarkdown from './MessageMarkdown';
import { useLocalChat } from '../../hooks/useLocalChat';

// Short display for a directory path (last segment, or the whole thing if short).
function folderLabel(dir: string): string {
  const parts = dir.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}

export default function LocalChatView() {
  const {
    messages, streaming, streamText, starting, error, sessionId, sessions,
    newSession, resume, refreshSessions, send, stop,
  } = useLocalChat();
  const [input, setInput] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // F4 : the project directory (cwd) a new local session runs in. Defaults to the
  // folder chosen at onboarding ; the folder button lets the user pick another.
  const [cwd, setCwd] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);

  // Load the resumable session list + the default project dir once on mount.
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);
  useEffect(() => {
    void (async () => {
      try {
        const root = await window.byanApi.store?.get?.<string>('onboarding.projectRoot');
        if (root) setCwd(root);
      } catch { /* no stored root — cwd stays null (server default) */ }
    })();
  }, []);

  // Close the sessions menu on an outside click.
  useEffect(() => {
    if (!sessionsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (sessionsRef.current && !sessionsRef.current.contains(e.target as Node)) setSessionsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sessionsOpen]);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText]);

  const submit = () => {
    if (!input.trim() || streaming) return;
    // Bind an on-the-fly session to the selected project dir (F4).
    void send(input, cwd ? { cwd } : undefined).then(() => void refreshSessions());
    setInput('');
  };

  const onNewSession = () => {
    void newSession(cwd ? { cwd } : undefined).then(() => void refreshSessions());
  };

  // Pick a project directory for the next new session (F4).
  const onPickFolder = async () => {
    try {
      const picked = await window.byanApi.fs?.openProjectDialog?.();
      if (picked) setCwd(picked);
    } catch { /* dialog unavailable — keep current cwd */ }
  };

  const onResume = (id: string, dir?: string | null) => {
    setSessionsOpen(false);
    void resume(id, dir ?? undefined);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="local-chat-view">
      {/* Header — mode badge + New session */}
      <div className="shrink-0 flex items-center justify-between px-lg py-sm border-b border-ink-800">
        <div className="flex items-center gap-sm">
          <span className="flex items-center gap-xs badge badge-neutral">
            <Cpu size={12} />
            claude local
          </span>
          {/* Project directory the next session runs in (F4) — click to change. */}
          <button
            type="button"
            data-testid="local-cwd"
            onClick={() => void onPickFolder()}
            title={cwd || 'Choisir un dossier de projet'}
            className="flex items-center gap-xs text-[11px] text-ink-400 hover:text-ink-200 transition-colors"
          >
            <Folder size={12} />
            {cwd ? folderLabel(cwd) : 'Choisir un dossier'}
          </button>
          {sessionId && (
            <span className="font-mono-code text-[10px] text-ink-500">session {sessionId.slice(0, 8)}</span>
          )}
        </div>
        <div className="flex items-center gap-xs">
          {/* Resume an existing session */}
          <div ref={sessionsRef} className="relative">
            <button
              type="button"
              data-testid="local-sessions-toggle"
              onClick={() => { setSessionsOpen((o) => !o); void refreshSessions(); }}
              className="flex items-center gap-xs btn-ghost text-xs"
              title="Reprendre une session"
              aria-haspopup="menu"
              aria-expanded={sessionsOpen}
            >
              <History size={12} />
              Sessions{sessions.length ? ` (${sessions.length})` : ''}
            </button>
            {sessionsOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 mt-1 w-72 max-h-80 overflow-y-auto bg-ink-900 border border-ink-700 rounded shadow-lg py-1 z-50"
              >
                {sessions.length === 0 ? (
                  <p className="px-md py-sm text-xs text-ink-500">Aucune session enregistrée.</p>
                ) : (
                  sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      data-testid={`local-session-${s.id}`}
                      onClick={() => onResume(s.id, s.cwd)}
                      className="w-full text-left px-md py-sm hover:bg-ink-800 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-code text-[10px] text-ink-400">{s.id.slice(0, 14)}</span>
                        {s.id === sessionId && <Check size={11} className="text-acadenice-teal" />}
                      </div>
                      <p className="text-xs text-ink-300 truncate">{s.lastMessage || '(vide)'}</p>
                      <p className="text-[10px] text-ink-600">{s.messageCount} msg{s.resumable ? ' · reprenable' : ''}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="local-new-session"
            onClick={onNewSession}
            disabled={starting}
            className="flex items-center gap-xs btn-secondary text-xs disabled:opacity-50"
            title="Nouvelle session locale"
          >
            {starting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Nouvelle session
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-lg py-lg space-y-md">
        {messages.length === 0 && !streaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare size={32} className="text-ink-700 mb-sm" />
            <p className="text-sm text-ink-500">Chat local avec claude sur ce PC.</p>
            <p className="text-xs text-ink-600 mt-xs">Envoie un message — une session démarre toute seule.</p>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={[
                    'max-w-[80%] rounded-xl px-sm py-sm text-sm',
                    m.role === 'user'
                      ? 'bg-byan-700 text-white'
                      : m.role === 'system'
                      ? 'bg-red-900/40 border border-red-800 text-red-200'
                      : 'bg-ink-800 text-ink-200',
                  ].join(' ')}
                >
                  <MessageMarkdown content={m.content} />
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-xl px-sm py-sm text-sm bg-ink-800 text-ink-200">
                  {streamText ? <MessageMarkdown content={streamText} /> : <Loader2 size={14} className="animate-spin text-ink-400" />}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {error && !streaming && (
        <div role="alert" className="shrink-0 px-lg py-xs text-xs text-red-300 bg-red-900/30 border-t border-red-800">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-lg py-sm border-t border-ink-800">
        <div className="flex items-end gap-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={streaming ? 'claude répond...' : 'Message... (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)'}
            disabled={streaming}
            rows={1}
            data-testid="local-chat-input"
            className={[
              'flex-1 bg-ink-800 border border-ink-700 rounded-xl px-sm py-sm text-sm text-ink-200',
              'focus:outline-none focus:border-byan-500 transition-colors resize-none',
              'placeholder-ink-600 disabled:opacity-50',
            ].join(' ')}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="shrink-0 p-sm bg-red-700 hover:bg-red-600 rounded-xl text-white transition-colors"
              title="Stop"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              type="button"
              data-testid="local-chat-send"
              onClick={submit}
              disabled={!input.trim()}
              className="shrink-0 p-sm bg-byan-700 hover:bg-byan-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
              title="Envoyer"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
