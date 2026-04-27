import React from "react";
import { PageHeader } from "../../shared/PageHeader";
import { sessionAPI } from "../../../api/client";
import { buildStudentAnalyticsSummary } from "./studentAnalytics.utils";
import { useAutoRefresh } from "../../shared/useAutoRefresh";

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function toLocalDayKey(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "unknown";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function StudentAnalyticsPage() {
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectedSongKey, setSelectedSongKey] = React.useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = React.useState<string | null>(null);
  const [isKpiHelpOpen, setIsKpiHelpOpen] = React.useState(false);
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
      const result = await sessionAPI.list();
      if (requestId !== requestIdRef.current) return;
      setSessions(Array.isArray(result) ? result : []);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err?.message ?? "Failed to load analytics");
      setSessions([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshSessions, { intervalMs: 30_000 });

  const normalizedSessions = React.useMemo(() => {
    const rows = Array.isArray(sessions) ? sessions : [];
    return rows
      .map((row) => {
        const accuracy = clampPct(Number(row?.accuracyScore ?? 0));
        const timing = clampPct(Number(row?.timingScore ?? 0));
        const score = clampPct(Math.round((accuracy + timing) / 2));
        const completedAtMs = row?.completedAt ? new Date(String(row.completedAt)).getTime() : 0;
        return {
          ...row,
          accuracyScore: accuracy,
          timingScore: timing,
          score,
          completedAtMs: Number.isFinite(completedAtMs) ? completedAtMs : 0,
        };
      })
      .sort((a, b) => Number(b.completedAtMs ?? 0) - Number(a.completedAtMs ?? 0));
  }, [sessions]);

  const summary = React.useMemo(() => buildStudentAnalyticsSummary(normalizedSessions), [normalizedSessions]);

  const songs = React.useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        title: string;
        artist: string;
        sessionsAsc: Array<any>;
        lastCompletedAtMs: number;
      }
    >();

    for (const row of normalizedSessions) {
      const title = String(row?.assignmentTitle ?? "Untitled Piece").trim() || "Untitled Piece";
      const artist = String(row?.assignmentArtist ?? "Unknown artist").trim() || "Unknown artist";
      const key = `${title}::${artist}`;
      const existing =
        map.get(key) ??
        ({
          key,
          title,
          artist,
          sessionsAsc: [],
          lastCompletedAtMs: 0,
        } as const);

      const nextLast = Math.max(Number(existing.lastCompletedAtMs ?? 0), Number(row.completedAtMs ?? 0));
      map.set(key, {
        ...existing,
        sessionsAsc: [...existing.sessionsAsc, row],
        lastCompletedAtMs: Number.isFinite(nextLast) ? nextLast : Number(existing.lastCompletedAtMs ?? 0),
      });
    }

    return Array.from(map.values())
      .map((song) => {
        const sessionsAsc = song.sessionsAsc.slice().sort((a, b) => Number(a.completedAtMs ?? 0) - Number(b.completedAtMs ?? 0));
        const sessionsWithDeltaAsc = sessionsAsc.map((session, idx) => {
          const prev = idx > 0 ? sessionsAsc[idx - 1] : null;
          const delta = prev ? Number(session.score ?? 0) - Number(prev.score ?? 0) : null;
          return { ...session, delta };
        });
        return {
          ...song,
          sessionsAsc: sessionsWithDeltaAsc,
          sessionsDesc: sessionsWithDeltaAsc.slice().sort((a, b) => Number(b.completedAtMs ?? 0) - Number(a.completedAtMs ?? 0)),
          sessions: sessionsWithDeltaAsc.length,
        };
      })
      .sort((a, b) => Number(b.lastCompletedAtMs ?? 0) - Number(a.lastCompletedAtMs ?? 0) || a.title.localeCompare(b.title));
  }, [normalizedSessions]);

  React.useEffect(() => {
    setSelectedSongKey(null);
    setSelectedDayKey(null);
  }, []);

  React.useEffect(() => {
    // Clear selection when sessions refresh significantly.
    setSelectedDayKey(null);
  }, [sessions.length]);

  React.useEffect(() => {
    if (selectedSongKey) return;
    if (songs.length === 0) return;
    setSelectedSongKey(songs[0]!.key);
  }, [selectedSongKey, songs]);

  const selectedSong = React.useMemo(() => {
    if (!selectedSongKey) return null;
    return songs.find((song) => song.key === selectedSongKey) ?? null;
  }, [songs, selectedSongKey]);

  React.useEffect(() => {
    // Clear day filter when switching songs.
    setSelectedDayKey(null);
  }, [selectedSongKey]);

  const selectedSongDailySeries = React.useMemo(() => {
    const sessionsAsc = selectedSong?.sessionsAsc ?? [];
    if (sessionsAsc.length === 0) return [];

    const byDay = new Map<string, { dayKey: string; scoreSum: number; count: number }>();
    for (const s of sessionsAsc) {
      const ms = Number(s?.completedAtMs ?? 0);
      const dayKey = toLocalDayKey(ms);
      const entry = byDay.get(dayKey) ?? { dayKey, scoreSum: 0, count: 0 };
      entry.scoreSum += Number(s?.score ?? 0);
      entry.count += 1;
      byDay.set(dayKey, entry);
    }

    return Array.from(byDay.values())
      .map((d) => ({ dayKey: d.dayKey, scoreAvg: d.count > 0 ? Math.round(d.scoreSum / d.count) : 0, count: d.count }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [selectedSong?.sessionsAsc]);

  const selectedSongSessionsForDay = React.useMemo(() => {
    if (!selectedDayKey) return [];
    const sessionsDesc = selectedSong?.sessionsDesc ?? [];
    return sessionsDesc
      .filter((session) => {
        const ms = Number(session?.completedAtMs ?? 0);
        return toLocalDayKey(ms) === selectedDayKey;
      })
      .slice(0, 100);
  }, [selectedDayKey, selectedSong?.sessionsDesc]);

  const songTrend = React.useMemo(() => {
    const series = selectedSongDailySeries;
    if (series.length === 0) return { delta: 0, hasDelta: false };
    const first = series[0]?.scoreAvg ?? 0;
    const last = series[series.length - 1]?.scoreAvg ?? 0;
    return { delta: last - first, hasDelta: series.length > 1 };
  }, [selectedSongDailySeries]);

  const selectedSongChart = React.useMemo(() => {
    const series = selectedSongDailySeries;
    if (!selectedSong || series.length === 0) return null;

    const w = 760;
    const h = 260;
    const padL = 42;
    const padR = 12;
    const padT = 14;
    const padB = 110;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);

    const values = series.map((d) => Number(d.scoreAvg ?? 0)).filter((n) => Number.isFinite(n));
    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 0;
    const yMin = Math.max(0, Math.min(100, Math.floor(rawMin - 2)));
    const yMax = Math.max(yMin + 1, Math.min(100, Math.ceil(rawMax + 2)));

    const xForIndex = (idx: number) => padL + (series.length <= 1 ? plotW / 2 : (idx / (series.length - 1)) * plotW);
    const yForValue = (v: number) => {
      const t = (v - yMin) / Math.max(1e-6, yMax - yMin);
      return padT + (1 - t) * plotH;
    };

    const points = series.map((d, idx) => {
      const x = xForIndex(idx);
      const y = yForValue(Number(d.scoreAvg ?? 0));
      return { x, y, dayKey: d.dayKey, score: Number(d.scoreAvg ?? 0), count: Number(d.count ?? 0) };
    });

    const path = points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const yTicks = [yMax, Math.round((yMin + yMax) / 2), yMin].filter((v, i, arr) => arr.indexOf(v) === i);
    const xLabels = points.map((p, idx) => ({ idx, label: p.dayKey }));
    const rotateXLabels = true;
    const xLabelY = h - 12;

    const selectedPoint = selectedDayKey ? points.find((p) => p.dayKey === selectedDayKey) ?? null : null;

    return (
      <div
        style={{
          marginTop: 10,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,.06)",
          background: "rgba(255,255,255,.02)",
          padding: 10,
        }}
      >
        <div className="pageSubtitle" style={{ marginTop: 0, fontWeight: 900 }}>
          Daily score trend (avg per day)
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="260" role="img" aria-label="Daily score trend line graph">
          <rect x="0" y="0" width={w} height={h} fill="transparent" />

          {yTicks.map((tick) => {
            const y = yForValue(tick);
            return (
              <g key={`y-${tick}`}>
                <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(216,221,231,.10)" strokeWidth="1" />
                <text
                  x={padL - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="rgba(216,221,231,.55)"
                  fontSize="11"
                  fontWeight={800}
                >
                  {tick}
                </text>
              </g>
            );
          })}

          <path d={path} fill="none" stroke="rgba(241,194,75,.92)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p) => (
            <g key={p.dayKey} onClick={() => setSelectedDayKey((prev) => (prev === p.dayKey ? null : p.dayKey))} style={{ cursor: "pointer" }}>
              <circle
                cx={p.x}
                cy={p.y}
                r={selectedDayKey === p.dayKey ? "6" : "4"}
                fill="rgba(241,194,75,.92)"
                stroke={selectedDayKey === p.dayKey ? "rgba(241,194,75,.40)" : "transparent"}
                strokeWidth={selectedDayKey === p.dayKey ? "8" : "0"}
              />
              <title>{`${p.dayKey}: ${p.score}% (${p.count} session(s))`}</title>
            </g>
          ))}

          {xLabels.map((x) => {
            const p = points[x.idx];
            if (!p) return null;
            const labelX = clamp(p.x, padL + 34, w - padR - 34);
            return (
              <text
                key={`x-${x.idx}`}
                x={labelX}
                y={xLabelY}
                textAnchor="start"
                fill="rgba(216,221,231,.65)"
                fontSize="10"
                fontWeight={800}
                transform={`rotate(-65 ${labelX} ${xLabelY})`}
              >
                {x.label}
              </text>
            );
          })}
        </svg>
        {selectedPoint ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "2px solid rgba(167,139,250,.85)",
              color: "rgba(241,194,75,.92)",
              fontWeight: 900,
            }}
          >
            Overall Score Per Day: {Math.round(selectedPoint.score)}% ({selectedPoint.count}{" "}
            {selectedPoint.count === 1 ? "Session" : "Sessions"})
          </div>
        ) : null}
      </div>
    );
  }, [selectedSong, selectedSongDailySeries, selectedDayKey]);

  return (
    <div>
      <PageHeader
        title="Practice Analytics"
        subtitle="Track your progress and performance over time."
        right={
          <button
            type="button"
            className="ghostBtn"
            aria-label="How are these analytics computed?"
            title="How are these analytics computed?"
            style={{ width: 40, height: 40, padding: 0, borderRadius: 999, display: "grid", placeItems: "center" }}
            onClick={() => setIsKpiHelpOpen(true)}
          >
            ?
          </button>
        }
      />

      {isKpiHelpOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Analytics Computation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsKpiHelpOpen(false);
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">How these numbers are calculated</div>
                <div className="modalSub">Based on your saved practice sessions.</div>
              </div>
              <button type="button" className="modalClose" aria-label="Close" onClick={() => setIsKpiHelpOpen(false)}>
                X
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10, fontSize: 12, color: "rgba(216,221,231,.85)" }}>
              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Total Sessions</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Count of your saved practice sessions.
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Average Accuracy</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Average of all session accuracy scores (in %).
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Average Timing</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Average of all session timing scores (in %).
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Average Score</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Uses Accuracy and Timing across all sessions:
                </div>
                <div className="pageSubtitle" style={{ marginTop: 6 }}>
                  Average Score = round( (sum Accuracy + sum Timing) / (2 × total sessions) )
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Note Hit Rate</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Note Hit Rate = round( (total correct notes ÷ total notes) × 100 )
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Practice Time</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Total time practiced = sum of session durations (formatted as minutes/hours).
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>Last 7 Days</div>
                <div className="pageSubtitle" style={{ marginTop: 2 }}>
                  Sessions counted within 7 days of your most recent saved session.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="pageSubtitle">Loading analytics...</div> : null}
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
          <div className="cardLabel">Average Score</div>
          <div className="cardValue">{summary.kpis.averageScore}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Average Accuracy</div>
          <div className="cardValue">{summary.kpis.averageAccuracy}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Average Timing</div>
          <div className="cardValue">{summary.kpis.averageTiming}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Practice Time</div>
          <div className="cardValue">{summary.kpis.totalPracticeTimeLabel}</div>
        </div>
        <div className="card">
          <div className="cardLabel">Note Hit Rate</div>
          <div className="cardValue">{summary.kpis.noteHitRate}%</div>
        </div>
        <div className="card">
          <div className="cardLabel">Last 7 Days</div>
          <div className="cardValue">{summary.kpis.sessionsLast7Days}</div>
          <div className="pageSubtitle">{summary.kpis.practiceTimeLast7DaysLabel} practiced</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }} className="card">
        <div className="sectionTitle">Recent Practice Sessions</div>
        <div className="sectionSub">
          Last 5 sessions avg {summary.scoreTrend.recentAverage}%{" "}
          {summary.scoreTrend.previousAverage > 0 ? (
            <span>
              ({summary.scoreTrend.delta >= 0 ? "+" : ""}
              {summary.scoreTrend.delta}% vs previous)
            </span>
          ) : null}
        </div>
        {summary.recentSessions.length > 0 ? (
          <div className="scrollList" style={{ marginTop: 10 }}>
            {summary.recentSessions.map((session) => {
              const completedAtLabel = session?.completedAt ? new Date(String(session.completedAt)).toLocaleString() : "Unknown date";
              const hitsLabel =
                Number(session?.totalNotes ?? 0) > 0 ? `${session.correctNotes ?? 0}/${session.totalNotes ?? 0}` : "-";
              const sessionScore = clampPct(
                Math.round((Number(session?.accuracyScore ?? 0) + Number(session?.timingScore ?? 0)) / 2)
              );

              return (
                <div
                  key={session.id}
                  style={{
                    padding: 10,
                    borderBottom: "1px solid rgba(255,255,255,.06)",
                    display: "grid",
                    gridTemplateColumns: "2fr repeat(5, minmax(0, 1fr))",
                    gap: 10,
                    fontSize: 12,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {session.assignmentTitle ?? "Untitled Piece"}
                    </div>
                    <div className="pageSubtitle" style={{ marginTop: 2 }}>
                      {session.assignmentArtist ?? "Unknown artist"} · {completedAtLabel}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{session.accuracyScore}%</div>
                    <div className="pageSubtitle">Accuracy</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{session.timingScore}%</div>
                    <div className="pageSubtitle">Timing</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{hitsLabel}</div>
                    <div className="pageSubtitle">Hits</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{sessionScore}%</div>
                    <div className="pageSubtitle">Score</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{session.assignmentStatus ?? "saved"}</div>
                    <div className="pageSubtitle">Assignment</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="emptyState" style={{ height: 140, marginTop: 10 }}>
            No practice data yet
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }} className="card">
          <div className="sectionTitle">Timing Consistency</div>
          <div className="sectionSub">
            Perfect, early, and late note timing from your saved sessions
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

      <div style={{ marginTop: 14 }} className="card">
        <div className="sectionTitle">My Practice Sessions</div>
        <div className="sectionSub">Select a song to review your improvement over time.</div>

        {songs.length > 0 ? (
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            <div>
              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                Songs
              </div>
              <div className="scrollList" style={{ display: "grid", gap: 10, marginTop: 10, maxHeight: 260 }}>
                {songs.map((song) => {
                  const lastLabel = song.lastCompletedAtMs
                    ? new Date(song.lastCompletedAtMs).toLocaleDateString()
                    : "-";
                  const isActive = selectedSongKey === song.key;
                  return (
                    <button
                      key={song.key}
                      type="button"
                      onClick={() => setSelectedSongKey(song.key)}
                      className="ghostBtn"
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${isActive ? "rgba(241,194,75,.26)" : "rgba(255,255,255,.06)"}`,
                        background: "rgba(255,255,255,.02)",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "rgba(241,194,75,.92)",
                          }}
                        >
                          {song.title}
                        </div>
                        <div className="pageSubtitle" style={{ marginTop: 2 }}>
                          {song.artist}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>{song.sessions}</div>
                        <div className="pageSubtitle" style={{ marginTop: 0 }}>
                          sessions · {lastLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedSong ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>{selectedSong.title}</div>
                    <div className="pageSubtitle" style={{ marginTop: 2 }}>
                      {selectedSong.artist} · {selectedSong.sessions} session(s)
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>
                      {songTrend.hasDelta ? `${songTrend.delta >= 0 ? "+" : ""}${songTrend.delta}` : "-"}
                    </div>
                    <div className="pageSubtitle" style={{ marginTop: 0 }}>
                      overall Δ
                    </div>
                  </div>
                </div>

                {selectedSongChart}

                <div className="pageSubtitle" style={{ marginTop: 12 }}>
                  Sessions for this song
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div className="pageSubtitle" style={{ marginTop: 0 }}>
                    {selectedDayKey ? `Selected day: ${selectedDayKey}` : "Click a point in the chart to view sessions for that day"}
                  </div>
                  {selectedDayKey ? (
                    <button type="button" className="ghostBtn ghostBtnGold actionBtnSm" onClick={() => setSelectedDayKey(null)}>
                      Show all days
                    </button>
                  ) : null}
                </div>

                {selectedDayKey ? (
                  selectedSongSessionsForDay.length > 0 ? (
                    <div className="scrollList" style={{ display: "grid", gap: 10, marginTop: 10, maxHeight: 260 }}>
                      {selectedSongSessionsForDay.map((session, idx) => {
                        const completedAtLabel = session?.completedAt
                          ? new Date(String(session.completedAt)).toLocaleString()
                          : "Unknown date";
                        const delta =
                          typeof session?.delta === "number" && Number.isFinite(session.delta) ? session.delta : null;
                        const deltaLabel = delta == null ? "-" : `${delta >= 0 ? "+" : ""}${delta}`;

                        return (
                          <div
                            key={String(session?.id ?? `${selectedSong.key}:${idx}`)}
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,.06)",
                              background: "rgba(255,255,255,.02)",
                              display: "grid",
                              gridTemplateColumns: "2fr repeat(4, minmax(0, 1fr))",
                              gap: 10,
                              alignItems: "center",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                {completedAtLabel}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{session.accuracyScore}%</div>
                              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                Accuracy
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{session.timingScore}%</div>
                              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                Timing
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{session.score}%</div>
                              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                Score
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{deltaLabel}</div>
                              <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                Δ vs prev
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="emptyState" style={{ height: 120, marginTop: 10 }}>
                      No sessions found for {selectedDayKey}
                    </div>
                  )
                ) : (
                  <div className="emptyState" style={{ height: 120, marginTop: 10 }}>
                    Select a day from the chart to view sessions.
                  </div>
                )}
              </div>
            ) : (
              <div className="emptyState" style={{ height: 120 }}>
                Select a song to view details.
              </div>
            )}
          </div>
        ) : (
          <div className="emptyState" style={{ height: 140, marginTop: 10 }}>
            No practice data yet
          </div>
        )}
      </div>
    </div>
  );
}
