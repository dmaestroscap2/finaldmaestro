import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthSession } from "../auth/AuthSessionContext";
import { resolvePublicAuthRedirect } from "../auth/authSession.utils";

export function AuthLayout() {
  const authSession = useAuthSession();
  const redirect = resolvePublicAuthRedirect(authSession);
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  return (
    <div className="authBg">
      <div className="authBgGlow" />
      <Outlet />
    </div>
  );
}

