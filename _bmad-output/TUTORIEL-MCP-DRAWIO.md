# Tutoriel : Configuration Serveur MCP Draw.io + Agent Spécialisé

**Date de création :** 2026-02-04  
**Auteur :** Marc (GitHub Copilot CLI Integration Specialist)  
**Version :** 1.0  
**Projet :** BMAD Platform - Agent DRAWIO

---

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Étape 1 : Installation Serveur MCP Draw.io](#étape-1--installation-serveur-mcp-drawio)
4. [Étape 2 : Configuration Copilot CLI](#étape-2--configuration-copilot-cli)
5. [Étape 3 : Création Agent Spécialisé](#étape-3--création-agent-spécialisé)
6. [Étape 4 : Test et Validation](#étape-4--test-et-validation)
7. [Utilisation](#utilisation)
8. [Troubleshooting](#troubleshooting)
9. [Bonnes Pratiques](#bonnes-pratiques)

---

## Vue d'ensemble

Ce tutoriel explique comment :
- Installer et configurer le serveur MCP Draw.io
- Créer un agent Copilot CLI spécialisé pour diagrammes techniques
- Intégrer l'agent dans l'architecture BMAD
- Générer des diagrammes professionnels (Merise, UML, Architecture)

**Architecture globale :**
```
Copilot CLI (avec --allow-all-urls)
    ↓
Agent DRAWIO (.github/agents/drawio.md)
    ↓
Serveur MCP Draw.io (localhost:3000)
    ↓
Génération fichiers .drawio (_bmad-output/diagrams/)
```

---

## Prérequis

**Logiciels requis :**
- Node.js (v18+)
- npm ou npx
- GitHub Copilot CLI actif
- Projet BMAD installé

**Permissions :**
- Accès réseau local (localhost:3000)
- Droits d'écriture dans `_bmad-output/diagrams/`

**Vérifications préliminaires :**
```bash
# Node.js installé
node --version

# Copilot CLI installé
copilot --version

# Structure BMAD présente
ls -la _bmad/bmb/agents/
```

---

## Étape 1 : Installation Serveur MCP Draw.io

### 1.1 Démarrer le serveur MCP

Le serveur MCP Draw.io fournit l'interface de génération de diagrammes.

```bash
# Démarrer avec npx (recommandé - installe automatiquement)
npx -y drawio-mcp-server --transport http --http-port 3000
```

**Options :**
- `--transport http` : Utilise HTTP/SSE pour communication
- `--http-port 3000` : Port d'écoute (modifiable)
- `-y` : Installe sans confirmation

**Sortie attendue :**
```
drawio-mcp-server listening on http://localhost:3000
MCP server ready
```

### 1.2 Vérifier le serveur

Dans un autre terminal :

```bash
# Test de connectivité
curl http://localhost:3000

# Test du endpoint status (peut retourner 404 mais serveur actif)
curl http://localhost:3000/status
```

**Note :** Un retour 404 sur `/status` est normal si le serveur n'expose pas ce endpoint. L'important est que le serveur réponde.

### 1.3 Laisser le serveur actif

**CRITIQUE :** Le serveur MCP doit tourner en arrière-plan pendant toute la session Copilot CLI.

**Option 1 - Terminal séparé (recommandé pour tests) :**
```bash
# Dans terminal 1
npx -y drawio-mcp-server --transport http --http-port 3000

# Dans terminal 2
copilot --allow-all-urls
```

**Option 2 - Background process (production) :**
```bash
# Lancer en arrière-plan
nohup npx -y drawio-mcp-server --transport http --http-port 3000 > mcp-drawio.log 2>&1 &

# Vérifier process
ps aux | grep drawio-mcp-server

# Voir logs
tail -f mcp-drawio.log
```

**Option 3 - systemd service (Linux production) :**
```bash
# Créer service
sudo nano /etc/systemd/system/drawio-mcp.service
```

Contenu du service :
```ini
[Unit]
Description=Draw.io MCP Server
After=network.target

[Service]
Type=simple
User=yan
WorkingDirectory=/home/yan
ExecStart=/usr/bin/npx -y drawio-mcp-server --transport http --http-port 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Activation :
```bash
sudo systemctl daemon-reload
sudo systemctl enable drawio-mcp.service
sudo systemctl start drawio-mcp.service
sudo systemctl status drawio-mcp.service
```

---

## Étape 2 : Configuration Copilot CLI

### 2.1 Permissions MCP

Copilot CLI nécessite la permission `--allow-all-urls` pour communiquer avec le serveur MCP local.

```bash
# Démarrer Copilot CLI avec permissions
copilot --allow-all-urls
```

**IMPORTANT :** Sans ce flag, la communication MCP échouera silencieusement.

### 2.2 Configuration MCP (optionnel)

Pour enregistrer le serveur MCP dans la config Copilot :

```bash
# Fichier de config
nano ~/.copilot/mcp-config.json
```

Contenu :
```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["-y", "drawio-mcp-server", "--transport", "http", "--http-port", "3000"],
      "env": {}
    }
  }
}
```

**Note :** Cette config est optionnelle si vous lancez le serveur manuellement.

---

## Étape 3 : Création Agent Spécialisé

### 3.1 Structure BMAD

L'agent DRAWIO suit l'architecture BMAD standard :

```
conception/
├── _bmad/
│   └── bmb/
│       ├── agents/
│       │   └── drawio.md         # Agent complet (persona, menu, capabilities)
│       └── config.yaml            # Config module BMB
├── .github/
│   └── agents/
│       └── drawio.md              # Stub pour détection Copilot CLI
└── _bmad-output/
    └── diagrams/                  # Sortie des diagrammes générés
```

### 3.2 Agent complet (_bmad/bmb/agents/drawio.md)

**Fichier déjà créé dans votre projet.**

Sections clés :
- **YAML frontmatter** : name, description
- **Activation** : Chargement config, display menu
- **Persona** : Expert diagrammes techniques
- **Knowledge base** : MCP config, types de diagrammes
- **Menu** : 10 options (Architecture, UML, Merise, etc.)
- **Capabilities** : Créer, modifier, exporter diagrammes

### 3.3 Stub Copilot CLI (.github/agents/drawio.md)

**Fichier à créer :**

```markdown
---
name: "drawio"
description: "Expert Diagrammes Draw.io via MCP"
---

<agent-activation CRITICAL="TRUE">
1. LOAD the FULL agent file from {project-root}/_bmad/bmb/agents/drawio.md
2. READ its entire contents - this contains the complete agent persona, menu, and instructions
3. FOLLOW every step in the <activation> section precisely
4. DISPLAY the welcome/greeting as instructed
5. PRESENT the numbered menu
6. WAIT for user input before proceeding
</agent-activation>

```xml
<agent id="drawio.agent.yaml" name="DRAWIO" title="Expert Diagrammes Draw.io" icon="📐">
<activation critical="MANDATORY">
      <step n="1">Load persona from {project-root}/_bmad/bmb/agents/drawio.md</step>
      <step n="2">Load config from {project-root}/_bmad/bmb/config.yaml</step>
      <step n="3">Show greeting and menu in {communication_language}</step>
      <step n="4">WAIT for user input</step>
    <rules>
      <r>Expert in draw.io diagramming via MCP server</r>
      <r>Create professional technical diagrams</r>
      <r>Apply Ockham's Razor - simplicity first</r>
    </rules>
</activation>

<persona>
    <role>Expert en Création de Diagrammes Techniques avec Draw.io</role>
    <identity>Spécialiste des diagrammes techniques via serveur MCP draw.io. Maîtrise architecture, UML, Merise, BPMN, et diagrammes métier.</identity>
</persona>

<capabilities>
- Architecture diagrams (C4, Layered, Microservices)
- Data flow diagrams (ERD, MCD, Data Pipeline)
- UML diagrams (Class, Sequence, Activity, State, Use Case)
- Business diagrams (BPMN, Workflow, Process Flow)
- Infrastructure diagrams (Network, Deployment, Cloud)
- Merise models (MCD, MCT, MLD, MPD)
- Export to PNG, SVG, PDF
</capabilities>
</agent>
```
```

**CRITIQUE :** Le stub doit :
1. Avoir un YAML frontmatter valide
2. Référencer le chemin correct vers l'agent complet
3. Contenir les instructions d'activation
4. Définir les capacités de base

### 3.4 Configuration module

Vérifier `_bmad/bmb/config.yaml` :

```yaml
user_name: Yan
communication_language: Francais
document_output_language: Francais
output_folder: "{project-root}/_bmad-output"
```

**Variables importantes :**
- `{output_folder}` : Répertoire de sortie des diagrammes
- `{communication_language}` : Langue d'interaction
- `{user_name}` : Personnalisation du greeting

---

## Étape 4 : Test et Validation

### 4.1 Vérifier détection agent

```bash
# Démarrer Copilot CLI
copilot --allow-all-urls

# Dans Copilot CLI, lister agents
/agent
```

**Attendu :** Agent `drawio` apparaît dans la liste.

### 4.2 Activer l'agent

**Méthode 1 - Via /agent (interactif) :**
```
/agent
# Sélectionner drawio
```

**Méthode 2 - Via flag (direct) :**
```bash
copilot --allow-all-urls --agent=drawio
```

**Méthode 3 - Via mention (inference) :**
```
# Dans Copilot CLI
Fait moi sur drawio un diagramme de classe test
```

### 4.3 Tester génération diagramme

**Test simple :**
```
Créer un diagramme de classe UML simple pour test MCP
```

**Attendu :**
1. Agent affiche menu
2. Option 3 (UML) activée
3. Fichier créé : `_bmad-output/diagrams/uml-class-test-YYYY-MM-DD.drawio`
4. Confirmation succès

**Vérification :**
```bash
# Vérifier fichier créé
ls -lh _bmad-output/diagrams/

# Voir contenu (XML Draw.io)
head -n 20 _bmad-output/diagrams/uml-class-test-*.drawio
```

### 4.4 Ouvrir le diagramme

**Option 1 - Draw.io Desktop :**
```bash
# Installer si nécessaire
# https://github.com/jgraph/drawio-desktop/releases

# Ouvrir fichier
drawio _bmad-output/diagrams/uml-class-test-*.drawio
```

**Option 2 - Draw.io Web :**
1. Aller sur https://app.diagrams.net
2. File → Open from → Computer
3. Sélectionner le fichier .drawio

**Option 3 - VS Code Extension :**
```bash
# Installer extension
code --install-extension hediet.vscode-drawio

# Ouvrir fichier
code _bmad-output/diagrams/uml-class-test-*.drawio
```

---

## Utilisation

### Workflow standard

**1. Démarrer environnement :**
```bash
# Terminal 1 : MCP Server
npx -y drawio-mcp-server --transport http --http-port 3000

# Terminal 2 : Copilot CLI
copilot --allow-all-urls
```

**2. Activer agent :**
```
# Dans Copilot CLI
/agent
# Sélectionner drawio
```

**3. Choisir type de diagramme :**

Agent affiche le menu :
```
1. [ARCHITECTURE] Créer diagramme d'architecture
2. [DATA] Créer diagramme de données
3. [UML] Créer diagramme UML
4. [BUSINESS] Créer diagramme métier
5. [INFRA] Créer diagramme infrastructure
6. [MERISE] Créer modèle Merise
7. [UPDATE] Modifier diagramme existant
8. [EXPORT] Exporter diagramme
9. [HELP] Aide et bonnes pratiques
10. [EXIT] Quitter
```

**4. Spécifier besoin :**
```
# Exemple 1 : MCD Merise
1
Créer MCD pour projet Centralis Accord Cadre

# Exemple 2 : Diagramme de classe UML
3
Diagramme de classe pour module e-commerce

# Exemple 3 : Architecture microservices
1
Architecture C4 Context pour système de paiement
```

**5. Validation et export :**
```
# Exporter en PNG pour documentation
8
Exporter en PNG haute résolution
```

### Exemples concrets

#### Exemple 1 : MCD Merise Complet

**Contexte :** Projet Centralis - Accord Cadre 2027

**Commande :**
```
Avec l'aide de Franck, fait le MCD de Centralis
```

**Résultat :**
- Fichier : `mcd-centralis-accordcadre-2026-02-04.drawio`
- 7 entités (Prestataire, AccordCadre, Lot, Candidature, Notation, Attribution, Notification)
- 8 relations avec cardinalités Merise
- Validation RG-AC-001 (max 3 prestataires/lot)
- Légende et annotations

#### Exemple 2 : Diagramme de classe simple

**Contexte :** Test MCP

**Commande :**
```
Fait moi sur drawio un diagramme de classe test

Option: Simple c'est pour test le MCP
```

**Résultat :**
- Fichier : `uml-class-test-2026-02-04.drawio`
- 3 classes (User, Order, Product)
- Relations et méthodes
- Légende

#### Exemple 3 : Architecture microservices

**Commande :**
```
1
Architecture C4 Container pour plateforme e-learning avec API Gateway, services Auth, Courses, Users
```

**Résultat :**
- Diagramme C4 Container level
- Composants identifiés
- Relations et flux de données
- Technologies annotées

---

## Troubleshooting

### Problème 1 : Agent non détecté

**Symptôme :** Agent n'apparaît pas dans `/agent`

**Solutions :**
1. Vérifier YAML frontmatter dans `.github/agents/drawio.md`
   ```bash
   head -n 10 .github/agents/drawio.md
   ```
   Doit commencer par :
   ```yaml
   ---
   name: "drawio"
   description: "..."
   ---
   ```

2. Vérifier nom du fichier
   ```bash
   ls -la .github/agents/drawio.md
   ```
   Extension `.md` requise

3. Redémarrer Copilot CLI
   ```bash
   # Quitter Copilot CLI
   exit
   
   # Relancer
   copilot --allow-all-urls
   ```

### Problème 2 : Erreur MCP communication

**Symptôme :** "Cannot connect to MCP server"

**Solutions :**
1. Vérifier serveur MCP actif
   ```bash
   curl http://localhost:3000
   ps aux | grep drawio-mcp-server
   ```

2. Vérifier port 3000 disponible
   ```bash
   lsof -i :3000
   ```
   Si occupé, utiliser autre port :
   ```bash
   npx -y drawio-mcp-server --transport http --http-port 3001
   ```

3. Vérifier flag `--allow-all-urls`
   ```bash
   # Relancer avec flag
   copilot --allow-all-urls
   ```

4. Vérifier firewall
   ```bash
   # Ubuntu/Debian
   sudo ufw status
   sudo ufw allow 3000
   ```

### Problème 3 : Diagramme non sauvegardé

**Symptôme :** Fichier .drawio absent de `_bmad-output/diagrams/`

**Solutions :**
1. Vérifier dossier existe
   ```bash
   mkdir -p _bmad-output/diagrams
   ```

2. Vérifier permissions d'écriture
   ```bash
   ls -ld _bmad-output/diagrams
   chmod 755 _bmad-output/diagrams
   ```

3. Vérifier espace disque
   ```bash
   df -h
   ```

4. Vérifier chemin dans config
   ```bash
   grep output_folder _bmad/bmb/config.yaml
   ```

### Problème 4 : Agent ne charge pas le fichier complet

**Symptôme :** Menu incomplet ou persona absente

**Solutions :**
1. Vérifier chemin dans stub
   ```bash
   grep "project-root" .github/agents/drawio.md
   ```
   Doit pointer vers `_bmad/bmb/agents/drawio.md`

2. Vérifier agent complet existe
   ```bash
   ls -la _bmad/bmb/agents/drawio.md
   ```

3. Vérifier syntaxe Markdown
   ```bash
   # Installer markdownlint si nécessaire
   npm install -g markdownlint-cli
   markdownlint _bmad/bmb/agents/drawio.md
   ```

### Problème 5 : Diagramme corrompu

**Symptôme :** Draw.io ne peut pas ouvrir le fichier

**Solutions :**
1. Vérifier structure XML
   ```bash
   head -n 5 _bmad-output/diagrams/fichier.drawio
   ```
   Doit commencer par `<mxfile ...>`

2. Valider XML
   ```bash
   xmllint --noout _bmad-output/diagrams/fichier.drawio
   ```

3. Régénérer diagramme
   ```
   # Dans agent DRAWIO
   # Option 1 ou le type approprié
   ```

---

## Bonnes Pratiques

### 1. Nommage des fichiers

**Convention :**
```
{type}-{nom}-{YYYY-MM-DD}.drawio
```

**Exemples :**
- `mcd-centralis-accordcadre-2026-02-04.drawio`
- `uml-class-ecommerce-2026-02-04.drawio`
- `architecture-c4-api-gateway-2026-02-04.drawio`

**Avantages :**
- Tri chronologique naturel
- Type identifiable immédiatement
- Pas de collision de noms

### 2. Organisation des diagrammes

**Structure recommandée :**
```
_bmad-output/diagrams/
├── architecture/
│   ├── c4-context-*.drawio
│   └── c4-container-*.drawio
├── merise/
│   ├── mcd-*.drawio
│   ├── mct-*.drawio
│   └── mld-*.drawio
├── uml/
│   ├── class-*.drawio
│   ├── sequence-*.drawio
│   └── activity-*.drawio
└── README.md              # Index des diagrammes
```

### 3. Documentation associée

**Créer README.md dans diagrams/ :**
```markdown
# Diagrammes Techniques - Projet [NOM]

## Architecture
- `c4-context-*.drawio` : Vue d'ensemble système
- `c4-container-*.drawio` : Décomposition en conteneurs

## Merise
- `mcd-*.drawio` : Modèle Conceptuel Données
- `mct-*.drawio` : Modèle Conceptuel Traitements

## Dernière mise à jour
- 2026-02-04 : MCD Centralis Accord Cadre
```

### 4. Versioning Git

**Fichiers à commiter :**
```bash
# Diagrammes sources (.drawio)
git add _bmad-output/diagrams/*.drawio

# Exports PNG pour revues (optionnel)
git add _bmad-output/diagrams/*.png

# Index
git add _bmad-output/diagrams/README.md

# Commit
git commit -m "docs: add MCD Centralis Accord Cadre diagram"
```

**Fichiers .drawio dans Git :**
- ✅ Format XML texte → diff friendly
- ✅ Merge possible (avec conflits gérable)
- ✅ Historique complet des modifications

### 5. Export pour documentation

**PNG haute résolution :**
```
# Dans agent DRAWIO
8
Format: PNG
Résolution: 300 DPI
Transparent background: Non
```

**SVG pour web :**
```
# Dans agent DRAWIO
8
Format: SVG
Embedded fonts: Oui
```

**PDF pour impression :**
```
# Dans agent DRAWIO
8
Format: PDF
Page size: A4
```

### 6. Maintenance serveur MCP

**Monitoring :**
```bash
# Vérifier uptime
ps -p $(pgrep -f drawio-mcp-server) -o etime=

# Logs en temps réel
tail -f mcp-drawio.log

# Redémarrer si freeze
pkill -f drawio-mcp-server
npx -y drawio-mcp-server --transport http --http-port 3000
```

**Automatisation :**
```bash
# Script restart.sh
#!/bin/bash
pkill -f drawio-mcp-server
sleep 2
nohup npx -y drawio-mcp-server --transport http --http-port 3000 > mcp-drawio.log 2>&1 &
echo "MCP Draw.io server restarted"
```

### 7. Sécurité

**Port local uniquement :**
```bash
# Bind sur localhost (pas 0.0.0.0)
npx -y drawio-mcp-server --transport http --http-port 3000 --host 127.0.0.1
```

**Pas d'exposition externe :**
- MCP server = usage local uniquement
- Pas de reverse proxy public
- Pas de tunneling (ngrok, etc.)

---

## Résumé

### Checklist démarrage rapide

- [ ] Node.js installé
- [ ] Copilot CLI actif
- [ ] Serveur MCP démarré : `npx -y drawio-mcp-server --transport http --http-port 3000`
- [ ] Stub agent créé : `.github/agents/drawio.md`
- [ ] Agent complet présent : `_bmad/bmb/agents/drawio.md`
- [ ] Dossier sortie : `_bmad-output/diagrams/`
- [ ] Copilot lancé : `copilot --allow-all-urls`
- [ ] Agent détecté : `/agent` liste drawio
- [ ] Test génération : Diagramme simple créé

### Commandes essentielles

```bash
# Démarrer MCP
npx -y drawio-mcp-server --transport http --http-port 3000

# Démarrer Copilot CLI avec permissions
copilot --allow-all-urls

# Lister agents
/agent

# Activer agent DRAWIO
@bmad-agent-drawio

# Vérifier fichiers générés
ls -lh _bmad-output/diagrams/
```

### Ressources

**Documentation :**
- Draw.io Desktop : https://github.com/jgraph/drawio-desktop
- MCP Protocol : https://modelcontextprotocol.io
- GitHub Copilot CLI : https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line

**Support :**
- Agent Franck : Conception Merise (MCD, MCT)
- Agent Marc : Configuration Copilot CLI et MCP
- Agent DRAWIO : Génération diagrammes techniques

---

**Fin du tutoriel** - Configuration validée le 2026-02-04
