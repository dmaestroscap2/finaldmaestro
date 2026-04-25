# DMAESTRO-REAL

A **REAL** music education platform with actual audio processing - no fake data!

## What Makes This Different

Unlike fake implementations that use `Math.random()` to generate notes, this project uses:

- **Spotify Basic Pitch (Neural Network)** - ML-based polyphonic analysis for guitar, piano, chords
- **YIN Autocorrelation Algorithm** - Fast monophonic pitch detection for simpler audio
- **Real-time Microphone Detection** - Actual frequency detection from your instrument
- **Time-based Note Synchronization** - Notes are positioned by actual time, not percentages

### Two Analysis Modes

| Mode | Technology | Best For |
|------|------------|----------|
| **Polyphonic** | Spotify Basic Pitch (TensorFlow.js) | Guitar chords, piano, complex audio |
| **Monophonic** | YIN Autocorrelation | Single-note melodies, voice, flute |

## Features

### For Instructors
- Upload MP3/WAV audio files
- **Real** note extraction from audio using pitch detection
- Create classrooms with join codes
- Assign music to students or entire classrooms
- Track student progress and accuracy

### For Students
- Join classrooms with codes
- Practice with real-time microphone feedback
- See detected pitch vs expected note
- Get accuracy and timing scores
- Track practice history

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Zustand
- **Backend**: Express, TypeScript, SQLite (better-sqlite3), Drizzle ORM
- **Audio**: Web Audio API, YIN pitch detection, Autocorrelation

## Setup

### 1. Install Dependencies

```bash
cd dmaestro-real
npm install
```

### 2. Start Development Servers

```bash
npm run dev
```

This starts both:
- Backend: http://localhost:3001
- Frontend: http://localhost:5173

### 3. Create an Account

1. Go to http://localhost:5173
2. Register as an **Instructor** to upload music
3. Register as a **Student** to practice

## How It Works

### Audio Upload & Note Extraction

When you upload an audio file:

1. File is saved to `/uploads` directory
2. Audio is decoded using Web Audio API
3. **YIN autocorrelation** algorithm detects pitches
4. Notes are extracted with real timestamps
5. Tempo is estimated from note onsets
6. Data is stored in SQLite database

### Real-time Practice

When a student practices:

1. Audio plays through speakers
2. Microphone captures student's playing
3. **Real-time pitch detection** using YIN algorithm
4. Detected notes compared against expected notes
5. Accuracy and timing scores calculated
6. Results saved to database

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Music
- `GET /api/music` - List all music
- `GET /api/music/:id` - Get specific music
- `POST /api/music/upload` - Upload & analyze audio

### Classrooms
- `GET /api/classrooms` - List classrooms
- `POST /api/classrooms` - Create classroom
- `POST /api/classrooms/join` - Join with code

### Assignments
- `GET /api/assignments` - List assignments
- `POST /api/assignments` - Create assignment

### Practice Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Save session results

## Database Schema

SQLite database stored at `./data/dmaestro.db`:

- `users` - User accounts (instructors & students)
- `classrooms` - Class groups with join codes
- `student_classrooms` - Enrollment join table
- `music_sheets` - Uploaded audio with extracted notes
- `assignments` - Music assigned to students
- `practice_sessions` - Practice results with scores

## No Fake Data!

This project does NOT use:
- ❌ `Math.random()` for note generation
- ❌ Hardcoded note arrays
- ❌ Mock "AI" functions
- ❌ Percentage-based timing

Instead it uses:
- ✅ Real YIN pitch detection algorithm
- ✅ Actual frequency analysis
- ✅ Time-based note positioning
- ✅ Real-time microphone input

## License

MIT
