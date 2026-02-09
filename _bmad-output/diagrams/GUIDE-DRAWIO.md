# Guide d'utilisation de l'Agent Draw.io

## Configuration MCP

Le serveur MCP draw.io est configuré et prêt à l'emploi.

### Configuration actuelle

**Fichier:** `~/.copilot/mcp-config.json`
```json
{
  "mcpServers": {
    "drawio": {
      "transport": {
        "type": "http",
        "url": "http://localhost:3000/mcp"
      }
    }
  }
}
```

## Utilisation

### 1. Démarrer le serveur MCP draw.io

Dans un terminal séparé :
```bash
npx -y drawio-mcp-server --transport http --http-port 3000
```

Le serveur doit afficher quelque chose comme :
```
Server running on http://localhost:3000
```

### 2. Lancer Copilot CLI avec permissions

```bash
copilot --allow-all-urls
```

**Important:** Le flag `--allow-all-urls` est OBLIGATOIRE pour permettre la communication avec le serveur MCP.

### 3. Invoquer l'agent Draw.io

Dans la session Copilot :

**Option A - Via /agent :**
```
/agent
```
Puis sélectionner `bmad-agent-drawio` dans la liste

**Option B - Invocation directe :**
```bash
copilot --agent=bmad-agent-drawio --allow-all-urls
```

**Option C - Mention dans le prompt :**
```
@bmad-agent-drawio crée-moi un diagramme d'architecture
```

### 4. Utiliser le menu

L'agent affichera un menu avec 10 options :

1. **[ARCHITECTURE]** - Diagrammes d'architecture système
2. **[DATA]** - Diagrammes de données (ERD, MCD)
3. **[UML]** - Diagrammes UML (Class, Sequence, etc.)
4. **[BUSINESS]** - Diagrammes métier (BPMN, Workflow)
5. **[INFRA]** - Diagrammes infrastructure (Network, Cloud)
6. **[MERISE]** - Modèles Merise (MCD, MCT, MLD, MPD)
7. **[UPDATE]** - Modifier un diagramme existant
8. **[EXPORT]** - Exporter en PNG/SVG/PDF
9. **[HELP]** - Aide et bonnes pratiques
10. **[EXIT]** - Quitter

## Types de diagrammes disponibles

### Architecture
- C4 Model (Context, Container, Component, Code)
- Layered Architecture (Presentation, Business, Data)
- Microservices avec API Gateway
- Event-Driven Architecture
- Hexagonal Architecture

### Data Flow
- ERD (Entity Relationship Diagram)
- MCD (Modèle Conceptuel de Données) Merise
- Data Pipeline avec transformations
- Integration Flow entre systèmes

### UML
- Class Diagram (classes, relations)
- Sequence Diagram (interactions)
- Activity Diagram (flux de travail)
- State Diagram (transitions d'états)
- Use Case Diagram (cas d'usage)

### Business
- BPMN 2.0 (processus métier)
- Workflow (flux de tâches)
- Process Flow (étapes)
- Swimlane (responsabilités)
- Value Stream Mapping

### Infrastructure
- Network Topology
- Deployment Diagram
- Cloud Architecture (AWS, Azure, GCP)
- CI/CD Pipeline
- Security Architecture

### Merise
- MCD (Modèle Conceptuel de Données)
- MCT (Modèle Conceptuel de Traitements)
- MLD (Modèle Logique de Données)
- MPD (Modèle Physique de Données)

## Sortie des diagrammes

**Dossier:** `_byan-output/diagrams/`

**Convention de nommage:**
```
{type}-{name}-YYYY-MM-DD.drawio
```

**Exemples:**
- `architecture-api-gateway-2026-02-04.drawio`
- `mcd-ecommerce-2026-02-04.drawio`
- `sequence-user-login-2026-02-04.drawio`

## Troubleshooting

### Serveur MCP ne répond pas

**Problème:** `curl http://localhost:3000/status` échoue

**Solutions:**
1. Vérifier que le serveur tourne : `ps aux | grep drawio`
2. Redémarrer le serveur : `npx -y drawio-mcp-server --transport http --http-port 3000`
3. Vérifier que le port 3000 est libre : `lsof -i :3000`

### Agent non détecté

**Problème:** L'agent n'apparaît pas dans `/agent`

**Solutions:**
1. Vérifier le fichier stub : `cat .github/agents/bmad-agent-drawio.md`
2. Vérifier le YAML frontmatter (doit avoir `name: "bmad-agent-drawio"`)
3. Relancer Copilot CLI

### Erreur de permission MCP

**Problème:** Communication MCP échoue

**Solutions:**
1. Toujours lancer avec : `copilot --allow-all-urls`
2. Vérifier la config MCP : `cat ~/.copilot/mcp-config.json`
3. Tester l'endpoint : `curl http://localhost:3000/mcp`

### Diagramme non sauvegardé

**Problème:** Fichier .drawio non créé

**Solutions:**
1. Vérifier le dossier existe : `ls -la _byan-output/diagrams/`
2. Créer si nécessaire : `mkdir -p _byan-output/diagrams`
3. Vérifier les permissions d'écriture

## Bonnes pratiques

### Design
- **Clarté d'abord:** Diagramme compréhensible au premier coup d'œil
- **Simplicité:** Éliminer le superflu (Ockham's Razor)
- **Cohérence:** Style uniforme
- **Légende:** Toujours présente si > 2 couleurs

### Couleurs sémantiques
- 🔵 Bleu : Composants principaux
- 🟢 Vert : Services/APIs externes
- 🟡 Jaune : Attention/Points critiques
- 🔴 Rouge : Erreurs/Risques
- ⚪ Gris : Infrastructure/Support

### Documentation
- Committer les fichiers .drawio dans Git
- Exporter PNG pour issues/PRs
- Créer un README.md dans `diagrams/`
- Mettre à jour avec le code

## Exemples d'utilisation

### Exemple 1 : Architecture d'API

```
@bmad-agent-drawio

Je veux créer un diagramme d'architecture pour une API REST avec :
- Gateway API
- Service d'authentification
- Service métier
- Base de données
- Cache Redis
```

### Exemple 2 : MCD Merise

```
@bmad-agent-drawio

Crée un MCD pour un système e-commerce avec :
- Clients
- Commandes
- Produits
- Catégories
- Paiements
```

### Exemple 3 : Sequence Diagram

```
@bmad-agent-drawio

Génère un diagramme de séquence pour le login utilisateur :
1. User → Frontend : Entre credentials
2. Frontend → API : POST /login
3. API → Database : Vérifie credentials
4. API → JWT Service : Génère token
5. API → Frontend : Retourne token
```

## Support

Pour toute question ou problème, consulter la documentation BMAD :
- Guide principal : `/home/yan/conception/GUIDE-UTILISATION.md`
- Configuration MCP : `~/.copilot/mcp-config.json`
- Agent complet : `_byan/bmb/agents/drawio.md`

---

**Version:** 1.0.0  
**Date:** 2026-02-04  
**Module:** BMB (Builder)
