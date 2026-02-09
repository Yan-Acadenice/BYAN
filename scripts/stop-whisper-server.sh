#!/bin/bash
# Stop Turbo Whisper Docker server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.turbo-whisper.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Erreur: $COMPOSE_FILE introuvable"
    exit 1
fi

echo "🛑 Arrêt serveur Whisper Docker..."
docker-compose -f "$COMPOSE_FILE" down

echo "✅ Serveur arrêté"
