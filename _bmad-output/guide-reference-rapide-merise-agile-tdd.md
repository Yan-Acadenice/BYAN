# GUIDE DE RÉFÉRENCE RAPIDE
## Merise Agile + TDD + Agents IA Zero Trust

**Version:** 1.0  
**Date:** 2026-02-02  
**Auteur:** Yan + Carson (Brainstorming Coach)

---

## TABLE DES MATIÈRES

1. [Vue d'Ensemble](#vue-densemble)
2. [Les 10 Commandements - Conception](#les-10-commandements---conception)
3. [Les 10 Commandements - Agents IA](#les-10-commandements---agents-ia)
4. [Workflow en 7 Étapes](#workflow-en-7-étapes)
5. [Templates Essentiels](#templates-essentiels)
6. [Checklist Sprint](#checklist-sprint)
7. [Anti-Patterns à Éviter](#anti-patterns-à-éviter)
8. [Mantras par Catégorie](#mantras-par-catégorie)

---

## VUE D'ENSEMBLE

### Qu'est-ce que Merise Agile + TDD?

**Une méthodologie qui fusionne:**
- **Merise:** Rigueur conceptuelle (MCD, MLD, MPD)
- **Agile:** Livraison incrémentale, adaptation continue
- **TDD:** Qualité par les tests (appliqué aux concepts ET au code)
- **Story Mapping:** Découverte collaborative des besoins

**Résultat:** Des systèmes bien conçus, livrés rapidement, testés rigoureusement.

### Principes Fondateurs

1. **Le Modèle Sert le Métier** - Pas l'inverse
2. **Incrémental ≠ Brouillon** - Qualité constante, périmètre variable
3. **Tester les Concepts** - Pas seulement le code
4. **Stories Révèlent Entités** - Bottom-up depuis les besoins réels
5. **Challenge Before Confirm** - Éviter le biais de confirmation

---

## LES 10 COMMANDEMENTS - CONCEPTION

### Pour l'Équipe de Développement

2. **Tu Serviras le Métier Avant Tout**
   - Le MCD est un outil, pas une fin
   - Validation métier > Élégance technique

3. **Tu Testeras Tes Concepts**
   - Règles de gestion = tests conceptuels
   - Tester AVANT d'implémenter

4. **Tu Valideras MCD avec MCT**
   - Données (MCD) et Traitements (MCT) se valident mutuellement
   - Itération jusqu'à cohérence totale

5. **Tu Évolueras Incrémentalement**
   - MCD évolue sprint par sprint
   - Ajouter sans casser (sauf refactoring assumé)

4. **Tu Collaboreras Sans Ego**
   - MCD se dessine à plusieurs
   - Questions = opportunités d'amélioration

5. **Tu Versionneras Ton Modèle**
   - MCD sous Git (format texte)
   - Diff visibles, rollback possible

6. **Tu Justifieras Tes Cardinalités**
   - Chaque (1,N) ou (0,1) a une RAISON métier
   - Valider avec des exemples concrets

7. **Tu Automatiseras Ce Qui Peut L'Être**
   - Générer CRUD, tests de base
   - Focus sur logique métier complexe

8. **Tu Parleras le Langage Métier**
   - Noms métier, pas techniques
   - Glossaire = source de vérité

9. **Tu Refactoreras Sans Peur**
   - Dette conceptuelle = intérêts à payer
   - Prioriser le refactoring du modèle

10. **Tu Livreras Vite, Apprendras Plus Vite**
    - Done > Perfect
    - Feedback réel > Planification infinie

---

## LES 10 COMMANDEMENTS - AGENTS IA

### Pour les Futurs Agents (Philosophie "Zero Trust")

1. **Tu Challengeras Avec Respect**
   - Question ≠ Insubordination
   - L'humain peut se tromper (c'est normal)

2. **Tu Détecteras Les Incohérences**
   - Si ça ne fait pas sens, LE DIRE
   - Expliquer pourquoi + proposer alternatives

3. **Tu Demanderas Confirmation Avant Destruction**
   - Lister les conséquences AVANT d'agir
   - Sauvegardes automatiques

4. **Tu Proposeras, Tu N'Imposeras Pas**
   - Suggérer des options, pas des ordres
   - Expliquer les trade-offs

5. **Tu Reconnaîtras Tes Limites**
   - "Je ne sais pas" est OK
   - Pas d'hallucination

6. **Tu Protégeras Contre Les Erreurs**
   - Empêcher les footguns
   - Double confirmation pour actions irréversibles

7. **Tu Apprendras De L'Historique**
   - Analyser les patterns des sprints passés
   - Identifier ce qui a marché/échoué

8. **Tu Challengeras AVANT De Confirmer**
   - Devil's Advocate systématique
   - Chercher d'ABORD pourquoi ça ne marche PAS

9. **Tu Écriras Du Clean Code Sans Pollution**
   - ZÉRO emoji dans le code/commits
   - ZÉRO commentaire inutile (WHAT vs WHY)

10. **Tu Laisseras L'Humain Décider**
    - L'agent conseille, l'humain décide
    - Documenter les décisions

---

## WORKFLOW EN 7 ÉTAPES

### Vue Synthétique

```
EPIC → Story Map → MCD → Tests → Interfaces → Implémentation → Validation
  ↓        ↓        ↓      ↓         ↓             ↓              ↓
30min    2-4h    1-2h   2-3h      1-2h        Sprints          1h
```

### Étape 1: EPIC Canvas (30-60 min)

**Participants:** PO + Équipe + Architecte

**Actions:**
- Définir domaine conceptuel
- Valeur métier + Objectifs
- Périmètre IN/OUT
- Critères de succès conceptuels

**Livrable:** EPIC Canvas complété

---

### Étape 2: Story Mapping Session (2-4h)

**Participants:** PO + Équipe complète

**Actions:**
1. Créer Story Map (axe horizontal = flux utilisateur)
2. Pour CHAQUE story, identifier:
   - Entités manipulées
   - Relations entre entités
   - Attributs clés
   - Règles métier

**Template Story Enrichie:**
```
En tant que [RÔLE]
Je veux [ACTION]
Afin de [BÉNÉFICE]

Impact Merise:
- Entités: [Utilisateur], [Commande]
- Relations: [Utilisateur] --(1,N)--passe--(0,N)-- [Commande]
- Règles: RG-001: email UNIQUE
- Tests: TEST-001: Deux users ne peuvent avoir même email
```

**Livrable:** Story Map + Stories annotées

---

### Étape 3: Consolidation MCD (1-2h)

**Participants:** Architecte + Tech Lead + PO

**Actions:**
1. Extraire toutes les entités découvertes
2. Détecter doublons/synonymes
3. Construire MCD incrémental par priorité
4. Valider cohérence avec PO

**Livrable:** MCD incrémental versionné + Glossaire + Matrice traçabilité

---

### Étape 4: Test-Driven Modeling (2-3h)

**Participants:** Équipe technique

**Actions:**
1. Pour chaque règle de gestion → créer test conceptuel
2. Tests de cardinalités
3. Tests d'intégration (parcours métier)
4. TOUS en ROUGE (pas de code encore!)

**Exemple de test:**
```python
def test_RG001_email_must_be_unique(self):
    """
    RG-001: Un email ne peut être associé qu'à un seul utilisateur
    Source: US-001
    MCD: Attribut 'email' de [Utilisateur] doit être UNIQUE
    """
    user1 = Utilisateur.create(email="test@example.com", password="secure123")
    
    with pytest.raises(EmailAlreadyExistsError):
        user2 = Utilisateur.create(email="test@example.com", password="other456")
```

**Livrable:** Suite de tests conceptuels (ROUGE)

---

### Étape 5: Définition des Interfaces (1-2h)

**Participants:** Équipe technique

**Actions:**
1. Transformer MCD → Classes d'entités (squelettes)
2. Définir interfaces de repositories
3. Méthodes métier (signatures uniquement)
4. Documentation liée au MCD

**Livrable:** Interfaces + Squelettes de classes

---

### Étape 6: Implémentation TDD (Sprints)

**Participants:** Développeurs

**Actions:**
1. RED: Un test conceptuel est rouge
2. GREEN: Implémenter le minimum pour le faire passer
3. REFACTOR: Améliorer en gardant tests verts
4. VÉRIFIER: MCD toujours respecté?
5. RÉPÉTER

**Livrable:** Code implémenté + Tests verts

---

### Étape 7: Validation & Refinement (1h/sprint)

**Participants:** Équipe complète

**Actions:**
1. Revue du modèle (cohérent avec stories?)
2. Mise à jour du MCD versionné
3. Documentation des décisions
4. Rétrospective conceptuelle

**Livrable:** MCD v.X+1 + Liste dettes conceptuelles + Plan amélioration

---

## TEMPLATES ESSENTIELS

### Template 1: EPIC Canvas

```markdown
# EPIC: [Nom]

## Valeur Métier
[Pourquoi cet EPIC existe?]

## Objectifs Mesurables
- KPI 1: ...
- KPI 2: ...

## Périmètre
**IN:**
- Fonctionnalité A
- Fonctionnalité B

**OUT:**
- Fonctionnalité X (reporté)

## Domaine Conceptuel (MCD)
[Diagramme]

## User Stories
- [ ] US-001: ...
- [ ] US-002: ...

## Règles de Gestion
- RG-001: ...
- RG-002: ...

## Tests Conceptuels
- [ ] TEST-001: ...
```

---

### Template 2: User Story avec Impact Merise

```markdown
### US-XXX: [Titre]

**Story:**
En tant que [RÔLE]
Je veux [ACTION]
Afin de [BÉNÉFICE]

**Critères d'acceptation:**
- [ ] Critère 1
- [ ] Critère 2

---

## IMPACT MERISE

### Entités Concernées
- **[NomEntité]**
  - Attributs: attr1, attr2
  - Type: Nouvelle | Existante | Modifiée

### Relations
- [Entité1] --(card1)--[Relation]--(card2)-- [Entité2]
  - Justification: ...

### Règles de Gestion
- **RG-XXX**: Description
  - Priorité: Critique | Importante | Nice-to-have
  - Contrainte: Check | Unique | FK | Business Logic

### Tests Conceptuels
- [ ] **TEST-XXX**: Description
  - Fichier: test_xxx.py::test_method
  - Règle validée: RG-XXX
```

---

### Template 3: Test Conceptuel

```python
"""
Fichier: tests/conceptual/test_[entite]_rules.py

Tests conceptuels pour [NomEntite]
Basés sur MCD v[X.Y] - Sprint [N]
"""

import pytest
from domain.entities import [NomEntite]
from domain.exceptions import *

class Test[NomEntite]ConceptualRules:
    """
    Tests des règles de gestion de [NomEntite]
    Source: MCD v[X.Y]
    """
    
    def test_RG_XXX_description_courte(self):
        """
        RG-XXX: Description complète de la règle
        Source: US-XXX
        MCD: [Élément du MCD concerné]
        
        Scénario:
        - GIVEN: [Contexte]
        - WHEN: [Action]
        - THEN: [Résultat attendu]
        """
        # GIVEN
        ...
        
        # WHEN
        ...
        
        # THEN
        assert ...
```

---

## CHECKLIST SPRINT

### Avant le Sprint
- [ ] EPIC Canvas complété
- [ ] Story Map créé et priorisé
- [ ] Stories annotées avec impact Merise
- [ ] MCD cible défini

### Pendant le Sprint
- [ ] Tests conceptuels écrits (RED)
- [ ] Interfaces définies
- [ ] Implémentation TDD (GREEN + REFACTOR)
- [ ] Tests unitaires/intégration ajoutés
- [ ] Code review avec focus MCD

### Fin de Sprint
- [ ] Tous les tests verts
- [ ] MCD mis à jour et versionné
- [ ] Documentation générée
- [ ] Dettes conceptuelles documentées
- [ ] Demo PO avec validation métier
- [ ] Rétrospective conceptuelle

---

## ANTI-PATTERNS À ÉVITER

### Anti-Pattern 1: "Big Design Up Front"
**Symptôme:** Vouloir modéliser TOUT le système avant de coder

**Problème:**
- Paralysie par l'analyse
- Modèle obsolète avant la première ligne de code
- Hypothèses non validées

**Solution:** Merise Incrémental
- Sprint 0: Vision globale légère (squelette)
- Sprints 1-N: Enrichissement guidé par stories
- Refactoring continu du modèle

---

### Anti-Pattern 2: "Anemic Domain Model"
**Symptôme:** Entités = simples DTO sans logique métier

**Problème:**
- Règles de gestion éparpillées dans services
- Duplication de logique
- MCD déconnecté du code

**Solution:** Domain-Driven Design
- Entités avec méthodes métier
- Règles de gestion dans les entités
- Code qui reflète le MCD

---

### Anti-Pattern 3: "No Testing of Concepts"
**Symptôme:** Tests unitaires uniquement, pas de tests conceptuels

**Problème:**
- Règles métier non validées
- Cardinalités non testées
- Bugs conceptuels découverts tard

**Solution:** Test-Driven Modeling
- Tests conceptuels AVANT implémentation
- Un test par règle de gestion
- Tests de cohérence du modèle

---

### Anti-Pattern 4: "Many-to-Many Generique"
**Symptôme:** Relations M-N sans attributs ni nom clair

**Problème:**
- Sémantique floue
- Évolution difficile
- Perte d'information

**Solution:** Entités Associatives
- Nommer la relation (ex: [Inscription], [Achat])
- Ajouter attributs pertinents (date, quantité, statut)
- Enrichir au fil des besoins

---

### Anti-Pattern 5: "Agent Béni-Oui-Oui"
**Symptôme:** Agent IA qui valide tout sans questionner

**Problème:**
- Erreurs destructives
- Biais de confirmation
- Décisions non challengées

**Solution:** Agents Zero Trust
- Challenge Before Confirm
- Detect Bullshit, Signal Bullshit
- Protection contre footguns

---

## MANTRAS PAR CATÉGORIE

### CONCEPTION - Philosophie (3 mantras)

1. **Le Modèle Sert le Métier, Pas l'Inverse**
2. **Commencer Simple, Complexifier Si Nécessaire**
3. **L'Incrémental N'Est Pas du Brouillon**

### CONCEPTION - Collaboration (3 mantras)

4. **Le MCD Se Dessine à Plusieurs**
5. **Parler Métier, Pas Technique**
6. **Montrer, Pas Seulement Décrire**

### CONCEPTION - Qualité (3 mantras)

7. **Tester les Concepts, Pas Seulement le Code**
8. **Les Contraintes Sont Nos Amies**
9. **La Dette Conceptuelle Se Paie Avec Intérêts**

### CONCEPTION - Agilité (3 mantras)

10. **Le Changement Est Normal, Pas Exceptionnel**
11. **Livrer Vite, Apprendre Plus Vite**
12. **Rétrospective Conceptuelle = Amélioration Continue**

### CONCEPTION - Technique (3 mantras)

13. **Le Code Doit Refléter le Modèle**
14. **Versionner le Schéma Comme le Code**
15. **L'Automatisation Libère la Créativité**

### CONCEPTION - User Stories (3 mantras)

16. **Une Story Révèle des Entités**
17. **Les Cardinalités Racontent une Histoire**
18. **Le MCT Complète le MCD**

### CONCEPTION - Tests (3 mantras)

19. **RED → GREEN → REFACTOR, Même pour les Modèles**
20. **Un Test Par Règle de Gestion**
21. **Les Tests Documentent les Décisions**

### CONCEPTION - Performance (2 mantras)

22. **Optimiser Après Avoir Mesuré**
23. **Normalisation vs Dénormalisation: Context Is King**

### CONCEPTION - Documentation (3 mantras)

24. **Le Code Est la Documentation**
25. **Glossaire Métier = Source de Vérité**
26. **Les Exemples Valent Mieux Que les Abstractions**

### CONCEPTION - Leadership (3 mantras)

27. **Tout le Monde Possède le Modèle**
28. **Challenger Avec Bienveillance**
29. **Former en Continu**

### CONCEPTION - Pragmatisme (3 mantras)

30. **Done Is Better Than Perfect**
31. **Savoir Quand Dire Non**
32. **Célébrer les Succès Conceptuels**

### CONCEPTION - Rigueur Merise (4 mantras) 🆕

33. **Dictionnaire de Données = Base de Tout**
34. **MCD ⇄ MCT: Validation Croisée**
35. **MOD ⇄ MOT: La Réalité Opérationnelle**
36. **Les 3 Niveaux de Merise sont Complémentaires**

---

### AGENTS IA - Intelligence (3 mantras)

1. **Trust, But Verify**
2. **Detect Bullshit, Signal Bullshit**
3. **Context Is King**

### AGENTS IA - Validation (3 mantras)

4. **Check Before Execute**
5. **Incohérence = Red Flag**
6. **Test d'Absurdité**

### AGENTS IA - Communication (3 mantras)

7. **Explain Like I'm Five (But Don't Patronize)**
8. **Show, Don't Just Tell**
9. **Feedback Sandwich (Upgraded)**

### AGENTS IA - Autonomie (3 mantras)

10. **Proactive, Not Reactive**
11. **Learn From History**
12. **Suggest, Don't Dictate**

### AGENTS IA - Humilité (3 mantras)

13. **I Don't Know Is Okay**
14. **Human Has Final Say**
15. **Bias Awareness**
16. **Challenge Before Confirm**

### AGENTS IA - Sécurité (3 mantras)

17. **Protect From Footguns**
18. **Security First**
19. **Privacy By Design**

### AGENTS IA - Collaboration (2 mantras)

20. **Agents Collaborate, Not Compete**
21. **Document For Next Agent**

### AGENTS IA - Méta-Cognition (2 mantras)

22. **Self-Aware Agent**
23. **Continuous Learning**

### AGENTS IA - Qualité Code (3 mantras)

24. **No Emoji Pollution**
25. **Clean Code = No Useless Comments**

---

## AIDE-MÉMOIRE - PROCESSUS "CHALLENGE BEFORE CONFIRM"

### Étape 1: DEVIL'S ADVOCATE (obligatoire)
- Pourquoi cette solution ÉCHOUERAIT?
- Quels sont les points faibles?
- Quelles hypothèses sont fragiles?
- Qu'est-ce qui pourrait mal tourner?

### Étape 2: ÉVALUATION
- Problèmes majeurs → ALERTER + alternatives
- Problèmes mineurs → Documenter risques
- Robuste → Passer à l'étape 3

### Étape 3: CONFIRMATION (si survit à étape 1)
- Pourquoi cette solution FONCTIONNERAIT?
- Quels sont les avantages?
- Dans quels contextes elle excelle?

### Étape 4: SYNTHÈSE OBJECTIVE
- Présenter RISQUES + BÉNÉFICES
- Recommandation nuancée
- Laisser l'humain décider

---

## MÉTRIQUES DE SUCCÈS

### Métriques Conceptuelles
- **Couverture MCD:** % entités/relations testées
- **Dette conceptuelle:** Nombre incohérences identifiées
- **Évolution MCD:** Modifications par sprint
- **Traçabilité:** % stories liées à entités

### Métriques TDD
- **Couverture code:** >= 80%
- **Tests verts:** 100% avant merge
- **Temps passage tests:** < 2 minutes
- **Tests conceptuels:** >= 1 par règle de gestion

### Métriques Agiles
- **Vélocité:** Points livrés par sprint
- **Qualité:** Bugs production
- **Time-to-market:** Durée idée → production
- **Satisfaction équipe:** Enquête régulière

---

## OUTILLAGE RECOMMANDÉ

### Story Mapping
- Miro / Mural (tableaux collaboratifs)
- StoriesOnBoard (spécialisé)
- Post-its physiques (présentiel)

### MCD
- PlantUML / Mermaid (Git-friendly!)
- Draw.io / Excalidraw (visuels)
- Vertabelo / dbdiagram.io (spécialisés)

### Tests
- pytest (Python) / Jest (JS) / JUnit (Java)
- Coverage.py (couverture)
- Mutation testing (qualité tests)

### Intégration
- Git (versioning MCD)
- GitHub Actions / GitLab CI (tests auto)
- SonarQube (qualité code)

---

## RESSOURCES

### Documents Complets
- `brainstorming-merise-agile-2026-02-02.md` - Session complète avec tous les détails

### Prochaines Lectures
- "Domain-Driven Design" - Eric Evans
- "Test-Driven Development" - Kent Beck
- "User Story Mapping" - Jeff Patton
- "Clean Code" - Robert C. Martin
- "The Pragmatic Programmer" - Hunt & Thomas

---

## SUPPORT & CONTRIBUTIONS

**Créé par:** Yan + Carson (Brainstorming Coach)  
**Version:** 1.0  
**Dernière mise à jour:** 2026-02-02  

**Feedback bienvenu!**

Pour toute question ou amélioration, référez-vous au document complet de brainstorming.

---

**En résumé:**
- 32 Mantras de Conception
- 25 Mantras pour Agents IA
- 1 Workflow en 7 étapes
- 3 Templates essentiels
- Des exemples concrets partout

**Remember:** Done Is Better Than Perfect. Commencez simple, itérez, apprenez!

---

## ANNEXE: DICTIONNAIRE DE DONNÉES

### Template Dictionnaire de Données

```markdown
# Dictionnaire de Données - [Nom du Projet]

## Données Élémentaires

| Code | Désignation | Type | Format/Longueur | Contraintes | Règles | Exemple |
|------|-------------|------|-----------------|-------------|--------|---------|
| EMAIL_USER | Adresse email utilisateur | String | xxx@yyy.zzz (RFC 5322), max 255 | UNIQUE, NOT NULL, REGEX | RG-001 | jean.dupont@example.com |
| PASSWORD_HASH | Hash du mot de passe | String | 60 caractères | NOT NULL | RG-002 | $2b$12$KIXxq... |
| DATE_CREATION | Date de création | DateTime | ISO 8601 | NOT NULL, AUTO | - | 2026-02-02T13:00:00Z |
| STATUT_USER | Statut du compte | Enum | en_attente\|actif\|suspendu | NOT NULL, DEFAULT='en_attente' | RG-004 | actif |
| MONTANT_COMMANDE | Montant total commande | Decimal | 10,2 | NOT NULL, >= 0 | RG-013 | 125.50 |

## Données Calculées

| Code | Désignation | Formule | Type Résultat | Exemple |
|------|-------------|---------|---------------|---------|
| AGE_USER | Âge de l'utilisateur | TODAY() - DATE_NAISSANCE | Integer | 35 |
| TOTAL_TTC | Montant TTC | MONTANT_HT * (1 + TAUX_TVA) | Decimal(10,2) | 150.00 |

## Glossaire Métier

| Terme | Définition | Synonymes Interdits | Utilisation |
|-------|------------|---------------------|-------------|
| Utilisateur | Personne ayant créé un compte | User, Client (si pas encore commandé) | Entité [Utilisateur] |
| Commande | Acte d'achat de produits par un utilisateur | Order, Achat | Entité [Commande] |
| Panier | Liste temporaire de produits avant commande | Cart, Caddie | Entité [Panier] |
```

### Processus de Construction du Dictionnaire

**Phase 1: Collecte (Story Mapping)**
1. Lister toutes les données mentionnées dans User Stories
2. Ne pas filtrer à ce stade (tout noter)

**Phase 2: Normalisation**
1. Identifier synonymes (email = courriel = mel → choisir UN terme)
2. Éliminer polysémies (ex: "Date" trop vague → "Date_Creation", "Date_Livraison")
3. Standardiser format de nommage (ex: SNAKE_CASE ou camelCase)

**Phase 3: Typage**
1. Définir type pour chaque donnée (String, Integer, Decimal, DateTime, Boolean, Enum)
2. Préciser format/longueur
3. Ajouter contraintes (UNIQUE, NOT NULL, CHECK, DEFAULT)

**Phase 4: Validation Métier**
1. Présenter au PO pour validation terminologie
2. Clarifier ambiguïtés
3. Documenter décisions

**Phase 5: Liens avec Règles**
1. Associer chaque donnée aux règles de gestion qui la concernent
2. Créer traçabilité Donnée ↔ Règle ↔ Test

---

## ANNEXE: VALIDATION CROISÉE MCD ⇄ MCT

### Matrice de Traçabilité

```markdown
# Matrice MCD ⇄ MCT

## Vue: Entité → Traitements

| Entité MCD | Traitement Créateur | Traitement Modifieur | Traitement Suppresseur | Traitements Lecteurs |
|------------|---------------------|----------------------|------------------------|----------------------|
| Utilisateur | T01: Créer compte | T02: Modifier profil<br>T03: Réinitialiser MDP | T04: Supprimer compte | T05: Afficher profil<br>T06: Authentifier<br>T07: Lister users (admin) |
| Commande | T08: Passer commande | T09: Annuler commande<br>T10: Modifier statut | T11: Archiver commande | T12: Voir mes commandes<br>T13: Détail commande |
| Produit | T14: Créer produit (admin) | T15: Modifier produit (admin)<br>T16: Ajuster stock | T17: Supprimer produit (admin) | T18: Lister produits<br>T19: Rechercher produits<br>T08: Passer commande |

## Vue: Traitement → Entités

| Traitement MCT | Entités Lues | Entités Créées | Entités Modifiées | Entités Supprimées |
|----------------|--------------|----------------|-------------------|-------------------|
| T01: Créer compte | - | Utilisateur<br>ConfirmationEmail | - | - |
| T08: Passer commande | Utilisateur<br>Produit<br>Stock | Commande<br>LigneCommande | Stock (décrémente) | - |
| T09: Annuler commande | Commande<br>LigneCommande | Remboursement | Commande (statut)<br>Stock (incrémente) | - |

## Checklist de Validation

### Pour chaque entité du MCD:
- [ ] A un traitement créateur identifié dans MCT
- [ ] A au moins un traitement lecteur dans MCT
- [ ] Si supprimable: a un traitement suppresseur dans MCT
- [ ] Toutes ses relations sont utilisées par au moins un traitement

### Pour chaque traitement du MCT:
- [ ] Toutes les entités qu'il lit existent dans MCD
- [ ] Toutes les entités qu'il crée existent dans MCD
- [ ] Toutes les entités qu'il modifie existent dans MCD
- [ ] Toutes les relations qu'il utilise existent dans MCD
- [ ] A accès à toutes les données nécessaires

### Cas problématiques à détecter:
- [ ] Entité "orpheline" (pas de traitement créateur)
- [ ] Entité "zombie" (jamais consultée)
- [ ] Traitement "impossible" (données manquantes)
- [ ] Relation "inutile" (jamais traversée par aucun traitement)
```

---

## ANNEXE: VALIDATION CROISÉE MOD ⇄ MOT

### Checklist Validation Opérationnelle

```markdown
# Validation MOD ⇄ MOT

## 1. Cohérence Géographique

| Traitement (MOT) | Localisation Exécution | Données Nécessaires (MOD) | Localisation Données | Problème? | Solution |
|------------------|------------------------|---------------------------|----------------------|-----------|----------|
| Passer commande | EU-West (API) | Utilisateur, Produit, Stock | EU-West | ✓ OK | - |
| Afficher commandes US | US-East (API) | Commande, Utilisateur | EU-West | ⚠️ Latence transatlantique | Réplication Commande vers US-East |

## 2. Cohérence Temporelle

| Données (MOD) | Disponibilité | Archivage | Traitement (MOT) | Horaires Traitement | Problème? | Solution |
|---------------|---------------|-----------|------------------|---------------------|-----------|----------|
| Utilisateur | 24/7 | Après 3 ans inactivité | Authentifier | 24/7 | ✓ OK | - |
| Commande | 24/7 | Après 2 ans | Statistiques annuelles | Batch quotidien 2h | ⚠️ Stats sur 5 ans mais archive à 2 ans | Garder metadata pour stats après archivage |

## 3. Cohérence Volumes/Performance

| Données (MOD) | Volume | Croissance | Traitement (MOT) | Fréquence | Charge | Problème? | Solution |
|---------------|--------|------------|------------------|-----------|--------|-----------|----------|
| Produit | 10K | +1K/an | Recherche produits | 1000 req/min | Read-heavy | ✓ OK | Cache Redis |
| Commande | 1M | +500K/an | Passer commande | 100 req/min | Write-heavy | ⚠️ Contention DB | Partitioning par date |

## 4. Cohérence Sécurité

| Données (MOD) | Droits d'Accès | Acteur (MOT) | Besoin Accès | Problème? | Solution |
|---------------|----------------|--------------|--------------|-----------|----------|
| Utilisateur | User: ses données<br>Admin: toutes données | Service client | Données contact uniquement | ⚠️ Trop de droits si admin | Créer rôle "support" avec droits restreints |
| Paiement | Admin uniquement | Client | Consulter historique paiements | ⚠️ Client ne peut pas voir ses paiements | Ajouter vue masquée (4 derniers chiffres carte) |

## 5. Cohérence Technique

| Infrastructure (MOD) | Stack (MOT) | Compatible? | Problème? | Solution |
|----------------------|-------------|-------------|-----------|----------|
| PostgreSQL 15 | Node.js + pg driver | ✓ OK | - | - |
| Réplication Multi-Region | API stateless | ✓ OK | - | - |
| Cryptage at-rest | Service de recherche full-text | ⚠️ Impossible indexer données cryptées | Index sur hash ou champs non sensibles |
```

---

**Version:** 1.1 (Ajout Rigueur Merise)  
**Dernière mise à jour:** 2026-02-02 (avec Dictionnaire, MCT, MOD/MOT)

---

## ANNEXE: TECHNIQUES DE RÉSOLUTION DE PROBLÈMES

### 1. Rasoir d'Ockham - Checklist

**Avant d'ajouter de la complexité, demande-toi:**

```markdown
Design (MCD):
[ ] Cette entité est-elle vraiment nécessaire?
[ ] Cette relation apporte-t-elle de la valeur?
[ ] Cet attribut sera-t-il vraiment utilisé?
[ ] Peut-on fusionner ces entités similaires?
[ ] Cette relation 1-1 indique-t-elle une fusion possible?

Code:
[ ] Cette abstraction simplifie-t-elle vraiment?
[ ] Ce pattern est-il justifié par la complexité actuelle?
[ ] Cette couche résout-elle un problème réel?
[ ] Combien d'implémentations concrètes de cette interface?
[ ] Ce "au cas où" est-il vraiment nécessaire maintenant?

Architecture:
[ ] Ce microservice est-il vraiment nécessaire?
[ ] Cette queue/cache/service externe simplifie-t-il vraiment?
[ ] Peut-on résoudre avec moins de composants?
[ ] Le gain justifie-t-il la complexité opérationnelle?
```

**Red Flags de sur-engineering:**
- Entité avec 1 seul attribut
- Relation 1-1 systématique
- Classe avec 1 seule méthode
- Pattern appliqué "au cas où"
- Abstraction avec 1 seule implémentation
- "On pourrait avoir besoin un jour..."

**Règle d'or:**
```
Commencer SIMPLE → Ajouter complexité QUAND nécessaire
Pas: Commencer complexe → Espérer simplifier plus tard
```

---

### 2. Inversion Thinking - Techniques

#### Technique 1: Inversion de Relation (MCD)

**Quand:** Relation floue, attributs manquants, cardinalités complexes

**Comment:** Au lieu de partir des entités, partir de la RELATION comme entité

**Exemple:**
```
Avant (bloqué):
[Professeur] --(?)-- [Matière]
→ Où mettre horaires, salle, niveau?

Après inversion:
[Cours] = entité centrale
[Professeur] --(0,N)--dispense--(1,N)-- [Cours]
[Matière] --(1,1)--définit--(0,N)-- [Cours]
[Cours]: horaires, salle, niveau, semestre
→ Clair et extensible!
```

#### Technique 2: Inversion de Flux (MCT)

**Quand:** Performance problématique, contention, complexité des locks

**Comment:** Au lieu de PUSH, PULL. Au lieu de demander, être notifié

**Exemple:**
```
Avant (complexe):
Vérifier stock → Lock → Décrémente → Release
→ Contention, timeouts

Après inversion (Event-driven):
Stock émet "StockBas" → Panier s'abonne
→ Dispo temps réel SANS lock
```

#### Technique 3: Inversion de Contrainte

**Quand:** Code défensif partout (if null, if error...)

**Comment:** Rendre l'état invalide IMPOSSIBLE plutôt que détecter/bloquer

**Exemple:**
```
Avant:
email = user.email
if email is None or not is_valid_email(email):
    raise Error()
→ Validation partout

Après (Value Object):
class Email:
    def __init__(self, value):
        if not valid(value): raise Error()
        self._value = value  # Immuable
→ Impossible d'avoir Email invalide!
```

#### Technique 4: Inversion de Cardinalité

**Quand:** Logique optionnelle complexe, null checks partout

**Comment:** Transformer (0,N) en (1,N) avec valeur par défaut neutre

**Exemple:**
```
Avant:
[User] --(0,1)-- [Abonnement]
→ Null checks partout

Après:
[User] --(1,1)-- [Abonnement]
Type: FREE (défaut), PREMIUM, ENTERPRISE
→ TOUS ont abonnement, code simplifié
```

#### Technique 5: Inversion de Responsabilité

**Quand:** Couplage fort, classe connaît trop de dépendances

**Comment:** Dependency Inversion - émettre événements au lieu d'appeler services

**Exemple:**
```
Avant (couplage):
CommandeService → EmailService, SMSService, PushService
→ Connaît tous les notificateurs

Après (inversion):
CommandeService émet "CommandeChangée"
Services s'abonnent aux événements
→ Découplage total!
```

#### Technique 6: Inversion de Temps (Event Sourcing)

**Quand:** Besoin d'historique, auditabilité, voyage dans le temps

**Comment:** Stocker ÉVÉNEMENTS au lieu d'ÉTAT final

**Exemple:**
```
Avant (state):
UPDATE commande SET statut = 'livrée'
→ État historique perdu

Après (events):
Store: CommandeCréée, CommandePayée, CommandeExpédiée, CommandeLivrée
État présent = replay tous événements
Historique = liste événements
→ Auditabilité totale!
```

---

### 3. Questions d'Inversion Systématiques

**Tableau de Transformation:**

| Au lieu de... | Demande-toi... |
|---------------|----------------|
| Comment faire X? | Comment NE PAS faire X? (éviter ça) |
| Comment ajouter? | Comment retirer? |
| Comment valider? | Comment rendre invalide impossible? |
| Comment notifier? | Comment être notifié? |
| A appelle B | B s'abonne à A |
| Stocker résultat | Stocker processus |
| Empêcher conflit | Permettre puis résoudre |
| Bloquer ressource | Rendre indisponible dès consultation |
| Ressource unique | Pool de ressources équivalentes |

---

### 4. Processus de Résolution par Inversion

**Étapes:**

1. **Identifier le blocage**
   - Quel est le problème exact?
   - Depuis combien de temps bloqué? (>30min = inverser!)

2. **Lister les hypothèses**
   - Quelles suppositions ai-je faites?
   - Qu'est-ce que je tiens pour acquis?

3. **Inverser une hypothèse**
   - Choisir 1 hypothèse
   - L'inverser complètement
   - Explorer cette nouvelle direction

4. **Évaluer la nouvelle solution**
   - Est-elle plus simple?
   - Résout-elle le problème initial?
   - Quels nouveaux problèmes crée-t-elle?

5. **Itérer ou adopter**
   - Si mieux: adopter
   - Si pas mieux: inverser autre hypothèse
   - Si toujours bloqué: demander aide externe

**Exemple concret:**
```
Problème: Comment empêcher deux users de réserver même créneau?

Hypothèses initiales:
1. "Je dois EMPÊCHER la réservation double"
2. "Le créneau est UNIQUE"
3. "La réservation est IMMÉDIATE"

Inversion #1: PERMETTRE puis RÉSOUDRE
→ Overbooking + compensation (airlines)

Inversion #2: POOL au lieu d'UNIQUE
→ "Lundi 14h-16h n'importe quelle salle"

Inversion #3: PRE-HOLD au lieu d'IMMÉDIAT
→ 5min de réservation dès consultation

Résultat: 3 solutions découvertes!
```

---

**Version:** 1.2 (Ajout Résolution de Problèmes)  
**Dernière mise à jour:** 2026-02-02

---

## ANNEXE: ÉVALUATION DES CONSÉQUENCES

### Mantra #39: "Chaque Action a des Conséquences"

**Principe:** AVANT toute action importante, évaluer les conséquences (positives ET négatives)

---

### Checklist Universelle (10 Dimensions)

```markdown
AVANT toute action importante:

1. SCOPE
   [ ] Qui/Quoi est impacté directement?
   [ ] Qui/Quoi est impacté indirectement?
   [ ] Environnements affectés (dev, staging, prod)?

2. DONNÉES
   [ ] Impact sur données existantes?
   [ ] Migration nécessaire?
   [ ] Réversibilité possible?
   [ ] Backup en place?

3. CODE
   [ ] Nombre de fichiers impactés?
   [ ] Tests cassés?
   [ ] API publique modifiée?
   [ ] Rétrocompatibilité?

4. ÉQUIPE
   [ ] Communication nécessaire?
   [ ] Formation requise?
   [ ] Documentation à mettre à jour?

5. CLIENTS/USERS
   [ ] Expérience utilisateur impactée?
   [ ] Fonctionnalité cassée?
   [ ] Performance dégradée?

6. LÉGAL/CONFORMITÉ
   [ ] RGPD/Privacy OK?
   [ ] Audit trail maintenu?
   [ ] Conformité réglementaire?

7. OPÉRATIONS
   [ ] Déploiement complexe?
   [ ] Rollback plan?
   [ ] Monitoring adapté?
   [ ] Alerts configurées?

8. DÉPENDANCES
   [ ] Services externes impactés?
   [ ] Intégrations tierces?
   [ ] Batch/Cron jobs?
   [ ] Scripts automatisés?

9. TEMPS
   [ ] Délai de réalisation réaliste?
   [ ] Fenêtre de déploiement OK?
   [ ] Disponibilité équipe?

10. ALTERNATIVES
    [ ] Y a-t-il une solution plus sûre?
    [ ] Peut-on faire un POC d'abord?
    [ ] Déploiement progressif possible?
```

---

### Niveaux de Risque

**🟢 FAIBLE:**
- Action locale, isolée
- Facilement réversible
- Impact limité
→ Validation standard

**🟡 MOYEN:**
- Impact multi-composants
- Réversibilité coûteuse
- Users partiellement impactés
→ Revue par pair + tests renforcés

**🔴 ÉLEVÉ:**
- Impact système large
- Difficilement réversible
- Users fortement impactés
→ Revue archi + approbation + plan B

**🔥 CRITIQUE:**
- Irréversible
- Impact prod direct
- Légal/Financier en jeu
→ Comité + tests exhaustifs + rollback testé

---

### Red Flags (Signaux d'Alarme)

```
🚩 "C'est juste un petit changement..."
🚩 "Ça marchera, j'en suis sûr!"
🚩 "Pas besoin de tester, c'est évident"
🚩 "On verra bien ce qui se passe"
🚩 "Ça peut pas casser grand chose"
🚩 "Je déploie et on debug après"
🚩 "Personne n'utilise ça de toute façon"
🚩 "Le client veut ça NOW, pas le temps"
```

**Si tu entends ça (ou tu le penses) → STOP et ÉVALUE!**

---

### Exemples de Conséquences Non Anticipées

#### 1. Tests sur BDD Production
```
Action: Lancer tests unitaires sur projet existant
Conséquence: Tests modifient la BDD de prod!

Prevention:
✓ BDD de test dédiée
✓ Rollback automatique
✓ Mock services externes
✓ Tests isolés
```

#### 2. Changement de Cardinalité
```
Action: (0,N) → (1,N) "pour simplifier"
Conséquence: Nouveaux users ne peuvent plus s'inscrire!

Prevention:
✓ Analyser flux d'inscription
✓ Vérifier données existantes
✓ Impact sur tests
```

#### 3. Suppression d'Entité "Inutile"
```
Action: Supprimer [Log] "jamais utilisée"
Conséquence: Batch nocturne crash, audit perdu!

Prevention:
✓ Vérifier batch/cron
✓ Contraintes légales
✓ Dépendances externes
✓ Comprendre historique
```

#### 4. Renommage "Innocent"
```
Action: OrderService → CommandeService
Conséquence: API publique cassée, clients impactés!

Prevention:
✓ API publique?
✓ Nombre de références
✓ Impact clients/partenaires
✓ Dépréciation progressive
```

#### 5. Validation "Évidente"
```
Action: Email .com ou .fr uniquement
Conséquence: Clients internationaux bloqués!

Prevention:
✓ % users bloqués
✓ Expansion internationale
✓ Conformité légale
✓ Alternatives moins restrictives
```

#### 6. Déploiement "Rapide"
```
Action: "Urgent, je déploie direct!"
Conséquence: Bug affecte 10K users, rollback impossible!

Prevention:
✓ Tests passés
✓ Revue code
✓ Rollback plan
✓ Migration réversible
✓ Monitoring
✓ Équipe dispo
```

---

### Principe de Précaution Technique

```
"Si tu n'es pas SÛR à 100% des conséquences,
 prends le temps de les ÉVALUER avant d'agir."

Mieux vaut:
- 1h d'analyse préventive
Que:
- 10h de correction après
- Perte de données
- Réputation endommagée
- Stress équipe
```

---

### Culture du Conséquentialisme

**Bon réflexe équipe:**
- Demander systématiquement: "Quelles conséquences?"
- Documenter impacts identifiés
- Célébrer détection de conséquence non-évidente
- Post-mortem: "Qu'avions-nous raté?"
- Apprendre des incidents

**Objectif:**
Développer le "sixième sens" des conséquences
→ Moins d'incidents
→ Meilleure qualité

---

**Version:** 1.3 (Ajout Évaluation Conséquences)  
**Dernière mise à jour:** 2026-02-02
