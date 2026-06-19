import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { resolveConfig, credentialsPath, isUnexpandedPlaceholder } from '../lib/resolve-config.js';

// Tests for the MCP server config resolver (F1). The resolver is the boot-time
// source of truth for BYAN_API_URL/TOKEN + the Leantime pair, with precedence
// env -> ~/.byan/credentials.json -> localhost default. It must never throw at
// boot (a missing/garbage file degrades gracefully) and never log a secret.
//
// Fixtures are synthetic only (byan_ + repeated chars) -- never a real token.

const SYNTH_TOKEN = 'byan_' + 'a'.repeat(40);
const SYNTH_LT_TOKEN = 'lt_' + 'b'.repeat(20);

// Build a throwaway HOME dir; optionally seed ~/.byan/credentials.json with an
// object (JSON-encoded) or a raw string (to exercise the invalid-JSON path).
function tmpHome(credsObjOrRaw) {
  const home = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'byan-home-'));
  if (credsObjOrRaw !== undefined) {
    const dir = nodePath.join(home, '.byan');
    fs.mkdirSync(dir, { recursive: true });
    const raw = typeof credsObjOrRaw === 'string' ? credsObjOrRaw : JSON.stringify(credsObjOrRaw);
    fs.writeFileSync(nodePath.join(dir, 'credentials.json'), raw);
  }
  return home;
}

test('env real value wins over the file', () => {
  const home = tmpHome({ BYAN_API_URL: 'https://file.example' });
  const cfg = resolveConfig({ env: { BYAN_API_URL: 'https://env.example' }, homedir: home });
  assert.equal(cfg.BYAN_API_URL, 'https://env.example');
});

test('unexpanded ${..} env is treated as absent and falls through to the file', () => {
  const home = tmpHome({ BYAN_API_URL: 'https://file.example' });
  const cfg = resolveConfig({ env: { BYAN_API_URL: '${BYAN_API_URL}' }, homedir: home });
  assert.equal(cfg.BYAN_API_URL, 'https://file.example');
  assert.equal(isUnexpandedPlaceholder('${BYAN_API_URL}'), true);
  assert.equal(isUnexpandedPlaceholder('  ${X}  '), true);
  assert.equal(isUnexpandedPlaceholder('https://real'), false);
  assert.equal(isUnexpandedPlaceholder('${partial'), false);
});

test('missing file -> localhost default, no throw, tokens empty', () => {
  const home = tmpHome(); // no .byan directory at all
  let cfg;
  assert.doesNotThrow(() => { cfg = resolveConfig({ env: {}, homedir: home }); });
  assert.equal(cfg.BYAN_API_URL, 'http://localhost:3737');
  assert.equal(cfg.BYAN_API_TOKEN, '');
  assert.equal(cfg.LEANTIME_API_URL, '');
  assert.equal(cfg.LEANTIME_API_TOKEN, '');
});

test('invalid JSON file -> defaults, never throws', () => {
  const home = tmpHome('{ this is : not json');
  let cfg;
  assert.doesNotThrow(() => { cfg = resolveConfig({ env: {}, homedir: home }); });
  assert.equal(cfg.BYAN_API_URL, 'http://localhost:3737');
  assert.equal(cfg.BYAN_API_TOKEN, '');
});

test('file provides token + Leantime pair when env is absent', () => {
  const home = tmpHome({
    BYAN_API_URL: 'https://byan-api.example',
    BYAN_API_TOKEN: SYNTH_TOKEN,
    LEANTIME_API_URL: 'https://lt.example',
    LEANTIME_API_TOKEN: SYNTH_LT_TOKEN,
  });
  const cfg = resolveConfig({ env: {}, homedir: home });
  assert.equal(cfg.BYAN_API_URL, 'https://byan-api.example');
  assert.equal(cfg.BYAN_API_TOKEN, SYNTH_TOKEN);
  assert.equal(cfg.LEANTIME_API_URL, 'https://lt.example');
  assert.equal(cfg.LEANTIME_API_TOKEN, SYNTH_LT_TOKEN);
});

test('a file value that is itself an unexpanded ${..} is also ignored', () => {
  const home = tmpHome({ BYAN_API_URL: '${BYAN_API_URL}' });
  const cfg = resolveConfig({ env: {}, homedir: home });
  assert.equal(cfg.BYAN_API_URL, 'http://localhost:3737');
});

test('credentialsPath resolves under the given homedir (cross-OS join)', () => {
  const p = credentialsPath('/home/test');
  assert.equal(p, nodePath.join('/home/test', '.byan', 'credentials.json'));
});

test('resolveConfig never logs the token', () => {
  const home = tmpHome({ BYAN_API_TOKEN: SYNTH_TOKEN });
  const calls = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => calls.push(a.join(' '));
  console.error = (...a) => calls.push(a.join(' '));
  console.warn = (...a) => calls.push(a.join(' '));
  try {
    resolveConfig({ env: {}, homedir: home });
  } finally {
    console.log = orig.log; console.error = orig.error; console.warn = orig.warn;
  }
  assert.ok(!calls.join('\n').includes(SYNTH_TOKEN), 'the token must never be logged');
});
