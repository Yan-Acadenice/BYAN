# Configure Workflow - API & Hotkeys

**Workflow:** Configure Turbo Whisper Settings  
**Duration:** 5-10 minutes  
**Goal:** Customize API endpoint, hotkeys, and preferences

---

## OVERVIEW

Configure Turbo Whisper for optimal performance and user experience.

---

## STEP 1: Current Configuration Review

**Display Current Settings:**
```bash
CONFIG_FILE=~/.config/turbo-whisper/config.json

echo "=== Current Configuration ==="
cat "$CONFIG_FILE" | jq '.'
echo ""
```

**Parse and Display:**
```
"Current Settings:

API:
- URL: {api_url}
- Key: {api_key or '(none)'}

HOTKEY:
- Current: {hotkey}

BEHAVIOR:
- Auto-paste: {auto_paste}
- Copy to clipboard: {copy_to_clipboard}
- Typing delay: {typing_delay_ms}ms

APPEARANCE:
- Waveform color: {waveform_color}
- Background color: {background_color}

CLAUDE INTEGRATION:
- Enabled: {claude_integration}
- Port: {claude_integration_port}

What would you like to configure?
1. API settings
2. Hotkey
3. Behavior (auto-paste, clipboard)
4. Typing speed
5. Appearance
6. Claude integration
7. Language
8. Review all settings
9. Exit

Choice: ___"
```

---

## OPTION 1: API Settings

```
"API Configuration

Current API URL: {api_url}

Select API type:
1. Self-hosted faster-whisper (localhost:8000)
2. OpenAI Whisper API (requires API key)
3. Custom endpoint

Choice (1-3): ___"
```

**Option 1.1: Self-Hosted:**
```bash
# Update to self-hosted
jq '.api_url = "http://localhost:8000/v1/audio/transcriptions" | .api_key = ""' \
  "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✓ Configured for self-hosted faster-whisper-server"
echo "✓ API URL: http://localhost:8000/v1/audio/transcriptions"
echo "✓ API Key: (none required)"
```

**Option 1.2: OpenAI API:**
```bash
read -sp "Enter OpenAI API key (sk-...): " api_key
echo ""

# Validate key format
if [[ ! $api_key =~ ^sk- ]]; then
  echo "ERROR: Invalid API key format (must start with 'sk-')"
  exit 1
fi

# Update config
jq --arg key "$api_key" \
  '.api_url = "https://api.openai.com/v1/audio/transcriptions" | .api_key = $key' \
  "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✓ Configured for OpenAI Whisper API"
echo "✓ API Key: ${api_key:0:7}... (hidden)"
```

**Option 1.3: Custom Endpoint:**
```bash
read -p "Enter custom API URL: " custom_url
read -sp "Enter API key (or press Enter if none): " api_key
echo ""

jq --arg url "$custom_url" --arg key "$api_key" \
  '.api_url = $url | .api_key = $key' \
  "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✓ Configured for custom endpoint"
echo "✓ API URL: $custom_url"
```

**Test API Connection:**
```bash
echo ""
echo "Testing API connection..."

# Create test audio (if available)
# Otherwise, skip test
if command -v ffmpeg &> /dev/null; then
  # Generate 1 second of silence
  ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 1 -q:a 9 -acodec libmp3lame /tmp/test-audio.mp3 -y 2>/dev/null
  
  # Test API
  api_url=$(jq -r '.api_url' "$CONFIG_FILE")
  api_key=$(jq -r '.api_key' "$CONFIG_FILE")
  
  if [ -n "$api_key" ]; then
    response=$(curl -s -X POST "$api_url" \
      -H "Authorization: Bearer $api_key" \
      -F "file=@/tmp/test-audio.mp3" \
      -F "model=whisper-1")
  else
    response=$(curl -s -X POST "$api_url" \
      -F "file=@/tmp/test-audio.mp3" \
      -F "model=whisper-1")
  fi
  
  if echo "$response" | jq -e '.text' &> /dev/null; then
    echo "✓ API connection successful!"
  else
    echo "✗ API connection failed:"
    echo "$response"
  fi
  
  rm /tmp/test-audio.mp3
else
  echo "⚠ ffmpeg not found, skipping API test"
  echo "Test manually by recording voice input"
fi
```

---

## OPTION 2: Hotkey Configuration

```
"Hotkey Configuration

Current hotkey: {current_hotkey}

Common hotkey combinations:
1. Ctrl+Shift+Space (default, may conflict)
2. Ctrl+Alt+W (less conflicts)
3. Ctrl+Shift+V (voice mnemonic)
4. Super+Space (Linux, desktop-dependent)
5. Custom

Select (1-5): ___"
```

**Update Hotkey:**
```bash
read -p "Choice (1-5): " choice

case $choice in
  1) hotkey='["ctrl", "shift", "space"]' ;;
  2) hotkey='["ctrl", "alt", "w"]' ;;
  3) hotkey='["ctrl", "shift", "v"]' ;;
  4) hotkey='["super", "space"]' ;;
  5)
    echo "Enter modifiers and key separated by commas"
    echo "Available: ctrl, shift, alt, super"
    echo "Example: ctrl,alt,v"
    read -p "Hotkey: " custom
    hotkey="[\"$(echo $custom | sed 's/,/","/g')\"]"
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

# Update config
jq ".hotkey = $hotkey" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

new_hotkey=$(jq -r '.hotkey | join("+")' "$CONFIG_FILE")
echo "✓ Hotkey updated to: $new_hotkey"
echo "⚠ Restart Turbo Whisper for changes to take effect"
```

