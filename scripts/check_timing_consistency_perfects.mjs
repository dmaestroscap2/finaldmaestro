import path from "node:path";
import Database from "better-sqlite3";

const instructorName = String(process.argv[2] ?? "Gilbert Villanueva").trim();

const dbPath = path.resolve("./data/dmaestro.db");
const db = new Database(dbPath);

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

function getInstructorClassroomIds(instructorId) {
  return db.prepare(`select id from classrooms where instructor_id=?`).all(instructorId).map((r) => Number(r.id));
}

function getSessionsForInstructorScope({ instructorId, classroomIds }) {
  const hasClassrooms = classroomIds.length > 0;
  const classroomPlaceholders = classroomIds.map(() => "?").join(",");
  const sql = `
    select
      ps.id as id,
      ps.student_id as studentId,
      ps.performance_json as performanceJson
    from practice_sessions ps
    join assignments a on a.id = ps.assignment_id
    where a.assigned_by = ?
      ${hasClassrooms ? `or a.classroom_id in (${classroomPlaceholders})` : ""}
    order by ps.id
  `;
  const params = hasClassrooms ? [instructorId, ...classroomIds] : [instructorId];
  return db.prepare(sql).all(...params);
}

function countPerfect(performanceJsonRaw) {
  if (typeof performanceJsonRaw !== "string" || !performanceJsonRaw.trim()) return { total: 0, perfect: 0 };
  try {
    const parsed = JSON.parse(performanceJsonRaw);
    if (!Array.isArray(parsed)) return { total: 0, perfect: 0 };
    let total = 0;
    let perfect = 0;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const grade = row.timingGrade;
      if (grade === "early" || grade === "late" || grade === "perfect") {
        total += 1;
        if (grade === "perfect") perfect += 1;
      }
    }
    return { total, perfect };
  } catch {
    return { total: 0, perfect: 0 };
  }
}

const matches = findInstructorsByName(instructorName);
if (matches.length === 0) {
  console.error(`No instructor matched name: "${instructorName}"`);
  process.exit(1);
}

for (const inst of matches) {
  const instructorId = Number(inst.id);
  const classroomIds = getInstructorClassroomIds(instructorId);
  const sessions = getSessionsForInstructorScope({ instructorId, classroomIds });

  let sessionsWithAnyPerfect = 0;
  let sessionsWithAnyTimingGrades = 0;
  let totalPerfect = 0;
  let totalGrades = 0;

  for (const s of sessions) {
    const c = countPerfect(s.performanceJson);
    if (c.total > 0) sessionsWithAnyTimingGrades += 1;
    if (c.perfect > 0) sessionsWithAnyPerfect += 1;
    totalPerfect += c.perfect;
    totalGrades += c.total;
  }

  console.log(`Instructor: [${instructorId}] ${inst.name} <${inst.email}>`);
  console.log(`Sessions in scope: ${sessions.length}`);
  console.log(`Sessions with timing grades: ${sessionsWithAnyTimingGrades}`);
  console.log(`Sessions with any perfect: ${sessionsWithAnyPerfect}`);
  console.log(`Perfect notes: ${totalPerfect}/${totalGrades}`);
  console.log("");
}

