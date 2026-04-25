import React from "react";
import { NavLink } from "react-router-dom";
import { StudentSidebarUser } from "./StudentSidebarUser";
import { BrandLogo } from "./BrandLogo";

const nav = [
  { to: "/student/dashboard", label: "My Dashboard", icon: "▦" },
  { to: "/student/trainer", label: "Trainer", icon: "↯" },
  { to: "/student/practice", label: "Practice", icon: "✎" },
  { to: "/student/assignments", label: "Assignments", icon: "♫" },
  { to: "/student/analytics", label: "Analytics", icon: "▤" },
  { to: "/student/feedback", label: "Feedback", icon: "✉" },
  { to: "/student/notifications", label: "Notifications", icon: "🔔" },
];

export function StudentSidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrandLogo
            variant="mark"
            alt="DMAESTRO"
            style={{ width: 54, height: 54, objectFit: "contain", flex: "0 0 auto" }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="brandTitle" style={{ lineHeight: 1.05 }}>
              DMAESTRO
            </div>
            <div className="brandSub">AI MUSIC ACADEMY</div>
          </div>
        </div>
      </div>

      <nav className="nav">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => "navItem" + (isActive ? " navItemActive" : "")}>
            <span className="navIcon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebarBottom">
        <StudentSidebarUser />
      </div>
    </aside>
  );
}
