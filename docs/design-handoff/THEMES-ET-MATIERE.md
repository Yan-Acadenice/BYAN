# Thèmes et matière — spécification complète

Complément au `README.md` de cette passation. Ce document contient tout ce qu'il faut pour implémenter les deux thèmes et le verre. Les valeurs sont exactes et les contrastes ont été mesurés, pas estimés.

---

## 1. La ligne qui bloque tout

`app/renderer/tailwind.config.js` déclare déjà `darkMode: 'class'`. Le mécanisme existe.

Mais `app/renderer/index.css` écrit, sur le `body` :

```
@apply antialiased bg-ink-950 text-ink-100 font-sans;
```

Tant que ces deux couleurs sont posées en dur, **aucune classe sur la racine ne peut produire un thème clair**. C'est le premier changement à faire, avant tout le reste : le `body` ne porte plus de couleur, les surfaces viennent des tokens.

---

## 2. Les deux rampes, et la règle qui les relie

AcadéNice est un système clair. Le mode sombre est une **extension** : deux paliers ajoutés sous `--neutral-950`, dans la même teinte (hue ≈ 176°), qui prolongent la progression existante au lieu de l'inventer.

```
--neutral-975:  #131E1D
--neutral-1000: #0C1312
```

À ajouter dans le `styles.css` d'AcadéNice pour que le système reste la source unique.

### 2.1 Correspondance par rôle

| Rôle | Sombre | Clair |
|---|---|---|
| Fond de page | `#0C1312` *neutral-1000* | `#F7FAFA` *neutral-50* |
| Surface de carte | `#131E1D` *neutral-975* | `#FFFFFF` |
| Surface élevée (modale, menu) | `#1A2827` *neutral-950* | `#FFFFFF` + ombre |
| Surface au survol | `#2A3D3C` *neutral-900* | `#EEF3F3` *neutral-100* |
| Bordure discrète | `rgba(208,245,240,.07)` | `#DCE8E7` *neutral-200* |
| Bordure nette | `rgba(208,245,240,.12)` | `#BDD0CF` *neutral-300* |
| Titre fort | `#FFFFFF` — 17,4:1 | `#0A2E2A` *teal-950* — 15,8:1 |
| Texte de corps | `#DCE8E7` *neutral-200* — 13,6:1 | `#1A2827` *neutral-950* — 14,5:1 |
| Texte secondaire | `#94B0AF` *neutral-400* — 7,4:1 | `#425E5D` *neutral-700* — 8,7:1 |
| **Texte tertiaire (plancher)** | `#6B9190` *neutral-500* — 4,95:1 | `#527472` *neutral-600* — 4,88:1 |
| **Tiret non mesuré** | `#527472` *neutral-600* — 3,34:1 | `#6B9190` *neutral-500* — 3,29:1 |

### 2.2 La règle à retenir : neutral-500 et neutral-600 échangent leurs rôles

C'est l'erreur que j'ai faite en construisant le clair, et elle est instructive. Le clair **n'est pas** le sombre avec les valeurs inversées une à une : c'est la rampe lue **par l'autre bout**.

En sombre, s'effacer veut dire *descendre* vers le fond. En clair, s'effacer veut dire *monter* vers le fond. Donc les deux paliers les plus proches du plancher permutent :

- `neutral-500` est le plancher de lisibilité en sombre, et le tiret en clair.
- `neutral-600` est le tiret en sombre, et le plancher de lisibilité en clair.

Si un token est câblé « tertiaire = neutral-500 » sans distinction de thème, le clair perd un point de contraste sur **tout** l'étage atténué — et le tiret sort de la rampe par le bas. C'est exactement ce qui s'est produit, mesuré à 2,31:1 au lieu de 3,3:1.

`#94B0AF` ne doit servir à **aucun texte en clair**. En sombre c'est le secondaire ; en clair c'est une valeur de bordure ou d'icône, rien de plus.

### 2.3 Les quatre couleurs de rôle

Chacune perd environ quatre points de contraste sur fond clair, donc chacune descend d'un cran.

