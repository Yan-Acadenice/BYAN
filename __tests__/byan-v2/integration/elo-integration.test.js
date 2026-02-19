/**
 * Integration tests: ELO Trust System in ByanV2
 *
 * Validates that EloEngine is correctly wired into ByanV2
 * and that all public ELO methods work end-to-end.
 */

const ByanV2  = require('../../../src/byan-v2');
const EloEngine = require('../../../src/byan-v2/elo/index');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

function makeByan(eloOpts = {}) {
  const tmpFile = path.join(os.tmpdir(), `elo-integration-${Date.now()}.json`);
  const byan = new ByanV2({
    sessionId: 'test-elo-integration',
    bmad_features: {
      elo: { enabled: true, storage_path: tmpFile, ...eloOpts },
      // disable other modules to keep tests focused
      glossary: { enabled: false },
      five_whys: { enabled: false },
      active_listening: { enabled: false },
      mantras: { validate: false },
      voice_integration: { enabled: false }
    }
  });
  return { byan, tmpFile };
}

describe('ELO integration in ByanV2', () => {
  let byan, tmpFile;

  beforeEach(() => {
    ({ byan, tmpFile } = makeByan());
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('eloEngine is initialized when enabled', () => {
    expect(byan.eloEngine).toBeInstanceOf(EloEngine);
  });

  test('eloEngine is null when disabled', () => {
    const b = new ByanV2({ bmad_features: { elo: { enabled: false } } });
    expect(b.eloEngine).toBeUndefined();
  });

  describe('getClaimContext()', () => {
    test('returns challenge context for a domain', () => {
      const ctx = byan.getClaimContext('security');
      expect(ctx.domain).toBe('security');
      expect(typeof ctx.promptInstructions).toBe('string');
      expect(ctx.firstBlood).toBe(true);
    });

    test('throws when ELO disabled', () => {
      const b = new ByanV2({ bmad_features: { elo: { enabled: false } } });
      expect(() => b.getClaimContext('security')).toThrow('ELO system not enabled');
    });
  });

  describe('recordClaimResult()', () => {
    test('returns newRating and message on VALIDATED', () => {
      const res = byan.recordClaimResult('javascript', 'VALIDATED');
      expect(typeof res.newRating).toBe('number');
      expect(typeof res.message).toBe('string');
    });

    test('tiltDetected after 3 consecutive BLOCKs', () => {
      byan.recordClaimResult('security', 'BLOCKED');
      byan.recordClaimResult('security', 'BLOCKED');
      const res = byan.recordClaimResult('security', 'BLOCKED');
      expect(res.tiltDetected).toBe(true);
      expect(res.message).toContain('consecutivement');
    });
  });

  describe('declareExpertise()', () => {
    test('sets provisional rating', () => {
      const res = byan.declareExpertise('security', 'expert');
      expect(res.provisionalRating).toBe(800);
      const ctx = byan.getClaimContext('security');
      expect(ctx.rating).toBe(800);
    });
  });

  describe('getEloDashboard()', () => {
    test('returns non-empty string', () => {
      byan.recordClaimResult('security', 'BLOCKED', { blockedReason: 'terminology_gap' });
      const dash = byan.getEloDashboard('security');
      expect(typeof dash).toBe('string');
      expect(dash).toContain('security');
    });
  });

  describe('getEloSummary()', () => {
    test('returns empty array initially', () => {
      expect(byan.getEloSummary()).toEqual([]);
    });

    test('includes domain after activity', () => {
      byan.recordClaimResult('javascript', 'VALIDATED');
      const summary = byan.getEloSummary();
      expect(summary.some(d => d.domain === 'javascript')).toBe(true);
    });
  });

  describe('routeLLM()', () => {
    test('returns model string', () => {
      const { model } = byan.routeLLM();
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });

    test('returns default when ELO disabled', () => {
      const b = new ByanV2({ bmad_features: { elo: { enabled: false } } });
      const { model } = b.routeLLM();
      expect(model).toBe('claude-sonnet-4.5');
    });
  });

  describe('getSessionSummary()', () => {
    test('includes elo summary when enabled', async () => {
      byan.recordClaimResult('javascript', 'VALIDATED');
      const summary = await byan.getSessionSummary();
      expect(summary.elo).toBeDefined();
      expect(summary.recommendedModel).toBeDefined();
    });
  });

  describe('startSession() applies idle decay', () => {
    test('calls applyIdleDecay without throwing', async () => {
      await expect(byan.startSession()).resolves.toBeDefined();
    });
  });
});
