// gpu.test.ts — the hardware-acceleration opt-out decision.

import { describe, it, expect } from 'vitest';
import { shouldDisableGpu, gpuMarkerPath } from '../gpu';

const homedir = () => '/home/yan';

describe('shouldDisableGpu', () => {
  it('is true when BYAN_DISABLE_GPU=1 (env wins, marker irrelevant)', () => {
    expect(shouldDisableGpu({ env: { BYAN_DISABLE_GPU: '1' }, homedir, existsSync: () => false })).toBe(true);
  });

  it('is true when the marker file exists (no env)', () => {
    const marker = gpuMarkerPath({ env: {}, homedir });
    expect(shouldDisableGpu({ env: {}, homedir, existsSync: (p) => p === marker })).toBe(true);
  });

  it('is false by default — neither env nor marker (GPU stays on)', () => {
    expect(shouldDisableGpu({ env: {}, homedir, existsSync: () => false })).toBe(false);
  });

  it('does not treat BYAN_DISABLE_GPU=0 or other values as enabled', () => {
    expect(shouldDisableGpu({ env: { BYAN_DISABLE_GPU: '0' }, homedir, existsSync: () => false })).toBe(false);
  });

  it('is safe when existsSync throws (returns false, never crashes boot)', () => {
    expect(shouldDisableGpu({ env: {}, homedir, existsSync: () => { throw new Error('EACCES'); } })).toBe(false);
  });
});

describe('gpuMarkerPath', () => {
  it('honours XDG_CONFIG_HOME when set', () => {
    expect(gpuMarkerPath({ env: { XDG_CONFIG_HOME: '/xdg' }, homedir })).toBe('/xdg/byan/disable-gpu');
  });

  it('falls back to ~/.config/byan when XDG is unset', () => {
    expect(gpuMarkerPath({ env: {}, homedir })).toBe('/home/yan/.config/byan/disable-gpu');
  });
});
