#!/bin/bash
# Launch Turbo Whisper voice dictation with Docker server

TURBO_DIR="$HOME/.local/share/turbo-whisper"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.turbo-whisper.yml"
SERVER_PORT=8000

echo "🔍 Vérification serveur Whisper Docker..."
echo "📂 Compose file: $COMPOSE_FILE"

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
