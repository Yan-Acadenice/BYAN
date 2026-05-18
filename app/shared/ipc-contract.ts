// Public IPC contract between Electron main and renderer.
// This file is the SINGLE SOURCE OF TRUTH for the window.byanApi shape.
//
// Convention: all handlers return their value directly via Promise<T>.
// On failure, handlers throw an IpcError (serializable). The renderer awaits
// and uses standard try/catch — no Result wrapper noise on the call site.

// ---------- Auth ----------

export type AuthMode = 'cloud' | 'local' | 'custom';

export interface AuthLoginOptions {
  mode: AuthMode;
  // Required when mode === 'custom' (custom byan_web URL); ignored otherwise.
  url?: string;
  // Required when mode === 'cloud' or 'custom' (API token); not needed for local server.
  token?: string;
}

// Discriminated union — the renderer narrows on `ok`.
export type AuthResult =
  | { ok: true; mode: AuthMode; url: string; userId?: string; expiresAt?: string }
  | { ok: false; reason: 'invalid_token' | 'unreachable' | 'cancelled' | 'unknown'; message: string };

// ---------- MCP ----------

export type McpStatus =
  | { state: 'stopped' }
  | { state: 'starting'; since: string }
  | { state: 'running'; since: string; pid: number }
  | { state: 'error'; message: string };

export interface McpServer {
  id: string;
  name: string;
  // Transport — stdio is the standard for MCP servers spawned as child processes.
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  enabled: boolean;
  status: McpStatus;
}

