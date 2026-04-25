/* eslint-disable no-console */
const Database = require("better-sqlite3");

const DB_PATH = "./data/dmaestro.db";

function main() {
  const db = new Database(DB_PATH);
  try {
    const cols = db.prepare("PRAGMA table_info(practice_sessions)").all();
    const byName = new Map(cols.map((c) => [String(c.name), String(c.type).toUpperCase()]));
    const hasStartedIso = byName.has("started_at_iso");
    const hasCompletedIso = byName.has("completed_at_iso");
    const completedType = byName.get("completed_at") ?? "";

    const needsRebuild = hasStartedIso || hasCompletedIso || completedType !== "TEXT";
    if (!needsRebuild) {
      console.log("practice_sessions already migrated.");
      return;
    }

    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN");

    db.exec(`
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

    const completedExpr = hasCompletedIso
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

    db.exec(`
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

    db.exec("DROP TABLE practice_sessions;");
    db.exec("ALTER TABLE practice_sessions__migrated RENAME TO practice_sessions;");

    db.exec("COMMIT");
    db.pragma("foreign_keys = ON");

    const nextCols = db
      .prepare("PRAGMA table_info(practice_sessions)")
      .all()
      .map((c) => ({ name: c.name, type: c.type }));
    console.log("Migrated practice_sessions schema:", nextCols);
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

