// Le visage d'un intervenant : plat, geometrique, dans la rampe neutre.
//
// POURQUOI UN VISAGE ET PAS UNE INITIALE DANS UN ROND. Un prenom se retient, un
// visage se reconnait avant d'etre lu. Sur un bon de livraison de huit lignes,
// c'est ce qui permet de retrouver « celle qui a ecrit le code » sans relire les
// huit prenoms. L'initiale, elle, se confond des que deux prenoms commencent par
// la meme lettre — et le roster en contient deja deux en B.
//
// POURQUOI LA RAMPE NEUTRE ET RIEN D'AUTRE. Le budget est de deux accents par
// ecran, teal compris. Un visage colore le crevererait a lui seul sur un ecran
// qui compte sept intervenants. Le visage est donc peint en `currentColor` a
// deux opacites : il herite de la couleur de texte du conteneur, suit les deux
// themes sans une seule valeur en dur, et ne consomme aucun accent.
//
// Il est DECORATIF : le prenom est ecrit a cote en toutes lettres. D'ou
// `aria-hidden` — une description vocale du visage ne dirait rien de plus que le
// prenom deja lu juste apres.

import React from 'react';

import { ADVERSE_REVIEWER_ID, personForSlug } from '../../../../shared/workmanship';

// Les trois traits qui distinguent un visage. Trois canaux geometriques, aucun
// chromatique : la tete, les yeux, la bouche.
type HeadShape = 'rond' | 'carre' | 'hexagone' | 'ecusson';
type EyeShape = 'point' | 'barre' | 'anneau';
type MouthShape = 'trait' | 'sourire' | 'creux' | 'aucune';

interface FaceRecipe {
  readonly head: HeadShape;
  readonly eyes: EyeShape;
  readonly mouth: MouthShape;
}

// Une recette EXPLICITE par personne, pas un hachage de l'identifiant. Un
// hachage rend deux visages identiques le jour ou deux identifiants collident,
// et personne ne s'en apercoit avant de voir l'ecran. Ici, une collision est
// visible dans le tableau lui-meme.
//
// DECISION EN ATTENTE: prenom du relecteur adverse. Le defaut pose cote
// `shared/workmanship.ts` est « Cassandre » — celle qui voit le probleme et
// qu'on n'ecoute pas. Sa recette ci-dessous est faite pour tenir quel que soit
// le prenom retenu : elle ne depend que de la cle `ADVERSE_REVIEWER_ID`.
const FACES: Readonly<Record<string, FaceRecipe>> = {
  architect: { head: 'hexagone', eyes: 'barre', mouth: 'trait' },
  dev: { head: 'rond', eyes: 'point', mouth: 'sourire' },
  quinn: { head: 'carre', eyes: 'anneau', mouth: 'trait' },
  'quick-flow-solo-dev': { head: 'rond', eyes: 'barre', mouth: 'creux' },
  tea: { head: 'ecusson', eyes: 'point', mouth: 'trait' },
  carmack: { head: 'carre', eyes: 'barre', mouth: 'aucune' },
  rachid: { head: 'hexagone', eyes: 'point', mouth: 'sourire' },
  [ADVERSE_REVIEWER_ID]: { head: 'ecusson', eyes: 'anneau', mouth: 'creux' },
  // Les deux qui conduisent le chantier. Leur visage est volontairement le plus
  // sobre des dix : ils ne sont pas des executants, et la mention « n'est pas
  // facture » se lit a cote.
  hermes: { head: 'rond', eyes: 'anneau', mouth: 'aucune' },
  byan: { head: 'ecusson', eyes: 'barre', mouth: 'aucune' },
};

// Ce qu'on dessine quand l'identifiant ne designe personne de connu. Un visage
// neutre vaut mieux qu'un trou : la ligne garde sa geometrie, et le texte a cote
// dit l'ignorance en toutes lettres.
const UNKNOWN_FACE: FaceRecipe = { head: 'rond', eyes: 'point', mouth: 'aucune' };

// Le contour de la tete, en coordonnees d'un carre de 32.
const HEAD_PATHS: Readonly<Record<HeadShape, string>> = {
  rond: 'M16 2a14 14 0 1 0 0 28 14 14 0 0 0 0-28Z',
  carre: 'M6 8a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6h-8a6 6 0 0 1-6-6Z',
  hexagone: 'M16 2l12 7v14l-12 7-12-7V9Z',
  ecusson: 'M4 6a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v12c0 7-5 10-12 12C9 28 4 25 4 18Z',
};

function Eyes({ shape }: { shape: EyeShape }) {
  if (shape === 'barre') {
    return (
      <g fillOpacity={0.85}>
        <rect x={9} y={13} width={5} height={2} rx={1} fill="currentColor" />
        <rect x={18} y={13} width={5} height={2} rx={1} fill="currentColor" />
      </g>
    );
  }
  if (shape === 'anneau') {
    return (
      <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeOpacity={0.85}>
        <circle cx={11.5} cy={14} r={2} />
        <circle cx={20.5} cy={14} r={2} />
      </g>
    );
  }
  return (
    <g fill="currentColor" fillOpacity={0.85}>
      <circle cx={11.5} cy={14} r={1.8} />
      <circle cx={20.5} cy={14} r={1.8} />
    </g>
  );
}

function Mouth({ shape }: { shape: MouthShape }) {
  if (shape === 'aucune') return null;
  const common = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeOpacity: 0.85,
  };
  if (shape === 'sourire') return <path d="M11 20c1.6 1.8 8.4 1.8 10 0" {...common} />;
  if (shape === 'creux') return <path d="M11 21c1.6-1.8 8.4-1.8 10 0" {...common} />;
  return <path d="M11.5 20.5h9" {...common} />;
}

export interface PersonFaceProps {
  // Identifiant complet ou racine : `personForSlug` accepte les deux.
  personId: string;
  // Cote du carre, en pixels. Decoratif, donc pas soumis a la cible de 24 px —
  // c'est la ligne entiere qui est cliquable quand elle l'est.
  size?: number;
  className?: string;
}

export default function PersonFace({ personId, size = 28, className }: PersonFaceProps) {
  const person = personForSlug(personId);
  const recipe = (person && FACES[person.id]) ?? UNKNOWN_FACE;
  return (
    <svg
      data-testid={`face-${person?.id ?? 'inconnu'}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      // Decoratif : le prenom est ecrit juste a cote.
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* La tete est une surface, pas de l'encre : elle reste sous le texte
          qu'elle accompagne au lieu de lui disputer l'attention. */}
      <path d={HEAD_PATHS[recipe.head]} fill="currentColor" fillOpacity={0.18} />
      <Eyes shape={recipe.eyes} />
      <Mouth shape={recipe.mouth} />
    </svg>
  );
}
