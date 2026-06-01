# Docker Setup Workflow - Self-Hosted faster-whisper-server

**Workflow:** Setup Self-Hosted Whisper Transcription Server  
**Duration:** 15-20 minutes  
**Goal:** Run faster-whisper-server locally for privacy & cost-free transcription

---

## OVERVIEW

Setup Docker container running faster-whisper-server for local transcription. Supports GPU acceleration (NVIDIA) or CPU-only mode.

---

## STEP 1: Docker Prerequisites

**Check Docker Installation:**
```bash
# Check Docker
docker --version

# Check Docker running
docker ps
```

**If Docker Not Found:**
```
"Docker is not installed.

Install Docker:

Linux:
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  (logout and login to apply group)

macOS:
  Download Docker Desktop: https://www.docker.com/products/docker-desktop

Windows:
  Download Docker Desktop: https://www.docker.com/products/docker-desktop

Install Docker now? (yes/no)"
```

**Check GPU Support (Optional):**
```bash
# Check NVIDIA GPU
nvidia-smi

# Check nvidia-docker2
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

**Display GPU Info:**
```
"GPU Detection:

GPU: {gpu_name}
VRAM: {vram_gb} GB
CUDA: {cuda_version}
nvidia-docker: {installed/not-installed}

Recommended model based on VRAM:
- 10+ GB: large-v3 (best accuracy)
- 6-10 GB: medium (great accuracy)
- 4-6 GB: small (good accuracy)
- < 4 GB: base (basic accuracy)

If no GPU or nvidia-docker not installed, will use CPU mode (slower).
"
```

---

## STEP 2: Model Selection

```
"Select Whisper model:

1. tiny (~75 MB, basic accuracy, fastest)
   CPU: ✓ Fast | GPU: ✓ Very fast

2. base (~150 MB, good accuracy, very fast)
   CPU: ✓ Moderate | GPU: ✓ Fast

3. small (~500 MB, better accuracy, fast)
   CPU: ⚠ Slow | GPU: ✓ Fast
   Requires: 4+ GB VRAM (GPU)

4. medium (~1.5 GB, great accuracy, moderate)
   CPU: ❌ Very slow | GPU: ✓ Moderate
   Requires: 5+ GB VRAM (GPU)

5. large-v3 (~3 GB, best accuracy, slower)
   CPU: ❌ Extremely slow | GPU: ✓ Good
   Requires: 6+ GB VRAM (GPU)

Your VRAM: {vram_gb} GB
Recommended: {recommended_model}

Select model (1-5): ___"
```

**Model Mapping:**
```python
model_map = {
    "1": "Systran/faster-whisper-tiny",
    "2": "Systran/faster-whisper-base",
    "3": "Systran/faster-whisper-small",
    "4": "Systran/faster-whisper-medium",
    "5": "Systran/faster-whisper-large-v3"
}
```

---

## STEP 3: Choose Docker Mode

```
"Select Docker mode:

1. GPU (NVIDIA CUDA) - Recommended if you have NVIDIA GPU
   Requirements: NVIDIA GPU, nvidia-docker2
   Performance: Fast transcription (seconds)

2. CPU Only - Works on any system
   Requirements: None (just Docker)
   Performance: Slower transcription (can take minutes)

Your system: {gpu_detected ? 'GPU available' : 'No GPU detected'}

Select mode (1/2): ___"
```

---

## STEP 4: Launch Docker Container

**GPU Mode:**
```bash
# Pull image
docker pull fedirz/faster-whisper-server:latest-cuda

# Create persistent cache directory
mkdir -p ~/.cache/huggingface

# Run container
docker run -d \
  --name turbo-whisper-server \
  --gpus=all \
  -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e WHISPER__MODEL={selected_model} \
  --restart unless-stopped \
  fedirz/faster-whisper-server:latest-cuda

echo "GPU container launched!"
```

**CPU Mode:**
```bash
# Pull image
docker pull fedirz/faster-whisper-server:latest-cpu

# Create persistent cache directory
mkdir -p ~/.cache/huggingface

# Run container
docker run -d \
  --name turbo-whisper-server \
  -p 8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -e WHISPER__MODEL={selected_model} \
  --restart unless-stopped \
  fedirz/faster-whisper-server:latest-cpu

echo "CPU container launched!"
```

**Monitor Container Logs:**
```bash
echo "Monitoring container startup (first run downloads model)..."
docker logs -f turbo-whisper-server
```

**Wait for Model Download:**
```
"Downloading model: {selected_model}
Size: {model_size}

This may take 5-15 minutes on first run.
Subsequent starts will be instant (model cached).

Progress:
{show docker logs with download progress}

Press Ctrl+C when you see: 'Application startup complete'
"
```

---

## STEP 5: Verify Server Health

**Check Server Status:**
```bash
# Wait for server to be ready
sleep 5

# Check health endpoint
curl -s http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "ok"
}
```

**If Health Check Fails:**
```
"Server health check failed.

Checking logs:
{docker logs --tail 50 turbo-whisper-server}

Common issues:
1. Model still downloading (wait longer)
2. Port 8000 already in use (change port)
3. GPU not detected (use CPU mode)
4. Out of disk space (need {model_size} free)

Troubleshoot? (yes/no)"
```

---

## STEP 6: Test Transcription

**Create Test Audio:**
```bash
# Use existing audio file or record quick test
echo "Testing with sample audio..."

