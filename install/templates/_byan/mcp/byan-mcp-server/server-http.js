#!/usr/bin/env node
/**
 * Remote HTTP entrypoint for the BYAN MCP server.
 *
 * Mounts the SAME tool surface as the stdio server (via createByanServer()
 * from server.js) over a streamable-HTTP transport, so BYAN can be added as a
 * remote Org Connector on Claude.ai Team (and reused by Claude Code as a remote
 * connector). The stdio path in server.js is untouched.
 *
 * STATELESS by design: a fresh Server + transport is built per request
 * (sessionIdGenerator: undefined), so concurrent Team members hitting the
 * shared endpoint never share in-process session state. Caller identity comes
 * from the per-request Authorization header (threaded in F3), NOT from a
 * server-held session.
 *
 * The streamable-HTTP transport handles BOTH the POST request leg and the
 * GET SSE streaming leg on the same path, so a separate legacy SSEServerTransport
 * (`/sse` + `/messages`) is intentionally NOT mounted here: Claude.ai and modern
 * MCP clients negotiate streamable-HTTP. Legacy-SSE support is deferred (see the
 * FD REVIEW note) rather than bolted onto a stateless server it is at odds with.
 *
 * This file ships the transport shell. Going live for the org still requires the
 * cross-repo byan_web work (public hosting + TLS + per-user OAuth); see
 * docs/connector-admin-runbook.md.
 */
import http from 'node:http';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createByanServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);

const PORT = Number(process.env.BYAN_MCP_HTTP_PORT || process.env.PORT || 8848);
const MCP_PATH = process.env.BYAN_MCP_HTTP_PATH || '/mcp';
const BODY_LIMIT_BYTES = 4 * 1024 * 1024; // 4 MiB cap, reject oversized payloads

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Extract the caller's bare byan_web token from the Authorization header.
 * Accepts "ApiKey <t>", "Bearer <t>", or a bare token — authHeadersFor re-adds
 * the scheme from the token prefix, so any scheme is stripped here. Returns
 * undefined when no usable token is present (the server then degrades like the
 * local no-token path rather than acting as a default identity).
 */
function bearerFromReq(req) {
  const h = req.headers && req.headers.authorization;
  if (!h || typeof h !== 'string') return undefined;
  const m = h.match(/^\s*(?:ApiKey|Bearer)\s+(.+?)\s*$/i);
  const tok = (m ? m[1] : h).trim();
  return tok || undefined;
}

/**
 * Handle one MCP request statelessly: build a fresh server bound to THIS
 * caller's token + a fresh transport, connect, delegate to the SDK transport,
 * and tear both down when the response closes. The per-request token is what
 * keeps concurrent Team members from sharing an identity.
 */
async function handleMcp(req, res) {
  // remoteOnly: the remote connector exposes only the read-only MVP allowlist.
  const server = createByanServer({ token: bearerFromReq(req), remoteOnly: true });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close().catch(() => {});
    if (typeof server.close === 'function') server.close().catch(() => {});
  });
  await server.connect(transport);
  const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
  await transport.handleRequest(req, res, body);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, transport: 'streamable-http', path: MCP_PATH });
      return;
    }
    if (url.pathname === MCP_PATH) {
      await handleMcp(req, res);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: (err && err.message) || 'internal error' });
    } else {
      res.end();
    }
  }
});

// Entrypoint guard: listen ONLY when this file is the process entrypoint, so a
// test can import { httpServer, handleMcp } without binding a port.
const isHttpEntrypoint =
  process.argv[1] &&
  nodePath.resolve(process.argv[1]) === nodePath.resolve(__filename);

/**
 * Defense-in-depth: reject boot if BYAN_API_TOKEN is present in env.
 * WHY: identity on the remote connector is per-request only — resolveCallerToken
 * already ignores env.BYAN_API_TOKEN in remoteOnly mode, so this is NOT the only
 * gate. It is an explicit startup assertion so a misconfigured deploy (shared token
 * accidentally set in the process env) fails loudly rather than silently collapsing
 * all callers onto one identity. Pure function so tests can call it without side effects.
 */
export function assertNoAmbientToken(env) {
  if (env && env.BYAN_API_TOKEN) {
    throw new Error(
      'BYAN_API_TOKEN must not be set on the remote connector: identity is per-request only ' +
      '(a shared ambient token would collapse all callers onto one identity). Refusing to start.'
    );
  }
}

if (isHttpEntrypoint) {
  try {
    assertNoAmbientToken(process.env);
  } catch (e) {
    console.error('[byan-mcp-http] FATAL:', e.message);
    process.exit(1);
  }
  httpServer.listen(PORT, () => {
    // stderr: stdout is reserved for MCP protocol on the stdio path; here we
    // just log startup so it never pollutes a client's parse.
    console.error(`[byan-mcp-http] listening on :${PORT}${MCP_PATH} (stateless streamable-HTTP)`);
  });
}

export { httpServer, handleMcp, MCP_PATH, PORT };
