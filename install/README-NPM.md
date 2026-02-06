# BYAN - Créateur d'Agents IA Intelligents

**Version 2.0** | Installation en 2 minutes | Interview de 15-30 minutes | Agent prêt à l'emploi

---

## 🎯 C'est quoi BYAN ?

BYAN (Builder of YAN) est un assistant intelligent qui **crée des agents IA personnalisés** pour vous.

**Comment ça marche ?**
1. ✅ Vous répondez à des questions simples (15-30 min)
2. ✅ BYAN analyse vos besoins
3. ✅ Un agent IA personnalisé est généré automatiquement
4. ✅ Prêt à utiliser immédiatement

**Compatible avec :** GitHub Copilot CLI, VSCode, Claude Code, Codex

---

## 📦 Installation (2 minutes)

### Option 1 : NPX (Le plus simple)

```bash
npx create-byan-agent
```

C'est tout ! L'installateur se lance automatiquement.

### Option 2 : Installation globale

```bash
npm install -g create-byan-agent
create-byan-agent
```

### Vérification

```bash
# Vérifier que BYAN est installé
npx create-byan-agent --version
```

---

## 🚀 Créer votre premier agent (15 min)

### Étape 1 : Lancer BYAN

**GitHub Copilot CLI :**
```bash
gh copilot
# Puis tapez : @byan
```

**Ligne de commande :**
```bash
npx create-byan-agent
```

### Étape 2 : Choisir le mode

Deux modes disponibles :

**🎤 Interview complète (15-30 min)** - Recommandé pour le premier agent
- BYAN pose 12-15 questions
- Analyse approfondie de vos besoins
- Agent ultra-personnalisé

**⚡ Création rapide (5 min)** - Pour les utilisateurs expérimentés
- 3-5 questions essentielles
- Agent fonctionnel rapidement

### Étape 3 : Répondre aux questions

BYAN vous pose des questions dans 4 catégories :

1. **Contexte** : Votre projet, vos objectifs
2. **Métier** : Votre domaine, vos contraintes
3. **Agent** : Compétences souhaitées, tâches à automatiser
4. **Validation** : Confirmation et ajustements

**Exemple de questions :**
- "Quel est le but principal de votre agent ?"
- "Quelles tâches doit-il automatiser ?"
- "Quelles sont vos contraintes ?"

### Étape 4 : Génération automatique

BYAN génère votre agent en quelques secondes :

```
✅ Analyse complète
✅ Agent créé : mon-agent-dev.md
✅ Validé et prêt à l'emploi
```

Votre agent est sauvegardé dans :
- GitHub Copilot : `.github/copilot/agents/`
- Autres plateformes : `.codex/prompts/`

---

## 💡 Exemples d'utilisation

### Exemple 1 : Agent de revue de code

```bash
npx create-byan-agent

# Questions posées par BYAN :
# Q: But de l'agent ? → "Réviser mon code JavaScript"
# Q: Tâches principales ? → "Détecter bugs, suggérer optimisations"
# Q: Contraintes ? → "Respecter notre guide de style"

# Résultat : code-reviewer.md créé en 2 secondes
```

### Exemple 2 : Agent de documentation

```bash
npx create-byan-agent

# Q: But ? → "Générer documentation API"
# Q: Technologies ? → "Node.js, Express, MongoDB"
# Q: Format ? → "Markdown avec exemples"

# Résultat : doc-generator.md prêt
```

### Exemple 3 : Agent de tests

```bash
npx create-byan-agent

# Q: But ? → "Créer tests unitaires"
# Q: Framework ? → "Jest"
# Q: Couverture ? → "80% minimum"

# Résultat : test-creator.md opérationnel
```

---

## 📖 Utiliser votre agent

### Avec GitHub Copilot CLI

```bash
gh copilot
@mon-agent-dev
# Votre agent répond !
```

### Avec VSCode

1. Ouvrir la palette de commandes (Ctrl+Shift+P)
2. Taper "GitHub Copilot: Chat"
3. Taper `@mon-agent-dev`

### Avec Claude Code

```bash
claude chat --agent mon-agent-dev
```

---

## 🎓 Concepts clés de BYAN v2

### 1. Interview intelligente (4 phases)

BYAN structure l'interview en 4 phases pour capturer tous vos besoins :

- **Phase 1 - CONTEXTE** : Comprendre votre projet
- **Phase 2 - BUSINESS** : Saisir vos contraintes métier
- **Phase 3 - AGENT** : Définir les capacités de l'agent
- **Phase 4 - VALIDATION** : Confirmer et affiner

**Minimum 3 questions par phase = 12 questions total**

### 2. Machine à états

BYAN v2 utilise une machine à états pour gérer le workflow :

```
INTERVIEW → ANALYSIS → GENERATION → COMPLETED
```

Chaque étape est validée avant de passer à la suivante.

### 3. Système de templates

Les agents sont générés à partir de templates professionnels :

```yaml
---
name: "mon-agent"
description: "Description de l'agent"
---

<agent>
  <activation>...</activation>
  <persona>...</persona>
  <menu>...</menu>
</agent>
```

### 4. Validation automatique

BYAN valide automatiquement :
- ✅ Format YAML correct
- ✅ Structure XML valide
- ✅ Pas d'emojis dans le code (Mantra IA-23)
- ✅ Nom d'agent valide
- ✅ Description claire
- ✅ Capacités bien définies

