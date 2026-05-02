# CI Signing & Release Guide

This document describes how the `Electron Build` GitHub Actions workflow
(`.github/workflows/electron-build.yml`) builds and (optionally) signs the
BYAN desktop app for Linux and Windows.

## Overview

| Platform | Targets             | Signing                 | Required secrets                         |
|----------|---------------------|-------------------------|------------------------------------------|
| Linux    | AppImage, deb       | Not required            | None                                     |
| Windows  | NSIS installer (.exe) | Optional, opt-in      | `CSC_LINK`, `CSC_KEY_PASSWORD`           |
| macOS    | dmg, zip            | Deferred to F21 (P2)    | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

## Triggers

The workflow runs on:

- `push` to `main` — full matrix build, artifacts attached to the run.
- `push` of tag `v*` (e.g. `v0.1.0`) — full matrix build **plus** a draft
  GitHub Release with all artifacts attached.
- `pull_request` against `main` — full matrix build, no release.
- `workflow_dispatch` — manual trigger.

To cut a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds Linux + Windows, then the `release` job downloads the
artifacts and creates a **draft** release on GitHub. Edit and publish it
manually from the GitHub Releases UI.

## Windows Code Signing

Windows installers without an Authenticode signature trigger SmartScreen
warnings on first launch ("Windows protected your PC"). Users can still
install via "More info > Run anyway", but signing eliminates the warning.

### Option A — EV Certificate (recommended for production)

A DigiCert EV (Extended Validation) Code Signing certificate (~$300/year)
is the only way to get **immediate** SmartScreen reputation. Standard OV
certs build reputation slowly through usage.

1. Purchase the cert from DigiCert, Sectigo, or another CA.
2. Export the cert as a `.pfx` (PKCS#12) bundle including the private key.
3. Encode it as base64 (single line, no wrapping):

   ```bash
   base64 -w0 cert.pfx > cert.pfx.base64
   ```

4. Add two GitHub Secrets to the repo (Settings > Secrets and variables > Actions):

   - `CSC_LINK` — paste the contents of `cert.pfx.base64`.
   - `CSC_KEY_PASSWORD` — the password used when exporting the .pfx.

5. Push to `main` or tag `v*`. electron-builder picks up `CSC_LINK` /
   `CSC_KEY_PASSWORD` automatically and signs the installer.

### Option B — Self-signed certificate (development only)

A self-signed cert removes the "unknown publisher" line in the UAC prompt
but still triggers SmartScreen. Useful for internal testing.

1. On a Windows machine, in PowerShell (admin):

   ```powershell
   $cert = New-SelfSignedCertificate `
     -Type CodeSigningCert `
     -Subject "CN=Yan Acadenice (Dev)" `
     -KeyUsage DigitalSignature `
     -FriendlyName "BYAN Dev Signing" `
     -CertStoreLocation Cert:\CurrentUser\My
   ```

2. Export it with a password:

   ```powershell
   $pwd = ConvertTo-SecureString -String "your-password" -Force -AsPlainText
   Export-PfxCertificate -Cert $cert -FilePath cert.pfx -Password $pwd
   ```

3. Encode and configure secrets exactly as in Option A.

### Option C — No signing

If `CSC_LINK` is not set, electron-builder produces an **unsigned**
installer. The build still passes. Users will see SmartScreen on first
run; they can click "More info > Run anyway" to proceed.

This is acceptable for early alphas / internal testing but not for a
public release.

## Linux Signing

- **AppImage** — no signing is required by Linux desktop environments.
  The integrated AppImage launcher trusts the file based on its
  signature-less hash.
- **deb** — apt does not require signing for direct `.deb` installation
  (`sudo dpkg -i byan_*.deb`). Repository-level signing via `dpkg-sig`
  is deferred until BYAN ships its own apt repository.

No secrets are needed for Linux builds.

## macOS — Deferred to F21

Mac support (dmg + universal binary + Apple notarization) is tracked in
the P2 backlog as feature **F21**. When activated it will require:

- Apple Developer Program membership (~$99/year)
- A "Developer ID Application" certificate exported as `.p12`
- The following secrets:
  - `CSC_LINK` — base64-encoded `.p12` (note: name collides with Windows
    cert; the F21 workflow will use `CSC_LINK_MAC` instead)
  - `CSC_KEY_PASSWORD` — `.p12` password
  - `APPLE_ID` — Apple ID email used for notarization
  - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password from
    appleid.apple.com
  - `APPLE_TEAM_ID` — 10-character Team ID

Until F21 lands, macOS builds are not produced by CI.

## Troubleshooting

### `electron-builder` fails with "cannot find code signing certificate"

- Verify `CSC_LINK` contains valid base64 (no whitespace, no header).
- Verify `CSC_KEY_PASSWORD` matches the `.pfx` export password exactly.
- The base64 must decode to a `.pfx` file readable by Windows
  `certutil -dump`.

### `keytar` fails to build on the Linux runner

The workflow installs `libsecret-1-dev` before `npm ci`. If you fork
the workflow, keep that step or `keytar` will fail to compile its
native binding.

### Tag pushed but no draft release appears

Confirm the tag matches `v*` (e.g. `v0.1.0`, not `0.1.0` or
`release-0.1.0`). The release job is gated on
`startsWith(github.ref, 'refs/tags/v')`.

## References

- electron-builder code signing: https://www.electron.build/code-signing
- `softprops/action-gh-release`: https://github.com/softprops/action-gh-release
- BYAN F10 (electron-builder config): `app/electron-builder.yml`
- BYAN F21 (macOS support, P2): backlog
