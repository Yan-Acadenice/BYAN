// Chat — multi-CLI streaming page.
//
// Architecture:
//   - Left sidebar: conversation list grouped by date
//   - Right pane: message list + input with slash-command autocomplete
//   - SSE stream: main process opens the fetch, pushes chunks via byan:chat:chunk events
//
// Slash-commands:
//   /new    → open NewConversationModal (with project + agent picker)
//   /cli    → switch CLI provider for the active conversation
//   /scope  → toggle scope picker panel
//   /clear  → delete active conversation (with confirmation)
//
// Bug fix: project scope — previously created without projectId, so the CLI
// always defaulted to the BYAN platform context. Now the modal collects
// projectId + agentId and passes them at creation time.
//
// No fetch in renderer (ESLint rule). All HTTP goes through window.byanApi.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ByanCustomAgent,
  ByanProject,
  ChatConversation,
  ChatCliProvider,
  ChatMessage,
  ChatChunkPayload,
  CreateConversationOpts,
} from '../../shared/ipc-contract';
import NewConversationModal from '../components/chat/NewConversationModal';
import MessageMarkdown from '../components/chat/MessageMarkdown';

// ---------- Constants ----------

const CLI_LABELS: Record<ChatCliProvider, string> = {
  'claude-code': 'Claude Code',
  copilot: 'Copilot',
  codex: 'Codex',
};

const CLI_BADGE_CLASS: Record<ChatCliProvider, string> = {
  'claude-code': 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
  copilot: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
  codex: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
};

const SLASH_COMMANDS = [
  { cmd: '/new', description: 'Start a new conversation' },
  { cmd: '/cli', description: 'Switch CLI provider' },
  { cmd: '/scope', description: 'Toggle scope picker' },
  { cmd: '/clear', description: 'Delete this conversation' },
];

