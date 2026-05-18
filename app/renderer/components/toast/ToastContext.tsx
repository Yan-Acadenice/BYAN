// Toast — F7: lightweight notification system shared across the renderer.
//
// One ToastProvider at the root of the app exposes useToast() to any descendant.
// Toasts are stackable, auto-dismiss after `duration` ms (default 4s), and can
// be dismissed manually. Pure React, no external dep.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastContextShape {
  show(kind: ToastKind, message: string, durationMs?: number): string;
  success(message: string, durationMs?: number): string;
  error(message: string, durationMs?: number): string;
  info(message: string, durationMs?: number): string;
  warning(message: string, durationMs?: number): string;
  dismiss(id: string): void;
  // Test-only: returns the live toast list snapshot.
  _toasts(): Toast[];
}

const ToastContext = createContext<ToastContextShape | null>(null);

const DEFAULT_DURATION_MS = 4000;

let counter = 0;
function makeId(): string {
  counter += 1;
  return `t-${Date.now()}-${counter}`;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  // Stack limit — older toasts are evicted when exceeded.
  maxStack?: number;
}

export function ToastProvider({ children, maxStack = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track timeouts so dismiss() can cancel them and avoid double-removal.
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timeoutsRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((kind: ToastKind, message: string, durationMs = DEFAULT_DURATION_MS): string => {
    const id = makeId();
    const toast: Toast = { id, kind, message, duration: durationMs };
    setToasts((prev) => {
      const next = [...prev, toast];
      // Evict oldest when over the cap so the screen stays readable.
      return next.length > maxStack ? next.slice(next.length - maxStack) : next;
    });
    if (durationMs > 0) {
      const timer = setTimeout(() => dismiss(id), durationMs);
      timeoutsRef.current.set(id, timer);
    }
    return id;
  }, [dismiss, maxStack]);

  // Clear pending timers if the provider unmounts (rare in this app but cheap).
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const t of timeouts.values()) clearTimeout(t);
      timeouts.clear();
    };
  }, []);

  const value = useMemo<ToastContextShape>(() => ({
    show,
    success: (m, d) => show('success', m, d),
    error: (m, d) => show('error', m, d),
    info: (m, d) => show('info', m, d),
    warning: (m, d) => show('warning', m, d),
    dismiss,
    _toasts: () => toasts,
  }), [show, dismiss, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextShape {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Falling back to no-op rather than throwing keeps unit-tested components
    // that mount without a provider (e.g. McpServers in isolation) working.
    return {
      show: () => '',
      success: () => '',
      error: () => '',
      info: () => '',
      warning: () => '',
      dismiss: () => {},
      _toasts: () => [],
    };
  }
  return ctx;
}

// ---------- View ----------

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss(id: string): void;
}

function kindStyles(kind: ToastKind): { border: string; bg: string; icon: React.ReactNode } {
  switch (kind) {
    case 'success':
      return { border: 'border-green-700', bg: 'bg-green-950/80', icon: <CheckCircle2 size={16} className="text-green-400" /> };
    case 'error':
      return { border: 'border-red-700', bg: 'bg-red-950/80', icon: <XCircle size={16} className="text-red-400" /> };
    case 'warning':
      return { border: 'border-amber-700', bg: 'bg-amber-950/80', icon: <AlertTriangle size={16} className="text-amber-400" /> };
    case 'info':
    default:
      return { border: 'border-byan-700', bg: 'bg-byan-950/80', icon: <Info size={16} className="text-byan-300" /> };
  }
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-md right-md z-[60] flex flex-col gap-xs pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => {
        const s = kindStyles(t.kind);
        return (
          <div
            key={t.id}
            role="status"
            className={[
              'pointer-events-auto flex items-start gap-sm px-sm py-xs rounded-lg border shadow-lg',
              'min-w-[280px] max-w-[420px] backdrop-blur-sm',
              s.border,
              s.bg,
            ].join(' ')}
          >
            <div className="flex-shrink-0 mt-0.5">{s.icon}</div>
            <p className="font-body-sm text-body-sm text-ink-100 flex-1 break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="text-ink-400 hover:text-ink-200 transition-colors flex-shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
