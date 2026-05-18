// DeepLinkRouter — F17: listens for byan:deepLink events from main and
// routes the user to the matching page.
//
// Must render INSIDE ToastProvider because we surface routing feedback via
// toasts (success on recognized kinds, warning on unknown).
//
// Beyond MVP: when a chat/project/agent page wants to consume the id, this
// component should expose a context (or write to the store) so the target
// page can auto-select the right resource on mount. For now we navigate to
// the page and let the user finish the click.

import { useEffect } from 'react';
import type { DeepLink } from '../../shared/ipc-contract';
import type { NavPage } from './Sidebar';
import { useToast } from './toast/ToastContext';

const KIND_TO_PAGE: Record<DeepLink['kind'], NavPage | null> = {
  project: 'projects',
  chat: 'chat',
  agent: 'agents',
  settings: 'settings',
  unknown: null,
};

interface DeepLinkRouterProps {
  // True when the user is already logged in. Deep links that arrive on the
  // login / onboarding screens are buffered by the user implicitly (they
  // click through and a fresh event will not re-fire), so we just no-op.
  isAuthenticated: boolean;
  onNavigate(page: NavPage): void;
}

export default function DeepLinkRouter({ isAuthenticated, onNavigate }: DeepLinkRouterProps) {
  const toast = useToast();

  useEffect(() => {
    if (typeof window.byanEvents === 'undefined') return;
    const off = window.byanEvents.on('byan:deepLink', (payload: unknown) => {
      const link = payload as DeepLink;
      if (!link || typeof link.kind !== 'string') return;

      if (link.kind === 'unknown') {
        toast.warning(`Unrecognized deep link: ${link.raw}`);
        return;
      }

      const target = KIND_TO_PAGE[link.kind];
      if (!target) return;

      if (!isAuthenticated) {
        toast.info('Sign in to follow the link.');
        return;
      }
      onNavigate(target);
      const detail = link.id ? `${link.kind}:${link.id}` : link.kind;
      toast.success(`Opened ${detail} from deep link`);
    });
    return off;
  }, [isAuthenticated, onNavigate, toast]);

  return null;
}
