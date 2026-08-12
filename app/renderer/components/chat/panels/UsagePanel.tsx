// UsagePanel (F9) — what the local session actually cost, per engine.
//
// This panel exists because the two engines report DISJOINT halves of the bill:
// claude publishes a dollar amount and a duration but no token breakdown, codex
// publishes five token counters and no dollar amount at all (it bills a
// subscription). A single "session cost" line would therefore have to lie —
// either by adding dollars to tokens, or by presenting one engine's figure as
// the whole. So there is NO cross-engine total anywhere below, deliberately:
// each engine gets its own row, and every metric the engine did not report
// renders as a dash with the reason stated next to it.
//
// Presentational only. It owns no state and computes no sums; the folding lives
// in LocalChatContext.

import React from 'react';
import { X } from 'lucide-react';
import type { LocalChatUsage } from '../../../../shared/ipc-contract';
import type { LocalChatUsageTotal, LocalChatUsageTotals, UsageMetric } from '../../../context/LocalChatContext';
import { turnCosts, type TurnCost } from './turn-cost';

export interface UsagePanelProps {
  // Per-turn records, oldest first (already capped by the context).
  turns: LocalChatUsage[];
  // The per-engine sums.
  totals: LocalChatUsageTotals;
  onClose: () => void;
}

// What an unreported metric looks like. Never a 0 : the engine measured nothing,
// and a zero would read as a measurement.
const UNREPORTED = '—';

// Four decimals, not two : a single local turn often costs well under a cent, and
// rounding to $0.00 would show a measured zero where there is a real cost.
function usd(v: number): string {
  return `$${v.toFixed(4)}`;
}

function duration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

const METRICS: Array<{ key: UsageMetric; label: string; format: (v: number) => string }> = [
  { key: 'costUsd', label: 'Coût', format: usd },
  { key: 'durationMs', label: 'Durée', format: duration },
  { key: 'inputTokens', label: 'Entrée', format: String },
  { key: 'cachedInputTokens', label: 'Entrée en cache', format: String },
  { key: 'cacheWriteInputTokens', label: 'Écriture de cache', format: String },
  { key: 'outputTokens', label: 'Sortie', format: String },
  { key: 'reasoningOutputTokens', label: 'Raisonnement', format: String },
];

// Fixed order so the panel does not reshuffle between renders. Each engine
// carries the sentence explaining ITS silence, because that sentence is what
// turns a row of dashes from a bug into a fact.
const ENGINE_ROWS = [
  {
    engine: 'claude' as const,
    label: 'Claude',
    gap: 'claude ne publie aucun détail de tokens : seuls le coût et la durée sont rapportés.',
  },
  {
    engine: 'codex' as const,
    label: 'Codex',
    gap: 'codex ne rapporte aucun montant en dollars (abonnement) : seuls les tokens le sont.',
  },
];

// One-line recap of a single turn, built only from what that turn reported.
// The two token counters are labelled in French like every other label in this
// panel : an "in / out" pair next to "Entrée / Sortie" two rows above would read
// as two different measurements rather than the same one, summarised.
function turnRecap(u: LocalChatUsage, cost: TurnCost): string {
  const parts: string[] = [];
  // Le montant rapporte par claude est le cumul de la session, pas le cout du
  // tour. `turnCosts` en tire le cout reel quand c'est possible, et dit « cumul »
  // quand ca ne l'est pas — plutot que d'afficher un nombre qui invite a une
  // addition fausse.
  if (cost.kind === 'turn' && cost.usd !== undefined) parts.push(usd(cost.usd));
  else if (cost.kind === 'cumulative' && cost.usd !== undefined) parts.push(`cumul ${usd(cost.usd)}`);
  if (typeof u.durationMs === 'number') parts.push(duration(u.durationMs));
  if (typeof u.inputTokens === 'number') parts.push(`entrée ${u.inputTokens}`);
  if (typeof u.outputTokens === 'number') parts.push(`sortie ${u.outputTokens}`);
  return parts.length > 0 ? parts.join(' · ') : UNREPORTED;
}

