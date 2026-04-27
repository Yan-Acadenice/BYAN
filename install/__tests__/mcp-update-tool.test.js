const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { spawnSync } = require('child_process');

const UPDATE_MODULE_PATH = path.resolve(
  __dirname,
  '..',
  'templates',
  '_byan',
  'mcp',
  'byan-mcp-server',
  'lib',
  'update.js'
);

// Run an inline ESM script that imports update.js and prints JSON to stdout.
// Going through a sub-process matches how the MCP server consumes the module
// (Node ESM, not Jest VM) and side-steps jest's experimental ESM loader.
function runEsmInline(script) {
  const r = spawnSync(
    'node',
    ['--input-type=module', '-e', script],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`node ESM exec failed (${r.status}): ${r.stderr}`);
  }
  return r.stdout;
}

describe('mcp byan_update_* tools — update.js helper', () => {
  let tmpProject;

  beforeEach(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'byan-mcp-update-'));
    await fs.ensureDir(path.join(tmpProject, '_byan'));
  });

  afterEach(async () => {
    await fs.remove(tmpProject);
  });

  test('returns "unknown" installed when manifest missing', () => {
    const out = runEsmInline(`
      import('${UPDATE_MODULE_PATH}').then(async (m) => {
        const status = await m.checkForUpdate(${JSON.stringify(tmpProject)});
        process.stdout.write(JSON.stringify(status));
      });
    `);
    const status = JSON.parse(out);
    expect(status.installed).toBe('unknown');
    if (status.latest) {
      expect(status.updateAvailable).toBe(false);
      expect(status.note).toMatch(/manifest\.json missing/i);
    } else {
      expect(status.networkError).toBeDefined();
    }
  });

  test('reads version from .manifest.json when present', async () => {
    await fs.writeJson(path.join(tmpProject, '_byan', '.manifest.json'), {
      version: '1.2.3',
      createdAt: '2026-04-01T00:00:00Z',
    });
    const out = runEsmInline(`
      import('${UPDATE_MODULE_PATH}').then(async (m) => {
        const status = await m.checkForUpdate(${JSON.stringify(tmpProject)});
        process.stdout.write(JSON.stringify(status));
      });
    `);
    const status = JSON.parse(out);
    expect(status.installed).toBe('1.2.3');
    if (status.latest) {
      expect(typeof status.updateAvailable).toBe('boolean');
      expect(['behind', 'same', 'ahead']).toContain(status.delta);
    }
  });

  test('formatApplyInstructions emits stable shell commands', () => {
    const out = runEsmInline(`
      import('${UPDATE_MODULE_PATH}').then((m) => {
        const cases = [{}, { preview: true }, { force: true }, { preview: true, force: true }];
        process.stdout.write(JSON.stringify(cases.map(c => m.formatApplyInstructions(c))));
      });
    `);
    const arr = JSON.parse(out);
    expect(arr[0].command).toBe('npx create-byan-agent update');
    expect(arr[1].command).toBe('npx create-byan-agent update --preview');
    expect(arr[2].command).toBe('npx create-byan-agent update --force');
    expect(arr[3].command).toBe('npx create-byan-agent update --preview --force');
  });

  test('formatApplyInstructions describes — never executes', () => {
    const out = runEsmInline(`
      import('${UPDATE_MODULE_PATH}').then((m) => {
        process.stdout.write(JSON.stringify(m.formatApplyInstructions()));
      });
    `);
    const ins = JSON.parse(out);
    expect(ins.next).toMatch(/ask the user/i);
    expect(Array.isArray(ins.safety)).toBe(true);
    expect(ins.safety.length).toBeGreaterThan(0);
  });
});
