# BYAN Portable Core — Noyau portable, projection native

> BYAN est livre via npm et tourne sur deux plateformes (Claude Code, Codex).
> Son identite et son etat doivent survivre a l'absence de toute feature native.
> Les features natives sont un accelerateur opportuniste, pas une bequille.

## Principe (hexagonal / ports-and-adapters)

Le noyau de BYAN — identite (soul, tao, soul-memory), etat (FD, strict, ELO),
connaissance — vit dans des artefacts **portables, in-repo**, sous `_byan/` et
`_byan-output/`, plus l'API `byan_web` quand le reseau est la. Ce noyau est la
**source de verite**. Il est shippe, il marche offline, il marche sur une machine
neuve, il marche sur Codex.

Les fonctionnalites natives de la plateforme (Claude Code) sont une **couche
d'acceleration en write-through** : BYAN ecrit *vers* elles pour en tirer le
benefice (cache, recall, isolation), mais ne les lit pas comme autorite. Si la
couche native est absente ou videe, BYAN se reconstruit depuis le noyau portable
sans rien perdre de son identite ni de son etat.

```
        +---------------------- noyau portable (source de verite) ----------------------+
        |  _byan/agent/byan/{soul,tao,soul-memory}.md   _byan-output/fd-state.json       |
        |  _byan/memoire/{elo,fact-graph}.json          byan_web API (autorite reseau)   |
        +-------------------------------------------------------------------------------+
                 |  (write-through, pas une dependance)            ^  (reconstruction)
                 v                                                |
        +---------------------- adaptateurs natifs (accelerateurs) ---------------------+
        |  injection prefix-cache   @-import memory files   hooks   subagent isolation   |
        +-------------------------------------------------------------------------------+
```

## Les trois frontieres

1. **Source de verite portable.** Toute chose dont BYAN a besoin pour etre
   lui-meme est un fichier sous `_byan/` (ou une entree `byan_web`). Rien
   d'essentiel ne vit uniquement dans une couche native.
2. **Le natif est un accelerateur write-through.** On projette l'etat portable
   *vers* le natif pour la vitesse / le cache / le recall. On ne doit pas dependre
   du natif en lecture pour une fonction essentielle. La projection est derivee et
   regenerable depuis le noyau.
3. **L'AutoMem est hors-perimetre.** Le repertoire AutoMem natif de Claude Code
   (`~/.claude/projects/<hash>/memory/`) est local a l'assistant, par-machine,
   indexe par un hash du chemin projet — **non shippable** via npm. Il n'est pas
   une source de verite BYAN, et aucun chemin de lecture critique n'en depend. Ce
   qui doit etre portable vit dans `soul-memory` / `_byan/`.

## Table : feature native -> adaptateur -> chemin degrade

| Feature native Claude | Adaptateur BYAN (write-through) | Chemin degrade (natif absent / Codex) |
|-----------------------|--------------------------------|----------------------------------------|
| Prompt caching (prefixe stable) | `inject-soul.js` / `inject-tao.js` injectent soul+tao depuis `_byan/` au SessionStart | la voix reste lue depuis `_byan/` ; `inject-voice-anchor` re-pose l'ancre par tour |
| Memory files (`@-import`) | fichiers in-repo (`_byan/`, `.claude/rules/`) charges nativement par Claude | sur Codex, le bloc `AGENTS.md` porte l'equivalent ; les regles restent des fichiers lisibles |
| Hooks (SessionStart / PreCompact / Stop) | `.claude/hooks/*.js` | sur Codex (pas de hook), le contexte est porte par `AGENTS.md` ; le filet pre-commit reste actif |
| Subagent isolation | `byan-hermes-dispatch` delegue et ne ramene qu'un distillat | si pas de subagent, execution inline main-thread (meme resultat, plus de tokens) |
| Compaction | `pre-compact-save.js` ecrit un snapshot sous `_byan-output/` | l'etat FD vit dans `_byan-output/fd-state.json`, relisible sans la couche native |

L'AutoMem n'a **pas** de ligne : ce n'est pas un adaptateur, il est hors-perimetre.

## Le test de degradation (litmus)

L'independance n'est pas une promesse, c'est un test. Wipe la couche native
(hooks off, `~/.claude/` absent, Codex) : l'identite (soul/tao/soul-memory) et
l'etat FD doivent se reconstruire depuis les artefacts portables `_byan/` seuls.
Rebranche le natif : BYAN tourne plus lean (cache, distillat). **Les deux doivent
tenir.** Garde-fou mecanique : `.claude/__tests__/portable-core.test.js` echoue
si un chemin critique se met a dependre de l'AutoMem natif.

## Mantras

- `PORTABLE-1` Source de verite in-repo. Le noyau vit sous `_byan/`, pas dans le natif.
- `PORTABLE-2` Natif = accelerateur, pas une dependance. On ecrit vers, on ne lit pas comme autorite.
- `PORTABLE-3` AutoMem hors-perimetre. `~/.claude/projects/.../memory/` n'est pas une source BYAN.
- `PORTABLE-4` Projection derivee. Toute copie native est regenerable depuis le noyau.
- `PORTABLE-5` Degradation testee. L'independance passe un test, elle ne se decrete pas.

## References

- Doctrine token (pourquoi un pointeur sans `@-import`) : CLAUDE.md, section `## Compact instructions` (chantier context-engineering).
- Isolation subagent (levier "plus avec moins") : `.claude/skills/byan-hermes-dispatch/SKILL.md`.
- Etat FD portable : `_byan/mcp/byan-mcp-server/lib/fd-state.js` -> `_byan-output/fd-state.json`.
