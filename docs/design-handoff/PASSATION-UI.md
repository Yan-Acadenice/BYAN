# Passation — refonte de l'UI de BYAN Desktop sur la DA AcadéNice

Destinataire : un développeur (ou Claude Code) travaillant dans `Yan-Acadenice/BYAN`, dossier `app/`.
Auteur du document : passation UX préparée à partir du dépôt lu le 27/07/2026, branche `main`.

---

## 1. Ce que contient ce paquet, et ce que ce n'est pas

| Fichier | Nature |
|---|---|
| `architecture-ux.html` | **Référence de conception.** Un document d'architecture UX : parcours, hiérarchie de l'information, inventaire des rôles d'interface, catalogue des états, audit du code existant. Les maquettes qu'il contient sont **volontairement en gris** — elles décrivent la structure et l'ordre de lecture, pas l'apparence. |
| `README.md` | Ce document. La couche que le HTML n'a pas : tokens, correspondance rôle → composant, plan de travail. |
| `THEMES-ET-MATIERE.md` | **Les deux thèmes et le verre.** Rampes sombre et clair par rôle, contrastes mesurés, recettes de verre, règles du sélecteur à trois états. À lire avant le lot 0. |
| `mock-solide-sombre.html` | Maquettes sombres, surfaces pleines : chat local, aperçu, états. |
| `mock-verre-sombre-et-clair.html` | Le chat local dans les deux thèmes, en verre, plus la spécification de matière. |
| `mock-clair.html` | Aperçu et états en thème clair. |

**Ce n'est pas du code à copier.** Aucun extrait du HTML ne doit être porté tel quel : il est écrit en styles en ligne pour un autre moteur de rendu. La cible est le code React + Tailwind existant dans `app/renderer/`, avec ses conventions actuelles.

**Fidélité, en deux niveaux :**

- **Structure et comportement : basse fidélité.** Les maquettes grises indiquent quoi montrer, dans quel ordre, et ce qui doit disparaître. La mise en page finale reste au jugement du développeur, dans les composants existants.
- **Tokens, couleurs, typographie : haute fidélité.** La section 4 de ce document donne des valeurs exactes, vérifiées en contraste. Elles ne sont pas indicatives.

---

## 2. Les deux décisions verrouillées

Elles ont été tranchées par Yan et ne sont pas à rediscuter.

**D1 — Le teal AcadéNice `#4CCCB8` remplace le bleu BYAN `#5c7cfa`.** Il ne coexiste pas avec lui. À la fin du chantier, il ne doit plus rester une seule occurrence de `byan-*` dans `app/renderer/`.

**D2 — L'application reste sombre, mais sa rampe de gris est reconstruite depuis les neutres AcadéNice**, pas depuis les `ink-*` actuels. Les `ink-*` sont des gris bleutés ; la règle de marque AcadéNice impose des neutres teintés teal, jamais de gris pur. Le système AcadéNice s'arrête à `#1A2827` et n'a pas de rampe sombre complète : deux tokens sont donc **ajoutés** au système (section 4.1). C'est une extension du design system, pas une entorse.

---

## 3. Ce que j'ai trouvé dans le dépôt, et qui change le plan

Le remplacement du bleu par le teal n'est pas un chantier de couleur. C'est un chantier de **consolidation** : la couche de tokens contient aujourd'hui quatre systèmes visuels superposés, dont deux morts.

### 3.1 Quarante-cinq tokens morts

`app/renderer/tailwind.config.js` définit un jeu complet Material Design 3 issu d'un export d'outil de maquettage : `surface`, `surface-dim`, `surface-bright`, `surface-container-*` (5 niveaux), `on-surface`, `on-surface-variant`, `inverse-surface`, `background`, `on-background`, `primary` (`#b8c4ff`, un lavande), `on-primary`, `primary-container`, `primary-fixed*` (4), `secondary` + ses 7 variantes, `tertiary` + ses 7 variantes, `error` + 3 variantes, `outline`, `outline-variant`.

**Aucun n'est utilisé.** Recherche sur `app/renderer/` pour `(bg|text|border)-(surface|primary|secondary|tertiary|on-surface|outline)` : deux résultats, tous deux `bg-primary-gradient` — qui est une image de fond, pas la couleur `primary`.

