# Guide Test Manuel - BYAN + Turbo Whisper

**Version:** 2.2.0-beta  
**Date:** 2026-02-09  
**Durée estimée:** 30-45 minutes

## Préparation

### 1. Vérifier Git

```bash
cd /home/yan/conception
git log --oneline -1
# Doit afficher: feat: add Turbo Whisper voice dictation integration

git status
# Doit être clean
```

### 2. Vérifier Dépendances Système

```bash
# Vérifier que tout est installé
which python3     # Requis
which git         # Requis
which wl-copy     # Requis (Wayland clipboard)
which xdotool     # Requis (simulation clavier)
which docker      # Optionnel (test Docker)

# Si manquant:
sudo pacman -S python3 git wl-clipboard xdotool docker
```

## Test 1: Installation Skip (5 min)

**Objectif:** Vérifier que BYAN s'installe sans Turbo Whisper

### Étapes

```bash
# 1. Créer environnement test
cd /tmp
mkdir test-byan-skip-$(date +%s)
cd test-byan-skip-*

# 2. Lancer wizard
node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

### Réponses à Donner

```
? Select your platform: 
  → copilot (flèche vers bas + Enter)

? Your name: 
  → TestUser (Enter)

? Communication language:
  → Francais (Enter)

? Install BYAN v2.0 runtime components (src/, tests)?
  → Yes (Enter)

? Install Turbo Whisper voice dictation?
  → ⏭️  Skip - Install later manually (2x flèche bas + Enter)
```

### Validation

```bash
# Vérifier structure BYAN créée
ls -la _bmad/bmb/
# Doit contenir: agents/, workflows/, config.yaml

ls -la .github/agents/
# Doit contenir: bmad-agent-byan.md, etc.

ls -la src/
# Doit contenir: index.js, core/, observability/, etc.

# Vérifier config
cat _bmad/bmb/config.yaml
# user_name: TestUser
# communication_language: Francais

# Vérifier que Turbo Whisper PAS installé
ls -la scripts/ 2>/dev/null
# Ne doit PAS contenir launch-turbo-whisper.sh

test -f TURBO-WHISPER-SETUP.md && echo "❌ ERREUR" || echo "✅ OK - Pas installé"
```

### Résultat Attendu

```
✅ BYAN installé complet
✅ v2.0 runtime installé
❌ Turbo Whisper NOT installé
✅ Message final: "Turbo Whisper: Not installed"
```

---

## Test 2: Installation Local (15 min)

**Objectif:** Installation complète avec Whisper server local

### Étapes

```bash
# 1. Créer environnement test
cd /tmp
mkdir test-byan-local-$(date +%s)
cd test-byan-local-*

# 2. Lancer wizard
node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

### Réponses

```
? Select your platform: 
  → copilot

? Your name: 
  → TestUser

? Communication language:
  → Francais

? Install BYAN v2.0 runtime components:
  → Yes

? Install Turbo Whisper voice dictation?
  → 🖥️  Local (CPU) - Run Whisper server locally (flèche haut + Enter)
```

### Validation Phase 1: Structure

```bash
# Vérifier BYAN
ls -la _bmad/bmb/
ls -la .github/agents/

# Vérifier Turbo Whisper
ls -la scripts/
# Doit contenir:
# - launch-turbo-whisper.sh
# - start-whisper-server.sh

cat scripts/launch-turbo-whisper.sh
# Doit contenir: cd "$HOME/.local/share/turbo-whisper"

cat scripts/start-whisper-server.sh
# Doit contenir: cd "$HOME/faster-whisper-server"

# Vérifier documentation
test -f TURBO-WHISPER-SETUP.md && echo "✅ Doc créée" || echo "❌ ERREUR"
cat TURBO-WHISPER-SETUP.md
```

### Validation Phase 2: Installation Réelle

```bash
# Vérifier installation Turbo Whisper
test -d ~/.local/share/turbo-whisper && echo "✅ Client installé" || echo "⏳ En cours..."

ls -la ~/.local/share/turbo-whisper/
# Doit contenir: src/, .venv/, pyproject.toml

# Vérifier patches UTF-8 appliqués
grep -q "PYTHONIOENCODING" ~/.local/share/turbo-whisper/src/turbo_whisper/main.py && \
  echo "✅ UTF-8 fix main.py" || echo "❌ ERREUR"

grep -q "_type_clipboard_paste" ~/.local/share/turbo-whisper/src/turbo_whisper/typer.py && \
  echo "✅ UTF-8 fix typer.py" || echo "❌ ERREUR"

# Vérifier serveur Whisper
test -d ~/faster-whisper-server && echo "✅ Serveur installé" || echo "⏳ En cours..."

ls -la ~/faster-whisper-server/
# Doit contenir: .venv/, pyproject.toml
```

