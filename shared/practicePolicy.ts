export type PracticeTimingGrade = "early" | "perfect" | "late";

export function summariseTimingGrades(grades: Array<PracticeTimingGrade | null>): {
  perfect: number;
  early: number;
  late: number;
} {
  let perfect = 0;
  let early = 0;
  let late = 0;

  for (const grade of grades) {
    if (grade === "perfect") perfect++;
    else if (grade === "early") early++;
    else if (grade === "late") late++;
  }

  return { perfect, early, late };
}

export function determineAssignmentStatusAfterSession(passed: boolean): "in_progress" | "completed" {
  return passed ? "completed" : "in_progress";
}

export function buildPracticeOutcome(args: {
  totalNotes: number;
  correctNotes: number;
  missedNotes: number;
  wrongNotes: number;
  timingGrades: Array<PracticeTimingGrade | null>;
}): {
  accuracyScore: number;
  timingScore: number;
  passed: boolean;
  assignmentStatus: "in_progress" | "completed";
  timingSummary: {
    perfect: number;
    early: number;
    late: number;
  };
} {
  const totalNotes = Math.max(0, args.totalNotes);
  const correctNotes = Math.max(0, args.correctNotes);
  const missedNotes = Math.max(0, args.missedNotes);
  const wrongNotes = Math.max(0, args.wrongNotes);
  const timingSummary = summariseTimingGrades(args.timingGrades);

  const accuracyScore = totalNotes > 0 ? Math.round((correctNotes / totalNotes) * 100) : 0;
  const timingScore =
    totalNotes > 0
      ? Math.max(
          0,
          Math.round(((timingSummary.perfect + timingSummary.early * 0.9 + timingSummary.late * 0.9) / totalNotes) * 100)
        )
      : 0;

  const passed =
    totalNotes > 0 &&
    accuracyScore >= 70 &&
    timingScore >= 60 &&
    missedNotes <= Math.floor(totalNotes * 0.4) &&
    wrongNotes <= Math.ceil(totalNotes * 0.5);

  return {
    accuracyScore,
    timingScore,
    passed,
    assignmentStatus: determineAssignmentStatusAfterSession(passed),
    timingSummary,
  };
}
