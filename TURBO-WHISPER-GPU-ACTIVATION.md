# Turbo Whisper - Activation GPU et Fix "Server Busy"

**Date:** 9 février 2026  
**Auteur:** Rachid  
**Contexte:** Résolution erreur "server busy" après installation Docker GPU

---

## Problème Identifié

### Symptômes
- Serveur Docker démarre correctement
- Erreur "server busy" lors de première transcription
- Fonctionne ensuite normalement

### Cause Racine

**Le serveur télécharge le modèle au premier lancement** (4-5 GB):
- Modèle: `Systran/faster-whisper-large-v3`
- Délai: 2-5 minutes selon connexion
- Durant ce temps: API répond "busy"

---

## Solution

### Configuration Docker

**Fichier:** `docker-compose.turbo-whisper.yml`
```yaml
version: '3.8'
services:
  whisper-server:
    image: fedirz/faster-whisper-server:latest-cuda
    ports:
      - "8000:8000"
    environment:
      - MODEL_NAME=large-v3
      - DEVICE=cuda
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Validation

```bash
# Logs conteneur
docker logs conception-whisper-server-1 --tail 20

# Doit afficher
CUDA Version 12.2.2
INFO:     Application startup complete.

# Test API
curl -s http://localhost:8000/health
# Doit retourner: OK
```

---

## Premier Lancement (2 options)

### Option A: Foreground (Recommandé)

```bash
# Voir logs en direct
cd ~/conception
docker-compose -f docker-compose.turbo-whisper.yml up

# Attendre "Application startup complete"
# Ctrl+C puis relancer en background
docker-compose -f docker-compose.turbo-whisper.yml up -d

# Lancer client
./scripts/launch-turbo-whisper.sh
```

### Option B: Automatique

```bash
./scripts/launch-turbo-whisper.sh
# Si "server busy" → attendre 2-5 min
```

---

## Commandes Utiles

```bash
# Serveur
docker-compose -f ~/conception/docker-compose.turbo-whisper.yml up -d
docker-compose -f ~/conception/docker-compose.turbo-whisper.yml down
docker logs -f conception-whisper-server-1

# Client
cd ~/conception && ./scripts/launch-turbo-whisper.sh

# Tests
curl -s http://localhost:8000/health
```

---

## Statut Final

| Composant | Statut | Performance |
|-----------|--------|-------------|
| Docker + GPU | ✅ OK | CUDA 12.2.2 |
| Modèle | ✅ OK | Systran/faster-whisper-large-v3 |
| API | ✅ OK | localhost:8000 |
| Client | ✅ OK | Ctrl+Alt+R |
| UTF-8 | ✅ OK | Clipboard |
| Vitesse | ✅ OK | 0.5-1s/audio |

**Résumé:** "Server busy" = téléchargement initial (une fois). GPU fonctionne.