### Validation Phase 3: Test Fonctionnel (Optionnel)

```bash
# Lancer serveur Whisper
cd /tmp/test-byan-local-*
./scripts/start-whisper-server.sh &
SERVER_PID=$!

# Attendre démarrage (30 sec)
sleep 30

# Vérifier serveur répond
curl http://localhost:8000/health 2>/dev/null && echo "✅ Serveur répond" || echo "⏳ Attendre..."

# Lancer client Turbo Whisper
./scripts/launch-turbo-whisper.sh &
CLIENT_PID=$!

# Test vocal:
# 1. Attendre que fenêtre s'ouvre
# 2. Appuyer Ctrl+Alt+R
# 3. Dire: "Bonjour, test château français"
# 4. Relâcher Ctrl+Alt+R
# 5. Vérifier texte tapé avec accents corrects

# Arrêter les processus
kill $CLIENT_PID
kill $SERVER_PID
```

### Résultat Attendu

```
✅ BYAN installé complet
✅ Turbo Whisper client installé (~/.local/share/)
✅ Whisper server installé (~/faster-whisper-server/)
✅ Scripts créés (launch + start-server)
✅ Documentation générée
✅ UTF-8 patches appliqués
✅ Message final affiche: "Turbo Whisper: Installed (local mode)"
```

---

## Test 3: Installation Docker (10 min)

**Objectif:** Vérifier mode Docker avec GPU

### Étapes

```bash
cd /tmp
mkdir test-byan-docker-$(date +%s)
cd test-byan-docker-*

node /home/yan/conception/install/bin/create-byan-agent-v2.js
```

### Réponses

```
Platform: copilot
Name: TestUser
Language: Francais
v2.0: Yes
Turbo Whisper: 🚀 Docker (GPU) - Run Whisper in Docker with GPU
```

### Validation

```bash
# Vérifier structure
ls -la scripts/
# Doit contenir SEULEMENT: launch-turbo-whisper.sh
# PAS de start-whisper-server.sh (car Docker)

ls -la docker-compose.turbo-whisper.yml
# Doit exister

cat docker-compose.turbo-whisper.yml
# Vérifier:
# - service: whisper-server
# - image: fedirz/faster-whisper-server:latest-cuda
# - ports: 8000:8000
# - deploy.resources.reservations.devices (GPU)

# Vérifier client installé
test -d ~/.local/share/turbo-whisper && echo "✅ Client installé"

# Vérifier documentation
cat TURBO-WHISPER-SETUP.md | grep -i docker
```

### Test Docker (Si Docker disponible)

```bash
# Lancer container
docker-compose -f docker-compose.turbo-whisper.yml up -d

# Vérifier container
docker ps | grep whisper

# Attendre démarrage (30s)
sleep 30

# Test health
curl http://localhost:8000/health

# Arrêter
docker-compose -f docker-compose.turbo-whisper.yml down
```

### Résultat Attendu

```
✅ BYAN installé
✅ docker-compose.yml créé
✅ Turbo Whisper client installé
✅ Script launch créé (pas de start-server)
✅ Message final: "Turbo Whisper: Installed (docker mode)"
```

---

## Test 4: Dépendances Manquantes (5 min)

**Objectif:** Vérifier validation dépendances

### Simulation Manquante

```bash
# Sauvegarder wl-copy
sudo mv /usr/bin/wl-copy /usr/bin/wl-copy.bak

# Tester installation
cd /tmp
mkdir test-byan-deps-$(date +%s)
cd test-byan-deps-*

node /home/yan/conception/install/bin/create-byan-agent-v2.js

# Sélectionner: Local ou Docker
# Attendre message erreur
```

### Résultat Attendu

```
❌ Missing dependencies:
  - wl-copy

Install with:
  sudo pacman -S wl-clipboard

✅ Installation BYAN continue
❌ Turbo Whisper installation échoue gracieusement
✅ Message clair avec commande d'installation
```

### Restaurer

```bash
sudo mv /usr/bin/wl-copy.bak /usr/bin/wl-copy
```

---

