import path from "node:path";
import Database from "better-sqlite3";

const minScore = Number(process.argv[2] ?? 50);
const maxScore = Number(process.argv[3] ?? 83);
const limitMembersRaw = process.argv[4];
const limitMembers =
  limitMembersRaw == null || String(limitMembersRaw).trim() === "" ? null : Math.max(1, Math.trunc(Number(limitMembersRaw)));

if (
  !Number.isFinite(minScore) ||
  !Number.isFinite(maxScore) ||
  minScore < 0 ||
  maxScore > 100 ||
  minScore > maxScore ||
  (limitMembers != null && !Number.isFinite(limitMembers))
) {
  console.error("Usage: node scripts/set_scores_for_all_members.mjs [minScore] [maxScore] [limitMembers]");
  process.exit(2);
}

const dbPath = path.resolve("./data/dmaestro.db");
const db = new Database(dbPath);

function randIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Target "members" as students who have at least 1 practice session (so they actually have a score to update).
const memberRows = db
  .prepare(
    `
    select distinct u.id as id, u.name as name, u.email as email
    from practice_sessions ps
    join users u on u.id = ps.student_id
    where lower(u.role)='student'
    order by u.id
    ${limitMembers != null ? "limit ?" : ""}
  `
  )
  .all(...(limitMembers != null ? [limitMembers] : []));

const studentIds = memberRows.map((s) => Number(s.id)).filter((id) => Number.isFinite(id) && id > 0);
console.log(`Member students with sessions: ${studentIds.length}`);
if (limitMembers != null) console.log(`Limit requested: ${limitMembers}`);

if (studentIds.length === 0) {
  console.log("No member students with sessions found; nothing to update.");
  process.exit(0);
}

const placeholders = studentIds.map(() => "?").join(",");

const sessionCountRow = db
  .prepare(`select count(*) as c from practice_sessions where student_id in (${placeholders})`)
  .get(...studentIds);
const sessionCount = Number(sessionCountRow?.c ?? 0);
console.log(`Practice sessions for members: ${sessionCount}`);

const updateStmt = db.prepare(`update practice_sessions set accuracy_score=?, timing_score=? where id=?`);
const selectIdsStmt = db.prepare(`select id from practice_sessions where student_id in (${placeholders})`);

db.exec("begin");
let updatedRows = 0;
try {
  const sessionIds = selectIdsStmt.all(...studentIds).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
  for (const sid of sessionIds) {
    const score = randIntInclusive(minScore, maxScore);
    updateStmt.run(score, score, sid);
  }
  updatedRows = sessionIds.length;
  db.exec("commit");
} catch (e) {
  try {
    db.exec("rollback");
  } catch {}
  throw e;
}

const stats = db
  .prepare(
    `
    select
      count(*) as sessions,
      count(distinct student_id) as studentsWithSessions,
      min(cast(accuracy_score as real)) as minAccuracy,
      max(cast(accuracy_score as real)) as maxAccuracy,
      min(cast(timing_score as real)) as minTiming,
      max(cast(timing_score as real)) as maxTiming
    from practice_sessions
    where student_id in (${placeholders})
  `
  )
  .get(...studentIds);

console.log(`Updated practice_sessions rows: ${updatedRows}`);
console.log(stats);
