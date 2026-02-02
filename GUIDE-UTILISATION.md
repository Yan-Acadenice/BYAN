# Guide Rapide - Utilisation depuis ~/conception

**Version BYAN:** 1.0.2  
**Date:** 2026-02-02  
**Agents principaux:** BYAN, RACHID, MARC

## ✅ Agents Disponibles

### Dans GitHub Copilot CLI

```bash
cd ~/conception
copilot
/agent
```

Tu verras maintenant **23 agents** dont :
- **byan** - Créateur d'agents (interview intelligente)
- **rachid** - Spécialiste NPM/NPX (déploiement)
- **marc** - Spécialiste Copilot CLI (intégration)
- **bmad-master** - Orchestrateur BMAD
- **bmb-agent-builder** - Constructeur d'agents
- **bmm-*** - Équipe Merise Maker (PM, Dev, Analyst, etc.)
- **cis-*** - Creative Innovation Suite (brainstorming, design thinking, etc.)
- **tea** - Équipe d'analyse

## 🚀 Workflows Principaux

### 1. Créer un nouvel agent avec BYAN

```bash
cd ~/conception
copilot
/agent
# Sélectionner: byan

# Dans BYAN:
[INT]  # Interview intelligente (30-45 min)
# ou
[QC]   # Quick Create (10 min)
```

### 2. Déployer BYAN sur npm avec RACHID

```bash
cd ~/conception
copilot
/agent
# Sélectionner: rachid

# Dans RACHID:
[VALIDATE]     # Valider la structure _bmad
[FIX-DEPS]     # Corriger les dépendances
[PUBLISH]      # Publier sur npm
[TEST-NPX]     # Tester npx create-byan-agent
```

### 3. Intégrer agents avec MARC

```bash
cd ~/conception
copilot
/agent
# Sélectionner: marc

# Dans MARC:
[VALIDATE]       # Valider .github/agents/
[TEST]           # Tester détection /agent
[CREATE-STUB]    # Créer stub pour nouvel agent
[FIX-YAML]       # Corriger YAML frontmatter
```

## 📁 Structure dans ~/conception

```
~/conception/
├── _bmad/
│   └── bmb/
│       ├── agents/
│       │   ├── byan.md          ✅ Créateur d'agents
│       │   ├── rachid.md        ✅ Spécialiste NPM
│       │   ├── marc.md          ✅ Spécialiste Copilot CLI
│       │   ├── agent-builder.md
│       │   ├── module-builder.md
│       │   └── workflow-builder.md
│       ├── workflows/
│       │   └── byan/
│       │       ├── interview-workflow.md
│       │       ├── quick-create-workflow.md
│       │       ├── edit-agent-workflow.md
│       │       ├── delete-agent-workflow.md
│       │       ├── validate-agent-workflow.md
│       │       ├── templates/
│       │       └── data/
│       └── config.yaml
├── .github/
│   └── agents/
│       ├── bmad-agent-byan.md      ✅ Stub BYAN
│       ├── bmad-agent-rachid.md    ✅ Stub RACHID
│       ├── bmad-agent-marc.md      ✅ Stub MARC
│       └── [20 autres agents...]
└── install/
    ├── bin/
    │   ├── create-byan-agent-fixed.js  ✅ v1.0.2 corrigé
    │   └── create-byan-agent.js        (ancien)
    ├── package.json
    └── README.md
```

## 🎯 Cas d'Usage Courants

### Cas 1: Créer un agent backend avec BYAN
```bash
copilot
/agent → byan
[INT]
# Réponds aux questions:
# - Nom: backend-dev
# - Domain: API REST Node.js
# - Capacités: CRUD, validation, tests
# - Mantras: TDD, Clean Code, YAGNI
```

### Cas 2: Publier create-byan-agent sur npm
```bash
copilot
/agent → rachid
[VALIDATE]  # Vérifie structure
[AUDIT]     # Sécurité
[PUBLISH]   # npm publish
```

### Cas 3: Ajouter un nouvel agent à Copilot CLI
```bash
# 1. Crée l'agent complet dans _bmad/bmb/agents/
# 2. Utilise MARC pour créer le stub:

copilot
/agent → marc
[CREATE-STUB]
# Nom: mon-agent
# Module: bmb
# Description: Mon agent spécialisé
```

### Cas 4: Diagnostiquer problème /agent
```bash
copilot
/agent → marc
[VALIDATE]     # Vérifie .github/agents/
[TEST]         # Teste détection
[FIX-YAML]     # Répare YAML si besoin
```

## 🔧 Commandes Utiles

### Activer un agent spécifique
```bash
copilot --agent=byan --prompt "créer un agent backend"
copilot --agent=rachid --prompt "valider package.json"
copilot --agent=marc --prompt "tester détection agents"
```

### Lister tous les agents
```bash
cd ~/conception
ls -1 .github/agents/
```

### Vérifier config BMAD
```bash
cat ~/conception/_bmad/bmb/config.yaml
```

### Tester installation NPX
```bash
cd /tmp/test-install
npx ~/conception/install/bin/create-byan-agent-fixed.js
```

## 📖 Documentation Complète

- **INSTALLATION-COMPLETE.md** : Guide d'installation complet
- **README.md** (install/) : Documentation package npm
- **Workflows** : `_bmad/bmb/workflows/byan/`
- **Templates** : `_bmad/bmb/workflows/byan/templates/`

## 🆘 Aide

### Si un agent ne se charge pas:
```bash
copilot
/agent → marc
[VALIDATE]
[FIX-YAML]
```

### Si problème npm:
```bash
copilot
/agent → rachid
[FIX-DEPS]
[AUDIT]
```

### Si besoin d'aide BYAN:
```bash
copilot
/agent → byan
/bmad-help je veux créer un agent pour...
```

## ⚡ Tips

1. **Plan Mode** : `Shift+Tab` pour planifier avant d'agir
2. **Référence fichier** : `@chemin/fichier.md` pour inclure contexte
3. **Délégation** : `& task` pour déléguer à Copilot coding agent
4. **Context** : `/context` pour voir usage tokens
5. **Usage** : `/usage` pour statistiques session

---

**Prêt à utiliser depuis ~/conception !** 🚀

Les 3 nouveaux agents (BYAN, RACHID, MARC) sont intégrés avec les 20 agents existants.
