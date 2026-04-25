# Local Transcription Setup Guide

Run AI music transcription locally on your machine. No API costs, no internet required during demo.

---

## Overview

```
Audio Upload → [Optional: Demucs stem separation] → MT3/MR-MT3 (transcription) → MIDI/Notes
```

## Which Option to Choose?

| Option | Instruments | Accuracy | Setup | Best For |
|--------|-------------|----------|-------|----------|
| **MR-MT3** | Multi (8+) | High | Medium | Full songs, thesis defense |
| **Demucs + ByteDance** | Piano only | 96% | Easy | Piano-focused apps |
| **YourMT3 HuggingFace** | Multi | High | None | Quick testing |

**Recommended for thesis defense:** MR-MT3 (local) for reliability + multi-instrument support.

## Processing Times

| Component | Purpose | CPU Time | GPU Time |
|-----------|---------|----------|----------|
| Demucs | Separate stems | 2-3 min | 30-60 sec |
| MR-MT3 | Multi-instrument transcription | 3-5 min | 1-2 min |
| ByteDance | Piano transcription | 1-2 min | 20-30 sec |

---

## Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 8 GB | 16 GB |
| Storage | 5 GB | 10 GB |
| GPU | None (CPU works) | NVIDIA 4GB+ VRAM |
| Python | 3.8+ | 3.10 |

### Install Python (if not installed)

Download from: https://www.python.org/downloads/

Verify:
```bash
python --version
# Should show Python 3.8+
```

### Install FFmpeg (required for audio processing)

**Windows:**
```bash
# Using chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
# Add to PATH
```

**Mac:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt install ffmpeg
```

Verify:
```bash
ffmpeg -version
```

---

## Option 1: Demucs + ByteDance (Piano Focus)

Best for: Piano transcription with 96% accuracy

### Install

```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
.\venv\Scripts\activate  # Windows

# Install packages
pip install demucs piano-transcription-inference torch librosa
```

### Test Demucs (Stem Separation)

```bash
# Separate a song into stems
demucs "path/to/song.mp3"

# Output: separated/htdemucs/song/
#   - vocals.wav
#   - drums.wav
#   - bass.wav
#   - other.wav (melody/piano/guitar)
```

### Test ByteDance (Piano Transcription)

```python
# test_transcribe.py
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

# Load audio
audio, _ = librosa.load('path/to/piano.mp3', sr=sample_rate, mono=True)

# Transcribe
transcriptor = PianoTranscription(device='cpu')  # or 'cuda' for GPU
transcriptor.transcribe(audio, 'output.mid')

print("Done! Check output.mid")
```

Run:
```bash
python test_transcribe.py
```

---

## Option 2: MR-MT3 (Multi-Instrument) - RECOMMENDED

Best for: Full songs with multiple instruments (piano, guitar, bass, drums, etc.)

**MR-MT3** = Memory Retaining MT3, easier to set up than original MT3.

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 16 GB | 32 GB |
| GPU VRAM | 4 GB | 8 GB+ |
| Storage | 10 GB | 15 GB |
| Python | 3.10 | 3.10 |

### Installation (Windows/Linux/Mac)

```bash
# 1. Install Conda (if not installed)
# Download from: https://docs.conda.io/en/latest/miniconda.html

# 2. Create environment
conda create --name mrmt3 python=3.10 -y
conda activate mrmt3

# 3. Install PyTorch (with CUDA for GPU)
# For NVIDIA GPU:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# For CPU only:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# 4. Clone MR-MT3
git clone https://github.com/gudgud96/MR-MT3.git
cd MR-MT3

# 5. Install dependencies
pip install transformers==4.18.0 librosa==0.9.1 t5==0.9.3 note-seq==0.0.3 pretty-midi==0.2.9 pytorch_lightning tensorflow==2.11 tensorflow-text==2.11 tensorflow_probability==0.19.0

# 6. Download pretrained model
# From: https://huggingface.co/gudgud1014/MR-MT3/tree/main
# Place in checkpoints/ folder
```

### Download Pretrained Models

```bash
# Using git lfs
git lfs install
git clone https://huggingface.co/gudgud1014/MR-MT3 checkpoints/

