import { getHomeRouteForRole } from "../../../shared/authRole";

export type AuthenticatedUser = {
  id: number;
  email: string;
  name: string;
  role: "instructor" | "student";
  instrument?: string | null;
};

export type AuthSessionState = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthenticatedUser | null;
};

export type AuthSessionAction =
  | { type: "refresh:start" }
  | { type: "refresh:success"; user: AuthenticatedUser }
  | { type: "signIn:success"; user: AuthenticatedUser }
  | { type: "auth:clear" };

export const initialAuthSessionState: AuthSessionState = {
  status: "loading",
  user: null,
};

export function reduceAuthSession(
  state: AuthSessionState,
  action: AuthSessionAction
): AuthSessionState {
  switch (action.type) {
    case "refresh:start":
      return {
        ...state,
        status: state.user ? "authenticated" : "loading",
      };
    case "refresh:success":
    case "signIn:success":
      return {
        status: "authenticated",
        user: action.user,
      };
    case "auth:clear":
      return {
        status: "unauthenticated",
        user: null,
      };
    default:
      return state;
  }
}

export function resolveProtectedRouteRedirect(
  state: AuthSessionState,
  expectedRole: "instructor" | "student",
  loginPath: string
): string | null {
  if (state.status === "loading") return null;
  if (state.status === "unauthenticated" || !state.user) return loginPath;
  if (state.user.role !== expectedRole) return getHomeRouteForRole(state.user.role);
  return null;
}

export function resolvePublicAuthRedirect(state: AuthSessionState): string | null {
  if (state.status !== "authenticated" || !state.user) return null;
  return getHomeRouteForRole(state.user.role);
}
