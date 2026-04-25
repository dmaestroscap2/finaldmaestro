# Implementation Plan: Demucs + MR-MT3 Local Transcription

## Requirements Restatement

Build an end-to-end audio transcription pipeline for DMAESTRO that:
- Accepts audio uploads (MP3, WAV)
- Separates stems using Demucs (isolate instruments)
- Transcribes to MIDI using MR-MT3 (multi-instrument)
- Parses MIDI to note data for Practice mode
- Runs locally (no API costs, works offline)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DMAESTRO                                │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React)                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ Upload.tsx  │───▶│ Processing  │───▶│Practice.tsx │         │
│  │             │    │  Indicator  │    │ (notes)     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│  Backend (Express + Python)                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ /api/upload │───▶│  Demucs     │───▶│  MR-MT3     │         │
│  │             │    │  (stems)    │    │  (MIDI)     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                            │                  │                 │
│                            ▼                  ▼                 │
│                     ┌─────────────┐    ┌─────────────┐         │
│                     │ vocals.wav  │    │ output.mid  │         │
│                     │ drums.wav   │    │             │         │
│                     │ bass.wav    │    └──────┬──────┘         │
│                     │ other.wav   │           │                 │
│                     └─────────────┘           ▼                 │
│                                        ┌─────────────┐         │
│                                        │ Parse MIDI  │         │
│                                        │ to JSON     │         │
│                                        └──────┬──────┘         │
│                                               │                 │
│                                               ▼                 │
│                                        ┌─────────────┐         │
│                                        │  Database   │         │
│                                        │ (notes JSON)│         │
│                                        └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Python Environment Setup

**Tasks:**
- [ ] Install Miniconda on development machine
- [ ] Create `mrmt3` conda environment with Python 3.10
- [ ] Install PyTorch (CPU or CUDA depending on hardware)
- [ ] Install Demucs via pip
- [ ] Clone MR-MT3 repository
- [ ] Install MR-MT3 dependencies
- [ ] Download pretrained model from HuggingFace

**Commands:**
```bash
# Create environment
conda create --name mrmt3 python=3.10 -y
conda activate mrmt3

# Install PyTorch (choose one)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118  # GPU
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu    # CPU

# Install Demucs
pip install demucs

# Clone MR-MT3
git clone https://github.com/gudgud96/MR-MT3.git

# Install dependencies
cd MR-MT3
pip install transformers==4.18.0 librosa==0.9.1 note-seq==0.0.3 pretty-midi pytorch_lightning

# Download model
git lfs install
git clone https://huggingface.co/gudgud1014/MR-MT3 checkpoints/
```

**Estimated Time:** 30-60 minutes (mostly downloads)

---

### Phase 2: Python Transcription Script

**Tasks:**
- [ ] Create `server/transcribe_mt3.py` script
- [ ] Implement Demucs stem separation function
- [ ] Implement MR-MT3 inference function
- [ ] Implement MIDI to JSON parser
- [ ] Add CLI interface for testing
- [ ] Test with sample audio files