Conséquence pour le plan : ce n'est pas une migration, c'est une suppression. Elle réduit la surface d'erreur avant même de toucher au teal. **À faire en premier.**

Attention au piège : `primary: '#b8c4ff'` est défini. Si quelqu'un écrit `bg-primary` en croyant appeler la couleur de marque, il obtient un lavande. Supprimer le token supprime le piège.

### 3.2 Les classes verre contredisent le brief, et ne servent à rien

`app/renderer/index.css` définit `.glass`, `.glass-strong`, `.glass-card`, `.glass-panel` avec `backdrop-blur-xl` / `backdrop-blur-2xl`, et `.card` est construite sur `.glass-card`.

Or `app/DESIGN-BRIEF.md` — le document de référence du dépôt — l'interdit explicitement : « Avoid glass-morphism. Avoid frosted blur backgrounds. Surfaces stay solid `--ink-900`. »

Dans les faits, les composants ne les utilisent pas : ils écrivent `bg-ink-900 border border-ink-800` en clair. Les seules occurrences hors définition sont `shadow-glass` (une ombre portée sombre, sans flou) dans `Login.tsx:183` et `Onboarding.tsx:286` — celle-là est inoffensive et peut rester.

À faire : supprimer les quatre classes de verre. **Vérifier d'abord** qu'aucun composant n'utilise littéralement `className="card"` — ma recherche portait sur `glass`, pas sur `card`, donc je ne peux pas l'affirmer.

### 3.3 La lueur est partout, et le brief la réserve

Le brief dit : « Reserve glow for active selection or success confirmation, kept brief. Skip glow on idle elements. »

Le code en met en permanence : `.btn-primary` porte `shadow-glow-sm` au repos, `.nav-item-active` aussi, `.dot-on` a une lueur fixe, `.hover-lift` en ajoute une, et `Stepper.tsx:43` combine `shadow-glow` **et** `animate-glow-pulse` — une pulsation infinie sur l'étape active de l'onboarding.

Les trois ombres `glow-*` de la config sont en `rgba(66, 99, 235, …)` — du bleu BYAN. Elles disparaissent donc de toute façon avec D1. La question est ce qui les remplace : voir 4.4.

### 3.4 Deux couleurs hors palette

`index.css` définit `.badge-pinned` en `purple-500` et `.badge-short` en `sky-500` — deux teintes qui n'existent dans aucun des quatre systèmes, prises directement dans les défauts Tailwind. Le brief impose « two accent colors max per screen ». À ramener sur teal / ambre / neutre.

### 3.5 Un test verrouille un nom de token

`app/renderer/__tests__/DashboardConnectivity.test.tsx:75` contient :

```
expect(connectivity('local', 'online').dot).toBe('bg-acadenice-teal');
```

**Ne pas renommer la clé `acadenice.teal`** dans la config sans mettre ce test à jour. Le teal devenant la couleur principale, la tentation sera de le renommer `primary` — ce qui casse ce test et, plus grave, ré-introduit le nom `primary` qu'on vient de libérer.

Recommandation : garder `acadenice.teal` comme source de vérité et ajouter `teal.*` comme rampe complète à côté. Un seul nom, une seule valeur.

### 3.6 Bonne nouvelle : la typographie se change en quatre lignes

Les composants n'écrivent jamais `font-inter`. Ils utilisent les alias sémantiques de la config : `font-h1`, `font-h2`, `font-display`, `font-body`, `font-caption`, `font-label`, `font-mono-code`. Tous pointent aujourd'hui sur Inter.

Changer quatre entrées dans `tailwind.config.js` propage Josefin Sans sur toute l'application sans toucher un composant. C'est la modification au meilleur rapport effet / risque de tout le chantier.

---

## 4. Les tokens

### 4.1 La rampe sombre — deux tokens à ajouter au design system

AcadéNice descend jusqu'à `--neutral-950: #1A2827`. Une interface sombre a besoin de deux paliers de plus, dans la même teinte (hue ≈ 176°, saturation croissante à mesure qu'on descend, comme le reste de la rampe) :

