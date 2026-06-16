# API byan_web — Reference Compacte

## 1. Base URL

Base URL dans `$BYAN_API_URL` env. Dev par defaut : `http://localhost:3737`. Prod exemple : `https://byan-api.stark.a3n.fr`. Ne pas inclure `/api` dans `$BYAN_API_URL` — les endpoints le contiennent deja.

## 2. Authentification

| Scheme | Quand | Exemple |
|--------|-------|---------|
| `ApiKey <key>` | Token commence par `byan_` | `Authorization: ApiKey byan_xxx` |
| `Bearer <jwt>` | JWT recu via /api/auth/login | `Authorization: Bearer eyJ...` |

## 3. Format reponse

```json
{ "data": "<payload>", "total": "<optionnel>", "error": "<si echec>", "code": "ERR_CODE" }
```

## 4. Codes d'erreur critiques

| HTTP | Code | Cause |
|------|------|-------|
| 401 | AUTH_REQUIRED | Token absent ou invalide |
| 403 | FORBIDDEN | Action non autorisee |
| 403 | FORBIDDEN_RBAC | Role insuffisant |
| 404 | NOT_FOUND | Ressource introuvable |
| 409 | SLUG_EXISTS | Slug de projet deja utilise |
| 409 | USERNAME_EXISTS | Username deja pris |

## 5. MCP tools disponibles (PREFERER ces tools au curl)

### Tools de base

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_ping` | Verifier que l'API repond | Non |
| `byan_list_projects` | Lister les projets de l'utilisateur | Oui |
| `byan_import_project` | Importer un dossier local. Args : `path` (requis), `projectId` (attache au projet existant) OU `name` + `type` (cree un nouveau projet), `autoCreateNodes` optional | Oui |

### Projets

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_projects_get` | Obtenir le detail d'un projet par ID/slug | Oui |
| `byan_api_projects_create` | Creer un nouveau projet | Oui |

### Workflows

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_workflows_list` | Lister les workflows d'un projet | Oui |
| `byan_api_workflows_get` | Detail d'un workflow par ID | Oui |
| `byan_api_workflows_run` | Declencher l'execution d'un workflow | Oui |
| `byan_api_workflow_runs_list` | Lister les executions d'un workflow | Oui |
| `byan_api_workflow_runs_get` | Detail d'une execution par ID | Oui |

### Knowledge

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_knowledge_list` | Lister les articles de la base de connaissance | Oui |
| `byan_api_knowledge_get` | Obtenir un article par ID | Oui |

### Memoire

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_memory_list` | Lister les entrees memoire d'un agent | Oui |
| `byan_api_memory_search` | Recherche semantique dans la memoire | Oui |

### Agents personnalises

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_custom_agents_list` | Lister les agents custom du projet | Oui |
| `byan_api_custom_agents_get` | Detail d'un agent custom par ID | Oui |
| `byan_api_custom_agents_clone_system` | Cloner un agent systeme en agent custom | Oui |

### Sessions

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_sessions_list` | Lister les sessions actives | Oui |
| `byan_api_sessions_get` | Detail d'une session par ID | Oui |
| `byan_api_sessions_history` | Historique des messages d'une session | Oui |

### Chat

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_chat_conversations_list` | Lister les conversations | Oui |
| `byan_api_chat_messages_list` | Lister les messages d'une conversation | Oui |
| `byan_api_chat_send` | Envoyer un message dans une conversation | Oui |

### Recherche et import

| Tool | Usage | Auth requise |
|------|-------|--------------|
| `byan_api_search` | Recherche globale (projets, agents, knowledge) | Oui |
| `byan_api_import_scan` | Scanner un dossier local avant import | Non |
| `byan_api_import_dry_run` | Simuler un import sans l'executer | Oui |

## 6. Fallback curl (si un tool MCP manque)

```bash
curl -H "Authorization: ApiKey $BYAN_API_TOKEN" "$BYAN_API_URL/api/projects"

curl -X POST -H "Authorization: ApiKey $BYAN_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"trigger":"..."}' "$BYAN_API_URL/api/workflows/<id>/run"
```

## 7. Patterns courants

| Je veux... | Tool MCP a appeler |
|------------|--------------------|
| Lister mes projets | `byan_list_projects` |
| Detail d'un projet | `byan_api_projects_get` |
| Lancer un workflow | `byan_api_workflows_run` |
| Chercher dans la memoire | `byan_api_memory_search` |
| Importer un projet local | `byan_import_project` |

