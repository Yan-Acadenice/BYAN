/**
 * Parakeet TDT STT Backend
 *
 * Handles installation, configuration and status checks for
 * NVIDIA Parakeet TDT (local NeMo or Docker).
 *
 * @module stt/parakeet-backend
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const { detectGPU, commandExists, checkPython } = require('./engine');

const PARAKEET_PORT = 8001;
const DEFAULT_MODEL = 'nvidia/parakeet-tdt-0.6b-v2';
const MIN_PYTHON_VERSION = '3.8';
const MIN_VRAM = 4000;

/**
 * Install and configure the Parakeet TDT backend.
 *
 * @param {object} options
 * @param {'local'|'docker'} options.mode
 * @param {string} [options.model]
 * @param {string[]} [options.languages]
 * @param {string} options.projectRoot
 * @returns {Promise<{ success: boolean, model: string, mode: string }>}
 */
async function setup(options) {
  const { mode, projectRoot } = options;
  const model = options.model || DEFAULT_MODEL;
  const languages = options.languages || ['fr', 'en'];

  console.log(chalk.blue('\n  Setting up Parakeet TDT backend...'));
  console.log(chalk.gray(`  Mode: ${mode} | Model: ${model} | Languages: ${languages.join(', ')}`));

  const gpu = detectGPU();
  if (!gpu.hasGPU || gpu.vram < MIN_VRAM) {
    throw new Error(
      `Parakeet TDT requires a GPU with >= ${MIN_VRAM} MB VRAM. `
      + `Detected: ${gpu.hasGPU ? gpu.vram + ' MB' : 'no GPU'}. Use Whisper instead.`
    );
  }

  if (mode === 'docker') {
    await setupDocker(projectRoot);
  } else {
    await setupLocal(model);
  }

  return { success: true, model, mode };
}

/**
 * Set up Parakeet via Docker Compose.
 *
 * @param {string} projectRoot
 */
async function setupDocker(projectRoot) {
  const spinner = ora('Generating Parakeet Docker Compose...').start();

  try {
    if (!commandExists('docker')) {
      throw new Error('Docker is required for Parakeet Docker mode');
    }

    const content = getDockerCompose();
    const composePath = path.join(projectRoot, 'docker-compose.parakeet.yml');
    await fs.writeFile(composePath, content, 'utf-8');
    spinner.succeed(`Parakeet Docker Compose written to ${composePath}`);

    console.log(chalk.gray('  Start with: docker compose -f docker-compose.parakeet.yml up -d'));
  } catch (err) {
    spinner.fail('Failed to generate Parakeet Docker Compose');
    throw err;
  }
}

/**
 * Set up Parakeet locally via pip + NeMo.
 *
 * @param {string} model
 */
async function setupLocal(model) {
  const spinner = ora('Checking Python environment...').start();

  try {
    const python = checkPython();
    if (!python.available) {
      throw new Error('Python 3 is required for local Parakeet installation');
    }

    if (!meetsMinVersion(python.version, MIN_PYTHON_VERSION)) {
      throw new Error(
        `Python >= ${MIN_PYTHON_VERSION} required, found ${python.version}`
      );
    }

    spinner.succeed(`Python ${python.version} detected`);

    if (!python.hasNemo) {
      const pipSpinner = ora('Installing NVIDIA NeMo ASR toolkit (this may take a while)...').start();
      try {
        execSync('pip3 install "nvidia-nemo[asr]"', {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 600000 // 10 min
        });
        pipSpinner.succeed('NVIDIA NeMo ASR installed');
      } catch (err) {
        pipSpinner.fail('NeMo installation failed');
        console.log(chalk.yellow('  Try manually: pip3 install "nvidia-nemo[asr]"'));
        throw err;
      }
    } else {
      console.log(chalk.green('  NeMo ASR already installed'));
    }

    // Pre-download model so first inference is not slow
    const dlSpinner = ora(`Downloading model ${model}...`).start();
    try {
      execSync(
        `python3 -c "from nemo.collections.asr.models import EncDecRNNTBPEModel; EncDecRNNTBPEModel.from_pretrained('${model}')"`,
        { stdio: ['pipe', 'pipe', 'pipe'], timeout: 600000 }
      );
      dlSpinner.succeed('Model downloaded');
    } catch (err) {
      dlSpinner.fail('Model download failed');
      console.log(chalk.yellow(`  Try manually: python3 -c "from nemo.collections.asr.models import EncDecRNNTBPEModel; EncDecRNNTBPEModel.from_pretrained('${model}')"`));
      throw err;
    }
  } catch (err) {
    spinner.isSpinning && spinner.fail();
    throw err;
  }
}

