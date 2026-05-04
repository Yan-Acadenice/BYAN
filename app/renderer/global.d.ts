// Ambient declaration that augments the renderer's global Window with the
// preload-injected `byanApi` and `byanEvents` namespaces.
// The ByanApi shape lives in app/shared/ipc-contract.ts (single source of truth).

import type { ByanApi } from '../shared/ipc-contract';

// Event listener shape for the one-way main->renderer push bridge.
// on() returns an unsubscribe function to prevent listener leaks.
export interface ByanEvents {
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    byanApi: ByanApi;
    byanEvents: ByanEvents;
  }
}

export {};
