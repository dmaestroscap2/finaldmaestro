import React from "react";
import { ApiError, authAPI } from "../../api/client";
import { useAutoRefresh } from "../shared/useAutoRefresh";
import {
  initialAuthSessionState,
  reduceAuthSession,
  type AuthSessionState,
  type AuthenticatedUser,
} from "./authSession.utils";

type AuthSessionContextValue = AuthSessionState & {
  refreshAuthSession: () => Promise<AuthenticatedUser | null>;
  setAuthenticatedUser: (user: AuthenticatedUser) => void;
  signOut: () => Promise<void>;
};

const AuthSessionContext = React.createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reduceAuthSession, initialAuthSessionState);
  const requestIdRef = React.useRef(0);

  const refreshAuthSession = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    dispatch({ type: "refresh:start" });
    try {
      const user = (await authAPI.me()) as AuthenticatedUser;
      if (requestId === requestIdRef.current) {
        dispatch({ type: "refresh:success", user });
      }
      return user;
    } catch (error) {
      const isUnauthorized =
        error instanceof ApiError && (error.status === 401 || error.status === 403);

      if (requestId === requestIdRef.current) {
        // Only clear auth when the session is truly invalid (401/403) or we have no user yet.
        // Otherwise, keep the current authenticated user to avoid logging out due to unrelated API failures.
        if (isUnauthorized || !state.user) {
          dispatch({ type: "auth:clear" });
        }
      }
      return null;
    }
  }, [state.user]);

  const setAuthenticatedUser = React.useCallback((user: AuthenticatedUser) => {
    requestIdRef.current += 1;
    dispatch({ type: "signIn:success", user });
  }, []);

  const signOut = React.useCallback(async () => {
    requestIdRef.current += 1;
    try {
      await authAPI.logout();
    } catch {
      // Clear local auth state even if the logout response fails.
    }
    dispatch({ type: "auth:clear" });
  }, []);

  React.useEffect(() => {
    void refreshAuthSession();
  }, [refreshAuthSession]);

  useAutoRefresh(refreshAuthSession, { runOnMount: false });

  const value = React.useMemo<AuthSessionContextValue>(
    () => ({
      ...state,
      refreshAuthSession,
      setAuthenticatedUser,
      signOut,
    }),
    [state, refreshAuthSession, setAuthenticatedUser, signOut]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = React.useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within an AuthSessionProvider");
  }
  return context;
}
