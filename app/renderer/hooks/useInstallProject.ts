// useInstallProject (N2) — pick a folder, install/update BYAN into it, stream the
// engine's progress, then record it in the local registry so it appears in the
// projects list (N1 reads that registry). Create and update are the same call.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalInstallProgress, LocalInstallResult } from '../../shared/ipc-contract';

export interface UseInstallProject {
  installing: boolean;
  // The latest step label (for a compact live line).
  step: { index: number; total: number; label: string } | null;
  logs: string[];
  result: LocalInstallResult | null;
  error: string | null;
  // Pick a folder and run install/update. Resolves the installed path or null.
  run: () => Promise<string | null>;
  reset: () => void;
}

function folderName(dir: string): string {
  return dir.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || dir;
}

export function useInstallProject(onDone?: (projectRoot: string) => void): UseInstallProject {
  const [installing, setInstalling] = useState(false);
  const [step, setStep] = useState<{ index: number; total: number; label: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<LocalInstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  const reset = useCallback(() => {
    setInstalling(false); setStep(null); setLogs([]); setResult(null); setError(null);
  }, []);

  const run = useCallback(async (): Promise<string | null> => {
    const folder = await window.byanApi.fs?.openProjectDialog?.();
    if (!folder) return null;

    setInstalling(true); setStep(null); setLogs([]); setResult(null); setError(null);

    // Stream progress for the duration of the install.
    let unsub = () => {};
    if (typeof window.byanEvents !== 'undefined') {
      unsub = window.byanEvents.on('byan:install:progress', (payload: unknown) => {
        const p = payload as LocalInstallProgress;
        if (p.type === 'step') setStep({ index: p.index, total: p.total, label: p.label });
        else if (p.type === 'log') setLogs((prev) => [...prev, p.line]);
      });
    }

    try {
      const res = await window.byanApi.projectsLocal.install({ projectRoot: folder });
      setResult(res);
      // Record so the projects list shows it (best-effort).
      try { await window.byanApi.projectsLocal.record?.({ name: folderName(folder), path: folder }); } catch { /* non-blocking */ }
      doneRef.current?.(folder);
      return folder;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation impossible.');
      return null;
    } finally {
      setInstalling(false);
      unsub();
    }
  }, []);

  return { installing, step, logs, result, error, run, reset };
}
