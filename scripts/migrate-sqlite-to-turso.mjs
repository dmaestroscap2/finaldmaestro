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
    assigned_by INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed')),
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    accuracy_score INTEGER NOT NULL,
    timing_score INTEGER NOT NULL,
    total_notes INTEGER NOT NULL,
    correct_notes INTEGER NOT NULL,
    wrong_notes INTEGER NOT NULL,
    missed_notes INTEGER NOT NULL,
    performance_data TEXT,
    duration INTEGER,
    passed INTEGER DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES practice_sessions(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    instructor_id INTEGER REFERENCES users(id),
    message TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
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

async function truncateAll() {
  for (const table of tables.slice().reverse()) {
    await execScript(`DELETE FROM ${table};`);
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
    return sourceUserIds.has(Number(row.instructor_id));
  }
  if (table === "student_classrooms") {
    return (
      sourceUserIds.has(Number(row.student_id)) &&
      sourceClassroomIds.has(Number(row.classroom_id))
    );
  }
  if (table === "music_sheets") {
    return sourceUserIds.has(Number(row.uploaded_by));
  }
  if (table === "assignments") {
    const msOk = sourceMusicSheetIds.has(Number(row.music_sheet_id));
    const assignedByOk = sourceUserIds.has(Number(row.assigned_by));
    const studentOk =
      row.student_id == null || row.student_id === "" || sourceUserIds.has(Number(row.student_id));
    const classroomOk =
      row.classroom_id == null || row.classroom_id === "" || sourceClassroomIds.has(Number(row.classroom_id));
    return msOk && assignedByOk && studentOk && classroomOk;
  }
  if (table === "practice_sessions") {
    // Only import sessions tied to imported assignments.
    const assignmentOk = importedAssignmentIds.has(Number(row.assignment_id));
    const studentOk = sourceUserIds.has(Number(row.student_id));
    return assignmentOk && studentOk;
  }
  if (table === "feedback") {
    const sessionOk = importedSessionIds.has(Number(row.session_id));
    const studentOk = sourceUserIds.has(Number(row.student_id));
    const instructorOk =
      row.instructor_id == null || row.instructor_id === "" || sourceUserIds.has(Number(row.instructor_id));
    return sessionOk && studentOk && instructorOk;
  }
  if (table === "notifications") {
    return sourceUserIds.has(Number(row.user_id));
  }
  return true;
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
  const allRows = source.prepare(selectSql).all();
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

await execScript(schemaSql);
// Importing real-world data often includes historical inconsistencies.
// Disable foreign key enforcement during the copy, then re-enable and report.
await execScript("PRAGMA foreign_keys=OFF;");
if (shouldTruncate) {
  console.log("Truncating destination tables...");
  await truncateAll();
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
