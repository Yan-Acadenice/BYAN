# BYAN MCP remote connector — sidecar of the byan_web API.
#
# Serves server-http.js (stateless streamable-HTTP, per-request identity) on
# :8848. Identity is carried by the per-request Authorization header ONLY;
# server-http.js asserts at boot that BYAN_API_TOKEN is NOT in the env, so this
# image must never be run with that token set (see assertNoAmbientToken).
#
# Patterned on /home/yan/byan_web/api/Dockerfile (node:22-slim + tini PID1 +
# wget for the HEALTHCHECK). node:22-slim ships WITHOUT wget, so it is installed
# explicitly here; otherwise the HEALTHCHECK below could never run.
FROM node:22-slim

# tini : PID 1 reaper. wget : HEALTHCHECK probe (absent from node:22-slim).
# ca-certificates : TLS roots for any outbound HTTPS (byan_web over the network).
# wget --version asserts the probe binary is really present, so the HEALTHCHECK
# is never silently broken by an upstream base-image change.
RUN apt-get update && apt-get install -y --no-install-recommends tini wget ca-certificates \
  && wget --version >/dev/null \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Lockfile is present in the repo -> npm ci (reproducible, lockfile-pinned).
# npm ci REQUIRES a lockfile and would fail without one; the manifest is copied
# before the source so this layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 8848

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8848/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "server-http.js"]
