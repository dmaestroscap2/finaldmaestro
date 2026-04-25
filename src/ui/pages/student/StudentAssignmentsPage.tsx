import React from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { assignmentAPI, authAPI } from "../../../api/client";
import { formatDuration } from "../musicLibrary.utils";
import { useAutoRefresh } from "../../shared/useAutoRefresh";
import { buildStudentAssignmentPracticePath, filterVisibleStudentAssignments } from "./studentAssignments.utils";

export function StudentAssignmentsPage() {
  const navigate = useNavigate();
  const [studentInstrument, setStudentInstrument] = React.useState("piano");
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refreshAssignments = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const [user, result] = await Promise.all([authAPI.me(), assignmentAPI.list()]);
      if (requestId !== requestIdRef.current) return;
      setStudentInstrument(String((user as any)?.instrument ?? "piano"));
      setAssignments(filterVisibleStudentAssignments(Array.isArray(result) ? result : []));
      setError("");
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setStudentInstrument("piano");
      setAssignments([]);
      setError(err?.message ?? "Failed to load assignments");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshAssignments, { intervalMs: 15_000 });

  return (
    <div>
      <PageHeader title="My Assignments" subtitle="Pieces you have started practicing." />

      {loading ? <div className="pageSubtitle">Loading assignments...</div> : null}
      {error ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.92)" }}>
          {error}
        </div>
      ) : null}

      <div className="gridCards3">
        {assignments.map((assignment) => {
          const practicePath = buildStudentAssignmentPracticePath(assignment, studentInstrument);
          const title = assignment.musicSheet?.title ?? "Untitled";
          const artist = assignment.musicSheet?.artist ?? "Unknown artist";
          const difficulty = String(assignment.musicSheet?.difficulty ?? "medium");
          const duration = formatDuration(assignment.musicSheet?.duration);
          const status = String(assignment.status ?? "in_progress");

          return (
            <div key={assignment.id} className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(241,194,75,.10)",
                    border: "1px solid rgba(241,194,75,.22)",
                    color: "rgba(241,194,75,.92)",
                    fontWeight: 900,
                  }}
                >
                  ♪
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      lineHeight: 1.2,
                    }}
                  >
                    {title}
                  </div>
                  <div
                    className="pageSubtitle"
                    style={{
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {artist}
                  </div>
                  <div className="pageSubtitle" style={{ marginTop: 6 }}>
                    ⏱ {duration} &nbsp;&nbsp; {difficulty}
                  </div>
                </div>
                <span
                  className="pill"
                  style={{
                    borderColor: "rgba(216,221,231,.16)",
                    background: "rgba(255,255,255,.04)",
                    color: "rgba(216,221,231,.85)",
                    flexShrink: 0,
                  }}
                >
                  {status}
                </span>
              </div>

              <button
                type="button"
                className="primaryBtn"
                style={{ marginTop: 0 }}
                disabled={!practicePath}
                onClick={() => {
                  if (practicePath) navigate(practicePath);
                }}
              >
                Continue Practice
              </button>
            </div>
          );
        })}
      </div>

      {!loading && !error && assignments.length === 0 ? (
        <div className="pageSubtitle" style={{ marginTop: 14 }}>
          No started assignments yet. Go to Practice to start one.
        </div>
      ) : null}
    </div>
  );
}

