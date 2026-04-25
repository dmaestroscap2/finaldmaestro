import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import multer from 'multer';
import { mkdirSync, existsSync, readFileSync, createReadStream, writeFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { db, dbMode, ensureDatabaseInitialized } from './db';
import { users, classrooms, studentClassrooms, musicSheets, assignments, practiceSessions, feedback, notifications } from '../shared/schema';
import { eq, and, or, desc, inArray, isNull, sql } from 'drizzle-orm';
import { extractNotesFromAudio, transposeForInstrument } from './audio-processor';
import {
  createKlangioTranscriptionJob,
  fetchKlangioJobResult,
  fetchKlangioJobOutput,
  midiBytesToExtractedNotes,
  pollKlangioJobStatus,
} from './klangio';
import { klangioJsonToExtractedNotes, listKlangioParts, pickKlangioPartNameForInstrument } from './klangioScore';
import { klangioJsonToTabEvents } from './klangioTab';
import { deriveGuitarTabEventsFromNotes } from './guitarTabFallback';
import { midiBytesToExtractedNotesForInstrument } from './midiScore';
import { persistAuthenticatedSession } from './authSession';
import { isInstructorRole, normaliseUserRole } from '../shared/authRole';
import { determineAssignmentStatusAfterSession } from '../shared/practicePolicy';
import Replicate from 'replicate';
import FormData from 'form-data';

const app = express();
const PORT = 3001;
const IS_VERCEL = Boolean(process.env.VERCEL);
if (IS_VERCEL) {
  // Vercel runs behind a proxy; needed so `req.secure` is true and secure cookies are set.
  app.set("trust proxy", 1);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      session?: { userId?: number } | null;
    }
  }
}

function buildGuitarTabPayload(
  instrument: string | null | undefined,
  notes: any[],
  explicitTabEvents?: any[] | null,
  explicitMeasureStarts?: number[] | null
) {
  const inst = String(instrument ?? '').trim().toLowerCase();
  if (inst !== 'guitar') {
    return {
      tabEvents: undefined as any[] | undefined,
      tabMeasureStarts: undefined as number[] | undefined,
    };
  }

  const tabEvents = Array.isArray(explicitTabEvents) ? explicitTabEvents.filter(Boolean) : [];
  if (tabEvents.length > 0) {
    return {
      tabEvents,
      tabMeasureStarts:
        Array.isArray(explicitMeasureStarts) && explicitMeasureStarts.length > 0 ? explicitMeasureStarts : undefined,
    };
  }

  const derived = deriveGuitarTabEventsFromNotes(Array.isArray(notes) ? notes : []);
  return {
    tabEvents: derived.length > 0 ? derived : undefined,
    tabMeasureStarts:
      Array.isArray(explicitMeasureStarts) && explicitMeasureStarts.length > 0 ? explicitMeasureStarts : undefined,
  };
}

// ML Server URL (Demucs + MR-MT3)
const ML_SERVER_URL = process.env.ML_SERVER_URL || 'http://localhost:5000';

