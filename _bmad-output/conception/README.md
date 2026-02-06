# Documentation de Conception - BYAN v2.0

**Version:** 2.0.0-HYPER-MVP  
**Date:** 2026-02-04  
**Status:** En Conception  
**Auteur:** Yan

---

## 📋 TABLE DES MATIÈRES

Cette documentation détaille la conception technique de BYAN v2.0, une plateforme d'orchestration d'agents IA.

### Documents de Conception

1. **[Vision et Principes](./01-vision-et-principes.md)**
   - Vision produit
   - Objectifs HYPER-MVP
   - Principes architecturaux (Mantras appliqués)

2. **[Architecture Technique](../architecture/byan-v2-0-architecture-node.md)** *(référence)*
   - Vue d'ensemble système
   - Architecture en couches
   - Stack technique Node.js/JavaScript

3. **[Composants Détaillés](./03-composants/)**
   - [Context Layer](./03-composants/context-layer.md) - Gestion hiérarchique contexte
   - [Economic Dispatcher](./03-composants/economic-dispatcher.md) - Routing intelligent
   - [Worker Pool](./03-composants/worker-pool.md) - Pool de workers async
   - [Workflow Executor](./03-composants/workflow-executor.md) - Orchestration YAML
   - [Observability Layer](./03-composants/observability-layer.md) - Logs + Metrics

4. **[Interfaces et API](./04-interfaces-api.md)**
   - API publiques
   - Interfaces internes
   - Contrats de service

5. **[Modèles de Données](./05-data-models.md)**
   - Structures YAML (Context, Workflow)
   - Objets JavaScript (Task, Result)
   - Schémas de validation

6. **[Flux de Données](./06-flux-de-donnees.md)**
   - Scénarios d'exécution
   - Diagrammes de séquence
   - Gestion d'erreurs

7. **[Décisions Architecturales](./07-decisions-architecturales.md)** (ADR)
   - ADR-001: Node.js vs Python
   - ADR-002: In-Memory Cache vs Redis
   - ADR-003: Rule-Based vs ML Dispatcher
   - ADR-004: Worker Pool Statique vs Dynamique

---

## 🎯 RÉFÉRENCES

### Documents sources
- **Session Brainstorming:** [`../brainstorming/brainstorming-session-2026-02-04.md`](../brainstorming/brainstorming-session-2026-02-04.md)
- **Architecture Node.js:** [`../architecture/byan-v2-0-architecture-node.md`](../architecture/byan-v2-0-architecture-node.md)
- **Diagrammes UML:** [`../architecture/diagrams/`](../architecture/diagrams/)

### Agents BMAD impliqués
- **Carson (Brainstorming Coach)** - Session créative et idéation
- **Paige (Tech Writer)** - Documentation technique *(à déléguer)*
- **Winston (Architect)** - ADR et décisions *(à déléguer)*
- **Amelia (Dev)** - Specs techniques détaillées *(à déléguer)*

---

## 📅 TIMELINE

| Phase | Durée | Status |
|-------|-------|--------|
| Phase 0: Brainstorming | 4h | ✅ Complété (2026-02-04) |
| Phase 1: Documentation Conception | 1-2j | 🔄 En cours |
| Phase 2: Implémentation MVP | 7j | ⏸️ À venir |
| Phase 3: Tests & Validation | 2j | ⏸️ À venir |

---

## 🚀 COMMENT UTILISER CETTE DOC

**Pour créer les documents manquants, utilise les agents BMAD:**

```bash
# 1. Tech Writer pour documentation
@bmad-tech-writer
> "Créer 01-vision-et-principes.md basé sur brainstorming session"

# 2. Architect pour ADR
@bmad-architect  
> "Créer ADR (Architecture Decision Records) pour BYAN v2.0"

# 3. Dev pour specs techniques
@bmad-dev
> "Créer specs détaillées pour Context Layer avec API et interfaces"
```

**Progression suggérée:**
1. ✅ **Index créé** (ce fichier)
2. 🔄 **Déléguer à Tech Writer** → Documents 1, 4, 5, 6
3. 🔄 **Déléguer à Architect** → Document 7 (ADR)
4. 🔄 **Déléguer à Dev** → Document 3 (Composants)
5. ✅ **Review & validation** → Tout le monde
6. 🚀 **Implémentation** → Dev avec specs complètes

---

**Document créé le 2026-02-04**  
*Index de la documentation de conception BYAN v2.0*
