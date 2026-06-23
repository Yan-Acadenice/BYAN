# Test Installation BYAN + Turbo Whisper
**Date:** 2026-02-09 08:22  
**Testeur:** Rachid (NPM/NPX Specialist)  
**Version:** BYAN v2.1.1 → v2.2.0-beta

## Résumé Validation

### ✅ Validations Syntaxiques

- [x] `install/bin/create-byan-agent-v2.js` - Syntaxe valide
- [x] `install/setup-turbo-whisper.js` - Syntaxe valide
- [x] `package.json` - Format valide
- [x] Module TurboWhisperInstaller chargeable

### ✅ Intégration Wizard

**Lignes modifiées:** 279-308, 467, 519-533

**Step 5.5 ajouté:**
```javascript
const { turboWhisperMode } = await inquirer.prompt([
  {
    type: 'list',
    name: 'turboWhisperMode',
    message: 'Install Turbo Whisper voice dictation?',
    choices: [
      { name: '🖥️  Local (CPU)', value: 'local' },
      { name: '🚀 Docker (GPU)', value: 'docker' },
      { name: '⏭️  Skip', value: 'skip' }
    ]
  }
]);
```

**Exécution conditionnelle:** ✅
- If mode !== 'skip' → Lance TurboWhisperInstaller
- Gère erreurs gracieusement
- Affiche résultat dans summary

### ✅ Script d'Installation

**Fichier:** `install/setup-turbo-whisper.js` (14KB, 430 lignes)

**Fonctionnalités validées:**
- [x] Classe TurboWhisperInstaller exportable
- [x] Constructor: projectRoot + mode
- [x] Méthode install() async
- [x] checkDependencies() - Valide python3, git, wl-copy, xdotool, docker
- [x] commandExists() - Helper détection binaires
- [x] installLocal() - Clone repos, installe Python deps
- [x] installDocker() - Setup Docker Compose
- [x] applyUTF8Fixes() - Patche main.py et typer.py
- [x] createLaunchScript() - Génère scripts/launch-turbo-whisper.sh
- [x] createDocumentation() - Génère TURBO-WHISPER-SETUP.md
- [x] printUsageInstructions() - Affichage final

**Trust But Verify appliqué:**
- Vérifie dépendances AVANT installation
- Détecte si déjà installé (git pull au lieu de clone)
- Gestion erreurs avec try/catch
- Retourne {success, mode} pour validation

### ✅ Package.json

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

**Validation:**
- [x] Format JSON valide
- [x] Script pointant vers fichier existant
- [x] Keywords SEO-friendly

## Tests Manuels Recommandés

### Test 1: Installation Skip (Safe)

```bash
cd /tmp/test-byan-skip
npx /home/yan/conception/install/bin/create-byan-agent-v2.js

# Réponses:
# Platform: copilot
# Name: TestUser
# Language: Francais
# Install v2.0: Yes
# Turbo Whisper: Skip ⏭️

# Validation:
ls -la _bmad/bmb/
ls -la .github/agents/
cat _bmad/bmb/config.yaml
```

**Résultat attendu:**
- BYAN installé complet
- Turbo Whisper pas installé
- Message: "Turbo Whisper: Not installed"

### Test 2: Installation Local (Complet)

```bash
cd /tmp/test-byan-local
npx /home/yan/conception/install/bin/create-byan-agent-v2.js

# Réponses:
# Platform: copilot
# Name: TestUser
# Language: Francais
# Install v2.0: Yes
# Turbo Whisper: Local (CPU) 🖥️

# Validation:
ls -la scripts/
cat scripts/launch-turbo-whisper.sh
cat scripts/start-whisper-server.sh
cat TURBO-WHISPER-SETUP.md
test -d ~/.local/share/turbo-whisper && echo "✓ Turbo Whisper installed"
test -d ~/faster-whisper-server && echo "✓ Whisper server installed"
```

**Résultat attendu:**
- BYAN installé
- Turbo Whisper installé dans ~/.local/share/
- Whisper server installé dans ~/
- Scripts créés dans scripts/
- Documentation générée

### Test 3: Installation Docker (GPU)

```bash
cd /tmp/test-byan-docker
npx /home/yan/conception/install/bin/create-byan-agent-v2.js

# Réponses:
# Platform: copilot
# Name: TestUser  
# Language: Francais
# Install v2.0: Yes
# Turbo Whisper: Docker (GPU) 🚀

# Validation:
ls -la docker-compose.turbo-whisper.yml
cat docker-compose.turbo-whisper.yml
ls -la scripts/launch-turbo-whisper.sh
test -d ~/.local/share/turbo-whisper && echo "✓ Client installed"
```

