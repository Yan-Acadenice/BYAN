// dispatch-router.test.ts — preuve du CERVEAU de dispatch porte
// (app/shared/dispatch/router.ts + natures.ts). Chaque test cible une regle du
// brief L1 et le defaut PRECIS qu'il attraperait si la regle sautait — pas
// seulement "ca marche".

import { describe, expect, test } from 'vitest';
import { effortsFor } from '../engine-options';
import { MODEL_TIERS } from '../workmanship';
import {
  RUNTIMES,
  routeRuntime,
  isVerificationNature,
  isCodexNature,
  normalizeNature,
} from '../dispatch/natures';
import {
  dispatch,
  applyModelFloor,
  isEffortValidForRuntime,
  DEFAULT_CODEX_MODEL,
} from '../dispatch/router';

describe('natures — routage bilingue nature -> moteur', () => {
  test('routeRuntime : natures d\'execution anglaises -> codex', () => {
    for (const n of ['shell', 'deploy', 'devops', 'ci', 'browser', 'automation']) {
      expect(routeRuntime(n)).toBe(RUNTIMES.CODEX);
    }
  });

  test('routeRuntime : natures d\'execution francaises -> codex (LE CAS DU BRIEF)', () => {
    // Le cas qui echouerait si le bilinguisme sautait : la source amont
    // (dispatch-router.js) ne connait que 'deploy'/'browser'/'automation' — pas
    // les natures francaises que .claude/workflows/byan-auto-dispatch.js
    // adopte deja ('deploiement', 'navigation').
    expect(routeRuntime('deploiement')).toBe(RUNTIMES.CODEX);
    expect(routeRuntime('navigation')).toBe(RUNTIMES.CODEX);
    expect(routeRuntime('automatisation')).toBe(RUNTIMES.CODEX);
  });

  test('routeRuntime : nature inconnue ou ambigue -> claude (defaut sur)', () => {
    expect(routeRuntime('n-importe-quoi')).toBe(RUNTIMES.CLAUDE);
    expect(routeRuntime(undefined)).toBe(RUNTIMES.CLAUDE);
  });

  test('routeRuntime : une nature qui ressemble a de l\'execution ET a de la verification reste claude', () => {
    // Ligne rouge #2 : verifiee AVANT la table Codex. "run-and-verify" contient
    // "run" (proche d'execution) mais porte "verify" — doit rester Claude.
    expect(routeRuntime('run-and-verify')).toBe(RUNTIMES.CLAUDE);
  });

  test('isVerificationNature : anglais et francais', () => {
    for (const n of ['verify', 'verification', 'verifie', 'verifier', 'validate', 'valide', 'review', 'revise', 'audit', 'check', 'qa']) {
      expect(isVerificationNature(n)).toBe(true);
    }
    expect(isVerificationNature('implementation')).toBe(false);
  });

  test('isCodexNature reste false pour une nature de verification meme si elle ressemble a de l\'execution', () => {
    // isCodexNature seul (sans passer par routeRuntime) NE fait PAS la
    // priorite verification -> ce test documente que c'est routeRuntime, pas
    // isCodexNature, qui porte la ligne rouge : isCodexNature repond juste "ce
    // mot appartient-il a la table Codex ?", independamment du contexte.
    expect(isCodexNature('run-and-verify')).toBe(false);
  });

  test('normalizeNature retire les accents et la casse', () => {
    expect(normalizeNature('  Déploiement  ')).toBe('deploiement');
  });
});

describe('dispatch — la ligne rouge de verification (aucun modele impose)', () => {
  test('une nature de verification ne se voit jamais imposer de modele ni d\'effort', () => {
    // Le cas qui echouerait si la regle sautait : sans elle, une complexite de
    // 95 pousserait vers 'fable' comme n'importe quelle autre nature — exactement
    // la fusion des deux cerveaux amont (lib/dispatch.js vs dispatch-router.js)
    // que M4 tranche en faveur de "rien n'est impose".
    const decision = dispatch({ nature: 'verification', complexity: 95 });
    expect(decision.model).toBeNull();
    expect(decision.effort).toBeNull();
  });

  test('la protection tient aussi en francais et a toutes les complexites', () => {
    for (const complexity of [0, 34, 67, 90, 100]) {
      const decision = dispatch({ nature: 'verifie', complexity });
      expect(decision.model).toBeNull();
      expect(decision.effort).toBeNull();
    }
  });

  test('une verification reste sur Claude meme si elle porte aussi un mot d\'execution', () => {
    const decision = dispatch({ nature: 'shell-verify', complexity: 50 });
    expect(decision.runtime).toBe(RUNTIMES.CLAUDE);
    expect(decision.model).toBeNull();
  });

  test('un plancher d\'agent est ignore pour une verification (rien n\'est impose, meme pas le plancher)', () => {
    const decision = dispatch({ nature: 'verification', complexity: 10, agentFloorModel: 'opus' });
    expect(decision.model).toBeNull();
  });
});

