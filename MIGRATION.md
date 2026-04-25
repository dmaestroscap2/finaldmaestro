# Migration from dmaestro-real to re-demaestro

## What's Included

### 1. **Frontend (New UI)**
- Fresh React + Vite setup from `dmaestroscapstone`
- Updated layouts (AppLayout, AuthLayout, StudentLayout)
- All pages: Dashboard, Music Library, Practice, Classrooms, etc.
- Responsive design and professional UX

### 2. **Backend**
- Express.js server with database integration
- Authentication (register, login, sessions)
- Music upload & transcription endpoints
- ML Server integration (Demucs + MR-MT3)
- Assignment and practice session tracking

### 3. **ML Server** (`ml-server/` folder)
- Python Flask API for transcription
- Demucs (stem separation)
- MR-MT3 (multi-instrument transcription)
- One-click setup (`setup.bat` / `setup.sh`)

### 4. **Documentation**
- `PROGRESS.md` - Development progress
- `documents/` - Research and implementation plans
- `.env.example` - Environment configuration

## Quick Start

### On This PC (Development)

```bash
cd C:/Users/Dell/Downloads/re-demaestro
npm install
npm run dev
```

Then visit:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### On the Other PC (ML Server)

```bash
cd C:/Users/Dell/Downloads/re-demaestro/ml-server
setup.bat
# Then in a new terminal:
conda activate dmaestro-ml
python server.py --host 0.0.0.0
```

### Connect Them

Set environment variable on dev PC:
```bash
set ML_SERVER_URL=http://<ML-PC-IP>:5000
```

## File Structure

```
re-demaestro/
├── src/                    # React frontend
│   ├── ui/pages/          # Page components
│   ├── ui/layouts/        # Layout wrappers
│   ├── ui/components/     # Reusable components
│   └── App.tsx
├── server/                 # Express backend
│   ├── index.ts           # Main server
│   ├── db.ts              # Database setup
│   └── audio-processor.ts
├── shared/                 # Shared types
│   └── schema.ts          # Drizzle schema
├── ml-server/             # Python transcription
│   ├── server.py          # Flask API
│   ├── transcribe.py      # ML pipeline
│   ├── setup.bat
│   └── setup.sh
├── documents/             # Research docs
├── PROGRESS.md
└── package.json
```

## Next Steps

1. ✅ UI frontend ready (from dmaestroscapstone)
2. ✅ Backend ready (from dmaestro-real)
3. ✅ ML server ready (from dmaestro-real)
4. 📋 Integrate frontend with backend APIs
5. 📋 Test end-to-end workflow
6. 📋 Deploy to production

## Key Differences from dmaestro-real

- Fresh start with new UI/UX from `dmaestroscapstone`
- Same backend logic and ML integration
- Clean, organized file structure
- Ready for production deployment
