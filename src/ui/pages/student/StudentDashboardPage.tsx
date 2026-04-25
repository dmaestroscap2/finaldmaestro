import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { classroomAPI, assignmentAPI, sessionAPI, authAPI } from "../../../api/client";
import { resolveStudentPracticeInstrument } from "./studentPracticeInstrument.utils";
import { useAutoRefresh } from "../../shared/useAutoRefresh";

type JoinedClassroom = {
  code: string;
  name: string;
};

export function StudentDashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = React.useState<any>(null);
  const [isJoinOpen, setIsJoinOpen] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState("");
  const [joinMessage, setJoinMessage] = React.useState("");
  const [classrooms, setClassrooms] = React.useState<JoinedClassroom[]>([]);
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const requestIdRef = React.useRef(0);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refreshDashboard = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const [userData, classroomRes, assignmentRes, sessionRes] = await Promise.all([
        authAPI.me(),
        classroomAPI.list(),
        assignmentAPI.list(),
        sessionAPI.list(),
      ]);
      if (requestId !== requestIdRef.current) return;
      setUser(userData);
      setClassrooms(Array.isArray(classroomRes) ? classroomRes : []);
      setAssignments(Array.isArray(assignmentRes) ? assignmentRes : []);
      setSessions(Array.isArray(sessionRes) ? sessionRes : []);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to load dashboard data:", error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshDashboard, { intervalMs: 20_000 });

  const handleJoinClass = async () => {
    if (!joinCode.trim()) {
      setJoinMessage("Please enter a classroom code");
      return;
    }

    try {
      await classroomAPI.join(joinCode);
      setJoinMessage("Successfully joined!");
      setJoinCode("");
      setIsJoinOpen(false);
      await refreshDashboard();
    } catch (err: any) {
      setJoinMessage(err.message);
    }
  };

  const pendingAssignments = assignments.filter((a) => a.status !== "completed");
  const avgAccuracy =
    sessions.length > 0
      ? Math.round(
          sessions.reduce((sum, s) => sum + (s.accuracyScore || 0), 0) / sessions.length
        )
      : 0;
  const studentName = user?.name?.trim() || "Member";
  const studentInstrument = resolveStudentPracticeInstrument(null, user?.instrument ?? null);

  return (
    <div>
      <PageHeader
        title={`Hello, ${studentName}`}
        subtitle={`Ready to practice your ${studentInstrument} today?`}
        right={
          <div className="topActions">
            <button
              type="button"
              className="ghostBtn"
              onClick={() => {
                setJoinCode("");
                setJoinMessage("");
                setIsJoinOpen(true);
              }}
            >
              + Join Class
            </button>
            <button
              type="button"
              className="ghostBtn ghostBtnGold"
              onClick={() => navigate("/student/practice")}
            >
              Start Practice
            </button>
            <button
              type="button"
              className="ghostBtn"
              onClick={() => navigate("/student/trainer")}
            >
              Instrument Trainer
            </button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
        <div className="card" style={{ minHeight: 110 }}>
          <div className="sectionTitle">My Classrooms</div>
          {classrooms.length > 0 ? (
            classrooms.map((room) => (
              <div
                key={room.code}
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.06)",
                  background: "rgba(255,255,255,.02)",
                }}
              >
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>
                  {room.name}
                </div>
                <div className="pageSubtitle">Classroom • {room.code}</div>
              </div>
            ))
          ) : (
            <div className="pageSubtitle" style={{ marginTop: 10 }}>
              No classrooms joined yet
            </div>
          )}
        </div>

        <div>
          <div className="kpiRow">
            <div className="miniCard">
              <div className="cardLabel">Practice Sessions</div>
              <div className="cardValue">{sessions.length}</div>
              <div className="pageSubtitle">Total sessions completed</div>
            </div>
            <div className="miniCard">
              <div className="cardLabel">Average Accuracy</div>
              <div className="cardValue">{avgAccuracy}%</div>
            </div>
            <div className="miniCard">
              <div className="cardLabel">Pending Assignments</div>
              <div className="cardValue">{pendingAssignments.length}</div>
              <div className="pageSubtitle">Pieces waiting for you</div>
            </div>
          </div>

          <div className="card widePanel">
            <div className="sectionTitle">Recent Sessions</div>
            {sessions.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                {sessions.slice(0, 3).map((session, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 10,
                      borderBottom: "1px solid rgba(255,255,255,.06)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {session.accuracyScore}% Accuracy
                    </div>
                    <div className="pageSubtitle">
                      {new Date(session.completedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="emptyState" style={{ height: 170, marginTop: 10 }}>
                No practice sessions yet. Start playing!
              </div>
            )}
          </div>
        </div>
      </div>

      {isJoinOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Join a Classroom"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsJoinOpen(false);
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">Join a Classroom</div>
                <div className="modalSub">
                  Enter the code provided by your instructor.
                </div>
              </div>
              <button
                type="button"
                className="modalClose"
                aria-label="Close"
                onClick={() => setIsJoinOpen(false)}
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                className="input"
                placeholder="ENTER CLASS CODE (E.G. VIRI101)"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinMessage("");
                }}
              />
              {joinMessage ? (
                <div
                  className="pageSubtitle"
                  style={{
                    marginTop: 8,
                    color: joinMessage.startsWith("Joined")
                      ? "rgba(95,214,156,.92)"
                      : "rgba(255,107,107,.92)",
                  }}
                >
                  {joinMessage}
                </div>
              ) : null}
            </div>

            <div className="modalActions">
              <button
                type="button"
                className="modalPrimary"
                onClick={handleJoinClass}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

