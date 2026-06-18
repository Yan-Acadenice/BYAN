# BYAN remote connector — OAuth 2.1 per-member identity

> Goal: let a Claude.ai Team **org connector** carry per-member identity. A
> Claude.ai org connector cannot send custom auth headers and has no per-member
> token passthrough (GitHub anthropics/claude-code#44980), so the ONLY way each
> member reaches byan_web as themselves is OAuth: the connector is an OAuth
> protected resource, byan_web is the authorization server, and each member
> signs in through the existing Authentik SSO.
>
> This runbook covers the OAuth layer (FD#5). The API-key-paste channel
> (FD#4, `docs/connector-admin-runbook.md`) still works and remains the
> fallback. Both mint a `byan_` API key; OAuth just automates the mint behind
> the standard authorization-code + PKCE flow.

## What is built (in-repo, shipped)

byan_web (authorization server):

- `GET /.well-known/oauth-authorization-server` (RFC 8414) — advertises issuer,
  `authorization_endpoint`, `token_endpoint`, `code_challenge_methods_supported: ['S256']`.
- `GET /authorize` (RFC 6749 §4.1) — resolves the member from the Authentik SSO
  headers (`x-authentik-*` + the `X-Byan-Sso-Trust` proof), auto-consents (no
  extra screen), persists a single-use hashed authorization code, 302s back to
  the client `redirect_uri?code=&state=`.
- `POST /token` (RFC 6749 §4.1.3) — `application/x-www-form-urlencoded`, consumes
  the code atomically, re-verifies the exact `redirect_uri` and PKCE S256, mints
  a short-TTL (~1h) revocable `byan_` API key as the access token.
- `oauth_codes` table (sqlite migration `060`, pg `0023` + baseline), single-use
  via `UPDATE … WHERE used=0` + `changes===1`, expiry checked in JS.

Connector (`_byan/mcp/byan-mcp-server/server-http.js`, OAuth protected resource):

- `GET /.well-known/oauth-protected-resource` (+ the path-suffixed
  `/.well-known/oauth-protected-resource/mcp` variant, RFC 9728) — `{ resource,
  authorization_servers: [issuer] }`, origin derived from the request Host.
- `POST/GET /mcp` validates the caller's Bearer per-request against byan_web
  `GET /api/auth/me` (loopback) BEFORE any tool runs; non-2xx / network error /
  timeout all **fail closed**. An unauthenticated hit gets
  `401 + WWW-Authenticate: Bearer resource_metadata="…"` so a Claude.ai
  connector can bootstrap the flow.

## Pre-register the client (no DCR in v1)

Dynamic Client Registration (RFC 7591) is **deferred**. Pre-register Claude.ai's
client id instead:

```
BYAN_OAUTH_ALLOWED_CLIENT_IDS=claude-ai
```

`claude-ai` is the default. If Claude.ai presents a different client id at the
pilot (a live-verify item below), add it to the comma-separated list and
redeploy byan_web. `/authorize` rejects an unknown client id with
`unauthorized_client` before any redirect.

## Environment (byan_web)

| Var | Role | Production value (example) |
|-----|------|----------------------------|
| `BYAN_OAUTH_ISSUER` | issuer; host that serves `/.well-known/oauth-authorization-server` | `https://byan-api.<domain>` |
| `BYAN_OAUTH_AUTHORIZE_URL` | absolute `/authorize` URL advertised in metadata | `https://byan.<domain>/authorize` |
| `BYAN_OAUTH_TOKEN_URL` | absolute `/token` URL advertised in metadata | `https://byan-api.<domain>/token` |
| `BYAN_OAUTH_ALLOWED_CLIENT_IDS` | allowlist of pre-registered client ids | `claude-ai` |

## Environment (connector)

| Var | Role | Production value (example) |
|-----|------|----------------------------|
| `BYAN_OAUTH_ISSUER` | authorization server the connector trusts (must match byan_web `BYAN_OAUTH_ISSUER`) | `https://byan-api.<domain>` |
| `BYAN_API_URL` | byan_web API base for the per-request `/api/auth/me` validation (loopback) | `http://byan-api:3737` (internal) |
| `BYAN_MCP_BEARER_TIMEOUT_MS` | per-request validation timeout, fail-closed on expiry | `5000` (default) |

The connector falls back to `BYAN_API_URL` for the issuer if `BYAN_OAUTH_ISSUER`
is unset — fine for a single-host dev, but in production set it explicitly to
the public issuer so the protected-resource metadata advertises the right
authorization server.

## F12 — Traefik routing (PROPOSED diff; deploy = operator)

The byan_web service sits behind two existing Traefik routers on one service
(`api/docker-compose.byan-api.yml`):

- `byan-api-secure` — `Host(byan-api.<domain>)`, middleware `byan-strip-trust`
  (clears any forged `X-Byan-Sso-Trust` / `x-authentik-*`), **no forwardauth**.
- `byan-ui-secure` — `Host(byan.<domain>)`, middlewares
  `authentik-byan` (forwardauth) + `byan-sso-trust` (injects the trust proof).

The OAuth endpoints split by trust requirement:

- `/token` and `/.well-known/oauth-authorization-server` are called by the
  Claude.ai backend with **no** Authentik cookie. They MUST land on a
  strip-trust, no-forwardauth route → the `byan-api-secure` router already does
  this. No change needed.
- `/authorize` is hit by the member's **browser**, which carries the Authentik
  session. It MUST traverse forwardauth so `x-authentik-*` + `X-Byan-Sso-Trust`
  are injected → the `byan-ui-secure` router already does this.

### The fork — single-host vs cross-host issuer

<!-- BYAN-BENCH:done g1=2 g2=2 scope=internal conf=lean -->

| Topology | OAuth metadata coherence | Authentik prerequisite | Traefik change | Niv |
|----------|--------------------------|------------------------|----------------|-----|
| **A — cross-host** (issuer+token on `byan-api`, authorize on `byan`) | issuer host ≠ authorize host | none — reuses existing routers as-is | **zero** (only the 3 env URLs) | L5 |
| **B — single-host** (issuer+token+authorize all on `byan-api`) | issuer host == authorize host (strict-client safe) | Authentik cookie/provider must cover `byan-api.<domain>` | one path-rule forwardauth router | L5 |

Lean **A (cross-host)** for the pilot: zero Traefik change, and RFC 8414 allows
endpoints on hosts other than the issuer (the metadata document declares them).
Promote to **B** only if the pilot shows Claude.ai rejects a cross-host issuer
(a live-verify item) — both are `[UNVERIFIED]` against Claude.ai's actual client
until the pilot runs.

### Option B label diff (only if the pilot forces single-host)

Adds a higher-priority router so `/authorize` on the API host gets forwardauth
while everything else on that host stays strip-trust:

```diff
   # --- byan-api-secure : API host, strip-trust, no forwardauth (existing) ---
   - "traefik.http.routers.byan-api-secure.entrypoints=websecure"
   - "traefik.http.routers.byan-api-secure.rule=Host(`${BYAN_API_HOST:-byan-api}.${DOMAIN_NAME}`)"
   - "traefik.http.routers.byan-api-secure.service=byan-svc"
   - "traefik.http.routers.byan-api-secure.middlewares=byan-strip-trust@docker"
   - "traefik.http.routers.byan-api-secure.tls=true"
   - "traefik.http.routers.byan-api-secure.tls.certresolver=letsencrypt"
+  # --- byan-api-authorize : /authorize on the API host THROUGH forwardauth ---
+  # Higher priority so it wins over byan-api-secure for the /authorize path.
+  # Authentik must issue a session cookie valid for byan-api.<domain> (widen
+  # the provider/cookie domain to *.<domain>) or this route loops to login.
+  - "traefik.http.routers.byan-api-authorize.entrypoints=websecure"
+  - "traefik.http.routers.byan-api-authorize.rule=Host(`${BYAN_API_HOST:-byan-api}.${DOMAIN_NAME}`) && PathPrefix(`/authorize`)"
+  - "traefik.http.routers.byan-api-authorize.priority=100"
+  - "traefik.http.routers.byan-api-authorize.service=byan-svc"
+  - "traefik.http.routers.byan-api-authorize.middlewares=authentik-byan@docker,byan-sso-trust@docker"
+  - "traefik.http.routers.byan-api-authorize.tls=true"
+  - "traefik.http.routers.byan-api-authorize.tls.certresolver=letsencrypt"
```

With B, set `BYAN_OAUTH_AUTHORIZE_URL=https://byan-api.<domain>/authorize`.

### SPA-fallback order (both options)

byan_web registers `/.well-known/oauth-authorization-server` and `/authorize` as
real routes BEFORE the SPA `index.html` fallback (`server.js`), so neither is
swallowed by the SPA. Keep that ordering: a route that resolves
`router.handle() === true` never reaches the static/SPA branch. No change
needed; do not move the OAuth mounts below the static handler.

## F13 — pilot procedure (1 member; live-verify; operator)

Run with ONE member before opening it to the org. Each step is a behavior that
is `[UNVERIFIED]` against Claude.ai's real client until observed here.

1. **Register the connector** on Claude.ai (org admin → Connectors → add remote
   MCP) pointing at `https://byan-mcp.<domain>/mcp`. Claude.ai reads the
   protected-resource metadata and discovers the authorization server.
2. **Cross-host issuer** — confirm Claude.ai accepts issuer `byan-api.<domain>`
   while `/authorize` is on `byan.<domain>`. If rejected, switch to Option B.
3. **Consent screen** — the flow auto-consents from the Authentik session
   (`/authorize` has no UI). Confirm the member is not shown a second consent and
   is not stuck on a blank screen.
4. **DCR** — confirm Claude.ai uses the pre-registered `claude-ai` client id and
   does NOT require dynamic client registration. If it presents another id, add
   it to `BYAN_OAUTH_ALLOWED_CLIENT_IDS`.
5. **Refresh** — v1 issues no refresh token; the ~1h access token expires and the
   member re-authorizes. Confirm Claude.ai re-runs `/authorize` cleanly at
   expiry rather than erroring. (Refresh tokens are a deferred enhancement.)
6. **CLI `/callback`** — if a member adds the same connector in Claude Code (CLI),
   confirm the loopback `http://localhost:<port>/callback` redirect is accepted
   by the `/authorize` allowlist (it is, per `lib/oauth-redirect.js`).

## Deferred (documented, not silently cut)

| Gap | Why deferred | Where it bites |
|-----|--------------|----------------|
| Dynamic Client Registration (RFC 7591) | pre-registered `claude-ai` covers the pilot | a new client id needs a redeploy of the allowlist |
| Refresh tokens | ~1h access token + re-authorize is acceptable for v1 | members re-auth hourly |
| `connector:read` scope enforcement | byan_web does not yet enforce `apiKeyScopes`; the minted key is full-capability (carried from FD#4) | the access token can do more than `connector:read` advertises — TTL + revocation bound the blast radius, not RBAC |
| Rate-limiting on `/token` / `/authorize` | not built in v1 | brute-force on the code endpoint is bounded only by the 60s code TTL + single-use |

The scope-enforcement gap is the most important to track: the OAuth metadata
advertises `connector:read`, but until byan_web enforces `apiKeyScopes` the
minted key carries the member's full API capability. The short TTL and
revocability are the mitigation; real scope enforcement is a separate
cross-cutting RBAC change.
