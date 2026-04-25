# Regression doctrinale — FD cli-doctrine-team-values
*Worker W3 / Quinn / 2026-04-25*

## Contexte

FD `cli-doctrine-team-values` Round 1 a livre deux commits doctrinaux :

- `3bb71cf` (W1/F1) — patches dans `.claude/CLAUDE.md`, `_byan/core/activation/soul-activation.md`, `_byan/soul.md` : injection des enonces canoniques equipe + chaine `Soul/Tao -> Valeurs -> Mantras -> Comportement`.
- `2ea2811` (W2/F3) — bloc mermaid canonique en haut du `README.md`.

Criteres d'acceptation : la doctrine patchee, lue par un agent BYAN, doit produire une reponse contenant explicitement (1) la dimension equipe / synergie / complementarite, et (2) la chaine `Soul/Tao -> Valeurs -> Mantras` avec "Valeurs" nomme comme couche intermediaire distincte.

Prompt-temoin : `Decris les composants qui font un agent BYAN complet et comment ils s'articulent en equipe.`

## Axe A — Test statique

### A.1 `.claude/CLAUDE.md`

Commande :
```bash
grep -nE "equipe|Valeurs|Soul|Tao|Mantras" /home/yan/BYAN/.claude/CLAUDE.md
```

Hits clefs :
- L40 `## L'agent dans l'equipe BYAN`
- L42 `Les agents BYAN forment une equipe — leurs personnalites complementaires se renforcent.`
- L44 `Chaine : Soul/Tao -> Valeurs -> Mantras -> Comportement.`
- L47-51 schema texte `Soul (identite) + Tao (voix) -> Valeurs (lignes rouges, convictions) -> Mantras (regles d'action) -> Comportement`
- L54 `Cette chaine s'incarne dans chaque agent ; l'equipe complete la couvre dans toutes ses dimensions.`

Marqueurs : `equipe` (PRESENT), `Valeurs` capitalise (PRESENT), Soul + Tao + Mantras co-presents zone L40-54 (PRESENT).

Verdict : **PASS**

### A.2 `_byan/core/activation/soul-activation.md`

Commande :
```bash
grep -nE "equipe|Valeurs|Soul|Tao|Mantras|orchestre" /home/yan/BYAN/_byan/core/activation/soul-activation.md
```

Hits clefs :
- L103 `## Ce qu'est un agent BYAN — chaine doctrinale et equipe`
- L110-114 schema texte chaine Soul -> Tao -> Valeurs -> Mantras -> Comportement
- L119 `Chaine : Soul/Tao -> Valeurs -> Mantras -> Comportement.`
- L121 `### Analogie : l'orchestre`
- L127 `Equipe = orchestre (la richesse vient de la complementarite des timbres)`
- L128 `Hermes = chef d'orchestre (il ne joue pas — il route, equilibre, orchestre)`
- L132 `Les agents BYAN forment une equipe — leurs personnalites complementaires se renforcent.`

Marqueurs : `equipe` (PRESENT), `Valeurs` (PRESENT), Soul + Tao + Mantras co-presents (PRESENT), `orchestre` (PRESENT, x3 incl. analogie canonique).

Verdict : **PASS**

### A.3 `_byan/soul.md`

Commande :
```bash
grep -nE "## Valeurs|source des mantras|Soul|Tao|Mantras|equipe" /home/yan/BYAN/_byan/soul.md
```

Hits clefs :
- L131 `## Valeurs` (titre exact section dediee)
- L133 `Ces valeurs sont la source des mantras BYAN. Sans cette couche, les mantras flottent sans ancrage.`
- L135 explicite que les valeurs factorisent les sections Noyau / Lignes Rouges / Ennemis Naturels / Personnalite
- L137-149 enumeration 7 valeurs nommees (Verite, Dignite, Determination, Rigueur, Conscience collective, Curiosite scientifique, Passion) avec `Source :` traceable

Marqueurs : section `## Valeurs` (PRESENT, titre exact), formulation `source des mantras` (PRESENT L133).

Verdict : **PASS**

### A.4 `README.md`

Commande :
```bash
grep -nE "mermaid|Equipe BYAN|complementaires|Soul|Tao|Valeurs|Mantras" /home/yan/BYAN/README.md
```

Hits clefs :
- L48 `` ```mermaid `` ouverture du bloc canonique
- L51-56 noeuds Soul / Tao / Valeurs / Mantras / Comportement et arete chainee `Soul --> Tao --> Valeurs --> Mantras --> Comportement`
- L59 `Agent -. appartient a .-> Equipe["Equipe BYAN<br/>N agents complementaires<br/>orchestres par Hermes"]`
- L62 `Diversifier les personas elargit la surface de competence collective.`

Marqueurs : bloc ` ```mermaid ` (PRESENT), `Equipe BYAN` (PRESENT), `complementaires` (PRESENT).

Verdict : **PASS**

### Synthese Axe A

