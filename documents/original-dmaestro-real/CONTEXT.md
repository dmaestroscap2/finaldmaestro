# DMAESTRO-REAL Project Context

## Overview
This is a REAL music education platform (replacement for a fake/scam project). It uses actual audio analysis to extract notes from music files and provides real-time pitch detection for practice sessions.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + TypeScript
- **Database**: SQLite with Drizzle ORM
- **Audio Analysis**: Spotify Basic Pitch (polyphonic/chords), YIN autocorrelation (monophonic)

## Key Files
- `client/src/pages/Practice.tsx` - Main practice page with note visualization
- `client/src/pages/Upload.tsx` - Music upload with Basic Pitch analysis
- `client/src/lib/pitch-detector.ts` - Real-time microphone pitch detection
- `client/src/lib/basic-pitch-analyzer.ts` - Spotify Basic Pitch wrapper
- `server/audio-processor.ts` - Server-side audio processing

## Practice Page Issues FIXED

### 1. Page Freezing (769 notes)
- **Problem**: React re-rendering caused freeze with many notes
- **Solution**: Canvas-based rendering (bypasses React), O(1) lookups with Map

### 2. Infinite Loop Bug
- **Problem**: `handleTimeUpdate` had while loop using stale `currentNoteIndex` from closure
- **Solution**: Used ref (`noteIndexRef`) for current value, batch updates

### 3. Audio/Visual Sync
- **Problem**: Basic Pitch timestamps don't match actual audio timing
- **Solution**: Added `AUDIO_SYNC_OFFSET` constant (currently -2.03 seconds)
- **Location**: `Practice.tsx` line ~594

### 4. Scroll Speed
- **Problem**: Notes sliding too slow compared to audio
- **Solution**: Adjusted `pixelsPerSecond` to `width * 0.05`
- **Location**: `Practice.tsx` line ~589

## Current Tuning Values (Practice.tsx)
```javascript
const AUDIO_SYNC_OFFSET = -2.03;  // Shifts notes earlier to match audio
const pixelsPerSecond = width * 0.05;  // Scroll speed (5% of canvas width per second)
```

## Debug Logging
There's debug logging in the canvas draw loop (lines ~596-615) that traces:
- `audioTime` - current audio playback time
- `timeLineX` - green timeline position (pixels)
- `pixelsPerSec` - scroll speed
- Closest note info: pitch, rawStart, adjStart, xPos, distFromLine

**To disable logging**: Remove or comment out the logging block in `NoteVisualization` component.

## How Note Visualization Works
1. Canvas renders at 60fps using `requestAnimationFrame`
2. Reads `audioRef.current.currentTime` directly (no React state)
3. Notes positioned: `x = timeLineX + (adjStart - currentTime) * pixelsPerSecond`
4. Green line at 20% from left (`timeLineX = width * 0.2`)
5. Only renders notes within -3s to +25s of current time

## Running the App
```bash
cd C:\Users\Dell\Downloads\dmaestro-real
npm run dev
```
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Known Issues / TODO
- Sync offset (-2.03) is hardcoded - may need adjustment for different songs
- Could add user-adjustable sync slider
- Note durations from Basic Pitch may not perfectly match actual sound
