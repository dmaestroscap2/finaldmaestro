import { extractSessionPerformanceEvents, summariseTiming, summariseTroubleNotes } from "../analyticsPerformance.utils";

type AnalyticsSession = {
  id: number;
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
  performanceJson?: unknown;
};

function roundAverage(total: number, count: number): number {
  return count > 0 ? Math.round(total / count) : 0;
}

function formatPracticeMinutes(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function averageSessionScore(session: AnalyticsSession): number {
  const accuracy = Number(session.accuracyScore ?? 0);
  const timing = Number(session.timingScore ?? 0);
  return Math.round((accuracy + timing) / 2);
}

export function buildStudentAnalyticsSummary(sessions: AnalyticsSession[]) {
  const sorted = [...sessions].sort((a, b) => {
    const aTime = new Date(a.completedAt ?? 0).getTime();
    const bTime = new Date(b.completedAt ?? 0).getTime();
    return bTime - aTime;
  });

  let totalAccuracy = 0;
  let totalTiming = 0;
  let totalNotes = 0;
  let totalCorrectNotes = 0;
  let totalDuration = 0;

  const performanceEvents = sorted.flatMap((session) => extractSessionPerformanceEvents(session));
  const timingBreakdown = summariseTiming(performanceEvents, { fallbackSessions: sorted });
  const troubleNotes = summariseTroubleNotes(performanceEvents, { limit: 10 });

  const pieceMap = new Map<string, { accuracy: number; timing: number; sessions: number }>();

  for (const session of sorted) {
    totalAccuracy += Number(session.accuracyScore ?? 0);
    totalTiming += Number(session.timingScore ?? 0);
    totalNotes += Number(session.totalNotes ?? 0);
    totalCorrectNotes += Number(session.correctNotes ?? 0);
    totalDuration += Number(session.duration ?? 0);

    const title = String(session.assignmentTitle ?? "Untitled Piece");
    const existing = pieceMap.get(title) ?? { accuracy: 0, timing: 0, sessions: 0 };
    existing.accuracy += Number(session.accuracyScore ?? 0);
    existing.timing += Number(session.timingScore ?? 0);
    existing.sessions += 1;
    pieceMap.set(title, existing);
  }

  const performanceByPiece = Array.from(pieceMap.entries())
    .map(([title, value]) => ({
      title,
      averageAccuracy: roundAverage(value.accuracy, value.sessions),
      averageTiming: roundAverage(value.timing, value.sessions),
      sessions: value.sessions,
    }))
    .sort((a, b) => b.averageAccuracy - a.averageAccuracy || b.sessions - a.sessions);

  const scoreTrend = (() => {
    const recent = sorted.slice(0, 5);
    const previous = sorted.slice(5, 10);
    const recentAvg = roundAverage(recent.reduce((sum, s) => sum + averageSessionScore(s), 0), recent.length);
    const previousAvg = roundAverage(previous.reduce((sum, s) => sum + averageSessionScore(s), 0), previous.length);
    const delta = recentAvg - previousAvg;
    return {
      recentAverage: recentAvg,
      previousAverage: previousAvg,
      delta,
    };
  })();

  const now = Math.max(0, ...sorted.map((session) => new Date(session.completedAt ?? 0).getTime()));
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const last7Days = sorted.filter((session) => now - new Date(session.completedAt ?? 0).getTime() <= weekMs);
  const last7DaysDuration = last7Days.reduce((sum, s) => sum + Number(s.duration ?? 0), 0);

  return {
    kpis: {
      totalSessions: sorted.length,
      averageScore: roundAverage(totalAccuracy + totalTiming, sorted.length * 2),
      averageAccuracy: roundAverage(totalAccuracy, sorted.length),
      averageTiming: roundAverage(totalTiming, sorted.length),
      noteHitRate: totalNotes > 0 ? Math.round((totalCorrectNotes / totalNotes) * 100) : 0,
      totalPracticeTimeLabel: formatPracticeMinutes(totalDuration),
      sessionsLast7Days: last7Days.length,
      practiceTimeLast7DaysLabel: formatPracticeMinutes(last7DaysDuration),
    },
    scoreTrend,
    timingBreakdown,
    troubleNotes,
    recentSessions: sorted.slice(0, 10),
    performanceByPiece,
  };
}
