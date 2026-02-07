const VoiceIntegration = require('../../../src/byan-v2/integration/voice-integration');
const SessionState = require('../../../src/byan-v2/context/session-state');
const Logger = require('../../../src/byan-v2/observability/logger');

describe('VoiceIntegration', () => {
  let voiceIntegration;
  let sessionState;
  let logger;

  beforeEach(() => {
    sessionState = new SessionState('test-session');
    logger = new Logger();
    voiceIntegration = new VoiceIntegration(sessionState, logger);
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      expect(voiceIntegration.enabled).toBe(false);
      expect(voiceIntegration.config).toBeNull();
      expect(voiceIntegration.serverHealthy).toBe(false);
    });
  });

  describe('detectInstallation', () => {
    it('should return false when turbo-whisper not installed', async () => {
      const installed = await voiceIntegration.detectInstallation();
      expect(typeof installed).toBe('boolean');
    });
  });

  describe('getStatus', () => {
    it('should return status object', () => {
      const status = voiceIntegration.getStatus();
      
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('installed');
      expect(status).toHaveProperty('serverHealthy');
      expect(status).toHaveProperty('config');
    });

    it('should have enabled false initially', () => {
      const status = voiceIntegration.getStatus();
      expect(status.enabled).toBe(false);
    });
  });

  describe('suggestVoiceInput', () => {
    it('should return null when not enabled', () => {
      const suggestion = voiceIntegration.suggestVoiceInput('project_description');
      expect(suggestion).toBeNull();
    });

    it('should suggest voice input for long-form contexts when enabled', () => {
      voiceIntegration.enabled = true;
      voiceIntegration.config = { hotkey: ['ctrl', 'shift', 'space'] };
      
      const suggestion = voiceIntegration.suggestVoiceInput('project_description');
      expect(suggestion).toContain('Voice input available');
      expect(suggestion).toContain('Ctrl+Shift+Space');
    });

    it('should not suggest for short-form contexts', () => {
      voiceIntegration.enabled = true;
      voiceIntegration.config = { hotkey: ['ctrl', 'shift', 'space'] };
      
      const suggestion = voiceIntegration.suggestVoiceInput('agent_name');
      expect(suggestion).toBeNull();
    });
  });

  describe('getInstallationGuide', () => {
    it('should return installation options', () => {
      const guide = voiceIntegration.getInstallationGuide();
      
      expect(guide).toHaveProperty('message');
      expect(guide).toHaveProperty('options');
      expect(Array.isArray(guide.options)).toBe(true);
      expect(guide.options.length).toBeGreaterThan(0);
    });
  });

  describe('validateTranscription', () => {
    it('should rate short transcriptions as poor', () => {
      const result = voiceIntegration.validateTranscription('yes');
      
      expect(result.quality).toBe('poor');
      expect(result.wordCount).toBe(1);
      expect(result).toHaveProperty('warning');
    });

    it('should rate medium transcriptions as fair', () => {
      const result = voiceIntegration.validateTranscription('This is a short test');
      
      expect(result.quality).toBe('fair');
      expect(result.wordCount).toBe(5);
    });

    it('should rate long transcriptions as good', () => {
      const result = voiceIntegration.validateTranscription(
        'This is a longer transcription with more than ten words for testing quality'
      );
      
      expect(result.quality).toBe('good');
      expect(result.wordCount).toBeGreaterThan(10);
    });
  });

  describe('offerVoicePrompt', () => {
    it('should return null when not enabled', () => {
      const prompt = voiceIntegration.offerVoicePrompt('project_description');
      expect(prompt).toBeNull();
    });

    it('should offer voice prompt for optimal questions', () => {
      voiceIntegration.enabled = true;
      voiceIntegration.config = { hotkey: ['ctrl', 'shift', 'space'] };
      
      const prompt = voiceIntegration.offerVoicePrompt('project_description');
      expect(prompt).toContain('Voice:');
      expect(prompt).toContain('Ctrl+Shift+Space');
    });

    it('should not offer voice prompt for non-optimal questions', () => {
      voiceIntegration.enabled = true;
      voiceIntegration.config = { hotkey: ['ctrl', 'shift', 'space'] };
      
      const prompt = voiceIntegration.offerVoicePrompt('agent_name');
      expect(prompt).toBeNull();
    });
  });

  describe('logUsageMetrics', () => {
    it('should log usage metrics to session state', () => {
      const metrics = {
        action: 'voice_input',
        duration: 5000,
        quality: 'good'
      };
      
      voiceIntegration.logUsageMetrics(metrics);
      
      const logged = sessionState.get('voice_usage_metrics');
      expect(Array.isArray(logged)).toBe(true);
      expect(logged.length).toBe(1);
      expect(logged[0]).toHaveProperty('timestamp');
      expect(logged[0].action).toBe('voice_input');
    });

    it('should append to existing metrics', () => {
      voiceIntegration.logUsageMetrics({ action: 'test1' });
      voiceIntegration.logUsageMetrics({ action: 'test2' });
      
      const logged = sessionState.get('voice_usage_metrics');
      expect(logged.length).toBe(2);
    });
  });
});