/**
 * Generate Docker Compose YAML for the Parakeet NeMo container.
 *
 * @returns {string}
 */
function getDockerCompose() {
  return `version: '3.8'

services:
  parakeet-server:
    image: nvcr.io/nvidia/nemo:24.07
    ports:
      - "${PARAKEET_PORT}:${PARAKEET_PORT}"
    environment:
      - MODEL_NAME=${DEFAULT_MODEL}
      - NVIDIA_VISIBLE_DEVICES=all
    volumes:
      - parakeet-models:/root/.cache/huggingface
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${PARAKEET_PORT}/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
    command: >
      python -c "
      from nemo.collections.asr.models import EncDecRNNTBPEModel;
      import json, http.server, io, soundfile as sf, numpy as np;
      model = EncDecRNNTBPEModel.from_pretrained('${DEFAULT_MODEL}');

      class Handler(http.server.BaseHTTPRequestHandler):
          def do_GET(self):
              if self.path == '/health':
                  self.send_response(200);
                  self.end_headers();
                  self.wfile.write(b'ok');
              else:
                  self.send_response(404);
                  self.end_headers();
          def do_POST(self):
              length = int(self.headers['Content-Length']);
              audio_bytes = self.rfile.read(length);
              audio, sr = sf.read(io.BytesIO(audio_bytes));
              transcription = model.transcribe([audio]);
              result = json.dumps({'text': transcription[0] if transcription else ''});
              self.send_response(200);
              self.send_header('Content-Type', 'application/json');
              self.end_headers();
              self.wfile.write(result.encode());
          def log_message(self, format, *args):
              pass;

      httpd = http.server.HTTPServer(('', ${PARAKEET_PORT}), Handler);
      print('Parakeet TDT server listening on port ${PARAKEET_PORT}');
      httpd.serve_forever()
      "

volumes:
  parakeet-models:
`;
}

/**
 * Describe system requirements for Parakeet TDT.
 *
 * @returns {{ python: string, vram: string, packages: string[] }}
 */
function getRequirements() {
  return {
    python: `>=${MIN_PYTHON_VERSION}`,
    vram: `>=${MIN_VRAM} MB`,
    packages: ['nvidia-nemo[asr]']
  };
}

/**
 * Check whether the Parakeet server is responding.
 *
 * @returns {boolean}
 */
function isRunning() {
  try {
    execSync(`curl -sf http://localhost:${PARAKEET_PORT}/health`, {
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 3000
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Semver-light comparison: is `actual` >= `minimum`?
 * Only compares major.minor.
 *
 * @param {string} actual  - e.g. "3.10.12"
 * @param {string} minimum - e.g. "3.8"
 * @returns {boolean}
 */
function meetsMinVersion(actual, minimum) {
  const parse = v => v.split('.').map(Number);
  const [aMaj, aMin = 0] = parse(actual);
  const [mMaj, mMin = 0] = parse(minimum);
  return aMaj > mMaj || (aMaj === mMaj && aMin >= mMin);
}

module.exports = {
  setup,
  getDockerCompose,
  getRequirements,
  isRunning,
  PARAKEET_PORT,
  DEFAULT_MODEL
};
