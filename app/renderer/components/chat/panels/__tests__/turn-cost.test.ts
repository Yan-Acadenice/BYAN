// Le cout d'UN tour, quand le moteur ne rapporte qu'un cumul.
//
// Mesure du 2026-07-27 contre le vrai CLI claude, trois tours d'une meme session :
// total_cost_usd = 0.2319165 -> 0.261986 -> 0.28187. Le champ est MONOTONE : il
// porte le total de la session, pas le cout du tour. Le pli des totaux le sait
// deja (`costUsd: 'latest'`), mais la liste « derniers tours » affichait la
// valeur telle quelle : trois lignes a 0.23 / 0.26 / 0.28 se lisent comme trois
// couts qui s'additionnent a 0.78, pour une session qui en a coute 0.28.
//
// Une soustraction entre deux cumuls MESURES donne le cout reel du tour. Elle
// n'est possible que si le tour precedent du meme moteur est encore retenu — la
// liste est bornee. Quand il ne l'est plus, on ne devine pas : on dit « cumul ».

import { describe, expect, it } from 'vitest';
import { turnCosts } from '../turn-cost';
import type { LocalChatUsage } from '../../../../../shared/ipc-contract';

const claude = (costUsd: number, engineTurn: number): LocalChatUsage =>
  ({ engine: 'claude', costUsd, engineTurn }) as LocalChatUsage;

describe('turnCosts', () => {
  it('rend le cout REEL du tour, pas le cumul rapporte', () => {
    const out = turnCosts([claude(0.2319165, 1), claude(0.261986, 2), claude(0.28187, 3)]);
    expect(out.map((c) => c.kind)).toEqual(['turn', 'turn', 'turn']);
    // Le premier tour d'une session part de zero : son cumul EST son cout.
    expect(out[0].usd).toBeCloseTo(0.2319165, 7);
    expect(out[1].usd).toBeCloseTo(0.0300695, 7);
    expect(out[2].usd).toBeCloseTo(0.019884, 7);
  });

  it('la somme des couts par tour egale le cumul final', () => {
    // C'est la propriete que l'affichage fautif violait : additionner ce qui
    // etait montre donnait presque le triple du total reel.
    const turns = [claude(0.2319165, 1), claude(0.261986, 2), claude(0.28187, 3)];
    const somme = turnCosts(turns).reduce((n, c) => n + (c.usd ?? 0), 0);
    expect(somme).toBeCloseTo(0.28187, 7);
  });

  it('dit « cumul » quand le tour precedent du moteur a ete elague', () => {
    // La liste est bornee. Un tour numero 12 dont le numero 11 n'est plus la ne
    // permet aucune soustraction : annoncer un cout serait inventer.
    const out = turnCosts([claude(0.5, 12), claude(0.55, 13)]);
    expect(out[0]).toEqual({ kind: 'cumulative', usd: 0.5 });
    expect(out[1]).toEqual({ kind: 'turn', usd: expect.closeTo(0.05, 7) });
  });

  it('ne soustrait jamais entre deux moteurs differents', () => {
    // codex compte par tour et ne rapporte aucun dollar ; claude cumule. Une
    // soustraction croisee melangerait deux unites.
    const mixed = [
      claude(0.10, 1),
      { engine: 'codex', outputTokens: 42, engineTurn: 1 } as LocalChatUsage,
      claude(0.14, 2),
    ];
    const out = turnCosts(mixed);
    expect(out[1]).toEqual({ kind: 'none', usd: undefined });
    expect(out[2]).toEqual({ kind: 'turn', usd: expect.closeTo(0.04, 7) });
  });

  it('ne rend jamais un cout negatif', () => {
    // Si un moteur rapportait un cumul qui redescend, la soustraction donnerait
    // un nombre negatif — un cout negatif n'existe pas, on tombe sur le cumul.
    const out = turnCosts([claude(0.30, 1), claude(0.20, 2)]);
    expect(out[1].kind).toBe('cumulative');
    expect(out[1].usd).toBe(0.20);
  });

  it('laisse passer un tour sans montant', () => {
    const out = turnCosts([{ engine: 'codex', outputTokens: 7, engineTurn: 1 } as LocalChatUsage]);
    expect(out[0]).toEqual({ kind: 'none', usd: undefined });
  });
});