// Shape accepted by mcp.add — narrower than McpServer because the app only
// creates stdio entries; http servers are configured by the user manually.
export interface McpServerInput {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

// ---------- byan_web API types ----------
// These types mirror the live API schema confirmed via curl against
// https://byan-api.stark.a3n.fr — see byan-api-client.ts for the fetch layer.

export interface ByanProject {
  id: string;
  name: string;
  description: string | null;
  type: string;
  visibility: 'private' | 'public';
  taxonomy_type: string | null;
  my_role: string;
  root_node_id: string | null;
  metadata_tree: {
    nodeCount: number;
    maxDepth: number;
    types: Record<string, number>;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ByanMemory {
  id: string;
  project_id: string;
  node_id: string | null;
  user_id: string | null;
  cli_source: string | null;
  session_id: string | null;
  layer: string;
  category: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  pinned: boolean;
  accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ByanKnowledge {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
  project_id: string;
  node_id: string | null;
  path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ByanCustomAgent {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  icon: string | null;
  color: string | null;
  role: string | null;
  identity: string | null;
  communication_style: string | null;
  principles: string[];
  menu: unknown[];
  soul: string | null;
  tao: string | null;
  knowledge: unknown[];
  model_preferences: Record<string, unknown>;
  parent_slug: string | null;
  created_by: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ByanSession {
  id: string;
  project_id: string | null;
  agent_slug: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ---------- Chat types ----------
// Derived from the live API contract confirmed via curl against
// POST /api/chat/conversations and GET /api/chat/conversations/:id/messages.

export type ChatCliProvider = 'claude-code' | 'copilot' | 'codex';

export interface ChatScope {
  types: string[];
  projectId: string | null;
  knowledgeTags: string[];
  memoryTags: string[];
  memoryLimit: number;
  knowledgeLimit: number;
  tokenBudget: number;
}

export interface ChatConversation {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  title: string;
  model: string | null;
  provider: string | null;
  system_prompt: string | null;
  created_by: string;
  owner_id: string;
  cli_provider: ChatCliProvider | null;
  scope_snapshot: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  cli_provider: ChatCliProvider | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  credential_source: string | null;
  created_at: string;
}

export interface CreateConversationOpts {
  title?: string;
  cli_provider?: ChatCliProvider;
  // Top-level project scope — sent as `projectId` in the POST body.
  // WHY: the backend stores it as project_id on the conversation row;
  // the CLI then uses it to scope knowledge/memory context automatically.
  projectId?: string;
  // Agent to incarnate — sent as `agentId` in the POST body.
  // WHY: fixes the "centralis confused with byan" bug: without agentId the
  // backend falls back to its default context (the BYAN platform project).
  agentId?: string;
  // Optional system-prompt override for the conversation.
  systemPrompt?: string;
  // Full hierarchical scope (knowledge tags, memory tags, token budget).
  scope?: Partial<ChatScope>;
}

export interface SendMessageOpts {
  cli_provider?: ChatCliProvider;
  scope?: Partial<ChatScope>;
}

// SSE chunk types received from main via byan:chat:chunk event.
export type ChatChunkPayload =
  | { streamId: string; type: 'chunk'; delta: string }
  | { streamId: string; type: 'end'; messageId: string; credentialSource: string | null }
  | { streamId: string; type: 'error'; error: string };

export interface ByanUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  role: string;
}

export interface ByanApiListOpts {
  projectId?: string;
  limit?: number;
  category?: string;
  type?: string;
  tags?: string;
}

// ---------- CLI detection ----------

// Each entry is the absolute path of the detected CLI binary, or undefined if not found.
// We keep the list open-ended to add more CLIs later (e.g. gemini, ollama) without breaking.
export interface CliDetection {
  claude?: string;
  codex?: string;
  copilot?: string;
}

// ---------- Onboarding ----------

// What the user wants to set up (checked platforms + project root).
export interface OnboardingOpts {
  projectRoot: string;
  platforms: {
    claude: boolean;
    codex: boolean;
    copilot: boolean;
  };
  // Optional API URL for the byan MCP entry. Defaults to prod cloud.
  apiUrl?: string;
}

// Action to take on a single file. 'skip' means the file already matches target.
export type FileWriteAction = 'create' | 'update' | 'skip';

// Preview of one file that will be written (or skipped) during onboarding.
export interface FileWritePlan {
  // Absolute path on disk.
  path: string;
  // Human-readable relative path (for display).
  relPath: string;
  // Short description of what this file does.
  description: string;
  // Platform this file belongs to.
  platform: 'claude' | 'codex' | 'copilot';
  action: FileWriteAction;
  // Content that will be written (empty string for directories or skipped entries).
  content: string;
}

// Result of applying an onboarding plan.
export interface OnboardingResult {
  // Number of files written/updated successfully.
  written: number;
  // Number of files skipped (already up to date).
  skipped: number;
  // Per-file errors (file path → error message).
  errors: Record<string, string>;
}

// ---------- Local server lifecycle ----------

export interface ServerSpawnResult {
  port: number;
  pid: number;
}

export type ServerStatus =
  | { running: false }
  | { running: true; port: number; pid: number };

// ---------- Public API namespace ----------

export interface ByanApi {
  auth: {
    login(opts: AuthLoginOptions): Promise<AuthResult>;
    logout(): Promise<void>;
    getToken(): Promise<string | null>;
  };
  byanWeb: {
    projects: {
      list(): Promise<ByanProject[]>;
      get(id: string): Promise<ByanProject | null>;
    };
    memory: {
      list(opts?: ByanApiListOpts): Promise<ByanMemory[]>;
    };
    knowledge: {
      list(opts?: ByanApiListOpts): Promise<ByanKnowledge[]>;
    };
    customAgents: {
      list(): Promise<ByanCustomAgent[]>;
    };
    sessions: {
      list(opts?: Pick<ByanApiListOpts, 'projectId' | 'limit'>): Promise<ByanSession[]>;
    };
    me(): Promise<ByanUser>;
    chat: {
      conversations: {
        list(): Promise<ChatConversation[]>;
        create(opts: CreateConversationOpts): Promise<ChatConversation>;
        delete(id: string): Promise<void>;
      };
      messages: {
        list(conversationId: string, opts?: { limit?: number }): Promise<ChatMessage[]>;
      };
      stream: {
        // Opens an SSE connection. Chunks arrive via byan:chat:chunk events.
        // Returns a streamId used to correlate events and to abort.
        start(conversationId: string, message: string, opts?: SendMessageOpts): Promise<{ streamId: string }>;
        abort(streamId: string): Promise<void>;
      };
    };
  };
  fs: {
    // Returns the absolute path the user picked, or null if they cancelled.
    openProjectDialog(): Promise<string | null>;
    // UTF-8 read; throws IpcError on missing file or permission denied.
    readFile(filePath: string): Promise<string>;
    // Returns true if the given absolute path exists on disk.
    pathExists(filePath: string): Promise<boolean>;
    // Creates the directory and all parents. No-op if already exists.
    mkdir(dirPath: string): Promise<void>;
  };
  mcp: {
    list(): Promise<McpServer[]>;
    start(id: string): Promise<void>;
    stop(id: string): Promise<void>;
    status(id: string): Promise<McpStatus>;
    add(input: McpServerInput): Promise<McpServer>;
    update(input: McpServerInput): Promise<McpServer>;
    delete(id: string): Promise<void>;
  };
  cli: {
    detect(): Promise<CliDetection>;
  };
  onboarding: {
    // Build the list of files that would be written for the given options.
    preview(opts: OnboardingOpts): Promise<FileWritePlan[]>;
    // Execute a (subset of) plans previously returned by preview.
    apply(plans: FileWritePlan[]): Promise<OnboardingResult>;
  };
  server: {
    spawn(): Promise<ServerSpawnResult>;
    stop(): Promise<void>;
    status(): Promise<ServerStatus>;
  };
  app: {
    quit(): Promise<void>;
    version(): Promise<string>;
    relaunch(): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  update: {
    check(): Promise<UpdateState>;
    getState(): Promise<UpdateState>;
    install(): Promise<void>;
  };
  store: {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
  };
}

// ---------- Channel names ----------
// Single source of truth for IPC channel names. Both preload and main import
// from here so a typo can't desync them.

export const IPC_CHANNELS = {
  auth: {
    login: 'byan:auth:login',
    logout: 'byan:auth:logout',
    getToken: 'byan:auth:getToken'
  },
  fs: {
    openProjectDialog: 'byan:fs:openProjectDialog',
    readFile: 'byan:fs:readFile',
    pathExists: 'byan:fs:pathExists',
    mkdir: 'byan:fs:mkdir'
  },
  mcp: {
    list: 'byan:mcp:list',
    start: 'byan:mcp:start',
    stop: 'byan:mcp:stop',
    status: 'byan:mcp:status',
    add: 'byan:mcp:add',
    update: 'byan:mcp:update',
    delete: 'byan:mcp:delete'
  },
  cli: {
    detect: 'byan:cli:detect'
  },
  onboarding: {
    preview: 'byan:onboarding:preview',
    apply: 'byan:onboarding:apply'
  },
  server: {
    spawn: 'byan:server:spawn',
    stop: 'byan:server:stop',
    status: 'byan:server:status'
  },
  app: {
    quit: 'byan:app:quit',
    version: 'byan:app:version',
    relaunch: 'byan:app:relaunch',
    openExternal: 'byan:app:openExternal'
  },
  update: {
    check: 'byan:update:check',
    getState: 'byan:update:getState',
    install: 'byan:update:install'
  },
  store: {
    get: 'byan:store:get',
    set: 'byan:store:set'
  },
  byanWeb: {
    projectsList: 'byan:byanWeb:projects:list',
    projectsGet: 'byan:byanWeb:projects:get',
    memoryList: 'byan:byanWeb:memory:list',
    knowledgeList: 'byan:byanWeb:knowledge:list',
    customAgentsList: 'byan:byanWeb:customAgents:list',
    sessionsList: 'byan:byanWeb:sessions:list',
    me: 'byan:byanWeb:me',
    chatConversationsList: 'byan:byanWeb:chat:conversations:list',
    chatConversationsCreate: 'byan:byanWeb:chat:conversations:create',
    chatConversationsDelete: 'byan:byanWeb:chat:conversations:delete',
    chatMessagesList: 'byan:byanWeb:chat:messages:list',
    chatStreamStart: 'byan:byanWeb:chat:stream:start',
    chatStreamAbort: 'byan:byanWeb:chat:stream:abort',
  }
} as const;
// Event channels pushed from main -> renderer (used with byanEvents.on):
//   byan:chat:chunk        — ChatChunkPayload
//   byan:mcp:statusChange  — McpStatusChangePayload
//   byan:update:status     — UpdateState
//   byan:deepLink          — DeepLink (F17)

export interface McpStatusChangePayload {
  id: string;
  status: McpStatus;
}

// ---------- Deep links (F17) ----------

export type DeepLinkKind = 'project' | 'chat' | 'agent' | 'settings' | 'unknown';

export interface DeepLink {
  kind: DeepLinkKind;
  id?: string;
  params?: Record<string, string>;
  raw: string;
}

// ---------- Auto-update ----------

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number; transferred: number; total: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: 'dev-mode' };

// ---------- Error envelope ----------
// When a handler throws, Electron serializes the Error across the IPC boundary.
// We attach a stable `code` field so the renderer can branch on error class.

export type IpcErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNAUTHENTICATED'
  | 'UNAVAILABLE'
  | 'INTERNAL'
  // Resource already exists (e.g. mcp.add with a colliding id).
  | 'CONFLICT'
  // Thrown by byanWeb handlers when the stored token is missing or the server
  // returns 401. The renderer should redirect to Login on this code.
  | 'AUTH_REQUIRED';

export interface IpcErrorShape {
  code: IpcErrorCode;
  message: string;
}