// Ensure uploads directory exists
const UPLOADS_DIR = process.env.VERCEL ? '/tmp/uploads' : './uploads';
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer for file uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// Middleware
const corsOrigins = String(process.env.CORS_ORIGIN ?? (IS_VERCEL ? '' : 'http://localhost:5173'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsOrigins.length === 0) return callback(null, true);
      if (corsOrigins.includes('*')) return callback(null, true);
      return callback(null, corsOrigins.includes(origin));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Session middleware (cookie-based so it works on serverless)
app.use(
  cookieSession({
    name: "dmaestro_session",
    keys: [String(process.env.SESSION_SECRET ?? "dev-session-secret-change-me")],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    secure: IS_VERCEL,
    httpOnly: true,
  })
);
app.use((req, _res, next) => {
  if (!req.session) req.session = {};
  next();
});

// Ensure DB exists before handling requests
app.use(async (_req, res, next) => {
  try {
    await ensureDatabaseInitialized();
    next();
  } catch (error) {
    console.error("Database init failed:", error);
    res.status(500).json({ error: "Database unavailable" });
  }
});

// Auth middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

app.get("/api/debug/db", async (_req, res) => {
  try {
    await ensureDatabaseInitialized();
    const [{ count: usersCount }] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [{ count: assignmentsCount }] = await db.select({ count: sql<number>`count(*)` }).from(assignments);
    const [{ count: sessionsCount }] = await db.select({ count: sql<number>`count(*)` }).from(practiceSessions);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      vercel: Boolean(process.env.VERCEL),
      dbMode,
      hasTursoUrl: Boolean(String(process.env.TURSO_DATABASE_URL ?? "").trim()),
      counts: {
        users: Number(usersCount ?? 0),
        assignments: Number(assignmentsCount ?? 0),
        sessions: Number(sessionsCount ?? 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "debug failed" });
  }
});

// Seed demo users for local/dev so the UI can log in immediately.
// This is intentionally simple for the presentation workflow.
async function seedDemoUsers() {
  const demoUsers: Array<{
    email: string;
    password: string;
    name: string;
    role: "instructor" | "student";
    instrument?: string;
  }> = [
    { email: "bert@gmail.com", password: "password", name: "Bert", role: "instructor" },
    { email: "berto@gmail.com", password: "password", name: "Berto", role: "student", instrument: "piano" },
  ];

  for (const u of demoUsers) {
    const email = String(u.email).trim().toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (existing.length === 0) {
      const hashed = bcrypt.hashSync(u.password, 10);
      const role = normaliseUserRole(u.role);
      await db.insert(users).values({
        email,
        password: hashed,
        name: u.name,
        role,
        instrument: role === "student" ? (u.instrument || "piano") : null,
      });
    }
  }
}

if (!IS_VERCEL) {
  seedDemoUsers().catch((e) => {
    // Don't block startup if seeding fails.
    console.warn("Demo user seed skipped:", (e as any)?.message ?? e);
  });
}

// ==================== MIDI PROXY ROUTES ====================
// Proxy for BitMidi to avoid CORS issues

app.get('/api/midi/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    const response = await fetch(
      `https://bitmidi.com/api/midi/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'BitMidi search failed' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MIDI search error:', error);
    res.status(500).json({ error: 'MIDI search failed' });
  }
});

app.get('/api/midi/download', async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }

    // Only allow bitmidi.com URLs for security
    if (!url.startsWith('https://bitmidi.com/')) {
      return res.status(400).json({ error: 'Invalid MIDI URL' });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'MIDI download failed' });
    }

    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/midi');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('MIDI download error:', error);
    res.status(500).json({ error: 'MIDI download failed' });
  }
});

// ==================== REPLICATE STEM SEPARATION ====================

let replicateClient: Replicate | null = null;

function getReplicateClient(): Replicate {
  if (replicateClient) return replicateClient;
  const token = String(process.env.REPLICATE_API_TOKEN ?? process.env.REPLICATE_API_KEY ?? "").trim();
  if (!token) {
    throw new Error("Missing REPLICATE_API_TOKEN (or REPLICATE_API_KEY) environment variable");
  }
  replicateClient = new Replicate({ auth: token });
  return replicateClient;
}

app.post('/api/replicate/separate', async (req, res) => {
  try {
    const { audio, model = 'htdemucs' } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Missing audio' });
    }

    const replicate = getReplicateClient();

    console.log('Starting Replicate stem separation with SDK...');
    console.log('Audio data URL length:', audio.length);
    console.log('Model:', model);

    // Convert data URL to Buffer for upload
    // Data URL format: data:audio/mpeg;base64,XXXXX
    const matches = audio.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid audio format - expected data URL' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    console.log('Audio mime type:', mimeType);
    console.log('Audio buffer size:', buffer.length, 'bytes');

    // Upload file to Replicate first, then use the URL
    // The SDK's files.create method uploads and returns a URL
    const file = await replicate.files.create(buffer, {
      filename: `audio.${mimeType.split('/')[1] || 'mp3'}`,
      content_type: mimeType,
    });

    console.log('File uploaded to Replicate:', file.urls.get);

    // Now run the model with the uploaded file URL
    const output = await replicate.run(
      "cjwbw/demucs:25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953",
      {
        input: {
          audio: file.urls.get, // Use the uploaded file URL
          model_name: model, // htdemucs, htdemucs_ft, htdemucs_6s
        },
      }
    );

    console.log('Replicate stem separation complete!');
    console.log('Output:', output);

    // The output is an object with URLs to the stems
    const result = output as {
      drums: string;
      bass: string;
      vocals: string;
      other: string;
      piano?: string;
      guitar?: string;
    };

    res.json({
      drums: result.drums,
      bass: result.bass,
      vocals: result.vocals,
      other: result.other,
      piano: result.piano,
      guitar: result.guitar,
    });
  } catch (error: any) {
    console.error('Replicate error:', error);

    // Handle specific error types
    const errorMessage = error.message || String(error);

    if (errorMessage.includes('402') || errorMessage.includes('Insufficient credit')) {
      return res.status(402).json({
        error: 'Replicate account needs credits',
        details: 'Add billing at https://replicate.com/account/billing'
      });
    }

    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return res.status(401).json({
        error: 'Invalid Replicate API key',
        details: 'Check your API key at https://replicate.com/account/api-tokens'
      });
    }

    res.status(500).json({
      error: 'Stem separation failed',
      details: errorMessage
    });
  }
});

// ==================== ML SERVER (DEMUCS + MR-MT3) ====================

// Check ML server status
app.get('/api/ml/status', async (req, res) => {
  try {
    const response = await fetch(`${ML_SERVER_URL}/status`);
    if (!response.ok) {
      throw new Error(`ML server returned ${response.status}`);
    }
    const data = await response.json();
    res.json({
      available: true,
      url: ML_SERVER_URL,
      ...data,
    });
  } catch (error: any) {
    res.json({
      available: false,
      url: ML_SERVER_URL,
      error: error.message,
    });
  }
});

// Transcribe audio using ML server (Demucs + MR-MT3)
app.post('/api/music/transcribe-ml', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const { title, artist, instrument, separate = 'true' } = req.body;
    const userId = req.session.userId!;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log(`[ML Transcription] Starting: ${title} by ${artist}`);
    console.log(`[ML Transcription] ML Server: ${ML_SERVER_URL}`);
    console.log(`[ML Transcription] File: ${req.file.originalname} (${req.file.size} bytes)`);

    // Create form data to send to ML server
    const formData = new FormData();
    formData.append('audio', createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    formData.append('separate', separate);

    // Call ML server
    console.log('[ML Transcription] Sending to ML server...');
    const mlResponse = await fetch(`${ML_SERVER_URL}/transcribe`, {
      method: 'POST',
      body: formData as any,
      headers: formData.getHeaders(),
    });

    if (!mlResponse.ok) {
      const errorData = await mlResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `ML server error: ${mlResponse.status}`);
    }

    const mlResult = await mlResponse.json();

    if (!mlResult.success) {
      throw new Error(mlResult.error || 'Transcription failed');
    }

    console.log(`[ML Transcription] Received ${mlResult.noteCount} notes in ${mlResult.processingTime}s`);

    // Transpose for instrument if needed
    const transposedNotes = instrument
      ? transposeForInstrument(mlResult.notes, instrument)
      : mlResult.notes;

    // Save to database
    const [newMusic] = await db
      .insert(musicSheets)
      .values({
        title,
        artist,
        uploadedBy: userId,
        audioPath: `/uploads/${req.file.filename}`,
        duration: mlResult.duration,
        tempo: 120, // TODO: extract from MIDI
        notesJson: JSON.stringify(transposedNotes),
      })
      .returning();

    if (!newMusic) {
      throw new Error('Failed to save transcription result');
    }

    console.log(`[ML Transcription] Saved to database: ID ${newMusic.id}`);

    res.json({
      ...newMusic,
      notes: transposedNotes,
      noteCount: transposedNotes.length,
      processingTime: mlResult.processingTime,
      stemsSeparated: mlResult.stemsSeparated,
    });
  } catch (error: any) {
    console.error('[ML Transcription] Error:', error);

    // Check if ML server is unavailable
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      return res.status(503).json({
        error: 'ML server unavailable',
        details: `Cannot connect to ${ML_SERVER_URL}. Make sure the ML server is running.`,
        hint: 'Start the ML server with: cd ml-server && python server.py',
      });
    }

    res.status(500).json({
      error: 'Transcription failed',
      details: error.message,
    });
  }
});

// ==================== KLANGIO (TRANSCRIPTION API) ====================

app.post('/api/music/transcribe-klangio', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const { title, artist, instrument, model = 'multi' } = req.body;
    const userId = req.session.userId!;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    const file = req.file;

    if (!title || !artist) {
      return res.status(400).json({ error: 'Missing title or artist' });
    }

    console.log(`[Klangio] Creating transcription job: ${title} by ${artist}`);

    const outputsBaseDir = join(UPLOADS_DIR, 'klangio');
    if (!existsSync(outputsBaseDir)) mkdirSync(outputsBaseDir, { recursive: true });

    const writeOutput = (jobId: string, name: string, bytes: Uint8Array) => {
      const dir = join(outputsBaseDir, jobId);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const abs = join(dir, name);
      writeFileSync(abs, Buffer.from(bytes));
      return {
        absPath: abs,
        urlPath: `/uploads/klangio/${jobId}/${name}`,
      };
    };

    // We run one job per output format; single-output jobs have been the most reliable in practice.
    const runJob = async (output: 'mxml' | 'midi_quant' | 'pdf' | 'gp5') => {
      const job = await createKlangioTranscriptionJob({
        filePath: file.path,
        filename: file.originalname,
        model,
        title,
        composer: artist,
        outputs: [output],
      });
      await pollKlangioJobStatus(job.jobId, { timeoutMs: 5 * 60_000, pollIntervalMs: 2_000 });
      return job.jobId;
    };

    // 1) Multi-part score JSON + MusicXML (for "proper" notation rendering).
    const mxmlJobId = await runJob('mxml');
    console.log(`[Klangio] mxml job completed: ${mxmlJobId}. Downloading outputs...`);

    const jsonBytes = await fetchKlangioJobOutput(mxmlJobId, 'json');
    const jsonText = new TextDecoder().decode(jsonBytes);
    const score = JSON.parse(jsonText);
    const jsonOut = writeOutput(mxmlJobId, 'score.json', jsonBytes);

    const mxmlBytes = await fetchKlangioJobOutput(mxmlJobId, 'mxml');
    const mxmlOut = writeOutput(mxmlJobId, 'score.musicxml', mxmlBytes);

    const partName = pickKlangioPartNameForInstrument(score, instrument ?? 'piano');
    const { notes, tempo, timeSignature } = klangioJsonToExtractedNotes(score, partName);

    const duration = Math.max(0, ...notes.map((n: any) => (n?.startTime ?? 0) + (n?.duration ?? 0)));

    // 2) Additional artifacts used for various clients (downloads / external viewers).
    let midiQuantPath: string | null = null;
    let pdfPath: string | null = null;
    let gp5Path: string | null = null;

    try {
      const midiJobId = await runJob('midi_quant');
      console.log(`[Klangio] midi_quant job completed: ${midiJobId}. Downloading...`);
      const midiBytes = await fetchKlangioJobOutput(midiJobId, 'midi_quant');
      midiQuantPath = writeOutput(midiJobId, 'score.midi_quant.mid', midiBytes).urlPath;
    } catch (e: any) {
      console.warn('[Klangio] midi_quant output skipped:', e?.message ?? e);
    }

    try {
      const pdfJobId = await runJob('pdf');
      console.log(`[Klangio] pdf job completed: ${pdfJobId}. Downloading...`);
      const pdfBytes = await fetchKlangioJobOutput(pdfJobId, 'pdf');
      pdfPath = writeOutput(pdfJobId, 'score.pdf', pdfBytes).urlPath;
    } catch (e: any) {
      console.warn('[Klangio] pdf output skipped:', e?.message ?? e);
    }

    try {
      const gp5JobId = await runJob('gp5');
      console.log(`[Klangio] gp5 job completed: ${gp5JobId}. Downloading...`);
      const gp5Bytes = await fetchKlangioJobOutput(gp5JobId, 'gp5');
      gp5Path = writeOutput(gp5JobId, 'score.gp5', gp5Bytes).urlPath;
    } catch (e: any) {
      console.warn('[Klangio] gp5 output skipped:', e?.message ?? e);
    }

    const [newMusic] = await db
      .insert(musicSheets)
      .values({
        title,
        artist,
        uploadedBy: userId,
        audioPath: `/uploads/${file.filename}`,
        duration: duration || 180,
        tempo: tempo || 120,
        timeSignature: timeSignature || null,
        notesJson: JSON.stringify(notes),
        klangioJobId: mxmlJobId,
        klangioModel: model,
        klangioJson: jsonText,
        klangioJsonPath: jsonOut.urlPath,
        klangioMxmlPath: mxmlOut.urlPath,
        klangioMidiQuantPath: midiQuantPath,
        klangioPdfPath: pdfPath,
        klangioGp5Path: gp5Path,
      })
      .returning();

    if (!newMusic) {
      throw new Error('Failed to save Klangio transcription result');
    }

    res.json({
      ...newMusic,
      notes,
      noteCount: notes.length,
      provider: 'klangio',
      jobId: mxmlJobId,
      model,
      partName,
      availableParts: listKlangioParts(score),
    });
  } catch (error: any) {
    console.error('[Klangio] Error:', error);
    res.status(500).json({
      error: 'Klangio transcription failed',
      details: error?.message ?? String(error),
      hint:
        typeof error?.message === 'string' && error.message.includes('duplex')
          ? "Server fetch needs RequestInit.duplex='half' for streaming bodies (should be fixed now). Restart the server."
          : undefined,
    });
  }
});

// ==================== AUTH ROUTES ====================

async function handleAuthRegister(req: express.Request, res: express.Response) {
  try {
    const { email, password, name, role, instrument } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalisedEmail = String(email).trim().toLowerCase();
    if (!normalisedEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Reject if email already exists (case-insensitive).
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalisedEmail}`)
      .limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedRole = normaliseUserRole(role);
    const resolvedInstrument =
      normalizedRole === "student"
        ? String(instrument ?? "").trim() || "piano"
        : null;

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalisedEmail,
        password: hashedPassword,
        name,
        role: normalizedRole,
        instrument: resolvedInstrument,
      })
      .returning();

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    await persistAuthenticatedSession(req.session, newUser.id);

    res.json({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: normaliseUserRole(newUser.role),
      instrument: newUser.instrument,
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
}

app.post('/api/auth/register', handleAuthRegister);
// Back-compat alias for client code expecting /auth/signup.
app.post('/api/auth/signup', handleAuthRegister);

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const requestedRole = role ? normaliseUserRole(role) : null;
    const normalisedEmail = String(email).trim().toLowerCase();

    const candidates = await db
      .select()
      .from(users)
      .where(
        requestedRole
          ? and(sql`lower(${users.email}) = ${normalisedEmail}`, eq(users.role, requestedRole))
          : sql`lower(${users.email}) = ${normalisedEmail}`
      )
      .orderBy(desc(users.id));

    for (const user of candidates) {
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) continue;

      await persistAuthenticatedSession(req.session, user.id);

      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: normaliseUserRole(user.role),
        instrument: user.instrument,
      });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: normaliseUserRole(user.role),
      instrument: user.instrument,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/feedback', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const category = String(body.category ?? '').trim();
    const subject = String(body.subject ?? '').trim();
    const message = String(body.message ?? '').trim();
    const ratingRaw = body.rating;

    const rating =
      ratingRaw === null || ratingRaw === undefined || ratingRaw === ''
        ? null
        : typeof ratingRaw === 'number'
          ? Math.trunc(ratingRaw)
          : Math.trunc(Number(ratingRaw));

    if (!category) return res.status(400).json({ error: 'Category is required' });
    if (!subject) return res.status(400).json({ error: 'Subject is required' });
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (category.length > 80) return res.status(400).json({ error: 'Category is too long' });
    if (subject.length > 200) return res.status(400).json({ error: 'Subject is too long' });
    if (message.length > 5000) return res.status(400).json({ error: 'Message is too long' });
    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });

    await db.insert(feedback).values({
      userId,
      role: normaliseUserRole(user.role),
      category,
      subject,
      message,
      rating,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CLASSROOM ROUTES ====================

app.get('/api/classrooms', requireAuth, async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (isInstructorRole(user.role)) {
      const result = await db.select().from(classrooms).where(eq(classrooms.instructorId, user.id));
      const classroomIds = result
        .map((c) => Number(c.id ?? 0))
        .filter((id) => Number.isFinite(id) && id > 0);

      const countsRows = classroomIds.length
        ? await db
            .select({
              classroomId: studentClassrooms.classroomId,
              studentCount: sql<number>`count(distinct ${studentClassrooms.studentId})`.as('studentCount'),
            })
            .from(studentClassrooms)
            .innerJoin(users, eq(studentClassrooms.studentId, users.id))
            .where(inArray(studentClassrooms.classroomId, classroomIds as any))
            .groupBy(studentClassrooms.classroomId)
        : [];

      const counts = new Map<number, number>(
        countsRows.map((row) => [Number(row.classroomId ?? 0), Number((row as any).studentCount ?? 0)])
      );

      res.json(result.map((c) => ({ ...c, studentCount: counts.get(Number(c.id ?? 0)) ?? 0 })));
    } else {
      // Get student's classrooms
      const joined = await db
        .select({ classroom: classrooms })
        .from(studentClassrooms)
        .innerJoin(classrooms, eq(studentClassrooms.classroomId, classrooms.id))
        .where(eq(studentClassrooms.studentId, user.id));
      res.json(joined.map((j) => j.classroom));
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/classrooms', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can create classrooms' });
    }

    // Generate unique code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const [newClassroom] = await db
      .insert(classrooms)
      .values({ name, code, instructorId: user.id })
      .returning();

    if (!newClassroom) {
      throw new Error('Failed to create classroom');
    }

    res.json(newClassroom);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/classrooms/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid classroom id' });
    }

    const name = String(req.body?.name ?? '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Missing classroom name' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can edit classrooms' });
    }

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }
    if (classroom.instructorId !== user.id) {
      return res.status(403).json({ error: 'Cannot edit another instructor classroom' });
    }

    const [updated] = await db.update(classrooms).set({ name }).where(eq(classrooms.id, id)).returning();
    res.json(updated ?? classroom);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/classrooms/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid classroom id' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can delete classrooms' });
    }

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }
	    if (classroom.instructorId !== user.id) {
	      return res.status(403).json({ error: 'Cannot delete another instructor classroom' });
	    }

	    const classroomAssignments = await db
	      .select({ id: assignments.id })
	      .from(assignments)
	      .where(eq(assignments.classroomId, id));
	    const assignmentIds = classroomAssignments.map((a) => a.id).filter((x) => typeof x === 'number');
	    if (assignmentIds.length > 0) {
	      await db.delete(notifications).where(inArray(notifications.assignmentId, assignmentIds));
	      await db.delete(practiceSessions).where(inArray(practiceSessions.assignmentId, assignmentIds));
	    }

	    await db.delete(studentClassrooms).where(eq(studentClassrooms.classroomId, id));
	    await db.delete(assignments).where(eq(assignments.classroomId, id));
	    await db.delete(classrooms).where(eq(classrooms.id, id));

    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/classrooms/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.session.userId!;

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.code, code.toUpperCase()));
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    // Check if already joined
    const existing = await db
      .select()
      .from(studentClassrooms)
      .where(and(eq(studentClassrooms.studentId, userId), eq(studentClassrooms.classroomId, classroom.id)));

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already joined this classroom' });
    }

    await db.insert(studentClassrooms).values({ studentId: userId, classroomId: classroom.id });

    res.json(classroom);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a specific student from a classroom (instructor-only).
