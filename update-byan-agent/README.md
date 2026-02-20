# BYAN Update Agent

Mécanisme de mise à jour fonctionnel pour BYAN installé via `npx create-byan-agent`.

## Problème Résolu

Les utilisateurs qui ont installé BYAN avec une version antérieure n'avaient aucun moyen de mettre à jour leurs fichiers `_byan/` lorsqu'une nouvelle version était publiée sur npm.

## Fonctionnalités

### 1. Vérification de Version
```bash
npx create-byan-agent check
# ou
npx update-byan-agent check
```

Affiche :
- Version actuelle (depuis `_byan/bmb/config.yaml`)
- Dernière version npm (depuis registry.npmjs.org)
- Statut : à jour / mise à jour disponible / version dev

### 2. Mise à Jour
```bash
npx create-byan-agent update
# ou
npx update-byan-agent update
```

Processus :
1. Vérifie la version actuelle vs npm
2. Demande confirmation
3. Détecte les personnalisations
4. Crée un backup automatique
5. Télécharge la dernière version
6. Préserve les fichiers utilisateur :
   - `_byan/bmb/config.yaml`
   - `_byan/_memory/`
   - `_byan-output/`
7. Restaure les personnalisations
8. Met à jour `byan_version` dans config.yaml

Options :
- `--dry-run` : Analyse sans appliquer
- `--force` : Forcer même si déjà à jour

### 3. Backup Manuel
```bash
npx update-byan-agent backup
```

Crée un backup horodaté dans `_byan.backup/backup-YYYY-MM-DD_HH-MM-SS/`

### 4. Restauration
```bash
npx create-byan-agent restore
# ou
npx update-byan-agent restore [--path /chemin/backup]
```

Restaure depuis le dernier backup ou un backup spécifique.

### 5. Lister Backups
```bash
npx update-byan-agent list-backups
```

Affiche tous les backups disponibles avec date et taille.

## Architecture

### Modules

#### `lib/analyzer.js`
- `checkCurrentVersion()` : Lit `byan_version` depuis config.yaml
- `fetchLatestVersion()` : Récupère dernière version npm via HTTPS
- `compare(current, latest)` : Comparaison semver
- `checkVersion()` : Combine tout pour retourner `{current, latest, needsUpdate}`

#### `lib/backup.js`
- `create()` : Copie `_byan/` vers `_byan.backup/backup-{timestamp}/`
- `restore(backupPath)` : Restaure depuis backup
- `getLatestBackup()` : Trouve dernier backup par date
- `listBackups()` : Liste tous les backups avec métadonnées

#### `lib/customization-detector.js`
- `detectCustomizations()` : Identifie fichiers à préserver
- `isModified(filePath)` : Vérifie si fichier modifié récemment

#### `bin/update-byan-agent.js`
Commandes CLI :
- `check` : Vérification version
- `update` : Mise à jour complète
- `backup` : Backup manuel
- `restore` : Restauration
- `list-backups` : Lister backups

### Intégration

Le binaire principal `install/bin/create-byan-agent-v2.js` expose maintenant :
- `npx create-byan-agent` : Installation initiale
- `npx create-byan-agent check` : Vérification version
- `npx create-byan-agent update` : Mise à jour
- `npx create-byan-agent restore` : Restauration

## Sécurité

### Trust But Verify (Mantra IA-1)
- Validation de la version npm avant téléchargement
- Backup automatique avant toute modification
- Rollback automatique en cas d'erreur
- Préservation des personnalisations utilisateur

### Zero Emoji dans Code (Mantra IA-23)
Tous les messages utilisateur utilisent des symboles textuels.

### Dépendances
Utilise uniquement les modules déjà présents dans BYAN :
- `https` : Requêtes npm registry (built-in)
- `fs` / `fs-extra` : Opérations fichiers
- `path` : Manipulation chemins
- `js-yaml` : Parsing config.yaml
- `chalk`, `ora`, `inquirer` : UI

## Workflow Utilisateur

### Scénario Typique

```bash
# 1. Installation initiale (v2.6.0)
npx create-byan-agent

# 2. Quelques semaines plus tard, nouvelle version disponible (v2.6.1)
npx create-byan-agent check
# → Affiche: Version actuelle: 2.6.0, npm: 2.6.1
# → Suggère: npx create-byan-agent update

# 3. Mise à jour
npx create-byan-agent update
# → Backup créé
# → Télécharge v2.6.1
# → Préserve config.yaml, _memory/, _byan-output/
# → Succès!

# 4. En cas de problème
npx create-byan-agent restore
# → Restaure backup automatiquement
```

## Mantras Applied
- IA-1: Trust But Verify
- IA-16: Challenge Before Confirm  
- IA-23: Zero Emoji in Code
- #3: KISS (Keep It Simple)
- #4: YAGNI (You Aren't Gonna Need It)
- #39: Evaluate Consequences

## License
MIT

---

**Implémenté par:** Rachid (NPM/NPX Deployment Specialist)  
**Version:** 1.0.0  
**Date:** 2025-01-20
