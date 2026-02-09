#!/bin/bash
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
