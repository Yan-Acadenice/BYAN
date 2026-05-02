// Ambient declaration that augments the renderer's global Window with the
// preload-injected `byanApi` namespace. The shape lives in app/shared/ipc-contract.ts
// (the single source of truth) so adding a method there flows through to TS
// completion in renderer files automatically.

import type { ByanApi } from '../shared/ipc-contract';

declare global {
  interface Window {
    byanApi: ByanApi;
  }
}

export {};
