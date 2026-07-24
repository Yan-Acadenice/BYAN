// Codex MCP wiring — map the project's .mcp.json (Claude Code convention) onto
// `codex exec -c` overrides, so a codex chat gets the SAME MCP channel a claude
// chat gets natively from the project dir.
//
// codex reads MCP servers from ~/.codex/config.toml (user-level, wrong scope
// for a per-project chat). `-c key=value` overrides are per-invocation and
// parsed as TOML, which gives us project-scoped wiring with zero file writes.

import type { McpServerConfig } from '../mcp-config';

// TOML basic-string quoting. JSON string escaping is a valid TOML basic string
// (same double-quote delimiter, same backslash escapes) — including Windows
// paths — so JSON.stringify does the job.
export function tomlString(s: string): string {
  return JSON.stringify(s);
}

// TOML bare keys allow [A-Za-z0-9_-]; anything else must be quoted.
const BARE_KEY = /^[A-Za-z0-9_-]+$/;
export function tomlKey(k: string): string {
  return BARE_KEY.test(k) ? k : JSON.stringify(k);
}

// ${VAR} placeholders in .mcp.json env values follow the Claude Code
// convention (claude expands them itself). codex does not — expand here from
// the live environment; an unset variable becomes the empty string.
export function expandEnvValue(v: string, env: NodeJS.ProcessEnv = process.env): string {
  return v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => env[name] ?? '');
}

// Build the -c override argv for `codex exec` from parsed .mcp.json entries.
// Only enabled stdio servers translate (codex -c wiring is command/args/env);
// http entries are skipped — they stay a claude-side capability for now.
export function codexMcpArgs(servers: McpServerConfig[], env: NodeJS.ProcessEnv = process.env): string[] {
  const args: string[] = [];
  for (const s of servers) {
    if (!s.enabled || s.transport !== 'stdio' || !s.command) continue;
    const id = tomlKey(s.id);
    args.push('-c', `mcp_servers.${id}.command=${tomlString(s.command)}`);
    if (s.args && s.args.length > 0) {
      args.push('-c', `mcp_servers.${id}.args=[${s.args.map(tomlString).join(', ')}]`);
    }
    if (s.env && Object.keys(s.env).length > 0) {
      const table = Object.entries(s.env)
        .map(([k, v]) => `${tomlKey(k)} = ${tomlString(expandEnvValue(v, env))}`)
        .join(', ');
      args.push('-c', `mcp_servers.${id}.env={${table}}`);
    }
  }
  return args;
}
