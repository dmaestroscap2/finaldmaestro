import { describe, expect, it } from "vitest";
import {
  buildStudentAssignmentPracticePath,
  filterVisibleStudentAssignments,
} from "./studentAssignments.utils";

describe("studentAssignments utils", () => {
  it("builds a practice route that includes assignment context for session saving", () => {
    const path = buildStudentAssignmentPracticePath(
      {
        id: 42,
        musicSheet: {
          title: "Leonora",
          artist: "Sugarcane",
        },
      },
      "guitar"
    );

    expect(path).toBe(
      "/student/practice/session?assignmentId=42&musicTitle=Leonora&musicArtist=Sugarcane&instrument=guitar"
    );
  });

  it("returns null when the assignment id is missing", () => {
    expect(buildStudentAssignmentPracticePath({ id: null }, "piano")).toBeNull();
  });

  it("hides completed assignments from the visible list", () => {
    const visible = filterVisibleStudentAssignments([
      { id: 1, status: "assigned" },
      { id: 2, status: "in_progress" },
      { id: 3, status: "completed" },
    ]);

    expect(visible.map((item) => item.id)).toEqual([1, 2]);
  });
});
