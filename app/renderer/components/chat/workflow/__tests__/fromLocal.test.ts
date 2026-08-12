// Ce que le chat local peut REELLEMENT alimenter dans les trois autres ecrans.
//
// Les ecrans ont ete concus pour un chantier multi-agents. En local il n'y a ni
// equipe, ni reprise a un point choisi, ni protocole d'autorisation. Plutot que
// de les laisser vides ou de leur inventer des chiffres, chacun est branche sur
// un signal que l'application MESURE deja :
//
//   contamination  -> une etape qui a echoue, et celles qui ont tourne apres
//   prix du retour -> ce que couterait vraiment de repartir, ou de changer de moteur
//   main levee     -> ce qui bloque pour de vrai et attend une decision
//
// La regle qui tient tout : aucune de ces fonctions ne rend quelque chose quand
// le signal est absent. Pas d'ecran vide, pas de zero fabrique.

import { describe, expect, it } from 'vitest';
import { contaminationSteps, contaminationVisible, rewindPoints, raisedHandState } from '../fromLocal';
import type { LocalChatActivity } from '../../../../../shared/tool-activity';
import type { WorkStep } from '../types';
import type { LocalChatUsageTurn } from '../../../../context/LocalChatContext';

const T0 = 1_700_000_000_000;

function debut(id: string, name: string, at: number, detail?: string): LocalChatActivity {
  return { name, detail, phase: 'start', id, at: T0 + at };
}
function fin(id: string, name: string, at: number, ok: boolean): LocalChatActivity {
  return { name, phase: 'end', id, at: T0 + at, ok };
}

describe('contaminationSteps', () => {
  it('ne rend RIEN quand aucune etape n a echoue', () => {
    // Un ecran de contamination sans echec affirmerait un probleme inexistant.
    const steps = contaminationSteps(
      [debut('a', 'Read', 0), fin('a', 'Read', 100, true), debut('b', 'Bash', 200), fin('b', 'Bash', 300, true)],
      'claude',
    );
    expect(steps).toEqual([]);
  });

  it('ne rend RIEN quand rien n a tourne apres l echec', () => {
    // L'echec est le dernier geste du tour : personne n'a bati dessus, donc il
    // n'y a rien a montrer sur cet ecran-la.
    const steps = contaminationSteps([debut('a', 'Bash', 0), fin('a', 'Bash', 100, false)], 'claude');
    expect(steps).toEqual([]);
  });

  it('marque l etape fautive suspecte et rattache celles qui ont suivi', () => {
    const steps = contaminationSteps(
      [
        debut('a', 'Read', 0),
        fin('a', 'Read', 100, true),
        debut('b', 'Bash', 200, 'npm test'),
        fin('b', 'Bash', 300, false),
        debut('c', 'Edit', 400, 'src/index.ts'),
        fin('c', 'Edit', 500, true),
      ],
      'claude',
    );
    const fautive = steps.find((s) => s.id === 'b');
    const apres = steps.find((s) => s.id === 'c');
    expect(fautive?.state).toBe('rendu-suspect');
    expect(apres?.state).toBe('rendu');
    // La relation est TEMPORELLE : c a tourne apres b. On l'exprime avec le
    // champ prevu pour ca, et la vue dit en toutes lettres que c'est un « apres »
    // et pas une dependance prouvee.
    expect(apres?.consumes).toEqual(['b']);
    // Ce qui precede l'echec n'est pas concerne.
    expect(steps.find((s) => s.id === 'a')).toBeUndefined();
  });

  it('deduit la nature de l etape de l outil, sans inventer', () => {
    const steps = contaminationSteps(
      [
        debut('x', 'Bash', 0),
        fin('x', 'Bash', 10, false),
        debut('r', 'Read', 20),
        fin('r', 'Read', 30, true),
        debut('w', 'Write', 40),
        fin('w', 'Write', 50, true),
        debut('z', 'AutreChose', 60),
        fin('z', 'AutreChose', 70, true),
      ],
      'claude',
    );
    expect(steps.find((s) => s.id === 'r')?.nature).toBe('reperage');
    expect(steps.find((s) => s.id === 'w')?.nature).toBe('implementation');
    // Un outil qu'on ne connait pas est 'autre'. Le ranger ailleurs serait deviner.
    expect(steps.find((s) => s.id === 'z')?.nature).toBe('autre');
  });

  it('porte le moteur comme intervenant, pas un agent BYAN invente', () => {
    const steps = contaminationSteps(
      [debut('a', 'Bash', 0), fin('a', 'Bash', 10, false), debut('b', 'Read', 20), fin('b', 'Read', 30, true)],
      'codex',
    );
    expect(steps.every((s) => s.personId === 'codex')).toBe(true);
  });

  it('ne rapporte aucun cout par etape : le moteur n en publie pas', () => {
    const steps = contaminationSteps(
      [debut('a', 'Bash', 0), fin('a', 'Bash', 10, false), debut('b', 'Read', 20), fin('b', 'Read', 30, true)],
      'claude',
    );
    // Un tiret, jamais un zero : le cout est rapporte par TOUR, pas par outil.
    expect(steps.every((s) => s.costUsd === null || s.costUsd === undefined)).toBe(true);
    expect(steps.every((s) => typeof s.silenceReason === 'string')).toBe(true);
  });
});

