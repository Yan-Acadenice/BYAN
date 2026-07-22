// LocalChatView (F2) — the chat surface shown when the app runs in LOCAL mode.
//
// It talks to the `claude` CLI on this PC through useLocalChat (main-process ws
// bridge), NOT to byan_web. The cloud chat UI (conversation list, byan_web
// history) does not apply locally, so this is a focused single-session view:
// start / resume-in-memory a session, send, watch the stream. Session
// persistence + resume across restarts is F3.

import React, { useEffect, useRef, useState } from 'react';
import { Send, X, Plus, Loader2, MessageSquare, Cpu } from 'lucide-react';
import MessageMarkdown from './MessageMarkdown';
import { useLocalChat } from '../../hooks/useLocalChat';

export default function LocalChatView() {
  const { messages, streaming, streamText, starting, error, sessionId, newSession, send, stop } = useLocalChat();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText]);

  const submit = () => {
    if (!input.trim() || streaming) return;
    void send(input);
    setInput('');
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
          {sessionId && (
            <span className="font-mono-code text-[10px] text-ink-500">session {sessionId.slice(0, 8)}</span>
          )}
        </div>
        <button
          type="button"
          data-testid="local-new-session"
          onClick={() => void newSession()}
          disabled={starting}
          className="flex items-center gap-xs btn-secondary text-xs disabled:opacity-50"
          title="Nouvelle session locale"
        >
          {starting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Nouvelle session
        </button>
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
