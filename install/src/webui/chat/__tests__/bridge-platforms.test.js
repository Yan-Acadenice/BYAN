/**
 * Proves Copilot + VSCode are no longer selectable platforms in the webui chat
 * bridge. After the platform rip, the adapter factory accepts only claude and
 * codex; any other CLI name (copilot, vscode) is rejected, and the Copilot
 * adapter module no longer exists on disk.
 */

const path = require('path');
const { createBridge } = require('../bridge');

describe('webui chat bridge — supported platforms', () => {
  it('builds a Claude adapter', () => {
    expect(() => createBridge('claude', {})).not.toThrow();
  });

  it('builds a Codex adapter', () => {
    expect(() => createBridge('codex', {})).not.toThrow();
  });

  it('rejects copilot as an unknown adapter', () => {
    expect(() => createBridge('copilot', {})).toThrow(/Unknown CLI adapter/);
  });

  it('rejects copilot regardless of casing', () => {
    expect(() => createBridge('COPILOT', {})).toThrow(/Unknown CLI adapter/);
  });

  it('rejects vscode as an unknown adapter', () => {
    expect(() => createBridge('vscode', {})).toThrow(/Unknown CLI adapter/);
  });
});

describe('webui chat bridge — Copilot adapter is gone', () => {
  it('no longer ships the copilot-adapter module', () => {
    expect(() => require(path.join(__dirname, '..', 'copilot-adapter'))).toThrow(
      /Cannot find module/,
    );
  });
});
