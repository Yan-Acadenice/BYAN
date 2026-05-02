// Copilot installer — preview + apply pattern.
//
// Writes BYAN agent stubs into .github/agents/ in the target project.
// These stubs are the Copilot CLI integration: each stub loads the full
// agent definition from the BYAN platform at runtime.

import * as fs from 'fs/promises';
import * as nodePath from 'path';
import type { FileWritePlan, OnboardingOpts } from '../../shared/ipc-contract';

function resolveTemplateRoot(): string {
  return nodePath.resolve(__dirname, '..', '..', '..', 'install', 'templates');
}

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

export async function previewCopilotSetup(
  projectRoot: string,
  _opts: Pick<OnboardingOpts, 'apiUrl'>
): Promise<FileWritePlan[]> {
  const templateRoot = resolveTemplateRoot();
  const plans: FileWritePlan[] = [];

  // .github/agents/**
  const githubSrc = nodePath.join(templateRoot, '.github', 'agents');
  if (!(await fileExists(githubSrc))) {
    // No copilot templates present — return empty plans.
    return plans;
  }

  const files = await walkFiles(githubSrc);
  for (const src of files) {
    const rel = nodePath.relative(githubSrc, src);
    const dest = nodePath.join(projectRoot, '.github', 'agents', rel);
    const content = (await safeReadFile(src)) ?? '';
    const same = await fileExistsAndMatches(dest, content);
    plans.push({
      path: dest,
      relPath: nodePath.join('.github', 'agents', rel),
      description: 'GitHub Copilot CLI agent stub',
      platform: 'copilot',
      action: same ? 'skip' : (await fileExists(dest) ? 'update' : 'create'),
      content,
    });
  }

  return plans;
}

export async function applyCopilotSetup(plans: FileWritePlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.action === 'skip') continue;
    await fs.mkdir(nodePath.dirname(plan.path), { recursive: true });
    await fs.writeFile(plan.path, plan.content, 'utf8');
  }
}
