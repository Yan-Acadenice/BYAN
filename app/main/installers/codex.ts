// Codex installer — preview + apply pattern.
//
// Writes BYAN agent skills into .codex/prompts/ in the target project.
// We do NOT touch ~/.codex/config.toml here (that is user-level config handled
// by install/lib/codex-native-setup.js). The GUI onboarding only scopes to the
// project directory so the user can review before applying.
//
// The fs plumbing is shared with the claude/copilot installers — see fs-utils.ts.

import * as nodePath from 'path';
import type { FileWritePlan, OnboardingOpts } from '../../shared/ipc-contract';
import { resolveTemplateRoot } from './template-root';
import { planTree, applyPlans } from './fs-utils';

export async function previewCodexSetup(
  projectRoot: string,
  _opts: Pick<OnboardingOpts, 'apiUrl'>
): Promise<FileWritePlan[]> {
  const templateRoot = resolveTemplateRoot();
  return planTree({
    templateSrc: nodePath.join(templateRoot, '.codex'),
    destRoot: projectRoot,
    destPrefix: ['.codex'],
    description: 'Codex skill / prompt',
    platform: 'codex',
  });
}

export async function applyCodexSetup(plans: FileWritePlan[]): Promise<void> {
  return applyPlans(plans);
}
