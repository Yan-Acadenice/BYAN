// ConsequenceDialog — the ACT-X role of the handoff: an action whose consequence
// is invisible until it has already happened.
//
// Handoff rule 3, "aucune commande muette", has two halves. This component is the
// FIRST one: state the consequence BEFORE. It deliberately does not know what the
// consequence IS — the caller names it, in concrete terms (which folder, what
// stops, what is kept, what is lost), because a generic "are you sure?" carries
// none of that and trains the user to click through it.
//
// Three slots, asymmetric on purpose:
//   danger  — the destructive path. OUTLINED in danger, never filled: a filled
//             red button reads as the default, and the default here is to stay.
//   confirm — a non-destructive way forward, when one genuinely exists. A dialog
//             may have one, the other, or both.
//   cancel  — staying put. Always present, always the Escape key, always the
//             element that takes focus when the dialog opens.

import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConsequenceFact {
  label: string;
  value: string;
}

export interface ConsequenceAction {
  label: string;
  onClick: () => void;
  testId?: string;
}

export interface ConsequenceDialogProps {
  open: boolean;
  title: string;
  // Named consequences, in reading order. The caller owns the ordering because
  // "what stops" matters more than "what is kept" in one dialog and less in
  // another.
  facts: ConsequenceFact[];
  cancel: ConsequenceAction;
  danger?: ConsequenceAction;
  confirm?: ConsequenceAction;
  testId?: string;
}

export default function ConsequenceDialog({
  open,
  title,
  facts,
  cancel,
  danger,
  confirm,
  testId = 'consequence-dialog',
}: ConsequenceDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape means "I did not mean to do this", so it maps to staying put — never
  // to the destructive path, and never to a dead dismiss that leaves the caller
  // waiting on an answer it will not get.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel.onClick();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, cancel]);

  // Focus lands on staying put: the safe choice is the one a stray Enter takes.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-md"
      onClick={cancel.onClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface-raised border border-edge-strong shadow-glass-lg px-lg py-lg"
      >
        <div className="flex items-start gap-sm mb-md">
          {/* Amber, not red: this is the accent of change and of waiting. Red is
              reserved for the destructive act itself, which is the button. */}
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-accent-change" />
          <h3 id={`${testId}-title`} className="font-h2 text-h2 text-content-strong">
            {title}
          </h3>
        </div>

        <dl className="space-y-sm mb-lg" data-testid={`${testId}-facts`}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-[10px] uppercase tracking-wider text-content-tertiary">
                {fact.label}
              </dt>
              <dd className="text-sm text-content-body break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center justify-end gap-sm">
          <button
            ref={cancelRef}
            type="button"
            data-testid={cancel.testId ?? `${testId}-cancel`}
            onClick={cancel.onClick}
            className="btn-ghost text-sm"
          >
            {cancel.label}
          </button>
          {confirm && (
            <button
              type="button"
              data-testid={confirm.testId ?? `${testId}-confirm`}
              onClick={confirm.onClick}
              className="btn-primary text-sm"
            >
              {confirm.label}
            </button>
          )}
          {danger && (
            <button
              type="button"
              data-testid={danger.testId ?? `${testId}-danger`}
              onClick={danger.onClick}
              className="btn bg-transparent border border-accent-danger text-accent-danger hover:bg-red-500/10 text-sm"
            >
              {danger.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
