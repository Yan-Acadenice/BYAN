/**
 * test/channel-resolve.test.js — Channel config resolution (BYAN yanstaller).
 *
 * POURQUOI ce test est separe de channel.test.js : channel.test.js est porte
 * verbatim depuis byan_web (parite F0). Ce fichier-ci verifie l'integration
 * BYAN-specifique : le channel resout BYAN_API_URL/TOKEN via le MEME resolver
 * que server.js (resolve-config.js) quand ~/.byan/credentials.json les fournit
 * alors qu'ils sont ABSENTS de process.env. C'est le contrat qui rend l'entree
 * .mcp.json inerte du yanstaller fonctionnelle sans secret en clair ni
 * dependance a l'expansion ${} fragile.
 *
 * channel-entry.js fait exactement :
 *   const config   = resolveConfig();
 *   const apiUrl   = config.BYAN_API_URL   || process.env.BYAN_API_URL;
 *   const apiToken = config.BYAN_API_TOKEN || process.env.BYAN_API_TOKEN;
 * On rejoue cette resolution avec un HOME/credentials mocke et un env vide,
 * puis on alimente createChannelServer avec le resultat et on verifie que le
 * reply tool emet bien l'Authorization issu du token du fichier credentials.
 *
 * Reseau : 100% mocke via fetchImpl. Fixture token synthetique uniquement.
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';
import os       from 'node:os';
import nodePath from 'node:path';
import { resolveConfig }       from '../lib/resolve-config.js';
import { createChannelServer } from '../lib/channel-server.js';

// Synthetic token only (byan_ + repeated chars) — never a real secret.
const SYNTH_TOKEN = 'byan_' + 'c'.repeat(40);

function okJson(data) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// Seed a throwaway HOME with ~/.byan/credentials.json holding the channel config.
function tmpHomeWithCreds(creds) {
  const home = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'byan-chan-home-'));
  const dir = nodePath.join(home, '.byan');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(nodePath.join(dir, 'credentials.json'), JSON.stringify(creds));
  return home;
}

test('channel resolves BYAN_API_URL/TOKEN from ~/.byan/credentials.json when env is ABSENT', () => {
  const home = tmpHomeWithCreds({
    BYAN_API_URL: 'https://byan-api.example',
    BYAN_API_TOKEN: SYNTH_TOKEN,
  });

  // env is empty: the credentials file is the only source. This is the exact
  // chain channel-entry.js relies on (resolveConfig first, env as a fallback).
  const config = resolveConfig({ env: {}, homedir: home });

  assert.equal(config.BYAN_API_URL, 'https://byan-api.example');
  assert.equal(config.BYAN_API_TOKEN, SYNTH_TOKEN);
});

test('reply tool sends the credentials-sourced token (env-absent path) as ApiKey', async () => {
  const home = tmpHomeWithCreds({
    BYAN_API_URL: 'https://byan-api.example',
    BYAN_API_TOKEN: SYNTH_TOKEN,
  });

  // Replay channel-entry.js resolution with no env.
  const config   = resolveConfig({ env: {}, homedir: home });
  const apiUrl   = config.BYAN_API_URL   || undefined;
  const apiToken = config.BYAN_API_TOKEN || undefined;

  const replyCalls = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes('/reply')) {
      replyCalls.push({ url, headers: opts.headers });
      return okJson({ ok: true });
    }
    return okJson({ data: [] });
  };

  const server = createChannelServer({ apiUrl, apiToken, intervalMs: 999_999, fetchImpl });
  const callToolHandler = server._requestHandlers?.get('tools/call');
  assert.ok(callToolHandler, 'CallTool handler doit etre enregistre');

  const result = await callToolHandler(
    {
      method: 'tools/call',
      params: {
        name: 'byan_session_reply',
        arguments: { session_id: 'sess-resolve', content: 'ok' },
      },
    },
    {}
  );

  assert.ok(!result.isError, `reply ne doit pas etre isError: ${JSON.stringify(result)}`);
  assert.equal(replyCalls.length, 1);
  // The token came from the file (env was empty), and byan_ tokens use ApiKey.
  const auth = replyCalls[0].headers.Authorization;
  assert.equal(auth, `ApiKey ${SYNTH_TOKEN}`);
  assert.ok(replyCalls[0].url.startsWith('https://byan-api.example/api/sessions/'));
});
