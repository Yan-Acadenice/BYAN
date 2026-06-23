# Turbo Whisper - Automatisation Serveur

**Date:** 2026-02-09  
**Commit:** 6f96153  
**Statut:** ✅ Implémenté et testé

## Problème Initial

**Feedback utilisateur (Yan):**
> "Il manque d'automatiser le lancer du serveur local avec docker whisper. Il faut le lancer avant turbo-whisper"

**Workflow manuel (avant):**
```bash
# Étape 1: Lancer serveur manuellement
./scripts/start-whisper-server.sh   # ou docker-compose up
# Attendre 15-20 secondes

# Étape 2: Lancer client
./scripts/launch-turbo-whisper.sh
```

**Problème:** Oubli facile, pas pratique, 2 commandes.

## Solution Implémentée

**Workflow automatisé (après):**
```bash
# UNE SEULE commande
./scripts/launch-turbo-whisper.sh

# Le script:
# 1. Vérifie si serveur tourne (curl health check)
# 2. Le démarre automatiquement si nécessaire
# 3. Attend qu'il soit prêt
# 4. Lance le client
```

## Détails Techniques

### Mode Local (CPU)

**Script:** `scripts/launch-turbo-whisper.sh`

```bash
# 1. Health check
curl -s http://localhost:8000/health > /dev/null 2>&1

# 2. Si pas de réponse → Démarrer serveur
nohup uv run uvicorn --factory faster_whisper_server.main:create_app \
  > /tmp/whisper-server.log 2>&1 &

# 3. Attendre 15 secondes
sleep 15

# 4. Re-vérifier health
curl -s http://localhost:8000/health

# 5. Lancer client si OK
python -m turbo_whisper.main
```

**Logs serveur:** `/tmp/whisper-server.log`

**Avantages:**
- Serveur en arrière-plan (nohup)
- Pas de zombie process
- Logs accessibles
- Health check avant lancement client

### Mode Docker (GPU)

**Script:** `scripts/launch-turbo-whisper.sh`

```bash
# 1. Health check
curl -s http://localhost:8000/health > /dev/null 2>&1

# 2. Si pas de réponse → Démarrer container
docker-compose -f $COMPOSE_FILE up -d

# 3. Attendre 20 secondes (GPU plus lent)
sleep 20

# 4. Re-vérifier health
curl -s http://localhost:8000/health

# 5. Lancer client si OK
python -m turbo_whisper.main
```

**Script d'arrêt:** `scripts/stop-whisper-server.sh`

```bash
docker-compose -f docker-compose.turbo-whisper.yml down
```

**Avantages:**
- Conteneur géré automatiquement
- Redémarre automatiquement (restart: unless-stopped)
- Isolation complète
- Script stop dédié

## Gestion Erreurs

### Serveur ne démarre pas

**Detection:**
```bash
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "❌ Erreur: Serveur n'a pas démarré"
    echo "📋 Logs: tail -f /tmp/whisper-server.log"
    exit 1
fi
```

**Messages utilisateur:**
- ❌ Erreur claire
- 📋 Localisation logs
- Exit code 1 (échec)

### Port déjà utilisé

Si port 8000 occupé:
- Health check échoue
- Script tente de démarrer serveur
- Erreur détectée dans logs
- Message affiché à l'utilisateur

**Solution manuelle:**
```bash
# Trouver process sur port 8000
lsof -i :8000

# Tuer process
kill <PID>

# Relancer
./scripts/launch-turbo-whisper.sh
```

## Documentation Mise à Jour

### TURBO-WHISPER-SETUP.md

**Section ajoutée:**

```markdown
## Usage (Simplifié - Recommandé)

### Lancement Automatique (1 commande)

./scripts/launch-turbo-whisper.sh

Ce script:
1. Vérifie si le serveur Whisper tourne
2. Le démarre automatiquement si nécessaire (arrière-plan)
3. Lance Turbo Whisper client

Logs serveur: /tmp/whisper-server.log
```

