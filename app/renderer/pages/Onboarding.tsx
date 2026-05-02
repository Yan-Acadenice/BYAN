// Onboarding page — first-run setup for BYAN (3 platforms, 2 OS).
//
// Flow (5 steps):
//   0. Welcome      — intro, user picks project root
//   1. Detection    — shows detected platforms, checkboxes
//   2. Preview      — shows FileWritePlan[] per platform, cancel-per-platform
//   3. Apply        — executes writes with progress, partial errors
//   4. Done         — link to Login
//
// Skip: if _byan/config.yaml already present when page mounts, onAuthenticated
// is called immediately (parent App.tsx handles the redirect to /login).

import React, { useEffect, useState, useCallback } from 'react';
import type { CliDetection, FileWritePlan, OnboardingResult } from '../../shared/ipc-contract';
import Stepper, { StepDef } from '../components/Stepper';
import FilePreview from '../components/FilePreview';

const STEPS: StepDef[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'detection', label: 'Detection' },
  { id: 'preview', label: 'Preview' },
  { id: 'apply', label: 'Apply' },
  { id: 'done', label: 'Done' },
];

interface OnboardingProps {
  // Called when setup is finished or skipped — parent routes to Login.
  onComplete: () => void;
}

type PlatformKey = 'claude' | 'codex' | 'copilot';

const PLATFORM_LABELS: Record<PlatformKey, string> = {
  claude: 'Claude Code',
  codex: 'OpenAI Codex CLI',
  copilot: 'GitHub Copilot CLI',
};

