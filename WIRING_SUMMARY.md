# Wiring Summary - Frontend to Backend

All major flows are now wired up:

## ✅ Authentication

### Login Pages
- **File**: `src/ui/pages/auth/LoginPage.tsx` (Instructor)
- **File**: `src/ui/pages/auth/StudentLoginPage.tsx` (Student)
- **Flow**: Form inputs → `authAPI.login()` → Backend `/api/auth/login` → Navigate to dashboard
- **Status**: Fully wired

### Signup (TODO - not wired yet)
- **Files**: `src/ui/pages/auth/SignupPage.tsx`, `StudentSignupPage.tsx`
- **Needed**: Wire form inputs to `authAPI.signup()`

---

## ✅ Music Upload & Transcription

### Music Library Page
- **File**: `src/ui/pages/MusicLibraryPage.tsx`
- **Flow**: User selects file → Enter title/composer → Click "Upload & Convert"
  1. Reads file from input
  2. Calls `musicAPI.uploadAndTranscribe(file, title, composer)`
  3. Sends to Backend `/api/music/transcribe-ml`
  4. Backend calls ML Server `/transcribe`
  5. ML Server processes (Demucs + MR-MT3)
  6. Notes returned and saved to database
  7. Modal closes, music library refreshes
- **Status**: Fully wired (except refresh not implemented)

---

## ✅ API Client

### File: `src/api/client.ts`
Centralized API client with methods for:
- `authAPI.login()`, `signup()`, `logout()`, `me()`
- `musicAPI.list()`, `get()`, `uploadAndTranscribe()`
- `classroomAPI.list()`, `create()`, `join()`
- `assignmentAPI.list()`, `create()`
- `sessionAPI.list()`, `create()`
- `mlAPI.status()` - Check ML server health

All methods:
- Use correct base URL: `http://localhost:3001/api`
- Include credentials for session auth
- Handle errors with human-readable messages

---

## 📋 Still Need to Wire

### Authentication
- [ ] Signup pages - wire form to `authAPI.signup()`
- [ ] Logout - wire button to `authAPI.logout()`
- [ ] Me endpoint - get current user on app load

### Music Library
- [ ] Refresh music list after upload
- [ ] Load actual music from DB instead of mock data
- [ ] Preview modal - load actual notes
- [ ] Delete music
- [ ] Transpose notes

### Practice / Student Flow
- [ ] Practice player - load assignment and capture performance
- [ ] Session recording - send practice results to `/api/sessions`
- [ ] Dashboard - load actual assignments and practice sessions

### Classrooms
- [ ] Classroom list - load from DB
- [ ] Create classroom - wire button
- [ ] Join classroom - wire form
- [ ] Student list - load students in classroom

### Assignments
- [ ] Assign music to class/student
- [ ] Track assignment status

---

## Environment Setup

### Frontend Environment Variables
File: `.env`
```
VITE_API_URL=http://localhost:3001/api
VITE_ML_SERVER_URL=http://localhost:5000
```

Can be accessed in code as `import.meta.env.VITE_API_URL`

### Backend Environment Variables
File: `.env.example` (create `.env` locally)
```
ML_SERVER_URL=http://localhost:5000
REPLICATE_API_KEY=xxx (optional)
```

### ML Server
Run on separate PC:
```bash
cd ml-server
setup.bat
conda activate dmaestro-ml
python server.py --host 0.0.0.0
```

Then set on dev PC:
```bash
set ML_SERVER_URL=http://<ML-PC-IP>:5000
npm run dev
```

---

## Testing the Setup

### 1. Start Backend
```bash
npm run dev:server
```
Should see:
```
DMAESTRO-REAL Server Running
API: http://localhost:3001
```

### 2. Start Frontend
```bash
npm run dev:client
```
Should see:
```
Local: http://localhost:5173
```

### 3. Test Login
- Go to `http://localhost:5173/login`
- Use: email=`bert@gmail.com`, password=`password`
- Should redirect to `/instructor/dashboard`

### 4. Test Music Upload
- Go to Music Library
- Click "Upload MP3"
- Select file, fill in title/composer
- Click "Upload & Convert"
- Should send to backend → ML server → save to DB

### 5. Check ML Server Status
- Backend will show in startup logs
- Or check: `http://localhost:3001/api/ml/status`
- If down: 503 "ML server unavailable"

---

## Architecture Diagram

```
┌─────────────────────────────┐
│   Frontend (React + Vite)    │
│   Port 5173                  │
│ - Login pages (wired)        │
│ - Music library (wired)      │
│ - Dashboard (TODO)           │
│ - Practice player (TODO)     │
└──────────────┬──────────────┘
               │ HTTP
               ▼
┌─────────────────────────────┐
│  Backend (Express + SQLite) │
│  Port 3001                  │
│ - Auth endpoints            │
│ - Music upload              │
│ - ML transcription call     │
└──────────────┬──────────────┘
               │ HTTP
               ▼
┌─────────────────────────────┐
│  ML Server (Flask + Python) │
│  Port 5000 (other PC)       │
│ - Demucs (stem separation)  │
│ - MR-MT3 (transcription)    │
│ - Returns JSON notes        │
└─────────────────────────────┘
```

---

## Next Steps

1. Test the login flow
2. Test the music upload flow (needs ML server running)
3. Wire remaining pages (signup, dashboards, practice)
4. Add refresh/refetch after upload
5. Load real data instead of mock UI
6. Deploy to production
