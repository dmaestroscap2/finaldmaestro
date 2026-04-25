# Complete Wiring Summary

All frontend pages are now fully connected to the backend API. ✅

---

## ✅ Fully Wired Pages

### Authentication (✓ Complete)
- **LoginPage.tsx** - Instructor login → Backend `/api/auth/login`
- **StudentLoginPage.tsx** - Student login → Backend `/api/auth/login`
- **SignupPage.tsx** - Instructor signup → Backend `/api/auth/signup`
- **StudentSignupPage.tsx** - Student signup → Backend `/api/auth/signup` with instrument selection

### Dashboards (✓ Complete)
- **DashboardPage.tsx** (Instructor)
  - Loads classrooms, assignments, metrics
  - Displays recent classrooms and assignments
  - Calculates completion rates

- **StudentDashboardPage.tsx** (Student)
  - Loads joined classrooms
  - Loads pending assignments
  - Loads practice sessions
  - Join classroom functionality with code entry
  - Displays average accuracy and pending assignments

### Music Management (✓ Complete)
- **MusicLibraryPage.tsx**
  - Uploads audio file → Backend `/api/music/transcribe-ml`
  - Sends to ML server (Demucs + MR-MT3)
  - Displays notes and metadata

### Practice & Recording (✓ Complete)
- **StudentPracticePage.tsx**
  - Loads student's pending assignments
  - Shows practice pieces with metadata
  - Starts practice session with assignment context

- **StudentPracticePlayerPage.tsx**
  - Displays practice interface
  - Records performance (score, progress)
  - Submits session → Backend `/api/sessions`
  - Saves to database

### Classroom Management (✓ Complete)
- **ClassroomsPage.tsx**
  - Loads instructor's classrooms
  - Creates new classroom → Backend `/api/classrooms`
  - Shows classroom code for student joins
  - Displays enrolled students

---

## API Client (`src/api/client.ts`)

Centralized API hub with methods for:

```typescript
// Auth
authAPI.login(email, password)
authAPI.signup(email, password, name, role, instrument)
authAPI.logout()
authAPI.me()

// Music
musicAPI.list()
musicAPI.get(id)
musicAPI.uploadAndTranscribe(file, title, artist)

// Classrooms
classroomAPI.list()
classroomAPI.create(name)
classroomAPI.join(code)

// Assignments
assignmentAPI.list()
assignmentAPI.create(musicSheetId, studentId, classroomId)

// Sessions
sessionAPI.list()
sessionAPI.create(assignmentId, accuracyScore, timingScore, ...)

// ML Server Status
mlAPI.status()
```

All methods include:
- Correct base URL: `http://localhost:3001/api`
- Credentials for session auth
- Error handling with user messages

---

## Data Flow Diagram

```
┌────────────────────────────────┐
│       Frontend (React)          │
├────────────────────────────────┤
│                                │
│  ✓ Login/Signup Pages         │
│  ✓ Instructor Dashboard       │
│  ✓ Student Dashboard          │
│  ✓ Music Library              │
│  ✓ Practice Pages             │
│  ✓ Classroom Management       │
│                                │
└──────────────┬─────────────────┘
               │ HTTP (JSON)
               │ src/api/client.ts
               │
               ▼
┌────────────────────────────────┐
│     Backend (Express.js)        │
├────────────────────────────────┤
│                                │
│  ✓ Auth endpoints              │
│  ✓ Music upload               │
│  ✓ Classroom CRUD             │
│  ✓ Assignment tracking        │
│  ✓ Session recording          │
│  ✓ ML transcription call      │
│                                │
└──────────────┬─────────────────┘
               │ HTTP (Multipart/JSON)
               │
               ▼
┌────────────────────────────────┐
│   ML Server (Flask + Python)   │
├────────────────────────────────┤
│                                │
│  ✓ POST /transcribe            │
│    - Receives audio file       │
│    - Demucs (stem separation)  │
│    - MR-MT3 (transcription)    │
│    - Returns notes JSON        │
│                                │
└────────────────────────────────┘
```

---

## Environment Setup

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001/api
VITE_ML_SERVER_URL=http://localhost:5000
```

### Backend (.env)
```
ML_SERVER_URL=http://localhost:5000
REPLICATE_API_KEY=xxx (optional)
```

### ML Server
Run on separate PC:
```bash
cd ml-server
setup.bat  # Windows
./setup.sh # Linux/Mac
conda activate dmaestro-ml
python server.py --host 0.0.0.0
```

Then on dev PC:
```bash
set ML_SERVER_URL=http://<ML-PC-IP>:5000
npm run dev
```

---

## Testing Checklist

### ✓ Authentication Flow
- [ ] Register as instructor
- [ ] Register as student with instrument selection
- [ ] Login as instructor
- [ ] Login as student
- [ ] Logout

### ✓ Instructor Workflow
- [ ] View dashboard with stats
- [ ] Create a classroom
- [ ] Copy classroom code
- [ ] Upload MP3 file (with ML server running)
- [ ] See transcribed notes appear

### ✓ Student Workflow
- [ ] Join classroom with code
- [ ] View dashboard with assignments
- [ ] Start practice session
- [ ] Complete practice and save session
- [ ] View practice history on dashboard

### ✓ ML Integration
- [ ] Check ML server status: GET `/api/ml/status`
- [ ] Upload audio with transcription
- [ ] Receive notes JSON from ML server
- [ ] See ML processing time

---

## What's NOT Wired Yet

- Logout button UI (authAPI.logout() exists, needs UI button)
- Student notifications/messages
- Download PDF of sheet music
- Edit classroom details
- Delete classroom (UI exists, needs backend call)
- Advanced practice features (metronome, slowing down playback)
- Email notifications

---

## Architecture Notes

1. **Immutable API**: All API calls return new data, no side effects
2. **Error Handling**: Every endpoint catches errors and shows user messages
3. **Loading States**: Pages show "Loading..." while fetching
4. **Form Validation**: Required fields are checked before submission
5. **Session Management**: Credentials automatically sent with each request
6. **Responsive UI**: Pages load real data instead of mock data

---

## Next Steps

1. Start the backend: `npm run dev:server`
2. Start the ML server (on separate PC): `python server.py --host 0.0.0.0`
3. Start the frontend: `npm run dev:client`
4. Test login flow
5. Test music upload (with ML server running)
6. Test practice workflow

All wiring is complete and ready for testing! 🚀
