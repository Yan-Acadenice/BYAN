// Tests for the onboarding IPC handler — preview + apply channels.

import { describe, it, expect, vi } from 'vitest';
import * as onboarding from '../../ipc-handlers/onboarding';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';
import type { OnboardingOpts, FileWritePlan } from '../../../shared/ipc-contract';

// Mock installers so tests don't touch the real template directory.
vi.mock('../../installers/claude', () => ({
  previewClaudeSetup: vi.fn().mockResolvedValue([
    {
      path: '/proj/.claude/settings.json',
      relPath: '.claude/settings.json',
      description: 'Claude Code settings',
      platform: 'claude',
      action: 'create',
      content: '{}',
    },
  ]),
  applyClaudeSetup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../installers/codex', () => ({
  previewCodexSetup: vi.fn().mockResolvedValue([
    {
      path: '/proj/.codex/prompts/byan.md',
      relPath: '.codex/prompts/byan.md',
      description: 'Codex skill',
      platform: 'codex',
      action: 'create',
      content: '# byan',
    },
  ]),
  applyCodexSetup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../installers/copilot', () => ({
  previewCopilotSetup: vi.fn().mockResolvedValue([
    {
      path: '/proj/.github/agents/byan.md',
      relPath: '.github/agents/byan.md',
      description: 'Copilot stub',
      platform: 'copilot',
      action: 'create',
      content: '# byan agent',
    },
  ]),
  applyCopilotSetup: vi.fn().mockResolvedValue(undefined),
}));

const baseOpts: OnboardingOpts = {
  projectRoot: '/proj',
  platforms: { claude: true, codex: true, copilot: true },
};

describe('onboarding.preview', () => {
  it('aggregates plans from all 3 installers when all platforms enabled', async () => {
    const plans = await onboarding.preview(baseOpts);
    expect(plans.length).toBe(3);
    const platforms = plans.map((p) => p.platform);
    expect(platforms).toContain('claude');
    expect(platforms).toContain('codex');
    expect(platforms).toContain('copilot');
  });

  it('omits codex plans when codex=false', async () => {
    const opts: OnboardingOpts = { ...baseOpts, platforms: { claude: true, codex: false, copilot: true } };
    const plans = await onboarding.preview(opts);
    expect(plans.every((p) => p.platform !== 'codex')).toBe(true);
  });

  it('omits copilot plans when copilot=false', async () => {
    const opts: OnboardingOpts = { ...baseOpts, platforms: { claude: true, codex: true, copilot: false } };
    const plans = await onboarding.preview(opts);
    expect(plans.every((p) => p.platform !== 'copilot')).toBe(true);
  });

  it('returns empty array when all platforms disabled', async () => {
    const opts: OnboardingOpts = { ...baseOpts, platforms: { claude: false, codex: false, copilot: false } };
    const plans = await onboarding.preview(opts);
    expect(plans).toHaveLength(0);
  });
});

describe('onboarding.apply', () => {
  it('counts written files correctly', async () => {
    const plans: FileWritePlan[] = [
      {
        path: '/proj/.claude/settings.json',
        relPath: '.claude/settings.json',
        description: 'test',
        platform: 'claude',
        action: 'create',
        content: '{}',
      },
      {
        path: '/proj/.codex/prompts/byan.md',
        relPath: '.codex/prompts/byan.md',
        description: 'test',
        platform: 'codex',
        action: 'create',
        content: '# byan',
      },
    ];
    const result = await onboarding.apply(plans);
    expect(result.written).toBe(2);
    expect(result.skipped).toBe(0);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('counts skipped plans correctly', async () => {
    const plans: FileWritePlan[] = [
      {
        path: '/proj/.claude/settings.json',
        relPath: '.claude/settings.json',
        description: 'test',
        platform: 'claude',
        action: 'skip',
        content: '{}',
      },
    ];
    const result = await onboarding.apply(plans);
    expect(result.skipped).toBe(1);
    expect(result.written).toBe(0);
  });

  it('collects errors from failing apply without aborting others', async () => {
    const { applyClaudeSetup } = await import('../../installers/claude');
    // Make claude apply throw
    (applyClaudeSetup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('permission denied')
    );

    const plans: FileWritePlan[] = [
      {
        path: '/proj/.claude/settings.json',
        relPath: '.claude/settings.json',
        description: 'test',
        platform: 'claude',
        action: 'create',
        content: '{}',
      },
      {
        path: '/proj/.codex/prompts/byan.md',
        relPath: '.codex/prompts/byan.md',
        description: 'test',
        platform: 'codex',
        action: 'create',
        content: '# byan',
      },
    ];
    const result = await onboarding.apply(plans);
    // codex still written despite claude error
    expect(result.written).toBe(1);
    expect(Object.keys(result.errors)).toHaveLength(1);
  });
});

describe('onboarding.register', () => {
  it('registers preview and apply channels on ipcMain', () => {
    const handle = vi.fn();
    onboarding.register({ handle } as never);
    const channels = handle.mock.calls.map((c: unknown[]) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.onboarding.preview);
    expect(channels).toContain(IPC_CHANNELS.onboarding.apply);
  });
});