**File: `server/transcribe_mt3.py`**
```python
#!/usr/bin/env python3
"""
Transcription pipeline: Demucs (stem separation) + MR-MT3 (transcription)
Usage: python transcribe_mt3.py <audio_path> [--no-separate] [--gpu]
Output: JSON array of notes to stdout
"""

import sys
import os
import json
import subprocess
import tempfile
import argparse

def separate_stems(audio_path, output_dir):
    """Run Demucs to separate audio into stems"""
    subprocess.run([
        'demucs',
        '-n', 'htdemucs',
        '-o', output_dir,
        audio_path
    ], check=True)

    song_name = os.path.splitext(os.path.basename(audio_path))[0]
    stems_dir = os.path.join(output_dir, 'htdemucs', song_name)

    return {
        'vocals': os.path.join(stems_dir, 'vocals.wav'),
        'drums': os.path.join(stems_dir, 'drums.wav'),
        'bass': os.path.join(stems_dir, 'bass.wav'),
        'other': os.path.join(stems_dir, 'other.wav'),
    }

def transcribe_with_mt3(audio_path, output_dir, use_gpu=False):
    """Run MR-MT3 inference on audio file"""
    # Path to MR-MT3 inference script
    mt3_dir = os.environ.get('MT3_DIR', './MR-MT3')

    subprocess.run([
        'python', os.path.join(mt3_dir, 'inference.py'),
        '--audio_path', audio_path,
        '--output_dir', output_dir,
    ], check=True, cwd=mt3_dir)

    # Find output MIDI file
    for f in os.listdir(output_dir):
        if f.endswith('.mid'):
            return os.path.join(output_dir, f)

    raise FileNotFoundError("No MIDI file generated")

def parse_midi_to_notes(midi_path):
    """Parse MIDI file to note array"""
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(midi_path)
    notes = []

    for instrument in midi.instruments:
        inst_name = pretty_midi.program_to_instrument_name(instrument.program)

        for note in instrument.notes:
            note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            pitch_name = note_names[note.pitch % 12] + str(note.pitch // 12 - 1)

            notes.append({
                'pitch': pitch_name,
                'midi': note.pitch,
                'startTime': note.start,
                'endTime': note.end,
                'duration': note.end - note.start,
                'velocity': note.velocity,
                'instrument': inst_name,
            })

    # Sort by start time
    notes.sort(key=lambda x: x['startTime'])

    return notes

def process_audio(audio_path, separate=True, use_gpu=False):
    """Full pipeline: separate (optional) -> transcribe -> parse"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        if separate:
            print("Step 1/3: Separating stems with Demucs...", file=sys.stderr)
            stems = separate_stems(audio_path, tmp_dir)
            # Use 'other' stem (contains melody/piano/guitar)
            audio_to_transcribe = stems['other']
        else:
            audio_to_transcribe = audio_path

        print("Step 2/3: Transcribing with MR-MT3...", file=sys.stderr)
        midi_dir = os.path.join(tmp_dir, 'midi_output')
        os.makedirs(midi_dir, exist_ok=True)
        midi_path = transcribe_with_mt3(audio_to_transcribe, midi_dir, use_gpu)

        print("Step 3/3: Parsing MIDI to notes...", file=sys.stderr)
        notes = parse_midi_to_notes(midi_path)

        print(f"Done! Extracted {len(notes)} notes.", file=sys.stderr)
        return notes

def main():
    parser = argparse.ArgumentParser(description='Transcribe audio to notes')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--no-separate', action='store_true', help='Skip stem separation')
    parser.add_argument('--gpu', action='store_true', help='Use GPU acceleration')

    args = parser.parse_args()

    notes = process_audio(
        args.audio_path,
        separate=not args.no_separate,
        use_gpu=args.gpu
    )

    # Output JSON to stdout
    print(json.dumps(notes))

if __name__ == '__main__':
    main()
```

**Estimated Time:** 1-2 hours

---

### Phase 3: Server Integration

**Tasks:**
- [ ] Add new endpoint `/api/music/upload-transcribe`
- [ ] Call Python script from Node.js using `child_process`
- [ ] Handle long-running process with status updates
- [ ] Save transcribed notes to database
- [ ] Return progress to frontend

