# BYAN remote connector — admin runbook (Claude Team)

> Goal: make BYAN available to a whole Claude Team org via a remote MCP Org
> Connector, plus org-published skills. This runbook covers the in-repo
> enabling layer (shipped) and the cross-repo byan_web work it depends on
> (separate track).

## Two surfaces, one connector

Claude Team has two distinct surfaces:

- **Claude.ai Team** (web/desktop): seats, Projects, Artifacts, Org Connectors,
  org-published Skills. A local stdio MCP server does not work here — a **remote**
  MCP endpoint (HTTP/SSE) added as an Org Connector is required.
- **Claude Code** (CLI/IDE): reads a per-repo `.claude/` config; an org connector
  added on Claude.ai also syncs down to Claude Code.

The remote connector is the spine: one endpoint serves both surfaces.

## What ships in this repo (the enabling layer)

- `server.js` — `createByanServer({ token, remoteOnly })` factory. The stdio path
  (`node server.js`) is unchanged.
- `server-http.js` — a stateless streamable-HTTP transport on `POST/GET /mcp`
  (plus `/health`). The streamable-HTTP transport carries the SSE streaming leg
  itself, so no separate legacy `/sse` endpoint is mounted.
- Per-request identity: the caller's token is read from each request's
  `Authorization` header and threaded through the byan_web calls, so two members
  on the shared endpoint reach byan_web with their own token (not a shared one).
- Remote-safe surface: `remoteOnly` exposes only `REMOTE_SAFE_TOOLS` — a
  read-only, byan_web-backed allowlist (`byan_ping`, `byan_list_projects`, the
  read `byan_api_*` tools). Stateful / filesystem-local / write tools stay
  stdio-only and are refused on the remote transport. The `byan-lint-remote-safe`
  check guards the allowlist.
- Skill bundles: `bin/byan-build-skill-bundles.js` emits one `.zip` per skill and
  five per-module megabundles into `dist/skill-bundles/`, with
  `skill-bundles-manifest.json` as the tracked drift ledger (`--check`).

## Local run (verify the endpoint)

```
node _byan/mcp/byan-mcp-server/server-http.js
# listens on :8848/mcp (override with BYAN_MCP_HTTP_PORT / BYAN_MCP_HTTP_PATH)
curl -s localhost:8848/health
```

## Cross-repo dependency (byan_web) — required for go-live

The org-wide go-live depends on work in the separate **byan_web** repo/host,
which is not part of this repo:

1. **Public hosting + TLS** for `server-http.js` (co-host on the byan_web box so
   the connector and the REST API share domain/deploy; the tool's outbound fetch
   becomes a loopback call).
2. **Per-user auth**: an OAuth flow (or per-member API key) so each Claude member
   maps to their own byan_web user. byan_web already scopes every call to a user
   via its API key, so this is a connector-side mapping, not a new tenancy model.

Until (1) and (2) are in place, the connector code is ready and tested but not
yet reachable by the org.

## Admin steps (once hosting is up)

1. **Add the connector**: Claude.ai -> Organization settings -> Connectors ->
   add the custom remote MCP connector pointing at the hosted `/mcp` URL.
2. **Members authenticate**: each member runs the connector's auth once; an
   unlinked member is degraded with a "link your byan_web account" message rather
   than acting as a default identity.
3. **Publish skills**: run `node _byan/mcp/byan-mcp-server/bin/byan-build-skill-bundles.js`,
   then upload the per-module megabundle `.zip` files from `dist/skill-bundles/`
   to Claude.ai -> Organization settings -> Skills. Skills are static snapshots, so
   re-upload after a skill changes (the pre-commit drift gate keeps the repo side
   honest).

## The two auth channels — do not cross them

| Channel | Where the token lives | Used by |
|---------|-----------------------|---------|
| Connector (remote) | per-request `Authorization` header (per-user OAuth/API key) | Claude.ai Team web + Claude Code via the org connector |
| Local (`${BYAN_API_TOKEN}`) | `.claude/settings.local.json` / `.env` (gitignored) | the local stdio server (`node server.js`) for a single developer |

These are separate paths. The local env token is the single-developer fallback;
the connector identity is per-member. Mixing them (e.g. a shared service token on
the connector) would collapse members onto one identity — which is why the
per-request path exists.

## Scope note (state on Claude.ai)

Claude.ai Projects and Artifacts have no external API, so BYAN state is not
synced into them. byan_web stays the authority for FD / strict / project state;
the connector exposes that state live in-chat. A manual `byan_insight_digest`
export can be pasted into a Project knowledge base when a frozen snapshot is
wanted.

## See also

- `.claude/rules/byan-api.md` — the byan_web API + MCP tool families.
- `docs/leantime-integration.md` — the Leantime board sync (separate backend).
