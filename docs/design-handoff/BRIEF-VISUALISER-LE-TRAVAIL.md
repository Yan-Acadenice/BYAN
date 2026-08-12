# Brief de conception — rendre visible le travail d'un workflow dans le chat

Destinataire : Claude Design (ou tout designer sans accès au dépôt).
Ce document est autoportant : tout ce qui suit est mesuré dans le code de
`Yan-Acadenice/BYAN`, dossier `app/`, pas supposé.

---

## 1. Ce qu'on te demande, en une phrase

Le chat de BYAN Desktop lance parfois un **workflow** : plusieurs agents qui
travaillent en parallèle ou en chaîne, chacun sur un modèle différent, chacun
consommant du contexte. Aujourd'hui l'utilisateur voit **une ligne de texte qui
défile**. Trouve la forme visuelle qui rend ça lisible — pendant, et surtout
après.

Ce n'est pas une demande de joli. C'est une demande de lisibilité sous cinq
contraintes qui se contredisent, listées en section 5. Si ta proposition ne
tranche pas ces contradictions, elle n'a pas répondu.

---

## 2. Le vocabulaire réel, et rien d'inventé

Quatre notions, distinctes, souvent confondues par ceux qui découvrent le
système. La confusion est le premier problème à résoudre visuellement.

| Notion | Ce que c'est exactement |
|---|---|
| **Workflow** | Un script déterministe qui orchestre plusieurs agents. Il a des **phases** nommées, et dans chaque phase des agents qui tournent soit en parallèle avec barrière (on attend tout le monde), soit en chaîne sans barrière (chaque élément traverse toutes les étapes à son rythme). |
| **Agent** | Un exécutant avec un rôle nommé, une consigne, et un **modèle** attribué. Il travaille isolé : il ne voit ni la conversation, ni ce que font les autres. Il rend un rapport. 35 agents spécialisés sont déclarés dans ce projet. |
| **Worker** | Un agent séquentiel délégué pour une tâche de complexité moyenne. La différence avec un agent parallèle est **topologique**, pas hiérarchique — c'est une distinction que l'interface doit rendre sans inventer une hiérarchie qui n'existe pas. |
| **Contexte** | Le carburant. Mesuré par tour et par modèle : jetons d'entrée, jetons d'entrée **servis par le cache**, jetons **écrits** dans le cache, jetons de sortie, jetons de raisonnement, durée, coût. |

**Les quatre paliers de modèle**, du moins cher au plus cher : `haiku`,
`sonnet`, `opus`, `fable`. Le choix se fait par complexité de la tâche : lecture
et exploration en bas, implémentation et vérification en haut. Un même workflow
mélange les quatre — c'est le levier de coût principal, donc c'est une
information que l'utilisateur doit pouvoir lire d'un coup d'œil.

---

## 3. Les données dont tu disposes réellement

Ne conçois pas un affichage qui réclame une donnée que le système ne produit
pas. Voici ce qui existe, tel quel.

**Par étape de travail** — une trame arrive à chaque action :

```
{ name: 'Bash' | 'Read' | 'byan.byan_ping' | 'commande' | 'recherche web',
  detail: 'ls' | '/chemin/du/fichier.ts' | 'un motif',   // optionnel
  phase: 'start' | 'end' }
```

`start` arrive quand l'action commence, `end` quand elle finit. Mesuré : un des
deux moteurs n'émet que `end` pour certains types d'action, et les appels
d'outils de l'autre n'ont pas d'événement de fin. **La durée d'une étape n'est
connue que lorsque les deux trames arrivent** — souvent une seule le fait.

**Par tour, la consommation** — chaque champ est *optionnel*, et c'est
intentionnel :

```
model, inputTokens, cachedInputTokens, cacheWriteInputTokens,
outputTokens, reasoningOutputTokens, costUsd, durationMs
```

**Un champ absent veut dire « le moteur ne l'a pas rapporté », pas « zéro ».**
Mesuré : un des deux moteurs ne publie aucun montant en dollars, il est sur
abonnement. Afficher `0,00` là serait faux, et c'est déjà une règle dure du
produit (voir section 7).

**Par workflow** : le nom des phases, le libellé de chaque agent, son modèle,
son état, et son rapport final. Plus le compte total de jetons dépensés.

---

## 4. Ce que l'utilisateur voit aujourd'hui

Une seule ligne, au-dessus de la zone de saisie, pendant qu'un tour tourne :

```
[roue qui tourne]  Bash — ls                                        11s
```

Elle remplace un compteur qui tournait dans le vide. C'est déjà mieux que rien,
et c'est très insuffisant pour un workflow : un travail réel de ce système a duré
**55 minutes avec 8 agents**, dont 5 ont abouti et 3 ont échoué sur une limite de
session. Cette ligne n'aurait rien dit de tout ça.

