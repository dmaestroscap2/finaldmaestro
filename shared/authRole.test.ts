import { describe, expect, it } from "vitest";
import { getHomeRouteForRole, isInstructorRole, normaliseUserRole } from "./authRole";

describe("authRole helpers", () => {
  it("normalises stored role values defensively", () => {
    expect(normaliseUserRole("Instructor")).toBe("instructor");
    expect(normaliseUserRole(" student ")).toBe("student");
    expect(normaliseUserRole("ADMIN")).toBe("student");
  });

  it("recognises instructors after normalisation", () => {
    expect(isInstructorRole("instructor")).toBe(true);
    expect(isInstructorRole("Instructor")).toBe(true);
    expect(isInstructorRole("student")).toBe(false);
  });

  it("maps authenticated users to the correct home route", () => {
    expect(getHomeRouteForRole("instructor")).toBe("/instructor/dashboard");
    expect(getHomeRouteForRole("Instructor")).toBe("/instructor/dashboard");
    expect(getHomeRouteForRole("student")).toBe("/student/dashboard");
  });
});
