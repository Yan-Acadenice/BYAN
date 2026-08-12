// suitability-store.ts — le disque du registre de suitability. Etat GLOBAL a
// la machine, pas par-projet.
//
// POURQUOI GLOBAL. Le calcul (app/shared/suitability/*) repond a UNE
// question : pour un COUPLE (modele, type de tache), les observations
// passees disent-elles si ce modele convient ? Cette question ne depend PAS
// du dossier projet ouvert au moment de l'observation — un modele peu fiable
// sur "gros diff de refactor" l'est pareil dans le projet A et le projet B.
// Un registre PAR PROJET fragmenterait l'echantillon en autant de tiroirs
// qu'il y a de projets ouverts sur cette machine, et retarderait d'autant le
// moment ou l'intervalle de credibilite devient assez etroit pour agir — le
// probleme de "peu d'observations" que ce module rend deja honnetement
// (`ModelRating.n` et `.lower`) serait aggrave sans aucune raison de le faire.
//
// C'est pourquoi ce fichier suit le patron de main/projects-registry.ts
// (~/.byan/projects.json — un registre PAR MACHINE), pas celui de
// main/local-data.ts (_byan/ PAR PROJET) : la question posee ici est globale a
// la machine, comme "quels projets ai-je ouverts", pas locale a un dossier
// projet, comme "quels agents ce projet declare-t-il".
//
// La convention BYAN_HOME (surcharge du dossier home pour les tests) et le
// nom de fichier ~/.byan/*.json sont dupliques ici plutot qu'importes de
// projects-registry.ts, pour ne creer AUCUNE dependance entre deux fichiers
// modifies par des lots differents en meme temps — trois lignes dupliquees
// valent mieux qu'un couplage evitable.
//
// Lecture DEFENSIVE, meme contrat que local-data.ts / projects-registry.ts :
// un fichier absent ou corrompu rend un registre vide, jamais une exception.
// Une ecriture qui echoue degrade `recorded: false`, elle ne fait jamais
// planter l'appelant — une observation perdue est acceptable, un chat qui
// plante pour une ligne de telemetrie ne l'est pas.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recordOutcome, rating as computeRating, report as computeReport } from '../shared/suitability';
import type { ModelRating, SuitabilityLedger } from '../shared/suitability';

// Resout ~/.byan/suitability.json. BYAN_HOME surcharge le dossier home
// (tests) — meme convention que main/projects-registry.ts (registryPath).
export function ledgerPath(): string {
  const home = process.env.BYAN_HOME || os.homedir();
  return path.join(home, '.byan', 'suitability.json');
}

// Lecture DEFENSIVE : un fichier absent, illisible, ou dont le contenu n'est
// pas un objet JSON simple rend un registre vide.
export function readLedger(): SuitabilityLedger {
  try {
    const raw = fs.readFileSync(ledgerPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SuitabilityLedger;
    }
    return {};
  } catch {
    return {};
  }
}

// Ecriture atomique : fichier `.tmp` ADJACENT (meme dossier => meme systeme
// de fichiers => renommage atomique, sans risque EXDEV), puis renommage
// par-dessus la cible. Une ecriture interrompue laisse le registre existant
// identique, octet pour octet.
function writeLedger(ledger: SuitabilityLedger): void {
  const p = ledgerPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
    fs.renameSync(tmp, p);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // rien n'etait ecrit, ou le renommage a echoue avant de creer le fichier
      // temporaire : il n'y a rien a nettoyer.
    }
    throw err;
  }
}

export interface RecordOutcomeInput {
  readonly model: string;
  readonly taskKind: string;
  readonly success: boolean;
  readonly source?: string | null;
}

// record() ne leve JAMAIS : une ecriture de telemetrie ne doit jamais faire
// echouer l'appelant. Trois issues possibles, memes noms que
// _byan/mcp/byan-mcp-server/lib/suitability-store.js :
//   - recorded: true              -> ecrit, `rating` reflete le registre APRES
//   - recorded: false, invalid_input -> entree malformee, RIEN n'est ecrit,
//                                        aucune note rendue (il n'y a rien a
//                                        noter sur une paire invalide)
//   - recorded: false, persist_failed -> l'ecriture disque a echoue, `rating`
//                                         reflete le registre AVANT (l'appelant
//                                         ne voit jamais une mise a jour
//                                         fantome)
export type RecordOutcomeResult =
  | { readonly recorded: true; readonly reason: null; readonly rating: ModelRating; readonly source: string | null }
  | { readonly recorded: false; readonly reason: 'invalid_input'; readonly error: string; readonly source: string | null }
  | { readonly recorded: false; readonly reason: 'persist_failed'; readonly rating: ModelRating; readonly source: string | null };

export function record(input: RecordOutcomeInput): RecordOutcomeResult {
  const before = readLedger();
  const source = input?.source ?? null;

  let after: SuitabilityLedger;
  try {
    after = recordOutcome(before, { model: input.model, taskKind: input.taskKind, success: input.success });
  } catch (err) {
    return { recorded: false, reason: 'invalid_input', error: (err as Error).message, source };
  }

  try {
    writeLedger(after);
  } catch {
    return {
      recorded: false,
      reason: 'persist_failed',
      rating: computeRating(before, { model: input.model, taskKind: input.taskKind }),
      source,
    };
  }

  return {
    recorded: true,
    reason: null,
    rating: computeRating(after, { model: input.model, taskKind: input.taskKind }),
    source,
  };
}

// readReport() -> les notes de chaque couple present, les plus actionnables
// en premier. Filtre optionnel par modele. Lecture seule.
export function readReport(model?: string): ModelRating[] {
  const rows = computeReport(readLedger());
  return model ? rows.filter((r) => r.model === model) : rows;
}
