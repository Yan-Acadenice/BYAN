// useInstallProject (N2) — picks a folder, streams install progress, records the
// project, calls onDone. Mocks byanApi + byanEvents.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInstallProject } from '../hooks/useInstallProject';
import type { LocalInstallProgress } from '../../shared/ipc-contract';

const mockDialog = vi.fn();
const mockInstall = vi.fn();
const mockRecord = vi.fn();
let progressCb: ((p: unknown) => void) | null = null;

beforeEach(() => {
  progressCb = null;
  Object.defineProperty(window, 'byanApi', {
    value: {
      fs: { openProjectDialog: mockDialog },
      projectsLocal: { install: mockInstall, record: mockRecord },
    },
    writable: true, configurable: true,
  });
  Object.defineProperty(window, 'byanEvents', {
    value: {
      on: (channel: string, cb: (p: unknown) => void) => {
        if (channel === 'byan:install:progress') progressCb = cb;
        return () => { progressCb = null; };
      },
    },
    writable: true, configurable: true,
  });
  mockDialog.mockResolvedValue('/home/yan/monprojet');
  mockRecord.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

function emit(p: LocalInstallProgress) { progressCb?.(p); }

describe('useInstallProject', () => {
  it('does nothing when the folder picker is cancelled', async () => {
    mockDialog.mockResolvedValue(null);
    const { result } = renderHook(() => useInstallProject());
    let ret: string | null = 'x';
    await act(async () => { ret = await result.current.run(); });
    expect(ret).toBeNull();
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it('installs, streams progress, records the project, and calls onDone', async () => {
    // install resolves after we have emitted progress.
    mockInstall.mockImplementation(async () => {
      emit({ type: 'step', index: 1, total: 2, id: 'copy-byan', label: 'Copie' });
      emit({ type: 'log', line: 'copie ok' });
      emit({ type: 'step', index: 2, total: 2, id: 'verify', label: 'Verification' });
      return { ok: true, verify: { passed: 2, total: 2, failed: [] }, launch: null };
    });
    const onDone = vi.fn();
    const { result } = renderHook(() => useInstallProject(onDone));

    await act(async () => { await result.current.run(); });

    expect(mockInstall).toHaveBeenCalledWith({ projectRoot: '/home/yan/monprojet' });
    expect(result.current.step).toEqual({ index: 2, total: 2, label: 'Verification' });
    expect(result.current.logs).toContain('copie ok');
    expect(result.current.result).toMatchObject({ ok: true });
    expect(mockRecord).toHaveBeenCalledWith({ name: 'monprojet', path: '/home/yan/monprojet' });
    expect(onDone).toHaveBeenCalledWith('/home/yan/monprojet');
    expect(result.current.installing).toBe(false);
  });

  it('surfaces an install error', async () => {
    mockInstall.mockRejectedValue(new Error('templates introuvables'));
    const { result } = renderHook(() => useInstallProject());
    await act(async () => { await result.current.run(); });
    expect(result.current.error).toMatch(/templates introuvables/);
    expect(result.current.installing).toBe(false);
  });
});
