const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { writeCredentials, readCredentials, credentialsPath } = require('../lib/credentials');

// Synthetic fixtures only -- never a real token.
const SYNTH_TOKEN = 'byan_' + 'a'.repeat(40);
const SYNTH_LT_TOKEN = 'lt_' + 'b'.repeat(20);

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-creds-'));
}

describe('writeCredentials (global ~/.byan/credentials.json)', () => {
  test('writes the file under <homedir>/.byan/ with the given values', async () => {
    const home = tmpHome();
    const res = await writeCredentials(
      { BYAN_API_URL: 'https://byan-api.example', BYAN_API_TOKEN: SYNTH_TOKEN },
      { homedir: home }
    );
    expect(res.path).toBe(credentialsPath(home));
    const data = await fs.readJson(res.path);
    expect(data.BYAN_API_URL).toBe('https://byan-api.example');
    expect(data.BYAN_API_TOKEN).toBe(SYNTH_TOKEN);
    expect(res.written.sort()).toEqual(['BYAN_API_TOKEN', 'BYAN_API_URL']);
  });

  test('is idempotent and merges: a later write preserves earlier keys', async () => {
    const home = tmpHome();
    await writeCredentials({ BYAN_API_URL: 'https://a.example', BYAN_API_TOKEN: SYNTH_TOKEN }, { homedir: home });
    await writeCredentials({ LEANTIME_API_URL: 'https://lt.example', LEANTIME_API_TOKEN: SYNTH_LT_TOKEN }, { homedir: home });
    const data = await readCredentials(home);
    expect(data.BYAN_API_URL).toBe('https://a.example');
    expect(data.BYAN_API_TOKEN).toBe(SYNTH_TOKEN);
    expect(data.LEANTIME_API_URL).toBe('https://lt.example');
    expect(data.LEANTIME_API_TOKEN).toBe(SYNTH_LT_TOKEN);
  });

  test('ignores unexpanded ${..} placeholders and empty values', async () => {
    const home = tmpHome();
    const res = await writeCredentials(
      { BYAN_API_URL: '${BYAN_API_URL}', BYAN_API_TOKEN: '   ', LEANTIME_API_URL: '' },
      { homedir: home }
    );
    expect(res.written).toEqual([]);
    const data = await readCredentials(home);
    expect(data.BYAN_API_URL).toBeUndefined();
    expect(data.BYAN_API_TOKEN).toBeUndefined();
  });

  test('only known keys are persisted; unknown keys are dropped', async () => {
    const home = tmpHome();
    await writeCredentials({ BYAN_API_URL: 'https://a.example', NOPE: 'x' }, { homedir: home });
    const data = await readCredentials(home);
    expect(data.BYAN_API_URL).toBe('https://a.example');
    expect(data.NOPE).toBeUndefined();
  });

  test('persists the Google Docs publish keys (byan_publish)', async () => {
    const home = tmpHome();
    const res = await writeCredentials(
      {
        GOOGLE_APPLICATION_CREDENTIALS: '/home/u/.byan/google-sa.json',
        GDOC_TEMPLATE_ID: 'TPL123',
        GDOC_LOGO_PNG_URL: 'https://x/logo.png',
      },
      { homedir: home }
    );
    expect(res.written.sort()).toEqual([
      'GDOC_LOGO_PNG_URL',
      'GDOC_TEMPLATE_ID',
      'GOOGLE_APPLICATION_CREDENTIALS',
    ]);
    const data = await readCredentials(home);
    expect(data.GOOGLE_APPLICATION_CREDENTIALS).toBe('/home/u/.byan/google-sa.json');
    expect(data.GDOC_TEMPLATE_ID).toBe('TPL123');
    expect(data.GDOC_LOGO_PNG_URL).toBe('https://x/logo.png');
  });

  test('the credentials file is 0600 and never group/other-readable (POSIX only)', async () => {
    if (process.platform === 'win32') return; // POSIX modes do not apply on Windows
    const home = tmpHome();
    const res = await writeCredentials({ BYAN_API_TOKEN: SYNTH_TOKEN }, { homedir: home });
    const mode = fs.statSync(res.path).mode & 0o777;
    expect(mode).toBe(0o600);
    // Defense against the TOCTOU window: assert no group/other bits at any point.
    expect(mode & 0o077).toBe(0);
  });

  test('tightens a pre-existing loose-mode credentials file to 0600 on overwrite (POSIX only)', async () => {
    if (process.platform === 'win32') return;
    const home = tmpHome();
    const p = credentialsPath(home);
    await fs.mkdirp(path.dirname(p));
    await fs.writeFile(p, '{}', { mode: 0o644 }); // simulate a stale world-readable file
    expect(fs.statSync(p).mode & 0o077).not.toBe(0); // precondition: currently loose
    await writeCredentials({ BYAN_API_TOKEN: SYNTH_TOKEN }, { homedir: home });
    expect(fs.statSync(p).mode & 0o077).toBe(0); // tightened
  });

  test('readCredentials returns {} on a missing file (never throws)', async () => {
    const home = tmpHome();
    await expect(readCredentials(home)).resolves.toEqual({});
  });

  test('readCredentials returns {} on invalid JSON (never throws)', async () => {
    const home = tmpHome();
    const p = credentialsPath(home);
    await fs.mkdirp(path.dirname(p));
    await fs.writeFile(p, '{ not json');
    await expect(readCredentials(home)).resolves.toEqual({});
  });
});
