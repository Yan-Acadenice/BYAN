// dispatch-complexity.test.ts — preuve que le score de complexite porte
// (app/shared/dispatch/complexity.ts) reconnait le francais reel, pas
// seulement l'anglais de src/byan-v2/dispatcher/complexity-scorer.js.
//
// Chaque test de reconnaissance utilise une PHRASE francaise complete, jamais
// un mot isole : le brief L1 le demande explicitement, et un mot isole ne
// prouve pas que le stem tient dans un contexte de phrase reel (ponctuation,
// accents, mots voisins qui pourraient accidentellement matcher autre chose).

import { describe, expect, test } from 'vitest';
import {
  calculateComplexity,
  classifyTaskType,
  classifyKeywordWeight,
  complexityRung,
  COMPLEXITY_THRESHOLDS,
  type ComplexityTask,
} from '../dispatch/complexity';

describe('calculateComplexity — fidelite a la source (complexity-scorer.js)', () => {
  test('leve une erreur si le prompt est vide', () => {
    expect(() => calculateComplexity({ prompt: '' })).toThrow('prompt is required');
  });

  test('leve une erreur si le prompt ne contient que des espaces', () => {
    expect(() => calculateComplexity({ prompt: '   ' })).toThrow('prompt is required');
  });

  test('rend un score entre 0 et 100', () => {
    const score = calculateComplexity({ prompt: 'fais quelque chose' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('plafonne a 100 meme avec tous les facteurs au maximum', () => {
    const task: ComplexityTask = {
      prompt: Array(300).fill('critique securite architecture performance scalabilite refactorise optimise').join(' '),
      type: 'analysis',
      context: {
        enorme: Array(100).fill({ imbrique: { donnee: 'complexe' } }),
        racineProjet: '/chemin',
        historique: Array(50).fill({ q: 'question' }),
        reponses: Array(50).fill({ r: 'reponse' }),
      },
    };
    expect(calculateComplexity(task)).toBeLessThanOrEqual(100);
  });

  test('meme entree, meme score (deterministe, aucune horloge ni hasard)', () => {
    const task: ComplexityTask = { prompt: 'analyse ce module', context: { a: 1 } };
    expect(calculateComplexity(task)).toBe(calculateComplexity(task));
  });

  test('un contexte plus large ne fait jamais baisser le score', () => {
    const sansContexte = calculateComplexity({ prompt: 'analyse ce module' });
    const avecContexte = calculateComplexity({
      prompt: 'analyse ce module',
      context: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
    });
    expect(avecContexte).toBeGreaterThanOrEqual(sansContexte);
  });
});

describe('classifyTaskType — le francais reel, en phrases completes', () => {
  // Le cas qui echouerait si la regle sautait : sans les stems francais, TOUTES
  // ces phrases retourneraient `null` (aucun mot-cle anglais dedans), alors que
  // leur equivalent anglais direct est deja reconnu par la source. La regle
  // teste ici est precisement l'ecart que M5/le brief L1 pointe.

  test('« implemente la fonctionnalite de connexion » -> implementation', () => {
    expect(classifyTaskType('Implémente la fonctionnalité de connexion utilisateur')).toBe('implementation');
  });

  test('« corrige le bug » -> implementation (le francais n\'a pas de racine commune avec "fix")', () => {
    expect(classifyTaskType('Corrige le bug dans le module de paiement')).toBe('implementation');
  });

  test('« documente cette API » -> implementation', () => {
    expect(classifyTaskType('Documente cette API pour les autres développeurs')).toBe('implementation');
  });

  test('« deploie l\'application » -> implementation (deploi != deploy, racine differente)', () => {
    expect(classifyTaskType("Déploie l'application en production dès ce soir")).toBe('implementation');
  });

  test('« analyse l\'architecture » -> analysis (analy + architect, deux stems, meme categorie)', () => {
    expect(classifyTaskType("Analyse l'architecture de ce système avant de continuer")).toBe('analysis');
  });

  // ECRIRE un test est du travail d'implementation, pas d'analyse. Une premiere
  // version de ce test attendait 'analysis', en raisonnant qu'un test est une
  // forme d'evaluation. Le raisonnement se tient sur le sens, pas sur le cout :
  // la categorie 'analysis' vaut 75 points, et la mesure du 2026-08-07 a montre
  // ce qu'elle produit — "refactor the payment module and cover it with tests"
  // passait de 62 a 92, et a 92 l'echelle rend `fable`, le modele de dernier
  // recours a environ deux fois le prix d'Opus, pour un refactor de routine.
  // ANALYSER une suite de tests serait de l'analyse ; en ecrire une, non.
  test('« teste la fonction » -> implementation (ecrire un test, c\'est construire)', () => {
    expect(classifyTaskType('Teste la fonction de connexion avec un jeu de données invalide')).toBe('implementation');
  });

  test('« explore ce dossier » -> exploration', () => {
    expect(classifyTaskType('Explore ce dossier et liste les fichiers présents')).toBe('exploration');
  });

  test('« verifie la configuration » -> exploration', () => {
    expect(classifyTaskType('Vérifie la configuration actuelle du serveur')).toBe('exploration');
  });

  test('parite avec l\'anglais : le francais et l\'anglais direct rendent la meme categorie', () => {
    expect(classifyTaskType('implement the login feature')).toBe(
      classifyTaskType('implémente la fonctionnalité de connexion'),
    );
    expect(classifyTaskType('analyze the system architecture')).toBe(
      classifyTaskType("analyse l'architecture du système"),
    );
  });

  test('rend null quand aucune categorie ne correspond', () => {
    expect(classifyTaskType('bonjour, comment vas-tu aujourd\'hui ?')).toBeNull();
  });
});

describe('classifyKeywordWeight — le francais reel, en phrases completes', () => {
  test('« refactorise ce module » -> medium (LE CAS DU BRIEF : refactorise/refactoriser)', () => {
    // Le cas qui echouerait si la regle sautait : le stem source est
    // `\brefactor\b` (limite de mot stricte), qui NE matche PAS "refactorise"
    // (il faudrait le mot exact "refactor"). Sans le passage a `\w*`, ce test
    // rendrait `null` au lieu de 'medium'.
    expect(classifyKeywordWeight('Refactorise ce module pour le rendre plus lisible')).toBe('medium');
  });

  test('« optimise les performances » -> critical (performance domine optimise, 25 > 17)', () => {
    expect(classifyKeywordWeight('Optimise les performances de la base de données')).toBe('critical');
  });

  test('« securise l\'acces a l\'API » -> critical (secur couvre securite ET securise)', () => {
    expect(classifyKeywordWeight("Sécurise l'accès à l'API avant la mise en production")).toBe('critical');
  });

  // Les POIDS de mots-cles sont une liste fermee, heritee telle quelle de la
  // source : refactor, optimize, implement, integrate, update, modify. Ni
  // "corrige" ni "documente" n'y sont, ni leurs equivalents anglais. Une
  // premiere version de ce test attendait 'medium', ce qui avait demande
  // d'ajouter fix/corrig/document a la liste — et cet ajout a fait passer
  // "deploy the new version to the production server" de 45 a 62 sur un texte
  // ANGLAIS identique a celui de la source. Le poids reste donc nul ici : ces
  // deux verbes sont reconnus par le TYPE de tache (implementation, 45 points),
  // ce qui est leur place. Le test de parite verrouille cette frontiere.
  test('« corrige et documente » -> aucun poids (la liste des poids est fermee)', () => {
    expect(classifyKeywordWeight('Corrige ce bug puis documente le correctif')).toBeNull();
    // Mais le TYPE, lui, les reconnait : le travail n'est pas ignore.
    expect(classifyTaskType('Corrige ce bug puis documente le correctif')).toBe('implementation');
  });

  test('« liste les fichiers » -> simple', () => {
    expect(classifyKeywordWeight('Liste les fichiers présents dans ce dossier')).toBe('simple');
  });

  test('rend null pour une phrase sans mot-cle pondere', () => {
    expect(classifyKeywordWeight('bonjour, comment vas-tu aujourd\'hui ?')).toBeNull();
  });

  test('parite avec l\'anglais : "refactor" (EN) et "refactorise" (FR) rendent le meme score', () => {
    const enScore = calculateComplexity({ prompt: 'refactor this module to make it more readable' });
    const frScore = calculateComplexity({ prompt: 'refactorise ce module pour le rendre plus lisible' });
    // Les deux phrases ont un nombre de mots proche et le meme mot-cle de
    // fond (refactor/refactorise) : meme categorie de poids, donc un score du
    // meme ordre de grandeur. Une egalite stricte n'est pas visee (le nombre de
    // mots differe legerement entre les deux langues) — seule la RECONNAISSANCE
    // du mot-cle est testee ici, via un ecart borne.
    expect(Math.abs(enScore - frScore)).toBeLessThanOrEqual(5);
  });
});

describe('complexityRung — l\'echelle a 4 barreaux, une seule table de seuils', () => {
  test('les seuils exposes sont bien 34/67/90 (verrou anti-derive, M5)', () => {
    expect(COMPLEXITY_THRESHOLDS).toEqual({ medium: 34, high: 67, extreme: 90 });
  });

  test('valeurs juste sous et juste au-dessus de chaque seuil', () => {
    expect(complexityRung(33)).toBe('trivial');
    expect(complexityRung(34)).toBe('medium');
    expect(complexityRung(66)).toBe('medium');
    expect(complexityRung(67)).toBe('high');
    expect(complexityRung(89)).toBe('high');
    expect(complexityRung(90)).toBe('extreme');
  });

  test('bornes extremes', () => {
    expect(complexityRung(0)).toBe('trivial');
    expect(complexityRung(100)).toBe('extreme');
  });

  test('accepte des labels textuels en repli (fidele a la source)', () => {
    expect(complexityRung('trivial')).toBe('trivial');
    expect(complexityRung('low')).toBe('trivial');
    expect(complexityRung('moderate')).toBe('medium');
    expect(complexityRung('hard')).toBe('high');
    expect(complexityRung('frontier')).toBe('extreme');
  });

  test('un label ou un nombre non reconnu retombe sur "medium", jamais sur un extreme silencieux', () => {
    expect(complexityRung('n-importe-quoi')).toBe('medium');
    expect(complexityRung(Number.NaN)).toBe('medium');
  });
});
