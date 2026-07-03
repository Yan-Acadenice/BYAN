const { buildProviders, PROVIDER_CLASSES } = require('../../src/loadbalancer/providers/factory');

describe('loadbalancer/provider-factory', () => {
  test('maps each known provider name to its class', () => {
    expect(PROVIDER_CLASSES.claude).toBeDefined();
    expect(PROVIDER_CLASSES.copilot).toBeDefined();
    expect(PROVIDER_CLASSES.codex).toBeDefined();
    expect(PROVIDER_CLASSES.byan_api).toBeDefined();
  });

  test('builds one provider instance per ENABLED provider in config', () => {
    const config = {
      providers: {
        claude: { enabled: true },
        codex: { enabled: true, bin: 'codex' },
        copilot: { enabled: true },
        byan_api: { enabled: false },
      },
    };
    const providers = buildProviders(config);
    expect(Object.keys(providers).sort()).toEqual(['claude', 'codex', 'copilot']);
    expect(providers.codex.name).toBe('codex');
    expect(providers.byan_api).toBeUndefined();
  });

  test('an unknown provider name is skipped, not fatal', () => {
    const config = { providers: { madeup: { enabled: true }, codex: { enabled: true } } };
    const providers = buildProviders(config);
    expect(providers.madeup).toBeUndefined();
    expect(providers.codex).toBeDefined();
  });

  test('passes the per-provider config section to the instance', () => {
    const config = { providers: { codex: { enabled: true, sandbox: 'workspace-write' } } };
    const providers = buildProviders(config);
    expect(providers.codex.config.sandbox).toBe('workspace-write');
  });
});
