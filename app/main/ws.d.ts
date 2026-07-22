// Minimal ambient types for the `ws` package (no @types/ws installed). The local
// chat bridge only needs the client constructor and the members WsLike uses, so
// this shim keeps `import WebSocket from 'ws'` type-safe without a new dev dep.
declare module 'ws' {
  export default class WebSocket {
    constructor(url: string);
    readyState: number;
    on(event: string, listener: (...args: unknown[]) => void): void;
    send(data: string): void;
    close(): void;
  }
}
