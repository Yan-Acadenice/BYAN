# BYAN API Documentation

> Version 1.0.0 | Port 3737 | SQLite + Node.js built-in HTTP
>
> **WebUI (SSO)** : `https://byan.stark.a3n.fr` (Authentik SSO)
> **API publique** : `https://byan-api.stark.a3n.fr` (JWT / API Key)
> **URL locale** : `http://localhost:3737`

## Overview

BYAN API est l'API centralisee de gestion des connaissances, contextes et memoire persistante pour tous les agents BYAN. Elle utilise un systeme de partitionnement BSP (Binary Space Partitioning) adapte a l'IA pour decouper les projets en arbres de contexte optimises.

**Stack** : Node.js (built-in `http`, zero framework), better-sqlite3, jsonwebtoken, CommonJS

**Architecture BSP** :
- **Projets dev** : `project_root` → `epic` → `story`
- **Projets formation** : `project_root` → `bloc` → `module` → `competence`
- **Context pruning** : leaf 100%, parent 80%, grandparent 50%, reste 20%

---

## Authentication

Deux modes d'authentification, via le header `Authorization` :

| Mode | Header | Usage |
|------|--------|-------|
| **JWT Bearer** | `Authorization: Bearer <token>` | Sessions interactives (expire 7j) |
| **API Key** | `Authorization: ApiKey <key>` | Scripts, automation, CI/CD |

Le premier utilisateur enregistre obtient automatiquement le role `admin`.

---

## Response Format

Toutes les reponses suivent le meme envelope :

```json
// Succes (single)
{ "data": { ... } }

// Succes (list)
{ "data": [ ... ], "total": 42 }

// Erreur
{ "error": "Message descriptif", "code": "ERROR_CODE" }
```

Les noms de champs sont en **snake_case** (coherent avec SQLite).

---

## Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | Non | Health check |

**Response** : `{ "status": "ok", "version": "1.0.0" }`

---

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | Non | Creer un compte (1er = admin) |
| POST | `/api/auth/login` | Non | Connexion |
| POST | `/api/auth/refresh` | Oui | Renouveler le JWT |
| GET | `/api/auth/me` | Oui | Profil courant |
| PUT | `/api/auth/me` | Oui | Modifier profil |
| POST | `/api/auth/change-password` | Oui | Changer mot de passe |
| GET | `/api/auth/api-keys` | Oui | Lister ses API keys |
| POST | `/api/auth/api-keys` | Oui | Creer une API key |
| DELETE | `/api/auth/api-keys/:id` | Oui | Supprimer une API key |

#### POST /api/auth/register

```json
// Request
{
  "username": "yan",
  "password": "secret",
  "displayName": "Yan",       // optionnel
  "email": "yan@a3n.fr"       // optionnel
}

// Response
{
  "data": { "id": "...", "username": "yan", "displayName": "Yan", "email": "yan@a3n.fr", "role": "admin" },
  "token": "eyJhbG..."
}
```

> Le `token` est a la racine de la reponse, pas dans `data`.

#### POST /api/auth/login

```json
// Request
{ "username": "yan", "password": "secret" }

// Response — meme format que register
```

#### POST /api/auth/api-keys

```json
// Request
{
  "name": "ci-pipeline",
  "scopes": ["read", "write"],  // optionnel — defaut: tous
  "expiresAt": "2027-01-01"     // optionnel — defaut: jamais
}

// Response
{
  "data": { "id": "...", "name": "ci-pipeline", "key": "byan_abc123..." }
}
```

> La `key` brute n'est retournee qu'a la creation. Stockez-la immediatement.

---

### Projects

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | Non | Lister les projets |
| POST | `/api/projects` | Non | Creer un projet (+ root node BSP) |
| GET | `/api/projects/:id` | Non | Detail d'un projet |
| PUT | `/api/projects/:id` | Non | Modifier un projet |
| DELETE | `/api/projects/:id` | Non | Supprimer un projet (cascade) |
| GET | `/api/projects/:id/tree` | Non | Arbre BSP complet |
| GET | `/api/projects/:id/metadata` | Non | Stats (nodeCount, maxDepth, types) |

#### POST /api/projects

