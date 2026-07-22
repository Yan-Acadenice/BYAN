// Local projects registry (F6) — ~/.byan/projects.json.
//
// Maps a project to its LOCAL directory on this machine. The desktop onboarding
// records the folder the user picks ; the Projects / ProjectDetail pages read it
// back so the local folder is visible (the user's pain: "on ne voit pas le
// dossier alors qu'on le choisit à l'installation"). Portable, per-machine, home
// level — it is NOT shipped and NOT a byan_web source ; it just links a project
// name to a path on this PC.
//
// The CLI installer can write the SAME file (same shape) ; this module is the
// canonical app-side reader/writer so both paths agree.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface LocalProjectEntry {
  // Human name (usually the folder's basename or the project name).
  name: string;
  // Absolute path of the project directory on this machine.
  path: string;
  // The byan_web project id when known (onboarding rarely knows it — optional).
  projectId?: string;
  // ISO timestamp of the last write (stamped by the caller for testability).
  updatedAt?: string;
}

export interface Registry {
  projects: LocalProjectEntry[];
}

// Resolve ~/.byan/projects.json. BYAN_HOME overrides the home dir (tests).
export function registryPath(): string {
  const home = process.env.BYAN_HOME || os.homedir();
  return path.join(home, '.byan', 'projects.json');
}

// Read the registry, tolerating a missing or corrupt file (returns empty).
export function readRegistry(): Registry {
  try {
    const raw = fs.readFileSync(registryPath(), 'utf8');
    const parsed = JSON.parse(raw) as Registry;
    if (parsed && Array.isArray(parsed.projects)) return parsed;
    return { projects: [] };
  } catch {
    return { projects: [] };
  }
}

// Insert-or-update by absolute path (the natural key). Returns the saved entry.
export function upsertProject(entry: LocalProjectEntry): LocalProjectEntry {
  if (!entry || !entry.path) throw new Error('upsertProject: path requis');
  const reg = readRegistry();
  const saved: LocalProjectEntry = {
    name: entry.name || path.basename(entry.path.replace(/[/\\]+$/, '')),
    path: entry.path,
    projectId: entry.projectId,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
  const idx = reg.projects.findIndex((p) => p.path === entry.path);
  if (idx >= 0) reg.projects[idx] = { ...reg.projects[idx], ...saved };
  else reg.projects.push(saved);
  writeRegistry(reg);
  return saved;
}

// Best-effort match of a byan_web project to a local entry: by projectId first,
// then by a case-insensitive name / folder-basename equality.
export function findLocalPath(project: { id?: string; name?: string }): LocalProjectEntry | null {
  const reg = readRegistry();
  if (project.id) {
    const byId = reg.projects.find((p) => p.projectId && p.projectId === project.id);
    if (byId) return byId;
  }
  if (project.name) {
    const n = project.name.trim().toLowerCase();
    const byName = reg.projects.find(
      (p) => p.name.trim().toLowerCase() === n || path.basename(p.path).toLowerCase() === n
    );
    if (byName) return byName;
  }
  return null;
}

function writeRegistry(reg: Registry): void {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(reg, null, 2), 'utf8');
}
