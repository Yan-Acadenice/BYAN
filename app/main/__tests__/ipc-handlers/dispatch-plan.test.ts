// LOT L4 — le cote DISQUE du plan de dispatch.
//
// Le calcul du plan est pur et teste ailleurs (shared/__tests__/
// dispatch-plan.test.ts). Ce que ce fichier garde, c'est ce que le pont AJOUTE :
// les deux lectures de disque que le renderer ne peut pas faire, et la
// resolution en DEUX PASSES du plancher de modele.
//
// POURQUOI DEUX PASSES. Le plancher a respecter est le modele declare par
// l'agent RETENU (front-matter `model:`), et on ne sait quel agent est retenu
// qu'une fois le plan calcule. On calcule donc pour connaitre l'agent, on lit
// son modele declare, puis on recalcule avec ce plancher. Ce test verifie que
// la seconde passe a bien lieu — sans elle, un agent declare en expert se
// verrait rabaisser par un score faible, ce que la doctrine interdit.
//
// Le depot lui-meme sert de dossier projet : il porte a la fois
// _byan/_config/agent-manifest.csv et .claude/agents/, et les 35 fichiers
// d'agents y declarent un modele (mesure du 2026-08-07, voir
// docs/dispatch-natif/L0-mesures.md).

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';

import { LocalChatBridge } from '../../ipc-handlers/local-chat';
import type { SpawnFn } from '../../ipc-handlers/local-chat';
import type { DispatchPlanState } from '../../../shared/ipc-contract';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

// Un processus factice : aucune methode testee ici n'en lance, mais le pont en
// exige un a la construction.
class FauxProcessus extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: () => true, end: () => undefined };
  pid = 4242;
  kill() { return true; }
}

function pont(cwd: string) {
  return new LocalChatBridge({
    spawnFn: (() => new FauxProcessus()) as unknown as SpawnFn,
    broadcast: () => undefined,
    defaultCwd: () => cwd,
    resolveBin: () => null,
    spawnEnv: () => ({ PATH: '/fake/bin' }),
  });
}

function etat(patch: Partial<DispatchPlanState> = {}): DispatchPlanState {
  return { runtime: 'claude', model: null, agentSlug: null, effort: null, sessionSpawned: false, ...patch };
}

describe('le pont lit ce que le renderer ne peut pas lire', () => {
  it('trouve le roster et les agents du dossier projet', async () => {
    const plan = await pont(REPO).plan({
      message: 'refactorise le module de paiement et couvre-le de tests',
      state: etat(),
    });
    // Le roster du depot connait `dev` ; .claude/agents/ porte `bmad-bmm-dev`.
    // Un plan qui proposerait `dev` tel quel serait un agent que le CLI ignore
    // en silence.
    expect(plan.agentVerdict.kind).toBe('resolved');
    expect(plan.agent.value).toBe('bmad-bmm-dev');
  });

  it('rend un plan utilisable meme sans dossier projet', async () => {
    // Un dossier vide n'a ni roster ni agents : la lecture est defensive, comme
    // partout ailleurs dans main/ (local-data.ts, claude-agents.ts).
    const vide = fs.mkdtempSync(path.join(REPO, 'app', '.tmp-plan-'));
    try {
      const plan = await pont(vide).plan({ message: 'refactorise le module', state: etat() });
      expect(plan.agentVerdict.kind).toBe('no-fit');
      expect(plan.agent.value).toBeNull();
      // Le reste de la decision tient quand meme : sans agent, il y a toujours
      // un moteur, une gamme et un effort a choisir.
      expect(plan.runtime.value).toBe('claude');
      expect(plan.model.value).not.toBeNull();
    } finally {
      fs.rmSync(vide, { recursive: true, force: true });
    }
  });
});

describe('la seconde passe applique le plancher declare par l agent', () => {
  it("ne rabaisse pas un agent declare plus haut que le score", async () => {
    // LE CAS QUI MORD, choisi par mesure et pas par intuition. "documente l'API
    // du module de paiement" chiffre 45 : l'echelle seule rendrait le barreau du
    // milieu. L'agent que ce message retient sur ce depot declare un barreau
    // au-dessus, et c'est ce plancher qui doit gagner.
    //
    // Une premiere version de ce test utilisait "liste les fichiers du dossier
    // src". Verifie le 2026-08-07 : ce message ne retient AUCUN agent, donc la
    // seconde passe ne s'executait jamais et le test passait meme en la
    // supprimant. Il ne prouvait rien.
    const plan = await pont(REPO).plan({
      message: "documente l'API du module de paiement",
      state: etat(),
    });

    const slug = plan.agent.value;
    expect(slug, "ce message doit retenir un agent, sinon le test ne teste rien").not.toBeNull();

    const declare = declaredModel(slug as string);
    expect(declare, "l'agent retenu doit declarer un modele, sinon il n'y a pas de plancher").not.toBeNull();

    const RANG: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3, fable: 4 };
    const parLEchelleSeule = plan.complexity < 34 ? 'haiku'
      : plan.complexity < 67 ? 'sonnet'
      : plan.complexity < 90 ? 'opus' : 'fable';

    // Le coeur du cas : le plancher est STRICTEMENT au-dessus de ce que
    // l'echelle proposait. Si cette condition tombe un jour (un agent change de
    // modele declare), le test le dit au lieu de passer sans rien verifier.
    expect(
      RANG[declare as string],
      `le plancher declare (${declare}) doit depasser l'echelle seule (${parLEchelleSeule}) `
      + 'pour que ce cas prouve quelque chose',
    ).toBeGreaterThan(RANG[parLEchelleSeule]);

    expect(plan.model.value, 'le plancher declare gagne contre le score').toBe(declare);
  });

  it('laisse un score eleve passer AU-DESSUS du plancher', async () => {
    // Le plancher releve, il ne rabaisse pas. Un message qui merite le barreau
    // le plus haut ne doit pas etre ramene au modele declare par son agent.
    const plan = await pont(REPO).plan({
      message: "concois l'architecture complete du systeme de facturation multi-tenant "
        + 'avec ses contraintes de securite et de performance',
      state: etat(),
    });
    expect(plan.complexity).toBeGreaterThanOrEqual(90);
    expect(plan.model.value).toBe('fable');
  });
});

// Lit le `model:` du front-matter d'un agent, sans dependance : le meme geste
// que main/roster.ts, refait ici pour que le test ne se contente pas de
// re-executer le code qu'il verifie.
function declaredModel(slug: string): string | null {
  const p = path.join(REPO, '.claude', 'agents', `${slug}.md`);
  try {
    const texte = fs.readFileSync(p, 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texte);
    if (!m) return null;
    const ligne = /^model:\s*(\S+)\s*$/m.exec(m[1] as string);
    return ligne ? (ligne[1] as string) : null;
  } catch {
    return null;
  }
}
