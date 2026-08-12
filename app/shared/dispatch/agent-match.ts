// F1 — le matcher d'agent honnete : le pre-tri deterministe que Hermes/BYAN
// presentent a la porte d'entree (.claude/rules/agent-entry-gate.md). Etant
// donne une tache en texte libre et le roster BYAN (le manifeste
// _byan/_config/agent-manifest.csv), il classe les candidats et rend un
// verdict a TROIS issues — jamais un simple vrai/faux :
//
//   - un agent adapte existe ET se resout contre un slug claude reellement
//     charge (`resolved`)
//   - un agent adapte existe dans le roster BYAN mais aucun slug claude ne
//     s'y resout : le proposer serait promettre un agent qui ne chargera
//     jamais (`unresolvable`)
//   - aucun agent n'atteint le seuil de fit : c'est le signal d'interview
//     (`no-fit`)
//
// Port de _byan/mcp/byan-mcp-server/lib/agent-matcher.js (coeur pur, sans
// disque). Cette fonction ne PROPOSE jamais seule — l'utilisateur valide
// (double validation IA + humain).
//
// Isolation deliberee : ce module ne touche jamais au disque. La lecture du
// manifeste vit dans app/main/roster.ts ; la liste des slugs claude
// reellement charges vient de app/main/claude-agents.ts
// (availableClaudeAgents). matchAgent() les recoit en parametres pour rester
// pur et testable sans fs.
//
// LE PIEGE QUE CE MODULE FERME. Les deux espaces de noms d'agents ne se
// recoupent PAS : le roster BYAN dit `dev`, `analyst`... ; .claude/agents/
// s'appelle `bmad-bmm-dev.md`, `bmad-bmm-analyst.md`... Mesure sur ce depot
// (voir app/shared/agent-slugs.ts) : leur intersection est VIDE. Et le CLI ne
// proteste pas — `claude --agent <inconnu>` sort en 0 et omet l'agent en
// silence. Rendre "fit" un candidat qui ne se resout pas serait donc une
// promesse silencieusement rompue. matchAgent() verifie la resolution avant
// de rendre un verdict "resolved".

import { matchesKeyword } from './word-match';
import { resolveClaudeAgent } from '../agent-slugs';

// ---------- Le roster (donnees pures, format CSV) ----------

export interface RosterAgent {
  name: string;
  displayName: string;
  title: string;
  role: string;
}

// Seuil de fit. Un meilleur score au-dessus = au moins un signal solide qu'un
// agent existant couvre le besoin ; en dessous, aucun agent -> interview.
export const FIT_THRESHOLD = 3;