const tour = (n: number, costUsd?: number): LocalChatUsageTurn =>
  ({ engine: 'claude', engineTurn: n, ...(costUsd === undefined ? {} : { costUsd }) }) as LocalChatUsageTurn;

describe('rewindPoints', () => {
  it('ne rend RIEN tant qu il n y a rien a jeter', () => {
    expect(rewindPoints([], 'claude')).toEqual([]);
  });

  it('offre les deux retours que l application sait REELLEMENT faire', () => {
    // Elle ne sait pas revenir au tour 3. Elle sait repartir de zero, et ouvrir
    // une session sur l'autre moteur. Proposer un troisieme point serait
    // promettre un geste qui n'existe pas.
    const points = rewindPoints([tour(1, 0.10), tour(2, 0.14), tour(3, 0.17)], 'claude');
    expect(points.map((p) => p.id)).toEqual(['repartir', 'changer-de-moteur']);
  });

  it('chiffre ce que chaque retour jette, a partir des couts mesures', () => {
    // claude publie un cumul : 0.10 -> 0.14 -> 0.17 vaut 0.17 au total, pas 0.41.
    const points = rewindPoints([tour(1, 0.10), tour(2, 0.14), tour(3, 0.17)], 'claude');
    expect(points[0].discardedCostUsd).toBeCloseTo(0.17, 6);
  });

  it('EXCLUT un cumul non convertible du total, au lieu de l additionner', () => {
    // La liste des tours est bornee a 50. Un tour dont le precedent a ete elague
    // ne donne pas un cout : `turnCosts` le rend en 'cumulative'. L'ajouter au
    // total gonflerait le prix du retour d'un montant qui a deja ete compte.
    // Ici : tour 12 = cumul 0.50 (inutilisable), tour 13 = 0.55 -> cout reel 0.05.
    const points = rewindPoints(
      [
        { engine: 'claude', engineTurn: 12, costUsd: 0.50 } as LocalChatUsageTurn,
        { engine: 'claude', engineTurn: 13, costUsd: 0.55 } as LocalChatUsageTurn,
      ],
      'claude',
    );
    expect(points[0].discardedCostUsd).toBeCloseTo(0.05, 6);
  });

  it('dit pourquoi le montant manque plutot que d afficher zero', () => {
    // Trois tours : assez pour que le panneau s'affiche sans cout mesure (voir le
    // seuil dans fromLocal.ts). C'est justement le cas ou le montant manque.
    const points = rewindPoints([tour(1), tour(2), tour(3)], 'claude');
    expect(points[0].discardedCostUsd ?? null).toBeNull();
    expect(typeof points[0].discardedSilenceReason).toBe('string');
  });

  it('nomme le moteur d en face dans le point de changement', () => {
    const surClaude = rewindPoints([tour(1, 0.1)], 'claude');
    expect(surClaude[1].decision).toMatch(/codex/i);
    // Trois tours : codex ne publie aucun montant, il faut donc du volume pour
    // que le panneau s'affiche.
    const surCodex = rewindPoints(
      [1, 2, 3].map((n) => ({ engine: 'codex', engineTurn: n }) as LocalChatUsageTurn),
      'codex',
    );
    expect(surCodex[1].decision).toMatch(/claude/i);
  });

  it('garde le fil affiche quand on change de moteur, et le dit', () => {
    const points = rewindPoints([tour(1, 0.1), tour(2, 0.2)], 'claude');
    const changement = points[1];
    // Le fil reste a l'ecran : c'est ce que `kept` doit porter. Ce qui est perdu,
    // c'est le contexte du moteur — pas l'affichage.
    expect(changement.kept.length).toBeGreaterThan(0);
    expect(changement.redone.length).toBeGreaterThan(0);
  });
});