### 5. Méthodologie : 64 Mantras

BYAN applique 64 principes de qualité :

**Exemples de mantras appliqués :**
- **#37 Ockham's Razor** : Simplicité d'abord
- **#39 Évaluation des conséquences** : Prévoir l'impact avant d'agir
- **IA-1 Trust But Verify** : Vérifier les besoins utilisateur
- **IA-23 No Emoji Pollution** : Code propre sans emojis
- **IA-24 Clean Code** : Code auto-documenté

---

## ⚙️ Configuration avancée (optionnel)

### Personnaliser l'output

```javascript
const ByanV2 = require('create-byan-agent');

const byan = new ByanV2({
  outputFolder: './mes-agents',  // Dossier de sortie
  language: 'fr',                // Langue (fr/en)
  template: 'custom'             // Template personnalisé
});
```

### Utilisation programmatique

```javascript
const ByanV2 = require('create-byan-agent');

async function createAgent() {
  const byan = new ByanV2();
  
  // Démarrer session
  await byan.startSession();
  
  // Simuler réponses (pour automatisation)
  const responses = [
    'Agent de développement backend',
    'API REST en Node.js',
    'Tests, documentation, déploiement',
    // ... 12 réponses total
  ];
  
  // Soumettre réponses
  for (const response of responses) {
    await byan.getNextQuestion();
    await byan.submitResponse(response);
  }
  
  // Générer agent
  const profile = await byan.generateProfile();
  console.log('Agent créé :', profile);
}
```

---

## 🛠️ Commandes utiles

### Lister vos agents

```bash
# Voir tous les agents créés
ls .github/copilot/agents/
```

### Éditer un agent

```bash
# Ouvrir avec votre éditeur
code .github/copilot/agents/mon-agent.md
```

### Valider un agent

```bash
# Vérifier qu'un agent est valide
npx create-byan-agent --validate mon-agent.md
```

### Voir la version

```bash
npx create-byan-agent --version
```

---

## 🆘 Aide et support

### Obtenir de l'aide

**Dans BYAN :**
```
/bmad-help
```

**Documentation complète :**
- [Guide d'utilisation complet](https://github.com/Yan-Acadenice/BYAN/blob/main/GUIDE-UTILISATION.md)
- [API Reference](https://github.com/Yan-Acadenice/BYAN/blob/main/API-BYAN-V2.md)
- [Exemples](https://github.com/Yan-Acadenice/BYAN/tree/main/examples)

### Problèmes courants

**L'agent n'apparaît pas dans Copilot**
```bash
# Vérifier le fichier
cat .github/copilot/agents/mon-agent.md

# Redémarrer Copilot
gh copilot quit
gh copilot
```

**Erreur "Node version too old"**
```bash
# Vérifier version Node
node --version  # Doit être >= 18

# Installer Node 18+
nvm install 18
nvm use 18
```

**Tests échouent**
```bash
# Réinstaller les dépendances
rm -rf node_modules package-lock.json
npm install
npm test
```

### Signaler un bug

GitHub Issues : https://github.com/Yan-Acadenice/BYAN/issues

---

## 🎯 Cas d'usage

### Pour développeurs

- ✅ Agents de revue de code
- ✅ Générateurs de tests
- ✅ Assistants de refactoring
- ✅ Analyseurs de sécurité

### Pour rédacteurs

- ✅ Générateurs de documentation
- ✅ Correcteurs orthographiques
- ✅ Assistants de traduction
- ✅ Créateurs de contenu

### Pour chefs de projet

- ✅ Analyseurs de tickets
- ✅ Générateurs de rapports
- ✅ Assistants de planification
- ✅ Gestionnaires de priorités

### Pour designers

- ✅ Générateurs de composants UI
- ✅ Validateurs d'accessibilité
- ✅ Optimiseurs de CSS
- ✅ Assistants de design system

---

## 📊 Statistiques

### BYAN v2.0

- ✅ **881/881 tests passing (100%)**
- ✅ **14 modules** (Context, Interview, Analysis, Generation, Validation...)
- ✅ **77 Story Points** delivered
- ✅ **Agent généré en < 2 secondes** après interview
- ✅ **12 questions minimum** pour interview complète
- ✅ **64 mantras** appliqués automatiquement

---

## 📄 Licence

MIT License - Voir [LICENSE](./LICENSE)

---

## 👥 Contributeurs

**Équipe Core BYAN :**
- **BYAN** : Créateur d'agents intelligent
- **RACHID** : Spécialiste NPM/NPX deployment
- **MARC** : Expert GitHub Copilot CLI integration
- **PATNOTE** : Gestionnaire de mises à jour
- **CARMACK** : Optimiseur de tokens

---

## 🔗 Liens utiles

- 📦 [NPM Package](https://www.npmjs.com/package/create-byan-agent)
- 🐙 [GitHub Repository](https://github.com/Yan-Acadenice/BYAN)
- 📚 [Documentation complète](https://github.com/Yan-Acadenice/BYAN/blob/main/install/README.md)
- ⚡ [Guide rapide 5 min](https://github.com/Yan-Acadenice/BYAN/blob/main/install/QUICKSTART.md)
- 🎓 [Guide débutant](https://github.com/Yan-Acadenice/BYAN/blob/main/install/GUIDE-INSTALLATION-BYAN-SIMPLE.md)

---

**BYAN v2.0** - Créez des agents IA professionnels en 15 minutes 🚀
