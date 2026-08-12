// F1 — le disque du matcher d'agent : lit le manifeste BYAN d'un projet et,
// pour un slug claude deja RESOLU, le modele qu'il declare dans son
// front-matter.
//
// Isolation deliberee, le meme contrat que local-data.ts : lecture DEFENSIVE,
// un dossier ou un fichier absent rend [] / null, jamais une exception. Aucun
// Electron ici, seulement fs/path — appelable depuis un test node nu, et
// depuis le processus principal sans particularite.
//
// POURQUOI LE MODELE DECLARE COMPTE. Mesure du jour (docs/dispatch-natif/
// L0-mesures.md, M1) : sur 35 fichiers de .claude/agents/, chacun declare un
// modele (`model: sonnet|opus|haiku`), et `--model` gagne toujours sur cette
// declaration quand les deux sont poses. Sans le lire, poser `/byan` sans
// choisir de modele appliquerait en silence le modele declare par l'agent —
// le roster est une TROISIEME source de recommandation de modele, a cote du
// routeur par complexite et du choix de l'utilisateur. Ce module se contente
// de rendre le fait ; c'est un autre lot qui arbitre entre les trois sans
// jamais retrograder une declaration plus forte par un calcul plus faible.

import * as fs from 'fs';
import * as path from 'path';
import { rosterFromCsv, type RosterAgent } from '../shared/dispatch/agent-match';
import { readClaudeAgentDefinition } from './claude-agents';

// loadRoster(projectRoot) -> le roster BYAN du projet choisi, ou [] si
// `_byan/` est absent. Un projet qui n'utilise pas encore BYAN est l'etat
// normal, pas une erreur — meme contrat que local-data.ts.
export function loadRoster(projectRoot?: string | null): RosterAgent[] {
  if (!projectRoot) return [];
  const manifestPath = path.join(projectRoot, '_byan', '_config', 'agent-manifest.csv');
  try {
    return rosterFromCsv(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
}

// Le front-matter des agents claude est un bloc YAML minimal, delimite par
// une ligne `---` en tete de fichier et la premiere ligne `---` qui suit.
// Mesure sur les 35 fichiers de .claude/agents/ : une paire `cle: valeur` par
// ligne, aucun bloc imbrique, aucune liste. Un mini-parseur cible suffit ; une
// dependance YAML complete serait disproportionnee pour lire une seule cle.
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// declaredModelFromFrontMatter(definition) -> la valeur de `model:` dans le
// front-matter, ou null si le bloc est absent ou ne declare aucun modele.
// Exporte separement de declaredModelForSlug pour rester testable sans fs.
export function declaredModelFromFrontMatter(definition: string): string | null {
  const match = FRONT_MATTER.exec(definition);
  if (!match) return null;
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^model\s*:\s*(.+?)\s*$/.exec(line);
    if (m) {
      const value = m[1].trim().replace(/^['"]|['"]$/g, '');
      return value || null;
    }
  }
  return null;
}

// declaredModelForSlug(slug, projectRoot) -> le modele declare par l'agent
// claude deja RESOLU (ex: "bmad-bmm-dev", jamais "dev" — voir
// shared/dispatch/agent-match.ts pour pourquoi les deux ne se recoupent pas).
// null si l'agent est introuvable, illisible, ou ne declare aucun modele.
//
// Delegue la lecture — et sa fermeture de la traversee de dossier, un slug
// avec `..` ou un separateur rend null — a claude-agents.ts plutot que de la
// dupliquer : un seul endroit ferme cette porte pour tout l'appli.
export function declaredModelForSlug(slug: string, projectRoot?: string | null): string | null {
  const definition = readClaudeAgentDefinition(slug, projectRoot);
  if (!definition) return null;
  return declaredModelFromFrontMatter(definition);
}
