# Progress: Klangio Implementation (Phase 1)

Date: 2026-04-16

This file documents the current state of the Klangio integration and the music preview pipeline in this repo (`re-demaestro`).

## Tech Stack (Current)

- Client: React + TypeScript + Vite (dev at `http://localhost:5173`)
- Server: Express + TypeScript (API at `http://localhost:3001`)
- DB: SQLite (`data/dmaestro.db`) via Drizzle + better-sqlite3
- Upload storage: `./uploads/` served by the API (Klangio artifacts saved under `./uploads/klangio/<jobId>/...`)

## Supported Instruments (UI Filter List)

The UI instrument dropdown is currently scoped to the presentation set:

- guitar
- saxophone
- clarinet
- xylophone
- trombone
- piano
- trumpet

## Klangio Integration (Server)

### Endpoint: Transcribe

`POST /api/music/transcribe-klangio`

Current behavior:

- Uses `model=multi` by default (multi-instrument mode).
- Runs one Klangio job per requested output type (more reliable than requesting many outputs in a single job).
- Downloads and persists outputs:
  - JSON (`/job/<id>/json`) is downloaded from the same job as MusicXML.
  - MusicXML (`/job/<id>/xml`)
  - MIDI (quantized) (`/job/<id>/midi_quant`)
  - PDF (`/job/<id>/pdf`)
  - GP5 (`/job/<id>/gp5`)
- Writes files under `uploads/klangio/<jobId>/`:
  - `score.json`
  - `score.musicxml`
  - `score.midi_quant.mid`
  - `score.pdf`
  - `score.gp5`

Notes:

- On job creation, Klangio rejects `outputs=json` in the creation payload (422), but JSON is still retrievable via the download endpoint.
- API key is intentionally not stored in this repo docs. Use an env var locally.

### Endpoint: Fetch Music (With Source Selection)

`GET /api/music/:id?instrument=<instrument>&source=<klang_json|midi_quant|stored>`

- `source=klang_json`
  - Parses persisted `klangio_json` to return:
    - `notes` (ExtractedNote[]) for the selected instrument part (best-effort part matching)
    - `availableParts` (names detected in Klang JSON)
    - `partName` (the part actually selected)
    - `tabEvents` + `tabMeasureStarts` when `TabPosition` exists (guitar)
- `source=midi_quant`
  - Reads `score.midi_quant.mid`, selects a track heuristically, and returns `notes`
- `source=stored`
  - Returns `notes_json` stored on the music row (legacy flattened notes)

## DB Persistence (SQLite)

DB file:

- `data/dmaestro.db`

`music_sheets` table now includes Klangio fields (persisted paths + raw JSON):

- `klangio_job_id`
- `klangio_model`
- `klangio_json`
- `klangio_json_path`
- `klangio_mxml_path`
- `klangio_midi_quant_path`
- `klangio_pdf_path`
- `klangio_gp5_path`

Additionally:

- `notes_json` remains a simplified flattened note list (what the UI originally rendered from).

## Parsing / Conversion (Server Modules)

Implemented:

- `server/klangioScore.ts`: converts Klang JSON measures/notes into `ExtractedNote[]` using measure timestamps and fractional durations.
- `server/klangioTab.ts`: extracts guitar `TabPosition` into scrolling tab events + measure start markers.
- `server/midiScore.ts`: converts MIDI (quant) to `ExtractedNote[]`.

Tests (Vitest):

- `server/klangioScore.test.ts`
- `server/klangioTab.test.ts`

## UI Behavior (Client)

Music preview modal (`MusicLibraryPage` flow):

- Scrolling “practice lane” with fixed playhead:
  - Notes scroll under the playhead as audio plays.
  - A timing offset control exists to compensate for alignment issues (positive offset moves notes earlier relative to playback).
- Source dropdown:
  - `Klang JSON` vs `MIDI (quant)` vs `Stored`
  - Changing source or instrument refetches `/api/music/:id?...` and updates preview data.
- Instrument dropdown (limited to the presentation set above).
- “Klang Outputs” buttons exist to open/download:
  - PDF, MusicXML, MIDI-quant, GP5, JSON (when present)
- Guitar TAB lane:
  - Displays 6 strings and fret numbers scrolling.
  - Attempts to stack chord tones and show barlines using `tabMeasureStarts`.

Playback:

- Synth playback uses Tone PolySynth.
- Playback transposition is currently set to 0 (play the pitches returned by the selected source “as-is”).
- Display transposition is handled separately (written-pitch display shift for some instruments).

## Known Issues / Gaps

1. TAB mismatch vs Klang Studio PDF
- Most likely causes:
  - Incorrect part selection (e.g., Bass selected instead of Guitar)
  - String orientation mismatch (Klang tab typically shows string 1 = high E at the top, string 6 = low E at the bottom)
  - Using JSON-derived events vs MusicXML/GP5 engraving rules

2. Pitch parity vs Klang Studio UI
- Root causes may include:
  - “Written pitch” vs “sounding pitch” conventions for transposing instruments (and guitar octave notation)
  - Different source formats (JSON vs MIDI-quant) and quantization/tempo handling

3. Visual parity (engraving/layout)
- Klang Studio’s PDF/preview is essentially an engraving renderer driven by MusicXML/GP5 semantics.
- Our scrolling lane is an event visualization; it will not match PDF layout 1:1 unless we render from MusicXML/GP5.

## Practical Next Steps (To Match Klang Studio More Closely)

- Add a debug strip in the preview modal showing:
  - `source`, `instrument`, `partName`, `availableParts`, `tabEvents count`, first few tab events
- Verify guitar tab string ordering; invert rendering if needed to match PDF.
- Prefer MusicXML for visual rendering (e.g., OpenSheetMusicDisplay) when the goal is “looks like Klang PDF”.
- Prefer MIDI-quant for time alignment when the goal is “plays and scrolls in sync”.

