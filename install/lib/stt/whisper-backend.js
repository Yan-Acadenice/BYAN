/**
 * Whisper STT Backend
 *
 * Handles installation, configuration and status checks for
 * faster-whisper-server (Docker or local).
 *
 * @module stt/whisper-backend
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const { detectGPU, commandExists, getWhisperModel } = require('./engine');

const WHISPER_PORT = 8000;

/**
 * Install and configure the Whisper STT backend.
 *
 * @param {object} options
 * @param {'local'|'docker'} options.mode
 * @param {string} [options.model] - Override model selection
 * @param {string} options.projectRoot - Absolute path to project root
 * @returns {Promise<{ success: boolean, model: string, mode: string }>}
 */
async function setup(options) {
  const { mode, projectRoot } = options;
  const gpu = detectGPU();
  const model = options.model || getWhisperModel(gpu.vram);

  console.log(chalk.blue('\n  Setting up Whisper STT backend...'));
  console.log(chalk.gray(`  Mode: ${mode} | Model: ${model}`));

  if (mode === 'docker') {
    await setupDocker(projectRoot, gpu, model);
  } else {
    await setupLocal();
  }

  return { success: true, model, mode };
}

/**
 * Set up Whisper via Docker Compose.
 *
 * @param {string} projectRoot
 * @param {object} gpu
 * @param {string} model
 */
async function setupDocker(projectRoot, gpu, model) {
  const spinner = ora('Generating Whisper Docker Compose...').start();

  try {
    const content = getDockerCompose({ gpu, model });
    const composePath = path.join(projectRoot, 'docker-compose.turbo-whisper.yml');
    await fs.writeFile(composePath, content, 'utf-8');
    spinner.succeed(`Whisper Docker Compose written to ${composePath}`);
  } catch (err) {
    spinner.fail('Failed to generate Docker Compose');
    throw err;
  }
}

/**
 * Set up Whisper locally (clone repo, create venv, install deps).
 */
async function setupLocal() {
  const spinner = ora('Installing Whisper locally...').start();

  try {
    const serverDir = path.join(process.env.HOME, 'faster-whisper-server');

    if (await fs.pathExists(serverDir)) {
      spinner.text = 'Updating faster-whisper-server...';
      execSync('git pull', { cwd: serverDir, stdio: 'pipe' });
    } else {
      spinner.text = 'Cloning faster-whisper-server...';
      execSync(
        `git clone https://github.com/fedirz/faster-whisper-server.git ${serverDir}`,
        { stdio: 'pipe' }
      );
    }

    spinner.text = 'Installing Python dependencies...';
    execSync('python3 -m venv .venv && .venv/bin/pip install -e .', {
      cwd: serverDir,
      stdio: 'pipe'
    });

    spinner.succeed('Whisper local installation complete');
  } catch (err) {
    spinner.fail('Whisper local installation failed');
    throw err;
  }
}

/**
 * Generate Docker Compose YAML content for Whisper.
 *
 * @param {object} [opts]
 * @param {object} [opts.gpu] - GPU detection result
 * @param {string} [opts.model] - Whisper model name
 * @returns {string}
 */
function getDockerCompose(opts = {}) {
  const gpu = opts.gpu || detectGPU();
  const model = opts.model || getWhisperModel(gpu.vram);
  const modelFullName = `Systran/faster-whisper-${model}`;
  const useGPU = gpu.hasGPU;

  const gpuBlock = useGPU
    ? `
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]`
    : '';

  return `version: '3.8'

services:
  whisper-server:
    image: fedirz/faster-whisper-server:latest-${useGPU ? 'cuda' : 'cpu'}
    ports:
      - "${WHISPER_PORT}:${WHISPER_PORT}"
    environment:
      - WHISPER__MODEL=${modelFullName}${gpuBlock}
    restart: unless-stopped
`;
}

/**
 * Select the best Whisper model for the given VRAM.
 * Delegates to the shared engine helper.
 *
 * @param {number} vram - VRAM in MB
 * @returns {string}
 */
function getRecommendedModel(vram) {
  return getWhisperModel(vram);
}

/**
 * Check whether the Whisper server is responding on its port.
 *
 * @returns {boolean}
 */
function isRunning() {
  try {
    execSync(`curl -sf http://localhost:${WHISPER_PORT}/health`, {
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3000
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  setup,
  getDockerCompose,
  getRecommendedModel,
  isRunning,
  WHISPER_PORT
};