```
--neutral-975:  #131E1D
--neutral-1000: #0C1312
```

Ces deux valeurs prolongent la progression existante ; elles ne sont pas choisies à l'œil. À ajouter dans le `styles.css` d'AcadéNice pour que le système reste la source unique.

### 4.2 Correspondance complète — remplacer la rampe `ink-*`

| Usage | `ink-*` aujourd'hui | AcadéNice sombre | Contraste sur la surface de carte |
|---|---|---|---|
| Fond de page | `ink-950` `#070b17` | `#0C1312` *(neutral-1000, nouveau)* | — |
| Surface de carte | `ink-900` `#0a0f1e` | `#131E1D` *(neutral-975, nouveau)* | — |
| Surface élevée (modale, popover, menu) | `ink-850` `#0f172a` | `#1A2827` *(neutral-950)* | — |
| Surface au survol | `ink-800` `#111827` | `#2A3D3C` *(neutral-900)* | — |
| Bordure discrète | `ink-700` `#1e293b` | `rgba(208, 245, 240, 0.07)` | — |
| Bordure nette | `ink-600` `#273246` | `rgba(208, 245, 240, 0.12)` | — |
| Texte désactivé / décoratif | `ink-500` `#334155` | `#527472` *(neutral-600)* | **3.3:1 — insuffisant pour du texte lisible** |
| Texte tertiaire | `ink-400` `#64748b` | `#6B9190` *(neutral-500)* | 5.0:1 |
| Texte secondaire | `ink-300` `#94a3b8` | `#94B0AF` *(neutral-400)* | 7.4:1 |
| Texte de corps | `ink-100` `#e2e8f0` | `#DCE8E7` *(neutral-200)* | 13.6:1 |
| Texte fort (titres) | `#ffffff` | `#FFFFFF` | 17.4:1 |

Les bordures passent de blanc translucide à **teal-100 translucide** (`#D0F5F0` à 7 % et 12 %). C'est ce qui tient la règle « jamais de gris pur » jusque dans les séparateurs.

**Plancher de lisibilité : `#6B9190` (neutral-500).** `#527472` (neutral-600) ne passe pas le seuil AA sur `#131E1D` : il est réservé au décoratif et au désactivé. C'est une contrainte dure — plusieurs composants utilisent aujourd'hui `text-ink-500` pour du texte informatif (`StatusStrip.tsx:43`, `UsagePanel.tsx` sur les libellés de métriques, `FilePreview.tsx` sur les lignes `skip`). Ils doivent monter d'un cran, pas être traduits à l'identique.

### 4.3 Le rôle de chaque couleur

C'est ici que la décision sur l'ambre est écrite. La règle de marque AcadéNice réserve l'ambre aux CTA de conversion — « Réserver », « Gratuit ». BYAN Desktop ne convertit personne : ce rôle n'a pas d'objet ici. **L'ambre est donc réaffecté à l'accent du changement et de l'attente.** C'est une dérogation assumée à la règle de marque, cohérente avec un usage déjà présent dans le code : les badges `update` de l'aperçu de fichiers sont déjà en ambre.

| Couleur | Valeur | Ce qu'elle signifie, et rien d'autre |
|---|---|---|
| **Teal** | `--primary` `#4CCCB8` | L'action principale. L'état actif. La sélection confirmée. Le focus. Les liens. Le mode local. |
| **Ambre** | `--accent` `#FDA100` | **Le changement et l'attente.** Le badge « mettre à jour » de l'aperçu. La ligne d'écart d'un réglage différé non appliqué. L'avertissement `AVT`. Une mise à jour applicative disponible. |
| **Rouge** | `--danger` `#EF4444` | L'échec seul, et le conflit destructeur — le fichier modifié à la main qui va être écrasé. Jamais un simple avertissement : c'est le travail de l'ambre. |
| **Vert** | `--success` `#22C55E` | Le bilan de fin, et l'état « en marche » d'un serveur d'outils. Rien de plus. |

Contrastes vérifiés sur `#131E1D` : teal 8.7:1 · ambre 8.4:1 · vert 7.5:1 · rouge 4.6:1. Le rouge est juste au-dessus du seuil AA : à réserver au texte court, jamais à un paragraphe.