```json
// Request
{
  "name": "Mon Projet",
  "type": "dev",                  // "dev" | "training"
  "description": "...",           // optionnel
  "visibility": "private",        // optionnel — "public" | "private"
  "metadata": "{}",               // optionnel — JSON string
  "context": "Contexte du root"   // optionnel — context du root node
}

// Response
{
  "data": {
    "id": "...",
    "name": "Mon Projet",
    "type": "dev",
    "root_node_id": "...",
    ...
  }
}
```

> La creation genere automatiquement le `root_node` BSP avec les `node_paths`.

#### GET /api/projects/:id/tree

```json
// Response — arbre recursif
{
  "data": {
    "id": "root-id",
    "name": "project_root",
    "node_type": "project_root",
    "children": [
      {
        "id": "epic-id",
        "name": "Epic 1",
        "node_type": "epic",
        "children": [ ... ]
      }
    ]
  }
}
```

---

### BSP Nodes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/nodes/:id` | Non | Detail d'un node |
| POST | `/api/nodes` | Non | Creer un node (child) |
| PUT | `/api/nodes/:id` | Non | Modifier un node |
| DELETE | `/api/nodes/:id` | Non | Supprimer un node (cascade) |
| GET | `/api/nodes/:id/context` | Non | Resoudre le contexte (KEY endpoint) |
| GET | `/api/nodes/:id/children` | Non | Enfants directs |
| GET | `/api/nodes/:id/path` | Non | Chemin root → node (ancestors) |
| POST | `/api/nodes/:id/move` | Non | Deplacer un node |

#### POST /api/nodes

```json
// Request
{
  "projectId": "...",
  "parentId": "...",            // ID du parent (root_node_id, epic, etc.)
  "nodeType": "epic",           // dev: "epic" | "story" — training: "bloc" | "module" | "competence"
  "name": "Epic Authentication",
  "description": "...",         // optionnel
  "context": "...",             // optionnel — contexte specifique a ce node
  "metadata": "{}",             // optionnel
  "sortOrder": 0                // optionnel
}

// Response
{ "data": { "id": "new-node-id" } }
```

#### GET /api/nodes/:id/context — Context Resolution

C'est le endpoint central du BSP tree. Il remonte de la feuille a la racine en appliquant le pruning :

| Niveau | Ratio |
|--------|-------|
| Feuille (node demande) | 100% |
| Parent direct | 80% |
| Grand-parent | 50% |
| Au-dela | 20% |

```
GET /api/nodes/:id/context?maxTokens=128000
```

```json
// Response
{
  "data": {
    "resolvedContext": "Contexte complet assemble et prune...",
    "path": [
      { "id": "root", "name": "Project", "depth": 0 },
      { "id": "epic", "name": "Auth Epic", "depth": 1 },
      { "id": "story", "name": "Login Story", "depth": 2 }
    ],
    "tokenCount": 4200,
    "pruned": false
  }
}
```

> `maxTokens` defaut : 128000. Estimation tokens : `chars / 4`.

#### POST /api/nodes/:id/move

```json
// Request
{ "newParentId": "target-parent-id" }

// Response
{ "data": { ... node mis a jour ... } }
```

> Recalcule automatiquement les `node_paths` (materialized paths).

---

### Memory

Systeme de memoire persistante cross-CLI a 3 couches.

| Couche | Duree | Usage |
|--------|-------|-------|
| `working` | 24h | Contexte de session, notes temporaires |
| `short_term` | 7 jours | Insights, patterns detectes |
| `long_term` | Permanent | Decisions, preferences, regles metier |

