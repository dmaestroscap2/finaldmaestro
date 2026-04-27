import React, { useEffect } from "react";
import { PageHeader } from "../shared/PageHeader";
import { classroomAPI, sessionAPI } from "../../api/client";
import { useAutoRefresh } from "../shared/useAutoRefresh";

type Classroom = {
  id: number;
  name: string;
  code: string;
};

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

export function ClassroomsPage() {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<number | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [classroomName, setClassroomName] = React.useState("");
  const [classrooms, setClassrooms] = React.useState<Classroom[]>([]);
  const [rosterBands, setRosterBands] = React.useState<any[]>([]);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [memberRemoveLoadingId, setMemberRemoveLoadingId] = React.useState<number | null>(null);
  const [selectedMember, setSelectedMember] = React.useState<{ studentId: number; name: string } | null>(null);
  const [selectedSongKey, setSelectedSongKey] = React.useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = React.useState<string | null>(null);
  const [instructorSessions, setInstructorSessions] = React.useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);
  const [sessionsError, setSessionsError] = React.useState("");

  const refreshClassrooms = React.useCallback(async () => {
    try {
      const [res, roster] = await Promise.all([classroomAPI.list(), classroomAPI.rosterProgress().catch(() => [])]);
      const next = Array.isArray(res) ? (res as any[]) : [];
      setClassrooms(next);
      setRosterBands(Array.isArray(roster) ? roster : []);
      setActiveId((prev) => {
        if (next.length === 0) return null;
        if (prev != null && next.some((classroom) => classroom.id === prev)) return prev;
        return next[0]!.id;
      });
    } catch (error) {
      console.error("Failed to load classrooms:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(refreshClassrooms, { intervalMs: 20_000 });

  const refreshInstructorSessions = React.useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const rows = await sessionAPI.listForInstructor();
      setInstructorSessions(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      setInstructorSessions([]);
      setSessionsError(error?.message ?? "Failed to load practice sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedMember) return;
    if (sessionsLoading) return;
    if (instructorSessions.length > 0) return;
    void refreshInstructorSessions();
  }, [selectedMember, instructorSessions.length, sessionsLoading, refreshInstructorSessions]);

  const handleSaveClassroom = async () => {
    if (!classroomName.trim()) {
      alert("Please enter a classroom name");
      return;
    }

    setCreateLoading(true);
    try {
      if (isEditOpen && editId != null) {
        await classroomAPI.update(editId, classroomName);
      } else {
        await classroomAPI.create(classroomName);
      }
      await refreshClassrooms();
      setClassroomName("");
      setIsCreateOpen(false);
      setIsEditOpen(false);
      setEditId(null);
    } catch (error: any) {
      alert("Failed to create classroom: " + error.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const active = classrooms.find((c) => c.id === activeId) ?? classrooms[0];

  const selectedMemberSessions = React.useMemo(() => {
    if (!selectedMember) return [];
    const activeClassroomId = Number(active?.id ?? 0);
    return instructorSessions
      .filter((row) => Number(row?.studentId ?? 0) === selectedMember.studentId)
      .filter((row) => (activeClassroomId > 0 ? Number(row?.classroomId ?? 0) === activeClassroomId : true))
      .map((row) => {
        const accuracy = Math.max(0, Math.min(100, Math.round(Number(row?.accuracyScore ?? 0))));
        const timing = Math.max(0, Math.min(100, Math.round(Number(row?.timingScore ?? 0))));
        const score = Math.round((accuracy + timing) / 2);
        const completedAtMs = row?.completedAt ? new Date(String(row.completedAt)).getTime() : 0;
        return {
          ...row,
          accuracyScore: accuracy,
          timingScore: timing,
          score,
          completedAtMs: Number.isFinite(completedAtMs) ? completedAtMs : 0,
        };
      })
      .sort((a, b) => a.completedAtMs - b.completedAtMs);
  }, [selectedMember, instructorSessions, active?.id]);

  const selectedMemberSongs = React.useMemo(() => {
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

    for (const row of selectedMemberSessions) {
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
      const next = {
        ...existing,
        sessionsAsc: [...existing.sessionsAsc, row],
        lastCompletedAtMs: Number.isFinite(nextLast) ? nextLast : Number(existing.lastCompletedAtMs ?? 0),
      };
      map.set(key, next);
    }

    const out = Array.from(map.values())
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

    return out;
  }, [selectedMemberSessions]);

  React.useEffect(() => {
    setSelectedSongKey(null);
  }, [selectedMember?.studentId, active?.id]);

  React.useEffect(() => {
    if (!selectedMember) return;
    if (selectedSongKey) return;
    if (selectedMemberSongs.length === 0) return;
    setSelectedSongKey(selectedMemberSongs[0]!.key);
  }, [selectedMember, selectedSongKey, selectedMemberSongs]);

  const selectedSong = React.useMemo(() => {
    if (!selectedSongKey) return null;
    return selectedMemberSongs.find((song) => song.key === selectedSongKey) ?? null;
  }, [selectedMemberSongs, selectedSongKey]);

  const selectedSongDailySeries = React.useMemo(() => {
    const sessions = selectedSong?.sessionsAsc ?? [];
    if (sessions.length === 0) return [];

    const byDay = new Map<string, { dayKey: string; scoreSum: number; count: number }>();
    for (const s of sessions) {
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

  const selectedSongSessionsDesc = React.useMemo(() => {
    return (selectedSong?.sessionsDesc ?? []).slice(0, 50);
  }, [selectedSong?.sessionsDesc]);

  const selectedSongSessionsForDay = React.useMemo(() => {
    if (!selectedDayKey) return [];
    const sessions = selectedSong?.sessionsDesc ?? [];
    return sessions
      .filter((session) => {
        const ms = Number(session?.completedAtMs ?? 0);
        const key = toLocalDayKey(ms);
        return key === selectedDayKey;
      })
      .slice(0, 100);
  }, [selectedSong?.sessionsDesc, selectedDayKey]);

  const scoreTrend = React.useMemo(() => {
    const series = selectedSongDailySeries;
    if (series.length === 0) return { delta: 0, hasDelta: false };
    const first = series[0]?.scoreAvg ?? 0;
    const last = series[series.length - 1]?.scoreAvg ?? 0;
    return { delta: last - first, hasDelta: series.length > 1 };
  }, [selectedSongDailySeries]);

  React.useEffect(() => {
    // Clear day filter when switching songs/members/classroom.
    setSelectedDayKey(null);
  }, [selectedSongKey, selectedMember?.studentId, active?.id]);

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
            <g
              key={p.dayKey}
              onClick={() => setSelectedDayKey((prev) => (prev === p.dayKey ? null : p.dayKey))}
              style={{ cursor: "pointer" }}
            >
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

  const openCreate = () => {
    setClassroomName("");
    setIsEditOpen(false);
    setEditId(null);
    setIsCreateOpen(true);
  };

  const openEdit = (c: Classroom) => {
    setClassroomName(c.name);
    setIsCreateOpen(false);
    setEditId(c.id);
    setIsEditOpen(true);
  };

  const openDelete = (c: Classroom) => {
    setDeleteId(c.id);
    setIsDeleteOpen(true);
  };

  const handleRemoveMember = async (studentId: number, studentName: string) => {
    if (!active?.id) return;
    const ok = window.confirm(`Remove ${studentName} from "${active.name}"?`);
    if (!ok) return;

    setMemberRemoveLoadingId(studentId);
    try {
      await classroomAPI.removeMember(Number(active.id), studentId);
      await refreshClassrooms();
    } catch (error: any) {
      alert("Failed to remove member: " + (error?.message ?? String(error)));
    } finally {
      setMemberRemoveLoadingId(null);
    }
  };

  const handleDeleteClassroom = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await classroomAPI.remove(deleteId);
      await refreshClassrooms();
      setIsDeleteOpen(false);
      setDeleteId(null);
    } catch (error: any) {
      alert("Failed to delete classroom: " + error.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Classrooms"
        subtitle="Manage your class and enrolled members."
        right={
          <button className="primaryBtn" type="button" style={{ width: 170 }} onClick={openCreate}>
            + Create Bandroom
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        {loading ? (
          <div className="pageSubtitle">Loading classrooms...</div>
        ) : classrooms.length > 0 ? (
          classrooms.map((c) => {
            const band = rosterBands.find((b) => Number(b?.classroomId ?? 0) === c.id) ?? null;
            const members = Array.isArray(band?.members) ? (band.members as any[]) : [];
            const bandPct =
              typeof (band as any)?.progress?.progressPct === "number"
                ? Number((band as any).progress.progressPct)
                : members.length > 0
                  ? Math.round(
                      members.reduce((sum, m) => sum + clampPct(Number(m?.progress?.progressPct ?? 0)), 0) / members.length
                    )
                  : 0;

            return (
              <div
                key={c.id}
                className="card"
                style={{
                  outline: c.id === activeId ? "1px solid rgba(241,194,75,.22)" : "1px solid transparent",
                }}
                onClick={() => setActiveId(c.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{c.name}</div>
                    <div className="pageSubtitle">
                      Code:{" "}
                      <span style={{ color: "rgba(241,194,75,.92)", fontWeight: 900 }}>
                        {c.code}
                      </span>
                      <button
                        type="button"
                        className="iconBtn"
                        aria-label="Copy classroom code"
                        style={{ marginLeft: 10 }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await navigator.clipboard.writeText(String(c.code ?? ""));
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <div className="pageSubtitle">{members.length} enrolled member(s)</div>
                  </div>

                  <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ghostBtn ghostBtnGold actionBtn"
                        aria-label="Edit classroom"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(c);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghostBtn ghostBtnGold actionBtn"
                        aria-label="Delete classroom"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDelete(c);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <div className="pageSubtitle" style={{ marginTop: 0 }}>
                        BAND OVERALL PROGRESS
                      </div>
                      <div
                        style={{
                          width: 160,
                          height: 8,
                          borderRadius: 999,
                          background: "rgba(255,255,255,.06)",
                          border: "1px solid rgba(255,255,255,.06)",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ width: `${clampPct(bandPct)}%`, height: "100%", background: "rgba(241,194,75,.85)" }} />
                      </div>
                      <div className="pageSubtitle">{clampPct(bandPct)}%</div>
                    </div>
                  </div>
                </div>

                <div className="pageSubtitle" style={{ marginTop: 18, letterSpacing: ".14em" }}>
                  ENROLLED MEMBERS
                </div>

                {members.length > 0 ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {(() => {
                      const selectedId = Number(selectedMember?.studentId ?? 0);
                      const selectedRow =
                        selectedId > 0
                          ? members.find((m) => Number(m?.studentId ?? m?.id ?? 0) === selectedId) ?? null
                          : null;
                      const visibleMembers = selectedRow ? [selectedRow] : members;

                      return (
                        <>
                          <div className="scrollList" style={{ display: "grid", gap: 10, maxHeight: 360 }}>
                            {visibleMembers.map((m) => {
                              const name = String(m?.name ?? "Unknown");
                              const instrument = String(m?.instrument ?? "").trim();
                              const pct = clampPct(Number(m?.progress?.progressPct ?? 0));
                              const studentId = Number(m?.studentId ?? m?.id ?? 0);
                              return (
                                <button
                                  key={String(m?.studentId ?? name)}
                                  type="button"
                                  style={{
                                    width: "100%",
                                    textAlign: "left",
                                    color: "rgba(216,221,231,.9)",
                                    padding: 12,
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,.06)",
                                    background: "rgba(255,255,255,.02)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    cursor: Number.isFinite(studentId) && studentId > 0 ? "pointer" : "default",
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!Number.isFinite(studentId) || studentId <= 0) return;
                                    setActiveId(c.id);
                                    setSelectedMember({ studentId, name });
                                    void refreshInstructorSessions();
                                  }}
                                >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
                                  textTransform: "uppercase",
                                  flexShrink: 0,
                                }}
                              >
                                {name.slice(0, 1) || "?"}
                              </div>
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
                                  {name}
                                </div>
                                {instrument ? (
                                  <div className="pageSubtitle" style={{ marginTop: 2 }}>
                                    Instrument: {instrument}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                              <div className="pageSubtitle" style={{ fontWeight: 900 }}>
                                PROGRESS
                              </div>
                              <div
                                style={{
                                  width: 220,
                                  height: 8,
                                  borderRadius: 999,
                                  background: "rgba(255,255,255,.06)",
                                  border: "1px solid rgba(255,255,255,.06)",
                                  overflow: "hidden",
                                }}
                              >
                                <div style={{ width: `${pct}%`, height: "100%", background: "rgba(241,194,75,.85)" }} />
                              </div>
                              <div className="pageSubtitle">{pct}%</div>
                            </div>
                                </button>
                              );
                            })}
                          </div>

                          {selectedRow ? (
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="ghostBtn ghostBtnGold actionBtnSm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedMember(null);
                                }}
                              >
                                Back to all members
                              </button>
                              <button
                                type="button"
                                className="ghostBtn ghostBtnGold actionBtnSm"
                                disabled={memberRemoveLoadingId != null || !Number.isFinite(selectedId) || selectedId <= 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!Number.isFinite(selectedId) || selectedId <= 0) return;
                                  void handleRemoveMember(selectedId, String(selectedRow?.name ?? selectedMember?.name ?? "Member"));
                                }}
                              >
                                {memberRemoveLoadingId === selectedId ? "Removing..." : "Remove"}
                              </button>
                            </div>
                          ) : null}

                          {selectedRow ? (
                            <div style={{ marginTop: 10 }}>
                              <div className="pageSubtitle" style={{ marginTop: 0, letterSpacing: ".14em" }}>
                                MEMBER PRACTICE SESSIONS
                              </div>
                              {sessionsError ? (
                                <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.92)" }}>
                                  {sessionsError}
                                </div>
                              ) : sessionsLoading ? (
                                <div className="pageSubtitle">Loading practice sessions...</div>
                              ) : selectedMemberSongs.length > 0 ? (
                                <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                                  <div>
                                    <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                      Songs
                                    </div>
                                    <div className="scrollList" style={{ display: "grid", gap: 10, maxHeight: 220 }}>
                                      {selectedMemberSongs.map((song) => {
                                        const isActive = selectedSongKey === song.key;
                                        const lastLabel = song.lastCompletedAtMs
                                          ? new Date(song.lastCompletedAtMs).toLocaleDateString()
                                          : "-";
                                        return (
                                          <button
                                            key={song.key}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedSongKey(song.key);
                                            }}
                                            style={{
                                              width: "100%",
                                              textAlign: "left",
                                              color: "rgba(216,221,231,.9)",
                                              padding: 12,
                                              borderRadius: 12,
                                              border: `1px solid ${isActive ? "rgba(241,194,75,.34)" : "rgba(255,255,255,.06)"}`,
                                              background: isActive ? "rgba(241,194,75,.08)" : "rgba(255,255,255,.02)",
                                              display: "flex",
                                              justifyContent: "space-between",
                                              gap: 10,
                                              cursor: "pointer",
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
                                          <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>
                                            {selectedSong.title}
                                          </div>
                                          <div className="pageSubtitle" style={{ marginTop: 2 }}>
                                            {selectedSong.artist} · {selectedSong.sessions} session(s)
                                          </div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                          <div style={{ fontWeight: 900, color: "rgba(241,194,75,.92)" }}>
                                            {scoreTrend.hasDelta ? `${scoreTrend.delta >= 0 ? "+" : ""}${scoreTrend.delta}` : "-"}
                                          </div>
                                          <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                            overall Δ
                                          </div>
                                        </div>
                                      </div>

                                      {/* Line graph is rendered below */}
                                      {selectedSongChart}

                                      <div className="pageSubtitle" style={{ marginTop: 12 }}>
                                        Sessions for this song
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                                        <div className="pageSubtitle" style={{ marginTop: 0 }}>
                                          {selectedDayKey ? `Selected day: ${selectedDayKey}` : "Click a point in the chart to view sessions for that day"}
                                        </div>
                                        {selectedDayKey ? (
                                          <button
                                            type="button"
                                            className="ghostBtn ghostBtnGold actionBtnSm"
                                            onClick={() => setSelectedDayKey(null)}
                                          >
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
                                                  key={String(session?.id ?? `${selectedId}:${idx}`)}
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
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="emptyState" style={{ height: 120, marginTop: 10 }}>
                                  No practice sessions yet for {selectedMember?.name ?? "this member"}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="emptyState" style={{ height: 100, marginTop: 10 }}>
                    No enrolled members yet
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="pageSubtitle">No classrooms created yet</div>
        )}
      </div>

      {isDeleteOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Delete Classroom"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsDeleteOpen(false);
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">Delete Classroom</div>
                <div className="modalSub">This will remove the classroom from the list.</div>
              </div>
              <button type="button" className="modalClose" aria-label="Close" onClick={() => setIsDeleteOpen(false)}>
                X
              </button>
            </div>

            <div className="modalActions" style={{ gap: 10 }}>
              <button
                type="button"
                className="signOutBtn"
                style={{ width: "auto", marginTop: 0 }}
                onClick={() => setIsDeleteOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="modalPrimary" onClick={handleDeleteClassroom} disabled={deleteLoading}>
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateOpen || isEditOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label={isEditOpen ? "Edit Classroom" : "Create New Classroom"}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreateOpen(false);
              setIsEditOpen(false);
            }
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div>
                <div className="modalTitle">{isEditOpen ? "Edit Classroom" : "Create New Classroom"}</div>
                <div className="modalSub">{isEditOpen ? "Update your classroom name." : "Give your new class a name."}</div>
              </div>
              <button
                type="button"
                className="modalClose"
                aria-label="Close"
                onClick={() => {
                  setIsCreateOpen(false);
                  setIsEditOpen(false);
                  setEditId(null);
                }}
              >
                X
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                className="input"
                value={classroomName}
                onChange={(e) => setClassroomName(e.target.value)}
                placeholder="e.g. Jazz Advanced"
              />
            </div>

            <div className="modalActions">
              <button type="button" className="modalPrimary" onClick={handleSaveClassroom} disabled={createLoading}>
                {createLoading ? "Saving..." : editId != null && isEditOpen ? "Save Changes" : "Create Class"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