describe('raisedHandState', () => {
  it('ne rend RIEN quand rien ne bloque', () => {
    expect(
      raisedHandState({ error: null, sessionCwd: '/home/yan/projet', engine: 'claude', codexAvailable: true }),
    ).toBeNull();
  });

  it('leve la main quand aucun dossier n est choisi', () => {
    const etat = raisedHandState({ error: null, sessionCwd: null, engine: 'claude', codexAvailable: true });
    expect(etat?.hand.gesture).toMatch(/dossier/i);
    // Corrige le 2026-08-05. J'avais mis `true` en raisonnant « le choix se
    // garde ». Il se garde, oui — mais ce n'est pas une AUTORISATION accordee,
    // c'est un reglage. `remembers: true` faisait apparaitre un bouton
    // « Autoriser pour la suite » sur un ecran qui demandait de choisir un
    // dossier. Un libelle emprunte a cote fait douter de tout le reste.
    expect(etat?.gate.remembers).toBe(false);
  });

  it('leve la main quand le moteur demande n est pas installe', () => {
    const etat = raisedHandState({ error: null, sessionCwd: '/p', engine: 'codex', codexAvailable: false });
    expect(etat?.hand.gesture).toMatch(/codex/i);
    // Rien a se rappeler : ce n'est pas une autorisation, c'est une absence.
    expect(etat?.gate.remembers).toBe(false);
  });

  it('leve la main sur une erreur qui a stoppe le tour, et reste incertaine', () => {
    const etat = raisedHandState({ error: 'ENOENT: claude introuvable', sessionCwd: '/p', engine: 'claude', codexAvailable: true });
    expect(etat?.hand.gesture).toMatch(/erreur|reprendre/i);
    // Elle ne sait pas si reprendre marchera : le type de confiance est binaire,
    // et « pas sure » doit porter son motif.
    expect(etat?.hand.confidence.sure).toBe(false);
  });

  it('traite le blocage le plus bloquant en premier', () => {
    // Sans dossier, rien ne peut demarrer : ce blocage passe avant une erreur.
    const etat = raisedHandState({ error: 'une erreur', sessionCwd: null, engine: 'claude', codexAvailable: true });
    expect(etat?.hand.gesture).toMatch(/dossier/i);
  });

  it('porte le moteur comme intervenant', () => {
    const etat = raisedHandState({ error: null, sessionCwd: null, engine: 'codex', codexAvailable: true });
    expect(etat?.hand.personId).toBe('codex');
  });
});

// ---------------------------------------------------------------------------
// Le panneau doit NOMMER le fautif, pas afficher « rien ne depasse ».
//
// Defaut trouve le 2026-07-31 en verifiant le paquet : le panneau designait le
// point d'entree du vide par le seul signal « reperage qui n'a rien rapporte »
// (nature 'reperage' ET resultCount === 0). Les etapes locales ne remplissent ni
// l'un ni l'autre — un `Bash` en echec n'est pas une recherche vide. Resultat :
// la phrase de tete affichait « rien dans la forme du travail ne depasse » sur un
// ecran qui n'apparait QUE parce que quelque chose a echoue. Le contraire du vrai.
//
// La correction ne deguise pas l'echec en recherche vide : elle apprend au
// panneau a lire l'etat 'rendu-suspect', qui est la designation explicite du
// fautif dans la donnee.
// ---------------------------------------------------------------------------
import { contaminationPhrase } from '../ContaminationPanel';

describe('contaminationPhrase — sur des etapes locales', () => {
  const etapes = contaminationSteps(
    [
      debut('a', 'Bash', 0, 'npm test'),
      fin('a', 'Bash', 100, false),
      debut('b', 'Edit', 200, 'src/index.ts'),
      fin('b', 'Edit', 300, true),
    ],
    'claude',
  );

  it('nomme l etape fautive au lieu de dire que rien ne depasse', () => {
    const phrase = contaminationPhrase(etapes, null);
    expect(phrase).not.toMatch(/rien.*ne dépasse/i);
    expect(phrase).toMatch(/Bash/);
  });

  it('dit que l etape n a PAS ABOUTI, pas qu elle a cherche sans trouver', () => {
    // Un `Bash` en echec n'a pas « cherche sans rien rapporter » : il a echoue.
    // Reprendre la formule du reperage vide serait un contresens.
    const phrase = contaminationPhrase(etapes, null);
    expect(phrase).not.toMatch(/cherchait/i);
    expect(phrase).toMatch(/abouti|échoué/i);
  });

  it('compte ce qui a tourne apres', () => {
    expect(contaminationPhrase(etapes, null)).toMatch(/1 personne|par-dessus|après/i);
  });
});