# Or download manually from:
# https://huggingface.co/gudgud1014/MR-MT3/tree/main
```

### Test Inference

```bash
# Run inference on audio file
python inference.py --audio_path "path/to/song.mp3" --output_dir "output/"
```

### Supported Instruments

MR-MT3 can detect and transcribe:
- Piano
- Guitar (acoustic/electric)
- Bass
- Drums
- Strings
- Brass
- Woodwinds
- And more (trained on Slakh2100 dataset)

---

## Option 3: YourMT3+ (Alternative Multi-Instrument)

### Option 3A: Use HuggingFace Spaces (Free, No Setup)

**Easiest option - no installation required:**

1. Go to: https://huggingface.co/spaces/mimbres/YourMT3
2. Upload audio
3. Wait for processing
4. Download MIDI
5. Upload MIDI to DMAESTRO

### Option 3B: Use Google Colab (Free GPU)

1. Open: https://colab.research.google.com/github/magenta/mt3/blob/main/mt3/colab/music_transcription_with_transformers.ipynb

2. Runtime → Change Runtime Type → GPU

3. Run all cells

4. Upload your audio when prompted

5. Download the MIDI output

### Option 3C: Local YourMT3 Setup

```bash
# Clone YourMT3
git clone https://github.com/mimbres/YourMT3.git
cd YourMT3

# Create environment
conda create -n yourmt3 python=3.10
conda activate yourmt3

# Install dependencies
pip install -r requirements.txt

# Download pretrained model (check repo for links)
```

---

## Integration with DMAESTRO

### Server-Side Processing Script

Create `server/transcribe.py`:

```python
import sys
import json
import subprocess
import tempfile
import os
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate
from mido import MidiFile

def separate_stems(audio_path, output_dir):
    """Run Demucs to separate stems"""
    subprocess.run([
        'demucs',
        '--two-stems', 'vocals',  # or remove for full separation
        '-o', output_dir,
        audio_path
    ], check=True)

    # Return path to 'other' stem (contains piano/melody)
    song_name = os.path.splitext(os.path.basename(audio_path))[0]
    return os.path.join(output_dir, 'htdemucs', song_name, 'no_vocals.wav')

def transcribe_audio(audio_path, output_midi_path, use_gpu=False):
    """Transcribe audio to MIDI using ByteDance"""
    audio, _ = librosa.load(audio_path, sr=sample_rate, mono=True)

    device = 'cuda' if use_gpu else 'cpu'
    transcriptor = PianoTranscription(device=device)
    transcriptor.transcribe(audio, output_midi_path)

    return output_midi_path

