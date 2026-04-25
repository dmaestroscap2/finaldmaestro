import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const fromPathArg = getArg("--from");
const fromPath = path.resolve(projectRoot, fromPathArg || "./data/dmaestro.db");

const tursoUrl = String(process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? "").trim();
const tursoToken = String(process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? "").trim();

if (!tursoUrl || !tursoToken) {
  console.error("Missing TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN in environment.");
  console.error("Example (PowerShell):");
  console.error("  $env:TURSO_DATABASE_URL='libsql://...'; $env:TURSO_AUTH_TOKEN='...'; node scripts/migrate-sqlite-to-turso.mjs");
  process.exit(1);
}

const shouldTruncate = hasFlag("--truncate");
const dryRun = hasFlag("--dry-run");
const repair = hasFlag("--repair");

const client = createClient({ url: tursoUrl, authToken: tursoToken });

const source = new Database(fromPath, { readonly: true, fileMustExist: true });
source.pragma("foreign_keys = OFF");

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

function splitSqlScript(script) {
  return script
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function execScript(script) {
  for (const statement of splitSqlScript(script)) {
    if (!dryRun) await client.execute(statement);
  }
}

const tables = [
  "users",
  "classrooms",
  "student_classrooms",
  "music_sheets",
  "assignments",
  "practice_sessions",
  "feedback",
  "notifications",
];

function loadIdSet(table, col = "id") {
  const rows = source.prepare(`SELECT "${col}" as id FROM ${table}`).all();
  return new Set(rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n)));
}

const sourceUserIds = loadIdSet("users", "id");
const sourceClassroomIds = loadIdSet("classrooms", "id");
const sourceMusicSheetIds = loadIdSet("music_sheets", "id");

const importedAssignmentIds = new Set();
const importedSessionIds = new Set();

async function rowExists(table, id) {
  const result = await client.execute({ sql: `SELECT 1 as ok FROM ${table} WHERE id = ? LIMIT 1`, args: [id] });
  return (result.rows?.length ?? 0) > 0;
}

const ensured = {
  users: new Set(),
  classrooms: new Set(),
  music_sheets: new Set(),
  assignments: new Set(),
  practice_sessions: new Set(),
};