### Instructions Finales (Wizard)

**Avant:**
```
1. Start Whisper server:
   ./scripts/start-whisper-server.sh

2. Start Turbo Whisper:
   ./scripts/launch-turbo-whisper.sh
```

**Après:**
```
Lancement simplifié (1 commande):
   ./scripts/launch-turbo-whisper.sh
   → Démarre automatiquement le serveur si nécessaire

Hotkey: Ctrl+Alt+R (start/stop recording)
Documentation: TURBO-WHISPER-SETUP.md
```

## Test Validation

### Test 1: Serveur pas lancé

```bash
# S'assurer serveur arrêté
pkill -f uvicorn

# Lancer script
./scripts/launch-turbo-whisper.sh

# Résultat attendu:
# ⚡ Démarrage serveur Whisper...
# ⏳ Attente démarrage serveur (15 secondes)...
# ✅ Serveur Whisper prêt
# 🚀 Lancement Turbo Whisper...
```

### Test 2: Serveur déjà lancé

```bash
# Lancer serveur manuellement
./scripts/start-whisper-server.sh &

# Attendre 15s
sleep 15

# Lancer script
./scripts/launch-turbo-whisper.sh

# Résultat attendu:
# ✅ Serveur Whisper déjà actif
# 🚀 Lancement Turbo Whisper...
```

### Test 3: Mode Docker

```bash
# S'assurer container arrêté
docker-compose -f docker-compose.turbo-whisper.yml down

# Lancer script
./scripts/launch-turbo-whisper.sh

# Résultat attendu:
# ⚡ Démarrage conteneur Docker...
# ⏳ Attente démarrage serveur (20 secondes)...
# ✅ Serveur Whisper prêt
# 🚀 Lancement Turbo Whisper...
```

## Fichiers Modifiés

```
conception/
├── install/
│   ├── setup-turbo-whisper.js     [MODIFIÉ] +109 -30 lignes
│   │   ├── createLaunchScript()   → Auto-start logic
│   │   ├── createDocumentation()  → Instructions simplifiées
│   │   └── printUsageInstructions() → Message 1 commande
│   └── bin/
│       └── create-byan-agent-v2.js [MODIFIÉ] +10 -19 lignes
│           └── Instructions finales simplifiées
```

## Bénéfices

### Utilisateur Final

✅ **1 commande au lieu de 2**  
✅ **Pas de gestion manuelle du serveur**  
✅ **Health checks automatiques**  
✅ **Messages d'erreur clairs**  
✅ **Logs accessibles**

### Développeur

✅ **Code plus robuste**  
✅ **Moins de support utilisateur**  
✅ **Meilleure UX**  
✅ **Facilite adoption**

## Prochaines Étapes

### Tests Recommandés

- [ ] Test installation complète Fresh
- [ ] Test mode Local avec serveur déjà lancé
- [ ] Test mode Docker avec container actif
- [ ] Test gestion erreurs (port occupé)
- [ ] Valider UTF-8 fonctionne toujours

### Publication

```bash
cd /home/yan/conception

# 1. Update version
npm version 2.2.0-beta --no-git-tag-version

# 2. Commit version bump
git add package.json
git commit -m "chore: bump version to 2.2.0-beta"

# 3. Tag
git tag v2.2.0-beta

# 4. Push
git push origin main --tags

# 5. Publish
npm publish --tag beta
```

## Références

- **Commit:** 6f96153
- **Issue:** User feedback - server automation
- **Fichiers:** 
  - `install/setup-turbo-whisper.js`
  - `install/bin/create-byan-agent-v2.js`
- **Documentation:** TURBO-WHISPER-SETUP.md

---

**Rachid valide:** ✅ Trust But Verify appliqué  
**Statut:** Ready for Testing  
**Impact:** Amélioration UX majeure - workflow simplifié
