import { resolveStudentPracticeInstrument } from "./studentPracticeInstrument.utils";

type AssignmentLike = {
  id?: number | string | null;
  status?: string | null;
  musicSheet?: {
    title?: string | null;
    artist?: string | null;
    duration?: number | null;
    difficulty?: string | null;
  } | null;
};

export function buildStudentAssignmentPracticePath(
  assignment: AssignmentLike,
  userInstrument: string | null | undefined
): string | null {
  const assignmentId = Number.parseInt(String(assignment?.id ?? ""), 10);
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) return null;

  const params = new URLSearchParams({
    assignmentId: String(assignmentId),
    musicTitle: String(assignment?.musicSheet?.title ?? "Practice"),
    musicArtist: String(assignment?.musicSheet?.artist ?? "Unknown"),
    instrument: resolveStudentPracticeInstrument(null, userInstrument),
  });

  return `/student/practice/session?${params.toString()}`;
}

export function filterVisibleStudentAssignments<T extends AssignmentLike>(assignments: T[]): T[] {
  return assignments.filter((assignment) => {
    const status = String(assignment?.status ?? "").toLowerCase();
    if (!status || status === "assigned") return false;
    return true;
  });
}