app.delete('/api/classrooms/:classroomId/members/:studentId', requireAuth, async (req, res) => {
  try {
    const classroomId = Number.parseInt(req.params.classroomId ?? '', 10);
    const studentId = Number.parseInt(req.params.studentId ?? '', 10);
    if (!Number.isFinite(classroomId) || classroomId <= 0) {
      return res.status(400).json({ error: 'Invalid classroom id' });
    }
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return res.status(400).json({ error: 'Invalid student id' });
    }

    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can remove classroom members' });
    }

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.id, classroomId));
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
    if (classroom.instructorId !== userId) {
      return res.status(403).json({ error: 'Cannot modify another instructor classroom' });
    }

    const membership = await db
      .select({ id: studentClassrooms.id })
      .from(studentClassrooms)
      .where(and(eq(studentClassrooms.classroomId, classroomId), eq(studentClassrooms.studentId, studentId)));

    if (membership.length === 0) {
      return res.status(404).json({ error: 'Student is not enrolled in this classroom' });
    }

    const studentAssignments = await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(eq(assignments.classroomId, classroomId), eq(assignments.studentId, studentId)));

    const assignmentIds = studentAssignments
      .map((a) => a.id)
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);

    if (assignmentIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.assignmentId, assignmentIds));
      await db.delete(practiceSessions).where(inArray(practiceSessions.assignmentId, assignmentIds));
      await db.delete(assignments).where(inArray(assignments.id, assignmentIds));
    }

    await db
      .delete(studentClassrooms)
      .where(and(eq(studentClassrooms.classroomId, classroomId), eq(studentClassrooms.studentId, studentId)));

    res.json({ success: true, classroomId, studentId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== MUSIC UPLOAD WITH REAL NOTE EXTRACTION ====================

app.post('/api/music/upload', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const { title, artist, instrument } = req.body;
    const userId = req.session.userId!;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log(`Processing upload: ${title} by ${artist}`);

    // Read the audio file
    const audioPath = req.file.path;
    const audioBuffer = readFileSync(audioPath);

    // REAL note extraction - NOT mock data!
    console.log('Extracting REAL notes from audio...');
    const { notes, tempo, duration } = await extractNotesFromAudio(audioBuffer);

    // Transpose for instrument if needed
    const transposedNotes = instrument ? transposeForInstrument(notes, instrument) : notes;

    console.log(`Extracted ${transposedNotes.length} notes, tempo: ${tempo} BPM, duration: ${duration}s`);

    // Save to database
    const [newMusic] = await db
      .insert(musicSheets)
      .values({
        title,
        artist,
        uploadedBy: userId,
        audioPath: `/uploads/${req.file.filename}`,
        duration,
        tempo,
        notesJson: JSON.stringify(transposedNotes),
      })
      .returning();

    if (!newMusic) {
      throw new Error('Failed to save music upload');
    }

    res.json({
      ...newMusic,
      notes: transposedNotes,
      noteCount: transposedNotes.length,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload with pre-extracted notes (from client-side Basic Pitch analysis)
app.post('/api/music/upload-with-notes', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const { title, artist, instrument, notes, tempo, duration } = req.body;
    const userId = req.session.userId!;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log(`Processing upload with pre-extracted notes: ${title} by ${artist}`);

    // Parse notes from client
    const parsedNotes = JSON.parse(notes);
    const parsedTempo = parseFloat(tempo) || 120;
    const parsedDuration = parseFloat(duration) || 180;

    // Transpose for instrument if needed
    const transposedNotes = instrument ? transposeForInstrument(parsedNotes, instrument) : parsedNotes;

    console.log(`Received ${transposedNotes.length} notes from Basic Pitch, tempo: ${parsedTempo} BPM`);

    // Save to database
    const [newMusic] = await db
      .insert(musicSheets)
      .values({
        title,
        artist,
        uploadedBy: userId,
        audioPath: `/uploads/${req.file.filename}`,
        duration: parsedDuration,
        tempo: parsedTempo,
        notesJson: JSON.stringify(transposedNotes),
      })
      .returning();

    if (!newMusic) {
      throw new Error('Failed to save music upload');
    }

    res.json({
      ...newMusic,
      notes: transposedNotes,
      noteCount: transposedNotes.length,
    });
  } catch (error: any) {
    console.error('Upload with notes error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/music', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });

    let result: typeof musicSheets.$inferSelect[] = [];

    if (isInstructorRole(user.role)) {
      // Instructors should only see their own uploaded library.
      result = await db
        .select()
        .from(musicSheets)
        .where(eq(musicSheets.uploadedBy, userId))
        .orderBy(desc(musicSheets.createdAt));
    } else {
      // Members: only return music that is assigned to them (direct or via a classroom they joined).
      const memberships = await db
        .select({ classroomId: studentClassrooms.classroomId })
        .from(studentClassrooms)
        .where(eq(studentClassrooms.studentId, userId));
      const classroomIds = memberships.map((m) => Number(m.classroomId ?? 0)).filter((id) => Number.isFinite(id) && id > 0);

      const classroomClause = classroomIds.length > 0 ? inArray(assignments.classroomId, classroomIds) : undefined;
      const classroomCondition = classroomClause ? and(isNull(assignments.studentId), classroomClause) : undefined;
      const whereClause = classroomCondition ? or(eq(assignments.studentId, userId), classroomCondition) : eq(assignments.studentId, userId);
      const assignmentRows = await db
        .select({ musicSheetId: assignments.musicSheetId })
        .from(assignments)
        .where(whereClause);

      const musicIds = Array.from(
        new Set(
          assignmentRows
            .map((row) => Number(row.musicSheetId ?? 0))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );

      result =
        musicIds.length > 0
          ? await db.select().from(musicSheets).where(inArray(musicSheets.id, musicIds)).orderBy(desc(musicSheets.createdAt))
          : [];
    }

    res.json(
      result.map((m) => ({
        ...m,
        notes: JSON.parse(m.notesJson),
      }))
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/music/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid music id' });
    }

    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can delete music' });
    }

    const [music] = await db
      .select()
      .from(musicSheets)
      .where(and(eq(musicSheets.id, id), eq(musicSheets.uploadedBy, userId)));
    if (!music) return res.status(404).json({ error: 'Music not found' });

    const assigned = await db
      .select({ id: assignments.id, assignedBy: assignments.assignedBy })
      .from(assignments)
      .where(eq(assignments.musicSheetId, id));

    const foreignAssignments = assigned.filter((a) => Number(a.assignedBy ?? 0) !== userId);
    if (foreignAssignments.length > 0) {
      return res.status(409).json({ error: 'Music is referenced by another instructor assignment and cannot be deleted' });
    }

    const assignmentIds = assigned
      .map((a) => Number(a.id ?? 0))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (assignmentIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.assignmentId, assignmentIds));
      await db.delete(practiceSessions).where(inArray(practiceSessions.assignmentId, assignmentIds));
      await db.delete(assignments).where(inArray(assignments.id, assignmentIds));
    }

    await db.delete(notifications).where(eq(notifications.musicSheetId, id));
    await db.delete(musicSheets).where(eq(musicSheets.id, id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/music/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid music id' });
    }

    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });

    let music: typeof musicSheets.$inferSelect | null = null;

    if (isInstructorRole(user.role)) {
      const [row] = await db
        .select()
        .from(musicSheets)
        .where(and(eq(musicSheets.id, id), eq(musicSheets.uploadedBy, userId)));
      music = row ?? null;
      if (!music) return res.status(404).json({ error: 'Music not found' });
    } else {
      const memberships = await db
        .select({ classroomId: studentClassrooms.classroomId })
        .from(studentClassrooms)
        .where(eq(studentClassrooms.studentId, userId));
      const classroomIds = memberships.map((m) => Number(m.classroomId ?? 0)).filter((cid) => Number.isFinite(cid) && cid > 0);

      const classroomClause = classroomIds.length > 0 ? inArray(assignments.classroomId, classroomIds) : undefined;
      const classroomCondition = classroomClause
        ? and(eq(assignments.musicSheetId, id), isNull(assignments.studentId), classroomClause)
        : undefined;
      const whereClause = classroomCondition
        ? or(and(eq(assignments.musicSheetId, id), eq(assignments.studentId, userId)), classroomCondition)
        : and(eq(assignments.musicSheetId, id), eq(assignments.studentId, userId));
      const allowed = await db
        .select({ id: assignments.id })
        .from(assignments)
        .where(whereClause)
        .limit(1);
      if (allowed.length === 0) {
        return res.status(403).json({ error: 'Not allowed to access this music' });
      }

      const [row] = await db.select().from(musicSheets).where(eq(musicSheets.id, id));
      music = row ?? null;
      if (!music) return res.status(404).json({ error: 'Music not found' });
    }

    const instrument = typeof req.query.instrument === 'string' ? req.query.instrument : null;
    const source = typeof req.query.source === 'string' ? req.query.source : 'klang_json';

    const urlToUploadPath = (urlPath: string) => {
      // urlPath is like "/uploads/klangio/<jobId>/score.mid"
      const clean = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
      return `./${clean}`;
    };

    if (source === 'stored') {
      const storedNotes = JSON.parse(music.notesJson);
      const tabPayload = buildGuitarTabPayload(instrument, storedNotes);
      return res.json({
        ...music,
        notes: storedNotes,
        tabEvents: tabPayload.tabEvents,
        tabMeasureStarts: tabPayload.tabMeasureStarts,
        sourceUsed: 'stored',
      });
    }

    if (source === 'midi_quant') {
      if (!music.klangioMidiQuantPath) {
        return res.json({
          ...music,
          notes: JSON.parse(music.notesJson),
          sourceUsed: 'stored',
        });
      }

      try {
        const abs = urlToUploadPath(music.klangioMidiQuantPath);
        const bytes = new Uint8Array(readFileSync(abs));
        const { notes, tempo, trackIndex } = midiBytesToExtractedNotesForInstrument(bytes, instrument ?? 'piano');
        const tabPayload = buildGuitarTabPayload(instrument, notes);

        return res.json({
          ...music,
          tempo: music.tempo ?? tempo,
          notes,
          trackIndex,
          tabEvents: tabPayload.tabEvents,
          tabMeasureStarts: tabPayload.tabMeasureStarts,
          sourceUsed: 'midi_quant',
        });
      } catch (e: any) {
        console.warn('[music/:id] midi_quant parse failed, falling back:', e?.message ?? e);
        const storedNotes = JSON.parse(music.notesJson);
        const tabPayload = buildGuitarTabPayload(instrument, storedNotes);
        return res.json({
          ...music,
          notes: storedNotes,
          tabEvents: tabPayload.tabEvents,
          tabMeasureStarts: tabPayload.tabMeasureStarts,
          sourceUsed: 'stored',
        });
      }
    }

    // If we have raw multi-part Klangio score JSON, select the best part per instrument on demand.
    if (music.klangioJson && source !== 'stored') {
      try {
        const score = JSON.parse(music.klangioJson);
        const partName = pickKlangioPartNameForInstrument(score, instrument ?? 'piano');
        const { notes } = klangioJsonToExtractedNotes(score, partName);
        const { tabEvents, measureStarts } = klangioJsonToTabEvents(score, partName);
        const tabPayload = buildGuitarTabPayload(instrument, notes, tabEvents, measureStarts);
        return res.json({
          ...music,
          notes,
          partName,
          availableParts: listKlangioParts(score),
          tabEvents: tabPayload.tabEvents,
          tabMeasureStarts: tabPayload.tabMeasureStarts,
          sourceUsed: 'klang_json',
        });
      } catch (e: any) {
        // Fall through to stored notesJson.
        console.warn('[music/:id] Failed to parse klangioJson, falling back:', e?.message ?? e);
      }
    }

    const storedNotes = JSON.parse(music.notesJson);
    const tabPayload = buildGuitarTabPayload(instrument, storedNotes);
    res.json({
      ...music,
      notes: storedNotes,
      tabEvents: tabPayload.tabEvents,
      tabMeasureStarts: tabPayload.tabMeasureStarts,
      sourceUsed: 'stored',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/classrooms/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid classroom id' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can delete classrooms' });
    }

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.id, id));
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }
    if (classroom.instructorId !== user.id) {
      return res.status(403).json({ error: 'Cannot delete another instructor classroom' });
    }

    await db.delete(studentClassrooms).where(eq(studentClassrooms.classroomId, id));
    await db.delete(assignments).where(eq(assignments.classroomId, id));
    await db.delete(classrooms).where(eq(classrooms.id, id));

    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ASSIGNMENT ROUTES ====================

