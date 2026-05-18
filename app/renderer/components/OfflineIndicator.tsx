// OfflineIndicator — F8: small badge surfaced when the app loses contact
// with the byan_web API or the OS network. Hidden when state is 'online'.
//
// On transition online → offline (or online → unstable), fires a warning
// toast so the user notices even if the indicator is off-screen.

import React, { useEffect, useRef } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { useOnlineStatus, type OnlineStatus } from '../hooks/useOnlineStatus';
import { useToast } from './toast/ToastContext';

interface LabelInfo {
  text: string;
  detail: string;
  className: string;
  icon: React.ReactNode;
}

function describe(status: OnlineStatus): LabelInfo | null {
  switch (status) {
    case 'offline':
      return {
        text: 'Offline',
        detail: 'No network connection detected.',
        className: 'border-red-700 bg-red-950/60 text-red-200',
        icon: <CloudOff size={12} />,
      };
    case 'unstable':
      return {
        text: 'API unreachable',
        detail: 'Network is up but byan_web is not responding.',
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
  const previousRef = useRef<OnlineStatus>(status);

  useEffect(() => {
    const prev = previousRef.current;
    if (prev === status) return;
    if (status === 'offline' && prev !== 'offline') {
      toast.warning('You are offline. Changes may not save until connectivity is restored.', 0);
    } else if (status === 'unstable' && prev === 'online') {
      toast.warning('byan_web is not responding. Retrying in the background.', 0);
    } else if (status === 'online' && prev !== 'online') {
      toast.success('Back online.', 3000);
    }
    previousRef.current = status;
  }, [status, toast]);

  const info = describe(status);
  if (!info) return null;

  return (
    <div
      role="status"
      title={info.detail}
      className={[
        'inline-flex items-center gap-xs px-xs py-0.5 rounded-md border text-[11px] font-medium',
        info.className,
      ].join(' ')}
    >
      {info.icon}
      {info.text}
    </div>
  );
}