describe('dispatch — le plancher de modele d\'agent ne descend jamais (M1)', () => {
  test('un agent qui declare opus n\'est pas rabaisse en haiku par un score faible (LE CAS DU BRIEF)', () => {
    // Le cas qui echouerait si la regle sautait : une complexite de 5 calcule
    // 'haiku' seule. Sans le plancher, la reponse serait 'haiku' — la
    // retrogradation que M1 (docs/dispatch-natif/L0-mesures.md) et la doctrine
    // STRICT-2 (No Downgrade) interdisent.
    const decision = dispatch({ nature: 'implementation', complexity: 5, agentFloorModel: 'opus' });
    expect(decision.model).toBe('opus');
    expect(decision.reasoning).toMatch(/plancher/);
  });

  test('sans plancher, la meme tache faible calcule bien haiku', () => {
    const decision = dispatch({ nature: 'implementation', complexity: 5 });
    expect(decision.model).toBe('haiku');
  });

  test('un plancher plus BAS que le calcul ne plafonne pas le calcul (le plancher ne devient jamais un plafond)', () => {
    const decision = dispatch({ nature: 'implementation', complexity: 80, agentFloorModel: 'haiku' });
    expect(decision.model).toBe('opus');
  });

  test('un plancher egal au calcul ne change rien', () => {
    const decision = dispatch({ nature: 'implementation', complexity: 50, agentFloorModel: 'sonnet' });
    expect(decision.model).toBe('sonnet');
  });

  test('applyModelFloor est le rang unique (workmanship.MODEL_TIERS), teste directement', () => {
    expect(applyModelFloor('haiku', 'opus')).toBe('opus');
    expect(applyModelFloor('opus', 'haiku')).toBe('opus');
    expect(applyModelFloor('sonnet', null)).toBe('sonnet');
    expect(applyModelFloor('fable', 'fable')).toBe('fable');
  });
});

describe('dispatch — la complexite fixe le modele Claude sur l\'echelle a 4 barreaux', () => {
  test.each([
    [10, 'haiku'],
    [50, 'sonnet'],
    [80, 'opus'],
    [95, 'fable'],
  ])('complexite %i -> modele "%s"', (complexity, expected) => {
    expect(dispatch({ nature: 'implementation', complexity }).model).toBe(expected);
  });

  test('les quatre modeles rendus appartiennent bien a l\'echelle connue (workmanship.MODEL_TIERS)', () => {
    for (const complexity of [10, 50, 80, 95]) {
      const decision = dispatch({ nature: 'analyse', complexity });
      expect(MODEL_TIERS).toContain(decision.model);
    }
  });
});

describe('dispatch — le moteur Codex', () => {
  test('une nature d\'execution route vers codex avec le modele mesure de ce depot', () => {
    const decision = dispatch({ nature: 'shell', complexity: 50 });
    expect(decision.runtime).toBe(RUNTIMES.CODEX);
    // Le cas qui echouerait si la mesure n'etait pas reprise : la source amont
    // code en dur 'gpt-5.4', qui n'est PAS le defaut mesure sur ce depot
    // (docs/dispatch-natif/L0-mesures.md) — le portage ne doit pas la recopier.
    expect(decision.model).toBe(DEFAULT_CODEX_MODEL);
    expect(decision.model).not.toBe('gpt-5.4');
  });

  test('une nature de deploiement (francais) route aussi vers codex', () => {
    expect(dispatch({ nature: 'deploiement', complexity: 30 }).runtime).toBe(RUNTIMES.CODEX);
  });
});

