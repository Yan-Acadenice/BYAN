// Ce qu'un tour a reellement coute, quand le moteur ne rapporte qu'un cumul.
//
// claude publie `total_cost_usd` : le total de la SESSION, remesure a chaque
// tour. Afficher ce champ dans une liste de tours fait lire trois couts la ou il
// n'y en a qu'un qui monte — et les additionner donne presque le triple du reel.
// La soustraction entre deux cumuls mesures donne le cout du tour, exactement.
//
// Deux cas ou l'on ne soustrait pas, et ou l'on dit « cumul » plutot que
// d'inventer : le tour precedent du meme moteur n'est plus retenu (la liste est
// bornee), ou le cumul redescend (un cout negatif n'existe pas).
//
// POURQUOI CE FICHIER VIT DANS shared/ ET PLUS DANS LE RENDERER. Le processus
// principal doit appliquer la MEME regle pour ecrire le cout d'un tour dans
// l'historique sur disque. Deux implementations de la meme arithmetique, c'est
// deux implementations qui derivent — et celle qui derive publie un chiffre faux
// sans que rien ne le signale.

import type { LocalChatUsage } from './ipc-contract';

export type TurnCostKind =
  // Le cout de CE tour, mesure ou obtenu par soustraction de deux mesures.
  | 'turn'
  // Un cumul de session qu'on ne peut pas convertir en cout de tour.
  | 'cumulative'
  // Le moteur n'a rapporte aucun montant.
  | 'none';

export interface TurnCost {
  readonly kind: TurnCostKind;
  readonly usd: number | undefined;
}

// Le rang du tour DANS SON MOTEUR, pose au moment du pli. Sans lui, un premier
// tour retenu est indistinguable d'un tour dont le precedent a ete elague : le
// premier vaut son cumul, le second ne vaut rien de connu.
type WithRank = LocalChatUsage & { readonly engineTurn?: number };

export function turnCosts(turns: readonly LocalChatUsage[]): TurnCost[] {
  const lastByEngine = new Map<string, { rank: number; total: number }>();

  return turns.map((raw) => {
    const turn = raw as WithRank;
    const total = turn.costUsd;
    if (typeof total !== 'number') return { kind: 'none', usd: undefined };

    const rank = typeof turn.engineTurn === 'number' ? turn.engineTurn : undefined;
    const previous = lastByEngine.get(turn.engine);
    if (rank !== undefined) lastByEngine.set(turn.engine, { rank, total });

    // Premier tour du moteur dans cette session : la session partait de zero,
    // donc le cumul EST le cout du tour.
    if (rank === 1) return { kind: 'turn', usd: total };

    // Le precedent doit etre le tour juste avant, sur le MEME moteur.
    if (previous === undefined || rank === undefined || previous.rank !== rank - 1) {
      return { kind: 'cumulative', usd: total };
    }

    const delta = total - previous.total;
    if (delta < 0) return { kind: 'cumulative', usd: total };
    return { kind: 'turn', usd: delta };
  });
}

// Le cout d'UN tour, calcule incrementalement — la forme dont le processus
// principal a besoin : il tient un enregistrement qu'il complete tour par tour et
// n'a pas la liste entiere sous la main a chaque fois.
//
// `previous` est le dernier tour DEJA enregistre pour le meme moteur, avec son
// rang et son cumul. `null` quand il n'y en a pas.
export function turnCostFrom(
  usage: LocalChatUsage,
  rank: number,
  previous: { readonly rank: number; readonly total: number } | null
): TurnCost {
  const total = usage.costUsd;
  if (typeof total !== 'number') return { kind: 'none', usd: undefined };
  if (rank === 1) return { kind: 'turn', usd: total };
  if (previous === null || previous.rank !== rank - 1) return { kind: 'cumulative', usd: total };
  const delta = total - previous.total;
  if (delta < 0) return { kind: 'cumulative', usd: total };
  return { kind: 'turn', usd: delta };
}