## Test 5: Script Standalone (5 min)

**Objectif:** Tester script setup-turbo-whisper.js seul

### Test Aide

```bash
node /home/yan/conception/install/setup-turbo-whisper.js --help
# Doit afficher usage
```

### Test Dry-Run

```bash
cd /tmp
mkdir test-turbo-standalone-$(date +%s)
cd test-turbo-standalone-*

# Test mode skip
node /home/yan/conception/install/setup-turbo-whisper.js skip
# Doit afficher: "Turbo Whisper installation skipped"

# Test mode local (attention: va vraiment installer!)
# node /home/yan/conception/install/setup-turbo-whisper.js local
```

---

## Checklist Finale

Après avoir exécuté les tests, valider:

### Code ✅
- [ ] Wizard démarre sans erreur
- [ ] Toutes les options du menu fonctionnent
- [ ] Pas d'erreurs JavaScript

### Fonctionnalités ✅
- [ ] Skip mode fonctionne (Test 1)
- [ ] Local mode installe tout (Test 2)
- [ ] Docker mode crée docker-compose (Test 3)
- [ ] Validation dépendances fonctionne (Test 4)
- [ ] Script standalone fonctionne (Test 5)

### Fichiers Générés ✅
- [ ] scripts/launch-turbo-whisper.sh créé
- [ ] scripts/start-whisper-server.sh créé (mode local)
- [ ] docker-compose.turbo-whisper.yml créé (mode docker)
- [ ] TURBO-WHISPER-SETUP.md généré
- [ ] _bmad/bmb/ structure complète

### UTF-8 ✅
- [ ] Patches appliqués automatiquement
- [ ] main.py contient PYTHONIOENCODING
- [ ] typer.py contient _type_clipboard_paste
- [ ] Test vocal avec "château" fonctionne

### Messages UI ✅
- [ ] Instructions finales affichent mode sélectionné
- [ ] Commandes de lancement affichées
- [ ] Hotkey Ctrl+Alt+R mentionné
- [ ] Documentation référencée

---

## En Cas de Problème

### Erreur: Module not found

```bash
cd /home/yan/conception
npm install
```

### Erreur: Permission denied

```bash
chmod +x /home/yan/conception/install/setup-turbo-whisper.js
chmod +x /home/yan/conception/install/bin/create-byan-agent-v2.js
```

### Erreur: Python dependencies

```bash
cd ~/.local/share/turbo-whisper
source .venv/bin/activate
pip install -e .
```

### Rollback si Problème Majeur

```bash
cd /home/yan/conception
git reset --hard HEAD~1
# Revient au commit précédent
```

---

## Rapport de Test

Après tests, documenter:

```markdown
# Test Results - BYAN v2.2.0-beta

**Date:** $(date +%Y-%m-%d)
**Testeur:** Yan

## Tests Exécutés

- [ ] Test 1 - Skip: ✅ | ❌ | ⏭️
- [ ] Test 2 - Local: ✅ | ❌ | ⏭️  
- [ ] Test 3 - Docker: ✅ | ❌ | ⏭️
- [ ] Test 4 - Deps: ✅ | ❌ | ⏭️
- [ ] Test 5 - Standalone: ✅ | ❌ | ⏭️

## Issues Trouvées

1. ...
2. ...

## Validation Finale

- Code Quality: ✅ | ❌
- Fonctionnel: ✅ | ❌
- Documentation: ✅ | ❌

**Decision:** Ready to Publish | Fixes Needed
```

---

## Publication (Après Tests OK)

```bash
cd /home/yan/conception

# 1. Bump version
npm version 2.2.0-beta --no-git-tag-version

# 2. Update CHANGELOG
cat >> CHANGELOG-v2.2.0.md << 'EOF'
# v2.2.0-beta

## Features
- Voice dictation with Turbo Whisper
- UTF-8 support for French accents
- Local and Docker modes

## Installation
npm install -g create-byan-agent@2.2.0-beta
EOF

# 3. Commit
git add package.json CHANGELOG-v2.2.0.md
git commit -m "chore: bump version to 2.2.0-beta"

# 4. Tag
git tag v2.2.0-beta

# 5. Push
git push origin main
git push origin v2.2.0-beta

# 6. Publish
npm publish --tag beta
```

---

**Rachid valide:** Trust But Verify appliqué ✅  
**Estimation:** 30-45 min pour tests complets  
**Priorité:** Tests 1, 2, 3 minimum avant publish