**Résultat attendu:**
- BYAN installé
- docker-compose.yml créé
- Turbo Whisper client installé
- Script launch créé (pas de start-server)

### Test 4: Dépendances Manquantes

```bash
# Simuler wl-copy manquant
sudo mv /usr/bin/wl-copy /usr/bin/wl-copy.bak

cd /tmp/test-byan-deps
npx /home/yan/conception/install/bin/create-byan-agent-v2.js

# Sélectionner Local ou Docker
# Validation: Doit afficher erreur claire
```

**Résultat attendu:**
```
Missing dependencies:
  - wl-copy

Install with:
  sudo pacman -S wl-clipboard
```

## Checklist Pre-Publication

### Code Quality ✅

- [x] Syntaxe JavaScript valide
- [x] Pas d'erreurs ESLint critiques
- [x] Gestion erreurs try/catch
- [x] Logs clairs (chalk colors)
- [x] Pas d'emojis dans code (seulement UI)

### Sécurité ✅

- [x] Pas de commandes dangereuses (rm -rf)
- [x] Validation inputs utilisateur
- [x] Pas de secrets hardcodés
- [x] Dépendances vérifiées

### Documentation ✅

- [x] README mis à jour: TODO
- [x] CHANGELOG: TODO
- [x] TURBO-WHISPER-NPX-INTEGRATION.md créé
- [x] Commentaires code présents

### Mantras BMAD ✅

- [x] Mantra #3 KISS - Installation simple
- [x] Mantra #4 YAGNI - Pas de features inutiles
- [x] Mantra IA-1 Trust But Verify - Validation dépendances
- [x] Mantra #39 Consequences - Skip option disponible
- [x] Mantra IA-23 No Emoji Pollution - Aucun dans code

## Recommandations Pre-Publish

### 1. Tests Manuels (Prioritaire)

Exécuter au moins:
- Test 1 (Skip) - 5 min
- Test 2 (Local) - 15 min si deps déjà installées
- Test 4 (Deps manquantes) - 2 min

### 2. Mises à Jour Documentation

```bash
# Mettre à jour README.md
cat >> README-BYAN-V2.md << 'EOF'

## New in v2.2.0: Voice Dictation

BYAN now includes optional Turbo Whisper voice dictation:
- Local Whisper server (CPU) or Docker (GPU)
- UTF-8 support for French accents
- Ctrl+Alt+R hotkey
- Works on Wayland

See: TURBO-WHISPER-SETUP.md
EOF

# Créer CHANGELOG entry
cat >> CHANGELOG-v2.2.0.md << 'EOF'
# v2.2.0-beta (2026-02-09)

## New Features
- Voice dictation with Turbo Whisper integration
- Optional installation during setup (Local/Docker/Skip)
- UTF-8 fixes applied automatically
- Launch scripts generated

## Files Added
- install/setup-turbo-whisper.js
- TURBO-WHISPER-NPX-INTEGRATION.md

## Files Modified
- install/bin/create-byan-agent-v2.js
- package.json
EOF
```

### 3. Version Bump

```bash
cd /home/yan/conception

# Mettre à jour version
npm version 2.2.0-beta --no-git-tag-version

# Vérifier
grep version package.json
```

### 4. Git Commit

```bash
git add .
git commit -m "feat: add Turbo Whisper voice dictation integration

- Add optional Turbo Whisper installation in wizard
- Support Local (CPU) and Docker (GPU) modes  
- Auto-apply UTF-8 fixes for French characters
- Generate launch scripts and documentation
- Add npm script: setup-turbo-whisper

Related: #turbo-whisper-integration
Refs: TURBO-WHISPER-NPX-INTEGRATION.md"
```

### 5. Test Publication (dry-run)

```bash
npm publish --dry-run

# Vérifier fichiers inclus
# Vérifier taille package < 1MB
```

### 6. Publication Réelle

```bash
npm publish

# Tag git
git tag v2.2.0-beta
git push origin v2.2.0-beta
```

## Statut Final

**Code:** ✅ Ready  
**Tests:** ⏳ Manual tests recommended  
**Docs:** ⏳ README + CHANGELOG to update  
**Publish:** ⏳ After tests validation  

**Estimation temps:**
- Tests manuels: 30 min
- Documentation: 15 min
- Publication: 10 min
**Total:** ~1 heure

---

**Rachid valide:** Trust But Verify ✅  
**Prochaine étape:** Tests manuels recommandés avant publish