Le chat lui-même : colonne unique, bulles à droite pour l'utilisateur (fond
teal, texte sombre), à gauche pour la réponse (surface pleine). Largeur utile
d'environ 1000 px dans une fenêtre de 1280. Un bandeau d'identité de session en
haut, la saisie en bas avec les réglages de modèle et d'effort.

---

## 5. Les cinq contradictions à trancher

C'est le cœur du brief. Chacune est un vrai conflit, pas une préférence.

**5.1 — Un chat est linéaire, un workflow est un graphe.**
Huit agents dans quatre phases, certains simultanés. Aplatir en liste fait
disparaître le parallélisme, qui est précisément l'intérêt. Dessiner le graphe
dans une colonne qui défile casse l'ordre de lecture du chat. Où passe la
frontière : dans le fil, à côté, au-dessus, en panneau ?

**5.2 — Les durées sont incomparables.**
Dans le même workflow, un agent met 40 secondes et un autre 40 minutes. Une
barre de progression par agent, toutes de la même largeur, tromperait sur
l'endroit où le temps part. Et le total n'est pas la somme : ce qui tourne en
parallèle se recouvre.

**5.3 — L'échec est partiel, rarement binaire.**
5 agents sur 8 ont abouti, 3 sont morts sur une limite de session. Le travail
utile avait atterri. Un indicateur rouge global aurait fait croire à une perte
totale ; un indicateur vert aurait caché trois trous. Comment se lit un résultat
majoritairement bon avec des manques nommés ?

**5.4 — Le lecteur n'est pas devant l'écran.**
55 minutes, donc il est parti. L'affichage doit être lisible **après**, en
rétrospective, autant que pendant. Ce sont deux besoins différents : suivre, et
comprendre ce qui s'est passé. Une même forme peut-elle porter les deux ?

**5.5 — Deux accents maximum par écran, et il y a plus de deux dimensions.**
La règle de marque (section 6) autorise le teal plus **une** autre couleur. Or il
faut distinguer : quatre états (en cours, fini, échoué, ignoré), quatre paliers de
modèle, et deux topologies (parallèle, en chaîne). Ça ne rentre pas en couleur.
Il faut donc encoder ailleurs — forme, épaisseur, position, typographie, densité.
**C'est la question la plus intéressante du brief.**

---

## 6. La direction artistique, et les règles qui ne se négocient pas

Le système AcadéNice, mode sombre. Les valeurs sont exactes et leurs contrastes
ont été mesurés, pas estimés.

### Surfaces et texte

| Rôle | Valeur | Contraste |
|---|---|---|
| Fond de page | `#0C1312` | — |
| Surface de carte | `#131E1D` | — |
| Surface élevée (modale, menu) | `#1A2827` | — |
| Survol | `#2A3D3C` | — |
| Bordure discrète | `rgba(208,245,240,.07)` | — |
| Bordure nette | `rgba(208,245,240,.12)` | — |
| Titre fort | `#FFFFFF` | 17,4:1 |
| Texte de corps | `#DCE8E7` | 13,6:1 |
| Texte secondaire | `#94B0AF` | 7,4:1 |
| **Plancher de lisibilité** | `#6B9190` | 4,95:1 |
| **Sous le plancher, volontairement** | `#527472` | 3,34:1 |

Les bordures sont du **teal translucide**, pas du blanc : c'est ce qui porte la
règle de marque interdisant le gris pur jusque dans les séparateurs.

Le dernier palier, `#527472`, est **réservé** au tiret d'une valeur non mesurée
et au décoratif. Il ne doit pas porter une phrase que l'utilisateur doit lire.

### Les quatre couleurs de rôle

| Couleur | Valeur | Ce qu'elle veut dire, et rien d'autre |
|---|---|---|
| Teal | `#4CCCB8` | L'action, l'état actif, la sélection, le focus, les liens |
| Ambre | `#FDA100` | Le changement et **l'attente** |
| Rouge | `#EF4444` | L'échec seul et le conflit destructeur — pas un simple avertissement |
| Vert | `#22C55E` | Le bilan de fin, et « en marche » |

Contrastes sur `#131E1D` : teal 8,7:1 · ambre 8,4:1 · vert 7,5:1 · rouge 4,6:1.
Le rouge est juste au-dessus du seuil : texte court uniquement, pas un
paragraphe.

**Deux accents maximum par écran.** Le teal, plus un seul autre.

### Typographie et formes

- Titres et boutons : **Josefin Sans**, plafonnée à 700. Aucun titre en 900.
- Texte courant : **Inter**.
- Chemins, identifiants, compteurs alignés : **JetBrains Mono**.
- Boutons : rayon **pilule** (999 px), règle de marque non négociable.
- Cartes : 14 à 16 px. Champs : 10 px.
- Texte sur un aplat teal : **sombre** (`#0C1312`), pas blanc — le blanc sur teal
  tombe à 2,0:1.