app.post('/api/assignments', requireAuth, async (req, res) => {
  try {
    const { musicSheetId, studentId, classroomId, dueDate } = req.body;
    const userId = req.session.userId!;

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can create assignments' });
    }

    const [music] = await db.select().from(musicSheets).where(eq(musicSheets.id, Number(musicSheetId)));
    if (!music) return res.status(404).json({ error: 'Music not found' });
    if (Number(music.uploadedBy ?? 0) !== userId) {
      return res.status(403).json({ error: 'Cannot assign music uploaded by another instructor' });
    }

    const classroomIdNum = classroomId == null ? null : Number(classroomId);
    const studentIdNum = studentId == null ? null : Number(studentId);

    if (classroomIdNum != null) {
      if (!Number.isFinite(classroomIdNum) || classroomIdNum <= 0) {
        return res.status(400).json({ error: 'Invalid classroom id' });
      }
      const [classroom] = await db.select().from(classrooms).where(eq(classrooms.id, classroomIdNum));
      if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
      if (Number(classroom.instructorId ?? 0) !== userId) {
        return res.status(403).json({ error: 'Cannot assign into another instructor classroom' });
      }
    }

    if (studentIdNum != null) {
      if (!Number.isFinite(studentIdNum) || studentIdNum <= 0) {
        return res.status(400).json({ error: 'Invalid student id' });
      }

      if (classroomIdNum != null) {
        // If a classroom is specified, the student must be enrolled in that classroom.
        const membership = await db
          .select({ id: studentClassrooms.id })
          .from(studentClassrooms)
          .where(and(eq(studentClassrooms.studentId, studentIdNum), eq(studentClassrooms.classroomId, classroomIdNum)))
          .limit(1);
        if (membership.length === 0) {
          return res.status(403).json({ error: 'Student is not enrolled in this classroom' });
        }
      } else {
        // Otherwise, the student must belong to at least one classroom owned by this instructor.
        const membership = await db
          .select({ id: studentClassrooms.id })
          .from(studentClassrooms)
          .innerJoin(classrooms, eq(studentClassrooms.classroomId, classrooms.id))
          .where(and(eq(studentClassrooms.studentId, studentIdNum), eq(classrooms.instructorId, userId)))
          .limit(1);
        if (membership.length === 0) {
          return res.status(403).json({ error: 'Cannot assign to a student outside your classrooms' });
        }
      }
    }

    // If assigning to a classroom (band) without a specific student, treat it as a "template" assignment.
    // Prevent duplicate templates for the same classroom + music + instructor.
    if (studentIdNum == null && classroomIdNum != null) {
      const existingTemplates = await db
        .select()
        .from(assignments)
        .where(
          and(
            eq(assignments.assignedBy, userId),
            eq(assignments.musicSheetId, Number(musicSheetId)),
            eq(assignments.classroomId, classroomIdNum),
            isNull(assignments.studentId),
            or(isNull(assignments.templateAssignmentId), eq(assignments.templateAssignmentId, 0 as any))
          )
        )
        .orderBy(desc(assignments.id))
        .limit(1);

      const existing = existingTemplates[0];
      if (existing) {
        return res.json(existing);
      }
    }

    const [newAssignment] = await db
      .insert(assignments)
      .values({
        musicSheetId,
        studentId: studentIdNum,
        classroomId: classroomIdNum,
        assignedBy: userId,
        dueDate: dueDate ? new Date(dueDate) : null,
      })
      .returning();

    if (!newAssignment) {
      throw new Error('Failed to create assignment');
    }

    const title = `New assignment: ${music.title}`;
    const recipientIds: number[] = [];

    if (studentIdNum != null && Number.isFinite(studentIdNum)) {
      recipientIds.push(studentIdNum);
    }

    if (classroomIdNum != null && Number.isFinite(classroomIdNum)) {
      // Join users to avoid orphaned student_classrooms rows causing notification FK failures.
      const members = await db
        .select({ studentId: users.id })
        .from(studentClassrooms)
        .innerJoin(users, eq(studentClassrooms.studentId, users.id))
        .where(eq(studentClassrooms.classroomId, classroomIdNum));
      for (const row of members) {
        if (typeof row.studentId === 'number') recipientIds.push(row.studentId);
      }
    }

    const uniqueRecipients = Array.from(new Set(recipientIds)).filter((id) => id !== userId);
    if (uniqueRecipients.length > 0) {
      try {
        await db.insert(notifications).values(
          uniqueRecipients.map((rid) => ({
            userId: rid,
            type: 'assignment',
            title,
            assignmentId: newAssignment.id,
            musicSheetId: newAssignment.musicSheetId,
          }))
        );
      } catch (e: any) {
        // Assignment already exists; notification failures shouldn't bubble up as a hard error.
        console.warn('[assignments] notification insert failed:', e?.message ?? e);
      }
    }

    res.json(newAssignment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Back-compat alias for older client code.
app.post('/api/auth/signup', async (req, res) => {
  // Delegate to the same handler by reusing the register route logic.
  // Note: Express doesn't provide an easy "call route handler" primitive, so we just inline-call by redirecting.
  // This keeps the API stable for the demo.
  return app._router.handle(req, res, () => {}, 'post', '/api/auth/register' as any);
});

app.get('/api/assignments', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    let result;
    if (isInstructorRole(user.role)) {
      result = await db
        .select()
        .from(assignments)
        .where(eq(assignments.assignedBy, userId))
        .orderBy(desc(assignments.createdAt), desc(assignments.id));
    } else {
      // Get assignments for student (direct or via classroom)
      const studentClassroomIds = await db
        .select({ classroomId: studentClassrooms.classroomId })
        .from(studentClassrooms)
        .where(eq(studentClassrooms.studentId, userId));

      const classroomIds = studentClassroomIds.map((sc) => sc.classroomId);

      result = await db
        .select()
        .from(assignments)
        .where(
          classroomIds.length > 0
            ? or(eq(assignments.studentId, userId), and(isNull(assignments.studentId), inArray(assignments.classroomId, classroomIds as any)))
            : eq(assignments.studentId, userId)
        );

      // Safety: classroom template assignments should always be treated as "assigned" for members.
      // Older DBs may have templates incorrectly updated to "in_progress"/"completed".
      result = result.map((row) => {
        const isTemplate = row.studentId == null && row.classroomId != null && (row as any).templateAssignmentId == null;
        return isTemplate ? { ...row, status: 'assigned' as any } : row;
      });

      // Hide classroom templates once a per-student copy exists for this member.
      const startedTemplateIds = new Set<number>(
        result
          .map((row) => row.templateAssignmentId)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
      );
      if (startedTemplateIds.size > 0) {
        result = result.filter((row) => {
          const isTemplate = row.studentId == null && row.classroomId != null && row.templateAssignmentId == null;
          if (!isTemplate) return true;
          return !startedTemplateIds.has(row.id as any);
        });
      }
    }

    // Join with music sheet data
    const withMusic = await Promise.all(
      result.map(async (a) => {
        const [music] = await db.select().from(musicSheets).where(eq(musicSheets.id, a.musicSheetId));
        return {
          ...a,
          musicSheet: music ? { ...music, notes: JSON.parse(music.notesJson) } : null,
        };
      })
    );

    res.json(withMusic);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// When a member starts practicing an assignment, move it out of "Practice" (assigned) into "Assignments" (in_progress).
app.post('/api/assignments/:id/start', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only members can start assignments' });
    }

    const assignmentId = Number(req.params.id);
    if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid assignment id' });
    }

    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const direct = assignment.studentId != null && Number(assignment.studentId) === userId;

    // Classroom template assignment: create a per-student copy and never mutate the template row.
    const isTemplate = assignment.studentId == null && assignment.classroomId != null;
    if (!direct && isTemplate) {
      const membership = await db
        .select({ id: studentClassrooms.id })
        .from(studentClassrooms)
        .where(
          and(eq(studentClassrooms.studentId, userId), eq(studentClassrooms.classroomId, Number(assignment.classroomId)))
        );
      if (membership.length === 0) {
        return res.status(403).json({ error: 'Not allowed to start this assignment' });
      }

      const existingCopies = await db
        .select()
        .from(assignments)
        .where(and(eq(assignments.studentId, userId), eq(assignments.templateAssignmentId, assignment.id)))
        .orderBy(desc(assignments.id));

      const existing = existingCopies[0];
      if (existing) {
        return res.json({ success: true, assignment: existing });
      }

      const createdRows = await db
        .insert(assignments)
        .values({
          musicSheetId: assignment.musicSheetId,
          studentId: userId,
          classroomId: assignment.classroomId,
          templateAssignmentId: assignment.id,
          assignedBy: assignment.assignedBy,
          dueDate: assignment.dueDate ?? null,
          status: 'in_progress',
        })
        .returning();

      const created = Array.isArray(createdRows) ? createdRows[0] : null;
      if (created) {
        return res.json({ success: true, assignment: created });
      }

      const fallbackRows = await db
        .select()
        .from(assignments)
        .where(and(eq(assignments.studentId, userId), eq(assignments.templateAssignmentId, assignment.id)))
        .orderBy(desc(assignments.id))
        .limit(1);

      const fallback = fallbackRows[0];
      if (!fallback) {
        throw new Error('Failed to start classroom assignment');
      }

      return res.json({ success: true, assignment: fallback });
    }

    if (!direct) {
      return res.status(403).json({ error: 'Not allowed to start this assignment' });
    }

    if (assignment.status !== 'assigned') {
      return res.json({ success: true, assignment });
    }

    const [updated] = await db
      .update(assignments)
      .set({ status: 'in_progress' })
      .where(and(eq(assignments.id, assignmentId), eq(assignments.status, 'assigned')))
      .returning();

    return res.json({ success: true, assignment: updated ?? assignment });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRACTICE SESSION ROUTES ====================

app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    const {
      assignmentId,
      accuracyScore,
      timingScore,
      totalNotes,
      correctNotes,
      wrongNotes,
      missedNotes,
      performanceData,
      duration,
      passed,
      startedAt,
      completedAt,
    } = req.body;

    const userId = req.session.userId!;

    const assignmentIdNum = Number(assignmentId ?? 0);
    if (!Number.isFinite(assignmentIdNum) || assignmentIdNum <= 0) {
      return res.status(400).json({ error: 'Invalid assignment id' });
    }

    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentIdNum));
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (assignment.studentId == null || Number(assignment.studentId) !== userId) {
      return res.status(403).json({ error: 'Not allowed to submit a session for this assignment' });
    }

    const parseEpochSeconds = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
      if (typeof value === 'string' && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n)) return Math.floor(n);
      }
      return null;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const completedAtSec = parseEpochSeconds(completedAt) ?? nowSec;
    const durationSec = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 0;
    const startedAtSec = parseEpochSeconds(startedAt) ?? Math.max(0, completedAtSec - Math.round(durationSec));
    const completedAtText = new Date(completedAtSec * 1000).toISOString();

    const [newSession] = await db
      .insert(practiceSessions)
      .values({
        assignmentId: assignmentIdNum,
        studentId: userId,
        accuracyScore,
        timingScore,
        totalNotes,
        correctNotes,
        wrongNotes,
        missedNotes,
        performanceJson: performanceData ? JSON.stringify(performanceData) : null,
        duration: durationSec,
        startedAt: startedAtSec ? new Date(startedAtSec * 1000) : null,
        completedAt: completedAtText,
      })
      .returning();

    if (!newSession) {
      throw new Error('Failed to create practice session');
    }

    // Update assignment status using the same policy as the UI summary.
    await db
      .update(assignments)
      .set({ status: determineAssignmentStatusAfterSession(Boolean(passed)) })
      .where(eq(assignments.id, assignmentIdNum));

    res.json(newSession);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const result = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.studentId, userId))
      .orderBy(desc(practiceSessions.completedAt));
    const enriched = await Promise.all(
      result.map(async (session) => {
        const [assignment] = await db.select().from(assignments).where(eq(assignments.id, session.assignmentId));
        const [music] = assignment
          ? await db.select().from(musicSheets).where(eq(musicSheets.id, assignment.musicSheetId))
          : [null];
        return {
          ...session,
          assignmentTitle: music?.title ?? null,
          assignmentArtist: music?.artist ?? null,
          assignmentStatus: assignment?.status ?? null,
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/instructor', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can view member analytics' });
    }

    const instructorAssignments = await db.select().from(assignments).where(eq(assignments.assignedBy, userId));
    if (instructorAssignments.length === 0) {
      return res.json([]);
    }

    const assignmentMap = new Map(instructorAssignments.map((assignment) => [assignment.id, assignment]));
    const assignmentIds = instructorAssignments.map((assignment) => assignment.id);

    const sessionRows = await db
      .select()
      .from(practiceSessions)
      .where(inArray(practiceSessions.assignmentId, assignmentIds as any))
      .orderBy(desc(practiceSessions.completedAt));

    const uniqueStudentIds = Array.from(new Set(sessionRows.map((session) => session.studentId)));
    const uniqueMusicIds = Array.from(
      new Set(
        instructorAssignments
          .map((assignment) => assignment.musicSheetId)
          .filter((musicSheetId): musicSheetId is number => Number.isFinite(musicSheetId))
      )
    );
    const uniqueClassroomIds = Array.from(
      new Set(
        instructorAssignments
          .map((assignment) => assignment.classroomId)
          .filter((classroomId): classroomId is number => Number.isFinite(classroomId))
      )
    );

    const studentRows = uniqueStudentIds.length
      ? await db.select().from(users).where(inArray(users.id, uniqueStudentIds as any))
      : [];
    const musicRows = uniqueMusicIds.length
      ? await db.select().from(musicSheets).where(inArray(musicSheets.id, uniqueMusicIds as any))
      : [];
    const classroomRows = uniqueClassroomIds.length
      ? await db.select().from(classrooms).where(inArray(classrooms.id, uniqueClassroomIds as any))
      : [];

    const studentMap = new Map(studentRows.map((student) => [student.id, student]));
    const musicMap = new Map(musicRows.map((music) => [music.id, music]));
    const classroomMap = new Map(classroomRows.map((classroom) => [classroom.id, classroom]));

    res.json(
      sessionRows.map((session) => {
        const assignment = assignmentMap.get(session.assignmentId);
        const student = studentMap.get(session.studentId);
        const music = assignment ? musicMap.get(assignment.musicSheetId) : null;
        const classroom = assignment?.classroomId ? classroomMap.get(assignment.classroomId) : null;

        return {
          ...session,
          performanceData: session.performanceJson ? JSON.parse(session.performanceJson) : null,
          studentName: student?.name ?? null,
          studentInstrument: student?.instrument ?? null,
          classroomId: classroom?.id ?? assignment?.classroomId ?? null,
          classroomName: classroom?.name ?? null,
          assignmentTitle: music?.title ?? null,
          assignmentArtist: music?.artist ?? null,
          assignmentStatus: assignment?.status ?? null,
        };
      })
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/students', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can view students' });
    }

    // Get students in instructor's classrooms
    const instructorClassrooms = await db
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(eq(classrooms.instructorId, userId));

    const classroomIds = instructorClassrooms.map((c) => c.id);

    if (classroomIds.length === 0) {
      return res.json([]);
    }

    const students = await db
      .select({ user: users })
      .from(studentClassrooms)
      .innerJoin(users, eq(studentClassrooms.studentId, users.id))
      .where(inArray(studentClassrooms.classroomId, classroomIds as any));

    // Remove duplicates and passwords
    const uniqueStudents = Array.from(new Map(students.map((s) => [s.user.id, s.user])).values()).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      instrument: u.instrument,
    }));

    res.json(uniqueStudents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOTIFICATIONS (STUDENT ONLY) ====================

app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (isInstructorRole(user.role)) return res.json([]);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const id = Number.parseInt(req.params.id ?? '', 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid notification id' });

    await db
      .update(notifications)
      .set({ readAt: new Date() as any })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;

    await db
      .update(notifications)
      .set({ readAt: new Date() as any })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INSTRUCTOR: ROSTER + PROGRESS ====================

app.get('/api/classrooms/roster-progress', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!isInstructorRole(user.role)) {
      return res.status(403).json({ error: 'Only instructors can view classroom roster progress' });
    }

    const classroomRows = await db.select().from(classrooms).where(eq(classrooms.instructorId, userId));
    if (classroomRows.length === 0) return res.json([]);

    const classroomIds = classroomRows.map((c) => c.id).filter((id): id is number => typeof id === 'number');

    const membershipRows = classroomIds.length
      ? await db
          .select({ classroomId: studentClassrooms.classroomId, student: users })
          .from(studentClassrooms)
          .innerJoin(users, eq(studentClassrooms.studentId, users.id))
          .where(inArray(studentClassrooms.classroomId, classroomIds as any))
      : [];

    const memberIds = Array.from(
      new Set(
        membershipRows
          .map((row) => Number((row.student as any)?.id ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    // Include:
    // - assignments explicitly tied to an instructor classroom (classroom_id IN classroomIds)
    // - direct-to-student assignments (classroom_id NULL) for members enrolled in any of the instructor's classrooms
    const classroomClause = classroomIds.length ? inArray(assignments.classroomId, classroomIds as any) : undefined;
    const memberClause = memberIds.length ? inArray(assignments.studentId, memberIds as any) : undefined;
    const directMemberClause =
      memberClause != null ? and(isNull(assignments.classroomId), memberClause) : undefined;

    const assignmentsWhere =
      classroomClause && directMemberClause
        ? or(classroomClause, directMemberClause)
        : classroomClause
          ? classroomClause
          : directMemberClause
            ? directMemberClause
            : undefined;

    const assignmentsRows = assignmentsWhere
      ? await db
          .select()
          .from(assignments)
          .where(and(eq(assignments.assignedBy, userId), assignmentsWhere))
      : [];

    const perStudentAssignmentIds = assignmentsRows
      .filter((row) => row.studentId != null)
      .map((row) => row.id)
      .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);

    const sessionRows = perStudentAssignmentIds.length
      ? await db
          .select()
          .from(practiceSessions)
          .where(inArray(practiceSessions.assignmentId, perStudentAssignmentIds))
      : [];

    const sessionsByAssignment = new Map<number, typeof practiceSessions.$inferSelect[]>();
    for (const s of sessionRows) {
      const aid = Number(s.assignmentId ?? 0);
      if (!Number.isFinite(aid) || aid <= 0) continue;
      const list = sessionsByAssignment.get(aid) ?? [];
      list.push(s);
      sessionsByAssignment.set(aid, list);
    }

    const assignmentsByClassroom = new Map<number, typeof assignments.$inferSelect[]>();
    for (const a of assignmentsRows) {
      const cid = Number(a.classroomId ?? 0);
      if (!Number.isFinite(cid) || cid <= 0) continue;
      const list = assignmentsByClassroom.get(cid) ?? [];
      list.push(a);
      assignmentsByClassroom.set(cid, list);
    }

    const membersByClassroom = new Map<number, Map<number, typeof users.$inferSelect>>();
    for (const row of membershipRows) {
      const cid = Number(row.classroomId ?? 0);
      const student = row.student as any;
      const sid = Number(student?.id ?? 0);
      if (!Number.isFinite(cid) || cid <= 0 || !student) continue;
      if (!Number.isFinite(sid) || sid <= 0) continue;
      const map = membersByClassroom.get(cid) ?? new Map<number, typeof users.$inferSelect>();
      if (!map.has(sid)) map.set(sid, student);
      membersByClassroom.set(cid, map);
    }

    const directAssignmentsByStudent = new Map<number, typeof assignments.$inferSelect[]>();
    for (const a of assignmentsRows) {
      const sid = Number(a.studentId ?? 0);
      const cid = Number(a.classroomId ?? 0);
      if (!Number.isFinite(sid) || sid <= 0) continue;
      if (a.classroomId != null && Number.isFinite(cid) && cid > 0) continue;
      const list = directAssignmentsByStudent.get(sid) ?? [];
      list.push(a);
      directAssignmentsByStudent.set(sid, list);
    }

    const result = classroomRows.map((classroom) => {
      const classroomId = Number(classroom.id ?? 0);
      const classroomAssignments = assignmentsByClassroom.get(classroomId) ?? [];
      const templates = classroomAssignments.filter(
        (a) => a.studentId == null && (a as any).templateAssignmentId == null
      );
      const copies = classroomAssignments.filter(
        (a) => a.studentId != null && (a as any).templateAssignmentId != null
      );
      const standalone = classroomAssignments.filter(
        (a) => a.studentId != null && (a as any).templateAssignmentId == null
      );

      const members = Array.from((membersByClassroom.get(classroomId) ?? new Map()).values()).sort((a, b) =>
        String(a.name ?? '').localeCompare(String(b.name ?? ''))
      );

      const membersOut = members.map((member) => {
        const studentId = Number(member.id ?? 0);
        const templateCopiesByTemplateId = new Map<number, typeof assignments.$inferSelect>();
        for (const copy of copies) {
          if (Number(copy.studentId ?? 0) !== studentId) continue;
          const tid = Number((copy as any).templateAssignmentId ?? 0);
          if (Number.isFinite(tid) && tid > 0) {
            // Latest wins if duplicates exist.
            templateCopiesByTemplateId.set(tid, copy);
          }
        }

        const derivedStatuses: string[] = [];
        for (const template of templates) {
          const tid = Number(template.id ?? 0);
          const copy = templateCopiesByTemplateId.get(tid);
          // Templates should never contribute progress for members who haven't started;
          // only per-student copies can become in_progress/completed.
          derivedStatuses.push(String(copy?.status ?? 'assigned'));
        }

        const studentStandalone = standalone.filter((a) => Number(a.studentId ?? 0) === studentId);
        const studentDirect = directAssignmentsByStudent.get(studentId) ?? [];
        for (const a of studentStandalone) {
          derivedStatuses.push(String(a.status ?? 'assigned'));
        }
        for (const a of studentDirect) {
          derivedStatuses.push(String(a.status ?? 'assigned'));
        }

        const totalAssignments = derivedStatuses.length;
        const completedAssignments = derivedStatuses.filter((s) => String(s).toLowerCase() === 'completed').length;
        const inProgressAssignments = derivedStatuses.filter((s) => String(s).toLowerCase() === 'in_progress').length;
        const assignedAssignments = Math.max(0, totalAssignments - completedAssignments - inProgressAssignments);
        const weightedCompleted = completedAssignments + inProgressAssignments * 0.5;
        const assignmentProgressPct = totalAssignments > 0 ? Math.round((weightedCompleted / totalAssignments) * 100) : 0;

        const memberAssignmentIds = [
          ...studentStandalone.map((a) => a.id),
          ...studentDirect.map((a) => a.id),
          ...Array.from(templateCopiesByTemplateId.values()).map((a) => a.id),
        ]
          .map((id) => Number(id ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0);

        let sessions = 0;
        let totalPracticeSeconds = 0;
        const recentSessionScores: Array<{ score: number; completedAtMs: number }> = [];

        for (const aid of memberAssignmentIds) {
          const rows = sessionsByAssignment.get(aid) ?? [];
          for (const s of rows) {
            sessions += 1;
            totalPracticeSeconds += Number(s.duration ?? 0);
            const score = Math.round((Number(s.accuracyScore ?? 0) + Number(s.timingScore ?? 0)) / 2);
            const completedAtMs = s.completedAt ? new Date(String(s.completedAt)).getTime() : 0;
            recentSessionScores.push({ score, completedAtMs: Number.isFinite(completedAtMs) ? completedAtMs : 0 });
          }
        }

        recentSessionScores.sort((a, b) => b.completedAtMs - a.completedAtMs);
        const lastFive = recentSessionScores.slice(0, 5);
        const practiceProgressPct =
          lastFive.length > 0
            ? Math.round(lastFive.reduce((sum, row) => sum + Math.max(0, Math.min(100, row.score)), 0) / lastFive.length)
            : 0;

        return {
          studentId,
          name: member.name ?? null,
          email: member.email ?? null,
          instrument: member.instrument ?? null,
          progress: {
            totalAssignments,
            completedAssignments,
            inProgressAssignments,
            assignedAssignments,
            // Practice-based "progress" for classroom dashboards (0..100). Uses last 5 sessions when available.
            progressPct: practiceProgressPct,
            assignmentProgressPct,
          },
          practice: {
            sessions,
            totalPracticeSeconds,
            averageSessionScore: practiceProgressPct,
          },
        };
      });

      const bandProgressPct =
        membersOut.length > 0
          ? Math.round(
              membersOut.reduce((sum, m) => sum + Math.max(0, Math.min(100, Number(m?.progress?.progressPct ?? 0))), 0) /
                membersOut.length
            )
          : 0;

      return {
        classroomId: classroom.id,
        classroomName: classroom.name,
        code: classroom.code,
        members: membersOut,
        progress: {
          progressPct: bandProgressPct,
        },
      };
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
    ========================================
    DMAESTRO-REAL Server Running
    ========================================
    API: http://localhost:${PORT}
    ML Server: ${ML_SERVER_URL}

    Transcription Endpoints:
    - POST /api/music/upload          (Basic Pitch - fallback)
    - POST /api/music/transcribe-ml   (Demucs + MR-MT3)
    - GET  /api/ml/status             (Check ML server)

    Set ML_SERVER_URL env var to connect to
    remote ML server (default: localhost:5000)
    ========================================
    `);
  });
}
