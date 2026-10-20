"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import {
  adminApi,
  getRole,
  ApiError,
  type AdminDashboard,
} from "@/lib/api";

export default function AdminDashboardPage() {
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
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await adminApi.dashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "admin") {
    return <p className="error">Forbidden: admin access only.</p>;
  }

  const d = data;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Marketplace Analytics</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Customers and sellers across the whole marketplace
          </p>
        </div>
        <button className="ghost small" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-3" style={{ marginTop: 18 }}>
        <Stat label="Total orders" value={d ? String(d.total_orders) : "-"} />
        <Stat label="Revenue" value={d ? `$${d.total_revenue.toFixed(2)}` : "-"} />
        <Stat label="Customers" value={d ? String(d.total_customers) : "-"} />
        <Stat label="Sellers" value={d ? String(d.total_sellers) : "-"} />
        <Stat label="Categories" value={d ? String(d.total_categories ?? 0) : "-"} />
        <Stat label="Sub-categories" value={d ? String(d.total_subcategories ?? 0) : "-"} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Customers ({d?.total_customers ?? 0})</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              {d ? `${d.total_products} products · ${d.active_products} active` : ""}
            </span>
          </div>
          <div className="spacer" />
          {!d || d.customers.length === 0 ? (
            <p className="muted">No customers yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th style={{ textAlign: "right" }}>Orders</th>
                  <th style={{ textAlign: "right" }}>Spent</th>
                </tr>
              </thead>
              <tbody>
                {d.customers.map((c) => (
                  <tr key={c.user_id}>
                    <td>{c.user_email}</td>
                    <td style={{ textAlign: "right" }}>{c.orders}</td>
                    <td style={{ textAlign: "right" }}>${c.total_spent.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: 0 }}>Sellers ({d?.total_sellers ?? 0})</h2>
          <div className="spacer" />
          {!d || d.sellers.length === 0 ? (
            <p className="muted">No sellers yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Seller</th>
                  <th style={{ textAlign: "right" }}>Products</th>
                  <th style={{ textAlign: "right" }}>Sold</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {d.sellers.map((s) => (
                  <tr key={s.merchant_id}>
                    <td>{s.merchant_email}</td>
                    <td style={{ textAlign: "right" }}>{s.products}</td>
                    <td style={{ textAlign: "right" }}>{s.items_sold}</td>
                    <td style={{ textAlign: "right" }}>${s.revenue.toFixed(2)}</td>
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
