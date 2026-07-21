'use strict';

// Contract: the default `create-byan-agent` invocation resolves to the web
// wizard; the terminal paths are opt-in via flags. This is the 2.57.0
// inversion (was: default terminal, web behind the `web` subcommand).

const { chooseInstallMode, skillsSyncConsent } = require('../lib/install-mode');

describe('chooseInstallMode — web by default, terminal is opt-in', () => {
  test('no flags -> web (the new default)', () => {
    expect(chooseInstallMode({})).toBe('web');
    expect(chooseInstallMode()).toBe('web');
  });

  test('--cli -> automatic terminal install', () => {
    expect(chooseInstallMode({ cli: true })).toBe('cli');
  });

  test('--legacy -> original interview', () => {
    expect(chooseInstallMode({ legacy: true })).toBe('legacy');
  });

  test('--legacy wins over --cli when both are set', () => {
    expect(chooseInstallMode({ cli: true, legacy: true })).toBe('legacy');
  });

  test('unrelated flags do not change the default', () => {
    expect(chooseInstallMode({ port: '3000', name: 'x', dir: '/tmp/p' })).toBe('web');
  });
});

describe('skillsSyncConsent — auto install never opens an interactive prompt', () => {
  test('default -> null (notice-only, no prompt, no hang)', () => {
    expect(skillsSyncConsent({})).toBeNull();
    expect(skillsSyncConsent()).toBeNull();
  });

  test('--sync-skills -> an unattended auto-approve function (no inquirer)', async () => {
    const consent = skillsSyncConsent({ syncSkills: true });
    expect(typeof consent).toBe('function');
    // Resolves true WITHOUT reading stdin — this is what prevents the freeze.
    await expect(consent('any question')).resolves.toBe(true);
  });

  test('the returned value is never an inquirer-style blocking prompt', () => {
    // Contract guard: default must be exactly null so the engine takes its
    // notice-only branch; anything truthy would re-open the freeze surface.
    expect(skillsSyncConsent({ cli: true })).toBeNull();
  });
});