## 8. Famille byan_leantime_* (board externe Leantime, distinct de byan_web)

Backend SEPARE de byan_web : ces tools parlent a une instance Leantime
self-hosted (gestion de projet), pas a l'API byan_web. Le workflow FD les
declenche pour mirror son cycle de vie sur un board Leantime, en sens unique
(FD pilote Leantime ; Leantime ne pilote pas FD). Cablage par phase : voir
`.claude/skills/byan-byan/SKILL.md` section 2.5.

Tu n'appelles pas ces tools a la main : le hook `PostToolUse`
`.claude/hooks/leantime-fd-sync.js` (coeur pur `lib/leantime-fd-core.js`) fire le
sync automatiquement apres `byan_fd_advance` / `byan_fd_update`, best-effort
(sort en 0, n'interrompt pas le tour), idempotent via le sidecar gitignore
`.byan-leantime/map.json`. Detail : SKILL 2.5 + `docs/leantime-integration.md`.

### Config (env distinct de BYAN_API_URL)

| Var | Role |
|-----|------|
| `LEANTIME_API_URL` | Base de l'instance Leantime (host du backend `/api/jsonrpc`, PAS le host de l'UI). Sans `/api` final — le client ajoute `/api/jsonrpc`. |
| `LEANTIME_API_TOKEN` | Cle API Leantime, envoyee en header `x-api-key`. Generation : voir "Generer le token" plus bas (cle API compte de service OU Personal Access Token). |
| `LEANTIME_CLIENT_ID` | Optionnel : clientId pour `addProject` (sinon premier client retourne, sinon 1). |
| `LEANTIME_ASSIGN_USER_ID` | Optionnel : id du user humain a relier au projet cree (visibilite dans son selecteur) + editorId par defaut des taches. Absent -> projet visible du seul compte de service API. |

Les deux premieres sont injectees via `.mcp.json` `${...}` (zero secret tracke).
Quand la paire est absente, les tools reportent `enabled: false` et le FD avance
sans bloquer.

### Generer le token

Cle API Leantime (header `x-api-key`), generee dans l'UI Leantime : Company
Settings -> onglet "Cle d'API" -> "Generate API Key" (role owner/admin requis ;
la cle a le prefixe `lt_`, affichee une seule fois). Guide d'usage complet
(config, generation pas-a-pas, troubleshooting, securite) :
`docs/leantime-integration.md`.

### Authentification (header propre)

Leantime authentifie le JSON-RPC par le header `x-api-key: <token>` — PAS le
switch `Authorization: ApiKey/Bearer` de byan_web. Reutiliser le scheme byan_web
enverrait un header que Leantime ignore : l'appel passe non authentifie
(probablement un 401, ou un fall-through vers la page HTML de login que la garde
non_json attrape). Le code exact est confirme a F0 (live-verify).

### Tools

| Tool | Usage | Guard |
|------|-------|-------|
| `byan_leantime_ping` | Healthcheck : reporte api_url, token_configured, enabled, reachable. Ne throw pas. | aucun |
| `byan_leantime_project_ensure` | Cree-ou-recupere un projet Leantime (idempotent par nom), retourne l'id | requireLeantime |
| `byan_leantime_task_create` | Cree une tache (addTicket) depuis un item backlog, retourne l'id tache | requireLeantime |
| `byan_leantime_task_move` | Transitionne une tache vers une colonne `todo\|doing\|blocked\|review\|done` (resolue en statut Leantime du projet) | requireLeantime |
| `byan_leantime_task_assign` | Pose l'assignee (editorId) | requireLeantime |
| `byan_leantime_task_get` | Lit une tache par id | requireLeantime |
| `byan_leantime_board_get` | Lit le board d'un projet groupe par colonne | requireLeantime |

### Lecon mauvais-host (la garde non-JSON)

Leantime sert l'app HTML ET l'API JSON-RPC sur le meme domaine. Si
`LEANTIME_API_URL` pointe sur le host de l'UI au lieu du backend, un POST
`/api/jsonrpc` peut renvoyer 200 + une page HTML de login. Le client rejette ce
corps en `reason: non_json` avec un hint, plutot que de le lire comme un board
vide. C'est la meme lecon que `BYAN_API_URL` (UI SSO vs host API). Si un appel
Leantime renvoie `non_json`, corriger `LEANTIME_API_URL` vers le host backend.
