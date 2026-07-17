# Chantier — Projection optimisee par plateforme (Claude / Codex)

> Statut : PLANIFIE (prochain FD apres `entry-chain-partymode`).
> Slug FD propose : `per-platform-projection-opti`.
> Origine : discussion du 2026-07-16. L'utilisateur veut, a terme, pouvoir
> optimiser le rendu des elements BYAN (soul, tao, workflow, prompting des
> agents) **specifiquement pour chaque moteur** — Claude d'un cote, Codex de
> l'autre — sans jamais faire diverger la verite.

## Le probleme a corriger

L'intuition de depart etait : "deux dossiers distincts, un pour Codex, un pour
Claude, ou vivent les elements BYAN, pour faire de l'optimisation native entre
les deux". C'est bon dans l'esprit, dangereux si on le prend au pied de la lettre.

Si les elements (soul 25 Ko, tao 15 Ko, workflows, agents) etaient **dupliques**
dans `.claude/` et `.codex/` comme deux copies editables chacune de son cote,
elles derivent. C'est exactement la fabrique a agents-zombies que BYAN combat
(un soul Claude et un soul Codex qui ne disent plus la meme chose au bout de
trois mois).

## L'etat reel du depot (2026-07-16)

| Dossier | Role | Contenu mesure |
|---------|------|----------------|
| `_byan/` | **Source de verite unique** | `agent/byan/soul.md` (25 Ko), `tao.md` (15 Ko), `agent/`, `workflow/` — les vrais elements, une seule fois |
| `.claude/` | Projection Claude native | skills, hooks, regles |
| `.codex/` + `~/.codex/skills` + `AGENTS.md` | Projection Codex native | stubs de 300 a 800 o qui pointent vers le coeur |

Aujourd'hui, `.codex/` ne contient **pas** de copies : ce sont des pointeurs.
Le soul complet vit une seule fois, dans `_byan/`. C'est deja la bonne base.

## La forme cible

**Un coeur unique + deux projections optimisees par plateforme.**

```
        _byan/  (source de verite : soul, tao, workflow, agents)
           |
           |  projeté par un generateur, PAS recopié a la main
     +-----+---------------------------+
     v                                 v
  projection Claude                 projection Codex
  (.claude/ : prefixe stable,       (.codex/ + ~/.codex/skills +
   cache-friendly, @-import)         AGENTS.md : format Codex)
```

Regle d'or (doctrine portable-core, PORTABLE-1 / PORTABLE-4) :
- **L'optimisation vit dans le generateur qui projette**, pas dans un deuxieme
  dossier-source.
- Chaque projection est **derivee et regenerable** depuis `_byan/`. On peut la
  tuner par moteur (rendu, ordre, decoupage, format) sans creer une verite rivale.
- Aucun chemin de lecture critique ne depend d'une projection comme autorite.

## Ce que l'optimisation par plateforme peut couvrir

- **Prompting des agents** : Claude aime un prefixe stable (bon pour son cache) ;
  Codex a son propre format d'injection de contexte. Meme agent, deux rendus.
- **Soul / tao** : meme identite, mais projetee dans le format le plus efficace
  pour chaque moteur (longueur, position, decoupage).
- **Workflows** : un workflow peut avoir une projection native Claude (script
  `.claude/workflows/*.js`) et une projection Codex (skill natif), depuis la
  meme definition `_byan/workflow/`.

## Pistes de travail (a raffiner au prochain FD)

1. **Inventaire du generateur actuel** : recenser qui projette deja quoi
   (`byan-sync-rules`, `byan-build-skill-bundles`, `codex-native-setup`,
   `template-sync`) et ce qui est encore recopie a la main.
2. **Un projecteur unifie** : une couche qui prend un element `_byan/` + une
   cible (`claude` | `codex`) et rend la projection optimisee. Idempotent,
   regenerable, teste.
3. **Marqueur d'optimisation par cible** : permettre a un element de porter des
   hints de rendu par plateforme sans dupliquer le fond.
4. **Test de non-derive** : un test qui echoue si une projection contient du
   fond que le coeur n'a pas (garde-fou contre la copie-source rampante).
5. **Mesure** : de quoi comparer le cout token d'un meme agent projete Claude vs
   Codex, pour piloter l'optimisation par des chiffres, pas au flair.

## Ce que ce chantier N'EST PAS

- Ce n'est **pas** deux sources editables. Une seule source : `_byan/`.
- Ce n'est **pas** dans le perimetre de `entry-chain-partymode` (chaine d'entree
  + delegation Codex reelle + visuel party-mode). Chantier separe, plus gros.
- Ce n'est **pas** urgent : la base (coeur unique + stubs) est deja saine.

## References

- Doctrine : `.claude/rules/portable-core.md` (noyau portable, projection derivee).
- Generateurs existants : `_byan/mcp/byan-mcp-server/bin/byan-sync-rules.js`,
  `byan-build-skill-bundles.js`, `install/lib/codex-native-setup.js`,
  `_byan/mcp/byan-mcp-server/lib/template-sync.js`.