// Signal de routage Hermes, deburre en francais : mot-cle -> nom d'agent dans
// le roster (colonne `name` du manifeste, PAS le slug .claude/agents/). Couche
// forte (poids x3) car ce sont les indices de dispatch choisis a la main, pas
// un recoupement de texte incident. Tenu synchronise avec
// .claude/rules/hermes-dispatcher.md.
//
// CORRECTION PORTEE. La source amont indexait la cle "tea" sous 'tea-tea' —
// une valeur qui ne correspond a AUCUNE ligne `name` du manifeste reel (la
// ligne s'appelle `tea`, le slug claude s'appelle `bmad-tea-tea` mais vit dans
// l'AUTRE espace de noms). Ce n'etait pas une intention documentee : juste un
// decalage qui rendait le mot-cle mort. Corrige ici pour que le mot-cle serve
// reellement au scoring — voir le test "indexe sous le nom REEL du roster".
export const DOMAIN_KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  analyst: ['analyse', 'analyser', 'requirement', 'requirements', 'brief', 'etude', 'marche', 'concurrent', 'besoin'],
  architect: ['architecture', 'architect', 'conception', 'concois', 'systeme', 'stack', 'scalab', 'infrastructure', 'api'],
  dev: ['code', 'coder', 'implemente', 'implementer', 'implement', 'developpe', 'dev', 'feature', 'refactor', 'bug', 'debug', 'fix', 'script', 'module', 'fonction', 'endpoint'],
  quinn: ['test', 'tester', 'qa', 'coverage', 'couverture', 'assurance qualite'],
  tea: ['atdd', 'nfr', 'test architect', 'ci/cd', 'automation de test'],
  sm: ['sprint', 'backlog', 'scrum', 'planifier', 'planification', 'story', 'epic'],
  'tech-writer': ['documente', 'documenter', 'documentation', 'guide', 'readme', 'redige'],
  'ux-designer': ['ux', 'ui', 'mockup', 'maquette', 'interface', 'wireframe', 'design ux'],
  pm: ['prd', 'produit', 'roadmap', 'product', 'vision produit'],
  byan: ['creer un agent', 'nouvel agent', 'workflow byan', 'nouveau module'],
  'brainstorming-coach': ['brainstorm', 'idee', 'ideation', 'innovation', 'remue-meninge'],
  carmack: ['optimiser', 'optimisation', 'token', 'performance', 'perf'],
});

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'pour', 'avec',
  'sur', 'dans', 'que', 'qui', 'ce', 'cette', 'mon', 'ma', 'mes', 'ton', 'son',
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'for', 'with', 'on', 'in', 'is',
  'fait', 'faire', 'veux', 'peux', 'ajoute', 'cree', 'creer', 'besoin', 'agent',
]);

// deburr : minuscule + retrait des diacritiques francais, pour que "marché"
// matche "marche".
export function deburr(s: unknown): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // retire les diacritiques combinants
}

