import path from "node:path";
import Database from "better-sqlite3";

const dbPath = path.resolve("./data/dmaestro.db");
const db = new Database(dbPath);

function qAll(sql) {
  return db.prepare(sql).all();
}

function safeAll(sql) {
  try {
    return { ok: true, rows: qAll(sql) };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

const tables = qAll(
  "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by 1"
).map((r) => r.name);

console.log("DB:", dbPath);
console.log("Tables:", tables.join(", ") || "(none)");

const counts = {};
for (const t of tables) {
  const res = safeAll(`select count(*) as c from ${t}`);
  counts[t] = res.ok ? res.rows?.[0]?.c ?? 0 : `(count failed: ${res.error})`;
}
console.log("RowCounts:", counts);

const queries = [
  "select id,email,name,role,instrument,created_at from users order by id desc limit 10",
  "select id,name,code,instructor_id,created_at from classrooms order by id desc limit 10",
  "select id,title,artist,uploaded_by,audio_path,duration,tempo,key,time_signature,difficulty,created_at from music_sheets order by id desc limit 10",
  "select id,music_sheet_id,student_id,classroom_id,assigned_by,due_date,status,created_at from assignments order by id desc limit 10",
  "select id,assignment_id,student_id,accuracy_score,timing_score,total_notes,correct_notes,wrong_notes,missed_notes,duration,completed_at from practice_sessions order by id desc limit 10",
];

for (const sql of queries) {
  const res = safeAll(sql);
  console.log("\n" + sql);
  if (!res.ok) {
    console.log("ERROR:", res.error);
  } else {
    console.log(res.rows);
  }
}