describe('dispatch — l\'effort est emis des DEUX cotes, et valide pour le moteur rendu', () => {
  test('claude recoit un effort non nul (LE CAS DU BRIEF : la source amont rend null cote claude)', () => {
    // Le cas qui echouerait si la regle sautait : dispatch-router.js rend
    // `effort: null` cote claude avec le commentaire "no separate knob" — faux
    // pour ce depot (claude --effort accepte 6 valeurs, mesure contre le
    // binaire, commit 079518f). Sans la correction, ce test verrait `null`.
    const decision = dispatch({ nature: 'implementation', complexity: 50 });
    expect(decision.runtime).toBe(RUNTIMES.CLAUDE);
    expect(decision.effort).not.toBeNull();
  });

  test('l\'effort rendu est un membre valide du domaine du moteur rendu, sur toute la plage 0-100, des DEUX cotes', () => {
    for (let complexity = 0; complexity <= 100; complexity += 5) {
      const claudeDecision = dispatch({ nature: 'implementation', complexity });
      expect(claudeDecision.effort).not.toBeNull();
      expect(effortsFor('claude')).toContain(claudeDecision.effort);

      const codexDecision = dispatch({ nature: 'shell', complexity });
      expect(codexDecision.effort).not.toBeNull();
      expect(effortsFor('codex')).toContain(codexDecision.effort);
    }
  });

  test('isEffortValidForRuntime reflete exactement effortsFor, sans le recopier', () => {
    expect(isEffortValidForRuntime('claude', 'ultracode')).toBe(true);
    expect(isEffortValidForRuntime('codex', 'ultracode')).toBe(false);
    expect(isEffortValidForRuntime('codex', 'none')).toBe(true);
    expect(isEffortValidForRuntime('claude', 'none')).toBe(false);
  });
});

describe('dispatch — le point de branchement modele x effort n\'est PAS valide ici (un autre lot le fait)', () => {
  test('un validateur fourni qui rejette la paire ajoute un avertissement, ne change rien a la decision', () => {
    const decision = dispatch({
      nature: 'shell',
      complexity: 50,
      validateModelEffort: () => false,
    });
    // La decision reste identique a celle sans validateur : ce module n'arbitre
    // pas la matrice modele x effort, il expose seulement le point de branchement.
    const sansValidateur = dispatch({ nature: 'shell', complexity: 50 });
    expect(decision.runtime).toBe(sansValidateur.runtime);
    expect(decision.model).toBe(sansValidateur.model);
    expect(decision.effort).toBe(sansValidateur.effort);
    expect(decision.warnings.length).toBeGreaterThan(0);
  });

  test('un validateur qui accepte ne pose aucun avertissement', () => {
    const decision = dispatch({
      nature: 'shell',
      complexity: 50,
      validateModelEffort: () => true,
    });
    expect(decision.warnings).toEqual([]);
  });

  test('sans validateur fourni, aucun avertissement (le silence n\'est pas un refus)', () => {
    expect(dispatch({ nature: 'implementation', complexity: 50 }).warnings).toEqual([]);
  });
});

describe('dispatch — determinisme', () => {
  test('meme entree, meme decision', () => {
    const input = { nature: 'implementation', complexity: 42, agentFloorModel: null };
    expect(dispatch(input)).toEqual(dispatch(input));
  });
});

// ---------------------------------------------------------------------------
// Le routage de moteur sur du francais courant — defaut mesure le 2026-08-07
// ---------------------------------------------------------------------------
//
// La recherche de racine se faisait par sous-chaine BRUTE, et le routage etait
// INVERSE sur des phrases qu'on tape tous les jours :
//
//   « merci pour ton aide »              -> "merci" contient "ci" (integration
//   « ceci est un simple bonjour »          continue) -> partait sur Codex
//   « relance les conteneurs docker »    -> de l'execution pure, restait sur Claude
//
// Le premier cas est le pire : "merci" est un des mots les plus courants d'une
// conversation en francais, et il changeait le moteur du tour.
describe('le routage de moteur ne se laisse pas avoir par le francais courant', () => {
  test('garde les mots polis sur Claude', () => {
    for (const phrase of [
      'merci pour ton aide',
      'ceci est un simple bonjour',
      'precise ta pensee',
      'voici le contexte',
    ]) {
      expect(routeRuntime(phrase), phrase).toBe('claude');
    }
  });

  test("reconnait l'exploitation en francais et l'envoie sur Codex", () => {
    // Ces quatre-la restaient sur Claude faute d'une racine qui les reconnaisse.
    for (const phrase of [
      'relance les conteneurs docker',
      'redemarre le service',
      'deploie en production',
      'lance la commande de migration',
    ]) {
      expect(routeRuntime(phrase), phrase).toBe('codex');
    }
  });

  test('garde la verification sur Claude, meme quand la phrase parle de conteneurs', () => {
    // La ligne rouge passe AVANT la table Codex : un moteur ne note pas son
    // propre travail, meme si la phrase ressemble a de l'exploitation.
    expect(routeRuntime('verifie que le conteneur redemarre bien')).toBe('claude');
  });
});
