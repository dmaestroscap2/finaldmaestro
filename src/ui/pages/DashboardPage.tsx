import React, { useState } from "react";
import { PageHeader } from "../shared/PageHeader";
import { classroomAPI, assignmentAPI, sessionAPI } from "../../api/client";
import { useAutoRefresh } from "../shared/useAutoRefresh";

export function DashboardPage() {
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [avgAccuracy, setAvgAccuracy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refreshDashboard = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const [classroomRes, assignmentRes, sessionsRes] = await Promise.all([
        classroomAPI.list(),
        assignmentAPI.list(),
        sessionAPI.listForInstructor().catch(() => []),
      ]);
      if (requestId !== requestIdRef.current) return;
      setClassrooms(Array.isArray(classroomRes) ? classroomRes : []);
      setAssignments(Array.isArray(assignmentRes) ? assignmentRes : []);
      const sessions = Array.isArray(sessionsRes) ? sessionsRes : [];
      if (sessions.length > 0) {
        const avg = Math.round(
          sessions.reduce((sum: number, s: any) => sum + Number(s?.accuracyScore ?? 0), 0) / sessions.length
        );
        setAvgAccuracy(Number.isFinite(avg) ? avg : null);
      } else {
        setAvgAccuracy(null);
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshDashboard, { intervalMs: 20_000 });

  const totalMembers = classrooms.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  const completedAssignments = assignments.filter(
    (a) => a.status === "completed"
  ).length;
  const completionRate =
    assignments.length > 0
      ? Math.round((completedAssignments / assignments.length) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back, Maestro. Here is your academy's overview."
      />

      <div className="gridCards">
        <div className="card">
          <div className="cardLabel">My Classrooms</div>
          <div className="cardValue">{classrooms.length}</div>
          <div className="pageSubtitle">Active Courses</div>
        </div>
        <div className="card">
          <div className="cardLabel">Total Members</div>
          <div className="cardValue">{totalMembers}</div>
          <div className="pageSubtitle">{totalMembers} enrolled</div>
        </div>
        <div className="card">
          <div className="cardLabel">Active Assignments</div>
          <div className="cardValue">{assignments.length}</div>
          <div className="pageSubtitle">{completionRate}% completion rate</div>
        </div>
        <div className="card">
          <div className="cardLabel">Avg. Class Accuracy</div>
          <div className="cardValue" style={{ fontSize: 20 }}>
            {loading ? "..." : avgAccuracy == null ? "N/A" : `${avgAccuracy}%`}
          </div>
          <div className="pageSubtitle">
            {loading ? "Loading..." : avgAccuracy == null ? "No practice data yet" : "Based on saved sessions"}
          </div>
        </div>
      </div>

      <div className="twoCols">
        <div className="card">
          <div className="sectionTitle">Active Classrooms</div>
          <div className="sectionSub">{classrooms.length} classrooms</div>
          {classrooms.length > 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.06)",
                background: "rgba(255,255,255,.02)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(241,194,75,.10)",
                    border: "1px solid rgba(241,194,75,.22)",
                    display: "grid",
                    placeItems: "center",
                    color: "rgba(241,194,75,.92)",
                    fontWeight: 900,
                  }}
                >
                  {classrooms[0]?.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{classrooms[0]?.name}</div>
                  <div className="pageSubtitle">
                    {classrooms[0]?.studentCount || 0} members
                  </div>
                </div>
              </div>
              <span className="pill">{classrooms[0]?.code}</span>
            </div>
          ) : (
            <div className="pageSubtitle">No classrooms yet</div>
          )}
        </div>

        <div className="card">
          <div className="sectionTitle">Recent Assignments</div>
          <div className="sectionSub">{assignments.length} assignments</div>
          {assignments.length > 0 ? (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.06)",
                background: "rgba(255,255,255,.02)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.06)",
                    display: "grid",
                    placeItems: "center",
                    color: "rgba(216,221,231,.9)",
                    fontWeight: 900,
                  }}
                >
                  {assignments[0]?.musicSheet?.title?.[0]?.toUpperCase() || "?"}
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {assignments[0]?.musicSheet?.title}
                  </div>
                  <div className="pageSubtitle">
                    {assignments[0]?.status || "pending"}
                  </div>
                </div>
              </div>
              <span
                className="pill"
                style={{
                  borderColor: "rgba(126,168,255,.22)",
                  background: "rgba(126,168,255,.10)",
                  color: "rgba(126,168,255,.92)",
                }}
              >
                {assignments[0]?.status || "not_started"}
              </span>
            </div>
          ) : (
            <div className="pageSubtitle">No assignments yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

