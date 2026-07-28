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

describe('onboarding.apply — trust boundary', () => {
  const validPlan: FileWritePlan = {
    path: '/proj/.claude/settings.json',
    relPath: '.claude/settings.json',
    description: 'test',
    platform: 'claude',
    action: 'create',
    content: '{}',
  };

  it('rejects a relPath that traverses upward', async () => {
    const evil: FileWritePlan = {
      ...validPlan,
      path: '/proj/../../etc/passwd',
      relPath: '../../etc/passwd',
    };
    await expect(onboarding.apply([evil])).rejects.toThrow(/plans invalides/i);
  });

  it('rejects a path that is not root + relPath', async () => {
    const evil: FileWritePlan = { ...validPlan, path: '/etc/passwd' };
    await expect(onboarding.apply([evil])).rejects.toThrow(/plans invalides/i);
  });

  it('rejects plans pointing at two different roots', async () => {
    const other: FileWritePlan = {
      ...validPlan,
      path: '/elsewhere/.claude/settings.json',
    };
    await expect(onboarding.apply([validPlan, other])).rejects.toThrow(/plans invalides/i);
  });

  it('refuses a plan that does not come from the templates', async () => {
    const invented: FileWritePlan = {
      ...validPlan,
      path: '/proj/.claude/hooks/evil.js',
      relPath: '.claude/hooks/evil.js',
    };
    const result = await onboarding.apply([invented]);
    expect(result.written).toBe(0);
    expect(result.errors['.claude/hooks/evil.js']).toMatch(/gabarits/i);
  });

  it('writes the RECOMPUTED template content, never the renderer content', async () => {
    const { applyClaudeSetup } = await import('../../installers/claude');
    const tampered: FileWritePlan = { ...validPlan, content: 'EVIL INJECTED CONTENT' };
    const result = await onboarding.apply([tampered]);
    expect(result.written).toBe(1);
    const appliedPlans = (applyClaudeSetup as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as FileWritePlan[];
    expect(appliedPlans[0].content).toBe('{}'); // template content, not the tampered one
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


// ---------------------------------------------------------------------------
// The hard rule: a conflict is never written without explicit acceptance.
//
// A conflict means the file carries the user's own edits since we wrote it.
// Overwriting it destroys work, so the renderer leaving it ticked is not enough:
// main refuses unless the caller names it. That makes "silently overwrite a hand
// edit" impossible from the renderer, bug or not.
// ---------------------------------------------------------------------------
describe('apply — conflicts', () => {
  const CONFLICT_PLAN: FileWritePlan = {
    path: '/proj/.claude/settings.json',
    relPath: '.claude/settings.json',
    description: 'Claude Code settings',
    platform: 'claude',
    action: 'conflict',
    content: '{}',
  };

  it('refuses to write a conflict nobody accepted', async () => {
    const claude = await import('../../installers/claude');
    vi.mocked(claude.previewClaudeSetup).mockResolvedValueOnce([CONFLICT_PLAN]);
    vi.mocked(claude.applyClaudeSetup).mockClear();

    const result = await onboarding.apply([CONFLICT_PLAN]);

    expect(claude.applyClaudeSetup).not.toHaveBeenCalled();
    expect(result.written).toBe(0);
    expect(result.conflictsKept).toBe(1);
  });

  it('writes a conflict the caller named', async () => {
    const claude = await import('../../installers/claude');
    vi.mocked(claude.previewClaudeSetup).mockResolvedValueOnce([CONFLICT_PLAN]);
    vi.mocked(claude.applyClaudeSetup).mockClear();

    const result = await onboarding.apply([CONFLICT_PLAN], {
      acceptedConflicts: ['claude .claude/settings.json'],
    });

    expect(claude.applyClaudeSetup).toHaveBeenCalledOnce();
    expect(result.written).toBe(1);
    expect(result.conflictsKept).toBe(0);
  });

  it('an acceptance for another file does not unlock this one', async () => {
    // The key is platform + relPath, so a name that does not match exactly is
    // not an acceptance. A loose match here would be a way in.
    const claude = await import('../../installers/claude');
    vi.mocked(claude.previewClaudeSetup).mockResolvedValueOnce([CONFLICT_PLAN]);
    vi.mocked(claude.applyClaudeSetup).mockClear();

    const result = await onboarding.apply([CONFLICT_PLAN], {
      acceptedConflicts: ['claude .claude/other.json', '.claude/settings.json'],
    });

    expect(claude.applyClaudeSetup).not.toHaveBeenCalled();
    expect(result.conflictsKept).toBe(1);
  });

  it('the renderer cannot disguise a conflict as an update', async () => {
    // main recomputes the action from the templates and the fingerprint record.
    // What the renderer claims the action is never decides whether a file is
    // written — only main's own verdict does.
    const claude = await import('../../installers/claude');
    vi.mocked(claude.previewClaudeSetup).mockResolvedValueOnce([CONFLICT_PLAN]);
    vi.mocked(claude.applyClaudeSetup).mockClear();

    const lying: FileWritePlan = { ...CONFLICT_PLAN, action: 'update' };
    const result = await onboarding.apply([lying]);

    expect(claude.applyClaudeSetup).not.toHaveBeenCalled();
    expect(result.conflictsKept).toBe(1);
  });
});
