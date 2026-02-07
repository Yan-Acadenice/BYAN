const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * VoiceIntegration - Turbo Whisper voice input integration for BYAN v2
 * 
 * Enables voice-driven agent interaction through Turbo Whisper transcription.
 * Supports GitHub Copilot CLI, Claude Code, and Codex platforms.
 * 
 * @version 2.1.0
 * @module integration/voice-integration
 */
class VoiceIntegration {
  constructor(sessionState, logger) {
    this.sessionState = sessionState;
    this.logger = logger;
    this.enabled = false;
    this.config = null;
    this.serverHealthy = false;
  }

  /**
   * Initialize voice integration
   * Detects Turbo Whisper installation and configuration
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize() {
    try {
      this.logger.debug('[VoiceIntegration] Initializing...');
      
      const installed = await this.detectInstallation();
      if (!installed) {
        this.logger.info('[VoiceIntegration] Turbo Whisper not installed');
        return false;
      }

      const configLoaded = await this.loadConfig();
      if (!configLoaded) {
        this.logger.warn('[VoiceIntegration] Config not found, using defaults');
        return false;
      }

      const healthy = await this.checkHealth();
      if (!healthy) {
        this.logger.warn('[VoiceIntegration] Server not responding');
        return false;
      }

      this.enabled = true;
      this.logger.info('[VoiceIntegration] Initialized successfully');
      this.sessionState.set('voice_integration_enabled', true);
      
      return true;
    } catch (error) {
      this.logger.error('[VoiceIntegration] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Detect if Turbo Whisper is installed
   * @returns {Promise<boolean>}
   */
  async detectInstallation() {
    try {
      const { stdout } = await execAsync('which turbo-whisper');
      const turboWhisperPath = stdout.trim();
      
      if (turboWhisperPath) {
        this.logger.debug(`[VoiceIntegration] Found at: ${turboWhisperPath}`);
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load Turbo Whisper configuration
   * @returns {Promise<boolean>}
   */
  async loadConfig() {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const configPath = path.join(homeDir, '.config', 'turbo-whisper', 'config.json');

      if (!fs.existsSync(configPath)) {
        return false;
      }

      const configContent = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configContent);
      
      this.logger.debug('[VoiceIntegration] Config loaded:', {
        api_url: this.config.api_url,
        hotkey: this.config.hotkey,
        claude_integration: this.config.claude_integration
      });

      return true;
    } catch (error) {
      this.logger.error('[VoiceIntegration] Config load failed:', error);
      return false;
    }
  }

  /**
   * Check if Turbo Whisper server is healthy
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    if (!this.config) {
      return false;
    }

    try {
      const apiUrl = this.config.api_url;
      
      if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
        const port = apiUrl.match(/:(\d+)/)?.[1] || '8000';
        const healthUrl = `http://localhost:${port}/health`;
        
        const { stdout } = await execAsync(`curl -s ${healthUrl}`);
        
        // fedirz/faster-whisper-server returns "OK" (string)
        // Other servers may return {"status": "ok"} (object)
        if (stdout.trim() === 'OK') {
          this.serverHealthy = true;
          return true;
        }
        
        try {
          const response = JSON.parse(stdout);
          this.serverHealthy = response.status === 'ok';
          return this.serverHealthy;
        } catch {
          // If not JSON and not "OK", server not ready
          return false;
        }
      }

      this.serverHealthy = true;
      return true;
    } catch (error) {
      this.logger.debug('[VoiceIntegration] Health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get voice integration status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      enabled: this.enabled,
      installed: this.config !== null,
      serverHealthy: this.serverHealthy,
      config: this.config ? {
        apiUrl: this.config.api_url,
        hotkey: this.config.hotkey?.join('+'),
        claudeIntegration: this.config.claude_integration,
        language: this.config.language
      } : null
    };
  }

  /**
   * Suggest voice input for long-form responses
   * @param {string} context - Current interaction context
   * @returns {string|null} Suggestion message or null
   */
  suggestVoiceInput(context) {
    if (!this.enabled) {
      return null;
    }

    const longFormContexts = [
      'project_description',
      'pain_points',
      'requirements',
      'use_cases',
      'business_rules'
    ];

    if (longFormContexts.some(ctx => context.includes(ctx))) {
      const hotkey = this.config?.hotkey?.join('+') || 'Ctrl+Shift+Space';
      return `💡 Voice input available: Press ${hotkey} to speak your response`;
    }

    return null;
  }

  /**
   * Guide user to install Turbo Whisper
   * @returns {Object} Installation guidance
   */
  getInstallationGuide() {
    return {
      message: 'Turbo Whisper not detected',
      options: [
        {
          title: 'Install via BMAD Agent',
          command: '@bmad-agent-turbo-whisper-integration',
          description: 'Guided installation with wizard'
        },
        {
          title: 'Manual Installation',
          steps: [
            'Ubuntu/Debian: sudo add-apt-repository ppa:bengweeks/turbo-whisper && sudo apt install turbo-whisper',
            'Arch Linux: yay -S turbo-whisper',
            'From source: git clone https://github.com/knowall-ai/turbo-whisper.git && cd turbo-whisper && pip install -e .'
          ]
        },
        {
          title: 'Skip',
          description: 'Continue without voice input'
        }
      ]
    };
  }

  /**
   * Validate voice transcription quality
   * @param {string} transcription - Transcribed text
   * @returns {Object} Quality metrics
   */
  validateTranscription(transcription) {
    const metrics = {
      length: transcription.length,
      wordCount: transcription.split(/\s+/).length,
      hasSpecialChars: /[^\w\s]/g.test(transcription),
      quality: 'unknown'
    };

    if (metrics.wordCount < 3) {
      metrics.quality = 'poor';
      metrics.warning = 'Transcription too short, may be incomplete';
    } else if (metrics.wordCount < 10) {
      metrics.quality = 'fair';
    } else {
      metrics.quality = 'good';
    }

    return metrics;
  }

  /**
   * Offer voice input option during interview
   * @param {string} questionId - Current question identifier
   * @returns {string|null} Voice prompt suggestion
   */
  offerVoicePrompt(questionId) {
    if (!this.enabled) {
      return null;
    }

    const voiceOptimalQuestions = [
      'project_description',
      'pain_points',
      'goals',
      'requirements',
      'use_cases',
      'business_rules'
    ];

    if (voiceOptimalQuestions.includes(questionId)) {
      const hotkey = this.config?.hotkey?.join('+') || 'Ctrl+Shift+Space';
      return `[Voice: ${hotkey}] You can speak your response for faster input`;
    }

    return null;
  }

  /**
   * Log voice usage metrics
   * @param {Object} metrics - Usage metrics
   */
  logUsageMetrics(metrics) {
    const usage = this.sessionState.get('voice_usage_metrics') || [];
    usage.push({
      timestamp: new Date().toISOString(),
      ...metrics
    });
    this.sessionState.set('voice_usage_metrics', usage);
  }
}

module.exports = VoiceIntegration;