function Metric({ testId, label, value, gap }: { testId: string; label: string; value: string | null; gap: string }) {
  return (
    <div className="flex items-baseline justify-between gap-sm">
      <dt className="text-[10px] text-content-tertiary">{label}</dt>
      <dd
        data-testid={testId}
        title={value === null ? gap : undefined}
        className={`font-mono-code text-[11px] ${value === null ? 'text-content-muted' : 'text-content-body'}`}
      >
        {value ?? UNREPORTED}
      </dd>
    </div>
  );
}

function EngineRow({ row, total }: { row: (typeof ENGINE_ROWS)[number]; total: LocalChatUsageTotal }) {
  // The gap note is driven by the DATA, not by the engine name : if an engine
  // ever starts reporting what it used to withhold, the explanation disappears
  // on its own instead of contradicting the numbers next to it.
  const missing = METRICS.some((m) => total[m.key] === undefined);
  return (
    <div data-testid={`usage-row-${row.engine}`} className="px-md py-sm border-t border-edge-subtle">
      <div className="flex items-center justify-between">
        <span className="text-xs text-content-body">{row.label}</span>
        <span className="font-mono-code text-[10px] text-content-tertiary">
          {total.turns} tour{total.turns > 1 ? 's' : ''}
          {total.model ? ` · ${total.model}` : ''}
        </span>
      </div>
      <dl className="mt-xs grid grid-cols-2 gap-x-md">
        {METRICS.map((m) => {
          const v = total[m.key];
          return (
            <Metric
              key={m.key}
              testId={`usage-${row.engine}-${m.key}`}
              label={m.label}
              value={v === undefined ? null : m.format(v)}
              gap={row.gap}
            />
          );
        })}
      </dl>
      {missing && (
        <p data-testid={`usage-note-${row.engine}`} className="mt-xs text-[10px] text-content-muted">
          {row.gap}
        </p>
      )}
    </div>
  );
}

export default function UsagePanel({ turns, totals, onClose }: UsagePanelProps) {
  const rows = ENGINE_ROWS.filter((r) => totals[r.engine] !== undefined);
  // Calcule dans l'ordre chronologique : la soustraction a besoin du tour
  // precedent. L'affichage s'inverse ensuite, pas le calcul.
  const costs = turnCosts(turns);
  return (
    <div
      role="dialog"
      aria-label="Consommation de la session"
      data-testid="usage-panel"
      className="absolute top-full right-0 mt-1 w-80 max-h-96 overflow-y-auto bg-surface-card border border-edge-strong rounded shadow-lg py-1 z-50"
    >
      <div className="flex items-center justify-between px-md py-xs">
        <span className="text-xs text-content-body">Consommation</span>
        <button
          type="button"
          data-testid="usage-close"
          onClick={onClose}
          title="Fermer"
          className="text-content-tertiary hover:text-content-body transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-md py-sm text-xs text-content-tertiary">Aucun tour mesuré dans cette session.</p>
      ) : (
        rows.map((row) => (
          <EngineRow key={row.engine} row={row} total={totals[row.engine] as LocalChatUsageTotal} />
        ))
      )}

      {turns.length > 0 && (
        <div data-testid="usage-turns" className="px-md py-sm border-t border-edge-subtle">
          <p className="text-[10px] text-content-tertiary">Derniers tours ({turns.length})</p>
          <ul className="mt-xs space-y-xs">
            {turns
              .map((u, i) => ({ u, n: i + 1, cost: costs[i] as TurnCost }))
              .reverse()
              .map(({ u, n, cost }) => (
                <li key={n} className="flex items-baseline justify-between gap-sm">
                  <span className="text-[10px] text-content-tertiary">{u.engine}</span>
                  <span className="font-mono-code text-[10px] text-content-tertiary">{turnRecap(u, cost)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <p data-testid="usage-scope" className="px-md pt-xs pb-sm text-[10px] text-content-muted border-t border-edge-subtle">
        Session en cours uniquement. Rien n&apos;est conservé au redémarrage de l&apos;application.
      </p>
    </div>
  );
}