// ---------------------------------------------------------------------------
// Deux defauts vus a l'ecran par l'utilisateur (2026-08-05, capture).
//
// 1. Le geste en attente recopiait l'erreur BRUTE. Quand codex rend un refus
//    d'API, c'est 400 caracteres de JSON : illisible, et ca noie la question
//    qu'on pose a l'utilisateur.
// 2. L'intervenant s'affichait « intervenant non identifie » alors que
//    l'application SAIT que c'est codex. Dire qu'on ignore ce qu'on sait est
//    pire qu'un nom technique.
// ---------------------------------------------------------------------------
describe('raisedHandState — lisibilite de l erreur', () => {
  const ERREUR_JSON = 'codex: {\n"type": "error",\n"error": {\n"type": "invalid_request_error",\n'
    + '"code": "unsupported_value",\n"message": "Unsupported value: \'minimal\' is not supported with the '
    + '\'gpt-5.6-sol-premium-1p-codexswic-ev3\' model. Supported values are: \'none\', \'low\', \'medium\', '
    + '\'high\', \'xhigh\', and \'max\'.",\n"param": "reasoning.effort"\n},\n"status": 400\n}';

  it('ne recopie PAS le pave JSON dans le geste', () => {
    const etat = raisedHandState({ error: ERREUR_JSON, sessionCwd: '/p', engine: 'codex', codexAvailable: true });
    const geste = etat?.hand.gesture ?? '';
    expect(geste.length).toBeLessThan(200);
    expect(geste).not.toContain('"type"');
    expect(geste).not.toContain('{');
  });

  it('garde ce qui EXPLIQUE le refus, pas l enveloppe', () => {
    // Le message utile est dans le champ `message`. C'est lui qu'on veut lire.
    const geste = raisedHandState({ error: ERREUR_JSON, sessionCwd: '/p', engine: 'codex', codexAvailable: true })?.hand.gesture ?? '';
    expect(geste).toMatch(/minimal/);
    expect(geste).toMatch(/not supported|pas support/i);
  });

  it('laisse passer une erreur deja courte, sans la mutiler', () => {
    const geste = raisedHandState({ error: 'claude introuvable', sessionCwd: '/p', engine: 'claude', codexAvailable: true })?.hand.gesture ?? '';
    expect(geste).toContain('claude introuvable');
  });

  it('borne une erreur longue qui n est PAS du JSON', () => {
    const geste = raisedHandState({ error: 'x'.repeat(900), sessionCwd: '/p', engine: 'claude', codexAvailable: true })?.hand.gesture ?? '';
    expect(geste.length).toBeLessThan(200);
    // On dit que c'est coupe, plutot que de laisser croire a une phrase finie.
    expect(geste).toMatch(/…|\.\.\./);
  });
});

