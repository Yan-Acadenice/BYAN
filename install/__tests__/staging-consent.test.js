const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const yaml = require('js-yaml');
const {
  setupStagingConsent,
  writeMemorySyncFlag,
  CONSENT_NOTICE,
} = require('../lib/staging-consent');

describe('staging-consent', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-consent-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('CONSENT_NOTICE lists the 4 canonical data points', () => {
    expect(CONSENT_NOTICE).toMatch(/messages utilisateur/);
    expect(CONSENT_NOTICE).toMatch(/reponses assistant/);
    expect(CONSENT_NOTICE).toMatch(/fichiers modifies/);
    expect(CONSENT_NOTICE).toMatch(/sessionId/);
  });

  test('CONSENT_NOTICE mentions disable path', () => {
    expect(CONSENT_NOTICE).toMatch(/memory_sync: \{ enabled: false \}/);
    expect(CONSENT_NOTICE).toMatch(/byan-no-stage/);
  });

  test('writeMemorySyncFlag creates _byan/config.yaml when absent', async () => {
    const target = await writeMemorySyncFlag(tmp, true);
    expect(target).toContain(path.join('_byan', 'config.yaml'));
    const doc = yaml.load(await fs.readFile(target, 'utf8'));
    expect(doc.memory_sync.enabled).toBe(true);
  });

  test('writeMemorySyncFlag prefers existing _byan/config.yaml', async () => {
    const existing = path.join(tmp, '_byan', 'config.yaml');
    await fs.ensureDir(path.dirname(existing));
    await fs.writeFile(existing, yaml.dump({ user_name: 'test', foo: 'bar' }));

    const target = await writeMemorySyncFlag(tmp, true);
    expect(target).toBe(existing);
    const doc = yaml.load(await fs.readFile(target, 'utf8'));
    expect(doc.foo).toBe('bar');
    expect(doc.user_name).toBe('test');
    expect(doc.memory_sync.enabled).toBe(true);
  });

  test('writeMemorySyncFlag falls back to loadbalancer.yaml when _byan absent', async () => {
    const lb = path.join(tmp, 'loadbalancer.yaml');
    await fs.writeFile(lb, yaml.dump({ primary: 'claude' }));

    const target = await writeMemorySyncFlag(tmp, false);
    expect(target).toBe(lb);
    const doc = yaml.load(await fs.readFile(target, 'utf8'));
    expect(doc.primary).toBe('claude');
    expect(doc.memory_sync.enabled).toBe(false);
  });

  test('setupStagingConsent returns reason=no_token when byan_web not configured', async () => {
    const r = await setupStagingConsent(tmp, {
      byanWebConfigured: false,
      quiet: true,
    });
    expect(r.configured).toBe(false);
    expect(r.reason).toBe('no_token');
  });

  test('setupStagingConsent skipPrompts=true + presetEnabled=true writes enabled:true', async () => {
    const r = await setupStagingConsent(tmp, {
      byanWebConfigured: true,
      skipPrompts: true,
      presetEnabled: true,
      quiet: true,
    });
    expect(r.configured).toBe(true);
    expect(r.enabled).toBe(true);
    const doc = yaml.load(await fs.readFile(r.configPath, 'utf8'));
    expect(doc.memory_sync.enabled).toBe(true);
  });

  test('setupStagingConsent skipPrompts=true + presetEnabled=false writes enabled:false', async () => {
    const r = await setupStagingConsent(tmp, {
      byanWebConfigured: true,
      skipPrompts: true,
      presetEnabled: false,
      quiet: true,
    });
    expect(r.configured).toBe(true);
    expect(r.enabled).toBe(false);
    const doc = yaml.load(await fs.readFile(r.configPath, 'utf8'));
    expect(doc.memory_sync.enabled).toBe(false);
  });

  test('setupStagingConsent preserves existing memory_sync keys', async () => {
    await fs.ensureDir(path.join(tmp, '_byan'));
    await fs.writeFile(
      path.join(tmp, '_byan', 'config.yaml'),
      yaml.dump({ memory_sync: { custom_field: 'keep' } })
    );
    const r = await setupStagingConsent(tmp, {
      byanWebConfigured: true,
      skipPrompts: true,
      presetEnabled: true,
      quiet: true,
    });
    const doc = yaml.load(await fs.readFile(r.configPath, 'utf8'));
    expect(doc.memory_sync.custom_field).toBe('keep');
    expect(doc.memory_sync.enabled).toBe(true);
  });
});
