// Stepper — horizontal position marker for the onboarding flow (role NAV).
//
// Glow is NOT the active state here. The brief reserves it for an active
// selection or a brief success confirmation, and the previous version combined
// shadow-glow with animate-glow-pulse: a permanent 2.8s pulse on the active
// node. An indicator that glows forever spends the one effect reserved for
// confirming something just happened, and it does it while nothing is
// happening. Same call index.css already made for .nav-item-active ("the teal
// bar carries the active state, no permanent glow").
//
// What replaces it: the teal ring carries the active state at rest, and the
// glow fires ONCE, briefly, when the step actually changes — which is the
// moment there is something to confirm.

import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export interface StepDef {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepDef[];
  currentStep: number; // 0-indexed
}

// How long the advance confirmation stays lit. Long enough to be seen, short
// enough that it is over before the user reads the next screen.
const CONFIRM_GLOW_MS = 900;

export default function Stepper({ steps, currentStep }: StepperProps) {
  // Glow is an event, not a state: true only for the moment right after the
  // step changed. Mount does not count as a change, so a freshly rendered
  // stepper sits quiet instead of greeting the user with a flash.
  const [confirming, setConfirming] = useState(false);
  const lastStep = useRef(currentStep);

  useEffect(() => {
    if (lastStep.current === currentStep) return;
    lastStep.current = currentStep;
    setConfirming(true);
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_GLOW_MS);
    return () => window.clearTimeout(timer);
  }, [currentStep]);

  return (
    <nav className="flex items-center w-full mb-10" aria-label="Progression de l'installation">
      {steps.map((step, idx) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;

        return (
          <React.Fragment key={step.id}>
            {/* Node */}
            <div className="flex flex-col items-center flex-shrink-0 gap-2">
              <div
                data-testid={`step-indicator-${step.id}`}
                data-confirming={isActive && confirming ? 'true' : undefined}
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'relative w-9 h-9 rounded-full flex items-center justify-center',
                  // The glow leaves on a slower curve than it arrives: a fade is
                  // read as "that settled", a cut is read as a rendering glitch.
                  'transition-all duration-500',
                  isDone
                    ? 'bg-wash-success border-2 border-accent-success text-on-wash-success'
                    : isActive
                    ? [
                        'bg-wash-action border-2 border-accent-action text-on-wash-action',
                        confirming ? 'shadow-glow' : 'shadow-none',
                      ].join(' ')
                    : 'bg-white/5 border-2 border-edge-strong text-content-tertiary',
                ].join(' ')}
              >
                {isDone ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <span className="text-[11px] font-bold">{idx + 1}</span>
                )}
              </div>
              <span
                className={[
                  'text-[10px] font-medium text-center tracking-wide',
                  isActive
                    ? 'text-accent-action'
                    : isDone
                    ? 'text-accent-success'
                    // The readability floor, not below it: these labels are
                    // informative text, so they stop at content-tertiary.
                    : 'text-content-tertiary',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="flex-1 h-px mx-2 relative overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-edge-strong" />
                <div
                  className={[
                    'absolute inset-0 transition-all duration-500 rounded-full',
                    idx < currentStep ? 'bg-accent-success' : 'opacity-0',
                  ].join(' ')}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
