import React from "react";
import { PageHeader } from "../../shared/PageHeader";
import { notificationsAPI } from "../../../api/client";
import { useAutoRefresh } from "../../shared/useAutoRefresh";

type NotificationRow = {
  id: number;
  title: string;
  type: string;
  createdAt?: string | number | Date | null;
  readAt?: string | number | Date | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatRelative(nowMs: number, thenMs: number): string {
  const delta = Math.max(0, nowMs - thenMs);
  if (delta < 10_000) return "just now";
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function StudentNotificationsPage() {
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const data = (await notificationsAPI.list()) as any;
      if (requestId !== requestIdRef.current) return;
      setRows(Array.isArray(data) ? (data as NotificationRow[]) : []);
      setError("");
    } catch (e: any) {
      if (requestId !== requestIdRef.current) return;
      setRows([]);
      setError(e?.message ?? "Failed to load notifications");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useAutoRefresh(refresh, { intervalMs: 10_000 });

  React.useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const unreadCount = rows.filter((r) => !toDate(r.readAt)).length;

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      await refresh();
    } catch {
      // ignore
    }
  };

  const markRead = async (id: number) => {
    try {
      await notificationsAPI.markRead(id);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, readAt: new Date().toISOString() } : r))
      );
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Assignments and important updates."
        right={
          <span className="pill" style={{ borderColor: "rgba(216,221,231,.16)", background: "rgba(255,255,255,.04)", color: "rgba(216,221,231,.85)" }}>
            {unreadCount} unread
          </span>
        }
      />

      {loading ? <div className="pageSubtitle">Loading notifications...</div> : null}
      {error ? (
        <div className="pageSubtitle" style={{ color: "rgba(255,120,120,.92)" }}>
          {error}
        </div>
      ) : null}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="sectionTitle" style={{ marginBottom: 0 }}>Recent</div>
          <button type="button" className="signOutBtn" style={{ width: "auto", marginTop: 0 }} onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all read
          </button>
        </div>

        {rows.length === 0 && !loading && !error ? (
          <div className="emptyState" style={{ height: 140 }}>No notifications yet</div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((n) => {
              const created = toDate(n.createdAt);
              const read = toDate(n.readAt);
              const createdMs = created?.getTime() ?? 0;
              const when = created ? created.toLocaleString() : "";
              const rel = created ? formatRelative(nowMs, createdMs) : "";

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="signOutBtn"
                  style={{
                    width: "100%",
                    marginTop: 0,
                    textAlign: "left",
                    padding: 12,
                    borderColor: read ? "rgba(255,255,255,.06)" : "rgba(241,194,75,.22)",
                    background: read ? "rgba(255,255,255,.02)" : "rgba(241,194,75,.07)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.title}
                    </div>
                    <div className="pageSubtitle" style={{ marginTop: 0, whiteSpace: "nowrap" }}>
                      {rel}
                    </div>
                  </div>
                  <div className="pageSubtitle" style={{ marginTop: 6 }}>
                    {when}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
