"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { merchantApi, getRole } from "@/lib/api";

export default function MerchantOrdersPage() {
  return (
    <RequireAuth>
      <MerchantOrders />
    </RequireAuth>
  );
}

function MerchantOrders() {
  const role = getRole();
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

  const load = async () => {
    try {
      setOrders(await merchantApi.orders());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load orders");
    }
  };

  useEffect(() => {
    if (role !== "merchant" && role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "merchant" && role !== "admin") {
    return <p className="error">Forbidden: merchant access only</p>;
  }

  const update = async (id: string, status: string) => {
    try {
      await merchantApi.updateOrderStatus(id, status);
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to update status");
    }
  };

  return (
    <>
      <h1 style={{ fontSize: 22 }}>My Orders</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Orders containing your products.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Orders ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id.slice(0, 8)}…</td>
                  <td>{o.user_email}</td>
                  <td>${o.total.toFixed(2)}</td>
                  <td>
                    <span className="pill">{o.status}</span>
                  </td>
                  <td className="muted">{new Date(o.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <select value={o.status} onChange={(e) => update(o.id, e.target.value)}>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
