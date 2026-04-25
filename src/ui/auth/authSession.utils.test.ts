import { describe, expect, it } from "vitest";
import {
  initialAuthSessionState,
  reduceAuthSession,
  resolveProtectedRouteRedirect,
  resolvePublicAuthRedirect,
  type AuthSessionState,
} from "./authSession.utils";

const instructorState: AuthSessionState = {
  status: "authenticated",
  user: {
    id: 1,
    email: "bert@gmail.com",
    name: "Bert",
    role: "instructor",
    instrument: null,
  },
};

const studentState: AuthSessionState = {
  status: "authenticated",
  user: {
    id: 2,
    email: "berto@gmail.com",
    name: "Berto",
    role: "student",
    instrument: "guitar",
  },
};

describe("reduceAuthSession", () => {
  it("stores the latest signed-in account", () => {
    const signedIn = reduceAuthSession(initialAuthSessionState, {
      type: "signIn:success",
      user: instructorState.user!,
    });
    const switched = reduceAuthSession(signedIn, {
      type: "signIn:success",
      user: studentState.user!,
    });

    expect(switched.status).toBe("authenticated");
    expect(switched.user?.id).toBe(2);
    expect(switched.user?.role).toBe("student");
    expect(switched.user?.instrument).toBe("guitar");
  });

  it("clears the authenticated account on logout", () => {
    const cleared = reduceAuthSession(instructorState, { type: "auth:clear" });

    expect(cleared).toEqual({
      status: "unauthenticated",
      user: null,
    });
  });
});

describe("auth route redirects", () => {
  it("sends signed-in users away from login pages to their active home route", () => {
    expect(resolvePublicAuthRedirect(instructorState)).toBe("/instructor/dashboard");
    expect(resolvePublicAuthRedirect(studentState)).toBe("/student/dashboard");
  });

  it("redirects protected routes when the active account is missing or belongs to another role", () => {
    expect(resolveProtectedRouteRedirect(initialAuthSessionState, "student", "/student/login")).toBeNull();
    expect(
      resolveProtectedRouteRedirect(
        { status: "unauthenticated", user: null },
        "student",
        "/student/login"
      )
    ).toBe("/student/login");
    expect(resolveProtectedRouteRedirect(instructorState, "student", "/student/login")).toBe(
      "/instructor/dashboard"
    );
    expect(resolveProtectedRouteRedirect(studentState, "student", "/student/login")).toBeNull();
  });
});