| Rôle | Sombre | Clair | Fond doux (clair) |
|---|---|---|---|
| Action, actif, focus, lien | `#4CCCB8` *primary* — 8,7:1 | `#1C7269` *teal-700* — 5,5:1 | `#EDFAF8` *teal-50* |
| Changement, attente | `#FDA100` *accent* — 8,4:1 | `#9E5200` *amber-700* — 5,4:1 | `#FFF8E6` / `#FFEDB8` |
| Conflit destructeur | `#EF4444` *danger* — 4,6:1 | `#991B1B` *danger-dark* — 7,9:1 | `#FEE2E2` *danger-bg* |
| Bilan, serveur en marche | `#22C55E` *success* — 7,5:1 | `#065F46` *success-dark* — 7,4:1 | `#D1FAE5` *success-bg* |

**Point de vigilance : le rouge et l'ambre se touchent** dans l'aperçu — un compteur de conflits contre un compteur de mises à jour. Aux valeurs de marque sur fond clair, ils se confondaient. Aux valeurs ci-dessus, l'écart tient. C'est le premier endroit à revérifier si l'une des deux bouge.

**Différence structurelle entre les deux thèmes.** En sombre, une carte d'état garde un fond neutre et seule sa bordure porte la couleur. En clair, le fond teinté devient nécessaire : sur blanc, une bordure ambre et une bordure rouge se lisent presque pareil à distance. Le rôle de la couleur ne change pas ; sa surface d'application, si.

### 2.4 La règle du bouton, identique dans les deux thèmes

`.btn-primary` d'AcadéNice est blanc sur teal, soit **1,97:1**. C'est un défaut du design system, pas du thème — il échoue dans les deux.

Règle unique qui le corrige :

```
Texte foncé sur teal, toujours.
  sombre : fond #4CCCB8, texte #0C1312  → 9,6:1
  clair  : fond #4CCCB8, texte #0A2E2A  → 7,4:1
```

Même chose pour l'ambre en aplat : texte foncé, jamais blanc (blanc sur ambre = 2,04:1).

À remonter dans `styles.css` — ça ne concerne pas que BYAN Desktop.

---

## 3. Le verre

### 3.1 La règle qui fait tenir le reste

Le verre appartient aux couches qui **flottent au-dessus** : en-tête, bandeau d'identité, barre de saisie, menus, pied d'action. Le contenu qui porte de l'information reste **opaque**.

Ce n'est pas une demi-mesure. C'est ce qui distingue le verre liquide du verre décoratif, et c'est aussi ce qui sauve les contrastes : sur du translucide, un contraste devient une fourchette, pas une valeur.

### 3.2 Les deux recettes

```
/* Sombre */
background: rgba(19,30,29,.85);
backdrop-filter: blur(24px) saturate(160%);
border: 1px solid rgba(208,245,240,.10);
box-shadow: inset 0 1px 0 rgba(208,245,240,.14),
            0 10px 34px rgba(0,0,0,.32);

/* Clair */
background: rgba(255,255,255,.72);
backdrop-filter: blur(24px) saturate(180%);
border: 1px solid rgba(26,40,39,.09);
box-shadow: inset 0 1px 0 rgba(255,255,255,.95),
            0 10px 30px rgba(26,40,39,.07);
```

Deux détails qui portent tout l'effet :

- **Le liseré intérieur clair** (`inset 0 1px 0`) fait plus pour la matière que le flou lui-même. Sans lui, c'est un panneau semi-transparent. Avec, c'est une arête taillée.
- **La saturation monte plus haut en clair** (180 % contre 160 %). Sans elle, le flou lave les couleurs vers le gris et le teal devient boueux.

### 3.3 L'opacité n'est pas un curseur esthétique, c'est un budget de contraste

Le verre sombre a d'abord été posé à `.62`. À 38 % de transmission, le texte enfoui derrière restait **lisible** et rentrait en collision avec les libellés du bandeau : le fond parlait par-dessus le premier plan. À `.85`, il devient de la texture — ce qu'il doit être.

Contrainte dure : après compositing, les libellés atténués de la barre doivent encore passer leur plancher. Si le fond descend sous `.85` en sombre, l'étage atténué doit monter d'un cran en compensation.

### 3.4 Les trois limites

