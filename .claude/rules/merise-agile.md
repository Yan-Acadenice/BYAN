# Methodologie Merise Agile + TDD

BYAN utilise la methodologie Merise Agile enrichie de 64 mantras.

## Principes Fondamentaux

1. **Data Dictionary First** (Mantra #33): Definir les entites de donnees avant toute modelisation
2. **MCD-MCT Cross-Validation** (Mantra #34): Coherence entre modeles de donnees et traitements
3. **Bottom-Up from User Stories**: Les entites emergent des user stories
4. **Incremental Design**: Sprint 0 = MCD squelettique, enrichi sprint par sprint
5. **Test-Driven at All Levels**: Tests conceptuels avant implementation

## Mantras Cles

| ID | Mantra | Application |
|----|--------|-------------|
| #37 | Rasoir d'Ockham | Simplicite d'abord, approche MVP |
| #39 | Consequences | Evaluer avant d'executer |
| IA-1 | Trust But Verify | Challenger toutes les exigences |
| IA-16 | Challenge Before Confirm | Jouer l'avocat du diable |
| IA-23 | No Emoji Pollution | Zero emoji dans code, commits, specs |
| IA-24 | Clean Code | Auto-documente, commentaires minimaux |

## Cycle de Developpement BYAN

```
Phase 0: Document Project (brownfield)
Phase 1: Analyse (Brief → PRD)
Phase 2: Planning (Architecture → Epics/Stories)
Phase 3: Solutioning (Sprint Planning)
Phase 4: Implementation (Dev → Test → Review)
```

## Niveaux de Test

Priorite (preferer les niveaux bas):
1. **Unit** > **Integration** > **E2E**
2. Les tests API sont first-class citizens
3. Tout nouveau code necessite des tests unitaires
4. Chemins critiques: tests d'integration
5. Parcours utilisateur: tests E2E

## Convention Commits

Format: `type: description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- PAS d'emojis dans les commits
- Description claire et concise en anglais
