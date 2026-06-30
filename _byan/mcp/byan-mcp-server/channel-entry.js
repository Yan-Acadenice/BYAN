#!/usr/bin/env node
/**
 * channel-entry.js — Entrypoint stdio du channel MCP byan pour Claude Code.
 *
 * POURQUOI un fichier séparé de server.js : le channel est un serveur MCP
 * distinct du serveur principal byan-mcp. Claude Code le spawne comme un
 * subprocess indépendant via --dangerously-load-development-channels.
 * server.js ne doit pas acquérir le transport channel comme effet de bord.
 *
 * Commande de lancement (research preview) :
 *   claude --dangerously-load-development-channels server:byan-channel
 *
 * Enregistrement dans .mcp.json (section mcpServers) — exactement ce que pose
 * l'installeur : chemin RELATIF au projectRoot (portable, jamais absolu) et env
 * VIDE (la config est resolue au boot via resolveConfig ci-dessous ; aucun secret
 * n'est ecrit dans .mcp.json qui est tracke par git) :
 *   "byan-channel": {
 *     "command": "node",
 *     "args": ["_byan/mcp/byan-mcp-server/channel-entry.js"],
 *     "env": {}
 *   }
 *
 * Voie plugin (Phase 2, non implémentée ici) :
 *   Wrapper le channel-entry.js dans un plugin Claude Code et l'enregistrer
 *   dans la marketplace pour qu'il soit accessible via
 *   --channels plugin:byan-channel@byan-marketplace.
 *   Nécessite que le channel soit sur l'allowlist Anthropic ou sur la liste
 *   allowedChannelPlugins de l'organisation (Enterprise).
 */

import { resolveConfig } from './lib/resolve-config.js';
import { runChannelStdio } from './lib/channel-server.js';

// Config : même resolver que server.js (env -> ~/.byan/credentials.json -> défauts).
const config = resolveConfig();
const apiUrl   = config.BYAN_API_URL   || process.env.BYAN_API_URL;
const apiToken = config.BYAN_API_TOKEN || process.env.BYAN_API_TOKEN;

if (!apiUrl) {
  process.stderr.write('[byan-channel] BYAN_API_URL manquant — le poll sera désactivé\n');
}
if (!apiToken) {
  process.stderr.write('[byan-channel] BYAN_API_TOKEN manquant — le poll et les replies seront désactivés\n');
}

await runChannelStdio({ apiUrl, apiToken });