def midi_to_notes(midi_path):
    """Parse MIDI file to note list"""
    mid = MidiFile(midi_path)
    notes = []

    ticks_per_beat = mid.ticks_per_beat
    tempo = 500000  # Default 120 BPM

    for track in mid.tracks:
        current_time = 0
        for msg in track:
            current_time += msg.time

            if msg.type == 'set_tempo':
                tempo = msg.tempo
            elif msg.type == 'note_on' and msg.velocity > 0:
                # Convert ticks to seconds
                time_seconds = current_time * tempo / (ticks_per_beat * 1000000)

                # Note name
                note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
                note_name = note_names[msg.note % 12] + str(msg.note // 12 - 1)

                notes.append({
                    'pitch': note_name,
                    'midi': msg.note,
                    'startTime': time_seconds,
                    'velocity': msg.velocity
                })

    return notes

def process_audio(audio_path, separate=True, use_gpu=False):
    """Full pipeline: separate (optional) → transcribe → return notes"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Step 1: Separate stems (optional)
        if separate:
            print("Separating stems...", file=sys.stderr)
            audio_to_transcribe = separate_stems(audio_path, tmp_dir)
        else:
            audio_to_transcribe = audio_path

        # Step 2: Transcribe
        print("Transcribing...", file=sys.stderr)
        midi_path = os.path.join(tmp_dir, 'output.mid')
        transcribe_audio(audio_to_transcribe, midi_path, use_gpu)

        # Step 3: Parse MIDI to notes
        print("Parsing MIDI...", file=sys.stderr)
        notes = midi_to_notes(midi_path)

        return notes

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python transcribe.py <audio_path> [--no-separate] [--gpu]")
        sys.exit(1)

    audio_path = sys.argv[1]
    separate = '--no-separate' not in sys.argv
    use_gpu = '--gpu' in sys.argv

    notes = process_audio(audio_path, separate, use_gpu)
    print(json.dumps(notes))
```

### Call from Node.js Server

Add to `server/index.ts`:

```typescript
import { spawn } from 'child_process';
import { promisify } from 'util';

async function transcribeWithPython(audioPath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [
      './transcribe.py',
      audioPath,
      // '--no-separate',  // Skip stem separation
      // '--gpu',          // Use GPU if available
    ]);

    let output = '';
    let error = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      error += data.toString();
      console.log('Transcription progress:', data.toString());
    });

    python.on('close', (code) => {
      if (code === 0) {
        try {
          const notes = JSON.parse(output);
          resolve(notes);
        } catch (e) {
          reject(new Error('Failed to parse transcription output'));
        }
      } else {
        reject(new Error(`Transcription failed: ${error}`));
      }
    });
  });
}

// Use in upload endpoint
app.post('/api/music/upload-local', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const audioPath = req.file.path;

    console.log('Starting local transcription...');
    const notes = await transcribeWithPython(audioPath);
    console.log(`Transcribed ${notes.length} notes`);

    // Save to database and return
    // ... rest of upload logic

    res.json({ notes, noteCount: notes.length });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Transcription failed' });
  }
});
```

---

## Quick Start Commands

### MR-MT3 Setup (Multi-Instrument) - RECOMMENDED

```bash
# 1. Install Miniconda (if needed)
# Download from: https://docs.conda.io/en/latest/miniconda.html

# 2. Create environment and install
conda create --name mrmt3 python=3.10 -y
conda activate mrmt3

# 3. Install PyTorch
# WITH GPU (NVIDIA):
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
# WITHOUT GPU (CPU only):
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# 4. Clone and setup MR-MT3
git clone https://github.com/gudgud96/MR-MT3.git
cd MR-MT3
pip install transformers==4.18.0 librosa==0.9.1 note-seq==0.0.3 pretty-midi pytorch_lightning

# 5. Download model (from HuggingFace)
git lfs install
git clone https://huggingface.co/gudgud1014/MR-MT3 checkpoints/

# 6. Test
python inference.py --audio_path "test.mp3" --output_dir "output/"
```

### Demucs + ByteDance Setup (Piano Only)

```bash
# Windows
pip install demucs piano-transcription-inference torch librosa mido
demucs --help
python -c "from piano_transcription_inference import PianoTranscription; print('OK')"

# Mac/Linux
python3 -m venv venv
source venv/bin/activate
pip install demucs piano-transcription-inference torch librosa mido
```

---

## Processing Times (Estimates)

| Song Length | CPU (no GPU) | GPU (NVIDIA) |
|-------------|--------------|--------------|
| 1 minute | 1-2 min | 20-30 sec |
| 3 minutes | 3-5 min | 1-2 min |
| 5 minutes | 5-8 min | 2-3 min |

**Tip:** For defense demo, tell panelists "The AI is processing..." - they'll understand.

---

## Troubleshooting

### "torch not found" or CUDA errors
```bash
# Install PyTorch with CUDA (if you have NVIDIA GPU)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Or CPU-only
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
```

### "ffmpeg not found"
Make sure ffmpeg is in your PATH:
```bash
# Windows - add to PATH or use full path
set PATH=%PATH%;C:\ffmpeg\bin

# Verify
ffmpeg -version
```

### Out of memory
```bash
# Use smaller model or CPU
demucs --two-stems vocals song.mp3  # Faster, less memory

# Or set environment variable
set PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
```

### Model download stuck
First run downloads ~1GB models. Be patient or download manually:
- Demucs models: https://github.com/facebookresearch/demucs
- ByteDance model: https://zenodo.org/record/4034264

---

## For Defense Demo

### Pre-Demo Checklist (MR-MT3)

- [ ] Miniconda installed
- [ ] `conda activate mrmt3` works
- [ ] FFmpeg installed and in PATH
- [ ] MR-MT3 repo cloned with checkpoints downloaded
- [ ] Test with 2-3 songs BEFORE defense
- [ ] Know processing time for your laptop (~3-5 min)

### Pre-Demo Checklist (Demucs + ByteDance)

- [ ] Python installed and in PATH
- [ ] FFmpeg installed and in PATH
- [ ] `pip install demucs piano-transcription-inference torch librosa mido`
- [ ] Test with one song before defense
- [ ] Models downloaded (first run downloads them)

### During Demo

1. Panelist requests a song
2. Upload to app
3. Show "AI is transcribing... this takes 2-4 minutes"
4. (Show other features while waiting)
5. Notes appear in Practice mode
6. Demo the practice features

### Backup Plan

If local processing fails during demo:
1. Have 3-5 pre-processed MIDIs ready (different genres)
2. Show those as fallback
3. Explain "We also support MIDI import for instant loading"
4. Use HuggingFace YourMT3 as online backup: https://huggingface.co/spaces/mimbres/YourMT3

---

## Files Created

After setup, your project should have:

```
dmaestro-real/
├── server/
│   ├── transcribe.py      # Python transcription script
│   └── index.ts           # Updated with local transcription
├── venv/                   # Python virtual environment
└── documents/
    └── LOCAL_SETUP_GUIDE.md
```
