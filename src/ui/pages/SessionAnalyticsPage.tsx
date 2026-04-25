import React from "react";
import { PageHeader } from "../shared/PageHeader";
import { sessionAPI } from "../../api/client";
import { buildInstructorAnalyticsSummary, type InstructorAnalyticsSession } from "./sessionAnalytics.utils";
import { useAutoRefresh } from "../shared/useAutoRefresh";

export function SessionAnalyticsPage() {
  const [sessions, setSessions] = React.useState<InstructorAnalyticsSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedClassroomId, setSelectedClassroomId] = React.useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = React.useState<number | null>(null);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refreshSessions = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await sessionAPI.listForInstructor();
      if (requestId !== requestIdRef.current) return;
      setSessions(Array.isArray(result) ? result : []);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err?.message ?? "Failed to load instructor analytics");
      setSessions([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshSessions, { intervalMs: 30_000 });

  const classroomOptions = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const session of sessions) {
      const classroomId = Number(session.classroomId ?? 0);
      if (classroomId > 0 && session.classroomName) {
        map.set(classroomId, session.classroomName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const studentOptions = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const session of sessions) {
      if (selectedClassroomId != null && session.classroomId !== selectedClassroomId) continue;
      const studentId = Number(session.studentId ?? 0);
      if (studentId > 0 && session.studentName) {
        map.set(studentId, session.studentName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, selectedClassroomId]);

  React.useEffect(() => {
    if (selectedStudentId == null) return;
    const stillVisible = studentOptions.some((student) => student.id === selectedStudentId);
    if (!stillVisible) setSelectedStudentId(null);
  }, [selectedStudentId, studentOptions]);

  const summary = React.useMemo(
    () =>
      buildInstructorAnalyticsSummary(sessions, {
        classroomId: selectedClassroomId,
        studentId: selectedStudentId,
      }),
    [sessions, selectedClassroomId, selectedStudentId]
  );

  return (
    <div>
      <PageHeader
        title="Session Analytics"
        subtitle="Review member practice analysis, scores, timing, and recent performance."
        right={
          <>
            <select
              className="select"
              value={selectedClassroomId ?? ""}
              onChange={(event) => setSelectedClassroomId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">All Classrooms</option>
              {classroomOptions.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={selectedStudentId ?? ""}
              onChange={(event) => setSelectedStudentId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">All Members</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </>
        }
      />

      {loading ? <div className="pageSubtitle">Loading member analytics...</div> : null}
      {error ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.92)" }}>
          {error}
        </div>
      ) : null}

      <div className="gridCards">
        <div className="card">
          <div className="cardLabel">Total Sessions</div>
          <div className="cardValue">{summary.kpis.totalSessions}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Avg Accuracy</div>
          <div className="cardValue">{summary.kpis.averageAccuracy}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Avg Timing</div>
          <div className="cardValue">{summary.kpis.averageTiming}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Avg Score</div>
          <div className="cardValue">{summary.kpis.averageScore}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Practice Time</div>
          <div className="cardValue">{summary.kpis.totalPracticeTimeLabel}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Note Hit Rate</div>
          <div className="cardValue">{summary.kpis.noteHitRate}%</div>
        </div>
      </div>

      <div className="twoCols" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="sectionTitle">Timing Consistency</div>
          <div className="sectionSub">
            Perfect, early, and late note timing for the current filter
            {summary.timingBreakdown.estimated ? " (estimated from timing scores)" : ""}
          </div>
          {summary.timingBreakdown.total > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  display: "flex",
                  height: 12,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.06)",
                }}
              >
                <div style={{ width: `${summary.timingBreakdown.perfectPct}%`, background: "rgba(241,194,75,.85)" }} />
                <div style={{ width: `${summary.timingBreakdown.earlyPct}%`, background: "rgba(126,168,255,.75)" }} />
                <div style={{ width: `${summary.timingBreakdown.latePct}%`, background: "rgba(255,120,120,.75)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10, fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{summary.timingBreakdown.perfectPct}%</div>
                  <div className="pageSubtitle">Perfect ({summary.timingBreakdown.perfect})</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 900 }}>{summary.timingBreakdown.earlyPct}%</div>
                  <div className="pageSubtitle">Early ({summary.timingBreakdown.early})</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900 }}>{summary.timingBreakdown.latePct}%</div>
                  <div className="pageSubtitle">Late ({summary.timingBreakdown.late})</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="emptyState" style={{ height: 140, marginTop: 10 }}>
              {summary.kpis.totalSessions > 0 ? "No timing grades recorded yet" : "No practice data yet"}
            </div>
          )}
        </div>
      </div>

      <div className="twoCols">
        <div className="card">
          <div className="sectionTitle">Member Breakdown</div>
          <div className="sectionSub">Average practice analysis for each member in the current filter</div>
          {summary.memberBreakdown.length > 0 ? (
            <div className="scrollList" style={{ marginTop: 10 }}>
              {summary.memberBreakdown.map((member) => (
                <button
                  key={member.studentId}
                  type="button"
                  onClick={() => setSelectedStudentId(member.studentId)}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,.02)",
                    border: "1px solid rgba(255,255,255,.06)",
                    color: "inherit",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{member.studentName}</div>
                      <div className="pageSubtitle">{member.sessions} session(s)</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900 }}>{member.averageAccuracy}% accuracy</div>
                      <div className="pageSubtitle">{member.averageTiming}% timing</div>
                    </div>
                  </div>
                  <div className="pageSubtitle" style={{ marginTop: 8 }}>
                    Practice time: {member.practiceTimeLabel}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="emptyState">No member practice analysis yet</div>
          )}
        </div>

        <div className="card">
          <div className="sectionTitle">Performance by Piece</div>
          <div className="sectionSub">Average analysis scores for each assigned piece</div>
          {summary.performanceByPiece.length > 0 ? (
            <div className="scrollList" style={{ marginTop: 10 }}>
              {summary.performanceByPiece.map((piece) => (
                <div
                  key={`${piece.title}:${piece.artist}`}
                  style={{
                    padding: 10,
                    borderBottom: "1px solid rgba(255,255,255,.06)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{piece.title}</div>
                    <div className="pageSubtitle">{piece.artist}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{piece.averageAccuracy}% accuracy</div>
                    <div className="pageSubtitle">{piece.averageTiming}% timing · {piece.sessions} session(s)</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="emptyState">No piece analysis yet</div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }} className="card">
        <div className="sectionTitle">Recent Practice Sessions</div>
        <div className="sectionSub">Latest member analysis details for the active filter</div>
        {summary.recentSessions.length > 0 ? (
          <div className="scrollList" style={{ marginTop: 10 }}>
            {summary.recentSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  padding: 10,
                  borderBottom: "1px solid rgba(255,255,255,.06)",
                  display: "grid",
                  gridTemplateColumns: "1.7fr 1.2fr repeat(5, minmax(0, 1fr))",
                  gap: 10,
                  fontSize: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>{session.studentName ?? "Unknown Member"}</div>
                  <div className="pageSubtitle">
                    {session.classroomName ?? "Direct Assignment"} · {new Date(session.completedAt ?? 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{session.assignmentTitle ?? "Untitled Piece"}</div>
                  <div className="pageSubtitle">{session.assignmentArtist ?? "Unknown artist"}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{Math.round(Number(session.accuracyScore ?? 0))}%</div>
                  <div className="pageSubtitle">Accuracy</div>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{Math.round(Number(session.timingScore ?? 0))}%</div>
                  <div className="pageSubtitle">Timing</div>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {session.correctNotes ?? 0}/{session.totalNotes ?? 0}
                  </div>
                  <div className="pageSubtitle">Hits</div>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{session.wrongNotes ?? 0}</div>
                  <div className="pageSubtitle">Wrong</div>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{session.missedNotes ?? 0}</div>
                  <div className="pageSubtitle">Missed</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="emptyState" style={{ height: 140, marginTop: 10 }}>
            No practice analysis yet
          </div>
        )}
      </div>
    </div>
  );
}
