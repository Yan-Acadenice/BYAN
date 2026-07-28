// FilePreview — one FileWritePlan as a row: action badge, path, and a
// collapsible panel showing what the write would do.
//
// Four actions, four colours, one meaning each. Teal creates, amber is change
// and waiting, red is the destructive conflict, neutral is untouched. The
// labels are French: the app speaks French, and leaving "create/update/skip" in
// English next to a French "remplacer" would be worse than either.

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileEdit,
  CheckCircle,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { PreviewFileWritePlan, FileWriteAction } from '../../shared/ipc-contract';

const ACTION_CONFIG: Record<
  FileWriteAction,
  { label: string; containerClass: string; badgeClass: string; Icon: LucideIcon }
> = {
  // Only the conflict carries a tinted ground. A preview ships ~1000 rows: tint
  // them all and the list becomes a wall of colour where nothing stands out,
  // which is how the conflict went unnoticed in the first place. The border and
  // the badge carry the category; the ground is spent on the one row whose write
  // destroys something.
  create: {
    label: 'créer',
    containerClass: 'border-edge-action',
    badgeClass: 'bg-wash-action text-on-wash-action border-edge-action',
    Icon: FilePlus,
  },
  update: {
    label: 'mettre à jour',
    containerClass: 'border-edge-change',
    badgeClass: 'bg-wash-change text-on-wash-change border-edge-change',
    Icon: FileEdit,
  },
  // The fourth category. Red, and red only here: this is the one case where
  // applying destroys something the user wrote. An amber warning would put it in
  // the same visual bucket as a routine update, which is precisely the confusion
  // that made it invisible.
  conflict: {
    label: 'remplacer',
    containerClass: 'border-edge-danger bg-wash-danger',
    badgeClass: 'bg-wash-danger text-on-wash-danger border-edge-danger',
    Icon: AlertTriangle,
  },
  skip: {
    label: 'inchangé',
    containerClass: 'border-edge-subtle',
    badgeClass: 'bg-white/5 text-content-tertiary border-edge-strong',
    Icon: CheckCircle,
  },
};

// ---------------------------------------------------------------------------
// Line diff.
//
// A conflict asks the user one question — "is your edit worth keeping?" — and
// that question is unanswerable without seeing the edit. Two full bodies side
// by side would technically show it; a line diff shows it in the two seconds
// the user will actually spend.
// ---------------------------------------------------------------------------

type DiffOp = { kind: 'same' | 'del' | 'add'; text: string };
type DiffRow = DiffOp | { kind: 'gap'; count: number };

// The quadratic part runs on the DIVERGENT middle only (see the head/tail trim
// below), so this cap is reached by genuinely unrelated files, not by big ones.
// At the cap the table is 1200x1200 Int32 = ~5.8 MB, computed once per expand.
const DIFF_LINE_CAP = 1200;
// Unchanged lines kept either side of a change, so a hunk reads in context.
const DIFF_CONTEXT = 2;

// Returns null when the two sides diverge past the cap — the caller then says so
// and falls back to showing the bodies whole, rather than silently truncating.
export function diffLines(before: string, after: string): DiffOp[] | null {
  const a = before.split('\n');
  const b = after.split('\n');

  // Trim the identical head and tail first. In the real case — a few hand-edited
  // lines inside a settings file — this leaves a handful of lines for the
  // quadratic step, so the cap below almost never bites.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  if (midA.length > DIFF_LINE_CAP || midB.length > DIFF_LINE_CAP) return null;

  // Longest common subsequence table, filled backwards so the walk forward
  // below can pick the branch that keeps the most shared lines.
  const w = midB.length + 1;
  const lcs = new Int32Array((midA.length + 1) * w);
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  for (let k = 0; k < head; k++) ops.push({ kind: 'same', text: a[k] });
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      ops.push({ kind: 'same', text: midA[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      ops.push({ kind: 'del', text: midA[i] });
      i++;
    } else {
      ops.push({ kind: 'add', text: midB[j] });
      j++;
    }
  }
  while (i < midA.length) ops.push({ kind: 'del', text: midA[i++] });
  while (j < midB.length) ops.push({ kind: 'add', text: midB[j++] });
  for (let k = a.length - tail; k < a.length; k++) ops.push({ kind: 'same', text: a[k] });
  return ops;
}

// Collapse the long stretches nobody needs to read into a counted marker. The
// count is stated rather than hidden: a silent elision would let the user think
// they had seen the whole file.
export function collapseUnchanged(ops: DiffOp[]): DiffRow[] {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, idx) => {
    if (op.kind === 'same') return;
    const from = Math.max(0, idx - DIFF_CONTEXT);
    const to = Math.min(ops.length - 1, idx + DIFF_CONTEXT);
    for (let k = from; k <= to; k++) keep[k] = true;
  });

  const rows: DiffRow[] = [];
  let gap = 0;
  ops.forEach((op, idx) => {
    if (keep[idx]) {
      if (gap > 0) {
        rows.push({ kind: 'gap', count: gap });
        gap = 0;
      }
      rows.push(op);
    } else {
      gap += 1;
    }
  });
  if (gap > 0) rows.push({ kind: 'gap', count: gap });
  return rows;
}

