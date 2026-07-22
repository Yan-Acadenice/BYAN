// Shared E2E fixtures — Electron launch, tmp project root isolation, cleanup.
//
// Why env-var stubs over Playwright route mocks:
//   The renderer is sandboxed — `page.route()` works for fetch but cannot
//   intercept the main-process exec()/fork()/keytar paths. Forking a stub
//   binary from the renderer is impossible by design. So all determinism
//   knobs flow through env vars that main/index.ts reads at boot:
//
//     BYAN_E2E_MODE=1                         master flag, enables stub mode
//     BYAN_E2E_TMP_PROJECT_ROOT=<abs path>    forces project root + isolates _byan/
//     BYAN_E2E_MOCK_CLI=claude:/path,codex:/path,copilot:/path
//                                              skips real `which` / `where` probes
//     BYAN_E2E_MOCK_AUTH=200|401|network      skips real fetch to byan-api
//     BYAN_E2E_MOCK_SERVER_PORT=<n>           skips real fork(), pretends server ready
//
// The stubs are read once per process; relaunching the app with new vars is
// the supported way to switch scenarios.

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

const APP_ROOT = path.resolve(__dirname, '..', '..');

// Resolve the absolute path to the packaged binary based on host OS.
// We allow override via BYAN_E2E_BINARY for local dev (e.g. point at a custom
// build location) — CI always uses the default electron-builder output.
export function resolveBinaryPath(): string {
  const override = process.env.BYAN_E2E_BINARY;
  if (override) return override;

  if (process.platform === 'win32') {
    return path.join(APP_ROOT, 'release', 'win-unpacked', 'BYAN.exe');
  }
  if (process.platform === 'darwin') {
    // electron-builder emits release/mac (x64), release/mac-arm64 (Apple
    // Silicon — the modern GitHub macos runner) or release/mac-universal.
    // Probe the variants so the same fixture works on every mac runner.
    const macDirs = ['mac-arm64', 'mac', 'mac-universal'];
    const candidates = macDirs.map((d) =>
      path.join(APP_ROOT, 'release', d, 'BYAN.app', 'Contents', 'MacOS', 'BYAN')
    );
    return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
  }
  // Linux default — electron-builder.yml pins executableName: byan (the exact
  // name the CLI's desktop-app detection probes: /opt/BYAN/byan).
  return path.join(APP_ROOT, 'release', 'linux-unpacked', 'byan');
}

export interface LaunchAppOptions {
  // Extra env vars merged with the BYAN_E2E_* defaults.
  env?: Record<string, string>;
  // If true, pre-create _byan/config.yaml so the app skips onboarding.
  preconfigureProject?: boolean;
  // Override the tmpdir base (rarely needed; default = os.tmpdir()).
  tmpDirBase?: string;
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  tmpProjectRoot: string;
  cleanup: () => Promise<void>;
}

// Create a unique tmp project root for the current test.
// Each test gets its own dir so keytar/secure-store and config.yaml writes
// can't bleed across tests.
export function makeTmpProjectRoot(base?: string): string {
  const baseDir = base ?? os.tmpdir();
  const dir = path.join(baseDir, `byan-e2e-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Recursively delete the tmp project root. Best-effort — failures (e.g. files
// still locked by a not-yet-killed child process on Windows) are logged and
// ignored so cleanup never masks a real test failure.
export function cleanupTmpProjectRoot(dir: string): void {
  if (!dir || !dir.includes('byan-e2e-')) return; // safety net: never wipe arbitrary paths
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (err) {
    console.warn(`[e2e] cleanup failed for ${dir}: ${(err as Error).message}`);
  }
}

// Pre-seed a tmp project root with _byan/config.yaml so the app skips onboarding
// and goes straight to /login on next boot.
export function preconfigure(tmpRoot: string): void {
  const byanDir = path.join(tmpRoot, '_byan');
  fs.mkdirSync(byanDir, { recursive: true });
  fs.writeFileSync(
    path.join(byanDir, 'config.yaml'),
    'version: 1\nproject_root: ' + tmpRoot + '\n',
    { encoding: 'utf8' }
  );
}

// Launch the packaged Electron app with E2E env stubs and return both the
// app handle and the first window's page. Caller is responsible for calling
// cleanup() in a try/finally or test fixture teardown.
export async function launchApp(opts: LaunchAppOptions = {}): Promise<LaunchedApp> {
  const tmpProjectRoot = makeTmpProjectRoot(opts.tmpDirBase);
  if (opts.preconfigureProject) {
    preconfigure(tmpProjectRoot);
  }

  const binary = resolveBinaryPath();
  if (!fs.existsSync(binary)) {
    throw new Error(
      `Electron binary not found: ${binary}\n` +
      `Run \`npm run build:dir\` (or build:linux / build:win) before running E2E tests.`
    );
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    BYAN_E2E_MODE: '1',
    BYAN_E2E_TMP_PROJECT_ROOT: tmpProjectRoot,
    // Keytar fallback to the user-scoped .env would still pollute the host;
    // override XDG_CONFIG_HOME so the secure-store fallback writes inside tmp.
    XDG_CONFIG_HOME: path.join(tmpProjectRoot, '.xdg'),
    APPDATA: path.join(tmpProjectRoot, 'AppData'),
    ...opts.env
  };

  const app = await electron.launch({
    executablePath: binary,
    env,
    timeout: 20_000
  });

  const page = await app.firstWindow();
  // Wait for the renderer to settle on either onboarding or login route.
  // App.tsx renders null while route === 'loading'; we wait for any visible
  // step-* or panel-* test id to appear.
  await page.waitForLoadState('domcontentloaded');

  const cleanup = async () => {
    try {
      await app.close();
    } catch {
      // Ignore — process may have already exited.
    }
    cleanupTmpProjectRoot(tmpProjectRoot);
  };

  return { app, page, tmpProjectRoot, cleanup };
}
