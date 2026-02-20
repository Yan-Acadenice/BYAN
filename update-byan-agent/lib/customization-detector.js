const fs = require('fs');
const path = require('path');

/**
 * CustomizationDetector - Detects user customizations in BYAN files
 * Helps preserve user changes during updates
 */
class CustomizationDetector {
  constructor(installPath) {
    this.installPath = installPath;
    this.byanDir = path.join(installPath, '_byan');
  }

  /**
   * Detect customized files that should be preserved
   * @returns {Promise<Array>} List of customized file paths
   */
  async detectCustomizations() {
    const customizations = [];

    // Preserve config.yaml
    const configPath = path.join(this.byanDir, 'bmb', 'config.yaml');
    if (fs.existsSync(configPath)) {
      customizations.push({
        path: configPath,
        type: 'config',
        preserve: true
      });
    }

    // Preserve _memory directory
    const memoryDir = path.join(this.byanDir, '_memory');
    if (fs.existsSync(memoryDir)) {
      customizations.push({
        path: memoryDir,
        type: 'memory',
        preserve: true
      });
    }

    // Preserve _byan-output directory
    const outputDir = path.join(this.installPath, '_byan-output');
    if (fs.existsSync(outputDir)) {
      customizations.push({
        path: outputDir,
        type: 'output',
        preserve: true
      });
    }

    return customizations;
  }

  /**
   * Check if a file has been modified by user
   * @param {string} filePath - File to check
   * @returns {Promise<boolean>} True if modified
   */
  async isModified(filePath) {
    // Simple check based on modification time
    // In a more advanced version, could compare with original checksums
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const stats = fs.statSync(filePath);
    const now = Date.now();
    const hoursSinceModification = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

    // If modified in last 24h, consider it customized
    return hoursSinceModification < 24;
  }
}

module.exports = CustomizationDetector;
