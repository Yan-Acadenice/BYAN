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