**Auto-assignment** : decisions/preferences → `long_term`, insights → `short_term`, reste → `working`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/memory` | Oui | Stocker une memoire |
| GET | `/api/memory` | Oui | Lister les memoires (filtres) |
| GET | `/api/memory/search` | Oui | Recherche full-text |
| GET | `/api/memory/context-window` | Oui | Construire la fenetre de contexte |
| GET | `/api/memory/:id` | Oui | Detail |
| PUT | `/api/memory/:id` | Oui | Modifier |
| DELETE | `/api/memory/:id` | Oui | Supprimer |
| POST | `/api/memory/:id/promote` | Oui | Promouvoir (changer de couche) |
| POST | `/api/memory/:id/pin` | Oui | Epingler |
| DELETE | `/api/memory/:id/pin` | Oui | Desepingler |
| POST | `/api/memory/decay` | Oui | Declencher le decay (nettoyage) |

#### POST /api/memory

```json
// Request
{
  "content": "L'utilisateur prefere TypeScript strict",
  "projectId": "...",           // optionnel
  "nodeId": "...",              // optionnel
  "userId": "...",              // optionnel
  "cliSource": "copilot",      // "copilot" | "claude" | "codex" | "api" | "manual"
  "sessionId": "...",           // optionnel
  "category": "preference",    // optionnel
  "metadata": "{}",             // optionnel
  "pinned": false               // optionnel
}
```

> La couche (`layer`) est assignee automatiquement par le memory-store.

#### GET /api/memory

```
GET /api/memory?projectId=...&nodeId=...&category=preference&layer=long_term&cliSource=copilot&limit=50&includePinned=true
```

Tous les query params sont optionnels — filtres cumulatifs.

#### GET /api/memory/search

```
GET /api/memory/search?q=typescript&projectId=...&limit=20
```

> `q` est requis. Recherche dans le champ `content`.

#### GET /api/memory/context-window

```
GET /api/memory/context-window?nodeId=...&maxTokens=128000
```

Construit une fenetre de contexte optimisee combinant memoires et contexte BSP.

#### POST /api/memory/:id/promote

```json
{ "layer": "long_term" }
```

#### POST /api/memory/decay

Declenche le nettoyage automatique :
- `working` > 24h → supprime
- `short_term` > 7j → supprime
- `long_term` → jamais supprime
- Les memoires `pinned` ne sont jamais supprimees

---

### Sessions

Tracking de sessions cross-CLI avec stitching automatique.

**Stitching** : les sessions du meme utilisateur + projet + node dans une fenetre de 30 minutes sont automatiquement liees via `parent_session_id`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/sessions` | Oui | Creer une session |
| PUT | `/api/sessions/:id/end` | Oui | Terminer une session |
| GET | `/api/sessions` | Oui | Lister les sessions |
| GET | `/api/sessions/:id` | Oui | Detail |
| GET | `/api/sessions/:id/context` | Oui | Contexte complet de la session |
| GET | `/api/sessions/:id/history` | Oui | Chaine de sessions liees |

#### POST /api/sessions

```json
// Request
{
  "cliSource": "copilot",       // requis — "copilot" | "claude" | "codex" | "api" | "manual"
  "userId": "...",               // optionnel
  "projectId": "...",            // optionnel
  "nodeId": "...",               // optionnel
  "agentName": "byan"            // optionnel
}

// Response
{
  "data": {
    "id": "session-id",
    "cli_source": "copilot",
    "stitched": true,                   // true si rattache a une session precedente
    "parent_session_id": "prev-id",     // si stitched
    ...
  }
}
```

#### PUT /api/sessions/:id/end

```json
// Request (optionnel)
{ "summary": "Session de debug sur le module auth" }
```

---

### Knowledge

Base de connaissances structuree par projet.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/knowledge` | Non | Lister (filtres) |
| POST | `/api/knowledge` | Non | Creer |
| GET | `/api/knowledge/:id` | Non | Detail |
| PUT | `/api/knowledge/:id` | Non | Modifier |
| DELETE | `/api/knowledge/:id` | Non | Supprimer |

#### POST /api/knowledge

```json
{
  "title": "Convention de nommage",
  "content": "camelCase pour les variables, PascalCase pour les classes...",
  "category": "convention",     // optionnel
  "tags": "code,style",         // optionnel — string CSV
  "projectId": "..."            // optionnel
}
```

#### GET /api/knowledge

```
GET /api/knowledge?category=convention&project_id=...&tags=code
```

---

### Search

Recherche unifiee across nodes et knowledge.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/search` | Non | Recherche globale |

```
GET /api/search?q=authentication&scope=all&project_id=...
```

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Terme de recherche (requis) |
| `scope` | string | `all`, `nodes`, `knowledge` |
| `project_id` | string | Filtrer par projet |

```json
// Response
{
  "data": {
    "nodes": [ { "id": "...", "name": "...", "node_type": "epic", ... } ],
    "knowledge": [ { "id": "...", "title": "...", ... } ]
  },
  "total": 5
}
```

