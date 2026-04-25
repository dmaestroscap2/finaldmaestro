import React from "react";
import { PageHeader } from "../shared/PageHeader";

export function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Updates, alerts, and important activity."
      />
      <div className="card">
        <div className="emptyState" style={{ height: 140 }}>
          No notifications yet
        </div>
      </div>
    </div>
  );
}

