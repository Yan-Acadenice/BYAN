// Serializable error type for the IPC boundary.
// Why: Electron serializes thrown Errors via structured-clone — but custom
// classes lose their prototype across the bridge. We attach a `code` field
// directly on the message so the renderer can branch reliably.

import { IpcErrorCode, IpcErrorShape } from '../../shared/ipc-contract';

export class IpcError extends Error implements IpcErrorShape {
  public readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
  }
}

// Wraps an async handler so any thrown value is normalized to IpcError before
// crossing the IPC boundary. Prevents leaking stack traces or non-serializable
// objects (e.g. Buffer references) to the renderer.
export function wrap<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof IpcError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new IpcError('INTERNAL', message);
    }
  };
}
