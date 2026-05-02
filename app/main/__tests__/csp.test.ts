// CSP unit tests — runs without booting Electron.
// We mock the Session.webRequest interface and capture what applyCsp injects.

import { describe, expect, it, vi } from 'vitest';
import { applyCsp, buildCspHeader, CSP_DIRECTIVES } from '../csp';

type HeadersReceivedListener = (
  details: { responseHeaders?: Record<string, string[]> },
  callback: (response: { responseHeaders: Record<string, string[]> }) => void
) => void;

function makeFakeSession() {
  let registered: HeadersReceivedListener | null = null;
  const onHeadersReceived = vi.fn((listener: HeadersReceivedListener) => {
    registered = listener;
  });
  return {
    session: { webRequest: { onHeadersReceived } } as unknown as Electron.Session,
    onHeadersReceived,
    invoke(details: { responseHeaders?: Record<string, string[]> }) {
      if (!registered) throw new Error('listener not registered');
      let captured: Record<string, string[]> | null = null;
      registered(details, (response) => {
        captured = response.responseHeaders;
      });
      if (!captured) throw new Error('callback not invoked');
      return captured;
    }
  };
}

describe('CSP_DIRECTIVES', () => {
  it('whitelists BYAN cloud API for HTTPS and WSS', () => {
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://byan-api.stark.a3n.fr');
    expect(CSP_DIRECTIVES['connect-src']).toContain('wss://byan-api.stark.a3n.fr');
  });

  it('whitelists localhost WebSocket for F3 local mode', () => {
    expect(CSP_DIRECTIVES['connect-src']).toContain('ws://localhost:*');
  });

  it('whitelists Google APIs for MCP gdrive', () => {
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://*.googleapis.com');
  });

  it('forbids unsafe-eval everywhere', () => {
    for (const sources of Object.values(CSP_DIRECTIVES)) {
      expect(sources).not.toContain("'unsafe-eval'");
    }
  });

  it('forbids unsafe-inline in script-src (only style-src may use it)', () => {
    expect(CSP_DIRECTIVES['script-src']).not.toContain("'unsafe-inline'");
    expect(CSP_DIRECTIVES['style-src']).toContain("'unsafe-inline'");
  });

  it('locks frame-src and object-src down', () => {
    expect(CSP_DIRECTIVES['frame-src']).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"]);
  });

  it('pins base-uri and form-action to self', () => {
    expect(CSP_DIRECTIVES['base-uri']).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES['form-action']).toEqual(["'self'"]);
  });
});

describe('buildCspHeader', () => {
  it('produces a single-line header with all directives', () => {
    const header = buildCspHeader();
    for (const directive of Object.keys(CSP_DIRECTIVES)) {
      expect(header).toContain(directive);
    }
    expect(header).not.toContain('\n');
  });

  it('separates directives with semicolons', () => {
    const header = buildCspHeader();
    const directiveCount = Object.keys(CSP_DIRECTIVES).length;
    expect(header.split(';').length).toBe(directiveCount);
  });
});

describe('applyCsp', () => {
  it('registers a single onHeadersReceived listener', () => {
    const fake = makeFakeSession();
    applyCsp(fake.session);
    expect(fake.onHeadersReceived).toHaveBeenCalledTimes(1);
  });

  it('injects Content-Security-Policy on every response', () => {
    const fake = makeFakeSession();
    applyCsp(fake.session);
    const headers = fake.invoke({ responseHeaders: { 'X-Powered-By': ['vite'] } });
    expect(headers['Content-Security-Policy']).toEqual([buildCspHeader()]);
    expect(headers['X-Powered-By']).toEqual(['vite']);
  });

  it('strips upstream CSP headers before injecting ours', () => {
    const fake = makeFakeSession();
    applyCsp(fake.session);
    const headers = fake.invoke({
      responseHeaders: {
        'content-security-policy': ["default-src 'unsafe-inline'"],
        'Content-Security-Policy': ["script-src 'unsafe-eval'"]
      }
    });
    const cspKeys = Object.keys(headers).filter((k) => k.toLowerCase() === 'content-security-policy');
    expect(cspKeys).toHaveLength(1);
    expect(headers[cspKeys[0]]).toEqual([buildCspHeader()]);
  });

  it('handles responses with no upstream headers', () => {
    const fake = makeFakeSession();
    applyCsp(fake.session);
    const headers = fake.invoke({});
    expect(headers['Content-Security-Policy']).toEqual([buildCspHeader()]);
  });
});