**Conserver la contrainte du brief : deux accents maximum par écran.** Le teal, plus un seul autre. C'est une bonne règle et elle est de vous.

### 4.4 La règle qui s'inverse en mode sombre

`.btn-primary` est aujourd'hui `text-white` sur un dégradé bleu. Le blanc sur bleu foncé passe. **Le blanc sur teal ne passe pas : 2.0:1.**

En sombre, le bouton primaire est donc **teal avec un texte sombre** :

```
fond  #4CCCB8   texte  #0C1312   →  9.6:1
```

Même règle pour l'ambre : texte sombre sur ambre (9.3:1), jamais blanc (2.0:1).

C'est l'inverse de la convention AcadéNice en mode clair, où `.btn-primary` est blanc sur teal. Les deux sont justes dans leur contexte ; il faut juste ne pas transposer mécaniquement.

### 4.5 Typographie

```
h1, h2, h3, display  →  'Josefin Sans'      (titres)
.btn                 →  'Josefin Sans'      (règle de marque : les boutons sont en Josefin)
body, body-sm,
caption, label       →  'Inter'             (inchangé)
mono-code            →  'JetBrains Mono'    (dérogation, voir ci-dessous)
```

L'échelle de tailles et de graisses actuelle est bonne et cohérente — **ne pas y toucher**. Une seule contrainte : Josefin Sans plafonne à 700. Toute déclaration `font-black` (900) sur un titre doit descendre à 700. Il y en a au moins une, `Sidebar.tsx:70`.

**Dérogation assumée sur la police à chasse fixe.** `--font-mono` vaut `'Courier New'` dans AcadéNice. Ce choix ne tient pas pour un outil de développement : l'application affiche en permanence des chemins de fichiers, des noms de binaires, des identifiants et des compteurs alignés. JetBrains Mono est conservée. À faire remonter dans AcadéNice comme un token supplémentaire (`--font-mono-code`) plutôt que gardée en exception locale.

### 4.6 Rayons

| Élément | Aujourd'hui | AcadéNice |
|---|---|---|
| Bouton | `rounded-xl` (12px) | **`--radius-pill`** (999px) — règle de marque, non négociable |
| Carte | `rounded-2xl` (16px) | `--radius-2xl` (14px) ou `--radius-3xl` (16px) |
| Champ | `rounded-xl` (12px) | `--radius-lg` (10px) |
| Badge | `rounded-md` | `--radius-pill` |

Le passage des boutons en pilule est le changement le plus visible du chantier. C'est aussi celui qui fera le plus « AcadéNice » d'un coup d'œil.

---

## 5. Correspondance rôle UX → composant réel

L'inventaire des rôles de la section 04 du document HTML n'a pas de sens seul. Voici où chacun vit dans le code.

