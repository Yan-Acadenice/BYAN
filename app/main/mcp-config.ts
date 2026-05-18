// MCP configuration reader — reads .mcp.json from the user's project root.
// This is the SAME format Claude Code uses: top-level `mcpServers` object keyed
// by server id. We mirror that shape so a single .mcp.json drives both the CLI
// and this app.
//
// Output is McpServerConfig[] — the IPC-friendly shape consumed by the registry
// and the renderer (without runtime state, which the registry owns).

import * as fs from 'fs/promises';
import * as path from 'path';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
}

interface RawMcpServer {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  cwd?: unknown;
  url?: unknown;
  transport?: unknown;
  enabled?: unknown;
}

interface RawMcpFile {
  mcpServers?: Record<string, RawMcpServer>;
}

export const MCP_CONFIG_FILENAME = '.mcp.json';

export function mcpConfigPath(projectRoot: string): string {
  return path.join(projectRoot, MCP_CONFIG_FILENAME);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (typeof v !== 'string') return false;
  }
  return true;
}

function parseEntry(id: string, raw: RawMcpServer): McpServerConfig | null {
  if (typeof id !== 'string' || id.length === 0) return null;

  // Transport discrimination: presence of `url` => http; else stdio (Claude Code convention).
  const transport: 'stdio' | 'http' =
    raw.transport === 'http' || (typeof raw.url === 'string' && raw.url.length > 0)
      ? 'http'
      : 'stdio';

  const command = typeof raw.command === 'string' && raw.command.length > 0 ? raw.command : undefined;
  const args = Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === 'string') : undefined;
  const env = isStringRecord(raw.env) ? raw.env : undefined;
  const cwd = typeof raw.cwd === 'string' && raw.cwd.length > 0 ? raw.cwd : undefined;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;

  if (transport === 'stdio' && !command) return null;

  return {
    id,
    name: id,
    transport,
    command,
    args,
    env,
    cwd,
    enabled,
  };
}

export async function readMcpConfig(projectRoot: string): Promise<McpServerConfig[]> {
  const filePath = mcpConfigPath(projectRoot);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  let parsed: RawMcpFile;
  try {
    parsed = JSON.parse(raw) as RawMcpFile;
  } catch {
    return [];
  }

  const servers = parsed.mcpServers;
  if (!servers || typeof servers !== 'object') return [];

  const out: McpServerConfig[] = [];
  for (const [id, rawSrv] of Object.entries(servers)) {
    const entry = parseEntry(id, rawSrv ?? {});
    if (entry) out.push(entry);
  }
  return out;
}

// Input shape accepted by addMcpServer — narrower than McpServerConfig because
// the renderer only supplies stdio entries (http servers live remotely and are
// not created from the app).
export interface McpServerInput {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

// Regex chosen to match the Claude Code convention: lowercase + digits + hyphens.
// Length cap prevents pathological keys from breaking the JSON file.
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function validateServerInput(input: McpServerInput): string | null {
  if (!input || typeof input !== 'object') return 'invalid input';
  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) {
    return 'id must match [a-z0-9][a-z0-9-]{0,62} (lowercase, digits, hyphens)';
  }
  if (typeof input.command !== 'string' || input.command.trim().length === 0) {
    return 'command is required';
  }
  if (input.args !== undefined) {
    if (!Array.isArray(input.args) || input.args.some((a) => typeof a !== 'string')) {
      return 'args must be an array of strings';
    }
  }
  if (input.env !== undefined && !isStringRecord(input.env)) {
    return 'env must be a string→string record';
  }
  if (input.cwd !== undefined && typeof input.cwd !== 'string') {
    return 'cwd must be a string';
  }
  return null;
}

// Writes the new server to .mcp.json, preserving any existing entries that
// are not the conflicting id. Throws on id conflict or invalid input.
//
// File format is normalized to 2-space JSON so diffs stay readable when the
// user commits .mcp.json to git.
export async function addMcpServer(
  projectRoot: string,
  input: McpServerInput
): Promise<McpServerConfig> {
  const err = validateServerInput(input);
  if (err) {
    throw new McpConfigError('INVALID_ARGUMENT', err);
  }

  const filePath = mcpConfigPath(projectRoot);

  let existing: { mcpServers: Record<string, RawMcpServer> } = { mcpServers: {} };
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as RawMcpFile;
    if (parsed && typeof parsed === 'object' && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      existing = { mcpServers: { ...parsed.mcpServers } };
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Malformed JSON — refuse to overwrite. User must fix it manually.
      if (e instanceof SyntaxError) {
        throw new McpConfigError('UNAVAILABLE', '.mcp.json is malformed; fix it manually before adding entries');
      }
      throw e;
    }
  }

  if (existing.mcpServers[input.id]) {
    throw new McpConfigError('CONFLICT', `mcp: server "${input.id}" already exists`);
  }

  const newEntry: RawMcpServer = {
    command: input.command,
    ...(input.args && input.args.length > 0 ? { args: input.args } : {}),
    ...(input.env && Object.keys(input.env).length > 0 ? { env: input.env } : {}),
    ...(input.cwd ? { cwd: input.cwd } : {}),
  };

  existing.mcpServers[input.id] = newEntry;

  // Format with trailing newline so editors don't fight us on save.
  const serialized = JSON.stringify(existing, null, 2) + '\n';
  await fs.writeFile(filePath, serialized, 'utf-8');

  const parsedBack = parseEntry(input.id, newEntry);
  if (!parsedBack) {
    throw new McpConfigError('INTERNAL', 'failed to round-trip server entry');
  }
  return parsedBack;
}

export type McpConfigErrorCode = 'INVALID_ARGUMENT' | 'CONFLICT' | 'UNAVAILABLE' | 'INTERNAL';

export class McpConfigError extends Error {
  public readonly code: McpConfigErrorCode;
  constructor(code: McpConfigErrorCode, message: string) {
    super(message);
    this.name = 'McpConfigError';
    this.code = code;
  }
}
