# YANSTALLER - Rollback Strategy Decision

**Date**: 2026-02-03  
**Décidé par**: BYAN-TEST + Yan  
**Status**: VALIDATED

---

## Question

Que faire si l'installation échoue à 50% ?

**Options évaluées**:
- A) Rollback automatique (restaurer backup)
- B) Laisser état partiel + message clair
- C) Prompt user (rollback ou garder partiel?)

---

## Décision : **OPTION B**

**Laisser état partiel + message clair**

---

## Justification

### Mantra #37 - Ockham's Razor
Simplicité first. Option B = plus simple à implémenter et maintenir.

### Analyse des risques

**Nature de l'installation YANSTALLER**:
- Copie de fichiers principalement (low risk)
- Pas de modifications système critiques
- Pas de transactions BDD
- Idempotent (peut re-run sans danger)

**Avantages Option B**:
1. ✅ User peut investiguer cause échec
2. ✅ Partiel peut être fonctionnel
3. ✅ Backup existe pour restore manuel
4. ✅ Simplicité code (pas de rollback logic complexe)
5. ✅ Logs/état préservés pour debug

**Inconvénients Option B**:
1. ❌ État potentiellement inconsistant
2. ❌ User doit décider action

**Mitigation inconvénients**:
- Message clair avec 3 options concrètes
- Commande `yanstaller doctor` pour diagnostic
- Commande `yanstaller restore <backup>` pour rollback manuel
- Ré-exécution safe (idempotence)

---

## Implémentation

```javascript
// lib/yanstaller/index.js
try {
  // Installation steps...
} catch (error) {
  logger.error('Installation failed:', error.message);
  
  if (backupPath) {
    logger.info('\nPartial installation completed.');
    logger.info(`Backup available at: ${backupPath}`);
    logger.info('\nOptions:');
    logger.info('1. Re-run: npx create-byan-agent');
    logger.info(`2. Restore backup: yanstaller restore ${backupPath}`);
    logger.info('3. Troubleshoot: yanstaller doctor');
  }
  
  throw error; // Re-throw for exit code
}
```

---

## Exit Code

Installation failure → Exit code **4** (INSTALLATION_FAILED)

---

## Alternatives futures (v2)

Si users demandent rollback auto:
- Ajouter flag `--auto-rollback`
- Ou prompt interactif post-échec

**Pour v1**: Option B suffit largement.

---

## Validation Mantras

- ✅ **#37 Ockham's Razor**: Simplicité choisie
- ✅ **#4 Fail Fast**: Error visible immédiatement
- ✅ **IA-1 Trust But Verify**: Backup existe pour verify
- ✅ **#39 Conséquences**: 3 options claires données au user

---

**Décision finale**: **VALIDÉE** ✅

**Implémenté dans**: `lib/yanstaller/index.js`
