# CI Signing & Release Guide

This document describes how the `Electron Build` GitHub Actions workflow
(`.github/workflows/electron-build.yml`) builds and (optionally) signs the
BYAN desktop app for Linux, Windows, and macOS.

## Overview

| Platform | Targets             | Signing                 | Required secrets                         |
|----------|---------------------|-------------------------|------------------------------------------|
| Linux    | AppImage, deb       | Not required            | None                                     |
| Windows  | NSIS installer (.exe) | Optional, opt-in      | `CSC_LINK`, `CSC_KEY_PASSWORD`           |
| macOS    | dmg (x64 + arm64), zip | Optional, opt-in     | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

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

The workflow builds Linux + Windows + macOS in parallel, then the `release`
job downloads the artifacts and creates a **draft** release on GitHub. Edit
and publish it manually from the GitHub Releases UI.

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

## macOS Code Signing & Notarization

macOS builds produce a universal DMG (x64 + arm64) plus a ZIP for
electron-updater delta updates. Without a Developer ID certificate the
app still builds but Gatekeeper blocks it on first launch — users have
to right-click → Open to bypass. Signing + notarization eliminate that
friction.

### Option A — Signed and notarized (recommended for production)

Apple Developer Program membership is ~$99/year and gives you a
"Developer ID Application" certificate plus access to the notarization
service.

1. Create the cert in Xcode (Keychain Access → certificate assistant →
   request from CA) or in the Apple Developer portal.
2. Export the cert + private key as a `.p12` bundle (right-click the cert
   in Keychain Access → Export, choose `.p12`, set a password).
3. Encode it as base64:

   ```bash
   base64 -i cert.p12 -o cert.p12.base64
   ```

4. Generate an app-specific password at appleid.apple.com → Sign-In and
   Security → App-Specific Passwords.

5. Add five GitHub Secrets to the repo:

   - `CSC_LINK` — paste the base64 cert contents.
   - `CSC_KEY_PASSWORD` — the `.p12` export password.
   - `APPLE_ID` — your Apple ID email.
   - `APPLE_APP_SPECIFIC_PASSWORD` — the app-specific password from step 4.
   - `APPLE_TEAM_ID` — 10-character Team ID from the Apple Developer portal.

6. Push to `main` or tag `v*`. electron-builder picks up the secrets,
   signs the DMG, and submits it to the notarization service. The notary
   ticket is stapled to the DMG before upload.

> **Note**: `CSC_LINK` is shared between Windows and macOS signing. If
> you sign both platforms with different certs, scope the secrets per
> job using `CSC_LINK_WIN` / `CSC_LINK_MAC` (electron-builder honors
> both naming conventions).

### Option B — No signing

If `CSC_LINK` is not set, electron-builder produces an **unsigned**
DMG. The build still passes. Users will see "BYAN cannot be opened
because the developer cannot be verified" — they bypass via right-click
→ Open the first time. This is acceptable for early alphas / internal
testing but not for a public release.

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
- BYAN F21 (macOS support): `app/build/entitlements.mac.plist`
