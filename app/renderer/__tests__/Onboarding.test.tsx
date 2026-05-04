// Onboarding.tsx component tests — Vitest + @testing-library/react + jsdom.
//
// Strategy: mock window.byanApi entirely. Tests drive the multi-step flow:
//   - Step 0 (Welcome) → pick folder
//   - Step 1 (Detection) → platform checkboxes
//   - Apply error → error message shown
//   - Skip button → navigate to login

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Onboarding from '../pages/Onboarding';
import type { CliDetection, FileWritePlan, OnboardingResult } from '../../shared/ipc-contract';

// ---- window.byanApi mock ----

const mockDetect = vi.fn<() => Promise<CliDetection>>();
const mockPathExists = vi.fn<() => Promise<boolean>>();
const mockOpenProjectDialog = vi.fn<() => Promise<string | null>>();
const mockOnboardingPreview = vi.fn<() => Promise<FileWritePlan[]>>();
const mockOnboardingApply = vi.fn<() => Promise<OnboardingResult>>();
const mockStoreGet = vi.fn<() => Promise<unknown>>();
const mockStoreSet = vi.fn<() => Promise<void>>();

function buildByanApi() {
  return {
    auth: {
      login: vi.fn(),
      logout: vi.fn(),
      getToken: vi.fn(),
    },
    fs: {
      openProjectDialog: mockOpenProjectDialog,
      readFile: vi.fn(),
      pathExists: mockPathExists,
      mkdir: vi.fn(),
    },
    mcp: { list: vi.fn(), start: vi.fn(), stop: vi.fn(), status: vi.fn() },
    cli: { detect: mockDetect },
    onboarding: {
      preview: mockOnboardingPreview,
      apply: mockOnboardingApply,
    },
    server: { spawn: vi.fn(), stop: vi.fn(), status: vi.fn() },
    app: { quit: vi.fn(), version: vi.fn(), relaunch: vi.fn(), openExternal: vi.fn() },
    store: { get: mockStoreGet, set: mockStoreSet },
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'byanApi', {
    value: buildByanApi(),
    writable: true,
    configurable: true,
  });

  // Defaults
  mockDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
  mockPathExists.mockResolvedValue(false);
  mockOpenProjectDialog.mockResolvedValue('/home/user/my-project');
  mockOnboardingPreview.mockResolvedValue([
    {
      path: '/home/user/my-project/.claude/settings.json',
      relPath: '.claude/settings.json',
      description: 'Claude Code settings',
      platform: 'claude',
      action: 'create',
      content: '{}',
    },
  ]);
  mockOnboardingApply.mockResolvedValue({ written: 1, skipped: 0, errors: {} });
  mockStoreGet.mockResolvedValue(null);
  mockStoreSet.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function renderOnboarding(onComplete = vi.fn()) {
  const utils = render(<Onboarding onComplete={onComplete} />);
  // Wait for the async mount (skip check) to finish
  await waitFor(() => expect(screen.getByTestId('step-welcome')).toBeInTheDocument());
  return { ...utils, onComplete };
}

describe('Onboarding — Step 0: Welcome', () => {
  it('renders the welcome step by default', async () => {
    await renderOnboarding();
    expect(screen.getByTestId('step-welcome')).toBeInTheDocument();
  });

  it('shows skip onboarding button', async () => {
    await renderOnboarding();
    expect(screen.getByTestId('skip-onboarding-btn')).toBeInTheDocument();
  });

  it('calls onComplete when skip is clicked', async () => {
    const { onComplete } = await renderOnboarding();
    fireEvent.click(screen.getByTestId('skip-onboarding-btn'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls openProjectDialog when Browse is clicked', async () => {
    await renderOnboarding();
    fireEvent.click(screen.getByTestId('pick-folder-btn'));
    await waitFor(() => expect(mockOpenProjectDialog).toHaveBeenCalled());
  });

  it('skips onboarding if _byan/config.yaml already present after picking folder', async () => {
    // When a folder is picked and config.yaml exists → onComplete called immediately
    mockPathExists.mockResolvedValue(true);
    const { onComplete } = await renderOnboarding();
    fireEvent.click(screen.getByTestId('pick-folder-btn'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('shows error when Next clicked without project root', async () => {
    await renderOnboarding();
    // Clear the input so it's empty
    const input = screen.getByTestId('project-root-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('step0-next-btn'));
    await waitFor(() => expect(screen.getByTestId('onboarding-error')).toBeInTheDocument());
  });

  it('advances to detection step on Next with valid path', async () => {
    await renderOnboarding();
    const input = screen.getByTestId('project-root-input');
    fireEvent.change(input, { target: { value: '/home/user/my-project' } });
    fireEvent.click(screen.getByTestId('step0-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-detection')).toBeInTheDocument());
  });
});

describe('Onboarding — Step 1: Detection', () => {
  async function goToDetection() {
    const utils = await renderOnboarding();
    const input = screen.getByTestId('project-root-input');
    fireEvent.change(input, { target: { value: '/home/user/my-project' } });
    fireEvent.click(screen.getByTestId('step0-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-detection')).toBeInTheDocument());
    return utils;
  }

  it('shows platform rows after detection', async () => {
    await goToDetection();
    expect(screen.getByTestId('platform-row-claude')).toBeInTheDocument();
    expect(screen.getByTestId('platform-row-codex')).toBeInTheDocument();
    expect(screen.getByTestId('platform-row-copilot')).toBeInTheDocument();
  });

  it('claude checkbox is checked when claude detected', async () => {
    mockDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
    await goToDetection();
    const checkbox = screen.getByTestId('platform-checkbox-claude');
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('codex checkbox is unchecked when codex not detected', async () => {
    mockDetect.mockResolvedValue({ claude: '/usr/bin/claude' });
    await goToDetection();
    const checkbox = screen.getByTestId('platform-checkbox-codex');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('toggling a checkbox changes its state', async () => {
    await goToDetection();
    const checkbox = screen.getByTestId('platform-checkbox-claude') as HTMLInputElement;
    const wasChecked = checkbox.checked;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(!wasChecked);
  });

  it('shows error when no platform selected and Next clicked', async () => {
    mockDetect.mockResolvedValue({});
    await goToDetection();
    fireEvent.click(screen.getByTestId('step1-next-btn'));
    await waitFor(() => expect(screen.getByTestId('onboarding-error')).toBeInTheDocument());
  });

  it('advances to preview when at least one platform selected', async () => {
    await goToDetection();
    fireEvent.click(screen.getByTestId('step1-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-preview')).toBeInTheDocument());
  });
});

describe('Onboarding — Step 2: Preview', () => {
  async function goToPreview() {
    const utils = await renderOnboarding();
    const input = screen.getByTestId('project-root-input');
    fireEvent.change(input, { target: { value: '/home/user/my-project' } });
    fireEvent.click(screen.getByTestId('step0-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-detection')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('step1-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-preview')).toBeInTheDocument());
    return utils;
  }

  it('calls onboarding.preview with selected platforms', async () => {
    await goToPreview();
    expect(mockOnboardingPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/home/user/my-project',
        platforms: expect.objectContaining({ claude: true }),
      })
    );
  });

  it('shows apply button', async () => {
    await goToPreview();
    expect(screen.getByTestId('step2-apply-btn')).toBeInTheDocument();
  });

  it('shows cancel-platform button for platforms with plans', async () => {
    await goToPreview();
    expect(screen.getByTestId('cancel-platform-claude')).toBeInTheDocument();
  });

  it('cancelling and restoring a platform toggles the state', async () => {
    await goToPreview();
    fireEvent.click(screen.getByTestId('cancel-platform-claude'));
    await waitFor(() =>
      expect(screen.getByTestId('restore-platform-claude')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('restore-platform-claude'));
    await waitFor(() =>
      expect(screen.getByTestId('cancel-platform-claude')).toBeInTheDocument()
    );
  });

  it('advances to done step after apply', async () => {
    await goToPreview();
    fireEvent.click(screen.getByTestId('step2-apply-btn'));
    await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());
  });
});

describe('Onboarding — Step 4: Done', () => {
  async function goToDone() {
    const utils = await renderOnboarding();
    const input = screen.getByTestId('project-root-input');
    fireEvent.change(input, { target: { value: '/home/user/my-project' } });
    fireEvent.click(screen.getByTestId('step0-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-detection')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('step1-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('step2-apply-btn'));
    await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());
    return utils;
  }

  it('shows continue button', async () => {
    await goToDone();
    expect(screen.getByTestId('done-continue-btn')).toBeInTheDocument();
  });

  it('calls onComplete when continue is clicked', async () => {
    const { onComplete } = await goToDone();
    fireEvent.click(screen.getByTestId('done-continue-btn'));
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows apply error when onboarding.apply returns errors', async () => {
    mockOnboardingApply.mockResolvedValue({
      written: 0,
      skipped: 0,
      errors: { '.claude/settings.json': 'permission denied' },
    });
    await goToDone();
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });
});
