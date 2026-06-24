'use strict';

/**
 * gdoc-setup.js -- install-time service-account key setup for byan_publish.
 *
 * Every side-effecting dep (prompt / fs / writeCredentials) is injected, so no
 * test touches a real key, the network, or the user HOME. Invariants under test:
 *   - a valid key is imported to ~/.byan/google-sa.json at mode 0600 and the
 *     publish config is persisted via writeCredentials
 *   - an invalid / missing key is refused as a graceful no-op (configured:false)
 *   - setupGdocPublish NEVER throws (ok stays true on every path)
 *   - no real secret literal in this test (fake shape-only key)
 */

const {
  setupGdocPublish,
  shouldOfferGdoc,
  validateServiceAccount,
  saDestPath,
} = require('../lib/gdoc-setup');

const HOME = '/home/test';
const DEST = `${HOME}/.byan/google-sa.json`;

// Fake SA key -- SHAPE ONLY, never a real secret.
const FAKE_SA = {
  client_email: 'sa@p.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
};

// A prompt that answers by question name from a canned map.
function makePrompt(answers) {
  return async (questions) => {
    const out = {};
    for (const q of questions) out[q.name] = answers[q.name];
    return out;
  };
}

function makeFs({ json = FAKE_SA, readThrows = false } = {}) {
  const calls = { writeFile: [], chmod: [], ensureDir: [] };
  return {
    calls,
    readJson: async () => {
      if (readThrows) throw new Error('ENOENT');
      return json;
    },
    ensureDir: async (d) => calls.ensureDir.push(d),
    chmod: async (p, m) => calls.chmod.push({ p, m }),
    writeFile: async (p, data, opts) => calls.writeFile.push({ p, data, opts }),
  };
}

function makePersist() {
  const calls = [];
  const fn = async (values, opts) => {
    calls.push({ values, opts });
    return { path: `${HOME}/.byan/credentials.json`, written: Object.keys(values) };
  };
  fn.calls = calls;
  return fn;
}

const base = (over = {}) => ({
  prompt: makePrompt({ hasKey: true, jsonPath: '/tmp/sa.json', templateId: '', logoUrl: '' }),
  homedir: HOME,
  fsImpl: makeFs(),
  persist: makePersist(),
  quiet: true,
  ...over,
});

describe('gdoc-setup -- validateServiceAccount + shouldOfferGdoc', () => {
  test('validateServiceAccount accepts a shaped key, rejects junk', () => {
    expect(validateServiceAccount(FAKE_SA)).toBe(true);
    expect(validateServiceAccount({})).toBe(false);
    expect(validateServiceAccount({ client_email: 'x@y' })).toBe(false);
    expect(validateServiceAccount(null)).toBe(false);
  });

  test('shouldOfferGdoc: TTY yes, BYAN_SKIP_GDOC=1 no, no-TTY no', () => {
    expect(shouldOfferGdoc({ env: {}, isTTY: true })).toBe(true);
    expect(shouldOfferGdoc({ env: { BYAN_SKIP_GDOC: '1' }, isTTY: true })).toBe(false);
    expect(shouldOfferGdoc({ env: {}, isTTY: false })).toBe(false);
  });

  test('saDestPath is ~/.byan/google-sa.json', () => {
    expect(saDestPath(HOME)).toBe(DEST);
  });
});

describe('gdoc-setup -- setupGdocPublish', () => {
  test('valid key: imported at 0600 + GOOGLE_APPLICATION_CREDENTIALS persisted', async () => {
    const fsImpl = makeFs();
    const persist = makePersist();
    const r = await setupGdocPublish(base({ fsImpl, persist }));
    expect(r.ok).toBe(true);
    expect(r.configured).toBe(true);
    expect(r.path).toBe(DEST);
    // key written to ~/.byan/google-sa.json with mode 0600
    expect(fsImpl.calls.writeFile[0].p).toBe(DEST);
    expect(fsImpl.calls.writeFile[0].opts.mode).toBe(0o600);
    // config persisted via writeCredentials, pointing at the key path
    expect(persist.calls[0].values.GOOGLE_APPLICATION_CREDENTIALS).toBe(DEST);
    expect(persist.calls[0].opts.homedir).toBe(HOME);
  });

  test('optional template + logo flow through when provided', async () => {
    const persist = makePersist();
    const r = await setupGdocPublish(
      base({
        persist,
        prompt: makePrompt({
          hasKey: true,
          jsonPath: '/tmp/sa.json',
          templateId: 'TPL123',
          logoUrl: 'https://x/logo.png',
        }),
      })
    );
    expect(r.configured).toBe(true);
    expect(persist.calls[0].values.GDOC_TEMPLATE_ID).toBe('TPL123');
    expect(persist.calls[0].values.GDOC_LOGO_PNG_URL).toBe('https://x/logo.png');
  });

  test('blank template/logo are NOT persisted (no empty keys)', async () => {
    const persist = makePersist();
    await setupGdocPublish(base({ persist }));
    expect('GDOC_TEMPLATE_ID' in persist.calls[0].values).toBe(false);
    expect('GDOC_LOGO_PNG_URL' in persist.calls[0].values).toBe(false);
  });

  test('user has no key yet: graceful no-op, nothing persisted', async () => {
    const persist = makePersist();
    const r = await setupGdocPublish(
      base({ persist, prompt: makePrompt({ hasKey: false }) })
    );
    expect(r.ok).toBe(true);
    expect(r.configured).toBe(false);
    expect(persist.calls.length).toBe(0);
  });

  test('invalid key (wrong shape): refused, nothing written or persisted', async () => {
    const fsImpl = makeFs({ json: { foo: 'bar' } });
    const persist = makePersist();
    const r = await setupGdocPublish(base({ fsImpl, persist }));
    expect(r.configured).toBe(false);
    expect(r.skipReason).toMatch(/service account/i);
    expect(fsImpl.calls.writeFile.length).toBe(0);
    expect(persist.calls.length).toBe(0);
  });

  test('unreadable JSON path: graceful skip', async () => {
    const r = await setupGdocPublish(base({ fsImpl: makeFs({ readThrows: true }) }));
    expect(r.ok).toBe(true);
    expect(r.configured).toBe(false);
    expect(r.skipReason).toMatch(/illisible/i);
  });

  test('NEVER throws: a throwing persist degrades to configured:false', async () => {
    const persist = async () => {
      throw new Error('disk full');
    };
    let r;
    await expect(
      (async () => {
        r = await setupGdocPublish(base({ persist }));
      })()
    ).resolves.toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.configured).toBe(false);
  });
});
