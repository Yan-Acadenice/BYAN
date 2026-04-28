# 🚀 Guide d'Installation BYAN - Pour Vrais Débutants

**Version:** 1.1.1  
**Date:** 2026-02-03  
**Cible:** Utilisateurs débutants (Windows + Linux)

> 💡 **Promesse**: En 15 minutes, vous aurez les 6 agents BYAN opérationnels dans GitHub Copilot CLI ou Claude Code.

---

## 📋 Table des Matières

1. [C'est quoi BYAN ?](#1-cest-quoi-byan)
2. [Les 6 Agents BYAN](#2-les-6-agents-byan)
3. [Installation GitHub Copilot CLI](#3-installation-github-copilot-cli)
4. [Installation Claude Code](#4-installation-claude-code)
5. [Cas d'Usage Typiques](#5-cas-dusage-typiques)
6. [FAQ](#6-faq)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. C'est quoi BYAN ?

**BYAN** = **B**uilder of **YAN** (Agent Creator)

C'est un **écosystème de 6 agents IA spécialisés** qui vous aident à :
- ✅ Créer vos propres agents IA (BYAN, BYAN-Test)
- ✅ Les publier sur npm (Rachid)
- ✅ Les intégrer dans GitHub Copilot CLI (Marc)
- ✅ Les mettre à jour sans casser vos customisations (Patnote)
- ✅ Les optimiser pour réduire les coûts tokens (Carmack)

**Philosophie :** Merise Agile + TDD + 64 Mantras appliqués systématiquement.

---

## 2. Les 6 Agents BYAN

| Agent | Icon | Spécialisation | Quand l'utiliser ? | Commande |
|-------|------|----------------|-------------------|----------|
| **BYAN** | 🏗️ | Créateur d'agents (standard) | Vous créez votre premier agent ou un agent critique | `/agent byan` |
| **BYAN-Test** | ⚡ | Créateur optimisé (-46% tokens) | Même chose que BYAN mais plus rapide et moins cher | `/agent byan-test` |
| **Marc** | 🤖 | Expert GitHub Copilot CLI | Vous avez un problème de détection d'agent dans Copilot | `/agent marc` |
| **Rachid** | 📦 | Spécialiste NPM/NPX | Vous voulez publier votre agent sur npm | `/agent rachid` |
| **Patnote** | 🛡️ | Gestionnaire de mises à jour | Vous mettez à jour BYAN sans perdre vos customisations | `/agent patnote` |
| **Carmack** | ⚡ | Optimiseur de tokens | Votre agent consomme trop de tokens, vous voulez réduire les coûts | `/agent carmack` |

---

## 3. Installation GitHub Copilot CLI

### 🎯 Prérequis

**C'est quoi GitHub CLI ?**  
C'est un outil en ligne de commande pour interagir avec GitHub. Pensez-y comme une "télécommande GitHub" depuis votre terminal.

**C'est quoi GitHub Copilot CLI Extension ?**  
C'est une extension qui ajoute des agents IA intelligents à votre terminal pour vous aider à coder.

#### ✅ Vérifiez si vous avez déjà GitHub CLI

**Windows (PowerShell) :**
```powershell
gh --version
```

**Linux / macOS (Bash) :**
```bash
gh --version
```

**✅ Ce que vous devriez voir :**
```
gh version 2.40.0 (ou supérieur)
```

**❌ Si vous voyez une erreur, installez GitHub CLI :**

**Windows :**
```powershell
# Option 1 : Via winget (recommandé)
winget install --id GitHub.cli

# Option 2 : Télécharger depuis https://cli.github.com/
```

**Linux (Ubuntu/Debian) :**
```bash
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

**Linux (Fedora/CentOS) :**
```bash
sudo dnf install gh
```

**macOS :**
```bash
brew install gh
```

---

### 🔐 Authentification GitHub

**Windows + Linux :**
```bash
gh auth login
```

**Suivez les instructions interactives :**
1. Choisissez : `GitHub.com`
2. Protocole : `HTTPS` (recommandé pour débutants)
3. Authentification : `Login with a web browser`
4. Copiez le code affiché
5. Appuyez sur Enter → Navigateur s'ouvre → Collez le code → Confirmez

**✅ Validation :**
```bash
gh auth status
```

Vous devriez voir : `✓ Logged in to github.com as <votre-username>`

---

### 🤖 Installation Extension GitHub Copilot

**Windows + Linux :**
```bash
gh extension install github/gh-copilot
```

**✅ Validation :**
```bash
gh copilot --version
```

Vous devriez voir : `gh-copilot 1.0.0` (ou supérieur)

---

### 📦 Installation des Agents BYAN

**Étape 1 : Installer via NPX**

**Windows (PowerShell) :**
```powershell
cd $HOME
npx create-byan-agent@1.1.1
```

**Linux / macOS (Bash) :**
```bash
cd ~
npx create-byan-agent@1.1.1
```

**Ce qui va se passer :**
1. Le script va vous poser des questions :
   - **Nom d'utilisateur ?** → Tapez votre prénom (ex: `Yan`)
   - **Langue de communication ?** → Tapez `Francais` ou `English`
   - **Dossier de sortie ?** → Laissez par défaut (Entrée)

2. Le script va créer :
   - `_byan/` → Agents et workflows
   - `.github/agents/` → Agents pour Copilot CLI
   - `_byan-output/` → Sorties générées

**⏱️ Temps estimé :** 2-3 minutes

---

### 🧪 Test de Validation

**Étape 1 : Vérifiez que les fichiers sont créés**

**Windows :**
```powershell
ls .github/agents/
```

**Linux :**
```bash
ls -la .github/agents/
```

**✅ Vous devriez voir 29 fichiers dont :**
- `bmad-agent-byan.md`
- `bmad-agent-byan-test.md`
- `bmad-agent-marc.md`
- `bmad-agent-rachid.md`
- `bmad-agent-patnote.md`
- `bmad-agent-carmack.md`

---

**Étape 2 : Lancez Copilot CLI**

**Windows + Linux :**
```bash
gh copilot
```

Vous êtes maintenant dans le mode interactif de Copilot !

---

**Étape 3 : Testez la détection des agents**

Dans le terminal Copilot, tapez :
```
/agent
```

**✅ Ce que vous devriez voir :**
Une liste d'agents incluant :
```
- byan (créateur d'agents standard)
- byan-test (créateur optimisé)
- marc (expert Copilot CLI)
- rachid (spécialiste npm)
- patnote (gestionnaire de mises à jour)
- carmack (optimiseur de tokens)
- ... (et 21 autres agents BMAD)
```

---

**Étape 4 : Invoquez un agent**

Tapez (dans Copilot) :
```
@byan
```

Ou sortez de Copilot (Ctrl+C) et tapez :
```bash
gh copilot --agent=byan
```

**✅ Vous devriez voir :**
Le menu de BYAN s'affiche avec :
```
BYAN - Builder of YAN
Menu:
1. [INT] Start Intelligent Interview
2. [QC] Quick Create
3. [LA] List all agents
...
```

🎉 **Félicitations ! Les agents BYAN sont opérationnels !**

---

## 4. Installation Claude Code

### 🎯 Prérequis

**C'est quoi Claude Code ?**  
C'est l'éditeur de code IA d'Anthropic basé sur Claude. Il supporte les agents via le protocole MCP (Model Context Protocol).

**Installation de Claude Code :**
1. Allez sur https://claude.ai/
2. Téléchargez Claude Desktop
3. Installez-le

---

### 📁 Configuration MCP

**Étape 1 : Créez le fichier de configuration MCP**

**Windows :**
```powershell
# Créez le dossier de config
mkdir $env:APPDATA\Claude\

# Créez le fichier claude_desktop_config.json
notepad $env:APPDATA\Claude\claude_desktop_config.json
```

**Linux / macOS :**
```bash
# Créez le dossier de config
mkdir -p ~/.config/Claude/

# Créez le fichier claude_desktop_config.json
nano ~/.config/Claude/claude_desktop_config.json
```

---

**Étape 2 : Ajoutez la configuration suivante**

Copiez-collez ce JSON dans le fichier :

```json
{
  "mcpServers": {
    "byan-agents": {
      "command": "node",
      "args": ["/chemin/vers/votre/projet/_byan/mcp-server.js"],
      "env": {
        "BMAD_ROOT": "/chemin/vers/votre/projet/_byan"
      }
    }
  }
}
```

**⚠️ Remplacez `/chemin/vers/votre/projet/` par le vrai chemin :**

**Windows exemple :**
```json
"args": ["C:\\Users\\Yan\\conception\\_byan\\mcp-server.js"],
"env": {
  "BMAD_ROOT": "C:\\Users\\Yan\\conception\\_byan"
}
```

**Linux exemple :**
```json
"args": ["/home/yan/conception/_byan/mcp-server.js"],
"env": {
  "BMAD_ROOT": "/home/yan/conception/_byan"
}
```

---

**Étape 3 : Créez le script MCP serveur**

**Créez le fichier `_byan/mcp-server.js` :**

**Windows :**
```powershell
cd $HOME\conception\_byan
notepad mcp-server.js
```

**Linux :**
```bash
cd ~/conception/_byan
nano mcp-server.js
```

**Collez ce code :**

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BMAD_ROOT = process.env.BMAD_ROOT || process.cwd();

// Liste tous les agents BYAN
function listByanAgents() {
  const agents = [];
  const byanAgents = ['byan', 'byan-test', 'marc', 'rachid', 'patnote', 'carmack'];
  
  byanAgents.forEach(agentName => {
    const agentPath = path.join(BMAD_ROOT, 'bmb', 'agents', `${agentName}.md`);
    if (fs.existsSync(agentPath)) {
      agents.push({
        name: agentName,
        path: agentPath,
        content: fs.readFileSync(agentPath, 'utf-8')
      });
    }
  });
  
  return agents;
}

// Démarre le serveur MCP
console.log('BYAN MCP Server started');
console.log(`BMAD_ROOT: ${BMAD_ROOT}`);
console.log(`Agents disponibles: ${listByanAgents().map(a => a.name).join(', ')}`);

process.stdin.on('data', (data) => {
  const request = JSON.parse(data.toString());
  
  if (request.method === 'list_agents') {
    const agents = listByanAgents();
    process.stdout.write(JSON.stringify({ agents }));
  }
});
```

Sauvegardez et fermez.

---

**Étape 4 : Redémarrez Claude Desktop**

Fermez complètement Claude Desktop et relancez-le.

---

### 🧪 Test de Validation

**Dans Claude Desktop, tapez :**
```
@byan
```

**✅ Vous devriez voir :**
Claude reconnaît l'agent BYAN et vous pouvez interagir avec lui.

---

### 🔌 Extensions MCP optionnelles (depuis 2.16.0)

Pendant l'installation, BYAN propose d'activer des MCP servers tiers en plus du serveur byan natif.

**Disponibles aujourd'hui :**

| Extension | Description | Setup |
|-----------|-------------|-------|
| `gdrive` | Google Workspace : Docs, Sheets, Slides, Drive, Gmail, Calendar (95+ tools via `google-workspace-mcp`) | Interactif — guide Google Cloud + OAuth flow |

**Sécurité — où vivent les credentials :**

- Aucune credential n'est écrite dans le repo BYAN ni dans `.mcp.json` (source : [CLAIM L1] code de `install/packages/platform-config/lib/mcp-config.js`, fonction `assertNoSecretInEntry`)
- `~/.google-mcp/credentials.json` (perm 600) — Client OAuth Google
- `~/.google-mcp/tokens/<account>.json` — Tokens d'accès persistés par compte
- `BYAN_API_TOKEN` — vit uniquement dans `.env` (gitignored) + `.claude/settings.local.json` (gitignored)

**Si tu skip l'extension à l'install et veux l'activer plus tard**, relance `npx create-byan-agent` ou ajoute manuellement l'entry suivante à `.mcp.json` :

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "google-workspace-mcp", "serve"]
    }
  }
}
```

Puis exécute le setup interactif du package :

```bash
npx -y google-workspace-mcp setup
npx -y google-workspace-mcp accounts add default
npx -y google-workspace-mcp status   # vérifier que tout est OK
```

---

## 5. Cas d'Usage Typiques

### 🎯 Cas 1 : Créer un Nouvel Agent

**Objectif :** Vous voulez créer un agent spécialisé pour votre projet.

**Avec BYAN (standard) - 30-45 min :**
```bash
gh copilot --agent=byan
# Puis tapez: 1 (Intelligent Interview)
```

**Avec BYAN-Test (optimisé) - 30-45 min :**
```bash
gh copilot --agent=byan-test
# Plus rapide, consomme 46% moins de tokens
```

**Résultat :** Un agent personnalisé dans `_byan-output/bmb-creations/`

---

### 📦 Cas 2 : Publier Votre Agent sur npm

**Objectif :** Partager votre agent avec la communauté.

```bash
gh copilot --agent=rachid
# Puis tapez: 5 (Publish to npm)
```

**Rachid va :**
1. Valider votre package.json
2. Auditer les dépendances (npm audit)
3. Tester l'installation npx
4. Publier sur npm

---

### 🤖 Cas 3 : Résoudre un Problème de Détection

**Objectif :** Vos agents ne sont pas détectés par `/agent`.

```bash
gh copilot --agent=marc
# Puis tapez: 1 (Validate .github/agents/)
```

**Marc va :**
1. Vérifier le YAML frontmatter
2. Tester la détection Copilot CLI
3. Proposer des correctifs

---

### ⚡ Cas 4 : Optimiser un Agent Lourd

**Objectif :** Votre agent consomme trop de tokens = coûts élevés.

```bash
gh copilot --agent=carmack
# Puis tapez: 1 (Optimize agent)
```

**Carmack va :**
1. Analyser l'usage de tokens
2. Réduire de 40-50% sans perte de fonctionnalité
3. Valider que l'agent optimisé fonctionne

---

### 🛡️ Cas 5 : Mettre à Jour BYAN sans Casser Vos Modifs

**Objectif :** Nouvelle version BYAN disponible, mais vous avez customisé des agents.

```bash
gh copilot --agent=patnote
# Puis tapez: 1 (Update agent)
```

**Patnote va :**
1. Détecter vos customisations
2. Faire un backup automatique
3. Merger intelligemment les nouvelles versions
4. Résoudre les conflits

---

## 6. FAQ

### ❓ Q1 : Je vois "command not found: gh"

**Réponse :** GitHub CLI n'est pas installé.

**Solution :**
- **Windows :** `winget install --id GitHub.cli`
- **Linux :** Suivez la section [Prérequis](#-prérequis) ci-dessus

---

### ❓ Q2 : Je vois "extension not installed: copilot"

**Réponse :** L'extension Copilot n'est pas installée.

**Solution :**
```bash
gh extension install github/gh-copilot
```

---

### ❓ Q3 : `/agent` ne liste pas mes agents BYAN

**Réponse :** Les agents ne sont pas dans `.github/agents/` ou le YAML est incorrect.

**Solution :**
1. Vérifiez que `.github/agents/bmad-agent-byan.md` existe
2. Lancez Marc pour validation :
   ```bash
   gh copilot --agent=marc
   # Puis tapez: 1 (Validate)
   ```

---

### ❓ Q4 : L'installation NPX échoue avec "EACCES permission denied"

**Réponse :** Problème de permissions npm (courant sur Linux).

**Solution :**
```bash
# Option 1 : Changer le dossier npm global (recommandé)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 2 : Utiliser npx sans installer globalement
npx create-byan-agent@1.1.1
```

---

### ❓ Q5 : BYAN me demande des infos en anglais alors que j'ai choisi français

**Réponse :** Le fichier `config.yaml` n'a pas été correctement initialisé.

**Solution :**
Éditez `_byan/bmb/config.yaml` :
```yaml
communication_language: Francais
document_output_language: Francais
```

---

### ❓ Q6 : Quelle est la différence entre BYAN et BYAN-Test ?

**Réponse :**
- **BYAN** : Version standard, documentation complète, idéal pour apprendre
- **BYAN-Test** : Version optimisée (-46% tokens), même fonctionnalités, idéal pour production

**Utilisez BYAN-Test si :**
- Vous créez beaucoup d'agents (coûts tokens)
- Vous maîtrisez déjà BYAN
- Vous voulez des réponses plus rapides

---

### ❓ Q7 : Puis-je installer uniquement certains agents BYAN ?

**Réponse :** Non actuellement. L'installation installe les 6 agents + les 21 agents BMAD.

**Pourquoi ?**
- Les agents collaborent entre eux (Marc aide Rachid, etc.)
- La taille totale reste raisonnable (~5 MB)

---

### ❓ Q8 : Comment désinstaller BYAN ?

**Réponse :**
```bash
# Supprimez les dossiers créés
rm -rf _byan/
rm -rf .github/agents/
rm -rf _byan-output/

# Sur Windows :
# rmdir /s _byan
# rmdir /s .github\agents
# rmdir /s _byan-output
```

---

## 7. Troubleshooting

### 🔴 Problème 1 : "gh: command not found"

**Cause :** GitHub CLI n'est pas installé ou pas dans le PATH.

**Solutions :**

**Windows :**
1. Installez via winget :
   ```powershell
   winget install --id GitHub.cli
   ```
2. Redémarrez PowerShell
3. Testez : `gh --version`

**Linux :**
1. Vérifiez si `gh` est installé :
   ```bash
   which gh
   ```
2. Si vide, installez via APT/DNF (voir [Prérequis](#-prérequis))
3. Ajoutez au PATH si nécessaire :
   ```bash
   export PATH=$PATH:/usr/local/bin
   ```

---

### 🔴 Problème 2 : "extension not installed: copilot"

**Cause :** L'extension GitHub Copilot CLI n'est pas installée.

**Solution :**
```bash
gh extension install github/gh-copilot
```

**Si ça échoue :**
```bash
# Vérifiez que vous êtes authentifié
gh auth status

# Si non authentifié :
gh auth login
```

---

### 🔴 Problème 3 : "npx: command not found"

**Cause :** Node.js/npm n'est pas installé.

**Solutions :**

**Windows :**
1. Téléchargez depuis https://nodejs.org/
2. Installez la version LTS (recommandé)
3. Redémarrez PowerShell
4. Testez : `node --version` et `npm --version`

**Linux (Ubuntu/Debian) :**
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Linux (Fedora) :**
```bash
sudo dnf install nodejs npm
```

---

### 🔴 Problème 4 : "Agent not found" dans Copilot CLI

**Cause :** Le fichier agent n'est pas dans `.github/agents/` ou le YAML est mal formaté.

**Diagnostic :**

1. Vérifiez que les fichiers existent :
   ```bash
   ls .github/agents/bmad-agent-*.md
   ```

2. Si les fichiers existent, vérifiez le YAML frontmatter :
   ```bash
   head -n 10 .github/agents/bmad-agent-byan.md
   ```

   **✅ Format correct :**
   ```yaml
   ---
   name: "byan"
   description: "BYAN - Agent Creator"
   ---
   ```

   **❌ Format incorrect :**
   ```yaml
   ---
   name: "bmad-agent-byan"  # ❌ Le préfixe bmad-agent- ne doit PAS être dans name
   ---
   ```

3. Si incorrect, appelez Marc :
   ```bash
   gh copilot --agent=marc
   # Tapez: 2 (Fix YAML frontmatter)
   ```

---

### 🔴 Problème 5 : "Permission denied" lors de l'installation

**Cause :** Permissions npm insuffisantes (courant sur Linux/macOS).

**Solution 1 (Recommandée) : Changer le dossier npm global**
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Solution 2 : Utiliser npx sans installation globale**
```bash
npx create-byan-agent@1.1.1
# npx télécharge et exécute sans installer globalement
```

**Solution 3 (Non recommandée) : Utiliser sudo**
```bash
sudo npm install -g create-byan-agent
# ⚠️ Risques de sécurité, à éviter
```

---

### 🔴 Problème 6 : "Module not found: fs-extra"

**Cause :** Les dépendances npm ne sont pas installées.

**Solution :**
```bash
cd install/
npm install
```

---

### 🔴 Problème 7 : Claude Desktop ne détecte pas les agents

**Cause :** Le fichier `claude_desktop_config.json` est mal configuré.

**Diagnostic :**

1. Vérifiez que le fichier existe :
   
   **Windows :**
   ```powershell
   cat $env:APPDATA\Claude\claude_desktop_config.json
   ```
   
   **Linux/macOS :**
   ```bash
   cat ~/.config/Claude/claude_desktop_config.json
   ```

2. Vérifiez les chemins :
   - `args` doit pointer vers `_byan/mcp-server.js` (chemin absolu)
   - `BMAD_ROOT` doit pointer vers `_byan/` (chemin absolu)

3. Testez le serveur MCP manuellement :
   ```bash
   node _byan/mcp-server.js
   ```
   
   **✅ Vous devriez voir :**
   ```
   BYAN MCP Server started
   BMAD_ROOT: /home/yan/conception/_byan
   Agents disponibles: byan, byan-test, marc, rachid, patnote, carmack
   ```

---

### 🔴 Problème 8 : "Version mismatch" lors de l'update

**Cause :** Vous avez customisé des agents et une nouvelle version BYAN est sortie.

**Solution :**
```bash
gh copilot --agent=patnote
# Tapez: 1 (Update agent)
```

Patnote va :
1. Détecter vos customisations
2. Créer un backup automatique
3. Merger intelligemment les versions
4. Résoudre les conflits

---

### 🔴 Problème 9 : "Rate limit exceeded" sur npm

**Cause :** Trop de requêtes npm (courant en entreprise derrière un proxy).

**Solution 1 : Utiliser un registry npm local/cache**
```bash
npm config set registry https://registry.npmjs.org/
```

**Solution 2 : Attendre et réessayer**
```bash
# Attendez 1 heure et relancez
npx create-byan-agent@1.1.1
```

---

### 🔴 Problème 10 : "YAML parse error" dans Copilot CLI

**Cause :** Le frontmatter YAML d'un agent est mal formaté.

**Diagnostic :**
```bash
gh copilot --agent=marc
# Tapez: 1 (Validate .github/agents/)
```

Marc va identifier tous les agents avec YAML invalide et proposer des corrections.

**Fix manuel :**
Éditez le fichier problématique :
```bash
nano .github/agents/bmad-agent-byan.md
```

Assurez-vous que le frontmatter est :
```yaml
---
name: "byan"
description: "BYAN - Agent Creator"
---
```

---

## 📊 Checklist de Validation Complète

Cochez chaque élément pour valider votre installation :

### Prérequis
- [ ] GitHub CLI installé (`gh --version`)
- [ ] Extension Copilot installée (`gh extension list`)
- [ ] Authentification GitHub OK (`gh auth status`)
- [ ] Node.js installé (`node --version`)
- [ ] npm installé (`npm --version`)

### Installation BYAN
- [ ] NPX exécuté sans erreur (`npx create-byan-agent@1.1.1`)
- [ ] Dossier `_byan/` créé
- [ ] Dossier `.github/agents/` créé avec 27 fichiers
- [ ] Fichier `_byan/bmb/config.yaml` existe

### Tests Fonctionnels
- [ ] `gh copilot` démarre sans erreur
- [ ] `/agent` liste les agents (dont byan, marc, rachid)
- [ ] `@byan` affiche le menu BYAN
- [ ] `@marc` affiche le menu MARC
- [ ] `@rachid` affiche le menu RACHID
- [ ] `@patnote` affiche le menu PATNOTE
- [ ] `@carmack` affiche le menu CARMACK

### Validation des Agents BYAN
- [ ] BYAN répond correctement (test : `/agent byan`)
- [ ] BYAN-Test répond correctement (test : `/agent byan-test`)
- [ ] Marc répond correctement (test : `/agent marc`)
- [ ] Rachid répond correctement (test : `/agent rachid`)
- [ ] Patnote répond correctement (test : `/agent patnote`)
- [ ] Carmack répond correctement (test : `/agent carmack`)

---

## 📞 Support et Communauté

### 🆘 Besoin d'aide ?

**Option 1 : Appelez Marc (Copilot CLI Expert)**
```bash
gh copilot --agent=marc
# Marc diagnostique et corrige les problèmes de détection
```

**Option 2 : Consultez la documentation complète**
- README principal : `install/README.md`
- CHANGELOG : `install/CHANGELOG.md`
- Guide Marc : `install/MARC-INDEX.md`

**Option 3 : GitHub Issues**
- Ouvrez une issue : https://github.com/<votre-repo>/issues
- Décrivez le problème avec :
  - OS (Windows/Linux/macOS)
  - Versions (`gh --version`, `node --version`)
  - Logs d'erreur complets
  - Étapes pour reproduire

---

## 📚 Annexes

### Annexe A : Structure Complète des Dossiers

```
votre-projet/
├── _byan/                          # Platform code
│   ├── bmb/                        # BYAN Module
│   │   ├── agents/
│   │   │   ├── byan.md             # ✅ Agent BYAN standard
│   │   │   ├── byan-test.md        # ✅ Agent BYAN optimisé
│   │   │   ├── patnote.md          # ✅ Agent Patnote
│   │   │   ├── agent-builder.md
│   │   │   ├── module-builder.md
│   │   │   └── workflow-builder.md
│   │   ├── workflows/
│   │   └── config.yaml
│   ├── core/                       # Core agents
│   │   ├── agents/
│   │   │   └── carmack.md          # ✅ Agent Carmack
│   │   └── workflows/
│   ├── bmm/                        # Software Development Lifecycle
│   └── cis/                        # Creative Innovation & Strategy
├── .github/
│   └── agents/                     # Copilot CLI detection
│       ├── bmad-agent-byan.md      # ✅
│       ├── bmad-agent-byan-test.md # ✅
│       ├── bmad-agent-marc.md      # ✅
│       ├── bmad-agent-rachid.md    # ✅
│       ├── bmad-agent-patnote.md   # ✅
│       ├── bmad-agent-carmack.md   # ✅
│       └── ... (21 autres agents BMAD)
└── _byan-output/                   # Generated artifacts
    ├── bmb-creations/              # Vos agents créés
    └── planning-artifacts/
```

---

### Annexe B : Commandes Essentielles

#### GitHub CLI
```bash
gh --version                # Version de gh
gh auth status              # Statut authentification
gh auth login               # Se connecter
gh extension list           # Lister extensions
gh copilot                  # Mode interactif Copilot
gh copilot --agent=byan     # Lancer agent spécifique
```

#### NPM/NPX
```bash
node --version              # Version Node.js
npm --version               # Version npm
npx create-byan-agent       # Installer BYAN (latest)
npx create-byan-agent@1.1.1 # Installer version spécifique
npm view create-byan-agent  # Infos package npm
```

#### Agents BYAN
```bash
# Dans gh copilot ou avec --agent=
@byan                       # Créateur standard
@byan-test                  # Créateur optimisé
@marc                       # Expert Copilot CLI
@rachid                     # Spécialiste npm
@patnote                    # Gestionnaire updates
@carmack                    # Optimiseur tokens
```

---

### Annexe C : Variables de Configuration

**Fichier : `_byan/bmb/config.yaml`**

```yaml
user_name: Yan                      # Votre nom/prénom
communication_language: Francais    # Francais ou English
document_output_language: Francais  # Francais ou English
output_folder: "{project-root}/_byan-output"
```

**Variables dynamiques :**
- `{project-root}` : Racine du projet (résolu automatiquement)
- `{output_folder}` : Dossier de sortie (défini dans config)
- `{user_name}` : Nom utilisateur (défini dans config)

---

### Annexe D : Versions et Compatibilité

**Versions testées :**
- Node.js : ≥ 18.0.0
- npm : ≥ 9.0.0
- GitHub CLI : ≥ 2.40.0
- GitHub Copilot Extension : ≥ 1.0.0

**Systèmes d'exploitation :**
- ✅ Windows 10/11 (PowerShell 5.1+)
- ✅ Ubuntu 20.04/22.04/24.04
- ✅ Debian 11/12
- ✅ Fedora 38/39
- ✅ macOS 12+ (Monterey et supérieur)

**Éditeurs supportés :**
- ✅ GitHub Copilot CLI (terminal)
- ✅ Claude Code (via MCP)
- 🚧 VSCode (en développement)
- 🚧 Cursor (en développement)

---

## 🎉 Conclusion

Vous avez maintenant :
- ✅ Les 6 agents BYAN installés et opérationnels
- ✅ GitHub Copilot CLI configuré
- ✅ Claude Code configuré (optionnel)
- ✅ Une compréhension des cas d'usage
- ✅ Des solutions pour tous les problèmes courants

**Prochaines étapes suggérées :**

1. **Créez votre premier agent** :
   ```bash
   gh copilot --agent=byan
   # Tapez: 1 (Intelligent Interview)
   ```

2. **Explorez les 21 autres agents BMAD** :
   ```bash
   gh copilot
   # Tapez: /agent
   # Découvrez: analyst, architect, pm, dev, sm, quinn, etc.
   ```

3. **Rejoignez la communauté BYAN** :
   - GitHub : https://github.com/<votre-repo>
   - Discord : (lien à venir)
   - Documentation : https://<votre-doc>

---

**Besoin d'aide ?** Appelez Marc ! 🤖
```bash
gh copilot --agent=marc
```

**Happy agent building!** 🏗️✨

---

**Guide créé par :** Carson (Brainstorming Coach) + Marc (Copilot CLI Expert) + Rachid (NPM Specialist)  
**Version :** 1.1.1  
**Date :** 2026-02-03  
**Licence :** MIT
