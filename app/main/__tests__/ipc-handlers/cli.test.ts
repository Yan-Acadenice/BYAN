// cli IPC handler tests — F4 implementation.
// Verifies that detect() delegates to detectAll from env-detect.

import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../../shared/ipc-contract';

// Mock env-detect so no real which/where probes run during tests.
vi.mock('../../env-detect', () => ({
  detectAll: vi.fn().mockResolvedValue({ claude: '/usr/bin/claude' }),
}));

import * as cli from '../../ipc-handlers/cli';
import { detectAll } from '../../env-detect';

describe('cli.detect', () => {
  it('returns an object from detectAll', async () => {
    const r = await cli.detect();
    expect(typeof r).toBe('object');
    expect(r).not.toBeNull();
  });

  it('delegates to detectAll', async () => {
    await cli.detect();
    expect(detectAll).toHaveBeenCalled();
  });

  it('returned keys, if present, are strings', async () => {
    const r = await cli.detect();
    for (const key of ['claude', 'codex', 'copilot'] as const) {
      const v = r[key];
      if (v !== undefined) {
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('cli.register', () => {
  it('registers detect channel on ipcMain', () => {
    const handle = vi.fn();
    cli.register({ handle } as never);
    const channels = handle.mock.calls.map((c) => c[0]);
    expect(channels).toContain(IPC_CHANNELS.cli.detect);
  });
});
