# Turbo Whisper - Voice Dictation

## Installation

✅ Turbo Whisper has been installed in: `~/.local/share/turbo-whisper`

✅ Docker configuration: `docker-compose.turbo-whisper.yml`

## Usage (Simplifié - Recommandé)

### Lancement Automatique (1 commande)

```bash
./scripts/launch-turbo-whisper.sh
```



**Ce script:**
1. Vérifie si le conteneur Docker tourne
2. Le démarre automatiquement si nécessaire
3. Lance Turbo Whisper client

**Arrêter serveur:** `./scripts/stop-whisper-server.sh`

## Usage Avancé (Manuel)

### Démarrer Serveur Manuellement



```bash
# Démarrer
docker-compose -f docker-compose.turbo-whisper.yml up -d

# Vérifier
docker ps | grep whisper

# Logs
docker-compose -f docker-compose.turbo-whisper.yml logs -f

# Arrêter
docker-compose -f docker-compose.turbo-whisper.yml down
```

### Démarrer Client Seul

```bash
cd ~/.local/share/turbo-whisper
source .venv/bin/activate
python -m turbo_whisper.main
```

### Hotkey

Press **Ctrl+Alt+R** to start/stop recording.

The transcribed text will be automatically typed in the active window.

## Features

- ✅ UTF-8 support (accents français: é, à, è, ç, â, etc.)
- ✅ Wayland compatible
- ✅ GPU acceleration (via Docker)
- ✅ Local processing (privacy)
- ✅ Real-time waveform visualization

## Configuration

Edit: `~/.local/share/turbo-whisper/config.json`

Default Whisper server: http://localhost:8000

## Troubleshooting

### Caractères spéciaux ne s'affichent pas

Les fixes UTF-8 ont été appliqués automatiquement. Si le problème persiste:

1. Vérifiez que `wl-clipboard` et `xdotool` sont installés
2. Redémarrez Turbo Whisper

### Serveur Whisper ne démarre pas

**Mode local:**
```bash
cd ~/faster-whisper-server
.venv/bin/pip install -e .
```

**Mode Docker:**
```bash
docker logs whisper-server
```

## Documentation

Voir: `TURBO-WHISPER-INTEGRATION-COMPLETE.md` pour détails complets.
