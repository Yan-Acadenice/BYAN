# Icon Placeholders — Replace Before First Public Ship

The current `icon.png` and `icon.ico` are programmatically generated placeholders.
They are valid image files (correct headers, proper dimensions) but contain no real
graphic — only the BYAN theme background color (#0a0f1e) with a white rectangle marker.

## Specifications Required

| File | Format | Dimensions | Notes |
|------|--------|-----------|-------|
| `icon.png` | PNG RGBA | 512x512 px | Used for Linux AppImage + deb |
| `icon.ico` | ICO multi-res | 16/32/48/64/128/256 px | Used for Windows NSIS installer |

## Replacement Procedure

### icon.png
Drop the final 512x512 PNG here. electron-builder reads it directly for Linux targets.
No additional configuration change needed.

### icon.ico
Windows requires a proper multi-resolution ICO. Recommended tools:
- **ImageMagick**: `convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`
- **png2ico** (npm): `npx png2ico icon.ico icon-256.png icon-128.png icon-64.png icon-48.png icon-32.png icon-16.png`

Alternatively, use a single 256x256 PNG and let electron-builder generate the ICO via
`--win.icon` pointing to the PNG (electron-builder >= 24 supports PNG->ICO conversion on
Linux build hosts via `png2icons`).

## Freedesktop (Linux)

electron-builder reads `build/icons/` directory and expects PNG files named by size
(e.g. `16x16.png`, `32x32.png`, ..., `512x512.png`) for the `.desktop` file icon
installation. The current setup uses only `icon.png` (512x512) which electron-builder
copies automatically. For best integration, add sized variants before packaging.

## CI/CD Notes

- Code signing certificates for Windows are injected via env vars `CSC_LINK` and
  `CSC_KEY_PASSWORD` (F11). Do not hardcode any certificate data here.
- Mac build is deferred to F21; no `icon.icns` is required at this stage.
