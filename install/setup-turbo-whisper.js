#!/usr/bin/env node

/**
 * Turbo Whisper Setup Script
 * Installs Turbo Whisper voice dictation with local Whisper server
 * 
 * Options:
 * - Local (CPU): Python + faster-whisper locally
 * - Docker (GPU): Docker container with GPU support
 * - Skip: Don't install Turbo Whisper
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

class TurboWhisperInstaller {
  constructor(projectRoot, mode = 'local') {
    this.projectRoot = projectRoot;
    this.mode = mode; // 'local', 'docker', or 'skip'
    this.turboDir = path.join(projectRoot, '.turbo-whisper');
    this.scriptsDir = path.join(projectRoot, 'scripts');
    this.gpuInfo = null; // Will be populated by detectGPU()
  }

  /**
   * Detect GPU and determine optimal Whisper model
   * Based on official specs: https://github.com/knowall-ai/turbo-whisper
   * @returns {Object} { hasGPU, vram, gpuName, model, modelSize }
   */
  detectGPU() {
    try {
      const result = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      if (!result || result === 'NO_GPU') {
        return { hasGPU: false, model: 'base', modelSize: '~1 GB VRAM' };
      }

      const [gpuName, vramStr] = result.split(',').map(s => s.trim());
      const vram = parseInt(vramStr);

      // Map VRAM to optimal model (official specs from GitHub)
      // tiny: ~1 GB VRAM, base: ~1 GB, small: ~2 GB, medium: ~5 GB, large-v3: ~10 GB
      let model, modelSize;
      if (vram < 2000) {
        model = 'tiny';
        modelSize = '~1 GB VRAM';
      } else if (vram < 4000) {
        model = 'small';
        modelSize = '~2 GB VRAM';
      } else if (vram < 6000) {
        model = 'medium';
        modelSize = '~5 GB VRAM';
      } else if (vram < 10000) {
        model = 'large-v2';
        modelSize = '~8 GB VRAM';
      } else {
        model = 'large-v3';
        modelSize = '~10 GB VRAM';
      }

      return {
        hasGPU: true,
        vram,
        gpuName,
        model,
        modelSize
      };
    } catch (error) {
      return { hasGPU: false, model: 'base', modelSize: '~1 GB VRAM' };
    }
  }

  async install() {
    if (this.mode === 'skip') {
      console.log(chalk.gray('Turbo Whisper installation skipped'));
      return { success: true, skipped: true };
    }

    console.log(chalk.blue('\n📦 Installing Turbo Whisper...'));
    console.log(chalk.gray(`Mode: ${this.mode}\n`));

    try {
      // Detect GPU first if Docker mode
      if (this.mode === 'docker') {
        this.gpuInfo = this.detectGPU();
        
        if (this.gpuInfo.hasGPU) {
          console.log(chalk.green(`✓ GPU detected: ${this.gpuInfo.gpuName}`));
          console.log(chalk.gray(`  VRAM: ${this.gpuInfo.vram} MB`));
          console.log(chalk.cyan(`  Optimal model: ${this.gpuInfo.model} (${this.gpuInfo.modelSize})`));
        } else {
          console.log(chalk.yellow('⚠ No GPU detected, using base model (CPU)'));
          console.log(chalk.gray('  Tip: Install nvidia drivers for GPU acceleration\n'));
        }
      }

      await this.checkDependencies();
      
      if (this.mode === 'local') {
        await this.installLocal();
      } else if (this.mode === 'docker') {
        await this.installDocker();
      }

      await this.createLaunchScript();
      await this.createDocumentation();

      console.log(chalk.green('\n✓ Turbo Whisper installed successfully!\n'));
      this.printUsageInstructions();

      return { success: true, mode: this.mode };
    } catch (error) {
      console.error(chalk.red('\n✗ Turbo Whisper installation failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  async checkDependencies() {
    const spinner = ora('Checking dependencies...').start();

    const required = {
      python3: this.commandExists('python3'),
      git: this.commandExists('git'),
      wlCopy: this.commandExists('wl-copy'),
      xdotool: this.commandExists('xdotool')
    };

    if (this.mode === 'docker') {
      required.docker = this.commandExists('docker');
    }

    const missing = Object.entries(required)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);

    if (missing.length > 0) {
      spinner.fail('Missing dependencies');
      console.log(chalk.yellow('\nMissing dependencies:'));
      missing.forEach(dep => console.log(chalk.yellow(`  - ${dep}`)));
      
      console.log(chalk.gray('\nInstall with:'));
      if (missing.includes('wlCopy') || missing.includes('xdotool')) {
        console.log(chalk.gray('  sudo pacman -S wl-clipboard xdotool'));
      }
      if (missing.includes('docker')) {
        console.log(chalk.gray('  sudo pacman -S docker'));
      }
      
      throw new Error('Missing required dependencies');
    }

    spinner.succeed('Dependencies checked');
  }

  commandExists(command) {
    try {
      execSync(`which ${command}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async installLocal() {
    const spinner = ora('Installing Turbo Whisper (local mode)...').start();

    try {
      // Clone Turbo Whisper repository
      const repoUrl = 'https://github.com/knowall-ai/turbo-whisper.git';
      const installDir = path.join(process.env.HOME, '.local', 'share', 'turbo-whisper');

      if (await fs.pathExists(installDir)) {
        spinner.text = 'Turbo Whisper already installed, updating...';
        execSync('git pull', { cwd: installDir, stdio: 'pipe' });
      } else {
        spinner.text = 'Cloning Turbo Whisper...';
        execSync(`git clone ${repoUrl} ${installDir}`, { stdio: 'pipe' });
      }

      // Apply UTF-8 fixes
      spinner.text = 'Applying UTF-8 fixes...';
      await this.applyUTF8Fixes(installDir);

      // Install Python dependencies
      spinner.text = 'Installing Python dependencies...';
      execSync('python3 -m venv .venv', { cwd: installDir, stdio: 'pipe' });
      execSync('.venv/bin/pip install -e .', { cwd: installDir, stdio: 'pipe' });

      // Install faster-whisper-server
      spinner.text = 'Installing faster-whisper-server...';
      const serverDir = path.join(process.env.HOME, 'faster-whisper-server');
      
      if (!(await fs.pathExists(serverDir))) {
        execSync(`git clone https://github.com/fedirz/faster-whisper-server.git ${serverDir}`, { stdio: 'pipe' });
        execSync('python3 -m venv .venv && .venv/bin/pip install -e .', { cwd: serverDir, stdio: 'pipe' });
      }

      spinner.succeed('Turbo Whisper installed (local mode)');
    } catch (error) {
      spinner.fail('Installation failed');
      throw error;
    }
  }

  async installDocker() {
    const spinner = ora('Installing Turbo Whisper (Docker mode)...').start();

    try {
      // Install Turbo Whisper client
      const installDir = path.join(process.env.HOME, '.local', 'share', 'turbo-whisper');
      const repoUrl = 'https://github.com/knowall-ai/turbo-whisper.git';

      if (await fs.pathExists(installDir)) {
        spinner.text = 'Updating Turbo Whisper...';
        execSync('git pull', { cwd: installDir, stdio: 'pipe' });
      } else {
        spinner.text = 'Cloning Turbo Whisper...';
        execSync(`git clone ${repoUrl} ${installDir}`, { stdio: 'pipe' });
      }

      // Apply UTF-8 fixes
      await this.applyUTF8Fixes(installDir);

      // Install Python dependencies
      spinner.text = 'Installing Python dependencies...';
      execSync('python3 -m venv .venv && .venv/bin/pip install -e .', { cwd: installDir, stdio: 'pipe' });

      // Create Docker compose file for Whisper server
      spinner.text = 'Creating Docker configuration...';
      await this.createDockerCompose();

      spinner.succeed('Turbo Whisper installed (Docker mode)');
      console.log(chalk.yellow('\nNote: Start Whisper server with: docker-compose up -d whisper-server'));
    } catch (error) {
      spinner.fail('Installation failed');
      throw error;
    }
  }

  async applyUTF8Fixes(installDir) {
    // Apply UTF-8 fix to main.py
    const mainPyPath = path.join(installDir, 'src', 'turbo_whisper', 'main.py');
    
    if (await fs.pathExists(mainPyPath)) {
      let mainPy = await fs.readFile(mainPyPath, 'utf-8');
      
      // Check if fix already applied
      if (!mainPy.includes('PYTHONIOENCODING')) {
        const utf8Import = `
import sys
import io

# Force UTF-8 encoding for all I/O operations
if sys.platform != "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True)

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ.setdefault('LC_ALL', 'fr_FR.UTF-8')
os.environ.setdefault('LANG', 'fr_FR.UTF-8')
`;
        
        // Insert after first import block
        mainPy = mainPy.replace(
          /import time\n/,
          `import time\n${utf8Import}\n`
        );
        
        await fs.writeFile(mainPyPath, mainPy, 'utf-8');
      }
    }

    // Apply UTF-8 fix to typer.py
    const typerPyPath = path.join(installDir, 'src', 'turbo_whisper', 'typer.py');
    
    if (await fs.pathExists(typerPyPath)) {
      let typerPy = await fs.readFile(typerPyPath, 'utf-8');
      
      // Check if clipboard paste method exists
      if (!typerPy.includes('_type_clipboard_paste')) {
        // Add clipboard paste method implementation
        const clipboardMethod = `
    def _type_clipboard_paste(self, text: str) -> bool:
        """Type text using clipboard + simulated Ctrl+Shift+V (best for UTF-8 on Wayland)."""
        import time
        
        if not self.copy_to_clipboard(text):
            print("Failed to copy to clipboard")
            return False
        
        time.sleep(0.1)
        
        # Try Ctrl+Shift+V first (terminals on Linux)
        if shutil.which("xdotool"):
            try:
                subprocess.run(
                    ["xdotool", "key", "--clearmodifiers", "ctrl+shift+v"],
                    check=True,
                    capture_output=True,
                    timeout=5
                )
                print("✓ Pasted via Ctrl+Shift+V")
                return True
            except Exception as e:
                try:
                    subprocess.run(
                        ["xdotool", "key", "--clearmodifiers", "ctrl+v"],
                        check=True,
                        capture_output=True,
                        timeout=5
                    )
                    print("✓ Pasted via Ctrl+V")
                    return True
                except Exception as e2:
                    print(f"xdotool paste failed: {e}, {e2}")
                    return False
        
        return False
`;
        
        // Insert before _type_xdotool method
        typerPy = typerPy.replace(
          /    def _type_xdotool\(self, text: str\) -> bool:/,
          `${clipboardMethod}\n    def _type_xdotool(self, text: str) -> bool:`
        );
        
        await fs.writeFile(typerPyPath, typerPy, 'utf-8');
      }
    }
  }

  async createDockerCompose() {
    // Use detected GPU info or fallback
    const gpuInfo = this.gpuInfo || this.detectGPU();
    const model = gpuInfo.model;
    const device = gpuInfo.hasGPU ? 'cuda' : 'cpu';
    
    const dockerCompose = `version: '3.8'

services:
  whisper-server:
    image: fedirz/faster-whisper-server:latest-${device === 'cuda' ? 'cuda' : 'cpu'}
    ports:
      - "8000:8000"
    environment:
      - MODEL_NAME=${model}
      - DEVICE=${device}${device === 'cuda' ? `
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]` : ''}
    restart: unless-stopped
`;

    const composePath = path.join(this.projectRoot, 'docker-compose.turbo-whisper.yml');
    await fs.writeFile(composePath, dockerCompose, 'utf-8');
    
    // Log configuration
    console.log(chalk.gray(`\n  Docker config: ${device.toUpperCase()} with model ${model}`));
  }

  async createLaunchScript() {
    await fs.ensureDir(this.scriptsDir);

    let launchScript;
    
    if (this.mode === 'local') {
      // Mode Local: Vérifie et lance le serveur si nécessaire
      launchScript = `#!/bin/bash
# Launch Turbo Whisper voice dictation with automatic server startup

TURBO_DIR="$HOME/.local/share/turbo-whisper"
SERVER_DIR="$HOME/faster-whisper-server"
SERVER_PORT=8000

echo "🔍 Vérification serveur Whisper..."

# Vérifier si serveur déjà en cours
if curl -s http://localhost:$SERVER_PORT/health > /dev/null 2>&1; then
    echo "✅ Serveur Whisper déjà actif"
else
    echo "⚡ Démarrage serveur Whisper..."
    
    # Lancer serveur en arrière-plan
    cd "$SERVER_DIR"
    nohup uv run uvicorn --factory faster_whisper_server.main:create_app > /tmp/whisper-server.log 2>&1 &
    SERVER_PID=$!
    
    echo "⏳ Attente démarrage serveur (15 secondes)..."
    sleep 15
    
    # Vérifier que le serveur répond
    if curl -s http://localhost:$SERVER_PORT/health > /dev/null 2>&1; then
        echo "✅ Serveur Whisper prêt (PID: $SERVER_PID)"
    else
        echo "❌ Erreur: Serveur n'a pas démarré"
        echo "📋 Logs: tail -f /tmp/whisper-server.log"
        exit 1
    fi
fi

echo ""
echo "🚀 Lancement Turbo Whisper..."
echo "📍 Hotkey: Ctrl+Alt+R"
echo "📋 Logs serveur: tail -f /tmp/whisper-server.log"
echo ""

cd "$TURBO_DIR"
source .venv/bin/activate
python -m turbo_whisper.main
`;
    } else if (this.mode === 'docker') {
      // Get GPU info for display
      const gpuInfo = this.gpuInfo || this.detectGPU();
      
      // Mode Docker: Vérifie et lance le conteneur si nécessaire
      launchScript = `#!/bin/bash
# Launch Turbo Whisper voice dictation with Docker server
# Auto-detects GPU and validates configuration

TURBO_DIR="$HOME/.local/share/turbo-whisper"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.turbo-whisper.yml"
SERVER_PORT=8000

# Function to detect GPU
detect_gpu() {
    if command -v nvidia-smi &> /dev/null; then
        GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null)
        if [ $? -eq 0 ] && [ -n "$GPU_INFO" ]; then
            GPU_NAME=$(echo "$GPU_INFO" | cut -d',' -f1 | xargs)
            VRAM=$(echo "$GPU_INFO" | cut -d',' -f2 | xargs)
            echo "✓ GPU: $GPU_NAME ($VRAM)"
            return 0
        fi
    fi
    echo "⚠ No GPU detected (running in CPU mode)"
    return 1
}

echo "🔍 Vérification serveur Whisper Docker..."
echo "📂 Compose file: $COMPOSE_FILE"
echo ""

# Detect GPU
detect_gpu

# Vérifier que le fichier existe
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Erreur: $COMPOSE_FILE introuvable"
    echo "💡 Le fichier devrait être dans le répertoire du projet"
    exit 1
fi

# Vérifier si serveur déjà en cours
if curl -s http://localhost:$SERVER_PORT/health > /dev/null 2>&1; then
    echo "✅ Serveur Whisper déjà actif"
else
    echo "⚡ Démarrage conteneur Docker..."
    
    # Lancer Docker Compose
    docker-compose -f "$COMPOSE_FILE" up -d
    
    echo "⏳ Attente démarrage serveur (20 secondes)..."
    sleep 20
    
    # Vérifier que le serveur répond
    if curl -s http://localhost:$SERVER_PORT/health > /dev/null 2>&1; then
        echo "✅ Serveur Whisper prêt"
    else
        echo "❌ Erreur: Serveur n'a pas démarré"
        echo "📋 Logs: docker-compose -f $COMPOSE_FILE logs"
        exit 1
    fi
fi

echo ""
echo "🚀 Lancement Turbo Whisper..."
echo "📍 Hotkey: Ctrl+Alt+R"
echo "📋 Arrêter serveur: docker-compose -f $COMPOSE_FILE down"
echo ""

cd "$TURBO_DIR"
source .venv/bin/activate
python -m turbo_whisper.main
`;
    } else {
      // Mode Skip (ne devrait pas arriver ici)
      launchScript = `#!/bin/bash
echo "⚠️  Turbo Whisper non installé"
echo "Installez avec: npm run setup-turbo-whisper"
exit 1
`;
    }

    const scriptPath = path.join(this.scriptsDir, 'launch-turbo-whisper.sh');
    await fs.writeFile(scriptPath, launchScript, 'utf-8');
    await fs.chmod(scriptPath, '755');

    // Créer script d'arrêt pour mode Docker
    if (this.mode === 'docker') {
      const stopScript = `#!/bin/bash
# Stop Turbo Whisper Docker server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.turbo-whisper.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Erreur: $COMPOSE_FILE introuvable"
    exit 1
fi

echo "🛑 Arrêt serveur Whisper Docker..."
docker-compose -f "$COMPOSE_FILE" down

echo "✅ Serveur arrêté"
`;

      const stopScriptPath = path.join(this.scriptsDir, 'stop-whisper-server.sh');
      await fs.writeFile(stopScriptPath, stopScript, 'utf-8');
      await fs.chmod(stopScriptPath, '755');
    }

    // Create server launch script (standalone, optionnel)
    if (this.mode === 'local') {
      const serverScript = `#!/bin/bash
# Launch faster-whisper-server locally (standalone)

SERVER_DIR="$HOME/faster-whisper-server"

cd "$SERVER_DIR"
echo "🚀 Starting Whisper server on http://localhost:8000"
uv run uvicorn --factory faster_whisper_server.main:create_app
`;


      const serverScriptPath = path.join(this.scriptsDir, 'start-whisper-server.sh');
      await fs.writeFile(serverScriptPath, serverScript, 'utf-8');
      await fs.chmod(serverScriptPath, '755');
    }
  }

  async createDocumentation() {
    const doc = `# Turbo Whisper - Voice Dictation

## Installation

✅ Turbo Whisper has been installed in: \`~/.local/share/turbo-whisper\`
${this.mode === 'local' ? '✅ Whisper server installed in: `~/faster-whisper-server`' : ''}
${this.mode === 'docker' ? '✅ Docker configuration: `docker-compose.turbo-whisper.yml`' : ''}

## Usage (Simplifié - Recommandé)

### Lancement Automatique (1 commande)

\`\`\`bash
./scripts/launch-turbo-whisper.sh
\`\`\`

${this.mode === 'local' ? '**Ce script:**\n1. Vérifie si le serveur Whisper tourne\n2. Le démarre automatiquement si nécessaire (arrière-plan)\n3. Lance Turbo Whisper client\n\n**Logs serveur:** `/tmp/whisper-server.log`' : ''}

${this.mode === 'docker' ? '**Ce script:**\n1. Vérifie si le conteneur Docker tourne\n2. Le démarre automatiquement si nécessaire\n3. Lance Turbo Whisper client\n\n**Arrêter serveur:** `./scripts/stop-whisper-server.sh`' : ''}

## Usage Avancé (Manuel)

### Démarrer Serveur Manuellement

${this.mode === 'local' ? '```bash\n# Option 1: Script standalone\n./scripts/start-whisper-server.sh\n\n# Option 2: Commande directe\ncd ~/faster-whisper-server\nuv run uvicorn --factory faster_whisper_server.main:create_app\n```' : ''}

${this.mode === 'docker' ? '```bash\n# Démarrer\ndocker-compose -f docker-compose.turbo-whisper.yml up -d\n\n# Vérifier\ndocker ps | grep whisper\n\n# Logs\ndocker-compose -f docker-compose.turbo-whisper.yml logs -f\n\n# Arrêter\ndocker-compose -f docker-compose.turbo-whisper.yml down\n```' : ''}

### Démarrer Client Seul

\`\`\`bash
cd ~/.local/share/turbo-whisper
source .venv/bin/activate
python -m turbo_whisper.main
\`\`\`

### Hotkey

Press **Ctrl+Alt+R** to start/stop recording.

The transcribed text will be automatically typed in the active window.

## Features

- ✅ UTF-8 support (accents français: é, à, è, ç, â, etc.)
- ✅ Wayland compatible
- ✅ GPU acceleration (${this.mode === 'docker' ? 'via Docker' : 'if available'})
- ✅ Local processing (privacy)
- ✅ Real-time waveform visualization

## Configuration

Edit: \`~/.local/share/turbo-whisper/config.json\`

Default Whisper server: http://localhost:8000

## Troubleshooting

### Caractères spéciaux ne s'affichent pas

Les fixes UTF-8 ont été appliqués automatiquement. Si le problème persiste:

1. Vérifiez que \`wl-clipboard\` et \`xdotool\` sont installés
2. Redémarrez Turbo Whisper

### Serveur Whisper ne démarre pas

**Mode local:**
\`\`\`bash
cd ~/faster-whisper-server
.venv/bin/pip install -e .
\`\`\`

**Mode Docker:**
\`\`\`bash
docker logs whisper-server
\`\`\`

## Documentation

Voir: \`TURBO-WHISPER-INTEGRATION-COMPLETE.md\` pour détails complets.
`;

    const docPath = path.join(this.projectRoot, 'TURBO-WHISPER-SETUP.md');
    await fs.writeFile(docPath, doc, 'utf-8');
  }

  printUsageInstructions() {
    console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold('🎤 Turbo Whisper Usage:\n'));
    
    console.log(chalk.green('✨ Lancement Automatique (Recommandé):\n'));
    console.log(chalk.white('   ./scripts/launch-turbo-whisper.sh'));
    console.log(chalk.gray('   → Démarre automatiquement le serveur si nécessaire\n'));
    
    if (this.mode === 'local') {
      console.log(chalk.gray('📋 Logs serveur: /tmp/whisper-server.log'));
    } else if (this.mode === 'docker') {
      console.log(chalk.gray('🛑 Arrêter serveur: ./scripts/stop-whisper-server.sh'));
    }
    
    console.log(chalk.gray('\n🎯 Hotkey: Ctrl+Alt+R (start/stop recording)\n'));
    
    console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  }
}

// Export for use in main installer
module.exports = TurboWhisperInstaller;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'local';
  const projectRoot = process.cwd();

  const installer = new TurboWhisperInstaller(projectRoot, mode);
  installer.install()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}
