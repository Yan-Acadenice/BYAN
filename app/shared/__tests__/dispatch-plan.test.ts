// LOT L4 — le plan de dispatch, et surtout QUAND il s'applique.
//
// CE QUE CE TEST GARDE. Le modele est attache a la SESSION sur les deux
// moteurs : en changer impose de relancer le processus, donc de perdre la
// memoire de la conversation — meme si l'historique reste affiche. C'est le
// mensonge que `effortAppliesAt` a ete ecrit pour eviter cote effort, et le
// plan doit tenir la meme ligne cote modele.
//
// D'ou la regle a trois temps, testee ci-dessous :
//   1. premier tour  -> tout s'applique, rien n'est propose (aucun fil a perdre)
//   2. tour suivant, rien ne change -> rien a proposer non plus
//   3. tour suivant, ca change      -> propose si ca coute le fil, applique sinon
//
// Le seul champ qui echappe au troisieme point est l'effort sur codex, qui
// s'applique par tour (mesure : `effortAppliesAt('codex') === 'next-turn'`).

import { describe, expect, it } from 'vitest';
import { buildDispatchPlan, type DispatchPlanState } from '../dispatch/plan';
import type { RosterAgent } from '../dispatch/agent-match';

// Un roster minimal, aux memes colonnes que _byan/_config/agent-manifest.csv.
const ROSTER: readonly RosterAgent[] = Object.freeze([
  { name: 'dev', displayName: 'Amelia', title: 'Developpeuse', role: 'implementation, code, refactor' },
  { name: 'architect', displayName: 'Winston', title: 'Architecte', role: 'architecture, design systeme' },
  { name: 'tech-writer', displayName: 'Paige', title: 'Redactrice technique', role: 'documentation, guides' },
]);

// Les slugs que `claude --agent` honore reellement. Volontairement DIFFERENTS
// des noms du roster : c'est la situation reelle du depot, ou l'intersection
// des deux ensembles est vide.
const SLUGS = Object.freeze(['bmad-bmm-dev', 'bmad-bmm-architect', 'bmad-bmm-tech-writer']);

function etat(patch: Partial<DispatchPlanState> = {}): DispatchPlanState {
  return {
    runtime: 'claude',
    model: null,
    agentSlug: null,
    effort: null,
    sessionSpawned: false,
    ...patch,
  };
}

const REFACTOR = 'refactorise le module de paiement et couvre-le de tests';
const DEPLOIEMENT = 'deploie la nouvelle version sur le serveur de production';
const LECTURE = 'liste les fichiers du dossier src';

