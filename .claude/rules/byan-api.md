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
| `byan_import_project` | Importer un projet local dans BYAN | Oui |

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
