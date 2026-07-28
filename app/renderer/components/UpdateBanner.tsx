// UpdateBanner — F9: in-app notification when a new version is available.
//
// Visible when the manager state is 'available' / 'downloading' / 'downloaded'.
// Click "Install now" when downloaded → main quits and applies the update.
// Hidden in dev mode (state: 'disabled') and on idle / not-available states.

import React, { useEffect, useState } from 'react';
import { Download, RefreshCcw, X } from 'lucide-react';
import type { UpdateState } from '../../shared/ipc-contract';
import { useT } from '../i18n/I18nContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UpdateBanner() {
  const { t } = useT();
  const [state, setState] = useState<UpdateState>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  // Seed with the current main-side state on mount so a late-mounted renderer
  // still sees an existing update notification.
  useEffect(() => {
    void window.byanApi.update.getState().then((s) => setState(s)).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    const off = window.byanEvents.on('byan:update:status', (payload: unknown) => {
      setState(payload as UpdateState);
      // Re-show banner on new transitions even if user dismissed an earlier one.
      setDismissed(false);
    });
    return off;
  }, []);

  // Visible only for the states that actually matter to the user.
  const visible =
    !dismissed &&
    (state.state === 'available' ||
      state.state === 'downloading' ||
      state.state === 'downloaded');

  if (!visible) return null;

  const handleInstall = () => { void window.byanApi.update.install(); };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-teal-900 border-b border-accent-action px-md py-sm flex items-center justify-between gap-md">
      <div className="flex items-center gap-sm min-w-0">
        {state.state === 'downloading' ? (
          <RefreshCcw size={14} className="text-teal-300 flex-shrink-0 animate-spin" />
        ) : (
          <Download size={14} className="text-teal-300 flex-shrink-0" />
        )}
        <div className="min-w-0">
          {state.state === 'available' && (
            <span className="font-body-sm text-body-sm text-content-body">
              {t('update.available', { version: state.version })}
            </span>
          )}
          {state.state === 'downloading' && (
            <span className="font-body-sm text-body-sm text-content-body">
              {t('update.downloading', { percent: state.percent.toFixed(0) })}
              <span className="text-content-tertiary ml-xs">
                ({formatBytes(state.transferred)} / {formatBytes(state.total)})
              </span>
            </span>
          )}
          {state.state === 'downloaded' && (
            <span className="font-body-sm text-body-sm text-content-body">
              {t('update.downloaded', { version: state.version })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-xs flex-shrink-0">
        {state.state === 'downloaded' && (
          <button type="button" onClick={handleInstall} className="btn-primary btn-sm">
            {t('update.install')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-content-tertiary hover:text-content-body transition-colors"
          aria-label={t('update.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