async function ensureUser(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  if (ensured.users.has(n)) return;
  ensured.users.add(n);
  if (dryRun) return;
  if (await rowExists("users", n)) return;
  const email = `missing-user-${n}@placeholder.local`;
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (id, email, password, name, role, instrument, created_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, unixepoch()))`,
    args: [n, email, "*", `Missing User ${n}`, "student", null, null],
  });
}

async function ensureClassroom(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  if (ensured.classrooms.has(n)) return;
  ensured.classrooms.add(n);
  if (dryRun) return;
  if (await rowExists("classrooms", n)) return;
  // Needs a valid instructor_id
  const instructorId = 1;
  await ensureUser(instructorId);
  await client.execute({
    sql: `INSERT OR IGNORE INTO classrooms (id, name, code, instructor_id, created_at)
          VALUES (?, ?, ?, ?, COALESCE(?, unixepoch()))`,
    args: [n, `Missing Classroom ${n}`, `MISSING-${n}`, instructorId, null],
  });
}

async function ensureMusicSheet(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  if (ensured.music_sheets.has(n)) return;
  ensured.music_sheets.add(n);
  if (dryRun) return;
  if (await rowExists("music_sheets", n)) return;
  const uploadedBy = 1;
  await ensureUser(uploadedBy);
  await client.execute({
    sql: `INSERT OR IGNORE INTO music_sheets
          (id, title, artist, uploaded_by, audio_path, duration, tempo, key, time_signature, difficulty, notes_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'medium', ?, COALESCE(?, unixepoch()))`,
    args: [n, `Missing Piece ${n}`, "Unknown", uploadedBy, "missing", 0, "[]", null],
  });
}

async function ensureAssignment(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  if (ensured.assignments.has(n)) return;
  ensured.assignments.add(n);
  if (dryRun) return;
  if (await rowExists("assignments", n)) return;
  const musicSheetId = 1;
  const assignedBy = 1;
  await ensureMusicSheet(musicSheetId);
  await ensureUser(assignedBy);
  await client.execute({
    sql: `INSERT OR IGNORE INTO assignments
          (id, music_sheet_id, student_id, classroom_id, template_assignment_id, assigned_by, due_date, status, created_at)
          VALUES (?, ?, NULL, NULL, NULL, ?, NULL, 'assigned', COALESCE(?, unixepoch()))`,
    args: [n, musicSheetId, assignedBy, null],
  });
}

async function ensurePracticeSession(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  if (ensured.practice_sessions.has(n)) return;
  ensured.practice_sessions.add(n);
  if (dryRun) return;
  if (await rowExists("practice_sessions", n)) return;
  const assignmentId = 1;
  const studentId = 1;
  await ensureAssignment(assignmentId);
  await ensureUser(studentId);
  await client.execute({
    sql: `INSERT OR IGNORE INTO practice_sessions
          (id, assignment_id, student_id, accuracy_score, timing_score, total_notes, correct_notes, wrong_notes, missed_notes, performance_json, duration, started_at, completed_at)
          VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, NULL, 0, NULL, '')`,
    args: [n, assignmentId, studentId],
  });
}

async function truncateAll() {
  // Recreate schema from scratch to handle schema drift between versions.
  for (const table of tables.slice().reverse()) {
    await execScript(`DROP TABLE IF EXISTS ${table};`);
  }
}

function getSourceColumns(table) {
  const cols = source.prepare(`PRAGMA table_info(${table})`).all();
  return cols.map((c) => String(c.name));
}

async function getDestColumns(table) {
  const result = await client.execute(`PRAGMA table_info(${table});`);
  const rows = result.rows ?? [];
  return rows.map((r) => String(r.name));
}

function validateRow(table, row) {
  // Skip rows that would violate FK constraints on the destination.
  if (table === "classrooms") {
    return sourceUserIds.has(Number(row.instructor_id)) || repair;
  }
  if (table === "student_classrooms") {
    return (
      (sourceUserIds.has(Number(row.student_id)) || repair) &&
      (sourceClassroomIds.has(Number(row.classroom_id)) || repair)
    );
  }
  if (table === "music_sheets") {
    return sourceUserIds.has(Number(row.uploaded_by)) || repair;
  }
  if (table === "assignments") {
    const msOk = sourceMusicSheetIds.has(Number(row.music_sheet_id));
    const assignedByOk = sourceUserIds.has(Number(row.assigned_by));
    const studentOk =
      row.student_id == null || row.student_id === "" || sourceUserIds.has(Number(row.student_id));
    const classroomOk =
      row.classroom_id == null || row.classroom_id === "" || sourceClassroomIds.has(Number(row.classroom_id));
    return (msOk && assignedByOk && studentOk && classroomOk) || repair;
  }
  if (table === "practice_sessions") {
    // Only import sessions tied to imported assignments.
    const assignmentOk = importedAssignmentIds.has(Number(row.assignment_id));
    const studentOk = sourceUserIds.has(Number(row.student_id));
    return (assignmentOk && studentOk) || repair;
  }
  if (table === "feedback") {
    const userOk = sourceUserIds.has(Number(row.user_id));
    return userOk || repair;
  }
  if (table === "notifications") {
    return sourceUserIds.has(Number(row.user_id)) || repair;
  }
  return true;
}

function normalizeRow(table, row) {
  if (!repair) return row;
  const next = { ...row };

  if (table === "feedback") {
    if (next.user_id == null || next.user_id === "") next.user_id = 1;
    if (next.role == null || String(next.role).trim() === "") next.role = "student";
    if (next.category == null || String(next.category).trim() === "") next.category = "migrated";
    if (next.subject == null || String(next.subject).trim() === "") next.subject = "Migrated feedback";
    if (next.message == null || String(next.message).trim() === "") next.message = "(migrated feedback)";
  }

  if (table === "notifications") {
    if (next.user_id == null || next.user_id === "") next.user_id = 1;
    if (next.type == null || String(next.type).trim() === "") next.type = "migrated";
    if (next.title == null || String(next.title).trim() === "") next.title = `(migrated notification ${next.id ?? ""})`.trim();
  }

  return next;
}

async function insertTable(table) {
  const sourceCols = getSourceColumns(table);
  const destCols = await getDestColumns(table);
  const cols = sourceCols.filter((c) => destCols.includes(c));
  if (cols.length === 0) {
    console.log(`[skip] ${table}: no matching columns`);
    return;
  }

  const selectSql = `SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM ${table};`;
  const allRows = source.prepare(selectSql).all().map((r) => normalizeRow(table, r));
  const rows = allRows.filter((r) => validateRow(table, r));
  const skipped = allRows.length - rows.length;
  console.log(`[copy] ${table}: ${rows.length} row(s)` + (skipped ? ` (skipped ${skipped})` : ""));
  if (rows.length === 0) return;

  const placeholders = cols.map(() => "?").join(", ");
  const insertSql = `INSERT OR REPLACE INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders});`;

  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (dryRun) continue;

    // Execute row-by-row so we can keep going if the source DB has inconsistencies.
    for (const row of chunk) {
      try {
        if (repair) {
          if (table === "classrooms") {
            await ensureUser(row.instructor_id);
          } else if (table === "student_classrooms") {
            await ensureUser(row.student_id);
            await ensureClassroom(row.classroom_id);
          } else if (table === "music_sheets") {
            await ensureUser(row.uploaded_by);
          } else if (table === "assignments") {
            await ensureMusicSheet(row.music_sheet_id);
            await ensureUser(row.assigned_by);
            if (row.student_id != null && row.student_id !== "") await ensureUser(row.student_id);
            if (row.classroom_id != null && row.classroom_id !== "") await ensureClassroom(row.classroom_id);
          } else if (table === "practice_sessions") {
            await ensureAssignment(row.assignment_id);
            await ensureUser(row.student_id);
          } else if (table === "feedback") {
            await ensurePracticeSession(row.session_id);
            await ensureUser(row.student_id);
            if (row.instructor_id != null && row.instructor_id !== "") await ensureUser(row.instructor_id);
          } else if (table === "notifications") {
            await ensureUser(row.user_id);
          }
        }

        await client.execute({ sql: insertSql, args: cols.map((c) => row[c]) });
        if (table === "assignments") importedAssignmentIds.add(Number(row.id));
        if (table === "practice_sessions") importedSessionIds.add(Number(row.id));
      } catch (error) {
        console.warn(`[warn] ${table}: failed to insert id=${row.id ?? "?"}: ${error?.message ?? error}`);
      }
    }
  }
}

console.log(`Source SQLite: ${fromPath}`);
console.log(`Target Turso: ${tursoUrl}`);
if (dryRun) console.log("Dry run enabled (no writes).");
if (repair) console.log("Repair mode enabled (creates placeholder parent rows).");

await execScript(schemaSql);
// Importing real-world data often includes historical inconsistencies.
// Disable foreign key enforcement during the copy, then re-enable and report.
await execScript("PRAGMA foreign_keys=OFF;");
if (shouldTruncate) {
  console.log("Truncating destination tables...");
  await truncateAll();
  await execScript(schemaSql);
}

for (const table of tables) {
  // eslint-disable-next-line no-await-in-loop
  await insertTable(table);
}

await execScript("PRAGMA foreign_keys=ON;");
if (!dryRun) {
  const check = await client.execute("PRAGMA foreign_key_check;");
  const rows = check.rows ?? [];
  if (rows.length > 0) {
    console.warn(`WARNING: foreign_key_check reported ${rows.length} issue(s).`);
    console.warn("First few rows:", rows.slice(0, 10));
  }
}

console.log("Migration complete.");
