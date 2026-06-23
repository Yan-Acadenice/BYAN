# Guide d'Utilisation Turbo Whisper

**Version:** 1.0.2  
**Intégration BYAN v2:** Complète  
**Serveur:** fedirz/faster-whisper-server (local)  
**Date:** 2026-02-07

---

## 📦 Installation Complète

### Turbo Whisper (Interface)

```bash
# Déjà installé dans:
~/.local/share/turbo-whisper/

# Commande:
~/.local/bin/turbo-whisper
```

### Serveur Local (Docker)

```bash
# Container actif:
docker ps | grep whisper-server

# Modèle actuel: Systran/faster-whisper-small
# Port: 8000
# API: http://localhost:8000/v1/audio/transcriptions
```

---

## 🎯 Configuration Optimisée

**Fichier:** `~/.config/turbo-whisper/config.json`

```json
{
  "api_url": "http://localhost:8000/v1/audio/transcriptions",
  "api_key": "",
  "hotkey": ["ctrl", "shift", "space"],
  "language": "fr",
  "typing_delay_ms": 20,
  "auto_paste": true,
  "copy_to_clipboard": true
}
```

### Paramètres Clés

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| `typing_delay_ms` | **20ms** | Évite caractères perdus (était 5ms) |
| `language` | **fr** | Optimisation français |
| `auto_paste` | **true** | Typing direct dans terminal |
| `copy_to_clipboard` | **true** | Backup clipboard |

---

## 🎤 Utilisation

### Méthode 1: Standalone

```bash
# Lancer interface graphique
~/.local/bin/turbo-whisper
```

1. **Appuyez** `Ctrl+Shift+Space` (maintenir)
2. **Parlez** clairement (français)
3. **Relâchez** la touche
4. Le texte apparaît automatiquement !

### Méthode 2: Avec GitHub Copilot CLI

```bash
# Dans n'importe quelle commande Copilot
gh copilot suggest -t shell

# Pendant la saisie:
# - Appuyez Ctrl+Shift+Space
# - Dictez votre prompt
# - Le texte est tapé directement
```

### Méthode 3: Avec BYAN v2

BYAN v2 détecte automatiquement Turbo Whisper et suggère l'usage vocal pour:
- `project_description`
- `pain_points`
- `requirements`
- `use_cases`
- `business_rules`

---

## 🔧 Gestion Serveur Docker

### Commandes Essentielles

```bash
# Status
docker ps | grep whisper-server

# Logs temps réel
docker logs -f whisper-server

# Arrêter
docker stop whisper-server

# Démarrer
docker start whisper-server

# Redémarrer
docker restart whisper-server

# Test santé
curl http://localhost:8000/health
# Attendu: OK
```

### Changer de Modèle

**Modèles disponibles:**

| Modèle | Taille | Qualité | Vitesse CPU |
|--------|--------|---------|-------------|
| `tiny` | 75 MB | Basique | Très rapide |
| `base` | 150 MB | Correcte | Rapide |
| **`small`** | **500 MB** | **Très bonne** | **Acceptable** ⭐ |
| `medium` | 1.5 GB | Excellente | Lent |
| `large-v3` | 3 GB | Parfaite | Très lent |

**Upgrade vers medium (si CPU puissant):**

```bash
docker stop whisper-server
docker rm whisper-server

docker run -d \
  --name whisper-server \
  -p 8000:8000 \
  -e WHISPER__MODEL="Systran/faster-whisper-medium" \
  -e WHISPER__LANGUAGE="fr" \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  fedirz/faster-whisper-server:latest-cpu
```

---

## 🐛 Dépannage

### Problème: Transcription approximative

**Causes:**
- Modèle trop petit (tiny/base)
- Bruit ambiant
- Débit trop rapide
- Phrases trop longues

**Solutions:**
1. Upgrade modèle (small → medium)
2. Parler clairement et distinctement
3. Phrases courtes (< 10 secondes)
4. Environnement calme

