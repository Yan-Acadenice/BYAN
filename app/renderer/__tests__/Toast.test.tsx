import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from '../components/toast/ToastContext';

// Tiny helper component to drive the toast API from a test.
function ToastDriver({ onReady }: { onReady: (api: ReturnType<typeof useToast>) => void }) {
  const api = useToast();
  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);
  return null;
}

describe('ToastProvider — basic behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no toast is active', () => {
    const { container } = render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>
    );
    expect(container.textContent).toContain('app');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a success toast and dismisses it after the duration', async () => {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <ToastDriver onReady={(a) => { api = a; }} />
      </ToastProvider>
    );
    act(() => { api.success('done', 1000); });
    expect(screen.getByText('done')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByText('done')).toBeNull();
  });

  it('stacks multiple toasts and dismisses on click', () => {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <ToastDriver onReady={(a) => { api = a; }} />
      </ToastProvider>
    );
    act(() => {
      api.info('first', 0);
      api.warning('second', 0);
      api.error('third', 0);
    });
    expect(screen.getByText('first')).toBeTruthy();
    expect(screen.getByText('second')).toBeTruthy();
    expect(screen.getByText('third')).toBeTruthy();

    const dismissBtns = screen.getAllByLabelText('Dismiss notification');
    act(() => { fireEvent.click(dismissBtns[0]); });
    expect(screen.queryByText('first')).toBeNull();
    expect(screen.getByText('second')).toBeTruthy();
    expect(screen.getByText('third')).toBeTruthy();
  });

  it('evicts oldest toast when maxStack is exceeded', () => {
    let api!: ReturnType<typeof useToast>;
    render(
      <ToastProvider maxStack={2}>
        <ToastDriver onReady={(a) => { api = a; }} />
      </ToastProvider>
    );
    act(() => {
      api.info('a', 0);
      api.info('b', 0);
      api.info('c', 0);
    });
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('c')).toBeTruthy();
  });

  it('duration=0 keeps the toast until manual dismiss', () => {
    let api!: ReturnType<typeof useToast>;
    let id = '';
    render(
      <ToastProvider>
        <ToastDriver onReady={(a) => { api = a; }} />
      </ToastProvider>
    );
    act(() => { id = api.info('sticky', 0); });

    vi.advanceTimersByTime(10_000);
    expect(screen.getByText('sticky')).toBeTruthy();

    act(() => { api.dismiss(id); });
    expect(screen.queryByText('sticky')).toBeNull();
  });

  it('returns a no-op API outside a provider (does not throw)', () => {
    let api!: ReturnType<typeof useToast>;
    render(<ToastDriver onReady={(a) => { api = a; }} />);
    expect(() => api.success('floating')).not.toThrow();
    expect(api._toasts()).toEqual([]);
  });
});
