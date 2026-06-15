# Leantime integration (one-way FD -> board)

BYAN can mirror its Feature Development (FD) lifecycle onto a self-hosted
Leantime board. The link is one-way: the FD workflow drives the Leantime board;
the board does not drive FD. The integration is optional and best-effort — when
it is not configured, or Leantime is unreachable, every FD phase still advances.

## What it does

When configured, the FD workflow fires `byan_leantime_*` MCP tools at phase
events:

| FD phase / event | Effect on the board |
|------------------|---------------------|
| DISCOVERY (project confirmed) | create-or-fetch the Leantime project |
| DISPATCH (per backlog feature) | one task per feature |
| BUILD (feature starts) | task -> column `doing` |
| REVIEW needs-rework / VALIDATE KO | task -> column `blocked` |
| VALIDATE OK | task -> column `review` |
| DOC done / feature completed | task -> column `done` |

The FD lifecycle columns (`todo|doing|blocked|review|done`) are resolved to the
project's configured Leantime status ids at call time (statuses are per-project
ints), with a conservative fallback when the labels cannot be read.

## Configuration

Two environment variables drive the integration. They are distinct from
`BYAN_API_URL` (byan_web) — Leantime is a separate backend.

| Var | Role |
|-----|------|
| `LEANTIME_API_URL` | Base of the Leantime instance: the host that serves `/api/jsonrpc` (the backend), without a trailing `/api` — the client appends `/api/jsonrpc`. |
| `LEANTIME_API_TOKEN` | The Leantime API key, sent as the `x-api-key` header. |
| `LEANTIME_CLIENT_ID` | Optional. clientId for project creation (otherwise the first client returned, else 1). |

Put the secret in `.claude/settings.local.json` (gitignored), out of any tracked
file:

```json
{
  "env": {
    "LEANTIME_API_URL": "https://your-leantime-host",
    "LEANTIME_API_TOKEN": "lt_xxxxxxxx"
  }
}
```

`.mcp.json` references these as `${LEANTIME_API_URL}` / `${LEANTIME_API_TOKEN}`
(env expansion), so the secret stays out of version control. Reconnect the MCP
server after editing `settings.local.json`.

When the pair is absent, the `byan_leantime_*` tools report `enabled: false` and
the FD proceeds unchanged.

## Generating the Leantime API key

Verified against Leantime source (3.7.x). Two credential types, both sent as the
`x-api-key` header.

### API key (service account — recommended for BYAN)

1. Log in to Leantime with an Admin or Owner account.
2. Open **Company Settings** (cogs icon). In a French UI the tab is labeled
   **"Cle d'API"** (i18n key `tabs.apiKeys`), not "API" — a common reason the
   option seems missing.
3. Click **Generate API Key**, set a role + project scope, then Save.
4. Copy the secret at once — it is shown one time, then hashed in the database.
   The value carries an `lt_` prefix.

Direct URL to the create form: `{host}/api/newApiKey`. A redirect to a 403 there
means the account is below the role gate (`NewApiKey::run()` requires
owner/admin); that gate is the usual reason a non-admin user does not see the
menu.

In Leantime an API key is implemented as a service user
(`zp_user.source='api'`), so there is no separate "api keys" database table.

### Personal Access Token (per user)

Profile -> "Personal Access Tokens" tab. This tab is present when the Advanced
Auth plugin is installed (self-hosted). Without it, use the API key above.

There is no `.env` flag to enable the API: `/api/jsonrpc` is part of Leantime
core; the access barrier is the role.

## Tools

| Tool | Role |
|------|------|
| `byan_leantime_ping` | Healthcheck: reports api_url, token_configured, enabled, reachable. Does not throw. |
| `byan_leantime_project_ensure` | Create-or-fetch a project by name (idempotent), returns the id. |
| `byan_leantime_task_create` | Create a task from a backlog item, returns the task id. |
| `byan_leantime_task_move` | Move a task to a column (`todo\|doing\|blocked\|review\|done`). |
| `byan_leantime_task_assign` | Set the assignee (editorId). |
| `byan_leantime_task_get` | Read a task by id. |
| `byan_leantime_board_get` | Read a project board grouped by column. |

Every tool except `byan_leantime_ping` is gated by `requireLeantime` (returns a
clear error when the env pair is absent rather than calling an unconfigured
host).

## Troubleshooting

Each call returns `{ ok, synced, reason? }`. A non-synced result surfaces a
reason instead of pretending the board moved:

| reason | meaning + fix |
|--------|---------------|
| `no_base` / `no_token` | The integration is off (env not set). Configure the pair. |
| `non_json` | `LEANTIME_API_URL` points at the Leantime UI host, which returned an HTML login page instead of JSON-RPC. Point it at the backend host that serves `/api/jsonrpc`. |
| `timeout` / `http_<status>` / `rpc_error` | Transient or wire issue. The FD phase still advances; the move retries at the next phase event. |
| `create_rejected` | The server returned a falsy id for a create. Inspect the returned data. |
| `unresolved_status` | A column could not be mapped to a Leantime status id for this project. |

## Security

The API key lives only in `.claude/settings.local.json` (gitignored at both repo
and global level). The tracked `.mcp.json` carries only `${...}` placeholders.
`byan_leantime_ping` reports `token_configured` as a boolean and does not echo
the token.

## See also

- Agent-facing reference (compact): `.claude/rules/byan-api.md` section 8.
- FD wiring (fire points per phase): `.claude/skills/byan-byan/SKILL.md` section 2.5.
