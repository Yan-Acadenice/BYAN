// useChatDefaults — persistent defaults for the chat creation flow.
//
// WHY: every "new conversation" used to start from zero — re-pick CLI, project,
// agent, scope. Persisting to byanApi.store keeps the user's last choices so
// the modal opens already aligned with the current work context.
//
// Key: `chat.defaults` — namespaced under `chat.` so future per-conversation
// state (last cli per conv, drafts) can sit alongside.

import { useCallback, useEffect, useState } from 'react';
import type { ChatCliProvider, ChatScope } from '../../shared/ipc-contract';

export interface ChatDefaults {
  cli: ChatCliProvider;
  projectId: string | null;
  agentId: string | null;
  scope: ChatScope;
}

export const DEFAULT_CHAT_DEFAULTS: ChatDefaults = {
  cli: 'claude-code',
  projectId: null,
  agentId: null,
  scope: {
    types: [],
    projectId: null,
    knowledgeTags: [],
    memoryTags: [],
    memoryLimit: 10,
    knowledgeLimit: 10,
    tokenBudget: 2000,
  },
};

const STORE_KEY = 'chat.defaults';

export function useChatDefaults(): {
  defaults: ChatDefaults;
  setDefaults: (next: ChatDefaults) => void;
  loaded: boolean;
} {
  const [defaults, setLocal] = useState<ChatDefaults>(DEFAULT_CHAT_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await window.byanApi.store.get<ChatDefaults>(STORE_KEY);
        if (!cancelled && stored) {
          setLocal({ ...DEFAULT_CHAT_DEFAULTS, ...stored, scope: { ...DEFAULT_CHAT_DEFAULTS.scope, ...(stored.scope ?? {}) } });
        }
      } catch {
        // Non-fatal — fall back to in-memory defaults.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setDefaults = useCallback((next: ChatDefaults) => {
    setLocal(next);
    void window.byanApi.store.set(STORE_KEY, next).catch(() => {
      // Best-effort persistence — UI already reflects the change.
    });
  }, []);

  return { defaults, setDefaults, loaded };
}
