import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthSession } from "../auth/AuthSessionContext";
import { resolveProtectedRouteRedirect } from "../auth/authSession.utils";
import { Sidebar } from "../shared/Sidebar";

export function AppLayout() {
  const authSession = useAuthSession();
  const redirect = resolveProtectedRouteRedirect(authSession, "instructor", "/login");
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }
  if (authSession.status === "loading") {
    return <div className="appRoot"><main className="appMain"><div className="pageSubtitle">Loading account...</div></main></div>;
  }

  return (
    <div className="appRoot">
      <Sidebar />
      <main className="appMain">
        <Outlet />
      </main>
    </div>
  );
}

