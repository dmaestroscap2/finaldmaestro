import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { assignmentAPI, authAPI } from "../../../api/client";
import { formatDuration } from "../musicLibrary.utils";
import { useAutoRefresh } from "../../shared/useAutoRefresh";

export function StudentPracticePage() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [studentInstrument, setStudentInstrument] = useState("piano");
  const [loading, setLoading] = useState(true);
  const requestIdRef = React.useRef(0);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refreshAssignments = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const [user, res] = await Promise.all([authAPI.me(), assignmentAPI.list()]);
      if (requestId !== requestIdRef.current) return;
      setStudentInstrument(String((user as any)?.instrument ?? "piano"));
      const pending = (Array.isArray(res) ? res : []).filter((a: any) => {
        const status = String(a?.status ?? "assigned").toLowerCase();
        return status === "assigned";
      });
      setAssignments(pending);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to load assignments:", error);
      setAssignments([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshAssignments, { intervalMs: 15_000 });

  const handleStartPractice = async (assignment: any) => {
    const params = new URLSearchParams({
      assignmentId: String(assignment.id ?? ""),
      musicTitle: assignment.musicSheet?.title || "Practice",
      musicArtist: assignment.musicSheet?.artist || "Unknown",
      instrument: studentInstrument,
    });

    const id = Number(assignment?.id ?? 0);
    if (id > 0) {
      try {
        const started = (await assignmentAPI.start(id)) as any;
        const startedId = Number(started?.assignment?.id ?? 0);
        if (startedId > 0 && startedId !== id) {
          params.set("assignmentId", String(startedId));
        }
      } catch {
        // ignore: allow navigation even if the status update fails
      } finally {
        setAssignments((prev) => prev.filter((a) => Number(a?.id ?? 0) !== id));
      }
    }

    navigate(`/student/practice/session?${params.toString()}`);
  };

  return (
    <div>
      <PageHeader title="Practice Session" subtitle="Choose a piece to practice with real-time feedback." />

      {loading ? (
        <div className="pageSubtitle">Loading assignments...</div>
      ) : assignments.length > 0 ? (
        <div className="gridCards3">
          {assignments.map((assignment) => {
            const title = assignment.musicSheet?.title ?? "Untitled";
            const artist = assignment.musicSheet?.artist ?? "Unknown artist";
            const difficulty = String(assignment.musicSheet?.difficulty ?? "medium");
            const duration = formatDuration(assignment.musicSheet?.duration);
            const status = String(assignment.status ?? "assigned");

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

                <button className="primaryBtn" type="button" style={{ marginTop: 0 }} onClick={() => void handleStartPractice(assignment)}>
                  ⇢ Start Practice
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pageSubtitle">No pending assignments. Check back later!</div>
      )}
    </div>
  );
}
