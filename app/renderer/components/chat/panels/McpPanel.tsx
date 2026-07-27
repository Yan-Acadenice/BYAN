// McpPanel — F10: the /mcp slash command surface inside the chat.
//
// It embeds the whole McpServers page rather than re-implementing a read-only
// view: start/stop/restart/add/edit/delete stay in one component, so the chat
// and the Settings route can never disagree about what MCP management does.
//
// The page was authored for a full-screen route, so the embedding contract is
// carried here: the shell is height-bounded and the page scrolls INSIDE it,
// while the app underneath is locked. The layout properties that carry that
// contract are inline styles on purpose — they are behaviour under test, and a
// computed style is checkable where a Tailwind class name in jsdom is only a
// string.

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import McpServers from '../../../pages/McpServers';
import { useT } from '../../../i18n/I18nContext';

interface McpPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function McpPanel({ open, onClose }: McpPanelProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // The page's add/edit form is a nested overlay; dismissing the panel from
      // under it would throw away whatever the user has typed.
      //
      // KNOWN LIMITATION, stated rather than hidden: McpServerFormModal has no
      // Escape handler of its own, so while that form is open Escape does
      // nothing at all. Closing the form on Escape would discard a half-typed
      // entry, which is a call for the form's owner to make, not for this panel
      // to impose from outside. The form's own Cancel button remains the way out.
      if (shellRef.current?.querySelector('[data-mcp-form-modal]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // NO body-scroll lock here on purpose. An earlier version set
  // document.body.style.overflow = 'hidden' while open, and a test asserted it —
  // which made a no-op read as a safeguard. In this app `html, body, #root` are
  // all h-full (renderer/index.css) and every scrollable region is an inner
  // container, so body does not scroll and locking it changes nothing. What
  // actually keeps the page from growing is the shell's own bounded height plus
  // its internal scroll container, and THAT is what the tests pin.

  if (!open) return null;

  return (
    <div
      data-testid="mcp-panel-backdrop"
      className="z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
      onClick={onClose}
    >
      <div
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('mcp.title')}
        data-testid="mcp-panel-shell"
        className="bg-ink-900 border border-ink-700 rounded-xl shadow-2xl w-full max-w-3xl mx-md flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end px-md py-sm border-b border-ink-800 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-500 hover:text-ink-300 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div
          data-testid="mcp-panel-scroll"
          className="p-md"
          style={{ overflowY: 'auto', minHeight: 0 }}
        >
          <McpServers />
        </div>
      </div>
    </div>
  );
}
