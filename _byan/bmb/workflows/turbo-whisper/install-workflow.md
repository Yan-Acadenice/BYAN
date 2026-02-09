# Turbo Whisper Installation Workflow

**Workflow:** Guided Installation via Yanstall Wizard  
**Duration:** 10-15 minutes  
**Platforms:** Linux, macOS, Windows

---

## OVERVIEW

This workflow installs Turbo Whisper using the yanstall wizard with automatic OS detection, dependency resolution, and validation.

---

## STEP 1: Pre-Installation Check

**Detect Existing Installation:**
```bash
# Check if turbo-whisper is already installed
which turbo-whisper

# Check if running
ps aux | grep turbo-whisper
```

**If Already Installed:**
```
"Turbo Whisper is already installed!

Version: {version}
Location: {path}
Status: {running/stopped}

What would you like to do?
1. Reconfigure existing installation
2. Upgrade to latest version
3. Reinstall from scratch
4. Exit

Choice: ___"
```

**If Not Installed:**
```
"Turbo Whisper not detected. Starting installation wizard...

This will:
✓ Detect your OS and install required dependencies
✓ Setup Python virtual environment
✓ Install Turbo Whisper
✓ Generate default configuration
✓ Setup autostart (optional)

Estimated time: 10-15 minutes

Proceed? (yes/no)"
```

---

## STEP 2: OS Detection & Validation

**Detect Operating System:**
```bash
# Linux
uname -s | grep -q "Linux" && echo "Linux"
cat /etc/os-release | grep "^ID=" | cut -d= -f2

# macOS
uname -s | grep -q "Darwin" && echo "macOS"
sw_vers -productVersion

# Windows (via Git Bash or WSL)
uname -s | grep -q "MINGW\|MSYS" && echo "Windows"
```

**Display Detected Info:**
```
"Detected System:
OS: {os_name}
Distribution: {distro} (Linux only)
Version: {version}
Architecture: {arch}
Shell: {shell}

Is this correct? (yes/no)"
```

**Validate Prerequisites:**
```
"Checking prerequisites...

✓ Python 3.10+: {version} {location}
✓ pip: {version}
✓ git: {version}
□ Audio libraries: Checking...
□ Clipboard/typing tools: Checking...

{Pass/Fail with missing packages listed}
"
```

---

## STEP 3: Dependency Installation

**Linux (Ubuntu/Debian):**
```bash
# Ask for sudo permission upfront
sudo -v

# Install system dependencies
sudo apt update
sudo apt install -y python3-pyaudio portaudio19-dev xdotool xclip python3-venv

# Verify installation
dpkg -l | grep -E "python3-pyaudio|portaudio19-dev|xdotool|xclip"
```

**Linux (Arch):**
```bash
sudo pacman -Sy --noconfirm python-pyaudio portaudio xdotool xclip
```

**Linux (Fedora):**
```bash
sudo dnf install -y python3-pyaudio portaudio-devel xdotool xclip
```

**macOS:**
```bash
# Install Homebrew if missing
if ! command -v brew &> /dev/null; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install PortAudio
brew install portaudio
```

**Windows:**
```bash
# PyAudio via pipwin
pip install pipwin
pipwin install pyaudio

# pyperclip for clipboard
pip install pyperclip
```

**Report Progress:**
```
"Installing dependencies...

✓ Audio libraries installed
✓ Clipboard/typing tools installed
✓ All prerequisites satisfied

Ready to install Turbo Whisper."
```

---

## STEP 4: Install Turbo Whisper

**Choose Installation Method:**
```
"Select installation method:

1. Package Manager (Recommended for Linux)
   - Ubuntu/Debian: PPA
   - Arch Linux: AUR
   
2. From Source (Cross-platform, always latest)
   - Clone GitHub repo
   - Install in virtual environment

Which method? (1/2)"
```

**Method 1: Package Manager (Linux Only):**

*Ubuntu/Debian:*
```bash
sudo add-apt-repository ppa:bengweeks/turbo-whisper -y
sudo apt update
sudo apt install -y turbo-whisper
```

*Arch Linux:*
```bash
# Using yay
yay -S turbo-whisper --noconfirm

# Or using paru
paru -S turbo-whisper --noconfirm
```

**Method 2: From Source (All Platforms):**

```bash
# Choose installation directory
INSTALL_DIR="${HOME}/.local/share/turbo-whisper"

# Clone repository
git clone https://github.com/knowall-ai/turbo-whisper.git "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# Create virtual environment
python3 -m venv .venv

# Activate venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate  # Windows

# Install Turbo Whisper
pip install -e .

# Create symlink (Linux/macOS)
mkdir -p ~/.local/bin
ln -sf "${INSTALL_DIR}/.venv/bin/turbo-whisper" ~/.local/bin/turbo-whisper

# Add to PATH if needed
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  echo 'Added ~/.local/bin to PATH. Restart shell or run: source ~/.bashrc'
fi
```

