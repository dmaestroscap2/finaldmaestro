export type UserRole = "instructor" | "student";

export function normaliseUserRole(role: string | null | undefined): UserRole {
  const value = String(role ?? "")
    .trim()
    .toLowerCase();
  return value === "instructor" ? "instructor" : "student";
}

export function isInstructorRole(role: string | null | undefined): boolean {
  return normaliseUserRole(role) === "instructor";
}

export function getHomeRouteForRole(role: string | null | undefined): string {
  return isInstructorRole(role) ? "/instructor/dashboard" : "/student/dashboard";
}
