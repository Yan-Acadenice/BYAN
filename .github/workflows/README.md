# GitHub Actions Workflows

Ce dossier contient les workflows GitHub Actions pour le projet BYAN.

## yanstaller-test.yml

Workflow de test pour le package YANSTALLER (create-byan-agent).

### Déclencheurs

Ce workflow peut être déclenché de trois façons :

1. **Automatiquement sur push** vers les branches `main` ou `develop`
2. **Automatiquement sur pull request** ciblant les branches `main` ou `develop`
3. **Manuellement** via l'interface GitHub Actions

### Lancement manuel

Pour lancer le workflow manuellement :

1. Allez sur la page GitHub Actions du repository : https://github.com/Yan-Acadenice/BYAN/actions
2. Sélectionnez le workflow "Test YANSTALLER" dans la liste de gauche
3. Cliquez sur le bouton "Run workflow" en haut à droite
4. Sélectionnez la branche sur laquelle vous voulez exécuter le workflow
5. Cliquez sur "Run workflow" pour confirmer

### Tests exécutés

Le workflow teste l'installation et l'exécution du package sur :
- **Systèmes d'exploitation** : Ubuntu, Windows, macOS
- **Versions de Node.js** : 18.x, 20.x, 22.x

### Couverture de code

La couverture de code est uploadée vers Codecov pour les tests exécutés sur :
- OS : Ubuntu Latest
- Node.js : 20.x
