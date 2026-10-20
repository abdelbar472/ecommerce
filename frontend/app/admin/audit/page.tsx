"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { adminApi, getRole } from "@/lib/api";

export default function AdminAuditPage() {
  return (
    <RequireAuth>
      <AdminAudit />
    </RequireAuth>
  );
}

function AdminAudit() {
  const role = getRole();
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLogs(await adminApi.audit(100));
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit logs");
    }
  };

  useEffect(() => {
    if (role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "admin") return <p className="error">Forbidden: admin access only</p>;

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Audit Logs</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        System activity tracked by Admin Service.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Recent logs</h2>
          <button className="ghost small" onClick={load}>
            Refresh
          </button>
        </div>
        <div className="spacer" />
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>User ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Performed by</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.action}</td>
                <td className="mono">{l.user_id?.slice(0, 8)}…</td>
                <td>{l.email || "-"}</td>
                <td>{l.role || "-"}</td>
                <td className="mono">{l.performed_by?.slice(0, 8)}…</td>
                <td className="muted">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