// ---------------------------------------------------------------------------
// Les libelles des boutons doivent DIRE le geste, pas emprunter celui d'a cote.
//
// DEFAUT VU A L'ECRAN (2026-08-05, capture) : le geste en attente etait
// « choisir le dossier du projet », et les boutons disaient « Autoriser une
// fois » / « Refuser », avec un journal des « autorisations accordees ». Aucun
// rapport. J'avais plaque un etat de blocage sur un ecran concu pour une demande
// de permission : la donnee etait juste, le vocabulaire etait emprunte et faux.
//
// Les trois blocages locaux ne sont PAS des autorisations :
//   dossier absent  -> il faut CHOISIR un dossier
//   moteur absent   -> il faut BASCULER sur l'autre
//   erreur          -> il faut REESSAYER, ou laisser tomber
// Seul le dernier ressemble a un « accepter / refuser ».
// ---------------------------------------------------------------------------
describe('raisedHandState — les libelles disent le geste', () => {
  it('propose de CHOISIR un dossier, pas de l autoriser', () => {
    const etat = raisedHandState({ error: null, sessionCwd: null, engine: 'claude', codexAvailable: true });
    expect(etat?.actions.primary).toMatch(/choisir/i);
    expect(etat?.actions.primary).not.toMatch(/autoris/i);
  });

  it('propose de BASCULER quand le moteur manque', () => {
    const etat = raisedHandState({ error: null, sessionCwd: '/p', engine: 'codex', codexAvailable: false });
    expect(etat?.actions.primary).toMatch(/claude/i);
    expect(etat?.actions.primary).not.toMatch(/autoris/i);
  });

  it('propose de REESSAYER apres une erreur', () => {
    const etat = raisedHandState({ error: 'boum', sessionCwd: '/p', engine: 'claude', codexAvailable: true });
    expect(etat?.actions.primary).toMatch(/r[eé]essayer|relancer/i);
  });

  it('nomme le refus selon ce qu on refuse vraiment', () => {
    // « Refuser » un choix de dossier n'a pas de sens : on l'ECARTE.
    const dossier = raisedHandState({ error: null, sessionCwd: null, engine: 'claude', codexAvailable: true });
    expect(dossier?.actions.dismiss).toMatch(/plus tard|écarter|ignorer/i);
  });

  it('ne propose JAMAIS un bouton « pour la suite » sur un blocage local', () => {
    // Aucun des trois n'est une permission qui se garde. Le champ n'existe donc
    // pas, plutot que d'exister vide — un bouton absent ne trompe personne.
    for (const etat of [
      raisedHandState({ error: null, sessionCwd: null, engine: 'claude', codexAvailable: true }),
      raisedHandState({ error: null, sessionCwd: '/p', engine: 'codex', codexAvailable: false }),
      raisedHandState({ error: 'boum', sessionCwd: '/p', engine: 'claude', codexAvailable: true }),
    ]) {
      expect(etat?.gate.remembers).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Le prix du retour ne s'affiche que s'il y a quelque chose a perdre.
//
// DEFAUT VU A L'ECRAN (2026-08-05, capture) : apres UN tour « salut mon reuf »,
// le panneau « Revenir en arriere » occupait tout l'ecran sous une reponse d'une
// ligne. Revenir en arriere pour jeter un bonjour qui n'a rien coute : la
// question ne se pose pas, et le panneau noyait la reponse.
//
// C'est l'invariant que j'applique partout ailleurs et que j'avais oublie ici :
// pas de signal, pas d'ecran. Le signal, pour cet ecran, c'est « il y a quelque
// chose de mesurable a perdre » — un cout chiffre, ou plusieurs tours.
//
// Et une faute d'accord au passage : « les 1 tour ».
// ---------------------------------------------------------------------------
describe('rewindPoints — ne s affiche que s il y a quelque chose a perdre', () => {
  it('ne rend RIEN apres un seul tour sans cout mesure', () => {
    // Le cas exact de la capture : un bonjour, aucun montant rapporte.
    expect(rewindPoints([{ engine: 'codex', engineTurn: 1 } as LocalChatUsageTurn], 'codex')).toEqual([]);
  });

  it('rend les points des qu un COUT est mesure, meme sur un seul tour', () => {
    // Un montant chiffre est une vraie information a peser.
    const points = rewindPoints([tour(1, 0.12)], 'claude');
    expect(points).toHaveLength(2);
  });

  it('rend les points des que PLUSIEURS tours sont passes, meme sans cout', () => {
    // codex ne publie aucun montant. Trois tours de travail restent trois tours
    // a refaire : ca se pese, meme sans prix.
    const tours = [1, 2, 3].map((n) => ({ engine: 'codex', engineTurn: n }) as LocalChatUsageTurn);
    expect(rewindPoints(tours, 'codex')).toHaveLength(2);
  });

  it('accorde « tour » au singulier quand il n y en a qu un', () => {
    const points = rewindPoints([tour(1, 0.12)], 'claude');
    const refait = points[0].redone.join(' ');
    expect(refait).not.toMatch(/les 1 tour/);
    expect(refait).toMatch(/le tour|1 tour/);
  });

  it('accorde au pluriel a partir de deux', () => {
    const points = rewindPoints([tour(1, 0.1), tour(2, 0.2)], 'claude');
    expect(points[0].redone.join(' ')).toMatch(/les 2 tours/);
  });
});

describe('contaminationVisible — ecarter la question sans la faire taire', () => {
  const etape = (id: string): WorkStep => ({
    id, label: id, nature: 'autre', state: 'rendu-suspect', personId: 'claude',
    costUsd: null, silenceReason: 'non-rapporte',
  });

  it('ne montre rien quand il n y a pas d echec', () => {
    expect(contaminationVisible([], null)).toBe(false);
  });

  it('montre l echec tant qu il n a pas ete ecarte', () => {
    expect(contaminationVisible([etape('Bash:1')], null)).toBe(true);
  });

  it('se tait sur l echec que l utilisateur a ecarte', () => {
    expect(contaminationVisible([etape('Bash:1')], 'Bash:1')).toBe(false);
  });

  it('reparle pour un NOUVEL echec, meme apres un ecart', () => {
    // Le coeur de la regle : un booleen aurait fait taire le panneau pour toute
    // la session, et ce second echec serait passe inapercu.
    expect(contaminationVisible([etape('Bash:2')], 'Bash:1')).toBe(true);
  });
});
