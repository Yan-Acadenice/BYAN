// LOT L6 — le verrou de parite entre la copie de l'app et la source amont.
//
// POURQUOI CE FICHIER EXISTE, ET POURQUOI CE N'EST PAS DE LA PRUDENCE.
//
// Les regles de routage de BYAN vivent dans _byan/mcp/byan-mcp-server/lib/, en
// modules ESM que le processus principal de l'app ne peut pas executer (il
// compile en CommonJS, et l'AppImage n'embarque ces fichiers que comme donnee
// d'installation a recopier). L'app en tient donc une copie, reecrite en
// TypeScript dans app/shared/dispatch/.
//
// Une copie derive. Ce n'est pas une hypothese : le 2026-08-07, avant que ce
// fichier existe, deux derives avaient deja ete introduites dans la copie en
// une seule passe, et sur un texte ANGLAIS identique a celui de la source :
//   - "refactor the payment module and cover it with tests" : 62 -> 92
//   - "deploy the new version to the production server"     : 45 -> 62
// A 92, l'echelle rend `fable`, le modele de dernier recours (environ deux fois
// le prix d'Opus), pour un refactor de routine. Les deux venaient de racines
// ANGLAISES ajoutees a la copie sous couvert d'y ajouter du francais.
//
// Et l'echelle etait deja recopiee a la main ailleurs — .claude/workflows/
// byan-auto-dispatch.js porte les memes seuils 34/67/90 avec un commentaire
// "miroir de", sans aucun test qui les compare. La copie de l'app est la
// troisieme. C'est la troisieme qui paie le verrou.
//
// CE QUE CE FICHIER GARDE. La parite EXACTE sur tout ce qui n'est pas une
// divergence nommee ci-dessous. Les divergences assumees sont declarees, avec
// leur mesure : une divergence qu'on ne peut pas nommer est une derive.

