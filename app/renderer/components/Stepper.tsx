// Stepper — horizontal timeline with glowing nodes.
//
// Design: gradient progress line connecting node circles.
// Active node: byan glow pulse. Done nodes: emerald check. Future: muted.
// Purely presentational — parent drives currentStep.

import React from 'react';
import { Check } from 'lucide-react';

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
    <nav
      className="flex items-center w-full mb-10"
      aria-label="Progress steps"
      role="navigation"
    >
      {steps.map((step, idx) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;

        return (
          <React.Fragment key={step.id}>
            {/* Node */}
            <div className="flex flex-col items-center flex-shrink-0 gap-2">
              <div
                data-testid={`step-indicator-${step.id}`}
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300',
                  isDone
                    ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400'
                    : isActive
                    ? 'bg-byan-500/20 border-2 border-byan-400 text-byan-300 shadow-glow animate-glow-pulse'
                    : 'bg-white/5 border-2 border-white/15 text-ink-500',
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
                    ? 'text-byan-300'
                    : isDone
                    ? 'text-emerald-400'
                    : 'text-ink-500',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="flex-1 h-px mx-2 relative overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-white/10" />
                <div
                  className="absolute inset-0 transition-all duration-500 rounded-full"
                  style={{
                    background:
                      idx < currentStep
                        ? 'linear-gradient(90deg, #34d399, #10b981)'
                        : 'transparent',
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
