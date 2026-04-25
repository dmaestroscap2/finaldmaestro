import Database from "better-sqlite3";

const dbPath = process.argv[2] || "data/dmaestro.db";
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const tables = process.argv.slice(3);
const targetTables = tables.length ? tables : ["feedback", "notifications", "practice_sessions", "assignments"];

for (const t of targetTables) {
  console.log("\nTABLE", t);
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t);
  console.log(row ? row.sql : "(missing)");
  try {
    console.log(db.prepare(`PRAGMA table_info(${t})`).all());
  } catch (e) {
    console.log("table_info failed:", e?.message ?? e);
  }
}

