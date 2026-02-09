# Turbo Whisper - Status & Quick Reference

## Installation Status: ✅ ACTIVE

**Location:** `~/.local/share/turbo-whisper/`
**Version:** Latest (GPU support enabled)
**Backend:** evdev (Wayland native)
**Hotkey:** Ctrl+Alt+R

## Recent Fixes

### 2026-02-07 (18:20): UTF-8 typing support for French characters

**Problem:** French accents corrupted/repeated (é → &)é)&)é...)
**Solution:** xdotool for UTF-8 typing (fallback cascade)
**Status:** ✅ RESOLVED

**Details:** See `TURBO-WHISPER-UTF8-FIX.md`

### 2026-02-07 (17:54): Wayland evdev keyboard grab fix

**Problem:** Keyboard completely blocked after hotkey detection
**Solution:** Non-exclusive monitoring mode
**Status:** ✅ RESOLVED

**Details:** See `TURBO-WHISPER-WAYLAND-FIX.md`

## Quick Commands

```bash
# Launch application
/tmp/launch-turbo.sh

# Validate installation
/tmp/test-turbo-whisper.sh

# View checklist
cat /tmp/test-checklist.txt

# Change hotkey
nano ~/.config/turbo-whisper/config.json
```

## Known Limitations

1. **Non-exclusive hotkey (Wayland)**
   - Other apps may also react to Ctrl+Alt+R
   - Workaround: Choose unique hotkey combo

2. **xdotool requires XWayland**
   - Works on Wayland via X11 compatibility layer
   - Native alternative: ydotool (requires daemon setup)
   
3. **STT Quality**
   - Depends on speech clarity
   - Model: tiny.en (fast, moderate accuracy)
   - GPU: CUDA enabled for performance

## Documentation Index

| File | Description |
|------|-------------|
| `TURBO-WHISPER-INTEGRATION-SUMMARY.md` | Initial integration & setup |
| `TURBO-WHISPER-GPU-ACTIVATION.md` | CUDA/GPU configuration |
| `TURBO-WHISPER-GUIDE-UTILISATION.md` | User guide (French) |
| `TURBO-WHISPER-WAYLAND-FIX.md` | evdev grab fix analysis |
| `TURBO-WHISPER-UTF8-FIX.md` | UTF-8 typing (xdotool) |

## Support

**Logs:** Terminal output when launched via `/tmp/launch-turbo.sh`
**Config:** `~/.config/turbo-whisper/config.json`
**Source:** `~/.local/share/turbo-whisper/`

## Last Updated

2026-02-07 18:20 - UTF-8 typing fix (xdotool) + evdev grab fix completed
