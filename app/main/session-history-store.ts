// Le magasin disque de l'historique des sessions locales.
//
// Un fichier JSON par session, sous le dossier memoire du PROJET :
//   Gen3 : <projectRoot>/_byan/memoire/session-history/<id>.json
//   Gen2 : <projectRoot>/_byan/_memory/session-history/<id>.json
//
// POURQUOI SOUS _byan/ ET PAS DANS LE DOSSIER DE CONFIG DE L'APP. L'historique
// est un etat de BYAN, pas un reglage d'interface : la doctrine du noyau portable
// veut qu'il vive dans le depot du projet, donc qu'il voyage avec lui et reste
// lisible depuis Codex ou depuis une autre machine (PORTABLE-1). Le ranger dans
// ~/.config/byan le rendrait invisible partout ailleurs.
//
// Ce module fait les entrees/sorties et RIEN d'autre : les transitions d'un
// enregistrement vivent dans shared/session-history.ts, pures et testables sans
// systeme de fichiers.

import * as fs from 'fs';
import * as path from 'path';
import {
  isSessionHistoryRecord,
  toSummary,
  type SessionHistoryRecord,
  type SessionHistorySummary,
} from '../shared/session-history';

// Au-dela, on jette les plus anciens. Un dossier qui grossit sans fin est un
// defaut differe : la page relit chaque fichier pour dresser la liste.
export const HISTORY_RECORDS_CAP = 200;

const DIR_GEN3 = path.join('_byan', 'memoire', 'session-history');
const DIR_GEN2 = path.join('_byan', '_memory', 'session-history');

// Ou ecrire pour ce projet. On suit l'agencement DEJA present (memoire/ = Gen3,
// _memory/ = Gen2) pour ne pas semer un second dossier memoire a cote du vrai ;
// sur un projet neuf on choisit Gen3, l'agencement courant.
export function historyDir(projectRoot: string): string {
  if (dirExists(path.join(projectRoot, '_byan', 'memoire'))) return path.join(projectRoot, DIR_GEN3);
  if (dirExists(path.join(projectRoot, '_byan', '_memory'))) return path.join(projectRoot, DIR_GEN2);
  return path.join(projectRoot, DIR_GEN3);
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Un identifiant de session sert de nom de fichier. Il vient de randomUUID cote
// pont, mais cette fonction est la frontiere du systeme de fichiers : un
// identifiant venu d'ailleurs (une lecture, un futur appel) ne doit pas pouvoir
// remonter l'arborescence.
function safeId(id: string): string | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  if (id === '.' || id === '..') return null;
  return id;
}

export class SessionHistoryStore {
  constructor(private readonly resolveRoot: () => string | null) {}

  // Le dossier vise. `root` explicite l'emporte : une session tourne dans SON
  // dossier projet, qui n'est pas forcement celui que la page consulte. Ecrire
  // l'historique d'une session ailleurs que dans son propre projet le rendrait
  // introuvable des qu'on change de projet.
  private dir(root?: string | null): string | null {
    const resolved = root ?? this.resolveRoot();
    if (!resolved) return null;
    return historyDir(resolved);
  }

  // Ecriture ATOMIQUE : fichier temporaire puis renommage. Une coupure en plein
  // ecrit laisserait sinon un JSON tronque, qui ferait sauter cette session de la
  // liste a la relecture — une perte silencieuse.
  write(record: SessionHistoryRecord): void {
    const dir = this.dir(record.cwd);
    const id = safeId(record.id);
    if (!dir || !id) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `${id}.json`);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
      fs.renameSync(tmp, target);
    } catch {
      // L'historique est une trace, pas le travail. Un disque plein ou un dossier
      // en lecture seule ne doit pas faire echouer le tour de chat en cours.
    }
  }

  read(id: string): SessionHistoryRecord | null {
    const dir = this.dir();
    const safe = safeId(id);
    if (!dir || !safe) return null;
    return readRecord(path.join(dir, `${safe}.json`));
  }

  // Les resumes, du plus recent au plus ancien. Un fichier illisible ou d'une
  // autre version est saute plutot que fatal : un seul enregistrement corrompu ne
  // doit pas vider la page.
  list(limit = HISTORY_RECORDS_CAP): SessionHistorySummary[] {
    const dir = this.dir();
    if (!dir) return [];
    const out: SessionHistorySummary[] = [];
    for (const file of listJsonFiles(dir)) {
      const record = readRecord(path.join(dir, file));
      if (record) out.push(toSummary(record));
    }
    out.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    return out.slice(0, limit);
  }

  remove(id: string): boolean {
    const dir = this.dir();
    const safe = safeId(id);
    if (!dir || !safe) return false;
    try {
      fs.unlinkSync(path.join(dir, `${safe}.json`));
      return true;
    } catch {
      return false;
    }
  }

  clear(): number {
    const dir = this.dir();
    if (!dir) return 0;
    let removed = 0;
    for (const file of listJsonFiles(dir)) {
      try {
        fs.unlinkSync(path.join(dir, file));
        removed += 1;
      } catch {
        // deja parti ou verrouille — on continue
      }
    }
    return removed;
  }

  // Jette les enregistrements au-dela du plafond, les plus anciens d'abord.
  // Appele a l'ouverture d'une session : le moment ou un enregistrement de plus
  // arrive est le bon moment pour verifier qu'il n'y en a pas trop.
  prune(cap = HISTORY_RECORDS_CAP, root?: string | null): number {
    const dir = this.dir(root);
    if (!dir) return 0;
    const dated: { file: string; key: string }[] = [];
    for (const file of listJsonFiles(dir)) {
      const record = readRecord(path.join(dir, file));
      // Un fichier illisible n'a pas de date : il part en premier, il ne sert a
      // personne et il occupe une place dans le plafond.
      dated.push({ file, key: record ? sortKey(toSummary(record)) : '' });
    }
    if (dated.length <= cap) return 0;
    dated.sort((a, b) => b.key.localeCompare(a.key));
    let removed = 0;
    for (const { file } of dated.slice(cap)) {
      try {
        fs.unlinkSync(path.join(dir, file));
        removed += 1;
      } catch {
        // ignore
      }
    }
    return removed;
  }
}

// La cle de tri : la fin quand la session est close, sinon le debut. Trier sur le
// debut seul remonterait une vieille session encore ouverte au-dessus d'une
// session terminee a l'instant.
function sortKey(s: SessionHistorySummary): string {
  return s.endedAt ?? s.startedAt;
}

function listJsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function readRecord(file: string): SessionHistoryRecord | null {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isSessionHistoryRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
