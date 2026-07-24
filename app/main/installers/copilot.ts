// Copilot installer — preview + apply pattern.
//
// Writes BYAN agent stubs into .github/agents/ in the target project.
// These stubs are the Copilot CLI integration: each stub loads the full
// agent definition from the BYAN platform at runtime.
//
// The fs plumbing is shared with the claude/codex installers — see fs-utils.ts.

import * as nodePath from 'path';
import type { FileWritePlan, OnboardingOpts } from '../../shared/ipc-contract';
import { resolveTemplateRoot } from './template-root';
import { planTree, applyPlans } from './fs-utils';

export async function previewCopilotSetup(
  projectRoot: string,
  _opts: Pick<OnboardingOpts, 'apiUrl'>
): Promise<FileWritePlan[]> {
  const templateRoot = resolveTemplateRoot();
  return planTree({
    templateSrc: nodePath.join(templateRoot, '.github', 'agents'),
    destRoot: projectRoot,
    destPrefix: ['.github', 'agents'],
    description: 'GitHub Copilot CLI agent stub',
    platform: 'copilot',
  });
}

export async function applyCopilotSetup(plans: FileWritePlan[]): Promise<void> {
  return applyPlans(plans);
}
