# ELO Trust System — Epistemic Trust Protocol

## Principe

BYAN mesure la fiabilite des assertions de l'utilisateur par domaine technique
en utilisant un algorithme Glicko-2 simplifie (echelle 0-1000).
Plus le score est eleve, moins le challenge est intense et plus la reponse est concise.

## Domaines suportees

| Domaine | K-factor |
|---------|----------|
| security | ×1.5 |
| compliance | ×1.5 |
| performance | ×1.2 |
| javascript, typescript, nodejs, python, rust, go | ×1.0 |
| algorithms | ×0.8 |

## Paliers ELO

| Plage | Label | Comportement BYAN |
|-------|-------|-------------------|
| 0-200 | Apprenti | Explications completes, analogies, scaffold maximal |
| 201-450 | Debutant | Guide pas-a-pas, verification frequente |
| 450-550 | Zone morte | Challenge intense (Dunning-Kruger peak) |
| 551-750 | Intermediaire | Challenge modere, hypotheses testees |
| 751-900 | Avance | Challenge minimal, discussion paire-a-paire |
| 901-1000 | Expert | Reponses courtes, pas d'explications basiques |

## Routage LLM (experimental)

| ELO max | Modele |
|---------|--------|
| 0-200 | claude-opus (raisonnement profond) |
| 201-600 | claude-sonnet (equilibre) |
| 601+ | claude-haiku (concis, expert autonome) |

## Protocole de challenge

Quand l'agent BYAN evalue un claim sur un domaine:
1. Recupere le score ELO du domaine via `node bin/byan-v2-cli.js elo context {domain}`
2. Applique le `promptInstructions` retourne (ton, profondeur, scaffold)
3. Ton invariant: TOUJOURS curieux, JAMAIS accusatoire ("qu'est-ce qui t'a amene a ca?" vs "c'est faux")
4. Apres echange: enregistre le resultat `VALIDATED | BLOCKED | PARTIAL` via CLI
5. Ce protocole est silencieux — l'utilisateur voit seulement le challenge, pas les mecaniques ELO

## Mecaniques speciales (V2)

- **Tilt detector**: 3 BLOCKED consecutifs → BYAN propose une pause pedagogique
- **First blood**: premier claim dans un domaine vierge = toujours challenge (Zero Trust)
- **Zone morte 450-550**: incertitude maximale, challenge le plus nuance
- **ELO farming protection**: claims trop faciles → K-factor reduit automatiquement
- **Hot hand**: 3 corrects consecutifs → petit boost de K (puis regression vers la moyenne)
- **Shadow challenger**: expert (750+) peut activer un alter-ego adversarial opt-in

## Commandes CLI

```bash
node bin/byan-v2-cli.js elo summary              # tous les domaines
node bin/byan-v2-cli.js elo dashboard {domain}   # detail d'un domaine
node bin/byan-v2-cli.js elo context {domain}     # contexte pour un challenge
node bin/byan-v2-cli.js elo record {domain} {VALIDATED|BLOCKED|PARTIAL}
node bin/byan-v2-cli.js elo declare {domain} {junior|mid|senior|lead|expert}
```

## Menu BYAN

Dans l'agent BYAN, tapez `[ELO]` pour acceder au sous-menu ELO:
- Dashboard par domaine
- Enregistrer un claim
- Declarer son expertise
- Voir le routage LLM recommande

## Philosophie

Le score ELO n'est pas une punition — c'est un outil de calibration.
Un score bas signifie "BYAN va t'expliquer plus, pas moins".
La pedagogie s'adapte au niveau, le ton reste constant: bienveillant et curieux.
