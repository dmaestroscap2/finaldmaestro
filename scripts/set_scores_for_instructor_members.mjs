import path from "node:path";
import Database from "better-sqlite3";

const instructorName = String(process.argv[2] ?? "Gilbert Villanueva").trim();
const minScore = Number(process.argv[3] ?? 50);
const maxScore = Number(process.argv[4] ?? 83);

if (!Number.isFinite(minScore) || !Number.isFinite(maxScore) || minScore < 0 || maxScore > 100 || minScore > maxScore) {
  console.error("Usage: node scripts/set_scores_for_instructor_members.mjs [instructorName] [minScore] [maxScore]");
  process.exit(2);
}

const dbPath = path.resolve("./data/dmaestro.db");
const db = new Database(dbPath);

function randIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

function getPracticeSessionIdsToUpdate({ instructorId, classroomIds, studentId }) {
  const classroomPlaceholders = classroomIds.map(() => "?").join(",");
  const hasClassrooms = classroomIds.length > 0;
  const sql = `
    select ps.id as id
    from practice_sessions ps
    join assignments a on a.id = ps.assignment_id
    where ps.student_id = ?
      and (
        a.assigned_by = ?
        ${hasClassrooms ? `or a.classroom_id in (${classroomPlaceholders})` : ""}
      )
  `;
  const params = hasClassrooms ? [studentId, instructorId, ...classroomIds] : [studentId, instructorId];
  return db
    .prepare(sql)
    .all(...params)
    .map((r) => Number(r.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

const matches = findInstructorsByName(instructorName);
if (matches.length === 0) {
  console.error(`No instructor matched name: "${instructorName}"`);
  const all = listAllInstructors();
  if (all.length > 0) {
    console.error("Available instructors:");
    for (const r of all) {
      console.error(`- [${r.id}] ${r.name} <${r.email}>`);
    }
  } else {
    console.error("No instructors found in users table.");
  }
  process.exit(1);
}

const updateStmt = db.prepare(`update practice_sessions set accuracy_score=?, timing_score=? where id=?`);

db.exec("begin");
let totalStudents = 0;
let totalSessions = 0;
try {
  for (const inst of matches) {
    const instructorId = Number(inst.id);
    const classroomIds = getInstructorClassroomIds(instructorId);
    const studentIds = Array.from(
      new Set([
        ...getMemberStudentIdsForClassrooms(classroomIds),
        ...getDirectAssignmentStudentIds(instructorId),
      ])
    );

    console.log(`Instructor: [${instructorId}] ${inst.name} <${inst.email}>`);
    console.log(`Classrooms: ${classroomIds.length ? classroomIds.join(", ") : "(none)"}`);
    console.log(`Members: ${studentIds.length}`);

    for (const studentId of studentIds) {
      const sessionIds = getPracticeSessionIdsToUpdate({ instructorId, classroomIds, studentId });
      if (sessionIds.length === 0) continue;
      totalStudents += 1;

      for (const sid of sessionIds) {
        const score = randIntInclusive(minScore, maxScore);
        updateStmt.run(score, score, sid);
      }
      totalSessions += sessionIds.length;
    }
  }
  db.exec("commit");
} catch (e) {
  try {
    db.exec("rollback");
  } catch {}
  throw e;
}

console.log(`Updated students with sessions: ${totalStudents}`);
console.log(`Updated practice_sessions rows: ${totalSessions}`);
