// Le pont entre ce que les moteurs mesurent et ce que la frise dessine.
//
// La frise du patron attend des tranches de temps. Le chat local produit des
// etapes d'outils avec un debut et (parfois) une fin. Ce module convertit les
// unes en les autres SANS rien inventer : chaque nombre affiche vient d'un
// instant reellement observe.
//
// Le point delicat est `discarded`. Dans le patron, c'est le travail qu'une
// reprise a jete. Un chat local n'a aucune reprise : rien n'est jamais jete.
// Le 0 rendu ici est donc une mesure, pas un remplissage — et le jour ou une
// reprise existera, il faudra le brancher plutot que de le laisser a 0.

import { buildActivityTimeline, type LocalChatActivity } from '../../../../shared/tool-activity';
import type { TimelineSlice } from './types';

// Assez de tranches pour lire une forme, assez peu pour que chacune reste
// visible a l'ecran.
export const SLICE_TARGET = 60;

// En dessous, deux tranches voisines seraient a peine distinguables.
const MIN_SLICE_MS = 200;

export function slicesFromActivity(activities: readonly LocalChatActivity[]): TimelineSlice[] {
  const { steps, firstAt, lastAt } = buildActivityTimeline(activities);
  if (steps.length === 0 || firstAt === undefined || lastAt === undefined) return [];

  // Une etape sans debut connu n'a pas de place sur un axe du temps : on ne
  // devine pas son point de depart.
  const bounded = steps
    .filter((s) => s.startedAt !== undefined)
    // Une etape encore ouverte a travaille jusqu'au dernier instant connu.
    // La refermer sur son propre debut la ferait disparaitre de la frise.
    .map((s) => ({ from: s.startedAt as number, to: Math.max(s.endedAt ?? lastAt, s.startedAt as number) }));
  if (bounded.length === 0) return [];

  const span = lastAt - firstAt;
  if (span <= 0) {
    // Un instant unique : une tranche, de duree minimale. Diviser par un span
    // nul donnerait une valeur non finie et la frise ne serait plus dessinable.
    return [{ startMs: 0, durationMs: MIN_SLICE_MS, working: bounded.length, discarded: 0 }];
  }

  const count = Math.max(1, Math.min(SLICE_TARGET, Math.ceil(span / MIN_SLICE_MS)));
  const width = span / count;

  const slices: TimelineSlice[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = firstAt + i * width;
    const to = i === count - 1 ? lastAt : from + width;
    // Une etape compte dans la tranche des qu'elle la recouvre, meme
    // partiellement : c'est du travail qui a eu lieu pendant cet intervalle.
    const working = bounded.filter((b) => b.from < to && b.to > from).length
      // Cas limite : une etape de duree nulle posee exactement sur la borne.
      + bounded.filter((b) => b.from === b.to && b.from >= from && b.from < to).length;
    slices.push({
      startMs: Math.round(from - firstAt),
      durationMs: Math.round(to - from),
      working,
      discarded: 0,
    });
  }

  // Les bornes arrondies doivent rester jointives : un trou ou un recouvrement
  // se verrait comme un defaut de dessin.
  let cursor = 0;
  return slices.map((s) => {
    const fixed = { ...s, startMs: cursor };
    cursor += s.durationMs;
    return fixed;
  });
}
