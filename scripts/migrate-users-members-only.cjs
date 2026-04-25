/* eslint-disable no-console */
const Database = require("better-sqlite3");

const DB_PATH = "./data/dmaestro.db";

function main() {
  const db = new Database(DB_PATH);
  try {
    const cols = db.prepare("PRAGMA table_info(users)").all();
    const instrumentCol = cols.find((c) => String(c.name) === "instrument");
    if (!instrumentCol) {
      db.exec("ALTER TABLE users ADD COLUMN instrument TEXT;");
      db.exec("UPDATE users SET instrument='piano' WHERE lower(role)='student' AND (instrument IS NULL OR trim(instrument)='');");
      db.exec("UPDATE users SET instrument=NULL WHERE lower(role)='instructor';");
      console.log("Added users.instrument column; defaulted students to piano; cleared instructor instruments.");
      return;
    }

    const hasInstrumentDefaultPiano = String(instrumentCol?.dflt_value ?? "").includes("piano");

    if (!hasInstrumentDefaultPiano) {
      db.exec("UPDATE users SET instrument=NULL WHERE lower(role)='instructor';");
      console.log("users already has no instrument default; cleared instructor instruments.");
      return;
    }

    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN");

    db.exec(`
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

    db.exec(`
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

    db.exec("DROP TABLE users;");
    db.exec("ALTER TABLE users__instrument_nullable RENAME TO users;");

    db.exec("COMMIT");
    db.pragma("foreign_keys = ON");

    try {
      db.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);");
    } catch {}
    try {
      db.exec("CREATE INDEX IF NOT EXISTS idx_users_email_role ON users(email, role);");
    } catch {}

    console.log("Migrated users: removed instrument default and cleared instructor instruments.");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    try {
      db.pragma("foreign_keys = ON");
    } catch {}
    throw err;
  } finally {
    db.close();
  }
}

main();