function tokenize(text: unknown): string[] {
  return deburr(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export interface AgentScore {
  score: number;
  keywordScore: number;
  textScore: number;
  hits: string[];
}

// scoreAgent — score pur par agent : coups de mots-cles (x3) + recoupement de
// texte entre la tache et le titre/role de l'agent.
// La regle de frontiere de mot vit dans word-match.ts : le meme defaut s'est
// produit ici ET dans le routeur de moteur (natures.ts), donc elle est a un
// seul endroit. Reexportee pour les appelants existants.
export { matchesKeyword };

export function scoreAgent(taskText: string, agent: RosterAgent): AgentScore {
  const task = deburr(taskText);
  const taskTokens = new Set(tokenize(taskText));
  let keywordScore = 0;
  const hits: string[] = [];
  const kws = DOMAIN_KEYWORDS[agent.name] || [];
  for (const kw of kws) {
    if (matchesKeyword(task, deburr(kw))) { keywordScore += 1; hits.push(kw); }
  }
  const agentTokens = tokenize(`${agent.title || ''} ${agent.role || ''}`);
  let textScore = 0;
  for (const t of agentTokens) if (taskTokens.has(t)) textScore += 1;
  return { score: keywordScore * 3 + textScore, keywordScore, textScore, hits };
}

export interface AgentCandidate {
  name: string;
  title: string;
  score: number;
  why: string;
}

export interface MatchAgentsResult {
  fit: boolean;
  needsInterview: boolean;
  best: AgentCandidate | null;
  candidates: AgentCandidate[];
  recommendation: string;
}

export interface MatchAgentsOptions {
  threshold?: number;
  limit?: number;
}

// matchAgents — classe le roster BYAN pour une tache. Ne dit rien sur ce que
// claude chargera reellement : c'est le role de matchAgent() ci-dessous.
export function matchAgents(
  taskText: string,
  roster: readonly RosterAgent[],
  opts: MatchAgentsOptions = {},
): MatchAgentsResult {
  const { threshold = FIT_THRESHOLD, limit = 3 } = opts;
  const scored: AgentCandidate[] = (Array.isArray(roster) ? roster : [])
    .map((agent): AgentCandidate => {
      const s = scoreAgent(taskText, agent);
      return {
        name: agent.name,
        title: agent.title || agent.displayName || agent.name,
        score: s.score,
        why: s.hits.length ? `mots-cles: ${s.hits.join(', ')}` : (s.textScore ? 'recoupement titre/role' : ''),
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const candidates = scored.slice(0, limit);
  const best = candidates[0] ?? null;
  const fit = Boolean(best && best.score >= threshold);
  return {
    fit,
    needsInterview: !fit,
    best,
    candidates,
    recommendation: fit && best
      ? `Un agent adapte existe : @${best.name} (${best.why}). A valider.`
      : 'Aucun agent adapte trouve. Proposer une interview pour en creer un sur mesure.',
  };
}

// ---------- Le verdict complet : un agent adapte, mais charge-t-il vraiment ? ----------

// Trois issues distinctes, jamais reductibles a un booleen : `resolved` est le
// seul cas ou proposer l'agent a l'ecran est honnete. `unresolvable` existe
// pour dire "le roster BYAN croit avoir la reponse, mais rien ne la charge" —
// un etat que `no-fit` ne peut pas exprimer (le roster A matche, la
// resolution a echoue ensuite : ce n'est pas la meme cause qu'une absence de
// domaine).
export type AgentMatchVerdict =
  | { kind: 'resolved'; best: AgentCandidate; slug: string; candidates: AgentCandidate[]; recommendation: string }
  | { kind: 'unresolvable'; best: AgentCandidate; candidates: AgentCandidate[]; recommendation: string }
  | { kind: 'no-fit'; candidates: AgentCandidate[]; recommendation: string };

// matchAgent — le point d'entree complet : matche PUIS resout. `availableSlugs`
// vient de main/claude-agents.ts (availableClaudeAgents(projectRoot)) ; ce
// module reste pur en le recevant en parametre plutot qu'en le lisant lui-meme.
export function matchAgent(
  taskText: string,
  roster: readonly RosterAgent[],
  availableSlugs: readonly string[],
  opts: MatchAgentsOptions = {},
): AgentMatchVerdict {
  const result = matchAgents(taskText, roster, opts);
  if (!result.fit || !result.best) {
    return {
      kind: 'no-fit',
      candidates: result.candidates,
      recommendation: "Aucun agent adapte trouve. Il faut passer par l'interview pour en creer un sur mesure.",
    };
  }

  const slug = resolveClaudeAgent(result.best.name, [...availableSlugs]);
  if (!slug) {
    return {
      kind: 'unresolvable',
      best: result.best,
      candidates: result.candidates,
      recommendation: `Un agent adapte existe dans le roster BYAN (@${result.best.name}), mais aucun agent claude charge ne s'y resout : impossible de le proposer sans promettre un agent qui ne chargera jamais.`,
    };
  }

  return {
    kind: 'resolved',
    best: result.best,
    slug,
    candidates: result.candidates,
    recommendation: `Un agent adapte existe : @${result.best.name} (${result.best.why}), pret a etre lance comme "${slug}". A valider.`,
  };
}

// ---------- Le chargeur CSV (pur : texte en entree, aucun disque) ----------

// Analyseur CSV minimal, RFC-4180 : gere les champs entre guillemets doubles
// avec virgules et guillemets echappes (""). Suffisant pour
// agent-manifest.csv (les colonnes role et identity portent des virgules
// imbriquees dans le manifeste reel) ; ce n'est pas un moteur CSV general.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = String(text == null ? '' : text);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// rosterFromCsv(text) -> [{ name, displayName, title, role }]. Pur (aucun fs).
export function rosterFromCsv(text: string): RosterAgent[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (col: string): number => header.indexOf(col);
  const iName = idx('name');
  const iDisplay = idx('displayName');
  const iTitle = idx('title');
  const iRole = idx('role');
  return rows.slice(1)
    .filter((r) => r[iName])
    .map((r) => ({
      name: r[iName],
      displayName: iDisplay >= 0 ? (r[iDisplay] ?? '') : '',
      title: iTitle >= 0 ? (r[iTitle] ?? '') : '',
      role: iRole >= 0 ? (r[iRole] ?? '') : '',
    }));
}
