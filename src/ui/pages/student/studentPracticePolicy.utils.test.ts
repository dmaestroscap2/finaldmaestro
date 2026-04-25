import { describe, expect, it } from "vitest";
import {
  buildPracticeOutcome,
  determineAssignmentStatusAfterSession,
  summariseTimingGrades,
  type PracticeTimingGrade,
} from "./studentPracticePolicy.utils";

describe("studentPracticePolicy utils", () => {
  it("summarises timing grades into distinct buckets", () => {
    const grades: Array<PracticeTimingGrade | null> = ["perfect", "early", null, "late", "perfect"];

    expect(summariseTimingGrades(grades)).toEqual({
      perfect: 2,
      early: 1,
      late: 1,
    });
  });

  it("marks a strong session as passed and completed", () => {
    const outcome = buildPracticeOutcome({
      totalNotes: 10,
      correctNotes: 8,
      missedNotes: 1,
      wrongNotes: 1,
      timingGrades: ["perfect", "perfect", "early", "late", "perfect", "perfect", "early", "perfect", null, null],
    });

    expect(outcome).toEqual({
      accuracyScore: 80,
      timingScore: 77,
      passed: true,
      assignmentStatus: "completed",
      timingSummary: {
        perfect: 5,
        early: 2,
        late: 1,
      },
    });
  });

  it("does not score mostly near-timed notes too harshly", () => {
    const outcome = buildPracticeOutcome({
      totalNotes: 10,
      correctNotes: 8,
      missedNotes: 1,
      wrongNotes: 1,
      timingGrades: ["perfect", "early", "late", "early", "late", "perfect", "early", "late", null, null],
    });

    expect(outcome.timingScore).toBe(74);
    expect(outcome.passed).toBe(true);
  });

  it("keeps a weak session in progress", () => {
    const outcome = buildPracticeOutcome({
      totalNotes: 10,
      correctNotes: 4,
      missedNotes: 4,
      wrongNotes: 3,
      timingGrades: ["perfect", null, null, "late", null, null, null, null, null, null],
    });

    expect(outcome.passed).toBe(false);
    expect(outcome.assignmentStatus).toBe("in_progress");
    expect(determineAssignmentStatusAfterSession(false)).toBe("in_progress");
    expect(determineAssignmentStatusAfterSession(true)).toBe("completed");
  });
});
