// Comment chaque moteur honore le choix d'un agent.
//
// L'application repondait « codex ne permet pas de choisir un agent » et
// refusait la commande. Le constat est juste au sens strict — mesure du jour,
// codex-cli 0.146.0 n'expose aucun `--agent` — mais il ne rend pas le geste
// impossible : un agent BYAN est un fichier d'instructions, et codex lit ses
// instructions sur l'entree standard.
//
// Un booleen « supporte / ne supporte pas » ne peut pas porter cette nuance. Le
// type dit donc COMMENT : selection native, ou persona injectee dans le tour.
// Les deux ne donnent pas la meme chose, et l'interface doit pouvoir le dire.

import { describe, expect, it } from 'vitest';
import { agentSupport, AGENT_SUPPORT_NOTE } from '../engine-options';

describe('agentSupport', () => {
  it('claude selectionne l agent nativement', () => {
    // `--agent <slug>` : le CLI charge la definition, ses outils et son modele.
    expect(agentSupport('claude')).toBe('native');
  });

  it('codex recoit la persona injectee dans le tour', () => {
    // Pas de drapeau : les instructions partent en tete du message.
    expect(agentSupport('codex')).toBe('injected');
  });

  it('aucun moteur ne refuse le choix d un agent', () => {
    // C'est le changement : plus de « ce moteur ne sait pas faire ».
    for (const e of ['claude', 'codex'] as const) {
      expect(agentSupport(e)).not.toBe('none');
    }
  });

  it('porte une note qui dit ce qui DIFFERE, pas une equivalence', () => {
    // L'injection donne la persona, pas le bac a sable ni le modele declares
    // dans le front-matter. Le taire serait une demi-verite.
    expect(AGENT_SUPPORT_NOTE.injected).toMatch(/persona/i);
    expect(AGENT_SUPPORT_NOTE.injected).toMatch(/mod[eè]le|outil/i);
    // Le mode natif n'a rien a expliquer.
    expect(AGENT_SUPPORT_NOTE.native).toBe(null);
  });
});
