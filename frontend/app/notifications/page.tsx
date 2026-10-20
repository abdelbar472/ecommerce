"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { notificationApi, ApiError, type Notification } from "@/lib/api";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}

function Notifications() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);

  const load = async () => {
    try {
      setRows(await notificationApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Notifications</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Consumed from Kafka by the Notification Service. Polls every 4s.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Inbox ({rows.length})</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                margin: 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                style={{ width: "auto" }}
              />
              Auto
            </label>
            <button className="ghost small" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="spacer" />

        {rows.length === 0 && !loading ? (
          <p className="muted">No notifications yet. Create an order from the Dashboard.</p>
        ) : (
          rows.map((n) => (
            <div
              key={n.id}
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "12px 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{n.message}</strong>
                <span className={`pill ${n.read ? "read" : "unread"}`}>
                  {n.read ? "read" : "unread"}
                </span>
              </div>
              <div className="muted mono" style={{ marginTop: 6 }}>
                order {n.order_id.slice(0, 8)}… · {n.user_email} · $
                {n.total.toFixed(2)} · {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