**Verify Installation:**
```bash
# Check if command is available
which turbo-whisper

# Check version
turbo-whisper --version
```

**Report Success:**
```
"Installation complete!

Location: {install_path}
Version: {version}
Command: turbo-whisper

Next: Configuration"
```

---

## STEP 5: Generate Default Configuration

**Create Config Directory:**
```bash
# Linux/macOS
CONFIG_DIR="${HOME}/.config/turbo-whisper"
mkdir -p "${CONFIG_DIR}"

# Windows
CONFIG_DIR="${APPDATA}\turbo-whisper"
mkdir -p "${CONFIG_DIR}"
```

**Generate config.json:**
```json
{
  "api_url": "http://localhost:8000/v1/audio/transcriptions",
  "api_key": "",
  "hotkey": ["ctrl", "shift", "space"],
  "language": "en",
  "auto_paste": true,
  "copy_to_clipboard": true,
  "typing_delay_ms": 5,
  "waveform_color": "#00ff88",
  "background_color": "#1a1a2e",
  "claude_integration": false,
  "claude_integration_port": 7878
}
```

**Save Config:**
```bash
cat > "${CONFIG_DIR}/config.json" << 'EOF'
{config_content}
EOF

echo "Config saved: ${CONFIG_DIR}/config.json"
```

---

## STEP 6: Setup Autostart (Optional)

```
"Enable autostart on login?

Turbo Whisper will start automatically when you log in,
running quietly in the system tray.

Enable autostart? (yes/no)"
```

**If Yes:**

*Linux:*
```bash
mkdir -p ~/.config/autostart

cat > ~/.config/autostart/turbo-whisper.desktop << 'EOF'
[Desktop Entry]
Name=Turbo Whisper
Exec=turbo-whisper
Type=Application
X-GNOME-Autostart-enabled=true
EOF

echo "Autostart enabled: ~/.config/autostart/turbo-whisper.desktop"
```

*macOS:*
```
"To enable autostart on macOS:

1. Open System Preferences
2. Go to Users & Groups
3. Click Login Items
4. Click + and select Turbo Whisper

(Cannot be automated, requires manual setup)"
```

*Windows:*
```
"To enable autostart on Windows:

1. Press Win+R
2. Type: shell:startup
3. Create shortcut to turbo-whisper in that folder

(Cannot be automated, requires manual setup)"
```

---

## STEP 7: Installation Summary

```
"Installation Complete!

SUMMARY:
✓ OS: {os_name}
✓ Installation Method: {method}
✓ Location: {install_path}
✓ Config: {config_path}
✓ Autostart: {enabled/disabled}

NEXT STEPS:
1. [DOCK] Setup self-hosted Whisper server (recommended)
2. [CONF] Configure hotkeys and preferences
3. [INT] Integrate with platforms (Copilot/Claude/Codex)
4. [TEST] Test voice dictation

Files created:
- {install_path}/turbo-whisper
- {config_path}/config.json
- {autostart_path} (if enabled)

Ready to configure? (yes/no)"
```

---

## ERROR HANDLING

**Python Version Too Old:**
```
"ERROR: Python {detected_version} is too old.
Required: Python 3.10+

Install Python 3.10+ and try again.

Ubuntu/Debian: sudo apt install python3.10
macOS: brew install python@3.10
Windows: Download from python.org"
```

**Missing Sudo Access:**
```
"ERROR: Sudo access required for dependency installation.

Please run this workflow with sudo privileges or
install dependencies manually:

Ubuntu/Debian:
  sudo apt install python3-pyaudio portaudio19-dev xdotool xclip

Arch:
  sudo pacman -S python-pyaudio portaudio xdotool xclip

Fedora:
  sudo dnf install python3-pyaudio portaudio-devel xdotool xclip"
```

**Git Not Found:**
```
"ERROR: git command not found.

Install git:
Ubuntu/Debian: sudo apt install git
Arch: sudo pacman -S git
macOS: brew install git
Windows: https://git-scm.com/download/win"
```

---

## SUCCESS CRITERIA

✅ Python 3.10+ detected
✅ All system dependencies installed
✅ Turbo Whisper installed successfully
✅ Command `turbo-whisper` available in PATH
✅ Config file created with valid JSON
✅ Autostart configured (if requested)
✅ Installation verified with --version check
