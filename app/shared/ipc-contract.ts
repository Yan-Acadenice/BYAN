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
    status: 'byan:mcp:status'
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
  store: {
    get: 'byan:store:get',
    set: 'byan:store:set'
  }
} as const;

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
  | 'INTERNAL';

export interface IpcErrorShape {
  code: IpcErrorCode;
  message: string;
}
