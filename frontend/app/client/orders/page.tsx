"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { clientApi, getRole, ClientOrder } from "@/lib/api";

export default function ClientOrdersPage() {
  return (
    <RequireAuth>
      <ClientOrders />
    </RequireAuth>
  );
}

function ClientOrders() {
  const role = getRole();
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setOrders(await clientApi.orders());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load orders");
    }
  };

  useEffect(() => {
    if (role !== "client") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "client") return <p className="error">Forbidden: client access only</p>;

  return (
    <>
      <h1 style={{ fontSize: 22 }}>My Orders</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Your purchase history: every order you placed in the shop.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Orders ({orders.length})</h2>
          <button className="ghost small" onClick={load}>
            Refresh
          </button>
        </div>
        <div className="spacer" />
        {orders.length === 0 ? (
          <p className="muted">No orders yet. Buy something in the Shop.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}…</td>
                  <td className="muted">
                    {o.items.map((it) => `${it.product_name} ×${it.quantity}`).join(", ")}
                  </td>
                  <td style={{ textAlign: "right" }}>${o.total.toFixed(2)}</td>
                  <td>
                    <span className="pill">{o.status}</span>
                  </td>
                  <td className="muted">{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
