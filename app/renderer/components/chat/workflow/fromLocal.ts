// Brancher les trois autres ecrans sur ce que le chat local mesure vraiment.
//
// Ces ecrans ont ete dessines pour un chantier multi-agents : une equipe, des
// points de reprise nommes, un protocole d'autorisation. En local il n'y a rien
// de tout ca. Deux mauvaises reponses etaient possibles : les laisser vides, ou
// leur fabriquer des chiffres. Une troisieme existe, et c'est celle-ci —
// chaque ecran garde sa FORME et recoit le signal local qui a le meme sens.
//
//   contamination  -> une etape qui a echoue, et celles qui ont tourne apres
//   prix du retour -> ce que couterait de repartir, ou de changer de moteur
//   main levee     -> ce qui bloque pour de vrai et attend une decision
//
// Regle qui tient l'ensemble : quand le signal est absent, la fonction ne rend
// RIEN. Un ecran de contamination sans echec affirmerait un probleme inexistant ;
// c'est pire qu'un ecran absent.

import { buildActivityTimeline, type LocalChatActivity, type ToolStep } from '../../../../shared/tool-activity';
import type { EngineId } from '../../../../shared/engine-options';
import type { LocalChatUsageTurn } from '../../../context/LocalChatContext';
import { turnCosts } from '../panels/turn-cost';
import type { StepNature } from '../../../../shared/workmanship';
import type { PermissionGate, RaisedHand, RewindPoint, WorkStep } from './types';

// Le moteur EST l'intervenant, en local. Ce n'est pas un agent du roster BYAN,
// et lui en coller un serait un mensonge de casting.
type Moteur = EngineId;

// Ce qu'un outil fait, deduit de son nom. La table ne couvre que ce qui est
// certain ; tout le reste tombe dans 'autre' plutot que d'etre range au jugé.
const NATURE_PAR_OUTIL: Readonly<Record<string, StepNature>> = {
  Read: 'reperage',
  Grep: 'reperage',
  Glob: 'reperage',
  WebFetch: 'reperage',
  WebSearch: 'reperage',
  Write: 'implementation',
  Edit: 'implementation',
  NotebookEdit: 'implementation',
};

function natureDe(nom: string): StepNature {
  return NATURE_PAR_OUTIL[nom] ?? 'autre';
}

// ---------------------------------------------------------------------------
// Ecran 1 — ce qui a tourne APRES un echec
// ---------------------------------------------------------------------------

// La relation rendue dans `consumes` est TEMPORELLE, pas une dependance prouvee :
// le fil ne porte que l'ordre des gestes. La vue doit le dire en toutes lettres.
// L'ecrire ici plutot que de renoncer, c'est preferer une information vraie et
// bornee a pas d'information du tout.
export function contaminationSteps(
  activities: readonly LocalChatActivity[],
  moteur: Moteur,
): WorkStep[] {
  const { steps } = buildActivityTimeline(activities);
  const rate = steps.find((s) => s.ok === false);
  if (!rate) return [];

  const finRate = rate.endedAt ?? rate.startedAt;
  const suivantes = steps.filter(
    (s) => s !== rate && s.startedAt !== undefined && finRate !== undefined && s.startedAt >= finRate,
  );
  // Un echec en dernier geste n'a contamine personne : il n'y a rien a montrer.
  if (suivantes.length === 0) return [];

  const versEtape = (s: ToolStep, suspecte: boolean): WorkStep => ({
    id: s.key,
    label: s.detail ? `${s.name} — ${s.detail}` : s.name,
    nature: natureDe(s.name),
    state: suspecte ? 'rendu-suspect' : 'rendu',
    personId: moteur,
    ...(s.startedAt !== undefined && s.endedAt !== undefined
      ? { durationMs: s.endedAt - s.startedAt }
      : {}),
    // Le cout est rapporte par TOUR, jamais par outil : aucun moteur ne chiffre
    // un appel d'outil isolement. Un tiret, pas un zero.
    costUsd: null,
    silenceReason: 'non-rapporte',
    ...(suspecte ? {} : { consumes: [rate.key] }),
  });

  return [versEtape(rate, true), ...suivantes.map((s) => versEtape(s, false))];
}

// ---------------------------------------------------------------------------
// Ecran 2 — le prix du retour
// ---------------------------------------------------------------------------

const AUTRE_MOTEUR: Readonly<Record<Moteur, Moteur>> = { claude: 'codex', codex: 'claude' };

