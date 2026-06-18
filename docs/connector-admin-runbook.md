# BYAN remote connector — admin runbook (Claude Team)

> Goal: make BYAN available to a whole Claude Team org via a remote MCP Org
> Connector, plus org-published skills. This runbook covers the in-repo
> enabling layer (shipped) and the hosting + enrollment layer now built in
> byan_web (F8).

> Status as of F8: the sidecar image, the Traefik route, and the per-member
> enrollment endpoint are all built. The remaining steps require a human at a
> terminal (DNS, docker build, docker compose up) or on Claude.ai (register
> the connector). Those gaps are called out explicitly -- they are not silent
> cuts.

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
- Skill bundles: `bin/byan-build-skill-bundles.js` emits one `.zip` per skill into
  `dist/skill-bundles/` — each archive is a single top-level folder + its SKILL.md,
  the exact shape Claude.ai org Skills requires (it rejects a flat SKILL.md and
  rejects a multi-skill archive, so there is no megabundle upload). The tracked
  drift ledger is `skill-bundles-manifest.json` (`--check`).

## Local run (verify the endpoint)

```
node _byan/mcp/byan-mcp-server/server-http.js
# listens on :8848/mcp (override with BYAN_MCP_HTTP_PORT / BYAN_MCP_HTTP_PATH)
curl -s localhost:8848/health
```

## Hosting — byan_web sidecar (BUILT, F8)

The hosting track previously listed as a cross-repo dependency is now built.
Below is what was added and how it is structured.

### Image

The connector runs as a Docker sidecar image built from
`~/BYAN/_byan/mcp/byan-mcp-server/Dockerfile` (node:22-slim + tini PID1,
`npm ci --omit=dev`, `CMD node server-http.js`). The image listens on `:8848`.

Anti-vendoring boundary: `byan_web` references the image by tag but does NOT
build it. The build is the operator's responsibility on the deploy host.

    # Run once on the deploy host before `docker compose up`
    docker build -t byan-mcp-connector:latest /home/yan/BYAN/_byan/mcp/byan-mcp-server

Note: the `:latest` tag is used in the current compose file. A pinned immutable
tag (e.g. `byan-mcp-connector:2.28.0`) is deferred to F11.

### Compose service

`byan-mcp-connector` is declared in
`byan_web/api/docker-compose.byan-api.yml`. Key properties:

- `BYAN_API_URL=http://byan-api:3737` — loopback DNS on the Docker user-defined
  network (`proxy` / `admin_proxy`); no traversal through Traefik.
- `BYAN_MCP_HTTP_PORT=8848`
- No `BYAN_API_TOKEN` in the environment (enforced by `assertNoAmbientToken` at
  boot — see Security invariants below).
- `depends_on: byan-api: condition: service_healthy`
- Healthcheck: `wget -qO- http://127.0.0.1:8848/health`

### Traefik route

Router `byan-mcp-secure` maps `byan-mcp.<domain>` to port 8848:

- Entrypoint: `websecure`
- TLS: `certresolver=letsencrypt`
- Middleware: `byan-strip-trust@docker` (strips `X-Byan-Sso-Trust` and
  `X-Authentik-Username` injected upstream by Authentik)
- No `forwardauth` Authentik middleware — the connector authenticates via the
  per-request `Authorization` header, not the SSO session

The `BYAN_MCP_HOST` env var overrides the subdomain prefix (default: `byan-mcp`).

---

## Per-member enrollment (BUILT, F8)

### Endpoint

`POST /api/connector/link` — declared in
`byan_web/api/routes/connector-link.js`, guarded by `authRequired`.

Behavior:

- First call: mints a personal `byan_` API key (`name='claude-connector'`,
  `scopes=['connector:read']`). The raw key is returned exactly once in the
  `201` response under `data.key`. The key hash is stored (sha256-at-rest); the
  raw value is never persisted.
- Subsequent calls (idempotent): returns `{ linked: true, keyId, last_used_at }`
  — no re-mint, raw key not re-exposed.
- Self-scoped: `body.userId` / `body.user_id` are ignored; the key always belongs
  to the authenticated caller.
- Bounded TTL: the minted key carries a 90-day `expires_at`. After expiry, the
  next `POST /api/connector/link` transparently mints a fresh key (the member
  re-runs enrollment). This bounds the blast radius of a leaked key.

### Enrollment steps for one member

1. The member logs in to `byan.<domain>` via Authentik SSO (they need an
   existing byan_web account).
2. The member calls `POST /api/connector/link` (any authenticated HTTP client,
   or the byan_web UI if wired). The response contains the raw key under
   `data.key` -- copy it immediately; it is not shown again.
3. The member adds the remote connector in Claude.ai:
   - Claude.ai -> Organization settings -> Connectors -> Add custom connector
   - URL: `https://byan-mcp.<domain>/mcp`
   - Authorization header: `ApiKey byan_xxxxxxxx` (paste the key from step 2)
4. Verify: send `byan_ping` and `byan_list_projects` from Claude.ai. Both should
   return data scoped to that member's account only.

An unlinked member (no `Authorization` header, or an invalid token) receives a
degraded response -- "link your byan_web account" -- never a default identity.

---

## Pilot procedure (1 member, before org-wide rollout)

Run this before publishing the connector to the entire org.

1. Deploy the sidecar on the byan_web host (operator step -- see gaps below).
2. One pilot member follows the enrollment steps above.
3. Verify isolation: confirm `byan_ping` and `byan_list_projects` return only
   that member's projects, not projects belonging to other users.
4. Monitor `api_keys.last_used_at` for the pilot key for 48 hours. Check for
   unexpected call volume or error patterns in the byan_web API logs.
