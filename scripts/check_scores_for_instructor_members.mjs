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

function getMemberStudentIdsForClassrooms(classroomIds) {
  if (classroomIds.length === 0) return [];
  const placeholders = classroomIds.map(() => "?").join(",");
  return db
    .prepare(
      `
      select distinct student_id as studentId
      from student_classrooms
      where classroom_id in (${placeholders})
    `
    )
    .all(...classroomIds)
    .map((r) => Number(r.studentId))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function getDirectAssignmentStudentIds(instructorId) {
  return db
    .prepare(
      `
      select distinct student_id as studentId
      from assignments
      where assigned_by=? and student_id is not null
    `
    )
    .all(instructorId)
    .map((r) => Number(r.studentId))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function getScoreStatsForInstructor({ instructorId, classroomIds }) {
  const hasClassrooms = classroomIds.length > 0;
  const classroomPlaceholders = classroomIds.map(() => "?").join(",");
  const sql = `
    select
      count(*) as sessions,
      min(cast(ps.accuracy_score as real)) as minAccuracy,
      max(cast(ps.accuracy_score as real)) as maxAccuracy,
      min(cast(ps.timing_score as real)) as minTiming,
      max(cast(ps.timing_score as real)) as maxTiming,
      min((cast(ps.accuracy_score as real) + cast(ps.timing_score as real))/2.0) as minAvg,
      max((cast(ps.accuracy_score as real) + cast(ps.timing_score as real))/2.0) as maxAvg
    from practice_sessions ps
    join assignments a on a.id = ps.assignment_id
    where a.assigned_by = ?
      ${hasClassrooms ? `or a.classroom_id in (${classroomPlaceholders})` : ""}
  `;
  const params = hasClassrooms ? [instructorId, ...classroomIds] : [instructorId];
  return db.prepare(sql).get(...params);
}

const matches = findInstructorsByName(instructorName);
if (matches.length === 0) {
  console.error(`No instructor matched name: "${instructorName}"`);
  process.exit(1);
}

for (const inst of matches) {
  const instructorId = Number(inst.id);
  const classroomIds = getInstructorClassroomIds(instructorId);
  const studentIds = Array.from(
    new Set([
      ...getMemberStudentIdsForClassrooms(classroomIds),
      ...getDirectAssignmentStudentIds(instructorId),
    ])
  );

  const stats = getScoreStatsForInstructor({ instructorId, classroomIds });
  console.log(`Instructor: [${instructorId}] ${inst.name} <${inst.email}>`);
  console.log(`Classrooms: ${classroomIds.length ? classroomIds.join(", ") : "(none)"}`);
  console.log(`Members: ${studentIds.length}`);
  console.log(stats);
  console.log("");
}