// L'application ne sait PAS revenir au tour 3. Elle sait deux choses : repartir
// de zero, et ouvrir une session sur l'autre moteur. Offrir un point par tour
// serait promettre un geste qui n'existe pas — l'ecran mentirait sur ce que le
// bouton fait.
export function rewindPoints(
  tours: readonly LocalChatUsageTurn[],
  moteur: Moteur,
): RewindPoint[] {
  if (tours.length === 0) return [];

  // La somme des couts REELS par tour. `turnCosts` fait la soustraction des
  // cumuls quand le moteur n'en publie pas d'autre ; additionner les valeurs
  // brutes donnerait presque le triple.
  const couts = turnCosts(tours);
  const chiffres = couts.filter((c) => c.kind === 'turn' && typeof c.usd === 'number');
  const total = chiffres.reduce((n, c) => n + (c.usd as number), 0);
  const mesure = chiffres.length > 0;
  // codex tourne sur abonnement et ne publie aucun montant : le silence a une
  // cause differente d'un moteur qui n'a simplement rien rapporte.
  const silence = moteur === 'codex' ? ('abonnement' as const) : ('non-rapporte' as const);

  const nbTours = tours.length;
  const autre = AUTRE_MOTEUR[moteur];

  // RIEN A PERDRE, RIEN A PESER.
  //
  // Vu a l'ecran le 2026-08-05 : apres un seul « salut mon reuf » sans cout
  // rapporte, ce panneau occupait tout l'espace sous une reponse d'une ligne.
  // Revenir en arriere pour jeter un bonjour : la question ne se pose pas.
  //
  // Le signal, c'est « il y a quelque chose de mesurable a perdre » : un montant
  // chiffre, OU plusieurs tours de travail. Un tour sans prix n'est ni l'un ni
  // l'autre. Le seuil de trois n'est pas une science : c'est le moment ou refaire
  // devient un vrai arbitrage plutot qu'une formalite.
  if (!mesure && nbTours < 3) return [];

  // « les 1 tour » se lisait a l'ecran. Un accord rate use la confiance aussi
  // sûrement qu'un chiffre faux.
  const travailRefait = nbTours > 1 ? `les ${nbTours} tours` : 'le tour';
  const dejaPasses = nbTours > 1
    ? `${nbTours} tours déjà passés dans cette session`
    : 'un tour déjà passé dans cette session';

  return [
    {
      id: 'repartir',
      decision: 'repartir de zéro sur une session neuve',
      decidedById: moteur,
      basedOn: dejaPasses,
      kept: ['rien : le fil et le contexte partent ensemble'],
      redone: [travailRefait],
      ...(mesure ? { discardedCostUsd: total } : { discardedCostUsd: null, discardedSilenceReason: silence }),
    },
    {
      id: 'changer-de-moteur',
      decision: `passer sur ${autre}`,
      decidedById: moteur,
      basedOn: `session ${moteur} en cours`,
      // Ce qui reste a l'ecran n'est pas ce que le moteur sait. La distinction
      // est le coeur de l'ecran : on garde la lecture, on perd la memoire.
      kept: ['le fil reste affiché'],
      redone: [`le contexte : ${autre} repart de zéro`],
      ...(mesure ? { discardedCostUsd: total } : { discardedCostUsd: null, discardedSilenceReason: silence }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Ecran 3 — ce qui attend une decision
// ---------------------------------------------------------------------------

export interface EtatLocal {
  readonly error: string | null;
  readonly sessionCwd: string | null;
  readonly engine: Moteur;
  readonly codexAvailable: boolean;
}

// Les libelles des boutons viennent de la DONNEE, pas de l'ecran.
//
// L'ecran a ete concu pour une demande d'autorisation : « Autoriser une fois »,
// « Refuser », un journal des permissions accordees. Aucun des trois blocages
// locaux n'est une autorisation — choisir un dossier, basculer de moteur,
// reessayer apres une erreur. Vu a l'ecran le 2026-08-05 : le geste disait
// « choisir le dossier » et le bouton disait « Autoriser une fois ». Un libelle
// emprunte a cote fait douter de tout le reste de l'ecran.
export interface ActionsMainLevee {
  // Le geste qui debloque, nomme par ce qu'il FAIT.
  readonly primary: string;
  // Ecarter la question. Jamais « Refuser » : on ne refuse pas un dossier.
  readonly dismiss: string;
}

export interface MainLevee {
  readonly hand: RaisedHand;
  readonly gate: PermissionGate;
  readonly actions: ActionsMainLevee;
}

// Aucun des deux moteurs n'emet de demande d'autorisation sur le fil (verifie le
// 2026-07-31). Mais l'application connait de vrais blocages, et ils appellent
// exactement le meme geste de la part de l'utilisateur : trancher pour que ca
// reparte. C'est ca qu'on montre.
// Au-dela, le geste noie la question qu'on pose. Vu a l'ecran le 2026-08-05 : un
// refus d'API de codex fait 400 caracteres de JSON, et la question disparaissait
// dedans.
const MAX_GESTE = 160;

// Ce qui EXPLIQUE le refus, pas l'enveloppe qui le transporte.
//
// Les moteurs remontent parfois un objet JSON entier (`{"error":{"message":...}}`).
// Le seul morceau utile est le message ; le reste est de la plomberie. On le
// cherche sans parser : le texte n'est pas garanti bien forme, et un parseur qui
// echoue rendrait la situation moins lisible, pas plus.
function messageLisible(brut: string): string {
  const dansJson = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(brut);
  const utile = dansJson?.[1]
    ? dansJson[1].replace(/\\"/g, '"').replace(/\\n/g, ' ')
    : brut.replace(/\s+/g, ' ').trim();
  // On dit que c'est coupe, plutot que de laisser croire a une phrase finie.
  return utile.length > MAX_GESTE ? `${utile.slice(0, MAX_GESTE - 1)}…` : utile;
}

export function raisedHandState(etat: EtatLocal): MainLevee | null {
  // Ordre deliberé : du plus bloquant au moins bloquant. Sans dossier, rien ne
  // peut demarrer — inutile de parler d'une erreur passee.
  if (etat.sessionCwd === null) {
    return {
      hand: {
        personId: etat.engine,
        confidence: { sure: true },
        gesture: 'choisir le dossier du projet avant de démarrer',
      },
      // `remembers` vaut false partout : aucun de ces blocages n'est une
      // permission qui se garde, et le bouton « pour la suite » n'aurait aucun
      // sens. Le choix du dossier EST conserve, mais ce n'est pas une
      // autorisation accordee — c'est un reglage.
      gate: { remembers: false },
      actions: { primary: 'Choisir le dossier', dismiss: 'Plus tard' },
    };
  }

  if (etat.engine === 'codex' && !etat.codexAvailable) {
    return {
      hand: {
        personId: etat.engine,
        confidence: { sure: true },
        gesture: "installer codex, ou revenir sur claude : codex n'est pas sur cette machine",
      },
      // Ce n'est pas une autorisation, c'est une absence : il n'y a rien a
      // retenir pour la prochaine fois.
      gate: { remembers: false },
      actions: { primary: 'Revenir sur claude', dismiss: 'Rester sur codex' },
    };
  }

  if (etat.error !== null) {
    return {
      hand: {
        personId: etat.engine,
        confidence: { sure: false, about: 'la même erreur peut revenir au prochain essai' },
        gesture: `reprendre après l'erreur : ${messageLisible(etat.error)}`,
      },
      gate: { remembers: false },
      actions: { primary: 'Réessayer', dismiss: 'Écarter' },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Ecarter la question — la regle d'affichage, sortie du balisage
// ---------------------------------------------------------------------------

// Le panneau de contamination doit-il s'afficher ?
//
// LE DEFAUT QUE CETTE FONCTION FERME. Le panneau porte deux sorties : refaire
// l'etape ratee, ou accepter le travail tel quel. « Accepter tel quel » etait
// cable sur une fonction vide — le bouton ne faisait rien, litteralement.
// Constate a l'usage le 2026-08-07. Et « Refaire » envoyait bien son message,
// mais laissait le panneau en place : le geste marchait sans que rien ne bouge
// a l'ecran, donc il paraissait mort lui aussi.
//
// Un bouton qui promet une action et n'en produit aucune est pire que pas de
// bouton : il apprend a ne plus faire confiance a l'interface.
//
// LA REGLE. On retient l'IDENTIFIANT de l'etape ecartee, jamais un simple
// booleen. Un booleen ferait taire le panneau pour toute la session, et le
// prochain vrai echec passerait inapercu — on aurait echange un bouton mort
// contre un signal muet.
export function contaminationVisible(
  steps: readonly WorkStep[],
  ecartee: string | null,
): boolean {
  if (steps.length === 0) return false;
  return steps[0]?.id !== ecartee;
}