| Code | Rôle | Fichiers concernés |
|---|---|---|
| `ACT-1` | Action principale | `index.css` `.btn-primary` · pieds d'écran de `pages/Onboarding.tsx`, `pages/Login.tsx` |
| `ACT-2` | Action secondaire | `index.css` `.btn-secondary` |
| `ACT-3` | Action discrète | `index.css` `.btn-ghost` |
| `ACT-X` | Action à conséquence | `pages/Onboarding.tsx` (Appliquer) · `components/ModeSwitcher.tsx` (bascule) · `components/chat/LocalChatView.tsx` (`/new`) — **aucun n'a de traitement distinct aujourd'hui** |
| `ACT-S` | Action d'arrêt | `components/chat/LocalChatView.tsx` (interrompre) · `pages/McpServers.tsx` (arrêter) |
| `ETA-I` | État informatif | `components/StatusStrip.tsx` · `pages/Onboarding.tsx` (chemins des CLI détectés) |
| `ETA-P` | État en cours | `pages/Chat.tsx:282-288` (curseur et points de flux) · `components/Stepper.tsx` |
| `ETA-OK` | Bilan de fin | `pages/Onboarding.tsx` (étape 5) |
| `AVT` | Avertissement | **à créer** — n'existe pas comme rôle distinct |
| `ECH` | Échec avec recours | `pages/McpServers.tsx` · `pages/CrashRecovery.tsx` · `pages/NotFound.tsx` |
| `DEG` | Mode dégradé | `components/OfflineIndicator.tsx` · `hooks/useOnlineStatus.ts` |
| `AVS` | Avis transitoire | `components/toast/ToastContext.tsx` |
| `REG-I` | Réglage immédiat | `components/chat/LocalChatView.tsx` (effort, ~ligne 490) |
| `REG-D` | Réglage différé | `components/chat/LocalChatView.tsx` (modèle ~442, session ~565) · `hooks/useChatDefaults.ts` |
| `REG-A` | Réglage absent | `lib/slash-commands.ts` (`commandAvailableFor`) — **déjà correct pour la palette** |
| `IDT` | Identité figée | `components/chat/ScopePicker.tsx` · `components/chat/NewConversationModal.tsx` |
| `DON-M` | Donnée mesurée | `components/chat/panels/UsagePanel.tsx` |
| `DON-N` | Donnée non mesurée | `components/chat/panels/UsagePanel.tsx` (`UNREPORTED`) — **exemplaire, à ne pas toucher** |
| `DON-E` | Mesure en cours | `components/chat/panels/UsagePanel.tsx` (« Aucun tour mesuré ») |
| `VID-0` / `VID-F` | Les deux vides | `pages/Agents.tsx`, `Memory.tsx`, `Knowledge.tsx`, `Projects.tsx`, `McpServers.tsx` — **confondus partout aujourd'hui** |
| `NAV` | Repère de position | `components/Stepper.tsx` |
| `SIL` | Zone de silence | `components/FilePreview.tsx` (lignes `skip`) |

---

## 6. Plan de travail, ordonné par risque

Pas par écran. Un chantier ordonné par écran produit une application à moitié migrée dans les deux directions.

### Lot 0 — Le socle *(bloque tout le reste)*

Deux fichiers : `app/renderer/tailwind.config.js`, `app/renderer/index.css`.

1. Ajouter la rampe teal complète et les deux nouveaux paliers sombres (4.1, 4.2).
2. Supprimer les 45 tokens Material Design 3 morts (3.1). Zéro usage vérifié.
3. Supprimer `.glass`, `.glass-strong`, `.glass-card`, `.glass-panel` — **après avoir vérifié `className="card"`** (3.2).
4. Changer les quatre alias de police (4.5).
5. `.btn` → `rounded-full` (4.6).
6. `.btn-primary` → teal, texte sombre, sans lueur au repos (4.4, 3.3).
7. Ramener `.badge-pinned` et `.badge-short` dans la palette (3.4).
8. Garder un alias `ink-*` → nouvelles valeurs le temps de la migration, puis le retirer au lot 4. Sinon l'application est cassée pendant tout le chantier.

Ne pas renommer `acadenice.teal` (3.5).

### Lot 1 — Les trois manques structurels *(ce sont des fonctionnalités, pas du style)*

1. **La quatrième catégorie de l'aperçu.** `components/FilePreview.tsx` accepte aujourd'hui `create | update | skip`. Ajouter le cas « remplace une version modifiée à la main », le sortir de la liste, le placer en tête avec un écart consultable et une case à décocher. Demande un calcul côté processus principal : empreinte du contenu écrit précédemment contre contenu actuel. Voir section 02 et option `P1` du document HTML.
2. **Séparer les deux temporalités du bandeau de chat.** `components/chat/LocalChatView.tsx`. Le bandeau devient l'identité de la session en lecture ; l'effort descend au pied, près de la saisie ; une ligne d'écart apparaît quand un réglage différé diverge de la session active. Voir option `B1`.
3. **La phrase de conséquence.** `components/ModeSwitcher.tsx` et le `/new` de `LocalChatView.tsx` arrêtent tous deux la session en cours sans le dire. Énoncer avant, constater après.

### Lot 2 — Les faits qui n'en sont pas

4. **La latence en dur** dans `components/StatusStrip.tsx`. Mesurer, ou retirer. Pas de troisième option.
5. **Brancher `parseSlashInput` sur les deux surfaces de chat.** `pages/Chat.tsx` a sa propre chaîne de dispatch qui laisse passer les commandes inconnues vers le modèle. Le parseur de `lib/slash-commands.ts` a été écrit pour ça.

