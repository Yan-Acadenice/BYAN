# Guide de Publication NPM - create-byan-agent

## Pré-requis

1. **Compte NPM**
   ```bash
   npm whoami  # Vérifier connexion
   npm login   # Se connecter si nécessaire
   ```

2. **Validation locale**
   ```bash
   cd /home/yan/conception/install
   npm install
   npm test    # Teste le script d'installation
   ```

## Étapes de Publication

### 1. Vérification du package

```bash
# Vérifier la version
cat package.json | grep version

# Vérifier le contenu du package
npm pack --dry-run

# Créer un tarball local pour inspection
npm pack
tar -tzf create-byan-agent-1.0.2.tgz | head -50
```

### 2. Tests locaux

```bash
# Test dans un dossier temporaire
mkdir -p /tmp/test-byan-v1.0.2
cd /tmp/test-byan-v1.0.2

# Test avec le tarball local
npm init -y
npx /home/yan/conception/install/create-byan-agent-1.0.2.tgz

# Vérifier l'installation
ls -la _bmad/bmb/agents/    # Doit contenir byan, rachid, marc
ls -la .github/agents/       # Doit contenir les stubs
```

### 3. Audit de sécurité

```bash
cd /home/yan/conception/install
npm audit
npm audit fix  # Si vulnérabilités trouvées
```

### 4. Publication

```bash
cd /home/yan/conception/install

# Publication en mode dry-run (simulation)
npm publish --dry-run

# Publication réelle
npm publish
```

### 5. Vérification post-publication

```bash
# Attendre 1-2 minutes pour propagation

# Test avec npx depuis npm registry
mkdir -p /tmp/test-byan-npm
cd /tmp/test-byan-npm
npx create-byan-agent

# Vérifier dans npm
npm view create-byan-agent
npm view create-byan-agent versions
```

## Commandes Utiles

### Mise à jour de version

```bash
# Patch (1.0.2 -> 1.0.3)
npm version patch

# Minor (1.0.2 -> 1.1.0)
npm version minor

# Major (1.0.2 -> 2.0.0)
npm version major
```

### Dépublication (en cas d'urgence)

```bash
# Dépublier une version spécifique (dans les 72h)
npm unpublish create-byan-agent@1.0.2

# Déprécier une version
npm deprecate create-byan-agent@1.0.2 "Version obsolète, utiliser 1.0.3"
```

## Checklist Pré-Publication

- [ ] Version mise à jour dans package.json
- [ ] CHANGELOG.md mis à jour
- [ ] README.md mis à jour
- [ ] Tous les fichiers dans templates/ sont corrects
- [ ] npm audit ne montre aucune vulnérabilité critique
- [ ] Test local avec npm pack réussi
- [ ] Test avec npx local réussi
- [ ] Git commit et tag créés
- [ ] Connecté à npm avec le bon compte

## Git Tagging

```bash
cd /home/yan/conception

# Commiter les changements
git add install/
git commit -m "chore: release create-byan-agent v1.0.2

- Add RACHID agent for NPM deployment
- Add MARC agent for Copilot CLI integration
- Add templates/ directory with all BYAN files
- Update installer with enhanced verification
- Update documentation"

# Créer un tag
git tag -a v1.0.2 -m "Release v1.0.2 - RACHID + MARC agents"

# Pousser sur GitHub (si distant configuré)
git push origin main
git push origin v1.0.2
```

## En cas de problème

### Erreur: Version existe déjà
```bash
npm version patch  # Incrémente à 1.0.3
```

### Erreur: Fichiers manquants
```bash
# Vérifier package.json "files"
cat package.json | grep -A 10 "files"

# Recréer le tarball
npm pack
```

### Erreur: Authentification
```bash
npm logout
npm login
npm whoami
```

## Post-Publication

1. **Mettre à jour la documentation externe**
   - GitHub README
   - Site web (si applicable)
   - Annonce sur réseaux sociaux

2. **Tester dans un nouveau projet**
   ```bash
   mkdir -p ~/test-new-byan
   cd ~/test-new-byan
   npx create-byan-agent@latest
   ```

3. **Monitorer les issues**
   - Vérifier npm registry: https://www.npmjs.com/package/create-byan-agent
   - Monitorer les téléchargements

---

**Date:** 2026-02-02  
**Version:** 1.0.2  
**Agents:** BYAN, RACHID, MARC