---

### Agents

Registre des agents BYAN.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | Oui | Lister les agents |
| POST | `/api/agents` | Oui | Enregistrer un agent |
| GET | `/api/agents/:id` | Oui | Detail |
| PUT | `/api/agents/:id` | Oui | Modifier |
| DELETE | `/api/agents/:id` | Oui | Supprimer |
| POST | `/api/agents/scan` | Oui | Scanner le filesystem |

#### POST /api/agents/scan

Scanne les dossiers `_byan/`, `_bmad/` pour detecter et enregistrer automatiquement tous les agents.

```json
// Response
{
  "data": {
    "scanned": 45,
    "registered": 12,
    "updated": 3,
    "agents": [ ... ]
  }
}
```

#### POST /api/agents

```json
{
  "name": "bmm-dev",
  "displayName": "Amelia (Dev)",    // optionnel
  "module": "bmm",                   // optionnel
  "sourcePath": "_bmad/bmm/agents/dev.md",  // optionnel
  "persona": "Ultra-succinct developer",     // optionnel
  "capabilities": "code,review,refactor"     // optionnel
}
```

#### GET /api/agents

```
GET /api/agents?module=bmm&active=1
```

---

### MCP Servers

Registre des serveurs MCP (Model Context Protocol).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/mcp/servers` | Oui | Lister |
| POST | `/api/mcp/servers` | Oui | Enregistrer |
| GET | `/api/mcp/servers/:id` | Oui | Detail |
| PUT | `/api/mcp/servers/:id` | Oui | Modifier |
| DELETE | `/api/mcp/servers/:id` | Oui | Supprimer |
| POST | `/api/mcp/servers/:id/link` | Oui | Lier a un projet |
| DELETE | `/api/mcp/servers/:id/link/:projectId` | Oui | Delier d'un projet |
| GET | `/api/mcp/projects/:projectId` | Oui | MCP servers d'un projet |

#### POST /api/mcp/servers

```json
{
  "name": "github-mcp",
  "command": "npx @github/mcp-server",
  "description": "GitHub MCP",        // optionnel
  "args": "--stdio",                   // optionnel
  "env": "{}",                         // optionnel — JSON string
  "transport": "stdio",               // "stdio" | "sse" | "http"
  "healthCheckUrl": null               // optionnel
}
```

#### POST /api/mcp/servers/:id/link

```json
{
  "projectId": "...",
  "config": "{}"     // optionnel — JSON string de config specifique
}
```

---

### Groups (RBAC)

Gestion des groupes d'utilisateurs.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/groups` | Oui | Lister |
| POST | `/api/groups` | Oui | Creer |
| GET | `/api/groups/:id` | Oui | Detail (+ membres) |
| PUT | `/api/groups/:id` | Oui | Modifier |
| DELETE | `/api/groups/:id` | Oui | Supprimer |
| POST | `/api/groups/:id/members` | Oui | Ajouter un membre |
| DELETE | `/api/groups/:id/members/:userId` | Oui | Retirer un membre |

#### POST /api/groups

```json
{ "name": "team-backend", "description": "Equipe backend" }
```

#### POST /api/groups/:id/members

```json
{ "userId": "...", "role": "member" }   // role: "admin" | "member"
```

---

### Project Roles (RBAC)

Permissions par projet — attribuees a un utilisateur ou un groupe.

| Role | Niveau | Droits |
|------|--------|--------|
| `owner` | 4 | Tout (CRUD + admin projet) |
| `editor` | 3 | Lecture + ecriture |
| `viewer` | 2 | Lecture seule |
| `agent-only` | 1 | Acces API agents uniquement |

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/roles` | Oui | Lister les roles du projet |
| POST | `/api/projects/:id/roles` | Oui | Assigner un role |
| PUT | `/api/projects/:id/roles/:roleId` | Oui | Modifier un role |
| DELETE | `/api/projects/:id/roles/:roleId` | Oui | Supprimer un role |

#### POST /api/projects/:id/roles

```json
{
  "userId": "...",      // OU groupId — l'un des deux requis
  "groupId": "...",
  "role": "editor"      // "owner" | "editor" | "viewer" | "agent-only"
}
```

---

### Import

Importer des projets existants dans BYAN.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/import/scan` | Oui | Scanner un repertoire |
| POST | `/api/import/dry-run` | Oui | Simuler un import |
| POST | `/api/import/project` | Oui | Importer un projet |
| POST | `/api/import/multi` | Oui | Importer plusieurs projets |
| POST | `/api/import/soul` | Oui | Importer les soul data d'un agent |

