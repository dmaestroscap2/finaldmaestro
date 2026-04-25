import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthSession } from "../auth/AuthSessionContext";
import { resolveProtectedRouteRedirect } from "../auth/authSession.utils";
import { StudentSidebar } from "../shared/StudentSidebar";

export function StudentLayout() {
  const authSession = useAuthSession();
  const redirect = resolveProtectedRouteRedirect(authSession, "student", "/student/login");
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }
  if (authSession.status === "loading") {
    return <div className="appRoot"><main className="appMain"><div className="pageSubtitle">Loading account...</div></main></div>;
  }

  return (
    <div className="appRoot">
      <StudentSidebar />
      <main className="appMain">
        <Outlet />
      </main>
    </div>
  );
}

