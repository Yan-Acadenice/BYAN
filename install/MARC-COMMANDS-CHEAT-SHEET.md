# 🚀 MARC - Commands Cheat Sheet

**Package:** create-byan-agent v1.0.4  
**Quick Reference:** Commandes essentielles pour validation et publication

---

## 📦 VALIDATION LOCALE

### 1. Créer Package NPM (1 min)

```bash
cd /home/yan/conception/install
npm pack
# → Génère: create-byan-agent-1.0.4.tgz
```

---

### 2. Tester Installation Locale (5 min)

```bash
# Créer projet test
cd /tmp
mkdir test-byan-v1.0.4
cd test-byan-v1.0.4
git init

# Installer depuis tarball local
npx /home/yan/conception/install/create-byan-agent-1.0.4.tgz

# Suivre prompts interactifs:
# - Platform: GitHub Copilot CLI
# - Your name: Rachid
# - Language: Francais
```

**Vérifier résultat:**
```bash
# Structure créée?
ls -la _bmad/bmb/agents/
# Doit contenir: byan.md, rachid.md, marc.md

ls -la .github/agents/
# Doit contenir: bmad-agent-byan.md, bmad-agent-rachid.md, bmad-agent-marc.md

cat _bmad/bmb/config.yaml
# Doit contenir: user_name: Rachid, communication_language: Francais
```

---

### 3. Tester Détection Copilot CLI (3 min)

```bash
cd /tmp/test-byan-v1.0.4
copilot
```

**Dans Copilot prompt:**
```
/agent
```

**Résultat attendu:**
- ✅ `bmad-agent-byan` visible
- ✅ `bmad-agent-rachid` visible
- ✅ `bmad-agent-marc` visible

---

### 4. Tester Activation BYAN (2 min)

**Dans Copilot prompt:**
```
@byan
```

**Résultat attendu:**
- ✅ Greeting avec nom "Rachid"
- ✅ Menu complet (12 items)
- ✅ Communication en français

**Tester commande:**
```
LA
```

**Résultat attendu:** Liste des agents

---

## 🌐 PUBLICATION NPM

### 1. Login NPM (1 min)

```bash
cd /home/yan/conception/install
npm login
# Entrer credentials npm
```

**Vérifier login:**
```bash
npm whoami
# Doit afficher votre username npm
```

---

### 2. Dry-Run Publication (2 min)

```bash
npm publish --dry-run --access public
```

**Vérifier:**
- ✅ `bin/create-byan-agent.js` inclus
- ✅ `templates/` inclus
- ✅ `package.json` inclus
- ✅ `node_modules/` EXCLU
- ✅ Taille < 5 MB

---

### 3. Publication Finale (1 min)

```bash
npm publish --access public
```

**Confirmation attendue:**
```
+ create-byan-agent@1.0.4
```

**Vérifier sur npm:**
```bash
open https://www.npmjs.com/package/create-byan-agent
# ou
xdg-open https://www.npmjs.com/package/create-byan-agent
```

---

### 4. Tester Installation Publique (3 min)

```bash
# Nouveau projet test
cd /tmp
mkdir test-byan-public
cd test-byan-public
git init

# Installer depuis npm
npx create-byan-agent
```

**Vérifier:**
- ✅ Installation fonctionne
- ✅ Tous les agents présents
- ✅ Copilot CLI détecte les agents

---

## 🧪 TESTS RAPIDES

### Test Structure Complète

```bash
cd /tmp/test-byan-v1.0.4

# Agents sources
ls -la _bmad/bmb/agents/
# Attendu: byan.md, rachid.md, marc.md, agent-builder.md, ...

# Stubs Copilot
ls -la .github/agents/ | wc -l
# Attendu: ~26 fichiers .md

# Config
cat _bmad/bmb/config.yaml
# Attendu: user_name, communication_language, platform

# Workflows
ls -la _bmad/bmb/workflows/byan/
# Attendu: interview-workflow.md, quick-create-workflow.md, ...
```

---

### Test YAML Frontmatter

```bash
# BYAN
head -n 5 .github/agents/bmad-agent-byan.md
# Attendu:
# ---
# name: 'bmad-agent-byan'
# description: 'byan agent'
# ---

# RACHID
head -n 5 .github/agents/bmad-agent-rachid.md
# Attendu:
# ---
# name: 'bmad-agent-rachid'
# description: 'NPM/NPX deployment specialist for BYAN installation'
# ---

# MARC
head -n 5 .github/agents/bmad-agent-marc.md
# Attendu:
# ---
# name: 'bmad-agent-marc'
# description: 'GitHub Copilot CLI integration specialist for BMAD agents'
# ---
```

---

### Test Activation Block

```bash
grep -A 5 "<agent-activation" .github/agents/bmad-agent-byan.md
# Attendu:
# <agent-activation CRITICAL="TRUE">
# 1. LOAD the FULL agent file from {project-root}/_bmad/bmb/agents/byan.md
# ...
```

