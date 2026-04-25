import React from "react";
import { classroomAPI } from "../../api/client";
import { PageHeader } from "../shared/PageHeader";
import { useAutoRefresh } from "../shared/useAutoRefresh";

function formatPracticeMinutes(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function StudentsPage() {
  const [bands, setBands] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await classroomAPI.rosterProgress();
      if (requestId !== requestIdRef.current) return;
      setBands(Array.isArray(res) ? res : []);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err?.message ?? "Failed to load members");
      setBands([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refresh, { intervalMs: 20_000 });

  return (
    <div>
      <PageHeader
        title="ALL MEMBERS"
        subtitle="Members grouped by band with overall progress and practice totals."
      />

      {loading ? <div className="pageSubtitle">Loading members...</div> : null}
      {error ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.92)" }}>
          {error}
        </div>
      ) : null}

      {!loading && !error && bands.length === 0 ? (
        <div className="pageSubtitle">No bands or enrolled members yet.</div>
      ) : null}

      {bands.map((band) => {
        const members = Array.isArray(band?.members) ? (band.members as any[]) : [];
        const bandName = String(band?.classroomName ?? "Band");
        const code = String(band?.code ?? "");

        return (
          <div key={String(band?.classroomId ?? bandName)} style={{ marginTop: 14 }}>
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div className="sectionTitle">{bandName}</div>
                  <div className="pageSubtitle">{members.length} member(s)</div>
                </div>
                {code ? (
                  <div style={{ textAlign: "right" }}>
                    <div className="cardLabel">Join Code</div>
                    <div style={{ fontWeight: 900, letterSpacing: 1 }}>{code}</div>
                  </div>
                ) : null}
              </div>
            </div>

            {members.length > 0 ? (
              <div className="gridCards3">
                {members.map((member) => {
                  const name = String(member?.name ?? "Unknown");
                  const instrument = String(member?.instrument ?? "instrument");
                  const progressPct = clampPct(Number(member?.progress?.progressPct ?? 0));
                  const totalAssignments = Number(member?.progress?.totalAssignments ?? 0);
                  const completed = Number(member?.progress?.completedAssignments ?? 0);
                  const inProgress = Number(member?.progress?.inProgressAssignments ?? 0);
                  const assigned = Number(member?.progress?.assignedAssignments ?? 0);
                  const sessions = Number(member?.practice?.sessions ?? 0);
                  const practiceTimeLabel = formatPracticeMinutes(Number(member?.practice?.totalPracticeSeconds ?? 0));
                  const avgSessionScore = clampPct(Number(member?.practice?.averageSessionScore ?? 0));

                  return (
                    <div key={String(member?.studentId ?? name)} className="card">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 999,
                            background: "rgba(255,255,255,.06)",
                            border: "1px solid rgba(255,255,255,.06)",
                            display: "grid",
                            placeItems: "center",
                            color: "rgba(216,221,231,.9)",
                            fontWeight: 900,
                            textTransform: "uppercase",
                          }}
                        >
                          {name.slice(0, 1) || "?"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {name}
                          </div>
                          <span className="pill" style={{ marginTop: 6 }}>
                            Instrument: {instrument}
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 900 }}>{progressPct}%</div>
                          <div className="pageSubtitle">progress</div>
                        </div>
                      </div>

                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          overflow: "hidden",
                          background: "rgba(255,255,255,.06)",
                          border: "1px solid rgba(255,255,255,.06)",
                        }}
                        aria-label={`Overall progress ${progressPct}%`}
                      >
                        <div style={{ width: `${progressPct}%`, height: "100%", background: "rgba(241,194,75,.85)" }} />
                      </div>

                      <div className="pageSubtitle" style={{ marginTop: 10 }}>
                        Assignments: {completed} completed - {inProgress} in progress - {assigned} not started
                        {totalAssignments > 0 ? ` (${totalAssignments} total)` : ""}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
                        <div
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,.06)",
                            background: "rgba(255,255,255,.02)",
                          }}
                        >
                          <div className="cardLabel">Practice Time</div>
                          <div className="cardValue" style={{ fontSize: 18 }}>
                            {practiceTimeLabel}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,.06)",
                            background: "rgba(255,255,255,.02)",
                          }}
                        >
                          <div className="cardLabel">Sessions</div>
                          <div className="cardValue" style={{ fontSize: 18 }}>
                            {sessions}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: 10,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,.06)",
                            background: "rgba(255,255,255,.02)",
                          }}
                        >
                          <div className="cardLabel">Avg Score</div>
                          <div className="cardValue" style={{ fontSize: 18 }}>
                            {avgSessionScore}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="emptyState" style={{ height: 120 }}>
                No enrolled members yet
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
