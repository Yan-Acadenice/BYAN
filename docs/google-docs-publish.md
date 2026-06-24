# byan_publish -- Google Docs brandés, headless (service account)

Le tool MCP `byan_publish` crée un Google Doc brandé depuis un objet de contenu,
via un **service account possédé par byan** : auth JWT durable, sans navigateur,
sans refresh token, sans expiration 7 jours. C'est le chemin headless (cron,
batch, sans humain) -- distinct du connecteur OAuth `gdrive`/gw.

## La seule étape manuelle : créer la clé service account

byan ne peut pas créer cette clé à ta place (Google Cloud IAM est hors de portée
de ses outils). ~2 minutes, une fois :

1. Projet Google Cloud (idéalement l'org acadenice.fr) :
   `https://console.cloud.google.com/projectcreate`
2. Activer les APIs **Google Docs** et **Google Drive** :
   `https://console.cloud.google.com/apis/library`
3. Créer un **service account** :
   `https://console.cloud.google.com/iam-admin/serviceaccounts`
4. Sur ce service account -> onglet **Keys** -> *Add key* -> *Create new key* ->
   **JSON** -> télécharger le fichier.
5. Déposer le JSON sur la machine et pointer `GOOGLE_APPLICATION_CREDENTIALS`
   dessus, soit en variable d'environnement, soit dans `~/.byan/credentials.json` :

   ```json
   { "GOOGLE_APPLICATION_CREDENTIALS": "/home/<user>/.byan/google-sa.json" }
   ```

La clé reste hors du dépôt (env ou `~/.byan/`), donc pas commitée.

## Utilisation

```jsonc
// byan_publish
{
  "title": "Bilan d'évaluation - Alice",
  "sections": [
    { "heading": "Bloc 1 - Analyse", "body": "Acquis. ..." },
    { "heading": "Bloc 2 - Conception", "body": "En cours. ..." }
  ],
  "resources": [
    { "label": "Référentiel", "url": "https://..." }
  ],
  "shareWith": "alice@example.org",   // optionnel
  "role": "reader"                      // reader | commenter | writer
}
```

Retour en cas de succès : `{ ok: true, documentId, url, mode, shared }`.
En cas de souci, le tool dégrade en `{ ok: false, reason, message }` plutôt que
de planter :

| reason | sens |
|--------|------|
| `no-credentials` | `GOOGLE_APPLICATION_CREDENTIALS` non défini |
| `bad-credentials` | fichier introuvable ou JSON invalide (client_email + private_key requis) |
| `dep-missing` | `googleapis` non installé -> `npm install googleapis google-auth-library` |
| `invalid-content` | `title` manquant |
| `api-error` | erreur renvoyée par l'API Google (message en clair) |

## Branding : programmatique (défaut) ou template

- **Programmatique** (défaut, sans config) : doc construit depuis le code, titre
  et en-têtes colorés avec la palette AcadéNice (marine `#0e2656`, teal `#24947a`,
  turquoise `#4cccb8`). Logo optionnel via `GDOC_LOGO_PNG_URL` (ou `logoPngUrl` en
  argument) : une URL **PNG** publique, insérée en haut du doc ; absente, le doc
  est brandé par les couleurs seules (Google Docs n'accepte pas le SVG).
- **Template** (`GDOC_TEMPLATE_ID` ou `templateId` en argument) : le doc est une
  **copie** d'un Google Doc template brandé (logo + palette dans le template), puis
  les `{{PLACEHOLDERS}}` sont remplis (`{{TITLE}}`, `{{BLOCS}}`, `{{RESSOURCES}}`,
  plus tout `{{KEY}}` passé via `fields`). C'est le mode recommandé pour un logo :
  Google Docs n'insère pas de SVG, donc le logo vit dans le template (image déjà
  posée), pas réinséré à chaque publication.

## Portée et limites (honnêtes)

- Scopes : `documents` + `drive.file` (par-fichier, le plus étroit suffisant pour
  créer + partager). Pas le scope large `drive`.
- Propriété des fichiers, selon le type de projet GCP :
  - **Projet standalone (hors Workspace)** : le service account possède les
    fichiers qu'il crée, dans son propre Drive (quota ~15 Go, valeur rapportée
    par la communauté) ; partage-les via `shareWith` ; supprimer le service
    account supprime ses fichiers.
  - **Projet rattaché à une org Workspace (le setup recommandé plus haut)** : un
    service account ne peut pas posséder d'assets Drive de l'org (Google IAM,
    `service-account-overview`). Dans ce cas, crée le doc dans un **Shared Drive**
    possédé par l'org (cible un dossier parent), ou impersonne un utilisateur via
    la délégation domaine. Increment suivant côté code : un `GDOC_PARENT_FOLDER_ID`
    (Shared Drive) ; en attendant, le partage `shareWith` reste fonctionnel et le
    doc vit dans le stockage du service account.
- La délégation domaine n'est pas requise pour le mode standalone (le SA agit
  pour lui-même). Elle ne sert qu'à faire posséder le fichier par un utilisateur.

## Contenu RNCP (adaptateur)

`byan_publish` est générique. Pour publier un retour d'évaluation RNCP, un
adaptateur transforme l'objet eval (couverture par bloc + synthèse) en
`{ title, sections, resources }` puis appelle `byan_publish`. Cet adaptateur
vit là où la chaîne RNCP est définie -- hors de ce module générique.