const PLATFORM_DESCRIPTIONS: Record<PlatformKey, string> = {
  claude: 'Hooks, skills, MCP server, settings.json — wires Claude Code into the project.',
  codex: 'Skill prompts in .codex/prompts/ — enables BYAN agents in Codex CLI.',
  copilot: 'Agent stubs in .github/agents/ — enables BYAN agents in Copilot CLI.',
};

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [checkingSkip, setCheckingSkip] = useState(true);

  // Step 0: project root
  const [projectRoot, setProjectRoot] = useState('');

  // Step 1: detection
  const [detection, setDetection] = useState<CliDetection | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [platforms, setPlatforms] = useState<Record<PlatformKey, boolean>>({
    claude: false,
    codex: false,
    copilot: false,
  });

  // Step 2: preview
  const [plans, setPlans] = useState<FileWritePlan[]>([]);
  const [previewing, setPreviewing] = useState(false);
  // Per-platform cancellation (user can deselect a platform before applying)
  const [cancelledPlatforms, setCancelledPlatforms] = useState<Set<PlatformKey>>(new Set());

  // Step 3: apply
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<OnboardingResult | null>(null);

  // Error for current step
  const [error, setError] = useState('');

  // On mount: check if _byan/config.yaml already present — skip if so.
  useEffect(() => {
    const check = async () => {
      try {
        // We need a project root to check. Use the dialog to get one, but for the
        // skip detection we check CWD equivalent via a known relative path.
        // In Electron the app can read any absolute path; we start by trying cwd.
        // The user's project root is unknown at this point so we defer skip check
        // until after they pick a folder in step 0.
        // Here we only skip if window.byanApi.fs.pathExists is called with a
        // resolved path — but we have no project root yet.
        // Decision: skip detection happens in step 0 after the user picks a folder.
        setCheckingSkip(false);
      } catch {
        setCheckingSkip(false);
      }
    };
    void check();
  }, []);

  // Step 0: pick project root via dialog
  const handlePickFolder = async () => {
    setError('');
    try {
      const picked = await window.byanApi.fs.openProjectDialog();
      if (!picked) return;
      setProjectRoot(picked);

      // Immediately check if already configured
      const alreadyConfigured = await window.byanApi.fs.pathExists(
        picked + '/_byan/config.yaml'
      );
      if (alreadyConfigured) {
        onComplete();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open folder picker.');
    }
  };

  const handleManualPath = (v: string) => {
    setProjectRoot(v);
  };

  const handleStep0Next = async () => {
    if (!projectRoot.trim()) {
      setError('Please pick or enter a project folder.');
      return;
    }
    setError('');
    // Check if already configured
    try {
      const alreadyConfigured = await window.byanApi.fs.pathExists(
        projectRoot + '/_byan/config.yaml'
      );
      if (alreadyConfigured) {
        onComplete();
        return;
      }
    } catch {
      // pathExists failure is non-blocking — continue to detection
    }

    // Move to detection step
    setStep(1);
    setDetecting(true);
    try {
      const result = await window.byanApi.cli.detect();
      setDetection(result);
      setPlatforms({
        claude: !!result.claude,
        codex: !!result.codex,
        copilot: !!result.copilot,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed.');
    } finally {
      setDetecting(false);
    }
  };

  const handlePlatformToggle = (key: PlatformKey) => {
    setPlatforms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStep1Next = async () => {
    const anySelected = Object.values(platforms).some(Boolean);
    if (!anySelected) {
      setError('Select at least one platform, or skip onboarding.');
      return;
    }
    setError('');
    setPreviewing(true);
    try {
      const result = await window.byanApi.onboarding.preview({
        projectRoot,
        platforms,
      });
      setPlans(result);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCancelPlatform = (key: PlatformKey) => {
    setCancelledPlatforms((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleRestorePlatform = (key: PlatformKey) => {
    setCancelledPlatforms((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleStep2Apply = async () => {
    setError('');
    const activePlans = plans.filter((p) => !cancelledPlatforms.has(p.platform as PlatformKey));
    if (activePlans.length === 0) {
      setError('All platforms were cancelled. Select at least one to continue.');
      return;
    }
    setStep(3);
    setApplying(true);
    try {
      const result = await window.byanApi.onboarding.apply(activePlans);
      setApplyResult(result);
    } catch (err) {
      setApplyResult({
        written: 0,
        skipped: 0,
        errors: { '_apply': err instanceof Error ? err.message : 'Unknown error' },
      });
    } finally {
      setApplying(false);
      setStep(4);
    }
  };

  const plansByPlatform = useCallback(
    (key: PlatformKey) => plans.filter((p) => p.platform === key),
    [plans]
  );

  if (checkingSkip) return null;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Background decorations from Login pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-byan-600/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-[520px] h-[520px] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-grid-dark [background-size:36px_36px] opacity-60" />
      </div>

      <div className="relative w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-gradient shadow-glow-lg mb-5">
            <span className="text-white font-bold text-2xl tracking-tight">B</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gradient-primary">BYAN</h1>
          <p className="text-sm text-ink-400 mt-2">First-run Setup</p>
        </div>

        {/* Stepper */}
        <Stepper steps={STEPS} currentStep={step} />

        <div className="glass-card p-8 shadow-glass-lg">
          {/* Error banner */}
          {error && (
            <div
              role="alert"
              data-testid="onboarding-error"
              className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div data-testid="step-welcome">
              <h2 className="text-lg font-semibold text-white mb-1">Setup BYAN for the first time</h2>
              <p className="text-xs text-ink-400 mb-6">
                We will detect which AI platforms are installed, show you exactly what will be
                written, and let you confirm before anything touches your project.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-300 mb-1.5 uppercase tracking-wider">
                    Project folder
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectRoot}
                      onChange={(e) => handleManualPath(e.target.value)}
                      className="input flex-1"
                      placeholder="/home/user/my-project"
                      data-testid="project-root-input"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePickFolder()}
                      className="btn-secondary px-4 py-2 text-xs"
                      data-testid="pick-folder-btn"
                    >
                      Browse
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={onComplete}
                    className="text-xs text-ink-500 hover:text-ink-300 underline"
                    data-testid="skip-onboarding-btn"
                  >
                    Skip onboarding
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStep0Next()}
                    className="btn-primary py-2 px-6"
                    data-testid="step0-next-btn"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Detection */}
          {step === 1 && (
            <div data-testid="step-detection">
              <h2 className="text-lg font-semibold text-white mb-1">Platform Detection</h2>
              <p className="text-xs text-ink-400 mb-6">
                BYAN detected the following tools on your system. Check the platforms you want to
                configure. Unchecked platforms will be skipped.
              </p>

              {detecting ? (
                <p className="text-xs text-ink-400 animate-pulse" data-testid="detecting-spinner">
                  Detecting installed platforms...
                </p>
              ) : (
                <div className="space-y-3 mb-6">
                  {(['claude', 'codex', 'copilot'] as PlatformKey[]).map((key) => {
                    const binaryPath = detection?.[key];
                    return (
                      <label
                        key={key}
                        className="flex items-start gap-3 p-4 rounded-xl border border-white/10 hover:border-white/20 cursor-pointer transition-colors"
                        data-testid={`platform-row-${key}`}
                      >
                        <input
                          type="checkbox"
                          checked={platforms[key]}
                          onChange={() => handlePlatformToggle(key)}
                          className="mt-0.5"
                          data-testid={`platform-checkbox-${key}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">
                              {PLATFORM_LABELS[key]}
                            </span>
                            {binaryPath ? (
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                                detected
                              </span>
                            ) : (
                              <span className="text-[10px] text-ink-500 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                not found
                              </span>
                            )}
                          </div>
                          {binaryPath && (
                            <p className="text-[10px] font-mono text-ink-500 mt-0.5 truncate">
                              {binaryPath}
                            </p>
                          )}
                          <p className="text-xs text-ink-500 mt-1">{PLATFORM_DESCRIPTIONS[key]}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onComplete}
                  className="text-xs text-ink-500 hover:text-ink-300 underline"
                  data-testid="skip-onboarding-btn"
                >
                  Skip onboarding
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="btn-secondary py-2 px-4 text-xs"
                    data-testid="step1-back-btn"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStep1Next()}
                    disabled={detecting || previewing}
                    className="btn-primary py-2 px-6"
                    data-testid="step1-next-btn"
                  >
                    {previewing ? 'Computing preview...' : 'Preview changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div data-testid="step-preview">
              <h2 className="text-lg font-semibold text-white mb-1">Preview Changes</h2>
              <p className="text-xs text-ink-400 mb-5">
                Review each file before it is written. You can cancel individual platforms.
                Nothing is written until you click Apply.
              </p>

              {(['claude', 'codex', 'copilot'] as PlatformKey[]).map((key) => {
                const keyPlans = plansByPlatform(key);
                if (keyPlans.length === 0) return null;
                const cancelled = cancelledPlatforms.has(key);
                return (
                  <div key={key} className="mb-6" data-testid={`preview-section-${key}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">{PLATFORM_LABELS[key]}</h3>
                      {cancelled ? (
                        <button
                          type="button"
                          onClick={() => handleRestorePlatform(key)}
                          className="text-xs text-byan-400 hover:text-byan-300 underline"
                          data-testid={`restore-platform-${key}`}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCancelPlatform(key)}
                          className="text-xs text-ink-500 hover:text-red-400 underline"
                          data-testid={`cancel-platform-${key}`}
                        >
                          Cancel this platform
                        </button>
                      )}
                    </div>
                    {cancelled ? (
                      <p className="text-xs text-ink-500 italic px-2">
                        Cancelled — {PLATFORM_LABELS[key]} will not be configured.
                      </p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {keyPlans.map((plan) => (
                          <FilePreview key={plan.relPath} plan={plan} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={onComplete}
                  className="text-xs text-ink-500 hover:text-ink-300 underline"
                  data-testid="skip-onboarding-btn"
                >
                  Skip onboarding
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn-secondary py-2 px-4 text-xs"
                    data-testid="step2-back-btn"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStep2Apply()}
                    className="btn-primary py-2 px-6"
                    data-testid="step2-apply-btn"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Applying */}
          {step === 3 && (
            <div data-testid="step-applying">
              <h2 className="text-lg font-semibold text-white mb-4">Applying Setup...</h2>
              {applying ? (
                <p className="text-xs text-ink-400 animate-pulse" data-testid="applying-spinner">
                  Writing files to your project...
                </p>
              ) : null}
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div data-testid="step-done">
              <h2 className="text-lg font-semibold text-white mb-4">Setup Complete</h2>

              {applyResult && (
                <div className="space-y-3 mb-6">
                  <div className="flex gap-4 text-sm">
                    <div className="text-emerald-400">
                      <span className="font-bold">{applyResult.written}</span>
                      <span className="text-ink-400 ml-1">written</span>
                    </div>
                    <div className="text-ink-400">
                      <span className="font-bold">{applyResult.skipped}</span>
                      <span className="ml-1">skipped (already up to date)</span>
                    </div>
                  </div>

                  {Object.keys(applyResult.errors).length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                      <p className="text-amber-400 font-medium mb-2">
                        Some files could not be written:
                      </p>
                      {Object.entries(applyResult.errors).map(([filePath, msg]) => (
                        <div key={filePath} className="text-amber-300 font-mono">
                          {filePath}: {msg}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={onComplete}
                className="btn-primary py-2 px-6 w-full"
                data-testid="done-continue-btn"
              >
                Continue to BYAN
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-ink-500 mt-6 uppercase tracking-[0.2em]">
          Builder of YAN &middot; v1.0
        </p>
      </div>
    </div>
  );
}
