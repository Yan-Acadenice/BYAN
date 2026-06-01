# Platform Integration Workflow

**Workflow:** Integrate Turbo Whisper with AI Platforms  
**Duration:** 10-15 minutes  
**Platforms:** GitHub Copilot CLI, Claude Code, Codex

---

## OVERVIEW

Configure Turbo Whisper to work seamlessly with GitHub Copilot CLI, Claude Code, and Codex platforms for voice-driven agent interaction.

---

## STEP 1: Select Platform

```
"Which platform(s) do you want to integrate?

1. GitHub Copilot CLI (auto-type mode, works out-of-box)
2. Claude Code (requires post-response hook)
3. Codex (auto-type mode, works out-of-box)
4. All platforms

Select (1/2/3/4): ___"
```

---

## PLATFORM 1: GitHub Copilot CLI

**Integration Type:** Auto-type (no special configuration needed)

```
"GitHub Copilot CLI Integration

HOW IT WORKS:
✓ Press hotkey while in terminal
✓ Speak your command or question
✓ Text automatically typed into terminal
✓ Press Enter to send to Copilot

CONFIGURATION:
No special setup required! Turbo Whisper's auto-type mode
works perfectly with GitHub Copilot CLI.

EXAMPLE WORKFLOW:
1. Open terminal, start Copilot: gh copilot
2. Press {hotkey} (default Ctrl+Shift+Space)
3. Say: 'What are the git commands to undo my last commit'
4. Text appears in terminal
5. Press Enter

TEST NOW:
1. Open a terminal
2. Type: gh copilot suggest -t shell
3. Press {hotkey}
4. Say: 'show me all files modified in the last week'
5. Press {hotkey} again

Ready to test? (yes/no)"
```

**Test GitHub Copilot CLI:**
```bash
# Check if gh copilot is available
gh copilot --version

# If not installed
if [ $? -ne 0 ]; then
  echo "GitHub Copilot CLI not found."
  echo "Install: gh extension install github/gh-copilot"
  exit 1
fi

# Launch test session
echo "Testing voice input with GitHub Copilot CLI..."
echo ""
echo "1. Press ${hotkey} and say: 'create a git branch for testing'"
echo "2. Press ${hotkey} again to stop recording"
echo "3. Verify text appears in your terminal"
echo ""
echo "Press Enter when ready to start test..."
read

gh copilot suggest -t shell
```

---

## PLATFORM 2: Claude Code (Experimental)

**Integration Type:** Post-response hook (synchronization required)

```
"Claude Code Integration (Experimental)

HOW IT WORKS:
Claude Code can respond while you're speaking. To prevent
text from being typed while Claude is responding, we need
a synchronization mechanism:

1. You speak and press hotkey
2. Turbo Whisper waits for 'ready' signal (2s timeout)
3. Claude finishes responding and sends signal
4. Text is typed into terminal

REQUIREMENTS:
✓ Claude Code installed
✓ Post-response hook support
✓ curl command available

SETUP STEPS:
1. Enable Claude integration in Turbo Whisper config
2. Create post-response hook script
3. Configure Claude Code to run hook
4. Test synchronization

Proceed? (yes/no)"
```

**Step 2.1: Enable Claude Integration:**
```bash
CONFIG_FILE=~/.config/turbo-whisper/config.json

# Backup config
cp "$CONFIG_FILE" "${CONFIG_FILE}.backup"

# Update config with jq
jq '.claude_integration = true | .claude_integration_port = 7878' "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "Claude integration enabled in Turbo Whisper config"
```

**Step 2.2: Create Hook Directory:**
```bash
# Create Claude Code hooks directory
mkdir -p ~/.claude/hooks

echo "Hook directory created: ~/.claude/hooks"
```

**Step 2.3: Create Post-Response Hook:**
```bash
cat > ~/.claude/hooks/post-response.sh << 'EOF'
#!/bin/bash
# Signal Turbo Whisper that Claude is ready for input
curl -s -X POST http://localhost:7878/ready > /dev/null 2>&1
EOF

# Make executable
chmod +x ~/.claude/hooks/post-response.sh

echo "Hook created: ~/.claude/hooks/post-response.sh"
```

**Step 2.4: Configure Claude Code:**
```bash
# Claude Code settings file
CLAUDE_SETTINGS=~/.claude/settings.json

# Create settings if not exists
if [ ! -f "$CLAUDE_SETTINGS" ]; then
  mkdir -p ~/.claude
  echo '{}' > "$CLAUDE_SETTINGS"
fi

# Add hook configuration
jq '.hooks.postResponse = ["~/.claude/hooks/post-response.sh"]' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp"
mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"

echo "Claude Code configured to run post-response hook"
```

