# DMAESTRO ML Server

Local transcription server using Demucs (stem separation) + MR-MT3 (transcription).

## Quick Start

### Windows

```batch
cd ml-server
setup.bat
```

### Linux/Mac

```bash
cd ml-server
chmod +x setup.sh
./setup.sh
```

## Manual Setup

### 1. Install Miniconda

Download from: https://docs.conda.io/en/latest/miniconda.html

### 2. Create Environment

```bash
conda create --name dmaestro-ml python=3.10 -y
conda activate dmaestro-ml
```

### 3. Install PyTorch

**With GPU (NVIDIA):**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

**CPU only:**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Clone MR-MT3

```bash
git clone https://github.com/gudgud96/MR-MT3.git
```

### 6. Download Pretrained Model

```bash
cd MR-MT3
git lfs install
git clone https://huggingface.co/gudgud1014/MR-MT3 checkpoints
cd ..
```

## Running the Server

```bash
conda activate dmaestro-ml
python server.py
```

Server runs at: `http://localhost:5000`

### Options

```bash
python server.py --port 5000      # Change port
python server.py --host 0.0.0.0   # Allow external access
python server.py --debug          # Debug mode
```

## API Endpoints

### POST /transcribe

Upload audio file and get transcribed notes.

**Request:**
```
POST /transcribe
Content-Type: multipart/form-data

audio: <file>
separate: true (optional, default true)
```

**Response:**
```json
{
  "success": true,
  "notes": [
    {
      "pitch": "C4",
      "midi": 60,
      "startTime": 0.5,
      "endTime": 1.0,
      "duration": 0.5,
      "velocity": 80,
      "instrument": "Acoustic Grand Piano"
    }
  ],
  "noteCount": 150,
  "duration": 180.5,
  "processingTime": 45.2
}
```

### GET /health

Health check.

```json
{"status": "ok", "timestamp": "2024-01-15T10:30:00Z"}
```

### GET /status

Server capabilities and status.

```json
{
  "status": "running",
  "capabilities": {
    "stemSeparation": true,
    "transcription": true,
    "gpu": true
  },
  "details": {
    "gpuName": "NVIDIA RTX 3060",
    "maxFileSize": 104857600
  }
}
```

## Testing

### Test with curl

```bash
curl -X POST http://localhost:5000/transcribe \
  -F "audio=@test.mp3" \
  -F "separate=true"
```

### Test CLI

```bash
python transcribe.py test.mp3 --output notes.json
```

## Connecting from DMAESTRO

On the DMAESTRO server, set the environment variable:

```bash
# Windows
set ML_SERVER_URL=http://192.168.1.100:5000

# Linux/Mac
export ML_SERVER_URL=http://192.168.1.100:5000

# Or in .env file
ML_SERVER_URL=http://192.168.1.100:5000
```

Replace `192.168.1.100` with the ML server's IP address.

### Find Your IP

**Windows:**
```batch
ipconfig
```

**Linux/Mac:**
```bash
ip addr show | grep "inet "
# or
ifconfig | grep "inet "
```

## Troubleshooting

### "CUDA out of memory"

Reduce batch size or use CPU mode:
```bash
# In transcribe.py, the model will fall back to CPU if needed
```

### "Model not found"

Ensure checkpoints are downloaded:
```bash
cd MR-MT3
ls checkpoints/
# Should see model files
```

### "Demucs not found"

Reinstall demucs:
```bash
pip uninstall demucs
pip install demucs
```

### Processing is slow

- Use GPU if available (10x faster)
- Skip stem separation for clean recordings: `separate=false`
- Close other applications

## System Requirements

- **RAM:** 8GB minimum, 16GB recommended
- **Disk:** ~10GB for models
- **GPU:** Optional but recommended (NVIDIA with CUDA)
- **CPU:** 4+ cores recommended

## Processing Times (Estimates)

| Song Length | GPU (RTX 3060) | CPU (i7) |
|-------------|----------------|----------|
| 1 minute    | ~30 seconds    | ~2 min   |
| 3 minutes   | ~1.5 minutes   | ~5 min   |
| 5 minutes   | ~2.5 minutes   | ~8 min   |

## Architecture

```
Audio Input (MP3/WAV)
        │
        ▼
┌───────────────┐
│    Demucs     │  ─── Separates: vocals, drums, bass, other
└───────────────┘
        │
        ▼ (other.wav - melody/instruments)
┌───────────────┐
│    MR-MT3     │  ─── Transcribes to MIDI
└───────────────┘
        │
        ▼
┌───────────────┐
│  MIDI Parser  │  ─── Extracts notes array
└───────────────┘
        │
        ▼
    JSON Output
```

## License

MIT - for educational use in DMAESTRO thesis project.
