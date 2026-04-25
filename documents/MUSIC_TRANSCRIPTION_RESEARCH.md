# Music Transcription Research

Comprehensive research on AI-powered audio-to-MIDI transcription options for DMAESTRO-REAL.

---

## Executive Summary

| Solution | Accuracy | Cost | Setup Effort | Best For |
|----------|----------|------|--------------|----------|
| **ByteDance Piano** | 96.7% F1 | Free | Medium | Piano (recommended) |
| **MT3/YourMT3+** | State of art | Free | High | Multi-instrument |
| **Basic Pitch** | Medium | Free | Low | General (current) |
| **Klangio API** | High | ~$50/mo | Low | Commercial apps |
| **Replicate (hosted)** | High | Pay-per-use | Low | Quick integration |

**Recommendation**: For piano, use **ByteDance Piano Transcription** (96.7% accuracy, free, easy pip install).

---

## Option 1: ByteDance Piano Transcription (RECOMMENDED for Piano)

### Overview
- **Accuracy**: 96.72% onset F1 score on MAESTRO dataset
- **Cost**: Free, open source
- **License**: MIT
- **Supported**: Piano only (highly specialized)

### Benchmarks
| Metric | Score |
|--------|-------|
| Onset F1 | 96.72% |
| Onset + Offset F1 | 82.47% |
| Onset + Velocity F1 | 80.92% |
| Pedal Onset F1 | 91.86% |

### Installation

```bash
pip install piano_transcription_inference
```

Requires:
- PyTorch
- ffmpeg (for MP3 support)
- CUDA (optional, for GPU acceleration)

### Usage

**Command Line:**
```bash
python3 -c "
from piano_transcription_inference import PianoTranscription, sample_rate
import librosa

audio, _ = librosa.load('song.mp3', sr=sample_rate, mono=True)
transcriptor = PianoTranscription(device='cuda')  # or 'cpu'
transcriptor.transcribe(audio, 'output.mid')
"
```

**Python API:**
```python
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

# Load audio
audio, _ = librosa.load('song.mp3', sr=sample_rate, mono=True)

# Transcribe
transcriptor = PianoTranscription(device='cuda')
result = transcriptor.transcribe(audio, 'output.mid')
```

### Links
- GitHub: https://github.com/bytedance/piano_transcription
- PyPI: https://pypi.org/project/piano-transcription-inference/
- Replicate (hosted): https://replicate.com/bytedance/piano-transcription
- Colab: Available in repo

### Integration Plan
1. Install `piano_transcription_inference` on server
2. Create endpoint `/api/transcribe` that accepts audio
3. Return MIDI or parsed note JSON
4. Replace Basic Pitch with this for piano uploads

---

## Option 2: MT3 / YourMT3+ (Multi-Instrument)

### Overview
- **Accuracy**: State of the art for multi-instrument
- **Cost**: Free, open source
- **License**: Apache 2.0 (MT3), GPL-3.0 (YourMT3)
- **Supported**: Piano, drums, bass, guitar, strings, etc.

### Variants

| Model | Focus | Link |
|-------|-------|------|
| MT3 (Google) | Multi-instrument | https://github.com/magenta/mt3 |
| YourMT3 | Training toolkit | https://github.com/mimbres/YourMT3 |
| YourMT3+ | Enhanced accuracy | HuggingFace Spaces |
| MR-MT3 | Reduced instrument leakage | https://github.com/gudgud96/MR-MT3 |

### Quick Test (No Install)
- **Colab**: https://colab.research.google.com/github/magenta/mt3/blob/main/mt3/colab/music_transcription_with_transformers.ipynb
- **HuggingFace Demo**: https://huggingface.co/spaces/mimbres/YourMT3

### Requirements
- GPU with significant VRAM (T4 minimum, V100 recommended)
- Python 3.8+
- TensorFlow or PyTorch depending on variant
- ~10GB disk space for model weights

### Limitations
- Heavy computational requirements
- Complex setup (T5X framework for original MT3)
- Google doesn't support training easily
- Instrument "leakage" issue (notes assigned to wrong instruments)

### Integration Plan
1. Test with Colab first to validate accuracy
2. If good, deploy on GPU server or use Replicate
3. Fallback to ByteDance for piano-only use cases

---

## Option 3: Basic Pitch (Current)

### Overview
- **Accuracy**: Medium (good for simple melodies)
- **Cost**: Free, open source
- **License**: Apache 2.0
- **Supported**: Instrument-agnostic, polyphonic

### Pros
- Lightweight (<20MB, <17K parameters)
- Runs in browser (TensorFlow.js)
- Fast inference
- Pitch bend detection

### Cons
- Lower accuracy than specialized models
- Struggles with complex pieces
- Wrong pitches, extra/missing notes common

### Links
- Demo: https://basicpitch.spotify.com/
- GitHub: https://github.com/spotify/basic-pitch
- Blog: https://engineering.spotify.com/2022/06/meet-basic-pitch