### Lot 3 — La langue

6. `DEFAULT_LOCALE` → `'fr'` dans `i18n/locales.ts`.
7. Accents dans `components/chat/panels/UsagePanel.tsx` : Coût, Durée, Entrée, Entrée en cache, Écriture de cache.
8. Étiquettes de `components/FilePreview.tsx` en français : créer / mettre à jour / remplacer / inchangé. Et les trois phrases anglaises du panneau déplié.
9. Tutoiement partout. Le vouvoiement subsiste dans les chaînes de connectivité de `locales.ts`.
10. Étendre la couverture i18n aux écrans qui n'en ont pas : onboarding, chat, consommation, aperçu, connexion.

### Lot 4 — Le reste du remplacement visuel

Environ cinquante occurrences de `byan-400` / `byan-500` / `byan-700`, dans quinze fichiers :

`components/Sidebar.tsx` · `components/ByanLogo.tsx` · `components/Stepper.tsx` · `components/Topbar.tsx` · `components/chat/AgentPicker.tsx` · `components/chat/LocalChatView.tsx` · `components/chat/MessageMarkdown.tsx` · `components/chat/NewConversationModal.tsx` · `components/chat/ScopePicker.tsx` · `components/chat/SlashCommandMenu.tsx` · `components/mcp/McpServerFormModal.tsx` · `pages/Agents.tsx` · `pages/Chat.tsx` · `pages/Dashboard.tsx` · `pages/Knowledge.tsx` · `pages/Login.tsx` · `pages/Onboarding.tsx` · `pages/ProjectDetail.tsx` · `pages/Projects.tsx` · `pages/Settings.tsx`

Puis retirer l'alias `ink-*` du lot 0, et vérifier qu'aucune occurrence de `byan-` ni de `ink-` ne subsiste.

### Lot 3.5 — Les deux thèmes et le verre

**À faire avant le lot 4** : il définit les tokens que le lot 4 consomme. Spécification complète, valeurs exactes et ordre d'implémentation dans `THEMES-ET-MATIERE.md`. Les trois points bloquants, en résumé :

1. `index.css` pose `bg-ink-950 text-ink-100` en dur sur le `body` — tant que c'est là, aucun thème clair n'est possible, quelle que soit la classe posée sur la racine. `darkMode: 'class'` est déjà déclaré dans la config.
2. Les deux thèmes doivent vivre dans **une seule couche de tokens** commutée par une classe, pas dans deux jeux de valeurs écrits à la main. Deux jeux manuels ont produit un décalage d'un cran sur tout l'étage atténué du clair — un défaut réel, mesuré à 2,31:1 au lieu de 3,3:1, invisible à la relecture.
3. Le sélecteur a **trois** états (sombre / clair / système), pas deux. « Système » veut dire que le thème peut changer sans action de l'utilisateur, en pleine réponse. La règle de comportement est à trancher.

### Lot 5 — Les deux vides

Séparer `VID-0` et `VID-F` sur les cinq pages de liste. Deux textes, deux actions de sortie. Aujourd'hui confondus partout.

---

## 7. Le seul point de marque que je n'ai pas tranché

`components/ByanLogo.tsx` peint le « B » avec un dégradé `byan-500 #5c7cfa → cyan-glow #06b6d4`. Le bleu disparaît, et AcadéNice n'a pas de cyan.

**Proposition, à confirmer par Yan :** dégradé mono-teinte `--teal-300 #6ADDD0 → --teal-600 #1E8E7E`. Le plus sûr — la marque reste lisible et le dégradé garde son sens de profondeur sans introduire de seconde teinte.

**L'alternative** serait teal → ambre, la paire de marque AcadéNice. Plus expressif, mais un logo bicolore chaud/froid sur fond sombre est un pari, et le logo n'est pas l'endroit où prendre des paris.

Ne pas implémenter avant réponse.

---

## 8. Huit décisions produit non tranchées — ne pas les combler en silence

Le document HTML les liste en section 10. Elles ne sont **pas** de la responsabilité du développeur, et elles ne doivent pas être devinées : chacune change un comportement observable.

