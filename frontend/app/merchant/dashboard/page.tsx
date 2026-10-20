"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import {
  merchantApi,
  getRole,
  ApiError,
  type MerchantDashboard,
} from "@/lib/api";

export default function MerchantDashboardPage() {
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
  const [data, setData] = useState<MerchantDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await merchantApi.dashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "merchant") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "merchant") {
    return <p className="error">Forbidden: this dashboard is for sellers only.</p>;
  }

  const d = data;
  const statuses = Object.entries(d?.by_status || {});

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>My Sales</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Sales from your own products only — {d?.email || ""}
          </p>
        </div>
        <button className="ghost small" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Stat label="Orders" value={d ? String(d.total_orders) : "-"} />
        <Stat label="Revenue" value={d ? `$${d.total_revenue.toFixed(2)}` : "-"} />
        <Stat label="Items sold" value={d ? String(d.items_sold) : "-"} />
        <Stat label="Pending" value={d ? String(d.pending_orders) : "-"} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Top products</h2>
          {!d || d.top_products.length === 0 ? (
            <p className="muted">No sales yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "right" }}>Sold</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {d.top_products.map((p) => (
                  <tr key={p.product_name}>
                    <td>{p.product_name}</td>
                    <td style={{ textAlign: "right" }}>{p.quantity_sold}</td>
                    <td style={{ textAlign: "right" }}>${p.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {statuses.length > 0 && (
            <div className="row" style={{ marginTop: 12 }}>
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
            <p className="muted">No orders containing your products yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Your total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.recent_orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{o.id.slice(0, 8)}…</td>
                    <td className="muted">{o.user_email}</td>
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
