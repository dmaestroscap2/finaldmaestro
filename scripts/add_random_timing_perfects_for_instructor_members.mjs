import path from "node:path";
import Database from "better-sqlite3";

const instructorName = String(process.argv[2] ?? "Gilbert Villanueva").trim();
const minPerfectPct = Number(process.argv[3] ?? 8); // percent of events to mark perfect
const maxPerfectPct = Number(process.argv[4] ?? 22);
const synthMaxEvents = Number(process.argv[5] ?? 24); // when performance_json is empty, synthesize up to N events

function clampInt(n, min, max) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

const minPct = clampInt(minPerfectPct, 0, 100);
const maxPct = clampInt(maxPerfectPct, 0, 100);
const synthLimit = clampInt(synthMaxEvents, 1, 200);

if (minPct > maxPct) {
  console.error("minPerfectPct must be <= maxPerfectPct");
  process.exit(2);
}

const dbPath = path.resolve("./data/dmaestro.db");
const db = new Database(dbPath);

function randIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function findInstructorsByName(name) {
  const tokens = name
    .toLowerCase()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const clauses = tokens.map(() => "lower(name) like ?");
  const params = tokens.map((t) => `%${t}%`);

  return db
    .prepare(
      `
      select id, email, name
      from users
      where lower(role)='instructor' and ${clauses.join(" and ")}
      order by id
    `
    )
    .all(...params);
}

function listAllInstructors() {
  return db
    .prepare(
      `
      select id, email, name
      from users
      where lower(role)='instructor'
      order by id
    `
    )
    .all();
}

function getInstructorClassroomIds(instructorId) {
  return db.prepare(`select id from classrooms where instructor_id=?`).all(instructorId).map((r) => Number(r.id));
}

function getSessionsForInstructorScope({ instructorId, classroomIds }) {
  const hasClassrooms = classroomIds.length > 0;
  const classroomPlaceholders = classroomIds.map(() => "?").join(",");
  const sql = `
    select
      ps.id as id,
      ps.performance_json as performanceJson,
      ps.total_notes as totalNotes,
      ps.timing_score as timingScore
    from practice_sessions ps
    join assignments a on a.id = ps.assignment_id
    where a.assigned_by = ?
      ${hasClassrooms ? `or a.classroom_id in (${classroomPlaceholders})` : ""}
    order by ps.id
  `;
  const params = hasClassrooms ? [instructorId, ...classroomIds] : [instructorId];
  return db.prepare(sql).all(...params);
}

function normalizeGrade(value) {
  return value === "early" || value === "perfect" || value === "late" ? value : null;
}

function buildRandomGrades(count, { minPct, maxPct }) {
  const grades = new Array(count);
  const minPerfect = Math.max(1, Math.round((count * minPct) / 100));
  const maxPerfect = Math.max(minPerfect, Math.round((count * maxPct) / 100));
  const perfectCount = Math.min(count, randIntInclusive(minPerfect, Math.max(minPerfect, maxPerfect)));

  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const perfectSet = new Set(indices.slice(0, perfectCount));
  for (let i = 0; i < count; i += 1) {
    grades[i] = perfectSet.has(i) ? "perfect" : pickRandom(["early", "late"]);
  }
  return grades;
}

function patchPerformanceJson(performanceJsonRaw, { totalNotes }) {
  let events = [];
  if (typeof performanceJsonRaw === "string" && performanceJsonRaw.trim()) {
    try {
      const parsed = JSON.parse(performanceJsonRaw);
      if (Array.isArray(parsed)) events = parsed.filter(Boolean);
    } catch {
      events = [];
    }
  }

  if (!Array.isArray(events) || events.length === 0) {
    const count = Math.max(1, Math.min(synthLimit, Math.max(1, Math.round(Number(totalNotes ?? 0) || 0) || 1)));
    const grades = buildRandomGrades(count, { minPct, maxPct });
    const synthetic = grades.map((timingGrade) => ({
      expectedPitch: null,
      startTime: null,
      duration: null,
      status: null,
      timingGrade,
      heldDuration: null,
    }));
    return { nextJson: JSON.stringify(synthetic), changed: true, synthesized: true };
  }

  let hasPerfect = false;
  let changed = false;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const current = normalizeGrade(event.timingGrade);
    if (current === "perfect") hasPerfect = true;
    if (current == null) {
      event.timingGrade = pickRandom(["early", "late"]);
      changed = true;
    }
  }

  if (!hasPerfect) {
    const idx = Math.floor(Math.random() * events.length);
    const event = events[idx];
    if (event && typeof event === "object") {
      event.timingGrade = "perfect";
      changed = true;
    }
  }

  return { nextJson: JSON.stringify(events), changed, synthesized: false };
}

const matches = findInstructorsByName(instructorName);
if (matches.length === 0) {
  console.error(`No instructor matched name: "${instructorName}"`);
  const all = listAllInstructors();
  if (all.length > 0) {
    console.error("Available instructors:");
    for (const r of all) console.error(`- [${r.id}] ${r.name} <${r.email}>`);
  }
  process.exit(1);
}

const updateStmt = db.prepare(`update practice_sessions set performance_json=? where id=?`);

db.exec("begin");
let updated = 0;
let synthesized = 0;
try {
  for (const inst of matches) {
    const instructorId = Number(inst.id);
    const classroomIds = getInstructorClassroomIds(instructorId);
    const sessions = getSessionsForInstructorScope({ instructorId, classroomIds });

    console.log(`Instructor: [${instructorId}] ${inst.name} <${inst.email}>`);
    console.log(`Sessions in scope: ${sessions.length}`);

    for (const s of sessions) {
      const res = patchPerformanceJson(s.performanceJson, { totalNotes: s.totalNotes });
      if (!res.changed) continue;
      updateStmt.run(res.nextJson, Number(s.id));
      updated += 1;
      if (res.synthesized) synthesized += 1;
    }
  }
  db.exec("commit");
} catch (e) {
  try {
    db.exec("rollback");
  } catch {}
  throw e;
}

console.log(`Updated practice_sessions rows: ${updated}`);
console.log(`Synthesized performance_json: ${synthesized}`);