1. **Jamais de verre sous une donnée.** Un chiffre mesuré, un chemin de fichier, un bloc de code, un texte long : surface opaque. Le tiret de la consommation était déjà à la limite du lisible sur surface pleine ; sur du translucide il disparaît.
2. **Le verre n'a de sens que si quelque chose passe derrière.** La barre latérale n'a rien derrière elle : elle reste solide, avec seulement le liseré. Du verre sur du vide, c'est une teinte de plus, pas une matière.
3. **Le coût est à mesurer, pas à supposer.** Trois couches de `backdrop-filter` qui se recalculent à chaque morceau de flux, dans Electron, sur une machine Linux sans compositeur GPU. Impossible à chiffrer sans la machine cible. À vérifier avant de valider.

### 3.5 Règle de géométrie, pour que le verre se voie

Le tuck — le débord du contenu sous la couche de verre — n'est pas un détail cosmétique : sans lui, le verre ne se prouve pas.

Contraintes vérifiables :

- **Exactement une unité** (une bulle, une ligne de fichier) traverse chaque bord de verre.
- **Aucune unité entièrement enfouie** derrière le verre, et aucune entièrement hors cadre.
- **Aucune unité coupée** par le clipping du conteneur.
- Le débord visible doit dépasser ~20 px sur une unité de 35 px, sinon rien ne se trouble à l'œil.

Piège rencontré deux fois : **ajouter des lignes ne change pas la profondeur du débord.** Les lignes ont un pas fixe, donc le croisement est invariant modulo ce pas. Le levier est le **décalage** de la pile, pas son nombre d'éléments.

---

## 4. Le sélecteur de thème

`app/DESIGN-BRIEF.md` le spécifie déjà dans Paramètres → Apparence, avec trois choix : **sombre, clair, système**. Ce n'est donc pas un interrupteur à deux positions.

Conséquence que la spécification ne traite pas : avec « système », le thème peut changer **sans que l'utilisateur agisse** — au coucher du soleil, en pleine réponse en train de s'écrire.

Règle proposée, à valider :

- L'app suit l'OS **immédiatement**, y compris pendant un flux.
- **Une exception :** jamais pendant qu'une modale de conséquence est ouverte. Un fond qui change au moment où l'utilisateur lit « ça va écraser trois fichiers » est le pire instant possible. Le changement s'applique à la fermeture.

L'écran Paramètres → Apparence n'a pas de maquette dans cette passation. C'est le seul endroit où les deux thèmes se rencontrent, donc le seul où un aperçu côte à côte au moment du choix a du sens.

---

## 5. Ce que les maquettes couvrent, et ce qu'elles ne couvrent pas

| Fichier | Thème | Écrans |
|---|---|---|
| `architecture-ux.html` | — | Le document d'architecture UX (parcours, rôles, états, audit du code) |
| `mock-solide-sombre.html` | Sombre, surfaces pleines | Chat local · Aperçu · États |
| `mock-verre-sombre-et-clair.html` | Sombre **et** clair, verre | Chat local dans les deux thèmes + la spécification de matière |
| `mock-clair.html` | Clair, verre | Aperçu · États |

**Non couvert :** le chat cloud (le code n'a pas été lu), la connexion, le tableau de bord, Projets, Mémoires, Serveurs MCP, et l'écran Paramètres → Apparence qui contient le sélecteur de thème.

---

## 6. Ordre d'implémentation

Ce lot s'insère **avant** le lot 4 du `README.md` (le remplacement des cinquante occurrences de bleu), parce qu'il définit les tokens que ce lot consomme.

1. Retirer les couleurs en dur du `body` dans `index.css`.
2. Ajouter les deux paliers sombres dans le `styles.css` d'AcadéNice.
3. Poser les deux jeux de tokens par rôle (section 2.1), en une seule couche commutée par une classe sur la racine. **Pas deux jeux de valeurs écrits à la main** — c'est ce qui a produit le décalage d'un cran décrit en 2.2, et une couche unique le rend impossible par construction.
4. Corriger `.btn-primary` : texte foncé sur teal (section 2.4).
5. Ajouter les deux recettes de verre comme utilitaires, et les appliquer uniquement aux couches flottantes (section 3.1).
6. Construire l'écran Paramètres → Apparence avec le sélecteur à trois états.
7. Réécrire `app/DESIGN-BRIEF.md` : il interdit le verre en toutes lettres, trois fois, et annonce le thème clair comme « coming soon ». Les deux sont désormais faux.
