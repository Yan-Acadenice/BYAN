// Stepper — generic multi-step progress indicator.
//
// Purely presentational: renders step labels and a connecting line.
// The active step is highlighted; completed steps show a check indicator.
// No internal state — the parent drives `currentStep`.

import React from 'react';

export interface StepDef {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepDef[];
  currentStep: number; // 0-indexed
}

export default function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center w-full mb-8" aria-label="Progress steps" role="navigation">
      {steps.map((step, idx) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                data-testid={`step-indicator-${step.id}`}
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                  isDone
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                    : isActive
                    ? 'border-byan-400 bg-byan-400/20 text-byan-300'
                    : 'border-white/20 bg-white/5 text-ink-500',
                ].join(' ')}
              >
                {isDone ? (
                  // Simple checkmark without emoji / svg dependency
                  <span aria-hidden>ok</span>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={[
                  'mt-1 text-[10px] text-center leading-tight max-w-[64px]',
                  isActive ? 'text-byan-300 font-medium' : isDone ? 'text-emerald-400' : 'text-ink-500',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  'flex-1 h-px mx-1',
                  idx < currentStep ? 'bg-emerald-500/50' : 'bg-white/10',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