**Check for Conflicts:**
```bash
echo ""
echo "Checking for hotkey conflicts..."

# Linux: Check gsettings
if command -v gsettings &> /dev/null; then
  conflicts=$(gsettings list-recursively | grep -i "$new_hotkey" | grep -v turbo-whisper)
  if [ -n "$conflicts" ]; then
    echo "⚠ Potential conflicts found:"
    echo "$conflicts"
    echo ""
    echo "Consider disabling these shortcuts or choosing different hotkey"
  else
    echo "✓ No obvious conflicts detected"
  fi
fi
```

---

## OPTION 3: Behavior Settings

```
"Behavior Configuration

Configure text input behavior:

1. Auto-paste (type into active window)
   Current: {auto_paste}
   
2. Copy to clipboard
   Current: {copy_to_clipboard}

3. Both (type AND copy)

Recommended: Both (option 3)

Select (1-3): ___"
```

**Update Behavior:**
```bash
read -p "Choice (1-3): " choice

case $choice in
  1)
    jq '.auto_paste = true | .copy_to_clipboard = false' \
      "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
    echo "✓ Auto-paste: ON, Clipboard: OFF"
    ;;
  2)
    jq '.auto_paste = false | .copy_to_clipboard = true' \
      "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
    echo "✓ Auto-paste: OFF, Clipboard: ON"
    ;;
  3)
    jq '.auto_paste = true | .copy_to_clipboard = true' \
      "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
    echo "✓ Auto-paste: ON, Clipboard: ON"
    ;;
esac

mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
```

---

## OPTION 4: Typing Speed

```
"Typing Speed Configuration

Current typing delay: {typing_delay_ms}ms between characters

GUIDANCE:
- 1ms: Very fast (may cause issues on some systems)
- 5ms: Default (good balance)
- 10ms: Slower (more reliable, less CPU usage)
- 20ms: Very slow (for problematic applications)

If text appears with missing characters, increase delay.
If typing is too slow, decrease delay.

Enter new delay in milliseconds (1-50): ___"
```

**Update Typing Delay:**
```bash
read -p "Typing delay (ms): " delay

if ! [[ "$delay" =~ ^[0-9]+$ ]] || [ "$delay" -lt 1 ] || [ "$delay" -gt 50 ]; then
  echo "ERROR: Invalid delay (must be 1-50)"
  exit 1
fi

jq --arg delay "$delay" '.typing_delay_ms = ($delay | tonumber)' \
  "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✓ Typing delay set to ${delay}ms"
```

---

## OPTION 5: Appearance

```
"Appearance Configuration

Customize waveform visualization:

1. Waveform color
   Current: {waveform_color}
   
2. Background color
   Current: {background_color}

Select (1-2): ___"
```

**Update Colors:**
```bash
read -p "Choice (1-2): " choice

if [ "$choice" = "1" ]; then
  echo "Enter waveform color (hex, e.g., #00ff88): "
  read -p "Color: " color
  jq --arg color "$color" '.waveform_color = $color' \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
  mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
  echo "✓ Waveform color updated to $color"
  
elif [ "$choice" = "2" ]; then
  echo "Enter background color (hex, e.g., #1a1a2e): "
  read -p "Color: " color
  jq --arg color "$color" '.background_color = $color' \
    "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
  mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
  echo "✓ Background color updated to $color"
fi
```

---

## OPTION 6: Claude Integration

```
"Claude Integration Configuration

Current status: {claude_integration}

Enable Claude Code integration?

This enables synchronization with Claude Code post-response hooks,
preventing text from being typed while Claude is responding.

Enable? (yes/no): ___"
```

**Update Claude Integration:**
```bash
read -p "Enable (yes/no): " enable

if [ "$enable" = "yes" ]; then
  jq '.claude_integration = true' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
  mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
  echo "✓ Claude integration enabled"
  echo ""
  echo "Next steps:"
  echo "1. Create hook: ~/.claude/hooks/post-response.sh"
  echo "2. Configure Claude Code settings"
  echo "3. Test synchronization"
  echo ""
  echo "Use [INT] menu to setup hooks automatically"
else
  jq '.claude_integration = false' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
  mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
  echo "✓ Claude integration disabled"
fi
```

---

## OPTION 7: Language Configuration

```
"Language Configuration

Current language: {language}

Turbo Whisper supports 99 languages via OpenAI Whisper.

Common languages:
- en (English)
- fr (French)
- es (Spanish)
- de (German)
- zh (Chinese)
- ja (Japanese)
- auto (auto-detect)

Enter language code: ___"
```

**Update Language:**
```bash
read -p "Language code: " lang

jq --arg lang "$lang" '.language = $lang' \
  "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "✓ Language set to: $lang"
```

---

## OPTION 8: Review All Settings

**Display Complete Configuration:**
```bash
echo "=== Complete Configuration ==="
echo ""
cat "$CONFIG_FILE" | jq '.'
echo ""
echo "Configuration file: $CONFIG_FILE"
echo ""
echo "Changes require restart: turbo-whisper"
```

---

## CONFIGURATION SUMMARY

```
"Configuration Updated!

SUMMARY OF CHANGES:
{list of changes made}

CONFIGURATION FILE:
Location: {config_file}
Backup: {config_file}.backup

RESTART REQUIRED:
Changes will take effect after restarting Turbo Whisper.

Restart now? (yes/no)"
```

**If Yes:**
```bash
# Find and kill existing turbo-whisper process
ps aux | grep '[t]urbo-whisper' | awk '{print $2}' | xargs -r kill

# Start Turbo Whisper
turbo-whisper &

echo "✓ Turbo Whisper restarted"
```

---

## SUCCESS CRITERIA

✅ Configuration file updated
✅ Settings validated
✅ Backup created
✅ Changes applied successfully
