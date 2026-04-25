# Progress (Implementation Phase 1) - 2026-04-16

Branch: `feat/implementation-phase-1`

This document captures what was implemented/fixed today so we can pick up later.

## Status Snapshot

- Backend (Express + SQLite + Drizzle) is running locally on `http://localhost:3001`.
- Frontend (React + Vite) is running locally on `http://localhost:5173`.
- Production build works: `npm.cmd run build`.
- Klangio transcription via backend works end-to-end (tested with a local MP3).
- Music Library now loads real rows from SQLite and refreshes after upload.
- Preview modal can play original audio, synthesize note playback, and download notes JSON.

## Key Changes

### Klangio Integration

- Fixed Klangio multipart upload implementation: switched to platform `FormData` + `Blob` (via `readFile`) instead of the `form-data` package to avoid API body parsing errors.
- Added an orchestration helper:
  - `transcribeKlangioExtractedNotes(...)` in `server/klangio.ts`.

### Auth / Demo Workflow

- Client signup now targets the server route:
  - Frontend uses `/api/auth/register` (server also supports `/api/auth/signup` alias).
- Demo users are seeded on backend startup (so login works immediately):
  - Instructor: `bert@gmail.com` / `password`
  - Student: `berto@gmail.com` / `password`
- Signup pages no longer default to the seeded demo emails (to avoid "Email already registered" 400s).

### Music Library (DB-Backed UI)

- Music Library page previously rendered a hardcoded card; now it:
  - Fetches `/api/music` on mount.
  - Refreshes list after upload/transcribe.
  - Shows duration and note counts.

### Preview Modal

In the Music Library preview modal:

- "Play Original Audio" now plays/pauses the uploaded MP3 (served from backend `/uploads/...`).
- "Play Synthesized Notes" plays extracted notes using `tone`.
  - A simple instrument transposition mapping is applied.
- "Download Notes" downloads extracted notes as `*.notes.json`.

## Database

- Engine: SQLite
- File: `./data/dmaestro.db`
- Tables are created at server start (`server/db.ts`).

## Scripts / Tests (No Subprocess Runner)

Vitest cannot run in this environment due to `spawn EPERM`, so lightweight no-spawn runners were added:

- Klangio helper tests:
  - `npm.cmd run test:klangio`
- Music library utils tests:
  - `npm.cmd run test:music-utils`
- Preview utils tests:
  - `npm.cmd run test:preview-utils`

Generated test build outputs are ignored:

- `dist-klangio-test/`
- `dist-music-utils-test/`
- `dist-music-preview-utils-test/`

## Notes / Constraints

- Klangio API plan (per screenshot): 500 requests/month included, max 300s audio per request, 2 req/sec.
- Instruments in scope for this project/demo: guitar, saxophone, clarinet, xylophone, trombone, piano, trumpet.
- Avoid pasting API keys into chat; treat any shared keys as compromised.

## Recent Commits (Most Relevant)

- `9ceb8a6` feat(preview): play audio, synth notes, download JSON
- `8b040f8` feat(library): load music from API and refresh after upload
- `a8b07cb` fix(auth+klangio): signup route + multipart upload
- `3e86115` fix(build): unblock production build

## Next Likely Steps

- Wire actual "Preview Sound" tabs to switch behavior (original vs synth) instead of being mostly cosmetic.
- Add delete music endpoint + UI wiring.
- Add assignment creation UI that uses `/api/assignments`.
- Improve synth playback quality (tempo alignment, instrument selection, stop button cleanup).
