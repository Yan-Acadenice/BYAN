---
name: byan-project
description: Lister les projets BYAN via MCP et en choisir un a inspecter ou importer. Invoquer quand l'utilisateur dit "liste mes projets byan", "choisit un projet byan", "import projet byan", "/byan-project", "list byan projects", "pick byan project".
---

# /byan-project — Parcourir les projets byan_web

Skill API-first : chaque etape appelle un tool MCP verifie. Pas de curl.
Owner de la session : l'utilisateur (responsible du choix final).
Approche simple et incremental — Ockham, KISS, minimal.

## Prerequis

Verifier que `$BYAN_API_TOKEN` est configure dans `.mcp.json`.
Contrainte : sans token valide, aucune action n'est possible.
Si absent ou vide : "Token byan_web manquant. Relance `npx create-byan-agent`."
Challenge avant de continuer (IA-16) : token present ? Sinon stop.

## Protocole

Etapes step-by-step. Appliquer progressive disclosure : afficher uniquement ce dont
l'utilisateur a besoin a chaque etape. Adapter le style a la reponse (feedback loop).

1. Appeler `byan_list_projects`. Source : tool MCP, fait verifie.

2. Si vide : "Aucun projet trouve." Proposer `byan_api_projects_create`.
   Consequence : aucune navigation possible sans projet existant.

3. Sinon, afficher tableau numerote (show, don't just tell) :

   | # | nom | id | type | created_at |
   |---|-----|----|------|------------|
   | 1 | ... | .. | ...  | ...        |

4. Demander : "Lequel ? (numero ou nom)"
   Clarification si ambigu. Attendre la reponse (intent preserve).

5. Parser la reponse. Extraire project_id.
   Validation : ne pas inventer un id — Zero Trust, verify avant d'agir.

6. Appeler `byan_api_projects_get { id }`.
   Validate output avant affichage.

7. Afficher metadata : nom, type, visibility, my_role, description.
   Consistent avec le schema byan_web (reference : .mcp.json).

8. Proposer trois actions (priority = impact / effort) :
   1. "Importer" → `byan_import_project { path, name }` — branch locale creee
   2. "Workflows" → `byan_api_workflows_list { projectId }`
      Filtre si > 20 resultats (performance, pas de liste infinie).
   3. "Memoire" → `byan_api_memory_list { projectId, limit: 20 }`

   Attendre choix. Executer. Iterer si necessaire.

## Gestion d'erreurs (fail fast, graceful degradation)

- `AUTH_REQUIRED` : "Token expire. Regenerer via /api/auth/login."
  Rollback implicite : aucun etat modifie cote serveur.
- Erreur reseau : "byan_web injoignable. Verifier `$BYAN_API_URL`."
  Fallback : proposer de retenter ou de verifier l'environnement (staging vs production).
- Autre erreur : afficher le message brut (evidence directe, pas d'interpretation).

## Conformite Merise Agile (contexte skill)

Ce skill s'inscrit dans le cycle BYAN : chaque action est tracable epic → story → task.
Acceptance criteria : l'utilisateur peut lister, selectionner et inspecter un projet (resultat measurable et verifiable).
Test automatise : byan_ping valide la connexion (CI/CD pipeline de l'installeur).
TDD, test-driven, test-first : verification avant chaque appel MCP.
Definition of Done (DoD) : projet selectionne + metadata affichee + action executee.
Documentation dans le README de chaque projet importe.
Versioning semantique (semver) des projets expose par byan_web.
Retrospective : adapter le protocole selon le feedback utilisateur.
Data dictionary / schema : project_id, name, type, visibility, my_role (byan_web).
MCD / MCT validation : modele conceptuel aligne avec les workflows BYAN.
Velocite preservee : bottom-up depuis les user stories de l'utilisateur.
Pareto 80/20 : 3 actions couvrent 80% des besoins. Pas de feature YAGNI.
Changelog maintenu par byan_web. History des sessions dans byan_api_memory_list.
E2E, end-to-end, integration : import teste localement apres byan_import_project.
Reasoning explicite : chaque step explique pourquoi (rationale documente).
Clean, readable, self-documenting. Performance : limit: 20 par defaut.
No hallucinations : toutes les assertions sourcees (fact, evidence, source, verified).
