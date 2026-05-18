// F16: axe-core scans of representative pages to catch the most common
// a11y bugs (missing labels, contrast, focus, semantic structure).
//
// Uses axe-core directly (no vitest-axe wrapper) because the wrapper does
// not play well with vitest 2's expect.extend. We assert against the
// violations array manually — slightly more verbose, zero magic.

import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import axe, { type Result as AxeResult } from 'axe-core';

import McpServers from '../../pages/McpServers';
import Settings from '../../pages/Settings';
import McpServerFormModal from '../../components/mcp/McpServerFormModal';
import { I18nProvider } from '../../i18n/I18nContext';
import { ToastProvider } from '../../components/toast/ToastContext';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider initialLocale="en">
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

// Stub the IPC bridge so pages can mount without electron present.
beforeAll(() => {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'byanApi', {
      configurable: true,
      value: {
        mcp: {
          list: vi.fn(async () => []),
          start: vi.fn(),
          stop: vi.fn(),
          status: vi.fn(),
          add: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        auth: { logout: vi.fn(async () => undefined) },
        app: { openExternal: vi.fn() },
        store: {
          get: vi.fn(async () => null),
          set: vi.fn(async () => undefined),
        },
        byanWeb: {
          me: vi.fn(async () => ({ id: 'u1', email: '', username: '', displayName: null, role: 'user' })),
        },
      },
    });
    Object.defineProperty(window, 'byanEvents', {
      configurable: true,
      value: { on: () => () => {} },
    });
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

// Color-contrast checks are skipped in JSDOM because the headless renderer
// reports computed colors as transparent — every test would fail with false
// positives. We re-enable contrast checks in the e2e suite once that lands.
const AXE_CONFIG: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

async function scan(container: Element): Promise<AxeResult[]> {
  const result = await axe.run(container, AXE_CONFIG);
  return result.violations;
}

function formatViolations(violations: AxeResult[]): string {
  return violations
    .map((v) => `[${v.id}] ${v.help} (${v.nodes.length} node${v.nodes.length > 1 ? 's' : ''})`)
    .join('\n');
}

describe('a11y — McpServers page', () => {
  it('has no critical axe violations', async () => {
    const { container } = render(<Providers><McpServers /></Providers>);
    await new Promise((r) => setTimeout(r, 0));
    const violations = await scan(container);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

describe('a11y — Settings page', () => {
  it('has no critical axe violations', async () => {
    const { container } = render(<Providers><Settings onLogout={() => {}} /></Providers>);
    const violations = await scan(container);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

describe('a11y — McpServerFormModal (add)', () => {
  it('has no critical axe violations when open in add mode', async () => {
    const { container } = render(
      <Providers>
        <McpServerFormModal open mode="add" onClose={() => {}} onSaved={() => {}} />
      </Providers>
    );
    const violations = await scan(container);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});