// ---------- Helpers ----------

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'Z');
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function groupByDate(convs: ChatConversation[]): { label: string; items: ChatConversation[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const yesterdayMs = todayMs - 86_400_000;
  const weekMs = todayMs - 7 * 86_400_000;

  const groups: { label: string; items: ChatConversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of convs) {
    const t = new Date(c.updated_at || c.created_at).getTime();
    if (t >= todayMs) groups[0].items.push(c);
    else if (t >= yesterdayMs) groups[1].items.push(c);
    else if (t >= weekMs) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  // Suppress empty groups
  return groups.filter((g) => g.items.length > 0);
}

void formatRelativeTime; // used in JSX below

// ---------- Sub-components ----------

interface ConvItemProps {
  conv: ChatConversation;
  active: boolean;
  onClick: () => void;
  onDelete: (id: string) => void;
}

function ConvItem({ conv, active, onClick, onDelete }: ConvItemProps) {
  const cli = conv.cli_provider;
  return (
    <div
      onClick={onClick}
      className={[
        'group flex items-start gap-xs px-xs py-sm rounded-lg cursor-pointer transition-all border',
        active
          ? 'bg-byan-900/40 border-byan-700/50 text-byan-300'
          : 'border-transparent hover:bg-ink-800 hover:border-ink-700 text-ink-400',
      ].join(' ')}
    >
      <MessageSquare size={14} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${active ? 'text-byan-300 font-medium' : 'text-ink-300'}`}>
          {conv.title || 'New conversation'}
        </p>
        <div className="flex items-center gap-xs mt-0.5 flex-wrap">
          {cli && (
            <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${CLI_BADGE_CLASS[cli]}`}>
              {CLI_LABELS[cli]}
            </span>
          )}
          <span className="text-[10px] text-ink-500">{formatRelativeTime(conv.updated_at)}</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-ink-500 hover:text-red-400 transition-colors"
        title="Delete conversation"
        type="button"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

interface MessageBubbleProps {
  msg: ChatMessage;
}

function MessageBubble({ msg }: MessageBubbleProps) {
  const isUser = msg.role === 'user';
  const cli = msg.cli_provider;

  if (msg.role === 'system') {
    return (
      <div className="flex justify-center mb-md">
        <span className="px-sm py-xs bg-ink-800 border border-ink-700 rounded-lg text-ink-400 text-xs">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex mb-md ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-byan-600 to-cyan-600 flex items-center justify-center text-white text-[10px] font-bold mr-xs mt-0.5">
          AI
        </div>
      )}
      <div
        className={[
          'max-w-[76%] rounded-xl px-sm py-sm text-sm',
          isUser
            ? 'bg-byan-700 text-white rounded-br-sm'
            : 'bg-ink-800 border border-ink-700 text-ink-200 rounded-bl-sm',
        ].join(' ')}
      >
        {/* Markdown rendering — CLIs return lists, code blocks, tables; plain text is illegible. */}
        <MessageMarkdown content={msg.content} />
        <div className="flex items-center justify-between mt-xs gap-xs">
          {!isUser && cli && (
            <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${CLI_BADGE_CLASS[cli]}`}>
              {CLI_LABELS[cli]}
            </span>
          )}
          <span className="text-[10px] text-ink-500 ml-auto">{formatRelativeTime(msg.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

interface StreamingBubbleProps {
  text: string;
}

function StreamingBubble({ text }: StreamingBubbleProps) {
  return (
    <div className="flex mb-md justify-start">
      <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-byan-600 to-cyan-600 flex items-center justify-center text-white text-[10px] font-bold mr-xs mt-0.5">
        AI
      </div>
      <div className="max-w-[76%] rounded-xl rounded-bl-sm px-sm py-sm bg-ink-800 border border-ink-700 text-sm text-ink-200">
        {text ? (
          <span className="whitespace-pre-wrap break-words leading-relaxed">
            {text}
            <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-byan-400 animate-pulse rounded-sm" />
          </span>
        ) : (
          <div className="flex gap-1 items-center py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-byan-400 animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-byan-400 animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-byan-400 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ConvHeader — shows project + agent + CLI badges ----------

interface ConvHeaderProps {
  conv: ChatConversation;
  projectName: string | null;
  agentName: string | null;
  onDelete: () => void;
}

function ConvHeader({ conv, projectName, agentName, onDelete }: ConvHeaderProps) {
  const cli = conv.cli_provider;
  return (
    <div className="flex items-center justify-between px-lg py-sm border-b border-ink-800 shrink-0 gap-sm">
      <div className="flex items-center gap-sm min-w-0 flex-wrap">
        <p className="font-medium text-ink-200 truncate">
          {conv.title || 'Conversation'}
        </p>
        {cli && (
          <span className={`px-sm py-0.5 rounded text-[10px] font-medium ${CLI_BADGE_CLASS[cli]}`}>
            {CLI_LABELS[cli]}
          </span>
        )}
        {projectName && (
          <span className="px-sm py-0.5 rounded text-[10px] font-medium bg-violet-900/40 text-violet-300 border border-violet-700/50">
            Project: {projectName}
          </span>
        )}
        {agentName && (
          <span className="px-sm py-0.5 rounded text-[10px] font-medium bg-teal-900/40 text-teal-300 border border-teal-700/50">
            Agent: {agentName}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-ink-500 hover:text-red-400 transition-colors p-1 rounded"
        title="Delete conversation"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ---------- Main page ----------

export default function Chat() {
  // Conversations list state
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState('');

  // Active conversation + messages
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const streamIdRef = useRef<string | null>(null);

  // Input
  const [input, setInput] = useState('');
  const [slashMenu, setSlashMenu] = useState<typeof SLASH_COMMANDS>([]);

  // Modals
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Lookup maps for project/agent names in the conversation header.
  // WHY: conversations store ids (project_id, agent_id) not names — we need
  // these maps to render human-readable badges without an extra API call per conv.
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeConv = convs.find((c) => c.id === activeConvId) ?? null;

  // Resolve human-readable names for header badges.
  const activeProjectName = activeConv?.project_id ? (projectMap[activeConv.project_id] ?? null) : null;
  const activeAgentName   = activeConv?.agent_id   ? (agentMap[activeConv.agent_id]     ?? null) : null;

  // ---------- Load conversations ----------

  const loadConvs = useCallback(async () => {
    setConvLoading(true);
    setConvError('');
    try {
      const list = await window.byanApi.byanWeb.chat.conversations.list() as ChatConversation[];
      setConvs(list);
      // Auto-select first if none active
      if (!activeConvId && list.length > 0) {
        setActiveConvId(list[0].id);
      }
    } catch (err) {
      setConvError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setConvLoading(false);
    }
  }, [activeConvId]);

  useEffect(() => { void loadConvs(); }, []);

  // Load project + agent lookup maps once — used for header badges.
  useEffect(() => {
    void (async () => {
      try {
        const [projects, agents] = await Promise.all([
          window.byanApi.byanWeb.projects.list() as Promise<ByanProject[]>,
          window.byanApi.byanWeb.customAgents.list() as Promise<ByanCustomAgent[]>,
        ]);
        const pm: Record<string, string> = {};
        for (const p of projects) pm[p.id] = p.name;
        setProjectMap(pm);
        const am: Record<string, string> = {};
        for (const a of agents) am[a.id] = a.name;
        setAgentMap(am);
      } catch {
        // Non-fatal — badges just won't show a name.
      }
    })();
  }, []);

  // ---------- Load messages when active conversation changes ----------

  useEffect(() => {
    if (!activeConvId) return;
    setMsgLoading(true);
    setMessages([]);
    void (async () => {
      try {
        const list = await window.byanApi.byanWeb.chat.messages.list(activeConvId, { limit: 100 }) as ChatMessage[];
        setMessages(list);
      } catch {
        // Non-fatal — show empty
      } finally {
        setMsgLoading(false);
      }
    })();
  }, [activeConvId]);

  // ---------- Auto-scroll ----------
  // scrollIntoView may be absent in jsdom (unit test environment).

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText]);

  // ---------- SSE chunk listener ----------

  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;

    const unsub = window.byanEvents.on('byan:chat:chunk', (payload: unknown) => {
      const p = payload as ChatChunkPayload;
      if (p.streamId !== streamIdRef.current) return;

      if (p.type === 'chunk') {
        setStreamText((t) => t + p.delta);
      } else if (p.type === 'end') {
        // Stream finished — reload messages to get the persisted assistant message.
        setStreaming(false);
        setStreamText('');
        streamIdRef.current = null;
        if (activeConvId) {
          void (async () => {
            try {
              const list = await window.byanApi.byanWeb.chat.messages.list(activeConvId, { limit: 100 }) as ChatMessage[];
              setMessages(list);
              // Refresh convs to update updated_at ordering.
              const convList = await window.byanApi.byanWeb.chat.conversations.list() as ChatConversation[];
              setConvs(convList);
            } catch {
              // Non-fatal
            }
          })();
        }
      } else if (p.type === 'error') {
        setStreaming(false);
        setStreamText('');
        streamIdRef.current = null;
        // Append synthetic error message to thread
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            conversation_id: activeConvId ?? '',
            role: 'system',
            content: `Error: ${p.error}`,
            cli_provider: null,
            tokens_in: null,
            tokens_out: null,
            cost_usd: null,
            duration_ms: null,
            credential_source: null,
            created_at: new Date().toISOString(),
          } satisfies ChatMessage,
        ]);
      }
    });

    return unsub;
  }, [activeConvId]);

  // ---------- Send message ----------

  const sendMessage = useCallback(async (text: string) => {
    if (!activeConvId || !text.trim() || streaming) return;

    const content = text.trim();

    // Optimistically append user message
    const userMsg: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: activeConvId,
      role: 'user',
      content,
      cli_provider: activeConv?.cli_provider ?? null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      duration_ms: null,
      credential_source: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamText('');

    try {
      const { streamId } = await window.byanApi.byanWeb.chat.stream.start(
        activeConvId,
        content,
        { cli_provider: activeConv?.cli_provider ?? undefined }
      );
      streamIdRef.current = streamId;
    } catch (err) {
      setStreaming(false);
      const msg = err instanceof Error ? err.message : 'Failed to start stream';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          conversation_id: activeConvId,
          role: 'system',
          content: `Error: ${msg}`,
          cli_provider: null,
          tokens_in: null,
          tokens_out: null,
          cost_usd: null,
          duration_ms: null,
          credential_source: null,
          created_at: new Date().toISOString(),
        } satisfies ChatMessage,
      ]);
    }
  }, [activeConvId, activeConv, streaming]);

  // ---------- Abort stream ----------

  const abortStream = useCallback(async () => {
    if (!streamIdRef.current) return;
    try {
      await window.byanApi.byanWeb.chat.stream.abort(streamIdRef.current);
    } catch {
      // Best effort
    }
    setStreaming(false);
    setStreamText('');
    streamIdRef.current = null;
  }, []);

  // ---------- Create conversation ----------

  const handleCreate = useCallback(async (opts: CreateConversationOpts) => {
    try {
      const conv = await window.byanApi.byanWeb.chat.conversations.create(opts) as ChatConversation;
      setConvs((prev) => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
    } catch (err) {
      // Surface error inline — creation failure is non-silent
      alert(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  }, []);

  // ---------- Delete conversation ----------

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.byanApi.byanWeb.chat.conversations.delete(id);
      setConvs((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete conversation');
    } finally {
      setDeleteConfirm(null);
    }
  }, [activeConvId]);

  // ---------- Input handling ----------

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Show slash-command menu when user starts typing /
    if (val.startsWith('/') && !val.includes(' ')) {
      const filtered = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(val));
      setSlashMenu(filtered);
    } else {
      setSlashMenu([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      const trimmed = input.trim();
      if (!trimmed) return;

      // Handle slash commands
      if (trimmed === '/new') {
        setInput('');
        setSlashMenu([]);
        setNewConvOpen(true);
        return;
      }
      if (trimmed === '/clear') {
        if (activeConvId) setDeleteConfirm(activeConvId);
        setInput('');
        setSlashMenu([]);
        return;
      }
      if (trimmed === '/scope') {
        // Placeholder — scope picker is a future enhancement
        setInput('');
        setSlashMenu([]);
        return;
      }
      if (trimmed.startsWith('/cli ')) {
        // /cli <provider> — switch CLI for the active conv (requires a new conv with that provider)
        setInput('');
        setSlashMenu([]);
        return;
      }

      setInput('');
      setSlashMenu([]);
      void sendMessage(trimmed);
    }

    if (e.key === 'Escape') {
      setSlashMenu([]);
    }
  };

  const handleSlashSelect = (cmd: string) => {
    setInput(cmd + ' ');
    setSlashMenu([]);
    inputRef.current?.focus();
  };

  // ---------- Render ----------

  const groups = groupByDate(convs);

  return (
    <>
      <NewConversationModal
        open={newConvOpen}
        onClose={() => setNewConvOpen(false)}
        onCreate={(opts) => void handleCreate(opts)}
      />

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-md"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-ink-900 border border-ink-700 rounded-xl p-lg max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-h3 text-h3 text-ink-100 mb-sm">Delete conversation?</h3>
            <p className="text-sm text-ink-400 mb-lg">This cannot be undone.</p>
            <div className="flex justify-end gap-sm">
              <button type="button" className="btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={() => void handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Full-height layout: sidebar + main pane */}
      <div
        className="flex gap-0 bg-ink-950 rounded-xl border border-ink-800 overflow-hidden"
        style={{ height: 'calc(100vh - 48px - 28px - 2.5rem)' }}
      >
        {/* Sidebar — conversation list */}
        <div className="w-64 shrink-0 flex flex-col border-r border-ink-800 bg-ink-950">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-md py-sm border-b border-ink-800 shrink-0">
            <h2 className="font-h3 text-h3 text-ink-200">Chat</h2>
            <button
              type="button"
              onClick={() => setNewConvOpen(true)}
              className="p-1 rounded-lg text-ink-400 hover:text-byan-400 hover:bg-ink-800 transition-colors"
              title="New conversation"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto px-xs py-xs">
            {convLoading ? (
              <div className="flex items-center justify-center py-xl text-ink-500">
                <Loader2 size={16} className="animate-spin mr-xs" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : convError ? (
              <div className="flex flex-col items-center py-xl text-center">
                <AlertCircle size={20} className="text-red-400 mb-xs" />
                <p className="text-xs text-ink-500 mb-sm">{convError}</p>
                <button type="button" className="btn-ghost text-xs" onClick={() => void loadConvs()}>Retry</button>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center py-xl text-center">
                <MessageSquare size={24} className="text-ink-600 mb-sm" />
                <p className="text-xs text-ink-500 mb-sm">No conversations yet</p>
                <button type="button" className="btn-secondary text-xs" onClick={() => setNewConvOpen(true)}>
                  Start one
                </button>
              </div>
            ) : (
              <div className="space-y-xs">
                {groups.map((group) => (
                  <div key={group.label}>
                    <p className="px-xs py-xs text-[10px] text-ink-500 uppercase tracking-wider font-label">
                      {group.label}
                    </p>
                    {group.items.map((conv) => (
                      <ConvItem
                        key={conv.id}
                        conv={conv}
                        active={conv.id === activeConvId}
                        onClick={() => { setActiveConvId(conv.id); }}
                        onDelete={(id) => setDeleteConfirm(id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main pane — messages + input */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeConvId === null ? (
            /* No conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <MessageSquare size={40} className="text-ink-700 mb-md" />
              <p className="font-h3 text-h3 text-ink-500 mb-xs">Select a conversation</p>
              <p className="text-sm text-ink-600 mb-lg">Or create a new one to get started</p>
              <button type="button" className="btn-primary" onClick={() => setNewConvOpen(true)}>
                <Plus size={14} className="mr-xs" />
                New conversation
              </button>
            </div>
          ) : (
            <>
              {/* Conversation header — shows project, agent and CLI badges */}
              <ConvHeader
                conv={activeConv!}
                projectName={activeProjectName}
                agentName={activeAgentName}
                onDelete={() => setDeleteConfirm(activeConvId)}
              />

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-lg py-lg">
                {msgLoading ? (
                  <div className="flex items-center justify-center py-xl text-ink-500">
                    <Loader2 size={16} className="animate-spin mr-xs" />
                    <span className="text-sm">Loading messages...</span>
                  </div>
                ) : messages.length === 0 && !streaming ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquare size={32} className="text-ink-700 mb-sm" />
                    <p className="text-sm text-ink-500">Send a message to start chatting</p>
                    {activeConv?.cli_provider && (
                      <p className="text-xs text-ink-600 mt-xs">
                        Using {CLI_LABELS[activeConv.cli_provider]}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} />
                    ))}
                    {streaming && <StreamingBubble text={streamText} />}
                  </>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              <div className="shrink-0 px-lg py-sm border-t border-ink-800 relative">
                {/* Slash-command menu */}
                {slashMenu.length > 0 && (
                  <div className="absolute bottom-full left-lg right-lg mb-xs bg-ink-850 border border-ink-700 rounded-xl overflow-hidden shadow-xl z-10">
                    {slashMenu.map((item) => (
                      <button
                        key={item.cmd}
                        type="button"
                        onClick={() => handleSlashSelect(item.cmd)}
                        className="w-full flex items-center gap-sm px-sm py-sm hover:bg-ink-800 transition-colors text-left"
                      >
                        <span className="font-mono text-byan-400 text-sm">{item.cmd}</span>
                        <span className="text-xs text-ink-400">{item.description}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-sm">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={streaming ? 'Waiting for response...' : 'Message... (Enter to send, Shift+Enter for newline, / for commands)'}
                    disabled={streaming}
                    rows={1}
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
                      onClick={() => void abortStream()}
                      className="shrink-0 p-sm bg-red-700 hover:bg-red-600 rounded-xl text-white transition-colors"
                      title="Stop"
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void sendMessage(input); setInput(''); setSlashMenu([]); }}
                      disabled={!input.trim()}
                      className="shrink-0 p-sm bg-byan-700 hover:bg-byan-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
                      title="Send"
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-ink-600 mt-xs">
                  Type <code className="font-mono">/new</code> to start a conversation,{' '}
                  <code className="font-mono">/clear</code> to delete this one
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
