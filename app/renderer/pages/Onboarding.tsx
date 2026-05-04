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
import {
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  SkipForward,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Terminal,
  Code2,
  GitBranch,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { CliDetection, FileWritePlan, OnboardingResult } from '../../shared/ipc-contract';
import Stepper, { StepDef } from '../components/Stepper';
import FilePreview from '../components/FilePreview';
import ByanLogo from '../components/ByanLogo';

const STEPS: StepDef[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'detection', label: 'Detection' },
  { id: 'preview', label: 'Preview' },
  { id: 'apply', label: 'Apply' },
  { id: 'done', label: 'Done' },
];

interface OnboardingProps {
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

const PLATFORM_ICONS: Record<PlatformKey, LucideIcon> = {
  claude: Terminal,
  codex: Code2,
  copilot: GitBranch,
};

// Staggered animation delays for platform cards
const STAGGER_DELAYS = ['delay-0', 'delay-75', 'delay-150'];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [checkingSkip, setCheckingSkip] = useState(true);

  const [projectRoot, setProjectRoot] = useState('');
  const [detection, setDetection] = useState<CliDetection | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [platforms, setPlatforms] = useState<Record<PlatformKey, boolean>>({
    claude: false,
    codex: false,
    copilot: false,
  });

  const [plans, setPlans] = useState<FileWritePlan[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [cancelledPlatforms, setCancelledPlatforms] = useState<Set<PlatformKey>>(new Set());

  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<OnboardingResult | null>(null);

  const [error, setError] = useState('');

  // Clear stale error banners as soon as the user navigates between steps
  // or toggles a platform — keeps the current step's error contextually scoped.
  useEffect(() => {
    setError('');
  }, [step]);

  useEffect(() => {
    const check = async () => {
      try {
        setCheckingSkip(false);
      } catch {
        setCheckingSkip(false);
      }
    };
    void check();
  }, []);

  const handlePickFolder = async () => {
    setError('');
    try {
      const picked = await window.byanApi.fs.openProjectDialog();
      if (!picked) return;
      setProjectRoot(picked);

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
    setError('');
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
      // Distinguish "nothing to write" (preview returned []) from "user
      // cancelled every preview block" — both produce zero active plans
      // but the user-facing message differs.
      if (plans.length === 0) {
        setError('Nothing to write — the selected platforms are already configured.');
      } else {
        setError('All platforms were cancelled. Restore at least one to continue.');
      }
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

  const errorCount = applyResult ? Object.keys(applyResult.errors).length : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4 py-8">
      <div className="w-full max-w-2xl animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-md w-16 h-16 rounded-lg overflow-hidden bg-ink-900 border border-ink-800 flex items-center justify-center shadow-glow-sm">
            <ByanLogo size={56} />
          </div>
          <h1 className="font-h1 text-h1 text-ink-100 tracking-tight">Set up BYAN</h1>
          <p className="font-body-sm text-body-sm text-ink-400 mt-xs">First-run Setup</p>
        </div>

        {/* Stepper */}
        <Stepper steps={STEPS} currentStep={step} />

        {/* Main card */}
        <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden shadow-glass">
          <div className="p-8">
            {/* Error banner */}
            {error && (
              <div
                role="alert"
                data-testid="onboarding-error"
                className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-sm text-red-300"
              >
                <XCircle size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Step 0: Welcome */}
            {step === 0 && (
              <div data-testid="step-welcome" className="animate-fade-in-up">
                <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
                  Setup{' '}
                  <span className="text-gradient-primary">BYAN</span>
                </h2>
                <p className="text-sm text-ink-400 mb-8 leading-relaxed">
                  We will detect which AI platforms are installed, show you exactly what will be
                  written, and let you confirm before anything touches your project.
                </p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-ink-300 mb-2 uppercase tracking-[0.15em]">
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
                        className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs flex-shrink-0"
                        data-testid="pick-folder-btn"
                      >
                        <FolderOpen size={14} />
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={onComplete}
                      className="btn-ghost btn-sm flex items-center gap-1.5 text-ink-500"
                      data-testid="skip-onboarding-btn"
                    >
                      <SkipForward size={13} />
                      Skip for now
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStep0Next()}
                      className="btn-primary flex items-center gap-2 py-2.5 px-6"
                      data-testid="step0-next-btn"
                    >
                      Continue
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Detection */}
            {step === 1 && (
              <div data-testid="step-detection" className="animate-fade-in-up">
                <h2 className="text-xl font-bold text-white mb-1">Detected Platforms</h2>
                <p className="text-sm text-ink-400 mb-6">
                  Select the platforms you want to configure. Unchecked platforms will be skipped.
                </p>

                {detecting ? (
                  <div
                    className="flex items-center gap-3 py-8 justify-center text-ink-400 text-sm"
                    data-testid="detecting-spinner"
                  >
                    <Loader2 size={18} className="animate-spin text-byan-400" />
                    Detecting installed platforms...
                  </div>
                ) : (
                  <div className="space-y-3 mb-7">
                    {(['claude', 'codex', 'copilot'] as PlatformKey[]).map((key, i) => {
                      const binaryPath = detection?.[key];
                      const PlatformIcon = PLATFORM_ICONS[key];
                      const isChecked = platforms[key];
                      return (
                        <label
                          key={key}
                          className={[
                            'flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 hover-lift group',
                            STAGGER_DELAYS[i],
                            'animate-fade-in-up',
                            isChecked
                              ? 'border-byan-500/40 bg-byan-500/[0.07]'
                              : 'border-white/8 hover:border-white/15',
                          ].join(' ')}
                          data-testid={`platform-row-${key}`}
                        >
                          {/* Custom checkbox */}
                          <div className="flex-shrink-0 mt-0.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handlePlatformToggle(key)}
                              className="sr-only"
                              data-testid={`platform-checkbox-${key}`}
                            />
                            <div
                              className={[
                                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                                isChecked
                                  ? 'bg-byan-500 border-byan-500'
                                  : 'border-white/20 bg-white/5',
                              ].join(' ')}
                            >
                              {isChecked && (
                                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                                  <path
                                    d="M1 4L4 7L10 1"
                                    stroke="white"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </div>
                          </div>

                          {/* Platform icon */}
                          <div
                            className={[
                              'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border transition-all',
                              isChecked
                                ? 'bg-byan-500/20 border-byan-500/30 text-byan-300'
                                : 'bg-white/5 border-white/10 text-ink-400',
                            ].join(' ')}
                          >
                            <PlatformIcon size={16} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-white">
                                {PLATFORM_LABELS[key]}
                              </span>
                              {binaryPath ? (
                                <span className="badge badge-success">detected</span>
                              ) : (
                                <span className="badge badge-neutral">not found</span>
                              )}
                            </div>
                            {binaryPath && (
                              <p className="text-[10px] font-mono text-ink-500 mb-1 truncate">
                                {binaryPath}
                              </p>
                            )}
                            <p className="text-xs text-ink-500 leading-relaxed">
                              {PLATFORM_DESCRIPTIONS[key]}
                            </p>
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
                    className="btn-ghost btn-sm flex items-center gap-1.5 text-ink-500"
                    data-testid="skip-onboarding-btn"
                  >
                    <SkipForward size={13} />
                    Skip for now
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs"
                      data-testid="step1-back-btn"
                    >
                      <ArrowLeft size={13} />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStep1Next()}
                      disabled={detecting || previewing}
                      className="btn-primary flex items-center gap-2 py-2 px-5"
                      data-testid="step1-next-btn"
                    >
                      {previewing ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Computing...
                        </>
                      ) : (
                        <>
                          Preview changes
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Preview */}
            {step === 2 && (
              <div data-testid="step-preview" className="animate-fade-in-up">
                <h2 className="text-xl font-bold text-white mb-1">Preview Changes</h2>
                <p className="text-sm text-ink-400 mb-6">
                  Review each file before it is written. Nothing is written until you click Apply.
                </p>

                {(['claude', 'codex', 'copilot'] as PlatformKey[]).map((key) => {
                  const keyPlans = plansByPlatform(key);
                  if (keyPlans.length === 0) return null;
                  const cancelled = cancelledPlatforms.has(key);
                  const PlatformIcon = PLATFORM_ICONS[key];
                  return (
                    <div key={key} className="mb-5" data-testid={`preview-section-${key}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon size={14} className="text-byan-400" />
                          <h3 className="text-sm font-semibold text-white">
                            {PLATFORM_LABELS[key]}
                          </h3>
                          <span className="text-[10px] text-ink-500">
                            {keyPlans.length} {keyPlans.length === 1 ? 'file' : 'files'}
                          </span>
                        </div>
                        {cancelled ? (
                          <button
                            type="button"
                            onClick={() => handleRestorePlatform(key)}
                            className="flex items-center gap-1 text-xs text-byan-400 hover:text-byan-300 transition-colors"
                            data-testid={`restore-platform-${key}`}
                          >
                            <RotateCcw size={11} />
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCancelPlatform(key)}
                            className="flex items-center gap-1 text-xs text-ink-500 hover:text-red-400 transition-colors"
                            data-testid={`cancel-platform-${key}`}
                          >
                            <XCircle size={11} />
                            Cancel platform
                          </button>
                        )}
                      </div>
                      {cancelled ? (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-xs text-ink-500 italic">
                          <XCircle size={13} className="text-red-500/50" />
                          Cancelled — {PLATFORM_LABELS[key]} will not be configured.
                        </div>
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

                <div className="flex items-center justify-between pt-2 border-t border-white/8 mt-4">
                  <button
                    type="button"
                    onClick={onComplete}
                    className="btn-ghost btn-sm flex items-center gap-1.5 text-ink-500"
                    data-testid="skip-onboarding-btn"
                  >
                    <SkipForward size={13} />
                    Skip for now
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs"
                      data-testid="step2-back-btn"
                    >
                      <ArrowLeft size={13} />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStep2Apply()}
                      className="btn-primary flex items-center gap-2 py-2 px-6"
                      data-testid="step2-apply-btn"
                    >
                      Confirm & Apply
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Applying */}
            {step === 3 && (
              <div data-testid="step-applying" className="py-4">
                <h2 className="text-xl font-bold text-white mb-6">Applying Setup...</h2>
                {applying && (
                  <div
                    className="flex flex-col items-center gap-6"
                    data-testid="applying-spinner"
                  >
                    {/* Animated progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full stream-shimmer"
                        style={{ width: '60%' }}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-sm text-ink-400">
                      <Loader2 size={18} className="animate-spin text-byan-400" />
                      Writing files to your project...
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Done */}
            {step === 4 && (
              <div data-testid="step-done" className="animate-fade-in-up">
                {/* Big checkmark / error icon */}
                <div className="flex flex-col items-center py-4 mb-6">
                  {errorCount === 0 ? (
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center shadow-[0_0_48px_rgba(52,211,153,0.25)] animate-glow-pulse">
                        <CheckCircle2 size={40} className="text-emerald-400" strokeWidth={1.5} />
                      </div>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/40 flex items-center justify-center">
                      <AlertTriangle size={36} className="text-amber-400" strokeWidth={1.5} />
                    </div>
                  )}
                  <h2 className="text-2xl font-bold text-white mt-5 mb-1">
                    {errorCount === 0 ? 'All set.' : 'Setup done with warnings.'}
                  </h2>
                  <p className="text-sm text-ink-400 text-center">
                    BYAN is ready for your project.
                  </p>
                </div>

                {applyResult && (
                  <div className="space-y-4 mb-7">
                    {/* Stats row */}
                    <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/8">
                      <div className="flex-1 text-center">
                        <div className="text-2xl font-bold text-emerald-400">
                          {applyResult.written}
                        </div>
                        <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-0.5">
                          written
                        </div>
                      </div>
                      <div className="w-px bg-white/10" />
                      <div className="flex-1 text-center">
                        <div className="text-2xl font-bold text-ink-400">
                          {applyResult.skipped}
                        </div>
                        <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-0.5">
                          skipped
                        </div>
                      </div>
                      {errorCount > 0 && (
                        <>
                          <div className="w-px bg-white/10" />
                          <div className="flex-1 text-center">
                            <div className="text-2xl font-bold text-amber-400">{errorCount}</div>
                            <div className="text-[11px] text-ink-500 uppercase tracking-wider mt-0.5">
                              errors
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Error details */}
                    {errorCount > 0 && (
                      <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/25 text-xs">
                        <div className="flex items-center gap-2 text-amber-400 font-medium mb-2">
                          <AlertTriangle size={13} />
                          Some files could not be written:
                        </div>
                        {Object.entries(applyResult.errors).map(([filePath, msg]) => (
                          <div key={filePath} className="text-amber-300/80 font-mono mt-1">
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
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                  data-testid="done-continue-btn"
                >
                  Continue to BYAN
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-ink-500/60 mt-6 uppercase tracking-[0.2em]">
          Builder of YAN &middot; v1.0
        </p>
      </div>
    </div>
  );
}

