#!/bin/bash
cd ~/.local/share/turbo-whisper
source .venv/bin/activate
echo "🚀 Lancement Turbo Whisper..."
echo "📍 Hotkey: Ctrl+Alt+R"
echo ""
python -m turbo_whisper.main
