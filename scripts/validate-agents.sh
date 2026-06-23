#!/bin/bash
# validate-agents.sh
# Script de validation des agents BMAD pour GitHub Copilot CLI
# Vérifie que le YAML frontmatter est correct

set -e

echo "🔍 Validation des agents BMAD pour GitHub Copilot CLI"
echo "===================================================="
echo ""

errors=0
warnings=0
total=0

if [ ! -d ".github/agents" ]; then
  echo "❌ ERREUR : Répertoire .github/agents/ introuvable"
  exit 1
fi

for file in .github/agents/bmad-agent-*.md; do
  if [ ! -f "$file" ]; then
    continue
  fi
  
  total=$((total + 1))
  filename=$(basename "$file")
  
  echo "📄 Vérification: $filename"
  
  # Extract name from YAML frontmatter
  name=$(grep "^name:" "$file" | head -1 | sed 's/name: *["'\'']//' | sed 's/["'\'']$//')
  
  if [ -z "$name" ]; then
    echo "   ❌ ERREUR: Champ 'name' manquant dans le YAML frontmatter"
    errors=$((errors + 1))
    continue
  fi
  
  # Check if name contains "bmad-agent-" prefix
  if [[ "$name" == *"bmad-agent-"* ]]; then
    echo "   ❌ ERREUR: Le champ 'name' contient le préfixe 'bmad-agent-'"
    echo "      Trouvé: name: \"$name\""
    echo "      Attendu: name: \"${name#bmad-agent-}\""
    errors=$((errors + 1))
    continue
  fi
  
  # Check for description field
  description=$(grep "^description:" "$file" | head -1)
  if [ -z "$description" ]; then
    echo "   ⚠️  AVERTISSEMENT: Champ 'description' manquant"
    warnings=$((warnings + 1))
  fi
  
  # Check for agent-activation block
  if ! grep -q "<agent-activation" "$file"; then
    echo "   ⚠️  AVERTISSEMENT: Block <agent-activation> non trouvé"
    warnings=$((warnings + 1))
  fi
  
  # Check quote style consistency (prefer double quotes)
  if grep -q "^name: '" "$file"; then
    echo "   ℹ️  INFO: Utilise des apostrophes simples (doubles quotes recommandées)"
  fi
  
  echo "   ✅ Nom valide: \"$name\""
  echo ""
done

echo "===================================================="
echo "📊 Résumé de la validation"
echo "===================================================="
echo "Total d'agents vérifiés : $total"
echo "Erreurs critiques      : $errors"
echo "Avertissements         : $warnings"
echo ""

if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
  echo "✅ Tous les agents sont valides et optimaux !"
  exit 0
elif [ $errors -eq 0 ]; then
  echo "⚠️  Validation réussie avec $warnings avertissement(s)"
  echo "    Les agents fonctionneront, mais des améliorations sont recommandées"
  exit 0
else
  echo "❌ Validation échouée avec $errors erreur(s) critique(s)"
  echo ""
  echo "🛠️  Actions recommandées :"
  echo "   1. Corrigez les erreurs ci-dessus"
  echo "   2. Relancez ce script pour vérifier"
  echo "   3. Testez avec : copilot (puis /agent)"
  exit 1
fi
