import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus, type OnlineStatus } from '../hooks/useOnlineStatus';

function Probe({ onStatus, ping, intervalMs }: {
  onStatus: (s: OnlineStatus) => void;
  ping?: () => Promise<unknown>;
  intervalMs?: number;
}) {
  const status = useOnlineStatus({ ping, intervalMs });
  React.useEffect(() => { onStatus(status); }, [status, onStatus]);
  return <span data-testid="status">{status}</span>;
}

describe('useOnlineStatus — events', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom sets navigator.onLine to true by default.
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('starts online when navigator.onLine is true', () => {
    let observed: OnlineStatus = 'offline';
    render(<Probe onStatus={(s) => { observed = s; }} ping={() => Promise.resolve()} />);
    expect(observed).toBe('online');
  });

  it('starts offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    let observed: OnlineStatus = 'online';
    render(<Probe onStatus={(s) => { observed = s; }} ping={() => Promise.resolve()} />);
    expect(observed).toBe('offline');
  });

  it('flips to offline on window.offline event', () => {
    let observed: OnlineStatus = 'online';
    render(<Probe onStatus={(s) => { observed = s; }} ping={() => Promise.resolve()} />);

    act(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    expect(observed).toBe('offline');
  });

  it('returns to online on window.online event', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    let observed: OnlineStatus = 'offline';
    render(<Probe onStatus={(s) => { observed = s; }} ping={() => Promise.resolve()} />);
    expect(observed).toBe('offline');

    act(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(observed).toBe('online');
  });
});

describe('useOnlineStatus — ping behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays online while pings succeed', async () => {
    let observed: OnlineStatus = 'online';
    const ping = vi.fn(() => Promise.resolve('ok'));
    render(<Probe onStatus={(s) => { observed = s; }} ping={ping} intervalMs={100} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(observed).toBe('online');
    expect(ping).toHaveBeenCalled();
  });

  it('flips to unstable after two consecutive ping failures', async () => {
    let observed: OnlineStatus = 'online';
    const ping = vi.fn(() => Promise.reject(new Error('boom')));
    render(<Probe onStatus={(s) => { observed = s; }} ping={ping} intervalMs={100} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(observed).toBe('unstable');
  });

  it('treats AUTH_REQUIRED as online (login page case)', async () => {
    let observed: OnlineStatus = 'online';
    const authErr: Error & { code?: string } = new Error('unauthenticated');
    authErr.code = 'AUTH_REQUIRED';
    const ping = vi.fn(() => Promise.reject(authErr));
    render(<Probe onStatus={(s) => { observed = s; }} ping={ping} intervalMs={100} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(observed).toBe('online');
  });
});