### Problème: Caractères bizarres dans CLI

**Cause:** `typing_delay_ms` trop faible (5ms)

**Solution:** (déjà appliqué)
```json
"typing_delay_ms": 20
```

Si persiste, augmenter à 30 ou 50.

### Problème: Serveur ne démarre pas

```bash
# Vérifier logs
docker logs whisper-server

# Erreur commune: Port 8000 occupé
sudo lsof -i :8000
# Tuer processus ou changer port:
docker run -p 8080:8000 ...
```

### Problème: Turbo Whisper ne lance pas

```bash
# Vérifier installation
ls -la ~/.local/bin/turbo-whisper
ls -la ~/.local/share/turbo-whisper

# Test manuel
cd ~/.local/share/turbo-whisper/src
source ../.venv/bin/activate
python3 -m turbo_whisper.main
```

---

## 📊 Métriques & Historique

**Historique transcriptions:** `~/.config/turbo-whisper/config.json` → `history`

**Enregistrements audio:** Stockés localement (si `store_recordings: true`)

**Métriques BYAN v2:**
```javascript
// Dans session state
voice_usage_metrics: {
  suggestions_shown: N,
  voice_inputs_used: N,
  avg_transcription_quality: 0-1
}
```

---

## 🚀 Conseils Pro

### Pour Meilleure Qualité

1. **Micro externe** (USB) > micro laptop
2. **Phrases structurées** > monologue continu
3. **Débit normal** (pas trop rapide)
4. **Environnement calme**
5. **Modèle small minimum** pour français

### Intégration Workflow

```bash
# 1. Brainstorming vocal
@bmad-brainstorming
# Utiliser Ctrl+Shift+Space pour dictée rapide

# 2. Documentation
# Dicter specs, requirements, use cases

# 3. Commit messages (oral puis édition)
git commit  # Dictez message, éditez, validez
```

### Hotkey Personnalisé

Éditer `~/.config/turbo-whisper/config.json`:

```json
{
  "hotkey": ["ctrl", "alt", "v"],  // Exemple
  // ou
  "hotkey": ["super", "space"]     // Touche Windows + Space
}
```

---

## 📚 Agents BMAD Disponibles

### Agent Principal: turbo-whisper-integration

```bash
# Activation (Copilot CLI)
@bmad-agent-turbo-whisper-integration

# Menu:
# [INST]  Installation guidée
# [CONF]  Configuration
# [INT]   Intégration plateforme
# [TEST]  Tests
# [DOCK]  Setup Docker
# [STATUS] État système
```

### Agent Wrapper BYAN

```bash
# Quick access
@byan-agent-turbo-whisper

# Menu:
# [STATUS] État rapide
# [TEST]   Test fonctionnel
# [ENABLE] Activer
# [DISABLE] Désactiver
```

---

## 🔗 Liens Utiles

- **Repo Turbo Whisper:** https://github.com/knowall-ai/turbo-whisper
- **Serveur Docker:** https://github.com/fedirz/faster-whisper-server
- **Modèles Whisper:** https://huggingface.co/Systran

---

## 📝 Changelog

### 2026-02-07 - v1.0.2

- ✅ Installation complète Turbo Whisper
- ✅ Serveur Docker local (fedirz/faster-whisper-server)
- ✅ Modèle small (français optimisé)
- ✅ Configuration typing_delay_ms = 20
- ✅ Intégration BYAN v2 (VoiceIntegration module)
- ✅ 2 agents BMAD créés
- ✅ Tests 100% pass

### Correctifs appliqués

1. **Health check:** Support string "OK" (fedirz server)
2. **Typing delay:** 5ms → 20ms (stabilité caractères)
3. **Modèle:** base → small (qualité français)
4. **Language:** Explicitement "fr" dans config serveur

---

**Auteur:** BYAN (Builder of YAN)  
**Projet:** BMAD Platform  
**Licence:** MIT
