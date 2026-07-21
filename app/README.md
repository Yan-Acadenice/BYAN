# BYAN Desktop

Electron desktop application for BYAN. Wraps the existing local server and web UI
in a native shell with OS-level secure storage, a 5-step onboarding flow, and a
native application menu.

**Supported platforms (v1.0):** Linux x64 (AppImage, deb), Windows x64 (NSIS installer).
macOS is deferred to v1.1 (F21).

**Who is it for:** developers and teams already using BYAN who want a standalone
desktop experience without keeping a browser tab open or managing a terminal process.

## Decision record — Electron over Tauri (2026-07-21)

Tauri was considered for the desktop shell. Electron stays, for three reasons:

1. **The local server is Node.** The app's core job is to fork
   `install/src/webui/server.js` (Node, http+ws). Electron ships a Node runtime,
   so the fork is free. Tauri has no Node: it would need a bundled Node sidecar
   (which erases Tauri's small-binary advantage, its main selling point) or a
   Rust rewrite of the server that the CLI also uses.
2. **The shell already exists in Electron.** main + preload + renderer
   (TypeScript/React), keytar secure storage, auto-updater, Playwright E2E
   suite, electron-builder config for Linux/Windows. Switching means rewriting
   the main process in Rust and re-validating everything, for no user-visible
   feature.
3. **One toolchain.** The whole repo is Node/JS. Tauri adds a Rust toolchain to
   every contributor machine and to CI.

Tauri's real advantages (10-20 MB binaries vs ~100 MB, lower RAM via system
webview) are outweighed here by the Node-server coupling. Revisit only if the
local server is ever rewritten out of Node.

---

## Architecture

```
app/
  main/       Main process (Node/TypeScript) — window lifecycle, server spawn, IPC router
  preload/    Preload bridge (TypeScript)    — contextBridge, typed IPC channels
  renderer/   Renderer SPA (React 18 + Vite) — loads webui via @webui alias
  shared/     Types shared across all three layers
  dist/       Build output (gitignored)
  __tests__/  Playwright E2E suite + Vitest unit tests
```

### Process model

```
+---------------------+      IPC channels      +-------------------+
|  Main process       | <--------------------> |  Preload bridge   |
|  (Node, full APIs)  |   get-token/set-token  |  (contextBridge)  |
|                     |   server-ready         +-------------------+
|  spawns:            |   navigate                      |
|    local server     |                        +-------------------+
|    (webui/server.js)|                        |  Renderer (React) |
+---------------------+                        |  sandboxed, no    |
         |                                     |  Node access      |
    BYAN_PORT env                               +-------------------+
         |
  127.0.0.1:<free port>
```

Rules enforced at build time:
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

All renderer-to-Node communication goes through the preload bridge. The renderer
has no direct access to Node APIs or the filesystem.

---

## Installation and dev

```bash
cd app
npm install
```

### Development

```bash
npm run dev
```

Starts four concurrent processes: Vite dev server (port 5173), TypeScript watcher
for main, TypeScript watcher for preload, and Electron. The main process detects
`BYAN_DEV=1` and loads `http://localhost:5173` instead of the built renderer.

Hot reload: renderer changes reflect immediately via Vite HMR. Main/preload changes
require restarting the Electron process (Ctrl+C then `npm run dev` again, or use
the View > Reload menu entry).

### Type-check only (no emit)

```bash
npm run typecheck
```

Runs `tsc --noEmit` for all three tsconfigs (main, preload, renderer).

### Production build

```bash
npm run build
```

Compiles main + preload (TypeScript) and bundles renderer (Vite) into `dist/`.

```bash
npm start
```

Launches Electron against the current `dist/` (requires `npm run build` first).

### Packaging

```bash
npm run build:linux
```

Produces `release/byan-app-<version>.AppImage` and `release/byan-app-<version>.deb`
via electron-builder. Requires `electron-builder` installed (included in devDependencies).

```bash
npm run build:win
```

Produces `release/byan-app-<version>-setup.exe` (NSIS). Run on a Windows runner or
via cross-compilation with Wine on Linux.