#### POST /api/import/scan

```json
{ "path": "/home/yan/projects/my-project" }
```

Detecte la structure du projet (BMAD artifacts, package.json, etc.) et retourne un plan d'import.

#### POST /api/import/project

```json
{
  "path": "/home/yan/projects/my-project",
  "name": "Mon Projet",    // optionnel — detecte depuis package.json
  "type": "dev"             // optionnel — "dev" | "training"
}
```

#### POST /api/import/multi

```json
{
  "paths": [
    "/home/yan/projects/project-a",
    "/home/yan/projects/project-b"
  ]
}
```

#### POST /api/import/soul

```json
{ "agentPath": "_byan/agents/byan.md" }
```

Importe soul.md, tao.md, soul-memory.md associes a l'agent.

---

## Configuration

| Variable | Defaut | Description |
|----------|--------|-------------|
| `BYAN_API_PORT` | `3737` | Port d'ecoute |
| `BYAN_DB_PATH` | `./data/byan.db` | Chemin SQLite |
| `BYAN_JWT_SECRET` | random 32 bytes | Secret JWT (persister en prod) |
| `BYAN_PROJECT_ROOT` | `../../` (parent de api/) | Racine du projet BYAN |

---

## Database Schema

### Core (BSP Tree)

```
projects          — id, name, type(dev|training), visibility, root_node_id
nodes             — id, project_id, parent_id, node_type, name, context
node_paths        — node_id, ancestor_id, depth (materialized paths)
knowledge         — id, title, content, category, tags, project_id
context_snapshots — id, node_id, context, label
node_references   — source_node_id, target_node_id, ref_type
```

### Auth + RBAC

```
users             — id, username, password_hash, role(admin|user)
api_keys          — id, user_id, name, key_hash, scopes
groups            — id, name, description
group_members     — group_id, user_id, role(admin|member)
project_roles     — project_id, user_id|group_id, role(owner|editor|viewer|agent-only)
audit_log         — id, user_id, action, resource_type, resource_id
```

### MCP + Memory

```
agents            — id, name, module, source_path, persona, capabilities, soul_hash
mcp_servers       — id, name, command, transport(stdio|sse|http), status
project_mcp       — project_id, mcp_server_id, config, enabled
memories          — id, project_id, node_id, cli_source, layer(working|short_term|long_term), content, pinned
sessions          — id, user_id, project_id, cli_source, agent_name, parent_session_id
mcp_tools         — id, mcp_server_id, name, description, input_schema
```

---

## Docker

```bash
cd api/
docker compose -f docker-compose.byan-api.yml up -d
```

- **Image** : Multi-stage alpine (builder + runtime avec tini)
- **Network** : `admin_proxy` (172.100.10.70)
- **Volume** : `api_byan-data` pour persistence SQLite
- **Traefik** : `byan-api.stark.a3n.fr` (HTTPS)

---

## Quick Start

```bash
# 1. Enregistrer (1er utilisateur = admin)
curl -s -X POST http://localhost:3737/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"yan","password":"secret"}' | jq .

# 2. Stocker le token
TOKEN=$(curl -s -X POST http://localhost:3737/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"yan","password":"secret"}' | jq -r .token)

# 3. Creer un projet
curl -s -X POST http://localhost:3737/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Mon Projet","type":"dev"}' | jq .

# 4. Creer un epic
curl -s -X POST http://localhost:3737/api/nodes \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<id>","parentId":"<root_node_id>","nodeType":"epic","name":"Auth Epic"}' | jq .

# 5. Resoudre le contexte (le money shot)
curl -s http://localhost:3737/api/nodes/<node-id>/context | jq .

# 6. Stocker une memoire
curl -s -X POST http://localhost:3737/api/memory \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"User prefers strict TypeScript","cliSource":"copilot","projectId":"<id>"}' | jq .
```
