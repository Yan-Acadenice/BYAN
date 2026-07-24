// Shared fs helpers for the platform installers (claude / codex / copilot).
//
// One walk implementation, one prune rule: node_modules is skipped during the
// DESCENT, not filtered per-file after the fact. The old per-installer copies
// descended into node_modules then threw the paths away — on a template tree
// that ships dependencies this reads thousands of files for nothing, and the
// full-suite disk contention pushed the installer tests past their timeout.

import * as fs from 'fs/promises';
import * as nodePath from 'path';
import type { FileWritePlan } from '../../shared/ipc-contract';

export async function safeReadFile(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function fileExistsAndMatches(destPath: string, content: string): Promise<boolean> {
  const existing = await safeReadFile(destPath);
  return existing !== null && existing === content;
}

// Recursively walk a directory and return all file paths, pruning node_modules.
export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === 'node_modules') continue;
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(full)));
    } else {
      result.push(full);
    }
  }
  return result;
}

export interface TreePlanSpec {
  // Absolute template subtree to copy from. Absent dir -> zero plans.
  templateSrc: string;
  // Project root the files land in.
  destRoot: string;
  // Path segments under the project root (also the display relPath prefix).
  destPrefix: string[];
  description: string;
  platform: FileWritePlan['platform'];
}

// One plan per file of a template subtree, diffed against the destination
// (create / update / skip). This loop was copied in the three installers.
export async function planTree(spec: TreePlanSpec): Promise<FileWritePlan[]> {
  if (!(await fileExists(spec.templateSrc))) return [];
  const plans: FileWritePlan[] = [];
  for (const src of await walkFiles(spec.templateSrc)) {
    const rel = nodePath.relative(spec.templateSrc, src);
    plans.push(await planOne(src, spec, rel));
  }
  return plans;
}

// One plan for a single template file (e.g. .claude/settings.json).
export async function planFile(spec: TreePlanSpec): Promise<FileWritePlan[]> {
  if (!(await fileExists(spec.templateSrc))) return [];
  return [await planOne(spec.templateSrc, spec, '')];
}

async function planOne(src: string, spec: TreePlanSpec, rel: string): Promise<FileWritePlan> {
  const dest = nodePath.join(spec.destRoot, ...spec.destPrefix, rel);
  const content = (await safeReadFile(src)) ?? '';
  const same = await fileExistsAndMatches(dest, content);
  return {
    path: dest,
    relPath: nodePath.join(...spec.destPrefix, rel),
    description: spec.description,
    platform: spec.platform,
    action: same ? 'skip' : (await fileExists(dest)) ? 'update' : 'create',
    content,
  };
}

// Execute the plans returned by a preview — identical across installers.
export async function applyPlans(plans: FileWritePlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.action === 'skip') continue;
    await fs.mkdir(nodePath.dirname(plan.path), { recursive: true });
    await fs.writeFile(plan.path, plan.content, 'utf8');
  }
}