### Tests

```bash
npm test
```

Runs Vitest unit tests for main process utilities and preload bridge.

```bash
npm run test:e2e
```

Runs the Playwright E2E suite headlessly. Covers: app launch, onboarding flow,
login modal, token store round-trip, native menu visibility.

---

## Onboarding flow

The onboarding runs on first launch and is skipped on subsequent launches.
State is persisted via Electron store (`userData/config.json`).

```
Step 1 — Welcome
  Displays app version and platform. User clicks "Get started".

Step 2 — Platform detection
  Detects OS (Linux / Windows). Shows what will be configured.

Step 3 — Config preview
  Shows the planned configuration: server port, login mode, token storage backend.

Step 4 — Apply
  Spawns local server, stores initial token in OS keychain, writes config.

Step 5 — Done
  Confirms setup. Opens main UI. Onboarding flag set to avoid re-running.
```

---

## Login modes

Three modes are selectable at runtime via the native menu (File > Switch login mode)
or during onboarding.

| Mode | Server | When to use |
|------|--------|-------------|
| `cloud` | `https://byan.acadenice.fr` | SaaS account, no local install needed |
| `local` | `http://127.0.0.1:<port>` | Local BYAN server auto-spawned by the app |
| `custom` | User-supplied URL | Self-hosted instance, dev cluster |

The active mode is persisted in `userData/config.json`. Switching mode triggers
a renderer navigation to the new base URL; no app restart required.

---

## Security

The app enforces four layers of isolation:

1. **Process sandbox** — `sandbox: true` on the renderer window; the renderer process
   has no access to Node.js APIs or native modules.

2. **Context isolation** — `contextIsolation: true` ensures the renderer's JavaScript
   context is separate from the preload script's context. The only surface exposed is
   the `window.byan` API injected by `contextBridge`.

3. **CSP** — A strict Content Security Policy is set on every loaded page. Inline
   scripts and eval are blocked; all resources must originate from `self` or the
   configured server origin.

4. **Keytar** — API tokens are stored in the OS keychain (libsecret on Linux,
   Windows Credential Manager on Windows) via `keytar`. Config files on disk contain
   no credentials. The preload exposes `get-token` / `set-token` IPC channels; the
   renderer calls these and has no direct keytar access.

**System dependencies for keytar:**
- Linux: `libsecret-1-0` (`sudo apt install libsecret-1-0` on Debian/Ubuntu)
- Windows: Windows Credential Manager (built in, no extra install)

---

## CI and release

CI is defined in `.github/workflows/electron-ci.yml`.

The matrix runs two jobs in parallel:
- `linux` on `ubuntu-latest` — builds AppImage + deb, runs unit + E2E tests
- `windows` on `windows-latest` — builds NSIS installer, runs unit tests

A draft GitHub Release is created automatically when a `v*` tag is pushed.
The AppImage, deb, and NSIS installer are attached as release artifacts.

**First release procedure:**

```bash
git tag v0.1.0-rc
git push origin v0.1.0-rc
```

This triggers the CI matrix and creates a draft release. Review the artifacts,
then promote the draft to a published release. For the stable release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

See `app/CI-SIGNING.md` for code-signing setup (Windows EV certificate, Linux GPG).

---

## Roadmap v1.1

| Feature | ID | Priority |
|---------|----|----------|
| Auto-update via electron-updater | F9 | P2 |
| macOS support | F21 | P2 |
| MCP control panel | F14 | P2 |
| Notifications (toast) | F7 | P3 |
| Offline mode indicator | F8 | P3 |
| Localization (i18n) | F15 | P3 |
| Accessibility audit | F16 | P3 |
| Deep links (byan:// protocol) | F17 | P3 |
| Plugin / extension panel | F20 | P3 |

---

## Package notes

`app/` is a standalone npm package with its own `package.json` and lockfile.
It is NOT an npm workspace of the repo root. The root publishes `create-byan-agent`
and depends on `file:./install/packages/platform-config`; activating workspaces
would break that publishing pipeline. Run all `npm` commands from inside `app/`.
