# Turbo Whisper - Intégration NPX BYAN

**Date:** 2026-02-09  
**Rachid** - NPM/NPX Deployment Specialist  
**Statut:** ✅ Intégration wizard complète

## Changements Effectués

### 1. Script d'Installation Créé

**Fichier:** `install/setup-turbo-whisper.js`

**Fonctionnalités:**
- Installation automatique Turbo Whisper
- Deux modes: Local (CPU) ou Docker (GPU)
- Application automatique des fixes UTF-8
- Détection des dépendances système
- Création des scripts de lancement
- Génération de documentation

**Usage standalone:**
```bash
node install/setup-turbo-whisper.js local
node install/setup-turbo-whisper.js docker
node install/setup-turbo-whisper.js skip
```

### 2. Wizard BYAN Modifié

**Fichier:** `install/bin/create-byan-agent-v2.js`

**Ajouts (Step 5.5):**
```javascript
// Question interactive
const { turboWhisperMode } = await inquirer.prompt([
  {
    type: 'list',
    name: 'turboWhisperMode',
    message: 'Install Turbo Whisper voice dictation?',
    choices: [
      { name: '🖥️  Local (CPU) - Run Whisper server locally', value: 'local' },
      { name: '🚀 Docker (GPU) - Run Whisper in Docker with GPU', value: 'docker' },
      { name: '⏭️  Skip - Install later manually', value: 'skip' }
    ],
    default: 'skip'
  }
]);

// Exécution installation
if (turboWhisperMode !== 'skip') {
  const TurboWhisperInstaller = require(path.join(__dirname, '..', 'setup-turbo-whisper.js'));
  const turboInstaller = new TurboWhisperInstaller(projectRoot, turboWhisperMode);
  const result = await turboInstaller.install();
}
```

**Instructions finales ajoutées:**
```javascript
if (turboWhisperInstalled) {
  console.log(chalk.yellow('🎤 Turbo Whisper Voice Dictation:'));
  
  if (turboWhisperMode === 'local') {
    console.log('  Start Whisper server:');
    console.log('   ./scripts/start-whisper-server.sh');
  } else if (turboWhisperMode === 'docker') {
    console.log('  Start Docker container:');
    console.log('   docker-compose -f docker-compose.turbo-whisper.yml up -d');
  }
  
  console.log('  Launch voice dictation:');
  console.log('   ./scripts/launch-turbo-whisper.sh');
  console.log('  Hotkey: Ctrl+Alt+R');
}
```

### 3. Package.json Mis à Jour

**Fichier:** `package.json`

**Ajouts:**

```json
{
  "scripts": {
    "setup-turbo-whisper": "node install/setup-turbo-whisper.js"
  },
  "keywords": [
    "voice-dictation",
    "whisper",
    "turbo-whisper"
  ]
}
```

## Flux d'Installation

### Via NPX (recommandé)

```bash
npx create-byan-agent

# Wizard pose la question:
? Install Turbo Whisper voice dictation?
  🖥️  Local (CPU) - Run Whisper server locally
  🚀 Docker (GPU) - Run Whisper in Docker with GPU
  ⏭️  Skip - Install later manually
```

**Sélection "Local":**
1. Clone Turbo Whisper dans `~/.local/share/turbo-whisper`
2. Clone faster-whisper-server dans `~/faster-whisper-server`
3. Installe dépendances Python (venv)
4. Applique fixes UTF-8 automatiquement
5. Crée `scripts/launch-turbo-whisper.sh`
6. Crée `scripts/start-whisper-server.sh`
7. Génère `TURBO-WHISPER-SETUP.md`

**Sélection "Docker":**
1. Clone Turbo Whisper dans `~/.local/share/turbo-whisper`
2. Installe dépendances Python
3. Applique fixes UTF-8
4. Crée `docker-compose.turbo-whisper.yml`
5. Crée `scripts/launch-turbo-whisper.sh`
6. Génère documentation

**Sélection "Skip":**
- Installation sautée
- Peut être installé plus tard avec: `npm run setup-turbo-whisper`

### Installation Manuelle Post-Setup

```bash
cd /path/to/project
npm run setup-turbo-whisper local   # ou docker
```

## Fichiers Créés Automatiquement

### Mode Local

```
project-root/
├── scripts/
│   ├── launch-turbo-whisper.sh      # Lance le client
│   └── start-whisper-server.sh      # Lance le serveur
├── TURBO-WHISPER-SETUP.md           # Documentation
└── (Turbo Whisper installé dans ~/.local/share/)
```

### Mode Docker

```
project-root/
├── scripts/
│   └── launch-turbo-whisper.sh              # Lance le client
├── docker-compose.turbo-whisper.yml         # Config Docker
├── TURBO-WHISPER-SETUP.md                   # Documentation
└── (Turbo Whisper installé dans ~/.local/share/)
```

## Validation Pre-Installation

Le script vérifie automatiquement:

**Dépendances requises:**
- ✅ python3 (v3.10+)
- ✅ git
- ✅ wl-copy (Wayland clipboard)
- ✅ xdotool (simulation clavier)
- ✅ docker (si mode Docker sélectionné)

