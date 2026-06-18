import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoAmbientToken, httpServer } from '../server-http.js';

// Synthetic token — shape only, never a real secret.
const FAKE_TOKEN = 'byan_' + 'a'.repeat(40);

test('assertNoAmbientToken: empty env does not throw', () => {
  assert.doesNotThrow(() => assertNoAmbientToken({}));
});

test('assertNoAmbientToken: env with BYAN_API_TOKEN throws', () => {
  assert.throws(
    () => assertNoAmbientToken({ BYAN_API_TOKEN: FAKE_TOKEN }),
    /BYAN_API_TOKEN must not be set on the remote connector/
  );
});

test('assertNoAmbientToken: undefined env does not throw', () => {
  assert.doesNotThrow(() => assertNoAmbientToken(undefined));
});

test('httpServer is not listening at import time', () => {
  // The entrypoint guard must prevent the server from binding a port on import.
  // If this fails, a test importing server-http.js would hold an open handle.
  assert.strictEqual(typeof httpServer.listen, 'function');
  assert.strictEqual(httpServer.listening, false);
});