describe('le premier tour applique tout, sans rien proposer', () => {
  it('les quatre cases sont immediates quand aucun tour n a encore eu lieu', () => {
    const plan = buildDispatchPlan({
      message: REFACTOR,
      state: etat({ sessionSpawned: false }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    for (const champ of ['agent', 'runtime', 'model', 'effort'] as const) {
      expect(plan[champ].applies, `champ ${champ}`).toBe('immediate');
    }
  });

  it("n'a donc rien a faire accepter", () => {
    const plan = buildDispatchPlan({
      message: DEPLOIEMENT,
      state: etat({ sessionSpawned: false }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.acceptCost).toBeNull();
  });
});

describe('un tour suivant ne bouge pas le fil sans le demander', () => {
  it('un changement de MODELE est propose, pas applique', () => {
    // Le premier tour a tourne en haiku sur une lecture ; celui-ci est un
    // refactor, que l'echelle place bien plus haut.
    const plan = buildDispatchPlan({
      message: REFACTOR,
      state: etat({ sessionSpawned: true, model: 'haiku' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.model.changed).toBe(true);
    expect(plan.model.applies).toBe('proposed');
  });

  it('un changement de MOTEUR est propose, pas applique', () => {
    const plan = buildDispatchPlan({
      message: DEPLOIEMENT,
      state: etat({ sessionSpawned: true, runtime: 'claude' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.runtime.value).toBe('codex');
    expect(plan.runtime.changed).toBe(true);
    expect(plan.runtime.applies).toBe('proposed');
  });

  it("dit ce que l'acceptation couterait, en francais", () => {
    const plan = buildDispatchPlan({
      message: DEPLOIEMENT,
      state: etat({ sessionSpawned: true, runtime: 'claude' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.acceptCost).not.toBeNull();
    expect(plan.acceptCost as string).toMatch(/fil|contexte|conversation/i);
  });

  it("n'a rien a proposer quand la decision ne change rien", () => {
    // Meme message, meme etat : le plan retombe sur ce qui tourne deja.
    const premier = buildDispatchPlan({
      message: LECTURE,
      state: etat({ sessionSpawned: false }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    const second = buildDispatchPlan({
      message: LECTURE,
      state: etat({
        sessionSpawned: true,
        runtime: premier.runtime.value,
        model: premier.model.value,
        agentSlug: premier.agent.value,
        effort: premier.effort.value,
      }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(second.acceptCost).toBeNull();
    for (const champ of ['agent', 'runtime', 'model', 'effort'] as const) {
      expect(second[champ].applies, `champ ${champ}`).toBe('immediate');
    }
  });
});

describe("l'effort suit le moteur, pas le modele", () => {
  it("s'applique tout seul sur codex, meme au deuxieme tour", () => {
    // codex accepte `-c model_reasoning_effort=` a chaque invocation : rien a
    // perdre, donc rien a demander.
    const plan = buildDispatchPlan({
      message: DEPLOIEMENT,
      state: etat({ sessionSpawned: true, runtime: 'codex', model: 'gpt-5.6-sol', effort: 'low' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.runtime.applies, 'le moteur ne change pas ici').toBe('immediate');
    expect(plan.effort.changed).toBe(true);
    expect(plan.effort.applies).toBe('immediate');
  });

  it('est propose sur claude, ou il coute une nouvelle session', () => {
    // claude fixe `--effort` au lancement : en changer coute le meme prix que
    // le modele.
    const plan = buildDispatchPlan({
      message: REFACTOR,
      state: etat({ sessionSpawned: true, runtime: 'claude', model: 'fable', effort: 'low' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.effort.changed).toBe(true);
    expect(plan.effort.applies).toBe('proposed');
  });
});

describe('le plancher declare par un agent tient contre le calcul', () => {
  it("un agent en opus n'est pas rabaisse par un score faible", () => {
    const plan = buildDispatchPlan({
      message: LECTURE,
      state: etat(),
      roster: ROSTER,
      availableSlugs: SLUGS,
      agentFloorModel: 'opus',
    });
    expect(plan.complexity).toBeLessThan(34);
    expect(plan.model.value).toBe('opus');
  });

  it('mais ne sert pas de plafond : un score eleve passe au-dessus', () => {
    const plan = buildDispatchPlan({
      message: 'concois l architecture complete du systeme de facturation multi-tenant avec ses contraintes de securite et de performance',
      state: etat(),
      roster: ROSTER,
      availableSlugs: SLUGS,
      agentFloorModel: 'haiku',
    });
    expect(plan.complexity).toBeGreaterThanOrEqual(90);
    expect(plan.model.value).toBe('fable');
  });
});

describe('la verification garde son autonomie', () => {
  it("n'impose ni modele ni effort : la session garde les siens", () => {
    const plan = buildDispatchPlan({
      message: 'verifie que le correctif de securite ne casse rien',
      state: etat({ sessionSpawned: true, runtime: 'claude', model: 'sonnet', effort: 'medium' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.model.changed).toBe(false);
    expect(plan.effort.changed).toBe(false);
    expect(plan.runtime.value, 'un moteur ne note pas son propre travail').toBe('claude');
  });
});

describe("le verdict d'agent n'est pas reduit a un booleen", () => {
  it('propose un agent seulement quand un slug le charge vraiment', () => {
    const plan = buildDispatchPlan({
      message: REFACTOR,
      state: etat(),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.agentVerdict.kind).toBe('resolved');
    expect(plan.agent.value).toBe('bmad-bmm-dev');
  });

  it('ne propose aucun agent quand le roster matche mais rien ne le charge', () => {
    // Le roster connait `dev`, mais aucun fichier de .claude/agents/ ne s'y
    // resout. Annoncer l'agent serait promettre un chargement silencieusement
    // ignore par le CLI (mesure : `claude --agent <inconnu>` sort en 0).
    const plan = buildDispatchPlan({
      message: REFACTOR,
      state: etat(),
      roster: ROSTER,
      availableSlugs: [],
    });
    expect(plan.agentVerdict.kind).toBe('unresolvable');
    expect(plan.agent.value).toBeNull();
  });

  it("dit qu'il faut un nouvel agent quand aucun domaine ne colle", () => {
    const plan = buildDispatchPlan({
      message: 'peins une aquarelle de la baie des anges au coucher du soleil',
      state: etat(),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    expect(plan.agentVerdict.kind).toBe('no-fit');
    expect(plan.agent.value).toBeNull();
  });
});

describe("le vocabulaire rendu a l'ecran", () => {
  it('ne contient aucun nom de modele dans les raisons', () => {
    // Regle posee par shared/workmanship.ts : l'ecran parle en seniorite. Un
    // nom de modele dans une phrase destinee a l'humain la rend illisible pour
    // qui ne suit pas les sorties de modeles.
    const MODELES = ['haiku', 'sonnet', 'opus', 'fable', 'gpt-'];
    const messages = [REFACTOR, DEPLOIEMENT, LECTURE, 'verifie le correctif'];
    for (const m of messages) {
      const plan = buildDispatchPlan({
        message: m, state: etat({ sessionSpawned: true, model: 'haiku' }), roster: ROSTER, availableSlugs: SLUGS,
      });
      const phrases = [
        plan.agent.reason, plan.runtime.reason, plan.model.reason, plan.effort.reason,
        plan.acceptCost ?? '',
      ].join(' ').toLowerCase();
      for (const nom of MODELES) {
        expect(phrases, `message "${m.slice(0, 30)}" / modele "${nom}"`).not.toContain(nom);
      }
    }
  });
});

describe("l'effort recale sur la paire qui tourne VRAIMENT", () => {
  it("ne valide pas l'effort contre un modele seulement propose", () => {
    // Le piege ferme par plan.ts : un modele `proposed` n'a pas ete accepte,
    // la session tourne encore sur l'ancien. Valider l'effort contre le modele
    // propose ferait partir un tour avec une paire que l'ancien modele refuse —
    // le rejet HTTP 400 en pleine conversation.
    const plan = buildDispatchPlan({
      message: REFACTOR,
      state: etat({ sessionSpawned: true, runtime: 'codex', model: 'gpt-5.4', effort: 'low' }),
      roster: ROSTER,
      availableSlugs: SLUGS,
    });
    // gpt-5.4 plafonne a xhigh (mesure du catalogue) : l'effort rendu ne doit
    // pas depasser ce que le modele EN COURS accepte.
    if (plan.effort.value !== null && plan.effort.applies === 'immediate') {
      expect(['low', 'medium', 'high', 'xhigh']).toContain(plan.effort.value);
    }
  });
});

// ---------------------------------------------------------------------------
// Le defaut vu a l'usage le 2026-08-07
// ---------------------------------------------------------------------------
//
// Une session etait ouverte avec l'agent bmad-byan, sans aucun message encore
// echange. Le premier message demandait de l'architecture. L'application a
// affiche :
//
//   « L'agent bmad-bmm-architect est choisi. Il s'appliquera au prochain
//     demarrage — la conversation en cours tourne avec l'agent bmad-byan. »
//
// La phrase etait EXACTE — c'est un mecanisme d'honnetete preexistant qui
// compare le reglage choisi a celui du processus qui tourne — et la
// fonctionnalite etait inutile : l'agent choisi n'etait pas celui qui
// travaillait.
//
// La cause : le plan recevait "y a-t-il des messages a l'ecran" la ou il fallait
// "un processus tourne-t-il". Zero message et un processus lance, ce n'est pas
// la meme chose : `--agent` est un drapeau de LANCEMENT, un processus deja lance
// ne peut pas le prendre.
describe('un drapeau de lancement ne peut pas atterrir sur un processus deja lance', () => {
  it("propose le changement d'agent des qu'un processus tourne, meme sans message", () => {
    const plan = buildDispatchPlan({
      message: "concois l'architecture de la page Historique",
      state: etat({ sessionSpawned: true, agentSlug: 'bmad-byan' }),
      roster: ROSTER,
      availableSlugs: [...SLUGS, 'bmad-byan'],
    });
    expect(plan.agent.changed, "l'agent retenu differe de celui qui tourne").toBe(true);
    expect(
      plan.agent.applies,
      "il ne peut PAS s'appliquer a chaud : le processus est deja lance avec l'autre",
    ).toBe('proposed');
    expect(plan.acceptCost, 'et le plan dit ce que l acceptation coute').not.toBeNull();
  });

  it("l'applique quand aucun processus ne tourne encore", () => {
    // Le meme message, sans session lancee : le drapeau part au lancement que
    // ce message declenche, donc rien a proposer.
    const plan = buildDispatchPlan({
      message: "concois l'architecture de la page Historique",
      state: etat({ sessionSpawned: false, agentSlug: 'bmad-byan' }),
      roster: ROSTER,
      availableSlugs: [...SLUGS, 'bmad-byan'],
    });
    expect(plan.agent.applies).toBe('immediate');
    expect(plan.acceptCost).toBeNull();
  });
});
