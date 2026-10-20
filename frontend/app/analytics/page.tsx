"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import {
  analyticsApi,
  ApiError,
  type CustomerStat,
  type EventRow,
  type ProductStat,
  type Summary,
} from "@/lib/api";

export default function AnalyticsPage() {
  return (
    <RequireAuth>
      <Analytics />
    </RequireAuth>
  );
}

function Analytics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<ProductStat[]>([]);
  const [customers, setCustomers] = useState<CustomerStat[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p, c, e] = await Promise.all([
        analyticsApi.summary(),
        analyticsApi.topProducts(limit),
        analyticsApi.topCustomers(limit),
        analyticsApi.events(),
      ]);
      setSummary(s);
      setProducts(p);
      setCustomers(c);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  const maxProductRevenue = Math.max(1, ...products.map((p) => p.revenue));
  const maxCustomerSpent = Math.max(1, ...customers.map((c) => c.total_spent));

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Analytics</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Aggregated by the Analytics Service from the Kafka stream.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-4">
        <Stat label="Total orders" value={summary ? summary.total_orders.toLocaleString() : "—"} />
        <Stat
          label="Revenue"
          value={summary ? `$${summary.total_revenue.toLocaleString()}` : "—"}
        />
        <Stat
          label="Avg order value"
          value={summary ? `$${summary.average_order_value.toFixed(2)}` : "—"}
        />
        <Stat
          label="Unique customers"
          value={summary ? summary.unique_customers.toLocaleString() : "—"}
        />
      </div>

      <div className="row" style={{ marginTop: 20, alignItems: "center" }}>
        <div className="grow-0">
          <label>Top N</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 90 }}
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button className="ghost small grow-0" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Top products by revenue</h2>
          {products.length === 0 ? (
            <p className="muted">No data.</p>
          ) : (
            products.map((p) => (
              <div key={p.name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{p.name}</span>
                  <span className="muted">
                    {p.quantity_sold} sold · ${p.revenue.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "var(--panel-2)",
                    borderRadius: 6,
                    marginTop: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(p.revenue / maxProductRevenue) * 100}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2>Top customers by spend</h2>
          {customers.length === 0 ? (
            <p className="muted">No data.</p>
          ) : (
            customers.map((c) => (
              <div key={c.user_email} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{c.user_email}</span>
                  <span className="muted">
                    {c.orders_count} orders · ${c.total_spent.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "var(--panel-2)",
                    borderRadius: 6,
                    marginTop: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(c.total_spent / maxCustomerSpent) * 100}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, var(--accent-2), var(--accent))",
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2>Recent events</h2>
        {events.length === 0 ? (
          <p className="muted">No events yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.order_id}>
                  <td className="mono">{e.order_id.slice(0, 8)}…</td>
                  <td>{e.user_email}</td>
                  <td>{e.items_count}</td>
                  <td style={{ textAlign: "right" }}>${e.total.toFixed(2)}</td>
                  <td className="muted">{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
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
