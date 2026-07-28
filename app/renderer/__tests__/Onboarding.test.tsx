// Onboarding.tsx component tests — Vitest + @testing-library/react + jsdom.
//
// Strategy: mock window.byanApi entirely. Tests drive the multi-step flow:
//   - Step 0 (Accueil)    → pick folder
//   - Step 1 (Détection)  → platform checkboxes
//   - Step 2 (Aperçu)     → counted summary, hoisted conflicts, selection
//   - Step 3 (Écriture)   → what is claimed while writing
//   - Step 4 (Bilan)      → written / already-up-to-date / conflicts kept
//
// The conflict tests are the load-bearing ones: a conflict written without the
// user ticking it destroys their work, so "not ticked is not sent" is asserted
// on the payload, not on the pixels.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Onboarding from '../pages/Onboarding';
import { diffLines, collapseUnchanged } from '../components/FilePreview';
import type {
  CliDetection,
  PreviewFileWritePlan,
  OnboardingApplyOpts,
  OnboardingResult,
} from '../../shared/ipc-contract';

// ---- window.byanApi mock ----

const mockDetect = vi.fn<() => Promise<CliDetection>>();
const mockPathExists = vi.fn<() => Promise<boolean>>();
const mockOpenProjectDialog = vi.fn<() => Promise<string | null>>();
const mockReadFile = vi.fn<(p: string) => Promise<string>>();
const mockOnboardingPreview = vi.fn<() => Promise<PreviewFileWritePlan[]>>();
const mockOnboardingApply =
  vi.fn<(plans: PreviewFileWritePlan[], opts?: OnboardingApplyOpts) => Promise<OnboardingResult>>();
const mockPlanContent = vi.fn<() => Promise<string>>();
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
      readFile: mockReadFile,
      pathExists: mockPathExists,
      mkdir: vi.fn(),
    },
    mcp: { list: vi.fn(), start: vi.fn(), stop: vi.fn(), status: vi.fn() },
    cli: { detect: mockDetect },
    onboarding: {
      preview: mockOnboardingPreview,
      apply: mockOnboardingApply,
      planContent: mockPlanContent,
    },
    server: { spawn: vi.fn(), stop: vi.fn(), status: vi.fn() },
    app: { quit: vi.fn(), version: vi.fn(), relaunch: vi.fn(), openExternal: vi.fn() },
    store: { get: mockStoreGet, set: mockStoreSet },
  };
}

// Plans are CONTENTLESS across the bridge — preview() strips the bodies and the
// renderer pulls them one at a time through planContent(). The fixtures mirror
// that shape so a test cannot pass on data the app never receives.
function plan(
  partial: Partial<PreviewFileWritePlan> & Pick<PreviewFileWritePlan, 'relPath' | 'action'>
): PreviewFileWritePlan {
  return {
    path: `/home/user/my-project/${partial.relPath}`,
    relPath: partial.relPath,
    description: partial.description ?? 'fichier de test',
    platform: partial.platform ?? 'claude',
    action: partial.action,
  };
}

const SETTINGS = '.claude/settings.json';

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
  mockReadFile.mockResolvedValue('ligne a\nMA VERSION\nligne c\n');
  mockPlanContent.mockResolvedValue('ligne a\nVERSION BYAN\nligne c\n');
  mockOnboardingPreview.mockResolvedValue([
    plan({ relPath: SETTINGS, action: 'create', description: 'Réglages Claude Code' }),
  ]);
  mockOnboardingApply.mockResolvedValue({ written: 1, skipped: 0, errors: {}, conflictsKept: 0 });
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

async function goToDetection(onComplete = vi.fn()) {
  const utils = await renderOnboarding(onComplete);
  fireEvent.change(screen.getByTestId('project-root-input'), {
    target: { value: '/home/user/my-project' },
  });
  fireEvent.click(screen.getByTestId('step0-next-btn'));
  await waitFor(() => expect(screen.getByTestId('step-detection')).toBeInTheDocument());
  return utils;
}