import { describe, expect, it, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { calculateComplexity } from '../dispatch/complexity';
import { complexityRung } from '../dispatch/complexity';
import { dispatch, DEFAULT_CODEX_MODEL } from '../dispatch/router';
import { routeRuntime } from '../dispatch/natures';

// La racine du depot depuis app/shared/__tests__/.
const REPO = path.resolve(__dirname, '..', '..', '..');
const SOURCE_SCOREUR = path.join(REPO, 'src', 'byan-v2', 'dispatcher', 'complexity-scorer.js');
const SOURCE_ROUTEUR = path.join(REPO, '_byan', 'mcp', 'byan-mcp-server', 'lib', 'dispatch-router.js');

// Les deux sources sont chargees a l'EXECUTION, pas par un import statique :
// elles vivent hors de la racine de vite (app/), et l'une est en CommonJS quand
// l'autre est en ESM. Les charger ainsi evite d'avoir a les faire entrer dans
// la configuration de build de l'app pour un simple test.
let amontScoreur: { calculateComplexity(t: { prompt: string }): number };
let amontRouteur: {
  dispatch(input: { nature?: unknown; complexity?: unknown }): { runtime: string; model: string; effort: string | null };
  claudeModelForComplexity(c: number | string): string;
  routeRuntime(nature: unknown): string;
  CODEX_MODEL: string;
};

beforeAll(async () => {
  // Un echec bruyant, pas un saut silencieux. Un verrou qui se desactive tout
  // seul quand sa reference disparait ne verrouille rien : c'est precisement
  // ainsi qu'une copie part a la derive sans que personne ne le voie.
  for (const f of [SOURCE_SCOREUR, SOURCE_ROUTEUR]) {
    if (!fs.existsSync(f)) {
      throw new Error(
        `Source amont introuvable : ${f}. Ce test compare la copie de l'app a sa source ; `
        + "sans la source il ne peut rien garantir, et le taire serait pire que d'echouer.",
      );
    }
  }
  // createRequire a besoin d un chemin de reference. __dirname convient et
  // typecheck sous la configuration CommonJS du processus principal, la ou
  // import.meta ne passe pas (TS1343).
  const require_ = createRequire(path.join(__dirname, 'index.js'));
  const ComplexityScorer = require_(SOURCE_SCOREUR);
  amontScoreur = new ComplexityScorer();
  amontRouteur = await import(pathToFileURL(SOURCE_ROUTEUR).href);
});

// ---------------------------------------------------------------------------
// Le corpus : uniquement de l'ANGLAIS
// ---------------------------------------------------------------------------
//
// La source ne connait que l'anglais. Le francais est l'apport DELIBERE de la
// copie : l'y comparer n'aurait aucun sens (la source rendrait toujours le
// score par defaut). L'anglais est donc le seul terrain ou un ecart signifie
// une derive plutot qu'une traduction.
//
// Le corpus couvre les trois types de tache de la source (exploration,
// implementation, analyse), les trois poids de mots-cles (simple, moyen,
// critique), et des phrases sans aucun motif — le cas du repli par defaut.
const CORPUS_ANGLAIS: readonly string[] = Object.freeze([
  'list the files in src',
  'show me the current status',
  'read the config file',
  'find the caller of this function',
  'refactor the payment module and cover it with tests',
  'implement a new endpoint',
  'write a migration script',
  'build the docker image',
  'create a user profile page',
  'add a retry to the http client',
  'generate the openapi schema',
  'design the architecture of the message queue for 50k events per second',
  'analyze the crash dump',
  'review the pull request',
  'assess the migration plan',
  'evaluate the caching strategy',
  'fix the security vulnerability in the auth handler',
  'optimize the database query performance',
  'update the dependencies',
  'modify the retry policy',
  'integrate the payment provider',
  'deploy the new version to the production server',
  'check the logs',
  'run the migration command then restart the container',
  'the thing needs doing by tomorrow',
  'handle the edge case',
]);

describe('parite du scoreur de complexite', () => {
  it('rend le MEME score que la source sur chaque phrase anglaise du corpus', () => {
    const ecarts: string[] = [];
    for (const phrase of CORPUS_ANGLAIS) {
      const attendu = amontScoreur.calculateComplexity({ prompt: phrase });
      const obtenu = calculateComplexity({ prompt: phrase });
      if (attendu !== obtenu) ecarts.push(`"${phrase}" : source=${attendu} copie=${obtenu}`);
    }
    expect(
      ecarts,
      `La copie ne score plus comme sa source sur ${ecarts.length} phrase(s) anglaise(s). `
      + "Une racine anglaise a probablement ete ajoutee a la copie : elle doit aller EN AMONT, "
      + `dans ${path.relative(REPO, SOURCE_SCOREUR)}, pas seulement ici.\n  ${ecarts.join('\n  ')}`,
    ).toEqual([]);
  });

  it('rejette une entree vide exactement comme la source', () => {
    expect(() => calculateComplexity({ prompt: '' })).toThrow();
    expect(() => amontScoreur.calculateComplexity({ prompt: '' })).toThrow();
  });
});

describe('parite de l echelle par complexite', () => {
  // Les seuils 34 / 67 / 90. La source les porte dans
  // claudeModelForComplexity ; la copie dans complexityRung + sa table. Les
  // bornes exactes sont testees en plus des valeurs quelconques : c'est la que
  // se cache un `<` devenu `<=`.
  const BORNES = [0, 1, 33, 34, 35, 66, 67, 68, 89, 90, 91, 99, 100];

  it('place chaque score sur le meme barreau que la source', () => {
    const RANG_VERS_MODELE: Record<string, string> = {
      trivial: 'haiku', medium: 'sonnet', high: 'opus', extreme: 'fable',
    };
    const ecarts: string[] = [];
    for (const c of BORNES) {
      const attendu = amontRouteur.claudeModelForComplexity(c);
      const barreau = complexityRung(c);
      const obtenu = RANG_VERS_MODELE[barreau] ?? `(barreau inconnu: ${barreau})`;
      if (attendu !== obtenu) ecarts.push(`complexite ${c} : source=${attendu} copie=${obtenu}`);
    }
    expect(
      ecarts,
      `Les seuils de l'echelle ont diverge. Ils existent aussi dans .claude/workflows/`
      + `byan-auto-dispatch.js : les trois copies doivent bouger ensemble.\n  ${ecarts.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('parite du routage de moteur', () => {
  // Le vocabulaire de nature de la copie est DELIBEREMENT plus large : il
  // reconnait le francais, que la source ignore. La parite testee est donc a
  // sens unique — ce que la source route vers Codex, la copie doit le router
  // vers Codex. L'inverse n'est pas une derive, c'est l'apport.
  const NATURES_SOURCE = [
    'execution', 'exec', 'shell', 'terminal', 'command',
    'deploy', 'deployment', 'devops', 'ci', 'cd', 'pipeline',
    'scripting', 'script', 'automation', 'browser', 'computer-use', 'e2e-run',
  ];
  const NATURES_VERIFICATION = ['verification', 'verify', 'validate', 'review', 'audit', 'check', 'qa'];

  it('route vers Codex tout ce que la source y route', () => {
    const ecarts: string[] = [];
    for (const n of NATURES_SOURCE) {
      const attendu = amontRouteur.routeRuntime(n);
      const obtenu = routeRuntime(n);
      if (attendu !== obtenu) ecarts.push(`nature "${n}" : source=${attendu} copie=${obtenu}`);
    }
    expect(ecarts, `Le routage de moteur a diverge.\n  ${ecarts.join('\n  ')}`).toEqual([]);
  });

  it('garde la verification sur Claude, comme la source', () => {
    for (const n of NATURES_VERIFICATION) {
      expect(amontRouteur.routeRuntime(n), `source, nature "${n}"`).toBe('claude');
      expect(routeRuntime(n), `copie, nature "${n}"`).toBe('claude');
    }
  });
});

// ---------------------------------------------------------------------------
// Les divergences ASSUMEES
// ---------------------------------------------------------------------------
//
// Chacune est ici parce qu'une mesure la justifie. Le test les FIGE : si la
// source est corrigee un jour, ces cas echouent et rappellent de retirer la
// divergence au lieu de la laisser dormir.

describe('divergences assumees, chacune avec sa mesure', () => {
  it("D1 — la copie rend un effort cote Claude la ou la source rend null", () => {
    // La source porte le commentaire "Claude effort = model tier, no separate
    // knob" et rend effort:null. Mesure du 2026-08-07 sur claude 2.1.224 :
    // `claude --effort <valeur> --version` accepte low, medium, high, xhigh,
    // max ET ultracode (cette derniere absente de l'aide), et avertit sur
    // 'ultra'/'ultrathink'. Le drapeau existe donc, et
    // app/main/engines/claude-engine.ts le pousse deja dans l'argv.
    const source = amontRouteur.dispatch({ nature: 'implementation', complexity: 50 });
    const copie = dispatch({ nature: 'implementation', complexity: 50 });
    expect(source.effort, 'la source rend toujours null cote Claude').toBeNull();
    expect(copie.effort, 'la copie rend un effort reel').not.toBeNull();
  });

  it('D2 — la copie utilise gpt-5.6-sol la ou la source code gpt-5.4 en dur', () => {
    // Mesure du 2026-08-07, codex-cli 0.146.0, `codex debug models` : le modele
    // par defaut est gpt-5.6-sol. gpt-5.4 existe au catalogue mais n'annonce
    // pas 'max' dans ses efforts, donc la paire (gpt-5.4, max) que l'echelle
    // produirait a complexite >= 90 se ferait refuser en HTTP 400 par l'API.
    expect(amontRouteur.CODEX_MODEL).toBe('gpt-5.4');
    expect(DEFAULT_CODEX_MODEL).toBe('gpt-5.6-sol');
  });

  it("D3 — la copie n'impose aucun modele a une nature de verification", () => {
    // La source rend un modele meme pour une verification (elle applique
    // claudeModelForComplexity sans regarder la nature). La resolution retenue
    // vient de .claude/workflows/byan-auto-dispatch.js:110, qui traite deja ce
    // conflit : une etape de verification herite du modele de session.
    const source = amontRouteur.dispatch({ nature: 'verify', complexity: 40 });
    const copie = dispatch({ nature: 'verify', complexity: 40 });
    expect(source.model, 'la source impose un modele').toBe('sonnet');
    expect(copie.model, 'la copie laisse la session decider').toBeNull();
    expect(copie.effort, "et son effort avec, sinon le modele herite n'aurait pas son reglage").toBeNull();
  });

  it('D4 — le plancher de modele declare par un agent est propre a la copie', () => {
    // La source ne connait pas les agents : son dispatch() ne prend que
    // {nature, complexity}. Mesure du 2026-08-07 : les 35 fichiers de
    // .claude/agents/ declarent un modele, et `--model` l'emporte sur cette
    // declaration (trois cas, deux temoins — voir docs/dispatch-natif/).
    // Ecraser un opus declare par un haiku calcule serait la retrogradation que
    // la doctrine interdit, d'ou le plancher.
    const sansPlancher = dispatch({ nature: 'implementation', complexity: 10 });
    const avecPlancher = dispatch({ nature: 'implementation', complexity: 10, agentFloorModel: 'opus' });
    expect(sansPlancher.model).toBe('haiku');
    expect(avecPlancher.model, 'le plancher tient contre un score faible').toBe('opus');
  });

  it('D5 — le plancher ne sert pas de plafond', () => {
    // Le sens de la regle : il releve, il ne rabaisse pas. Un score qui merite
    // mieux que le plancher passe au-dessus.
    const d = dispatch({ nature: 'implementation', complexity: 95, agentFloorModel: 'haiku' });
    expect(d.model).toBe('fable');
  });
});
