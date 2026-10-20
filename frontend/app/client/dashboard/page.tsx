"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import {
  clientApi,
  getRole,
  ApiError,
  type ClientDashboard,
} from "@/lib/api";

export default function ClientDashboardPage() {
  return (
    <RequireAuth>
      <Body />
    </RequireAuth>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function Body() {
  const role = getRole();
  const [data, setData] = useState<ClientDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await clientApi.dashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "client") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "client") {
    return <p className="error">Forbidden: this dashboard is for customers only.</p>;
  }

  const d = data;
  const statuses = Object.entries(d?.by_status || {});

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>My Purchases</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Your own orders only — {d?.email || ""}
          </p>
        </div>
        <button className="ghost small" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Stat label="Orders placed" value={d ? String(d.total_orders) : "-"} />
        <Stat label="Total spent" value={d ? `$${d.total_spent.toFixed(2)}` : "-"} />
        <Stat label="Items bought" value={d ? String(d.items_bought) : "-"} />
        <Stat
          label="Delivered"
          value={d ? String(d.by_status["delivered"] || 0) : "-"}
        />
      </div>

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Order status</h2>
          {statuses.length === 0 ? (
            <p className="muted">No orders yet.</p>
          ) : (
            <div className="row">
              {statuses.map(([status, count]) => (
                <span key={status} className="pill">
                  {status}: {count}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Recent orders</h2>
          {!d || d.recent_orders.length === 0 ? (
            <p className="muted">Nothing yet — buy something in the Shop.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Items</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{o.id.slice(0, 8)}…</td>
                    <td className="muted">
                      {o.items.map((it) => `${it.product_name} ×${it.quantity}`).join(", ")}
                    </td>
                    <td style={{ textAlign: "right" }}>${o.total.toFixed(2)}</td>
                    <td>
                      <span className="pill">{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
