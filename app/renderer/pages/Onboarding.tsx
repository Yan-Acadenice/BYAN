// Onboarding page — first-run setup for BYAN (3 platforms, 2 OS).
//
// Flow (5 steps):
//   0. Accueil    — intro, the user picks the project folder
//   1. Détection  — detected platforms, checkboxes
//   2. Aperçu     — counted summary, conflicts hoisted, then the per-platform lists
//   3. Écriture   — the writes run
//   4. Bilan      — what happened, including the conflicts left alone
//
// Skip: if _byan/config.yaml already present when page mounts, onComplete is
// called immediately (parent App.tsx handles the redirect to /login).

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import type { CliDetection, PreviewFileWritePlan, OnboardingResult } from '../../shared/ipc-contract';
import Stepper, { StepDef } from '../components/Stepper';
import FilePreview from '../components/FilePreview';
import ByanLogo from '../components/ByanLogo';
import { useAppVersion, formatVersion } from '../hooks/useAppVersion';

const STEPS: StepDef[] = [
  { id: 'welcome', label: 'Accueil' },
  { id: 'detection', label: 'Détection' },
  { id: 'preview', label: 'Aperçu' },
  { id: 'apply', label: 'Écriture' },
  { id: 'done', label: 'Bilan' },
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
  claude: 'Hooks, skills, serveur MCP, settings.json — branche Claude Code sur ton projet.',
  codex: 'Prompts de skills dans .codex/prompts/ — active les agents BYAN dans Codex CLI.',
  copilot: 'Ébauches d\'agents dans .github/agents/ — active les agents BYAN dans Copilot CLI.',
};

const PLATFORM_ICONS: Record<PlatformKey, LucideIcon> = {
  claude: Terminal,
  codex: Code2,
  copilot: GitBranch,
};

const PLATFORM_ORDER: PlatformKey[] = ['claude', 'codex', 'copilot'];

// Staggered animation delays for platform cards
const STAGGER_DELAYS = ['delay-0', 'delay-75', 'delay-150'];

