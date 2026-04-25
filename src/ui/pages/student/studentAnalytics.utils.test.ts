import { describe, expect, it } from "vitest";
import { buildStudentAnalyticsSummary } from "./studentAnalytics.utils";

describe("studentAnalytics utils", () => {
  it("builds dashboard metrics and piece summaries from saved sessions", () => {
    const summary = buildStudentAnalyticsSummary([
      {
        id: 1,
        accuracyScore: 80,
        timingScore: 72,
        totalNotes: 10,
        correctNotes: 8,
        wrongNotes: 1,
        missedNotes: 1,
        completedAt: "2026-04-17T10:00:00.000Z",
        assignmentTitle: "Sugarcane",
      },
      {
        id: 2,
        accuracyScore: 90,
        timingScore: 85,
        totalNotes: 20,
        correctNotes: 18,
        wrongNotes: 1,
        missedNotes: 1,
        completedAt: "2026-04-16T10:00:00.000Z",
        assignmentTitle: "Sugarcane",
      },
      {
        id: 3,
        accuracyScore: 70,
        timingScore: 60,
        totalNotes: 8,
        correctNotes: 6,
        wrongNotes: 1,
        missedNotes: 1,
        completedAt: "2026-04-15T10:00:00.000Z",
        assignmentTitle: "Leonora",
      },
    ]);

    expect(summary.kpis).toEqual({
      totalSessions: 3,
      averageScore: 76,
      averageAccuracy: 80,
      averageTiming: 72,
      noteHitRate: 84,
      totalPracticeTimeLabel: "0m",
      sessionsLast7Days: 3,
      practiceTimeLast7DaysLabel: "0m",
    });
    expect(summary.performanceByPiece).toEqual([
      { title: "Sugarcane", averageAccuracy: 85, averageTiming: 79, sessions: 2 },
      { title: "Leonora", averageAccuracy: 70, averageTiming: 60, sessions: 1 },
    ]);
    expect(summary.recentSessions[0]?.id).toBe(1);
    expect(summary.scoreTrend).toEqual({ recentAverage: 76, previousAverage: 0, delta: 76 });
    expect(summary.timingBreakdown.total).toBe(0);
    expect(summary.troubleNotes).toEqual([]);
  });
});
