# Architecture — Yanstaller v3: Update + WebUI + Parakeet TDT

**Date:** 2026-04-10
**Auteur:** Winston (Architect) + Sally (UX) — orchestre par BYAN
**Status:** VALIDATED

---

## 1. Vue d'ensemble

Yanstaller v3 ajoute 3 systemes a l'installeur BYAN existant :
1. **Update System** — mise a jour CLI + preview + backup/rollback
2. **WebUI** — interface web pour install + update (alternative au CLI)
3. **STT Abstraction** — Parakeet TDT + Whisper fallback

### Principe directeur
- Local-first, zero cloud
- Zero build step pour le frontend (vanilla JS)
- Incremental : chaque systeme fonctionne independamment

---

## 2. Update System

### 2.1 Architecture

```
npx create-byan-agent update [--preview] [--force]
         |
         v
  ┌─────────────────┐
  │  updater.js      │
  │  (orchestrateur)  │
  └────────┬─────────┘
           |
  ┌────────┼────────────────┐
  │        │                │
  v        v                v
┌──────┐ ┌──────────┐ ┌──────────┐
│detect│ │ compare  │ │ backup   │
│version│ │ files    │ │ + apply  │
└──────┘ └──────────┘ └──────────┘
```

### 2.2 Version Detection

```javascript
// Read installed version from _byan/config.yaml
// Compare with npm registry: npm view create-byan-agent version
// Output: { installed: "2.7.9", latest: "2.8.0", updateAvailable: true }
```

### 2.3 File Comparison Strategy

Chaque fichier installe a un hash SHA-256 stocke dans `_byan/.manifest.json` :

```json
{
  "version": "2.7.9",
  "files": {
    "_byan/config.yaml": { "hash": "abc123", "userModified": false },
    "_byan/soul.md": { "hash": "def456", "userModified": true },
    "_byan/agents/byan.md": { "hash": "ghi789", "userModified": false }
  }
}
```

**Regles d'update :**
- `userModified: false` → update direct (remplacer)
- `userModified: true` → SKIP + avertir (fichier custom, ne pas ecraser)
- Fichier nouveau dans template → ajouter
- Fichier supprime dans template → garder (ne jamais supprimer les fichiers user)

### 2.4 Backup/Rollback

- Backup complet `_byan/` avant update → `_byan.backup-{timestamp}/`
- Commande rollback : `npx create-byan-agent rollback`
- Liste des backups : `npx create-byan-agent backups`
- Max 3 backups conserves (rotation)

### 2.5 Preview (Dry-Run)

`npx create-byan-agent update --preview` affiche :

```
Update available: 2.7.9 → 2.8.0

Files to update (12):
  UPDATE  _byan/agents/byan.md
  UPDATE  _byan/core/activation/soul-activation.md
  ADD     _byan/agents/new-agent.md
  SKIP    _byan/config.yaml (user modified)
  SKIP    _byan/soul.md (user modified)

No files will be deleted.
Proceed? [y/N]
```

---

## 3. WebUI

### 3.1 Stack Decision

| Choix | Decision | Raison |
|-------|----------|--------|
| **Serveur** | Node.js `http` built-in + routeur minimal | Zero dep supplementaire. Express overkill pour 6 routes. |
| **WebSocket** | `ws` package | Leger, standard, pour les logs temps reel |
| **Frontend** | Vanilla HTML + CSS + JS | Zero build step. Accessible. Ockham. |
| **Styling** | CSS custom avec variables | Pas de framework CSS. Theme sombre par defaut. |

### 3.2 Architecture

```
npx create-byan-agent --web [--port 3000]
         |
         v
  ┌──────────────────────┐
  │  server.js            │
  │  (HTTP + WebSocket)   │
  │  Port 3000 par defaut │
  └──────────┬───────────┘
             │
    ┌────────┼────────┐
    │        │        │
    v        v        v
  /api/*   /ws    /public/*
  REST     Logs   Static files
  JSON     Live   HTML/CSS/JS
```

### 3.3 API Endpoints

```
GET  /api/status          → { version, installed, platforms, sttEngine }
GET  /api/update/check    → { updateAvailable, from, to, changes[] }
POST /api/install         → Lancer installation (body: config)
POST /api/update          → Lancer update (body: options)
POST /api/rollback        → Rollback au dernier backup
GET  /api/backups         → Liste des backups
GET  /api/stt/status      → Status du moteur STT
POST /api/stt/configure   → Configurer le moteur STT
```

