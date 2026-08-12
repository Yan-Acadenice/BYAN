// Une racine touche-t-elle VRAIMENT le texte ?
//
// UN SEUL ENDROIT, PARCE QUE LE DEFAUT S'EST PRODUIT DEUX FOIS. Le matcher
// d'agent et le routeur de moteur cherchaient tous les deux leurs mots-cles par
// sous-chaine brute, et les deux se sont trompes de la meme facon. Mesures du
// 2026-08-07, sur des phrases qu'un utilisateur tape vraiment :
//
//   « tu peux me lister le dossier src »   -> "peux" contient "ux"
//                                          -> l'agent UX etait propose
//   « merci pour ton aide »                -> "merci" contient "ci"
//   « ceci est un simple bonjour »         -> "ceci" contient "ci"
//                                          -> les deux partaient sur Codex
//
// Le second est le pire : "merci" est un des mots les plus courants d'une
// conversation en francais, et il envoyait le tour sur le mauvais moteur.
//
// LA REGLE : frontiere a GAUCHE seulement. La racine doit COMMENCER un mot ;
// elle peut se continuer librement.
//
// Pourquoi pas des deux cotes : ce sont des RACINES, pas des mots entiers.
// "documente" doit attraper "documenter" et "documentation" ; "deploi" doit
// attraper "deploie" et "deploiement". C'est ce qui fait marcher une liste en
// francais, ou le meme verbe a cinq terminaisons. Avec une frontiere a droite,
// « il faut documenter l'API » cessait de router vers la redactrice technique —
// mesure, pas supposition.
//
// CE QUE LA REGLE NE REGLE PAS : "production" commence bien par "product". Une
// racine trop courte pour son sens reste un probleme de VOCABULAIRE, a corriger
// dans la liste, pas ici.
//
// La frontiere est construite a la main plutot qu'avec `\b` : les racines
// deburrees peuvent contenir un tiret ou un chiffre ("computer-use", "e2e-run"),
// et on veut la meme regle pour toutes.

const CARACTERE_DE_MOT = /[a-z0-9]/;

export function matchesKeyword(texte: string, motCle: string): boolean {
  if (motCle.length === 0) return false;
  // Plusieurs mots : la sous-chaine suffit, sa longueur la protege deja, et
  // exiger une frontiere casserait les variantes d'espacement.
  if (/\s/.test(motCle)) return texte.includes(motCle);

  let depuis = 0;
  for (;;) {
    const i = texte.indexOf(motCle, depuis);
    if (i === -1) return false;
    const avant = i === 0 ? '' : texte[i - 1] as string;
    if (!CARACTERE_DE_MOT.test(avant)) return true;
    depuis = i + 1;
  }
}

// La meme regle, appliquee a une liste.
export function matchesAnyKeyword(texte: string, motsCles: readonly string[]): boolean {
  return motsCles.some((k) => matchesKeyword(texte, k));
}
