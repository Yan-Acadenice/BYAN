// OfflineIndicator — F8: small badge surfaced when the app loses contact
// with the byan_web API or the OS network. Hidden when state is 'online'.
//
// On transition online → offline (or online → unstable), fires a warning
// toast so the user notices even if the indicator is off-screen.

import React, { useEffect, useRef } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { useOnlineStatus, type OnlineStatus } from '../hooks/useOnlineStatus';
import { useToast } from './toast/ToastContext';
import { useT } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/locales';

interface LabelInfo {
  labelKey: MessageKey;
  detailKey: MessageKey;
  className: string;
  icon: React.ReactNode;
}

function describe(status: OnlineStatus): LabelInfo | null {
  switch (status) {
    case 'offline':
      return {
        labelKey: 'connectivity.offline.label',
        detailKey: 'connectivity.offline.detail',
        className: 'border-red-700 bg-red-950/60 text-red-200',
        icon: <CloudOff size={12} />,
      };
    case 'unstable':
      return {
        labelKey: 'connectivity.unstable.label',
        detailKey: 'connectivity.unstable.detail',
        className: 'border-amber-700 bg-amber-950/60 text-amber-200',
        icon: <Wifi size={12} />,
      };
    case 'online':
    default:
      return null;
  }
}

export default function OfflineIndicator() {
  const status = useOnlineStatus();
  const toast = useToast();
  const { t } = useT();
  const previousRef = useRef<OnlineStatus>(status);

  useEffect(() => {
    const prev = previousRef.current;
    if (prev === status) return;
    if (status === 'offline' && prev !== 'offline') {
      toast.warning(t('connectivity.offline.toast'), 0);
    } else if (status === 'unstable' && prev === 'online') {
      toast.warning(t('connectivity.unstable.toast'), 0);
    } else if (status === 'online' && prev !== 'online') {
      toast.success(t('connectivity.recovered.toast'), 3000);
    }
    previousRef.current = status;
  }, [status, toast, t]);

  const info = describe(status);
  if (!info) return null;

  return (
    <div
      role="status"
      title={t(info.detailKey)}
      className={[
        'inline-flex items-center gap-xs px-xs py-0.5 rounded-md border text-[11px] font-medium',
        info.className,
      ].join(' ')}
    >
      {info.icon}
      {t(info.labelKey)}
    </div>
  );
}
