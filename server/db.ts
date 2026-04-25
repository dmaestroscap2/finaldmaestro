import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import * as schema from "../shared/schema";

type DrizzleDb = any;

type DbMode = "libsql" | "sqlite-file";

function getLibsqlConfig() {
  const url = String(process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? "").trim();
  const authToken = String(process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? "").trim();
  return { url, authToken };
}

function splitSqlScript(script: string): string[] {
  return script
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const isVercel = Boolean(process.env.VERCEL);
const libsql = getLibsqlConfig();

export const dbMode: DbMode = libsql.url ? "libsql" : "sqlite-file";

let driverExec: (sql: string) => Promise<void> | void;

// db is exported as `any` because drizzle's db types differ between drivers.
export const db: DrizzleDb = (() => {
  if (libsql.url) {
    // libSQL/Turso (persistent, Vercel-safe)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { drizzle } = require("drizzle-orm/libsql") as typeof import("drizzle-orm/libsql");

    const client = createClient({
      url: libsql.url,
      authToken: libsql.authToken || undefined,
    });

    driverExec = async (sql: string) => {
      for (const statement of splitSqlScript(sql)) {
        await client.execute(statement);
      }
    };

    return drizzle(client, { schema });
  }

  // Local dev: SQLite file on disk
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");

  const dbPath = String(process.env.DB_PATH ?? (isVercel ? "/tmp/dmaestro.db" : "./data/dmaestro.db"));
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("foreign_keys = ON");
  } catch {}

  driverExec = (sql: string) => {
    sqlite.exec(sql);
  };

  return drizzle(sqlite, { schema });
})();

const schemaSql = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('instructor', 'student')),
    instrument TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    instructor_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS student_classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    classroom_id INTEGER NOT NULL REFERENCES classrooms(id),
    joined_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(student_id, classroom_id)
  );

  CREATE TABLE IF NOT EXISTS music_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    audio_path TEXT NOT NULL,
    duration REAL NOT NULL,
    tempo REAL,
    key TEXT,
    time_signature TEXT,
    difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    notes_json TEXT NOT NULL,
    klangio_job_id TEXT,
    klangio_model TEXT,
    klangio_json TEXT,
    klangio_json_path TEXT,
    klangio_mxml_path TEXT,
    klangio_midi_quant_path TEXT,
    klangio_pdf_path TEXT,
    klangio_gp5_path TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    music_sheet_id INTEGER NOT NULL REFERENCES music_sheets(id),
    student_id INTEGER REFERENCES users(id),
    classroom_id INTEGER REFERENCES classrooms(id),
    template_assignment_id INTEGER,
    assigned_by INTEGER NOT NULL REFERENCES users(id),
    due_date INTEGER,
    status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed')),
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    accuracy_score REAL NOT NULL,
    timing_score REAL NOT NULL,
    total_notes INTEGER NOT NULL,
    correct_notes INTEGER NOT NULL,
    wrong_notes INTEGER NOT NULL,
    missed_notes INTEGER NOT NULL,
    performance_json TEXT,
    duration REAL NOT NULL,
    started_at INTEGER,
    completed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    assignment_id INTEGER REFERENCES assignments(id),
    music_sheet_id INTEGER REFERENCES music_sheets(id),
    created_at INTEGER DEFAULT (unixepoch()),
    read_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('instructor', 'student')),
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    rating INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);
  CREATE INDEX IF NOT EXISTS idx_assignments_student ON assignments(student_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_student ON practice_sessions(student_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_assignment ON practice_sessions(assignment_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON practice_sessions(completed_at);
`;

let initPromise: Promise<void> | null = null;

export function ensureDatabaseInitialized(): Promise<void> {
  if (!initPromise) initPromise = initializeDatabase();
  return initPromise;
}

export async function initializeDatabase(): Promise<void> {
  if (!driverExec) throw new Error("Database driver not initialized");
  await Promise.resolve(driverExec(schemaSql));
}
