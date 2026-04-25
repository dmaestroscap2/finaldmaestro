import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../shared/schema';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const DB_PATH =
  process.env.DB_PATH ||
  (process.env.VERCEL ? '/tmp/dmaestro.db' : './data/dmaestro.db');

// Ensure data directory exists
const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// Initialize SQLite database
const sqlite = new Database(DB_PATH);

// Enable foreign keys
sqlite.pragma('foreign_keys = ON');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

function ensureUsersEmailNotUnique() {
  try {
    const row = sqlite
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`)
      .get() as { sql?: string | null } | undefined;

    const createSql = String(row?.sql ?? '');
    const hasUniqueEmail =
      /\bemail\s+TEXT\s+NOT\s+NULL\s+UNIQUE\b/i.test(createSql) ||
      /\bUNIQUE\s*\(\s*email\s*\)/i.test(createSql);

    if (!hasUniqueEmail) return;

    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec('BEGIN');

    sqlite.exec(`
      DROP TABLE IF EXISTS users__no_unique_email;

      CREATE TABLE users__no_unique_email (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('instructor', 'student')),
        instrument TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);

    sqlite.exec(`
      INSERT INTO users__no_unique_email (id, email, password, name, role, instrument, created_at)
      SELECT id, email, password, name, role, instrument, created_at
      FROM users;
    `);

    sqlite.exec('DROP TABLE users;');
    sqlite.exec('ALTER TABLE users__no_unique_email RENAME TO users;');

    sqlite.exec('COMMIT');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);`);

    console.log('Migrated users table: removed UNIQUE(email) constraint');
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {}
    try {
      sqlite.pragma('foreign_keys = ON');
    } catch {}
    console.warn('Skipping users UNIQUE(email) migration:', error);
  }
}

function ensureUsersInstrumentColumnExists() {
  try {
    const cols = sqlite
      .prepare(`PRAGMA table_info(users)`)
      .all() as Array<{ name?: string }>;
    const hasInstrument = cols.some((c) => String(c.name ?? '') === 'instrument');
    if (!hasInstrument) {
      try {
        sqlite.exec(`ALTER TABLE users ADD COLUMN instrument TEXT;`);
      } catch {}
    }

    // Students should have an instrument; instructors should not.
    try {
      sqlite.exec(`
        UPDATE users
        SET instrument='piano'
        WHERE lower(role)='student' AND (instrument IS NULL OR trim(instrument)='');
      `);
    } catch {}
    try {
      sqlite.exec(`UPDATE users SET instrument=NULL WHERE lower(role)='instructor';`);
    } catch {}
  } catch {}
}

function ensureInstructorsHaveNoInstrument() {
  try {
    sqlite.exec(`UPDATE users SET instrument=NULL WHERE lower(role)='instructor';`);
  } catch {}
}

function ensureUsersInstrumentHasNoDefault() {
  try {
    const cols = sqlite
      .prepare(`PRAGMA table_info(users)`)
      .all() as Array<{ name?: string; dflt_value?: string | null }>;
    const instrumentCol = cols.find((c) => String(c.name ?? '') === 'instrument');
    if (!instrumentCol) return;
    const hasInstrumentDefaultPiano = String(instrumentCol?.dflt_value ?? '').includes("piano");
    if (!hasInstrumentDefaultPiano) {
      ensureInstructorsHaveNoInstrument();
      return;
    }

    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec('BEGIN');

    sqlite.exec(`
      DROP TABLE IF EXISTS users__instrument_nullable;

      CREATE TABLE users__instrument_nullable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('instructor', 'student')),
        instrument TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );
    `);

    sqlite.exec(`
      INSERT INTO users__instrument_nullable (id, email, password, name, role, instrument, created_at)
      SELECT
        id,
        email,
        password,
        name,
        role,
        CASE WHEN lower(role)='instructor' THEN NULL ELSE instrument END,
        created_at
      FROM users;
    `);

    sqlite.exec('DROP TABLE users;');
    sqlite.exec('ALTER TABLE users__instrument_nullable RENAME TO users;');

    sqlite.exec('COMMIT');
    sqlite.pragma('foreign_keys = ON');

    try {
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    } catch {}
    try {
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);`);
    } catch {}

    console.log("Migrated users table: removed instrument default and cleared instructor instruments");
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {}
    try {
      sqlite.pragma('foreign_keys = ON');
    } catch {}
    console.warn('Skipping users instrument default migration:', error);
  }
}

