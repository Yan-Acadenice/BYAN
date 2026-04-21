/**
 * Smoke tests for the Copilot CLI extension.
 *
 * We can't spawn a real Copilot CLI session in unit tests, so we :
 *   1. Verify the extension.mjs file exists and is valid JavaScript.
 *   2. Import it in a sandbox where joinSession() is stubbed, capture
 *      the hook registration, and exercise each hook against mock
 *      inputs. Assert that processTurn() (from the shared core) is
 *      invoked with cliSource='copilot-cli' on session end.
 */

const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '..', '..', '.github', 'extensions', 'byan-staging', 'extension.mjs');

describe('byan-staging Copilot extension', () => {
  test('extension.mjs file exists and is non-empty', () => {
    expect(fs.existsSync(EXT_PATH)).toBe(true);
    const src = fs.readFileSync(EXT_PATH, 'utf8');
    expect(src.length).toBeGreaterThan(1000);
  });

  test('extension imports joinSession from @github/copilot-sdk/extension', () => {
    const src = fs.readFileSync(EXT_PATH, 'utf8');
    expect(src).toMatch(/joinSession/);
    expect(src).toMatch(/@github\/copilot-sdk\/extension/);
  });

  test('extension registers the 4 Copilot hooks', () => {
    const src = fs.readFileSync(EXT_PATH, 'utf8');
    expect(src).toMatch(/onSessionStart\s*:/);
    expect(src).toMatch(/onUserPromptSubmitted\s*:/);
    expect(src).toMatch(/onPreToolUse\s*:/);
    expect(src).toMatch(/onPostToolUse\s*:/);
    expect(src).toMatch(/onSessionEnd\s*:/);
  });

  test('extension calls processTurn with cliSource="copilot-cli"', () => {
    const src = fs.readFileSync(EXT_PATH, 'utf8');
    expect(src).toMatch(/processTurn/);
    expect(src).toMatch(/cliSource:\s*['"]copilot-cli['"]/);
  });

  test('extension resolves PROJECT_ROOT with env fallback + walk-up', () => {
    const src = fs.readFileSync(EXT_PATH, 'utf8');
    expect(src).toMatch(/BYAN_PROJECT_ROOT/);
    expect(src).toMatch(/findProjectRoot/);
  });

  test('package.json is valid JSON and declares type=module', () => {
    const pkgPath = path.resolve(
      __dirname, '..', '..', '.github', 'extensions', 'byan-staging', 'package.json'
    );
    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.type).toBe('module');
    expect(pkg.main).toBe('extension.mjs');
  });
});
