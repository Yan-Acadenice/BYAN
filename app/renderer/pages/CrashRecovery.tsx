// CrashRecovery — m2._crash_recovery ported to React.
// Shown when the app encounters a fatal error at startup.

import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, List, ChevronDown, ChevronUp } from 'lucide-react';

interface CrashRecoveryProps {
  message?: string;
  details?: string;
}

export default function CrashRecovery({
  message = 'BYAN ran into a problem and needs to restart.',
  details,
}: CrashRecoveryProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleRestart = () => void window.byanApi.app.relaunch();

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 p-lg">
      <div className="w-full max-w-[480px] animate-fade-in-up">
        {/* Icon */}
        <div className="flex justify-center mb-lg">
          <div className="w-16 h-16 rounded-full bg-red/10 border-2 border-red/30 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red" strokeWidth={1.5} />
          </div>
        </div>

        {/* Title */}
        <h1 className="font-h1 text-h1 text-ink-100 text-center mb-xs">Something went wrong</h1>
        <p className="font-body text-body text-ink-400 text-center mb-xl">{message}</p>

        {/* Details toggle */}
        {details && (
          <div className="bg-ink-900 border border-ink-800 rounded-lg mb-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="w-full flex items-center justify-between px-md py-sm text-ink-400 hover:bg-ink-800 transition-colors"
            >
              <span className="font-body-sm text-body-sm">Error details</span>
              {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showDetails && (
              <pre className="px-md pb-md pt-xs font-mono-code text-mono-code text-ink-300 text-[11px] overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
                {details}
              </pre>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-xs">
          <button
            type="button"
            onClick={handleRestart}
            className="btn-primary w-full flex items-center justify-center gap-xs py-3"
          >
            <RefreshCw size={14} />
            Restart BYAN
          </button>
          <button
            type="button"
            className="btn-ghost w-full flex items-center justify-center gap-xs py-2.5"
          >
            <List size={14} />
            Open logs
          </button>
        </div>
      </div>
    </div>
  );
}