interface FilePreviewProps {
  plan: PreviewFileWritePlan;
  defaultExpanded?: boolean;
  // Fetches the body BYAN would write, called at most once and only when the row
  // is expanded. Absent -> the panel says the body is unavailable rather than
  // rendering an empty block that reads like an empty file.
  fetchContent?: (plan: PreviewFileWritePlan) => Promise<string>;
  // Fetches the body currently ON DISK — the user's own version. Supplied for
  // conflicts only, and it is what turns the panel from "here is what we would
  // write" into "here is what you would lose".
  fetchCurrent?: (plan: PreviewFileWritePlan) => Promise<string>;
  // Only supplied for conflicts. Q4 of the handoff: files can be deselected on
  // conflicts ONLY — everywhere else the granularity is the whole platform, and a
  // checkbox that changes nothing would promise a control it does not have.
  selected?: boolean;
  onToggleSelected?: (plan: PreviewFileWritePlan, next: boolean) => void;
  // When the file was last touched, epoch ms. `undefined` means the caller did
  // not ask; `null` means it asked and the answer is not available — those are
  // different facts and the row states them differently. No IPC surface exposes
  // a stat() today, so the conflict block passes null: a stated silence, never
  // an invented date.
  modifiedAt?: number | null;
}

function formatModified(at: number): string {
  return new Date(at).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FilePreview({
  plan,
  defaultExpanded = false,
  fetchContent,
  fetchCurrent,
  selected,
  onToggleSelected,
  modifiedAt,
}: FilePreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // The bodies arrive on demand: preview ships ~1000 plans and the list is
  // collapsed, so eagerly carrying every file across IPC moved megabytes that
  // nobody opened.
  const [content, setContent] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const config = ACTION_CONFIG[plan.action];
  const { Icon } = config;
  // A diff needs both sides. Only conflicts have a user version worth showing.
  const wantsDiff = plan.action === 'conflict' && !!fetchCurrent;

  // Load once, on first expand. A 'skip' row needs nothing: it renders its own
  // "already matches" line instead of a body.
  useEffect(() => {
    if (!expanded || content !== null || loadError !== null) return;
    if (plan.action === 'skip' || !fetchContent) return;
    let cancelled = false;
    const template = fetchContent(plan);
    // The user's version is optional: a conflict whose disk read fails still
    // shows what BYAN would write, which is better than showing nothing.
    const disk = wantsDiff
      ? fetchCurrent(plan).catch(() => null)
      : Promise.resolve(null);
    void Promise.all([template, disk])
      .then(([templateText, diskText]) => {
        if (cancelled) return;
        setCurrent(diskText);
        setContent(templateText);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Lecture impossible.');
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, content, loadError, plan, fetchContent, fetchCurrent, wantsDiff]);

  // Recomputed only when a body actually changes, not on every render: the
  // table is quadratic and a re-render is not a reason to pay for it twice.
  const diffRows = useMemo(() => {
    if (!wantsDiff || current === null || content === null) return null;
    const ops = diffLines(current, content);
    if (ops === null) return null;
    return collapseUnchanged(ops);
  }, [wantsDiff, current, content]);

  return (
    <div
      data-testid={`file-preview-${plan.relPath}`}
      className={[
        'border rounded-xl overflow-hidden mb-2 transition-all duration-200',
        config.containerClass,
      ].join(' ')}
    >
      {/* Header row. The checkbox sits OUTSIDE the expand button: nesting an
          interactive control inside another swallows its click and makes the row
          expand instead of toggling the selection. */}
      <div className="flex items-center">
        {onToggleSelected && (
          <label className="flex items-center pl-3" title="Décocher pour conserver ta version">
            <input
              type="checkbox"
              data-testid={`file-select-${plan.relPath}`}
              aria-label={`Remplacer ${plan.relPath} par la version BYAN`}
              checked={selected ?? false}
              onChange={(e) => onToggleSelected(plan, e.target.checked)}
              className="w-3.5 h-3.5 accent-[var(--accent-action)] cursor-pointer"
            />
          </label>
        )}
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {/* Action icon */}
          <Icon size={13} />

          {/* Action badge */}
          <span
            className={[
              'flex-shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider',
              config.badgeClass,
            ].join(' ')}
          >
            {config.label}
          </span>

          {/* Relative path, and — for a conflict — when the user touched it */}
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-mono text-content-body truncate">
              {plan.relPath}
            </span>
            {modifiedAt !== undefined && (
              <span className="block text-[10px] mt-0.5">
                {modifiedAt === null ? (
                  <>
                    {/* A dash is not a zero: the dash carries the silence, the
                        words carry its reason. */}
                    <span className="text-content-muted">&mdash;</span>{' '}
                    <span className="text-content-tertiary">
                      date de ta modification inconnue
                    </span>
                  </>
                ) : (
                  <span className="text-content-tertiary">
                    modifié par toi le {formatModified(modifiedAt)}
                  </span>
                )}
              </span>
            )}
          </span>

          {/* Platform tag */}
          <span className="flex-shrink-0 text-[10px] text-content-tertiary uppercase tracking-wider">
            {plan.platform}
          </span>

          {/* Expand chevron */}
          <span className="flex-shrink-0 text-content-tertiary">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
      </div>

      {/* Content panel */}
      {expanded && (
        <div className="border-t border-edge-subtle bg-black/40">
          {plan.action === 'skip' ? (
            <p className="px-4 py-3 text-xs text-content-tertiary italic">
              Le fichier est déjà identique — rien ne sera écrit.
            </p>
          ) : loadError !== null ? (
            <p className="px-4 py-3 text-xs text-on-wash-change italic">{loadError}</p>
          ) : content === null ? (
            <p className="px-4 py-3 text-xs text-content-tertiary italic">Chargement...</p>
          ) : wantsDiff && current !== null ? (
            <div data-testid={`file-diff-${plan.relPath}`}>
              <div className="flex items-center gap-4 px-4 py-2 border-b border-edge-subtle text-[10px] uppercase tracking-wider">
                <span className="text-on-wash-danger">&minus; ta version</span>
                <span className="text-on-wash-action">+ la version BYAN</span>
              </div>
              {diffRows === null ? (
                <div className="px-4 py-3">
                  <p className="text-xs text-content-tertiary italic mb-2">
                    Les deux versions diffèrent trop pour être comparées ligne à ligne.
                    Voici ce que BYAN écrirait :
                  </p>
                  <pre className="text-[11px] font-mono text-content-secondary overflow-x-auto max-h-56 leading-relaxed whitespace-pre-wrap break-all">
                    {content.length > 4000
                      ? content.slice(0, 4000) + '\n... (tronqué pour l\'affichage)'
                      : content}
                  </pre>
                </div>
              ) : diffRows.every((r) => r.kind === 'gap') ? (
                <p className="px-4 py-3 text-xs text-content-tertiary italic">
                  Les deux versions sont identiques ligne à ligne.
                </p>
              ) : (
                <div className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed">
                  {diffRows.map((row, idx) =>
                    row.kind === 'gap' ? (
                      <div
                        key={idx}
                        className="px-4 py-1 text-content-muted bg-white/[0.02] select-none"
                      >
                        … {row.count} ligne{row.count > 1 ? 's' : ''} identique
                        {row.count > 1 ? 's' : ''}
                      </div>
                    ) : (
                      <div
                        key={idx}
                        className={[
                          'px-4 whitespace-pre-wrap break-all',
                          row.kind === 'del'
                            ? 'bg-wash-danger text-on-wash-danger'
                            : row.kind === 'add'
                            ? 'bg-wash-action text-on-wash-action'
                            : 'text-content-secondary',
                        ].join(' ')}
                      >
                        <span className="select-none text-content-muted mr-2">
                          {row.kind === 'del' ? '−' : row.kind === 'add' ? '+' : ' '}
                        </span>
                        {row.text}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ) : content.length === 0 ? (
            <p className="px-4 py-3 text-xs text-content-tertiary italic">Fichier vide.</p>
          ) : (
            <pre className="px-4 py-3 text-[11px] font-mono text-content-secondary overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
              {content.length > 4000
                ? content.slice(0, 4000) + '\n... (tronqué pour l\'affichage)'
                : content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
