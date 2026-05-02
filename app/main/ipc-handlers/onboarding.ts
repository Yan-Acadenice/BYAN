// Onboarding IPC handlers — aggregates the 3 platform installers.
//
// preview : returns all FileWritePlan[] for selected platforms (dry run, no disk I/O).
// apply   : executes plans, collects partial errors so one failing file does not
//           abort the rest. All errors are returned in OnboardingResult.errors.

import type { IpcMain } from 'electron';
import {
  IPC_CHANNELS,
  OnboardingOpts,
  FileWritePlan,
  OnboardingResult,
} from '../../shared/ipc-contract';
import { wrap } from './_error';
import { previewClaudeSetup, applyClaudeSetup } from '../installers/claude';
import { previewCodexSetup, applyCodexSetup } from '../installers/codex';
import { previewCopilotSetup, applyCopilotSetup } from '../installers/copilot';

export async function preview(opts: OnboardingOpts): Promise<FileWritePlan[]> {
  const instOpts = { apiUrl: opts.apiUrl };
  const results = await Promise.all([
    opts.platforms.claude ? previewClaudeSetup(opts.projectRoot, instOpts) : Promise.resolve([]),
    opts.platforms.codex ? previewCodexSetup(opts.projectRoot, instOpts) : Promise.resolve([]),
    opts.platforms.copilot ? previewCopilotSetup(opts.projectRoot, instOpts) : Promise.resolve([]),
  ]);
  return results.flat();
}

export async function apply(plans: FileWritePlan[]): Promise<OnboardingResult> {
  const result: OnboardingResult = { written: 0, skipped: 0, errors: {} };

  const claudePlans = plans.filter((p) => p.platform === 'claude');
  const codexPlans = plans.filter((p) => p.platform === 'codex');
  const copilotPlans = plans.filter((p) => p.platform === 'copilot');

  for (const plan of plans) {
    if (plan.action === 'skip') {
      result.skipped += 1;
    }
  }

  // Apply each platform independently so partial failures do not cascade.
  const runApply = async (
    platformPlans: FileWritePlan[],
    applyFn: (plans: FileWritePlan[]) => Promise<void>
  ) => {
    const toWrite = platformPlans.filter((p) => p.action !== 'skip');
    if (toWrite.length === 0) return;
    // Apply file by file so one failure does not block others.
    for (const plan of toWrite) {
      try {
        await applyFn([plan]);
        result.written += 1;
      } catch (err) {
        result.errors[plan.relPath] = err instanceof Error ? err.message : String(err);
      }
    }
  };

  await runApply(claudePlans, applyClaudeSetup);
  await runApply(codexPlans, applyCodexSetup);
  await runApply(copilotPlans, applyCopilotSetup);

  return result;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.onboarding.preview,
    wrap((_evt, opts: OnboardingOpts) => preview(opts))
  );
  ipcMain.handle(
    IPC_CHANNELS.onboarding.apply,
    wrap((_evt, plans: FileWritePlan[]) => apply(plans))
  );
}
