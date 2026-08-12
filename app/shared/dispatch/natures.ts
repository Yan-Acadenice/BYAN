// natures.ts — vocabulaire de NATURE d'une etape, et son routage de MOTEUR.
//
// PORTE DEPUIS : _byan/mcp/byan-mcp-server/lib/dispatch-router.js (routeRuntime,
// isVerification, CODEX_NATURES, VERIFICATION_NATURES). Ce fichier ne possede
// QUE la decision nature -> moteur ; la decision modele+effort construite
// dessus vit dans router.ts, et le score de complexite qui l'alimente vit dans
// complexity.ts.
//
// DECISION REPRISE, PAS INVENTEE (M4, docs/dispatch-natif/L0-mesures.md) : deux
// cerveaux amont se contredisent sur la montee en gamme —
// lib/dispatch.js (jamais de montee) contre lib/dispatch-router.js (montee
// jusqu'a fable). .claude/workflows/byan-auto-dispatch.js:95-115 a deja tranche
// ce conflit PAR LA NATURE de l'etape : une etape de verification herite du
// modele (et donc de l'effort, qui le qualifie) deja en place dans la session ;
// toute autre etape prend l'echelle par complexite. Ce module porte cette
// resolution ; router.ts l'applique.
//
// BILINGUE PAR CONSTRUCTION. La source ne connaissait que des mots anglais
// ('shell', 'deploy', 'verify'...). Mais l'enum de nature deja adopte par
// .claude/workflows/byan-auto-dispatch.js nomme certaines de ces memes natures
// en francais ('deploiement', 'navigation'), et l'utilisateur de l'app ecrit en
// francais. Chaque liste ci-dessous porte donc les DEUX langues — reperable a
// la comparaison ligne a ligne avec dispatch-router.js.
//
// Correspondance par SOUS-CHAINE (`text.includes(stem)`), pas par limite de mot :
// c'est le choix deja fait par la source (fonction matchesAny), qui laisse
// passer sans effort les pluriels et la plupart des conjugaisons ('deploiement'
// contient 'deploi', 'commande' contient 'command'). La ou une langue change de
// racine (deploy/deploi, verify/verifi), une entree separee couvre l'ecart —
// voir les commentaires par entree.
//
// PUR : aucun acces disque, aucune horloge, aucun hasard. Meme entree, meme
// sortie.

import type { EngineId } from '../engine-options';
import { matchesAnyKeyword } from './word-match';

// Le moteur d'execution est le meme ensemble de valeurs que EngineId
// (app/shared/engine-options.ts) : import de TYPE uniquement (efface a la
// compilation, donc zero dependance a l'execution), pour ne pas recopier ce
// que cet autre fichier definit deja.
export type Runtime = EngineId;

export const RUNTIMES: Readonly<Record<'CODEX' | 'CLAUDE', Runtime>> = Object.freeze({
  CODEX: 'codex',
  CLAUDE: 'claude',
});

// Natures qui routent vers Codex — le travail de forme "execution". Tout ce qui
// n'est PAS ici (et n'est pas une nature de verification) reste sur Claude : une
// nature inconnue ou ambigue garde le jugement sur Claude plutot que de le
// jouer sur Codex (defaut sur, inchange depuis la source).
export const CODEX_NATURE_STEMS: readonly string[] = Object.freeze([
  'execution', 'exec', 'shell', 'terminal', 'command',
  // deploy (EN) / deploiement, deploie, deployer (FR) — la conjugaison
  // francaise change de racine (deploi- au present, deploy- a l'infinitif),
  // d'ou les deux entrees plutot qu'une seule.
  'deploy', 'deploi',
  'devops', 'ci', 'cd', 'pipeline',
  'scripting', 'script',
  // automation (EN) / automatise, automatisation (FR) — meme ecart de racine
  // ("automatis" n'est pas un prefixe de "automation").
  'automation', 'automatis',
  // browser (EN) / navigation, navigateur (FR) — mots sans racine commune.
  'browser', 'navigation',
  'computer-use', 'e2e-run',
  // Le vocabulaire d'exploitation en francais, ajoute le 2026-08-07 apres
  // mesure : « relance les conteneurs docker » et « redemarre le service » sont
  // de l'execution pure et restaient sur Claude faute d'une racine qui les
  // reconnaisse. "relanc" couvre relance/relancer ; "redemarr" couvre
  // redemarre/redemarrer (deburre) ; "conteneur" et "docker" nomment la chose
  // sur laquelle on agit.
  'relanc', 'redemarr', 'conteneur', 'docker',
]);

// Natures qui DOIVENT rester sur Claude — la ligne rouge de verification.
// Verifiee AVANT la table Codex, pour qu'une nature qui ressemblerait aussi a
// de l'execution (ex. "run-and-verify") ne puisse jamais la contourner.
export const VERIFICATION_NATURE_STEMS: readonly string[] = Object.freeze([
  // verify (EN) ne contient pas 'verifi' (il manque le second 'i') : les deux
  // entrees sont necessaires pour couvrir "verify" (EN) ET
  // "verification/verifie/verifier" (EN+FR, qui partagent 'verifi').
  'verify', 'verifi',
  // valid couvre validate/validation (EN) et valide/valider (FR).
  'valid',
  // review (EN) / revise, reviser (FR) — racines distinctes.
  'review', 'revis',
  'audit', 'check', 'qa',
]);

// deburr + minuscule + espaces retires — la meme normalisation que
// _byan/mcp/byan-mcp-server/lib/agent-matcher.js (fonction deburr), reprise ici
// localement pour que ce module reste autonome (pas de dependance vers un
// fichier possede par un autre lot).
function normalize(value: unknown): string {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeNature(value: unknown): string {
  return normalize(value);
}

// La recherche par sous-chaine BRUTE a ete retiree ici le 2026-08-07. Mesure :
// « merci pour ton aide » et « ceci est un simple bonjour » partaient sur Codex,
// parce que "merci" et "ceci" contiennent la racine "ci" (integration continue).
// Le routage etait donc inverse sur du francais courant : les mots polis
// changeaient de moteur, et « relance les conteneurs docker » — de l'execution
// pure — restait sur Claude. La regle de frontiere vit dans word-match.ts, en un
// seul endroit : le meme defaut s'etait deja produit dans le matcher d'agent.
function matchesAnyStem(text: string, stems: readonly string[]): boolean {
  return matchesAnyKeyword(text, stems);
}

// isVerificationNature — l'aide de la ligne rouge #2 : une nature de
// verification ne quitte jamais Claude.
export function isVerificationNature(nature: unknown): boolean {
  return matchesAnyStem(normalize(nature), VERIFICATION_NATURE_STEMS);
}

export function isCodexNature(nature: unknown): boolean {
  return matchesAnyStem(normalize(nature), CODEX_NATURE_STEMS);
}

// routeRuntime(nature) -> 'codex' | 'claude'. La verification gagne en premier
// (reste Claude), puis la table Codex, sinon Claude (defaut sur).
export function routeRuntime(nature: unknown): Runtime {
  const n = normalize(nature);
  if (matchesAnyStem(n, VERIFICATION_NATURE_STEMS)) return RUNTIMES.CLAUDE;
  if (matchesAnyStem(n, CODEX_NATURE_STEMS)) return RUNTIMES.CODEX;
  return RUNTIMES.CLAUDE;
}