# If you have ffmpeg, create a test
# (Optional - skip if no test audio available)
```

**Test API Endpoint:**
```bash
# Test with curl (if test audio available)
curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -F "file=@test-audio.wav" \
  -F "model=whisper-1" \
  -F "language=en"
```

**Or Manual Test:**
```
"Server is ready for testing!

To test manually:
1. Start Turbo Whisper: turbo-whisper
2. Press {hotkey} (default Ctrl+Shift+Space)
3. Say: 'Testing one two three'
4. Press {hotkey} again
5. Check if text appears

The server will transcribe your audio at http://localhost:8000

Test now? (yes/later)"
```

---

## STEP 7: Update Turbo Whisper Config

**Update config.json:**
```bash
CONFIG_FILE=~/.config/turbo-whisper/config.json

# Backup existing config
cp "$CONFIG_FILE" "${CONFIG_FILE}.backup"

# Update api_url to point to local server
cat > "$CONFIG_FILE" << 'EOF'
{
  "api_url": "http://localhost:8000/v1/audio/transcriptions",
  "api_key": "",
  "hotkey": ["ctrl", "shift", "space"],
  "language": "en",
  "auto_paste": true,
  "copy_to_clipboard": true,
  "typing_delay_ms": 5,
  "waveform_color": "#00ff88",
  "background_color": "#1a1a2e",
  "claude_integration": true,
  "claude_integration_port": 7878
}
EOF

echo "Config updated to use local server"
```

**Display Config:**
```
"Configuration Updated:

API URL: http://localhost:8000/v1/audio/transcriptions
API Key: (none - local server)
Model: {selected_model}

Config saved: {config_path}
Backup: {config_path}.backup
"
```

---

## STEP 8: Docker Management Commands

**Display Management Info:**
```
"Docker Container Management:

CONTAINER: turbo-whisper-server
STATUS: {running/stopped}
MODEL: {selected_model}
PORT: 8000

Useful commands:

# Check status
docker ps | grep turbo-whisper-server

# View logs
docker logs turbo-whisper-server
docker logs -f turbo-whisper-server  # Follow live

# Restart
docker restart turbo-whisper-server

# Stop
docker stop turbo-whisper-server

# Start
docker start turbo-whisper-server

# Remove container (keeps cached model)
docker rm turbo-whisper-server

# Remove cached model (frees disk space)
rm -rf ~/.cache/huggingface/hub/models--Systran--*

The container has restart policy 'unless-stopped', 
so it will auto-start on system reboot.
"
```

---

## STEP 9: Summary

```
"Self-Hosted Whisper Server Setup Complete!

CONFIGURATION:
✓ Docker Mode: {gpu/cpu}
✓ Model: {selected_model} ({model_size})
✓ Server: http://localhost:8000
✓ Status: Running
✓ Autostart: Enabled (restart policy: unless-stopped)
✓ Cache: ~/.cache/huggingface

TURBO WHISPER CONFIG:
✓ API URL: http://localhost:8000/v1/audio/transcriptions
✓ API Key: (none required)

PERFORMANCE:
- First transcription: {model_load_time}s (model loading)
- Subsequent: {transcription_time}s average
- Quality: {accuracy_description}

COST:
✓ Free! (self-hosted)
✓ No API limits
✓ Complete privacy (audio never leaves your machine)

NEXT STEPS:
1. [INT] Integrate with platforms (Copilot/Claude/Codex)
2. [TEST] Test voice dictation end-to-end
3. [CONF] Tune hotkeys and typing speed

Container will auto-start on system reboot.
To stop: docker stop turbo-whisper-server
"
```

---

## ERROR HANDLING

**Port 8000 Already in Use:**
```
"ERROR: Port 8000 is already in use.

Options:
1. Stop the conflicting service
2. Use a different port (e.g., 8001)

Use port 8001 instead? (yes/no)

If yes, container will use:
  -p 8001:8000
And config will update to:
  "api_url": "http://localhost:8001/v1/audio/transcriptions"
```

**GPU Not Detected:**
```
"ERROR: GPU requested but not detected.

Possible causes:
1. nvidia-docker2 not installed
2. NVIDIA driver missing
3. GPU not NVIDIA (AMD/Intel not supported)

Options:
1. Install nvidia-docker2 and try again
2. Switch to CPU mode (slower but works)

Switch to CPU mode? (yes/no)"
```

**Out of Disk Space:**
```
"ERROR: Insufficient disk space.

Model size: {model_size}
Available: {available_space}

Options:
1. Free up disk space
2. Choose smaller model (e.g., tiny or base)
3. Use different cache directory (external drive)

What would you like to do? (1/2/3)"
```

**Model Download Failed:**
```
"ERROR: Model download failed.

Check logs:
{docker logs --tail 50 turbo-whisper-server}

Common causes:
1. Network connectivity issues
2. HuggingFace hub unavailable (temporary)
3. Disk space exhausted during download

Retry? (yes/no)"
```

---

## SUCCESS CRITERIA

✅ Docker installed and running
✅ Container launched successfully
✅ Model downloaded and cached
✅ Health endpoint returns OK
✅ Turbo Whisper config updated
✅ Server auto-starts on reboot
✅ Test transcription successful (if tested)
