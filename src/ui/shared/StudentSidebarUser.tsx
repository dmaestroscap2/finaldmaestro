import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../auth/AuthSessionContext";

export function StudentSidebarUser() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthSession();
  const displayName = user?.name?.trim() || "Member";
  const avatarLetter = displayName.charAt(0).toLowerCase() || "m";
  const instrumentRaw = String(user?.instrument ?? "").trim();
  const instrumentLabel = instrumentRaw ? instrumentRaw.charAt(0).toUpperCase() + instrumentRaw.slice(1) : "";

  return (
    <div className="sidebarUser">
      <div className="userChip">
        <div className="avatarCircle" aria-hidden="true">
          {avatarLetter}
        </div>
        <div className="userMeta">
          <div className="userName">{displayName}</div>
          <div className="userRole">{instrumentLabel ? `Member · ${instrumentLabel}` : "Member"}</div>
        </div>
      </div>

      <button
        type="button"
        className="signOutBtn"
        onClick={async () => {
          await signOut();
          navigate("/student/login", { replace: true });
        }}
      >
        Sign Out
      </button>
    </div>
  );
}