**File: `server/index.ts` (additions)**
```typescript
import { spawn } from 'child_process';

// Transcribe using local Demucs + MR-MT3
app.post('/api/music/upload-transcribe', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const { title, artist, instrument } = req.body;
    const userId = req.session.userId!;
    const audioPath = req.file!.path;

    console.log(`Starting transcription: ${title} by ${artist}`);

    // Call Python transcription script
    const notes = await transcribeWithPython(audioPath);

    console.log(`Transcribed ${notes.length} notes`);

    // Transpose if needed
    const transposedNotes = instrument
      ? transposeForInstrument(notes, instrument)
      : notes;

    // Calculate duration from last note
    const duration = notes.length > 0
      ? Math.max(...notes.map(n => n.endTime || n.startTime + 1))
      : 0;

    // Save to database
    const [newMusic] = await db
      .insert(musicSheets)
      .values({
        title,
        artist,
        uploadedBy: userId,
        audioPath: `/uploads/${req.file!.filename}`,
        duration,
        tempo: 120, // TODO: detect from MIDI
        notesJson: JSON.stringify(transposedNotes),
      })
      .returning();

    res.json({
      ...newMusic,
      notes: transposedNotes,
      noteCount: transposedNotes.length,
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
});

async function transcribeWithPython(audioPath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [
      './transcribe_mt3.py',
      audioPath,
      // '--no-separate',  // Uncomment to skip stem separation
      // '--gpu',          // Uncomment if GPU available
    ], {
      cwd: __dirname,
      env: {
        ...process.env,
        MT3_DIR: process.env.MT3_DIR || './MR-MT3',
      },
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('[Transcription]', data.toString().trim());
    });

    python.on('close', (code) => {
      if (code === 0) {
        try {
          const notes = JSON.parse(stdout);
          resolve(notes);
        } catch (e) {
          reject(new Error('Failed to parse transcription output'));
        }
      } else {
        reject(new Error(`Transcription failed (code ${code}): ${stderr}`));
      }
    });

    python.on('error', (err) => {
      reject(err);
    });
  });
}
```

**Estimated Time:** 1-2 hours

---

### Phase 4: Frontend Updates

**Tasks:**
- [ ] Update Upload.tsx to use new endpoint
- [ ] Add progress indicator during transcription
- [ ] Handle long processing time (3-5 minutes)
- [ ] Show estimated time remaining
- [ ] Add cancel option

**File: `client/src/pages/Upload.tsx` (updates)**
```typescript
const [isTranscribing, setIsTranscribing] = useState(false);
const [progress, setProgress] = useState('');

const handleUpload = async () => {
  setIsTranscribing(true);
  setProgress('Uploading audio...');

  try {
    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('title', title);
    formData.append('artist', artist);
    formData.append('instrument', instrument);

    setProgress('AI is transcribing... this may take 2-5 minutes');

    const response = await fetch('/api/music/upload-transcribe', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Upload failed');

    const result = await response.json();
    setProgress(`Done! Extracted ${result.noteCount} notes`);

    // Navigate to practice or library
    navigate(`/practice/${result.id}`);

  } catch (error) {
    setProgress('Transcription failed. Please try again.');
    console.error(error);
  } finally {
    setIsTranscribing(false);
  }
};

// In render:
{isTranscribing && (
  <div className="transcription-progress">
    <div className="spinner" />
    <p>{progress}</p>
    <p className="hint">Tip: Transcription uses AI to detect notes. Complex songs take longer.</p>
  </div>
)}
```

**Estimated Time:** 1 hour

---

### Phase 5: Testing & Refinement

**Tasks:**
- [ ] Test with simple piano recordings
- [ ] Test with multi-instrument songs
- [ ] Test with different audio formats (MP3, WAV)
- [ ] Measure processing times
- [ ] Tune Demucs/MT3 parameters if needed
- [ ] Add error handling for edge cases

**Test Cases:**
1. Clean piano solo (should work best)
2. Piano + accompaniment (test stem separation)
3. Full band song (guitar, bass, drums, vocals)
4. Short clip (< 1 minute)
5. Long song (5+ minutes)

**Estimated Time:** 2-3 hours

---

## File Structure After Implementation

```
dmaestro-real/
├── server/
│   ├── index.ts              # Express server (updated)
│   ├── transcribe_mt3.py     # Python transcription script (new)
│   └── audio-processor.ts    # Existing (fallback)
├── client/src/
│   └── pages/
│       └── Upload.tsx        # Updated with progress UI
├── MR-MT3/                   # Cloned repo
│   ├── inference.py
│   └── checkpoints/          # Downloaded models
└── documents/
    ├── LOCAL_SETUP_GUIDE.md
    ├── IMPLEMENTATION_PLAN.md  # This file
    └── ...
```

