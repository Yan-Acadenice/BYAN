/**
 * Copilot CLI extension — BYAN staging (SM1c).
 *
 * Attaches to the current Copilot session via joinSession() and
 * triggers the BYAN staging pipeline at the end of each assistant
 * turn. Delegates to src/staging/staging.js so Claude Code and Copilot
 * CLI share the exact same extract / filter / dedup / queue / flush
 * logic.
 *
 * How it's discovered : Copilot CLI scans .github/extensions/
 * (project) and the user's copilot config for subdirectories
 * containing extension.mjs. This file is auto-launched as a child
 * process, gets @github/copilot-sdk on its module path, and calls
 * joinSession with the hook registration below.
 */

import { joinSession } from '@github/copilot-sdk/extension';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

const EXTENSION_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT =
  process.env.BYAN_PROJECT_ROOT ||
  process.env.CLAUDE_PROJECT_DIR ||
  findProjectRoot(EXTENSION_DIR);

function findProjectRoot(startDir) {
  // Walk up until we find a package.json or .git — else cwd
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function loadStaging() {
  try {
    return require(path.join(PROJECT_ROOT, 'src', 'staging', 'staging.js'));
  } catch {
    return null;
  }
}

function readSettingsEnv() {
  const p = path.join(PROJECT_ROOT, '.claude', 'settings.local.json');
  if (!fs.existsSync(p)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.env || {};
  } catch {
    return {};
  }
}

function readMemorySyncConfig() {
  const paths = [
    path.join(PROJECT_ROOT, 'loadbalancer.yaml'),
    path.join(PROJECT_ROOT, '_byan', 'config.yaml'),
  ];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const yaml = require('js-yaml');
      const doc = yaml.load(fs.readFileSync(p, 'utf8'));
      if (doc && doc.memory_sync) return doc.memory_sync;
    } catch {
      // fall through
    }
  }
  return null;
}

function buildConfig() {
  const envFile = readSettingsEnv();
  return {
    byan_api_url: envFile.BYAN_API_URL || process.env.BYAN_API_URL || null,
    byan_api_token: envFile.BYAN_API_TOKEN || process.env.BYAN_API_TOKEN || null,
    memory_sync: readMemorySyncConfig() || {},
  };
}

// Per-turn buffer of recent messages/tool calls keyed by sessionId.
const turnBuffer = new Map();

function bufferFor(sessionId) {
  const key = sessionId || 'default';
  if (!turnBuffer.has(key)) {
    turnBuffer.set(key, { userMessages: [], assistantMessages: [], toolCalls: [] });
  }
  return turnBuffer.get(key);
}

function clearBuffer(sessionId) {
  turnBuffer.delete(sessionId || 'default');
}

const session = await joinSession({
  hooks: {
    onSessionStart: async () => {
      await session.log('BYAN staging extension loaded', { ephemeral: true });
    },

    onUserPromptSubmitted: async (input) => {
      const buf = bufferFor(input.sessionId);
      buf.userMessages.push({ role: 'user', content: input.prompt });
    },

    onPreToolUse: async (input) => {
      const buf = bufferFor(input.sessionId);
      buf.toolCalls.push({
        name: input.toolName,
        input: input.toolArgs || {},
      });
    },

    onPostToolUse: async (input) => {
      const buf = bufferFor(input.sessionId);
      // If the last tool call has a text result, treat it as assistant output
      if (input.toolResult && typeof input.toolResult.content === 'string') {
        buf.assistantMessages.push({
          role: 'assistant',
          content: input.toolResult.content,
        });
      }
    },

    onSessionEnd: async (input) => {
      const staging = loadStaging();
      if (!staging) {
        clearBuffer(input?.sessionId);
        return;
      }

      const buf = bufferFor(input?.sessionId);
      const turn = {
        sessionId: input?.sessionId || null,
        messages: [...buf.userMessages, ...buf.assistantMessages],
        toolCalls: buf.toolCalls,
      };

      try {
        await staging.processTurn({
          turn,
          cliSource: 'copilot-cli',
          config: buildConfig(),
          projectRoot: PROJECT_ROOT,
          flushNow: true,
        });
      } catch {
        // never block session end
      }

      clearBuffer(input?.sessionId);
    },
  },

  tools: [],
});
