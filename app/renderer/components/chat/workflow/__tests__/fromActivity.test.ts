// Des etapes d'outils vers les tranches de la frise.
//
// La frise attend des tranches { startMs, durationMs, working, discarded }.
// Le chat local produit des etapes bornees dans le temps. Ce module fait le pont,
// et il ne fabrique rien : `discarded` vaut 0 parce qu'un chat local n'a aucun
// mecanisme de reprise qui jetterait du travail. Ce 0 est une mesure, pas un
// remplissage — le jour ou une reprise existera, il faudra le brancher.

import { describe, expect, it } from 'vitest';
import { slicesFromActivity, SLICE_TARGET } from '../fromActivity';
import type { LocalChatActivity } from '../../../../../shared/tool-activity';

const T0 = 1_700_000_000_000;

function step(id: string, from: number, to?: number): LocalChatActivity[] {
  const out: LocalChatActivity[] = [{ name: 'Bash', phase: 'start', id, at: T0 + from }];
  if (to !== undefined) out.push({ name: 'Bash', phase: 'end', id, at: T0 + to });
  return out;
}

describe('slicesFromActivity', () => {
  it('ne rend aucune tranche quand rien n a ete mesure', () => {
    // Zero tranche, pas une tranche a zero : la frise doit pouvoir dire "aucune
    // minute mesuree" plutot que dessiner un chantier vide.
    expect(slicesFromActivity([])).toEqual([]);
  });

  it('compte UNE personne au travail sur une etape seule', () => {
    const slices = slicesFromActivity(step('a', 0, 10_000));
    expect(slices.length).toBeGreaterThan(0);
    expect(slices.every((s) => s.working === 1)).toBe(true);
  });

  it('compte DEUX personnes la ou deux etapes se recouvrent', () => {
    // a : 0 -> 10s, b : 5s -> 15s. Le recouvrement est 5s -> 10s.
    const slices = slicesFromActivity([...step('a', 0, 10_000), ...step('b', 5_000, 15_000)]);
    const max = Math.max(...slices.map((s) => s.working));
    expect(max).toBe(2);
    // Et le recouvrement est bien au MILIEU, pas partout : les bords sont a 1.
    expect(slices[0].working).toBe(1);
    expect(slices[slices.length - 1].working).toBe(1);
  });

  it('ne rapporte AUCUN travail jete : le chat local n a pas de reprise', () => {
    // Un 0 mesure, pas un remplissage. Inventer un rejet serait pire que de ne
    // rien afficher.
    const slices = slicesFromActivity([...step('a', 0, 10_000), ...step('b', 5_000, 15_000)]);
    expect(slices.every((s) => s.discarded === 0)).toBe(true);
  });

  it('tient compte d une etape jamais fermee jusqu au dernier instant connu', () => {
    // Une etape ouverte n'a pas de fin. La compter comme finie a son debut la
    // ferait disparaitre de la frise alors qu'elle travaillait.
    const slices = slicesFromActivity([...step('a', 0, 20_000), ...step('ouverte', 5_000)]);
    // Elle a travaille de 5s a 20s, soit les trois quarts du chantier. Un maximum
    // a 2 ne suffit pas a le prouver : une seule tranche a 2 le satisferait aussi.
    // Ce qu'on verifie, c'est qu'elle COURT jusqu'a la fin.
    const deux = slices.filter((s) => s.working === 2).length;
    expect(deux / slices.length).toBeGreaterThan(0.6);
    expect(slices[slices.length - 1].working).toBe(2);
  });

  it('ignore une fin orpheline plutot que de deviner son debut', () => {
    const slices = slicesFromActivity([{ name: 'Bash', phase: 'end', id: 'zz', at: T0 + 5_000 }]);
    expect(slices).toEqual([]);
  });

  it('borne le nombre de tranches, quelle que soit la duree du chantier', () => {
    // Une heure de chantier ne doit pas produire 3600 rectangles d'un pixel.
    const slices = slicesFromActivity(step('a', 0, 3_600_000));
    expect(slices.length).toBeLessThanOrEqual(SLICE_TARGET);
    expect(slices.length).toBeGreaterThan(0);
  });

  it('les tranches se suivent sans trou ni recouvrement', () => {
    const slices = slicesFromActivity([...step('a', 0, 10_000), ...step('b', 5_000, 15_000)]);
    for (let i = 1; i < slices.length; i += 1) {
      expect(slices[i].startMs).toBe(slices[i - 1].startMs + slices[i - 1].durationMs);
    }
    expect(slices[0].startMs).toBe(0);
  });

  it('rend une tranche pour un instant unique plutot que rien', () => {
    // Deux bornes identiques donnent une fenetre de duree nulle. Une division par
    // cette duree ferait une valeur non finie ; la frise doit rester dessinable.
    const slices = slicesFromActivity(step('a', 4_000, 4_000));
    expect(slices.length).toBe(1);
    expect(Number.isFinite(slices[0].durationMs)).toBe(true);
    expect(slices[0].durationMs).toBeGreaterThan(0);
  });
});