**Step 2.5: Verify Hook:**
```bash
# Test hook manually
echo "Testing hook..."
~/.claude/hooks/post-response.sh

# Check if Turbo Whisper server is running
if curl -s http://localhost:7878/health > /dev/null 2>&1; then
  echo "✓ Turbo Whisper server responding"
else
  echo "✗ Turbo Whisper server not responding"
  echo "Make sure Turbo Whisper is running: turbo-whisper"
fi
```

**Step 2.6: Test Integration:**
```
"Testing Claude Code Integration

WORKFLOW:
1. Start Turbo Whisper: turbo-whisper
2. Open Claude Code terminal
3. Ask Claude a question (wait for response to complete)
4. Press {hotkey}
5. Say your next prompt
6. Press {hotkey} again

EXPECTED BEHAVIOR:
- If Claude is responding: Text copied to clipboard (notification: 'Copied (Claude busy)')
- If Claude is idle: Text typed directly into terminal

WITHOUT HOOK:
If hook is not configured, Turbo Whisper will wait 2 seconds
then copy to clipboard only (safe fallback).

Test now? (yes/no)"
```

**Configuration Summary:**
```
"Claude Code Integration Complete!

FILES CREATED:
✓ ~/.claude/hooks/post-response.sh (executable)
✓ ~/.claude/settings.json (hook configured)
✓ ~/.config/turbo-whisper/config.json (claude_integration: true)

SERVER:
✓ Turbo Whisper HTTP server: localhost:7878
✓ Health endpoint: http://localhost:7878/health
✓ Ready endpoint: http://localhost:7878/ready (POST)

BEHAVIOR:
- Claude responding → Text copied to clipboard
- Claude idle → Text typed directly
- Timeout: 2 seconds

To disable synchronization:
Set 'claude_integration: false' in Turbo Whisper config
(falls back to immediate typing)
"
```

---

## PLATFORM 3: Codex

**Integration Type:** Auto-type (no special configuration needed)

```
"Codex Integration

HOW IT WORKS:
✓ Press hotkey while in Codex terminal/prompt
✓ Speak your prompt or code description
✓ Text automatically typed into Codex interface
✓ Submit to Codex

CONFIGURATION:
No special setup required! Turbo Whisper's auto-type mode
works with Codex out-of-box.

HOTKEY CONSIDERATION:
If Ctrl+Shift+Space conflicts with Codex shortcuts,
change the hotkey in Turbo Whisper config.

Suggested alternatives:
- Ctrl+Alt+W
- Ctrl+Shift+V
- Super+Space (Linux)

Change hotkey? (yes/no)"
```

**If Yes, Change Hotkey:**
```bash
CONFIG_FILE=~/.config/turbo-whisper/config.json

echo "Current hotkey: $(jq -r '.hotkey | join("+")' "$CONFIG_FILE")"
echo ""
echo "Select new hotkey:"
echo "1. Ctrl+Alt+W"
echo "2. Ctrl+Shift+V"
echo "3. Super+Space"
echo "4. Custom"
echo ""
read -p "Choice (1-4): " choice

case $choice in
  1) new_hotkey='["ctrl", "alt", "w"]' ;;
  2) new_hotkey='["ctrl", "shift", "v"]' ;;
  3) new_hotkey='["super", "space"]' ;;
  4)
    read -p "Enter custom hotkey (e.g., ctrl,shift,z): " custom
    new_hotkey="[\"$(echo $custom | sed 's/,/","/g')\"]"
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

# Update config
jq ".hotkey = $new_hotkey" "$CONFIG_FILE" > "${CONFIG_FILE}.tmp"
mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"

echo "Hotkey updated to: $(jq -r '.hotkey | join("+")' "$CONFIG_FILE")"
echo "Restart Turbo Whisper for changes to take effect"
```

**Test Codex Integration:**
```
"Testing Codex Integration

WORKFLOW:
1. Open Codex terminal or web interface
2. Press {hotkey}
3. Say: 'Create a Python function to calculate fibonacci numbers'
4. Press {hotkey} again
5. Verify text appears in Codex prompt

Test now? (yes/no)"
```

---

## STEP 2: Cross-Platform Validation

