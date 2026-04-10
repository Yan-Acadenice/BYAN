/**
 * STT Engine Abstraction Layer
 *
 * Auto-detects the best available speech-to-text engine.
 * Priority: Parakeet TDT > Whisper > none.
 *
 * @module stt/engine
 */

const { execSync } = require('child_process');
const chalk = require('chalk');

const PARAKEET_MIN_VRAM = 4000; // 4 GB
const WHISPER_MIN_VRAM = 1000;  // 1 GB for GPU mode

/**
 * Detect GPU presence and capabilities via nvidia-smi.
 * Shared across all STT backends to avoid duplication.
 *
 * @returns {{ hasGPU: boolean, vram: number, gpuName: string }}
 */
function detectGPU() {
  try {
    const raw = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (!raw || raw === 'NO_GPU') {
      return { hasGPU: false, vram: 0, gpuName: '' };
    }

    const [gpuName, vramStr] = raw.split(',').map(s => s.trim());
    const vram = parseInt(vramStr, 10) || 0;

    return { hasGPU: true, vram, gpuName };
  } catch {
    return { hasGPU: false, vram: 0, gpuName: '' };
  }
}

/**
 * Check whether a shell command is available on PATH.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check Python availability and optional package presence.
 *
 * @returns {{ available: boolean, version: string, hasNemo: boolean }}
 */
function checkPython() {
  const available = commandExists('python3');
  if (!available) {
    return { available: false, version: '', hasNemo: false };
  }

  let version = '';
  try {
    version = execSync('python3 --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim().replace('Python ', '');
  } catch { /* ignore */ }

  let hasNemo = false;
  try {
    execSync('python3 -c "import nemo.collections.asr"', {
      stdio: ['pipe', 'pipe', 'ignore']
    });
    hasNemo = true;
  } catch { /* ignore */ }

  return { available, version, hasNemo };
}

/**
 * Detect the best available STT engine based on hardware and software.
 *
 * Decision logic:
 *  1. GPU with >= 4 GB VRAM + (Python+NeMo or Docker) -> parakeet
 *  2. GPU with >= 1 GB VRAM or Docker available         -> whisper
 *  3. Otherwise                                          -> none
 *
 * @returns {{ engine: 'parakeet'|'whisper'|'none', gpu: object, reason: string }}
 */
function detect() {
  const gpu = detectGPU();
  const python = checkPython();
  const hasDocker = commandExists('docker');

  // Parakeet needs a capable GPU
  if (gpu.hasGPU && gpu.vram >= PARAKEET_MIN_VRAM) {
    const canRunLocal = python.available && python.hasNemo;
    if (canRunLocal || hasDocker) {
      return {
        engine: 'parakeet',
        gpu,
        reason: `GPU ${gpu.gpuName} with ${gpu.vram} MB VRAM meets Parakeet requirements`
          + (canRunLocal ? ' (local NeMo available)' : ' (Docker available)')
      };
    }
  }

  // Whisper is less demanding
  if (gpu.hasGPU && gpu.vram >= WHISPER_MIN_VRAM) {
    return {
      engine: 'whisper',
      gpu,
      reason: `GPU ${gpu.gpuName} with ${gpu.vram} MB VRAM — Whisper GPU mode`
    };
  }

  if (hasDocker) {
    return {
      engine: 'whisper',
      gpu,
      reason: 'No sufficient GPU — Whisper CPU mode via Docker'
    };
  }

  if (python.available) {
    return {
      engine: 'whisper',
      gpu,
      reason: 'No GPU/Docker — Whisper CPU mode via local Python'
    };
  }

  return {
    engine: 'none',
    gpu,
    reason: 'No GPU, Docker, or Python found — cannot run STT'
  };
}

/**
 * Return configuration defaults for a given engine.
 *
 * @param {'parakeet'|'whisper'} engine
 * @returns {object}
 */
function getConfig(engine) {
  if (engine === 'parakeet') {
    return {
      engine: 'parakeet',
      port: 8001,
      model: 'nvidia/parakeet-tdt-0.6b-v2',
      languages: ['fr', 'en'],
      dockerImage: 'nvcr.io/nvidia/nemo:24.07',
      minVram: PARAKEET_MIN_VRAM,
      healthEndpoint: 'http://localhost:8001/health'
    };
  }

  // Default: whisper
  const gpu = detectGPU();
  return {
    engine: 'whisper',
    port: 8000,
    model: getWhisperModel(gpu.vram),
    dockerImage: `fedirz/faster-whisper-server:latest-${gpu.hasGPU ? 'cuda' : 'cpu'}`,
    minVram: WHISPER_MIN_VRAM,
    healthEndpoint: 'http://localhost:8000/health'
  };
}

/**
 * Map available VRAM to the best Whisper model.
 *
 * @param {number} vram - VRAM in MB
 * @returns {string}
 */
function getWhisperModel(vram) {
  if (vram >= 10000) return 'large-v3';
  if (vram >= 6000) return 'large-v2';
  if (vram >= 4000) return 'medium';
  if (vram >= 2000) return 'small';
  if (vram >= 1000) return 'tiny';
  return 'base';
}

/**
 * Check runtime status of either STT engine.
 *
 * @returns {{ engine: string, mode: 'local'|'docker'|'unknown', running: boolean, model: string }}
 */
function getStatus() {
  const parakeetRunning = isPortOpen(8001);
  const whisperRunning = isPortOpen(8000);

  if (parakeetRunning) {
    return { engine: 'parakeet', mode: detectMode(8001), running: true, model: 'parakeet-tdt-0.6b-v2' };
  }
  if (whisperRunning) {
    return { engine: 'whisper', mode: detectMode(8000), running: true, model: 'whisper' };
  }
  return { engine: 'none', mode: 'unknown', running: false, model: '' };
}

/**
 * @param {number} port
 * @returns {boolean}
 */
function isPortOpen(port) {
  try {
    execSync(`curl -sf http://localhost:${port}/health`, {
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3000
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Heuristic: if a Docker container is listening on the port, it's Docker mode.
 *
 * @param {number} port
 * @returns {'local'|'docker'|'unknown'}
 */
function detectMode(port) {
  try {
    const out = execSync(`docker ps --format '{{.Ports}}'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    if (out.includes(`:${port}->`)) return 'docker';
    return 'local';
  } catch {
    return 'unknown';
  }
}

/**
 * Print a summary of the detection result.
 *
 * @param {{ engine: string, gpu: object, reason: string }} result
 */
function printDetectionSummary(result) {
  const { engine, gpu, reason } = result;

  if (gpu.hasGPU) {
    console.log(chalk.green(`  GPU: ${gpu.gpuName} (${gpu.vram} MB VRAM)`));
  } else {
    console.log(chalk.yellow('  GPU: not detected'));
  }

  const color = engine === 'parakeet' ? chalk.cyan
    : engine === 'whisper' ? chalk.blue
    : chalk.red;

  console.log(color(`  Engine: ${engine}`));
  console.log(chalk.gray(`  Reason: ${reason}`));
}

module.exports = {
  detect,
  detectGPU,
  commandExists,
  checkPython,
  getConfig,
  getStatus,
  getWhisperModel,
  printDetectionSummary
};
