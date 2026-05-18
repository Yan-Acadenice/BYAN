// Deep link parser — F17: turns a byan://* URL string into a typed
// DeepLink shape the renderer can route on.
//
// Schemes supported:
//   byan://project/<id>            → open the project
//   byan://chat/<conversation-id>  → open a conversation
//   byan://agent/<slug>            → open an agent
//   byan://settings                → open the settings page
//
// Anything else parses as { kind: 'unknown' } so the renderer can toast
// the user rather than silently dropping the link.

export type DeepLinkKind = 'project' | 'chat' | 'agent' | 'settings' | 'unknown';

export interface DeepLink {
  kind: DeepLinkKind;
  // Resource id (project id, conversation id, agent slug). Undefined for kinds
  // that do not carry an id (e.g. 'settings', 'unknown').
  id?: string;
  // Query parameters from the URL.
  params?: Record<string, string>;
  // The original URL string — useful for telemetry / toasts when kind=unknown.
  raw: string;
}

export const DEEP_LINK_SCHEME = 'byan';

function parseSearchParams(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}

export function parseDeepLink(raw: unknown): DeepLink | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;

  // For byan://foo/bar — url.hostname is 'foo' and url.pathname is '/bar'.
  // For byan://foo (no path) — url.hostname is 'foo' and url.pathname is ''.
  const host = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split('/').filter((s) => s.length > 0);
  const params = parseSearchParams(url);
  const hasParams = Object.keys(params).length > 0;

  const link: DeepLink = { kind: 'unknown', raw, ...(hasParams ? { params } : {}) };

  switch (host) {
    case 'project': {
      const id = pathSegments[0];
      if (id) {
        link.kind = 'project';
        link.id = id;
      }
      return link;
    }
    case 'chat': {
      const id = pathSegments[0];
      if (id) {
        link.kind = 'chat';
        link.id = id;
      }
      return link;
    }
    case 'agent': {
      const id = pathSegments[0];
      if (id) {
        link.kind = 'agent';
        link.id = id;
      }
      return link;
    }
    case 'settings':
      link.kind = 'settings';
      return link;
    default:
      return link;
  }
}

// True if the given argv entry looks like a byan:// URL. Used by main to scan
// process.argv on launch (Windows / Linux pass the URL as a CLI argument when
// the OS routes the protocol to our app).
export function findDeepLinkInArgv(argv: ReadonlyArray<string>): string | null {
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}://`)) {
      return arg;
    }
  }
  return null;
}