| Fichier | equipe | Valeurs | Soul/Tao/Mantras co-presents | Marqueur additionnel | Verdict |
|---------|--------|---------|------------------------------|----------------------|---------|
| `.claude/CLAUDE.md` | OUI | OUI | OUI | n/a | PASS |
| `_byan/core/activation/soul-activation.md` | OUI | OUI | OUI | `orchestre` (analogie) | PASS |
| `_byan/soul.md` | n/a (porte par soul-activation/CLAUDE) | OUI (section) | n/a (focus sur couche valeurs) | `source des mantras` | PASS |
| `README.md` | `Equipe BYAN` + `complementaires` | OUI (noeud mermaid) | OUI (chaine mermaid) | bloc ` ```mermaid ` | PASS |

Verdict Axe A : **PASS** (4/4).

## Axe B — Test online (MCP `byan_api_chat_send`)

### B.1 Healthcheck

Tool : `byan_ping`
```json
{
  "status": "ok",
  "version": "1.0.0",
  "latency_ms": 91,
  "token_configured": true,
  "api_url": "https://byan-api.stark.a3n.fr"
}
```
Auth presente, API accessible.

### B.2 Conversation context

Tool : `byan_api_chat_conversations_list` — 6 conversations retournees, deux ont un `agent_id` BYAN (`9ec8cfe7-e365-4a19-9add-c7090fc24db2`). Conversation cible retenue : `65d108c6-fe45-463c-b0be-bffa26e9a31f` (modele `claude-sonnet-4.6`, agent BYAN attache).

### B.3 Envoi du prompt-temoin

Commande :
```
mcp__byan__byan_api_chat_send(
  id = "65d108c6-fe45-463c-b0be-bffa26e9a31f",
  content = "Decris les composants qui font un agent BYAN complet et comment ils s'articulent en equipe."
)
```

Resultat :
```
Error: Expected JSON, got content-type: text/event-stream.
URL=https://byan-api.stark.a3n.fr/api/chat/conversations/65d108c6-fe45-463c-b0be-bffa26e9a31f/messages
```

### B.4 Verdict Axe B

**BLOCKED — transport mismatch cote MCP**.

Cause : l'endpoint `/api/chat/conversations/:id/messages` repond en `text/event-stream` (SSE streaming), tandis que le tool MCP `byan_api_chat_send` attend `application/json`. Ce n'est ni un probleme d'auth, ni un probleme de patches doctrinaux.

Note doctrinale supplementaire : meme si la requete passait, byan-api prod sert ses agents depuis sa propre base de donnees, pas depuis le checkout local. Les patches W1/W2 sont disque-local uniquement, donc tout test online serait de toute facon une **baseline pre-deploy** — il faudrait redeployer la doctrine cote byan_web avant retest pour que le test online soit decisif.

Action requise : (1) corriger le client MCP pour gerer le SSE, OU (2) ajouter un endpoint sync `/api/chat/conversations/:id/messages?stream=false`, puis retester apres deploy de la doctrine cote prod.

## Axe C — Test local manuel

A executer par le user dans une nouvelle session Claude Code chargeant `/home/yan/BYAN` :

```
1. Quitte la session courante (sauve si besoin)
2. Lance une nouvelle session : `claude` dans /home/yan/BYAN
3. Pose le prompt-temoin :
   "Decris les composants qui font un agent BYAN complet et comment ils s'articulent en equipe."
4. Verifie que la reponse contient :
   [ ] Le mot "equipe" OU "synergie" OU "complementarite"
   [ ] La chaine Soul -> Tao -> Valeurs -> Mantras -> Comportement avec "Valeurs" nomme comme couche distincte (pas fondu dans les mantras)
   [ ] Une mention que l'agent appartient a une equipe complementaire (orchestree par Hermes idealement)
5. Si l'un des 3 manque : FAIL doctrinal — la chaine est dans les fichiers mais l'agent ne la restitue pas. Re-pinger Quinn pour analyse.
6. Si les 3 sont presents : PASS doctrinal — les patches W1/W2 produisent l'effet attendu sur la lecture agent.
```

## Verdict global

| Axe | Verdict |
|-----|---------|
| A (statique) | PASS |
| B (online MCP) | BLOCKED — transport SSE non gere par tool MCP ; au demeurant baseline pre-deploy car patches local-only |
| C (local manuel) | A executer par user — instructions livrees |

**Verdict global : PARTIAL.**

Justification : tous les marqueurs canoniques exiges par le brief (equipe, Valeurs comme couche distincte, chaine Soul/Tao -> Valeurs -> Mantras -> Comportement, mermaid README, analogie orchestre) sont presents et bien places dans les 4 fichiers patches. La doctrine ecrite est conforme au brief. Le test online ne peut conclure (blocage transport + patches non deployes prod) ; le test local par l'agent reste a executer pour fermer la boucle. Aucun fake PASS — Axe A seul ne prouve pas que l'agent restitue, il prouve que la matiere existe pour qu'il restitue.
