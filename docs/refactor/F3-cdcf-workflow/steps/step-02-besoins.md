# Step 02 — Besoins (forward) / Domaines (inventaire)

## Saveur forward
Recueillir les **besoins fonctionnels**. Pour chacun :
- Quel probleme concret il resout ? (5 Whys sur la douleur principale)
- Necessaire maintenant ? (YAGNI)
Inscrire chaque besoin valide dans `besoins:` (frontmatter) + une ligne en corps.
Challenger les besoins flous ("ca, c'est du generique") avant de les acter.

## Saveur inventaire
Extraire les fonctionnalites REELLES, par **domaine**. Pour chaque domaine, une table
(modele : CDCF reel byan_web) :

| Aspect | Detail |
|--------|--------|
| Role | ce que fait le domaine |
| Endpoints / Points d'entree | routes, commandes, UI |
| Backend | services / modules impliques |
| UI | pages / composants |
| Donnees | tables / entites |
| Note refacto | dettes, doublons, candidats consolidation |

Methode : extraire du code (endpoints, services, pages, migrations), ne pas deviner.

## Menu
- `C` continuer -> `./step-03-perimetre-contraintes.md`
- `A` ajouter un besoin / domaine
