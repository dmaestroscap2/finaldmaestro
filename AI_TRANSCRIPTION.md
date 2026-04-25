# AI Music Transcription (Project Context)

This repo supports **audio → notes** transcription in two ways:

1) **ML Server (recommended / higher accuracy)**: Demucs stem separation + MR-MT3 transcription (runs in `ml-server/`).
2) **Server fallback (lower accuracy / lightweight)**: in-process extraction in `server/audio-processor.ts`.

---

## Current Wiring (End-to-End)

### Frontend → Backend
- Frontend calls the Express API at `http://localhost:3001/api` (currently hardcoded in `src/api/client.ts`).
- The “Upload & Convert” flow is wired in `src/ui/pages/MusicLibraryPage.tsx` → `musicAPI.uploadAndTranscribe(...)`.

### Backend → ML Server
- Backend endpoint: `POST /api/music/transcribe-ml` (see `server/index.ts`).
- Backend forwards the uploaded audio to the ML server at `ML_SERVER_URL` (default: `http://localhost:5000`).
- ML server performs:
  - **Demucs** to separate stems (typically uses `other.wav` for melody/instruments)
  - **MR-MT3** to transcribe into note events
- Backend saves the returned notes JSON into SQLite (`music_sheets.notes_json`) via Drizzle schema in `shared/schema.ts`.

### Stored Output Format
- Notes are persisted as JSON in the `music_sheets` table (`notes_json` column).
- The shared TypeScript shape for notes is described in `shared/schema.ts` (`ExtractedNote` interface).

---

## API Endpoints (Relevant)

### Backend (Express)
- `POST /api/music/transcribe-ml`: upload audio and transcribe via ML server.
- `GET /api/ml/status`: backend health check for ML server connectivity.
- `POST /api/music/upload`: fallback audio-to-notes extraction using server-side logic.

### ML Server (Flask)
Documented in `ml-server/README.md`:
- `POST /transcribe` (multipart form-data)
  - `audio`: file
  - `separate`: optional boolean (defaults true)
- `GET /health`
- `GET /status`

---

## Environment Variables

### Backend
- `ML_SERVER_URL` (default: `http://localhost:5000`)
  - Note: backend does **not** auto-load `.env` (no `dotenv`), so set this in your shell/session.

Example (PowerShell):
```powershell
$env:ML_SERVER_URL="http://192.168.1.100:5000"
npm run dev:server
```

### Frontend (Vite)
- `VITE_API_URL` / `VITE_ML_SERVER_URL` may exist in `.env`, but `src/api/client.ts` currently uses a hardcoded base URL.

---

## How To Run (Dev)

### 1) Start Backend + Frontend
```bash
npm install
npm run dev
```

### 2) Start ML Server (same PC or another PC)
From this repo:
```bash
cd ml-server
setup.bat
conda activate dmaestro-ml
python server.py --host 0.0.0.0
```

Then point the backend to it using `ML_SERVER_URL`.

---

## Research / Reference Docs (Already in This Repo)

- `documents/MUSIC_TRANSCRIPTION_RESEARCH.md` (model comparison + recommended options)
- `documents/LOCAL_SETUP_GUIDE.md` (local transcription setup and demo checklist)
- `ml-server/README.md` (ML server setup + API contract)

Original project docs copied here for reference:
- `documents/original-dmaestro-real/CONTEXT.md`
- `documents/original-dmaestro-real/README.md`