- Cible de pointage : **24 × 24 px minimum** (critère WCAG 2.5.8). Les contrôles
  de ce chat faisaient 19 px avant correction.

### Le verre

Il existe, et il est **réservé aux couches qui flottent au-dessus** : en-tête,
bandeau d'identité, barre de saisie, menus. Le contenu qui porte de
l'information reste **opaque**.

```
background: rgba(19,30,29,.85);
backdrop-filter: blur(24px) saturate(160%);
border: 1px solid rgba(208,245,240,.10);
box-shadow: inset 0 1px 0 rgba(208,245,240,.14), 0 10px 34px rgba(0,0,0,.32);
```

Le liseré intérieur clair fait plus pour la matière que le flou lui-même. Sans
lui c'est un panneau semi-transparent ; avec, c'est une arête taillée.

**Pas de verre sous une donnée.** Un chiffre mesuré, un chemin, un bloc de code :
surface opaque. Sur du translucide un contraste devient une fourchette, pas une
valeur.

Un thème clair existe aussi. Chaque couleur de rôle y descend d'un cran
(teal `#1C7269`, ambre `#9E5200`, rouge `#991B1B`, vert `#065F46`) et les deux
paliers les plus proches du plancher **permutent** : ce qui s'efface descend en
sombre et monte en clair. Ta proposition doit tenir dans les deux, mais tu peux
la concevoir en sombre d'abord.

---

## 7. Les trois règles de produit qui arbitrent tout

Elles viennent du produit et elles ont déjà attrapé des défauts réels dans cette
application. Une proposition qui les enfreint sera refusée, même si elle est
belle.

**1. Ne pas afficher un réglage qui n'existe pas.** Absent du DOM, pas grisé.
Un contrôle grisé promet une capacité et la retire.

**2. Un tiret n'est pas un zéro.** Une valeur, ou un tiret accompagné de la
raison du silence, ou un état « pas encore mesuré ». Pas de quatrième forme, pas
de total qui traverse deux unités.

**3. Aucune commande muette.** Toute action produit une trace : un changement
visible, ou une phrase qui dit pourquoi il n'y en a pas.

Corollaire : **l'absence gouverne ce que l'application propose, l'explication
gouverne ce qu'elle reçoit.**

---

## 8. Ce qu'on attend de toi

1. **Une forme principale** pour le workflow dans le chat, avec ta réponse
   explicite aux cinq contradictions de la section 5. Dis ce que tu sacrifies :
   une proposition qui prétend tout résoudre n'a rien tranché.

2. **L'encodage des trois dimensions** — état, palier de modèle, topologie —
   sous la contrainte de deux accents. Nomme le canal visuel de chacune.

3. **Quatre états à dessiner** au minimum : un workflow qui tourne, un qui a
   fini, un qui a **partiellement** échoué (5 sur 8, les 3 manquants nommés), et
   la vue rétrospective d'un workflow terminé il y a une heure.

4. **La consommation de contexte**, avec au moins un moteur qui ne rapporte
   aucun montant. Montre le tiret et sa raison.

5. **Le passage à l'échelle** : ta forme tient-elle à 3 agents ? À 30 ? Si elle
   casse, dis à partir de quand et ce qui se passe alors.

6. **Ce que tu ne recommandes pas**, et pourquoi. La contre-proposition la plus
   crédible que tu écartes.

Livre en HTML autonome ou en maquette statique, aux dimensions réelles de la
fenêtre : **1280 × 832**. Pas de dépendance externe. Les couleurs et la
typographie sont haute fidélité — les valeurs de la section 6 ne sont pas
indicatives. La mise en page reste à ton jugement.

---

## 9. Ce que je n'ai pas tranché, et que tu ne dois pas combler en silence

- **Est-ce que le workflow vit dans le fil de conversation ou à côté ?** Les deux
  se défendent. Dans le fil, il prend sa place chronologique et pousse la
  conversation ; à côté, il ne bouge pas mais rompt l'unité de lecture. Prends
  parti, dis pourquoi.
- **Le rapport d'un agent est-il consultable ?** Il existe, il est parfois long.
  L'ouvrir dans le chat noie la conversation ; ne pas l'ouvrir cache la seule
  preuve de ce qui a été fait.
- **Faut-il montrer le coût pendant, ou seulement à la fin ?** Un compteur qui
  monte pendant 55 minutes est une source d'angoisse ; un total qui tombe à la
  fin est une surprise.

Ces trois-là changent un comportement observable. Si tu proposes un défaut,
marque-le comme tel au lieu de le présenter comme acquis.