---

## Dependencies

### Python (conda environment)
- Python 3.10
- PyTorch (CPU or CUDA)
- Demucs
- MR-MT3 dependencies:
  - transformers==4.18.0
  - librosa==0.9.1
  - note-seq==0.0.3
  - pretty-midi
  - pytorch_lightning

### System
- FFmpeg (for audio processing)
- Git LFS (for model download)
- ~10GB disk space for models

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MR-MT3 accuracy lower than expected | Medium | High | Test early, have Klangio as backup |
| Processing time too long (>5 min) | Medium | Medium | Use GPU, or process in background |
| Model download fails | Low | High | Manual download from HuggingFace |
| Memory issues on laptop | Medium | High | Use smaller batch size, close other apps |
| Windows compatibility issues | Medium | Medium | Test early, use WSL if needed |

---

## Estimated Total Time

| Phase | Time |
|-------|------|
| Phase 1: Environment Setup | 30-60 min |
| Phase 2: Python Script | 1-2 hours |
| Phase 3: Server Integration | 1-2 hours |
| Phase 4: Frontend Updates | 1 hour |
| Phase 5: Testing | 2-3 hours |
| **Total** | **6-10 hours** |

---

## Fallback Options

If local MT3 doesn't work:

1. **HuggingFace YourMT3** - Free online, manual workflow
   - https://huggingface.co/spaces/mimbres/YourMT3

2. **Music Demixer** - Free online, get MIDI
   - https://freemusicdemixer.com/

3. **Klangio API** - $99/mo, automated
   - Best quality, quick integration

4. **Pre-processed MIDIs** - For defense demo only
   - Prepare 5-10 songs in advance

---

## Commands Cheat Sheet

```bash
# Activate environment
conda activate mrmt3

# Test Demucs
demucs "test.mp3" -o output/

# Test MR-MT3
cd MR-MT3
python inference.py --audio_path "test.mp3" --output_dir output/

# Run full pipeline
python server/transcribe_mt3.py "test.mp3"

# Start DMAESTRO server
npm run dev
```

---

## Status

- [ ] Phase 1: Environment Setup (on ML PC)
- [x] Phase 2: Python Script (ml-server/transcribe.py)
- [x] Phase 3: Server Integration (server/index.ts updated)
- [ ] Phase 4: Frontend Updates
- [ ] Phase 5: Testing

---

## Split Architecture (Implemented)

Since development happens on one PC and ML processing on another:

```
┌─────────────────────┐       HTTP        ┌─────────────────────┐
│   Development PC    │ ────────────────▶ │      ML PC          │
│   (Claude CLI)      │                   │   (GPU/resources)   │
│                     │ ◀──────────────── │                     │
│   DMAESTRO App      │    JSON notes     │   ml-server/        │
│   Node.js/React     │                   │   Flask + MT3       │
└─────────────────────┘                   └─────────────────────┘
```

### Setup on ML PC

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd dmaestro-real/ml-server

# 2. Run setup (Windows)
setup.bat

# 3. Or run setup (Linux/Mac)
chmod +x setup.sh
./setup.sh

# 4. Start the server
conda activate dmaestro-ml
python server.py --host 0.0.0.0
```

### Connect from Development PC

```bash
# Set the ML server IP in environment
set ML_SERVER_URL=http://<ML-PC-IP>:5000
npm run dev
```

### Files Created

- `ml-server/server.py` - Flask API server
- `ml-server/transcribe.py` - Transcription pipeline
- `ml-server/requirements.txt` - Python dependencies
- `ml-server/setup.bat` - Windows setup script
- `ml-server/setup.sh` - Linux/Mac setup script
- `ml-server/README.md` - Setup instructions
- `.env.example` - Environment variable documentation

### API Endpoints Added

- `GET /api/ml/status` - Check ML server availability
- `POST /api/music/transcribe-ml` - Transcribe using ML server

**Ready to begin when you are.**