// The key main uses to decide whether an overwrite was authorised. Same shape on
// both sides of the bridge, and exact — a loose match would be a way past the gate.
function conflictKey(plan: PreviewFileWritePlan): string {
  return `${plan.platform} ${plan.relPath}`;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  // A version literal cannot stay true; read the running binary.
  const appVersion = useAppVersion();
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

  // Contentless by design: preview strips file bodies before they cross IPC.
  const [plans, setPlans] = useState<PreviewFileWritePlan[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [cancelledPlatforms, setCancelledPlatforms] = useState<Set<PlatformKey>>(new Set());

  // Conflicts the user explicitly authorised us to overwrite. Starts EMPTY and
  // stays empty until they tick a box: the safe default is keeping their work,
  // so the default has to be the one that does nothing.
  const [acceptedConflicts, setAcceptedConflicts] = useState<Set<string>>(new Set());

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
      setError(err instanceof Error ? err.message : 'Impossible d\'ouvrir le sélecteur de dossier.');
    }
  };

  const handleManualPath = (v: string) => {
    setProjectRoot(v);
  };

  const handleStep0Next = async () => {
    if (!projectRoot.trim()) {
      setError('Choisis ou saisis un dossier de projet.');
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
      setError(err instanceof Error ? err.message : 'La détection a échoué.');
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
      setError('Sélectionne au moins une plateforme, ou passe cette étape.');
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
      // A fresh preview invalidates every previous authorisation: the plans may
      // no longer be the same files, and an accepted key that survived would
      // authorise an overwrite the user never saw.
      setAcceptedConflicts(new Set());
      // If the installers have nothing to do (every selected platform is
      // already configured), skip Preview + Apply and jump straight to
      // Done with an "already configured" summary. Otherwise the user
      // would land on an empty Preview screen with no way forward.
      if (result.length === 0) {
        setApplyResult({ written: 0, skipped: 0, errors: {}, conflictsKept: 0 });
        setStep(4);
      } else {
        setStep(2);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'L\'aperçu a échoué.');
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

  // Only the platforms still in play. Everything the preview screen counts and
  // everything apply() receives is derived from this one list, so a cancelled
  // platform cannot linger in a total or in an authorisation.
  const activePlans = useMemo(
    () => plans.filter((p) => !cancelledPlatforms.has(p.platform as PlatformKey)),
    [plans, cancelledPlatforms]
  );

  const conflictPlans = useMemo(
    () => activePlans.filter((p) => p.action === 'conflict'),
    [activePlans]
  );

  // The four numbers of the summary. Counted, never estimated.
  const counts = useMemo(() => {
    let conflicts = 0;
    let updates = 0;
    let creations = 0;
    let unchanged = 0;
    for (const plan of activePlans) {
      if (plan.action === 'conflict') conflicts += 1;
      else if (plan.action === 'update') updates += 1;
      else if (plan.action === 'create') creations += 1;
      else unchanged += 1;
    }
    return { conflicts, updates, creations, unchanged };
  }, [activePlans]);

  const handleToggleConflict = useCallback((plan: PreviewFileWritePlan, next: boolean) => {
    const key = conflictKey(plan);
    setAcceptedConflicts((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  }, []);

  const handleAcceptAllConflicts = () => {
    setAcceptedConflicts(new Set(conflictPlans.map(conflictKey)));
  };

  const handleKeepAllConflicts = () => {
    setAcceptedConflicts(new Set());
  };

  const handleStep2Apply = async () => {
    setError('');
    if (activePlans.length === 0) {
      // Distinguish "nothing to write" (preview returned []) from "user
      // cancelled every preview block" — both produce zero active plans
      // but the user-facing message differs.
      if (plans.length === 0) {
        setError('Rien à écrire — les plateformes sélectionnées sont déjà configurées.');
      } else {
        setError('Toutes les plateformes sont annulées. Restaure-en au moins une pour continuer.');
      }
      return;
    }
    // Derived from the conflicts still on screen, never from the raw set: a key
    // whose platform was cancelled, or whose plan stopped being a conflict, is
    // dropped here instead of travelling as an authorisation.
    const accepted = conflictPlans
      .map(conflictKey)
      .filter((key) => acceptedConflicts.has(key));
    setStep(3);
    setApplying(true);
    try {
      const result = await window.byanApi.onboarding.apply(activePlans, {
        acceptedConflicts: accepted,
      });
      setApplyResult(result);
      // Persist the project root so App.tsx can skip onboarding on next launch.
      // Done after apply so a failed apply doesn't mark the project as configured.
      try {
        await window.byanApi.store.set('onboarding.projectRoot', projectRoot);
        // Record the local folder in ~/.byan/projects.json so Projects /
        // ProjectDetail can show it (F6). Best-effort ; name = folder basename.
        const folderName = projectRoot.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || projectRoot;
        await window.byanApi.projectsLocal?.record?.({ name: folderName, path: projectRoot });
      } catch {
        // Non-critical — worst case: onboarding shows again next launch.
      }
    } catch (err) {
      setApplyResult({
        written: 0,
        skipped: 0,
        conflictsKept: 0,
        errors: { '_apply': err instanceof Error ? err.message : 'Erreur inconnue' },
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

  const fetchTemplate = useCallback(
    (p: PreviewFileWritePlan) =>
      window.byanApi.onboarding.planContent({
        projectRoot,
        platform: p.platform,
        relPath: p.relPath,
      }),
    [projectRoot]
  );

  // The user's own version, read straight from disk. This is the half of the
  // comparison that makes a conflict decidable.
  const fetchCurrent = useCallback(
    (p: PreviewFileWritePlan) => window.byanApi.fs.readFile(p.path),
    []
  );

  if (checkingSkip) return null;

  const errorCount = applyResult ? Object.keys(applyResult.errors).length : 0;
  const conflictsKept = applyResult?.conflictsKept ?? 0;
  const acceptedCount = conflictPlans.filter((p) => acceptedConflicts.has(conflictKey(p))).length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page px-4 py-8">
      <div className="w-full max-w-2xl animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="mb-md w-16 h-16 rounded-lg overflow-hidden bg-surface-card border border-edge-strong flex items-center justify-center">
            <ByanLogo size={56} />
          </div>
          <h1 className="font-h1 text-h1 text-content-strong tracking-tight">Installer BYAN</h1>
          <p className="font-body-sm text-body-sm text-content-secondary mt-xs">
            Première installation
          </p>
        </div>

        {/* Stepper */}
        <Stepper steps={STEPS} currentStep={step} />

        {/* Main card */}
        <div className="bg-surface-card border border-edge-subtle rounded-2xl overflow-hidden shadow-glass">
          <div className="p-8">
            {/* Error banner */}
            {error && (
              <div
                role="alert"
                data-testid="onboarding-error"
                className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-wash-danger border border-edge-danger text-sm text-on-wash-danger"
              >
                <XCircle size={16} className="flex-shrink-0 mt-0.5 text-accent-danger" />
                <span>{error}</span>
              </div>
            )}

            {/* Step 0: Accueil */}
            {step === 0 && (
              <div data-testid="step-welcome" className="animate-fade-in-up">
                <h2 className="font-h1 text-2xl font-semibold tracking-tight text-content-strong mb-2">
                  Installer <span className="text-gradient-primary">BYAN</span>
                </h2>
                <p className="text-sm text-content-secondary mb-8 leading-relaxed">
                  On détecte les plateformes IA installées chez toi, on te montre exactement ce
                  qui sera écrit, et rien ne touche ton projet avant que tu confirmes.
                </p>

                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="onboarding-project-root"
                      className="block text-xs font-semibold text-content-secondary mb-2 uppercase tracking-[0.15em]"
                    >
                      Dossier du projet
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="onboarding-project-root"
                        type="text"
                        value={projectRoot}
                        onChange={(e) => handleManualPath(e.target.value)}
                        className="input flex-1"
                        placeholder="/home/moi/mon-projet"
                        data-testid="project-root-input"
                      />
                      <button
                        type="button"
                        onClick={() => void handlePickFolder()}
                        className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs flex-shrink-0"
                        data-testid="pick-folder-btn"
                      >
                        <FolderOpen size={14} />
                        Parcourir
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={onComplete}
                      className="btn-ghost btn-sm flex items-center gap-1.5"
                      data-testid="skip-onboarding-btn"
                    >
                      <SkipForward size={13} />
                      Passer pour l&apos;instant
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStep0Next()}
                      className="btn-primary flex items-center gap-2 py-2.5 px-6"
                      data-testid="step0-next-btn"
                    >
                      Continuer
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Détection */}
            {step === 1 && (
              <div data-testid="step-detection" className="animate-fade-in-up">
                <h2 className="font-h1 text-xl font-semibold text-content-strong mb-1">
                  Plateformes détectées
                </h2>
                <p className="text-sm text-content-secondary mb-6">
                  Choisis celles que tu veux configurer. Les autres seront laissées de côté.
                </p>

                {detecting ? (
                  <div
                    className="flex items-center gap-3 py-8 justify-center text-content-secondary text-sm"
                    data-testid="detecting-spinner"
                  >
                    <Loader2 size={18} className="animate-spin text-accent-action" />
                    Détection des plateformes installées...
                  </div>
                ) : (
                  <div className="space-y-3 mb-7">
                    {PLATFORM_ORDER.map((key, i) => {
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
                              ? 'border-edge-action bg-wash-action'
                              : 'border-edge-subtle hover:border-edge-strong',
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
                                  ? 'bg-accent-action border-accent-action'
                                  : 'border-edge-strong bg-white/5',
                              ].join(' ')}
                            >
                              {isChecked && (
                                <svg
                                  width="11"
                                  height="9"
                                  viewBox="0 0 11 9"
                                  fill="none"
                                  className="text-on-accent"
                                >
                                  <path
                                    d="M1 4L4 7L10 1"
                                    stroke="currentColor"
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
                                ? 'bg-wash-action border-edge-action text-on-wash-action'
                                : 'bg-white/5 border-edge-subtle text-content-secondary',
                            ].join(' ')}
                          >
                            <PlatformIcon size={16} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-content-strong">
                                {PLATFORM_LABELS[key]}
                              </span>
                              {binaryPath ? (
                                <span className="badge badge-success">détectée</span>
                              ) : (
                                <span className="badge badge-neutral">introuvable</span>
                              )}
                            </div>
                            {binaryPath && (
                              <p className="text-[10px] font-mono text-content-tertiary mb-1 truncate">
                                {binaryPath}
                              </p>
                            )}
                            <p className="text-xs text-content-tertiary leading-relaxed">
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
                    className="btn-ghost btn-sm flex items-center gap-1.5"
                    data-testid="skip-onboarding-btn"
                  >
                    <SkipForward size={13} />
                    Passer pour l&apos;instant
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs"
                      data-testid="step1-back-btn"
                    >
                      <ArrowLeft size={13} />
                      Retour
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
                          Calcul...
                        </>
                      ) : (
                        <>
                          Voir les changements
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Aperçu */}
            {step === 2 && (
              <div data-testid="step-preview" className="animate-fade-in-up">
                <h2 className="font-h1 text-xl font-semibold text-content-strong mb-1">
                  Aperçu des changements
                </h2>
                <p className="text-sm text-content-secondary mb-5">
                  Relis chaque fichier avant qu&apos;il soit écrit. Rien n&apos;est écrit avant
                  que tu appliques.
                </p>

                {/* The counted summary. Four numbers, one colour each, in order of
                    consequence: what you lose, what changes, what appears, what
                    stays. Every number is a count of the plans below, so the
                    summary cannot drift from the list — including when a platform
                    is cancelled. */}
                <div
                  data-testid="preview-summary"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 mb-6 rounded-2xl bg-surface-raised border border-edge-subtle"
                >
                  <SummaryCount
                    testId="summary-conflicts"
                    value={counts.conflicts}
                    label="remplaçant ta version"
                    valueClass="text-accent-danger"
                    labelClass="text-accent-danger"
                  />
                  <SummaryCount
                    testId="summary-updates"
                    value={counts.updates}
                    label="à mettre à jour"
                    valueClass="text-accent-change"
                    labelClass="text-accent-change"
                  />
                  <SummaryCount
                    testId="summary-creations"
                    value={counts.creations}
                    label="à créer"
                    valueClass="text-accent-action"
                    labelClass="text-accent-action"
                  />
                  {/* The silent tier: the count sits below the readability floor
                      on purpose (it is the "nothing to see" number), the label
                      stays at the floor because it is still a word to read. */}
                  <SummaryCount
                    testId="summary-unchanged"
                    value={counts.unchanged}
                    label="inchangés"
                    valueClass="text-content-muted"
                    labelClass="text-content-tertiary"
                  />
                </div>

                {/* Conflicts, hoisted out of the lists and placed first. These are
                    the only files whose write destroys something the user made, so
                    they do not get to be one row among a thousand. */}
                {conflictPlans.length > 0 && (
                  <div
                    data-testid="conflict-block"
                    className="mb-6 rounded-2xl border border-edge-danger bg-wash-danger overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-edge-danger">
                      <div className="flex items-start gap-2.5">
                        <ShieldAlert size={16} className="flex-shrink-0 mt-0.5 text-accent-danger" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-h1 text-sm font-semibold text-content-strong">
                            {conflictPlans.length === 1
                              ? '1 fichier porte tes propres modifications'
                              : `${conflictPlans.length} fichiers portent tes propres modifications`}
                          </h3>
                          <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                            Tu les as édités depuis notre dernière écriture. Décoché, ton
                            fichier reste tel quel. Coché, la version BYAN l&apos;écrase et ton
                            travail est perdu. Ouvre une ligne pour comparer les deux versions.
                          </p>
                        </div>
                      </div>
                      {conflictPlans.length > 1 && (
                        <div className="flex items-center gap-3 mt-3 pl-[26px]">
                          <button
                            type="button"
                            onClick={handleKeepAllConflicts}
                            className="text-xs text-content-secondary hover:text-content-strong transition-colors"
                            data-testid="conflict-keep-all"
                          >
                            Tout conserver
                          </button>
                          <span className="text-content-muted">·</span>
                          <button
                            type="button"
                            onClick={handleAcceptAllConflicts}
                            className="text-xs text-on-wash-danger hover:brightness-110 transition-all"
                            data-testid="conflict-accept-all"
                          >
                            Tout remplacer
                          </button>
                          <span
                            className="text-xs text-content-tertiary ml-auto"
                            data-testid="conflict-accepted-count"
                          >
                            {acceptedCount} sur {conflictPlans.length} à remplacer
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 max-h-72 overflow-y-auto">
                      {conflictPlans.map((plan) => (
                        <FilePreview
                          key={conflictKey(plan)}
                          plan={plan}
                          fetchContent={fetchTemplate}
                          fetchCurrent={fetchCurrent}
                          selected={acceptedConflicts.has(conflictKey(plan))}
                          onToggleSelected={handleToggleConflict}
                          // No IPC surface exposes a stat(), so the honest answer
                          // is "asked, unknown" — not a date we made up.
                          modifiedAt={null}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {PLATFORM_ORDER.map((key) => {
                  const keyPlans = plansByPlatform(key);
                  if (keyPlans.length === 0) return null;
                  const cancelled = cancelledPlatforms.has(key);
                  // Conflicts moved to the block above; listing them twice would
                  // give the same file two checkboxes that disagree.
                  const listedPlans = keyPlans.filter((p) => p.action !== 'conflict');
                  const hoisted = keyPlans.length - listedPlans.length;
                  const PlatformIcon = PLATFORM_ICONS[key];
                  return (
                    <div key={key} className="mb-5" data-testid={`preview-section-${key}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon size={14} className="text-accent-action" />
                          <h3 className="font-h1 text-sm font-semibold text-content-strong">
                            {PLATFORM_LABELS[key]}
                          </h3>
                          {/* A cancelled platform has no conflicts in the block
                              above — they left with it — so the header stops
                              claiming they are up there. */}
                          <span className="text-[10px] text-content-tertiary">
                            {cancelled ? (
                              <>
                                {keyPlans.length} fichier{keyPlans.length === 1 ? '' : 's'}
                              </>
                            ) : (
                              <>
                                {listedPlans.length} fichier{listedPlans.length === 1 ? '' : 's'}
                                {hoisted > 0 && <> + {hoisted} en conflit, en tête</>}
                              </>
                            )}
                          </span>
                        </div>
                        {cancelled ? (
                          <button
                            type="button"
                            onClick={() => handleRestorePlatform(key)}
                            className="flex items-center gap-1 text-xs text-accent-action hover:brightness-110 transition-all"
                            data-testid={`restore-platform-${key}`}
                          >
                            <RotateCcw size={11} />
                            Restaurer
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCancelPlatform(key)}
                            className="flex items-center gap-1 text-xs text-content-tertiary hover:text-accent-danger transition-colors"
                            data-testid={`cancel-platform-${key}`}
                          >
                            <XCircle size={11} />
                            Annuler cette plateforme
                          </button>
                        )}
                      </div>
                      {cancelled ? (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-edge-subtle text-xs text-content-tertiary italic">
                          <XCircle size={13} className="text-accent-danger opacity-60" />
                          Annulée — {PLATFORM_LABELS[key]} ne sera pas configurée.
                        </div>
                      ) : listedPlans.length === 0 ? (
                        <div className="px-4 py-3 rounded-xl bg-white/5 border border-edge-subtle text-xs text-content-tertiary italic">
                          Tous les fichiers de cette plateforme sont en conflit — ils sont
                          regroupés en tête.
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto">
                          {listedPlans.map((plan) => (
                            <FilePreview
                              key={plan.relPath}
                              plan={plan}
                              fetchContent={fetchTemplate}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-2 border-t border-edge-subtle mt-4">
                  <button
                    type="button"
                    onClick={onComplete}
                    className="btn-ghost btn-sm flex items-center gap-1.5"
                    data-testid="skip-onboarding-btn"
                  >
                    <SkipForward size={13} />
                    Passer pour l&apos;instant
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-xs"
                      data-testid="step2-back-btn"
                    >
                      <ArrowLeft size={13} />
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStep2Apply()}
                      className="btn-primary flex items-center gap-2 py-2 px-6"
                      data-testid="step2-apply-btn"
                    >
                      Confirmer et appliquer
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Écriture.
                The bar that used to live here was hardcoded at width:'60%' with a
                sweeping animation: it claimed a measurement nobody took, and it
                claimed the same one whether we were on the first file or the last.
                Measure it or remove it — and it cannot be measured from here:
                onboarding.apply() is one round trip that reports only when it is
                over, so any fraction shown mid-flight would be invented. Removed,
                then. What is left is the part we do know, stated as a fact.
                Restoring a bar means first adding a real progress channel
                (byan:onboarding:progress) on the main side. */}
            {step === 3 && (
              <div data-testid="step-applying" className="py-4">
                <h2 className="font-h1 text-xl font-semibold text-content-strong mb-6">
                  Écriture en cours
                </h2>
                {applying && (
                  <div className="flex flex-col items-center gap-4" data-testid="applying-spinner">
                    <div className="flex items-center gap-3 text-sm text-content-body">
                      <Loader2 size={18} className="animate-spin text-accent-action" />
                      BYAN écrit {activePlans.length} fichier
                      {activePlans.length === 1 ? '' : 's'} dans ton projet...
                    </div>
                    <p className="text-xs text-content-tertiary text-center max-w-md leading-relaxed">
                      L&apos;avancement fichier par fichier n&apos;est pas mesuré : plutôt
                      qu&apos;une barre qui avance au hasard, tu auras le compte exact au
                      bilan.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Bilan */}
            {step === 4 && (
              <div data-testid="step-done" className="animate-fade-in-up">
                {/* Big checkmark / error icon */}
                <div className="flex flex-col items-center py-4 mb-6">
                  {errorCount === 0 ? (
                    <SuccessSeal />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-wash-change border-2 border-edge-change flex items-center justify-center">
                      <AlertTriangle size={36} className="text-accent-change" strokeWidth={1.5} />
                    </div>
                  )}
                  <h2 className="font-h1 text-2xl font-semibold text-content-strong mt-5 mb-1">
                    {errorCount === 0 ? 'C’est prêt.' : 'Installation terminée, avec des réserves.'}
                  </h2>
                  <p className="text-sm text-content-secondary text-center">
                    {applyResult &&
                    applyResult.written === 0 &&
                    applyResult.skipped === 0 &&
                    conflictsKept === 0 &&
                    errorCount === 0
                      ? 'Tes plateformes étaient déjà configurées. Rien à faire.'
                      : 'BYAN est prêt pour ton projet.'}
                  </p>
                </div>

                {applyResult && (
                  <div className="space-y-4 mb-7">
                    {/* Stats row. `skipped` and `conflictsKept` are two different
                        facts and stay two numbers: "already up to date" and "your
                        edits are still there" merged into one total would read as
                        nothing-to-do, which is exactly the wrong conclusion. */}
                    <div className="flex gap-4 p-4 rounded-2xl bg-surface-raised border border-edge-subtle">
                      <div className="flex-1 text-center">
                        <div
                          className="text-2xl font-semibold font-h1 text-accent-success"
                          data-testid="done-written"
                        >
                          {applyResult.written}
                        </div>
                        <div className="text-[11px] text-content-tertiary uppercase tracking-wider mt-0.5">
                          écrits
                        </div>
                      </div>
                      <div className="w-px bg-edge-strong" />
                      <div className="flex-1 text-center">
                        <div
                          className="text-2xl font-semibold font-h1 text-content-muted"
                          data-testid="done-skipped"
                        >
                          {applyResult.skipped}
                        </div>
                        <div className="text-[11px] text-content-tertiary uppercase tracking-wider mt-0.5">
                          déjà à jour
                        </div>
                      </div>
                      {conflictsKept > 0 && (
                        <>
                          <div className="w-px bg-edge-strong" />
                          <div className="flex-1 text-center">
                            <div
                              className="text-2xl font-semibold font-h1 text-accent-danger"
                              data-testid="done-conflicts-kept"
                            >
                              {conflictsKept}
                            </div>
                            <div className="text-[11px] text-content-tertiary uppercase tracking-wider mt-0.5">
                              tes versions gardées
                            </div>
                          </div>
                        </>
                      )}
                      {errorCount > 0 && (
                        <>
                          <div className="w-px bg-edge-strong" />
                          <div className="flex-1 text-center">
                            <div className="text-2xl font-semibold font-h1 text-accent-change">
                              {errorCount}
                            </div>
                            <div className="text-[11px] text-content-tertiary uppercase tracking-wider mt-0.5">
                              erreurs
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* The number alone would be ambiguous — it could read as a
                        failure. Naming what happened is the whole point. */}
                    {conflictsKept > 0 && (
                      <div
                        className="p-4 rounded-xl bg-wash-danger border border-edge-danger text-xs"
                        data-testid="done-conflicts-kept-note"
                      >
                        <div className="flex items-start gap-2 text-content-body leading-relaxed">
                          <ShieldAlert size={13} className="flex-shrink-0 mt-0.5 text-accent-danger" />
                          <span>
                            {conflictsKept === 1
                              ? '1 fichier que tu avais modifié n’a pas été touché : ta version est toujours là.'
                              : `${conflictsKept} fichiers que tu avais modifiés n’ont pas été touchés : tes versions sont toujours là.`}{' '}
                            Ce n&apos;est pas une erreur — c&apos;est ce que tu as demandé en
                            laissant leur case décochée.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Error details */}
                    {errorCount > 0 && (
                      <div className="p-4 rounded-xl bg-wash-change border border-edge-change text-xs">
                        <div className="flex items-center gap-2 text-on-wash-change font-medium mb-2">
                          <AlertTriangle size={13} />
                          Certains fichiers n&apos;ont pas pu être écrits :
                        </div>
                        {Object.entries(applyResult.errors).map(([filePath, msg]) => (
                          <div key={filePath} className="text-on-wash-change font-mono mt-1">
                            {filePath} : {msg}
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
                  Continuer vers BYAN
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-content-muted mt-6 uppercase tracking-[0.2em]">
          Builder of YAN{appVersion ? ` · ${formatVersion(appVersion)}` : ''}
        </p>
      </div>
    </div>
  );
}

// One cell of the counted summary. A zero is a measured value, so it is shown —
// but it is shown quietly: an emphatic red 0 conflicts raises an alarm about
// nothing.
function SummaryCount({
  testId,
  value,
  label,
  valueClass,
  labelClass,
}: {
  testId: string;
  value: number;
  label: string;
  valueClass: string;
  labelClass: string;
}) {
  const silent = value === 0;
  return (
    <div className="text-center" data-testid={testId}>
      <div
        className={[
          'text-2xl font-semibold font-h1 leading-none',
          silent ? 'text-content-muted' : valueClass,
        ].join(' ')}
      >
        {value}
      </div>
      <div
        className={[
          'text-[11px] mt-1.5 leading-tight',
          silent ? 'text-content-tertiary' : labelClass,
        ].join(' ')}
      >
        {label}
      </div>
    </div>
  );
}

// The one place a glow belongs: a success that just happened. It fires once and
// settles, instead of pulsing forever like the previous animate-glow-pulse —
// which turned a confirmation into wallpaper.
function SuccessSeal() {
  const [lit, setLit] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setLit(false), 1400);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      data-testid="success-seal"
      data-lit={lit ? 'true' : undefined}
      className={[
        'w-20 h-20 rounded-full bg-wash-success border-2 border-accent-success',
        'flex items-center justify-center transition-shadow duration-700',
        // The glow tokens are teal (the action colour). A success confirmation
        // glows in the success colour, so this one is spelled out rather than
        // borrowing a token that means something else.
        lit ? 'shadow-[0_0_48px_rgba(34,197,94,0.45)]' : 'shadow-none',
      ].join(' ')}
    >
      <CheckCircle2 size={40} className="text-accent-success" strokeWidth={1.5} />
    </div>
  );
}
