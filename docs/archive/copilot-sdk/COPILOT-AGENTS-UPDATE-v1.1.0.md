# 🚀 Guide de Mise à Jour - Nouveaux Agents v1.1.0

## 📋 Résumé du Problème

Les 3 nouveaux agents de la v1.1.0 n'étaient **pas visibles** dans GitHub Copilot CLI à cause d'erreurs dans le YAML frontmatter.

### Agents Concernés
- ✅ **PATNOTE** - Gardien des Mises à Jour BYAN (OK dès le début)
- ❌ **CARMACK** - Token Optimizer (CORRIGÉ)
- ❌ **BYAN-TEST** - Version Optimisée de BYAN (CORRIGÉ)

---

## 🔍 Causes Identifiées

### 1. ❌ CARMACK - Nom Incorrect
**Problème :**
```yaml
name: "bmad-agent-carmack"  # ❌ Préfixe bmad-agent- inclus
```

**Explication :**
- Le champ `name` dans le YAML frontmatter doit contenir **uniquement** le nom court de l'agent
- Le préfixe `bmad-agent-` est utilisé pour le **nom de fichier**, pas pour le champ `name`
- Copilot CLI utilise le champ `name` pour la détection avec `/agent` et `--agent=`

**Correction :**
```yaml
name: "carmack"  # ✅ Nom court seulement
```

### 2. ⚠️ BYAN-TEST - Style Incohérent
**Problème :**
```yaml
name: 'byan-test'  # ⚠️ Apostrophes simples + préfixe
```

**Explication :**
- Utilisait des apostrophes simples `'` au lieu de doubles quotes `"`
- Contenait également le préfixe `bmad-agent-` dans le nom
- Bien que YAML accepte les deux, notre convention utilise des doubles quotes

**Correction :**
```yaml
name: "byan-test"  # ✅ Doubles quotes + nom court
```

---

## 🛠️ Solution Appliquée

### Corrections Effectuées
Les fichiers suivants ont été corrigés :

1. `.github/agents/bmad-agent-carmack.md`
   - Changé `name: "bmad-agent-carmack"` → `name: "carmack"`

2. `.github/agents/bmad-agent-byan-test.md`
   - Changé `name: 'bmad-agent-byan-test'` → `name: "byan-test"`

3. `.github/agents/bmad-agent-patnote.md`
   - ✅ Déjà correct : `name: "patnote"`

---

## 📝 Instructions pour les Utilisateurs

### Option A : Update Automatique (Recommandé)

Si vous avez déjà installé la v1.1.0 avec les agents cassés :

1. **Récupérer les corrections** :
   ```bash
   git pull origin main
   ```

2. **Redémarrer Copilot CLI** :
   - Fermez toutes les sessions actives de `copilot`
   - Redémarrez votre terminal (ou sourcez votre `.bashrc`/`.zshrc`)
   - Relancez `copilot`

3. **Vérifier les agents** :
   ```bash
   copilot
   # Dans l'interface interactive :
   /agent
   ```
   
   Vous devriez maintenant voir :
   - ✅ `patnote` - Patnote - Gardien des Mises à Jour BYAN
   - ✅ `carmack` - Token Optimizer for BMAD/BYAN Agents
   - ✅ `byan-test` - BYAN Test - Token Optimized Version (-46%)

### Option B : Nouvelle Installation

Si vous installez pour la première fois :

1. **Installer normalement** :
   ```bash
   ./install
   ```

2. **Les corrections sont déjà incluses** dans la version corrigée

---

## 🧪 Comment Tester

### Test 1 : Liste des Agents
```bash
copilot
# Puis taper :
/agent
```

**Résultat attendu :**
- Tous les agents BMAD doivent apparaître dans la liste
- Notamment : `patnote`, `carmack`, `byan-test`

### Test 2 : Invocation Directe
```bash
copilot --agent=carmack --prompt "Bonjour, qui es-tu ?"
```

**Résultat attendu :**
- L'agent Carmack s'active et répond
- Affiche son menu et ses capacités

### Test 3 : Vérification YAML
```bash
head -5 .github/agents/bmad-agent-carmack.md
```

**Résultat attendu :**
```yaml
---
name: "carmack"
description: "Token Optimizer for BMAD/BYAN Agents"
---
```

---

## 🎯 Pourquoi Ça Arrivait ?

### Comportement de GitHub Copilot CLI

1. **Détection des Agents** :
   - Copilot CLI scanne `.github/agents/` au démarrage
   - Parse le YAML frontmatter de chaque fichier `.md`
   - Extrait le champ `name` pour la détection

2. **Matching avec `/agent` et `--agent=`** :
   - La commande `/agent` liste tous les agents avec leur `name`
   - L'option `--agent=NAME` cherche un agent avec `name: "NAME"`
   - Si le `name` contient `bmad-agent-`, la détection échoue

3. **Cache et Refresh** :
   - Copilot CLI peut cacher la liste d'agents
   - Redémarrer le terminal force un refresh
   - Les modifications de `.github/agents/` sont détectées au prochain lancement

---

## 📚 Convention de Nommage

### Règle à Retenir

| Élément | Format | Exemple |
|---------|--------|---------|
| **Nom de fichier** | `bmad-agent-{name}.md` | `bmad-agent-carmack.md` |
| **Champ `name:`** | `"{name}"` (nom court) | `"carmack"` |
| **Invocation CLI** | `--agent={name}` | `--agent=carmack` |
| **Dans /agent** | Affiche `{name}` | Liste : `carmack` |