async function goToPreview(onComplete = vi.fn()) {
  const utils = await goToDetection(onComplete);
  fireEvent.click(screen.getByTestId('step1-next-btn'));
  await waitFor(() => expect(screen.getByTestId('step-preview')).toBeInTheDocument());
  return utils;
}

async function goToDone(onComplete = vi.fn()) {
  const utils = await goToPreview(onComplete);
  fireEvent.click(screen.getByTestId('step2-apply-btn'));
  await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());
  return utils;
}

// The count rendered inside one summary cell.
function summaryValue(testId: string): string {
  const cell = screen.getByTestId(testId);
  return cell.firstElementChild?.textContent?.trim() ?? '';
}

describe('Onboarding — Step 0: Accueil', () => {
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

  it('calls openProjectDialog when Parcourir is clicked', async () => {
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
    await goToDetection();
    expect(screen.getByTestId('step-detection')).toBeInTheDocument();
  });
});

describe('Onboarding — Step 1: Détection', () => {
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
    await goToPreview();
    expect(screen.getByTestId('step-preview')).toBeInTheDocument();
  });
});

describe('Onboarding — Step 2: Aperçu', () => {
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
    await goToDone();
    expect(screen.getByTestId('step-done')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The counted summary
// ---------------------------------------------------------------------------

const MIXED_PLANS: PreviewFileWritePlan[] = [
  plan({ relPath: SETTINGS, action: 'conflict', platform: 'claude' }),
  plan({ relPath: '.claude/hooks/a.js', action: 'conflict', platform: 'claude' }),
  plan({ relPath: '.claude/skills/b.md', action: 'update', platform: 'claude' }),
  plan({ relPath: '.claude/skills/c.md', action: 'create', platform: 'claude' }),
  plan({ relPath: '.claude/skills/d.md', action: 'create', platform: 'claude' }),
  plan({ relPath: '.claude/skills/e.md', action: 'create', platform: 'claude' }),
  plan({ relPath: '.claude/skills/f.md', action: 'skip', platform: 'claude' }),
];

describe('Onboarding — Aperçu: the counted summary', () => {
  beforeEach(() => {
    mockOnboardingPreview.mockResolvedValue(MIXED_PLANS);
  });

  it('counts the four categories from the plans', async () => {
    await goToPreview();
    expect(screen.getByTestId('preview-summary')).toBeInTheDocument();
    expect(summaryValue('summary-conflicts')).toBe('2');
    expect(summaryValue('summary-updates')).toBe('1');
    expect(summaryValue('summary-creations')).toBe('3');
    expect(summaryValue('summary-unchanged')).toBe('1');
  });

  it('labels each number with its role wording', async () => {
    await goToPreview();
    expect(screen.getByTestId('summary-conflicts')).toHaveTextContent('remplaçant ta version');
    expect(screen.getByTestId('summary-updates')).toHaveTextContent('à mettre à jour');
    expect(screen.getByTestId('summary-creations')).toHaveTextContent('à créer');
    expect(screen.getByTestId('summary-unchanged')).toHaveTextContent('inchangés');
  });

  it('drops a cancelled platform out of the counts', async () => {
    mockOnboardingPreview.mockResolvedValue([
      ...MIXED_PLANS,
      plan({ relPath: '.codex/prompts/x.md', action: 'create', platform: 'codex' }),
    ]);
    mockDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    await goToPreview();
    expect(summaryValue('summary-creations')).toBe('4');

    fireEvent.click(screen.getByTestId('cancel-platform-codex'));
    await waitFor(() => expect(summaryValue('summary-creations')).toBe('3'));
    // The conflicts belonged to claude, so they must be untouched by this.
    expect(summaryValue('summary-conflicts')).toBe('2');
  });

  it('shows a zero rather than hiding an empty category', async () => {
    mockOnboardingPreview.mockResolvedValue([
      plan({ relPath: SETTINGS, action: 'create' }),
    ]);
    await goToPreview();
    expect(summaryValue('summary-conflicts')).toBe('0');
    expect(summaryValue('summary-unchanged')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// The conflict block
// ---------------------------------------------------------------------------

describe('Onboarding — Aperçu: the conflict block', () => {
  beforeEach(() => {
    mockOnboardingPreview.mockResolvedValue(MIXED_PLANS);
  });

  it('hoists conflicts into their own block', async () => {
    await goToPreview();
    const block = screen.getByTestId('conflict-block');
    expect(within(block).getByTestId(`file-preview-${SETTINGS}`)).toBeInTheDocument();
    expect(within(block).getByTestId('file-preview-.claude/hooks/a.js')).toBeInTheDocument();
  });

  it('places the conflict block before the platform sections in the document', async () => {
    await goToPreview();
    const block = screen.getByTestId('conflict-block');
    const section = screen.getByTestId('preview-section-claude');
    // Node.DOCUMENT_POSITION_FOLLOWING (4) — the section comes after the block.
    expect(block.compareDocumentPosition(section) & 4).toBeTruthy();
  });

  it('does NOT repeat a conflict inside its platform section', async () => {
    await goToPreview();
    const section = screen.getByTestId('preview-section-claude');
    expect(within(section).queryByTestId(`file-preview-${SETTINGS}`)).toBeNull();
    // Non-conflict rows do stay in the section.
    expect(within(section).getByTestId('file-preview-.claude/skills/b.md')).toBeInTheDocument();
  });

  it('counts the hoisted conflicts in the platform header instead of dropping them', async () => {
    await goToPreview();
    const section = screen.getByTestId('preview-section-claude');
    expect(section).toHaveTextContent('5 fichiers');
    expect(section).toHaveTextContent('2 en conflit, en tête');
  });

  it('stops claiming conflicts are hoisted once the platform is cancelled', async () => {
    await goToPreview();
    fireEvent.click(screen.getByTestId('cancel-platform-claude'));
    await waitFor(() => expect(screen.queryByTestId('conflict-block')).toBeNull());
    // They are no longer up there, so the header must not say they are.
    const section = screen.getByTestId('preview-section-claude');
    expect(section).not.toHaveTextContent('en conflit, en tête');
    expect(section).toHaveTextContent('7 fichiers');
  });

  it('leaves every conflict checkbox unticked by default', async () => {
    await goToPreview();
    expect((screen.getByTestId(`file-select-${SETTINGS}`) as HTMLInputElement).checked).toBe(false);
    expect(
      (screen.getByTestId('file-select-.claude/hooks/a.js') as HTMLInputElement).checked
    ).toBe(false);
  });

  it('gives no checkbox to a non-conflict row', async () => {
    await goToPreview();
    expect(screen.queryByTestId('file-select-.claude/skills/b.md')).toBeNull();
  });

  it('renders no conflict block when nothing conflicts', async () => {
    mockOnboardingPreview.mockResolvedValue([plan({ relPath: SETTINGS, action: 'create' })]);
    await goToPreview();
    expect(screen.queryByTestId('conflict-block')).toBeNull();
  });

  it('tout remplacer ticks every conflict, tout conserver unticks them again', async () => {
    await goToPreview();
    fireEvent.click(screen.getByTestId('conflict-accept-all'));
    await waitFor(() =>
      expect((screen.getByTestId(`file-select-${SETTINGS}`) as HTMLInputElement).checked).toBe(true)
    );
    expect(screen.getByTestId('conflict-accepted-count')).toHaveTextContent('2 sur 2');

    fireEvent.click(screen.getByTestId('conflict-keep-all'));
    await waitFor(() =>
      expect((screen.getByTestId(`file-select-${SETTINGS}`) as HTMLInputElement).checked).toBe(false)
    );
    expect(screen.getByTestId('conflict-accepted-count')).toHaveTextContent('0 sur 2');
  });
});

// ---------------------------------------------------------------------------
// What reaches apply() — the part that can destroy the user's work
// ---------------------------------------------------------------------------

describe('Onboarding — the acceptedConflicts payload', () => {
  beforeEach(() => {
    mockOnboardingPreview.mockResolvedValue(MIXED_PLANS);
  });

  it('sends an empty acceptedConflicts list when the user ticked nothing', async () => {
    await goToDone();
    const [, opts] = mockOnboardingApply.mock.calls[0];
    expect(opts).toEqual({ acceptedConflicts: [] });
  });

  it('still sends the untouched conflict in the plans, so main can count it kept', async () => {
    await goToDone();
    const [sentPlans] = mockOnboardingApply.mock.calls[0];
    expect(sentPlans.map((p) => p.relPath)).toContain(SETTINGS);
  });

  it('sends only the conflict the user ticked', async () => {
    await goToPreview();
    fireEvent.click(screen.getByTestId(`file-select-${SETTINGS}`));
    await waitFor(() =>
      expect((screen.getByTestId(`file-select-${SETTINGS}`) as HTMLInputElement).checked).toBe(true)
    );
    fireEvent.click(screen.getByTestId('step2-apply-btn'));
    await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());

    const [, opts] = mockOnboardingApply.mock.calls[0];
    expect(opts).toEqual({ acceptedConflicts: [`claude ${SETTINGS}`] });
  });

  it('unticking a conflict removes it from the payload again', async () => {
    await goToPreview();
    const box = screen.getByTestId(`file-select-${SETTINGS}`);
    fireEvent.click(box);
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true));
    fireEvent.click(box);
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(false));

    fireEvent.click(screen.getByTestId('step2-apply-btn'));
    await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());
    const [, opts] = mockOnboardingApply.mock.calls[0];
    expect(opts).toEqual({ acceptedConflicts: [] });
  });

  it('never authorises a conflict whose platform was cancelled after it was ticked', async () => {
    mockDetect.mockResolvedValue({ claude: '/usr/bin/claude', codex: '/usr/bin/codex' });
    mockOnboardingPreview.mockResolvedValue([
      plan({ relPath: SETTINGS, action: 'conflict', platform: 'claude' }),
      plan({ relPath: '.codex/prompts/x.md', action: 'create', platform: 'codex' }),
    ]);
    await goToPreview();
    fireEvent.click(screen.getByTestId(`file-select-${SETTINGS}`));
    await waitFor(() =>
      expect((screen.getByTestId(`file-select-${SETTINGS}`) as HTMLInputElement).checked).toBe(true)
    );
    // Change of mind: the whole platform goes.
    fireEvent.click(screen.getByTestId('cancel-platform-claude'));
    await waitFor(() => expect(screen.queryByTestId('conflict-block')).toBeNull());

    fireEvent.click(screen.getByTestId('step2-apply-btn'));
    await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());
    const [sentPlans, opts] = mockOnboardingApply.mock.calls[0];
    expect(opts).toEqual({ acceptedConflicts: [] });
    expect(sentPlans.map((p) => p.relPath)).toEqual(['.codex/prompts/x.md']);
  });

  it('drops stale authorisations when the preview is recomputed', async () => {
    await goToPreview();
    fireEvent.click(screen.getByTestId('conflict-accept-all'));
    await waitFor(() =>
      expect(screen.getByTestId('conflict-accepted-count')).toHaveTextContent('2 sur 2')
    );
    // Back to detection and forward again: a new preview, so a new decision.
    fireEvent.click(screen.getByTestId('step2-back-btn'));
    await waitFor(() => expect(screen.getByTestId('step-detection')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('step1-next-btn'));
    await waitFor(() => expect(screen.getByTestId('step-preview')).toBeInTheDocument());

    expect(screen.getByTestId('conflict-accepted-count')).toHaveTextContent('0 sur 2');
  });
});

// ---------------------------------------------------------------------------
// The conflict diff
// ---------------------------------------------------------------------------

describe('Onboarding — consulting the difference on a conflict', () => {
  beforeEach(() => {
    mockOnboardingPreview.mockResolvedValue([
      plan({ relPath: SETTINGS, action: 'conflict', platform: 'claude' }),
    ]);
  });

  it('reads both sides and shows what each contributes', async () => {
    await goToPreview();
    const row = screen.getByTestId(`file-preview-${SETTINGS}`);
    fireEvent.click(within(row).getByRole('button'));

    await waitFor(() => expect(screen.getByTestId(`file-diff-${SETTINGS}`)).toBeInTheDocument());
    const diff = screen.getByTestId(`file-diff-${SETTINGS}`);
    // The user's version comes from disk...
    expect(mockReadFile).toHaveBeenCalledWith(`/home/user/my-project/${SETTINGS}`);
    // ...and BYAN's from the templates.
    expect(mockPlanContent).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'claude', relPath: SETTINGS })
    );
    expect(diff).toHaveTextContent('MA VERSION');
    expect(diff).toHaveTextContent('VERSION BYAN');
    expect(diff).toHaveTextContent('ta version');
    expect(diff).toHaveTextContent('la version BYAN');
  });

  it('states that the modification date is unknown instead of inventing one', async () => {
    await goToPreview();
    expect(screen.getByTestId(`file-preview-${SETTINGS}`)).toHaveTextContent(
      'date de ta modification inconnue'
    );
  });

  it('falls back to the BYAN body when the user version cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('EACCES'));
    await goToPreview();
    const row = screen.getByTestId(`file-preview-${SETTINGS}`);
    fireEvent.click(within(row).getByRole('button'));
    // No diff is possible, but the write is still shown rather than nothing.
    await waitFor(() => expect(row).toHaveTextContent('VERSION BYAN'));
    expect(screen.queryByTestId(`file-diff-${SETTINGS}`)).toBeNull();
  });
});

