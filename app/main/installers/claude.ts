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
//
// The fs plumbing (walk with node_modules pruned during descent, plan diffing,
// apply) is shared with the codex/copilot installers — see fs-utils.ts.

import * as nodePath from 'path';
import type { FileWritePlan, OnboardingOpts } from '../../shared/ipc-contract';
import { resolveTemplateRoot } from './template-root';
import { planTree, planFile, applyPlans } from './fs-utils';

export async function previewClaudeSetup(
  projectRoot: string,
  _opts: Pick<OnboardingOpts, 'apiUrl'>
): Promise<FileWritePlan[]> {
  const templateRoot = resolveTemplateRoot();
  return [
    ...(await planTree({
      templateSrc: nodePath.join(templateRoot, '.claude', 'hooks'),
      destRoot: projectRoot,
      destPrefix: ['.claude', 'hooks'],
      description: 'Claude Code hook',
      platform: 'claude',
    })),
    ...(await planTree({
      templateSrc: nodePath.join(templateRoot, '.claude', 'skills'),
      destRoot: projectRoot,
      destPrefix: ['.claude', 'skills'],
      description: 'Claude Code skill',
      platform: 'claude',
    })),
    ...(await planFile({
      templateSrc: nodePath.join(templateRoot, '.claude', 'settings.json'),
      destRoot: projectRoot,
      destPrefix: ['.claude', 'settings.json'],
      description: 'Claude Code settings (hooks wired)',
      platform: 'claude',
    })),
    ...(await planTree({
      templateSrc: nodePath.join(templateRoot, '_byan'),
      destRoot: projectRoot,
      destPrefix: ['_byan'],
      description: 'BYAN platform file',
      platform: 'claude',
    })),
  ];
}

export async function applyClaudeSetup(plans: FileWritePlan[]): Promise<void> {
  return applyPlans(plans);
}
