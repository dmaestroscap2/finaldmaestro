# DMAESTRO-REAL Progress & Roadmap

## Current State

A music education platform for practicing instruments with real-time note visualization and feedback.

### Working Features

- **Audio Upload & Analysis**: Upload MP3/WAV files, extract notes using Spotify Basic Pitch
- **MIDI Web Search**: Automatically fetches MIDI from BitMidi for pitch validation
- **Hybrid Note Merging**: Combines AI timing with MIDI-validated pitches using sequence alignment
- **Practice Mode**: Real-time canvas-based note visualization at 60fps
- **User Auth**: Registration, login, sessions
- **Classrooms**: Instructor creates classrooms, students join with code
- **Assignments**: Assign music to students, track progress

### Tech Stack

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Express + TypeScript + SQLite (Drizzle ORM)
- **Audio Analysis**: Spotify Basic Pitch (browser), YIN (server fallback)
- **Note Merging**: Needleman-Wunsch sequence alignment algorithm

---

## Recent Fixes

1. **Practice Page Freezing** - Switched from React re-renders to canvas-based rendering
2. **Infinite Loop** - Fixed useEffect dependency causing endless re-renders
3. **Audio Time Stretch (2x)** - Added resampling from 44100/48000Hz to 22050Hz (Basic Pitch requirement)
4. **Too Many Notes Detected** - Tuned thresholds from (0.5, 0.3, 5) to (0.55, 0.4, 7)
5. **Harmonic Detection** - Filter octave harmonics (C5 when C4 plays)
6. **Audio Sync** - Set offset to 0 after resampling fix

---

## Known Issues

### Basic Pitch Accuracy
The Spotify Basic Pitch model has limitations:
- Wrong pitches, extra/missing notes, timing issues
- Works okay for simple melodies, struggles with complex pieces

### MIDI Web Fetch Doesn't Work
Fetching MIDI from BitMidi is fundamentally flawed:
- MIDI from web ≠ transcription of uploaded audio
- Different arrangement, tempo, duration
- Merging mismatched sources produces garbage

---

## Better AI Models to Explore

| Model | Best For | Accuracy | How to Run |
|-------|----------|----------|------------|
| **MT3** | Multi-instrument | State of art | [Free Colab](https://colab.research.google.com/github/magenta/mt3/blob/main/mt3/colab/music_transcription_with_transformers.ipynb) or self-host |
| **Onsets and Frames** | Piano | Very high | Python/TensorFlow |
| **Omnizart** | Piano/drums/vocals | High | Python |
| Basic Pitch | General | Medium | Browser (current) |

**MT3 is free & open source:** [github.com/magenta/mt3](https://github.com/magenta/mt3)

Two modes:
- `ismir2021` - Piano only (faster)
- `mt3` - Multi-instrument (more versatile)

---

## In Progress: Local Transcription Pipeline

**Goal**: Run Demucs + transcription locally for accurate multi-instrument support.

### Pipeline

```
Audio Upload → Demucs (separate stems) → ByteDance/MT3 (transcribe) → MIDI → Notes
```

### Setup (see documents/LOCAL_SETUP_GUIDE.md)

```bash
pip install demucs piano-transcription-inference torch librosa mido
```

### Processing Time

| Song Length | CPU | GPU |
|-------------|-----|-----|
| 3 minutes | 3-5 min | 1-2 min |
| 5 minutes | 5-8 min | 2-3 min |

### Why Local?

- Free (no API costs)
- Works offline (reliable for defense demo)
- No rate limits
- Full control

---

## TODO

### High Priority

- [ ] **Integrate local Demucs + transcription** - See LOCAL_SETUP_GUIDE.md
- [ ] **MIDI upload support** - Let users upload their own MIDI files
- [ ] **Processing progress UI** - Show "AI is processing..." indicator
- [ ] **Remove MIDI web fetch** - BitMidi approach doesn't work

### Medium Priority

- [ ] **Real-time Pitch Detection** - Detect user's played notes via microphone
- [ ] **Scoring System** - Compare played notes vs expected, give accuracy/timing scores
- [ ] **Practice History** - Track improvement over time

### Low Priority / Future

- [ ] **Sheet Music Generation** - Generate visual sheet music from extracted notes
- [ ] **Metronome** - Add click track for timing practice
- [ ] **Loop Sections** - Allow practicing specific sections on repeat
- [ ] **Slow Down Audio** - Time-stretch without pitch change for practice
- [ ] **Multiple Instruments** - Support transposing for different instruments (already partial)

---

## File Structure

```
client/src/
├── lib/
│   ├── basic-pitch-analyzer.ts  # Audio → notes (Spotify Basic Pitch)
│   ├── midi-fetcher.ts          # Search & parse MIDI from BitMidi
│   ├── note-merger.ts           # Hybrid AI + MIDI merging
│   └── stem-separator.ts        # Replicate Demucs client
├── pages/
│   ├── Upload.tsx               # Upload with stem separation toggle
│   └── Practice.tsx             # Real-time note visualization

server/
├── index.ts                     # Express server + API routes
├── audio-processor.ts           # Server-side audio analysis (fallback)
└── db.ts                        # SQLite database
```

---

## Commands

```bash
# Start development
npm run dev

# Frontend only
cd client && npm run dev

# Backend only
cd server && npm run dev

# Install Demucs locally (for stem separation)
pip install demucs
```

---

## Notes

- Basic Pitch requires 22050Hz sample rate - audio is resampled automatically
- MIDI from BitMidi may have extra instruments - sanity check compares note counts
- Canvas rendering bypasses React for smooth 60fps visualization
- Stem separation is optional - works without it for clean audio
