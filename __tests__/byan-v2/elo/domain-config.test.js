const config = require('../../../src/byan-v2/elo/domain-config');

describe('domain-config', () => {
  describe('getKFactor', () => {
    test('security has higher K than general', () => {
      expect(config.getKFactor('security')).toBeGreaterThan(config.getKFactor('general'));
    });
    test('algorithms has lower K than general', () => {
      expect(config.getKFactor('algorithms')).toBeLessThan(config.getKFactor('general'));
    });
    test('unknown domain defaults to general', () => {
      expect(config.getKFactor('unknown')).toBe(config.getKFactor('general'));
    });
  });

  describe('getScaffoldLevel', () => {
    test('rating 100 → full scaffold (level 3)', () => {
      expect(config.getScaffoldLevel(100).level).toBe(3);
    });
    test('rating 300 → guided scaffold (level 2)', () => {
      expect(config.getScaffoldLevel(300).level).toBe(2);
    });
    test('rating 900 → adversarial scaffold (level 0)', () => {
      expect(config.getScaffoldLevel(900).level).toBe(0);
    });
  });

  describe('getChallengeStyle', () => {
    test('low rating → guide style', () => {
      expect(config.getChallengeStyle(50)).toBe('guide');
    });
    test('near baseline → peer style', () => {
      expect(config.getChallengeStyle(500)).toBe('peer');
    });
    test('high rating → learner style (user exceeds benchmark)', () => {
      expect(config.getChallengeStyle(900)).toBe('learner');
    });
  });

  describe('getBlockedLabel', () => {
    test('low rating → Moment d\'apprentissage', () => {
      expect(config.getBlockedLabel(150)).toBe("Moment d'apprentissage");
    });
    test('mid rating → Point de precision', () => {
      expect(config.getBlockedLabel(450)).toBe('Point de precision');
    });
    test('high rating → Claim non valide', () => {
      expect(config.getBlockedLabel(700)).toBe('Claim non valide');
    });
  });

  describe('isInDeadZone', () => {
    test('450 is in dead zone', () => {
      expect(config.isInDeadZone(450)).toBe(true);
    });
    test('550 is in dead zone', () => {
      expect(config.isInDeadZone(550)).toBe(true);
    });
    test('400 is not in dead zone', () => {
      expect(config.isInDeadZone(400)).toBe(false);
    });
    test('600 is not in dead zone', () => {
      expect(config.isInDeadZone(600)).toBe(false);
    });
  });
});