**Test All Platforms:**
```
"Cross-Platform Validation

Test voice input on all configured platforms:

GITHUB COPILOT CLI:
□ Terminal accepts voice input
□ Text typed correctly
□ No character loss or duplication

CLAUDE CODE:
□ Voice input works
□ Hook synchronization works (if configured)
□ Fallback to clipboard works

CODEX:
□ Voice input works
□ No hotkey conflicts
□ Text submitted correctly

Run validation tests? (yes/no)"
```

**Validation Script:**
```bash
echo "=== Cross-Platform Validation ==="
echo ""

# Test 1: GitHub Copilot CLI
echo "TEST 1: GitHub Copilot CLI"
if command -v gh &> /dev/null && gh extension list | grep -q copilot; then
  echo "✓ GitHub Copilot CLI installed"
else
  echo "✗ GitHub Copilot CLI not found"
fi
echo ""

# Test 2: Claude Code
echo "TEST 2: Claude Code"
if [ -f ~/.claude/hooks/post-response.sh ]; then
  echo "✓ Hook script exists"
  if [ -x ~/.claude/hooks/post-response.sh ]; then
    echo "✓ Hook is executable"
  else
    echo "✗ Hook not executable"
  fi
else
  echo "✗ Hook not configured"
fi

if jq -e '.hooks.postResponse' ~/.claude/settings.json &> /dev/null; then
  echo "✓ Hook configured in settings"
else
  echo "✗ Hook not in settings"
fi
echo ""

# Test 3: Turbo Whisper Server
echo "TEST 3: Turbo Whisper Server"
if curl -s http://localhost:7878/health &> /dev/null; then
  echo "✓ Server responding on :7878"
else
  echo "⚠ Server not responding (start turbo-whisper)"
fi
echo ""

# Test 4: Hotkey Config
echo "TEST 4: Configuration"
hotkey=$(jq -r '.hotkey | join("+")' ~/.config/turbo-whisper/config.json)
echo "✓ Hotkey: $hotkey"

api_url=$(jq -r '.api_url' ~/.config/turbo-whisper/config.json)
echo "✓ API URL: $api_url"

claude_int=$(jq -r '.claude_integration' ~/.config/turbo-whisper/config.json)
echo "✓ Claude integration: $claude_int"

echo ""
echo "=== Validation Complete ==="
```

---

## STEP 3: Integration Summary

```
"Platform Integration Complete!

CONFIGURED PLATFORMS:
{list of enabled platforms}

GITHUB COPILOT CLI:
✓ Auto-type mode enabled
✓ No special configuration
✓ Hotkey: {hotkey}

CLAUDE CODE:
{if enabled}
✓ Post-response hook configured
✓ Synchronization enabled
✓ Fallback to clipboard
✓ Server: localhost:7878
{end if}

CODEX:
✓ Auto-type mode enabled
✓ Hotkey: {hotkey}
{if hotkey changed}
✓ Custom hotkey to avoid conflicts
{end if}

FILES MODIFIED:
- ~/.config/turbo-whisper/config.json
{if claude enabled}
- ~/.claude/hooks/post-response.sh
- ~/.claude/settings.json
{end if}

NEXT STEPS:
1. [TEST] Run end-to-end tests
2. Tune typing speed if needed (typing_delay_ms)
3. Adjust hotkey if conflicts occur

Ready to test? (yes/no)"
```

---

## ERROR HANDLING

**Hook Not Executable:**
```
"ERROR: Hook script not executable

Fix:
chmod +x ~/.claude/hooks/post-response.sh

Applied fix? (yes/no)"
```

**Turbo Whisper Server Not Running:**
```
"ERROR: Turbo Whisper server not responding

The Claude Code integration requires Turbo Whisper to be running.

Start Turbo Whisper:
  turbo-whisper

Or disable Claude integration:
  Set 'claude_integration: false' in config

What would you like to do?
1. Start Turbo Whisper now (manual)
2. Disable Claude integration
3. Exit

Choice: ___"
```

**Hotkey Conflict Detected:**
```
"WARNING: Hotkey conflict possible

The hotkey {hotkey} may conflict with:
{conflicting_application}

Options:
1. Change Turbo Whisper hotkey
2. Disable conflicting application's shortcut
3. Test anyway (may not work)

Choice (1-3): ___"
```

---

## SUCCESS CRITERIA

✅ GitHub Copilot CLI integration tested (if selected)
✅ Claude Code hooks configured and tested (if selected)
✅ Codex integration tested (if selected)
✅ No hotkey conflicts
✅ Voice input types correctly on all platforms
✅ Claude synchronization works (if enabled)
✅ Fallback mechanisms validated
