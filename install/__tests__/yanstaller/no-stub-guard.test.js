const fs = require('fs');
const path = require('path');

// The yanstaller module used to ship a half-built parallel installer: six
// pure-stub files (installer/validator/recommender/interviewer/troubleshooter/
// wizard) that were never invoked, plus an index.install()/uninstall() pair that
// silently did nothing. The real installer is create-byan-agent-v2.js. That dead
// stub half was excised. This guard keeps it from creeping back in, and locks the
// surviving public surface (update/rollback/listBackups + raw modules).

const YANSTALLER_DIR = path.join(__dirname, '..', '..', 'lib', 'yanstaller');
const yanstaller = require(path.join(YANSTALLER_DIR, 'index.js'));

describe('yanstaller has no dead stub half', () => {
  test('the six excised pure-stub files no longer exist', () => {
    const excised = [
      'installer.js',
      'validator.js',
      'recommender.js',
      'interviewer.js',
      'troubleshooter.js',
      'wizard.js'
    ];
    for (const f of excised) {
      expect(fs.existsSync(path.join(YANSTALLER_DIR, f))).toBe(false);
    }
  });

  test('the live public surface is exported', () => {
    for (const fn of ['update', 'rollback', 'listBackups']) {
      expect(typeof yanstaller[fn]).toBe('function');
    }
    // Raw modules the CLI (create-byan-agent-v2.js) and web UI consume.
    expect(yanstaller.updater).toBeTruthy();
    expect(yanstaller.backuper).toBeTruthy();
    expect(typeof yanstaller.updater.checkForUpdate).toBe('function');
    expect(typeof yanstaller.backuper.listBackups).toBe('function');
  });

  test('the stub install()/uninstall() orchestrator is gone from the surface', () => {
    expect(yanstaller.install).toBeUndefined();
    expect(yanstaller.uninstall).toBeUndefined();
  });

  test('no surviving yanstaller file carries a pure-stub "TODO: Implement" marker', () => {
    const survivors = fs
      .readdirSync(YANSTALLER_DIR)
      .filter((f) => f.endsWith('.js'));
    expect(survivors.length).toBeGreaterThan(0);
    for (const f of survivors) {
      const src = fs.readFileSync(path.join(YANSTALLER_DIR, f), 'utf8');
      expect(src).not.toMatch(/TODO:\s*Implement/i);
    }
  });
});
