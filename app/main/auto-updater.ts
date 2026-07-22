// AutoUpdaterManager — F9: in-app updates via electron-updater.
//
// Update feed:
//   electron-builder is configured with `publish: github` (electron-builder.yml),
//   so electron-updater reads the latest release manifest from
//   https://github.com/Yan-Acadenice/BYAN/releases and downloads the matching
//   AppImage / NSIS installer for the current platform.
//
// Lifecycle:
//   start()      → schedule an initial check after 30s + periodic every 4h.
//   stop()       → cancel the periodic timer.
//   checkNow()   → force a check; resolves the current status.
//   installNow() → quits the app and applies the downloaded update.
//
// State machine:
//   idle → checking → available  → downloading → downloaded
//                  → not-available
//                  → error
//
// Listeners get every state transition so the renderer can show a banner.
//
// Dev mode: when BYAN_DEV=1, start() is a no-op — autoUpdater would otherwise
// log noise about app-update.yml not being shipped in the dev build.

import type { App } from 'electron';

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number; transferred: number; total: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: 'dev-mode' };

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: 'checking-for-update', cb: () => void): unknown;
  on(event: 'update-available', cb: (info: { version: string }) => void): unknown;
  on(event: 'update-not-available', cb: (info: { version: string }) => void): unknown;
  on(event: 'download-progress', cb: (progress: { percent: number; transferred: number; total: number }) => void): unknown;
  on(event: 'update-downloaded', cb: (info: { version: string }) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
}

export type StateListener = (state: UpdateState) => void;

export interface AutoUpdaterDeps {
  updater?: AutoUpdaterLike;
  // Defaults to BYAN_DEV=1 → disabled.
  isDev?: boolean;
  // Defaults to 4 hours. Test injection only.
  periodicCheckMs?: number;
  // Defaults to 30 seconds. Test injection only.
  initialCheckDelayMs?: number;
  // Defaults to electron's `app`. Test injection only.
  app?: Pick<App, 'getVersion'>;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

export class AutoUpdaterManager {
  private readonly updater: AutoUpdaterLike | null;
  private readonly isDev: boolean;
  private readonly periodicMs: number;
  private readonly initialDelayMs: number;
  private readonly listeners = new Set<StateListener>();
  private currentState: UpdateState = { state: 'idle' };
  private initialTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(deps: AutoUpdaterDeps = {}) {
    this.updater = deps.updater ?? null;
    this.isDev = deps.isDev ?? process.env.BYAN_DEV === '1';
    this.periodicMs = deps.periodicCheckMs ?? FOUR_HOURS_MS;
    this.initialDelayMs = deps.initialCheckDelayMs ?? INITIAL_DELAY_MS;

    if (this.updater) {
      // electron-updater logs verbosely to console on every check. On a
      // detached GUI launch that console is a broken pipe (EPIPE), and the
      // periodic check kept writing to it — the direct cause of the freeze
      // loop. Silence the updater's own logger at the source ; the stdio guard
      // in boot-guards is the backstop for any other console write.
      this.updater.logger = null;
      this.wireEvents(this.updater);
    }
  }

  getState(): UpdateState {
    return this.currentState;
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.isDev) {
      this.setState({ state: 'disabled', reason: 'dev-mode' });
      return;
    }
    if (!this.updater) {
      this.setState({ state: 'error', message: 'updater not initialized' });
      return;
    }
    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = true;
    this.initialTimer = setTimeout(() => { void this.checkNow(); }, this.initialDelayMs);
    this.periodicTimer = setInterval(() => { void this.checkNow(); }, this.periodicMs);
  }

  stop(): void {
    if (this.initialTimer) { clearTimeout(this.initialTimer); this.initialTimer = null; }
    if (this.periodicTimer) { clearInterval(this.periodicTimer); this.periodicTimer = null; }
    this.started = false;
  }

  async checkNow(): Promise<UpdateState> {
    if (this.isDev) return { state: 'disabled', reason: 'dev-mode' };
    if (!this.updater) {
      const state: UpdateState = { state: 'error', message: 'updater not initialized' };
      this.setState(state);
      return state;
    }
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      const state: UpdateState = {
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
      this.setState(state);
      return state;
    }
    return this.currentState;
  }

  // Quits the app and applies the downloaded update. Caller must ensure state
  // is 'downloaded' first — otherwise this is a no-op.
  installNow(): void {
    if (this.currentState.state !== 'downloaded') return;
    if (!this.updater) return;
    this.updater.quitAndInstall(false, true);
  }

  private wireEvents(u: AutoUpdaterLike): void {
    u.on('checking-for-update', () => this.setState({ state: 'checking' }));
    u.on('update-available', (info) => this.setState({ state: 'available', version: info.version }));
    u.on('update-not-available', (info) => this.setState({ state: 'not-available', version: info.version }));
    u.on('download-progress', (p) => this.setState({
      state: 'downloading',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    }));
    u.on('update-downloaded', (info) => this.setState({ state: 'downloaded', version: info.version }));
    u.on('error', (err) => this.setState({ state: 'error', message: err.message }));
  }

  private setState(next: UpdateState): void {
    this.currentState = next;
    for (const l of this.listeners) {
      try { l(next); } catch { /* a listener must not break others */ }
    }
  }
}
