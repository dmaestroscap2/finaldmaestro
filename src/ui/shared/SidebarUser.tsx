import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../auth/AuthSessionContext";

export function SidebarUser() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthSession();
  const displayName = user?.name?.trim() || "Instructor";
  const avatarLetter = displayName.charAt(0).toLowerCase() || "i";

  return (
    <div className="sidebarUser">
      <div className="userChip">
        <div className="avatarCircle" aria-hidden="true">
          {avatarLetter}
        </div>
        <div className="userMeta">
          <div className="userName">{displayName}</div>
          <div className="userRole">Instructor</div>
        </div>
      </div>

      <button
        type="button"
        className="signOutBtn"
        onClick={async () => {
          await signOut();
          navigate("/login", { replace: true });
        }}
      >
        Sign Out
      </button>
    </div>
  );
}