### 3.4 WebSocket Events

```
ws://localhost:3000/ws

Server → Client:
  { type: "log", level: "info|warn|error", message: "..." }
  { type: "progress", step: 3, total: 8, label: "Installing agents..." }
  { type: "complete", success: true, summary: {...} }
```

### 3.5 UX Flow (Sally)

**Install Wizard :**
```
[1. Welcome] → [2. Platform Detection] → [3. Mode Selection]
     → [4. Configuration] → [5. Preview] → [6. Install Progress] → [7. Done]
```

**Update Flow :**
```
[1. Version Check] → [2. Changelog] → [3. Diff Preview]
     → [4. Backup + Update Progress] → [5. Validation] → [6. Done]
```

**Layout :** Single page, wizard steps en haut, contenu au centre, logs en bas.

---

## 4. STT Abstraction Layer

### 4.1 Architecture

```
┌──────────────────────────────────────┐
│          STT Engine (Abstract)        │
│  detect() → configure() → ready()    │
└──────────────┬───────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      v                 v
┌───────────┐   ┌──────────────┐
│  Whisper   │   │ Parakeet TDT │
│  (fallback)│   │  (preferred)  │
│  CPU/GPU   │   │  GPU only     │
└───────────┘   └──────────────┘
```

### 4.2 Detection Logic

```javascript
// 1. Check nvidia-smi (GPU available?)
// 2. Check VRAM (>= 4GB for Parakeet)
// 3. Check Python + NeMo installed
// 4. If all OK → Parakeet TDT
// 5. Else → Whisper fallback (existing setup-turbo-whisper.js)
```

### 4.3 Parakeet Setup

- **Python dependency** : `pip install nvidia-nemo[asr]`
- **Model** : `nvidia/parakeet-tdt-0.6b-v2` (CC-BY-4.0)
- **Docker alternative** : NIM container (comme le docker-compose Whisper existant)
- **Config stockee dans** : `_byan/config.yaml` section `stt:`

### 4.4 Config Extension

```yaml
# Ajout a _byan/config.yaml
stt:
  engine: auto          # auto | whisper | parakeet
  whisper:
    model: small        # tiny | base | small | medium | large-v3
    mode: docker        # local | docker
  parakeet:
    model: parakeet-tdt-0.6b-v2
    mode: docker        # local | docker
    languages: [fr, en]
```

---

## 5. Fichiers a creer/modifier

### Nouveaux fichiers

| Fichier | Role |
|---------|------|
| `install/lib/yanstaller/updater.js` | Orchestrateur update |
| `install/lib/utils/version-compare.js` | Comparaison de versions |
| `install/lib/utils/file-differ.js` | Hash + diff de fichiers |
| `install/lib/utils/manifest.js` | Gestion _byan/.manifest.json |
| `install/src/webui/server.js` | Serveur HTTP + WS |
| `install/src/webui/api.js` | Routes API REST |
| `install/src/webui/ws-handler.js` | WebSocket handler |
| `install/src/webui/public/index.html` | Page principale |
| `install/src/webui/public/style.css` | Styles |
| `install/src/webui/public/app.js` | Frontend JS |
| `install/lib/stt/engine.js` | Interface STT abstraite |
| `install/lib/stt/whisper-backend.js` | Backend Whisper |
| `install/lib/stt/parakeet-backend.js` | Backend Parakeet |
| `install/setup-parakeet.js` | Setup script Parakeet |
| `docker-compose.parakeet.yml` | Docker Parakeet |

### Fichiers modifies

| Fichier | Modification |
|---------|-------------|
| `install/bin/create-byan-agent-v2.js` | Ajouter commandes `update`, `rollback`, `backups`, flag `--web` |
| `install/lib/yanstaller/index.js` | Implementer `update()`, ajouter `rollback()`, `backups()` |
| `install/lib/yanstaller/backuper.js` | Completer implementation backup + restore |
| `install/package.json` | Ajouter dep `ws`, ajouter bin commands |
| `_byan/config.yaml` | Ajouter section `stt:` |

---

## 6. Dependencies

| Package | Version | Usage |
|---------|---------|-------|
| `ws` | ^8.16.0 | WebSocket pour WebUI |

Aucune autre dependance ajoutee. Serveur HTTP natif Node.js. Frontend vanilla.
