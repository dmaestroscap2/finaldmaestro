import React from "react";
import { NavLink } from "react-router-dom";
import { SidebarUser } from "./SidebarUser";
import { BrandLogo } from "./BrandLogo";

const nav = [
  { to: "/instructor/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/instructor/classrooms", label: "Classrooms", icon: "⌂" },
  { to: "/instructor/library", label: "Music Library", icon: "♫" },
  { to: "/instructor/students", label: "ALL MEMBERS", icon: "⇢" },
  { to: "/instructor/session-analytics", label: "Session Analytics", icon: "▤" },
  { to: "/instructor/feedback", label: "Feedback", icon: "✎" },
];

export function Sidebar() {
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
            <span className={item.label === "ALL MEMBERS" ? "navCaps" : ""}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebarBottom">
        <SidebarUser />
      </div>
    </aside>
  );
}