**Si manquantes:**
```
Missing dependencies:
  - wl-copy
  - xdotool

Install with:
  sudo pacman -S wl-clipboard xdotool
```

## Fixes UTF-8 Appliqués Automatiquement

### 1. main.py

```python
import sys
import io

# Force UTF-8 encoding for all I/O operations
if sys.platform != "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True)

os.environ['PYTHONIOENCODING'] = 'utf-8'
os.environ.setdefault('LC_ALL', 'fr_FR.UTF-8')
os.environ.setdefault('LANG', 'fr_FR.UTF-8')
```

### 2. typer.py

Ajout de la méthode `_type_clipboard_paste()`:
- Détecte caractères UTF-8
- Copie dans clipboard (wl-copy)
- Simule Ctrl+Shift+V (terminaux) ou Ctrl+V (apps graphiques)
- Supporte Wayland nativement

## Test de l'Intégration

### Test 1: Wizard Complet

```bash
cd /tmp/test-byan-turbo
npx create-byan-agent

# Sélectionner Turbo Whisper → Local
# Vérifier installation réussie
ls -la scripts/
cat TURBO-WHISPER-SETUP.md
```

### Test 2: Installation Manuelle

```bash
cd /path/to/existing/byan
npm run setup-turbo-whisper docker
```

### Test 3: Validation UTF-8

```bash
./scripts/start-whisper-server.sh &
sleep 10
./scripts/launch-turbo-whisper.sh

# Test vocal:
# Ctrl+Alt+R
# "leçon français château"
# Ctrl+Alt+R
# Résultat attendu: tous les accents corrects
```

## Avantages de l'Approche

✅ **Zero Configuration** - Installation automatique complète  
✅ **Multi-Plateforme** - Supporte Local (CPU) et Docker (GPU)  
✅ **UTF-8 Native** - Fixes appliqués automatiquement  
✅ **Validation Built-in** - Vérifie dépendances avant installation  
✅ **Fallback Graceful** - Skip possible, installation post-setup disponible  
✅ **Documentation Auto** - Génère TURBO-WHISPER-SETUP.md  
✅ **Scripts Prêts** - Lancement en 1 commande  

## Prochaines Étapes

### Phase 1: Test et Validation ✅ FAIT
- [x] Créer script d'installation
- [x] Intégrer dans wizard BYAN
- [x] Mettre à jour package.json
- [x] Documenter l'intégration

### Phase 2: Tests Utilisateur (À FAIRE)
- [ ] Tester installation complète via npx
- [ ] Vérifier mode Local (CPU)
- [ ] Vérifier mode Docker (GPU)
- [ ] Valider UTF-8 fonctionne
- [ ] Tester sur système clean

### Phase 3: Publication (À FAIRE)
- [ ] Mettre à jour CHANGELOG
- [ ] Bumper version package.json (2.1.1 → 2.2.0)
- [ ] Tagger release git
- [ ] Publier sur npm: `npm publish`
- [ ] Annoncer nouvelle feature

### Phase 4: Documentation (À FAIRE)
- [ ] Ajouter section Turbo Whisper dans README
- [ ] Créer vidéo demo
- [ ] Mettre à jour documentation BMAD

## Commandes Rachid Exécutées

```
✓ Script créé: install/setup-turbo-whisper.js (14KB)
✓ Wizard modifié: install/bin/create-byan-agent-v2.js
✓ Package.json mis à jour (script + keywords)
✓ Permissions exécutables: chmod +x setup-turbo-whisper.js
```

**Validation:**
- Trust But Verify: Dépendances validées avant install ✅
- Clean Code: Script modulaire et réutilisable ✅
- KISS: Installation simple en 1 question ✅
- Fallback: Skip option disponible ✅

## Usage Final

**Pour utilisateur final:**

```bash
# Installation complète BYAN + Turbo Whisper
npx create-byan-agent

# Sélectionner mode voulu (Local/Docker/Skip)
# Suivre instructions affichées

# Lancer dictée vocale
./scripts/launch-turbo-whisper.sh
```

**Test rapide:**
```bash
Ctrl+Alt+R
"Bonjour, je teste la dictée vocale en français avec des accents"
Ctrl+Alt+R

# Résultat: texte tapé automatiquement avec tous les accents
```

## Support

**Issues communes:**

1. **"Missing dependencies"**
   → Installer: `sudo pacman -S wl-clipboard xdotool`

2. **"Turbo Whisper already installed"**
   → Script détecte et met à jour (git pull)

3. **"Docker not found" (mode Docker)**
   → Installer: `sudo pacman -S docker`

4. **Accents ne fonctionnent pas**
   → Fixes UTF-8 appliqués automatiquement, redémarrer Turbo Whisper

## Références

- Script principal: `install/setup-turbo-whisper.js`
- Wizard BYAN: `install/bin/create-byan-agent-v2.js`
- Doc originale: `TURBO-WHISPER-INTEGRATION-COMPLETE.md`
- Package: `package.json`

---

**Rachid** - NPM/NPX Deployment Specialist  
*Trust But Verify. Keep It Simple. Ship It.*

**Statut:** ✅ Ready for Testing  
**Version:** BYAN v2.2.0-beta (avec Turbo Whisper)