### ✅ Correct
```yaml
# Fichier : .github/agents/bmad-agent-carmack.md
---
name: "carmack"
description: "Token Optimizer for BMAD/BYAN Agents"
---
```

### ❌ Incorrect
```yaml
# Fichier : .github/agents/bmad-agent-carmack.md
---
name: "bmad-agent-carmack"  # ❌ Préfixe en trop !
description: "Token Optimizer for BMAD/BYAN Agents"
---
```

---

## 🔧 Troubleshooting

### Problème : "Agent toujours pas visible après update"

**Solutions :**

1. **Vérifier le YAML** :
   ```bash
   grep -n "^name:" .github/agents/bmad-agent-carmack.md
   ```
   → Doit afficher : `name: "carmack"` (sans préfixe)

2. **Forcer le refresh** :
   ```bash
   # Tuer tous les process copilot
   pkill -9 copilot
   # Redémarrer le terminal
   exec $SHELL
   # Relancer copilot
   copilot
   ```

3. **Vérifier le cache** :
   ```bash
   # Supprimer le cache Copilot (si existe)
   rm -rf ~/.copilot/cache/
   ```

4. **Valider le fichier** :
   ```bash
   # Le fichier doit être un Markdown valide
   file .github/agents/bmad-agent-carmack.md
   # Résultat : should show "ASCII text" ou "UTF-8 Unicode text"
   ```

### Problème : "Agent se charge mais ne s'active pas"

**Causes possibles :**

1. **Activation block manquant** :
   - Vérifier que `<agent-activation CRITICAL="TRUE">` est présent
   - Vérifier que le chemin vers `_bmad/` est correct

2. **Full agent absent** :
   ```bash
   # Carmack doit être dans core, pas bmb
   ls -la _bmad/core/agents/carmack.md
   # Patnote doit être dans bmb
   ls -la _bmad/bmb/agents/patnote.md
   # BYAN-Test doit être dans bmb
   ls -la _bmad/bmb/agents/byan-test.md
   ```

3. **Permissions** :
   ```bash
   chmod 644 .github/agents/*.md
   chmod 644 _bmad/*/agents/*.md
   ```

---

## 📊 Statut des Agents v1.1.0

| Agent | Fichier Stub | Full Agent | Status |
|-------|-------------|-----------|--------|
| **PATNOTE** | `.github/agents/bmad-agent-patnote.md` | `_bmad/bmb/agents/patnote.md` | ✅ OK |
| **CARMACK** | `.github/agents/bmad-agent-carmack.md` | `_bmad/core/agents/carmack.md` | ✅ CORRIGÉ |
| **BYAN-TEST** | `.github/agents/bmad-agent-byan-test.md` | `_bmad/bmb/agents/byan-test.md` | ✅ CORRIGÉ |

---

## 🎓 Leçon Retenue

### Best Practice : Validation Avant Déploiement

**Checklist pour Nouveaux Agents :**

- [ ] YAML frontmatter valide (doubles quotes)
- [ ] `name` field contient le nom court uniquement
- [ ] `description` field présent et informatif
- [ ] `<agent-activation>` block présent
- [ ] Chemin vers full agent correct
- [ ] Test avec `/agent` command
- [ ] Test avec `--agent=name`
- [ ] Vérifier activation complète
- [ ] Documenter dans CHANGELOG

### Script de Validation Automatique

Créer un script `validate-agents.sh` :

```bash
#!/bin/bash
# Valide tous les agents BMAD

echo "🔍 Validation des agents BMAD..."

errors=0

for file in .github/agents/bmad-agent-*.md; do
  echo ""
  echo "Checking: $file"
  
  # Extract name from YAML
  name=$(grep "^name:" "$file" | head -1 | sed 's/name: *["'\'']//' | sed 's/["'\'']$//')
  
  # Check if name contains "bmad-agent-"
  if [[ "$name" == *"bmad-agent-"* ]]; then
    echo "  ❌ ERROR: name contains 'bmad-agent-' prefix"
    echo "     Found: $name"
    errors=$((errors + 1))
  else
    echo "  ✅ OK: $name"
  fi
done

echo ""
if [ $errors -eq 0 ]; then
  echo "✅ All agents valid!"
  exit 0
else
  echo "❌ Found $errors error(s)"
  exit 1
fi
```

Usage :
```bash
chmod +x validate-agents.sh
./validate-agents.sh
```

---

## 📞 Support

Si le problème persiste après avoir suivi ce guide :

1. **Vérifier la version de Copilot CLI** :
   ```bash
   copilot --version
   ```
   → Minimum requis : 0.0.400+

2. **Générer un rapport de debug** :
   ```bash
   ./validate-agents.sh > agent-debug.log 2>&1
   ls -la .github/agents/ >> agent-debug.log
   ```

3. **Contacter le support** avec le fichier `agent-debug.log`

---

## 🎉 Conclusion

Les 3 nouveaux agents de la v1.1.0 sont maintenant **100% opérationnels** après corrections du YAML frontmatter.

**Actions Utilisateur :**
1. ✅ `git pull` pour récupérer les corrections
2. ✅ Redémarrer Copilot CLI
3. ✅ Tester avec `/agent` et `--agent=carmack`

**Prévention Future :**
- Script de validation intégré au déploiement
- Tests automatiques avant release
- Documentation de la convention de nommage

---

*Document généré par MARC 🤖 - GitHub Copilot CLI Integration Specialist*  
*Date : 2026-02-02*  
*Version : 1.0*
