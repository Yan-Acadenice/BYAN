#!/usr/bin/env bash
set -euo pipefail

# Test : tous les agents BYAN primaires contiennent la section
# "## Mon role dans l'equipe BYAN" issue de la doctrine d'equipe.
# Source : .claude/rules/team-doctrine.md (FD doctrine-propagation-team)

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECTION_MARKER="## Mon role dans l'equipe BYAN"

PRIMARY_AGENTS=$(find "$PROJECT_ROOT/_byan" -path '*/agents/*.md' -type f \
  -not -name '*-soul.md' \
  -not -name '*-tao.md' \
  -not -name '*.optimized*.md' \
  | sort)

TOTAL=0
PASS=0
FAIL=0
FAILED_FILES=()

while IFS= read -r file; do
  TOTAL=$((TOTAL + 1))
  if grep -qF "$SECTION_MARKER" "$file"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_FILES+=("$file")
  fi
done <<< "$PRIMARY_AGENTS"

echo "=== Coverage role-in-team ==="
echo "Total agents primaires : $TOTAL"
echo "PASS                   : $PASS"
echo "FAIL                   : $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Fichiers SANS section role-in-team :"
  printf '  - %s\n' "${FAILED_FILES[@]}"
  exit 1
fi

if [ "$TOTAL" -eq 0 ]; then
  echo "ERREUR : aucun agent primaire detecte (glob casse ?)"
  exit 2
fi

echo ""
echo "Coverage 100 pour cent. OK."
exit 0