5. Only after 48 hours of clean pilot: register the connector as an org-wide
   connector on Claude.ai and communicate the enrollment URL to all members.

If any isolation issue is found in step 3, stop. Do not proceed to org-wide
rollout until the issue is diagnosed and fixed.

---

## Security invariants

These are enforced in code and must remain true after any future change:

- **No ambient token on the sidecar.** `assertNoAmbientToken` in `server-http.js`
  throws at boot if `BYAN_API_TOKEN` is present in the process environment. A
  deploy that accidentally sets this variable will fail loudly, not silently
  collapse all callers onto one identity. The compose service deliberately omits
  this variable.
- **Per-request identity only.** `resolveCallerToken` in `remoteOnly` mode never
  falls back to `process.env.BYAN_API_TOKEN`. Two concurrent Team members hitting
  the same endpoint use their own tokens, not a shared one.
- **Read-only remote surface.** `remoteOnly: true` constrains the exposed tools to
  `REMOTE_SAFE_TOOLS` — a read-only, byan_web-backed allowlist. Stateful,
  filesystem-local, and write tools are refused on the remote transport.
- **No Authentik identity headers.** The connector does not read `x-authentik-*`
  headers for identity. `byan-strip-trust` strips `X-Byan-Sso-Trust` and
  `X-Authentik-Username`; the remaining `x-authentik-*` headers are not stripped
  by the middleware. The security guarantee comes from the connector never reading
  them -- the applicative invariant is the real gate.
- **Key hash only.** The raw `byan_` key is never stored. Only the sha256 hash is
  persisted. The raw key is returned once at mint time and is unrecoverable after
  that.
- **The connector key is full-capability -- treat it as a secret.** byan_web does
  not yet enforce `api_key` scopes server-side, so `scopes=['connector:read']` is a
  forward-looking label, not an enforced limit. The minted key is a full read/write
  byan_web user key; its read-only behaviour is enforced only at the MCP transport
  (`REMOTE_SAFE_TOOLS`), not at the credential. A holder of the raw key could call
  byan_web directly (e.g. `curl`) with the member's full privileges, bypassing the
  transport allowlist. Mitigations in place: a 90-day TTL (`expires_at`) bounds the
  exposure window, and the key is revocable via `DELETE /api/auth/api-keys/:id`.
  Because the key lives in the Claude.ai connector config (a third-party surface),
  members must treat it as a sensitive secret. Enforcing the scope server-side is a
  follow-up (a cross-cutting RBAC change, deliberately out of this scope).

---

## Revocation

Revoke a connector key via `DELETE /api/auth/api-keys/:id` (user-scoped,
authenticated). This is the existing key-management endpoint.

Note: `api_keys` has no `active` column. Revocation is by `expires_at` or
`DELETE` -- there is no soft-disable flag. A named wrapper endpoint
`DELETE /api/connector/link` is deferred to F9.

Backstop: every connector key auto-expires after 90 days (the mint-time
`expires_at` TTL). A forgotten or leaked key therefore cannot be used
indefinitely; the member simply re-runs enrollment to mint a fresh one.

---

## What is deferred

- **OAuth flow.** The current enrollment is key-paste. An OAuth authorize/token/
  PKCE flow is deferred. Before building it, reconfirm against the current
  Claude.ai documentation that Team org connectors accept a per-request API key
  (not only OAuth tokens) -- do not build OAuth on an assumption.
- **Pinned image tag.** The compose file uses `byan-mcp-connector:latest`. A
  pinned immutable tag is deferred to F11.
- **DELETE /api/connector/link wrapper.** Deferred to F9.

---

## Operator gaps (not automatable by the agent)

The following steps cannot be performed by the agent. They require a human at a
terminal or on Claude.ai:

1. Create the DNS record `byan-mcp.<domain>` pointing to the byan_web host.
2. On the deploy host, build and tag the sidecar image:
   `docker build -t byan-mcp-connector:latest /home/yan/BYAN/_byan/mcp/byan-mcp-server`
3. Bring the sidecar up:
   `docker compose -f api/docker-compose.byan-api.yml up -d byan-mcp-connector`
4. Register the connector on Claude.ai (Organization settings -> Connectors).
5. Run the 48-hour pilot and confirm isolation before org-wide rollout.
6. Push branches and PRs (the server cannot push to GitHub -- ask the operator).

---

## Admin steps (org-wide, after pilot)

1. **Add the connector**: Claude.ai -> Organization settings -> Connectors ->
   add the custom remote MCP connector pointing at `https://byan-mcp.<domain>/mcp`.
2. **Members enroll**: each member follows the per-member enrollment steps above
   (log in, POST /api/connector/link, paste key into the connector config).
   An unlinked member is degraded gracefully, never assigned a default identity.
3. **Publish skills**: run `node _byan/mcp/byan-mcp-server/bin/byan-build-skill-bundles.js`,
   then upload each per-skill `.zip` from `dist/skill-bundles/` to Claude.ai ->
   Organization settings -> Skills, ONE archive at a time (Claude accepts one skill
   per `.zip` = one top-level folder + SKILL.md; a multi-skill archive is rejected).
   Skills are static snapshots, so re-upload after a skill changes (the pre-commit
   drift gate keeps the repo side
   honest).

## The two auth channels — do not cross them

| Channel | Where the token lives | Used by |
|---------|-----------------------|---------|
| Connector (remote) | per-request `Authorization` header (`ApiKey byan_xxxxxxxx`, per-member key from `/api/connector/link`; OAuth deferred) | Claude.ai Team web + Claude Code via the org connector |
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
