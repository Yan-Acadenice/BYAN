// Codex installer — preview + apply pattern.
//
// Writes BYAN agent skills into .codex/prompts/ in the target project.
// We do NOT touch ~/.codex/config.toml here (that is user-level config handled
// by install/lib/codex-native-setup.js). The GUI onboarding only scopes to the
// project directory so the user can review before applying.

import * as fs from 'fs/promises';
import * as nodePath from 'path';
import type { FileWritePlan, OnboardingOpts } from '../../shared/ipc-contract';
import { resolveTemplateRoot } from './template-root';

async function safeReadFile(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(full)));
    } else {
      result.push(full);
    }
  }
  return result;
}

async function fileExistsAndMatches(destPath: string, content: string): Promise<boolean> {
  const existing = await safeReadFile(destPath);
  return existing !== null && existing === content;
}

export async function previewCodexSetup(
  projectRoot: string,
  _opts: Pick<OnboardingOpts, 'apiUrl'>
): Promise<FileWritePlan[]> {
  const templateRoot = resolveTemplateRoot();
  const plans: FileWritePlan[] = [];

  // .codex/prompts/**
  const codexSrc = nodePath.join(templateRoot, '.codex');
  if (!(await fileExists(codexSrc))) {
    // No codex templates present in this install version — return empty plans.
    return plans;
  }

  const files = await walkFiles(codexSrc);
  for (const src of files) {
    const rel = nodePath.relative(codexSrc, src);
    const dest = nodePath.join(projectRoot, '.codex', rel);
    const content = (await safeReadFile(src)) ?? '';
    const same = await fileExistsAndMatches(dest, content);
    plans.push({
      path: dest,
      relPath: nodePath.join('.codex', rel),
      description: 'Codex skill / prompt',
      platform: 'codex',
      action: same ? 'skip' : (await fileExists(dest) ? 'update' : 'create'),
      content,
    });
  }

  return plans;
}

export async function applyCodexSetup(plans: FileWritePlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.action === 'skip') continue;
    await fs.mkdir(nodePath.dirname(plan.path), { recursive: true });
    await fs.writeFile(plan.path, plan.content, 'utf8');
  }
}
