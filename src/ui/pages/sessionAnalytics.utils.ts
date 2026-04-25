import { extractSessionPerformanceEvents, summariseTiming, summariseTroubleNotes } from "./analyticsPerformance.utils";

export type InstructorAnalyticsSession = {
  id: number;
  studentId?: number | null;
  studentName?: string | null;
  classroomId?: number | null;
  classroomName?: string | null;
  accuracyScore?: number | null;
  timingScore?: number | null;
  totalNotes?: number | null;
  correctNotes?: number | null;
  wrongNotes?: number | null;
  missedNotes?: number | null;
  duration?: number | null;
  completedAt?: string | number | Date | null;
  assignmentTitle?: string | null;
  assignmentArtist?: string | null;
  assignmentStatus?: string | null;
  performanceData?: unknown;
  performanceJson?: unknown;
};

export function formatPracticeMinutes(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function buildInstructorAnalyticsSummary(
  sessions: InstructorAnalyticsSession[],
  filters?: {
    classroomId?: number | null;
    studentId?: number | null;
  }
) {
  const filtered = sessions
    .filter((session) => {
      if (filters?.classroomId != null && session.classroomId !== filters.classroomId) return false;
      if (filters?.studentId != null && session.studentId !== filters.studentId) return false;
      return true;
    })
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

  let totalAccuracy = 0;
  let totalTiming = 0;
  let totalWrongNotes = 0;
  let totalDuration = 0;
  let totalNotes = 0;
  let totalCorrectNotes = 0;

  const performanceEvents = filtered.flatMap((session) => extractSessionPerformanceEvents(session));
  const timingBreakdown = summariseTiming(performanceEvents, { fallbackSessions: filtered });
  const troubleNotes = summariseTroubleNotes(performanceEvents, { limit: 10 });

  const memberMap = new Map<
    number,
    { studentId: number; studentName: string; sessions: number; accuracy: number; timing: number; duration: number }
  >();
  const pieceMap = new Map<string, { title: string; artist: string; sessions: number; accuracy: number; timing: number }>();

  for (const session of filtered) {
    totalAccuracy += Number(session.accuracyScore ?? 0);
    totalTiming += Number(session.timingScore ?? 0);
    totalWrongNotes += Number(session.wrongNotes ?? 0);
    totalDuration += Number(session.duration ?? 0);
    totalNotes += Number(session.totalNotes ?? 0);
    totalCorrectNotes += Number(session.correctNotes ?? 0);

    const studentId = Number(session.studentId ?? 0);
    if (studentId > 0) {
      const existing =
        memberMap.get(studentId) ??
        {
          studentId,
          studentName: String(session.studentName ?? "Unknown Member"),
          sessions: 0,
          accuracy: 0,
          timing: 0,
          duration: 0,
        };
      existing.sessions += 1;
      existing.accuracy += Number(session.accuracyScore ?? 0);
      existing.timing += Number(session.timingScore ?? 0);
      existing.duration += Number(session.duration ?? 0);
      memberMap.set(studentId, existing);
    }

    const pieceTitle = String(session.assignmentTitle ?? "Untitled Piece");
    const pieceArtist = String(session.assignmentArtist ?? "Unknown artist");
    const pieceKey = `${pieceTitle}::${pieceArtist}`;
    const piece =
      pieceMap.get(pieceKey) ??
      {
        title: pieceTitle,
        artist: pieceArtist,
        sessions: 0,
        accuracy: 0,
        timing: 0,
      };
    piece.sessions += 1;
    piece.accuracy += Number(session.accuracyScore ?? 0);
    piece.timing += Number(session.timingScore ?? 0);
    pieceMap.set(pieceKey, piece);
  }

  const totalSessions = filtered.length;
  const memberBreakdown = Array.from(memberMap.values())
    .map((member) => ({
      studentId: member.studentId,
      studentName: member.studentName,
      sessions: member.sessions,
      averageAccuracy: totalSessions > 0 ? Math.round(member.accuracy / member.sessions) : 0,
      averageTiming: totalSessions > 0 ? Math.round(member.timing / member.sessions) : 0,
      practiceTimeLabel: formatPracticeMinutes(member.duration),
    }))
    .sort((a, b) => b.averageAccuracy - a.averageAccuracy || b.sessions - a.sessions || a.studentName.localeCompare(b.studentName));

  const performanceByPiece = Array.from(pieceMap.values())
    .map((piece) => ({
      title: piece.title,
      artist: piece.artist,
      sessions: piece.sessions,
      averageAccuracy: Math.round(piece.accuracy / piece.sessions),
      averageTiming: Math.round(piece.timing / piece.sessions),
    }))
    .sort((a, b) => b.averageAccuracy - a.averageAccuracy || b.sessions - a.sessions);

  return {
    filteredSessions: filtered,
    kpis: {
      totalSessions,
      averageAccuracy: totalSessions > 0 ? Math.round(totalAccuracy / totalSessions) : 0,
      averageTiming: totalSessions > 0 ? Math.round(totalTiming / totalSessions) : 0,
      averageScore: totalSessions > 0 ? Math.round((totalAccuracy + totalTiming) / (totalSessions * 2)) : 0,
      wrongNotes: totalWrongNotes,
      noteHitRate: totalNotes > 0 ? Math.round((totalCorrectNotes / totalNotes) * 100) : 0,
      totalPracticeTimeLabel: formatPracticeMinutes(totalDuration),
    },
    timingBreakdown,
    troubleNotes,
    memberBreakdown,
    performanceByPiece,
    recentSessions: filtered.slice(0, 10),
  };
}
