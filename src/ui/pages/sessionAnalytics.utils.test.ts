import { describe, expect, it } from "vitest";
import { buildInstructorAnalyticsSummary, formatPracticeMinutes } from "./sessionAnalytics.utils";

describe("sessionAnalytics utils", () => {
  it("formats practice duration into readable labels", () => {
    expect(formatPracticeMinutes(20)).toBe("0m");
    expect(formatPracticeMinutes(610)).toBe("10m");
    expect(formatPracticeMinutes(3700)).toBe("1h 1m");
  });

  it("builds instructor analytics with member and piece summaries", () => {
    const summary = buildInstructorAnalyticsSummary([
      {
        id: 1,
        studentId: 11,
        studentName: "Berto",
        classroomId: 7,
        classroomName: "Winds",
        accuracyScore: 88,
        timingScore: 76,
        totalNotes: 50,
        correctNotes: 42,
        wrongNotes: 4,
        missedNotes: 4,
        duration: 600,
        completedAt: "2026-04-17T10:00:00.000Z",
        assignmentTitle: "Leonora",
        assignmentArtist: "Sugarcane",
      },
      {
        id: 2,
        studentId: 12,
        studentName: "Cara",
        classroomId: 8,
        classroomName: "Strings",
        accuracyScore: 92,
        timingScore: 84,
        totalNotes: 60,
        correctNotes: 55,
        wrongNotes: 3,
        missedNotes: 2,
        duration: 900,
        completedAt: "2026-04-18T10:00:00.000Z",
        assignmentTitle: "Leonora",
        assignmentArtist: "Sugarcane",
      },
      {
        id: 3,
        studentId: 11,
        studentName: "Berto",
        classroomId: 7,
        classroomName: "Winds",
        accuracyScore: 70,
        timingScore: 80,
        totalNotes: 40,
        correctNotes: 30,
        wrongNotes: 5,
        missedNotes: 5,
        duration: 300,
        completedAt: "2026-04-19T10:00:00.000Z",
        assignmentTitle: "Three Little Birds",
        assignmentArtist: "Bob Marley",
      },
    ]);

    expect(summary.kpis).toEqual({
      totalSessions: 3,
      averageAccuracy: 83,
      averageTiming: 80,
      averageScore: 82,
      wrongNotes: 12,
      noteHitRate: 85,
      totalPracticeTimeLabel: "30m",
    });
    expect(summary.memberBreakdown).toEqual([
      {
        studentId: 12,
        studentName: "Cara",
        sessions: 1,
        averageAccuracy: 92,
        averageTiming: 84,
        practiceTimeLabel: "15m",
      },
      {
        studentId: 11,
        studentName: "Berto",
        sessions: 2,
        averageAccuracy: 79,
        averageTiming: 78,
        practiceTimeLabel: "15m",
      },
    ]);
    expect(summary.performanceByPiece).toEqual([
      {
        title: "Leonora",
        artist: "Sugarcane",
        sessions: 2,
        averageAccuracy: 90,
        averageTiming: 80,
      },
      {
        title: "Three Little Birds",
        artist: "Bob Marley",
        sessions: 1,
        averageAccuracy: 70,
        averageTiming: 80,
      },
    ]);
    expect(summary.recentSessions.map((session) => session.id)).toEqual([3, 2, 1]);
  });

  it("filters the instructor analytics by classroom and member", () => {
    const sessions = [
      { id: 1, studentId: 11, studentName: "Berto", classroomId: 7, accuracyScore: 80, timingScore: 80, totalNotes: 10, correctNotes: 8, wrongNotes: 1, duration: 60 },
      { id: 2, studentId: 12, studentName: "Cara", classroomId: 8, accuracyScore: 90, timingScore: 90, totalNotes: 10, correctNotes: 9, wrongNotes: 0, duration: 60 },
      { id: 3, studentId: 11, studentName: "Berto", classroomId: 7, accuracyScore: 70, timingScore: 85, totalNotes: 10, correctNotes: 7, wrongNotes: 2, duration: 60 },
    ];

    const byClassroom = buildInstructorAnalyticsSummary(sessions, { classroomId: 7 });
    const byStudent = buildInstructorAnalyticsSummary(sessions, { studentId: 12 });

    expect(byClassroom.filteredSessions.map((session) => session.id)).toEqual([1, 3]);
    expect(byClassroom.kpis.totalSessions).toBe(2);
    expect(byStudent.filteredSessions.map((session) => session.id)).toEqual([2]);
    expect(byStudent.memberBreakdown).toEqual([
      {
        studentId: 12,
        studentName: "Cara",
        sessions: 1,
        averageAccuracy: 90,
        averageTiming: 90,
        practiceTimeLabel: "1m",
      },
    ]);
  });
});