Ci-dessous, le défaut proposé pour ne pas bloquer le chantier. Chaque implémentation d'un défaut doit porter un commentaire `// DECISION EN ATTENTE:` nommant la question, pour qu'elle soit retrouvable.

| # | Question | Défaut proposé |
|---|---|---|
| Q1 | Étape 2 : aucun CLI trouvé sur la machine — impasse, ou saisie manuelle du chemin ? | Proposer la saisie manuelle du chemin. Une impasse au deuxième écran est un abandon. |
| Q2 | Étape 4 : l'écriture est-elle interruptible ? | Interruptible, avec bilan partiel. Pas de retour arrière automatique. |
| Q3 | L'aperçu se rejoue-t-il hors premier lancement ? | Oui, depuis le détail d'un projet, avec le même écran. |
| Q4 | Peut-on désélectionner des fichiers à l'aperçu ? | Sur les conflits uniquement. Tout ou rien ailleurs. |
| Q6 | Que contiennent Mémoires, Serveurs MCP et Tableau de bord en local hors ligne ? | **Aucun défaut proposé — vraie question d'architecture.** Si le contenu vient de l'API, ces pages sont vides par nature en local : soit elles lisent le disque, soit elles quittent le menu en mode local. Demander avant d'implémenter. |
| Q7 | Un moteur qui ne mesure jamais une grandeur : ligne avec tiret, ou pas de ligne ? | Ligne présente avec tiret. L'utilisateur compare deux moteurs. |
| Q9 | L'effort survit-il à un changement de moteur codex → claude → codex ? | Il survit, et sa réapparition est annoncée. Une valeur qui ressurgit sans le dire est une commande muette. |
| Q10 | Plusieurs sessions locales en parallèle ? | Une seule. Si cela change, l'état global local/cloud et le bandeau d'identité deviennent par-session et non plus par-application — ce qui invalide une partie de la section 01. |

---

## 9. Ce que je n'ai pas lu — à faire avant de toucher au chat

Honnêteté sur le périmètre de cette passation. J'ai lu, dans `app/renderer/` :

`lib/slash-commands.ts` · `hooks/useSlashPalette.ts` · `components/chat/SlashCommandMenu.tsx` · `components/chat/panels/UsagePanel.tsx` · `components/FilePreview.tsx` · `components/ModeSwitcher.tsx` · `components/StatusStrip.tsx` · `i18n/locales.ts` · `tailwind.config.js` · `index.css`

Plus `app/DESIGN-BRIEF.md` et `app/README.md`.

**Je n'ai pas lu :** `components/chat/LocalChatView.tsx` (31 ko) ni `pages/Onboarding.tsx` (30 ko) ni `pages/Chat.tsx` (40 ko). Ce sont précisément les trois fichiers des lots 1 et 2. Les numéros de ligne que je cite viennent d'une recherche, pas d'une lecture : ils localisent, ils ne décrivent pas. **Lire ces trois fichiers en entier avant de commencer le lot 1.**

Je n'ai pas lu non plus le chat cloud. Le parcours D du document HTML repose sur la description orale de Yan, pas sur le code. Ne rien en déduire.

---

## 10. Les trois règles qui arbitrent tout le reste

Si une décision d'implémentation n'est pas couverte par ce document, ces trois-là tranchent. Elles viennent du produit, pas de moi.

1. **Ne jamais afficher un réglage qui n'existe pas.** Absent du DOM, pas grisé. Un contrôle grisé promet une capacité et la retire.
2. **Un tiret n'est pas un zéro.** Une valeur, un tiret accompagné de la raison du silence, ou un état « pas encore mesuré ». Jamais de quatrième forme, jamais de total qui traverse deux unités.
3. **Aucune commande muette.** Toute action produit une trace : un changement visible, ou une phrase qui dit pourquoi il n'y en a pas.

Corollaire de lecture, qui résout leur contradiction apparente : **l'absence gouverne ce que l'application propose, l'explication gouverne ce qu'elle reçoit.** Un chemin qu'on n'offre pas mais que l'utilisateur trouve doit répondre, pas se taire.
