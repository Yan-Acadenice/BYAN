import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runByanCli,
  eloSummary,
  eloContext,
  eloRecord,
  fcCheck,
  fcParse,
} from '../lib/cli.js';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(process.cwd(), '../../..');

test('runByanCli executes and parses JSON', async () => {
  const result = await runByanCli(['help'], { projectRoot: PROJECT_ROOT });
  assert.ok(result.raw || typeof result === 'object');
});

test('eloSummary returns array-of-domains OR raw-message when no data', async () => {
  const result = await eloSummary({ projectRoot: PROJECT_ROOT });
  const hasDomains =
    Array.isArray(result) && result.length > 0 && 'domain' in result[0];
  const hasRawNoData = result && typeof result.raw === 'string';
  assert.ok(hasDomains || hasRawNoData, `unexpected shape: ${JSON.stringify(result)}`);
});

test('eloContext requires domain argument', async () => {
  await assert.rejects(
    () => eloContext({ projectRoot: PROJECT_ROOT }),
    /domain is required/
  );
});

test('eloRecord validates result enum', async () => {
  await assert.rejects(
    () => eloRecord({ domain: 'javascript', result: 'MAYBE', projectRoot: PROJECT_ROOT }),
    /VALIDATED|BLOCKED|PARTIAL/
  );
});

test('fcCheck returns assertion type metadata', async () => {
  const result = await fcCheck({
    text: 'Redis is always faster than Postgres',
    projectRoot: PROJECT_ROOT,
  });
  assert.ok('status' in result);
  assert.ok('level' in result);
});

test('fcParse requires text argument', async () => {
  await assert.rejects(() => fcParse({ projectRoot: PROJECT_ROOT }), /text is required/);
});

test('runByanCli timeout rejects', async () => {
  await assert.rejects(
    () => runByanCli(['elo', 'summary'], { projectRoot: PROJECT_ROOT, timeoutMs: 1 }),
    /timed out/
  );
});
