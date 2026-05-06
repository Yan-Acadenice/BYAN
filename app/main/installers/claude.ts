// Claude Code installer — preview + apply pattern.
//
// previewClaudeSetup  : computes what would be written (FileWritePlan[]) without touching disk.
// applyClaudeSetup    : executes the plans returned by preview.
//
// Why not reuse install/lib/claude-native-setup.js directly?
//   - That module calls `npm install` (needs a TTY / spinner).
//   - It mixes logging with logic (chalk, console.log).
//   - It uses byan-platform-config (which requires full install tree).
// We replicate only the file-write logic here, keeping it pure and testable.
// MCP config wiring (byan-platform-config) is deferred: the GUI will expose a
// dedicated "Connect BYAN" flow after onboarding.

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

async function fileExistsAndMatches(destPath: string, content: string): Promise<boolean> {
  const existing = await safeReadFile(destPath);
  return existing !== null && existing === content;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Recursively walk a directory and return all file paths.
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

// node_modules filter: skip any path that contains a node_modules segment.
function isNodeModules(p: string): boolean {
  return p.split(nodePath.sep).includes('node_modules');
}

export async function previewClaudeSetup(
  projectRoot: string,
  _opts: Pick<OnboardingOpts, 'apiUrl'>
): Promise<FileWritePlan[]> {
  const templateRoot = resolveTemplateRoot();
  const plans: FileWritePlan[] = [];

  // .claude/hooks/**
  const hooksTemplateSrc = nodePath.join(templateRoot, '.claude', 'hooks');
  if (await fileExists(hooksTemplateSrc)) {
    const files = await walkFiles(hooksTemplateSrc);
    for (const src of files) {
      if (isNodeModules(src)) continue;
      const rel = nodePath.relative(hooksTemplateSrc, src);
      const dest = nodePath.join(projectRoot, '.claude', 'hooks', rel);
      const content = (await safeReadFile(src)) ?? '';
      const same = await fileExistsAndMatches(dest, content);
      plans.push({
        path: dest,
        relPath: nodePath.join('.claude', 'hooks', rel),
        description: 'Claude Code hook',
        platform: 'claude',
        action: same ? 'skip' : (await fileExists(dest) ? 'update' : 'create'),
        content,
      });
    }
  }

  // .claude/skills/**
  const skillsTemplateSrc = nodePath.join(templateRoot, '.claude', 'skills');
  if (await fileExists(skillsTemplateSrc)) {
    const files = await walkFiles(skillsTemplateSrc);
    for (const src of files) {
      if (isNodeModules(src)) continue;
      const rel = nodePath.relative(skillsTemplateSrc, src);
      const dest = nodePath.join(projectRoot, '.claude', 'skills', rel);
      const content = (await safeReadFile(src)) ?? '';
      const same = await fileExistsAndMatches(dest, content);
      plans.push({
        path: dest,
        relPath: nodePath.join('.claude', 'skills', rel),
        description: 'Claude Code skill',
        platform: 'claude',
        action: same ? 'skip' : (await fileExists(dest) ? 'update' : 'create'),
        content,
      });
    }
  }

  // .claude/settings.json
  const settingsSrc = nodePath.join(templateRoot, '.claude', 'settings.json');
  if (await fileExists(settingsSrc)) {
    const content = (await safeReadFile(settingsSrc)) ?? '';
    const dest = nodePath.join(projectRoot, '.claude', 'settings.json');
    const same = await fileExistsAndMatches(dest, content);
    plans.push({
      path: dest,
      relPath: nodePath.join('.claude', 'settings.json'),
      description: 'Claude Code settings (hooks wired)',
      platform: 'claude',
      action: same ? 'skip' : (await fileExists(dest) ? 'update' : 'create'),
      content,
    });
  }

  // _byan/ tree (excluding mcp/byan-mcp-server/node_modules)
  const byanSrc = nodePath.join(templateRoot, '_byan');
  if (await fileExists(byanSrc)) {
    const files = await walkFiles(byanSrc);
    for (const src of files) {
      if (isNodeModules(src)) continue;
      const rel = nodePath.relative(byanSrc, src);
      const dest = nodePath.join(projectRoot, '_byan', rel);
      const content = (await safeReadFile(src)) ?? '';
      const same = await fileExistsAndMatches(dest, content);
      plans.push({
        path: dest,
        relPath: nodePath.join('_byan', rel),
        description: 'BYAN platform file',
        platform: 'claude',
        action: same ? 'skip' : (await fileExists(dest) ? 'update' : 'create'),
        content,
      });
    }
  }

  return plans;
}

export async function applyClaudeSetup(plans: FileWritePlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.action === 'skip') continue;
    await fs.mkdir(nodePath.dirname(plan.path), { recursive: true });
    await fs.writeFile(plan.path, plan.content, 'utf8');
  }
}
