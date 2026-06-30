/**
 * lib/channel-server.js — Serveur MCP channel Claude Code pour byan_web.
 *
 * POURQUOI ce fichier est une factory et non un entrypoint direct :
 * la même factory est importée par channel-entry.js (entrypoint stdio pour
 * --dangerously-load-development-channels) ET par les tests, sans effet de
 * bord transport au import-time.
 *
 * Protocole Channel (research preview CC v2.1.80+) :
 *   - capabilities.experimental['claude/channel'] = {}
 *     -> CC enregistre un listener de notification
 *   - mcp.notification({ method: 'notifications/claude/channel', params })
 *     -> event injecté dans la session CC comme <channel source="byan" ...>
 *   - reply tool "byan_session_reply" (capabilities.tools = {})
 *     -> CC appelle le tool quand Claude veut répondre
 *
 * Gate sender : le poll utilise BYAN_API_TOKEN (scope user). La barrière
 * anti-injection est le RBAC owner côté serveur byan_web ; ce channel ne
 * reçoit que les messages des sessions du user authentifié.
 */

import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { startPollLoop } from './channel-poll.js';

/** Intervalle de poll par défaut (ms). Exposé pour override dans les tests. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * Reply tool : Claude l'appelle pour renvoyer une réponse vers byan_web.
 *
 * Hypothèse F2b : POST /api/sessions/:session_id/reply { content }
 *   -> { ok: true }
 * Le nom du tool côté CC sera mcp__byan-channel__byan_session_reply.
 */
const REPLY_TOOL = {
  name: 'byan_session_reply',
  description:
    'Reply to a user message received from byan_web. Call this when a <channel source="byan"> event arrives and a response is expected. Pass the session_id from the event meta attribute and the text to send back.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session_id from the inbound <channel> event meta.',
      },
      content: {
        type: 'string',
        description: 'The reply text to send back to the user in byan_web.',
      },
    },
    required: ['session_id', 'content'],
    additionalProperties: false,
  },
};

/**
 * Crée un serveur MCP channel byan sans le connecter (transport séparé).
 * Accepte un fetchImpl pour permettre le mock en test.
 *
 * @param {object} opts
 * @param {string}   opts.apiUrl        Base URL byan_web
 * @param {string}   opts.apiToken      Token du user (ApiKey scheme si préfixe byan_)
 * @param {number}   [opts.intervalMs]  Override intervalle de poll (tests)
 * @param {object}   [opts.fetchImpl]   Override fetch (tests)
 * @returns {Server} Instance MCP Server (non connectée)
 */
export function createChannelServer({ apiUrl, apiToken, intervalMs, fetchImpl } = {}) {
  const fetchFn    = fetchImpl ?? globalThis.fetch;
  const interval   = intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const authHeader = () => {
    if (!apiToken) return {};
    const scheme = apiToken.startsWith('byan_') ? 'ApiKey' : 'Bearer';
    return { Authorization: `${scheme} ${apiToken}` };
  };

  const mcp = new Server(
    { name: 'byan-channel', version: '0.1.0' },
    {
      capabilities: {
        // Clé qui fait de ce serveur un channel CC.
        // CC enregistre un listener de notification sur cette capability.
        experimental: { 'claude/channel': {} },
        // tools: {} requis pour que CC découvre les tools de réponse.
        tools: {},
      },
      // Instructions injectées dans le system prompt CC.
      // Dis à Claude : les events arrivent comme <channel source="byan" ...>,
      // il doit répondre via byan_session_reply en passant session_id.
      instructions:
        'Events from byan_web arrive as <channel source="byan" session_id="..." msg_id="...">. ' +
        'When a user message arrives, read it and reply using the byan_session_reply tool, ' +
        'passing the session_id from the tag attribute. ' +
        'Do not reply if the event is a system notification (no reply expected).',
    }
  );

  // Découverte des tools par CC.
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [REPLY_TOOL],
  }));

  // Appel du reply tool par Claude.
  mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;

    if (name === 'byan_session_reply') {
      const { session_id, content } = args;
      if (!session_id || !content) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: session_id and content are required.' }],
        };
      }
      if (!apiToken) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: BYAN_API_TOKEN is not configured.' }],
        };
      }

      // Hypothèse F2b : POST /api/sessions/:session_id/reply { content }
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8_000);
        let res;
        try {
          res = await fetchFn(
            `${apiUrl}/api/sessions/${encodeURIComponent(session_id)}/reply`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...authHeader(),
              },
              body: JSON.stringify({ content }),
              signal: ctrl.signal,
            }
          );
        } finally {
          clearTimeout(timeout);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: byan_web replied ${res.status} — ${text}` }],
          };
        }

        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, session_id }) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error sending reply: ${err.message}` }],
        };
      }
    }

    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  });

  // Boucle de poll : démarrée après la connexion transport pour que
  // mcp.notification() ait un transport actif. La connexion est gérée par
  // l'entrypoint ; ici on expose startPolling() pour que l'entrypoint
  // démarre la boucle au bon moment.
  let pollLoop = null;

  /**
   * Démarre la boucle de poll. Appeler APRÈS mcp.connect(transport).
   * Retourne { stop } pour arrêter proprement.
   */
  function startPolling() {
    if (!apiUrl || !apiToken) {
      process.stderr.write(
        '[byan-channel] BYAN_API_URL ou BYAN_API_TOKEN manquant — poll désactivé\n'
      );
      return { stop: () => {} };
    }

    pollLoop = startPollLoop({
      apiUrl,
      apiToken,
      intervalMs: interval,
      fetchImpl: fetchFn,
      onMessage: async (msg) => {
        // Émettre la notification CC pour chaque message outbox.
        // meta : chaque clé devient un attribut sur le tag <channel>.
        // Les clés contenant des tirets sont silencieusement ignorées par CC
        // (constraint doc) ; on n'utilise que des underscores.
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: msg.content ?? '',
            meta: {
              session_id: String(msg.session_id),
              msg_id:     String(msg.id),
              ...(msg.meta && typeof msg.meta === 'object' ? msg.meta : {}),
            },
          },
        });
      },
    });

    return pollLoop;
  }

  // Attache startPolling sur le serveur pour l'entrypoint.
  mcp.startPolling = startPolling;

  return mcp;
}

/**
 * Lance le channel en mode stdio (entrypoint direct).
 * Appelé uniquement depuis channel-entry.js, pas depuis les tests.
 */
export async function runChannelStdio({ apiUrl, apiToken, intervalMs, fetchImpl } = {}) {
  const mcp = createChannelServer({ apiUrl, apiToken, intervalMs, fetchImpl });
  await mcp.connect(new StdioServerTransport());
  // La boucle de poll démarre APRÈS connect pour que la notification
  // ait un transport actif.
  mcp.startPolling();
  // Le process reste vivant grâce au transport stdio.
}
