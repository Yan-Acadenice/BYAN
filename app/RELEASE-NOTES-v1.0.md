# BYAN Desktop v1.0 — Release Notes

Release date: 2026-05-02
Tag: `v1.0.0` (or `v0.1.0` for the initial ship)

---

## What is BYAN Desktop

BYAN Desktop is the native Electron shell for the BYAN platform. It brings the
existing BYAN web UI into a standalone desktop application with OS-level secure
storage, a guided onboarding flow, and a native application menu — no browser tab,
no terminal required after first launch.

---

## Highlights

- **5-step onboarding** guides first-time users from zero to a configured, running
  BYAN instance in under two minutes on Linux and Windows.

- **Three login modes** — cloud, local, custom — selectable at runtime, persisted
  between sessions. Switch without restarting the app.

- **OS keychain storage** via `keytar`: API tokens are stored in libsecret (Linux)
  or Windows Credential Manager (Windows), not in plaintext config files.

- **Strict security defaults**: sandbox enabled, context isolation, CSP that blocks
  inline scripts and eval. The renderer has no direct access to Node.js or the
  filesystem.

- **Cross-platform CI**: GitHub Actions matrix builds Linux (AppImage + deb) and
  Windows (NSIS installer) in parallel. A draft GitHub Release is created
  automatically on a `v*` tag push.

- **Playwright E2E suite**: app launch, onboarding, login modal, token round-trip,
  and native menu all covered by automated tests running in CI.

- **Native application menu** on Linux and Windows with standard edit actions,
  dev-tools access in development mode, and a Help > About entry.

---

## Supported platforms

| Platform | Format | Architecture |
|----------|--------|--------------|
| Linux | AppImage | x64 |
| Linux | .deb | x64 |
| Windows | NSIS installer (.exe) | x64 |

macOS is not supported in v1.0. It is planned for v1.1 (F21).

---

## Known limitations

**macOS not included.** The code branch exists but has not been tested and there
is no CI runner for it. Do not attempt to build for macOS from this release.

**Windows SmartScreen warning on first run.** The NSIS installer is not signed
with an Extended Validation (EV) certificate in v1.0. Windows may show a
"Windows protected your PC" dialog. Click "More info" then "Run anyway" to proceed.
See `app/CI-SIGNING.md` for how to add code signing in a future release.

**Auto-update not yet implemented.** The "Check for updates" menu item is present
but inert in v1.0. Manual update: download the new installer from the GitHub
Releases page and run it over the existing installation.

**MCP control panel not yet implemented.** MCP configuration must still be done
by editing `.mcp.json` directly. A graphical panel is planned for v1.1 (F14).

---

## System requirements

### Linux

- x64 CPU
- glibc 2.17 or later (satisfied by any current Ubuntu, Debian, Fedora, Arch)
- `libsecret-1-0` for keychain storage

```bash
sudo apt install libsecret-1-0   # Debian / Ubuntu
sudo dnf install libsecret       # Fedora
```

### Windows

- Windows 10 x64 or later
- Windows Credential Manager (built in, no extra install)
- Visual C++ Redistributable 2015-2022 (usually already present; bundled in the
  NSIS installer if absent)

---

## Getting started

### Linux (AppImage)

```bash
chmod +x byan-app-1.0.0.AppImage
./byan-app-1.0.0.AppImage
```

### Linux (deb)

```bash
sudo dpkg -i byan-app-1.0.0.deb
byan-app
```

### Windows

Run `byan-app-1.0.0-setup.exe`. Accept the SmartScreen prompt if shown.
The installer creates a Start Menu entry and an optional desktop shortcut.

On first launch, the 5-step onboarding will run automatically. It detects your
platform, configures the local server, and stores your API token in the OS keychain.

---

## Roadmap v1.1

| Feature | Notes |
|---------|-------|
| macOS support (F21) | AppImage + dmg, tested on Apple Silicon and Intel |
| Auto-update (F9) | electron-updater, differential updates |
| MCP control panel (F14) | GUI for editing MCP server configuration |

---

## Feedback and issues

Report bugs and feature requests at:
https://github.com/Yan-Acadenice/BYAN/issues

Please include your OS version, app version (Help > About), and steps to reproduce.
