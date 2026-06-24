# Google Workspace (gdrive) — credential durable et mutualisé

Cette recette met en place **un seul credential Google durable** pour byan, via
l'extension d'install `gdrive` (qui câble le package `google-workspace-mcp`).
Elle remplace l'ancien guide "External + Testing" dont le refresh token expirait
sous ~7 jours.

## Le principe

| | External + Testing (ancien) | Internal (recommandé) |
|---|---|---|
| Expiration refresh token | ~7 jours | aucune (tant que non révoqué / non inutilisé 6 mois) |
| Vérification Google | requise pour scopes sensibles | non requise |
| Qui peut autoriser | jusqu'à 100 test users listés | comptes de ton org Workspace |
| Prérequis | un compte Google | projet rattaché à une org Workspace |

Source du comportement d'expiration : la doc OAuth2 de Google
(`developers.google.com/identity/protocols/oauth2`) indique que le combo
External + Testing émet un refresh token expirant en 7 jours pour des scopes
hors `openid/email/profile` ; passer en Internal (ou en Production publiée)
lève cette limite.

## Recette (à faire une fois, dans la console Google Cloud)

1. Crée un projet Google Cloud **rattaché à ton organisation Workspace**
   (ex : acadenice.fr) — pas un compte Gmail personnel.
   `https://console.cloud.google.com/projectcreate`
2. Active les APIs nécessaires (Drive, Docs, Sheets, Slides, Gmail, Calendar,
   Forms). `https://console.cloud.google.com/apis/library`
3. Écran de consentement OAuth : **User type = Internal**.
   `https://console.cloud.google.com/apis/credentials/consent`
4. Crée un **OAuth Client ID** de type **Desktop App**, puis "Download JSON".
   `https://console.cloud.google.com/apis/credentials/oauthclient`
5. Renomme le fichier en `credentials.json` et place-le dans `~/.google-mcp/`
   (ou laisse l'installer byan l'importer).
6. L'installer lance le login navigateur une fois
   (`npx -y google-workspace-mcp accounts add <name>`). Connecte-toi avec un
   compte de l'org. Terminé.

## Mutualisation

Ce client OAuth Internal est **LE credential Google unique de byan** : gw et ses
95+ outils l'utilisent. Le **connecteur claude.ai Drive devient redondant** et
peut être retiré côté compte claude.ai — un seul credential à maintenir.

## Limites assumées

- **Login navigateur 1×** au premier setup (pas de mode 100 % headless).
- **Org-only** : seuls les comptes de ton org Workspace peuvent autoriser.
- **Pas de service account** : le package `google-workspace-mcp` (pm990320) ne
  les supporte pas (README : "Service account authentication is not currently
  supported"). Pour un besoin 100 % non-attendu (cron sans humain), il faudrait
  un client Google possédé par byan avec un service account — sujet d'un FD
  séparé, hors de cette mutualisation d'install.

## Vérifier

```bash
npx -y google-workspace-mcp accounts list   # le compte est présent
npx -y google-workspace-mcp status          # l'auth répond
```