describe('the line diff engine', () => {
  it('marks a replaced line as one removal and one addition', () => {
    const ops = diffLines('a\nb\nc', 'a\nB\nc');
    expect(ops).not.toBeNull();
    expect(ops).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('reports a pure insertion without inventing a removal', () => {
    const ops = diffLines('a\nc', 'a\nb\nc');
    expect(ops).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'add', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('reports a pure deletion', () => {
    const ops = diffLines('a\nb\nc', 'a\nc');
    expect(ops).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('finds a small edit inside a large file (head/tail trim)', () => {
    const before = Array.from({ length: 5000 }, (_, i) => `l${i}`).join('\n');
    const after = before.replace('l2500', 'EDITED');
    const ops = diffLines(before, after);
    expect(ops).not.toBeNull();
    expect(ops!.filter((o) => o.kind !== 'same')).toEqual([
      { kind: 'del', text: 'l2500' },
      { kind: 'add', text: 'EDITED' },
    ]);
  });

  it('gives up rather than grinding when both sides diverge past the cap', () => {
    const before = Array.from({ length: 1400 }, (_, i) => `x${i}`).join('\n');
    const after = Array.from({ length: 1400 }, (_, i) => `y${i}`).join('\n');
    expect(diffLines(before, after)).toBeNull();
  });

  it('collapses unchanged stretches into a counted marker', () => {
    const before = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n');
    const after = before.replace('l20', 'EDITED');
    const rows = collapseUnchanged(diffLines(before, after)!);
    const gaps = rows.filter((r) => r.kind === 'gap');
    expect(gaps).toHaveLength(2);
    // Nothing is silently dropped: the gaps plus the shown rows account for
    // every line of both sides.
    const shown = rows.filter((r) => r.kind !== 'gap').length;
    const hidden = gaps.reduce((sum, g) => sum + (g as { count: number }).count, 0);
    expect(shown + hidden).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// Step 3 — what the screen claims while writing
// ---------------------------------------------------------------------------

describe('Onboarding — Step 3: Écriture', () => {
  it('claims no progress fraction it did not measure', async () => {
    let release: (r: OnboardingResult) => void = () => {};
    mockOnboardingApply.mockImplementation(
      () => new Promise<OnboardingResult>((res) => { release = res; })
    );
    mockOnboardingPreview.mockResolvedValue(MIXED_PLANS);
    await goToPreview();
    fireEvent.click(screen.getByTestId('step2-apply-btn'));
    await waitFor(() => expect(screen.getByTestId('step-applying')).toBeInTheDocument());

    const applying = screen.getByTestId('step-applying');
    // The defect this replaces: a bar hardcoded at width:'60%' with a sweeping
    // animation, identical on the first file and the last.
    expect(applying.innerHTML).not.toContain('60%');
    expect(applying.innerHTML).not.toContain('stream-shimmer');
    // What it does say is a real count of what was sent to be written.
    expect(applying).toHaveTextContent('7 fichiers');

    release({ written: 7, skipped: 0, errors: {}, conflictsKept: 0 });
    await waitFor(() => expect(screen.getByTestId('step-done')).toBeInTheDocument());
  });
});

describe('Onboarding — Step 4: Bilan', () => {
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
      conflictsKept: 0,
      errors: { '.claude/settings.json': 'permission denied' },
    });
    await goToDone();
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it('persists onboarding.projectRoot to store after successful apply', async () => {
    await goToDone();
    // store.set must have been called with the key 'onboarding.projectRoot' and the path.
    expect(mockStoreSet).toHaveBeenCalledWith(
      'onboarding.projectRoot',
      '/home/user/my-project'
    );
  });

  it('does NOT persist onboarding.projectRoot when apply throws', async () => {
    mockOnboardingApply.mockRejectedValueOnce(new Error('disk full'));
    await goToDone();
    // On apply failure the store.set for projectRoot must not be called.
    const projectRootCalls = (mockStoreSet.mock.calls as unknown[][]).filter(
      (c) => c[0] === 'onboarding.projectRoot'
    );
    expect(projectRootCalls).toHaveLength(0);
  });

  it('reports conflictsKept as its own number, never merged into skipped', async () => {
    mockOnboardingApply.mockResolvedValue({
      written: 4,
      skipped: 1,
      conflictsKept: 2,
      errors: {},
    });
    await goToDone();
    expect(screen.getByTestId('done-written')).toHaveTextContent('4');
    // The proof it is not merged: skipped stays 1, not 3.
    expect(screen.getByTestId('done-skipped')).toHaveTextContent('1');
    expect(screen.getByTestId('done-conflicts-kept')).toHaveTextContent('2');
  });

  it('says what conflictsKept means, so the number does not read as a failure', async () => {
    mockOnboardingApply.mockResolvedValue({
      written: 0,
      skipped: 0,
      conflictsKept: 2,
      errors: {},
    });
    await goToDone();
    const note = screen.getByTestId('done-conflicts-kept-note');
    expect(note).toHaveTextContent('tes versions sont toujours là');
    expect(note).toHaveTextContent(/n'est pas une erreur|n’est pas une erreur/);
  });

  it('does not claim "nothing to do" when conflicts were deliberately kept', async () => {
    mockOnboardingApply.mockResolvedValue({
      written: 0,
      skipped: 0,
      conflictsKept: 3,
      errors: {},
    });
    await goToDone();
    expect(screen.queryByText(/Rien à faire/)).toBeNull();
  });

  it('omits the conflictsKept cell when there were none', async () => {
    await goToDone();
    expect(screen.queryByTestId('done-conflicts-kept')).toBeNull();
    expect(screen.queryByTestId('done-conflicts-kept-note')).toBeNull();
  });
});