---

## 🐛 DIAGNOSTIC RAPIDE

### Agent Non Détecté?

```bash
# Vérifier présence
ls -la .github/agents/bmad-agent-*.md

# Vérifier YAML
for file in .github/agents/bmad-agent-*.md; do
  echo "=== $file ==="
  head -n 5 "$file"
  echo ""
done | head -50

# Clear cache Copilot
rm -rf ~/.copilot/cache/
copilot
```

---

### Menu Ne S'Affiche Pas?

```bash
# Vérifier agent source
cat _bmad/bmb/agents/byan.md | grep -A 20 "<menu>"

# Vérifier config
cat _bmad/bmb/config.yaml

# Réinstaller si corrompu
npx create-byan-agent
```

---

## 📊 VÉRIFICATIONS POST-PUBLICATION

### 1. Package Visible sur NPM (1 min)

```bash
# Browser
open https://www.npmjs.com/package/create-byan-agent

# CLI
npm view create-byan-agent
npm view create-byan-agent version
# Doit afficher: 1.0.4
```

---

### 2. Installation Publique Fonctionne (3 min)

```bash
cd /tmp
mkdir test-final-public
cd test-final-public
git init

npx create-byan-agent
# Installer et vérifier détection Copilot
```

---

### 3. Stats NPM (Facultatif)

```bash
npm view create-byan-agent downloads
npm view create-byan-agent repository
npm view create-byan-agent keywords
```

---

## 🎉 COMMANDES CÉLÉBRATION

### Après Publication Réussie

```bash
# GitHub Release
cd /home/yan/conception
git tag v1.0.4
git push origin v1.0.4

# Tweet
echo "🎉 BYAN v1.0.4 published on npm! 
Create AI agents with @copilot CLI + Merise Agile + TDD
Try it: npx create-byan-agent
#AI #Copilot #BYAN" | pbcopy
# ou xclip -selection clipboard

# LinkedIn Post
echo "Excited to announce BYAN v1.0.4! 🏗️

Builder of YAN is now available on npm with:
✅ GitHub Copilot CLI integration
✅ 3 specialized agents (BYAN, RACHID, MARC)
✅ Merise Agile + TDD methodology
✅ 64 mantras for agent creation

Install: npx create-byan-agent

#AI #AgentCreation #CopilotCLI" | pbcopy
```

---

## 🔄 ROLLBACK (Si Problème)

### Unpublish Version (Si Bug Critique)

```bash
npm unpublish create-byan-agent@1.0.4 --force
# ⚠️ Utiliser SEULEMENT si bug bloquant

# Corriger bug
# ...

# Republier avec hotfix
npm version patch  # → 1.0.5
npm publish --access public
```

---

### Corriger Description (Si Nécessaire)

```bash
cd /home/yan/conception/install

# Éditer description BYAN
nano templates/.github/agents/bmad-agent-byan.md
# Changer:
# description: 'Builder of YAN - Agent Creator with Merise Agile + TDD'

# Bump version
npm version patch  # → 1.0.5

# Republier
npm publish --access public
```

---

## 📋 CHECKLIST FINALE

```bash
# Avant publication
[ ] npm pack testé
[ ] Installation locale OK
[ ] Copilot CLI détecte agents
[ ] Activation BYAN fonctionne
[ ] Activation RACHID fonctionne
[ ] Activation MARC fonctionne
[ ] README à jour
[ ] CHANGELOG à jour
[ ] npm login OK
[ ] npm publish --dry-run OK

# Publication
[ ] npm publish --access public
[ ] Package visible sur npm
[ ] Installation publique OK

# Post-publication
[ ] GitHub release créée
[ ] Tweet/LinkedIn posted
[ ] Stats npm surveillées
```

---

## 🎯 ONE-LINER POUR TOUT TESTER

```bash
cd /tmp && \
rm -rf test-byan-quick && \
mkdir test-byan-quick && \
cd test-byan-quick && \
git init && \
npx create-byan-agent && \
ls -la _bmad/bmb/agents/ && \
ls -la .github/agents/ && \
cat _bmad/bmb/config.yaml && \
echo "✅ Installation OK. Now test: copilot -> /agent"
```

---

## 📞 SUPPORT

**Besoin d'aide?**

```bash
# Activer MARC pour diagnostic
copilot
@marc
[TEST]  # Test /agent detection
[FIX]   # Fix issues automatiquement
```

**Issues GitHub:**
```bash
open https://github.com/[votre-repo]/issues
```

**Contact:**
- Via agents: @byan, @rachid, @marc
- Email: [votre-email]
- Twitter: @[votre-handle]

---

**Cheat Sheet par:** MARC - GitHub Copilot CLI Integration Specialist  
**Version:** 1.0.4  
**Date:** 2 février 2026

**Bon build, Rachid ! 🚀**