// Initialize tables
export function initializeDatabase() {
  sqlite.exec(`
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
      template_assignment_id INTEGER REFERENCES assignments(id),
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
      completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
  `);

  ensureUsersInstrumentColumnExists();
  ensureUsersEmailNotUnique();
  ensureUsersInstrumentHasNoDefault();

  // Data fix for older DBs: classroom template assignments must remain "assigned" so one member
  // starting practice doesn't make the template appear started for everyone.
  try {
    sqlite.exec(`
      UPDATE assignments
      SET status='assigned'
      WHERE student_id IS NULL
        AND classroom_id IS NOT NULL
        AND (template_assignment_id IS NULL OR template_assignment_id = 0)
        AND status <> 'assigned';
    `);
  } catch {}

  // Helpful lookup indexes (non-unique).
  try {
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  } catch {}
  try {
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);`);
  } catch {}

  // Lightweight "migrations" for existing demo DBs: add Klangio columns if missing.
  // SQLite doesn't support IF NOT EXISTS on ADD COLUMN in all versions, so we swallow errors.
  try {
    sqlite.exec(`ALTER TABLE assignments ADD COLUMN template_assignment_id INTEGER;`);
  } catch {}
  try {
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_template_assignment_id ON assignments(template_assignment_id);`);
  } catch {}

  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_job_id TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_model TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_json TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_json_path TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_mxml_path TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_midi_quant_path TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_pdf_path TEXT;`);
  } catch {}
  try {
    sqlite.exec(`ALTER TABLE music_sheets ADD COLUMN klangio_gp5_path TEXT;`);
  } catch {}

  // Capture real-world session start time range (UTC unixepoch seconds).
  try {
    sqlite.exec(`ALTER TABLE practice_sessions ADD COLUMN started_at INTEGER;`);
  } catch {}

  // Migration: drop *_iso columns and convert completed_at from INTEGER->TEXT (ISO string)
  // for easier manual editing in DB tools like DBeaver.
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(practice_sessions)`).all() as Array<{ name: string; type: string }>;
    const byName = new Map(cols.map((c) => [String(c.name), String(c.type).toUpperCase()]));
    const hasStartedIso = byName.has('started_at_iso');
    const hasCompletedIso = byName.has('completed_at_iso');
    const completedType = byName.get('completed_at') ?? '';

    const needsRebuild = hasStartedIso || hasCompletedIso || completedType !== 'TEXT';
    if (needsRebuild) {
      sqlite.pragma('foreign_keys = OFF');
      sqlite.exec('BEGIN');

      sqlite.exec(`
        DROP TABLE IF EXISTS practice_sessions__migrated;
        CREATE TABLE practice_sessions__migrated (
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
          completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
      `);

      const completedExpr =
        hasCompletedIso
          ? `COALESCE(NULLIF(completed_at_iso,''),
              CASE
                WHEN typeof(completed_at)='integer' THEN strftime('%Y-%m-%dT%H:%M:%fZ', completed_at, 'unixepoch')
                ELSE CAST(completed_at AS TEXT)
              END
            )`
          : `CASE
              WHEN typeof(completed_at)='integer' THEN strftime('%Y-%m-%dT%H:%M:%fZ', completed_at, 'unixepoch')
              ELSE CAST(completed_at AS TEXT)
            END`;

      sqlite.exec(`
        INSERT INTO practice_sessions__migrated (
          id, assignment_id, student_id, accuracy_score, timing_score,
          total_notes, correct_notes, wrong_notes, missed_notes,
          performance_json, duration, started_at, completed_at
        )
        SELECT
          id, assignment_id, student_id, accuracy_score, timing_score,
          total_notes, correct_notes, wrong_notes, missed_notes,
          performance_json, duration,
          CASE
            WHEN typeof(started_at)='integer' THEN started_at
            ELSE NULL
          END,
          ${completedExpr}
        FROM practice_sessions;
      `);

      sqlite.exec('DROP TABLE practice_sessions;');
      sqlite.exec('ALTER TABLE practice_sessions__migrated RENAME TO practice_sessions;');

      sqlite.exec('COMMIT');
      sqlite.pragma('foreign_keys = ON');

      console.log('Migrated practice_sessions: completed_at -> TEXT, removed *_iso columns');
    }
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {}
    try {
      sqlite.pragma('foreign_keys = ON');
    } catch {}
    console.warn('Skipping practice_sessions completed_at TEXT migration:', error);
  }

  console.log('Database initialized successfully');
}