### Current Issues in DMAESTRO
- Wrong pitches detected
- Extra notes (ghost notes, harmonics)
- Missing notes
- Timing/duration issues

---

## Option 4: Klangio API (Commercial)

### Overview
- **Accuracy**: High (instrument-specific models)
- **Cost**: ~$50/month subscription
- **License**: Commercial
- **Supported**: Piano, guitar, bass, drums, vocals

### Features
- REST API available
- Outputs: MIDI, MusicXML, PDF, GP5
- Stem separation included
- Beat/BPM detection
- Chord progression identification

### Pricing
- ~$50/month for full access
- Ticket-based system (50 tickets/month)
- Individual apps: $24.99/year (promotional)

### Links
- Website: https://klang.io/
- API Docs: https://api-docs.klang.io/

### When to Use
- Commercial product with budget
- Need multiple output formats
- Want managed service (no self-hosting)

---

## Option 5: Replicate (Hosted Models)

### Available Models

| Model | Cost/Run | Link |
|-------|----------|------|
| ByteDance Piano | ~$0.01 | https://replicate.com/bytedance/piano-transcription |
| Demucs (stems) | ~$0.05-0.12 | https://replicate.com/cjwbw/demucs |

### Pros
- No setup required
- Pay per use
- GPU handled for you

### Cons
- Requires payment (no free tier for heavy use)
- API latency
- Virtual cards may not be accepted

### Integration
Already partially implemented in DMAESTRO for Demucs. Same pattern works for piano transcription.

---

## Option 6: Other Free Tools

### NeuralNote (VST Plugin)
- Free audio-to-MIDI plugin
- Works in DAWs
- Not suitable for server integration
- Link: https://github.com/DamRsn/NeuralNote

### Omnizart
- Multi-task: piano, drums, vocals, chords
- F1 scores: 74% (drums), 66% (piano)
- Python package
- Link: https://github.com/Music-and-Culture-Technology-Lab/omnizart

### audio-to-midi (PyPI)
- FFT-based (not AI)
- Less accurate but simple
- `pip install audio-to-midi`

---

## Comparison Matrix

| Feature | ByteDance | MT3 | Basic Pitch | Klangio |
|---------|-----------|-----|-------------|---------|
| Piano Accuracy | 96.7% | High | Medium | High |
| Multi-instrument | No | Yes | Yes | Yes |
| Browser Support | No | No | Yes | No |
| GPU Required | Optional | Yes | No | N/A |
| Self-hosted | Yes | Yes | Yes | No |
| Setup Difficulty | Easy | Hard | Easy | Easy |
| Cost | Free | Free | Free | $50/mo |

---

## Recommended Architecture

### For Piano Focus (Recommended)

```
User uploads audio
       ↓
Server receives file
       ↓
ByteDance Piano Transcription (Python)
       ↓
MIDI output → Parse to JSON notes
       ↓
Return to client for visualization
```

### For Multi-Instrument

```
User uploads audio
       ↓
[Optional] Demucs stem separation
       ↓
MT3/YourMT3+ transcription
       ↓
MIDI output → Parse to JSON notes
       ↓
Return to client
```

---

## Implementation Roadmap

### Phase 1: Quick Win (1-2 hours)
1. Install `piano_transcription_inference` on server
2. Create `/api/transcribe/piano` endpoint
3. Test with sample piano recordings
4. Compare accuracy vs Basic Pitch

### Phase 2: Integration (2-4 hours)
1. Replace Basic Pitch with ByteDance in Upload flow
2. Add progress indicator (transcription takes ~10-30 seconds)
3. Parse MIDI output to note JSON format
4. Update Practice page if needed

### Phase 3: Multi-Instrument (Future)
1. Test MT3 via Colab
2. If accurate enough, deploy on GPU server
3. Or use Replicate API for multi-instrument
4. Add instrument selection in UI

---

## Server Requirements

### Minimum (CPU only)
- 4GB RAM
- 2 CPU cores
- ~2GB disk for models
- Processing time: 1-2 minutes per song

### Recommended (GPU)
- 8GB RAM
- NVIDIA GPU with 4GB+ VRAM
- CUDA 11.x
- Processing time: 10-30 seconds per song

### For MT3/YourMT3+
- 16GB RAM
- NVIDIA GPU with 8GB+ VRAM (V100 recommended)
- Processing time: 30-60 seconds per song

---

## Sources

- [ByteDance Piano Transcription](https://github.com/bytedance/piano_transcription)
- [MT3 GitHub](https://github.com/magenta/mt3)
- [YourMT3 GitHub](https://github.com/mimbres/YourMT3)
- [Basic Pitch](https://github.com/spotify/basic-pitch)
- [Klangio](https://klang.io/)
- [Replicate](https://replicate.com/)
- [MR-MT3](https://github.com/gudgud96/MR-MT3)
- [Omnizart](https://github.com/Music-and-Culture-Technology-Lab/omnizart)
- [NeuralNote](https://github.com/DamRsn/NeuralNote)
